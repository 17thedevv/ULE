import { Injectable, Logger } from '@nestjs/common';
import {
  ABAttempt,
  ABRun,
  AssessmentResult,
  CourseVersion,
  Prisma,
  QualifyingFact,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuestEngineService } from './quest-engine.service';

export interface QualifyRunCompletionParams {
  run: ABRun;
  courseVersion: CourseVersion;
}

export interface QualifyAttemptParams {
  run: ABRun;
  attempt: ABAttempt;
  assessmentResult: AssessmentResult | null;
  courseVersion: CourseVersion;
  isDeferredWithheld?: boolean;
}

@Injectable()
export class QualificationService {
  private readonly logger = new Logger(QualificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly questEngine: QuestEngineService,
  ) {}

  /**
   * Qualifies an activity run completion fact into the QualifyingFact ledger.
   * Concurrency invariant: Idempotent deduplication based on unique sourceKey (fact:act_comp:runId).
   */
  async qualifyRunCompletion(
    params: QualifyRunCompletionParams,
    txClient?: Prisma.TransactionClient,
  ): Promise<QualifyingFact | null> {
    const { run, courseVersion } = params;
    const tx = txClient ?? this.prisma;

    if (run.status !== 'CLOSED' || run.closeReason !== 'COMPLETED') {
      return null;
    }

    const sourceKey = `fact:act_comp:${run.id}`;

    let fact = await tx.qualifyingFact.findUnique({
      where: { sourceKey },
    });

    if (!fact) {
      fact = await tx.qualifyingFact.create({
        data: {
          sourceKey,
          userId: run.userId,
          courseVersionId: courseVersion.id,
          factType: 'ACTIVITY_COMPLETED',
          blockInstanceId: run.blockInstanceId,
          runId: run.id,
          state: 'QUALIFIED',
          policyVersion: '1.0.0',
        },
      });
    }

    // Ingest into candidate quest instances
    await this.questEngine.processFact(fact, tx);
    return fact;
  }

