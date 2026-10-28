/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { createCorsOriginValidator } from '../src/common/utils/cors.util';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { BlockTypeRegistry } from '../src/modules/abp/registry/block-type.registry';
import { VideoBlockDefinition } from '../src/modules/abp/registry/types/video.block';

function extractCookies(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

describe('Phase 1B Final Integrity Hardening — Real PostgreSQL Concurrency & Invariants', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let registry: BlockTypeRegistry;

  const trustedOrigin = 'http://localhost:5173';

  const userAuthor = {
    email: `hardening_author_${Date.now()}@ule.internal`,
    password: 'SecurePassword123!',
    name: 'Hardening Author',
  };

  let authorCookie: string;
  let courseId: string;
  let videoBlockId: string;
  let mcqBlockId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    registry = app.get(BlockTypeRegistry);

    // Register a historical version "video@0.9.0" to test historical pinned execution compatibility
    class HistoricalVideoBlockDefinition extends VideoBlockDefinition {
      override readonly manifest = {
        ...new VideoBlockDefinition().manifest,
        version: '0.9.0',
        name: 'Video Learning Content (Historical v0.9)',
      };
    }
    registry.register(new HistoricalVideoBlockDefinition());

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

    // Register Author user
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userAuthor)
      .expect(HttpStatus.OK);
    authorCookie = extractCookies(regRes);

    // Create Course
    const courseRes = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Cookie', authorCookie)
      .send({
        title: 'Concurrency & Integrity Hardening Course',
        description: 'Verifies Gate 1 through Gate 4 invariants on real PostgreSQL',
      })
      .expect(HttpStatus.CREATED);

    courseId = courseRes.body.course.id;

    // Add Video Block (Revision 1 -> 2)
    const vRes = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/draft/blocks`)
      .set('Cookie', authorCookie)
      .send({
        blockTypeId: 'video',
        title: 'Base Video Block',
        expectedRevision: 1,
        config: {
          url: 'https://cdn.ule.internal/vid1.mp4',
          durationSeconds: 120,
        },
      })
      .expect(HttpStatus.CREATED);
    videoBlockId = vRes.body.id;

    // Add MCQ Block (Revision 2 -> 3)
    const mcqRes = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/draft/blocks`)
      .set('Cookie', authorCookie)
      .send({
        blockTypeId: 'multiple-choice',
        title: 'Base MCQ Block',
        expectedRevision: 2,
        config: {
          question: 'What is 2 + 2?',
          options: [
            { id: 'opt_3', text: '3' },
            { id: 'opt_4', text: '4' },
          ],
          answerKey: { correctOptionId: 'opt_4', explanation: '2 + 2 equals 4' },
          feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
          allowHints: true,
          hintText: 'Think of basic addition.',
        },
      })
      .expect(HttpStatus.CREATED);
    mcqBlockId = mcqRes.body.id;
  });

  afterAll(async () => {
    if (courseId) {
      await prisma.course.deleteMany({ where: { id: courseId } });
    }
    await prisma.user.deleteMany({
      where: { email: userAuthor.email },
    });
    await app.close();
  });

  // =========================================================================
  // GATE 1 — Atomic Draft Block Mutations & Concurrency
  // =========================================================================
  describe('Gate 1 — Atomic Draft Block mutations & Concurrency', () => {
    it('rejects block addition when expectedRevision is missing (HTTP 400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/blocks`)
        .set('Cookie', authorCookie)
        .send({
          blockTypeId: 'video',
          title: 'Missing Revision Block',
          config: { url: 'https://cdn.ule.internal/vid.mp4' },
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('rejects block update when expectedRevision is missing (HTTP 400)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseId}/draft/blocks/${videoBlockId}`)
        .set('Cookie', authorCookie)
        .send({
          title: 'Updated Title',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('rejects block deletion when expectedRevision query param is missing (HTTP 400)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/courses/${courseId}/draft/blocks/${videoBlockId}`)
        .set('Cookie', authorCookie)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('rejects block reordering when expectedRevision is missing (HTTP 400)', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/courses/${courseId}/draft/blocks/reorder`)
        .set('Cookie', authorCookie)
        .send({
          blockIds: [mcqBlockId, videoBlockId],
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('rejects block reordering containing duplicate block IDs (HTTP 400)', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/courses/${courseId}/draft/blocks/reorder`)
        .set('Cookie', authorCookie)
        .send({
          blockIds: [videoBlockId, videoBlockId], // duplicate IDs!
          expectedRevision: 3,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('CONCURRENT MUTATION TEST: exactly one conflicting mutation wins when two requests submit same expectedRevision', async () => {
      // Current draft revision is 3. We send two concurrent PATCH requests with expectedRevision: 3.
      const req1 = request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseId}/draft/blocks/${videoBlockId}`)
        .set('Cookie', authorCookie)
        .send({
          title: 'Concurrent Winner Candidate A',
          expectedRevision: 3,
        });

      const req2 = request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseId}/draft/blocks/${videoBlockId}`)
        .set('Cookie', authorCookie)
        .send({
          title: 'Concurrent Winner Candidate B',
          expectedRevision: 3,
        });

      const [res1, res2] = await Promise.all([req1, req2]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must succeed (200 OK) and exactly one must fail with Conflict (409)
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);

      // Confirm draft revision incremented exactly once (from 3 to 4)
      const draftRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/draft`)
        .set('Cookie', authorCookie)
        .expect(HttpStatus.OK);
      expect(draftRes.body.revision).toBe(4);
    });
  });

  // =========================================================================
  // GATE 2 — Consistent CourseVersion Snapshots
  // =========================================================================
  describe('Gate 2 — Consistent CourseVersion Snapshots & Authoring Locks', () => {
    it('CONCURRENT SNAPSHOT TEST: Version creation racing with concurrent metadata edit produces consistent snapshot and monotonic version', async () => {
      // Current revision is 4. We race a version creation with a draft metadata update with expectedRevision: 4.
      const versionPromise = request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions`)
        .set('Cookie', authorCookie);

      const metadataPromise = request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseId}/draft`)
        .set('Cookie', authorCookie)
        .send({
          title: 'Hardening Course Renamed Concurrently',
          expectedRevision: 4,
        });

      const [versionRes, metaRes] = await Promise.all([versionPromise, metadataPromise]);

      // Both must complete cleanly without 500 or deadlock
      expect([HttpStatus.OK, HttpStatus.CREATED, HttpStatus.CONFLICT]).toContain(versionRes.status);
      expect([HttpStatus.OK, HttpStatus.CONFLICT]).toContain(metaRes.status);

      // Verify that CourseVersion 1 exists, has monotonic versionNumber 1, and holds consistent blocks
      const v1Res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/versions`)
        .set('Cookie', authorCookie)
        .expect(HttpStatus.OK);

      expect(v1Res.body.length).toBeGreaterThanOrEqual(1);
      const v1 = v1Res.body[0];
      expect(v1.versionNumber).toBe(1);
      expect((v1.snapshot as any).blocks).toHaveLength(2);
    });

    it('creates second version and confirms version numbers are strictly monotonic', async () => {
      const v2Res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions`)
        .set('Cookie', authorCookie)
        .expect(HttpStatus.CREATED);

      expect(v2Res.body.versionNumber).toBe(2);
    });
  });

  // =========================================================================
  // GATE 3 — Runtime Idempotency & State Integrity
  // =========================================================================
  describe('Gate 3 — Runtime Idempotency & State Integrity', () => {
    let pinnedVersionId: string;
    let runId: string;

    beforeAll(async () => {
      const versions = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/versions`)
        .set('Cookie', authorCookie)
        .expect(HttpStatus.OK);
      pinnedVersionId = versions.body[0].id;
    });

    it('rejects startRun when idempotencyKey is missing (HTTP 400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', authorCookie)
        .send({
          courseVersionId: pinnedVersionId,
          blockInstanceId: mcqBlockId,
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('CONCURRENT START RUN TEST: Simultaneous start requests with same idempotencyKey create exactly one Run', async () => {
      const sharedKey = `shared_idemp_start_${Date.now()}`;

      const req1 = request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', authorCookie)
        .send({
          courseVersionId: pinnedVersionId,
          blockInstanceId: mcqBlockId,
          idempotencyKey: sharedKey,
        });

      const req2 = request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', authorCookie)
        .send({
          courseVersionId: pinnedVersionId,
          blockInstanceId: mcqBlockId,
          idempotencyKey: sharedKey,
        });

      const [res1, res2] = await Promise.all([req1, req2]);

      expect([HttpStatus.OK, HttpStatus.CREATED]).toContain(res1.status);
      expect([HttpStatus.OK, HttpStatus.CREATED]).toContain(res2.status);
      expect(res1.body.id).toBe(res2.body.id);

      runId = res1.body.id;

      // Verify in DB that exactly one record exists with this idempotencyKey
      const count = await prisma.aBRun.count({
        where: { idempotencyKey: sharedKey },
      });
      expect(count).toBe(1);
    });

    it('reusing same idempotencyKey with different request parameters returns HTTP 409 Conflict', async () => {
      const testKey = `conflict_test_key_${Date.now()}`;

      // First run creation
      await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', authorCookie)
        .send({
          courseVersionId: pinnedVersionId,
          blockInstanceId: mcqBlockId,
          idempotencyKey: testKey,
        })
        .expect(HttpStatus.CREATED);

      // Replay with different blockInstanceId
      const conflictRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', authorCookie)
        .send({
          courseVersionId: pinnedVersionId,
          blockInstanceId: videoBlockId, // Different block!
          idempotencyKey: testKey,
        })
        .expect(HttpStatus.CONFLICT);

      expect(conflictRes.body.message).toContain('was already used for a different run request');
    });

    it('rejects public command FAIL with HTTP 400 (reserved for trusted runtime authority)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', authorCookie)
        .send({
          command: 'FAIL',
          idempotencyKey: `fail_cmd_key_${Date.now()}`,
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toBeDefined();
    });

    it('CONCURRENT SUBMISSION TEST: racing submissions on same run receive strictly unique, monotonic attempt numbers', async () => {
      const req1 = request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', authorCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_3' },
          idempotencyKey: `racing_sub_a_${Date.now()}`,
        });

      const req2 = request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', authorCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_4' },
          idempotencyKey: `racing_sub_b_${Date.now()}`,
        });

      const [res1, res2] = await Promise.all([req1, req2]);

      expect(res1.status).toBe(HttpStatus.OK);
      expect(res2.status).toBe(HttpStatus.OK);

      const attemptNums = [
        res1.body.latestAttempt.attemptNumber,
        res2.body.latestAttempt.attemptNumber,
      ].sort();

      // Attempts must be sequential numbers [1, 2] without collision
      expect(attemptNums).toEqual([1, 2]);

      // Confirm in DB that exactly 2 attempts exist with numbers 1 and 2
      const attempts = await prisma.aBAttempt.findMany({
        where: { runId },
        orderBy: { attemptNumber: 'asc' },
      });
      expect(attempts).toHaveLength(2);
      expect(attempts[0].attemptNumber).toBe(1);
      expect(attempts[1].attemptNumber).toBe(2);
    });
  });

  // =========================================================================
  // GATE 4 — Trusted Support Provenance & Block Type Versioning
  // =========================================================================
  describe('Gate 4 — Trusted Support Provenance & Block Type Versioning', () => {
    let pinnedVersionId: string;
    let runId: string;

    beforeAll(async () => {
      const versions = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/versions`)
        .set('Cookie', authorCookie)
        .expect(HttpStatus.OK);
      pinnedVersionId = versions.body[0].id;

      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', authorCookie)
        .send({
          courseVersionId: pinnedVersionId,
          blockInstanceId: mcqBlockId,
          idempotencyKey: `gate4_run_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      runId = runRes.body.id;
    });

    it('rejects draft block with unsupported typeVersion explicitly (HTTP 400)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/blocks`)
        .set('Cookie', authorCookie)
        .send({
          blockTypeId: 'video',
          typeVersion: '99.0.0', // Unsupported version
          title: 'Future Version Video',
          expectedRevision: 4,
          config: { url: 'https://cdn.ule.internal/vid.mp4' },
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain("version '99.0.0' is not supported");
    });

    it('allows registering and running historical block version (video@0.9.0)', async () => {
      // Add historical block to draft
      const draftRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/draft`)
        .set('Cookie', authorCookie)
        .expect(HttpStatus.OK);

      const addRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/blocks`)
        .set('Cookie', authorCookie)
        .send({
          blockTypeId: 'video',
          typeVersion: '0.9.0',
          title: 'Historical v0.9 Video',
          expectedRevision: draftRes.body.revision,
          config: { url: 'https://cdn.ule.internal/historical.mp4', durationSeconds: 60 },
        })
        .expect(HttpStatus.CREATED);

      expect(addRes.body.typeVersion).toBe('0.9.0');

      // Snapshot into a new CourseVersion
      const vRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions`)
        .set('Cookie', authorCookie)
        .expect(HttpStatus.CREATED);

      // Start run pinned to historical block
      const historicalRunRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', authorCookie)
        .send({
          courseVersionId: vRes.body.id,
          blockInstanceId: addRes.body.id,
          idempotencyKey: `historical_run_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      expect(historicalRunRes.body.typeVersion).toBe('0.9.0');
      expect(historicalRunRes.body.block.learnerConfig.url).toBe('https://cdn.ule.internal/historical.mp4');
    });

    it('CLIENT FORGERY TEST: client-provided usedHint: false CANNOT erase server-observed assistance', async () => {
      // 1. Learner requests an official server hint
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', authorCookie)
        .send({
          command: 'REQUEST_HINT',
          idempotencyKey: `hint_req_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 2. Client submits response claiming usedHint: false (attempting to forge independent mastery)
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', authorCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: {
            selectedOptionId: 'opt_4',
            usedHint: false, // Forged claim of independence!
          },
          idempotencyKey: `forged_indep_attempt_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Server-authoritative check: assistance is true and provenance is SERVER_OBSERVED
      const latestAttempt = subRes.body.latestAttempt;
      expect(latestAttempt.assisted).toBe(true);
      expect(latestAttempt.supportContext.hintUsed).toBe(true);
      expect(latestAttempt.supportContext.provenance).toBe('SERVER_OBSERVED');
      expect(latestAttempt.supportContext.hintDelivered).toBe(true);
    });

    it('unassisted attempt on fresh run without hint records provenance as SELF_REPORTED_INDEPENDENT', async () => {
      // Start a fresh run without requesting any hint
      const freshRunRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', authorCookie)
        .send({
          courseVersionId: pinnedVersionId,
          blockInstanceId: mcqBlockId,
          idempotencyKey: `fresh_unassisted_run_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${freshRunRes.body.id}/commands`)
        .set('Cookie', authorCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: {
            selectedOptionId: 'opt_4',
            usedHint: false,
          },
          idempotencyKey: `fresh_sub_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      expect(subRes.body.latestAttempt.assisted).toBe(false);
      expect(subRes.body.latestAttempt.supportContext.hintUsed).toBe(false);
      expect(subRes.body.latestAttempt.supportContext.provenance).toBe('SELF_REPORTED_INDEPENDENT');
    });
  });
});
