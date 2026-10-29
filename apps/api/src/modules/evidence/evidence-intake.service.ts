import { Injectable, Logger } from '@nestjs/common';
import {
  EvidenceClassification,
  EvidenceStatus,
  LearningEvidenceDto,
} from '@ule/contracts';
import {
  ABAttempt,
  ABEvent,
  ABRun,
  AssessmentResult,
  CourseVersion,
  LearningEvidence,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LearnerSkillProjectionService } from './learner-skill-projection.service';

export interface IngestAttemptParams {
  run: ABRun;
  attempt: ABAttempt;
  assessmentResult: AssessmentResult | null;
  courseVersion: CourseVersion;
}

export interface IngestRunCompletionParams {
  run: ABRun;
  event: ABEvent;
  courseVersion: CourseVersion;
}

@Injectable()
export class EvidenceIntakeService {
  private readonly logger = new Logger(EvidenceIntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectionService: LearnerSkillProjectionService,
  ) {}

  /**
   * Ingests a submitted and evaluated ABP Attempt into the Evidence Ledger.
   * Concurrently safe and idempotent: replaying with the same attemptId returns existing rows.
   */
  async ingestAttempt(
    params: IngestAttemptParams,
    txClient?: Prisma.TransactionClient,
  ): Promise<LearningEvidenceDto[]> {
    const { run, attempt, assessmentResult, courseVersion } = params;
    const tx = txClient ?? this.prisma;

    const snapshot = (courseVersion.snapshot as {
      blocks?: Array<{ id: string; blockTypeId: string; typeVersion: string }>;
      skills?: Array<{ id: string; skillCode: string; revision: number }>;
      skillMappings?: Array<{
        id: string;
        blockInstanceId: string;
        skillId: string;
        skillCode: string;
        itemKey?: string;
        criterion: string;
        weight: number;
        revision: number;
      }>;
    }) || {};

    const mappings = (snapshot.skillMappings ?? []).filter(
      (m) => m.blockInstanceId === run.blockInstanceId,
    );

    // Repetition check: has there been a prior attempt on this run or same item?
    const isSameItemRepetition = attempt.attemptNumber > 1;
    const repetitionCount = attempt.attemptNumber;

    const results: LearningEvidenceDto[] = [];
    const affectedSkillIds: string[] = [];

    if (mappings.length === 0) {
      // Missing or unassigned skill mapping -> record excluded evidence with explicit reason
      const sourceKey = `attempt:${attempt.id}:unmapped:default`;
      const existing = await tx.learningEvidence.findUnique({
        where: { sourceKey },
      });

      if (existing) {
        return [this.toEvidenceDto(existing)];
      }

      const evidence = await tx.learningEvidence.create({
        data: {
          sourceKey,
          userId: run.userId,
          courseVersionId: courseVersion.id,
          skillId: null,
          skillCode: null,
          skillRevision: null,
          blockInstanceId: run.blockInstanceId,
          blockTypeId: run.blockTypeId,
          typeVersion: run.typeVersion,
          runId: run.id,
          attemptId: attempt.id,
          assessmentResultId: assessmentResult?.id ?? null,
          eventId: null,
          itemKey: 'default',
          mappingRevision: null,
          evaluatorId: assessmentResult?.evaluatorId ?? 'system',
          evaluatorVersion: '1.0.0',
          assessmentStatus: assessmentResult?.status ?? 'EVALUATED',
          evaluatedAt: assessmentResult?.evaluatedAt ?? new Date(),
          assisted: attempt.assisted,
          supportProvenance: (attempt.supportContext as Record<string, unknown>)?.provenance as string ?? null,
          supportContext: attempt.supportContext as Prisma.InputJsonValue ?? undefined,
          isCorrect: assessmentResult?.isCorrect ?? null,
          score: assessmentResult?.score ?? null,
          classification: 'EXCLUDED',
          status: 'EXCLUDED',
          exclusionReason: 'NO_SKILL_MAPPING_CONFIGURED',
          policyVersion: '1.0.0',
          isSameItemRepetition,
          repetitionCount,
        },
      });

      return [this.toEvidenceDto(evidence)];
    }

    for (const mapping of mappings) {
      const itemKey = mapping.itemKey ?? 'default';
      const sourceKey = `attempt:${attempt.id}:${mapping.skillId}:${itemKey}`;

      const existing = await tx.learningEvidence.findUnique({
        where: { sourceKey },
      });

      if (existing) {
        results.push(this.toEvidenceDto(existing));
        continue;
      }

      // Determine evidence classification
      let classification: EvidenceClassification = 'EXCLUDED';
      let status: EvidenceStatus = 'ACCEPTED';
      let exclusionReason: string | null = null;

      if (isSameItemRepetition) {
        classification = 'SAME_ITEM_REPETITION';
        status = 'ACCEPTED';
        exclusionReason = 'SAME_ITEM_REPETITION_NOT_INDEPENDENT';
      } else if (!assessmentResult || assessmentResult.status === 'PENDING') {
        classification = 'PENDING_EVALUATION';
        status = 'PENDING_ASSESSMENT';
      } else if (assessmentResult.status === 'EVALUATED') {
        if (assessmentResult.isCorrect === true) {
          const supportCtx = (attempt.supportContext as Record<string, unknown>) || {};
          const isServerObservedHint =
            supportCtx.provenance === 'SERVER_OBSERVED' ||
            supportCtx.hintUsed === true ||
            attempt.assisted;

          if (isServerObservedHint) {
            classification = 'ASSISTED_CORRECT';
          } else {
            classification = 'INDEPENDENT_CORRECT';
          }
        } else {
          classification = 'INCORRECT';
        }
      } else {
        classification = 'EXCLUDED';
        status = 'EXCLUDED';
        exclusionReason = `ASSESSMENT_STATUS_${assessmentResult.status}`;
      }

      const evidence = await tx.learningEvidence.create({
        data: {
          sourceKey,
          userId: run.userId,
          courseVersionId: courseVersion.id,
          skillId: mapping.skillId,
          skillCode: mapping.skillCode,
          skillRevision: mapping.revision,
          blockInstanceId: run.blockInstanceId,
          blockTypeId: run.blockTypeId,
          typeVersion: run.typeVersion,
          runId: run.id,
          attemptId: attempt.id,
          assessmentResultId: assessmentResult?.id ?? null,
          eventId: null,
          itemKey,
          mappingRevision: mapping.revision,
          evaluatorId: assessmentResult?.evaluatorId ?? 'system',
          evaluatorVersion: '1.0.0',
          assessmentStatus: assessmentResult?.status ?? 'EVALUATED',
          evaluatedAt: assessmentResult?.evaluatedAt ?? new Date(),
          assisted: attempt.assisted,
          supportProvenance: (attempt.supportContext as Record<string, unknown>)?.provenance as string ?? null,
          supportContext: attempt.supportContext as Prisma.InputJsonValue ?? undefined,
          isCorrect: assessmentResult?.isCorrect ?? null,
          score: assessmentResult?.score ?? null,
          classification,
          status,
          exclusionReason,
          policyVersion: '1.0.0',
          isSameItemRepetition,
          repetitionCount,
        },
      });

      results.push(this.toEvidenceDto(evidence));
      affectedSkillIds.push(mapping.skillId);
    }

    // Update projections for affected skills asynchronously or inline
    for (const skillId of affectedSkillIds) {
      await this.projectionService.recomputeProjection(
        run.userId,
        courseVersion.id,
        skillId,
        tx,
      );
    }

    return results;
  }

