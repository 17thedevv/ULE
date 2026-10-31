import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AssessmentVersion,
  ExamAttempt,
  ExamGrade,
  ExamItemGrade,
  ExamResponse,
  Prisma,
  QuestionType as PrismaQuestionType,
} from '@prisma/client';
import {
  ExamAccessGrantDto,
  ExamAttemptDto,
  ExamFeedbackPolicy,
  ExamGradeAggregationStatus,
  ExamItemGradeDto,
  ExamResponseDto,
  ExamResultSummaryDto,
  GrantExamAccessDto,
  QuestionType,
  SaveExamResponseDto,
  StartExamAttemptDto,
  SubmitExamAttemptDto,
} from '@ule/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  DeterministicAutoGraderService,
  ExamSnapshotItem,
} from './evaluators/deterministic-auto-grader.service';
import { QuestionTypesRegistry } from './questions/question-types.registry';

export interface ExamAttemptQuestionsDto {
  attemptId: string;
  assessmentVersionId: string;
  status: string;
  startedAt: string;
  deadlineAt: string | null;
  durationMinutes: number | null;
  totalPoints: number;
  itemCount: number;
  sections: Array<{
    id: string;
    title: string;
    description?: string | null;
    orderIndex: number;
    items: Array<{
      id: string;
      questionVersionId: string;
      type: QuestionType;
      title: string;
      prompt: string;
      content: Record<string, unknown>;
      points: number;
      orderIndex: number;
      isRequired: boolean;
    }>;
  }>;
}

interface SnapshotItemPayload {
  id: string;
  questionVersionId: string;
  type: QuestionType;
  title: string;
  prompt: string;
  content: Record<string, unknown>;
  answerKey?: Record<string, unknown> | null;
  rubric?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
  points: number;
  orderIndex: number;
  isRequired?: boolean;
}

interface SnapshotSectionPayload {
  id: string;
  title: string;
  description?: string | null;
  orderIndex: number;
  items?: SnapshotItemPayload[];
}

interface BlueprintSnapshotPayload {
  sections?: SnapshotSectionPayload[];
  [key: string]: unknown;
}

type AttemptWithVersion = ExamAttempt & {
  assessmentVersion: AssessmentVersion;
};

type GradeWithItemGrades = ExamGrade & {
  itemGrades?: ExamItemGrade[];
};

export const EXAM_DEADLINE_GRACE_MS = 15_000;

@Injectable()
export class ExamAttemptsService {
  private readonly logger = new Logger(ExamAttemptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly questionTypesRegistry: QuestionTypesRegistry,
    private readonly autoGrader: DeterministicAutoGraderService,
  ) {}

  /**
   * Authoritatively checks whether an examination deadline has been exceeded
   * beyond the unified transmission grace period (15s).
   */
  isAttemptOverdue(deadlineAt: Date | null, now = new Date()): boolean {
    if (!deadlineAt) return false;
    return now.getTime() > deadlineAt.getTime() + EXAM_DEADLINE_GRACE_MS;
  }

