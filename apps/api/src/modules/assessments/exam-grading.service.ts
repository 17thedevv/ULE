import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EssayRubric,
  ExamAppealStatus,
  ExamFeedbackPolicy,
  ExamGradeAppealDto,
  ExamGradeRevisionDto,
  ExamGradingQueueItemDto,
  ExamHumanGradeRevisionDto,
  ExamItemGradeDto,
  QuestionType,
  RubricCriterionEvaluationInput,
} from '@ule/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CorrectExamItemGradeRequestDto,
  CreateExamAppealRequestDto,
  EvaluateExamItemRequestDto,
  FinalizeExamGradingRequestDto,
  ResolveExamAppealRequestDto,
} from './dto/exam-grading.dto';

@Injectable()
export class ExamGradingService {
  private readonly logger = new Logger(ExamGradingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to round float values deterministically to 2 decimal places.
   */
  private roundTo2Decimals(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  /**
   * Retrieves the grading queue of examinations containing items pending human evaluation.
   * Scoped strictly to assessments owned by the authenticated educator.
   */
  async getGradingQueue(creatorId: string, assessmentDefinitionId?: string): Promise<ExamGradingQueueItemDto[]> {
    const attempts = await this.prisma.examAttempt.findMany({
      where: {
        status: 'GRADING',
        assessmentVersion: {
          assessmentDefinition: {
            ownerId: creatorId,
            ...(assessmentDefinitionId ? { id: assessmentDefinitionId } : {}),
          },
        },
        grade: {
          aggregationStatus: 'PARTIAL_PENDING_HUMAN',
        },
      },
      include: {
        learner: {
          select: { id: true, name: true },
        },
        assessmentVersion: {
          include: {
            assessmentDefinition: {
              select: { title: true },
            },
          },
        },
        responses: true,
        grade: {
          include: {
            itemGrades: {
              where: { isPendingHuman: true },
              include: {
                questionVersion: true,
              },
            },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });

    return attempts.map((att) => {
      const pendingItems = (att.grade?.itemGrades || []).map((ig) => {
        const response = att.responses.find((r) => r.itemRefId === ig.itemRefId);
        const rubric = (ig.questionVersion.rubric ?? null) as EssayRubric | null;

        return {
          itemGradeId: ig.id,
          itemRefId: ig.itemRefId,
          questionVersionId: ig.questionVersionId,
          questionType: ig.questionType as QuestionType,
          maxPoints: ig.maxPoints,
          submittedResponse: (response?.responsePayload ?? null) as Record<string, unknown> | null,
          rubric,
          revision: ig.revision,
        };
      });

      return {
        attemptId: att.id,
        assessmentVersionId: att.assessmentVersionId,
        assessmentTitle: att.assessmentVersion.assessmentDefinition.title,
        learnerId: att.learner.id,
        learnerName: att.learner.name,
        submittedAt: att.submittedAt ? att.submittedAt.toISOString() : null,
        pendingItemCount: pendingItems.length,
        pendingItems,
      };
    });
  }

  /**
   * Retrieves full grading context for an attempt including submitted answers and rubrics.
   */
  async getGradingAttempt(creatorId: string, attemptId: string) {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        learner: { select: { id: true, name: true, email: true } },
        assessmentVersion: {
          include: {
            assessmentDefinition: true,
          },
        },
        responses: true,
        grade: {
          include: {
            itemGrades: {
              include: {
                questionVersion: true,
                revisions: { orderBy: { revision: 'desc' } },
              },
            },
            revisions: { orderBy: { revision: 'desc' } },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(`ExamAttempt with ID '${attemptId}' not found.`);
    }

    if (attempt.assessmentVersion.assessmentDefinition.ownerId !== creatorId) {
      throw new ForbiddenException('Forbidden: You do not have permission to grade this examination.');
    }

    return attempt;
  }

  /**
   * Evaluates an individual subjective item using the published rubric or direct bounded points.
   * Concurrency-safe against race conditions with optimistic revision locking.
   */
  async evaluateItem(
    creatorId: string,
    itemGradeId: string,
    dto: EvaluateExamItemRequestDto,
  ): Promise<ExamItemGradeDto> {
    // 1. Fetch item with all hierarchy for authorization and validation
    const itemGrade = await this.prisma.examItemGrade.findUnique({
      where: { id: itemGradeId },
      include: {
        examGrade: {
          include: {
            examAttempt: {
              include: {
                assessmentVersion: {
                  include: {
                    assessmentDefinition: true,
                  },
                },
              },
            },
          },
        },
        questionVersion: true,
      },
    });

    if (!itemGrade) {
      throw new NotFoundException(`ExamItemGrade with ID '${itemGradeId}' not found.`);
    }

    const { examGrade } = itemGrade;
    const { examAttempt } = examGrade;
    const { assessmentDefinition } = examAttempt.assessmentVersion;

    // 2. Authorization checks
    if (assessmentDefinition.ownerId !== creatorId) {
      throw new ForbiddenException('Forbidden: You are not authorized to grade this examination item.');
    }

    if (examAttempt.learnerId === creatorId) {
      throw new ForbiddenException('Security violation: Educators cannot grade their own examination submissions.');
    }

    // 3. Lifecycle invariant check
    if (examAttempt.status !== 'GRADING') {
      throw new BadRequestException(
        `ExamAttempt is in '${examAttempt.status}' status. Only attempts in 'GRADING' status may receive human evaluations.`,
      );
    }

    if (!itemGrade.isPendingHuman) {
      throw new BadRequestException(
        'Item has already received an authoritative evaluation. Use the corrections endpoint to revise grades.',
      );
    }

    if (itemGrade.questionType !== 'ESSAY' && itemGrade.questionType !== 'SHORT_TEXT') {
      throw new BadRequestException(
        `Cannot apply human rubric evaluation to objective question type '${itemGrade.questionType}'.`,
      );
    }

    // 4. Idempotency check (performed before revision check to permit safe retries)
    if (dto.idempotencyKey) {
      const existingRev = await this.prisma.examHumanGradeRevision.findUnique({
        where: {
          examItemGradeId_idempotencyKey: {
            examItemGradeId: itemGradeId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });

      if (existingRev) {
        const isMatch = this.verifyEvaluationIdempotencyMatch(existingRev, dto);
        if (!isMatch) {
          throw new ConflictException(
            `Idempotency conflict: key '${dto.idempotencyKey}' was already used with different grading parameters.`,
          );
        }
        return this.mapItemGradeToDto(itemGrade);
      }
    }

    // 5. Optimistic locking check
    if (dto.expectedRevision !== undefined && itemGrade.revision !== dto.expectedRevision) {
      throw new ConflictException(
        `Optimistic lock failure: expected revision ${dto.expectedRevision}, but item is at revision ${itemGrade.revision}.`,
      );
    }

    // 6. Score calculation & rubric validation
    const awardedPoints = this.calculateValidatedItemPoints(itemGrade, dto);

    // 7. Atomic Transaction with PostgreSQL Row Locking
    return await this.prisma.$transaction(
      async (tx) => {
        // Enforce lock order: ExamAttempt -> ExamGrade -> ExamItemGrade
        await tx.$queryRaw`SELECT id FROM "exam_attempts" WHERE id = ${examAttempt.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "exam_grades" WHERE id = ${examGrade.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "exam_item_grades" WHERE id = ${itemGradeId} FOR UPDATE`;

        const freshItem = await tx.examItemGrade.findUniqueOrThrow({
          where: { id: itemGradeId },
        });

        if (!freshItem.isPendingHuman) {
          throw new BadRequestException('Item was already evaluated concurrently.');
        }

        const newRevision = freshItem.revision + 1;
        const isCorrect = awardedPoints >= freshItem.maxPoints * 0.5;

        // Append to immutable revision ledger
        await tx.examHumanGradeRevision.create({
          data: {
            examItemGradeId: itemGradeId,
            revision: newRevision,
            actorId: creatorId,
            eventType: 'INITIAL_EVALUATION',
            previousAwardedPoints: freshItem.awardedPoints,
            newAwardedPoints: awardedPoints,
            criterionScores: (dto.criterionScores as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            comments: dto.feedback ?? null,
            idempotencyKey: dto.idempotencyKey ?? null,
          },
        });

        // Update item grade
        const updatedItem = await tx.examItemGrade.update({
          where: { id: itemGradeId },
          data: {
            awardedPoints,
            isCorrect,
            isPendingHuman: false,
            revision: newRevision,
            evaluationDetails: {
              criterionScores: dto.criterionScores ?? [],
              feedback: dto.feedback ?? null,
              evaluatedById: creatorId,
              evaluatedAt: new Date().toISOString(),
            } as unknown as Prisma.InputJsonValue,
          },
        });

        // 8. Check if all human items are now resolved to trigger auto-finalization
        const remainingPending = await tx.examItemGrade.count({
          where: {
            examGradeId: examGrade.id,
            isPendingHuman: true,
          },
        });

        if (remainingPending === 0) {
          await this.executeFinalization(tx, examAttempt.id, creatorId, 'INITIAL_EVALUATION');
        }

        return this.mapItemGradeToDto(updatedItem);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  /**
   * Corrects a previously evaluated or finalized item grade with mandatory reason and audit entry.
   */
  async correctItemGrade(
    creatorId: string,
    itemGradeId: string,
    dto: CorrectExamItemGradeRequestDto,
  ): Promise<ExamItemGradeDto> {
    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException('Mandatory reason must be provided when issuing a grade correction.');
    }

    const itemGrade = await this.prisma.examItemGrade.findUnique({
      where: { id: itemGradeId },
      include: {
        examGrade: {
          include: {
            examAttempt: {
              include: {
                assessmentVersion: {
                  include: {
                    assessmentDefinition: true,
                  },
                },
              },
            },
          },
        },
        questionVersion: true,
      },
    });

    if (!itemGrade) {
      throw new NotFoundException(`ExamItemGrade with ID '${itemGradeId}' not found.`);
    }

    const { examGrade } = itemGrade;
    const { examAttempt } = examGrade;
    const { assessmentDefinition } = examAttempt.assessmentVersion;

    if (assessmentDefinition.ownerId !== creatorId) {
      throw new ForbiddenException('Forbidden: You are not authorized to correct grades for this assessment.');
    }

    if (examAttempt.learnerId === creatorId) {
      throw new ForbiddenException('Security violation: Educators cannot correct their own examination grades.');
    }

    // Idempotency check (performed before revision check to allow safe retries)
    if (dto.idempotencyKey) {
      const existingRev = await this.prisma.examHumanGradeRevision.findUnique({
        where: {
          examItemGradeId_idempotencyKey: {
            examItemGradeId: itemGradeId,
            idempotencyKey: dto.idempotencyKey,
          },
        },
      });

      if (existingRev) {
        if (existingRev.reason !== dto.reason) {
          throw new ConflictException(
            `Idempotency conflict: key '${dto.idempotencyKey}' was already used with a different reason.`,
          );
        }
        return this.mapItemGradeToDto(itemGrade);
      }
    }

    // Optimistic locking check
    if (itemGrade.revision !== dto.expectedRevision) {
      throw new ConflictException(
        `Optimistic lock failure: expected revision ${dto.expectedRevision}, but item is at revision ${itemGrade.revision}.`,
      );
    }

    const awardedPoints = this.calculateValidatedItemPoints(itemGrade, dto);

    return await this.prisma.$transaction(
      async (tx) => {
        // Enforce lock order: ExamAttempt -> ExamGrade -> ExamItemGrade
        await tx.$queryRaw`SELECT id FROM "exam_attempts" WHERE id = ${examAttempt.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "exam_grades" WHERE id = ${examGrade.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "exam_item_grades" WHERE id = ${itemGradeId} FOR UPDATE`;

        const freshItem = await tx.examItemGrade.findUniqueOrThrow({
          where: { id: itemGradeId },
        });

        if (freshItem.revision !== dto.expectedRevision) {
          throw new ConflictException('Concurrent modification detected during correction.');
        }

        const newRevision = freshItem.revision + 1;
        const isCorrect = awardedPoints >= freshItem.maxPoints * 0.5;

        // Append item correction revision
        await tx.examHumanGradeRevision.create({
          data: {
            examItemGradeId: itemGradeId,
            revision: newRevision,
            actorId: creatorId,
            eventType: 'CORRECTION',
            previousAwardedPoints: freshItem.awardedPoints,
            newAwardedPoints: awardedPoints,
            criterionScores: (dto.criterionScores as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            comments: dto.feedback ?? null,
            reason: dto.reason,
            idempotencyKey: dto.idempotencyKey ?? null,
          },
        });

        // Update item grade
        const updatedItem = await tx.examItemGrade.update({
          where: { id: itemGradeId },
          data: {
            awardedPoints,
            isCorrect,
            isPendingHuman: false,
            revision: newRevision,
            evaluationDetails: {
              criterionScores: dto.criterionScores ?? [],
              feedback: dto.feedback ?? null,
              correctionReason: dto.reason,
              correctedById: creatorId,
              correctedAt: new Date().toISOString(),
            } as unknown as Prisma.InputJsonValue,
          },
        });

        // Recompute aggregate exam grade if attempt was already fully graded
        if (examGrade.aggregationStatus === 'FULLY_GRADED') {
          await this.recalculateAggregateGrade(tx, examGrade.id, creatorId, 'CORRECTION', dto.reason);
        }

        return this.mapItemGradeToDto(updatedItem);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  /**
   * Finalizes human grading on an attempt, recomputing scores, pass/fail and applying release policies.
   */
  async finalizeGrading(
    creatorId: string,
    attemptId: string,
    dto?: FinalizeExamGradingRequestDto,
  ) {
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
      throw new NotFoundException(`ExamAttempt with ID '${attemptId}' not found.`);
    }

    if (attempt.assessmentVersion.assessmentDefinition.ownerId !== creatorId) {
      throw new ForbiddenException('Forbidden: You are not authorized to finalize this examination.');
    }

    if (!attempt.grade) {
      throw new BadRequestException('Cannot finalize grading: ExamGrade record does not exist.');
    }

    // Idempotent finalization check
    if (attempt.status === 'COMPLETED' && attempt.grade.aggregationStatus === 'FULLY_GRADED') {
      return this.prisma.examGrade.findUniqueOrThrow({
        where: { id: attempt.grade.id },
        include: { itemGrades: true },
      });
    }

    return await this.prisma.$transaction(
      async (tx) => {
        // Enforce lock order: ExamAttempt -> ExamGrade
        await tx.$queryRaw`SELECT id FROM "exam_attempts" WHERE id = ${attemptId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "exam_grades" WHERE id = ${attempt.grade!.id} FOR UPDATE`;

        const freshAttempt = await tx.examAttempt.findUniqueOrThrow({
          where: { id: attemptId },
          include: {
            grade: {
              include: {
                itemGrades: true,
              },
            },
          },
        });

        if (freshAttempt.status === 'COMPLETED' && freshAttempt.grade?.aggregationStatus === 'FULLY_GRADED') {
          return freshAttempt.grade;
        }

        // Process any unattempted / blank subjective items according to documented policy
        const pendingItems = freshAttempt.grade?.itemGrades.filter((ig) => ig.isPendingHuman) || [];
        for (const pending of pendingItems) {
          const response = await tx.examResponse.findUnique({
            where: {
              examAttemptId_itemRefId: {
                examAttemptId: attemptId,
                itemRefId: pending.itemRefId,
              },
            },
          });

          const isBlank = !response || !response.responsePayload || Object.keys(response.responsePayload).length === 0;

          if (isBlank) {
            // Unanswered disposition policy: zero points awarded with explicit audit trail
            const newRev = pending.revision + 1;
            await tx.examHumanGradeRevision.create({
              data: {
                examItemGradeId: pending.id,
                revision: newRev,
                actorId: creatorId,
                eventType: 'UNANSWERED_DISPOSITION',
                previousAwardedPoints: pending.awardedPoints,
                newAwardedPoints: 0,
                reason: 'Learner submitted blank response. Disposed with zero points.',
              },
            });

            await tx.examItemGrade.update({
              where: { id: pending.id },
              data: {
                awardedPoints: 0,
                isCorrect: false,
                isPendingHuman: false,
                revision: newRev,
                evaluationDetails: {
                  status: 'DISPOSED_UNANSWERED',
                  reason: 'Learner left subjective question blank.',
                },
              },
            });
          } else {
            // Attempted item remains un-graded -> finalization cannot proceed
            throw new BadRequestException(
              `Cannot finalize examination: Item '${pending.itemRefId}' (${pending.questionType}) has a learner response and requires human rubric evaluation.`,
            );
          }
        }

        return await this.executeFinalization(
          tx,
          attemptId,
          creatorId,
          'INITIAL_EVALUATION',
          dto?.idempotencyKey,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  /**
   * Retrieves full append-only revision ledger for an exam attempt.
   */
  async getGradeRevisions(actorId: string, attemptId: string) {
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
            revisions: { orderBy: { revision: 'asc' } },
            itemGrades: {
              include: {
                revisions: { orderBy: { revision: 'asc' } },
              },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException(`ExamAttempt with ID '${attemptId}' not found.`);
    }

    const isCreator = attempt.assessmentVersion.assessmentDefinition.ownerId === actorId;
    const isLearner = attempt.learnerId === actorId;

    if (!isCreator && !isLearner) {
      throw new ForbiddenException('Forbidden: You are not authorized to view grade revisions for this attempt.');
    }

    // Anti-leakage: Learner cannot view revisions until grade is released
    if (isLearner && !attempt.grade?.isReleased) {
      throw new ForbiddenException('Grade revisions are withheld until results are released.');
    }

    const aggregateRevisions: ExamGradeRevisionDto[] = (attempt.grade?.revisions || []).map((r) => ({
      id: r.id,
      examGradeId: r.examGradeId,
      revision: r.revision,
      actorId: r.actorId,
      eventType: r.eventType,
      previousTotalPoints: r.previousTotalPoints,
      newTotalPoints: r.newTotalPoints,
      previousPercentage: r.previousPercentage,
      newPercentage: r.newPercentage,
      previousPassingStatus: r.previousPassingStatus,
      newPassingStatus: r.newPassingStatus,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));

    const itemRevisions: ExamHumanGradeRevisionDto[] = [];
    for (const ig of attempt.grade?.itemGrades || []) {
      for (const rev of ig.revisions) {
        itemRevisions.push({
          id: rev.id,
          examItemGradeId: rev.examItemGradeId,
          revision: rev.revision,
          actorId: rev.actorId,
          eventType: rev.eventType,
          previousAwardedPoints: rev.previousAwardedPoints,
          newAwardedPoints: rev.newAwardedPoints,
          criterionScores: rev.criterionScores as Record<string, unknown> | null,
          comments: rev.comments,
          reason: rev.reason,
          createdAt: rev.createdAt.toISOString(),
        });
      }
    }

    return {
      attemptId,
      currentGradeRevision: attempt.grade?.revision ?? 1,
      aggregateRevisions,
      itemRevisions,
    };
  }

  // ===========================================================================
  // Appeals Subsystem
  // ===========================================================================

  /**
   * Learner submits a grade appeal for their released examination result.
   */
  async createAppeal(
    learnerId: string,
    attemptId: string,
    dto: CreateExamAppealRequestDto,
  ): Promise<ExamGradeAppealDto> {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        grade: true,
      },
    });

    if (!attempt) {
      throw new NotFoundException(`ExamAttempt with ID '${attemptId}' not found.`);
    }

    if (attempt.learnerId !== learnerId) {
      throw new ForbiddenException('Security violation: You cannot submit an appeal on another learner’s examination.');
    }

    if (attempt.status !== 'COMPLETED' || !attempt.grade) {
      throw new BadRequestException('Cannot appeal examination: Attempt has not been fully graded and completed.');
    }

    if (!attempt.grade.isReleased) {
      throw new BadRequestException('Cannot appeal examination: Results have not been released to you yet.');
    }

    if (dto.examItemGradeId) {
      const itemGrade = await this.prisma.examItemGrade.findUnique({
        where: { id: dto.examItemGradeId },
      });
      if (!itemGrade || itemGrade.examGradeId !== attempt.grade.id) {
        throw new BadRequestException(`ExamItemGrade '${dto.examItemGradeId}' does not belong to this attempt.`);
      }
    }

    // Check duplicate active appeal policy
    const existingActiveAppeal = await this.prisma.examGradeAppeal.findFirst({
      where: {
        examAttemptId: attemptId,
        status: { in: ['OPEN', 'UNDER_REVIEW'] },
        ...(dto.examItemGradeId ? { examItemGradeId: dto.examItemGradeId } : {}),
      },
    });

    if (existingActiveAppeal) {
      throw new ConflictException('An active appeal is already pending for this examination result.');
    }

    const appeal = await this.prisma.examGradeAppeal.create({
      data: {
        examAttemptId: attemptId,
        examItemGradeId: dto.examItemGradeId ?? null,
        learnerId,
        status: 'OPEN',
        reason: dto.reason,
        gradeRevisionAtSubmission: attempt.grade.revision,
      },
    });

    return this.mapAppealToDto(appeal);
  }

  /**
   * Lists appeals for an attempt. Accessible to the learner or the assessment creator.
   */
  async getAppealsForAttempt(actorId: string, attemptId: string): Promise<ExamGradeAppealDto[]> {
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
      throw new NotFoundException(`ExamAttempt with ID '${attemptId}' not found.`);
    }

    const isLearner = attempt.learnerId === actorId;
    const isCreator = attempt.assessmentVersion.assessmentDefinition.ownerId === actorId;

    if (!isLearner && !isCreator) {
      throw new ForbiddenException('Forbidden: You are not authorized to view appeals for this examination.');
    }

    const appeals = await this.prisma.examGradeAppeal.findMany({
      where: { examAttemptId: attemptId },
      orderBy: { createdAt: 'desc' },
    });

    return appeals.map((a) => this.mapAppealToDto(a));
  }

  /**
   * Retrieves single appeal record.
   */
  async getAppeal(actorId: string, appealId: string): Promise<ExamGradeAppealDto> {
    const appeal = await this.prisma.examGradeAppeal.findUnique({
      where: { id: appealId },
      include: {
        examAttempt: {
          include: {
            assessmentVersion: {
              include: {
                assessmentDefinition: true,
              },
            },
          },
        },
      },
    });

    if (!appeal) {
      throw new NotFoundException(`ExamGradeAppeal with ID '${appealId}' not found.`);
    }

    const isLearner = appeal.learnerId === actorId;
    const isCreator = appeal.examAttempt.assessmentVersion.assessmentDefinition.ownerId === actorId;

    if (!isLearner && !isCreator) {
      throw new ForbiddenException('Forbidden: You do not have access to this appeal.');
    }

    return this.mapAppealToDto(appeal);
  }

  /**
   * Creator transitions an appeal into UNDER_REVIEW.
   */
  async reviewAppeal(reviewerId: string, appealId: string): Promise<ExamGradeAppealDto> {
    const appeal = await this.prisma.examGradeAppeal.findUnique({
      where: { id: appealId },
      include: {
        examAttempt: {
          include: {
            assessmentVersion: {
              include: {
                assessmentDefinition: true,
              },
            },
          },
        },
      },
    });

    if (!appeal) {
      throw new NotFoundException(`ExamGradeAppeal with ID '${appealId}' not found.`);
    }

    if (appeal.examAttempt.assessmentVersion.assessmentDefinition.ownerId !== reviewerId) {
      throw new ForbiddenException('Forbidden: You are not authorized to review appeals for this assessment.');
    }

    if (appeal.status !== 'OPEN') {
      throw new BadRequestException(`Appeal cannot transition to UNDER_REVIEW from status '${appeal.status}'.`);
    }

    const updated = await this.prisma.examGradeAppeal.update({
      where: { id: appealId },
      data: {
        status: 'UNDER_REVIEW',
        reviewerId,
      },
    });

    return this.mapAppealToDto(updated);
  }

  /**
   * Resolves an appeal by either upholding, rejecting, or changing the grade with an audit trail.
   */
  async resolveAppeal(
    reviewerId: string,
    appealId: string,
    dto: ResolveExamAppealRequestDto,
  ): Promise<ExamGradeAppealDto> {
    const appeal = await this.prisma.examGradeAppeal.findUnique({
      where: { id: appealId },
      include: {
        examAttempt: {
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
        },
      },
    });

    if (!appeal) {
      throw new NotFoundException(`ExamGradeAppeal with ID '${appealId}' not found.`);
    }

    const { examAttempt } = appeal;
    if (examAttempt.assessmentVersion.assessmentDefinition.ownerId !== reviewerId) {
      throw new ForbiddenException('Forbidden: You are not authorized to resolve this appeal.');
    }

    if (appeal.status !== 'OPEN' && appeal.status !== 'UNDER_REVIEW') {
      throw new BadRequestException(`Appeal has already reached terminal status '${appeal.status}'.`);
    }

    if (!dto.reviewerNotes || dto.reviewerNotes.trim().length === 0) {
      throw new BadRequestException('Mandatory reviewerNotes must be provided when resolving an appeal.');
    }

    return await this.prisma.$transaction(
      async (tx) => {
        // Enforce lock order: ExamAttempt -> ExamGrade
        await tx.$queryRaw`SELECT id FROM "exam_attempts" WHERE id = ${examAttempt.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "exam_grades" WHERE id = ${examAttempt.grade!.id} FOR UPDATE`;

        const now = new Date();

        if (dto.resolution === 'RESOLVED_CHANGED') {
          // Identify target item
          let targetItemGradeId = appeal.examItemGradeId;
          if (!targetItemGradeId) {
            // Overall appeal: must find an item to apply score adjustment to
            const candidate = examAttempt.grade?.itemGrades.find(
              (ig) => ig.questionType === 'ESSAY' || ig.questionType === 'SHORT_TEXT',
            );
            if (!candidate) {
              throw new BadRequestException('Cannot apply RESOLVED_CHANGED without an applicable subjective item.');
            }
            targetItemGradeId = candidate.id;
          }

          const targetItem = await tx.examItemGrade.findUniqueOrThrow({
            where: { id: targetItemGradeId },
            include: { questionVersion: true },
          });

          const newScore = this.calculateValidatedItemPoints(targetItem, {
            awardedPoints: dto.awardedPoints,
            criterionScores: dto.criterionScores,
          });

          const itemRev = targetItem.revision + 1;
          const isCorrect = newScore >= targetItem.maxPoints * 0.5;

          // Record item revision with APPEAL_RESOLUTION
          await tx.examHumanGradeRevision.create({
            data: {
              examItemGradeId: targetItem.id,
              revision: itemRev,
              actorId: reviewerId,
              eventType: 'APPEAL_RESOLUTION',
              previousAwardedPoints: targetItem.awardedPoints,
              newAwardedPoints: newScore,
              criterionScores: (dto.criterionScores as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              comments: dto.reviewerNotes,
              reason: dto.correctionReason || `Appeal resolved as CHANGED: ${dto.reviewerNotes}`,
              idempotencyKey: dto.idempotencyKey ?? null,
            },
          });

          await tx.examItemGrade.update({
            where: { id: targetItem.id },
            data: {
              awardedPoints: newScore,
              isCorrect,
              revision: itemRev,
              evaluationDetails: {
                criterionScores: dto.criterionScores ?? [],
                appealResolutionNotes: dto.reviewerNotes,
                resolvedById: reviewerId,
                resolvedAt: now.toISOString(),
              } as unknown as Prisma.InputJsonValue,
            },
          });

          // Recompute aggregate
          await this.recalculateAggregateGrade(
            tx,
            examAttempt.grade!.id,
            reviewerId,
            'APPEAL_RESOLUTION',
            `Grade updated following appeal resolution: ${dto.reviewerNotes}`,
          );
        }

        const updatedAppeal = await tx.examGradeAppeal.update({
          where: { id: appealId },
          data: {
            status: dto.resolution,
            reviewerId,
            reviewerNotes: dto.reviewerNotes,
            resolution: dto.resolution,
            resolvedAt: now,
          },
        });

        return this.mapAppealToDto(updatedAppeal);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  // ===========================================================================
  // Internal Helpers & Aggregation Engines
  // ===========================================================================

  /**
   * Internal routine to execute full grading aggregation and release policy evaluation.
   */
  private async executeFinalization(
    tx: Prisma.TransactionClient,
    attemptId: string,
    actorId: string,
    eventType: 'INITIAL_EVALUATION' | 'CORRECTION' | 'APPEAL_RESOLUTION',
    idempotencyKey?: string,
  ) {
    const now = new Date();
    const attempt = await tx.examAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: {
        assessmentVersion: true,
        grade: {
          include: {
            itemGrades: true,
          },
        },
      },
    });

    const grade = attempt.grade!;
    const itemGrades = grade.itemGrades;

    let totalAwardedPoints = 0;
    let pendingHumanPoints = 0;
    let objectivePoints = 0;

    for (const ig of itemGrades) {
      if (ig.isPendingHuman) {
        pendingHumanPoints += ig.maxPoints;
      } else {
        totalAwardedPoints += ig.awardedPoints;
        if (ig.questionType !== 'ESSAY' && ig.questionType !== 'SHORT_TEXT') {
          objectivePoints += ig.awardedPoints;
        }
      }
    }

    totalAwardedPoints = this.roundTo2Decimals(Math.min(grade.maxPossiblePoints, Math.max(0, totalAwardedPoints)));
    const maxPossible = grade.maxPossiblePoints > 0 ? grade.maxPossiblePoints : 1;
    const percentageScore = this.roundTo2Decimals((totalAwardedPoints / maxPossible) * 100);
    const passingPct = attempt.assessmentVersion.passingScore ?? 0;
    const isPassing = percentageScore >= passingPct;

    const newGradeRevision = grade.revision + 1;

    // Record ExamGradeRevision
    await tx.examGradeRevision.create({
      data: {
        examGradeId: grade.id,
        revision: newGradeRevision,
        actorId,
        eventType,
        previousTotalPoints: grade.totalAwardedPoints,
        newTotalPoints: totalAwardedPoints,
        previousPercentage: grade.percentageScore,
        newPercentage: percentageScore,
        previousPassingStatus: grade.isPassing,
        newPassingStatus: isPassing,
        reason: eventType === 'INITIAL_EVALUATION' ? 'Full human rubric grading completed' : 'Grade aggregate recomputed',
        idempotencyKey: idempotencyKey ?? null,
      },
    });

    // Determine release state according to feedback policy
    const policy = attempt.assessmentVersion.feedbackPolicy as ExamFeedbackPolicy;
    let isReleased = grade.isReleased;
    let releasedAt = grade.releasedAt;

    if (!isReleased) {
      if (policy === 'IMMEDIATE' || policy === 'ON_SUBMISSION') {
        isReleased = true;
        releasedAt = now;
      } else if (policy === 'DEFERRED') {
        if (attempt.deadlineAt && now >= attempt.deadlineAt) {
          isReleased = true;
          releasedAt = now;
        }
      }
      // MANUAL remains false until explicit creator release
    }

    const updatedGrade = await tx.examGrade.update({
      where: { id: grade.id },
      data: {
        objectivePoints: this.roundTo2Decimals(objectivePoints),
        pendingHumanPoints: this.roundTo2Decimals(pendingHumanPoints),
        totalAwardedPoints,
        percentageScore,
        isPassing,
        aggregationStatus: 'FULLY_GRADED',
        isReleased,
        releasedAt,
        revision: newGradeRevision,
      },
      include: {
        itemGrades: true,
      },
    });

    await tx.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'COMPLETED',
        completedAt: attempt.completedAt ?? now,
      },
    });

    return updatedGrade;
  }

  /**
   * Recomputes aggregate grade for an attempt following a correction or appeal.
   */
  private async recalculateAggregateGrade(
    tx: Prisma.TransactionClient,
    examGradeId: string,
    actorId: string,
    eventType: 'CORRECTION' | 'APPEAL_RESOLUTION',
    reason: string,
  ) {
    const grade = await tx.examGrade.findUniqueOrThrow({
      where: { id: examGradeId },
      include: {
        itemGrades: true,
        examAttempt: {
          include: {
            assessmentVersion: true,
          },
        },
      },
    });

    let totalAwardedPoints = 0;
    let objectivePoints = 0;

    for (const ig of grade.itemGrades) {
      totalAwardedPoints += ig.awardedPoints;
      if (ig.questionType !== 'ESSAY' && ig.questionType !== 'SHORT_TEXT') {
        objectivePoints += ig.awardedPoints;
      }
    }

    totalAwardedPoints = this.roundTo2Decimals(Math.min(grade.maxPossiblePoints, Math.max(0, totalAwardedPoints)));
    const maxPossible = grade.maxPossiblePoints > 0 ? grade.maxPossiblePoints : 1;
    const percentageScore = this.roundTo2Decimals((totalAwardedPoints / maxPossible) * 100);
    const passingPct = grade.examAttempt.assessmentVersion.passingScore ?? 0;
    const isPassing = percentageScore >= passingPct;

    const newRev = grade.revision + 1;

    await tx.examGradeRevision.create({
      data: {
        examGradeId: grade.id,
        revision: newRev,
        actorId,
        eventType,
        previousTotalPoints: grade.totalAwardedPoints,
        newTotalPoints: totalAwardedPoints,
        previousPercentage: grade.percentageScore,
        newPercentage: percentageScore,
        previousPassingStatus: grade.isPassing,
        newPassingStatus: isPassing,
        reason,
      },
    });

    return tx.examGrade.update({
      where: { id: examGradeId },
      data: {
        objectivePoints: this.roundTo2Decimals(objectivePoints),
        totalAwardedPoints,
        percentageScore,
        isPassing,
        revision: newRev,
      },
    });
  }

  /**
   * Validates criteria scores against published rubric and computes normalized points.
   */
  private calculateValidatedItemPoints(
    itemGrade: {
      maxPoints: number;
      questionType: string;
      questionVersion: { rubric: unknown };
    },
    dto: {
      criterionScores?: RubricCriterionEvaluationInput[];
      awardedPoints?: number;
    },
  ): number {
    if (itemGrade.questionType === 'ESSAY') {
      const rubric = (itemGrade.questionVersion.rubric ?? {}) as EssayRubric;
      const criteriaList = Array.isArray(rubric.criteria) ? rubric.criteria : [];

      if (criteriaList.length > 0) {
        if (!dto.criterionScores || dto.criterionScores.length === 0) {
          throw new BadRequestException('Rubric criterionScores must be provided to evaluate an ESSAY question.');
        }

        const seenIds = new Set<string>();
        const criterionMap = new Map<string, number>();
        let rubricRawMax = 0;

        for (const crit of criteriaList) {
          rubricRawMax += crit.maxPoints;
          criterionMap.set(crit.id, crit.maxPoints);
        }

        let rawAwarded = 0;

        for (const evalInput of dto.criterionScores) {
          const { criterionId, score } = evalInput;

          if (seenIds.has(criterionId)) {
            throw new BadRequestException(`Duplicate rubric criterion evaluation for '${criterionId}'.`);
          }
          seenIds.add(criterionId);

          const maxAllowed = criterionMap.get(criterionId);
          if (maxAllowed === undefined) {
            throw new BadRequestException(`Unknown rubric criterion '${criterionId}' not present in published rubric.`);
          }

          if (typeof score !== 'number' || !Number.isFinite(score) || Number.isNaN(score)) {
            throw new BadRequestException(`Criterion score for '${criterionId}' must be a finite number.`);
          }

          if (score < 0 || score > maxAllowed) {
            throw new BadRequestException(
              `Criterion score for '${criterionId}' must be between 0 and maximum allowable ${maxAllowed}. Received ${score}.`,
            );
          }

          rawAwarded += score;
        }

        // Verify that every criterion in the published rubric was scored
        for (const crit of criteriaList) {
          if (!seenIds.has(crit.id)) {
            throw new BadRequestException(`Missing evaluation for required rubric criterion '${crit.id}' (${crit.name}).`);
          }
        }

        // Normalization calculation
        if (rubricRawMax > 0) {
          const normalized = (rawAwarded / rubricRawMax) * itemGrade.maxPoints;
          return this.roundTo2Decimals(Math.max(0, Math.min(itemGrade.maxPoints, normalized)));
        }
        return 0;
      }
    }

    // Direct bounded points (e.g. SHORT_TEXT or unweighted essay)
    if (dto.awardedPoints !== undefined) {
      const pts = dto.awardedPoints;
      if (typeof pts !== 'number' || !Number.isFinite(pts) || Number.isNaN(pts)) {
        throw new BadRequestException('awardedPoints must be a finite number.');
      }
      if (pts < 0 || pts > itemGrade.maxPoints) {
        throw new BadRequestException(
          `awardedPoints must be between 0 and item maxPoints ${itemGrade.maxPoints}. Received ${pts}.`,
        );
      }
      return this.roundTo2Decimals(pts);
    }

    throw new BadRequestException('Either valid criterionScores or awardedPoints must be supplied.');
  }

  private verifyEvaluationIdempotencyMatch(
    existing: { newAwardedPoints: number; comments: string | null },
    dto: { awardedPoints?: number; feedback?: string },
  ): boolean {
    if (dto.awardedPoints !== undefined && existing.newAwardedPoints !== dto.awardedPoints) {
      return false;
    }
    if (dto.feedback !== undefined && existing.comments !== dto.feedback) {
      return false;
    }
    return true;
  }

  private mapItemGradeToDto(item: {
    id: string;
    itemRefId: string;
    questionVersionId: string;
    questionType: string;
    maxPoints: number;
    awardedPoints: number;
    isCorrect: boolean;
    isPendingHuman: boolean;
    evaluationDetails: unknown;
  }): ExamItemGradeDto {
    return {
      id: item.id,
      itemRefId: item.itemRefId,
      questionVersionId: item.questionVersionId,
      questionType: item.questionType as QuestionType,
      maxPoints: item.maxPoints,
      awardedPoints: item.awardedPoints,
      isCorrect: item.isCorrect,
      isPendingHuman: item.isPendingHuman,
      evaluationDetails: (item.evaluationDetails as Record<string, unknown> | null) ?? null,
    };
  }

  private mapAppealToDto(appeal: {
    id: string;
    examAttemptId: string;
    examItemGradeId: string | null;
    learnerId: string;
    status: string;
    reason: string;
    gradeRevisionAtSubmission: number;
    reviewerId: string | null;
    reviewerNotes: string | null;
    resolution: string | null;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ExamGradeAppealDto {
    return {
      id: appeal.id,
      examAttemptId: appeal.examAttemptId,
      examItemGradeId: appeal.examItemGradeId,
      learnerId: appeal.learnerId,
      status: appeal.status as ExamAppealStatus,
      reason: appeal.reason,
      gradeRevisionAtSubmission: appeal.gradeRevisionAtSubmission,
      reviewerId: appeal.reviewerId,
      reviewerNotes: appeal.reviewerNotes,
      resolution: appeal.resolution,
      resolvedAt: appeal.resolvedAt ? appeal.resolvedAt.toISOString() : null,
      createdAt: appeal.createdAt.toISOString(),
      updatedAt: appeal.updatedAt.toISOString(),
    };
  }
}
