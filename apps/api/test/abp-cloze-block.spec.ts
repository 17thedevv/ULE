/* eslint-disable @typescript-eslint/no-explicit-any */
import { BlockTypeRegistry } from '../src/modules/abp/registry/block-type.registry';
import { ClozeBlockDefinition } from '../src/modules/abp/registry/types/cloze.block';
import { normalizeClozeToken } from '@ule/contracts';

describe('ABP Cloze Block Definition & Evaluator Unit Tests', () => {
  let cloze: ClozeBlockDefinition;
  let registry: BlockTypeRegistry;

  beforeEach(() => {
    cloze = new ClozeBlockDefinition();
    registry = new BlockTypeRegistry();
  });

  describe('Manifest & Discovery', () => {
    it('defines cloze manifest with full evaluatable capabilities', () => {
      expect(cloze.manifest.id).toBe('cloze');
      expect(cloze.manifest.version).toBe('1.0.0');
      expect(cloze.manifest.capabilities.renderable).toBe(true);
      expect(cloze.manifest.capabilities.submittable).toBe(true);
      expect(cloze.manifest.capabilities.evaluatable).toBe(true);
      expect(cloze.manifest.capabilities.completable).toBe(true);
      expect(cloze.manifest.capabilities.runtimeExecutionSupported).toBe(true);
    });

    it('can be retrieved from BlockTypeRegistry', () => {
      const def = registry.getDefinition('cloze');
      expect(def).toBeInstanceOf(ClozeBlockDefinition);
    });
  });

  describe('Configuration Validation', () => {
    it('validates a correct single-blank configuration', () => {
      const result = cloze.validateConfig({
        prompt: 'Fill in the blank with the appropriate past tense verb.',
        templateText: 'Yesterday, the team {{blank_1}} the final release.',
        targetBlanks: [{ id: 'b_1', blankKey: 'blank_1', hintText: 'To complete or accomplish' }],
        answerKey: {
          blanks: {
            blank_1: ['deployed', 'completed', 'shipped'],
          },
          explanation: "'deployed', 'completed', or 'shipped' are appropriate transitive verbs.",
        },
        feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
        allowHints: true,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects configuration if templateText does not contain {{blankKey}}', () => {
      const result = cloze.validateConfig({
        prompt: 'Fill in the blank.',
        templateText: 'This sentence has no placeholder.',
        targetBlanks: [{ id: 'b_1', blankKey: 'blank_1' }],
        answerKey: {
          blanks: { blank_1: ['word'] },
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "templateText must contain placeholder '{{blank_1}}' for defined blank.",
      );
    });

    it('rejects duplicate blankKeys', () => {
      const result = cloze.validateConfig({
        prompt: 'Fill in the blanks.',
        templateText: 'Both {{dup}} and {{dup}} are identical.',
        targetBlanks: [
          { id: 'b_1', blankKey: 'dup' },
          { id: 'b_2', blankKey: 'dup' },
        ],
        answerKey: {
          blanks: { dup: ['test'] },
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Duplicate blankKey 'dup' found in targetBlanks.");
    });

    it('rejects empty answerKey variants', () => {
      const result = cloze.validateConfig({
        prompt: 'Fill in the blank.',
        templateText: 'Sentence with {{blank_1}}.',
        targetBlanks: [{ id: 'b_1', blankKey: 'blank_1' }],
        answerKey: {
          blanks: { blank_1: [] },
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "answerKey.blanks must provide at least one accepted string variant for 'blank_1'.",
      );
    });
  });

  describe('Learner Sanitization', () => {
    it('strips answer key, explanations, and hints from learner view', () => {
      const sanitized = cloze.sanitizeForLearner({
        prompt: 'Complete the sentence.',
        templateText: 'The bird {{blank_1}} south.',
        targetBlanks: [
          { id: 'b_1', blankKey: 'blank_1', hintText: 'Secret hint text' },
        ],
        answerKey: {
          blanks: { blank_1: ['flew', 'migrated'] },
          explanation: 'Secret educator explanation.',
        },
        feedbackPolicy: 'DEFERRED',
        allowHints: false,
      });

      expect(sanitized).not.toHaveProperty('answerKey');
      expect((sanitized as any).targetBlanks[0]).not.toHaveProperty('hintText');
      expect((sanitized as any).targetBlanks[0]).toEqual({
        id: 'b_1',
        blankKey: 'blank_1',
      });
      expect(sanitized.feedbackPolicy).toBe('DEFERRED');
    });
  });

  describe('Unicode Normalization & Deterministic Server Evaluation', () => {
    const config = {
      prompt: 'Complete the sentence.',
      templateText: 'The scientist conducted an {{blank_1}} on {{blank_2}}.',
      targetBlanks: [
        { id: 'b_1', blankKey: 'blank_1' },
        { id: 'b_2', blankKey: 'blank_2' },
      ],
      answerKey: {
        blanks: {
          blank_1: ['experiment', 'investigation'],
          blank_2: ['gravity', 'photosynthesis'],
        },
        explanation: 'Scientific verification.',
      },
      feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
    };

    it('evaluates exact match as correct with score 1.0', async () => {
      const outcome = await cloze.evaluate(
        {
          answers: {
            blank_1: 'experiment',
            blank_2: 'gravity',
          },
        },
        config,
        {} as any,
      );

      expect(outcome.status).toBe('EVALUATED');
      expect(outcome.isCorrect).toBe(true);
      expect(outcome.score).toBe(1.0);
      expect((outcome.feedback as any)?.explanation).toBe('Scientific verification.');
    });

    it('evaluates with Unicode NFKC normalization, whitespace trimming, and case folding', async () => {
      const outcome = await cloze.evaluate(
        {
          answers: {
            blank_1: '  EXPERIMENT.  ', // uppercase, whitespace, punctuation
            blank_2: '  Gravity!  ',
          },
        },
        config,
        {} as any,
      );

      expect(outcome.isCorrect).toBe(true);
      expect(outcome.score).toBe(1.0);
    });

    it('handles alternative allowlisted lexical variants correctly', async () => {
      const outcome = await cloze.evaluate(
        {
          answers: {
            blank_1: 'investigation', // alternative accepted variant
            blank_2: 'photosynthesis',
          },
        },
        config,
        {} as any,
      );

      expect(outcome.isCorrect).toBe(true);
      expect(outcome.score).toBe(1.0);
    });

    it('evaluates partial answer as incorrect with proportional score', async () => {
      const outcome = await cloze.evaluate(
        {
          answers: {
            blank_1: 'experiment', // correct
            blank_2: 'magnetism', // wrong
          },
        },
        config,
        {} as any,
      );

      expect(outcome.isCorrect).toBe(false);
      expect(outcome.score).toBe(0.5); // 1 out of 2 correct
    });

    it('respects DEFERRED feedback policy by withholding detailed answers from active attempt', async () => {
      const deferredConfig = { ...config, feedbackPolicy: 'DEFERRED' };
      const outcome = await cloze.evaluate(
        {
          answers: {
            blank_1: 'experiment',
            blank_2: 'gravity',
          },
        },
        deferredConfig,
        {} as any,
      );

      expect((outcome.feedback as any)?.deferred).toBe(true);
      expect(outcome.isCorrect).toBe(true);
    });
  });

  describe('normalizeClozeToken helper utility', () => {
    it('normalizes diacritics, curly quotes, and punctuation', () => {
      expect(normalizeClozeToken("didn’t")).toBe('didnt');
      expect(normalizeClozeToken("didn't")).toBe('didnt');
      expect(normalizeClozeToken('  Café  ')).toBe('café');
      expect(normalizeClozeToken('"Hello, World!"')).toBe('hello world');
    });
  });
});