  /**
   * Qualifies an evaluatable assessment attempt into the QualifyingFact ledger.
   * Enforces learning science gates:
   * - Must be correct (isCorrect === true).
   * - Must be unassisted (assisted === false).
   * - Deferred feedback must be released (not withheld).
   * - Ambiguous multi-skill mappings and repetitions are excluded.
   */
  async qualifyAttempt(
    params: QualifyAttemptParams,
    txClient?: Prisma.TransactionClient,
  ): Promise<QualifyingFact[]> {
    const { run, attempt, assessmentResult, courseVersion, isDeferredWithheld } = params;
    const tx = txClient ?? this.prisma;

    if (!assessmentResult || assessmentResult.isCorrect !== true || assessmentResult.status !== 'EVALUATED') {
      return [];
    }

    const supportCtx = (attempt.supportContext as Record<string, unknown> | null) ?? {};
    const isAssisted =
      attempt.assisted === true ||
      supportCtx.hintUsed === true ||
      supportCtx.provenance === 'SERVER_OBSERVED' ||
      supportCtx.provenance === 'SELF_REPORTED_ASSISTED';

    if (isAssisted) {
      return [];
    }

    if (isDeferredWithheld === true) {
      return [];
    }

    const snapshot = (courseVersion.snapshot as {
      skillMappings?: Array<{
        id: string;
        blockInstanceId: string;
        skillId: string;
        skillCode: string;
        itemKey?: string;
        criterion: string;
      }>;
    }) || {};

    const mappings = (snapshot.skillMappings ?? []).filter(
      (m) => m.blockInstanceId === run.blockInstanceId,
    );

    if (mappings.length === 0) {
      return [];
    }

    // Ambiguity gate: multiple skill mappings on an MCQ without criterion breakdown
    if (mappings.length > 1) {
      return [];
    }

    // Same-item repetition check across runs
    const priorAttempts = await tx.aBAttempt.findMany({
      where: {
        run: {
          userId: run.userId,
          courseVersionId: courseVersion.id,
          blockInstanceId: run.blockInstanceId,
        },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const isFirstAttempt = priorAttempts.length <= 1 || priorAttempts[0].id === attempt.id;
    if (!isFirstAttempt) {
      // Classified as repetition, does not qualify for independent practice milestone
      return [];
    }

    const results: QualifyingFact[] = [];

    for (const mapping of mappings) {
      const sourceKey = `fact:ind_prac:${attempt.id}:${mapping.skillCode}`;

      let fact = await tx.qualifyingFact.findUnique({
        where: { sourceKey },
      });

      if (!fact) {
        fact = await tx.qualifyingFact.create({
          data: {
            sourceKey,
            userId: run.userId,
            courseVersionId: courseVersion.id,
            factType: 'INDEPENDENT_PRACTICE_CONFIRMED',
            blockInstanceId: run.blockInstanceId,
            skillId: mapping.skillId,
            skillCode: mapping.skillCode,
            runId: run.id,
            attemptId: attempt.id,
            assessmentResultId: assessmentResult.id,
            state: 'QUALIFIED',
            policyVersion: '1.0.0',
            metadata: {
              provenance: supportCtx.provenance ?? 'SELF_REPORTED_INDEPENDENT',
              verificationLevel: 'UNVERIFIED_PRACTICE',
            },
          },
        });
      } else if (fact.state !== 'QUALIFIED') {
        fact = await tx.qualifyingFact.update({
          where: { id: fact.id },
          data: {
            state: 'QUALIFIED',
            assessmentResultId: assessmentResult.id,
          },
        });
      }

      await this.questEngine.processFact(fact, tx);
      results.push(fact);
    }

    return results;
  }

  /**
   * Reconciles deferred evaluation qualification when a run reaches CLOSED COMPLETED.
   */
  async reconcileDeferredRun(
    run: ABRun,
    courseVersion: CourseVersion,
    txClient?: Prisma.TransactionClient,
  ): Promise<void> {
    const tx = txClient ?? this.prisma;

    // Invariant: ABANDONED runs NEVER qualify or release correctness
    if (run.status !== 'CLOSED' || run.closeReason !== 'COMPLETED') {
      return;
    }

    const latestAttempt = await tx.aBAttempt.findFirst({
      where: { runId: run.id },
      orderBy: { attemptNumber: 'desc' },
      include: { assessmentResult: true },
    });

    if (latestAttempt && latestAttempt.assessmentResult) {
      await this.qualifyAttempt(
        {
          run,
          attempt: latestAttempt,
          assessmentResult: latestAttempt.assessmentResult,
          courseVersion,
          isDeferredWithheld: false,
        },
        tx,
      );
    }
  }

  /**
   * Reconciles QualifyingFacts and Quest progress when an AssessmentCorrection is applied.
   * - If corrected to non-evaluated status (e.g. PENDING, SKIPPED) or incorrect/failed:
   *   Marks existing fact as SUPERSEDED and revokes consumption, decrementing quest progress.
   * - If corrected to EVALUATED with isCorrect: true:
   *   Re-qualifies the fact and restores consumption and quest progress if eligible.
   */
  async reconcileAssessmentCorrection(
    params: {
      assessmentResultId: string;
      targetIsCorrect: boolean | null;
      targetStatus: string;
    },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const { assessmentResultId, targetIsCorrect, targetStatus } = params;

    const existingFacts = await tx.qualifyingFact.findMany({
      where: { assessmentResultId },
    });

    if (targetStatus !== 'EVALUATED' || targetIsCorrect !== true) {
      // De-qualify existing facts
      for (const fact of existingFacts) {
        if (fact.state === 'QUALIFIED') {
          await tx.qualifyingFact.update({
            where: { id: fact.id },
            data: { state: 'SUPERSEDED' },
          });

          // Revoke any consumptions and adjust objective progress
          const consumptions = await tx.questFactConsumption.findMany({
            where: { factId: fact.id, status: 'CONSUMED' },
            include: { objectiveProgress: true },
          });

          for (const consumption of consumptions) {
            await tx.questFactConsumption.update({
              where: { id: consumption.id },
              data: { status: 'REVOKED' },
            });

            const newCount = Math.max(0, consumption.objectiveProgress.currentCount - 1);
            await tx.questObjectiveProgress.update({
              where: { id: consumption.objectiveProgressId },
              data: {
                currentCount: newCount,
                isCompleted: false,
                completedAt: null,
              },
            });

            // Revert completed quest back to ACTIVE
            await tx.questInstance.update({
              where: { id: consumption.questInstanceId },
              data: {
                status: 'ACTIVE',
                completedAt: null,
              },
            });
          }
        }
      }
    } else {
      // Re-qualification branch: restore qualification and quest progress on correction to correct
      const assessment = await tx.assessmentResult.findUnique({
        where: { id: assessmentResultId },
        include: {
          attempt: true,
          run: {
            include: {
              courseVersion: true,
            },
          },
        },
      });

      if (!assessment || !assessment.attempt || !assessment.run) {
        return;
      }

      // Check run status: never qualify ABANDONED runs
      if (assessment.run.closeReason === 'ABANDONED') {
        return;
      }

      const attempt = assessment.attempt;
      const supportCtx = (attempt.supportContext as Record<string, unknown> | null) ?? {};
      const isAssisted =
        attempt.assisted === true ||
        supportCtx.hintUsed === true ||
        supportCtx.provenance === 'SERVER_OBSERVED' ||
        supportCtx.provenance === 'SELF_REPORTED_ASSISTED';

      if (isAssisted) {
        return;
      }

      const snapshot = (assessment.run.courseVersion.snapshot as {
        skillMappings?: Array<{
          id: string;
          blockInstanceId: string;
          skillId: string;
          skillCode: string;
          criterion: string;
        }>;
      }) || {};

      const mappings = (snapshot.skillMappings ?? []).filter(
        (m) => m.blockInstanceId === assessment.run.blockInstanceId,
      );

      if (mappings.length !== 1) {
        return;
      }

      // Repetition check across runs: must be first attempt on this block
      const priorAttempts = await tx.aBAttempt.findMany({
        where: {
          run: {
            userId: assessment.run.userId,
            courseVersionId: assessment.run.courseVersionId,
            blockInstanceId: assessment.run.blockInstanceId,
          },
        },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      });

      const isFirstAttempt = priorAttempts.length <= 1 || priorAttempts[0].id === attempt.id;
      if (!isFirstAttempt) {
        return;
      }

      for (const mapping of mappings) {
        const sourceKey = `fact:ind_prac:${attempt.id}:${mapping.skillCode}`;

        let fact = await tx.qualifyingFact.findUnique({
          where: { sourceKey },
        });

        if (fact) {
          if (fact.state !== 'QUALIFIED') {
            fact = await tx.qualifyingFact.update({
              where: { id: fact.id },
              data: {
                state: 'QUALIFIED',
                assessmentResultId: assessment.id,
              },
            });
          }
        } else {
          fact = await tx.qualifyingFact.create({
            data: {
              sourceKey,
              userId: assessment.run.userId,
              courseVersionId: assessment.run.courseVersionId,
              factType: 'INDEPENDENT_PRACTICE_CONFIRMED',
              blockInstanceId: assessment.run.blockInstanceId,
              skillId: mapping.skillId,
              skillCode: mapping.skillCode,
              runId: assessment.run.id,
              attemptId: attempt.id,
              assessmentResultId: assessment.id,
              state: 'QUALIFIED',
              policyVersion: '1.0.0',
              metadata: {
                provenance: supportCtx.provenance ?? 'SELF_REPORTED_INDEPENDENT',
                verificationLevel: 'UNVERIFIED_PRACTICE',
              },
            },
          });
        }

        await this.questEngine.processFact(fact, tx);
      }
    }
  }
}
