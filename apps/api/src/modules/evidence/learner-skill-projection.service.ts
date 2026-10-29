import { Injectable, Logger } from '@nestjs/common';
import {
  LearnerSkillProjectionDto,
  LearnerSkillState,
  LiiActionProposalDto,
} from '@ule/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LearnerSkillProjectionService {
  private readonly logger = new Logger(LearnerSkillProjectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recomputes a transparent, deterministic skill state projection for a learner.
   * Derives state from accepted evidence in the ledger.
   * State transitions: INSUFFICIENT_EVIDENCE -> DEVELOPING -> READY_TO_VERIFY.
   * By rule, VERIFIED state or claim is NEVER granted in this vertical slice.
   */
  async recomputeProjection(
    userId: string,
    courseVersionId: string,
    skillId: string,
    txClient?: Prisma.TransactionClient,
  ): Promise<LearnerSkillProjectionDto> {
    if (!txClient) {
      return this.prisma.$transaction(async (tx) =>
        this.recomputeProjection(userId, courseVersionId, skillId, tx),
      );
    }
    const tx = txClient;

    // P2: Serialize projection recomputation per (userId, courseVersionId, skillId)
    // using PostgreSQL advisory transaction lock to prevent concurrent undercounting races
    // and ensure sequential evaluation read models across distinct items.
    const lockKey = `projection:${userId}:${courseVersionId}:${skillId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    // Load version snapshot to read skill definition and available verification blocks
    const version = await tx.courseVersion.findUnique({
      where: { id: courseVersionId },
    });

    const snapshot = (version?.snapshot as {
      blocks?: Array<{
        id: string;
        blockTypeId: string;
        title: string;
        config?: Record<string, unknown>;
      }>;
      skills?: Array<{
        id: string;
        skillCode: string;
        name: string;
        description?: string;
      }>;
      skillMappings?: Array<{
        blockInstanceId: string;
        skillId: string;
      }>;
    }) || {};

    const skillInfo = (snapshot.skills ?? []).find((s) => s.id === skillId);
    const skillCode = skillInfo?.skillCode ?? 'unknown-skill';
    const skillName = skillInfo?.name ?? skillCode;
    const learningObjective = skillInfo?.description ?? null;

    // Load all evidence records for this learner and skill with run context
    const evidenceList = await tx.learningEvidence.findMany({
      where: {
        userId,
        courseVersionId,
        skillId,
      },
      include: { run: true },
      orderBy: { createdAt: 'asc' },
    });

    const blocks = snapshot.blocks ?? [];
    let hasUnreleasedDeferred = false;

    // Gate 1: Withhold unreleased deferred evidence from learner-facing skill inference
    const acceptedEvidence: typeof evidenceList = [];

    for (const e of evidenceList) {
      if (e.status !== 'ACCEPTED') continue;

      const blockDef = blocks.find((b) => b.id === e.blockInstanceId);
      const isDeferredPolicy = blockDef?.config?.feedbackPolicy === 'DEFERRED';
      const isRunCompleted =
        e.run.status === 'CLOSED' && e.run.closeReason === 'COMPLETED';
      const isUnreleasedDeferred = isDeferredPolicy && !isRunCompleted;

      if (isUnreleasedDeferred) {
        hasUnreleasedDeferred = true;
        continue;
      }

      acceptedEvidence.push(e);
    }

    let independentCount = 0;
    let assistedCount = 0;
    let incorrectCount = 0;
    let repeatedCount = 0;

    // Gate 2: Stable assessment item identity (blockInstanceId + itemKey).
    // Ensure that multiple submissions on the same item (across single or multiple runs)
    // never inflate independentCount.
    const seenItems = new Set<string>();

    for (const e of acceptedEvidence) {
      const itemIdentity = `${e.blockInstanceId}:${e.itemKey ?? 'default'}`;
      const isRepetition = e.isSameItemRepetition || seenItems.has(itemIdentity);

      if (isRepetition) {
        repeatedCount++;
      } else {
        seenItems.add(itemIdentity);
        if (e.classification === 'INDEPENDENT_CORRECT') {
          independentCount++;
        } else if (e.classification === 'ASSISTED_CORRECT') {
          assistedCount++;
        } else if (e.classification === 'INCORRECT') {
          incorrectCount++;
        }
      }
    }

    const evidenceCount = acceptedEvidence.length;
    const evidenceIds = acceptedEvidence.map((e) => e.id);

    let state: LearnerSkillState = 'INSUFFICIENT_EVIDENCE';
    const reasons: string[] = [];
    const limitations: string[] = [];

    // Check conservative readiness criteria:
    // Requires at least 2 distinct independent correct assessments (no same-item repetition, unassisted),
    // and no uncorrected failures.
    if (independentCount >= 2 && incorrectCount === 0) {
      state = 'READY_TO_VERIFY';
      reasons.push(
        `Learner demonstrated ${independentCount} independent correct evaluation observations across distinct items without assistance.`,
      );
      limitations.push(
        'Verified Mastery claim requires proctored verification activity. Verification is pending formal assessment.',
      );
    } else if (evidenceCount > 0) {
      state = 'DEVELOPING';
      if (assistedCount > 0) {
        reasons.push(
          `Observations include ${assistedCount} hint-assisted responses; assisted solves do not prove independent competence.`,
        );
        limitations.push(
          'Server-observed assistance provenance requires additional unassisted evaluation before readiness can be established.',
        );
      }
      if (repeatedCount > 0) {
        reasons.push(
          `Observations include ${repeatedCount} same-item repetitions; repeating identical items does not generate novel evidence.`,
        );
        limitations.push(
          'Repetition of identical items does not count towards independent multi-item verification.',
        );
      }
      if (incorrectCount > 0) {
        reasons.push(
          `Observed ${incorrectCount} incorrect evaluation attempts; learner is actively developing understanding.`,
        );
        limitations.push(
          'Target skill exhibits unresolved error observations requiring remediation.',
        );
      }
      if (independentCount === 1) {
        reasons.push(
          'Single independent correct observation is promising, but insufficient to establish verification readiness.',
        );
        limitations.push(
          'Conservative platform policy requires at least 2 distinct independent observations.',
        );
      }
    } else {
      state = 'INSUFFICIENT_EVIDENCE';
      reasons.push(
        'Zero evaluated assessment observations available for this course-scoped skill.',
      );
      limitations.push(
        'Participation or video completion does not produce evaluated skill evidence.',
      );
    }

    if (hasUnreleasedDeferred) {
      reasons.push(
        'Assessment evaluation results are deferred pending completion of the active assessment run.',
      );
      limitations.push(
        'Assessment feedback is deferred under run policy; evaluation will be integrated upon completed run closure.',
      );
    }

    // Honest verification capability boundary:
    // In Phase 3, no registered block type defines or validates an authoritative verification contract.
    // Arbitrary creator config properties (such as isVerification: true) or title matches cannot announce VERIFY isAvailable: true.
    // Return safe minimal fallback: CONTINUE with isAvailable: false until schema-validated verification exists.
    let proposedAction: LiiActionProposalDto;

    if (state === 'READY_TO_VERIFY') {
      proposedAction = {
        category: 'CONTINUE',
        targetSkillId: skillId,
        reason:
          'Learner demonstrates readiness, but no schema-validated verification assessment capability is available in this platform phase.',
        sourceEvidenceIds: evidenceIds,
        policyVersion: '1.0.0',
        validityConditions: [
          'A skill-appropriate authoritative verification capability must be supported by the runtime and published in the CourseVersion.',
        ],
        suggestedBlockInstanceId: null,
        isAvailable: false,
      };
    } else if (state === 'DEVELOPING') {
      if (incorrectCount > 0 || assistedCount > 1) {
        proposedAction = {
          category: 'SUPPORT',
          targetSkillId: skillId,
          reason:
            'Scaffolded review recommended to address observed errors and assistance dependency.',
          sourceEvidenceIds: evidenceIds,
          policyVersion: '1.0.0',
          validityConditions: [
            'Learner should review foundational concepts or attempt hints before subsequent evaluation.',
          ],
          suggestedBlockInstanceId: null,
          isAvailable: true,
        };
      } else {
        proposedAction = {
          category: 'CONTINUE',
          targetSkillId: skillId,
          reason:
            'Continue working through remaining course activities to demonstrate consistent independent ability.',
          sourceEvidenceIds: evidenceIds,
          policyVersion: '1.0.0',
          validityConditions: ['Attempt additional distinct items.'],
          suggestedBlockInstanceId: null,
          isAvailable: true,
        };
      }
    } else {
      proposedAction = {
        category: 'CONTINUE',
        targetSkillId: skillId,
        reason: hasUnreleasedDeferred
          ? 'Complete active course activities to release deferred assessment results.'
          : 'Attempt practice activities associated with this skill to generate initial learning evidence.',
        sourceEvidenceIds: [],
        policyVersion: '1.0.0',
        validityConditions: [
          hasUnreleasedDeferred
            ? 'Finish active assessment runs.'
            : 'Must complete evaluatable activity blocks.',
        ],
        suggestedBlockInstanceId: null,
        isAvailable: true,
      };
    }

    const latestEvaluated = acceptedEvidence[acceptedEvidence.length - 1];

    const projection = await tx.learnerSkillProjection.upsert({
      where: {
        courseVersionId_userId_skillId: {
          courseVersionId,
          userId,
          skillId,
        },
      },
      create: {
        userId,
        courseVersionId,
        skillId,
        skillCode,
        state,
        revision: 1,
        policyVersion: '1.0.0',
        evidenceCount,
        independentCount,
        assistedCount,
        incorrectCount,
        repeatedCount,
        evidenceIds: evidenceIds as unknown as Prisma.InputJsonValue,
        reasons: reasons as unknown as Prisma.InputJsonValue,
        limitations: limitations as unknown as Prisma.InputJsonValue,
        proposedAction: proposedAction as unknown as Prisma.InputJsonValue,
        lastEvaluatedAt: latestEvaluated?.evaluatedAt ?? new Date(),
      },
      update: {
        state,
        revision: { increment: 1 },
        evidenceCount,
        independentCount,
        assistedCount,
        incorrectCount,
        repeatedCount,
        evidenceIds: evidenceIds as unknown as Prisma.InputJsonValue,
        reasons: reasons as unknown as Prisma.InputJsonValue,
        limitations: limitations as unknown as Prisma.InputJsonValue,
        proposedAction: proposedAction as unknown as Prisma.InputJsonValue,
        lastEvaluatedAt: latestEvaluated?.evaluatedAt ?? new Date(),
      },
    });

    return {
      id: projection.id,
      userId: projection.userId,
      courseVersionId: projection.courseVersionId,
      skillId: projection.skillId,
      skillCode: projection.skillCode,
      skillName,
      learningObjective,
      state: projection.state as LearnerSkillState,
      revision: projection.revision,
      policyVersion: projection.policyVersion,
      evidenceCount: projection.evidenceCount,
      independentCount: projection.independentCount,
      assistedCount: projection.assistedCount,
      incorrectCount: projection.incorrectCount,
      repeatedCount: projection.repeatedCount,
      evidenceIds: projection.evidenceIds as string[],
      reasons: projection.reasons as string[],
      limitations: projection.limitations as string[],
      proposedAction: (projection.proposedAction as unknown as LiiActionProposalDto) ?? proposedAction,
      lastEvaluatedAt: projection.lastEvaluatedAt?.toISOString() ?? null,
      updatedAt: projection.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves all current skill projections for a learner in a CourseVersion.
   */
  async getProjectionsForLearner(
    userId: string,
    courseVersionId: string,
  ): Promise<LearnerSkillProjectionDto[]> {
    const version = await this.prisma.courseVersion.findUnique({
      where: { id: courseVersionId },
    });

    const snapshot = (version?.snapshot as {
      skills?: Array<{
        id: string;
        skillCode: string;
        name: string;
        description?: string;
      }>;
    }) || {};

    const skills = snapshot.skills ?? [];

    const projections = await this.prisma.learnerSkillProjection.findMany({
      where: {
        userId,
        courseVersionId,
      },
    });

    // Ensure all course skills have an explainable entry even if 0 attempts
    const result: LearnerSkillProjectionDto[] = [];

    for (const skill of skills) {
      const existing = projections.find((p) => p.skillId === skill.id);
      if (existing) {
        result.push({
          id: existing.id,
          userId: existing.userId,
          courseVersionId: existing.courseVersionId,
          skillId: existing.skillId,
          skillCode: existing.skillCode,
          skillName: skill.name,
          learningObjective: skill.description ?? null,
          state: existing.state as LearnerSkillState,
          revision: existing.revision,
          policyVersion: existing.policyVersion,
          evidenceCount: existing.evidenceCount,
          independentCount: existing.independentCount,
          assistedCount: existing.assistedCount,
          incorrectCount: existing.incorrectCount,
          repeatedCount: existing.repeatedCount,
          evidenceIds: existing.evidenceIds as string[],
          reasons: existing.reasons as string[],
          limitations: existing.limitations as string[],
          proposedAction: existing.proposedAction as unknown as LiiActionProposalDto,
          lastEvaluatedAt: existing.lastEvaluatedAt?.toISOString() ?? null,
          updatedAt: existing.updatedAt.toISOString(),
        });
      } else {
        // Construct baseline explainable projection for unattempted skill
        result.push({
          id: `unattempted-${skill.id}`,
          userId,
          courseVersionId,
          skillId: skill.id,
          skillCode: skill.skillCode,
          skillName: skill.name,
          learningObjective: skill.description ?? null,
          state: 'INSUFFICIENT_EVIDENCE',
          revision: 0,
          policyVersion: '1.0.0',
          evidenceCount: 0,
          independentCount: 0,
          assistedCount: 0,
          incorrectCount: 0,
          repeatedCount: 0,
          evidenceIds: [],
          reasons: ['No evaluation observations recorded for this skill.'],
          limitations: ['Awaiting learner activity attempts.'],
          proposedAction: {
            category: 'CONTINUE',
            targetSkillId: skill.id,
            reason: 'Attempt practice activities associated with this skill.',
            sourceEvidenceIds: [],
            policyVersion: '1.0.0',
            validityConditions: ['Complete evaluatable activity blocks.'],
            suggestedBlockInstanceId: null,
            isAvailable: true,
          },
          lastEvaluatedAt: null,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return result;
  }
}
