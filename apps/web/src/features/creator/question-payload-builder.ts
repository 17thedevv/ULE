import { QuestionType, EssayRubric } from '@ule/contracts';

export interface QuestionBuilderState {
  title: string;
  prompt: string;
  type: QuestionType;
  points: number;
  tags: string[];

  // Interactive configurations
  singleChoiceOption?: string;
  multiChoiceOptions?: string[];
  optionsList?: Array<{ id: string; text: string }>;

  trueFalseValue?: boolean;

  clozeTemplate?: string;
  clozeTargetBlanks?: Array<{ blankKey: string; hint?: string }>;
  clozeAcceptedVariants?: Record<string, string[]>;

  shortTextAnswers?: string[];

  numericValue?: number;
  numericTolerance?: number;
  numericUnit?: string;

  essayCriterionName?: string;
  essayCriterionDescription?: string;
  essayMinWords?: number;
  essayMaxWords?: number;

  matchingPairs?: Array<{
    premiseId: string;
    premiseText: string;
    targetId: string;
    targetText: string;
  }>;

  orderingItems?: Array<{ id: string; text: string }>;
}

export interface BuiltQuestionPayload {
  title: string;
  prompt: string;
  type: QuestionType;
  defaultPoints: number;
  tags: string[];
  content: Record<string, unknown>;
  answerKey?: Record<string, unknown>;
  rubric?: Record<string, unknown>;
}

export function buildQuestionPayload(state: QuestionBuilderState): BuiltQuestionPayload {
  const points = Math.max(1, state.points || 1);
  let content: Record<string, unknown> = {};
  let answerKey: Record<string, unknown> | undefined;
  let rubric: EssayRubric | undefined;

  switch (state.type) {
    case 'MULTIPLE_CHOICE': {
      const options = state.optionsList && state.optionsList.length >= 2
        ? state.optionsList
        : [
            { id: 'opt_1', text: 'Option A: Authoritative server state' },
            { id: 'opt_2', text: 'Option B: Client-inferred state' },
          ];
      const correctOptionIds = state.multiChoiceOptions && state.multiChoiceOptions.length > 0
        ? state.multiChoiceOptions
        : [options[0].id];

      content = { options };
      answerKey = { correctOptionIds };
      break;
    }

    case 'SINGLE_CHOICE': {
      const options = state.optionsList && state.optionsList.length >= 2
        ? state.optionsList
        : [
            { id: 'opt_1', text: 'Option A: Authoritative server state' },
            { id: 'opt_2', text: 'Option B: Client-inferred state' },
          ];
      const correctOptionId = state.singleChoiceOption && options.some((o) => o.id === state.singleChoiceOption)
        ? state.singleChoiceOption
        : options[0].id;

      content = { options };
      answerKey = { correctOptionId };
      break;
    }

    case 'TRUE_FALSE': {
      content = {};
      answerKey = { correctValue: state.trueFalseValue ?? true };
      break;
    }

    case 'CLOZE': {
      const templateText = state.clozeTemplate?.trim() ||
        'ULE backend uses {{blank_1}} as the primary server framework.';
      const targetBlanks = state.clozeTargetBlanks && state.clozeTargetBlanks.length > 0
        ? state.clozeTargetBlanks
        : [{ blankKey: 'blank_1', hint: 'Framework name' }];
      const blanks = state.clozeAcceptedVariants && Object.keys(state.clozeAcceptedVariants).length > 0
        ? state.clozeAcceptedVariants
        : { blank_1: ['NestJS', 'Nest.js'] };

      content = { templateText, targetBlanks };
      answerKey = { blanks };
      break;
    }

    case 'SHORT_TEXT': {
      content = { placeholder: 'Enter single word or term' };
      answerKey = {
        acceptableAnswers: state.shortTextAnswers && state.shortTextAnswers.length > 0
          ? state.shortTextAnswers
          : ['PostgreSQL', 'Postgres'],
      };
      break;
    }

    case 'NUMERIC': {
      content = { unit: state.numericUnit || 'seconds' };
      answerKey = {
        correctValue: state.numericValue ?? 15,
        tolerance: state.numericTolerance ?? 0,
        toleranceType: 'ABSOLUTE',
      };
      break;
    }

    case 'ESSAY': {
      content = {
        minWords: state.essayMinWords ?? 10,
        maxWords: state.essayMaxWords ?? 500,
      };
      // Explicit invariant: automated answerKey is strictly prohibited for ESSAY
      answerKey = undefined;
      rubric = {
        criteria: [
          {
            id: 'crit-1',
            name: state.essayCriterionName?.trim() || 'Architectural Soundness',
            description: state.essayCriterionDescription?.trim() ||
              'Evaluation of system architecture and modular boundaries',
            maxPoints: points,
            levels: [
              {
                score: points,
                label: 'Exemplary',
                description: 'Clearly decouples services with versioned contracts',
              },
            ],
          },
        ],
      };
      break;
    }

    case 'MATCHING': {
      const pairs = state.matchingPairs && state.matchingPairs.length >= 2
        ? state.matchingPairs
        : [
            { premiseId: 'p_1', premiseText: 'PostgreSQL', targetId: 't_1', targetText: 'Authoritative database' },
            { premiseId: 'p_2', premiseText: 'React + Vite', targetId: 't_2', targetText: 'Single Page Application' },
          ];

      content = {
        premises: pairs.map((p) => ({ id: p.premiseId, text: p.premiseText })),
        targets: pairs.map((p) => ({ id: p.targetId, text: p.targetText })),
      };

      // Backend PR #8 QuestionTypesRegistry.createMatchingDefinition() requires 'pairs'
      const pairsMap: Record<string, string> = {};
      for (const p of pairs) {
        pairsMap[p.premiseId] = p.targetId;
      }
      answerKey = { pairs: pairsMap };
      break;
    }

    case 'ORDERING': {
      const items = state.orderingItems && state.orderingItems.length >= 2
        ? state.orderingItems
        : [
            { id: 'o_1', text: 'Define API contract' },
            { id: 'o_2', text: 'Implement backend service' },
            { id: 'o_3', text: 'Integrate frontend client' },
          ];

      content = { items };
      // Backend PR #8 QuestionTypesRegistry.createOrderingDefinition() requires 'correctSequence'
      answerKey = {
        correctSequence: items.map((i) => i.id),
      };
      break;
    }
  }

  return {
    title: state.title.trim(),
    prompt: state.prompt.trim(),
    type: state.type,
    defaultPoints: points,
    tags: state.tags,
    content,
    answerKey,
    rubric: rubric as unknown as Record<string, unknown> | undefined,
  };
}
