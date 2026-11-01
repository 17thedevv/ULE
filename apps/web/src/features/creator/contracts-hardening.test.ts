import { describe, expect, it } from 'vitest';
import {
  MultipleChoiceConfig,
  ClozeConfig,
  VideoConfig,
  EssayRubric,
  MultiSelectAnswerKey,
} from '@ule/contracts';
import { buildQuestionPayload } from './question-payload-builder';
import { buildClozeSubmissionPayload } from '../learner/cloze-submission';
import { normalizeVideoEmbedUrl } from '../learner/video-embed';

describe('Frontend Contract Hardening & Runtime Payload Tests', () => {
  describe('QuestionBank Runtime Payload Builder (PR #8 & Registry Compliance)', () => {
    it('builds MATCHING question payload strictly using answerKey.pairs (no "matches")', () => {
      const payload = buildQuestionPayload({
        title: 'Network Protocol Matching',
        prompt: 'Match each protocol with its authoritative layer',
        type: 'MATCHING',
        points: 5,
        tags: ['networking', 'contracts'],
        matchingPairs: [
          { premiseId: 'p_1', premiseText: 'HTTPS', targetId: 't_1', targetText: 'Application Layer' },
          { premiseId: 'p_2', premiseText: 'TCP', targetId: 't_2', targetText: 'Transport Layer' },
        ],
      });

      expect(payload.type).toBe('MATCHING');
      expect(payload.content).toBeDefined();

      const premises = (payload.content as { premises: Array<{ id: string; text: string }> }).premises;
      const targets = (payload.content as { targets: Array<{ id: string; text: string }> }).targets;
      expect(premises).toHaveLength(2);
      expect(targets).toHaveLength(2);

      // Backend PR #8 QuestionTypesRegistry.createMatchingDefinition() requires 'pairs'
      expect(payload.answerKey).toBeDefined();
      expect('pairs' in (payload.answerKey as Record<string, unknown>)).toBe(true);
      expect('matches' in (payload.answerKey as Record<string, unknown>)).toBe(false);

      const pairs = (payload.answerKey as { pairs: Record<string, string> }).pairs;
      expect(pairs['p_1']).toBe('t_1');
      expect(pairs['p_2']).toBe('t_2');
    });

    it('builds ORDERING question payload strictly using answerKey.correctSequence (no "correctOrder")', () => {
      const payload = buildQuestionPayload({
        title: 'CI/CD Pipeline Sequence',
        prompt: 'Arrange the deployment steps in strictly chronological order',
        type: 'ORDERING',
        points: 6,
        tags: ['devops'],
        orderingItems: [
          { id: 'step_1', text: 'Lint & Typecheck' },
          { id: 'step_2', text: 'Execute Integration Tests' },
          { id: 'step_3', text: 'Emit Production Bundle' },
        ],
      });

      expect(payload.type).toBe('ORDERING');
      const items = (payload.content as { items: Array<{ id: string; text: string }> }).items;
      expect(items).toHaveLength(3);

      // Backend PR #8 QuestionTypesRegistry.createOrderingDefinition() requires 'correctSequence'
      expect(payload.answerKey).toBeDefined();
      expect('correctSequence' in (payload.answerKey as Record<string, unknown>)).toBe(true);
      expect('correctOrder' in (payload.answerKey as Record<string, unknown>)).toBe(false);

      const sequence = (payload.answerKey as { correctSequence: string[] }).correctSequence;
      expect(sequence).toEqual(['step_1', 'step_2', 'step_3']);
    });

    it('builds MULTIPLE_CHOICE payload with correctOptionIds array (no scalar correctOptionId)', () => {
      const payload = buildQuestionPayload({
        title: 'Architectural Invariants',
        prompt: 'Select all authoritative invariants enforced in ULE:',
        type: 'MULTIPLE_CHOICE',
        points: 10,
        tags: ['architecture'],
        optionsList: [
          { id: 'opt_1', text: 'Zero direct database connections from clients' },
          { id: 'opt_2', text: 'Server-authoritative scoring & deadlines' },
          { id: 'opt_3', text: 'Arbitrary client mastery mutation' },
        ],
        multiChoiceOptions: ['opt_1', 'opt_2'],
      });

      expect(payload.type).toBe('MULTIPLE_CHOICE');
      expect(payload.answerKey).toBeDefined();
      expect('correctOptionIds' in (payload.answerKey as Record<string, unknown>)).toBe(true);
      expect('correctOptionId' in (payload.answerKey as Record<string, unknown>)).toBe(false);

      const optionIds = (payload.answerKey as { correctOptionIds: string[] }).correctOptionIds;
      expect(optionIds).toEqual(['opt_1', 'opt_2']);
    });

    it('builds SINGLE_CHOICE payload with scalar correctOptionId', () => {
      const payload = buildQuestionPayload({
        title: 'Primary Stack Component',
        prompt: 'Which framework powers the ULE backend?',
        type: 'SINGLE_CHOICE',
        points: 5,
        tags: ['backend'],
        optionsList: [
          { id: 'opt_nest', text: 'NestJS' },
          { id: 'opt_next', text: 'Next.js' },
        ],
        singleChoiceOption: 'opt_nest',
      });

      expect(payload.type).toBe('SINGLE_CHOICE');
      expect(payload.answerKey).toBeDefined();
      expect('correctOptionId' in (payload.answerKey as Record<string, unknown>)).toBe(true);
      expect((payload.answerKey as { correctOptionId: string }).correctOptionId).toBe('opt_nest');
    });

    it('builds ESSAY payload with rubric criterion name and enforces answerKey is undefined', () => {
      const payload = buildQuestionPayload({
        title: 'Modular Monolith Defense',
        prompt: 'Explain why ULE adopts a modular monolith rather than microservices.',
        type: 'ESSAY',
        points: 15,
        tags: ['architecture', 'essay'],
        essayCriterionName: 'Boundary Isolation & Decoupling',
        essayCriterionDescription: 'Demonstrates deep understanding of domain service separation',
        essayMinWords: 50,
        essayMaxWords: 600,
      });

      expect(payload.type).toBe('ESSAY');
      expect(payload.answerKey).toBeUndefined(); // Strictly prohibited for essay

      expect(payload.rubric).toBeDefined();
      const rubric = payload.rubric as unknown as EssayRubric;
      expect(rubric.criteria).toHaveLength(1);
      expect(rubric.criteria[0].name).toBe('Boundary Isolation & Decoupling');
      expect('title' in (rubric.criteria[0] as unknown as Record<string, unknown>)).toBe(false);
      expect(rubric.criteria[0].maxPoints).toBe(15);
    });

    it('builds CLOZE question payload with templateText, targetBlanks, and blanks variants', () => {
      const payload = buildQuestionPayload({
        title: 'Technology Fill-in-the-Blank',
        prompt: 'Fill in the blanks with appropriate framework names',
        type: 'CLOZE',
        points: 8,
        tags: ['frameworks'],
        clozeTemplate: 'ULE web is built with {{blank_fe}} and API uses {{blank_be}}.',
        clozeTargetBlanks: [
          { blankKey: 'blank_fe', hint: 'Frontend' },
          { blankKey: 'blank_be', hint: 'Backend' },
        ],
        clozeAcceptedVariants: {
          blank_fe: ['React', 'React 18'],
          blank_be: ['NestJS', 'Nest.js'],
        },
      });

      expect(payload.type).toBe('CLOZE');
      const content = payload.content as {
        templateText: string;
        targetBlanks: Array<{ blankKey: string }>;
      };
      expect(content.templateText).toContain('{{blank_fe}}');
      expect(content.templateText).toContain('{{blank_be}}');
      expect(content.targetBlanks).toHaveLength(2);

      const answerKey = payload.answerKey as { blanks: Record<string, string[]> };
      expect(answerKey.blanks['blank_fe']).toContain('React');
      expect(answerKey.blanks['blank_be']).toContain('NestJS');
    });
  });

  describe('Cloze Submission Payload & Trusted Evidence (PR #3 Alignment)', () => {
    it('builds Cloze submission payload with answers keyed by blankKey', () => {
      // Simulate user input keyed by blankKey:
      const userAnswers: Record<string, string> = {
        blank_1: 'experiment',
        blank_2: 'hypothesis',
      };

      const payload = buildClozeSubmissionPayload(userAnswers);

      // ClozeBlockDefinition.evaluate() expects submission.answers[blank.blankKey]
      expect(payload.answers).toBeDefined();
      expect(payload.answers['blank_1']).toBe('experiment');
      expect(payload.answers['blank_2']).toBe('hypothesis');

      // Also includes blanks for exam autograder compatibility
      expect(payload.blanks).toBeDefined();
      expect(payload.blanks['blank_1']).toBe('experiment');

      // Crucial: keys must NOT be database UUIDs or internal arbitrary IDs
      expect('b_1' in payload.answers).toBe(false);
    });
  });

  describe('Video Embed URL Normalization', () => {
    it('normalizes standard YouTube watch URL to youtube-nocookie embed URL', () => {
      const res = normalizeVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.isEmbed).toBe(true);
      expect(res.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('normalizes short youtu.be URL to embed URL', () => {
      const res = normalizeVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ');
      expect(res.isEmbed).toBe(true);
      expect(res.embedUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('normalizes standard Vimeo URL to player.vimeo.com embed URL', () => {
      const res = normalizeVideoEmbedUrl('https://vimeo.com/76979871');
      expect(res.isEmbed).toBe(true);
      expect(res.embedUrl).toBe('https://player.vimeo.com/video/76979871');
    });

    it('recognizes direct MP4 video file and does not treat as iframe embed', () => {
      const res = normalizeVideoEmbedUrl('https://cdn.example.com/videos/architecture-overview.mp4');
      expect(res.isEmbed).toBe(false);
      expect(res.embedUrl).toBeNull();
    });

    it('handles empty or null URLs gracefully', () => {
      expect(normalizeVideoEmbedUrl(null).isEmbed).toBe(false);
      expect(normalizeVideoEmbedUrl(undefined).isEmbed).toBe(false);
      expect(normalizeVideoEmbedUrl('').isEmbed).toBe(false);
    });
  });

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

  describe('Question Bank Static Contracts (PR #8 Alignment)', () => {
    it('enforces correctOptionIds array for MULTIPLE_CHOICE answer key', () => {
      const answerKey: MultiSelectAnswerKey = {
        correctOptionIds: ['opt_1', 'opt_2'],
      };

      expect(Array.isArray(answerKey.correctOptionIds)).toBe(true);
      expect(answerKey.correctOptionIds.length).toBeGreaterThan(0);
      expect('correctOptionId' in answerKey).toBe(false);
    });

    it('enforces rubric criteria name property and prohibits answerKey for ESSAY', () => {
      const rubric: EssayRubric = {
        criteria: [
          {
            id: 'crit-1',
            name: 'Architectural Soundness',
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
