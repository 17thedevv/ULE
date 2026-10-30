import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { QualificationService } from '../quests/qualification.service';
import { AssessmentCorrectionDto } from '@ule/contracts';
import { AssessmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentCorrectionDto as CorrectionInputDto } from './dto/assessment-correction.dto';
import { LearnerSkillProjectionService } from './learner-skill-projection.service';

@Injectable()
export class AssessmentCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectionService: LearnerSkillProjectionService,
    @Optional() private readonly qualificationService?: QualificationService,
  ) {}

  /**
   * Applies an authorized correction or delayed grading completion to an AssessmentResult.
   * Creates an append-only audit record in assessment_corrections, updates the evaluation,
   * updates associated LearningEvidence rows, and reprojects affected skill states.
   */
  async correctAssessment(
    actorId: string,
    dto: CorrectionInputDto,
  ): Promise<AssessmentCorrectionDto> {
    if (!dto.reason || dto.reason.trim().length < 5) {
      throw new BadRequestException(
        'Correction requires an explicit auditable reason of at least 5 characters.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const assessment = await tx.assessmentResult.findUnique({
        where: { id: dto.assessmentResultId },
        include: {
          run: {
            include: {
              courseVersion: { include: { course: true } },
            },
          },
          attempt: true,
        },
      });

      if (!assessment) {
        throw new NotFoundException(
          `AssessmentResult '${dto.assessmentResultId}' not found.`,
        );
      }

      // Check authoring/evaluator authority: actor must be course owner or system evaluator
      const isOwner = assessment.run.courseVersion.course.ownerId === actorId;
      if (!isOwner) {
        throw new NotFoundException(
          `AssessmentResult '${dto.assessmentResultId}' not found.`,
        );
      }

      // Determine next monotonic revision for this assessment's correction history
      const latestCorrection = await tx.assessmentCorrection.findFirst({
        where: { assessmentResultId: assessment.id },
        orderBy: { revision: 'desc' },
      });

      const nextRevision = (latestCorrection?.revision ?? 0) + 1;
      const targetStatus = (dto.newStatus as AssessmentStatus) ?? assessment.status;
      const targetIsCorrect =
        dto.newIsCorrect !== undefined ? dto.newIsCorrect : assessment.isCorrect;
      const targetScore =
        dto.newScore !== undefined ? dto.newScore : assessment.score;

      // 1. Append-only auditable correction log
      const correction = await tx.assessmentCorrection.create({
        data: {
          assessmentResultId: assessment.id,
          revision: nextRevision,
          previousStatus: assessment.status,
          newStatus: targetStatus,
          previousIsCorrect: assessment.isCorrect,
          newIsCorrect: targetIsCorrect,
          previousScore: assessment.score,
          newScore: targetScore,
          reason: dto.reason.trim(),
          actorId,
        },
      });

      // 2. Update AssessmentResult with new authoritative status
      await tx.assessmentResult.update({
        where: { id: assessment.id },
        data: {
          status: targetStatus,
          isCorrect: targetIsCorrect,
          score: targetScore,
          evaluatedAt: new Date(),
        },
      });

      // 3. Reconcile affected LearningEvidence rows
      const evidenceRows = await tx.learningEvidence.findMany({
        where: { assessmentResultId: assessment.id },
      });

      const affectedSkillIds: string[] = [];

      for (const ev of evidenceRows) {
        let newClassification = ev.classification;
        let newStatus = ev.status;
        let newExclusionReason = ev.exclusionReason;
        let evidenceIsCorrect = targetIsCorrect;
        let evidenceScore = targetScore;

        // 1. Ambiguous multi-skill mapping without criterion-level evaluation
        if (
          ev.exclusionReason ===
          'AMBIGUOUS_MULTI_SKILL_MAPPING_WITHOUT_CRITERION_EVALUATION'
        ) {
          newClassification = 'EXCLUDED';
          newStatus = 'EXCLUDED';
          newExclusionReason =
            'AMBIGUOUS_MULTI_SKILL_MAPPING_WITHOUT_CRITERION_EVALUATION';
          evidenceIsCorrect = null;
          evidenceScore = null;
        }
        // 2. Unmapped attempt or missing skill identity
        else if (
          !ev.skillId ||
          ev.exclusionReason === 'NO_SKILL_MAPPING_CONFIGURED'
        ) {
          newClassification = 'EXCLUDED';
          newStatus = 'EXCLUDED';
          newExclusionReason = 'NO_SKILL_MAPPING_CONFIGURED';
        }
        // 3. Ungraded / participation content
        else if (
          ev.exclusionReason === 'UNGRADED_CONTENT_COMPLETION_ONLY' ||
          ev.classification === 'UNGRADED_PARTICIPATION'
        ) {
          newClassification = 'UNGRADED_PARTICIPATION';
          newStatus = 'EXCLUDED';
          newExclusionReason = 'UNGRADED_CONTENT_COMPLETION_ONLY';
          evidenceIsCorrect = null;
          evidenceScore = null;
        }
        // 4. Same-item repetition across runs or attempts remains non-novel
        else if (
          ev.isSameItemRepetition ||
          ev.classification === 'SAME_ITEM_REPETITION' ||
          ev.exclusionReason === 'SAME_ITEM_REPETITION_NOT_INDEPENDENT'
        ) {
          newClassification = 'SAME_ITEM_REPETITION';
          newStatus = 'ACCEPTED';
          newExclusionReason = 'SAME_ITEM_REPETITION_NOT_INDEPENDENT';
          evidenceIsCorrect = targetIsCorrect;
          evidenceScore = targetScore;
        }
        // 5. Valid single-skill evaluatable observations
        else if (targetStatus === 'PENDING') {
          newClassification = 'PENDING_EVALUATION';
          newStatus = 'PENDING_ASSESSMENT';
          newExclusionReason = 'ASSESSMENT_STATUS_PENDING';
          evidenceIsCorrect = null;
          evidenceScore = null;
        } else if (targetStatus === 'FAILED') {
          newClassification = 'EXCLUDED';
          newStatus = 'EXCLUDED';
          newExclusionReason = 'ASSESSMENT_STATUS_FAILED';
          evidenceIsCorrect = null;
          evidenceScore = null;
        } else if (targetStatus === 'EVALUATED') {
          if (targetIsCorrect === true) {
            newClassification = ev.assisted
              ? 'ASSISTED_CORRECT'
              : 'INDEPENDENT_CORRECT';
            newStatus = 'ACCEPTED';
            newExclusionReason = null;
          } else {
            newClassification = 'INCORRECT';
            newStatus = 'ACCEPTED';
            newExclusionReason = null;
          }
        } else {
          newClassification = 'EXCLUDED';
          newStatus = 'EXCLUDED';
          newExclusionReason = `ASSESSMENT_STATUS_${targetStatus}`;
        }

        await tx.learningEvidence.update({
          where: { id: ev.id },
          data: {
            assessmentStatus: targetStatus,
            isCorrect: evidenceIsCorrect,
            score: evidenceScore,
            classification: newClassification,
            status: newStatus,
            exclusionReason: newExclusionReason,
            evaluatedAt: new Date(),
          },
        });

        if (ev.skillId && !affectedSkillIds.includes(ev.skillId)) {
          affectedSkillIds.push(ev.skillId);
        }
      }

      // 4. Re-project affected learner skill states
      for (const sId of affectedSkillIds) {
        await this.projectionService.recomputeProjection(
          assessment.run.userId,
          assessment.run.courseVersionId,
          sId,
          tx,
        );
      }

      // 5. Reconcile QualifyingFacts and Quest progress
      if (this.qualificationService) {
        await this.qualificationService.reconcileAssessmentCorrection(
          {
            assessmentResultId: assessment.id,
            targetIsCorrect,
            targetStatus,
          },
          tx,
        );
      }

      return {
        id: correction.id,
        assessmentResultId: correction.assessmentResultId,
        revision: correction.revision,
        previousStatus: correction.previousStatus,
        newStatus: correction.newStatus,
        previousIsCorrect: correction.previousIsCorrect,
        newIsCorrect: correction.newIsCorrect,
        previousScore: correction.previousScore,
        newScore: correction.newScore,
        reason: correction.reason,
        actorId: correction.actorId,
        createdAt: correction.createdAt.toISOString(),
      };
    });
  }

  /**
   * Retrieves auditable correction history for an AssessmentResult.
   */
  async getCorrectionHistory(
    actorId: string,
    assessmentResultId: string,
  ): Promise<AssessmentCorrectionDto[]> {
    const assessment = await this.prisma.assessmentResult.findUnique({
      where: { id: assessmentResultId },
      include: {
        run: {
          include: {
            courseVersion: { include: { course: true } },
          },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException(
        `AssessmentResult '${assessmentResultId}' not found.`,
      );
    }

    if (assessment.run.courseVersion.course.ownerId !== actorId) {
      throw new NotFoundException(
        `AssessmentResult '${assessmentResultId}' not found.`,
      );
    }

    const corrections = await this.prisma.assessmentCorrection.findMany({
      where: { assessmentResultId },
      orderBy: { revision: 'asc' },
    });

    return corrections.map((c) => ({
      id: c.id,
      assessmentResultId: c.assessmentResultId,
      revision: c.revision,
      previousStatus: c.previousStatus,
      newStatus: c.newStatus,
      previousIsCorrect: c.previousIsCorrect,
      newIsCorrect: c.newIsCorrect,
      previousScore: c.previousScore,
      newScore: c.newScore,
      reason: c.reason,
      actorId: c.actorId,
      createdAt: c.createdAt.toISOString(),
    }));
  }
}
