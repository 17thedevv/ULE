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

describe('Phase 5.5: Assessment & Examination Engine Foundation Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const trustedOrigin = 'http://localhost:5173';

  // Test Accounts
  const userAlice = {
    email: `alice_exam_${Date.now()}@ule.internal`,
    password: 'EducatorPassword123!',
    name: 'Educator Alice (Primary Creator)',
  };

  const userBob = {
    email: `bob_exam_${Date.now()}@ule.internal`,
    password: 'EducatorPassword123!',
    name: 'Educator Bob (Isolated Secondary Creator)',
  };

  const userCharlie = {
    email: `charlie_exam_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner Charlie (Audited Non-Creator)',
  };

  let aliceCookie: string;
  let bobCookie: string;
  let charlieCookie: string;

  let aliceId: string;
  let bobId: string;
  let charlieId: string;

  // Question IDs
  let aliceMcqQuestionId: string;
  let aliceNumericQuestionId: string;
  let aliceEssayQuestionId: string;
  let aliceClozeQuestionId: string;

  // Version IDs
  let aliceMcqVersion1Id: string;
  let aliceNumericVersion1Id: string;

  // Assessment IDs
  let aliceAssessmentId: string;
  let section1Id: string;
  let section2Id: string;
  let section1Item1Id: string;

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
    const aliceRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userAlice)
      .expect(HttpStatus.OK);
    aliceCookie = extractCookies(aliceRegRes);
    const aliceMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', aliceCookie)
      .expect(HttpStatus.OK);
    aliceId = aliceMe.body.user.id;

    // 2. Register Educator Bob
    const bobRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userBob)
      .expect(HttpStatus.OK);
    bobCookie = extractCookies(bobRegRes);
    const bobMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', bobCookie)
      .expect(HttpStatus.OK);
    bobId = bobMe.body.user.id;

    // 3. Register Learner Charlie
    const charlieRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userCharlie)
      .expect(HttpStatus.OK);
    charlieCookie = extractCookies(charlieRegRes);
    const charlieMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', charlieCookie)
      .expect(HttpStatus.OK);
    charlieId = charlieMe.body.user.id;
    expect(charlieId).toBeDefined();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Gate 1: Authorized Question Creation & Revision in Question Bank', () => {
    it('allows Alice to create diverse allowlisted QuestionBankItems (MCQ, Numeric, Cloze, Essay)', async () => {
      // 1. Alice creates Single Choice MCQ
      const mcqRes = await request(app.getHttpServer())
        .post('/api/v1/question-bank')
        .set('Cookie', aliceCookie)
        .send({
          type: 'SINGLE_CHOICE',
          title: 'Algebraic Quadratic Solution 1',
          prompt: 'Solve for x: x^2 - 9 = 0 (where x > 0).',
          content: {
            options: [
              { id: 'opt_3', text: 'x = 3' },
              { id: 'opt_9', text: 'x = 9' },
            ],
          },
          answerKey: {
            correctOptionId: 'opt_3',
            explanation: 'x^2 = 9 implies x = +3 or -3; since x > 0, x = 3.',
          },
          defaultPoints: 2.0,
          skillCode: 'SKILL_MATH_QUADRATIC',
          tags: ['algebra', 'quadratics', 'midterm-pool'],
        })
        .expect(HttpStatus.CREATED);

      aliceMcqQuestionId = mcqRes.body.id;
      expect(mcqRes.body.ownerId).toBe(aliceId);
      expect(mcqRes.body.revision).toBe(1);
      expect(mcqRes.body.publishedVersionCount).toBe(0);

      // 2. Alice creates Numeric Question with absolute tolerance
      const numRes = await request(app.getHttpServer())
        .post('/api/v1/question-bank')
        .set('Cookie', aliceCookie)
        .send({
          type: 'NUMERIC',
          title: 'Gravitational Acceleration Value',
          prompt: 'State standard Earth surface gravitational acceleration in m/s^2 to 2 decimal places.',
          content: { unit: 'm/s^2' },
          answerKey: {
            correctValue: 9.81,
            tolerance: 0.05,
            toleranceType: 'ABSOLUTE',
          },
          defaultPoints: 3.0,
          tags: ['physics', 'constants'],
        })
        .expect(HttpStatus.CREATED);

      aliceNumericQuestionId = numRes.body.id;
      expect(numRes.body.defaultPoints).toBe(3.0);

      // 3. Alice creates Cloze Question
      const clozeRes = await request(app.getHttpServer())
        .post('/api/v1/question-bank')
        .set('Cookie', aliceCookie)
        .send({
          type: 'CLOZE',
          title: 'European Geography Capital Fill-in',
          prompt: 'Complete the geographical statement:',
          content: {
            templateText: 'The capital of Germany is {{capital}} and its main currency is the {{currency}}.',
            targetBlanks: [{ blankKey: 'capital' }, { blankKey: 'currency' }],
          },
          answerKey: {
            blanks: {
              capital: ['Berlin'],
              currency: ['Euro', 'EUR'],
            },
          },
          defaultPoints: 4.0,
        })
        .expect(HttpStatus.CREATED);

      aliceClozeQuestionId = clozeRes.body.id;
      expect(aliceClozeQuestionId).toBeDefined();

      // 4. Alice creates Rubric-Graded Essay
      const essayRes = await request(app.getHttpServer())
        .post('/api/v1/question-bank')
        .set('Cookie', aliceCookie)
        .send({
          type: 'ESSAY',
          title: 'Philosophical Epistemology Essay',
          prompt: 'Compare rationalism and empiricism with reference to Descartes and Locke.',
          content: { minWords: 150, maxWords: 800 },
          rubric: {
            criteria: [
              {
                id: 'crit_depth',
                name: 'Epistemological Depth',
                description: 'Detailed analysis of foundational arguments.',
                maxPoints: 10,
              },
            ],
          },
          defaultPoints: 10.0,
        })
        .expect(HttpStatus.CREATED);

      aliceEssayQuestionId = essayRes.body.id;
      expect(aliceEssayQuestionId).toBeDefined();
    });

    it('updates working question draft with optimistic locking (expectedRevision check)', async () => {
      // 1. Stale revision rejection (expectedRevision: 99 != 1) -> HTTP 409
      await request(app.getHttpServer())
        .put(`/api/v1/question-bank/${aliceMcqQuestionId}`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 99,
          title: 'Updated Title Stale',
        })
        .expect(HttpStatus.CONFLICT);

      // 2. Successful update with expectedRevision: 1 -> increments revision to 2
      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/question-bank/${aliceMcqQuestionId}`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 1,
          prompt: 'Solve for x: x^2 - 16 = 0 (where x > 0).',
          content: {
            options: [
              { id: 'opt_4', text: 'x = 4' },
              { id: 'opt_16', text: 'x = 16' },
            ],
          },
          answerKey: {
            correctOptionId: 'opt_4',
            explanation: 'x = 4 because 4^2 = 16.',
          },
        })
        .expect(HttpStatus.OK);

      expect(updateRes.body.revision).toBe(2);
      expect(updateRes.body.prompt).toContain('x^2 - 16 = 0');
    });

    it('P2 REQUIREMENT: atomically rejects concurrent conflicting updates to QuestionBankItem (compare-and-swap)', async () => {
      // Alice creates a question with revision: 1
      const qRes = await request(app.getHttpServer())
        .post('/api/v1/question-bank')
        .set('Cookie', aliceCookie)
        .send({
          type: 'TRUE_FALSE',
          title: 'Concurrency Probe Question',
          prompt: 'Is atomic CAS race-free?',
          content: { statement: 'Atomic CAS prevents lost updates.' },
          answerKey: { correctValue: true },
        })
        .expect(HttpStatus.CREATED);

      const qId = qRes.body.id;
      expect(qRes.body.revision).toBe(1);

      // Launch 2 simultaneous updates both expecting revision: 1
      const req1 = request(app.getHttpServer())
        .put(`/api/v1/question-bank/${qId}`)
        .set('Cookie', aliceCookie)
        .send({ expectedRevision: 1, title: 'Winner A' });

      const req2 = request(app.getHttpServer())
        .put(`/api/v1/question-bank/${qId}`)
        .set('Cookie', aliceCookie)
        .send({ expectedRevision: 1, title: 'Winner B' });

      const [res1, res2] = await Promise.all([req1, req2]);
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);

      // Verify that in the database, the revision is exactly 2
      const finalItem = await request(app.getHttpServer())
        .get(`/api/v1/question-bank/${qId}`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.OK);
      expect(finalItem.body.revision).toBe(2);
    });
  });

  describe('Gate 2: Unauthorized Cross-Creator Access Rejection', () => {
    it('prevents Bob from accessing or mutating Alice’s question bank items (HTTP 403 / 404)', async () => {
      // 1. Bob cannot read Alice's item
      await request(app.getHttpServer())
        .get(`/api/v1/question-bank/${aliceMcqQuestionId}`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.FORBIDDEN);

      // 2. Bob cannot update Alice's item
      await request(app.getHttpServer())
        .put(`/api/v1/question-bank/${aliceMcqQuestionId}`)
        .set('Cookie', bobCookie)
        .send({
          expectedRevision: 2,
          title: 'Malicious Hijack',
        })
        .expect(HttpStatus.FORBIDDEN);

      // 3. Bob cannot publish a version of Alice's item
      await request(app.getHttpServer())
        .post(`/api/v1/question-bank/${aliceMcqQuestionId}/versions`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.FORBIDDEN);

      // 4. Bob cannot delete Alice's item
      await request(app.getHttpServer())
        .delete(`/api/v1/question-bank/${aliceMcqQuestionId}`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('Gate 3: Question Configuration & Malformed Answer Key Rejection', () => {
    it('rejects unallowlisted question types with HTTP 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/question-bank')
        .set('Cookie', aliceCookie)
        .send({
          type: 'AI_MAGIC_GRADER',
          title: 'Invalid',
          prompt: 'Test',
          content: {},
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('rejects MCQ answerKey with non-matching correctOptionId (HTTP 400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/question-bank')
        .set('Cookie', aliceCookie)
        .send({
          type: 'SINGLE_CHOICE',
          title: 'Mismatch Test',
          prompt: 'Test',
          content: {
            options: [
              { id: 'a', text: 'Option A' },
              { id: 'b', text: 'Option B' },
            ],
          },
          answerKey: { correctOptionId: 'c' }, // Not in options!
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('STRICT INVARIANT: rejects ESSAY questions if automated answerKey is supplied (HTTP 400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/question-bank')
        .set('Cookie', aliceCookie)
        .send({
          type: 'ESSAY',
          title: 'Naive String Auto-Graded Essay Attempt',
          prompt: 'Write an essay.',
          content: { minWords: 100 },
          answerKey: { exactEssay: 'This is naive string matching!' },
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('P2 REQUIREMENT: rejects QuestionBankItem with malformed nested payload (e.g. options: [null]) with HTTP 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/question-bank')
        .set('Cookie', aliceCookie)
        .send({
          type: 'SINGLE_CHOICE',
          title: 'Malformed Options Test',
          prompt: 'Choose one:',
          content: {
            options: [null, { id: 'opt_1', text: 'Option 1' }],
          },
          answerKey: { correctOptionId: 'opt_1' },
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('Gate 4: QuestionVersion Publishing & Immutable Version Snapshots', () => {
    it('publishes immutable QuestionVersions with sequential natural version numbers', async () => {
      // 1. Alice publishes Version 1 of MCQ
      const v1Res = await request(app.getHttpServer())
        .post(`/api/v1/question-bank/${aliceMcqQuestionId}/versions`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.CREATED);

      aliceMcqVersion1Id = v1Res.body.id;
      expect(v1Res.body.versionNumber).toBe(1);
      expect(v1Res.body.prompt).toContain('x^2 - 16 = 0');
      expect(v1Res.body.content.options[0].text).toBe('x = 4');

      // 2. Alice publishes Version 1 of Numeric Question
      const numV1Res = await request(app.getHttpServer())
        .post(`/api/v1/question-bank/${aliceNumericQuestionId}/versions`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.CREATED);

      aliceNumericVersion1Id = numV1Res.body.id;
      expect(numV1Res.body.versionNumber).toBe(1);

      // 3. Alice updates the MCQ working draft
      await request(app.getHttpServer())
        .put(`/api/v1/question-bank/${aliceMcqQuestionId}`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 2,
          prompt: 'Solve for x: x^2 - 25 = 0 (where x > 0).',
          content: {
            options: [
              { id: 'opt_5', text: 'x = 5' },
              { id: 'opt_25', text: 'x = 25' },
            ],
          },
          answerKey: { correctOptionId: 'opt_5' },
        })
        .expect(HttpStatus.OK);

      // 4. Alice publishes Version 2 of MCQ
      const v2Res = await request(app.getHttpServer())
        .post(`/api/v1/question-bank/${aliceMcqQuestionId}/versions`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.CREATED);

      expect(v2Res.body.versionNumber).toBe(2);
      expect(v2Res.body.prompt).toContain('x^2 - 25 = 0');

      // 5. Invariant: Version 1 remains frozen and unchanged!
      const fetchedV1 = await request(app.getHttpServer())
        .get(`/api/v1/question-bank/${aliceMcqQuestionId}/versions/1`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.OK);

      expect(fetchedV1.body.prompt).toContain('x^2 - 16 = 0');
      expect(fetchedV1.body.content.options[0].text).toBe('x = 4');
    });

    it('P2 REQUIREMENT: rejects publishing QuestionBankItem if answerKey is missing for auto-evaluable type', async () => {
      const draftMcq = await request(app.getHttpServer())
        .post('/api/v1/question-bank')
        .set('Cookie', aliceCookie)
        .send({
          type: 'SINGLE_CHOICE',
          title: 'Draft MCQ Without Answer Key',
          prompt: 'Unfinished question',
          content: { options: [{ id: '1', text: 'A' }, { id: '2', text: 'B' }] },
          // No answerKey!
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/question-bank/${draftMcq.body.id}/versions`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('Gate 5: AssessmentDefinition Draft Creation & Optimistic Concurrency', () => {
    it('creates draft AssessmentDefinition and enforces optimistic revision check', async () => {
      // 1. Create Assessment
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({
          title: 'Mathematics Comprehensive Midterm Examination',
          description: 'Covers Algebra, quadratics, physics numerical constants, and Cloze terminology.',
          instructions: 'Calculators permitted for Section 2 only. Total time: 60 minutes.',
          durationMinutes: 60,
          passingScore: 70.0,
          maxAttempts: 2,
          feedbackPolicy: 'DEFERRED',
        })
        .expect(HttpStatus.CREATED);

      aliceAssessmentId = createRes.body.id;
      expect(createRes.body.ownerId).toBe(aliceId);
      expect(createRes.body.revision).toBe(1);
      expect(createRes.body.status).toBe('DRAFT');

      // 2. Stale revision rejection -> HTTP 409
      await request(app.getHttpServer())
        .put(`/api/v1/assessments/${aliceAssessmentId}`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 5,
          title: 'Stale Edit',
        })
        .expect(HttpStatus.CONFLICT);

      // 3. Successful update -> revision 2
      const updated = await request(app.getHttpServer())
        .put(`/api/v1/assessments/${aliceAssessmentId}`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 1,
          passingScore: 75.0,
        })
        .expect(HttpStatus.OK);

      expect(updated.body.revision).toBe(2);
      expect(updated.body.passingScore).toBe(75.0);
    });

    it('P2 REQUIREMENT: atomically rejects concurrent conflicting updates to AssessmentDefinition (compare-and-swap)', async () => {
      const probeAss = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({ title: 'Assessment Concurrency Probe' })
        .expect(HttpStatus.CREATED);

      const assId = probeAss.body.id;
      expect(probeAss.body.revision).toBe(1);

      const req1 = request(app.getHttpServer())
        .put(`/api/v1/assessments/${assId}`)
        .set('Cookie', aliceCookie)
        .send({ expectedRevision: 1, title: 'Assessment Winner A' });

      const req2 = request(app.getHttpServer())
        .put(`/api/v1/assessments/${assId}`)
        .set('Cookie', aliceCookie)
        .send({ expectedRevision: 1, title: 'Assessment Winner B' });

      const [res1, res2] = await Promise.all([req1, req2]);
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);

      const finalAss = await request(app.getHttpServer())
        .get(`/api/v1/assessments/${assId}`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.OK);
      expect(finalAss.body.revision).toBe(2);
    });
  });

  describe('Gate 6: Assessment Sections & Question Item Composition', () => {
    it('composes multi-section assessment and adds reusable question items with weights', async () => {
      // 1. Add Section 1: Core Algebra
      const sec1Res = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${aliceAssessmentId}/sections`)
        .set('Cookie', aliceCookie)
        .send({
          title: 'Section 1: Core Algebra',
          orderIndex: 0,
        })
        .expect(HttpStatus.CREATED);
      section1Id = sec1Res.body.id;

      // 2. Add Section 2: Applied Calculations
      const sec2Res = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${aliceAssessmentId}/sections`)
        .set('Cookie', aliceCookie)
        .send({
          title: 'Section 2: Applied Calculations',
          orderIndex: 1,
        })
        .expect(HttpStatus.CREATED);
      section2Id = sec2Res.body.id;

      // 3. Add Alice's MCQ to Section 1 (pinning QuestionVersion 1 explicitly, weight: 5.0)
      const item1Res = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${aliceAssessmentId}/sections/${section1Id}/items`)
        .set('Cookie', aliceCookie)
        .send({
          questionBankItemId: aliceMcqQuestionId,
          pinnedQuestionVersionId: aliceMcqVersion1Id,
          points: 5.0,
          orderIndex: 0,
          isRequired: true,
        })
        .expect(HttpStatus.CREATED);
      section1Item1Id = item1Res.body.id;
      expect(section1Item1Id).toBeDefined();
      expect(item1Res.body.points).toBe(5.0);

      // 4. Add Alice's Numeric Question to Section 2 (floating version, weight: 10.0)
      const item2Res = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${aliceAssessmentId}/sections/${section2Id}/items`)
        .set('Cookie', aliceCookie)
        .send({
          questionBankItemId: aliceNumericQuestionId,
          points: 10.0,
          orderIndex: 0,
        })
        .expect(HttpStatus.CREATED);
      expect(item2Res.body.points).toBe(10.0);

      // 5. INVARIANT: Attempting to add a question owned by Bob fails with HTTP 403 / 404
      const bobQuestion = await prisma.questionBankItem.create({
        data: {
          ownerId: bobId,
          type: 'SINGLE_CHOICE',
          title: "Bob's Private Question",
          prompt: 'Secret prompt',
          content: { options: [{ id: '1', text: 'A' }, { id: '2', text: 'B' }] },
          revision: 1,
        },
      });

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${aliceAssessmentId}/sections/${section1Id}/items`)
        .set('Cookie', aliceCookie)
        .send({
          questionBankItemId: bobQuestion.id,
          points: 5.0,
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('P1 REQUIREMENT: strictly blocks cross-creator mutation and mismatched parent/section/item IDs', async () => {
      // 1. Bob creates his own assessment, section, and item
      const bobAss = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', bobCookie)
        .send({ title: "Bob's Independent Assessment" })
        .expect(HttpStatus.CREATED);

      const bobSec = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${bobAss.body.id}/sections`)
        .set('Cookie', bobCookie)
        .send({ title: "Bob's Section 1" })
        .expect(HttpStatus.CREATED);

      const bobQ = await prisma.questionBankItem.create({
        data: {
          ownerId: bobId,
          type: 'TRUE_FALSE',
          title: "Bob's TF Question",
          prompt: 'Is this Bob question?',
          content: { statement: 'Yes' },
          answerKey: { correctValue: true },
          revision: 1,
        },
      });

      const bobItem = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${bobAss.body.id}/sections/${bobSec.body.id}/items`)
        .set('Cookie', bobCookie)
        .send({
          questionBankItemId: bobQ.id,
          points: 3.0,
        })
        .expect(HttpStatus.CREATED);

      // Attack 1: Alice attempts to update Bob's item using Alice's assessment & section
      await request(app.getHttpServer())
        .put(`/api/v1/assessments/${aliceAssessmentId}/sections/${section1Id}/items/${bobItem.body.id}`)
        .set('Cookie', aliceCookie)
        .send({ points: 99.0 })
        .expect(HttpStatus.NOT_FOUND);

      // Attack 2: Alice attempts to delete Bob's item using Alice's assessment & section
      await request(app.getHttpServer())
        .delete(`/api/v1/assessments/${aliceAssessmentId}/sections/${section1Id}/items/${bobItem.body.id}`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.NOT_FOUND);

      // Attack 3: Alice attempts to update her own item passing Bob's section ID
      await request(app.getHttpServer())
        .put(`/api/v1/assessments/${aliceAssessmentId}/sections/${bobSec.body.id}/items/${section1Item1Id}`)
        .set('Cookie', aliceCookie)
        .send({ points: 99.0 })
        .expect(HttpStatus.NOT_FOUND);

      // Attack 4: Bob attempts to update Alice's item in Alice's assessment
      await request(app.getHttpServer())
        .put(`/api/v1/assessments/${aliceAssessmentId}/sections/${section1Id}/items/${section1Item1Id}`)
        .set('Cookie', bobCookie)
        .send({ points: 0.1 })
        .expect(HttpStatus.FORBIDDEN);

      // Attack 5: Bob attempts to delete Alice's item in Alice's assessment
      await request(app.getHttpServer())
        .delete(`/api/v1/assessments/${aliceAssessmentId}/sections/${section1Id}/items/${section1Item1Id}`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.FORBIDDEN);

      // Attack 6: Alice attempts to update Bob's section passing Alice's assessment ID
      await request(app.getHttpServer())
        .put(`/api/v1/assessments/${aliceAssessmentId}/sections/${bobSec.body.id}`)
        .set('Cookie', aliceCookie)
        .send({ title: 'Hijacked Title' })
        .expect(HttpStatus.NOT_FOUND);

      // Attack 7: Alice attempts to delete Bob's section passing Alice's assessment ID
      await request(app.getHttpServer())
        .delete(`/api/v1/assessments/${aliceAssessmentId}/sections/${bobSec.body.id}`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('Gate 7: Structural Blueprint Validation Failures', () => {
    it('rejects publishing empty assessment (0 sections or 0 items) with HTTP 400', async () => {
      // Create empty assessment definition
      const emptyAss = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({ title: 'Empty Assessment' })
        .expect(HttpStatus.CREATED);

      // Publish attempt -> HTTP 400
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${emptyAss.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('rejects publishing assessment referencing question with no published versions', async () => {
      // Alice creates draft Question that is NEVER published to QuestionVersion
      const unpubQ = await request(app.getHttpServer())
        .post('/api/v1/question-bank')
        .set('Cookie', aliceCookie)
        .send({
          type: 'SINGLE_CHOICE',
          title: 'Unpublished Draft Question',
          prompt: 'Draft prompt',
          content: { options: [{ id: '1', text: 'A' }, { id: '2', text: 'B' }] },
          answerKey: { correctOptionId: '1' },
        })
        .expect(HttpStatus.CREATED);

      // Create new assessment with 1 section referencing unpubQ
      const assDef = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({ title: 'Assessment With Unpublished Question' })
        .expect(HttpStatus.CREATED);

      const sec = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${assDef.body.id}/sections`)
        .set('Cookie', aliceCookie)
        .send({ title: 'Sec 1' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${assDef.body.id}/sections/${sec.body.id}/items`)
        .set('Cookie', aliceCookie)
        .send({ questionBankItemId: unpubQ.body.id, points: 5.0 })
        .expect(HttpStatus.CREATED);

      // Publishing MUST FAIL because unpubQ has no published version!
      const errRes = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${assDef.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.BAD_REQUEST);

      expect(errRes.body.message).toContain('has no published QuestionVersion');
    });
  });

  describe('Gate 8: AssessmentVersion Publishing & Blueprint Snapshot Integrity', () => {
    let publishedVersionId: string;

    it('validates entire blueprint, aggregates points, and creates immutable AssessmentVersion snapshot with idempotency', async () => {
      const pubRes = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${aliceAssessmentId}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'midterm-idemp-key-alice-01' })
        .expect(HttpStatus.CREATED);

      publishedVersionId = pubRes.body.id;
      expect(publishedVersionId).toBeDefined();
      expect(pubRes.body.versionNumber).toBe(1);
      expect(pubRes.body.idempotencyKey).toBe('midterm-idemp-key-alice-01');
      expect(pubRes.body.totalPoints).toBe(15.0); // 5.0 (MCQ) + 10.0 (Numeric)
      expect(pubRes.body.itemCount).toBe(2);
      expect(pubRes.body.snapshot).toBeDefined();

      const snapshot = pubRes.body.snapshot;
      expect(snapshot.sections.length).toBe(2);
      expect(snapshot.sections[0].items[0].questionVersionId).toBe(aliceMcqVersion1Id);
      expect(snapshot.sections[1].items[0].questionVersionId).toBe(aliceNumericVersion1Id);
    });

    it('P2 REQUIREMENT: repeating publish request with same idempotencyKey returns existing version without duplicating snapshot', async () => {
      const retryRes = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${aliceAssessmentId}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'midterm-idemp-key-alice-01' })
        .expect(HttpStatus.CREATED);

      expect(retryRes.body.id).toBe(publishedVersionId);
      expect(retryRes.body.versionNumber).toBe(1);
      expect(retryRes.body.idempotencyKey).toBe('midterm-idemp-key-alice-01');

      // Verify DB count remains exactly 1 version
      const vCount = await prisma.assessmentVersion.count({
        where: { assessmentDefinitionId: aliceAssessmentId },
      });
      expect(vCount).toBe(1);
    });

    it('P2 REQUIREMENT: reusing idempotencyKey after assessment draft has mutated triggers HTTP 409 Conflict', async () => {
      // 1. Fetch current revision of Alice's assessment
      const currentAss = await request(app.getHttpServer())
        .get(`/api/v1/assessments/${aliceAssessmentId}`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.OK);

      const publishedRevision = currentAss.body.revision;

      // 2. Mutate Alice's assessment draft (bump revision by updating description)
      const updateRes = await request(app.getHttpServer())
        .put(`/api/v1/assessments/${aliceAssessmentId}`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: publishedRevision,
          description: 'Updated draft description after v1 publication',
        })
        .expect(HttpStatus.OK);

      expect(updateRes.body.revision).toBe(publishedRevision + 1);

      // 3. Reusing the old idempotency key on mutated draft MUST fail with HTTP 409 Conflict
      const conflictRes = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${aliceAssessmentId}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'midterm-idemp-key-alice-01' })
        .expect(HttpStatus.CONFLICT);

      expect(conflictRes.body.message).toContain('was already used for a different blueprint version');
    });

    it('P2 REQUIREMENT: concurrent child mutation and publish operation serialize cleanly via aggregate root locking without deadlocks', async () => {
      // 1. Create a fresh test assessment with 1 section and 1 item
      const probeAss = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({ title: 'Lock Ordering Concurrency Probe' })
        .expect(HttpStatus.CREATED);

      const probeSec = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${probeAss.body.id}/sections`)
        .set('Cookie', aliceCookie)
        .send({ title: 'Sec 1' })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${probeAss.body.id}/sections/${probeSec.body.id}/items`)
        .set('Cookie', aliceCookie)
        .send({ questionBankItemId: aliceNumericQuestionId, points: 5.0 })
        .expect(HttpStatus.CREATED);

      // Fetch revision before the race
      const preDef = await prisma.assessmentDefinition.findUniqueOrThrow({
        where: { id: probeAss.body.id },
        select: { revision: true },
      });

      // 2. Dispatch concurrent publish and addItem requests on the same assessment definition
      const pubReq = request(app.getHttpServer())
        .post(`/api/v1/assessments/${probeAss.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'concurrent-lock-pub-1' });

      const addReq = request(app.getHttpServer())
        .post(`/api/v1/assessments/${probeAss.body.id}/sections/${probeSec.body.id}/items`)
        .set('Cookie', aliceCookie)
        .send({ questionBankItemId: aliceMcqQuestionId, points: 5.0 });

      const [pubRes, addRes] = await Promise.all([pubReq, addReq]);

      // 3. Both succeeded cleanly (201 Created) without deadlock or 500 error
      expect(pubRes.status).toBe(HttpStatus.CREATED);
      expect(addRes.status).toBe(HttpStatus.CREATED);

      // 4. Verify assessment versions and items in DB
      const published = await prisma.assessmentVersion.findFirst({
        where: { assessmentDefinitionId: probeAss.body.id },
      });
      expect(published).toBeDefined();

      const finalItemCount = await prisma.assessmentItemRef.count({
        where: { sectionId: probeSec.body.id },
      });
      expect(finalItemCount).toBe(2);

      // 5. P2 REQUIREMENT: Snapshot integrity and linearizability assertion
      const snapshot = published!.snapshot as any;
      if (published!.itemCount === 1) {
        // Publish won the race and locked root first
        expect(published!.totalPoints).toBe(5.0);
        expect(published!.draftRevision).toBe(preDef.revision);
        expect(snapshot.sections[0].items).toHaveLength(1);
        expect(snapshot.sections[0].items[0].questionBankItemId).toBe(aliceNumericQuestionId);
      } else {
        // AddItem won the race and locked root first
        expect(published!.itemCount).toBe(2);
        expect(published!.totalPoints).toBe(10.0);
        expect(published!.draftRevision).toBe(preDef.revision + 1);
        expect(snapshot.sections[0].items).toHaveLength(2);
      }
    });

    it('P2 REQUIREMENT: rejecting idempotency key replay with HTTP 409 when underlying unpinned QuestionVersion drifts in Question Bank', async () => {
      // 0. Alice publishes initial QuestionVersion 1 of Cloze question
      await request(app.getHttpServer())
        .post(`/api/v1/question-bank/${aliceClozeQuestionId}/versions`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.CREATED);

      // 1. Alice creates an assessment with an unpinned Question item
      const driftAss = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({ title: 'Question Drift Assessment' })
        .expect(HttpStatus.CREATED);

      const driftSec = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${driftAss.body.id}/sections`)
        .set('Cookie', aliceCookie)
        .send({ title: 'Section A' })
        .expect(HttpStatus.CREATED);

      // Add unpinned Question item (pinnedQuestionVersionId is omitted!)
      await request(app.getHttpServer())
        .post(`/api/v1/assessments/${driftAss.body.id}/sections/${driftSec.body.id}/items`)
        .set('Cookie', aliceCookie)
        .send({
          questionBankItemId: aliceClozeQuestionId,
          points: 5.0,
        })
        .expect(HttpStatus.CREATED);

      // 2. Publish initial version with idempotencyKey
      const pub1 = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${driftAss.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'unpinned-drift-key-01' })
        .expect(HttpStatus.CREATED);

      expect(pub1.body.versionNumber).toBe(1);

      // 3. Replay with exact same state -> idempotent replay succeeds (cached version)
      const replayOk = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${driftAss.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'unpinned-drift-key-01' })
        .expect(HttpStatus.CREATED);

      expect(replayOk.body.id).toBe(pub1.body.id);

      // 4. In Question Bank, publish a NEW version of aliceClozeQuestionId (QuestionVersion 2)
      // Note: This does NOT increment driftAss revision!
      await request(app.getHttpServer())
        .post(`/api/v1/question-bank/${aliceClozeQuestionId}/versions`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.CREATED);

      // 5. Try to publish again with the SAME idempotency key
      // The resolved QuestionVersion would now resolve to v2 instead of v1!
      // Must reject with HTTP 409 Conflict
      const conflictRes = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${driftAss.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .send({ idempotencyKey: 'unpinned-drift-key-01' })
        .expect(HttpStatus.CONFLICT);

      expect(conflictRes.body.message).toContain('different resolved QuestionVersions');
    });

    it('subsequent edits to questions in Question Bank do NOT alter published AssessmentVersion snapshot', async () => {
      // 1. Alice edits the MCQ question in Question Bank again
      await request(app.getHttpServer())
        .put(`/api/v1/question-bank/${aliceMcqQuestionId}`)
        .set('Cookie', aliceCookie)
        .send({
          expectedRevision: 3,
          prompt: 'MUTATED QUESTION: Solve x^2 - 100 = 0.',
          content: {
            options: [
              { id: 'opt_10', text: 'x = 10' },
              { id: 'opt_100', text: 'x = 100' },
            ],
          },
          answerKey: { correctOptionId: 'opt_10' },
        })
        .expect(HttpStatus.OK);

      // 2. Fetch published AssessmentVersion v1
      const fetchedVersion = await request(app.getHttpServer())
        .get(`/api/v1/assessments/${aliceAssessmentId}/versions/1`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.OK);

      // INVARIANT: The published exam snapshot remains 100% frozen with original Version 1!
      const itemSnapshot = fetchedVersion.body.snapshot.sections[0].items[0];
      expect(itemSnapshot.prompt).toContain('x^2 - 16 = 0');
      expect(itemSnapshot.prompt).not.toContain('MUTATED QUESTION');
    });

    it('STRICT INVARIANT: protects pinned QuestionBankItems from deletion while referenced in published exam', async () => {
      // Alice attempts to delete MCQ item which is pinned in published AssessmentVersion v1
      const delRes = await request(app.getHttpServer())
        .delete(`/api/v1/question-bank/${aliceMcqQuestionId}`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.BAD_REQUEST);

      expect(delRes.body.message).toContain('pinned in published AssessmentVersions');
    });
  });

  describe('Gate 9: Question Reusability Across Distinct Assessments', () => {
    it('allows Alice to reuse the same QuestionBankItem in multiple assessments with independent point weights', async () => {
      // Alice creates a second assessment: "Quick Pop Quiz"
      const quizRes = await request(app.getHttpServer())
        .post('/api/v1/assessments')
        .set('Cookie', aliceCookie)
        .send({ title: 'Quick Pop Quiz' })
        .expect(HttpStatus.CREATED);

      const quizSec = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${quizRes.body.id}/sections`)
        .set('Cookie', aliceCookie)
        .send({ title: 'Quiz Section' })
        .expect(HttpStatus.CREATED);

      // Add the SAME MCQ question item, but with point weight: 2.0 (instead of 5.0)
      const quizItem = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${quizRes.body.id}/sections/${quizSec.body.id}/items`)
        .set('Cookie', aliceCookie)
        .send({
          questionBankItemId: aliceMcqQuestionId,
          points: 2.0, // Reused question, distinct exam weight!
        })
        .expect(HttpStatus.CREATED);

      expect(quizItem.body.points).toBe(2.0);

      // Publish the Quiz
      const pubQuiz = await request(app.getHttpServer())
        .post(`/api/v1/assessments/${quizRes.body.id}/publish`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.CREATED);

      expect(pubQuiz.body.totalPoints).toBe(2.0);
    });
  });

  describe('Gate 10: Learner Payload Sanitization Anti-Leakage & Preview Protection', () => {
    it('P1 REQUIREMENT: strictly forbids unauthorized learners from previewing unreleased exam blueprints', async () => {
      // 1. Charlie (authenticated learner) attempts preview -> HTTP 403 Forbidden
      await request(app.getHttpServer())
        .get(`/api/v1/assessments/${aliceAssessmentId}/versions/1/preview`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.FORBIDDEN);

      // 2. Bob (authenticated educator/user) attempts preview -> HTTP 403 Forbidden
      await request(app.getHttpServer())
        .get(`/api/v1/assessments/${aliceAssessmentId}/versions/1/preview`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.FORBIDDEN);

      // 3. Unauthenticated request -> HTTP 401 Unauthorized
      await request(app.getHttpServer())
        .get(`/api/v1/assessments/${aliceAssessmentId}/versions/1/preview`)
        .expect(HttpStatus.UNAUTHORIZED);

      // 4. Alice (the creator) accesses preview -> HTTP 200 OK
      const previewRes = await request(app.getHttpServer())
        .get(`/api/v1/assessments/${aliceAssessmentId}/versions/1/preview`)
        .set('Cookie', aliceCookie)
        .expect(HttpStatus.OK);

      expect(previewRes.body.title).toBe('Mathematics Comprehensive Midterm Examination');
      expect(previewRes.body.sections.length).toBe(2);

      // Section 1 - MCQ item
      const mcqItem = previewRes.body.sections[0].items[0];
      expect(mcqItem.prompt).toBeDefined();
      expect(mcqItem.content.options).toBeDefined();
      // LEAK CHECKS:
      expect((mcqItem as any).answerKey).toBeUndefined();
      expect((mcqItem.content as any).answerKey).toBeUndefined();
      expect((mcqItem.content as any).correctOptionId).toBeUndefined();
      expect((mcqItem.content as any).explanation).toBeUndefined();

      // Section 2 - Numeric item
      const numItem = previewRes.body.sections[1].items[0];
      expect(numItem.prompt).toBeDefined();
      expect((numItem as any).answerKey).toBeUndefined();
      expect((numItem.content as any).correctValue).toBeUndefined();
      expect((numItem.content as any).tolerance).toBeUndefined();
    });
  });

  describe('Gate 11: Zero Premature Evidence or Gamification Emission', () => {
    it('verifies that authoring and publishing exams emits ZERO LearningEvidence and ZERO QualifyingFacts', async () => {
      const evidenceCount = await prisma.learningEvidence.count({
        where: { userId: aliceId },
      });
      expect(evidenceCount).toBe(0);

      const factCount = await prisma.qualifyingFact.count({
        where: { userId: aliceId },
      });
      expect(factCount).toBe(0);

      const questCount = await prisma.questInstance.count({
        where: { userId: aliceId },
      });
      expect(questCount).toBe(0);
    });
  });
});
