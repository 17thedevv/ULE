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

describe('Phase 5.5: ExamAttempt Runtime, Timed Sessions & Deterministic Auto-Grading Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const trustedOrigin = 'http://localhost:5173';

  // Test Accounts
  const userAlice = {
    email: `alice_runtime_${Date.now()}@ule.internal`,
    password: 'EducatorPassword123!',
    name: 'Educator Alice (Primary Exam Creator)',
  };

  const userBob = {
    email: `bob_runtime_${Date.now()}@ule.internal`,
    password: 'EducatorPassword123!',
    name: 'Educator Bob (Isolated Secondary Creator)',
  };

  const userCharlie = {
    email: `charlie_runtime_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner Charlie (Audited Primary Learner)',
  };

  let aliceCookie: string;
  let bobCookie: string;
  let charlieCookie: string;

  let aliceId: string;
  let charlieId: string;

  // Question IDs
  let mcqQuestionId: string;
  let numericQuestionId: string;
  let trueFalseQuestionId: string;
  let clozeQuestionId: string;
  let matchingQuestionId: string;
  let orderingQuestionId: string;
  let multipleChoiceQuestionId: string;
  let essayQuestionId: string;

  // Published Assessment Versions
  let standaloneAssessmentId: string;
  let standaloneVersionId: string;

  let objectiveAssessmentId: string;
  let objectiveVersionId: string;
  const objectiveItemMap: Record<string, string> = {}; // type -> itemRefId

  let mixedAssessmentId: string;
  let mixedVersionId: string;
  let mixedEssayItemRefId: string;
  let mixedMcqItemRefId: string;

  let deferredAssessmentId: string;
  let deferredVersionId: string;

  let manualAssessmentId: string;
  let manualVersionId: string;

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

    // 1. Register Educator Alice
    const aliceReg = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userAlice)
      .expect(HttpStatus.OK);
    aliceCookie = extractCookies(aliceReg);
    const aliceMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.OK);
    aliceId = aliceMe.body.user.id;

    // 2. Register Educator Bob
    const bobReg = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userBob)
      .expect(HttpStatus.OK);
    bobCookie = extractCookies(bobReg);
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', bobCookie)
      .expect(HttpStatus.OK);

    // 3. Register Learner Charlie
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

    // -------------------------------------------------------------------------
    // Setup Questions in Question Bank (All 9 types)
    // -------------------------------------------------------------------------
    // A. SINGLE_CHOICE
    const mcqRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'SINGLE_CHOICE',
        title: 'Single Choice Question',
        prompt: 'What is 3 * 3?',
        content: {
          options: [
            { id: 'opt_9', text: '9' },
            { id: 'opt_6', text: '6' },
          ],
        },
        answerKey: { correctOptionId: 'opt_9' },
        defaultPoints: 5.0,
      })
      .expect(HttpStatus.CREATED);
    mcqQuestionId = mcqRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${mcqQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // B. MULTIPLE_CHOICE
    const multiRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'MULTIPLE_CHOICE',
        title: 'Multiple Choice Question',
        prompt: 'Select even numbers:',
        content: {
          options: [
            { id: 'opt_2', text: '2' },
            { id: 'opt_3', text: '3' },
            { id: 'opt_4', text: '4' },
          ],
        },
        answerKey: { correctOptionIds: ['opt_2', 'opt_4'] },
        defaultPoints: 5.0,
      })
      .expect(HttpStatus.CREATED);
    multipleChoiceQuestionId = multiRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${multipleChoiceQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // C. TRUE_FALSE
    const tfRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'TRUE_FALSE',
        title: 'True False Question',
        prompt: 'Water boils at 100C at standard pressure.',
        content: {},
        answerKey: { correctValue: true },
        defaultPoints: 5.0,
      })
      .expect(HttpStatus.CREATED);
    trueFalseQuestionId = tfRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${trueFalseQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // D. CLOZE
    const clozeRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'CLOZE',
        title: 'Cloze Question',
        prompt: 'The chemical formula of water is [[water]].',
        content: {
          templateText: 'The chemical formula of water is {{water}}.',
          targetBlanks: [{ blankKey: 'water' }],
        },
        answerKey: {
          blanks: { water: ['H2O', 'h2o', 'water'] },
        },
        defaultPoints: 5.0,
      })
      .expect(HttpStatus.CREATED);
    clozeQuestionId = clozeRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${clozeQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // E. NUMERIC
    const numRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'NUMERIC',
        title: 'Numeric Question',
        prompt: 'Value of g in m/s^2 to 2 decimal places:',
        content: {},
        answerKey: { correctValue: 9.81, tolerance: 0.05, toleranceType: 'ABSOLUTE' },
        defaultPoints: 5.0,
      })
      .expect(HttpStatus.CREATED);
    numericQuestionId = numRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${numericQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // F. MATCHING
    const matchRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'MATCHING',
        title: 'Matching Question',
        prompt: 'Match elements to symbols:',
        content: {
          premises: [{ id: 'p_gold', text: 'Gold' }, { id: 'p_silver', text: 'Silver' }],
          targets: [{ id: 't_au', text: 'Au' }, { id: 't_ag', text: 'Ag' }],
        },
        answerKey: {
          pairs: { p_gold: 't_au', p_silver: 't_ag' },
        },
        defaultPoints: 5.0,
      })
      .expect(HttpStatus.CREATED);
    matchingQuestionId = matchRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${matchingQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // G. ORDERING
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'ORDERING',
        title: 'Ordering Question',
        prompt: 'Order numbers ascending:',
        content: {
          items: [
            { id: 'num_1', text: 'First number 1' },
            { id: 'num_2', text: 'Second number 2' },
            { id: 'num_3', text: 'Third number 3' },
          ],
        },
        answerKey: {
          correctSequence: ['num_1', 'num_2', 'num_3'],
        },
        defaultPoints: 5.0,
      })
      .expect(HttpStatus.CREATED);
    orderingQuestionId = orderRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${orderingQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // H. ESSAY
    const essayRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'ESSAY',
        title: 'Essay Question',
        prompt: 'Analyze algorithmic complexity trade-offs.',
        content: {},
        rubric: {
          criteria: [{ id: 'c1', name: 'Analysis', maxPoints: 10 }],
        },
        defaultPoints: 10.0,
      })
      .expect(HttpStatus.CREATED);
    essayQuestionId = essayRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${essayQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // -------------------------------------------------------------------------
    // Setup Standalone Assessment (for Access Grant Testing)
    // -------------------------------------------------------------------------
    const standDef = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Standalone Examination Assessment',
        durationMinutes: 30,
        passingScore: 70.0,
        maxAttempts: 1,
        feedbackPolicy: 'IMMEDIATE',
      })
      .expect(HttpStatus.CREATED);
    standaloneAssessmentId = standDef.body.id;

    const standSec = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${standaloneAssessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'Main Section', orderIndex: 0 })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .post(`/api/v1/assessments/${standaloneAssessmentId}/sections/${standSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: mcqQuestionId, points: 5.0 })
      .expect(HttpStatus.CREATED);

    const standPub = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${standaloneAssessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: 'stand-pub-v1' })
      .expect(HttpStatus.CREATED);
    standaloneVersionId = standPub.body.id;

    // -------------------------------------------------------------------------
    // Setup 7-Objective Assessment (All 7 Objective Types)
    // -------------------------------------------------------------------------
    const objDef = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: '7-Objective Full Test Assessment',
        durationMinutes: 45,
        passingScore: 80.0,
        maxAttempts: 2,
        feedbackPolicy: 'IMMEDIATE',
      })
      .expect(HttpStatus.CREATED);
    objectiveAssessmentId = objDef.body.id;

    const objSec = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${objectiveAssessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'Objective Section', orderIndex: 0 })
      .expect(HttpStatus.CREATED);

    const qItems = [
      { type: 'SINGLE_CHOICE', id: mcqQuestionId },
      { type: 'MULTIPLE_CHOICE', id: multipleChoiceQuestionId },
      { type: 'TRUE_FALSE', id: trueFalseQuestionId },
      { type: 'CLOZE', id: clozeQuestionId },
      { type: 'NUMERIC', id: numericQuestionId },
      { type: 'MATCHING', id: matchingQuestionId },
      { type: 'ORDERING', id: orderingQuestionId },
    ];

    for (const qi of qItems) {
      const itRes = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${objectiveAssessmentId}/sections/${objSec.body.id}/items`)
        .set('Cookie', aliceCookie)
        .send({ questionBankItemId: qi.id, points: 5.0 })
        .expect(HttpStatus.CREATED);
      objectiveItemMap[qi.type] = itRes.body.id;
    }

    const objPub = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${objectiveAssessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: 'obj-pub-v1' })
      .expect(HttpStatus.CREATED);
    objectiveVersionId = objPub.body.id;

    // -------------------------------------------------------------------------
    // Setup Mixed Assessment (Objective + Subjective Essay)
    // -------------------------------------------------------------------------
    const mixDef = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Mixed Objective and Subjective Assessment',
        durationMinutes: 60,
        passingScore: 60.0,
        maxAttempts: 1,
        feedbackPolicy: 'IMMEDIATE',
      })
      .expect(HttpStatus.CREATED);
    mixedAssessmentId = mixDef.body.id;

    const mixSec = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${mixedAssessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'Mixed Section', orderIndex: 0 })
      .expect(HttpStatus.CREATED);

    const mixMcq = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${mixedAssessmentId}/sections/${mixSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: mcqQuestionId, points: 5.0 })
      .expect(HttpStatus.CREATED);
    mixedMcqItemRefId = mixMcq.body.id;

    const mixEssay = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${mixedAssessmentId}/sections/${mixSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: essayQuestionId, points: 10.0 })
      .expect(HttpStatus.CREATED);
    mixedEssayItemRefId = mixEssay.body.id;

    const mixPub = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${mixedAssessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: 'mix-pub-v1' })
      .expect(HttpStatus.CREATED);
    mixedVersionId = mixPub.body.id;

    // -------------------------------------------------------------------------
    // Setup Deferred & Manual Policy Assessments
    // -------------------------------------------------------------------------
    const defDef = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Deferred Release Assessment',
        durationMinutes: 30,
        passingScore: 70.0,
        maxAttempts: 1,
        feedbackPolicy: 'DEFERRED',
      })
      .expect(HttpStatus.CREATED);
    deferredAssessmentId = defDef.body.id;
    const defSec = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${deferredAssessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'Section 1' })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(`/api/v1/assessments/${deferredAssessmentId}/sections/${defSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: mcqQuestionId, points: 5.0 })
      .expect(HttpStatus.CREATED);
    const defPub = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${deferredAssessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: 'def-pub-v1' })
      .expect(HttpStatus.CREATED);
    deferredVersionId = defPub.body.id;

    const manDef = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Manual Release Assessment',
        durationMinutes: 30,
        passingScore: 70.0,
        maxAttempts: 1,
        feedbackPolicy: 'MANUAL',
      })
      .expect(HttpStatus.CREATED);
    manualAssessmentId = manDef.body.id;
    const manSec = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${manualAssessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'Section 1' })
      .expect(HttpStatus.CREATED);
    await request(app.getHttpServer())
      .post(`/api/v1/assessments/${manualAssessmentId}/sections/${manSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: mcqQuestionId, points: 5.0 })
      .expect(HttpStatus.CREATED);
    const manPub = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${manualAssessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: 'man-pub-v1' })
      .expect(HttpStatus.CREATED);
    manualVersionId = manPub.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ===========================================================================
  // Gate A: Learner Authorization & Access Grants
  // ===========================================================================
  describe('Gate A: Learner Authorization & Access Grants', () => {
    it('prevents un-enrolled / un-granted Charlie from attempting Alice’s standalone assessment (HTTP 403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/exams/${standaloneVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.FORBIDDEN);
    });

    it('prevents non-creator Bob from granting access to Alice’s assessment (HTTP 403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${standaloneAssessmentId}/access-grants`)
        .set('Cookie', bobCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('allows creator Alice to grant standalone access to learner Charlie (HTTP 201)', async () => {
      const grantRes = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${standaloneAssessmentId}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      expect(grantRes.body.assessmentDefinitionId).toBe(standaloneAssessmentId);
      expect(grantRes.body.userId).toBe(charlieId);
      expect(grantRes.body.status).toBe('ACTIVE');

      // Now Charlie can start an attempt successfully
      const attemptRes = await request(app.getHttpServer())
        .post(`/api/v1/exams/${standaloneVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({ idempotencyKey: 'gate-a-attempt-1' })
        .expect(HttpStatus.CREATED);

      expect(attemptRes.body.learnerId).toBe(charlieId);
      expect(attemptRes.body.status).toBe('IN_PROGRESS');
      expect(attemptRes.body.attemptNumber).toBe(1);
    });

    it('denies attempt creation if learner holds an ACTIVE CourseEnrollment but CourseAccessGrant is REVOKED (HTTP 403 fail-closed)', async () => {
      // 1. Create a course owned by Alice
      const course = await prisma.course.create({
        data: {
          ownerId: aliceId,
          visibility: 'PUBLIC',
        },
      });

      const courseVersion = await prisma.courseVersion.create({
        data: {
          courseId: course.id,
          versionNumber: 1,
          title: 'Course with Revoked Grant Test',
          snapshot: {},
          draftRevision: 1,
          createdById: aliceId,
        },
      });

      // 2. Create assessment linked to this course
      const courseAss = await prisma.assessmentDefinition.create({
        data: {
          title: 'Course Bound Assessment',
          courseId: course.id,
          ownerId: course.ownerId,
          status: 'PUBLISHED',
          feedbackPolicy: 'ON_SUBMISSION',
        },
      });

      const courseAssVer = await prisma.assessmentVersion.create({
        data: {
          assessmentDefinitionId: courseAss.id,
          versionNumber: 1,
          title: 'Course Bound Assessment v1',
          totalPoints: 5.0,
          itemCount: 1,
          feedbackPolicy: 'ON_SUBMISSION',
          snapshot: { sections: [] },
          draftRevision: 1,
          createdById: aliceId,
        },
      });

      // 3. Create ACTIVE enrollment for Charlie
      await prisma.courseEnrollment.create({
        data: {
          userId: charlieId,
          courseVersionId: courseVersion.id,
          status: 'ACTIVE',
        },
      });

      // 4. Create REVOKED CourseAccessGrant for Charlie
      await prisma.courseAccessGrant.create({
        data: {
          courseId: course.id,
          courseVersionId: courseVersion.id,
          userId: charlieId,
          grantedById: course.ownerId,
          status: 'REVOKED',
          revokedAt: new Date(),
        },
      });

      // 5. Attempt creation must be denied (fail-closed HTTP 403)
      const errRes = await request(app.getHttpServer())
        .post(`/api/v1/exams/${courseAssVer.id}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.FORBIDDEN);

      expect(errRes.body.message).toContain('Course access grant has been revoked');
    });
  });

  // ===========================================================================
  // Gate B: Concurrency-Safe Attempt Allocation & Idempotency Replay
  // ===========================================================================
  describe('Gate B: Concurrency-Safe Attempt Allocation under MaxAttempts', () => {
    it('rejects concurrent second attempt while first attempt is IN_PROGRESS (HTTP 409 Conflict)', async () => {
      // Grant Charlie access to objectiveAssessment
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${objectiveAssessmentId}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      // Charlie starts attempt 1
      const att1 = await request(app.getHttpServer())
        .post(`/api/v1/exams/${objectiveVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({ idempotencyKey: 'idem-gate-b-1' })
        .expect(HttpStatus.CREATED);

      expect(att1.body.attemptNumber).toBe(1);
      expect(att1.body.status).toBe('IN_PROGRESS');

      // Charlie tries to start another attempt without completing attempt 1 -> HTTP 409
      await request(app.getHttpServer())
        .post(`/api/v1/exams/${objectiveVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({ idempotencyKey: 'diff-key-while-in-progress' })
        .expect(HttpStatus.CONFLICT);

      // Replaying identical idempotencyKey returns existing attempt without incrementing attemptNumber
      const retry = await request(app.getHttpServer())
        .post(`/api/v1/exams/${objectiveVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({ idempotencyKey: 'idem-gate-b-1' })
        .expect(HttpStatus.CREATED);

      expect(retry.body.id).toBe(att1.body.id);
      expect(retry.body.attemptNumber).toBe(1);
    });

    it('enforces maxAttempts limit and rejects starting beyond allowed attempts', async () => {
      // standaloneAssessment has maxAttempts = 1
      // Complete Charlie's active standalone attempt
      const attempts = await prisma.examAttempt.findMany({
        where: { assessmentVersionId: standaloneVersionId, learnerId: charlieId },
      });
      const activeAttempt = attempts[0];
      expect(activeAttempt).toBeDefined();

      // Submit attempt
      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${activeAttempt.id}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      // Try starting Attempt #2 on standalone assessment with maxAttempts = 1 -> HTTP 409 Conflict
      await request(app.getHttpServer())
        .post(`/api/v1/exams/${standaloneVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CONFLICT);
    });
  });

  // ===========================================================================
  // Gate C: Server Timing & Lazy Expiration
  // ===========================================================================
  describe('Gate C: Server Timing & Lazy Expiration', () => {
    it('authoritatively expires attempt when server deadline has elapsed', async () => {
      // Grant Charlie access to deferred assessment
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${deferredAssessmentId}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      const attRes = await request(app.getHttpServer())
        .post(`/api/v1/exams/${deferredVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);

      const attemptId = attRes.body.id;
      expect(attRes.body.deadlineAt).toBeDefined();

      // Artificially manipulate deadlineAt in DB to 5 minutes ago
      const expiredTime = new Date(Date.now() - 300000);
      await prisma.examAttempt.update({
        where: { id: attemptId },
        data: { deadlineAt: expiredTime },
      });

      // Reading attempt triggers lazy expiration -> EXPIRED
      const readRes = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${attemptId}`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(readRes.body.status).toBe('EXPIRED');

      // Saving response on expired attempt is rejected -> HTTP 400
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/any-item`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { test: true } })
        .expect(HttpStatus.BAD_REQUEST);

      // Submitting expired attempt is rejected -> HTTP 400
      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('sustainably commits EXPIRED transition even when submit attempt throws 400', async () => {
      // 1. Create a dedicated assessment for Alice
      const expAss = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({
          title: 'Expiration Sustainable Commit Test',
          durationMinutes: 1,
          feedbackPolicy: 'ON_SUBMISSION',
        })
        .expect(HttpStatus.CREATED);

      const sec = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${expAss.body.id}/sections`)
        .set('Cookie', aliceCookie)
        .send({ title: 'Sec' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${expAss.body.id}/sections/${sec.body.id}/items`)
        .set('Cookie', aliceCookie)
        .send({ questionBankItemId: mcqQuestionId, points: 5.0 })
        .expect(HttpStatus.CREATED);

      const pub = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${expAss.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'gate-c-exp-pub-1' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${expAss.body.id}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${pub.body.id}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);

      const attemptId = att.body.id;

      // Artificially backdate deadlineAt to 10 minutes ago
      await prisma.examAttempt.update({
        where: { id: attemptId },
        data: {
          deadlineAt: new Date(Date.now() - 600000),
          status: 'IN_PROGRESS',
        },
      });

      // Directly attempt to submit overdue attempt -> HTTP 400 Bad Request
      const subErr = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.BAD_REQUEST);

      expect(subErr.body.message).toContain('expired');

      // Crucial: Verify that EXPIRED was sustainably committed to the database, NOT rolled back!
      const dbAttempt = await prisma.examAttempt.findUnique({
        where: { id: attemptId },
      });
      expect(dbAttempt?.status).toBe('EXPIRED');
    });
  });

  // ===========================================================================
  // Gate D: Response Autosave & CAS Concurrency
  // ===========================================================================
  describe('Gate D: Response Autosave & CAS Revision Control', () => {
    let testAttemptId: string;
    let itemId: string;

    beforeAll(async () => {
      // Grant Charlie access to manual assessment
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${manualAssessmentId}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${manualVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      testAttemptId = att.body.id;

      // Extract sanitized questions
      const qRes = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${testAttemptId}/questions`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      itemId = qRes.body.sections[0].items[0].id;
      expect(itemId).toBeDefined();

      // Verify answer key is completely stripped for learner
      expect((qRes.body.sections[0].items[0] as any).answerKey).toBeUndefined();
    });

    it('saves initial response and increments revision monotonically', async () => {
      const save1 = await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${testAttemptId}/responses/${itemId}`)
        .set('Cookie', charlieCookie)
        .send({
          responsePayload: { selectedOptionId: 'opt_9' },
          expectedRevision: 1,
        })
        .expect(HttpStatus.OK);

      expect(save1.body.revision).toBe(1);
      expect(save1.body.isFinal).toBe(false);

      // Update response with matching expectedRevision = 1 -> revision becomes 2
      const save2 = await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${testAttemptId}/responses/${itemId}`)
        .set('Cookie', charlieCookie)
        .send({
          responsePayload: { selectedOptionId: 'opt_6' },
          expectedRevision: 1,
        })
        .expect(HttpStatus.OK);

      expect(save2.body.revision).toBe(2);
    });

    it('rejects stale response update with HTTP 409 Conflict', async () => {
      // Current revision is 2. Passing expectedRevision = 1 must fail with 409 Conflict.
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${testAttemptId}/responses/${itemId}`)
        .set('Cookie', charlieCookie)
        .send({
          responsePayload: { selectedOptionId: 'opt_9' },
          expectedRevision: 1, // Stale!
        })
        .expect(HttpStatus.CONFLICT);
    });

    it('rejects unauthorized secondary learner Bob from tampering with Charlie’s response (HTTP 403)', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${testAttemptId}/responses/${itemId}`)
        .set('Cookie', bobCookie)
        .send({
          responsePayload: { selectedOptionId: 'opt_9' },
        })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  // ===========================================================================
  // Gate E: Submission Freezing & Idempotent Submission
  // ===========================================================================
  describe('Gate E: Submission Freezing & Idempotent Submit', () => {
    let attemptId: string;
    let itemId: string;

    beforeAll(async () => {
      // Find Charlie's active objective attempt from Gate B
      const att = await prisma.examAttempt.findFirst({
        where: { assessmentVersionId: objectiveVersionId, learnerId: charlieId, status: 'IN_PROGRESS' },
      });
      expect(att).toBeDefined();
      attemptId = att!.id;
      itemId = objectiveItemMap['SINGLE_CHOICE'];

      // Save a response
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${itemId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_9' } })
        .expect(HttpStatus.OK);
    });

    it('freezes responses on submit and prevents further mutations', async () => {
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({ idempotencyKey: 'gate-e-submit-1' })
        .expect(HttpStatus.OK);

      expect(subRes.body.status).toBe('COMPLETED');

      // Verify responses in DB have isFinal = true
      const resp = await prisma.examResponse.findUnique({
        where: { examAttemptId_itemRefId: { examAttemptId: attemptId, itemRefId: itemId } },
      });
      expect(resp?.isFinal).toBe(true);

      // Mutating response after submit is rejected -> HTTP 400
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${itemId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_6' } })
        .expect(HttpStatus.BAD_REQUEST);

      // Resubmitting returns identical result idempotently
      const retrySub = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({ idempotencyKey: 'gate-e-submit-1' })
        .expect(HttpStatus.OK);

      expect(retrySub.body.attemptId).toBe(attemptId);
      expect(retrySub.body.status).toBe('COMPLETED');
    });

    it('serializes concurrent autosave and submit using attempt-level locks', async () => {
      // Create a fresh assessment to test concurrent save vs submit
      const ass = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({
          title: 'Concurrent Save vs Submit Test',
          durationMinutes: 60,
          feedbackPolicy: 'ON_SUBMISSION',
        })
        .expect(HttpStatus.CREATED);

      const sec = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${ass.body.id}/sections`)
        .set('Cookie', aliceCookie)
        .send({ title: 'Section 1' })
        .expect(HttpStatus.CREATED);

      const itemRes = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${ass.body.id}/sections/${sec.body.id}/items`)
        .set('Cookie', aliceCookie)
        .send({ questionBankItemId: mcqQuestionId, points: 5.0 })
        .expect(HttpStatus.CREATED);

      const pub = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${ass.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'gate-e-concurrent-pub' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${ass.body.id}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${pub.body.id}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);

      const attemptIdConcurrent = att.body.id;
      const targetItemId = itemRes.body.id;

      // Initial save (revision 1)
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptIdConcurrent}/responses/${targetItemId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_9' } })
        .expect(HttpStatus.OK);

      // Now fire save (revision 2) and submit concurrently
      const [saveRes, submitRes] = await Promise.all([
        request(app.getHttpServer())
          .put(`/api/v1/exam-attempts/${attemptIdConcurrent}/responses/${targetItemId}`)
          .set('Cookie', charlieCookie)
          .send({ responsePayload: { selectedOptionId: 'opt_9' }, expectedRevision: 1 }),
        request(app.getHttpServer())
          .post(`/api/v1/exam-attempts/${attemptIdConcurrent}/submit`)
          .set('Cookie', charlieCookie)
          .send({}),
      ]);

      // Submit must always succeed
      expect(submitRes.status).toBe(HttpStatus.OK);
      expect(submitRes.body.status).toBe('COMPLETED');

      // Save either succeeded before submit acquired lock (200) or was rejected after submit locked attempt (400)
      expect([HttpStatus.OK, HttpStatus.BAD_REQUEST]).toContain(saveRes.status);

      // Attempt must be COMPLETED and response must be final
      const finalAttempt = await prisma.examAttempt.findUnique({ where: { id: attemptIdConcurrent } });
      expect(finalAttempt?.status).toBe('COMPLETED');

      const finalResponse = await prisma.examResponse.findFirst({
        where: { examAttemptId: attemptIdConcurrent, itemRefId: targetItemId },
      });
      expect(finalResponse?.isFinal).toBe(true);

      // Mutating finalized response is rejected
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptIdConcurrent}/responses/${targetItemId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_6' } })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ===========================================================================
  // Gate F: Deterministic Auto-Grading Across All 7 Objective Question Types
  // ===========================================================================
  describe('Gate F: Deterministic Auto-Grading Across All 7 Objective Types', () => {
    it('evaluates all 7 objective types with 100% precision without external AI', async () => {
      // Start Attempt 2 for Charlie on objectiveAssessment (maxAttempts = 2)
      const attRes = await request(app.getHttpServer())
        .post(`/api/v1/exams/${objectiveVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({ idempotencyKey: 'gate-f-obj-attempt-2' })
        .expect(HttpStatus.CREATED);

      const attemptId = attRes.body.id;

      // 1. SINGLE_CHOICE: correct opt_9
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${objectiveItemMap['SINGLE_CHOICE']}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_9' } })
        .expect(HttpStatus.OK);

      // 2. MULTIPLE_CHOICE: correct opt_2, opt_4
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${objectiveItemMap['MULTIPLE_CHOICE']}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionIds: ['opt_2', 'opt_4'] } })
        .expect(HttpStatus.OK);

      // 3. TRUE_FALSE: correct true
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${objectiveItemMap['TRUE_FALSE']}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedBoolean: true } })
        .expect(HttpStatus.OK);

      // 4. CLOZE: correct 'H2O'
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${objectiveItemMap['CLOZE']}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { blanks: { water: '  H2O  ' } } })
        .expect(HttpStatus.OK);

      // 5. NUMERIC: correct 9.81 within 0.05 (submit 9.82)
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${objectiveItemMap['NUMERIC']}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { submittedValue: 9.82 } })
        .expect(HttpStatus.OK);

      // 6. MATCHING: correct gold->Au, silver->Ag
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${objectiveItemMap['MATCHING']}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { pairs: { p_gold: 't_au', p_silver: 't_ag' } } })
        .expect(HttpStatus.OK);

      // 7. ORDERING: correct num_1, num_2, num_3
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${objectiveItemMap['ORDERING']}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { sequence: ['num_1', 'num_2', 'num_3'] } })
        .expect(HttpStatus.OK);

      // Submit attempt
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      expect(subRes.body.status).toBe('COMPLETED');
      expect(subRes.body.isReleased).toBe(true);
      expect(subRes.body.grade).toBeDefined();

      const grade = subRes.body.grade;
      expect(grade.objectivePoints).toBe(35.0); // 7 items * 5.0
      expect(grade.maxPossiblePoints).toBe(35.0);
      expect(grade.percentageScore).toBe(100.0);
      expect(grade.isPassing).toBe(true);
      expect(grade.aggregationStatus).toBe('FULLY_GRADED');
      expect(grade.itemGrades.length).toBe(7);

      for (const ig of grade.itemGrades) {
        expect(ig.isCorrect).toBe(true);
        expect(ig.awardedPoints).toBe(5.0);
        expect(ig.isPendingHuman).toBe(false);
      }
    });
  });

  // ===========================================================================
  // Gate G: Mixed Grading with Pending Essays (PARTIAL_PENDING_HUMAN)
  // ===========================================================================
  describe('Gate G: Mixed Grading with Pending Essays', () => {
    it('transitions to GRADING status and defers essay scoring to human evaluation', async () => {
      // Grant Charlie access to mixed assessment
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${mixedAssessmentId}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      const attRes = await request(app.getHttpServer())
        .post(`/api/v1/exams/${mixedVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);

      const attemptId = attRes.body.id;

      // Answer MCQ correctly
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${mixedMcqItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_9' } })
        .expect(HttpStatus.OK);

      // Answer Essay
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/responses/${mixedEssayItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { essayText: 'Time-space trade-offs in quicksort...' } })
        .expect(HttpStatus.OK);

      // Submit attempt
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      expect(subRes.body.status).toBe('GRADING');
      expect(subRes.body.isReleased).toBe(false);
      expect(subRes.body.grade).toBeUndefined(); // Zero leakage for pending human grading!
      expect(subRes.body.notice).toContain('pending human evaluation');

      // Verify authoritative grade state in database
      const dbGrade = await prisma.examGrade.findUnique({
        where: { examAttemptId: attemptId },
        include: { itemGrades: true },
      });
      expect(dbGrade).toBeDefined();
      expect(dbGrade?.aggregationStatus).toBe('PARTIAL_PENDING_HUMAN');
      expect(dbGrade?.objectivePoints).toBe(5.0);
      expect(dbGrade?.pendingHumanPoints).toBe(10.0);
      expect(dbGrade?.maxPossiblePoints).toBe(15.0);
      expect(dbGrade?.percentageScore).toBeNull();
      expect(dbGrade?.isPassing).toBeNull();
      expect(dbGrade?.isReleased).toBe(false);

      const essayItemGrade = dbGrade?.itemGrades.find(
        (ig) => ig.itemRefId === mixedEssayItemRefId,
      );
      expect(essayItemGrade?.isPendingHuman).toBe(true);
      expect(essayItemGrade?.awardedPoints).toBe(0);

      // Premature manual release must fail with HTTP 400 Bad Request
      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attemptId}/release`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  // ===========================================================================
  // Gate H: Feedback Release Policies (IMMEDIATE, DEFERRED, MANUAL)
  // ===========================================================================
  describe('Gate H: Feedback Release Policies & Anti-Leakage', () => {
    it('withholds deferred exam results until deadline elapses', async () => {
      // 1. Create a dedicated deferred assessment for Gate H
      const defAss = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({
          title: 'Gate H Dedicated Deferred Assessment',
          durationMinutes: 120,
          passingScore: 70.0,
          maxAttempts: 1,
          feedbackPolicy: 'DEFERRED',
        })
        .expect(HttpStatus.CREATED);

      const defSec = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${defAss.body.id}/sections`)
        .set('Cookie', aliceCookie)
        .send({ title: 'Section 1' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${defAss.body.id}/sections/${defSec.body.id}/items`)
        .set('Cookie', aliceCookie)
        .send({ questionBankItemId: mcqQuestionId, points: 5.0 })
        .expect(HttpStatus.CREATED);

      const defPub = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${defAss.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'gate-h-deferred-pub-1' })
        .expect(HttpStatus.CREATED);

      // Grant Charlie access
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${defAss.body.id}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      // Charlie starts attempt
      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${defPub.body.id}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);

      // Charlie submits attempt while deadline is in future
      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${att.body.id}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      // While deadline is in future: results withheld!
      const resSummary = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${att.body.id}/result`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(resSummary.body.isReleased).toBe(false);
      expect(resSummary.body.grade).toBeUndefined(); // Zero leakage!
      expect(resSummary.body.notice).toContain('withheld');

      // Now simulate deadline elapsing: update deadlineAt to past
      await prisma.examAttempt.update({
        where: { id: att.body.id },
        data: { deadlineAt: new Date(Date.now() - 1000) },
      });

      // Reading result after deadline elapses: released automatically!
      const releasedSummary = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${att.body.id}/result`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(releasedSummary.body.isReleased).toBe(true);
      expect(releasedSummary.body.grade).toBeDefined();
    });

    it('withholds manual exam results until explicitly released by creator', async () => {
      // Submit manual attempt
      const attempt = await prisma.examAttempt.findFirst({
        where: { assessmentVersionId: manualVersionId, learnerId: charlieId },
      });
      expect(attempt).toBeDefined();

      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attempt!.id}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      // Before release: result is withheld
      const withheld = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${attempt!.id}/result`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);
      expect(withheld.body.isReleased).toBe(false);

      // Non-creator Bob cannot release -> HTTP 403
      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attempt!.id}/release`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.FORBIDDEN);

      // Creator Alice releases grades
      const released = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attempt!.id}/release`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.OK);

      expect(released.body.isReleased).toBe(true);
      expect(released.body.grade).toBeDefined();
    });

    it('immediately releases fully graded exam results under ON_SUBMISSION feedback policy', async () => {
      // Create dedicated ON_SUBMISSION assessment
      const onSubAss = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({
          title: 'Gate H Dedicated ON_SUBMISSION Assessment',
          durationMinutes: 30,
          passingScore: 70.0,
          maxAttempts: 1,
          feedbackPolicy: 'ON_SUBMISSION',
        })
        .expect(HttpStatus.CREATED);

      const sec = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${onSubAss.body.id}/sections`)
        .set('Cookie', aliceCookie)
        .send({ title: 'Section 1' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${onSubAss.body.id}/sections/${sec.body.id}/items`)
        .set('Cookie', aliceCookie)
        .send({ questionBankItemId: mcqQuestionId, points: 5.0 })
        .expect(HttpStatus.CREATED);

      const pub = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${onSubAss.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'gate-h-onsub-pub' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${onSubAss.body.id}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${pub.body.id}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);

      // Submit attempt
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${att.body.id}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      expect(subRes.body.status).toBe('COMPLETED');
      expect(subRes.body.feedbackPolicy).toBe('ON_SUBMISSION');
      expect(subRes.body.isReleased).toBe(true);
      expect(subRes.body.grade).toBeDefined();
      expect(subRes.body.grade.isReleased).toBe(true);
    });
  });

  // ===========================================================================
  // Gate I: Pinned Version Stability
  // ===========================================================================
  describe('Gate I: Pinned Version Blueprint Stability', () => {
    it('modifying draft question bank item does not alter published version snapshot or attempt grading', async () => {
      // Mutate MCQ question draft in QuestionBank
      await request(app.getHttpServer())
        .put(`/api/v1/question-bank/${mcqQuestionId}`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 1,
          title: 'Altered MCQ Title Post-Publication',
          prompt: 'Altered prompt completely!',
        })
        .expect(HttpStatus.OK);

      // Verify the AssessmentVersion snapshot still has original prompt
      const v = await prisma.assessmentVersion.findUnique({
        where: { id: objectiveVersionId },
      });
      const snap = v?.snapshot as any;
      expect(snap.sections[0].items[0].prompt).toBe('What is 3 * 3?');
    });
  });

  // ===========================================================================
  // Gate J: Zero Premature Evidence or Gamification Emission
  // ===========================================================================
  describe('Gate J: Zero Premature Evidence or Gamification Emission', () => {
    it('verifies learning_evidences and ab_runs have zero records emitted by exam runtime', async () => {
      const evidenceCount = await prisma.learningEvidence.count({
        where: { userId: charlieId },
      });
      expect(evidenceCount).toBe(0);

      const runCount = await prisma.aBRun.count({
        where: { userId: charlieId },
      });
      expect(runCount).toBe(0);
    });
  });
});
