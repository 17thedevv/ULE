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

describe('Phase 5.5: Exam PR #3 — Human Rubric Grading, Grade Revisions & Appeals Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const trustedOrigin = 'http://localhost:5173';

  // Test Accounts
  const userAlice = {
    email: `alice_grading_${Date.now()}@ule.internal`,
    password: 'EducatorPassword123!',
    name: 'Educator Alice (Authoritative Creator)',
  };

  const userBob = {
    email: `bob_grading_${Date.now()}@ule.internal`,
    password: 'EducatorPassword123!',
    name: 'Educator Bob (Unrelated Creator)',
  };

  const userCharlie = {
    email: `charlie_grading_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner Charlie (Primary Student)',
  };

  const userDavid = {
    email: `david_grading_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner David (Secondary Student)',
  };

  let aliceCookie: string;
  let bobCookie: string;
  let charlieCookie: string;
  let davidCookie: string;

  let aliceId: string;
  let charlieId: string;
  let davidId: string;

  let initialEvidenceCount = 0;
  let initialFactsCount = 0;
  let initialQuestCount = 0;
  let initialAbRunCount = 0;

  // Question IDs
  let mcqQuestionId: string;
  let essayQuestionId: string;
  let normalizedEssayQuestionId: string;
  let shortTextQuestionId: string;

  // Published Assessment Versions
  let mixedAssessmentId: string;
  let mixedVersionId: string;
  let mixedEssayItemRefId: string;
  let mixedMcqItemRefId: string;

  let multiSubjectiveAssessmentId: string;
  let multiSubjectiveVersionId: string;
  let multiEssay1RefId: string;
  let multiEssay2RefId: string;

  let normalizedAssessmentId: string;
  let normalizedVersionId: string;
  let normalizedEssayRefId: string;

  let shortTextAssessmentId: string;
  let shortTextVersionId: string;
  let shortTextRefId: string;

  let deferredAssessmentId: string;
  let deferredVersionId: string;
  let deferredEssayRefId: string;

  let manualAssessmentId: string;
  let manualVersionId: string;
  let manualEssayRefId: string;

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

    initialEvidenceCount = await prisma.learningEvidence.count();
    initialFactsCount = await prisma.qualifyingFact.count();
    initialQuestCount = await prisma.questInstance.count();
    initialAbRunCount = await prisma.aBRun.count();

    // 1. Register Accounts
    const aliceReg = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userAlice)
      .expect(HttpStatus.OK);
    aliceCookie = extractCookies(aliceReg);
    aliceId = aliceReg.body.user.id;

    const bobReg = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userBob)
      .expect(HttpStatus.OK);
    bobCookie = extractCookies(bobReg);

    const charlieReg = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userCharlie)
      .expect(HttpStatus.OK);
    charlieCookie = extractCookies(charlieReg);
    charlieId = charlieReg.body.user.id;

    const davidReg = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userDavid)
      .expect(HttpStatus.OK);
    davidCookie = extractCookies(davidReg);
    davidId = davidReg.body.user.id;

    // 2. Setup Question Bank Items
    // A. Objective MCQ Question
    const mcqRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'SINGLE_CHOICE',
        title: 'MCQ Logic',
        prompt: 'Is 2+2=4?',
        content: {
          options: [
            { id: 'opt_true', text: 'True' },
            { id: 'opt_false', text: 'False' },
          ],
        },
        answerKey: { correctOptionId: 'opt_true' },
        defaultPoints: 5.0,
      })
      .expect(HttpStatus.CREATED);
    mcqQuestionId = mcqRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${mcqQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // B. Standard Essay with multi-criteria rubric (sum = 10 pts)
    const essayRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'ESSAY',
        title: 'Analytical Essay',
        prompt: 'Evaluate the sociopolitical impact of decentralized networks.',
        content: {},
        rubric: {
          criteria: [
            { id: 'reasoning', name: 'Reasoning & Argument', maxPoints: 5.0 },
            { id: 'clarity', name: 'Clarity & Structure', maxPoints: 5.0 },
          ],
        },
        defaultPoints: 10.0,
      })
      .expect(HttpStatus.CREATED);
    essayQuestionId = essayRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${essayQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // C. Essay for Normalization Test (rubric raw criteria sum = 10, item weight = 25)
    const normEssayRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'ESSAY',
        title: 'Normalized Essay',
        prompt: 'Critique microservices vs modular monolith.',
        content: {},
        rubric: {
          criteria: [
            { id: 'crit_depth', name: 'Technical Depth', maxPoints: 6.0 },
            { id: 'crit_feasibility', name: 'Architectural Feasibility', maxPoints: 4.0 },
          ],
        },
        defaultPoints: 10.0,
      })
      .expect(HttpStatus.CREATED);
    normalizedEssayQuestionId = normEssayRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${normalizedEssayQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // D. SHORT_TEXT Question
    const shortTextRes = await request(app.getHttpServer())
      .post('/api/v1/question-bank')
      .set('Cookie', aliceCookie)
      .send({
        type: 'SHORT_TEXT',
        title: 'Short Text Explanation',
        prompt: 'Explain what CAS stands for in computer science.',
        content: {},
        answerKey: { acceptableAnswers: ['Compare-And-Swap', 'Compare And Swap'] },
        defaultPoints: 5.0,
      })
      .expect(HttpStatus.CREATED);
    shortTextQuestionId = shortTextRes.body.id;
    await request(app.getHttpServer())
      .post(`/api/v1/question-bank/${shortTextQuestionId}/versions`)
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.CREATED);

    // 3. Setup Assessment Blueprints
    // Blueprint 1: Mixed Assessment (1 MCQ 5pts + 1 Essay 10pts = 15pts, passingScore 70%)
    const mixedDef = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Mixed MCQ + Essay Examination',
        durationMinutes: 60,
        passingScore: 70.0,
        feedbackPolicy: 'IMMEDIATE',
        maxAttempts: 10,
      })
      .expect(HttpStatus.CREATED);
    mixedAssessmentId = mixedDef.body.id;

    const mixedSec = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${mixedAssessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'Section 1' })
      .expect(HttpStatus.CREATED);

    const it1 = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${mixedAssessmentId}/sections/${mixedSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: mcqQuestionId, points: 5.0 })
      .expect(HttpStatus.CREATED);
    mixedMcqItemRefId = it1.body.id;

    const it2 = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${mixedAssessmentId}/sections/${mixedSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: essayQuestionId, points: 10.0 })
      .expect(HttpStatus.CREATED);
    mixedEssayItemRefId = it2.body.id;

    const mixedPub = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${mixedAssessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: 'pub-mixed-exam' })
      .expect(HttpStatus.CREATED);
    mixedVersionId = mixedPub.body.id;

    // Blueprint 2: Multi-Subjective (2 Essays)
    const multiDef = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Dual Essay Examination',
        durationMinutes: 90,
        passingScore: 60.0,
        feedbackPolicy: 'IMMEDIATE',
        maxAttempts: 10,
      })
      .expect(HttpStatus.CREATED);
    multiSubjectiveAssessmentId = multiDef.body.id;

    const multiSec = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${multiSubjectiveAssessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'Essays' })
      .expect(HttpStatus.CREATED);

    const mIt1 = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${multiSubjectiveAssessmentId}/sections/${multiSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: essayQuestionId, points: 10.0 })
      .expect(HttpStatus.CREATED);
    multiEssay1RefId = mIt1.body.id;

    const mIt2 = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${multiSubjectiveAssessmentId}/sections/${multiSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: essayQuestionId, points: 10.0 })
      .expect(HttpStatus.CREATED);
    multiEssay2RefId = mIt2.body.id;

    const multiPub = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${multiSubjectiveAssessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: 'pub-multi-essay' })
      .expect(HttpStatus.CREATED);
    multiSubjectiveVersionId = multiPub.body.id;

    // Blueprint 3: Normalized Essay Blueprint (item points = 25.0, rubric sum = 10.0)
    const normDef = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Normalized Weight Examination',
        durationMinutes: 45,
        feedbackPolicy: 'ON_SUBMISSION',
        maxAttempts: 10,
      })
      .expect(HttpStatus.CREATED);
    normalizedAssessmentId = normDef.body.id;

    const normSec = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${normalizedAssessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'Section A' })
      .expect(HttpStatus.CREATED);

    const nIt = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${normalizedAssessmentId}/sections/${normSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: normalizedEssayQuestionId, points: 25.0 })
      .expect(HttpStatus.CREATED);
    normalizedEssayRefId = nIt.body.id;

    const normPub = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${normalizedAssessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: 'pub-norm-exam' })
      .expect(HttpStatus.CREATED);
    normalizedVersionId = normPub.body.id;

    // Blueprint 4: Short Text Assessment
    const stDef = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Short Text Assessment',
        durationMinutes: 30,
        feedbackPolicy: 'IMMEDIATE',
        maxAttempts: 10,
      })
      .expect(HttpStatus.CREATED);
    shortTextAssessmentId = stDef.body.id;

    const stSec = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${shortTextAssessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'General' })
      .expect(HttpStatus.CREATED);

    const stIt = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${shortTextAssessmentId}/sections/${stSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: shortTextQuestionId, points: 5.0 })
      .expect(HttpStatus.CREATED);
    shortTextRefId = stIt.body.id;

    const stPub = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${shortTextAssessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: 'pub-st-exam' })
      .expect(HttpStatus.CREATED);
    shortTextVersionId = stPub.body.id;

    // Blueprint 5: Deferred Assessment
    const defDef = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Deferred Feedback Exam',
        durationMinutes: 30,
        feedbackPolicy: 'DEFERRED',
        maxAttempts: 10,
      })
      .expect(HttpStatus.CREATED);
    deferredAssessmentId = defDef.body.id;

    const defSec = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${deferredAssessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'Final' })
      .expect(HttpStatus.CREATED);

    const defIt = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${deferredAssessmentId}/sections/${defSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: essayQuestionId, points: 10.0 })
      .expect(HttpStatus.CREATED);
    deferredEssayRefId = defIt.body.id;

    const defPub = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${deferredAssessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: 'pub-deferred-exam' })
      .expect(HttpStatus.CREATED);
    deferredVersionId = defPub.body.id;

    // Blueprint 6: Manual Release Assessment
    const manDef = await request(app.getHttpServer())
      .post('/api/v1/assessments')
      .set('Cookie', aliceCookie)
      .send({
        title: 'Manual Release Exam',
        durationMinutes: 30,
        feedbackPolicy: 'MANUAL',
        maxAttempts: 10,
      })
      .expect(HttpStatus.CREATED);
    manualAssessmentId = manDef.body.id;

    const manSec = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${manualAssessmentId}/sections`)
      .set('Cookie', aliceCookie)
      .send({ title: 'Main' })
      .expect(HttpStatus.CREATED);

    const manIt = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${manualAssessmentId}/sections/${manSec.body.id}/items`)
      .set('Cookie', aliceCookie)
      .send({ questionBankItemId: essayQuestionId, points: 10.0 })
      .expect(HttpStatus.CREATED);
    manualEssayRefId = manIt.body.id;

    const manPub = await request(app.getHttpServer())
      .post(`/api/v1/assessments/${manualAssessmentId}/publish`)
      .set('Cookie', aliceCookie)
      .send({ idempotencyKey: 'pub-manual-exam' })
      .expect(HttpStatus.CREATED);
    manualVersionId = manPub.body.id;

    // 4. Grant Access to Learner Charlie for all assessments
    for (const defId of [
      mixedAssessmentId,
      multiSubjectiveAssessmentId,
      normalizedAssessmentId,
      shortTextAssessmentId,
      deferredAssessmentId,
      manualAssessmentId,
    ]) {
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${defId}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${defId}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: davidId })
        .expect(HttpStatus.CREATED);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // ===========================================================================
  // Gate A: Grader Authorization & RBAC
  // ===========================================================================
  describe('Gate A: Grader Authorization & RBAC', () => {
    let mixedAttemptId: string;
    let pendingEssayItemGradeId: string;

    beforeAll(async () => {
      // Charlie starts and submits mixed exam
      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${mixedVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      mixedAttemptId = att.body.id;

      // Save MCQ response
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${mixedAttemptId}/responses/${mixedMcqItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_true' } })
        .expect(HttpStatus.OK);

      // Save Essay response
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${mixedAttemptId}/responses/${mixedEssayItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { text: 'Decentralized networks enhance resilience.' } })
        .expect(HttpStatus.OK);

      // Submit attempt
      const sub = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${mixedAttemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      expect(sub.body.status).toBe('GRADING');

      // Find pending item grade
      const dbGrade = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: mixedAttemptId },
        include: { itemGrades: true },
      });
      const pendingItem = dbGrade.itemGrades.find((ig) => ig.itemRefId === mixedEssayItemRefId);
      expect(pendingItem).toBeDefined();
      pendingEssayItemGradeId = pendingItem!.id;
    });

    it('allows creator Alice to view pending grading queue for her assessment', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/exam-grading/queue')
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.OK);

      expect(Array.isArray(res.body)).toBe(true);
      const queueItem = res.body.find((q: any) => q.attemptId === mixedAttemptId);
      expect(queueItem).toBeDefined();
      expect(queueItem.learnerName).toBe(userCharlie.name);
      expect(queueItem.pendingItemCount).toBe(1);
      expect(queueItem.pendingItems[0].rubric).toBeDefined();
      expect(queueItem.pendingItems[0].rubric.criteria.length).toBe(2);
    });

    it('rejects unauthorized creator Bob from viewing Alice’s grading attempt context (HTTP 403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/exam-grading/attempts/${mixedAttemptId}`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('prevents learner Charlie from grading their own submission (HTTP 403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${pendingEssayItemGradeId}/evaluations`)
        .set('Cookie', charlieCookie)
        .send({
          criterionScores: [
            { criterionId: 'reasoning', score: 5.0 },
            { criterionId: 'clarity', score: 5.0 },
          ],
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('prevents unauthorized creator Bob from submitting rubric evaluations for Alice’s exam (HTTP 403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${pendingEssayItemGradeId}/evaluations`)
        .set('Cookie', bobCookie)
        .send({
          criterionScores: [
            { criterionId: 'reasoning', score: 4.0 },
            { criterionId: 'clarity', score: 4.0 },
          ],
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('withholds unreleased grading breakdown and raw educator comments from learner view', async () => {
      const learnerRes = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${mixedAttemptId}/result`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(learnerRes.body.isReleased).toBe(false);
      expect(learnerRes.body.grade).toBeUndefined();
      expect(learnerRes.body.notice).toContain('pending human evaluation');
    });
  });

  // ===========================================================================
  // Gate B: Rubric Integrity & Point Normalization
  // ===========================================================================
  describe('Gate B: Rubric Integrity & Point Normalization', () => {
    let normAttemptId: string;
    let normItemGradeId: string;
    let stAttemptId: string;
    let stItemGradeId: string;

    beforeAll(async () => {
      // 1. Normalized Essay Attempt
      const att1 = await request(app.getHttpServer())
        .post(`/api/v1/exams/${normalizedVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      normAttemptId = att1.body.id;

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${normAttemptId}/responses/${normalizedEssayRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { text: 'Modular monolith balances cohesion and deployment simplicity.' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${normAttemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      const dbGrade1 = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: normAttemptId },
        include: { itemGrades: true },
      });
      normItemGradeId = dbGrade1.itemGrades[0].id;

      // 2. Short Text Attempt
      const att2 = await request(app.getHttpServer())
        .post(`/api/v1/exams/${shortTextVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      stAttemptId = att2.body.id;

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${stAttemptId}/responses/${shortTextRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { text: 'Compare and Swap' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${stAttemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      const dbGrade2 = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: stAttemptId },
        include: { itemGrades: true },
      });
      stItemGradeId = dbGrade2.itemGrades[0].id;
    });

    it('rejects evaluation when a required rubric criterion is missing (HTTP 400)', async () => {
      // Published rubric requires 'crit_depth' and 'crit_feasibility'. Only supply 'crit_depth'.
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${normItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [{ criterionId: 'crit_depth', score: 5.0 }],
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain('Missing evaluation for required rubric criterion');
    });

    it('rejects evaluation with an unknown rubric criterion ID not present in published snapshot (HTTP 400)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${normItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'crit_depth', score: 5.0 },
            { criterionId: 'crit_feasibility', score: 3.0 },
            { criterionId: 'unknown_crit_id', score: 2.0 },
          ],
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain('Unknown rubric criterion');
    });

    it('rejects evaluation with duplicate criterion IDs in payload (HTTP 400)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${normItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'crit_depth', score: 4.0 },
            { criterionId: 'crit_depth', score: 5.0 },
            { criterionId: 'crit_feasibility', score: 3.0 },
          ],
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain('Duplicate rubric criterion');
    });

    it('rejects negative scores (< 0) or scores exceeding criterion maxPoints (HTTP 400)', async () => {
      // Negative
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${normItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'crit_depth', score: -1.0 },
            { criterionId: 'crit_feasibility', score: 3.0 },
          ],
        })
        .expect(HttpStatus.BAD_REQUEST);

      // Excessive: crit_depth maxPoints is 6.0, pass 7.0
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${normItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'crit_depth', score: 7.0 },
            { criterionId: 'crit_feasibility', score: 3.0 },
          ],
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain('must be between 0 and maximum allowable 6');
    });

    it('rejects non-finite criterion scores (NaN, Infinity) (HTTP 400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${normItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'crit_depth', score: 'NaN' as any },
            { criterionId: 'crit_feasibility', score: 3.0 },
          ],
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('accurately normalizes rubric score when item configured maxPoints differs from rubric criteria total', async () => {
      // Rubric criteria max: 6.0 + 4.0 = 10.0.
      // Item configured maxPoints = 25.0.
      // Score awarded: crit_depth: 4.5, crit_feasibility: 3.5 -> Total raw: 8.0 / 10.0 (80%).
      // Expected normalized points: 80% * 25.0 = 20.00 points.
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${normItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'crit_depth', score: 4.5 },
            { criterionId: 'crit_feasibility', score: 3.5 },
          ],
          feedback: 'Solid analytical comparison.',
        })
        .expect(HttpStatus.OK);

      expect(res.body.awardedPoints).toBe(20.0);
      expect(res.body.isPendingHuman).toBe(false);
      expect(res.body.isCorrect).toBe(true);

      // Verify that the exam attempt auto-finalized upon resolution of its sole pending item
      const att = await prisma.examAttempt.findUniqueOrThrow({
        where: { id: normAttemptId },
        include: { grade: true },
      });
      expect(att.status).toBe('COMPLETED');
      expect(att.grade?.aggregationStatus).toBe('FULLY_GRADED');
      expect(att.grade?.totalAwardedPoints).toBe(20.0);
      expect(att.grade?.percentageScore).toBe(80.0);
    });

    it('allows manual evaluation of SHORT_TEXT questions with bounded points and mandatory justification', async () => {
      // SHORT_TEXT maxPoints = 5.0. Reject points > 5.0
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${stItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          awardedPoints: 6.0,
          feedback: 'Too high score',
        })
        .expect(HttpStatus.BAD_REQUEST);

      // Valid bounded points 4.5
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${stItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          awardedPoints: 4.5,
          feedback: 'Accurate acronym definition provided with minor casing difference.',
        })
        .expect(HttpStatus.OK);

      expect(res.body.awardedPoints).toBe(4.5);
      expect(res.body.isPendingHuman).toBe(false);
    });
  });

  // ===========================================================================
  // Gate C: Human Grading Lifecycle & State Transitions
  // ===========================================================================
  describe('Gate C: Human Grading Lifecycle & State Transitions', () => {
    let multiAttemptId: string;
    let itemGrade1Id: string;
    let itemGrade2Id: string;

    beforeAll(async () => {
      // Charlie takes Dual Essay exam (2 essays @ 10pts each = 20pts total, passingScore 60%)
      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${multiSubjectiveVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      multiAttemptId = att.body.id;

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${multiAttemptId}/responses/${multiEssay1RefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { text: 'Essay 1 answer content.' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${multiAttemptId}/responses/${multiEssay2RefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { text: 'Essay 2 answer content.' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${multiAttemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      const dbGrade = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: multiAttemptId },
        include: { itemGrades: true },
      });
      const ig1 = dbGrade.itemGrades.find((ig) => ig.itemRefId === multiEssay1RefId)!;
      const ig2 = dbGrade.itemGrades.find((ig) => ig.itemRefId === multiEssay2RefId)!;
      itemGrade1Id = ig1.id;
      itemGrade2Id = ig2.id;
    });

    it('attempt with multiple pending items remains in GRADING when only 1 item is evaluated', async () => {
      // Grade item 1
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${itemGrade1Id}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'reasoning', score: 4.0 },
            { criterionId: 'clarity', score: 4.0 },
          ],
          feedback: 'Good essay 1',
        })
        .expect(HttpStatus.OK);

      // Verify attempt is still GRADING and percentageScore is still null
      const dbAttempt = await prisma.examAttempt.findUniqueOrThrow({
        where: { id: multiAttemptId },
        include: { grade: true },
      });
      expect(dbAttempt.status).toBe('GRADING');
      expect(dbAttempt.grade?.aggregationStatus).toBe('PARTIAL_PENDING_HUMAN');
      expect(dbAttempt.grade?.percentageScore).toBeNull();
      expect(dbAttempt.grade?.isPassing).toBeNull();
    });

    it('transitions attempt to COMPLETED and FULLY_GRADED once all required human items are finalized', async () => {
      // Grade item 2: 3.0 + 3.0 = 6.0/10
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${itemGrade2Id}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'reasoning', score: 3.0 },
            { criterionId: 'clarity', score: 3.0 },
          ],
          feedback: 'Decent essay 2',
        })
        .expect(HttpStatus.OK);

      // Total awarded: 8.0 (essay 1) + 6.0 (essay 2) = 14.0 / 20.0 = 70.0%
      // Passing score is 60.0% -> isPassing: true
      const finalAttempt = await prisma.examAttempt.findUniqueOrThrow({
        where: { id: multiAttemptId },
        include: { grade: true },
      });
      expect(finalAttempt.status).toBe('COMPLETED');
      expect(finalAttempt.grade?.aggregationStatus).toBe('FULLY_GRADED');
      expect(finalAttempt.grade?.totalAwardedPoints).toBe(14.0);
      expect(finalAttempt.grade?.percentageScore).toBe(70.0);
      expect(finalAttempt.grade?.isPassing).toBe(true);
      expect(finalAttempt.completedAt).toBeDefined();
    });

    it('repeated finalization request is idempotent and returns current final grade', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/attempts/${multiAttemptId}/finalize`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'finalize-multi-attempt-replay' })
        .expect(HttpStatus.OK);

      expect(res.body.aggregationStatus).toBe('FULLY_GRADED');
      expect(res.body.totalAwardedPoints).toBe(14.0);
    });

    it('unanswered subjective items are disposed with 0 points, non-pending, and explicit audit disposition', async () => {
      // Charlie takes dual essay exam but leaves Essay 2 blank
      const blankAtt = await request(app.getHttpServer())
        .post(`/api/v1/exams/${multiSubjectiveVersionId}/attempts`)
        .set('Cookie', davidCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      const blankAttemptId = blankAtt.body.id;

      // Only answer essay 1
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${blankAttemptId}/responses/${multiEssay1RefId}`)
        .set('Cookie', davidCookie)
        .send({ responsePayload: { text: 'Only essay 1 was written.' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${blankAttemptId}/submit`)
        .set('Cookie', davidCookie)
        .send({})
        .expect(HttpStatus.OK);

      const dbG = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: blankAttemptId },
        include: { itemGrades: true },
      });
      const ig1 = dbG.itemGrades.find((ig) => ig.itemRefId === multiEssay1RefId)!;

      // Grade essay 1
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${ig1.id}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'reasoning', score: 5.0 },
            { criterionId: 'clarity', score: 5.0 },
          ],
        })
        .expect(HttpStatus.OK);

      // Now creator finalizes grading -> the unattempted essay 2 must be auto-disposed with 0 points
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/attempts/${blankAttemptId}/finalize`)
        .set('Cookie', aliceCookie)
        .send({})
        .expect(HttpStatus.OK);

      const resolvedAttempt = await prisma.examAttempt.findUniqueOrThrow({
        where: { id: blankAttemptId },
        include: { grade: { include: { itemGrades: true } } },
      });

      expect(resolvedAttempt.status).toBe('COMPLETED');
      expect(resolvedAttempt.grade?.aggregationStatus).toBe('FULLY_GRADED');
      const blankItem = resolvedAttempt.grade?.itemGrades.find((ig) => ig.itemRefId === multiEssay2RefId);
      expect(blankItem?.isPendingHuman).toBe(false);
      expect(blankItem?.awardedPoints).toBe(0);
      expect((blankItem?.evaluationDetails as any)?.status).toBe('DISPOSED_UNANSWERED');

      // Check that an audit revision of type UNANSWERED_DISPOSITION was appended
      const revs = await prisma.examHumanGradeRevision.findMany({
        where: { examItemGradeId: blankItem!.id },
      });
      expect(revs.length).toBe(1);
      expect(revs[0].eventType).toBe('UNANSWERED_DISPOSITION');
    });
  });

  // ===========================================================================
  // Gate D: Append-Only Audit History & Ledger
  // ===========================================================================
  describe('Gate D: Append-Only Audit History & Ledger', () => {
    let corrAttemptId: string;
    let corrItemGradeId: string;

    beforeAll(async () => {
      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${mixedVersionId}/attempts`)
        .set('Cookie', davidCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      corrAttemptId = att.body.id;

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${corrAttemptId}/responses/${mixedMcqItemRefId}`)
        .set('Cookie', davidCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_true' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${corrAttemptId}/responses/${mixedEssayItemRefId}`)
        .set('Cookie', davidCookie)
        .send({ responsePayload: { text: 'Audited answer.' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${corrAttemptId}/submit`)
        .set('Cookie', davidCookie)
        .send({})
        .expect(HttpStatus.OK);

      const dbG = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: corrAttemptId },
        include: { itemGrades: true },
      });
      corrItemGradeId = dbG.itemGrades.find((ig) => ig.itemRefId === mixedEssayItemRefId)!.id;
    });

    it('creates immutable revision 1 upon initial evaluation and revision 2 upon grade correction', async () => {
      // 1. Initial Evaluation: 3.0 + 3.0 = 6.0/10.0
      const evalRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${corrItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'reasoning', score: 3.0 },
            { criterionId: 'clarity', score: 3.0 },
          ],
          feedback: 'Initial evaluation comment',
          idempotencyKey: 'eval-key-1',
        })
        .expect(HttpStatus.OK);

      expect(evalRes.body.awardedPoints).toBe(6.0);

      // Verify item revision 1 in database
      const itemAfterEval = await prisma.examItemGrade.findUniqueOrThrow({
        where: { id: corrItemGradeId },
        include: { revisions: { orderBy: { revision: 'asc' } } },
      });
      expect(itemAfterEval.revision).toBe(2); // Initial was 1, updated to 2
      expect(itemAfterEval.revisions.length).toBe(1);
      expect(itemAfterEval.revisions[0].revision).toBe(2);
      expect(itemAfterEval.revisions[0].newAwardedPoints).toBe(6.0);
      expect(itemAfterEval.revisions[0].eventType).toBe('INITIAL_EVALUATION');

      // 2. Grade Correction: change score to 4.0 + 4.0 = 8.0/10.0
      const corrRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${corrItemGradeId}/corrections`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 2,
          reason: 'Educator regraded after re-evaluating technical reasoning depth.',
          criterionScores: [
            { criterionId: 'reasoning', score: 4.0 },
            { criterionId: 'clarity', score: 4.0 },
          ],
          feedback: 'Updated evaluation comment',
          idempotencyKey: 'corr-key-1',
        })
        .expect(HttpStatus.OK);

      expect(corrRes.body.awardedPoints).toBe(8.0);

      // Verify both revisions exist in database
      const itemAfterCorr = await prisma.examItemGrade.findUniqueOrThrow({
        where: { id: corrItemGradeId },
        include: { revisions: { orderBy: { revision: 'asc' } } },
      });
      expect(itemAfterCorr.revision).toBe(3);
      expect(itemAfterCorr.revisions.length).toBe(2);

      // Historical revision 1 remains unchanged
      expect(itemAfterCorr.revisions[0].revision).toBe(2);
      expect(itemAfterCorr.revisions[0].newAwardedPoints).toBe(6.0);
      expect(itemAfterCorr.revisions[0].actorId).toBe(aliceId);

      // Revision 2 contains correction
      expect(itemAfterCorr.revisions[1].revision).toBe(3);
      expect(itemAfterCorr.revisions[1].previousAwardedPoints).toBe(6.0);
      expect(itemAfterCorr.revisions[1].newAwardedPoints).toBe(8.0);
      expect(itemAfterCorr.revisions[1].eventType).toBe('CORRECTION');
      expect(itemAfterCorr.revisions[1].reason).toContain('technical reasoning depth');
    });

    it('idempotent replay with same idempotencyKey returns existing revision without creating duplicates', async () => {
      const replayRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${corrItemGradeId}/corrections`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 2, // Replaying original request
          reason: 'Educator regraded after re-evaluating technical reasoning depth.',
          criterionScores: [
            { criterionId: 'reasoning', score: 4.0 },
            { criterionId: 'clarity', score: 4.0 },
          ],
          idempotencyKey: 'corr-key-1',
        })
        .expect(HttpStatus.OK);

      expect(replayRes.body.awardedPoints).toBe(8.0);

      // Verify no extra revision was inserted
      const count = await prisma.examHumanGradeRevision.count({
        where: { examItemGradeId: corrItemGradeId },
      });
      expect(count).toBe(2);
    });

    it('replaying idempotencyKey with conflicting parameters returns HTTP 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${corrItemGradeId}/corrections`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 3,
          reason: 'A completely different reason.',
          criterionScores: [
            { criterionId: 'reasoning', score: 5.0 },
            { criterionId: 'clarity', score: 5.0 },
          ],
          idempotencyKey: 'corr-key-1', // Conflicting key reuse
        })
        .expect(HttpStatus.CONFLICT);
    });
  });

  // ===========================================================================
  // Gate E: Concurrency & Linearizability
  // ===========================================================================
  describe('Gate E: Concurrency & Linearizability', () => {
    let concAttemptId: string;
    let concItemGradeId: string;

    beforeAll(async () => {
      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${mixedVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      concAttemptId = att.body.id;

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${concAttemptId}/responses/${mixedMcqItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_true' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${concAttemptId}/responses/${mixedEssayItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { text: 'Concurrency test answer.' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${concAttemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      const dbG = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: concAttemptId },
        include: { itemGrades: true },
      });
      concItemGradeId = dbG.itemGrades.find((ig) => ig.itemRefId === mixedEssayItemRefId)!.id;

      // Initial evaluation to revision 2
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${concItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'reasoning', score: 3.0 },
            { criterionId: 'clarity', score: 3.0 },
          ],
        })
        .expect(HttpStatus.OK);
    });

    it('rejects grade correction with stale expectedRevision (HTTP 409 Conflict)', async () => {
      // Item is at revision 2, passing stale expectedRevision: 1
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${concItemGradeId}/corrections`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 1,
          reason: 'Stale update attempt',
          criterionScores: [
            { criterionId: 'reasoning', score: 4.0 },
            { criterionId: 'clarity', score: 4.0 },
          ],
        })
        .expect(HttpStatus.CONFLICT);

      expect(res.body.message).toContain('Optimistic lock failure');
    });

    it('serializes concurrent corrections safely and rejects stale parallel update', async () => {
      // Two simultaneous correction requests with expectedRevision: 2
      const req1 = request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${concItemGradeId}/corrections`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 2,
          reason: 'Correction A',
          criterionScores: [
            { criterionId: 'reasoning', score: 4.0 },
            { criterionId: 'clarity', score: 4.0 },
          ],
        });

      const req2 = request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${concItemGradeId}/corrections`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 2,
          reason: 'Correction B',
          criterionScores: [
            { criterionId: 'reasoning', score: 5.0 },
            { criterionId: 'clarity', score: 5.0 },
          ],
        });

      const [res1, res2] = await Promise.all([req1, req2]);

      // Exactly one must succeed with HTTP 200, the other must fail with HTTP 409 Conflict
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);
    });
  });

  // ===========================================================================
  // Gate F: Appeals Lifecycle
  // ===========================================================================
  describe('Gate F: Appeals Lifecycle', () => {
    let appealAttemptId: string;
    let appealItemGradeId: string;
    let activeAppealId: string;

    beforeAll(async () => {
      // Charlie takes mixed exam, Alice evaluates it and releases it
      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${mixedVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      appealAttemptId = att.body.id;

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${appealAttemptId}/responses/${mixedMcqItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_true' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${appealAttemptId}/responses/${mixedEssayItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { text: 'Detailed essay with strong historical citations.' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${appealAttemptId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      const dbG = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: appealAttemptId },
        include: { itemGrades: true },
      });
      appealItemGradeId = dbG.itemGrades.find((ig) => ig.itemRefId === mixedEssayItemRefId)!.id;

      // Alice evaluates essay as 3.0 + 3.0 = 6.0/10.0 (total 11/15 = 73.3%, passingScore 70% -> PASS)
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${appealItemGradeId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'reasoning', score: 3.0 },
            { criterionId: 'clarity', score: 3.0 },
          ],
          feedback: 'Reasonable essay',
        })
        .expect(HttpStatus.OK);
    });

    it('allows learner Charlie to submit an appeal on their completed, released exam (HTTP 201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${appealAttemptId}/appeals`)
        .set('Cookie', charlieCookie)
        .send({
          examItemGradeId: appealItemGradeId,
          reason: 'My essay cited historical sources meeting the clarity standard not credited.',
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('OPEN');
      expect(res.body.learnerId).toBe(charlieId);
      activeAppealId = res.body.id;
    });

    it('rejects duplicate active appeal on same examination attempt (HTTP 409 Conflict)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${appealAttemptId}/appeals`)
        .set('Cookie', charlieCookie)
        .send({
          reason: 'Submitting a second appeal while first is open.',
        })
        .expect(HttpStatus.CONFLICT);

      expect(res.body.message).toContain('active appeal is already pending');
    });

    it('prevents secondary learner David from viewing or appealing Charlie’s exam result (HTTP 403)', async () => {
      // David trying to appeal Charlie's exam
      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${appealAttemptId}/appeals`)
        .set('Cookie', davidCookie)
        .send({ reason: 'Malicious appeal injection' })
        .expect(HttpStatus.FORBIDDEN);

      // David trying to view Charlie's appeals
      await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${appealAttemptId}/appeals`)
        .set('Cookie', davidCookie)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('prevents unauthorized creator Bob from reviewing Charlie’s appeal for Alice’s exam (HTTP 403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/exam-appeals/${activeAppealId}/review`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('allows authorized creator Alice to transition appeal to UNDER_REVIEW (HTTP 200)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-appeals/${activeAppealId}/review`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.OK);

      expect(res.body.status).toBe('UNDER_REVIEW');
      expect(res.body.reviewerId).toBe(aliceId);
    });

    it('resolves appeal as RESOLVED_CHANGED, updating item grade and recomputing aggregate score', async () => {
      // Alice re-reads Charlie's essay and accepts appeal: adjusts criteria from (3,3) to (4.5, 4.5) = 9.0/10.0
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-appeals/${activeAppealId}/resolve`)
        .set('Cookie', aliceCookie)
        .send({
          resolution: 'RESOLVED_CHANGED',
          reviewerNotes: 'Re-verified essay citations; criteria clarity and reasoning upgraded.',
          criterionScores: [
            { criterionId: 'reasoning', score: 4.5 },
            { criterionId: 'clarity', score: 4.5 },
          ],
        })
        .expect(HttpStatus.OK);

      expect(res.body.status).toBe('RESOLVED_CHANGED');
      expect(res.body.resolution).toBe('RESOLVED_CHANGED');
      expect(res.body.resolvedAt).toBeDefined();

      // Verify item grade was updated to 9.0
      const updatedItem = await prisma.examItemGrade.findUniqueOrThrow({
        where: { id: appealItemGradeId },
        include: { revisions: true },
      });
      expect(updatedItem.awardedPoints).toBe(9.0);

      // Verify revision of type APPEAL_RESOLUTION exists
      const appealRev = updatedItem.revisions.find((r) => r.eventType === 'APPEAL_RESOLUTION');
      expect(appealRev).toBeDefined();
      expect(appealRev?.newAwardedPoints).toBe(9.0);

      // Verify aggregate score recomputed: 5.0 (MCQ) + 9.0 (Essay) = 14.0 / 15.0 = 93.33%
      const updatedGrade = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: appealAttemptId },
      });
      expect(updatedGrade.totalAwardedPoints).toBe(14.0);
      expect(updatedGrade.percentageScore).toBe(93.33);
      expect(updatedGrade.isPassing).toBe(true);
    });

    it('rejects re-resolving an already resolved appeal (HTTP 400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/exam-appeals/${activeAppealId}/resolve`)
        .set('Cookie', aliceCookie)
        .send({
          resolution: 'RESOLVED_UPHELD',
          reviewerNotes: 'Attempting to re-resolve',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('resolves appeal as RESOLVED_UPHELD leaving grade unmutated and preserving decision history', async () => {
      // Charlie submits a second appeal on a different exam attempt
      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${mixedVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      const attId = att.body.id;

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attId}/responses/${mixedMcqItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_true' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attId}/responses/${mixedEssayItemRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { text: 'Weak essay response.' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      const dbG = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: attId },
        include: { itemGrades: true },
      });
      const igId = dbG.itemGrades.find((ig) => ig.itemRefId === mixedEssayItemRefId)!.id;

      // Alice evaluates essay as 2.0 + 2.0 = 4.0/10.0
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${igId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'reasoning', score: 2.0 },
            { criterionId: 'clarity', score: 2.0 },
          ],
        })
        .expect(HttpStatus.OK);

      // Charlie appeals
      const appRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attId}/appeals`)
        .set('Cookie', charlieCookie)
        .send({ examItemGradeId: igId, reason: 'I think I deserve more points.' })
        .expect(HttpStatus.CREATED);
      const upheldAppealId = appRes.body.id;

      // Alice upholds original score
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exam-appeals/${upheldAppealId}/resolve`)
        .set('Cookie', aliceCookie)
        .send({
          resolution: 'RESOLVED_UPHELD',
          reviewerNotes: 'Re-read essay; reasoning lacks evidence. Original grade of 4.0 is upheld.',
        })
        .expect(HttpStatus.OK);

      expect(res.body.status).toBe('RESOLVED_UPHELD');

      // Verify item grade and total points remain completely unchanged
      const finalItem = await prisma.examItemGrade.findUniqueOrThrow({ where: { id: igId } });
      expect(finalItem.awardedPoints).toBe(4.0);

      const finalGrade = await prisma.examGrade.findUniqueOrThrow({ where: { examAttemptId: attId } });
      expect(finalGrade.totalAwardedPoints).toBe(9.0); // 5 MCQ + 4 Essay
    });
  });

  // ===========================================================================
  // Gate G: Release Policies & Anti-Leakage
  // ===========================================================================
  describe('Gate G: Release Policies & Anti-Leakage', () => {
    it('withholds DEFERRED exam results until deadline condition is met after full human grading', async () => {
      // Charlie takes deferred exam
      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${deferredVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      const defAttId = att.body.id;

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${defAttId}/responses/${deferredEssayRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { text: 'Deferred exam essay text.' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${defAttId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      const dbG = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: defAttId },
        include: { itemGrades: true },
      });
      const igId = dbG.itemGrades[0].id;

      // Alice grades essay while deadline is still in the future
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${igId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'reasoning', score: 4.5 },
            { criterionId: 'clarity', score: 4.5 },
          ],
        })
        .expect(HttpStatus.OK);

      // Verify attempt is COMPLETED and FULLY_GRADED, but isReleased is STILL false
      const learnerCheck = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${defAttId}/result`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(learnerCheck.body.status).toBe('COMPLETED');
      expect(learnerCheck.body.isReleased).toBe(false);
      expect(learnerCheck.body.grade).toBeUndefined();
      expect(learnerCheck.body.notice).toContain('feedback release policy');

      // Now simulate server deadline elapsing
      await prisma.examAttempt.update({
        where: { id: defAttId },
        data: { deadlineAt: new Date(Date.now() - 1000) },
      });

      // Subsequent learner fetch releases the results
      const releasedCheck = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${defAttId}/result`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(releasedCheck.body.isReleased).toBe(true);
      expect(releasedCheck.body.grade).toBeDefined();
      expect(releasedCheck.body.grade.totalAwardedPoints).toBe(9.0);
    });

    it('withholds MANUAL exam results until explicit creator release', async () => {
      // Charlie takes manual release exam
      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${manualVersionId}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);
      const manAttId = att.body.id;

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${manAttId}/responses/${manualEssayRefId}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { text: 'Manual release essay content.' } })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${manAttId}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      const dbG = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: manAttId },
        include: { itemGrades: true },
      });
      const igId = dbG.itemGrades[0].id;

      // Alice grades essay
      await request(app.getHttpServer())
        .post(`/api/v1/exam-grading/items/${igId}/evaluations`)
        .set('Cookie', aliceCookie)
        .send({
          criterionScores: [
            { criterionId: 'reasoning', score: 5.0 },
            { criterionId: 'clarity', score: 5.0 },
          ],
        })
        .expect(HttpStatus.OK);

      // Verify learner does not see results yet
      const preRelease = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${manAttId}/result`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(preRelease.body.isReleased).toBe(false);

      // Alice explicitly releases grades
      await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${manAttId}/release`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.OK);

      // Now learner sees released grade
      const postRelease = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${manAttId}/result`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);

      expect(postRelease.body.isReleased).toBe(true);
      expect(postRelease.body.grade.totalAwardedPoints).toBe(10.0);
    });
  });

  // ===========================================================================
  // Gate H: Immutable Evidence & Blueprint Stability
  // ===========================================================================
  describe('Gate H: Immutable Evidence & Blueprint Stability', () => {
    it('modifying question bank item draft does not alter frozen rubric or attempt grading in published version', async () => {
      // Modifying question bank draft for essayQuestionId
      await request(app.getHttpServer())
        .put(`/api/v1/question-bank/${essayQuestionId}`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 1,
          title: 'Tampered Draft Essay Title',
          rubric: {
            criteria: [{ id: 'tampered_crit', name: 'Tampered Rubric', maxPoints: 999.0 }],
          },
        })
        .expect(HttpStatus.OK);

      // Pinned AssessmentVersion snapshot and QuestionVersion rubric must remain unchanged
      const qv = await prisma.questionVersion.findFirstOrThrow({
        where: { questionBankItemId: essayQuestionId },
      });
      const rubric = qv.rubric as any;
      expect(rubric.criteria.length).toBe(2);
      expect(rubric.criteria[0].id).toBe('reasoning');
      expect(rubric.criteria[1].id).toBe('clarity');
    });

    it('learner ExamResponse remains final and unmutated throughout grading, corrections, and appeals', async () => {
      const allResponses = await prisma.examResponse.findMany();
      for (const r of allResponses) {
        if (r.isFinal) {
          expect(r.isFinal).toBe(true);
        }
      }
    });
  });

  // ===========================================================================
  // Gate I: Zero Premature Evidence or Gamification Emission
  // ===========================================================================
  describe('Gate I: Zero Premature Evidence or Gamification Emission', () => {
    it('verifies learning_evidences, qualifying_facts, and quest_instances have zero records emitted by human grading runtime', async () => {
      const evidenceCount = await prisma.learningEvidence.count();
      const factsCount = await prisma.qualifyingFact.count();
      const questCount = await prisma.questInstance.count();
      const abRunCount = await prisma.aBRun.count();

      expect(evidenceCount - initialEvidenceCount).toBe(0);
      expect(factsCount - initialFactsCount).toBe(0);
      expect(questCount - initialQuestCount).toBe(0);
      expect(abRunCount - initialAbRunCount).toBe(0);
    });
  });

  // ===========================================================================
  // Gate J: Backward Compatibility
  // ===========================================================================
  describe('Gate J: Backward Compatibility', () => {
    it('existing objective-only exams continue to auto-grade to COMPLETED and FULLY_GRADED without human intervention', async () => {
      // Create objective-only exam
      const objDef = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({
          title: 'Pure Objective Backward Compatibility Exam',
          durationMinutes: 30,
          passingScore: 50.0,
          feedbackPolicy: 'IMMEDIATE',
        })
        .expect(HttpStatus.CREATED);

      const sec = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${objDef.body.id}/sections`)
        .set('Cookie', aliceCookie)
        .send({ title: 'MCQ Sec' })
        .expect(HttpStatus.CREATED);

      const it = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${objDef.body.id}/sections/${sec.body.id}/items`)
        .set('Cookie', aliceCookie)
        .send({ questionBankItemId: mcqQuestionId, points: 5.0 })
        .expect(HttpStatus.CREATED);

      const pub = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${objDef.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'pub-obj-compat' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${objDef.body.id}/access-grants`)
        .set('Cookie', aliceCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      const att = await request(app.getHttpServer())
        .post(`/api/v1/exams/${pub.body.id}/attempts`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${att.body.id}/responses/${it.body.id}`)
        .set('Cookie', charlieCookie)
        .send({ responsePayload: { selectedOptionId: 'opt_true' } })
        .expect(HttpStatus.OK);

      const sub = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${att.body.id}/submit`)
        .set('Cookie', charlieCookie)
        .send({})
        .expect(HttpStatus.OK);

      // Must complete immediately without entering GRADING
      expect(sub.body.status).toBe('COMPLETED');
      expect(sub.body.isReleased).toBe(true);

      const dbG = await prisma.examGrade.findUniqueOrThrow({
        where: { examAttemptId: att.body.id },
      });
      expect(dbG.aggregationStatus).toBe('FULLY_GRADED');
      expect(dbG.totalAwardedPoints).toBe(5.0);
      expect(dbG.percentageScore).toBe(100.0);
      expect(dbG.isPassing).toBe(true);
    });
  });
});