  /**
   * Authoritative conditional lazy expiration reconciliation.
   * Guarantees that terminal states (COMPLETED, GRADING, SUBMITTED, ABANDONED)
   * can NEVER be overwritten by an expiration transition.
   * Only transitions if status is currently 'IN_PROGRESS'.
   */
  async reconcileExpirationIfOverdue(
    attemptId: string,
    deadlineAt: Date | null,
    now = new Date(),
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{ isExpired: boolean }> {
    if (!this.isAttemptOverdue(deadlineAt, now)) {
      return { isExpired: false };
    }

    const result = await client.examAttempt.updateMany({
      where: {
        id: attemptId,
        status: 'IN_PROGRESS',
      },
      data: {
        status: 'EXPIRED',
        completedAt: deadlineAt,
      },
    });

    return { isExpired: result.count > 0 };
  }

  /**
   * Starts or resumes an examination attempt for a learner.
   * Concurrency-safe against attempt limit races and idempotent.
   */
  async startAttempt(
    versionId: string,
    userId: string,
    dto?: StartExamAttemptDto,
  ): Promise<ExamAttemptDto> {
    const version = await this.prisma.assessmentVersion.findUnique({
      where: { id: versionId },
      include: {
        assessmentDefinition: true,
      },
    });

    if (!version) {
      throw new NotFoundException(
        `AssessmentVersion '${versionId}' does not exist.`,
      );
    }

    const definition = version.assessmentDefinition;
    await this.verifyLearnerEligibility(definition.id, definition.courseId, definition.ownerId, userId);

    return this.prisma.$transaction(async (tx) => {
      // 1. Lock user row to serialize attempt allocation for this learner
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

      // 2. Lock any existing attempts for this version and learner
      await tx.$queryRaw`
        SELECT id FROM exam_attempts 
        WHERE "assessmentVersionId" = ${versionId} AND "learnerId" = ${userId} 
        FOR UPDATE
      `;

      // 3. Check client idempotency key replay
      const trimmedKey = dto?.idempotencyKey?.trim() || null;
      if (trimmedKey) {
        const existingByIdem = await tx.examAttempt.findFirst({
          where: {
            assessmentVersionId: versionId,
            learnerId: userId,
            idempotencyKey: trimmedKey,
          },
        });
        if (existingByIdem) {
          this.logger.log(
            `Idempotent attempt retrieval for key '${trimmedKey}' (attempt '${existingByIdem.id}').`,
          );
          return this.mapAttemptToDto(existingByIdem);
        }
      }

      // 4. Retrieve existing attempts
      const existingAttempts = await tx.examAttempt.findMany({
        where: {
          assessmentVersionId: versionId,
          learnerId: userId,
        },
        orderBy: { attemptNumber: 'desc' },
      });

      const now = new Date();

      // 5. Check if there is an active in-progress attempt
      const activeAttempt = existingAttempts.find((a) => a.status === 'IN_PROGRESS');
      if (activeAttempt) {
        // Authoritative lazy expiration check using shared grace and conditional update
        if (this.isAttemptOverdue(activeAttempt.deadlineAt, now)) {
          await this.reconcileExpirationIfOverdue(
            activeAttempt.id,
            activeAttempt.deadlineAt,
            now,
            tx,
          );
          activeAttempt.status = 'EXPIRED';
          activeAttempt.completedAt = activeAttempt.deadlineAt;
        } else {
          throw new ConflictException(
            `An examination attempt ('${activeAttempt.id}') is already in progress.`,
          );
        }
      }

      // 6. Check attempt limits
      const maxAllowed = version.maxAttempts ?? definition.maxAttempts ?? 1;
      if (maxAllowed > 0 && existingAttempts.length >= maxAllowed) {
        throw new ConflictException(
          `Maximum attempt limit (${maxAllowed}) reached for this examination.`,
        );
      }

      const nextAttemptNumber = (existingAttempts[0]?.attemptNumber ?? 0) + 1;

      // 7. Calculate server-authoritative deadline
      const startedAt = now;
      let deadlineAt: Date | null = null;
      if (version.durationMinutes && version.durationMinutes > 0) {
        deadlineAt = new Date(startedAt.getTime() + version.durationMinutes * 60 * 1000);
      }

      // 8. Create authoritative ExamAttempt
      const attempt = await tx.examAttempt.create({
        data: {
          assessmentVersionId: versionId,
          learnerId: userId,
          attemptNumber: nextAttemptNumber,
          status: 'IN_PROGRESS',
          idempotencyKey: trimmedKey,
          startedAt,
          deadlineAt,
          revision: 1,
        },
      });

      this.logger.log(
        `Created ExamAttempt '${attempt.id}' (Attempt #${nextAttemptNumber}) for learner '${userId}'.`,
      );

      return this.mapAttemptToDto(attempt);
    });
  }

  /**
   * Retrieves attempt metadata with server-authoritative lazy expiration.
   */
  async getAttempt(attemptId: string, userId: string): Promise<ExamAttemptDto> {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessmentVersion: {
          include: {
            assessmentDefinition: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(`ExamAttempt '${attemptId}' not found.`);
    }

    if (
      attempt.learnerId !== userId &&
      attempt.assessmentVersion.assessmentDefinition.ownerId !== userId
    ) {
      throw new ForbiddenException(
        `You do not have permission to view ExamAttempt '${attemptId}'.`,
      );
    }

    // Authoritative atomic conditional lazy expiration reconciliation
    if (attempt.status === 'IN_PROGRESS') {
      const now = new Date();
      if (this.isAttemptOverdue(attempt.deadlineAt, now)) {
        await this.reconcileExpirationIfOverdue(attemptId, attempt.deadlineAt, now);
        const fresh = await this.prisma.examAttempt.findUniqueOrThrow({
          where: { id: attemptId },
        });
        return this.mapAttemptToDto(fresh);
      }
    }

    return this.mapAttemptToDto(attempt);
  }

  /**
   * Returns sanitized questions from the immutable blueprint snapshot.
   * Strips all answer keys, correct answers, teacher rubrics and secret notes.
   */
  async getQuestions(attemptId: string, userId: string): Promise<ExamAttemptQuestionsDto> {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessmentVersion: {
          include: {
            assessmentDefinition: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(`ExamAttempt '${attemptId}' not found.`);
    }

    if (
      attempt.learnerId !== userId &&
      attempt.assessmentVersion.assessmentDefinition.ownerId !== userId
    ) {
      throw new ForbiddenException(
        `You do not have permission to access questions for ExamAttempt '${attemptId}'.`,
      );
    }

    // Authoritative atomic conditional lazy expiration check
    if (attempt.status === 'IN_PROGRESS') {
      const now = new Date();
      if (this.isAttemptOverdue(attempt.deadlineAt, now)) {
        await this.reconcileExpirationIfOverdue(attemptId, attempt.deadlineAt, now);
        const fresh = await this.prisma.examAttempt.findUniqueOrThrow({
          where: { id: attemptId },
        });
        attempt.status = fresh.status;
      }
    }

    const snapshot = attempt.assessmentVersion.snapshot as unknown as BlueprintSnapshotPayload;
    const sanitizedSections: ExamAttemptQuestionsDto['sections'] = [];

    for (const section of snapshot.sections || []) {
      const sanitizedItems: ExamAttemptQuestionsDto['sections'][0]['items'] = [];

      for (const item of section.items || []) {
        const sanitizedContent = this.questionTypesRegistry.sanitizeForLearner(
          item.type,
          item.content,
        );

        sanitizedItems.push({
          id: item.id,
          questionVersionId: item.questionVersionId,
          type: item.type,
          title: item.title,
          prompt: item.prompt,
          content: sanitizedContent,
          points: item.points,
          orderIndex: item.orderIndex,
          isRequired: item.isRequired ?? true,
        });
      }

      sanitizedSections.push({
        id: section.id,
        title: section.title,
        description: section.description,
        orderIndex: section.orderIndex,
        items: sanitizedItems,
      });
    }

    return {
      attemptId: attempt.id,
      assessmentVersionId: attempt.assessmentVersionId,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      deadlineAt: attempt.deadlineAt ? attempt.deadlineAt.toISOString() : null,
      durationMinutes: attempt.assessmentVersion.durationMinutes,
      totalPoints: attempt.assessmentVersion.totalPoints,
      itemCount: attempt.assessmentVersion.itemCount,
      sections: sanitizedSections,
    };
  }

  /**
   * Retrieves all saved responses for the attempt.
   */
  async getResponses(attemptId: string, userId: string): Promise<ExamResponseDto[]> {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessmentVersion: {
          include: {
            assessmentDefinition: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(`ExamAttempt '${attemptId}' not found.`);
    }

    if (
      attempt.learnerId !== userId &&
      attempt.assessmentVersion.assessmentDefinition.ownerId !== userId
    ) {
      throw new ForbiddenException(
        `You do not have permission to view responses for ExamAttempt '${attemptId}'.`,
      );
    }

    const responses = await this.prisma.examResponse.findMany({
      where: { examAttemptId: attemptId },
      orderBy: { createdAt: 'asc' },
    });

    return responses.map((r) => this.mapResponseToDto(r));
  }

  /**
   * Saves or autosaves a response for an individual question item with CAS concurrency check.
   */
  async saveResponse(
    attemptId: string,
    itemId: string,
    userId: string,
    dto: SaveExamResponseDto,
  ): Promise<ExamResponseDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Serialization lock on attempt root to serialize with submitAttempt
      const [lockedAttempt] = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          deadlineAt: Date | null;
          learnerId: string;
          assessmentVersionId: string;
        }>
      >`
        SELECT id, status, "deadlineAt", "learnerId", "assessmentVersionId"
        FROM exam_attempts
        WHERE id = ${attemptId}
        FOR UPDATE
      `;

      if (!lockedAttempt) {
        throw new NotFoundException(`ExamAttempt '${attemptId}' not found.`);
      }

      if (lockedAttempt.learnerId !== userId) {
        throw new ForbiddenException(
          `Only the assigned learner can save responses for ExamAttempt '${attemptId}'.`,
        );
      }

      if (lockedAttempt.status !== 'IN_PROGRESS') {
        throw new BadRequestException(
          `Cannot save responses for attempt with status '${lockedAttempt.status}'.`,
        );
      }

      const now = new Date();
      if (this.isAttemptOverdue(lockedAttempt.deadlineAt, now)) {
        await this.reconcileExpirationIfOverdue(
          attemptId,
          lockedAttempt.deadlineAt,
          now,
          tx,
        );
        return { expired: true as const };
      }

      // Locate question item in blueprint snapshot to resolve questionVersionId
      const version = await tx.assessmentVersion.findUniqueOrThrow({
        where: { id: lockedAttempt.assessmentVersionId },
      });
      const snapshot = version.snapshot as unknown as BlueprintSnapshotPayload;
      let targetItem: SnapshotItemPayload | null = null;

      for (const s of snapshot.sections || []) {
        for (const item of s.items || []) {
          if (item.id === itemId) {
            targetItem = item;
            break;
          }
        }
        if (targetItem) break;
      }

      if (!targetItem) {
        throw new NotFoundException(
          `Item '${itemId}' not found in examination blueprint snapshot.`,
        );
      }

      const existing = await tx.examResponse.findUnique({
        where: {
          examAttemptId_itemRefId: {
            examAttemptId: attemptId,
            itemRefId: itemId,
          },
        },
      });

      if (existing) {
        if (existing.isFinal) {
          throw new ConflictException(
            `Response for item '${itemId}' is finalized and cannot be modified.`,
          );
        }

        if (
          dto.expectedRevision !== undefined &&
          existing.revision !== dto.expectedRevision
        ) {
          throw new ConflictException(
            `Stale response revision: expected revision ${dto.expectedRevision} does not match current revision ${existing.revision}.`,
          );
        }

        const updated = await tx.examResponse.update({
          where: { id: existing.id, isFinal: false },
          data: {
            responsePayload: dto.responsePayload as Prisma.InputJsonValue,
            revision: existing.revision + 1,
            savedAt: now,
          },
        });

        return { expired: false as const, response: this.mapResponseToDto(updated) };
      } else {
        if (
          dto.expectedRevision !== undefined &&
          dto.expectedRevision !== 0 &&
          dto.expectedRevision !== 1
        ) {
          throw new ConflictException(
            `Stale response revision: expected revision ${dto.expectedRevision} for non-existent response.`,
          );
        }

        const created = await tx.examResponse.create({
          data: {
            examAttemptId: attemptId,
            itemRefId: itemId,
            questionVersionId: targetItem.questionVersionId,
            responsePayload: dto.responsePayload as Prisma.InputJsonValue,
            revision: 1,
            savedAt: now,
            isFinal: false,
          },
        });

        return { expired: false as const, response: this.mapResponseToDto(created) };
      }
    });

    if (result.expired) {
      throw new BadRequestException(
        'Examination deadline has expired. Responses are no longer accepted.',
      );
    }

    return result.response;
  }

