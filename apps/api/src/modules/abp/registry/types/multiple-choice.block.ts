import {
  ABTypeManifest,
  BlockValidationResultDto,
  MultipleChoiceConfig,
  MultipleChoiceFeedbackPolicy,
} from '@ule/contracts';
import {
  EvaluatedOutcome,
  EvaluatorContext,
  IBlockTypeDefinition,
} from '../block-type.interface';

export class MultipleChoiceBlockDefinition implements IBlockTypeDefinition {
  readonly manifest: ABTypeManifest = {
    id: 'multiple-choice',
    version: '1.0.0',
    name: 'Multiple Choice Quiz',
    description:
      'Single-select question with server-side deterministic assessment, protected answer keys, and attempt support tracking.',
    capabilities: {
      renderable: true,
      submittable: true,
      evaluatable: true,
      completable: true,
      runtimeExecutionSupported: true,
    },
    defaultConfig: {
      question: 'What is the primary architectural style of ULE?',
      options: [
        { id: 'opt_1', text: 'Modular Monolith' },
        { id: 'opt_2', text: 'Microservices with Kafka' },
        { id: 'opt_3', text: 'Serverless Functions' },
      ],
      answerKey: {
        correctOptionId: 'opt_1',
        explanation: 'ULE is explicitly designed as a modular monolith in NestJS.',
      },
      feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
      allowHints: false,
    },
    schemaDescription: {
      type: 'object',
      required: ['question', 'options', 'answerKey'],
      properties: {
        question: { type: 'string', minLength: 3 },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 10,
          items: {
            type: 'object',
            required: ['id', 'text'],
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
              explanation: { type: 'string' },
            },
          },
        },
        answerKey: {
          type: 'object',
          required: ['correctOptionId'],
          properties: {
            correctOptionId: { type: 'string' },
            explanation: { type: 'string' },
          },
        },
        feedbackPolicy: {
          type: 'string',
          enum: ['IMMEDIATE_WITH_EXPLANATION', 'IMMEDIATE_CORRECTNESS_ONLY', 'DEFERRED'],
        },
        allowHints: { type: 'boolean' },
        hintText: { type: 'string' },
      },
    },
  };

  validateConfig(
    config: unknown,
    blockId = 'mcq-block',
    title = 'Multiple Choice Block',
  ): BlockValidationResultDto {
    const errors: string[] = [];

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return {
        blockId,
        title,
        blockTypeId: this.manifest.id,
        valid: false,
        errors: ['Multiple choice configuration must be a non-null object.'],
      };
    }

    const cfg = config as Partial<MultipleChoiceConfig>;

    // 1. Question validation
    if (typeof cfg.question !== 'string' || cfg.question.trim().length < 3) {
      errors.push("Multiple choice question must be at least 3 characters long.");
    }

    // 2. Options validation
    if (!Array.isArray(cfg.options) || cfg.options.length < 2) {
      errors.push("Multiple choice question requires at least 2 options.");
    } else if (cfg.options.length > 10) {
      errors.push("Multiple choice question allows at most 10 options.");
    } else {
      const optionIds = new Set<string>();
      cfg.options.forEach((opt, idx) => {
        if (!opt || typeof opt !== 'object') {
          errors.push(`Option at index ${idx} is invalid.`);
          return;
        }
        if (typeof opt.id !== 'string' || opt.id.trim().length === 0) {
          errors.push(`Option at index ${idx} must have a non-empty 'id'.`);
        } else if (optionIds.has(opt.id)) {
          errors.push(`Duplicate option id detected: '${opt.id}'. All option IDs must be unique.`);
        } else {
          optionIds.add(opt.id);
        }

        if (typeof opt.text !== 'string' || opt.text.trim().length === 0) {
          errors.push(`Option at index ${idx} must have non-empty 'text'.`);
        }
      });

      // 3. AnswerKey validation
      if (!cfg.answerKey || typeof cfg.answerKey !== 'object') {
        errors.push("Multiple choice question requires an 'answerKey' object.");
      } else {
        const correctId = cfg.answerKey.correctOptionId;
        if (typeof correctId !== 'string' || correctId.trim().length === 0) {
          errors.push("answerKey requires a non-empty 'correctOptionId'.");
        } else if (!optionIds.has(correctId)) {
          errors.push(
            `answerKey.correctOptionId '${correctId}' does not match any valid option in the options list.`,
          );
        }
      }
    }

    // 4. Feedback Policy
    if (cfg.feedbackPolicy !== undefined) {
      const validPolicies: MultipleChoiceFeedbackPolicy[] = [
        'IMMEDIATE_WITH_EXPLANATION',
        'IMMEDIATE_CORRECTNESS_ONLY',
        'DEFERRED',
      ];
      if (!validPolicies.includes(cfg.feedbackPolicy as MultipleChoiceFeedbackPolicy)) {
        errors.push(
          `Invalid feedbackPolicy '${cfg.feedbackPolicy}'. Must be one of: ${validPolicies.join(', ')}.`,
        );
      }
    }

    // 5. Hints
    if (cfg.allowHints === true) {
      if (typeof cfg.hintText !== 'string' || cfg.hintText.trim().length === 0) {
        errors.push("When 'allowHints' is true, a non-empty 'hintText' must be provided.");
      }
    }

    return {
      blockId,
      title,
      blockTypeId: this.manifest.id,
      valid: errors.length === 0,
      errors,
    };
  }

  sanitizeForLearner(config: Record<string, unknown>): Record<string, unknown> {
    const options = Array.isArray(config.options) ? config.options : [];

    // Strictly strip answerKey, correctOptionId, individual option explanations, and hintText
    return {
      question: typeof config.question === 'string' ? config.question : '',
      options: options.map((opt: Record<string, unknown>) => ({
        id: String(opt.id),
        text: String(opt.text ?? ''),
      })),
      allowHints: Boolean(config.allowHints),
      feedbackPolicy:
        typeof config.feedbackPolicy === 'string'
          ? config.feedbackPolicy
          : 'IMMEDIATE_WITH_EXPLANATION',
    };
  }

  evaluateResponse(
    config: Record<string, unknown>,
    context: EvaluatorContext,
  ): EvaluatedOutcome {
    const submission = context.submittedResponse as {
      selectedOptionId?: unknown;
    };

    const selectedOptionId =
      typeof submission?.selectedOptionId === 'string'
        ? submission.selectedOptionId.trim()
        : '';

    const answerKey = (config.answerKey ?? {}) as {
      correctOptionId?: string;
      explanation?: string;
    };

    const options = Array.isArray(config.options)
      ? (config.options as Array<{ id: string; text: string; explanation?: string }>)
      : [];

    const selectedOption = options.find((opt) => opt.id === selectedOptionId);
    const isCorrect = Boolean(
      answerKey.correctOptionId &&
      selectedOptionId &&
      selectedOptionId === answerKey.correctOptionId,
    );

    const feedbackPolicy: MultipleChoiceFeedbackPolicy =
      (config.feedbackPolicy as MultipleChoiceFeedbackPolicy) ||
      'IMMEDIATE_WITH_EXPLANATION';

    let feedback: Record<string, unknown> | null = null;

    if (feedbackPolicy === 'IMMEDIATE_WITH_EXPLANATION') {
      feedback = {
        isCorrect,
        explanation: answerKey.explanation ?? null,
        selectedOptionText: selectedOption?.text ?? null,
        optionExplanation: selectedOption?.explanation ?? null,
      };
    } else if (feedbackPolicy === 'IMMEDIATE_CORRECTNESS_ONLY') {
      feedback = {
        isCorrect,
      };
    } else {
      feedback = {
        deferred: true,
        isCorrect,
        explanation: answerKey.explanation ?? null,
        selectedOptionText: selectedOption?.text ?? null,
        optionExplanation: selectedOption?.explanation ?? null,
      };
    }

    return {
      status: 'EVALUATED',
      isCorrect,
      score: isCorrect ? 1.0 : 0.0,
      feedback,
      evaluatorId: 'ule-mcq-deterministic-evaluator-v1',
    };
  }
}