  /**
   * Ingests an activity run completion event (e.g. Video or non-evaluatable content completion).
   * Contributes participation/progress only. Strictly non-evaluatable, zero graded skill evidence.
   */
  async ingestRunCompletion(
    params: IngestRunCompletionParams,
    txClient?: Prisma.TransactionClient,
  ): Promise<LearningEvidenceDto> {
    const { run, event, courseVersion } = params;
    const tx = txClient ?? this.prisma;

    const sourceKey = `event:${event.id}:progress`;
    const existing = await tx.learningEvidence.findUnique({
      where: { sourceKey },
    });

    if (existing) {
      return this.toEvidenceDto(existing);
    }

    const evidence = await tx.learningEvidence.create({
      data: {
        sourceKey,
        userId: run.userId,
        courseVersionId: courseVersion.id,
        skillId: null,
        skillCode: null,
        skillRevision: null,
        blockInstanceId: run.blockInstanceId,
        blockTypeId: run.blockTypeId,
        typeVersion: run.typeVersion,
        runId: run.id,
        attemptId: null,
        assessmentResultId: null,
        eventId: event.id,
        itemKey: 'progress',
        mappingRevision: null,
        evaluatorId: 'none',
        evaluatorVersion: '1.0.0',
        assessmentStatus: 'SKIPPED',
        evaluatedAt: null,
        assisted: false,
        supportProvenance: null,
        supportContext: undefined,
        isCorrect: null,
        score: null,
        classification: 'UNGRADED_PARTICIPATION',
        status: 'ACCEPTED',
        exclusionReason: 'UNGRADED_CONTENT_COMPLETION_ONLY',
        policyVersion: '1.0.0',
        isSameItemRepetition: false,
        repetitionCount: 1,
      },
    });

    return this.toEvidenceDto(evidence);
  }

  private toEvidenceDto(evidence: LearningEvidence): LearningEvidenceDto {
    return {
      id: evidence.id,
      userId: evidence.userId,
      courseVersionId: evidence.courseVersionId,
      skillId: evidence.skillId,
      skillCode: evidence.skillCode,
      skillRevision: evidence.skillRevision,
      blockInstanceId: evidence.blockInstanceId,
      blockTypeId: evidence.blockTypeId,
      typeVersion: evidence.typeVersion,
      runId: evidence.runId,
      attemptId: evidence.attemptId,
      assessmentResultId: evidence.assessmentResultId,
      eventId: evidence.eventId,
      itemKey: evidence.itemKey,
      mappingRevision: evidence.mappingRevision,
      evaluatorId: evidence.evaluatorId,
      evaluatorVersion: evidence.evaluatorVersion,
      assessmentStatus: evidence.assessmentStatus,
      evaluatedAt: evidence.evaluatedAt?.toISOString() ?? null,
      assisted: evidence.assisted,
      supportProvenance: evidence.supportProvenance,
      supportContext: (evidence.supportContext as Record<string, unknown>) ?? null,
      isCorrect: evidence.isCorrect,
      score: evidence.score,
      classification: evidence.classification as EvidenceClassification,
      status: evidence.status as EvidenceStatus,
      exclusionReason: evidence.exclusionReason,
      policyVersion: evidence.policyVersion,
      isSameItemRepetition: evidence.isSameItemRepetition,
      repetitionCount: evidence.repetitionCount,
      createdAt: evidence.createdAt.toISOString(),
    };
  }
}
