import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CourseEnrollmentDto,
  CourseEnrollmentStatus,
  CourseQuestInstanceDto,
  QuestDefinitionSnapshot,
  QuestInstanceStatus,
  QuestRewardPolicyDto,
  QuestTemplateId,
} from '@ule/contracts';
import {
  CourseEnrollment,
  Prisma,
  QuestInstance,
  QuestObjectiveProgress,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuestTemplatesRegistry } from './quest-templates.registry';

@Injectable()
export class EnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: QuestTemplatesRegistry,
  ) {}

  /**
   * Enrolls a learner into an immutable CourseVersion.
   * Authoritative gate: Requires course owner identity or an ACTIVE CourseAccessGrant.
   * Initializes QuestInstances for all pinned quests in CourseVersion.snapshot.quests.
   */
  async enroll(
    userId: string,
    courseVersionId: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<{ enrollment: CourseEnrollmentDto; quests: CourseQuestInstanceDto[] }> {
    const op = async (tx: Prisma.TransactionClient) => {
      const version = await tx.courseVersion.findUnique({
        where: { id: courseVersionId },
        include: { course: true },
      });

      if (!version) {
        throw new NotFoundException(`CourseVersion '${courseVersionId}' not found.`);
      }

      // Authorization guard: verify active access grant for non-owner learners under row lock
      const isOwner = version.course.ownerId === userId;
      if (!isOwner) {
        const lockedGrants = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id, status FROM course_access_grants
          WHERE "courseVersionId" = ${courseVersionId} AND "userId" = ${userId}
          FOR SHARE
        `;

        if (!lockedGrants || lockedGrants.length === 0 || lockedGrants[0].status !== 'ACTIVE') {
          throw new ForbiddenException(
            'Course access grant has been revoked or is not active. Enrollment prohibited.',
          );
        }
      }

      // Check existing enrollment
      let enrollment = await tx.courseEnrollment.findUnique({
        where: {
          userId_courseVersionId: {
            userId,
            courseVersionId,
          },
        },
      });

      if (enrollment) {
        // If enrollment is paused, reactivate it (e.g. following grant re-activation)
        if (enrollment.status === 'PAUSED') {
          enrollment = await tx.courseEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'ACTIVE' },
          });
        }
      } else {
        // Create new enrollment
        enrollment = await tx.courseEnrollment.create({
          data: {
            userId,
            courseVersionId,
            status: 'ACTIVE',
            enrolledAt: new Date(),
          },
        });

        // Instantiate pinned course quests from snapshot
        const snapshot = (version.snapshot as {
          quests?: QuestDefinitionSnapshot[];
        }) || {};

        const pinnedQuests = snapshot.quests ?? [];

        for (const pinnedQuest of pinnedQuests) {
          const templateDef = this.registry.hasTemplate(pinnedQuest.templateId)
            ? this.registry.getTemplate(pinnedQuest.templateId)
            : null;

          if (!templateDef) continue;

          const targetCount =
            (pinnedQuest.config as { targetCount?: number })?.targetCount ?? 1;

          const questInstance = await tx.questInstance.create({
            data: {
              userId,
              courseEnrollmentId: enrollment.id,
              courseVersionId,
              questKey: pinnedQuest.questKey,
              templateId: pinnedQuest.templateId,
              title: pinnedQuest.title,
              description: pinnedQuest.description,
              scope: 'COURSE',
              definitionRevision: pinnedQuest.revision,
              config: (pinnedQuest.config ?? null) as unknown as Prisma.InputJsonValue,
              rewardPolicy: (pinnedQuest.rewardPolicy ?? null) as unknown as Prisma.InputJsonValue,
              status: 'ACTIVE',
              occurrence: 1,
            },
          });

          await tx.questObjectiveProgress.create({
            data: {
              questInstanceId: questInstance.id,
              objectiveKey: templateDef.objectiveKey,
              currentCount: 0,
              targetCount,
              isCompleted: false,
            },
          });
        }
      }

      const questInstances = await tx.questInstance.findMany({
        where: { courseEnrollmentId: enrollment.id },
        include: { objectives: true },
        orderBy: { createdAt: 'asc' },
      });

      return {
        enrollment: this.toEnrollmentDto(enrollment),
        quests: questInstances.map((q) => this.toQuestInstanceDto(q)),
      };
    };

    return txClient ? op(txClient) : this.prisma.$transaction(op);
  }

  /**
   * Retrieves an existing course enrollment for a learner.
   */
  async getEnrollment(
    userId: string,
    courseVersionId: string,
  ): Promise<CourseEnrollmentDto | null> {
    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: {
        userId_courseVersionId: {
          userId,
          courseVersionId,
        },
      },
    });

    return enrollment ? this.toEnrollmentDto(enrollment) : null;
  }

  /**
   * Lists all quest instances for a learner in a course version.
   */
  async listLearnerQuests(
    userId: string,
    courseVersionId: string,
  ): Promise<CourseQuestInstanceDto[]> {
    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: {
        userId_courseVersionId: {
          userId,
          courseVersionId,
        },
      },
    });

    if (!enrollment) {
      return [];
    }

    const instances = await this.prisma.questInstance.findMany({
      where: {
        courseEnrollmentId: enrollment.id,
      },
      include: {
        objectives: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return instances.map((q) => this.toQuestInstanceDto(q));
  }

  private toEnrollmentDto(enrollment: CourseEnrollment): CourseEnrollmentDto {
    return {
      id: enrollment.id,
      userId: enrollment.userId,
      courseVersionId: enrollment.courseVersionId,
      status: enrollment.status as CourseEnrollmentStatus,
      enrolledAt: enrollment.enrolledAt.toISOString(),
      lastActivityAt: enrollment.lastActivityAt ? enrollment.lastActivityAt.toISOString() : null,
      completedAt: enrollment.completedAt ? enrollment.completedAt.toISOString() : null,
      createdAt: enrollment.createdAt.toISOString(),
      updatedAt: enrollment.updatedAt.toISOString(),
    };
  }

  private toQuestInstanceDto(
    instance: QuestInstance & { objectives: QuestObjectiveProgress[] },
  ): CourseQuestInstanceDto {
    return {
      id: instance.id,
      userId: instance.userId,
      courseEnrollmentId: instance.courseEnrollmentId ?? '',
      courseVersionId: instance.courseVersionId ?? '',
      questKey: instance.questKey,
      templateId: instance.templateId as QuestTemplateId,
      title: instance.title,
      description: instance.description,
      status: instance.status as QuestInstanceStatus,
      occurrence: instance.occurrence,
      completedAt: instance.completedAt ? instance.completedAt.toISOString() : null,
      objectives: instance.objectives.map((o) => ({
        id: o.id,
        questInstanceId: o.questInstanceId,
        objectiveKey: o.objectiveKey,
        currentCount: o.currentCount,
        targetCount: o.targetCount,
        isCompleted: o.isCompleted,
        completedAt: o.completedAt ? o.completedAt.toISOString() : null,
      })),
      rewardPolicy: instance.rewardPolicy as unknown as QuestRewardPolicyDto | null,
      createdAt: instance.createdAt.toISOString(),
      updatedAt: instance.updatedAt.toISOString(),
    };
  }
}
