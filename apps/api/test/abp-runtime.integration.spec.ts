/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { createCorsOriginValidator } from '../src/common/utils/cors.util';
import { PrismaService } from '../src/modules/prisma/prisma.service';

function extractCookies(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

describe('Real PostgreSQL & Better Auth ABP Runtime Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const trustedOrigin = 'http://localhost:5173';

  const userA = {
    email: `creator_a_${Date.now()}@ule.internal`,
    password: 'SecurePassword123!',
    name: 'Creator Alice',
  };

  const userB = {
    email: `learner_b_${Date.now()}@ule.internal`,
    password: 'SecurePassword456!',
    name: 'Learner Bob',
  };

  let userACookie: string;
  let userBCookie: string;

  let courseAId: string;
  let videoBlockId: string;
  let mcqBlockId: string;
  let courseVersion1Id: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);

    app.setGlobalPrefix('api/v1');
    app.enableCors({
      origin: createCorsOriginValidator(trustedOrigin),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cookie'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    // 1. Register User A
    const regResA = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userA)
      .expect(HttpStatus.OK);
    userACookie = extractCookies(regResA);

    // 2. Register User B
    const regResB = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userB)
      .expect(HttpStatus.OK);
    userBCookie = extractCookies(regResB);
  });

  afterAll(async () => {
    if (courseAId) {
      await prisma.course.deleteMany({ where: { id: courseAId } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [userA.email, userB.email] } },
    });
    await app.close();
  });

  describe('1. Block Type Registry Discovery', () => {
    it('allows discovering supported ABP block types', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/abp/types')
        .set('Cookie', userACookie)
        .expect(HttpStatus.OK);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((m: any) => m.id);
      expect(ids).toContain('video');
      expect(ids).toContain('multiple-choice');
      expect(ids).toContain('coding');
    });

    it('retrieves detailed manifest for multiple-choice', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/abp/types/multiple-choice')
        .set('Cookie', userACookie)
        .expect(HttpStatus.OK);

      expect(res.body.id).toBe('multiple-choice');
      expect(res.body.capabilities.submittable).toBe(true);
      expect(res.body.capabilities.evaluatable).toBe(true);
    });
  });

  describe('2. Draft Block Configuration & Structural Validation', () => {
    beforeAll(async () => {
      const courseRes = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Cookie', userACookie)
        .send({
          title: 'ABP Science & Engineering 101',
          description: 'A comprehensive ABP demonstration course',
        })
        .expect(HttpStatus.CREATED);

      courseAId = courseRes.body.course.id;
    });

    it('rejects block addition with invalid type ID', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', userACookie)
        .send({
          blockTypeId: 'non-existent-type',
          title: 'Invalid Block',
          config: {},
          expectedRevision: 1,
        })
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.message).toContain('is not registered');
    });

    it('rejects multiple choice block with missing answerKey or invalid options', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', userACookie)
        .send({
          blockTypeId: 'multiple-choice',
          title: 'Broken MCQ',
          config: {
            question: 'Is this valid?',
            options: [{ id: 'opt_1', text: 'Only one option' }],
          },
          expectedRevision: 1,
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain('Validation failed for block type');
    });

    it('rejects multiple choice block where answerKey references non-existent option', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', userACookie)
        .send({
          blockTypeId: 'multiple-choice',
          title: 'Mismatched Key MCQ',
          config: {
            question: 'What is 2 + 2?',
            options: [
              { id: 'opt_1', text: '3' },
              { id: 'opt_2', text: '4' },
            ],
            answerKey: { correctOptionId: 'opt_ghost' },
          },
          expectedRevision: 1,
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain('does not match any valid option');
    });

    it('successfully adds valid Video block to Draft and increments revision', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', userACookie)
        .send({
          blockTypeId: 'video',
          title: 'Lesson 1: Introduction Video',
          expectedRevision: 1,
          config: {
            url: 'https://cdn.ule.internal/lessons/intro.mp4',
            durationSeconds: 180,
            transcript: 'Welcome to this lesson.',
            allowSkip: true,
          },
        })
        .expect(HttpStatus.CREATED);

      videoBlockId = res.body.id;
      expect(res.body.title).toBe('Lesson 1: Introduction Video');
      expect(res.body.orderIndex).toBe(0);

      // Verify draft revision incremented
      const draftRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/draft`)
        .set('Cookie', userACookie)
        .expect(HttpStatus.OK);
      expect(draftRes.body.revision).toBe(2);
    });

    it('successfully adds valid Multiple Choice block to Draft with protected answer key', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', userACookie)
        .send({
          blockTypeId: 'multiple-choice',
          title: 'Lesson 1: Knowledge Check',
          expectedRevision: 2,
          config: {
            question: 'What tier does the React application belong to in ULE?',
            options: [
              { id: 'opt_client', text: 'Client Tier (API Client)', explanation: 'React is strictly a client.' },
              { id: 'opt_backend', text: 'Backend Tier with Prisma access', explanation: 'React never accesses Prisma.' },
            ],
            answerKey: {
              correctOptionId: 'opt_client',
              explanation: 'Frontend is strictly an API client consuming REST endpoints.',
            },
            feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
            allowHints: true,
            hintText: 'Check the ULE system topology in docs/architecture/overview.md',
          },
        })
        .expect(HttpStatus.CREATED);

      mcqBlockId = res.body.id;
      expect(res.body.title).toBe('Lesson 1: Knowledge Check');
      expect(res.body.orderIndex).toBe(1);
    });

    it('demonstrates Coding block authoring validation without code execution', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', userACookie)
        .send({
          blockTypeId: 'coding',
          title: 'Practice: Write a Function',
          expectedRevision: 3,
          config: {
            language: 'typescript',
            starterCode: 'export function add(a: number, b: number): number { return 0; }',
            instructions: 'Return the sum of a and b.',
            expectedOutput: '3',
          },
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.blockTypeId).toBe('coding');

      // Clean up coding block to keep course slice focused on Video + MCQ
      await request(app.getHttpServer())
        .delete(`/api/v1/courses/${courseAId}/draft/blocks/${res.body.id}?expectedRevision=4`)
        .set('Cookie', userACookie)
        .expect(HttpStatus.NO_CONTENT);
    });

    it('validates all draft blocks successfully', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks/validate`)
        .set('Cookie', userACookie)
        .expect(HttpStatus.OK);

      expect(res.body.valid).toBe(true);
      expect(res.body.totalBlocks).toBe(2);
      expect(res.body.invalidBlocksCount).toBe(0);
    });
  });

  describe('3. Two-User Isolation on Draft Blocks', () => {
    it('User B cannot read User A draft blocks (returns 404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', userBCookie)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('User B cannot add a block to User A draft (returns 404)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', userBCookie)
        .send({
          blockTypeId: 'video',
          title: 'Malicious Injected Block',
          config: { url: 'https://evil.com/video.mp4' },
          expectedRevision: 1,
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('User B cannot delete User A draft block (returns 404)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/courses/${courseAId}/draft/blocks/${videoBlockId}?expectedRevision=1`)
        .set('Cookie', userBCookie)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('4. CourseVersion Creation with Validated Activity Snapshot', () => {
    it('creates immutable CourseVersion containing validated block snapshots', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/versions`)
        .set('Cookie', userACookie)
        .expect(HttpStatus.CREATED);

      courseVersion1Id = res.body.id;
      expect(res.body.versionNumber).toBe(1);

      const snapshot = res.body.snapshot;
      expect(snapshot).toHaveProperty('blocks');
      expect(Array.isArray(snapshot.blocks)).toBe(true);
      expect(snapshot.blocks).toHaveLength(2);

      const [b1, b2] = snapshot.blocks;
      expect(b1.id).toBe(videoBlockId);
      expect(b1.blockTypeId).toBe('video');
      expect(b2.id).toBe(mcqBlockId);
      expect(b2.blockTypeId).toBe('multiple-choice');
    });

    it('rejects version creation if draft has an invalid block', async () => {
      // Temporarily inject an invalid block directly via DB to test version creation gate
      const draft = await prisma.courseDraft.findUniqueOrThrow({
        where: { courseId: courseAId },
      });

      const badBlock = await prisma.draftBlockInstance.create({
        data: {
          draftId: draft.id,
          blockTypeId: 'video',
          title: 'Bad URL Block',
          orderIndex: 2,
          config: { url: 'ftp://bad-url' },
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/versions`)
        .set('Cookie', userACookie)
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain('Draft contains invalid activity block instances');

      // Clean up the invalid block
      await prisma.draftBlockInstance.delete({ where: { id: badBlock.id } });
    });
  });

  describe('5. Minimal AB Runtime Execution, Lifecycle & Idempotency', () => {
    let runVideoId: string;
    let runMcqId: string;

    it('starts an active run against pinned version for Video block', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', userACookie)
        .send({
          courseVersionId: courseVersion1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: 'start_video_1',
        })
        .expect(HttpStatus.CREATED);

      runVideoId = res.body.id;
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.block.blockTypeId).toBe('video');
      expect(res.body.block.learnerConfig.url).toBe('https://cdn.ule.internal/lessons/intro.mp4');
    });

    it('idempotently returns existing run on duplicate start request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', userACookie)
        .send({
          courseVersionId: courseVersion1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: 'start_video_1',
        });

      expect([HttpStatus.OK, HttpStatus.CREATED]).toContain(res.status);
      expect(res.body.id).toBe(runVideoId);
    });

    it('completes Video block as UNGRADED without score, pass, or mastery', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runVideoId}/commands`)
        .set('Cookie', userACookie)
        .send({ command: 'FINISH', idempotencyKey: 'finish_video_cmd_1' })
        .expect(HttpStatus.OK);

      expect(res.body.status).toBe('CLOSED');
      expect(res.body.closeReason).toBe('COMPLETED');
      expect(res.body.latestAssessment).toBeNull();

      // Verify no graded assessments were generated
      const resultsRes = await request(app.getHttpServer())
        .get(`/api/v1/runs/${runVideoId}/results`)
        .set('Cookie', userACookie)
        .expect(HttpStatus.OK);

      expect(resultsRes.body.assessments).toHaveLength(0);
      expect(resultsRes.body.attempts).toHaveLength(0);
    });

    it('starts Multiple Choice run and CRITICAL: verifies answerKey is stripped from learner view', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', userACookie)
        .send({
          courseVersionId: courseVersion1Id,
          blockInstanceId: mcqBlockId,
          idempotencyKey: 'start_mcq_run_key_1',
        })
        .expect(HttpStatus.CREATED);

      runMcqId = res.body.id;
      expect(res.body.status).toBe('ACTIVE');

      const learnerConfig = res.body.block.learnerConfig;
      expect(learnerConfig).toHaveProperty('question');
      expect(learnerConfig).toHaveProperty('options');

      // ABSOLUTELY NO ANSWER KEY LEAKAGE
      expect(learnerConfig).not.toHaveProperty('answerKey');
      expect(learnerConfig).not.toHaveProperty('correctOptionId');

      for (const opt of learnerConfig.options) {
        expect(opt).not.toHaveProperty('explanation');
        expect(opt).not.toHaveProperty('isCorrect');
      }
    });

    it('exercises suspend and resume lifecycle transitions', async () => {
      // Suspend
      const suspendRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runMcqId}/commands`)
        .set('Cookie', userACookie)
        .send({ command: 'SUSPEND', idempotencyKey: 'cmd_suspend_1' })
        .expect(HttpStatus.OK);
      expect(suspendRes.body.status).toBe('SUSPENDED');

      // Reject submission while suspended
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runMcqId}/commands`)
        .set('Cookie', userACookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_client' },
          idempotencyKey: 'cmd_reject_sub_1',
        })
        .expect(HttpStatus.BAD_REQUEST);

      // Resume
      const resumeRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runMcqId}/commands`)
        .set('Cookie', userACookie)
        .send({ command: 'RESUME', idempotencyKey: 'cmd_resume_1' })
        .expect(HttpStatus.OK);
      expect(resumeRes.body.status).toBe('ACTIVE');
    });

    it('submits response with hint/assistance: verifies server evaluation and assistance tracking', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runMcqId}/commands`)
        .set('Cookie', userACookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: {
            selectedOptionId: 'opt_client',
            usedHint: true,
          },
          idempotencyKey: 'attempt_assisted_1',
        })
        .expect(HttpStatus.OK);

      expect(res.body.latestAttempt).toBeDefined();
      expect(res.body.latestAttempt.attemptNumber).toBe(1);
      expect(res.body.latestAttempt.assisted).toBe(true);
      expect(res.body.latestAttempt.supportContext.hintUsed).toBe(true);

      // Authoritative backend assessment
      expect(res.body.latestAssessment).toBeDefined();
      expect(res.body.latestAssessment.isCorrect).toBe(true);
      expect(res.body.latestAssessment.score).toBe(1.0);
      expect(res.body.latestAssessment.evaluatorId).toBe('ule-mcq-deterministic-evaluator-v1');
    });

    it('retrying SUBMIT_RESPONSE with same idempotency key does not duplicate attempt or assessment', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runMcqId}/commands`)
        .set('Cookie', userACookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: {
            selectedOptionId: 'opt_client',
            usedHint: true,
          },
          idempotencyKey: 'attempt_assisted_1',
        })
        .expect(HttpStatus.OK);

      // Verify attempts count is still 1
      const resultsRes = await request(app.getHttpServer())
        .get(`/api/v1/runs/${runMcqId}/results`)
        .set('Cookie', userACookie)
        .expect(HttpStatus.OK);

      expect(resultsRes.body.attempts).toHaveLength(1);
      expect(resultsRes.body.assessments).toHaveLength(1);
    });

    it('submits independent attempt: preserves distinct context without assistance', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runMcqId}/commands`)
        .set('Cookie', userACookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: {
            selectedOptionId: 'opt_client',
            usedHint: false,
          },
          idempotencyKey: 'attempt_independent_2',
        })
        .expect(HttpStatus.OK);

      expect(res.body.latestAttempt.attemptNumber).toBe(2);
      expect(res.body.latestAttempt.assisted).toBe(false);
      expect(res.body.latestAttempt.supportContext.hintUsed).toBe(false);
      expect(res.body.latestAttempt.supportContext.provenance).toBe('SELF_REPORTED_INDEPENDENT');
    });

    it('client-supplied score or mastery has zero authority', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runMcqId}/commands`)
        .set('Cookie', userACookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: {
            selectedOptionId: 'opt_backend', // Incorrect answer
            score: 100.0,                    // Forged score
            isCorrect: true,                 // Forged correctness
            mastery: 'MASTERED',             // Forged mastery
          },
          idempotencyKey: 'forged_attempt_3',
        })
        .expect(HttpStatus.OK);

      // Server evaluator deterministically marked it incorrect with score 0.0
      expect(res.body.latestAssessment.isCorrect).toBe(false);
      expect(res.body.latestAssessment.score).toBe(0.0);
    });

    it('finishes run and rejects further submissions once CLOSED', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runMcqId}/commands`)
        .set('Cookie', userACookie)
        .send({ command: 'FINISH', idempotencyKey: 'cmd_finish_mcq_1' })
        .expect(HttpStatus.OK);

      // Rejects submission on CLOSED run
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runMcqId}/commands`)
        .set('Cookie', userACookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_client' },
          idempotencyKey: 'cmd_sub_after_closed_1',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('User B cannot access User A run or results (returns 404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/runs/${runMcqId}`)
        .set('Cookie', userBCookie)
        .expect(HttpStatus.NOT_FOUND);

      await request(app.getHttpServer())
        .get(`/api/v1/runs/${runMcqId}/results`)
        .set('Cookie', userBCookie)
        .expect(HttpStatus.NOT_FOUND);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runMcqId}/commands`)
        .set('Cookie', userBCookie)
        .send({ command: 'RESUME', idempotencyKey: 'unauth_resume_cmd' })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('6. Pinned Version Immutability Across Subsequent Draft Edits', () => {
    it('mutating the draft does NOT affect the existing pinned CourseVersion or Run', async () => {
      // 1. Creator modifies Draft: updates Video block URL and title
      const draftRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/draft`)
        .set('Cookie', userACookie)
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseAId}/draft/blocks/${videoBlockId}`)
        .set('Cookie', userACookie)
        .send({
          title: 'Brand New Video Title (Draft v2)',
          config: {
            url: 'https://cdn.ule.internal/new-version.mp4',
            durationSeconds: 999,
          },
          expectedRevision: draftRes.body.revision,
        })
        .expect(HttpStatus.OK);

      // 2. Creator starts a run pinned to CourseVersion 1
      const runV1Res = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', userACookie)
        .send({
          courseVersionId: courseVersion1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: 'start_v1_run_pinned',
        })
        .expect(HttpStatus.CREATED);

      // 3. Confirm the Run uses the original PINNED snapshot data, NOT the mutable draft
      expect(runV1Res.body.block.title).toBe('Lesson 1: Introduction Video');
      expect(runV1Res.body.block.learnerConfig.url).toBe(
        'https://cdn.ule.internal/lessons/intro.mp4',
      );
      expect(runV1Res.body.block.learnerConfig.durationSeconds).toBe(180);

      // 4. Confirm the historical CourseVersion 1 entity itself remains completely unchanged
      const v1Res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/versions/${courseVersion1Id}`)
        .set('Cookie', userACookie)
        .expect(HttpStatus.OK);

      const b1 = (v1Res.body.snapshot as any).blocks[0];
      expect(b1.title).toBe('Lesson 1: Introduction Video');
      expect(b1.config.url).toBe('https://cdn.ule.internal/lessons/intro.mp4');
    });
  });
});
