import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CourseProgressDto,
  LearnerCourseVersionDto,
  LearnerSafeBlockDto,
  LearnerSafeSkillDto,
  LearnerSkillProjectionDto,
  LearningEvidenceDto,
} from '@ule/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { LearnerSkillProjectionService } from '../evidence/learner-skill-projection.service';
import { BlockTypeRegistry } from '../abp/registry/block-type.registry';

@Injectable()
export class LearnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectionService: LearnerSkillProjectionService,
    private readonly blockTypeRegistry: BlockTypeRegistry,
  ) {}

  /**
   * Lists all private CourseVersions explicitly granted to the authenticated learner.
   * Returns sanitized learner-safe views: never returns raw snapshots or authoring secrets.
   */
  async listGrantedCourses(userId: string): Promise<LearnerCourseVersionDto[]> {
    // 1. Grants where user is an active registered learner
    const grants = await this.prisma.courseAccessGrant.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        courseVersion: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Also include courses owned by the user
    const ownedVersions = await this.prisma.courseVersion.findMany({
      where: {
        course: { ownerId: userId },
      },
      orderBy: { createdAt: 'desc' },
    });

    const versionMap = new Map<string, LearnerCourseVersionDto>();

    const toLearnerSafeVersion = (v: {
      id: string;
      courseId: string;
      versionNumber: number;
      title: string;
      description: string | null;
      summary: string | null;
      snapshot: unknown;
      schemaVersion: string;
      createdAt: Date;
    }): LearnerCourseVersionDto => {
      const snap = (v.snapshot as {
        blocks?: Array<{
          id: string;
          blockTypeId: string;
          typeVersion?: string;
          title: string;
          orderIndex: number;
          config?: Record<string, unknown>;
        }>;
        skills?: Array<{
          id: string;
          skillCode: string;
          name: string;
          description?: string | null;
        }>;
      }) || {};

      const rawBlocks = snap.blocks ?? [];
      const safeBlocks: LearnerSafeBlockDto[] = rawBlocks.map((b) => {
        const typeVersion = b.typeVersion ?? '1.0.0';
        const sanitizedConfig = this.blockTypeRegistry.hasType(b.blockTypeId, typeVersion)
          ? this.blockTypeRegistry.sanitizeForLearner(
              b.blockTypeId,
              (b.config as Record<string, unknown>) ?? {},
              typeVersion,
            )
          : {};

        return {
          id: b.id,
          blockTypeId: b.blockTypeId,
          typeVersion,
          title: b.title,
          orderIndex: b.orderIndex,
          config: sanitizedConfig,
        };
      });

      const safeSkills: LearnerSafeSkillDto[] = (snap.skills ?? []).map((s) => ({
        id: s.id,
        skillCode: s.skillCode,
        name: s.name,
        description: s.description ?? null,
      }));

      return {
        id: v.id,
        courseId: v.courseId,
        versionNumber: v.versionNumber,
        title: v.title,
        description: v.description,
        summary: v.summary,
        blocks: safeBlocks,
        skills: safeSkills,
        schemaVersion: v.schemaVersion,
        createdAt: v.createdAt.toISOString(),
      };
    };

    for (const g of grants) {
      const v = g.courseVersion;
      versionMap.set(v.id, toLearnerSafeVersion(v));
    }

    for (const v of ownedVersions) {
      if (!versionMap.has(v.id)) {
        versionMap.set(v.id, toLearnerSafeVersion(v));
      }
    }

    return Array.from(versionMap.values());
  }

  /**
   * Retrieves activity block progress for an authorized CourseVersion.
   * Invariant: progress is strictly completion tracking. isMastered is ALWAYS false.
   */
  async getCourseProgress(
    userId: string,
    versionId: string,
  ): Promise<CourseProgressDto> {
    await this.verifyAccess(userId, versionId);

    const version = await this.prisma.courseVersion.findUniqueOrThrow({
      where: { id: versionId },
    });

    const snapshot = (version.snapshot as {
      blocks?: Array<{
        id: string;
        blockTypeId: string;
        title: string;
        orderIndex: number;
      }>;
    }) || {};

    const blocks = snapshot.blocks ?? [];

    const runs = await this.prisma.aBRun.findMany({
      where: {
        userId,
        courseVersionId: versionId,
      },
      include: {
        attempts: true,
      },
    });

    let completedBlocks = 0;

    const blockProgressList = blocks.map((block) => {
      const blockRuns = runs.filter((r) => r.blockInstanceId === block.id);
      const completedRun = blockRuns.find(
        (r) => r.status === 'CLOSED' && r.closeReason === 'COMPLETED',
      );
      const inProgressRun = blockRuns.find(
        (r) => r.status === 'ACTIVE' || r.status === 'SUSPENDED',
      );

      let status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' = 'NOT_STARTED';
      let completedAt: string | null = null;

      if (completedRun) {
        status = 'COMPLETED';
        completedAt = completedRun.closedAt?.toISOString() ?? null;
        completedBlocks++;
      } else if (inProgressRun) {
        status = 'IN_PROGRESS';
      }

      const attemptsCount = blockRuns.reduce(
        (acc, r) => acc + r.attempts.length,
        0,
      );

      return {
        blockInstanceId: block.id,
        blockTypeId: block.blockTypeId,
        title: block.title,
        orderIndex: block.orderIndex,
        status,
        completedAt,
        attemptsCount,
      };
    });

    const totalBlocks = blocks.length;
    const percentComplete =
      totalBlocks > 0 ? Math.round((completedBlocks / totalBlocks) * 100) : 0;

    return {
      courseVersionId: versionId,
      totalBlocks,
      completedBlocks,
      percentComplete,
      isMastered: false,
      masteryClaim: null,
      blocks: blockProgressList,
    };
  }

  /**
   * Retrieves the Learner's own trusted evidence summary for a CourseVersion.
   * Respects Phase 1B deferred feedback release policy: unreleased runs withhold scores/correctness.
   */
  async getEvidenceSummary(
    userId: string,
    versionId: string,
  ): Promise<LearningEvidenceDto[]> {
    await this.verifyAccess(userId, versionId);

    const version = await this.prisma.courseVersion.findUniqueOrThrow({
      where: { id: versionId },
    });

    const snapshot = (version.snapshot as {
      blocks?: Array<{
        id: string;
        config?: { feedbackPolicy?: string };
      }>;
    }) || {};

    const blocks = snapshot.blocks ?? [];

    const evidenceRows = await this.prisma.learningEvidence.findMany({
      where: {
        userId,
        courseVersionId: versionId,
      },
      include: {
        run: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return evidenceRows.map((ev) => {
      const blockDef = blocks.find((b) => b.id === ev.blockInstanceId);
      const isDeferredPolicy =
        blockDef?.config?.feedbackPolicy === 'DEFERRED';
      const isRunCompleted =
        ev.run.status === 'CLOSED' && ev.run.closeReason === 'COMPLETED';

      // Under DEFERRED policy, evaluation details remain hidden until the run is CLOSED COMPLETED
      const shouldDefer = isDeferredPolicy && !isRunCompleted;

      return {
        id: ev.id,
        userId: ev.userId,
        courseVersionId: ev.courseVersionId,
        skillId: ev.skillId,
        skillCode: ev.skillCode,
        skillRevision: ev.skillRevision,
        blockInstanceId: ev.blockInstanceId,
        blockTypeId: ev.blockTypeId,
        typeVersion: ev.typeVersion,
        runId: ev.runId,
        attemptId: ev.attemptId,
        assessmentResultId: shouldDefer ? null : ev.assessmentResultId,
        eventId: ev.eventId,
        itemKey: ev.itemKey,
        mappingRevision: ev.mappingRevision,
        evaluatorId: shouldDefer ? null : ev.evaluatorId,
        evaluatorVersion: shouldDefer ? null : ev.evaluatorVersion,
        assessmentStatus: shouldDefer ? 'PENDING' : ev.assessmentStatus,
        evaluatedAt: shouldDefer ? null : ev.evaluatedAt?.toISOString() ?? null,
        assisted: ev.assisted,
        supportProvenance: ev.supportProvenance,
        supportContext: (ev.supportContext as Record<string, unknown>) ?? null,
        isCorrect: shouldDefer ? null : ev.isCorrect,
        score: shouldDefer ? null : ev.score,
        classification: shouldDefer ? 'PENDING_EVALUATION' : ev.classification,
        status: shouldDefer ? 'PENDING_ASSESSMENT' : ev.status,
        exclusionReason: shouldDefer ? null : ev.exclusionReason,
        policyVersion: ev.policyVersion,
        isSameItemRepetition: ev.isSameItemRepetition,
        repetitionCount: ev.repetitionCount,
        deferred: shouldDefer,
        createdAt: ev.createdAt.toISOString(),
      };
    });
  }

  /**
   * Retrieves the Learner's skill state projections and proposed actions for a CourseVersion.
   */
  async getSkillProjections(
    userId: string,
    versionId: string,
  ): Promise<LearnerSkillProjectionDto[]> {
    await this.verifyAccess(userId, versionId);
    return this.projectionService.getProjectionsForLearner(userId, versionId);
  }

  private async verifyAccess(userId: string, versionId: string): Promise<void> {
    const version = await this.prisma.courseVersion.findUnique({
      where: { id: versionId },
      include: { course: true },
    });

    if (!version) {
      throw new NotFoundException(`CourseVersion '${versionId}' not found.`);
    }

    if (version.course.ownerId === userId) {
      return;
    }

    const grant = await this.prisma.courseAccessGrant.findUnique({
      where: {
        courseVersionId_userId: {
          courseVersionId: versionId,
          userId,
        },
      },
    });

    if (!grant || grant.status !== 'ACTIVE') {
      throw new NotFoundException(`CourseVersion '${versionId}' not found.`);
    }
  }
}