  /**
   * Finalizes and submits an examination attempt.
   * Freezes responses, triggers deterministic auto-grading, and sets release state.
   */
  async submitAttempt(
    attemptId: string,
    userId: string,
    dto?: SubmitExamAttemptDto,
  ): Promise<ExamResultSummaryDto> {
    const submissionKey = dto?.idempotencyKey?.trim() || null;
    if (submissionKey) {
      this.logger.log(
        `Submit attempt '${attemptId}' requested with client submission key '${submissionKey}'.`,
      );
    }
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessmentVersion: {
          include: {
            assessmentDefinition: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(`ExamAttempt '${attemptId}' not found.`);
    }

    if (attempt.learnerId !== userId) {
      throw new ForbiddenException(
        `Only the assigned learner can submit ExamAttempt '${attemptId}'.`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Lock attempt for serialization
      await tx.$queryRaw`SELECT id FROM exam_attempts WHERE id = ${attemptId} FOR UPDATE`;

      const freshAttempt = await tx.examAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        include: {
          assessmentVersion: {
            include: {
              assessmentDefinition: true,
            },
          },
        },
      });

      // 2. Idempotent submission replay check
      if (
        freshAttempt.status === 'SUBMITTED' ||
        freshAttempt.status === 'GRADING' ||
        freshAttempt.status === 'COMPLETED'
      ) {
        this.logger.log(
          `Idempotent submission replay for attempt '${attemptId}' (status: ${freshAttempt.status}).`,
        );
        const existingGrade = await tx.examGrade.findUnique({
          where: { examAttemptId: attemptId },
          include: { itemGrades: true },
        });
        return {
          expired: false as const,
          summary: this.buildResultSummary(freshAttempt, existingGrade),
        };
      }

      if (freshAttempt.status === 'EXPIRED' || freshAttempt.status === 'ABANDONED') {
        throw new BadRequestException(
          `Cannot submit an attempt with status '${freshAttempt.status}'.`,
        );
      }

      const now = new Date();

      // 3. Deadline check (with unified 15-second network grace period)
      // Commit the EXPIRED state sustainably inside the transaction before returning
      if (this.isAttemptOverdue(freshAttempt.deadlineAt, now)) {
        await this.reconcileExpirationIfOverdue(
          attemptId,
          freshAttempt.deadlineAt,
          now,
          tx,
        );
        return { expired: true as const };
      }

      // 4. Freeze all existing responses
      await tx.examResponse.updateMany({
        where: { examAttemptId: attemptId },
        data: { isFinal: true },
      });

      // 5. Gather responses
      const responses = await tx.examResponse.findMany({
        where: { examAttemptId: attemptId },
      });
      const responsesMap = new Map<string, Record<string, unknown>>();
      for (const r of responses) {
        responsesMap.set(r.itemRefId, r.responsePayload as Record<string, unknown>);
      }

      // 6. Gather snapshot items
      const snapshot = freshAttempt.assessmentVersion.snapshot as unknown as BlueprintSnapshotPayload;
      const flatItems: ExamSnapshotItem[] = [];
      for (const s of snapshot.sections || []) {
        for (const item of s.items || []) {
          flatItems.push({
            id: item.id,
            questionVersionId: item.questionVersionId,
            type: item.type,
            title: item.title,
            prompt: item.prompt,
            content: item.content,
            answerKey: item.answerKey,
            rubric: item.rubric,
            config: item.config,
            points: item.points,
          });
        }
      }

      // 7. Execute server-authoritative auto-grading
      const evalResult = this.autoGrader.evaluateAttempt(
        flatItems,
        responsesMap,
        freshAttempt.assessmentVersion.passingScore,
      );

      // 8. Determine feedback release state based on version policy and grading status
      // Incomplete/pending human grading is NEVER released as final
      const feedbackPolicy = freshAttempt.assessmentVersion.feedbackPolicy;
      let isReleased = false;
      let releasedAt: Date | null = null;

      if (evalResult.aggregationStatus === 'FULLY_GRADED') {
        if (feedbackPolicy === 'IMMEDIATE' || feedbackPolicy === 'ON_SUBMISSION') {
          isReleased = true;
          releasedAt = now;
        } else if (feedbackPolicy === 'DEFERRED') {
          // If deadline has already passed, release immediately
          if (freshAttempt.deadlineAt && now >= freshAttempt.deadlineAt) {
            isReleased = true;
            releasedAt = now;
          }
        }
        // MANUAL policy remains isReleased = false until explicitly triggered by educator
      }

      // 9. Persist ExamGrade
      const grade = await tx.examGrade.create({
        data: {
          examAttemptId: attemptId,
          objectivePoints: evalResult.objectivePoints,
          pendingHumanPoints: evalResult.pendingHumanPoints,
          totalAwardedPoints: evalResult.totalAwardedPoints,
          maxPossiblePoints: evalResult.maxPossiblePoints,
          percentageScore: evalResult.percentageScore,
          isPassing: evalResult.isPassing,
          aggregationStatus: evalResult.aggregationStatus,
          evaluatorVersion: 'ule-exam-evaluator-v1',
          evaluatedAt: now,
          isReleased,
          releasedAt,
        },
      });

      // 10. Persist granular ExamItemGrade records
      for (const ig of evalResult.itemGrades) {
        await tx.examItemGrade.create({
          data: {
            examGradeId: grade.id,
            itemRefId: ig.itemRefId,
            questionVersionId: ig.questionVersionId,
            questionType: ig.questionType as PrismaQuestionType,
            maxPoints: ig.maxPoints,
            awardedPoints: ig.awardedPoints,
            isCorrect: ig.isCorrect,
            isPendingHuman: ig.isPendingHuman,
            evaluationDetails: ig.evaluationDetails as Prisma.InputJsonValue,
          },
        });
      }

      // 11. Final state transition
      const nextStatus =
        evalResult.aggregationStatus === 'PARTIAL_PENDING_HUMAN'
          ? 'GRADING'
          : 'COMPLETED';

      const updatedAttempt = await tx.examAttempt.update({
        where: { id: attemptId },
        data: {
          status: nextStatus,
          submittedAt: now,
          completedAt: nextStatus === 'COMPLETED' ? now : null,
        },
        include: {
          assessmentVersion: {
            include: {
              assessmentDefinition: true,
            },
          },
        },
      });

      this.logger.log(
        `Submitted ExamAttempt '${attemptId}'. Status: ${nextStatus}, Total points: ${evalResult.totalAwardedPoints}/${evalResult.maxPossiblePoints}, Released: ${isReleased}.`,
      );

      const completeGrade = await tx.examGrade.findUniqueOrThrow({
        where: { id: grade.id },
        include: { itemGrades: true },
      });

      return {
        expired: false as const,
        summary: this.buildResultSummary(updatedAttempt, completeGrade),
      };
    });

