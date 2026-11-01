import { describe, expect, it } from 'vitest';
import {
  MultipleChoiceConfig,
  ClozeConfig,
  VideoConfig,
  EssayRubric,
  MultiSelectAnswerKey,
} from '@ule/contracts';

describe('Frontend Contract Hardening & Schema Alignment', () => {
  describe('ABP Course Builder Block Schemas (PR #3 Alignment)', () => {
    it('validates multiple-choice ABP block payload matches MultipleChoiceConfig', () => {
      const mcqConfig: MultipleChoiceConfig = {
        question: 'Select the correct architectural principle:',
        options: [
          { id: 'opt_1', text: 'Loose coupling with clear modular boundaries' },
          { id: 'opt_2', text: 'Tight direct database connections from clients' },
        ],
        answerKey: {
          correctOptionId: 'opt_1',
          explanation: 'Clients must connect via versioned HTTP APIs, never directly to PostgreSQL.',
        },
        feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
        allowHints: false,
      };

      expect(typeof mcqConfig.question).toBe('string');
      expect(mcqConfig.question.length).toBeGreaterThanOrEqual(3);
      expect(mcqConfig.options.length).toBeGreaterThanOrEqual(2);
      expect(mcqConfig.answerKey.correctOptionId).toBe('opt_1');
      expect(mcqConfig.options.some((o) => o.id === mcqConfig.answerKey.correctOptionId)).toBe(true);
    });

    it('validates cloze ABP block payload matches ClozeConfig', () => {
      const clozeConfig: ClozeConfig = {
        prompt: 'Complete the sentence with the correct technologies.',
        templateText: 'ULE backend uses {{blank_1}} with {{blank_2}} database.',
        targetBlanks: [
          { id: 'b_1', blankKey: 'blank_1', hintText: 'Backend framework' },
          { id: 'b_2', blankKey: 'blank_2', hintText: 'Relational database' },
        ],
        answerKey: {
          blanks: {
            blank_1: ['NestJS', 'Nest.js'],
            blank_2: ['PostgreSQL', 'Postgres'],
          },
          explanation: 'ULE is built on NestJS and PostgreSQL.',
        },
        feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
        allowHints: false,
      };

      expect(clozeConfig.prompt.length).toBeGreaterThanOrEqual(3);
      expect(clozeConfig.templateText).toContain('{{blank_1}}');
      expect(clozeConfig.templateText).toContain('{{blank_2}}');
      expect(clozeConfig.targetBlanks).toHaveLength(2);
      expect(clozeConfig.answerKey.blanks['blank_1']).toContain('NestJS');
      expect(clozeConfig.answerKey.blanks['blank_2']).toContain('PostgreSQL');
    });

    it('validates video ABP block payload matches VideoConfig', () => {
      const videoConfig: VideoConfig = {
        url: 'https://example.com/video.mp4',
        durationSeconds: 120,
        transcript: '',
        allowSkip: true,
      };

      expect(videoConfig.url.startsWith('https://')).toBe(true);
      expect(videoConfig.durationSeconds).toBe(120);
      expect(typeof videoConfig.allowSkip).toBe('boolean');
    });
  });

  describe('Question Bank Schemas (PR #8 Alignment)', () => {
    it('enforces correctOptionIds array for MULTIPLE_CHOICE answer key', () => {
      const answerKey: MultiSelectAnswerKey = {
        correctOptionIds: ['opt_1', 'opt_2'],
      };

      expect(Array.isArray(answerKey.correctOptionIds)).toBe(true);
      expect(answerKey.correctOptionIds.length).toBeGreaterThan(0);
      // Ensures correctOptionId (scalar string) is not accidentally used for multi-select
      expect('correctOptionId' in answerKey).toBe(false);
    });

    it('enforces rubric criteria name property and prohibits answerKey for ESSAY', () => {
      const rubric: EssayRubric = {
        criteria: [
          {
            id: 'crit-1',
            name: 'Architectural Soundness', // 'name' required by backend, not 'title'
            description: 'Evaluation of system boundaries',
            maxPoints: 10,
            levels: [{ score: 10, label: 'Exemplary', description: 'Decoupled services' }],
          },
        ],
      };

      expect(rubric.criteria).toHaveLength(1);
      expect(rubric.criteria[0].name).toBe('Architectural Soundness');
      expect('title' in rubric.criteria[0]).toBe(false);
      expect(rubric.criteria[0].maxPoints).toBe(10);
    });
  });
});
