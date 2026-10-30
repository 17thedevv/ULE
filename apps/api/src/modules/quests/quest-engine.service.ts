import { Injectable, Logger } from '@nestjs/common';
import {
  CompleteDistinctActivitiesConfig,
  IndependentPracticeConfig,
} from '@ule/contracts';
import { Prisma, QualifyingFact, QuestInstance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuestEngineService {
  private readonly logger = new Logger(QuestEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Processes a newly qualified fact against active quest instances for the learner.
   * Concurrency invariant: Locks candidate quest instances in strictly sorted order (ASC)
   * to guarantee deadlock-free execution under concurrent submissions.
   */
  async processFact(
    fact: QualifyingFact,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    // 1. Identify candidate active quest instances (both course-scoped and global-scoped)
    const candidateInstances = await tx.questInstance.findMany({
      where: {
        userId: fact.userId,
        OR: [
          { courseVersionId: fact.courseVersionId, scope: 'COURSE' },
          { scope: 'GLOBAL', courseVersionId: null },
        ],
        status: 'ACTIVE',
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (candidateInstances.length === 0) {
      return;
    }

    const sortedIds = candidateInstances.map((c) => c.id);

    // 2. Acquire exclusive row-level locks on quest instances in strictly ascending order
    await tx.$queryRawUnsafe(`
      SELECT id FROM quest_instances
      WHERE id = ANY($1::text[])
      ORDER BY id ASC
      FOR UPDATE
    `, sortedIds);

    // 3. Process each locked instance
    for (const id of sortedIds) {
      const instance = await tx.questInstance.findUnique({
        where: { id },
        include: { objectives: true },
      });

      if (!instance || instance.status !== 'ACTIVE') {
        continue;
      }

      let anyObjectiveUpdated = false;

      for (const objective of instance.objectives) {
        if (objective.isCompleted) {
          continue;
        }

        const qualifies = this.evaluateObjectiveMatch(instance, objective.objectiveKey, fact);
        if (!qualifies) {
          continue;
        }

        // 4. Idempotency check: exactly-once consumption deduplication
        const existingConsumption = await tx.questFactConsumption.findUnique({
          where: {
            questInstanceId_objectiveProgressId_factSourceKey: {
              questInstanceId: instance.id,
              objectiveProgressId: objective.id,
              factSourceKey: fact.sourceKey,
            },
          },
        });

        if (existingConsumption) {
          if (existingConsumption.status === 'REVOKED') {
            // Re-activate this consumption upon re-qualification
            await tx.questFactConsumption.update({
              where: { id: existingConsumption.id },
              data: {
                status: 'CONSUMED',
                factId: fact.id,
                consumedAt: new Date(),
              },
            });

            // Increment progress count
            const newCount = objective.currentCount + 1;
            const isObjectiveCompleted = newCount >= objective.targetCount;
            const now = new Date();

            await tx.questObjectiveProgress.update({
              where: { id: objective.id },
              data: {
                currentCount: newCount,
                isCompleted: isObjectiveCompleted,
                completedAt: isObjectiveCompleted ? now : null,
                lastEvaluatedAt: now,
              },
            });

            objective.currentCount = newCount;
            objective.isCompleted = isObjectiveCompleted;
            anyObjectiveUpdated = true;
          }
          continue;
        }

        // Distinct block check & cross-course constraints for Complete Distinct Activities
        if (instance.templateId === 'COMPLETE_DISTINCT_ACTIVITIES') {
          const config = instance.config as CompleteDistinctActivitiesConfig | null;

          // Invariant 1: each distinct block instance counts at most once per objective
          const alreadyConsumedBlock = await tx.questFactConsumption.findFirst({
            where: {
              questInstanceId: instance.id,
              objectiveProgressId: objective.id,
              status: 'CONSUMED',
              fact: {
                blockInstanceId: fact.blockInstanceId,
              },
            },
          });
          if (alreadyConsumedBlock) {
            continue;
          }

          // Invariant 2: Cross-course constraint (requireDistinctCourses or maxPerCourse)
          if (
            config?.requireDistinctCourses === true ||
            (typeof config?.maxPerCourse === 'number' && config.maxPerCourse > 0)
          ) {
            const maxAllowed = config.requireDistinctCourses === true ? 1 : config.maxPerCourse!;
            const sameCourseConsumptions = await tx.questFactConsumption.count({
              where: {
                questInstanceId: instance.id,
                objectiveProgressId: objective.id,
                status: 'CONSUMED',
                fact: {
                  courseVersionId: fact.courseVersionId,
                },
              },
            });
            if (sameCourseConsumptions >= maxAllowed) {
              continue;
            }
          }
        }

        // Record consumption atomically
        await tx.questFactConsumption.create({
          data: {
            questInstanceId: instance.id,
            objectiveProgressId: objective.id,
            factId: fact.id,
            factSourceKey: fact.sourceKey,
            consumedAt: new Date(),
            status: 'CONSUMED',
          },
        });

        // Increment progress count
        const newCount = objective.currentCount + 1;
        const isObjectiveCompleted = newCount >= objective.targetCount;
        const now = new Date();

        await tx.questObjectiveProgress.update({
          where: { id: objective.id },
          data: {
            currentCount: newCount,
            isCompleted: isObjectiveCompleted,
            completedAt: isObjectiveCompleted ? now : null,
            lastEvaluatedAt: now,
          },
        });

        objective.currentCount = newCount;
        objective.isCompleted = isObjectiveCompleted;
        anyObjectiveUpdated = true;
      }

      // 5. Check if all objectives for this instance are completed
      if (anyObjectiveUpdated) {
        const allCompleted = instance.objectives.every((o) => o.isCompleted);
        if (allCompleted) {
          const completedAt = new Date();
          await tx.questInstance.update({
            where: { id: instance.id },
            data: {
              status: 'COMPLETED',
              completedAt,
            },
          });
          this.logger.log(
            `QuestInstance '${instance.id}' (${instance.questKey}) completed for user '${instance.userId}'.`,
          );
        }
      }
    }
  }

  private evaluateObjectiveMatch(
    instance: QuestInstance,
    objectiveKey: string,
    fact: QualifyingFact,
  ): boolean {
    if (instance.templateId === 'COMPLETE_DISTINCT_ACTIVITIES') {
      if (fact.factType !== 'ACTIVITY_COMPLETED' || fact.state !== 'QUALIFIED') {
        return false;
      }
      if (objectiveKey !== 'complete_distinct_activities') {
        return false;
      }
      const config = instance.config as CompleteDistinctActivitiesConfig | null;
      if (config?.requiredBlockInstanceIds && config.requiredBlockInstanceIds.length > 0) {
        if (!config.requiredBlockInstanceIds.includes(fact.blockInstanceId)) {
          return false;
        }
      }
      return true;
    }

    if (instance.templateId === 'INDEPENDENT_PRACTICE') {
      if (fact.factType !== 'INDEPENDENT_PRACTICE_CONFIRMED' || fact.state !== 'QUALIFIED') {
        return false;
      }
      if (objectiveKey !== 'independent_practice') {
        return false;
      }
      if (!fact.skillCode) {
        return false;
      }
      const config = instance.config as IndependentPracticeConfig | null;
      if (config?.skillCode && config.skillCode !== fact.skillCode) {
        return false;
      }

      // ADR-012/013 Invariant: Global Quests require verified evidence.
      // Unverified practice (UNVERIFIED_PRACTICE / SELF_REPORTED_INDEPENDENT) cannot satisfy Global Quests.
      const metadata = (fact.metadata as Record<string, unknown> | null) ?? {};
      if (instance.scope === 'GLOBAL') {
        if (
          metadata.verificationLevel === 'UNVERIFIED_PRACTICE' ||
          metadata.provenance === 'SELF_REPORTED_INDEPENDENT'
        ) {
          return false;
        }
      }

      if (config?.minVerificationLevel === 'VERIFIED_ASSESSMENT') {
        if (metadata.verificationLevel !== 'VERIFIED_ASSESSMENT') {
          return false;
        }
      }

      return true;
    }

    return false;
  }
}