    if (result.expired) {
      throw new BadRequestException(
        'Examination deadline has expired. Attempt has been marked as expired.',
      );
    }

    return result.summary;
  }

  /**
   * Retrieves final exam results with anti-leakage protection.
   */
  async getResult(attemptId: string, userId: string): Promise<ExamResultSummaryDto> {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessmentVersion: {
          include: {
            assessmentDefinition: true,
          },
        },
        grade: {
          include: {
            itemGrades: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(`ExamAttempt '${attemptId}' not found.`);
    }

    if (
      attempt.learnerId !== userId &&
      attempt.assessmentVersion.assessmentDefinition.ownerId !== userId
    ) {
      throw new ForbiddenException(
        `You do not have permission to view results for ExamAttempt '${attemptId}'.`,
      );
    }

    if (!attempt.grade) {
      return {
        attemptId: attempt.id,
        status: attempt.status,
        startedAt: attempt.startedAt.toISOString(),
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
        feedbackPolicy: attempt.assessmentVersion.feedbackPolicy,
        isReleased: false,
        releasedAt: null,
        notice: 'Examination has not been submitted or evaluated yet.',
      };
    }

    let grade = attempt.grade;

    // Check if DEFERRED release can now take effect because deadline has passed AND attempt is fully graded
    if (
      !grade.isReleased &&
      attempt.assessmentVersion.feedbackPolicy === 'DEFERRED' &&
      grade.aggregationStatus === 'FULLY_GRADED' &&
      attempt.deadlineAt &&
      new Date() >= attempt.deadlineAt
    ) {
      grade = await this.prisma.examGrade.update({
        where: { id: grade.id },
        data: {
          isReleased: true,
          releasedAt: new Date(),
        },
        include: {
          itemGrades: true,
        },
      });
    }

    return this.buildResultSummary(attempt, grade);
  }

  /**
   * Manually releases grades for an attempt (used when MANUAL release policy is active).
   * Restricted to the creator who owns the assessment definition.
   */
  async releaseAttemptGrade(attemptId: string, creatorId: string): Promise<ExamResultSummaryDto> {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessmentVersion: {
          include: {
            assessmentDefinition: true,
          },
        },
        grade: {
          include: {
            itemGrades: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(`ExamAttempt '${attemptId}' not found.`);
    }

    if (attempt.assessmentVersion.assessmentDefinition.ownerId !== creatorId) {
      throw new ForbiddenException(
        `Only the examination creator can release grades for ExamAttempt '${attemptId}'.`,
      );
    }

    if (!attempt.grade) {
      throw new BadRequestException('Cannot release grades: attempt has not been graded yet.');
    }

    if (attempt.grade.aggregationStatus !== 'FULLY_GRADED') {
      throw new BadRequestException(
        'Cannot release examination grades: attempt is still pending human evaluation (FULLY_GRADED required).',
      );
    }

    const updatedGrade = await this.prisma.examGrade.update({
      where: { id: attempt.grade.id },
      data: {
        isReleased: true,
        releasedAt: new Date(),
      },
      include: {
        itemGrades: true,
      },
    });

    return this.buildResultSummary(attempt, updatedGrade);
  }

  /**
   * Grants explicit access to a standalone assessment definition.
   */
  async grantAccess(
    assessmentId: string,
    creatorId: string,
    dto: GrantExamAccessDto,
  ): Promise<ExamAccessGrantDto> {
    const definition = await this.prisma.assessmentDefinition.findUnique({
      where: { id: assessmentId },
    });

    if (!definition) {
      throw new NotFoundException(`AssessmentDefinition '${assessmentId}' not found.`);
    }

    if (definition.ownerId !== creatorId) {
      throw new ForbiddenException(
        `You do not have permission to grant access for AssessmentDefinition '${assessmentId}'.`,
      );
    }

    const grant = await this.prisma.examAccessGrant.upsert({
      where: {
        assessmentDefinitionId_userId: {
          assessmentDefinitionId: assessmentId,
          userId: dto.userId,
        },
      },
      update: {
        status: 'ACTIVE',
        revokedAt: null,
        grantedById: creatorId,
      },
      create: {
        assessmentDefinitionId: assessmentId,
        userId: dto.userId,
        grantedById: creatorId,
        status: 'ACTIVE',
      },
    });

    this.logger.log(
      `Granted exam access to learner '${dto.userId}' for assessment '${assessmentId}'.`,
    );

    return {
      id: grant.id,
      assessmentDefinitionId: grant.assessmentDefinitionId,
      userId: grant.userId,
      grantedById: grant.grantedById,
      status: grant.status,
      revokedAt: grant.revokedAt ? grant.revokedAt.toISOString() : null,
      createdAt: grant.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers & Mappers
  // ---------------------------------------------------------------------------

  private async verifyLearnerEligibility(
    assessmentId: string,
    courseId: string | null,
    creatorId: string,
    learnerId: string,
  ): Promise<void> {
    // Creator can always preview / test their own assessments
    if (creatorId === learnerId) {
      return;
    }

    // Check course enrollment if assessment is course-bound
    if (courseId) {
      const enrollment = await this.prisma.courseEnrollment.findFirst({
        where: {
          userId: learnerId,
          courseVersion: {
            courseId,
          },
          status: 'ACTIVE',
        },
      });

      if (enrollment) {
        // Fail-closed verification: Ensure CourseAccessGrant has not been revoked
        const courseGrant = await this.prisma.courseAccessGrant.findUnique({
          where: {
            courseVersionId_userId: {
              courseVersionId: enrollment.courseVersionId,
              userId: learnerId,
            },
          },
        });

        if (courseGrant && (courseGrant.status === 'REVOKED' || courseGrant.revokedAt !== null)) {
          throw new ForbiddenException(
            'Course access grant has been revoked. Learner is not authorized to attempt this examination.',
          );
        }

        return;
      }
    }

    // Check standalone access grant
    const grant = await this.prisma.examAccessGrant.findFirst({
      where: {
        assessmentDefinitionId: assessmentId,
        userId: learnerId,
        status: 'ACTIVE',
        revokedAt: null,
      },
    });

    if (grant) {
      return;
    }

    throw new ForbiddenException(
      'Learner is not authorized to attempt this examination. Enrollment or explicit grant is required.',
    );
  }

  private buildResultSummary(
    attempt: AttemptWithVersion,
    grade: GradeWithItemGrades | null,
  ): ExamResultSummaryDto {
    const feedbackPolicy: ExamFeedbackPolicy = attempt.assessmentVersion.feedbackPolicy;
    const isReleased = Boolean(grade?.isReleased);

    const baseSummary: ExamResultSummaryDto = {
      attemptId: attempt.id,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      deadlineAt: attempt.deadlineAt?.toISOString() ?? null,
      feedbackPolicy,
      isReleased,
      releasedAt: grade?.releasedAt?.toISOString() ?? null,
    };

    if (!isReleased || !grade) {
      if (grade?.aggregationStatus === 'PARTIAL_PENDING_HUMAN') {
        baseSummary.notice =
          'Examination contains questions pending human evaluation. Final scores and pass/fail determination will be released upon completion of grading.';
      } else {
        baseSummary.notice =
          'Detailed examination scores and item feedback are withheld according to the feedback release policy.';
      }
      return baseSummary;
    }

    const itemGradesList: ExamItemGradeDto[] = (grade.itemGrades || []).map((ig) => ({
      id: ig.id,
      itemRefId: ig.itemRefId,
      questionVersionId: ig.questionVersionId,
      questionType: ig.questionType as QuestionType,
      maxPoints: ig.maxPoints,
      awardedPoints: ig.awardedPoints,
      isCorrect: ig.isCorrect,
      isPendingHuman: ig.isPendingHuman,
      evaluationDetails: ig.evaluationDetails as Record<string, unknown> | null,
    }));

    baseSummary.grade = {
      id: grade.id,
      examAttemptId: grade.examAttemptId,
      objectivePoints: grade.objectivePoints,
      pendingHumanPoints: grade.pendingHumanPoints,
      totalAwardedPoints: grade.totalAwardedPoints,
      maxPossiblePoints: grade.maxPossiblePoints,
      percentageScore: grade.percentageScore,
      isPassing: grade.isPassing,
      aggregationStatus: grade.aggregationStatus as ExamGradeAggregationStatus,
      evaluatorVersion: grade.evaluatorVersion,
      evaluatedAt: grade.evaluatedAt.toISOString(),
      isReleased: true,
      releasedAt: grade.releasedAt?.toISOString() ?? null,
      itemGrades: itemGradesList,
    };

    return baseSummary;
  }

  private mapAttemptToDto(attempt: ExamAttempt): ExamAttemptDto {
    return {
      id: attempt.id,
      assessmentVersionId: attempt.assessmentVersionId,
      learnerId: attempt.learnerId,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      idempotencyKey: attempt.idempotencyKey ?? null,
      startedAt: attempt.startedAt.toISOString(),
      deadlineAt: attempt.deadlineAt ? attempt.deadlineAt.toISOString() : null,
      submittedAt: attempt.submittedAt ? attempt.submittedAt.toISOString() : null,
      completedAt: attempt.completedAt ? attempt.completedAt.toISOString() : null,
      revision: attempt.revision,
      createdAt: attempt.createdAt.toISOString(),
      updatedAt: attempt.updatedAt.toISOString(),
    };
  }

  private mapResponseToDto(response: ExamResponse): ExamResponseDto {
    return {
      id: response.id,
      examAttemptId: response.examAttemptId,
      itemRefId: response.itemRefId,
      questionVersionId: response.questionVersionId,
      responsePayload: response.responsePayload as Record<string, unknown>,
      revision: response.revision,
      savedAt: response.savedAt.toISOString(),
      isFinal: response.isFinal,
    };
  }
}
