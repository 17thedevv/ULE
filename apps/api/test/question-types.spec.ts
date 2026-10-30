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

    it('P1 REQUIREMENT: strictly strips nested secret metadata from MATCHING premises and targets', () => {
      const matchingContent = {
        prompt: 'Match country to capital',
        premises: [
          { id: 'p_fr', text: 'France', correctTargetId: 't_paris', secretData: 'FR_SECRET' },
          { id: 'p_es', text: 'Spain', correctTargetId: 't_madrid', internalTag: 'ES_TAG' },
        ],
        targets: [
          { id: 't_paris', text: 'Paris', pairedPremiseId: 'p_fr', weight: 10 },
          { id: 't_madrid', text: 'Madrid', pairedPremiseId: 'p_es', weight: 10 },
        ],
      };

      const sanitized = registry.sanitizeForLearner('MATCHING', matchingContent);
      expect(sanitized.prompt).toBe('Match country to capital');
      expect((sanitized as any).premises).toEqual([
        { id: 'p_fr', text: 'France' },
        { id: 'p_es', text: 'Spain' },
      ]);
      expect((sanitized as any).targets).toEqual([
        { id: 't_paris', text: 'Paris' },
        { id: 't_madrid', text: 'Madrid' },
      ]);

      // Assert nested leaked keys do NOT exist anywhere in projected items
      for (const p of (sanitized as any).premises) {
        expect(p.correctTargetId).toBeUndefined();
        expect(p.secretData).toBeUndefined();
        expect(p.internalTag).toBeUndefined();
      }
      for (const t of (sanitized as any).targets) {
        expect(t.pairedPremiseId).toBeUndefined();
        expect(t.weight).toBeUndefined();
      }
    });

    it('P1 REQUIREMENT: strictly strips nested sequence index or leaked metadata from ORDERING items', () => {
      const orderingContent = {
        prompt: 'Order chronologically',
        items: [
          { id: 'step_1', text: 'First Step', correctPosition: 0, internalRank: 1 },
          { id: 'step_2', text: 'Second Step', correctPosition: 1, internalRank: 2 },
          { id: 'step_3', text: 'Third Step', correctPosition: 2, internalRank: 3 },
        ],
      };

      const sanitized = registry.sanitizeForLearner('ORDERING', orderingContent);
      expect(sanitized.prompt).toBe('Order chronologically');
      expect((sanitized as any).items).toEqual([
        { id: 'step_1', text: 'First Step' },
        { id: 'step_2', text: 'Second Step' },
        { id: 'step_3', text: 'Third Step' },
      ]);

      for (const item of (sanitized as any).items) {
        expect(item.correctPosition).toBeUndefined();
        expect(item.internalRank).toBeUndefined();
      }
    });
  });

  describe('P2 REQUIREMENT: Publishability Validation', () => {
    it('rejects publication of auto-evaluable question without answerKey', () => {
      const res = registry.validatePublishability(
        'SINGLE_CHOICE',
        {
          prompt: 'Question without answer key',
          options: [{ id: '1', text: 'A' }, { id: '2', text: 'B' }],
        },
        null,
      );
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('must include a valid answerKey before publication');
    });

    it('accepts publication of auto-evaluable question with valid answerKey', () => {
      const res = registry.validatePublishability(
        'SINGLE_CHOICE',
        {
          prompt: 'Valid Question',
          options: [{ id: '1', text: 'A' }, { id: '2', text: 'B' }],
        },
        { correctOptionId: '1' },
      );
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects publication of ESSAY question if rubric is missing or has zero criteria', () => {
      const res = registry.validatePublishability(
        'ESSAY',
        { prompt: 'Write an essay', minWords: 100 },
        null,
        null,
      );
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('valid grading rubric with at least one criterion is required');
    });

    it('rejects publication of ESSAY question if automated answerKey is attached', () => {
      const res = registry.validatePublishability(
        'ESSAY',
        { prompt: 'Write an essay', minWords: 100 },
        { text: 'Sample answer' },
        { criteria: [{ id: 'c1', name: 'Analysis', description: 'desc', maxPoints: 10 }] },
      );
      expect(res.valid).toBe(false);
      expect(res.errors.join(' ')).toContain('automated answerKey');
    });

    it('accepts publication of ESSAY question with valid rubric and no automated answerKey', () => {
      const res = registry.validatePublishability(
        'ESSAY',
        { prompt: 'Write an essay', minWords: 100 },
        null,
        { criteria: [{ id: 'c1', name: 'Analysis', description: 'desc', maxPoints: 10 }] },
      );
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });
  });

  it('throws BadRequestException for unallowlisted question types', () => {
    expect(() => registry.getType('NON_EXISTENT_TYPE' as any)).toThrow();
  });
});
