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
import { CoursesService } from '../src/modules/courses/courses.service';
import { McpService } from '../src/modules/mcp/mcp.service';

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
  let readOnlyToken: string;

  jest.setTimeout(30000);

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
    scopes: string[] = ['course:read', 'course:write'],
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
          scope: scopes.join(' '),
          aud,
          iss,
          exp: now + 3600,
          jti,
        },
      },
    });

    // Ensure client exists
    await prisma.oauthClient.upsert({
      where: { clientId },
      update: {},
      create: {
        clientId,
        clientSecret: 'secret_123',
        name: `Test Client ${clientId}`,
        redirectUris: ['http://localhost:5173/oauth/callback'],
        scopes,
      },
    });

    // Ensure consent exists
    const existingConsent = await prisma.oauthConsent.findFirst({
      where: { clientId, userId },
    });
    if (!existingConsent) {
      await prisma.oauthConsent.create({
        data: {
          clientId,
          userId,
          scopes,
          resources: [aud],
        },
      });
    }

    // Insert active issuance record
    await prisma.oauthAccessToken.create({
      data: {
        token: signed.token,
        referenceId: jti,
        clientId,
        userId,
        scopes,
        resources: [aud],
        expiresAt: new Date((now + 3600) * 1000),
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
        idempotencyKey: crypto.randomUUID(),
      });
      expect(addBlockRes.isError).toBe(true);
      expect(addBlockRes.content[0].text).toContain('404');

      // 5. User B cannot create version on User A's course
      const createVersionRes = await callMcpTool(
        userBToken,
        'ule_create_private_course_version',
        {
          courseId: createdCourseId,
          idempotencyKey: crypto.randomUUID(),
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

    it('concurrent course creation calls with the SAME idempotencyKey result in exactly ONE course created in PostgreSQL', async () => {
      const idempotencyKey = crypto.randomUUID();
      const concurrentTitle = `Concurrent Course ${Date.now()}`;
      const payload = {
        title: concurrentTitle,
        description: 'Testing parallel creation concurrency',
        idempotencyKey,
      };

      const [res1, res2] = await Promise.all([
        callMcpTool(userAToken, 'ule_create_private_course', payload),
        callMcpTool(userAToken, 'ule_create_private_course', payload),
      ]);

      expect(res1.isError).toBeFalsy();
      expect(res2.isError).toBeFalsy();

      const course1 = JSON.parse(res1.content[0].text);
      const course2 = JSON.parse(res2.content[0].text);
      expect(course1.course.id).toBe(course2.course.id);

      const dbCount = await prisma.courseDraft.count({
        where: { title: concurrentTitle },
      });
      expect(dbCount).toBe(1);
    });

    it('concurrent course version creation with SAME idempotencyKey creates exactly ONE CourseVersion', async () => {
      // First create a new course with a valid block to version
      const courseRes = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: `Version Concurrency Course ${Date.now()}`,
        idempotencyKey: crypto.randomUUID(),
      });
      const cId = JSON.parse(courseRes.content[0].text).course.id;

      await callMcpTool(userAToken, 'ule_add_draft_block', {
        courseId: cId,
        expectedRevision: 1,
        blockTypeId: 'video',
        title: 'Concurrent Version Video',
        config: { url: 'https://cdn.ule.internal/vid.mp4', durationSeconds: 100 },
        idempotencyKey: crypto.randomUUID(),
      });

      const vKey = crypto.randomUUID();
      const [vRes1, vRes2] = await Promise.all([
        callMcpTool(userAToken, 'ule_create_private_course_version', {
          courseId: cId,
          idempotencyKey: vKey,
        }),
        callMcpTool(userAToken, 'ule_create_private_course_version', {
          courseId: cId,
          idempotencyKey: vKey,
        }),
      ]);

      expect(vRes1.isError).toBeFalsy();
      expect(vRes2.isError).toBeFalsy();

      const v1 = JSON.parse(vRes1.content[0].text);
      const v2 = JSON.parse(vRes2.content[0].text);
      expect(v1.id).toBe(v2.id);
      expect(v1.versionNumber).toBe(1);

      const totalVersions = await prisma.courseVersion.count({
        where: { courseId: cId },
      });
      expect(totalVersions).toBe(1);
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
        idempotencyKey: crypto.randomUUID(),
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
        idempotencyKey: crypto.randomUUID(),
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
  // GATE 3: LEAST-PRIVILEGE AUTHORING DATA EXPOSURE
  // =========================================================================

  describe('Gate 3 — Least-Privilege Protected Authoring Data Exposure', () => {
    let gate3CourseId: string;
    let gate3McqBlockId: string;
    let gate3VersionId: string;

    beforeAll(async () => {
      // 1. Issue a read-only token (course:read) for User A
      readOnlyToken = await generateSignedMcpToken(
        userAId,
        'claude_readonly_client',
        ['course:read'],
      );

      // 2. User A creates a course with write token
      const courseRes = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: `Gate 3 Least Privilege Course ${Date.now()}`,
        idempotencyKey: crypto.randomUUID(),
      });
      gate3CourseId = JSON.parse(courseRes.content[0].text).course.id;

      // 3. User A adds a multiple-choice block with answerKey & explanation
      const blockRes = await callMcpTool(userAToken, 'ule_add_draft_block', {
        courseId: gate3CourseId,
        expectedRevision: 1,
        blockTypeId: 'multiple-choice',
        typeVersion: '1.0.0',
        title: 'Secret Question Block',
        orderIndex: 0,
        config: {
          question: 'What is the answer to everything?',
          options: [
            { id: 'opt-42', text: '42' },
            { id: 'opt-43', text: '43' },
          ],
          answerKey: {
            correctOptionId: 'opt-42',
            explanation: '42 is the Hitchhikers answer.',
          },
        },
        idempotencyKey: crypto.randomUUID(),
      });
      gate3McqBlockId = JSON.parse(blockRes.content[0].text).id;

      // 4. Create version
      const vRes = await callMcpTool(userAToken, 'ule_create_private_course_version', {
        courseId: gate3CourseId,
        idempotencyKey: crypto.randomUUID(),
      });
      gate3VersionId = JSON.parse(vRes.content[0].text).id;
    });

    it('caller with course:read calling ule_get_course_draft gets sanitized block configs (answerKey omitted)', async () => {
      const res = await callMcpTool(readOnlyToken, 'ule_get_course_draft', {
        courseId: gate3CourseId,
      });
      expect(res.isError).toBeFalsy();
      const draft = JSON.parse(res.content[0].text);
      expect(draft.blocks).toBeDefined();
      const mcq = draft.blocks.find((b: any) => b.id === gate3McqBlockId);
      expect(mcq).toBeDefined();
      expect(mcq.config.question).toBe('What is the answer to everything?');
      expect(mcq.config.options).toBeDefined();
      expect(mcq.config.answerKey).toBeUndefined();
      expect(mcq.config.explanation).toBeUndefined();
    });

    it('caller with course:read calling ule_list_draft_blocks gets sanitized block configs', async () => {
      const res = await callMcpTool(readOnlyToken, 'ule_list_draft_blocks', {
        courseId: gate3CourseId,
      });
      expect(res.isError).toBeFalsy();
      const blocks = JSON.parse(res.content[0].text);
      const mcq = blocks.find((b: any) => b.id === gate3McqBlockId);
      expect(mcq.config.answerKey).toBeUndefined();
    });

    it('caller with course:read calling ule_get_course_version gets sanitized snapshot block configs', async () => {
      const res = await callMcpTool(readOnlyToken, 'ule_get_course_version', {
        courseId: gate3CourseId,
        versionId: gate3VersionId,
      });
      expect(res.isError).toBeFalsy();
      const version = JSON.parse(res.content[0].text);
      const snapshotMcq = version.snapshot.blocks.find((b: any) => b.id === gate3McqBlockId);
      expect(snapshotMcq).toBeDefined();
      expect(snapshotMcq.config.answerKey).toBeUndefined();
    });

    it('authorized creator with course:write retrieves full unsanitized block config with answerKey', async () => {
      const res = await callMcpTool(userAToken, 'ule_list_draft_blocks', {
        courseId: gate3CourseId,
      });
      expect(res.isError).toBeFalsy();
      const blocks = JSON.parse(res.content[0].text);
      const mcq = blocks.find((b: any) => b.id === gate3McqBlockId);
      expect(mcq.config.answerKey).toBeDefined();
      expect(mcq.config.answerKey.correctOptionId).toBe('opt-42');
      expect(mcq.config.answerKey.explanation).toContain('Hitchhikers');
    });

    it('authorized creator with course:write retrieves full unsanitized snapshot block config with answerKey', async () => {
      const res = await callMcpTool(userAToken, 'ule_get_course_version', {
        courseId: gate3CourseId,
        versionId: gate3VersionId,
      });
      expect(res.isError).toBeFalsy();
      const version = JSON.parse(res.content[0].text);
      const snapshotMcq = version.snapshot.blocks.find((b: any) => b.id === gate3McqBlockId);
      expect(snapshotMcq.config.answerKey).toBeDefined();
      expect(snapshotMcq.config.answerKey.correctOptionId).toBe('opt-42');
    });
  });

  // =========================================================================
  // GATE 4: DURABLE AUDIT LOGGING & ERROR SANITIZATION
  // =========================================================================

  describe('Gate 4 — Durable Audit Guarantees & Error Sanitization', () => {
    it('verifies that successful mutations record SUCCESS audit log entries with principal and client', async () => {
      const logs = await prisma.mcpAuditLog.findMany({
        where: { userId: userAId, status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
      });

      expect(logs.length).toBeGreaterThanOrEqual(1);
      const sample = logs[0];
      expect(sample.userId).toBe(userAId);
      expect(sample.clientId).toBe('claude_author_client');
      expect((sample.details as any)?.durationMs).toBeGreaterThanOrEqual(0);
      expect(sample.createdAt).toBeInstanceOf(Date);
    });

    it('verifies that cross-user access attempts record NOT_FOUND audit log entries in PostgreSQL', async () => {
      const notFoundLogs = await prisma.mcpAuditLog.findMany({
        where: { userId: userBId, status: 'NOT_FOUND' },
      });
      expect(notFoundLogs.length).toBeGreaterThanOrEqual(1);
      const toolNames = notFoundLogs.map((l) => l.toolName);
      expect(toolNames).toContain('ule_get_my_course');
      expect(toolNames).toContain('ule_add_draft_block');
    });

    it('verifies that scope violations record FORBIDDEN audit log entry in PostgreSQL', async () => {
      // Read-only token attempts to call write tool
      const res = await callMcpTool(readOnlyToken, 'ule_create_private_course', {
        title: 'Forbidden Course Attempt',
        idempotencyKey: crypto.randomUUID(),
      });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('Forbidden');

      const forbiddenLogs = await prisma.mcpAuditLog.findMany({
        where: { userId: userAId, status: 'FORBIDDEN' },
      });
      expect(forbiddenLogs.length).toBeGreaterThanOrEqual(1);
      expect(forbiddenLogs[0].toolName).toBe('ule_create_private_course');
    });

    it('verifies that revision and idempotency conflicts record CONFLICT audit log entry in PostgreSQL', async () => {
      const conflictLogs = await prisma.mcpAuditLog.findMany({
        where: { status: 'CONFLICT' },
      });
      expect(conflictLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('verifies that audit log entries NEVER contain raw bearer tokens or passwords', async () => {
      const allLogs = await prisma.mcpAuditLog.findMany({
        take: 50,
      });
      for (const log of allLogs) {
        const str = JSON.stringify(log);
        expect(str).not.toContain('Password123!');
        expect(str).not.toContain('Bearer eyJ');
      }
    });

    it('verifies unexpected internal errors return sanitized [Error 500] without leaking Prisma/SQL trace', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          jsonrpc: '2.0',
          id: 999,
          method: 'tools/call',
          params: {
            name: 'ule_get_course_draft',
            arguments: { courseId: 'non-existent-random-uuid-00000' },
          },
        })
        .expect(HttpStatus.OK);

      const parsed = parseMcpResponse(res);
      expect(parsed.result.isError).toBe(true);
      expect(parsed.result.content[0].text).not.toContain('SELECT');
      expect(parsed.result.content[0].text).not.toContain('prisma.');
      expect(parsed.result.content[0].text).not.toContain('node_modules');
    });
  });

  // =========================================================================
  // GATE A: CRASH-CONSISTENT MUTATION IDEMPOTENCY & FAULT-INJECTION RECOVERY
  // =========================================================================

  describe('Gate A — Crash-Consistent Mutation Idempotency & Fault-Injection Recovery', () => {
    let coursesService: CoursesService;
    let mcpService: McpService;

    beforeAll(() => {
      coursesService = app.get(CoursesService);
      mcpService = app.get(McpService);
    });

    it('Point 1: Fault injected before domain mutation - cleans reservation, allows retry, produces 1 course', async () => {
      const initialCourses = await prisma.course.count({ where: { ownerId: userAId } });
      const idempotencyKey = `gateA_pt1_${Date.now()}`;

      // Spy on coursesService.createCourse to throw before committing
      const origCreateCourse = coursesService.createCourse.bind(coursesService);
      let failedOnce = false;
      coursesService.createCourse = (async (ownerId: string, dto: any, courseId?: string) => {
        if (!failedOnce) {
          failedOnce = true;
          throw new Error('Injected crash BEFORE domain mutation committed');
        }
        return origCreateCourse(ownerId, dto, courseId);
      }) as any;

      // First attempt fails due to pre-mutation fault
      const failRes = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: 'Point 1 Course Failure',
        idempotencyKey,
      });
      expect(failRes.isError).toBe(true);

      // Verify PostgreSQL: Course count is UNCHANGED (mutation did NOT commit)
      expect(await prisma.course.count({ where: { ownerId: userAId } })).toBe(initialCourses);

      // Verify reservation was removed so retries are not blocked
      const reservation = await prisma.mcpMutationIdempotency.findFirst({
        where: { userId: userAId, idempotencyKey },
      });
      expect(reservation).toBeNull();

      // Retry the exact same mutation with the same idempotency key
      const retryRes = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: 'Point 1 Course Failure',
        idempotencyKey,
      });
      expect(retryRes.isError).toBeFalsy();
      const created = JSON.parse(retryRes.content[0].text);
      expect(created.course.id).toBeDefined();

      // Verify PostgreSQL: Course count increased by EXACTLY 1
      expect(await prisma.course.count({ where: { ownerId: userAId } })).toBe(initialCourses + 1);

      coursesService.createCourse = origCreateCourse;
    });

    it('Point 2 (Course): Fault injected after domain mutation commits but before result stored - recovers course, 0 duplicate', async () => {
      const initialCourses = await prisma.course.count({ where: { ownerId: userAId } });
      const idempotencyKey = `gateA_pt2_c_${Date.now()}`;
      const preallocatedCourseId = crypto.randomUUID();

      // 1. Domain mutation commits directly to PostgreSQL (simulating committed transaction)
      const committedCourse = await coursesService.createCourse(
        userAId,
        { title: 'Point 2 Committed Course' },
        preallocatedCourseId,
      );
      expect(committedCourse.course.id).toBe(preallocatedCourseId);

      // 2. Worker crashes before marking COMPLETED: record left as IN_PROGRESS with expired lease
      await prisma.mcpMutationIdempotency.create({
        data: {
          userId: userAId,
          clientId: 'claude_author_client',
          toolName: 'ule_create_private_course',
          idempotencyKey,
          payloadHash: (mcpService as any).computePayloadHash({
            title: 'Point 2 Committed Course',
            idempotencyKey,
          }),
          resourceId: preallocatedCourseId,
          status: 'IN_PROGRESS',
          updatedAt: new Date(Date.now() - 3000), // Expired past 2000ms lease
        },
      });

      // Course count right now is initialCourses + 1
      const countAfterCommit = await prisma.course.count({ where: { ownerId: userAId } });
      expect(countAfterCommit).toBe(initialCourses + 1);

      // 3. Client retries with exact same key and payload
      const retryRes = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: 'Point 2 Committed Course',
        idempotencyKey,
      });
      expect(retryRes.isError).toBeFalsy();
      const recovered = JSON.parse(retryRes.content[0].text);
      expect(recovered.course.id).toBe(preallocatedCourseId);

      // 4. CRITICAL INVARIANT: Course count in PostgreSQL MUST REMAIN EXACTLY countAfterCommit (NO duplicate course!)
      expect(await prisma.course.count({ where: { ownerId: userAId } })).toBe(countAfterCommit);

      // Verify idempotency record is now COMPLETED
      const idempRecord = await prisma.mcpMutationIdempotency.findFirst({
        where: { userId: userAId, idempotencyKey },
      });
      expect(idempRecord?.status).toBe('COMPLETED');
    });

    it('Point 2 (Version): Fault injected after version commits but before result stored - recovers version, 0 duplicate', async () => {
      // Create a course first
      const courseRes = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: `Gate A Version Test Course ${Date.now()}`,
        idempotencyKey: crypto.randomUUID(),
      });
      const courseId = JSON.parse(courseRes.content[0].text).course.id;

      const initialVersions = await prisma.courseVersion.count({ where: { courseId } });
      expect(initialVersions).toBe(0);

      const idempotencyKey = `gateA_pt2_v_${Date.now()}`;
      const preallocatedVersionId = crypto.randomUUID();

      // 1. Version creation commits to PostgreSQL
      const committedVersion = await coursesService.createVersion(courseId, userAId, preallocatedVersionId);
      expect(committedVersion.id).toBe(preallocatedVersionId);

      // 2. Worker leaves IN_PROGRESS record with expired lease
      await prisma.mcpMutationIdempotency.create({
        data: {
          userId: userAId,
          clientId: 'claude_author_client',
          toolName: 'ule_create_private_course_version',
          idempotencyKey,
          payloadHash: (mcpService as any).computePayloadHash({
            courseId,
            idempotencyKey,
          }),
          resourceId: preallocatedVersionId,
          status: 'IN_PROGRESS',
          updatedAt: new Date(Date.now() - 3000),
        },
      });

      // 3. Client retries
      const retryRes = await callMcpTool(userAToken, 'ule_create_private_course_version', {
        courseId,
        idempotencyKey,
      });
      expect(retryRes.isError).toBeFalsy();
      const recovered = JSON.parse(retryRes.content[0].text);
      expect(recovered.id).toBe(preallocatedVersionId);

      // 4. CRITICAL INVARIANT: Version count MUST BE EXACTLY 1 (NO second version created!)
      expect(await prisma.courseVersion.count({ where: { courseId } })).toBe(1);
    });

    it('Point 3: Fault injected during idempotency result persistence - preserves committed resource and recovers', async () => {
      const initialCourses = await prisma.course.count({ where: { ownerId: userAId } });
      const idempotencyKey = `gateA_pt3_${Date.now()}`;

      // Intercept mcpMutationIdempotency.update to throw error during COMPLETED update
      const origUpdate = prisma.mcpMutationIdempotency.update.bind(prisma.mcpMutationIdempotency);
      let failedUpdate = false;
      (prisma.mcpMutationIdempotency as any).update = async (args: any) => {
        if (!failedUpdate && args.data?.status === 'COMPLETED') {
          failedUpdate = true;
          throw new Error('Simulated database disconnect during COMPLETED persistence');
        }
        return origUpdate(args);
      };

      // Call tool: mutation succeeds in domain, update to COMPLETED fails in winner, winner recovers committed resource
      const callRes = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: 'Point 3 Course Persistence Fault',
        idempotencyKey,
      });

      (prisma.mcpMutationIdempotency as any).update = origUpdate;

      // Winner recovered from committed mutation and returned result
      expect(callRes.isError).toBeFalsy();
      const resData = JSON.parse(callRes.content[0].text);
      expect(resData.course.id).toBeDefined();

      // In PostgreSQL: Course count increased by EXACTLY 1
      expect(await prisma.course.count({ where: { ownerId: userAId } })).toBe(initialCourses + 1);

      // On subsequent replay with exact same key, returns identical course
      const replayRes = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: 'Point 3 Course Persistence Fault',
        idempotencyKey,
      });
      expect(replayRes.isError).toBeFalsy();
      const replayData = JSON.parse(replayRes.content[0].text);
      expect(replayData.course.id).toBe(resData.course.id);
      expect(await prisma.course.count({ where: { ownerId: userAId } })).toBe(initialCourses + 1);
    });

    it('Point 4: Concurrent retry and payload conflict verification', async () => {
      const initialCourses = await prisma.course.count({ where: { ownerId: userAId } });
      const idempotencyKey = `gateA_pt4_${Date.now()}`;

      // Two concurrent identical requests
      const [res1, res2] = await Promise.all([
        callMcpTool(userAToken, 'ule_create_private_course', {
          title: 'Point 4 Concurrent Course',
          idempotencyKey,
        }),
        callMcpTool(userAToken, 'ule_create_private_course', {
          title: 'Point 4 Concurrent Course',
          idempotencyKey,
        }),
      ]);

      expect(res1.isError).toBeFalsy();
      expect(res2.isError).toBeFalsy();
      const course1 = JSON.parse(res1.content[0].text);
      const course2 = JSON.parse(res2.content[0].text);
      expect(course1.course.id).toBe(course2.course.id);

      // Exactly 1 course created in PostgreSQL
      expect(await prisma.course.count({ where: { ownerId: userAId } })).toBe(initialCourses + 1);

      // Changed payload with same idempotency key MUST return Conflict
      const conflictRes = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: 'Point 4 CHANGED PAYLOAD Course',
        idempotencyKey,
      });
      expect(conflictRes.isError).toBe(true);
      expect(conflictRes.content[0].text).toContain('409');
      expect(conflictRes.content[0].text).toContain('already used with different payload');

      // Course count still exactly initialCourses + 1
      expect(await prisma.course.count({ where: { ownerId: userAId } })).toBe(initialCourses + 1);
    });
  });

  // =========================================================================
  // GATE C: EXPLICIT AUDIT DURABILITY & STORAGE FAILURE BEHAVIOR
  // =========================================================================

  describe('Gate C — Explicit Audit Durability & Storage Failure Behavior', () => {
    it('mutations require durable audit - audit storage failure rejects the tool call (Error 500)', async () => {
      const origCreate = prisma.mcpAuditLog.create.bind(prisma.mcpAuditLog);
      (prisma.mcpAuditLog as any).create = async () => {
        throw new Error('Simulated database/disk failure on audit storage table');
      };

      const res = await callMcpTool(userAToken, 'ule_create_private_course', {
        title: 'Un-audited Course Should Fail',
        idempotencyKey: crypto.randomUUID(),
      });

      (prisma.mcpAuditLog as any).create = origCreate;

      // Mutation call MUST NOT pretend success when mandatory audit logging fails
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('[Error 500]');
      expect(res.content[0].text).toContain('An internal error occurred');
    });

    it('read-only inspection audit is best-effort - query succeeds even if audit storage fails', async () => {
      const origCreate = prisma.mcpAuditLog.create.bind(prisma.mcpAuditLog);
      (prisma.mcpAuditLog as any).create = async () => {
        throw new Error('Simulated disk pressure on audit table during read query');
      };

      const res = await callMcpTool(userAToken, 'ule_list_block_types', {});

      prisma.mcpAuditLog.create = origCreate;

      // Read-only inspection succeeds under best-effort audit guarantee
      expect(res.isError).toBeFalsy();
      const manifests = JSON.parse(res.content[0].text);
      expect(Array.isArray(manifests)).toBe(true);
      expect(manifests.length).toBeGreaterThanOrEqual(1);
    });
  });

});
