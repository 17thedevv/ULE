/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { createCorsOriginValidator } from '../src/common/utils/cors.util';

function extractCookies(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

describe('Phase 6: Learner Exam Web MVP Integration Tests', () => {
  let app: INestApplication;

  const trustedOrigin = 'http://localhost:5173';

  const userAlice = {
    email: `alice_phase6_${Date.now()}@ule.internal`,
    password: 'Password123!',
    name: 'Alice Creator',
  };

  const userBob = {
    email: `bob_phase6_${Date.now()}@ule.internal`,
    password: 'Password123!',
    name: 'Bob Unauthorized',
  };

  const userCharlie = {
    email: `charlie_phase6_${Date.now()}@ule.internal`,
    password: 'Password123!',
    name: 'Charlie Learner',
  };

  let aliceCookie: string;
  let bobCookie: string;
  let charlieCookie: string;

  let charlieId: string;

  let assessmentId: string;
  let assessmentVersionId: string;
  let singleChoiceItemRefId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    app.setGlobalPrefix('api/v1');
    app.enableCors({
      origin: createCorsOriginValidator(trustedOrigin),
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cookie'],
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

    // 1. Register Alice (Creator)
    const aliceReg = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userAlice)
      .expect(HttpStatus.OK);
    aliceCookie = extractCookies(aliceReg);

    // 2. Register Bob (Unauthorized Learner)
    const bobReg = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userBob)
      .expect(HttpStatus.OK);
    bobCookie = extractCookies(bobReg);

    // 3. Register Charlie (Authorized Learner)
    const charlieReg = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userCharlie)
      .expect(HttpStatus.OK);
    charlieCookie = extractCookies(charlieReg);
    const charlieMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', charlieCookie)
      .expect(HttpStatus.OK);
    charlieId = charlieMe.body.user.id;

    // 4. Alice creates Question Bank Items
    const q1Res = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'SINGLE_CHOICE',
        title: 'HTTP Status Code',
        prompt: 'Which HTTP status code represents resource creation?',
        content: {
          options: [
            { id: 'opt-200', text: '200 OK' },
            { id: 'opt-201', text: '201 Created' },
            { id: 'opt-404', text: '404 Not Found' },
          ],
        },
        answerKey: { correctOptionId: 'opt-201' },
        defaultPoints: 5.0,
      })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${q1Res.body.id}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    const q2Res = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'TRUE_FALSE',
        title: 'Idempotency Concept',
        prompt: 'Does idempotency guarantee that repeated requests yield identical side effects?',
        content: {},
        answerKey: { correctValue: true },
        defaultPoints: 5.0,
      })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${q2Res.body.id}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // 5. Alice creates Blueprint Definition
    const asmtRes = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Phase 6 Web Exam',
        description: 'Testing learner discovery, autosave and submission',
        instructions: 'Read questions carefully. Answers are saved automatically.',
        durationMinutes: 45,
        maxAttempts: 2,
        passingScore: 50.0,
        feedbackPolicy: 'ON_SUBMISSION',
      })
      .expect(HttpStatus.CREATED);
    assessmentId = asmtRes.body.id;

    // Add Section & Items
    const secRes = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${assessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'Main Section', orderIndex: 0 })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .post(`/api/v1/assessments/${assessmentId}/sections/${secRes.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({
        questionBankItemId: q1Res.body.id,
        points: 5.0,
      })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .post(`/api/v1/assessments/${assessmentId}/sections/${secRes.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({
        questionBankItemId: q2Res.body.id,
        points: 5.0,
      })
      .expect(HttpStatus.CREATED);

    // Publish Version
    const pubRes = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${assessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: `phase-6-pub-${Date.now()}` })
      .expect(HttpStatus.CREATED);
    assessmentVersionId = pubRes.body.id;

    const snapshot = pubRes.body.snapshot;
    singleChoiceItemRefId = snapshot.sections[0].items[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Learner Exam Discovery & Cross-User Authorization', () => {
    it('returns empty list for Charlie before access grant', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/learner/exams')
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      const found = res.body.find((e: any) => e.assessmentId === assessmentId);
      expect(found).toBeUndefined();
    });

    it('rejects Charlie with 403 Forbidden when requesting specific ungranted exam version', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/learner/exams/${assessmentVersionId}`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('allows Alice to grant explicit exam access to Charlie', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${assessmentId}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);
    });

    it('allows Charlie to discover granted exam via GET /api/v1/learner/exams', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/learner/exams')
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      const found = res.body.find((e: any) => e.assessmentId === assessmentId);
      expect(found).toBeDefined();
      expect(found.title).toBe('Phase 6 Web Exam');
      expect(found.durationMinutes).toBe(45);
      expect(found.maxAttempts).toBe(2);
      expect(found.itemCount).toBe(2);
      expect(found.totalPoints).toBe(10);
      expect(found.existingAttemptsCount).toBe(0);
      expect(found.activeAttempt).toBeNull();
    });

    it('allows Charlie to fetch exam metadata via GET /api/v1/learner/exams/:versionId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learner/exams/${assessmentVersionId}`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(res.body.assessmentVersionId).toBe(assessmentVersionId);
      expect(res.body.title).toBe('Phase 6 Web Exam');
      expect(res.body.instructions).toContain('Answers are saved automatically');
    });

    it('continues to block unauthorized learner Bob with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/learner/exams/${assessmentVersionId}`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('End-to-End Attempt Lifecycle: Start, Autosave, Submit, Results', () => {
    let attemptId: string;

    it('allows Charlie to start examination attempt', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exams/${assessmentVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);

      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.attemptNumber).toBe(1);
      expect(res.body.deadlineAt).toBeDefined();
      attemptId = res.body.id;
    });

    it('reflects active attempt in discovery list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/learner/exams')
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      const found = res.body.find((e: any) => e.assessmentId === assessmentId);
      expect(found.activeAttempt).toBeDefined();
      expect(found.activeAttempt.id).toBe(attemptId);
      expect(found.activeAttempt.status).toBe('IN_PROGRESS');
    });

    it('provides sanitized question blueprint without leaking secret answer keys', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${attemptId}/questions`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(res.body.attemptId).toBe(attemptId);
      expect(res.body.sections).toHaveLength(1);
      const items = res.body.sections[0].items;
      expect(items).toHaveLength(2);

      // Verify no answerKey or solution properties present
      items.forEach((item: any) => {
        expect(item.answerKey).toBeUndefined();
        expect(item.content.correctOptionId).toBeUndefined();
        expect(item.content.acceptableAnswers).toBeUndefined();
      });
    });

    it('autosaves response for question 1 and increments revision', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${singleChoiceItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({
          responsePayload: { selectedOptionId: 'opt-201' },
        })
        .expect(HttpStatus.OK);

      expect(res.body.revision).toBe(1);
      expect(res.body.responsePayload.selectedOptionId).toBe('opt-201');
    });

    it('updates response with valid expectedRevision', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${singleChoiceItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({
          responsePayload: { selectedOptionId: 'opt-201' },
          expectedRevision: 1,
        })
        .expect(HttpStatus.OK);

      expect(res.body.revision).toBe(2);
    });

    it('rejects stale autosave with HTTP 409 Conflict', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${singleChoiceItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({
          responsePayload: { selectedOptionId: 'opt-200' },
          expectedRevision: 1, // Current is 2 -> Stale!
        })
        .expect(HttpStatus.CONFLICT);
    });

    it('loads all saved responses on resume', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${attemptId}/responses`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].itemRefId).toBe(singleChoiceItemRefId);
      expect(res.body[0].revision).toBe(2);
    });

    it('finalizes and submits examination attempt', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.isReleased).toBe(true);
      expect(res.body.grade).toBeDefined();
      expect(res.body.grade.totalAwardedPoints).toBe(5); // Q1 correct (5pts), Q2 unattempted (0pts)
      expect(res.body.grade.percentageScore).toBe(50);
      expect(res.body.grade.isPassing).toBe(true); // passingScore = 50
    });

    it('locks attempt from further response modifications after submission', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${singleChoiceItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt-200' } })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('allows Charlie to retrieve released examination result', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${attemptId}/result`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.isReleased).toBe(true);
      expect(res.body.grade.totalAwardedPoints).toBe(5);
      expect(res.body.grade.isPassing).toBe(true);
    });

    it('updates learner discovery status: no active attempt, 1 completed attempt', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/learner/exams')
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      const found = res.body.find((e: any) => e.assessmentId === assessmentId);
      expect(found.activeAttempt).toBeNull();
      expect(found.existingAttemptsCount).toBe(1);
      expect(found.latestAttempt.id).toBe(attemptId);
      expect(found.latestAttempt.status).toBe('COMPLETED');
    });
  });
});
