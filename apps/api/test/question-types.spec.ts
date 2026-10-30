/* eslint-disable @typescript-eslint/no-explicit-any */
import { QuestionTypesRegistry } from '../src/modules/assessments/questions/question-types.registry';

describe('QuestionTypesRegistry Unit Tests', () => {
  let registry: QuestionTypesRegistry;

  beforeEach(() => {
    registry = new QuestionTypesRegistry();
  });

  it('lists all 9 allowlisted question types with correct evaluator status', () => {
    const types = registry.listTypes();
    expect(types.length).toBe(9);

    const typeMap = new Map(types.map((t) => [t.type, t.evaluatorStatus]));
    expect(typeMap.get('SINGLE_CHOICE')).toBe('WORKING_EVALUATOR');
    expect(typeMap.get('CLOZE')).toBe('WORKING_EVALUATOR');
    expect(typeMap.get('TRUE_FALSE')).toBe('WORKING_EVALUATOR');
    expect(typeMap.get('MULTIPLE_CHOICE')).toBe('AUTHORING_ONLY');
    expect(typeMap.get('SHORT_TEXT')).toBe('AUTHORING_ONLY');
    expect(typeMap.get('NUMERIC')).toBe('AUTHORING_ONLY');
    expect(typeMap.get('ESSAY')).toBe('RUBRIC_GRADED_ONLY');
    expect(typeMap.get('MATCHING')).toBe('AUTHORING_ONLY');
    expect(typeMap.get('ORDERING')).toBe('AUTHORING_ONLY');
  });

  describe('SINGLE_CHOICE validation', () => {
    it('accepts valid single-choice question with answer key', () => {
      const res = registry.validateQuestion(
        'SINGLE_CHOICE',
        {
          prompt: 'What is 2 + 2?',
          options: [
            { id: 'opt_1', text: '4' },
            { id: 'opt_2', text: '5' },
          ],
        },
        { correctOptionId: 'opt_1' },
      );
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects single-choice with fewer than 2 options', () => {
      const res = registry.validateQuestion(
        'SINGLE_CHOICE',
        {
          prompt: 'Solo option question',
          options: [{ id: 'opt_1', text: 'Only one' }],
        },
        { correctOptionId: 'opt_1' },
      );
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('SINGLE_CHOICE content must include at least 2 options.');
    });

    it('rejects answerKey referencing non-existent option id', () => {
      const res = registry.validateQuestion(
        'SINGLE_CHOICE',
        {
          prompt: 'Options test',
          options: [
            { id: 'opt_1', text: 'One' },
            { id: 'opt_2', text: 'Two' },
          ],
        },
        { correctOptionId: 'opt_999' },
      );
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain("correctOptionId 'opt_999' does not match any configured option id");
    });
  });

  describe('MULTIPLE_CHOICE validation', () => {
    it('accepts valid multi-select question with multiple correct options', () => {
      const res = registry.validateQuestion(
        'MULTIPLE_CHOICE',
        {
          prompt: 'Select all prime numbers below 10:',
          options: [
            { id: 'opt_2', text: '2' },
            { id: 'opt_3', text: '3' },
            { id: 'opt_4', text: '4' },
            { id: 'opt_5', text: '5' },
          ],
        },
        { correctOptionIds: ['opt_2', 'opt_3', 'opt_5'] },
      );
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects multi-select with empty correctOptionIds array', () => {
      const res = registry.validateQuestion(
        'MULTIPLE_CHOICE',
        {
          prompt: 'Prime numbers',
          options: [
            { id: 'opt_1', text: '1' },
            { id: 'opt_2', text: '2' },
          ],
        },
        { correctOptionIds: [] },
      );
      expect(res.valid).toBe(false);
      expect(res.errors).toContain(
        'MULTIPLE_CHOICE answerKey must specify a non-empty array of correctOptionIds.',
      );
    });
  });

  describe('TRUE_FALSE validation', () => {
    it('accepts valid true/false question', () => {
      const res = registry.validateQuestion(
        'TRUE_FALSE',
        { prompt: 'The speed of light is constant in a vacuum.' },
        { correctValue: true },
      );
      expect(res.valid).toBe(true);
    });

    it('rejects non-boolean correctValue', () => {
      const res = registry.validateQuestion(
        'TRUE_FALSE',
        { prompt: 'Test' },
        { correctValue: 'true' as any },
      );
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('TRUE_FALSE answerKey must specify boolean correctValue.');
    });
  });

  describe('CLOZE validation', () => {
    it('accepts valid Cloze question with templateText matching targetBlanks', () => {
      const res = registry.validateQuestion(
        'CLOZE',
        {
          prompt: 'Complete the sentence:',
          templateText: 'Water freezes at {{temp}} degrees Celsius and boils at {{boil}}.',
          targetBlanks: [{ blankKey: 'temp' }, { blankKey: 'boil' }],
        },
        {
          blanks: {
            temp: ['0', 'zero'],
            boil: ['100', 'one hundred'],
          },
        },
      );
      expect(res.valid).toBe(true);
    });

    it('rejects Cloze when templateText is missing placeholder for targetBlank', () => {
      const res = registry.validateQuestion(
        'CLOZE',
        {
          prompt: 'Test',
          templateText: 'Only {{one}} is present.',
          targetBlanks: [{ blankKey: 'one' }, { blankKey: 'two' }],
        },
        {
          blanks: {
            one: ['1'],
            two: ['2'],
          },
        },
      );
      expect(res.valid).toBe(false);
      expect(res.errors).toContain("templateText is missing placeholder '{{two}}'.");
    });
  });

  describe('NUMERIC validation', () => {
    it('accepts valid numeric question with ABSOLUTE tolerance', () => {
      const res = registry.validateQuestion(
        'NUMERIC',
        { prompt: 'What is the value of pi to 2 decimal places?', unit: 'rad' },
        { correctValue: 3.14, tolerance: 0.01, toleranceType: 'ABSOLUTE' },
      );
      expect(res.valid).toBe(true);
    });

    it('rejects negative tolerance and invalid toleranceType', () => {
      const res = registry.validateQuestion(
        'NUMERIC',
        { prompt: 'Numeric test' },
        { correctValue: 42, tolerance: -1, toleranceType: 'INVALID' as any },
      );
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('NUMERIC answerKey tolerance must be a non-negative number.');
      expect(res.errors).toContain("NUMERIC answerKey toleranceType must be 'ABSOLUTE' or 'PERCENT'.");
    });
  });

  describe('ESSAY validation (Human Rubric Graded)', () => {
    it('accepts valid essay with word constraints and rubric criteria', () => {
      const res = registry.validateQuestion(
        'ESSAY',
        {
          prompt: 'Analyze the economic impact of the Industrial Revolution.',
          minWords: 200,
          maxWords: 1000,
        },
        null, // No automated answer key
        {
          criteria: [
            {
              id: 'crit_analysis',
              name: 'Historical Analysis',
              description: 'Demonstrates deep understanding of historical causality.',
              maxPoints: 10,
            },
            {
              id: 'crit_structure',
              name: 'Structure & Coherence',
              description: 'Clear thesis statement and logical paragraph progression.',
              maxPoints: 5,
            },
          ],
        },
      );
      expect(res.valid).toBe(true);
    });

    it('STRICT INVARIANT: rejects essay if creator supplies an automated answerKey', () => {
      const res = registry.validateQuestion(
        'ESSAY',
        { prompt: 'Write an essay.' },
        { expectedEssayText: 'Exact essay text' }, // Automated key forbidden!
        null,
      );
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain(
        'ESSAY questions cannot have automated answerKey. Essays must be graded using rubrics.',
      );
    });

    it('rejects essay if minWords exceeds maxWords', () => {
      const res = registry.validateQuestion(
        'ESSAY',
        { prompt: 'Essay', minWords: 500, maxWords: 100 },
        null,
      );
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('minWords cannot exceed maxWords.');
    });
  });

  describe('MATCHING and ORDERING validation', () => {
    it('accepts valid matching pairs question', () => {
      const res = registry.validateQuestion(
        'MATCHING',
        {
          prompt: 'Match countries to capitals:',
          premises: [
            { id: 'p_fr', text: 'France' },
            { id: 'p_jp', text: 'Japan' },
          ],
          targets: [
            { id: 't_paris', text: 'Paris' },
            { id: 't_tokyo', text: 'Tokyo' },
          ],
        },
        {
          pairs: {
            p_fr: 't_paris',
            p_jp: 't_tokyo',
          },
        },
      );
      expect(res.valid).toBe(true);
    });

    it('accepts valid ordering sequence question', () => {
      const res = registry.validateQuestion(
        'ORDERING',
        {
          prompt: 'Order the biological taxonomy ranks from broadest to most specific:',
          items: [
            { id: 'i_domain', text: 'Domain' },
            { id: 'i_kingdom', text: 'Kingdom' },
            { id: 'i_phylum', text: 'Phylum' },
          ],
        },
        {
          correctSequence: ['i_domain', 'i_kingdom', 'i_phylum'],
        },
      );
      expect(res.valid).toBe(true);
    });
  });

  describe('Learner Payload Sanitization Anti-Leakage', () => {
    it('strips answer keys, correct option IDs, and rubrics from learner projections', () => {
      const mcqContent = {
        prompt: 'Solve 2x = 10',
        options: [
          { id: 'opt_1', text: '5' },
          { id: 'opt_2', text: '10' },
        ],
        answerKey: { correctOptionId: 'opt_1', explanation: 'Divide both sides by 2' },
      };

      const sanitized = registry.sanitizeForLearner('SINGLE_CHOICE', mcqContent);
      expect(sanitized.prompt).toBe('Solve 2x = 10');
      expect((sanitized as any).options).toEqual([
        { id: 'opt_1', text: '5' },
        { id: 'opt_2', text: '10' },
      ]);
      expect((sanitized as any).answerKey).toBeUndefined();
      expect((sanitized as any).correctOptionId).toBeUndefined();
      expect((sanitized as any).explanation).toBeUndefined();
    });
  });

  it('throws BadRequestException for unallowlisted question types', () => {
    expect(() => registry.getType('NON_EXISTENT_TYPE' as any)).toThrow();
  });
});
