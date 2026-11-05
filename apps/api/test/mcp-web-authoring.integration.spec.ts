import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type {
  CourseDraftDto,
  CourseVersionDto,
  CreateCourseResponse,
  DraftBlockInstanceDto,
  DraftValidationResponseDto,
} from '@ule/contracts';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

interface Account {
  id: string;
  cookie: string;
}

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

type McpDraft = CourseDraftDto & { blocks: DraftBlockInstanceDto[] };
interface McpValidation {
  courseId: string;
  revision: number;
  valid: boolean;
  blockCount: number;
  errors: Array<{ blockId?: string; blockTitle?: string; message: string }>;
}

describe('P7-05: MCP authoring and Creator Studio API parity (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let owner: Account;
  let learner: Account;
  let authorToken: string;
  let readToken: string;
  let otherUserToken: string;
  let courseId: string;
  let mcqId: string;
  let clozeId: string;

  const origin = 'http://localhost:5173';
  const clientId = `p7-05-web-parity-${randomUUID()}`;
  const mcqConfig = {
    question: 'What is 2 + 3?',
    options: [
      { id: 'four', text: '4' },
      { id: 'five', text: '5' },
      { id: 'six', text: '6' },
    ],
    answerKey: { correctOptionId: 'five', explanation: 'Two plus three equals five.' },
    feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
  };
  const clozeConfig = {
    prompt: 'Fill in the capital.',
    templateText: 'The capital of France is {{blank_1}}.',
    targetBlanks: [{ id: 'capital', blankKey: 'blank_1' }],
    answerKey: { blanks: { blank_1: ['Paris'] } },
    feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: ['/.well-known/(.*)', '.well-known/(.*)'],
    });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.init();
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
    owner = await signUp('creator');
    learner = await signUp('learner');

    // OAuth discovery/PKCE is exercised by mcp-client.integration.spec.ts.
    // These database-backed tokens isolate the shared authoring/domain boundary.
    await prisma.oauthClient.create({ data: {
      clientId,
      name: 'P7-05 cross-client integration fixture',
      redirectUris: ['http://localhost:5173/oauth/callback'],
      scopes: ['course:read', 'course:write'],
    } });
    authorToken = await issueToken(owner.id, ['course:read', 'course:write']);
    readToken = await issueToken(owner.id, ['course:read']);
    otherUserToken = await issueToken(learner.id, ['course:read', 'course:write']);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function signUp(role: string): Promise<Account> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', origin)
      .send({
        name: `P7-05 ${role}`,
        email: `p7-05-${role}-${randomUUID()}@ule.internal`,
        password: 'Password123!',
      })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return { id: response.body.user.id, cookie: cookies.map((c) => c.split(';')[0]).join('; ') };
  }

  async function issueToken(userId: string, scopes: string[]): Promise<string> {
    const resource = auth.getMcpResourceUri();
    const now = Math.floor(Date.now() / 1000);
    const referenceId = randomUUID();
    const api = auth.auth.api as unknown as {
      signJWT(input: { body: { payload: Record<string, unknown> } }): Promise<{ token: string }>;
    };
    const signed = await api.signJWT({ body: { payload: {
      sub: userId,
      azp: clientId,
      client_id: clientId,
      scope: scopes.join(' '),
      aud: resource,
      iss: auth.getMcpIssuer(),
      exp: now + 3600,
      jti: referenceId,
    } } });
    if (!await prisma.oauthConsent.findFirst({ where: { clientId, userId } })) {
      await prisma.oauthConsent.create({ data: {
        clientId,
        userId,
        scopes: ['course:read', 'course:write'],
        resources: [resource],
      } });
    }
    await prisma.oauthAccessToken.create({ data: {
      token: signed.token,
      referenceId,
      clientId,
      userId,
      scopes,
      resources: [resource],
      expiresAt: new Date((now + 3600) * 1000),
    } });
    return signed.token;
  }

  async function rawTool(name: string, args: Record<string, unknown>, token = authorToken): Promise<ToolResult> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: randomUUID(), method: 'tools/call', params: { name, arguments: args } })
      .expect(200);
    const envelope = response.body?.result
      ? response.body
      : JSON.parse(response.text.split('\n').find((line) => line.startsWith('data:'))!.slice(5));
    expect(envelope.result).toBeDefined();
    return envelope.result;
  }

  async function tool<T>(name: string, args: Record<string, unknown> = {}, token = authorToken): Promise<T> {
    const result = await rawTool(name, args, token);
    expect(result.isError).toBeFalsy();
    return JSON.parse(result.content[0].text) as T;
  }

  async function draft(): Promise<McpDraft> {
    return tool<McpDraft>('ule_get_course_draft', { courseId });
  }

  it('authors Video, MCQ and Cloze through MCP and reads the same course, order and revision through Studio APIs', async () => {
    const activities = [
      { blockTypeId: 'video', title: 'Introduction to Arithmetic', config: {
        url: 'https://example.com/arithmetic.mp4', durationSeconds: 120, allowSkip: true,
      } },
      { blockTypeId: 'multiple-choice', title: 'Arithmetic question', config: mcqConfig },
      { blockTypeId: 'cloze', title: 'Capital of France', config: clozeConfig },
    ];
    for (const activity of activities) {
      const schema = await tool<{ blockTypeId: string; typeVersion: string; configSchema: unknown }>(
        'ule_get_block_type_schema', { blockTypeId: activity.blockTypeId },
      );
      expect(schema).toMatchObject({ blockTypeId: activity.blockTypeId, typeVersion: '1.0.0' });
      expect(schema.configSchema).toBeDefined();
    }

    const created = await tool<CreateCourseResponse>('ule_create_private_course', {
      title: 'P7-05 AI Authored Course', idempotencyKey: randomUUID(),
    });
    courseId = created.course.id;
    expect(created.course).toMatchObject({ ownerId: owner.id, visibility: 'PRIVATE' });

    for (const [orderIndex, activity] of activities.entries()) {
      const before = await draft();
      const mutation = {
        courseId,
        expectedRevision: before.revision,
        ...activity,
        typeVersion: '1.0.0',
        orderIndex,
        idempotencyKey: randomUUID(),
      };
      const block = await tool<DraftBlockInstanceDto>('ule_add_draft_block', mutation);
      if (activity.blockTypeId === 'multiple-choice') {
        expect(await tool<DraftBlockInstanceDto>('ule_add_draft_block', mutation)).toEqual(block);
      }
      const after = await draft();
      expect(after.revision).toBe(before.revision + 1);
      expect(after.blocks).toHaveLength(orderIndex + 1);
      if (activity.blockTypeId === 'multiple-choice') mcqId = block.id;
      if (activity.blockTypeId === 'cloze') clozeId = block.id;
    }

    const courses = await request(app.getHttpServer()).get('/api/v1/courses')
      .set('Cookie', owner.cookie).expect(200);
    expect(courses.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: courseId })]));
    const studioDraft = await request(app.getHttpServer()).get(`/api/v1/courses/${courseId}/draft`)
      .set('Cookie', owner.cookie).expect(200);
    const studioBlocks = await request(app.getHttpServer()).get(`/api/v1/courses/${courseId}/draft/blocks`)
      .set('Cookie', owner.cookie).expect(200);
    const authored = await draft();
    expect(authored).toMatchObject(studioDraft.body);
    expect(authored.blocks).toEqual(studioBlocks.body);
    expect(authored.blocks.map((b) => [b.blockTypeId, b.orderIndex])).toEqual([
      ['video', 0], ['multiple-choice', 1], ['cloze', 2],
    ]);
    expect(authored.blocks[1].config).toMatchObject(mcqConfig);
    expect(authored.blocks[2].config).toMatchObject(clozeConfig);
  });

  it('preserves a web MCQ edit on stale MCP revision, then permits an explicit retry after rereading the draft', async () => {
    const staleDraft = await draft();
    const changedMcq = { ...mcqConfig, question: 'What is 3 + 2? (edited in Creator Studio)' };
    await request(app.getHttpServer()).patch(`/api/v1/courses/${courseId}/draft/blocks/${mcqId}`)
      .set('Cookie', owner.cookie)
      .send({ expectedRevision: staleDraft.revision, config: changedMcq })
      .expect(200);

    const staleMutation = await rawTool('ule_update_draft_block', {
      courseId, blockId: mcqId, expectedRevision: staleDraft.revision,
      config: mcqConfig, idempotencyKey: randomUUID(),
    });
    expect(staleMutation.isError).toBe(true);
    // MCP reports the domain's 409 as a tool error inside an HTTP 200 response.
    expect(staleMutation.content[0].text).toContain('409');
    const current = await draft();
    expect(current.revision).toBe(staleDraft.revision + 1);
    expect(current.blocks.find((b) => b.id === mcqId)?.config).toMatchObject(changedMcq);

    const mutation = {
      courseId, blockId: clozeId, expectedRevision: current.revision,
      title: 'Capital of France (updated by MCP)',
      config: { ...clozeConfig, prompt: 'Name the capital of France.' },
      idempotencyKey: randomUUID(),
    };
    const first = await tool<DraftBlockInstanceDto>('ule_update_draft_block', mutation);
    const replay = await tool<DraftBlockInstanceDto>('ule_update_draft_block', mutation);
    expect(replay).toEqual(first);
    expect((await draft()).revision).toBe(current.revision + 1);
    const mismatch = await rawTool('ule_update_draft_block', { ...mutation, title: 'Conflicting retry' });
    expect(mismatch.isError).toBe(true);
    expect(mismatch.content[0].text).toContain('409');
    expect(mismatch.content[0].text).toContain('different payload');

    const studioBlocks = await request(app.getHttpServer()).get(`/api/v1/courses/${courseId}/draft/blocks`)
      .set('Cookie', owner.cookie).expect(200);
    expect(studioBlocks.body).toEqual((await draft()).blocks);
    expect(studioBlocks.body.find((b: DraftBlockInstanceDto) => b.id === clozeId)).toEqual(first);
    const audit = await prisma.mcpAuditLog.findMany({ where: {
      userId: owner.id, clientId, toolName: 'ule_update_draft_block', idempotencyKey: mutation.idempotencyKey,
    } });
    expect(audit.filter((entry) => entry.action === 'EXECUTE' && entry.status === 'SUCCESS')).toHaveLength(1);
    expect(audit.filter((entry) => entry.action === 'REPLAY' && entry.status === 'SUCCESS')).toHaveLength(1);

    const validation = await tool<McpValidation>('ule_validate_course_draft', { courseId });
    const studioValidation = await request(app.getHttpServer()).post(`/api/v1/courses/${courseId}/draft/blocks/validate`)
      .set('Cookie', owner.cookie).expect(200);
    const webValidation = studioValidation.body as DraftValidationResponseDto;
    expect(validation.valid).toBe(webValidation.valid);
    expect(validation.blockCount).toBe(webValidation.totalBlocks);
    expect(webValidation.invalidBlocksCount).toBe(0);
    expect(webValidation.blocks.every((block) => block.valid && block.errors.length === 0)).toBe(true);
    expect(validation).toMatchObject({ valid: true, blockCount: 3, errors: [] });
    expect(await prisma.courseVersion.count({ where: { courseId } })).toBe(0);
  });

  it('protects MCQ and Cloze answer keys from read-only inspection and rejects cross-user authoring', async () => {
    const inspected = await tool<McpDraft>('ule_get_course_draft', { courseId }, readToken);
    for (const block of inspected.blocks) expect(block.config).not.toHaveProperty('answerKey');
    const deniedWrite = await rawTool('ule_update_draft_block', {
      courseId, blockId: clozeId, expectedRevision: inspected.revision,
      title: 'Unauthorized edit', idempotencyKey: randomUUID(),
    }, readToken);
    expect(deniedWrite.isError).toBe(true);
    expect(deniedWrite.content[0].text).toContain('Insufficient scope');
    const deniedRead = await rawTool('ule_get_course_draft', { courseId }, otherUserToken);
    expect(deniedRead.isError).toBe(true);
    expect(deniedRead.content[0].text).toContain('404');
    const deniedOtherWrite = await rawTool('ule_update_draft_block', {
      courseId, blockId: mcqId, expectedRevision: inspected.revision,
      title: 'Another user edit', idempotencyKey: randomUUID(),
    }, otherUserToken);
    expect(deniedOtherWrite.isError).toBe(true);
    expect(deniedOtherWrite.content[0].text).toContain('404');
    await request(app.getHttpServer()).get(`/api/v1/courses/${courseId}/draft`)
      .set('Cookie', learner.cookie).expect(404);
    expect((await draft()).revision).toBe(inspected.revision);
  });

  it('creates the exact private snapshot through the web publish action and persists granted learner results and progress', async () => {
    const authored = await draft();
    // This explicit test fixture action models creator approval. Authoring above
    // creates no version; real AI-client publish approval remains a manual gate.
    const published = await request(app.getHttpServer()).post(`/api/v1/courses/${courseId}/versions`)
      .set('Cookie', owner.cookie).expect(201);
    const version = published.body as CourseVersionDto;
    expect(version).toMatchObject({ courseId, draftRevision: authored.revision, versionNumber: 1 });
    expect(version.snapshot.blocks).toEqual(authored.blocks.map((block) => ({
      id: block.id,
      blockTypeId: block.blockTypeId,
      typeVersion: block.typeVersion,
      title: block.title,
      orderIndex: block.orderIndex,
      config: block.config,
    })));
    expect(await tool<CourseVersionDto>('ule_get_course_version', { courseId, versionId: version.id })).toEqual(version);
    expect(await prisma.course.findUniqueOrThrow({ where: { id: courseId } })).toMatchObject({ visibility: 'PRIVATE' });

    await request(app.getHttpServer()).post(`/api/v1/learner/courses/${version.id}/enroll`)
      .set('Cookie', learner.cookie).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/courses/${courseId}/versions/${version.id}/grants`)
      .set('Cookie', owner.cookie).send({ userId: learner.id }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/learner/courses/${version.id}/enroll`)
      .set('Cookie', learner.cookie).expect(201);
    const availableCourses = await request(app.getHttpServer()).get('/api/v1/learner/courses')
      .set('Cookie', learner.cookie).expect(200);
    expect(availableCourses.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: version.id, courseId }),
    ]));

    for (const block of authored.blocks) {
      const started = await request(app.getHttpServer()).post('/api/v1/runs')
        .set('Cookie', learner.cookie)
        .send({ courseVersionId: version.id, blockInstanceId: block.id, idempotencyKey: randomUUID() })
        .expect(201);
      expect(started.body.block.learnerConfig).not.toHaveProperty('answerKey');
      if (block.blockTypeId !== 'video') {
        const response = block.blockTypeId === 'multiple-choice'
          ? { selectedOptionId: 'five' }
          : { answers: { blank_1: 'Paris' } };
        const submitted = await request(app.getHttpServer()).post(`/api/v1/runs/${started.body.id}/commands`)
          .set('Cookie', learner.cookie)
          .send({ command: 'SUBMIT_RESPONSE', payload: response, idempotencyKey: randomUUID() })
          .expect(200);
        expect(submitted.body.latestAssessment).toMatchObject({ isCorrect: true, score: 1 });
      }
      await request(app.getHttpServer()).post(`/api/v1/runs/${started.body.id}/commands`)
        .set('Cookie', learner.cookie)
        .send({ command: 'FINISH', idempotencyKey: randomUUID() }).expect(200);
      const savedRun = await prisma.aBRun.findUniqueOrThrow({
        where: { id: started.body.id }, include: { attempts: true, assessmentResults: true },
      });
      expect(savedRun).toMatchObject({ userId: learner.id, status: 'CLOSED', closeReason: 'COMPLETED' });
      expect(savedRun.attempts).toHaveLength(block.blockTypeId === 'video' ? 0 : 1);
      if (block.blockTypeId !== 'video') {
        expect(savedRun.assessmentResults).toEqual(expect.arrayContaining([
          expect.objectContaining({ isCorrect: true, score: 1 }),
        ]));
      }
    }
    const progress = await request(app.getHttpServer()).get(`/api/v1/learner/courses/${version.id}/progress`)
      .set('Cookie', learner.cookie).expect(200);
    expect(progress.body).toMatchObject({ courseVersionId: version.id, totalBlocks: 3, completedBlocks: 3, percentComplete: 100 });
    expect(progress.body.blocks.map((block: { status: string }) => block.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED']);
  });
});
