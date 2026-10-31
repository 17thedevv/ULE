import { Injectable, Logger } from '@nestjs/common';
import { QuestionType } from '@ule/contracts';

export interface EvaluatedItemResult {
  itemRefId: string;
  questionVersionId: string;
  questionType: QuestionType;
  maxPoints: number;
  awardedPoints: number;
  isCorrect: boolean;
  isPendingHuman: boolean;
  evaluationDetails: Record<string, unknown>;
}

export interface ExamEvaluationSummary {
  objectivePoints: number;
  pendingHumanPoints: number;
  totalAwardedPoints: number;
  maxPossiblePoints: number;
  percentageScore: number;
  isPassing: boolean;
  aggregationStatus: 'FULLY_GRADED' | 'PARTIAL_PENDING_HUMAN';
  itemGrades: EvaluatedItemResult[];
}

export interface ExamSnapshotItem {
  id: string; // itemRefId
  questionVersionId: string;
  type: QuestionType;
  title: string;
  prompt: string;
  content: Record<string, unknown>;
  answerKey?: Record<string, unknown> | null;
  rubric?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
  points: number;
}

@Injectable()
export class DeterministicAutoGraderService {
  private readonly logger = new Logger(DeterministicAutoGraderService.name);

  /**
   * Orchestrates server-side evaluation of all examination items against submitted responses.
   */
  evaluateAttempt(
    snapshotItems: ExamSnapshotItem[],
    responsesByItemRefId: Map<string, Record<string, unknown>>,
    passingScore?: number | null,
  ): ExamEvaluationSummary {
    let objectivePoints = 0;
    let pendingHumanPoints = 0;
    let maxPossiblePoints = 0;
    const itemGrades: EvaluatedItemResult[] = [];

    for (const item of snapshotItems) {
      const maxPts = item.points > 0 ? item.points : 0;
      maxPossiblePoints += maxPts;

      const responsePayload = responsesByItemRefId.get(item.id) ?? null;
      const itemResult = this.evaluateSingleItem(item, responsePayload);

      if (itemResult.isPendingHuman) {
        pendingHumanPoints += maxPts;
      } else {
        objectivePoints += itemResult.awardedPoints;
      }

      itemGrades.push(itemResult);
    }

    const totalAwardedPoints = Number(objectivePoints.toFixed(2));
    const normalizedMax = Number(maxPossiblePoints.toFixed(2));
    const percentageScore =
      normalizedMax > 0
        ? Number(((totalAwardedPoints / normalizedMax) * 100).toFixed(2))
        : 0;

    const isPassing =
      passingScore != null ? percentageScore >= passingScore : true;

    const aggregationStatus =
      pendingHumanPoints > 0 ? 'PARTIAL_PENDING_HUMAN' : 'FULLY_GRADED';

    return {
      objectivePoints: totalAwardedPoints,
      pendingHumanPoints: Number(pendingHumanPoints.toFixed(2)),
      totalAwardedPoints,
      maxPossiblePoints: normalizedMax,
      percentageScore,
      isPassing,
      aggregationStatus,
      itemGrades,
    };
  }

