/* eslint-disable @typescript-eslint/no-explicit-any */
import { BlockTypeRegistry } from '../src/modules/abp/registry/block-type.registry';

describe('ABP BlockTypeRegistry Unit Tests', () => {
  let registry: BlockTypeRegistry;

  beforeEach(() => {
    registry = new BlockTypeRegistry();
  });

  describe('Registry Manifest Discovery', () => {
    it('lists all registered block type manifests', () => {
      const manifests = registry.listManifests();
      expect(manifests).toHaveLength(3);

      const ids = manifests.map((m) => m.id);
      expect(ids).toContain('video');
      expect(ids).toContain('multiple-choice');
      expect(ids).toContain('coding');
    });

    it('retrieves valid definition for known type', () => {
      const def = registry.getDefinition('video');
      expect(def.manifest.id).toBe('video');
      expect(def.manifest.capabilities.renderable).toBe(true);
      expect(def.manifest.capabilities.evaluatable).toBe(false);
    });

    it('throws NotFoundException for unregistered type', () => {
      expect(() => registry.getDefinition('virtual-reality')).toThrow(
        "Block type 'virtual-reality' is not registered.",
      );
    });
  });

  describe('Video Block Validation & Sanitization', () => {
    it('validates a correct video configuration', () => {
      const result = registry.validateConfig('video', {
        url: 'https://cdn.ule.internal/course1/intro.mp4',
        durationSeconds: 120,
        transcript: 'Welcome to ULE.',
        allowSkip: true,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects invalid video url or negative duration', () => {
      const result = registry.validateConfig('video', {
        url: 'ftp://invalid-protocol.mp4',
        durationSeconds: -10,
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Video 'url' must begin with http://, https://, or a valid path.",
      );
      expect(result.errors).toContain(
        "Video 'durationSeconds' must be a non-negative number.",
      );
    });

    it('sanitizes video configuration for learner', () => {
      const sanitized = registry.sanitizeForLearner('video', {
        url: 'https://cdn.ule.internal/video.mp4',
        durationSeconds: 300,
        transcript: 'Full transcript',
        allowSkip: false,
        internalNote: 'Private author comment',
      });

      expect(sanitized.url).toBe('https://cdn.ule.internal/video.mp4');
      expect(sanitized.allowSkip).toBe(false);
      expect(sanitized).not.toHaveProperty('internalNote');
    });
  });

  describe('Multiple Choice Block Validation & Evaluation', () => {
    const validConfig = {
      question: 'Which component stores authoritative business logic?',
      options: [
        { id: 'opt_1', text: 'NestJS domain services', explanation: 'Correct answer' },
        { id: 'opt_2', text: 'React components', explanation: 'React is an API client' },
        { id: 'opt_3', text: 'PostgreSQL stored procedures' },
      ],
      answerKey: {
        correctOptionId: 'opt_1',
        explanation: 'NestJS owns business rules and state transitions.',
      },
      feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
      allowHints: true,
      hintText: 'Think about where domain services live.',
    };

    it('validates a well-formed multiple choice configuration', () => {
      const result = registry.validateConfig('multiple-choice', validConfig);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects duplicate option IDs', () => {
      const invalidConfig = {
        ...validConfig,
        options: [
          { id: 'opt_dup', text: 'Option A' },
          { id: 'opt_dup', text: 'Option B' },
        ],
        answerKey: { correctOptionId: 'opt_dup' },
      };

      const result = registry.validateConfig('multiple-choice', invalidConfig);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("Duplicate option id detected: 'opt_dup'")),
      ).toBe(true);
    });

    it('rejects answerKey referencing a non-existent option id', () => {
      const invalidConfig = {
        ...validConfig,
        answerKey: { correctOptionId: 'non_existent_id' },
      };

      const result = registry.validateConfig('multiple-choice', invalidConfig);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes("answerKey.correctOptionId 'non_existent_id' does not match"),
        ),
      ).toBe(true);
    });

    it('rejects allowHints without hintText', () => {
      const invalidConfig = {
        ...validConfig,
        allowHints: true,
        hintText: '   ',
      };

      const result = registry.validateConfig('multiple-choice', invalidConfig);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("non-empty 'hintText' must be provided")),
      ).toBe(true);
    });

    it('CRITICAL: learner-facing view NEVER leaks answerKey or option explanations', () => {
      const learnerView = registry.sanitizeForLearner('multiple-choice', validConfig);

      // Verify essential learner fields
      expect(learnerView.question).toBe('Which component stores authoritative business logic?');
      expect(Array.isArray(learnerView.options)).toBe(true);
      expect((learnerView.options as Array<{ id: string; text: string }>).length).toBe(3);

      // Explicitly verify answerKey, correctOptionId, and hintText are NOT present
      expect(learnerView).not.toHaveProperty('answerKey');
      expect(learnerView).not.toHaveProperty('correctOptionId');
      expect(learnerView).not.toHaveProperty('hintText');
      expect(learnerView).toHaveProperty('allowHints', true);

      // Verify options contain only id and text, never explanation
      const options = learnerView.options as Array<Record<string, unknown>>;
      for (const opt of options) {
        expect(opt).toHaveProperty('id');
        expect(opt).toHaveProperty('text');
        expect(opt).not.toHaveProperty('explanation');
        expect(opt).not.toHaveProperty('isCorrect');
      }
    });

    it('evaluates submitted response correctly on the server', async () => {
      // 1. Correct response
      const correctOutcome = await registry.evaluate('multiple-choice', validConfig, {
        runId: 'run-1',
        attemptId: 'att-1',
        attemptNumber: 1,
        userId: 'user-1',
        submittedResponse: { selectedOptionId: 'opt_1' },
      });

      expect(correctOutcome.status).toBe('EVALUATED');
      expect(correctOutcome.isCorrect).toBe(true);
      expect(correctOutcome.score).toBe(1.0);
      expect(correctOutcome.evaluatorId).toBe('ule-mcq-deterministic-evaluator-v1');
      expect((correctOutcome.feedback as any).isCorrect).toBe(true);

      // 2. Incorrect response
      const incorrectOutcome = await registry.evaluate('multiple-choice', validConfig, {
        runId: 'run-1',
        attemptId: 'att-2',
        attemptNumber: 2,
        userId: 'user-1',
        submittedResponse: { selectedOptionId: 'opt_2' },
      });

      expect(incorrectOutcome.status).toBe('EVALUATED');
      expect(incorrectOutcome.isCorrect).toBe(false);
      expect(incorrectOutcome.score).toBe(0.0);
    });

    it('respects DEFERRED feedback policy', async () => {
      const deferredConfig = {
        ...validConfig,
        feedbackPolicy: 'DEFERRED',
      };

      const outcome = await registry.evaluate('multiple-choice', deferredConfig, {
        runId: 'run-1',
        attemptId: 'att-1',
        attemptNumber: 1,
        userId: 'user-1',
        submittedResponse: { selectedOptionId: 'opt_1' },
      });

      expect(outcome.isCorrect).toBe(true);
      expect(outcome.feedback).toMatchObject({
        deferred: true,
        isCorrect: true,
      });
    });
  });

  describe('Coding Block Contract Validation', () => {
    it('validates a valid coding block configuration', () => {
      const result = registry.validateConfig('coding', {
        language: 'typescript',
        starterCode: 'function run() {}',
        instructions: 'Write the code',
      });

      expect(result.valid).toBe(true);
    });

    it('rejects coding config missing instructions or starterCode', () => {
      const result = registry.validateConfig('coding', {
        language: 'python',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('marks runtime code execution as unsupported and returns failed outcome if evaluated', async () => {
      const def = registry.getDefinition('coding');
      expect(def.manifest.capabilities.runtimeExecutionSupported).toBe(false);

      const outcome = await def.evaluateResponse?.(
        { language: 'python', starterCode: 'pass', instructions: 'test' },
        {
          runId: 'run-1',
          attemptId: 'att-1',
          attemptNumber: 1,
          userId: 'user-1',
          submittedResponse: { code: 'print(1)' },
        },
      );

      expect(outcome?.status).toBe('FAILED');
      expect(outcome?.isCorrect).toBeNull();
      expect((outcome?.feedback as any).error).toContain(
        'Coding block runtime execution is unsupported',
      );
    });
  });
});
