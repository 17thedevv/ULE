import {
  ABTypeManifest,
  BlockValidationResultDto,
  ClozeBlank,
  ClozeConfig,
  ClozeFeedbackPolicy,
  normalizeClozeToken,
} from '@ule/contracts';
import {
  EvaluatedOutcome,
  EvaluatorContext,
  IBlockTypeDefinition,
} from '../block-type.interface';

export class ClozeBlockDefinition implements IBlockTypeDefinition {
  readonly manifest: ABTypeManifest = {
    id: 'cloze',
    version: '1.0.0',
    name: 'Cloze Sentence & Passage Completion',
    description:
      'Fill-in-the-blank text completion with server-side deterministic assessment, protected answer keys, Unicode NFKC token normalization, and attempt support tracking.',
    capabilities: {
      renderable: true,
      submittable: true,
      evaluatable: true,
      completable: true,
      runtimeExecutionSupported: true,
    },
    defaultConfig: {
      prompt: 'Complete the sentence by filling in the missing grammatical term.',
      templateText: 'The scientist conducted an {{blank_1}} to test the hypothesis.',
      targetBlanks: [
        {
          id: 'b_1',
          blankKey: 'blank_1',
          hintText: 'A scientific procedure to make a discovery.',
        },
      ],
      answerKey: {
        blanks: {
          blank_1: ['experiment', 'investigation'],
        },
        explanation:
          "'Experiment' or 'investigation' fits the context of testing a scientific hypothesis.",
      },
      feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
      allowHints: false,
    },
    schemaDescription: {
      type: 'object',
      required: ['prompt', 'templateText', 'targetBlanks', 'answerKey'],
      properties: {
        prompt: { type: 'string', minLength: 3 },
        templateText: { type: 'string', minLength: 5 },
        targetBlanks: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: {
            type: 'object',
            required: ['id', 'blankKey'],
            properties: {
              id: { type: 'string' },
              blankKey: { type: 'string' },
              hintText: { type: 'string' },
            },
          },
        },
        answerKey: {
          type: 'object',
          required: ['blanks'],
          properties: {
            blanks: {
              type: 'object',
              additionalProperties: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            explanation: { type: 'string' },
          },
        },
        feedbackPolicy: {
          type: 'string',
          enum: [
            'IMMEDIATE_WITH_EXPLANATION',
            'IMMEDIATE_CORRECTNESS_ONLY',
            'DEFERRED',
          ],
        },
        allowHints: { type: 'boolean' },
      },
    },
  };

  validateConfig(
    config: unknown,
    blockId = 'cloze-block',
    title = 'Cloze Exercise',
  ): BlockValidationResultDto {
    const errors: string[] = [];

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return {
        blockId,
        title,
        blockTypeId: this.manifest.id,
        valid: false,
        errors: ['Cloze configuration must be a non-null object.'],
      };
    }

    const cfg = config as Partial<ClozeConfig>;

    if (typeof cfg.prompt !== 'string' || cfg.prompt.trim().length < 3) {
      errors.push('Cloze block prompt must be a string of at least 3 characters.');
    }

    if (
      typeof cfg.templateText !== 'string' ||
      cfg.templateText.trim().length < 5
    ) {
      errors.push(
        'Cloze block templateText must be a string of at least 5 characters.',
      );
    }

    if (!Array.isArray(cfg.targetBlanks) || cfg.targetBlanks.length === 0) {
      errors.push('Cloze block targetBlanks must be a non-empty array.');
    } else {
      const seenKeys = new Set<string>();
      for (let i = 0; i < cfg.targetBlanks.length; i++) {
        const blank = cfg.targetBlanks[i];
        if (!blank || typeof blank !== 'object') {
          errors.push(`Target blank at index ${i} must be an object.`);
          continue;
        }
        if (typeof blank.id !== 'string' || blank.id.trim().length === 0) {
          errors.push(`Target blank at index ${i} must have a non-empty 'id'.`);
        }
        if (
          typeof blank.blankKey !== 'string' ||
          blank.blankKey.trim().length === 0
        ) {
          errors.push(
            `Target blank at index ${i} must have a non-empty 'blankKey'.`,
          );
        } else {
          if (seenKeys.has(blank.blankKey)) {
            errors.push(`Duplicate blankKey '${blank.blankKey}' found in targetBlanks.`);
          }
          seenKeys.add(blank.blankKey);

          // Verify templateText contains placeholder {{blankKey}}
          if (
            typeof cfg.templateText === 'string' &&
            !cfg.templateText.includes(`{{${blank.blankKey}}}`)
          ) {
            errors.push(
              `templateText must contain placeholder '{{${blank.blankKey}}}' for defined blank.`,
            );
          }
        }
      }
    }