  /**
   * Evaluates an individual question item against trusted answer key and learner submission.
   */
  private evaluateSingleItem(
    item: ExamSnapshotItem,
    responsePayload: Record<string, unknown> | null,
  ): EvaluatedItemResult {
    const maxPoints = item.points > 0 ? item.points : 0;

    // 1. Missing or unattempted response
    if (!responsePayload) {
      const isSubjective = item.type === 'ESSAY' || item.type === 'SHORT_TEXT';
      return {
        itemRefId: item.id,
        questionVersionId: item.questionVersionId,
        questionType: item.type,
        maxPoints,
        awardedPoints: 0,
        isCorrect: false,
        isPendingHuman: isSubjective,
        evaluationDetails: {
          status: 'UNATTEMPTED',
          isCorrect: false,
        },
      };
    }

    // 2. Subjective open-response question types (deferred to human evaluation)
    if (item.type === 'ESSAY' || item.type === 'SHORT_TEXT') {
      const rubric = (item.rubric ?? {}) as Record<string, unknown>;
      const criteriaList = Array.isArray(rubric.criteria) ? rubric.criteria : [];
      return {
        itemRefId: item.id,
        questionVersionId: item.questionVersionId,
        questionType: item.type,
        maxPoints,
        awardedPoints: 0,
        isCorrect: false,
        isPendingHuman: true,
        evaluationDetails: {
          status: 'PENDING_HUMAN_EVALUATION',
          submittedPayload: responsePayload,
          rubricCriteriaCount: criteriaList.length,
        },
      };
    }

    // 3. Auto-Evaluatable objective question types
    const answerKey = (item.answerKey ?? {}) as Record<string, unknown>;

    switch (item.type) {
      case 'SINGLE_CHOICE': {
        const correctOpt = String(answerKey.correctOptionId ?? '');
        const selectedOpt = String(responsePayload.selectedOptionId ?? '');
        const isCorrect = correctOpt.length > 0 && selectedOpt === correctOpt;
        return {
          itemRefId: item.id,
          questionVersionId: item.questionVersionId,
          questionType: item.type,
          maxPoints,
          awardedPoints: isCorrect ? maxPoints : 0,
          isCorrect,
          isPendingHuman: false,
          evaluationDetails: {
            selectedOptionId: selectedOpt,
            isCorrect,
          },
        };
      }

      case 'MULTIPLE_CHOICE': {
        const correctIds = Array.isArray(answerKey.correctOptionIds)
          ? (answerKey.correctOptionIds as unknown[]).map(String)
          : [];
        const rawSubmitted = responsePayload.selectedOptionIds;
        const submittedIds = Array.isArray(rawSubmitted)
          ? (rawSubmitted as unknown[]).map(String)
          : [];

        const correctSet = new Set(correctIds);
        const submittedSet = new Set(submittedIds);

        // Exact match set comparison: must contain all correct IDs and zero extra IDs
        const isCorrect =
          correctSet.size > 0 &&
          correctSet.size === submittedSet.size &&
          [...correctSet].every((id) => submittedSet.has(id));

        return {
          itemRefId: item.id,
          questionVersionId: item.questionVersionId,
          questionType: item.type,
          maxPoints,
          awardedPoints: isCorrect ? maxPoints : 0,
          isCorrect,
          isPendingHuman: false,
          evaluationDetails: {
            submittedCount: submittedSet.size,
            isCorrect,
          },
        };
      }

      case 'TRUE_FALSE': {
        const expected = answerKey.correctValue;
        const submitted = responsePayload.selectedBoolean;
        const isCorrect = typeof expected === 'boolean' && submitted === expected;
        return {
          itemRefId: item.id,
          questionVersionId: item.questionVersionId,
          questionType: item.type,
          maxPoints,
          awardedPoints: isCorrect ? maxPoints : 0,
          isCorrect,
          isPendingHuman: false,
          evaluationDetails: {
            isCorrect,
          },
        };
      }

      case 'CLOZE': {
        const blanksKey = answerKey.blanks as Record<string, string[]> | undefined;
        const submittedBlanks = responsePayload.blanks as Record<string, string> | undefined;

        const rawTargetBlanks = item.content.targetBlanks;
        const targetBlanks = Array.isArray(rawTargetBlanks)
          ? (rawTargetBlanks as Array<{ blankKey: string }>)
          : [];

        if (targetBlanks.length === 0 || !blanksKey || !submittedBlanks) {
          return {
            itemRefId: item.id,
            questionVersionId: item.questionVersionId,
            questionType: item.type,
            maxPoints,
            awardedPoints: 0,
            isCorrect: false,
            isPendingHuman: false,
            evaluationDetails: { isCorrect: false, error: 'Malformed Cloze structure' },
          };
        }

        let allBlanksCorrect = true;
        const blankBreakdown: Record<string, boolean> = {};

        for (const target of targetBlanks) {
          const key = target.blankKey;
          const submittedVal = String(submittedBlanks[key] ?? '')
            .normalize('NFKC')
            .trim()
            .toLowerCase();

          const acceptedVariants = Array.isArray(blanksKey[key]) ? blanksKey[key] : [];
          const normalizedVariants = acceptedVariants.map((v) =>
            String(v).normalize('NFKC').trim().toLowerCase(),
          );

          const matched =
            submittedVal.length > 0 &&
            normalizedVariants.some((variant) => variant === submittedVal);

          blankBreakdown[key] = matched;
          if (!matched) {
            allBlanksCorrect = false;
          }
        }

        return {
          itemRefId: item.id,
          questionVersionId: item.questionVersionId,
          questionType: item.type,
          maxPoints,
          awardedPoints: allBlanksCorrect ? maxPoints : 0,
          isCorrect: allBlanksCorrect,
          isPendingHuman: false,
          evaluationDetails: {
            allBlanksCorrect,
            blankBreakdown,
          },
        };
      }

      case 'NUMERIC': {
        const correctVal = Number(answerKey.correctValue);
        const tolerance = Math.max(0, Number(answerKey.tolerance ?? 0));
        const toleranceType = String(answerKey.toleranceType ?? 'ABSOLUTE');
        const submittedRaw = responsePayload.submittedValue;
        const submittedVal = Number(submittedRaw);

        if (!Number.isFinite(correctVal) || !Number.isFinite(submittedVal)) {
          return {
            itemRefId: item.id,
            questionVersionId: item.questionVersionId,
            questionType: item.type,
            maxPoints,
            awardedPoints: 0,
            isCorrect: false,
            isPendingHuman: false,
            evaluationDetails: { isCorrect: false, error: 'Non-finite numeric value' },
          };
        }

        let isCorrect = false;
        const diff = Math.abs(submittedVal - correctVal);

        if (toleranceType === 'PERCENT') {
          const base = Math.abs(correctVal);
          const allowedDiff = base > 0 ? (base * tolerance) / 100 : tolerance;
          isCorrect = diff <= allowedDiff + 1e-9;
        } else {
          // ABSOLUTE
          isCorrect = diff <= tolerance + 1e-9;
        }

        return {
          itemRefId: item.id,
          questionVersionId: item.questionVersionId,
          questionType: item.type,
          maxPoints,
          awardedPoints: isCorrect ? maxPoints : 0,
          isCorrect,
          isPendingHuman: false,
          evaluationDetails: {
            isCorrect,
            submittedValue: submittedVal,
          },
        };
      }

      case 'MATCHING': {
        const answerPairs = (answerKey.pairs ?? {}) as Record<string, string>;
        const submittedPairs = (responsePayload.pairs ?? {}) as Record<string, string>;
        const rawPremises = item.content.premises;
        const premises = Array.isArray(rawPremises)
          ? (rawPremises as Array<{ id: string }>)
          : [];

        if (premises.length === 0) {
          return {
            itemRefId: item.id,
            questionVersionId: item.questionVersionId,
            questionType: item.type,
            maxPoints,
            awardedPoints: 0,
            isCorrect: false,
            isPendingHuman: false,
            evaluationDetails: { isCorrect: false, error: 'Empty matching premises' },
          };
        }

        let allPairsCorrect = true;
        for (const p of premises) {
          const expectedTarget = answerPairs[p.id];
          const submittedTarget = submittedPairs[p.id];
          if (!submittedTarget || submittedTarget !== expectedTarget) {
            allPairsCorrect = false;
            break;
          }
        }

        return {
          itemRefId: item.id,
          questionVersionId: item.questionVersionId,
          questionType: item.type,
          maxPoints,
          awardedPoints: allPairsCorrect ? maxPoints : 0,
          isCorrect: allPairsCorrect,
          isPendingHuman: false,
          evaluationDetails: {
            isCorrect: allPairsCorrect,
          },
        };
      }

      case 'ORDERING': {
        const correctSeq = Array.isArray(answerKey.correctSequence)
          ? (answerKey.correctSequence as unknown[]).map(String)
          : [];
        const rawSeq = responsePayload.sequence;
        const submittedSeq = Array.isArray(rawSeq) ? (rawSeq as unknown[]).map(String) : [];

        const isCorrect =
          correctSeq.length > 0 &&
          correctSeq.length === submittedSeq.length &&
          correctSeq.every((id, idx) => id === submittedSeq[idx]);

        return {
          itemRefId: item.id,
          questionVersionId: item.questionVersionId,
          questionType: item.type,
          maxPoints,
          awardedPoints: isCorrect ? maxPoints : 0,
          isCorrect,
          isPendingHuman: false,
          evaluationDetails: {
            isCorrect,
          },
        };
      }

      default: {
        return {
          itemRefId: item.id,
          questionVersionId: item.questionVersionId,
          questionType: item.type,
          maxPoints,
          awardedPoints: 0,
          isCorrect: false,
          isPendingHuman: false,
          evaluationDetails: { isCorrect: false, error: `Unsupported question type: ${item.type}` },
        };
      }
    }
  }
}
