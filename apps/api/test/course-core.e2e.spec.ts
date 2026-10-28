/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  HttpStatus,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { AuthGuard } from '../src/modules/auth/auth.guard';
import { AuthService } from '../src/modules/auth/auth.service';
import { CoursesController } from '../src/modules/courses/courses.controller';
import { CoursesService } from '../src/modules/courses/courses.service';
import { MeController } from '../src/modules/me/me.controller';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('Course Core, Ownership & Versioning (e2e)', () => {
  let app: INestApplication;

  // In-memory relational store to test full service + controller lifecycle
  const users = {
    'user-a': {
      id: 'usr_user_a',
      name: 'Author A',
      email: 'author.a@ule.internal',
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    'user-b': {
      id: 'usr_user_b',
      name: 'Author B',
      email: 'author.b@ule.internal',
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const coursesTable: any[] = [];
  const draftsTable: any[] = [];
  const versionsTable: any[] = [];

  const mockPrismaService: any = {
    $transaction: jest.fn(async (cb) => cb(mockPrismaService)),
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'mock-course' }]),
    course: {
      create: jest.fn(async ({ data }) => {
        const course = {
          id: `c_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          ownerId: data.ownerId,
          visibility: data.visibility || 'PRIVATE',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        coursesTable.push(course);
        return course;
      }),
      findMany: jest.fn(async ({ where }) => {
        return coursesTable.filter((c) =>
          where.ownerId ? c.ownerId === where.ownerId : true,
        );
      }),
      findUnique: jest.fn(async ({ where }) => {
        return coursesTable.find((c) => c.id === where.id) || null;
      }),
    },
    courseDraft: {
      create: jest.fn(async ({ data }) => {
        const draft = {
          id: `d_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          courseId: data.courseId,
          title: data.title,
          description: data.description ?? null,
          summary: data.summary ?? null,
          revision: data.revision || 1,
          sourceVersionId: null,
          updatedAt: new Date(),
        };
        draftsTable.push(draft);
        return draft;
      }),
      findUnique: jest.fn(async ({ where }) => {
        return draftsTable.find((d) => d.courseId === where.courseId) || null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }) => {
        const draft = draftsTable.find((d) => d.courseId === where.courseId);
        if (!draft) throw new Error('Not found');
        return draft;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const draft = draftsTable.find((d) => d.courseId === where.courseId);
        if (!draft) return { count: 0 };
        if (where.revision !== undefined && draft.revision !== where.revision) {
          return { count: 0 };
        }
        if (data.title !== undefined) draft.title = data.title;
        if (data.description !== undefined) draft.description = data.description;
        if (data.summary !== undefined) draft.summary = data.summary;
        if (data.revision?.increment) draft.revision += 1;
        draft.updatedAt = new Date();
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }) => {
        const draft = draftsTable.find((d) => d.courseId === where.courseId);
        if (!draft) return null;
        if (data.title !== undefined) draft.title = data.title;
        if (data.description !== undefined) draft.description = data.description;
        if (data.summary !== undefined) draft.summary = data.summary;
        if (data.revision?.increment) draft.revision += 1;
        if (data.sourceVersionId !== undefined)
          draft.sourceVersionId = data.sourceVersionId;
        draft.updatedAt = new Date();
        return draft;
      }),
    },
    courseVersion: {
      findFirst: jest.fn(async ({ where, orderBy }) => {
        const matches = versionsTable.filter((v) => v.courseId === where.courseId);
        if (matches.length === 0) return null;
        if (orderBy?.versionNumber === 'desc') {
          return [...matches].sort(
            (a, b) => b.versionNumber - a.versionNumber,
          )[0];
        }
        return matches[0];
      }),
      findMany: jest.fn(async ({ where }) => {
        return versionsTable
          .filter((v) => v.courseId === where.courseId)
          .sort((a, b) => a.versionNumber - b.versionNumber);
      }),
      create: jest.fn(async ({ data }) => {
        const version = {
          id: `v_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          courseId: data.courseId,
          versionNumber: data.versionNumber,
          title: data.title,
          description: data.description ?? null,
          summary: data.summary ?? null,
          snapshot: data.snapshot,
          schemaVersion: data.schemaVersion || '1.0.0',
          draftRevision: data.draftRevision,
          createdById: data.createdById,
          createdAt: new Date(),
        };
        versionsTable.push(version);
        return version;
      }),
    },
  };

  const mockAuthService = {
    getSessionFromRequest: jest.fn(async (req) => {
      const authHeader = req.headers.authorization;
      if (authHeader === 'Bearer token_user_a') {
        return {
          user: users['user-a'],
          session: {
            id: 'sess_a',
            userId: users['user-a'].id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        };
      }
      if (authHeader === 'Bearer token_user_b') {
        return {
          user: users['user-b'],
          session: {
            id: 'sess_b',
            userId: users['user-b'].id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        };
      }
      return null;
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [MeController, CoursesController],
      providers: [
        CoursesService,
        AuthGuard,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Authentication Gateways & Identification', () => {
    it('GET /api/v1/me rejects unauthenticated request with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me')
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('GET /api/v1/me rejects invalid session token with 401', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', 'Bearer invalid_forged_token')
        .expect(HttpStatus.UNAUTHORIZED);

      expect(res.body.statusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('GET /api/v1/me returns current user identity for valid session token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', 'Bearer token_user_a')
        .expect(HttpStatus.OK);

      expect(res.body.user).toMatchObject({
        id: 'usr_user_a',
        email: 'author.a@ule.internal',
        name: 'Author A',
      });
      expect(res.body.session.id).toBe('sess_a');
    });

    it('GET /api/v1/courses rejects unauthenticated request with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/courses')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('2. Course Creation, Invariants & Security Guardrails', () => {
    let createdCourseId: string;

    it('POST /api/v1/courses creates private course and initial draft for User A', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', 'Bearer token_user_a')
        .send({
          title: 'Foundations of Computer Systems',
          description: 'A comprehensive journey into systems architecture.',
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.course).toMatchObject({
        ownerId: 'usr_user_a',
        visibility: 'PRIVATE',
      });
      expect(res.body.draft).toMatchObject({
        title: 'Foundations of Computer Systems',
        revision: 1,
      });

      createdCourseId = res.body.course.id;
      expect(createdCourseId).toBeDefined();
    });

    it('rejects client attempting to set ownerId in request body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', 'Bearer token_user_a')
        .send({
          title: 'Malicious Ownership Takeover',
          ownerId: 'usr_user_b', // Forbidden non-whitelisted property
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(JSON.stringify(res.body.message)).toContain('property ownerId should not exist');
    });

    it('rejects client attempting to set visibility: PUBLIC in request body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', 'Bearer token_user_a')
        .send({
          title: 'Unpublished Public Attempt',
          visibility: 'PUBLIC', // Forbidden non-whitelisted property
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(JSON.stringify(res.body.message)).toContain(
        'property visibility should not exist',
      );
    });

    it('rejects client attempting to set status: PUBLISHED in request body', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', 'Bearer token_user_a')
        .send({
          title: 'Illegal Status Publication Attempt',
          status: 'PUBLISHED',
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(JSON.stringify(res.body.message)).toContain('property status should not exist');
    });

    it('rejects course creation when title is too short (< 3 chars)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', 'Bearer token_user_a')
        .send({
          title: 'AB',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('3. Two-User Isolation (User A vs User B)', () => {
    let courseAId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', 'Bearer token_user_a')
        .send({
          title: "User A's Private Speciality",
          description: 'Top secret research notes.',
        })
        .expect(HttpStatus.CREATED);

      courseAId = res.body.course.id;
    });

    it("User B's course list does NOT contain User A's private course", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/courses')
        .set('Authorization', 'Bearer token_user_b')
        .expect(HttpStatus.OK);

      const found = res.body.find((c: any) => c.id === courseAId);
      expect(found).toBeUndefined();
    });

    it("User B receives 404 when querying User A's private course directly", async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}`)
        .set('Authorization', 'Bearer token_user_b')
        .expect(HttpStatus.NOT_FOUND);

      expect(res.body.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(res.body.error).toBe('Not Found');
    });

    it("User B receives 404 when attempting to read User A's draft", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/draft`)
        .set('Authorization', 'Bearer token_user_b')
        .expect(HttpStatus.NOT_FOUND);
    });

    it("User B receives 404 when attempting to patch User A's draft", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseAId}/draft`)
        .set('Authorization', 'Bearer token_user_b')
        .send({
          title: 'Tampered by User B',
          expectedRevision: 1,
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it("User B receives 404 when attempting to list User A's versions", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/versions`)
        .set('Authorization', 'Bearer token_user_b')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('4. Draft Editing, Versioning & Immutability Lifecycle', () => {
    let courseId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', 'Bearer token_user_a')
        .send({
          title: 'Machine Learning from Scratch',
          description: 'Linear algebra to deep transformers.',
        })
        .expect(HttpStatus.CREATED);

      courseId = res.body.course.id;
    });

    it('User A reads draft and receives revision 1', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/draft`)
        .set('Authorization', 'Bearer token_user_a')
        .expect(HttpStatus.OK);

      expect(res.body.title).toBe('Machine Learning from Scratch');
      expect(res.body.revision).toBe(1);
    });

    it('User A edits draft, incrementing revision to 2', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseId}/draft`)
        .set('Authorization', 'Bearer token_user_a')
        .send({
          title: 'Machine Learning from Scratch (Revised)',
          expectedRevision: 1,
        })
        .expect(HttpStatus.OK);

      expect(res.body.title).toBe('Machine Learning from Scratch (Revised)');
      expect(res.body.revision).toBe(2);
    });

    it('User A receives 409 Conflict when providing stale expectedRevision', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseId}/draft`)
        .set('Authorization', 'Bearer token_user_a')
        .send({
          title: 'Out of date update',
          expectedRevision: 1, // Stale! Current revision is 2
        })
        .expect(HttpStatus.CONFLICT);

      expect(res.body.statusCode).toBe(HttpStatus.CONFLICT);
      expect(res.body.error).toBe('Conflict');
    });

    it('User A creates Version 1 from current draft', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions`)
        .set('Authorization', 'Bearer token_user_a')
        .expect(HttpStatus.CREATED);

      expect(res.body.versionNumber).toBe(1);
      expect(res.body.draftRevision).toBe(2);
      expect(res.body.title).toBe('Machine Learning from Scratch (Revised)');
      expect(res.body.snapshot).toMatchObject({
        title: 'Machine Learning from Scratch (Revised)',
        versionNumber: 1,
        schemaVersion: '1.0.0',
      });
    });

    it('User A receives 400 Bad Request when expectedRevision is omitted', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseId}/draft`)
        .set('Authorization', 'Bearer token_user_a')
        .send({
          title: 'Missing revision field',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('Later draft edits do NOT change Version 1 snapshot (Immutability)', async () => {
      // 1. Edit draft further to revision 3
      await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseId}/draft`)
        .set('Authorization', 'Bearer token_user_a')
        .send({
          title: 'Machine Learning: Quantum Neural Edition',
          expectedRevision: 2,
        })
        .expect(HttpStatus.OK);

      // 2. Fetch Version 1 list
      const versionsRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/versions`)
        .set('Authorization', 'Bearer token_user_a')
        .expect(HttpStatus.OK);

      const v1 = versionsRes.body.find((v: any) => v.versionNumber === 1);
      expect(v1).toBeDefined();
      // Version 1 snapshot must preserve original title, NOT the new draft title!
      expect(v1.title).toBe('Machine Learning from Scratch (Revised)');
      expect(v1.snapshot.title).toBe('Machine Learning from Scratch (Revised)');
    });

    it('User A creates Version 2 snapshot with monotonically increasing number', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions`)
        .set('Authorization', 'Bearer token_user_a')
        .expect(HttpStatus.CREATED);

      expect(res.body.versionNumber).toBe(2);
      expect(res.body.draftRevision).toBe(3);
      expect(res.body.title).toBe('Machine Learning: Quantum Neural Edition');

      // Check full version history ordering
      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/versions`)
        .set('Authorization', 'Bearer token_user_a')
        .expect(HttpStatus.OK);

      expect(historyRes.body.length).toBe(2);
      expect(historyRes.body[0].versionNumber).toBe(1);
      expect(historyRes.body[1].versionNumber).toBe(2);
    });

    it('Individual immutable version snapshot can be fetched by version ID', async () => {
      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/versions`)
        .set('Authorization', 'Bearer token_user_a');

      const version1Id = historyRes.body[0].id;

      const singleRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/versions/${version1Id}`)
        .set('Authorization', 'Bearer token_user_a')
        .expect(HttpStatus.OK);

      expect(singleRes.body.id).toBe(version1Id);
      expect(singleRes.body.versionNumber).toBe(1);
      expect(singleRes.body.title).toBe('Machine Learning from Scratch (Revised)');
    });
  });
});