    if (!cfg.answerKey || typeof cfg.answerKey !== 'object') {
      errors.push('Cloze block answerKey must be an object.');
    } else {
      const blanks = cfg.answerKey.blanks;
      if (!blanks || typeof blanks !== 'object') {
        errors.push("Cloze block answerKey must define a 'blanks' map.");
      } else {
        if (Array.isArray(cfg.targetBlanks)) {
          for (const blank of cfg.targetBlanks) {
            if (blank && blank.blankKey) {
              const variants = (blanks as Record<string, unknown>)[blank.blankKey];
              if (!Array.isArray(variants) || variants.length === 0) {
                errors.push(
                  `answerKey.blanks must provide at least one accepted string variant for '${blank.blankKey}'.`,
                );
              }
            }
          }
        }
      }
    }

    if (cfg.feedbackPolicy !== undefined) {
      const validPolicies: ClozeFeedbackPolicy[] = [
        'IMMEDIATE_WITH_EXPLANATION',
        'IMMEDIATE_CORRECTNESS_ONLY',
        'DEFERRED',
      ];
      if (!validPolicies.includes(cfg.feedbackPolicy as ClozeFeedbackPolicy)) {
        errors.push(
          `Invalid feedbackPolicy '${cfg.feedbackPolicy}'. Must be one of: ${validPolicies.join(', ')}.`,
        );
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

  sanitizeForLearner(
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const targetBlanks = Array.isArray(config.targetBlanks)
      ? (config.targetBlanks as ClozeBlank[]).map((b) => ({
          id: b.id,
          blankKey: b.blankKey,
        }))
      : [];

    return {
      prompt: typeof config.prompt === 'string' ? config.prompt : '',
      templateText:
        typeof config.templateText === 'string' ? config.templateText : '',
      targetBlanks,
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
  ): Promise<EvaluatedOutcome> | EvaluatedOutcome {
    const submission = (context.submittedResponse as Record<string, unknown>) ?? {};
    return this.evaluate(submission, config);
  }

  async evaluate(
    submission: Record<string, unknown>,
    config: Record<string, unknown>,
    _context?: EvaluatorContext,
  ): Promise<EvaluatedOutcome> {
    void _context;
    // Read submitted answers: either direct submission.answers or nested submission.response.answers
    const answersRaw =
      (submission.answers as Record<string, string> | undefined) ??
      ((submission.response as Record<string, unknown> | undefined)?.answers as
        | Record<string, string>
        | undefined) ??
      {};

    const targetBlanks = Array.isArray(config.targetBlanks)
      ? (config.targetBlanks as ClozeBlank[])
      : [];

    const answerKey = (config.answerKey ?? {}) as {
      blanks?: Record<string, string[]>;
      explanation?: string;
    };
    const keyBlanks = answerKey.blanks ?? {};

    const blankResults: Record<
      string,
      { isCorrect: boolean; submitted: string; expectedVariants?: string[] }
    > = {};

    let correctCount = 0;

    for (const blank of targetBlanks) {
      const submittedRaw = answersRaw[blank.blankKey] ?? '';
      const normalizedSubmitted = normalizeClozeToken(submittedRaw);

      const acceptedVariants = keyBlanks[blank.blankKey] ?? [];
      const normalizedVariants = acceptedVariants.map((v) =>
        normalizeClozeToken(v),
      );

      const isBlankCorrect =
        normalizedSubmitted.length > 0 &&
        normalizedVariants.includes(normalizedSubmitted);

      if (isBlankCorrect) {
        correctCount++;
      }

      blankResults[blank.blankKey] = {
        isCorrect: isBlankCorrect,
        submitted: submittedRaw,
      };
    }

    const totalBlanks = targetBlanks.length;
    const isCorrect = totalBlanks > 0 && correctCount === totalBlanks;
    const score = totalBlanks > 0 ? correctCount / totalBlanks : 0.0;

    const feedbackPolicy: ClozeFeedbackPolicy =
      (config.feedbackPolicy as ClozeFeedbackPolicy) ||
      'IMMEDIATE_WITH_EXPLANATION';

    let feedback: Record<string, unknown> | null = null;

    if (feedbackPolicy === 'IMMEDIATE_WITH_EXPLANATION') {
      feedback = {
        isCorrect,
        score,
        blanks: blankResults,
        explanation: answerKey.explanation ?? null,
      };
    } else if (feedbackPolicy === 'IMMEDIATE_CORRECTNESS_ONLY') {
      feedback = {
        isCorrect,
        score,
      };
    } else {
      feedback = {
        deferred: true,
        isCorrect,
        score,
        blanks: blankResults,
        explanation: answerKey.explanation ?? null,
      };
    }

    return {
      status: 'EVALUATED',
      isCorrect,
      score,
      feedback,
      evaluatorId: 'ule-cloze-deterministic-evaluator-v1',
    };
  }
}
