import { QuestTemplatesRegistry } from '../src/modules/quests/quest-templates.registry';

describe('QuestTemplatesRegistry Unit Tests', () => {
  let registry: QuestTemplatesRegistry;

  beforeEach(() => {
    registry = new QuestTemplatesRegistry();
  });

  it('lists default allowlisted quest templates', () => {
    const templates = registry.listTemplates();
    expect(templates.length).toBe(2);
    expect(templates.map((t) => t.id)).toEqual([
      'COMPLETE_DISTINCT_ACTIVITIES',
      'INDEPENDENT_PRACTICE',
    ]);
  });

  describe('COMPLETE_DISTINCT_ACTIVITIES template validation', () => {
    it('validates a correct configuration', () => {
      const res = registry.validateConfig('COMPLETE_DISTINCT_ACTIVITIES', {
        targetCount: 3,
        requiredBlockInstanceIds: ['block-1', 'block-2'],
      });
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects invalid targetCount', () => {
      const res = registry.validateConfig('COMPLETE_DISTINCT_ACTIVITIES', {
        targetCount: 0,
      });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('targetCount must be a positive integer.');
    });

    it('rejects non-integer targetCount', () => {
      const res = registry.validateConfig('COMPLETE_DISTINCT_ACTIVITIES', {
        targetCount: 2.5,
      });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('targetCount must be a positive integer.');
    });

    it('rejects empty string in requiredBlockInstanceIds', () => {
      const res = registry.validateConfig('COMPLETE_DISTINCT_ACTIVITIES', {
        targetCount: 2,
        requiredBlockInstanceIds: ['block-1', '   '],
      });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('Each requiredBlockInstanceId must be a non-empty string.');
    });
  });

  describe('INDEPENDENT_PRACTICE template validation', () => {
    it('validates a correct configuration', () => {
      const res = registry.validateConfig('INDEPENDENT_PRACTICE', {
        skillCode: 'SKILL_TS_BASICS',
        targetCount: 2,
      });
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('rejects missing or empty skillCode', () => {
      const res = registry.validateConfig('INDEPENDENT_PRACTICE', {
        skillCode: '',
        targetCount: 2,
      });
      expect(res.valid).toBe(false);
      expect(res.errors).toContain('skillCode must be a non-empty string.');
    });
  });

  it('throws BadRequestException for unknown template ID', () => {
    expect(() => registry.getTemplate('NON_EXISTENT_TEMPLATE')).toThrow();
  });
});
