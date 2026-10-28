/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import * as crypto from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { createCorsOriginValidator } from '../src/common/utils/cors.util';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';

function parseMcpResponse(res: request.Response): any {
  if (res.body && typeof res.body === 'object' && Object.keys(res.body).length > 0) {
    return res.body;
  }
  const text = res.text || '';
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      try {
        return JSON.parse(trimmed.slice(5).trim());
      } catch {
        // continue
      }
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

describe('Phase 2B: Secure MCP Authoring End-to-End Scenario (Real PostgreSQL Integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;

  const trustedOrigin = 'http://localhost:5173';
  let userAId: string;
  let userBId: string;
  let userAToken: string;
  let userBToken: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);

    app.setGlobalPrefix('api/v1', {
      exclude: ['/.well-known/(.*)', '.well-known/(.*)'],
    });
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

    // 1. Create User A in PostgreSQL
    const userAEmail = `author_a_${Date.now()}@ule.internal`;
    const signupA = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send({
        email: userAEmail,
        password: 'Password123!',
        name: 'Author Alice',
      })
      .expect(HttpStatus.OK);
    userAId = signupA.body.user.id;

    // 2. Create User B in PostgreSQL
    const userBEmail = `author_b_${Date.now()}@ule.internal`;
    const signupB = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send({
        email: userBEmail,
        password: 'Password123!',
        name: 'Author Bob',
      })
      .expect(HttpStatus.OK);
    userBId = signupB.body.user.id;

    // 3. Issue authorized MCP access tokens for User A and User B
    userAToken = await generateSignedMcpToken(userAId, 'claude_author_client');
    userBToken = await generateSignedMcpToken(userBId, 'cursor_author_client');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  async function generateSignedMcpToken(
    userId: string,
    clientId: string,
  ): Promise<string> {
    const aud = authService.getMcpResourceUri();
    const iss = authService.getMcpIssuer();
    const now = Math.floor(Date.now() / 1000);
    const jti = crypto.randomUUID();

    const signed = await (authService.auth.api as any).signJWT({
      body: {
        payload: {
          sub: userId,
          azp: clientId,
          client_id: clientId,
          scope: 'course:read course:write',
          aud,
          iss,
          exp: now + 3600,
          jti,
        },
      },
    });

    return signed.token;
  }

  async function callMcpTool(
    token: string,
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<any> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      })
      .expect(HttpStatus.OK);

    const parsed = parseMcpResponse(res);
    expect(parsed).toHaveProperty('result');
    return parsed.result;
  }

  // =========================================================================
  // 13-STEP END-TO-END EXTERNAL CLIENT SCENARIO
  // =========================================================================

  describe('13-Step External MCP Client Authoring Scenario', () => {
    let createdCourseId: string;
    let initialRevision: number;
    let videoBlockId: string;
    let revisionAfterVideo: number;
    let mcqBlockId: string;
    let revisionAfterMcq: number;
    let createdVersionId: string;

    it('Step 1 & 2: User A connects external client with authoring access (Verified via JWT)', async () => {
      expect(userAToken).toBeDefined();
      expect(userAId).toBeDefined();
    });

    it('Step 3: External client discovers supported ULE Block Types', async () => {
      const result = await callMcpTool(userAToken, 'ule_list_block_types');
      expect(result.isError).toBeFalsy();

      const blockTypes = JSON.parse(result.content[0].text);
      expect(Array.isArray(blockTypes)).toBe(true);
      const typeIds = blockTypes.map((b: any) => b.blockTypeId);
      expect(typeIds).toContain('video');
      expect(typeIds).toContain('multiple-choice');
      expect(typeIds).toContain('coding');
    });

    it('Step 4: Client creates a private Course through MCP', async () => {
      const idempotencyKey = crypto.randomUUID();
      const result = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: 'Mastering Activity Block Protocol',
        description: 'Complete hands-on course authored via external MCP client.',
        summary: 'Deep dive into ABP runtime and state machine invariants.',
        idempotencyKey,
      });

      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(result.content[0].text);
      expect(payload.course).toMatchObject({
        id: expect.any(String),
        visibility: 'PRIVATE',
        ownerId: userAId,
      });
      expect(payload.draft).toMatchObject({
        title: 'Mastering Activity Block Protocol',
        revision: 1,
      });

      createdCourseId = payload.course.id;

      // PostgreSQL database check
      const dbCourse = await prisma.course.findUnique({
        where: { id: createdCourseId },
      });
      expect(dbCourse).not.toBeNull();
      expect(dbCourse!.visibility).toBe('PRIVATE');
      expect(dbCourse!.ownerId).toBe(userAId);
    });

    it('Step 5: Client reads initial CourseDraft revision', async () => {
      const result = await callMcpTool(userAToken, 'ule_get_course_draft', {
        courseId: createdCourseId,
      });

      expect(result.isError).toBeFalsy();
      const draft = JSON.parse(result.content[0].text);
      expect(draft.courseId).toBe(createdCourseId);
      expect(draft.revision).toBe(1);
      initialRevision = draft.revision;
    });

    it('Step 6: Client adds a validated Video Block under atomic revision check', async () => {
      const result = await callMcpTool(userAToken, 'ule_add_draft_block', {
        courseId: createdCourseId,
        expectedRevision: initialRevision,
        blockTypeId: 'video',
        typeVersion: '1.0.0',
        title: 'Introduction to ULE Architecture',
        orderIndex: 0,
        config: {
          url: 'https://cdn.ule.internal/videos/architecture-intro.mp4',
          durationSeconds: 300,
        },
        idempotencyKey: crypto.randomUUID(),
      });

      expect(result.isError).toBeFalsy();
      const block = JSON.parse(result.content[0].text);
      expect(block).toMatchObject({
        id: expect.any(String),
        blockTypeId: 'video',
        title: 'Introduction to ULE Architecture',
        orderIndex: 0,
      });
      videoBlockId = block.id;
    });

    it('Step 7: Client reloads CourseDraft revision confirming monotonic increment', async () => {
      const result = await callMcpTool(userAToken, 'ule_get_course_draft', {
        courseId: createdCourseId,
      });

      expect(result.isError).toBeFalsy();
      const draft = JSON.parse(result.content[0].text);
      expect(draft.revision).toBe(2);
      revisionAfterVideo = draft.revision;
    });

    it('Step 8: Client adds a validated Multiple Choice Block with options and protected evaluator', async () => {
      const result = await callMcpTool(userAToken, 'ule_add_draft_block', {
        courseId: createdCourseId,
        expectedRevision: revisionAfterVideo,
        blockTypeId: 'multiple-choice',
        typeVersion: '1.0.0',
        title: 'Knowledge Check: Architecture Boundaries',
        orderIndex: 1,
        config: {
          question: 'Does the frontend client ever connect directly to PostgreSQL in ULE?',
          options: [
            { id: 'opt-yes', text: 'Yes, for speed' },
            {
              id: 'opt-no',
              text: 'No, NestJS owns authoritative business rules and DB access',
            },
          ],
          answerKey: {
            correctOptionId: 'opt-no',
            explanation:
              'NestJS owns authoritative business rules and PostgreSQL access.',
          },
        },
        idempotencyKey: crypto.randomUUID(),
      });

      expect(result.isError).toBeFalsy();
      const block = JSON.parse(result.content[0].text);
      expect(block).toMatchObject({
        id: expect.any(String),
        blockTypeId: 'multiple-choice',
        title: 'Knowledge Check: Architecture Boundaries',
        orderIndex: 1,
      });
      mcqBlockId = block.id;
    });

    it('Step 9: Client validates Course Draft against developer schemas', async () => {
      // Reload revision
      const draftRes = await callMcpTool(userAToken, 'ule_get_course_draft', {
        courseId: createdCourseId,
      });
      const draft = JSON.parse(draftRes.content[0].text);
      revisionAfterMcq = draft.revision;
      expect(revisionAfterMcq).toBe(3);

      const valResult = await callMcpTool(userAToken, 'ule_validate_course_draft', {
        courseId: createdCourseId,
      });

      expect(valResult.isError).toBeFalsy();
      const validation = JSON.parse(valResult.content[0].text);
      expect(validation).toMatchObject({
        courseId: createdCourseId,
        valid: true,
        blockCount: 2,
        errors: [],
      });
    });

    it('Step 10: Client creates an immutable private CourseVersion', async () => {
      const versionResult = await callMcpTool(
        userAToken,
        'ule_create_private_course_version',
        {
          courseId: createdCourseId,
          idempotencyKey: crypto.randomUUID(),
        },
      );

      expect(versionResult.isError).toBeFalsy();
      const version = JSON.parse(versionResult.content[0].text);
      expect(version).toMatchObject({
        id: expect.any(String),
        courseId: createdCourseId,
        versionNumber: 1,
      });
      createdVersionId = version.id;
    });

    it('Step 11: Client retrieves resulting version ID and version number', async () => {
      const result = await callMcpTool(userAToken, 'ule_get_course_version', {
        courseId: createdCourseId,
        versionId: createdVersionId,
      });

      expect(result.isError).toBeFalsy();
      const version = JSON.parse(result.content[0].text);
      expect(version.id).toBe(createdVersionId);
      expect(version.versionNumber).toBe(1);
    });

    it('Step 12: ULE verifies that both configured Block Instances are present in the snapshot', async () => {
      const result = await callMcpTool(userAToken, 'ule_get_course_version', {
        courseId: createdCourseId,
        versionId: createdVersionId,
      });

      const version = JSON.parse(result.content[0].text);
      expect(version.snapshot).toBeDefined();
      expect(Array.isArray(version.snapshot.blocks)).toBe(true);
      expect(version.snapshot.blocks.length).toBe(2);

      const blockTypeIds = version.snapshot.blocks.map((b: any) => b.blockTypeId);
      expect(blockTypeIds).toContain('video');
      expect(blockTypeIds).toContain('multiple-choice');

      const snapshotBlockIds = version.snapshot.blocks.map((b: any) => b.id);
      expect(snapshotBlockIds).toContain(videoBlockId);
      expect(snapshotBlockIds).toContain(mcqBlockId);

      // Verify PostgreSQL snapshot records
      const dbVersion = await prisma.courseVersion.findUnique({
        where: { id: createdVersionId },
      });
      expect(dbVersion).not.toBeNull();
      const snapshotBlocks = (dbVersion!.snapshot as any).blocks;
      expect(snapshotBlocks.length).toBe(2);
      expect(snapshotBlocks[0].blockTypeId).toBe('video');
      expect(snapshotBlocks[1].blockTypeId).toBe('multiple-choice');
    });

    it('Step 13: User B connects separately and CANNOT read or mutate User A private course', async () => {
      // 1. User B cannot read User A's course
      const readCourseRes = await callMcpTool(userBToken, 'ule_get_my_course', {
        courseId: createdCourseId,
      });
      expect(readCourseRes.isError).toBe(true);
      expect(readCourseRes.content[0].text).toContain('404');

      // 2. User B cannot read User A's draft
      const readDraftRes = await callMcpTool(userBToken, 'ule_get_course_draft', {
        courseId: createdCourseId,
      });
      expect(readDraftRes.isError).toBe(true);
      expect(readDraftRes.content[0].text).toContain('404');

      // 3. User B cannot list User A's draft blocks
      const listBlocksRes = await callMcpTool(userBToken, 'ule_list_draft_blocks', {
        courseId: createdCourseId,
      });
      expect(listBlocksRes.isError).toBe(true);
      expect(listBlocksRes.content[0].text).toContain('404');

      // 4. User B cannot add block to User A's course
      const addBlockRes = await callMcpTool(userBToken, 'ule_add_draft_block', {
        courseId: createdCourseId,
        expectedRevision: revisionAfterMcq,
        blockTypeId: 'video',
        title: 'Malicious Injected Block',
        config: { url: 'https://evil.com/hacked.mp4', durationSeconds: 10 },
      });
      expect(addBlockRes.isError).toBe(true);
      expect(addBlockRes.content[0].text).toContain('404');

      // 5. User B cannot create version on User A's course
      const createVersionRes = await callMcpTool(
        userBToken,
        'ule_create_private_course_version',
        {
          courseId: createdCourseId,
        },
      );
      expect(createVersionRes.isError).toBe(true);
      expect(createVersionRes.content[0].text).toContain('404');

      // 6. User B listing their courses does NOT contain User A's course
      const listCoursesRes = await callMcpTool(userBToken, 'ule_list_my_courses', {});
      expect(listCoursesRes.isError).toBeFalsy();
      const userBCourses = JSON.parse(listCoursesRes.content[0].text);
      const userBCourseIds = userBCourses.map((c: any) => c.id);
      expect(userBCourseIds).not.toContain(createdCourseId);
    });
  });

  // =========================================================================
  // MUTATION IDEMPOTENCY & CONFLICT PROTECTION
  // =========================================================================

  describe('Durable Mutation Idempotency & Conflict Guards', () => {
    it('retrying Course creation with same idempotencyKey returns cached course without duplicate insertion', async () => {
      const idempotencyKey = crypto.randomUUID();
      const uniqueTitle = `Idempotent Test Course ${Date.now()}`;
      const payload = {
        title: uniqueTitle,
        description: 'First attempt',
        idempotencyKey,
      };

      const res1 = await callMcpTool(userAToken, 'ule_create_private_course', payload);
      expect(res1.isError).toBeFalsy();
      const course1 = JSON.parse(res1.content[0].text);

      // Replay with identical key and payload
      const res2 = await callMcpTool(userAToken, 'ule_create_private_course', payload);
      expect(res2.isError).toBeFalsy();
      const course2 = JSON.parse(res2.content[0].text);

      expect(course2.course.id).toBe(course1.course.id);

      // Verify only ONE course exists with this title in PostgreSQL
      const dbCourses = await prisma.courseDraft.findMany({
        where: { title: uniqueTitle },
      });
      expect(dbCourses.length).toBe(1);
    });

    it('reusing idempotencyKey with DIFFERENT payload yields explicit Conflict (HTTP 409)', async () => {
      const idempotencyKey = crypto.randomUUID();

      await callMcpTool(userAToken, 'ule_create_private_course', {
        title: 'Original Title',
        idempotencyKey,
      });

      const resConflict = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: 'Changed Conflicting Title',
        idempotencyKey,
      });

      expect(resConflict.isError).toBe(true);
      expect(resConflict.content[0].text).toContain('409');
      expect(resConflict.content[0].text).toContain('different payload');
    });
  });

  // =========================================================================
  // OPTIMISTIC CONCURRENCY CONTROL & REVISION GATES
  // =========================================================================

  describe('Optimistic Concurrency & Revision Checks', () => {
    let testCourseId: string;

    beforeAll(async () => {
      const res = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: 'Concurrency Course',
      });
      testCourseId = JSON.parse(res.content[0].text).course.id;
    });

    it('ule_add_draft_block rejects stale expectedRevision with Conflict', async () => {
      const res = await callMcpTool(userAToken, 'ule_add_draft_block', {
        courseId: testCourseId,
        expectedRevision: 999, // Stale revision (actual is 1)
        blockTypeId: 'video',
        title: 'Stale Block',
        config: { url: 'https://cdn.ule.internal/vid.mp4', durationSeconds: 60 },
      });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('409');
    });
  });

  // =========================================================================
  // PROHIBITED OPERATIONS ENFORCEMENT
  // =========================================================================

  describe('Prohibited Operations Enforcement', () => {
    it('calling unregistered learner-attempt tool fails with Tool Not Found', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          jsonrpc: '2.0',
          id: 901,
          method: 'tools/call',
          params: {
            name: 'submit_learner_attempt',
            arguments: { runId: 'fake-run', response: {} },
          },
        })
        .expect(HttpStatus.OK);

      const parsed = parseMcpResponse(res);
      expect(parsed.error || parsed.result?.isError).toBeTruthy();
    });

    it('calling unregistered mastery tool fails with Tool Not Found', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          jsonrpc: '2.0',
          id: 902,
          method: 'tools/call',
          params: {
            name: 'alter_mastery',
            arguments: { score: 100 },
          },
        })
        .expect(HttpStatus.OK);

      const parsed = parseMcpResponse(res);
      expect(parsed.error || parsed.result?.isError).toBeTruthy();
    });

    it('calling unregistered public publish tool fails with Tool Not Found', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          jsonrpc: '2.0',
          id: 903,
          method: 'tools/call',
          params: {
            name: 'publish_course_publicly',
            arguments: { courseId: 'fake-course' },
          },
        })
        .expect(HttpStatus.OK);

      const parsed = parseMcpResponse(res);
      expect(parsed.error || parsed.result?.isError).toBeTruthy();
    });
  });

  // =========================================================================
  // AUDIT LOGGING VERIFICATION
  // =========================================================================

  describe('Audit Logging Verification', () => {
    it('verifies that successful mutations record audit log entries in PostgreSQL', async () => {
      const logs = await prisma.mcpAuditLog.findMany({
        where: { userId: userAId },
        orderBy: { createdAt: 'desc' },
      });

      expect(logs.length).toBeGreaterThanOrEqual(1);
      const toolNames = logs.map((l) => l.toolName);
      expect(toolNames).toContain('ule_create_private_course');

      const sampleLog = logs[0];
      expect(sampleLog.userId).toBe(userAId);
      expect(sampleLog.status).toBe('SUCCESS');
      expect(sampleLog.createdAt).toBeInstanceOf(Date);
    });
  });
});
