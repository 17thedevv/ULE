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

describe('Real Better Auth, Two-User Isolation & Concurrency Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const trustedOrigin = 'http://localhost:5173';
  const untrustedOrigin = 'http://malicious-attacker.com';

  const userA = {
    email: `author_a_${Date.now()}@ule.internal`,
    password: 'SecurePassword123!',
    name: 'Author Alice',
  };

  const userB = {
    email: `author_b_${Date.now()}@ule.internal`,
    password: 'SecurePassword456!',
    name: 'Author Bob',
  };

  let userACookie: string;
  let userAId: string;
  let userBCookie: string;
  let courseAId: string;

  beforeAll(async () => {
    // Compile actual NestJS module with live configuration and PostgreSQL adapter
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);

    // Replicate production bootstrap configuration
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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Real Better Auth Registration, Session Lifecycle & CORS', () => {
    it('handles CORS preflight and trusted origin correctly for auth endpoints', async () => {
      // Preflight OPTIONS request
      const preflight = await request(app.getHttpServer())
        .options('/api/v1/auth/sign-in/email')
        .set('Origin', trustedOrigin)
        .set('Access-Control-Request-Method', 'POST');

      expect(preflight.status).toBe(HttpStatus.NO_CONTENT);
      expect(preflight.headers['access-control-allow-origin']).toBe(trustedOrigin);
      expect(preflight.headers['access-control-allow-credentials']).toBe('true');

      // Request from untrusted origin must NOT receive allow-origin
      const untrustedPreflight = await request(app.getHttpServer())
        .options('/api/v1/auth/sign-in/email')
        .set('Origin', untrustedOrigin)
        .set('Access-Control-Request-Method', 'POST');

      expect(untrustedPreflight.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('registers User A through actual Better Auth HTTP endpoint', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-up/email')
        .set('Origin', trustedOrigin)
        .send(userA);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(userA.email);
      expect(res.body.user.name).toBe(userA.name);

      userAId = res.body.user.id;
      expect(userAId).toBeDefined();

      // Better Auth sets session cookie on sign-up
      const cookie = extractCookies(res);
      expect(cookie).toContain('better-auth.session_token');
      userACookie = cookie;
    });

    it('signs in User A through Better Auth and receives valid session cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-in/email')
        .set('Origin', trustedOrigin)
        .send({
          email: userA.email,
          password: userA.password,
        });

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(userAId);

      const cookie = extractCookies(res);
      expect(cookie).toContain('better-auth.session_token');
      userACookie = cookie;
    });

    it('reuses session cookie to call canonical GET /api/v1/me', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', userACookie)
        .set('Origin', trustedOrigin);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.user.id).toBe(userAId);
      expect(res.body.user.email).toBe(userA.email);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.userId).toBe(userAId);
    });

    it('registers User B through actual Better Auth HTTP endpoint', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-up/email')
        .set('Origin', trustedOrigin)
        .send(userB);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.user.email).toBe(userB.email);

      const userBId = res.body.user.id;
      expect(userBId).toBeDefined();
      expect(userBId).not.toBe(userAId);

      userBCookie = extractCookies(res);
    });

    it('rejects unauthenticated requests to protected endpoints', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/me');
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('rejects invalid and forged session tokens', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', 'better-auth.session_token=forged_token_value_xyz');

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('2. Course Creation, Authoritative Ownership & Two-User Isolation', () => {
    it('creates a Course with User A authenticated session cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Cookie', userACookie)
        .send({
          title: 'Distributed Systems & Consensus',
          description: 'Raft, Paxos, and Vector Clocks in Practice.',
        });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.course.ownerId).toBe(userAId);
      expect(res.body.course.visibility).toBe('PRIVATE');
      expect(res.body.draft.revision).toBe(1);

      courseAId = res.body.course.id;
    });

    it('User B receives 404 when querying User A private course', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('User B receives 404 when querying User A course draft', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/draft`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('User B receives 404 when attempting to mutate User A course draft', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseAId}/draft`)
        .set('Cookie', userBCookie)
        .send({
          title: 'Illicit Modification by User B',
          expectedRevision: 1,
        });

      expect(res.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('User B cannot forge ownerId to hijack course or claim User A ownership', async () => {
      // 1. User B tries to pass ownerId of User A in payload
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Cookie', userBCookie)
        .send({
          title: 'User B Attempted Hijack Course',
          ownerId: userAId, // Non-whitelisted field!
        });

      // Strict validation pipe rejects non-whitelisted property with 400 Bad Request
      expect(res.status).toBe(HttpStatus.BAD_REQUEST);

      // Verify in DB that no course was created with ownerId = userAId having that title
      const hijacked = await prisma.course.findFirst({
        where: {
          ownerId: userAId,
          draft: {
            title: 'User B Attempted Hijack Course',
          },
        },
      });
      expect(hijacked).toBeNull();
    });
  });

  describe('3. Real PostgreSQL Atomic Optimistic Concurrency Control (Draft Updates)', () => {
    it('requires expectedRevision and rejects requests when omitted', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseAId}/draft`)
        .set('Cookie', userACookie)
        .send({
          title: 'Update Without Expected Revision',
        });

      expect(res.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('executes atomic concurrent draft updates: exactly one succeeds, the other gets 409 Conflict', async () => {
      // 1. Both Client 1 and Client 2 read draft at revision 1
      const initialDraftRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/draft`)
        .set('Cookie', userACookie);

      expect(initialDraftRes.body.revision).toBe(1);

      // 2. Both submit distinct updates concurrently with expectedRevision = 1
      const request1 = request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseAId}/draft`)
        .set('Cookie', userACookie)
        .send({
          title: 'Update by Concurrent Client 1',
          expectedRevision: 1,
        });

      const request2 = request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseAId}/draft`)
        .set('Cookie', userACookie)
        .send({
          title: 'Update by Concurrent Client 2',
          expectedRevision: 1,
        });

      const [res1, res2] = await Promise.all([request1, request2]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must be 200 OK, and exactly one must be 409 Conflict
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);

      // 3. Verify the final database state is consistent
      const finalDraftRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/draft`)
        .set('Cookie', userACookie);

      // Revision must have incremented exactly once from 1 to 2
      expect(finalDraftRes.body.revision).toBe(2);

      // The winning update's title must be persisted (no mixed or overwritten states)
      const winningTitle = res1.status === HttpStatus.OK
        ? 'Update by Concurrent Client 1'
        : 'Update by Concurrent Client 2';
      expect(finalDraftRes.body.title).toBe(winningTitle);
    });
  });

  describe('4. Real PostgreSQL Concurrency-Safe Version Snapshot Creation', () => {
    it('executes simultaneous version creation requests cleanly without duplicate version numbers or 500 errors', async () => {
      // Simultaneous snapshot requests on the same course
      const reqVer1 = request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/versions`)
        .set('Cookie', userACookie);

      const reqVer2 = request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/versions`)
        .set('Cookie', userACookie);

      const [verRes1, verRes2] = await Promise.all([reqVer1, reqVer2]);

      // Neither request should return an unhandled 500 error
      expect(verRes1.status).not.toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(verRes2.status).not.toBe(HttpStatus.INTERNAL_SERVER_ERROR);

      // Under row locking, both succeed monotonically (v1 and v2) or one conflicts (409)
      const successfulVersions: number[] = [];
      if (verRes1.status === HttpStatus.CREATED) {
        successfulVersions.push(verRes1.body.versionNumber);
      }
      if (verRes2.status === HttpStatus.CREATED) {
        successfulVersions.push(verRes2.body.versionNumber);
      }

      // At least one version snapshot succeeded
      expect(successfulVersions.length).toBeGreaterThanOrEqual(1);

      // Fetch all versions from DB for this course
      const versionsInDb = await prisma.courseVersion.findMany({
        where: { courseId: courseAId },
        orderBy: { versionNumber: 'asc' },
      });

      // Assert no duplicate version numbers
      const versionNumbers = versionsInDb.map((v) => v.versionNumber);
      const uniqueVersionNumbers = Array.from(new Set(versionNumbers));
      expect(versionNumbers).toEqual(uniqueVersionNumbers);

      // Assert monotonic ordering (1, 2, ...)
      for (let i = 0; i < versionNumbers.length; i++) {
        expect(versionNumbers[i]).toBe(i + 1);
      }

      // Assert immutable snapshot integrity
      for (const ver of versionsInDb) {
        expect(ver.snapshot).toBeDefined();
        expect((ver.snapshot as any).versionNumber).toBe(ver.versionNumber);
        expect((ver.snapshot as any).courseId).toBe(courseAId);
      }
    });
  });

  describe('5. Sign Out Lifecycle & Session Invalidation', () => {
    it('signs out User A and confirms session cookie is invalidated', async () => {
      // Sign out via Better Auth endpoint
      const signoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-out')
        .set('Cookie', userACookie)
        .send({});

      expect(signoutRes.status).toBe(HttpStatus.OK);

      // Calling /api/v1/me with invalidated cookie now returns 401 Unauthorized
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', userACookie);

      expect(meRes.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('rejects course creation with signed out session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Cookie', userACookie)
        .send({
          title: 'Attempted Post-Signout Course',
        });

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });
});
