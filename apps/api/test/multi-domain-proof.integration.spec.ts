/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as path from 'path';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { createCorsOriginValidator } from '../src/common/utils/cors.util';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { QuestEngineService } from '../src/modules/quests/quest-engine.service';

function extractCookies(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

describe('Phase 5: Multi-Domain Proof Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const trustedOrigin = 'http://localhost:5173';

  // Test accounts
  const userOwner = {
    email: `owner_multidomain_${Date.now()}@ule.internal`,
    password: 'OwnerPassword123!',
    name: 'MultiDomain Educator Alice',
  };

  const userLearnerBob = {
    email: `bob_multidomain_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner Bob',
  };

  const userLearnerCharlie = {
    email: `charlie_multidomain_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner Charlie (Assistance Gate)',
  };

  const userLearnerDavid = {
    email: `david_multidomain_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner David (Cross-Domain Global Quest)',
  };

  const userLearnerEva = {
    email: `eva_multidomain_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner Eva (Gate 4 Cloze Verification)',
  };

  const userLearnerFrank = {
    email: `frank_multidomain_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner Frank (Active Quest Deduplication)',
  };

  const userLearnerGrace = {
    email: `grace_multidomain_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner Grace (Course Diversity Across Versions)',
  };

  const userLearnerHannah = {
    email: `hannah_multidomain_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner Hannah (Restoration Diversity Revalidation)',
  };

  let ownerCookie: string;
  let bobCookie: string;
  let charlieCookie: string;
  let davidCookie: string;
  let evaCookie: string;
  let frankCookie: string;
  let graceCookie: string;
  let hannahCookie: string;

  let bobId: string;
  let charlieId: string;
  let davidId: string;
  let evaId: string;
  let frankId: string;
  let graceId: string;
  let hannahId: string;

  // Domain A (Mathematics) Identifiers
  let mathCourseId: string;
  let mathVersionId: string;
  let mathVideoBlockId: string;
  let mathMcqPracticeBlockId: string;
  let mathMcqDeferredBlockId: string;
  let mathSkillId: string;

  // Domain B (English Language Learning) Identifiers
  let engCourseId: string;
  let engVersionId: string;
  let engMcqReadingBlockId: string;
  let engClozePracticeBlockId: string;
  let engClozeDeferredBlockId: string;
  let engSkillId: string;

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

    // 1. Register Owner
    const ownerRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userOwner)
      .expect(HttpStatus.OK);
    ownerCookie = extractCookies(ownerRegRes);

    // 2. Register Learner Bob
    const bobRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userLearnerBob)
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
      .send(userLearnerCharlie)
      .expect(HttpStatus.OK);
    charlieCookie = extractCookies(charlieRegRes);
    const charlieMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', charlieCookie)
      .expect(HttpStatus.OK);
    charlieId = charlieMe.body.user.id;

    // 4. Register Learner David
    const davidRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userLearnerDavid)
      .expect(HttpStatus.OK);
    davidCookie = extractCookies(davidRegRes);
    const davidMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', davidCookie)
      .expect(HttpStatus.OK);
    davidId = davidMe.body.user.id;

    // 5. Register Learner Eva
    const evaRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userLearnerEva)
      .expect(HttpStatus.OK);
    evaCookie = extractCookies(evaRegRes);
    const evaMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', evaCookie)
      .expect(HttpStatus.OK);
    evaId = evaMe.body.user.id;

    // 6. Register Learner Frank
    const frankRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userLearnerFrank)
      .expect(HttpStatus.OK);
    frankCookie = extractCookies(frankRegRes);
    const frankMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', frankCookie)
      .expect(HttpStatus.OK);
    frankId = frankMe.body.user.id;

    // 7. Register Learner Grace
    const graceRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userLearnerGrace)
      .expect(HttpStatus.OK);
    graceCookie = extractCookies(graceRegRes);
    const graceMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', graceCookie)
      .expect(HttpStatus.OK);
    graceId = graceMe.body.user.id;

    // 8. Register Learner Hannah
    const hannahRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userLearnerHannah)
      .expect(HttpStatus.OK);
    hannahCookie = extractCookies(hannahRegRes);
    const hannahMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', hannahCookie)
      .expect(HttpStatus.OK);
    hannahId = hannahMe.body.user.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Gate 1: Domain A (Mathematics) Authoring, Skill Mapping & Version Snapshotting', () => {
    it('creates Math Course and adds video and algebraic derivation MCQ blocks', async () => {
      // 1. Create Math Course
      const courseRes = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Cookie', ownerCookie)
        .send({
          title: 'Linear Algebra & Algebraic Functions',
          description: 'Domain A: Rigorous mathematical derivations and linear systems.',
        })
        .expect(HttpStatus.CREATED);
      mathCourseId = courseRes.body.course.id;

      // 2. Add Video Block (non-evaluatable)
      const videoRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          expectedRevision: 1,
          blockTypeId: 'video',
          typeVersion: '1.0.0',
          title: 'Introduction to Linear Equations',
          orderIndex: 0,
          config: {
            url: 'https://cdn.ule.internal/math/intro-linear.mp4',
            durationSeconds: 300,
            allowSkip: true,
          },
        })
        .expect(HttpStatus.CREATED);
      mathVideoBlockId = videoRes.body.id;

      // 3. Define Course Skill: SKILL_MATH_ALGEBRA
      const skillRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/skills`)
        .set('Cookie', ownerCookie)
        .send({
          skillCode: 'SKILL_MATH_ALGEBRA',
          name: 'Algebraic Equation Solving',
          description: 'First-order single-variable linear equation solving.',
        })
        .expect(HttpStatus.CREATED);
      mathSkillId = skillRes.body.id;

      // 4. Add MCQ Practice Block: Solve 2x + 5 = 15
      const mcqRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          expectedRevision: 2,
          blockTypeId: 'multiple-choice',
          typeVersion: '1.0.0',
          title: 'Linear Equation Derivation Quiz',
          orderIndex: 1,
          config: {
            question: 'Solve for x: 2x + 5 = 15',
            options: [
              { id: 'opt_3', text: 'x = 3' },
              { id: 'opt_5', text: 'x = 5' },
              { id: 'opt_10', text: 'x = 10' },
            ],
            answerKey: {
              correctOptionId: 'opt_5',
              explanation: 'Subtract 5 to get 2x = 10, then divide by 2 to get x = 5.',
            },
            hintText: 'Isolate 2x by subtracting 5 from both sides.',
            allowHints: true,
            feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
          },
        })
        .expect(HttpStatus.CREATED);
      mathMcqPracticeBlockId = mcqRes.body.id;

      // Map MCQ Block to SKILL_MATH_ALGEBRA
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mathMcqPracticeBlockId,
          skillId: mathSkillId,
          criterion: 'CORRECT_RESPONSE',
          weight: 1.0,
          expectedRevision: 3,
        })
        .expect(HttpStatus.OK);

      // 5. Add Deferred MCQ Block for deferred feedback confidentiality test
      const mcqDefRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          expectedRevision: 4,
          blockTypeId: 'multiple-choice',
          typeVersion: '1.0.0',
          title: 'Math Deferred Final Assessment',
          orderIndex: 2,
          config: {
            question: 'Is every linear function continuous on R?',
            options: [
              { id: 'opt_true', text: 'True' },
              { id: 'opt_false', text: 'False' },
            ],
            answerKey: {
              correctOptionId: 'opt_true',
              explanation: 'Polynomials and linear functions are continuous everywhere on R.',
            },
            feedbackPolicy: 'DEFERRED',
          },
        })
        .expect(HttpStatus.CREATED);
      mathMcqDeferredBlockId = mcqDefRes.body.id;

      // Map Deferred MCQ to SKILL_MATH_ALGEBRA
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mathMcqDeferredBlockId,
          skillId: mathSkillId,
          criterion: 'CORRECT_RESPONSE',
          weight: 1.0,
          expectedRevision: 5,
        })
        .expect(HttpStatus.OK);
    });

    it('attaches Math Course Quests and publishes CourseVersion v1', async () => {
      // 1. Math Distinct Activities Quest (target: 2)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'math-distinct',
          title: 'Complete 2 Math Activities',
          description: 'Complete 2 distinct activities in the mathematics course.',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          config: { targetCount: 2 },
          rewardPolicy: { courseXp: 50 },
        })
        .expect(HttpStatus.CREATED);

      // 2. Math Independent Practice Quest
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'math-practice',
          title: 'Algebra Mastery Milestone',
          description: 'Demonstrate independent unassisted mastery of linear algebra.',
          templateId: 'INDEPENDENT_PRACTICE',
          config: { skillCode: 'SKILL_MATH_ALGEBRA', targetCount: 1 },
          rewardPolicy: { courseXp: 100 },
        })
        .expect(HttpStatus.CREATED);

      // 3. Publish Math CourseVersion
      const versionRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/versions`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.CREATED);

      mathVersionId = versionRes.body.id;
      expect(versionRes.body.versionNumber).toBe(1);

      // Snapshot verification
      const dbVersion = await prisma.courseVersion.findUniqueOrThrow({
        where: { id: mathVersionId },
      });
      const snapshot = dbVersion.snapshot as any;
      expect(snapshot.blocks.length).toBe(3);
      expect(snapshot.quests.length).toBe(2);
      expect(snapshot.skillMappings.length).toBe(2);
    });
  });

  describe('Gate 2: Domain B (English Language Learning) Authoring, Cloze ABP Extension & Snapshotting', () => {
    it('creates English Course and adds Reading MCQ and Cloze fill-in-the-blank blocks', async () => {
      // 1. Create English Course
      const courseRes = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Cookie', ownerCookie)
        .send({
          title: 'English Syntax, Grammar & Morphosyntax',
          description: 'Domain B: Deterministic language learning with Cloze sentence evaluation.',
        })
        .expect(HttpStatus.CREATED);
      engCourseId = courseRes.body.course.id;

      // 2. Add Reading Comprehension MCQ Block
      const mcqRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          expectedRevision: 1,
          blockTypeId: 'multiple-choice',
          typeVersion: '1.0.0',
          title: 'Reading Comprehension Check',
          orderIndex: 0,
          config: {
            question: 'Which of the following describes the grammatical role of a subject in a passive sentence?',
            options: [
              { id: 'opt_agent', text: 'It is always the agent performing the action' },
              { id: 'opt_patient', text: 'It is the patient or recipient of the action' },
            ],
            answerKey: {
              correctOptionId: 'opt_patient',
              explanation: 'In a passive sentence, the grammatical subject receives the action.',
            },
            feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
          },
        })
        .expect(HttpStatus.CREATED);
      engMcqReadingBlockId = mcqRes.body.id;

      // 3. Define Course Skill: SKILL_ENG_SYNTAX
      const skillRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/skills`)
        .set('Cookie', ownerCookie)
        .send({
          skillCode: 'SKILL_ENG_SYNTAX',
          name: 'English Syntax and Sentence Structure',
          description: 'Accurate retrieval of sentence components and vocabulary in context.',
        })
        .expect(HttpStatus.CREATED);
      engSkillId = skillRes.body.id;

      // 4. Add Cloze Fill-in-the-Blank Block (Allowlisted ABP Extension v1.0.0)
      const clozeRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          expectedRevision: 2,
          blockTypeId: 'cloze',
          typeVersion: '1.0.0',
          title: 'European Geography & Languages Syntax Cloze',
          orderIndex: 1,
          config: {
            prompt: 'Complete the sentence by filling in the missing blanks.',
            templateText: 'The capital of France is {{capital}} and its official language is {{language}}.',
            targetBlanks: [
              { id: 'b_capital', blankKey: 'capital', hintText: 'Think of Western Europe and the Eiffel Tower.' },
              { id: 'b_language', blankKey: 'language', hintText: 'Romance language spoken in France.' },
            ],
            answerKey: {
              blanks: {
                capital: ['Paris', 'City of Light', 'Ville de Paris'],
                language: ['French', 'français'],
              },
              explanation: 'Paris is the capital of France and French is the official language.',
            },
            allowHints: true,
            hintText: 'Think of Western Europe and the Eiffel Tower.',
            feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
          },
        })
        .expect(HttpStatus.CREATED);
      engClozePracticeBlockId = clozeRes.body.id;

      // Map Cloze Block to SKILL_ENG_SYNTAX
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: engClozePracticeBlockId,
          skillId: engSkillId,
          criterion: 'CORRECT_RESPONSE',
          weight: 1.0,
          expectedRevision: 3,
        })
        .expect(HttpStatus.OK);

      // 5. Add Deferred Cloze Block for Deferred Feedback test
      const defClozeRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          expectedRevision: 4,
          blockTypeId: 'cloze',
          typeVersion: '1.0.0',
          title: 'English Final Examination Cloze (Deferred)',
          orderIndex: 2,
          config: {
            prompt: 'Complete the sentence about English literature.',
            templateText: 'Shakespeare wrote {{play}} in England.',
            targetBlanks: [
              { id: 'b_play', blankKey: 'play' },
            ],
            answerKey: {
              blanks: {
                play: ['Hamlet', 'Macbeth', 'Othello'],
              },
              explanation: 'Shakespeare wrote multiple famous tragedies including Hamlet.',
            },
            feedbackPolicy: 'DEFERRED',
          },
        })
        .expect(HttpStatus.CREATED);
      engClozeDeferredBlockId = defClozeRes.body.id;

      // Map Deferred Cloze to SKILL_ENG_SYNTAX
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: engClozeDeferredBlockId,
          skillId: engSkillId,
          criterion: 'CORRECT_RESPONSE',
          weight: 1.0,
          expectedRevision: 5,
        })
        .expect(HttpStatus.OK);
    });

    it('attaches English Course Quests and publishes CourseVersion v1', async () => {
      // 1. English Distinct Activities Quest (target: 2)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'eng-distinct',
          title: 'Complete 2 English Activities',
          description: 'Finish any 2 distinct activities in the English course.',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          config: { targetCount: 2 },
          rewardPolicy: { courseXp: 40 },
        })
        .expect(HttpStatus.CREATED);

      // 2. English Independent Practice Quest
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'eng-practice',
          title: 'Syntax Mastery Milestone',
          description: 'Demonstrate independent mastery of syntax via Cloze exercises.',
          templateId: 'INDEPENDENT_PRACTICE',
          config: { skillCode: 'SKILL_ENG_SYNTAX', targetCount: 1 },
          rewardPolicy: { courseXp: 80 },
        })
        .expect(HttpStatus.CREATED);

      // 3. Publish English CourseVersion
      const versionRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/versions`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.CREATED);

      engVersionId = versionRes.body.id;
      expect(versionRes.body.versionNumber).toBe(1);

      // Snapshot verification
      const dbVersion = await prisma.courseVersion.findUniqueOrThrow({
        where: { id: engVersionId },
      });
      const snapshot = dbVersion.snapshot as any;
      expect(snapshot.blocks.length).toBe(3);
      expect(snapshot.quests.length).toBe(2);
      expect(snapshot.skillMappings.length).toBe(2);

      // Verify cloze block in snapshot
      const clozeBlock = snapshot.blocks.find((b: any) => b.id === engClozePracticeBlockId);
      expect(clozeBlock).toBeDefined();
      expect(clozeBlock.blockTypeId).toBe('cloze');
      expect(clozeBlock.typeVersion).toBe('1.0.0');
    });
  });

  describe('Gate 3: Independent Learner Enrollment & Access Authorization', () => {
    it('denies learner Bob enrollment without active CourseAccessGrant for both domains (HTTP 403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${mathVersionId}/enroll`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.FORBIDDEN);

      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${engVersionId}/enroll`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('authorizes Bob and initializes course-scoped quest instances in both domains', async () => {
      // 1. Grant access to Math and English
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/versions/${mathVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: bobId })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/versions/${engVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: bobId })
        .expect(HttpStatus.CREATED);

      // 2. Enroll in Math
      const mathEnrollRes = await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${mathVersionId}/enroll`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.CREATED);

      expect(mathEnrollRes.body.quests.length).toBe(2);
      const mathQuestKeys = mathEnrollRes.body.quests.map((q: any) => q.questKey);
      expect(mathQuestKeys).toContain('math-distinct');
      expect(mathQuestKeys).toContain('math-practice');

      // 3. Enroll in English
      const engEnrollRes = await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${engVersionId}/enroll`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.CREATED);

      expect(engEnrollRes.body.quests.length).toBe(2);
      const engQuestKeys = engEnrollRes.body.quests.map((q: any) => q.questKey);
      expect(engQuestKeys).toContain('eng-distinct');
      expect(engQuestKeys).toContain('eng-practice');
    });
  });

  describe('Gate 4: Allowlisted Cloze ABP Extension Verification (Sanitization & Normalization)', () => {
    beforeAll(async () => {
      // Grant Eva access to English course for standalone ABP verification
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/versions/${engVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: evaId })
        .expect(HttpStatus.CREATED);
    });

    it('sanitizes learner view: strips answer keys and educator explanations from run payload', async () => {
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', evaCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engClozePracticeBlockId,
          idempotencyKey: `run-cloze-sanit-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      const learnerConfig = runRes.body.block?.learnerConfig;
      expect(learnerConfig).toBeDefined();
      expect(learnerConfig.templateText).toContain('{{capital}}');
      expect(learnerConfig.templateText).toContain('{{language}}');
      expect(learnerConfig.targetBlanks).toBeDefined();

      // Ensure answerKey is never leaked
      expect(learnerConfig.answerKey).toBeUndefined();
      expect(learnerConfig.targetBlanks[0].acceptableAnswers).toBeUndefined();
      expect(learnerConfig.targetBlanks[0].variants).toBeUndefined();
      expect(learnerConfig.targetBlanks[0].explanation).toBeUndefined();
    });

    it('evaluates answers deterministically with Unicode NFKC normalization, case folding and punctuation stripping', async () => {
      // Start a fresh Cloze run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', evaCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engClozePracticeBlockId,
          idempotencyKey: `run-cloze-norm-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // Submit with messy casing, surrounding whitespace, and punctuation: "   pAris.  ", "  FRENCH!  "
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', evaCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: {
            answers: {
              capital: '   pAris.  ',
              language: '  FRENCH!  ',
            },
          },
          idempotencyKey: `cmd-cloze-norm-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      const assessment = subRes.body.latestAssessment;
      expect(assessment).toBeDefined();
      expect(assessment.status).toBe('EVALUATED');
      expect(assessment.isCorrect).toBe(true);
      expect(assessment.score).toBe(1.0);
      expect(assessment.feedback.explanation).toContain('Paris is the capital');
    });

    it('evaluates accepted variant answers with diacritics correctly', async () => {
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', evaCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engClozePracticeBlockId,
          idempotencyKey: `run-cloze-variant-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // Submit variant "City of Light" and "français" (with cedilla)
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', evaCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: {
            answers: {
              capital: 'City of Light',
              language: 'français',
            },
          },
          idempotencyKey: `cmd-cloze-var-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      expect(subRes.body.latestAssessment.isCorrect).toBe(true);
      expect(subRes.body.latestAssessment.score).toBe(1.0);
    });

    it('evaluates incorrect answers accurately', async () => {
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', evaCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engClozePracticeBlockId,
          idempotencyKey: `run-cloze-incorrect-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', evaCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: {
            answers: {
              capital: 'London',
              language: 'German',
            },
          },
          idempotencyKey: `cmd-cloze-inc-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      expect(subRes.body.latestAssessment.isCorrect).toBe(false);
      expect(subRes.body.latestAssessment.score).toBe(0.0);
    });
  });

  describe('Gate 5: Domain A (Mathematics) Assessment & Course Quest Progression', () => {
    it('completing Math Video activity increments math-distinct quest progress to 1/2', async () => {
      // 1. Start Video run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', bobCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathVideoBlockId,
          idempotencyKey: `run-math-video-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // 2. Execute FINISH
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', bobCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-math-video-finish-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Verify math-distinct quest progress is 1/2
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${mathVersionId}/quests`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.OK);

      const distinctQuest = questsRes.body.find((q: any) => q.questKey === 'math-distinct');
      expect(distinctQuest.objectives[0].currentCount).toBe(1);
      expect(distinctQuest.status).toBe('ACTIVE');

      // Video completion NEVER increments independent practice quest
      const practiceQuest = questsRes.body.find((q: any) => q.questKey === 'math-practice');
      expect(practiceQuest.objectives[0].currentCount).toBe(0);
      expect(practiceQuest.status).toBe('ACTIVE');
    });

    it('unassisted correct attempt on Math MCQ completes both math-distinct and math-practice quests', async () => {
      // 1. Start MCQ run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', bobCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathMcqPracticeBlockId,
          idempotencyKey: `run-math-mcq-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // 2. Submit correct response unassisted (opt_5)
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', bobCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_5' },
          idempotencyKey: `cmd-math-mcq-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Execute FINISH
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', bobCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-math-mcq-finish-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 4. Verify both Math quests are COMPLETED
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${mathVersionId}/quests`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.OK);

      const distinctQuest = questsRes.body.find((q: any) => q.questKey === 'math-distinct');
      expect(distinctQuest.objectives[0].currentCount).toBe(2);
      expect(distinctQuest.objectives[0].isCompleted).toBe(true);
      expect(distinctQuest.status).toBe('COMPLETED');

      const practiceQuest = questsRes.body.find((q: any) => q.questKey === 'math-practice');
      expect(practiceQuest.objectives[0].currentCount).toBe(1);
      expect(practiceQuest.objectives[0].isCompleted).toBe(true);
      expect(practiceQuest.status).toBe('COMPLETED');
    });
  });

  describe('Gate 6: Domain B (English Language) Assessment & Course Quest Progression', () => {
    it('completing English Reading MCQ increments eng-distinct quest progress to 1/2', async () => {
      // 1. Start Reading MCQ run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', bobCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engMcqReadingBlockId,
          idempotencyKey: `run-eng-mcq-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // 2. Submit response (opt_patient) and FINISH
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', bobCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_patient' },
          idempotencyKey: `cmd-eng-mcq-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', bobCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-eng-mcq-finish-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Verify eng-distinct is 1/2, eng-practice is 0/1
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${engVersionId}/quests`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.OK);

      const distinctQuest = questsRes.body.find((q: any) => q.questKey === 'eng-distinct');
      expect(distinctQuest.objectives[0].currentCount).toBe(1);
      expect(distinctQuest.status).toBe('ACTIVE');

      const practiceQuest = questsRes.body.find((q: any) => q.questKey === 'eng-practice');
      expect(practiceQuest.objectives[0].currentCount).toBe(0);
      expect(practiceQuest.status).toBe('ACTIVE');
    });

    it('unassisted correct attempt on English Cloze completes both eng-distinct and eng-practice quests', async () => {
      // 1. Start Cloze run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', bobCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engClozePracticeBlockId,
          idempotencyKey: `run-eng-cloze-quest-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // 2. Submit correct answers unassisted
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', bobCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: {
            answers: {
              capital: 'Paris',
              language: 'French',
            },
          },
          idempotencyKey: `cmd-eng-cloze-quest-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Execute FINISH
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', bobCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-eng-cloze-quest-finish-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 4. Verify both English quests are COMPLETED
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${engVersionId}/quests`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.OK);

      const distinctQuest = questsRes.body.find((q: any) => q.questKey === 'eng-distinct');
      expect(distinctQuest.objectives[0].currentCount).toBe(2);
      expect(distinctQuest.objectives[0].isCompleted).toBe(true);
      expect(distinctQuest.status).toBe('COMPLETED');

      const practiceQuest = questsRes.body.find((q: any) => q.questKey === 'eng-practice');
      expect(practiceQuest.objectives[0].currentCount).toBe(1);
      expect(practiceQuest.objectives[0].isCompleted).toBe(true);
      expect(practiceQuest.status).toBe('COMPLETED');
    });
  });

  describe('Gate 7: Replay & Qualification Idempotency in Both Domains', () => {
    it('repeating activities does not duplicate QualifyingFacts or double-count quest progress', async () => {
      // 1. Repeat Math Video run
      const repeatMathRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', bobCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathVideoBlockId,
          idempotencyKey: `run-math-video-repeat-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${repeatMathRun.body.id}/commands`)
        .set('Cookie', bobCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-math-video-repeat-finish-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Verify math-distinct quest count remains 2
      const mathQuests = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${mathVersionId}/quests`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.OK);
      const mathDistinct = mathQuests.body.find((q: any) => q.questKey === 'math-distinct');
      expect(mathDistinct.objectives[0].currentCount).toBe(2);

      // 2. Repeat English Cloze run
      const repeatEngRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', bobCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engClozePracticeBlockId,
          idempotencyKey: `run-eng-cloze-repeat-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${repeatEngRun.body.id}/commands`)
        .set('Cookie', bobCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { answers: { capital: 'Paris', language: 'French' } },
          idempotencyKey: `cmd-eng-cloze-rep-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${repeatEngRun.body.id}/commands`)
        .set('Cookie', bobCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-eng-cloze-rep-fin-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Verify English quests remain at completed counts
      const engQuests = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${engVersionId}/quests`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.OK);
      const engPractice = engQuests.body.find((q: any) => q.questKey === 'eng-practice');
      expect(engPractice.objectives[0].currentCount).toBe(1);
    });

    it('deduplicates activity replays while Course Quest is still ACTIVE (no premature increment)', async () => {
      // 1. Grant Frank access and enroll in Math course
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/versions/${mathVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: frankId })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${mathVersionId}/enroll`)
        .set('Cookie', frankCookie)
        .expect(HttpStatus.CREATED);

      // 2. Frank completes Math Video activity
      const run1 = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', frankCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathVideoBlockId,
          idempotencyKey: `run-frank-video-1-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${run1.body.id}/commands`)
        .set('Cookie', frankCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-frank-video-finish-1-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Verify quest is ACTIVE with progress 1/2
      let quests = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${mathVersionId}/quests`)
        .set('Cookie', frankCookie)
        .expect(HttpStatus.OK);
      let distinctQuest = quests.body.find((q: any) => q.questKey === 'math-distinct');
      expect(distinctQuest.status).toBe('ACTIVE');
      expect(distinctQuest.objectives[0].currentCount).toBe(1);
      expect(distinctQuest.objectives[0].isCompleted).toBe(false);

      // 3. Frank replays/repeats the same Video activity with a new run
      const run2 = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', frankCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathVideoBlockId,
          idempotencyKey: `run-frank-video-2-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${run2.body.id}/commands`)
        .set('Cookie', frankCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-frank-video-finish-2-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // INVARIANT: Quest count REMAINS 1/2, quest REMAINS ACTIVE (no premature increment on repeated block)
      quests = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${mathVersionId}/quests`)
        .set('Cookie', frankCookie)
        .expect(HttpStatus.OK);
      distinctQuest = quests.body.find((q: any) => q.questKey === 'math-distinct');
      expect(distinctQuest.status).toBe('ACTIVE');
      expect(distinctQuest.objectives[0].currentCount).toBe(1);
      expect(distinctQuest.objectives[0].isCompleted).toBe(false);

      // 4. Frank completes a second distinct activity (Math MCQ)
      const mcqRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', frankCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathMcqPracticeBlockId,
          idempotencyKey: `run-frank-mcq-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mcqRun.body.id}/commands`)
        .set('Cookie', frankCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_5' },
          idempotencyKey: `cmd-frank-mcq-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mcqRun.body.id}/commands`)
        .set('Cookie', frankCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-frank-mcq-finish-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Verify quest now transitions to COMPLETED exactly once
      quests = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${mathVersionId}/quests`)
        .set('Cookie', frankCookie)
        .expect(HttpStatus.OK);
      distinctQuest = quests.body.find((q: any) => q.questKey === 'math-distinct');
      expect(distinctQuest.status).toBe('COMPLETED');
      expect(distinctQuest.objectives[0].currentCount).toBe(2);
      expect(distinctQuest.objectives[0].isCompleted).toBe(true);
    });
  });

  describe('Gate 8: Assistance Tracking Distinction in Both Domains', () => {
    beforeAll(async () => {
      // Grant Charlie access to Math and English
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/versions/${mathVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/versions/${engVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: charlieId })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${mathVersionId}/enroll`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${engVersionId}/enroll`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.CREATED);
    });

    it('in Math: assisted MCQ attempt (SERVER_OBSERVED hint delivered) NEVER qualifies for Independent Practice quest', async () => {
      // 1. Start Math MCQ run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', charlieCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathMcqPracticeBlockId,
          idempotencyKey: `run-math-assisted-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // 2. Request Hint
      const hintRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', charlieCookie)
        .send({
          command: 'REQUEST_HINT',
          idempotencyKey: `cmd-math-hint-${Date.now()}`,
        })
        .expect(HttpStatus.OK);
      expect(hintRes.body.deliveredHint).toContain('Isolate 2x');

      // 3. Submit correct response after hint
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', charlieCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_5' },
          idempotencyKey: `cmd-math-assisted-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      expect(subRes.body.latestAttempt.assisted).toBe(true);
      expect(subRes.body.latestAssessment.isCorrect).toBe(true);

      // 4. Verify math-practice quest remains 0
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${mathVersionId}/quests`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);
      const practiceQuest = questsRes.body.find((q: any) => q.questKey === 'math-practice');
      expect(practiceQuest.objectives[0].currentCount).toBe(0);
      expect(practiceQuest.status).toBe('ACTIVE');
    });

    it('in English: assisted Cloze attempt (SERVER_OBSERVED hint delivered) NEVER qualifies for Independent Practice quest', async () => {
      // 1. Start English Cloze run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', charlieCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engClozePracticeBlockId,
          idempotencyKey: `run-eng-assisted-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // 2. Request Hint
      const hintRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', charlieCookie)
        .send({
          command: 'REQUEST_HINT',
          idempotencyKey: `cmd-eng-hint-${Date.now()}`,
        })
        .expect(HttpStatus.OK);
      expect(hintRes.body.deliveredHint).toContain('Eiffel Tower');

      // 3. Submit correct answers after hint
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', charlieCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { answers: { capital: 'Paris', language: 'French' } },
          idempotencyKey: `cmd-eng-assisted-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      expect(subRes.body.latestAttempt.assisted).toBe(true);
      expect(subRes.body.latestAssessment.isCorrect).toBe(true);

      // 4. Verify eng-practice quest remains 0
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${engVersionId}/quests`)
        .set('Cookie', charlieCookie)
        .expect(HttpStatus.OK);
      const practiceQuest = questsRes.body.find((q: any) => q.questKey === 'eng-practice');
      expect(practiceQuest.objectives[0].currentCount).toBe(0);
      expect(practiceQuest.status).toBe('ACTIVE');
    });
  });

  describe('Gate 9: DEFERRED Feedback Policy Confidentiality in Both Domains', () => {
    it('under DEFERRED feedback policy, active attempt does not leak correctness or qualify facts', async () => {
      // 1. Start DEFERRED Math MCQ run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', charlieCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathMcqDeferredBlockId,
          idempotencyKey: `run-math-def-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // 2. Submit response
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', charlieCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_true' },
          idempotencyKey: `cmd-math-def-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Correctness is withheld from learner
      expect(subRes.body.latestAssessment.isCorrect).toBeNull();
      expect(subRes.body.latestAssessment.feedback.deferred).toBe(true);

      // Verify NO QualifyingFact is generated while run is ACTIVE
      const activeFacts = await prisma.qualifyingFact.findMany({
        where: { runId, state: 'QUALIFIED' },
      });
      expect(activeFacts.length).toBe(0);

      // 3. Close run with COMPLETED -> qualifies fact upon CLOSED COMPLETED
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', charlieCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-math-def-fin-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      const completedFacts = await prisma.qualifyingFact.findMany({
        where: { runId, state: 'QUALIFIED' },
      });
      expect(completedFacts.length).toBeGreaterThan(0);
    });

    it('abandoning a DEFERRED English Cloze run NEVER qualifies or releases correctness', async () => {
      // 1. Start DEFERRED Cloze run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', charlieCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engClozeDeferredBlockId,
          idempotencyKey: `run-eng-def-abandon-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // 2. Submit response
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', charlieCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { answers: { play: 'Hamlet' } },
          idempotencyKey: `cmd-eng-def-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Abandon run
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', charlieCookie)
        .send({
          command: 'ABANDON',
          idempotencyKey: `cmd-eng-def-abandon-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Invariant: ABANDONED runs NEVER qualify
      const abandonedFacts = await prisma.qualifyingFact.findMany({
        where: { runId, state: 'QUALIFIED' },
      });
      expect(abandonedFacts.length).toBe(0);
    });
  });

  describe('Gate 10: Cross-Domain Global Quest Progression', () => {
    let globalQuestId: string;

    beforeAll(async () => {
      // 1. Grant Learner David access to both Math and English
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/versions/${mathVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: davidId })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/versions/${engVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: davidId })
        .expect(HttpStatus.CREATED);

      // 2. David enrolls in both courses
      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${mathVersionId}/enroll`)
        .set('Cookie', davidCookie)
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${engVersionId}/enroll`)
        .set('Cookie', davidCookie)
        .expect(HttpStatus.CREATED);

      // 3. Seed ULE-owned Global Quest instance for David across all learning domains
      const globalQuest = await prisma.questInstance.create({
        data: {
          userId: davidId,
          questKey: 'polymath-explorer',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          title: 'Cross-Domain Polymath Explorer',
          description: 'Complete 2 distinct activities across disparate learning domains.',
          scope: 'GLOBAL',
          status: 'ACTIVE',
          config: {
            targetCount: 2,
            requireDistinctCourses: true,
          },
          rewardPolicy: { platformXp: 100 },
          objectives: {
            create: [
              {
                objectiveKey: 'complete_distinct_activities',
                targetCount: 2,
                currentCount: 0,
                isCompleted: false,
              },
            ],
          },
        },
        include: { objectives: true },
      });
      globalQuestId = globalQuest.id;
    });

    it('completing 1 distinct activity in Math advances Global Quest progress to 1/2', async () => {
      // David completes Math Video run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', davidCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathVideoBlockId,
          idempotencyKey: `run-david-math-video-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runRes.body.id}/commands`)
        .set('Cookie', davidCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-david-math-video-finish-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Verify Global Quest progress is now 1/2
      const updatedGlobalQuest = await prisma.questInstance.findUniqueOrThrow({
        where: { id: globalQuestId },
        include: { objectives: true },
      });

      expect(updatedGlobalQuest.status).toBe('ACTIVE');
      expect(updatedGlobalQuest.objectives[0].currentCount).toBe(1);
      expect(updatedGlobalQuest.objectives[0].isCompleted).toBe(false);
    });

    it('negative check: completing a second distinct activity in the SAME Math course does NOT increment Global Quest', async () => {
      // David completes a 2nd distinct activity in the SAME Math course (Algebraic MCQ)
      const mathMcqRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', davidCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathMcqPracticeBlockId,
          idempotencyKey: `run-david-math-mcq-same-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mathMcqRun.body.id}/commands`)
        .set('Cookie', davidCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_5' },
          idempotencyKey: `cmd-david-math-sub-same-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mathMcqRun.body.id}/commands`)
        .set('Cookie', davidCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-david-math-fin-same-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Invariant: requireDistinctCourses disallows two activities from the same course
      // Progress MUST REMAIN 1/2, quest MUST REMAIN ACTIVE
      const updatedGlobalQuest = await prisma.questInstance.findUniqueOrThrow({
        where: { id: globalQuestId },
        include: { objectives: true },
      });

      expect(updatedGlobalQuest.status).toBe('ACTIVE');
      expect(updatedGlobalQuest.objectives[0].currentCount).toBe(1);
      expect(updatedGlobalQuest.objectives[0].isCompleted).toBe(false);
    });

    it('completing 1 distinct activity in English advances Global Quest to 2/2 and COMPLETES it', async () => {
      // David completes English Reading MCQ run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', davidCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engMcqReadingBlockId,
          idempotencyKey: `run-david-eng-mcq-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runRes.body.id}/commands`)
        .set('Cookie', davidCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_patient' },
          idempotencyKey: `cmd-david-eng-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runRes.body.id}/commands`)
        .set('Cookie', davidCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-david-eng-fin-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Verify Global Quest progress is now 2/2 and status is COMPLETED
      const updatedGlobalQuest = await prisma.questInstance.findUniqueOrThrow({
        where: { id: globalQuestId },
        include: { objectives: true, consumptions: true },
      });

      expect(updatedGlobalQuest.status).toBe('COMPLETED');
      expect(updatedGlobalQuest.completedAt).not.toBeNull();
      expect(updatedGlobalQuest.objectives[0].currentCount).toBe(2);
      expect(updatedGlobalQuest.objectives[0].isCompleted).toBe(true);

      // Verify consumptions trace back to both courses
      expect(updatedGlobalQuest.consumptions.length).toBe(2);
    });

    it('negative check: rejects unverified course practice facts from qualifying Global Quests', async () => {
      // Seed a Global Quest with INDEPENDENT_PRACTICE template
      const globalPracticeQuest = await prisma.questInstance.create({
        data: {
          userId: davidId,
          questKey: 'global-unverified-rejected',
          templateId: 'INDEPENDENT_PRACTICE',
          title: 'Global Verified Practice Milestone',
          scope: 'GLOBAL',
          status: 'ACTIVE',
          config: {
            skillCode: 'SKILL_ENG_SYNTAX',
            targetCount: 1,
          },
          objectives: {
            create: [
              {
                objectiveKey: 'independent_practice',
                targetCount: 1,
                currentCount: 0,
                isCompleted: false,
              },
            ],
          },
        },
        include: { objectives: true },
      });

      // David completes unassisted Cloze in English course (provenance: SELF_REPORTED_INDEPENDENT, UNVERIFIED_PRACTICE)
      const clozeRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', davidCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engClozePracticeBlockId,
          idempotencyKey: `run-david-cloze-unverified-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${clozeRun.body.id}/commands`)
        .set('Cookie', davidCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { answers: { capital: 'Paris', language: 'French' } },
          idempotencyKey: `cmd-david-cloze-unverified-sub-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Course-level practice fact exists with UNVERIFIED_PRACTICE
      const courseFact = await prisma.qualifyingFact.findFirst({
        where: { runId: clozeRun.body.id, factType: 'INDEPENDENT_PRACTICE_CONFIRMED' },
      });
      expect(courseFact).toBeDefined();

      // INVARIANT: Global Quest rejects UNVERIFIED_PRACTICE provenance and remains at count 0
      const updatedGlobalPracticeQuest = await prisma.questInstance.findUniqueOrThrow({
        where: { id: globalPracticeQuest.id },
        include: { objectives: true },
      });
      expect(updatedGlobalPracticeQuest.status).toBe('ACTIVE');
      expect(updatedGlobalPracticeQuest.objectives[0].currentCount).toBe(0);
      expect(updatedGlobalPracticeQuest.objectives[0].isCompleted).toBe(false);
    });

    it('replaying an activity in either domain does not double count Global Quest progress', async () => {
      // David completes another English Reading MCQ run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', davidCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engMcqReadingBlockId,
          idempotencyKey: `run-david-eng-repeat-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runRes.body.id}/commands`)
        .set('Cookie', davidCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-david-eng-repeat-finish-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      const updatedGlobalQuest = await prisma.questInstance.findUniqueOrThrow({
        where: { id: globalQuestId },
        include: { objectives: true },
      });

      // Still 2, no increment
      expect(updatedGlobalQuest.objectives[0].currentCount).toBe(2);
    });

    it('enforces course diversity by courseId across different versions of the same course (v1 and v2)', async () => {
      // 1. Create a 2nd immutable version of Math course (versionNumber: 2, same courseId: mathCourseId)
      const v2Res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/versions`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.CREATED);
      const mathVersion2Id = v2Res.body.id;

      // 2. Grant Learner Grace access to Math v1, Math v2, and English v1
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/versions/${mathVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: graceId })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/versions/${mathVersion2Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: graceId })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/versions/${engVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: graceId })
        .expect(HttpStatus.CREATED);

      // 3. Grace enrolls in all three versions
      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${mathVersionId}/enroll`)
        .set('Cookie', graceCookie)
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${mathVersion2Id}/enroll`)
        .set('Cookie', graceCookie)
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${engVersionId}/enroll`)
        .set('Cookie', graceCookie)
        .expect(HttpStatus.CREATED);

      // 4. Seed Global Quest with requireDistinctCourses: true for Grace
      const graceQuest = await prisma.questInstance.create({
        data: {
          userId: graceId,
          questKey: 'grace-polymath-courseid-diversity',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          title: 'Grace Cross-Course Polymath',
          scope: 'GLOBAL',
          status: 'ACTIVE',
          config: {
            targetCount: 2,
            requireDistinctCourses: true,
          },
          objectives: {
            create: [
              {
                objectiveKey: 'complete_distinct_activities',
                targetCount: 2,
                currentCount: 0,
                isCompleted: false,
              },
            ],
          },
        },
        include: { objectives: true },
      });

      // 5. Grace completes Math Video in Math Version 1
      const mathV1Run = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', graceCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathVideoBlockId,
          idempotencyKey: `run-grace-math-v1-video-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mathV1Run.body.id}/commands`)
        .set('Cookie', graceCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-grace-math-v1-fin-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Invariant: 1st activity in Math increments progress to 1/2
      let qGrace = await prisma.questInstance.findUniqueOrThrow({
        where: { id: graceQuest.id },
        include: { objectives: true },
      });
      expect(qGrace.objectives[0].currentCount).toBe(1);

      // 6. Grace completes Math MCQ in Math Version 2 (different version, SAME courseId)
      const mathV2Run = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', graceCookie)
        .send({
          courseVersionId: mathVersion2Id,
          blockInstanceId: mathMcqPracticeBlockId,
          idempotencyKey: `run-grace-math-v2-mcq-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mathV2Run.body.id}/commands`)
        .set('Cookie', graceCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-grace-math-v2-fin-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // INVARIANT: Even though mathVersion2Id !== mathVersionId, both share courseId === mathCourseId!
      // Therefore, the second Math activity MUST NOT advance progress!
      qGrace = await prisma.questInstance.findUniqueOrThrow({
        where: { id: graceQuest.id },
        include: { objectives: true },
      });
      expect(qGrace.status).toBe('ACTIVE');
      expect(qGrace.objectives[0].currentCount).toBe(1); // STILL 1, not 2

      // 7. Grace completes English Reading MCQ in engVersionId (different courseId === engCourseId)
      const engRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', graceCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engMcqReadingBlockId,
          idempotencyKey: `run-grace-eng-mcq-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${engRun.body.id}/commands`)
        .set('Cookie', graceCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-grace-eng-fin-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // INVARIANT: Distinct courseId increments progress to 2/2 and COMPLETES the Global Quest
      qGrace = await prisma.questInstance.findUniqueOrThrow({
        where: { id: graceQuest.id },
        include: { objectives: true },
      });
      expect(qGrace.status).toBe('COMPLETED');
      expect(qGrace.objectives[0].currentCount).toBe(2);
      expect(qGrace.objectives[0].isCompleted).toBe(true);
    });

    it('revalidates course diversity limits when restoring revoked fact consumptions', async () => {
      // 1. Grant Learner Hannah access to Math v1 and English v1
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${mathCourseId}/versions/${mathVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: hannahId })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${engCourseId}/versions/${engVersionId}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: hannahId })
        .expect(HttpStatus.CREATED);

      // 2. Hannah enrolls
      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${mathVersionId}/enroll`)
        .set('Cookie', hannahCookie)
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${engVersionId}/enroll`)
        .set('Cookie', hannahCookie)
        .expect(HttpStatus.CREATED);

      // 3. Seed Global Quest with requireDistinctCourses: true for Hannah
      const hannahQuest = await prisma.questInstance.create({
        data: {
          userId: hannahId,
          questKey: 'hannah-polymath-revocation-revalidation',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          title: 'Hannah Restoration Revalidation Quest',
          scope: 'GLOBAL',
          status: 'ACTIVE',
          config: {
            targetCount: 2,
            requireDistinctCourses: true,
          },
          objectives: {
            create: [
              {
                objectiveKey: 'complete_distinct_activities',
                targetCount: 2,
                currentCount: 0,
                isCompleted: false,
              },
            ],
          },
        },
        include: { objectives: true },
      });

      // 4. Hannah completes Math Video (Fact A)
      const mathVideoRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', hannahCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathVideoBlockId,
          idempotencyKey: `run-hannah-math-video-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mathVideoRun.body.id}/commands`)
        .set('Cookie', hannahCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-hannah-math-vid-fin-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Fact A is consumed, progress = 1
      const factA = await prisma.qualifyingFact.findFirstOrThrow({
        where: { runId: mathVideoRun.body.id, factType: 'ACTIVITY_COMPLETED' },
      });
      const consumptionA = await prisma.questFactConsumption.findFirstOrThrow({
        where: { factId: factA.id, questInstanceId: hannahQuest.id },
      });
      expect(consumptionA.status).toBe('CONSUMED');

      let qHannah = await prisma.questInstance.findUniqueOrThrow({
        where: { id: hannahQuest.id },
        include: { objectives: true },
      });
      expect(qHannah.objectives[0].currentCount).toBe(1);

      // 5. Simulate revocation of Fact A (e.g., via assessment or run correction)
      await prisma.questFactConsumption.update({
        where: { id: consumptionA.id },
        data: { status: 'REVOKED' },
      });
      await prisma.questObjectiveProgress.update({
        where: { id: hannahQuest.objectives[0].id },
        data: { currentCount: 0 },
      });

      // 6. While Fact A is revoked, Hannah completes Math MCQ (Fact B, distinct block in SAME Math course)
      const mathMcqRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', hannahCookie)
        .send({
          courseVersionId: mathVersionId,
          blockInstanceId: mathMcqPracticeBlockId,
          idempotencyKey: `run-hannah-math-mcq-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mathMcqRun.body.id}/commands`)
        .set('Cookie', hannahCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-hannah-math-mcq-fin-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Fact B is consumed! Math course now has 1 active consumed activity in hannahQuest
      qHannah = await prisma.questInstance.findUniqueOrThrow({
        where: { id: hannahQuest.id },
        include: { objectives: true },
      });
      expect(qHannah.objectives[0].currentCount).toBe(1);

      // 7. Now simulate re-qualification of Fact A (calling questEngine.processFact on Fact A)
      const questEngine = app.get(QuestEngineService);
      await prisma.$transaction(async (tx) => {
        await questEngine.processFact(factA, tx);
      });

      // INVARIANT: Restoration REVALIDATES course diversity limits!
      // Math course ALREADY has Fact B consumed (1/1 allowed).
      // Therefore, revoked consumption A MUST NOT be restored to CONSUMED!
      const checkConsumptionA = await prisma.questFactConsumption.findUniqueOrThrow({
        where: { id: consumptionA.id },
      });
      expect(checkConsumptionA.status).toBe('REVOKED'); // MUST REMAIN REVOKED

      qHannah = await prisma.questInstance.findUniqueOrThrow({
        where: { id: hannahQuest.id },
        include: { objectives: true },
      });
      expect(qHannah.status).toBe('ACTIVE');
      expect(qHannah.objectives[0].currentCount).toBe(1); // MUST REMAIN 1, not 2

      // 8. Hannah completes English Reading MCQ (different course)
      const engRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', hannahCookie)
        .send({
          courseVersionId: engVersionId,
          blockInstanceId: engMcqReadingBlockId,
          idempotencyKey: `run-hannah-eng-mcq-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${engRun.body.id}/commands`)
        .set('Cookie', hannahCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-hannah-eng-fin-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Fact C from English course IS consumed, completing the quest
      qHannah = await prisma.questInstance.findUniqueOrThrow({
        where: { id: hannahQuest.id },
        include: { objectives: true },
      });
      expect(qHannah.status).toBe('COMPLETED');
      expect(qHannah.objectives[0].currentCount).toBe(2);
      expect(qHannah.objectives[0].isCompleted).toBe(true);
    });
  });

  describe('Gate 11: Assessment Correction & Two-Way Reconciliation in Both Domains', () => {
    let mathAssessmentId: string;
    let mathFactId: string;
    let engAssessmentId: string;
    let engFactId: string;

    beforeAll(async () => {
      // Find Bob's math practice assessment and qualifying fact
      const mathAttempt = await prisma.aBAttempt.findFirstOrThrow({
        where: {
          run: { userId: bobId, blockInstanceId: mathMcqPracticeBlockId },
          assisted: false,
        },
        include: { assessmentResult: true },
      });
      mathAssessmentId = mathAttempt.assessmentResult!.id;
      const mathFact = await prisma.qualifyingFact.findFirstOrThrow({
        where: { assessmentResultId: mathAssessmentId, state: 'QUALIFIED' },
      });
      mathFactId = mathFact.id;

      // Find Bob's english cloze assessment and qualifying fact
      const engAttempt = await prisma.aBAttempt.findFirstOrThrow({
        where: {
          run: { userId: bobId, blockInstanceId: engClozePracticeBlockId },
          assisted: false,
        },
        include: { assessmentResult: true },
      });
      engAssessmentId = engAttempt.assessmentResult!.id;
      const engFact = await prisma.qualifyingFact.findFirstOrThrow({
        where: { assessmentResultId: engAssessmentId, state: 'QUALIFIED' },
      });
      engFactId = engFact.id;
    });

    it('in Math: correcting assessment from correct to incorrect supercedes fact and decrements quest progress', async () => {
      // 1. Owner regrades math assessment to incorrect
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: mathAssessmentId,
          newIsCorrect: false,
          newScore: 0,
          newStatus: 'EVALUATED',
          reason: 'Ambiguous derivation spotted upon instructor review',
        })
        .expect(HttpStatus.OK);

      // 2. Fact is SUPERSEDED
      const supersededFact = await prisma.qualifyingFact.findUniqueOrThrow({
        where: { id: mathFactId },
        include: { consumptions: { include: { objectiveProgress: true } } },
      });
      expect(supersededFact.state).toBe('SUPERSEDED');
      expect(supersededFact.consumptions[0].status).toBe('REVOKED');
      expect(supersededFact.consumptions[0].objectiveProgress.currentCount).toBe(0);

      // 3. Quest reverts from COMPLETED back to ACTIVE
      const mathQuests = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${mathVersionId}/quests`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.OK);
      const mathPractice = mathQuests.body.find((q: any) => q.questKey === 'math-practice');
      expect(mathPractice.status).toBe('ACTIVE');
      expect(mathPractice.objectives[0].isCompleted).toBe(false);
    });

    it('in Math: two-way reconciliation restores fact and increments quest progress upon correction to correct', async () => {
      // 1. Owner restores assessment to correct
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: mathAssessmentId,
          newIsCorrect: true,
          newScore: 100,
          newStatus: 'EVALUATED',
          reason: 'Correction validated as correct derivation',
        })
        .expect(HttpStatus.OK);

      // 2. Fact is restored to QUALIFIED
      const restoredFact = await prisma.qualifyingFact.findUniqueOrThrow({
        where: { id: mathFactId },
        include: { consumptions: { include: { objectiveProgress: true } } },
      });
      expect(restoredFact.state).toBe('QUALIFIED');
      expect(restoredFact.consumptions[0].status).toBe('CONSUMED');
      expect(restoredFact.consumptions[0].objectiveProgress.currentCount).toBe(1);

      // 3. Quest restored to COMPLETED
      const mathQuests = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${mathVersionId}/quests`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.OK);
      const mathPractice = mathQuests.body.find((q: any) => q.questKey === 'math-practice');
      expect(mathPractice.status).toBe('COMPLETED');
      expect(mathPractice.objectives[0].isCompleted).toBe(true);
    });

    it('in English: two-way reconciliation operates identically for Cloze assessments', async () => {
      // 1. Owner marks English Cloze assessment incorrect
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: engAssessmentId,
          newIsCorrect: false,
          newScore: 0,
          newStatus: 'EVALUATED',
          reason: 'Reviewing syntax edge case',
        })
        .expect(HttpStatus.OK);

      const revokedFact = await prisma.qualifyingFact.findUniqueOrThrow({
        where: { id: engFactId },
        include: { consumptions: { include: { objectiveProgress: true } } },
      });
      expect(revokedFact.state).toBe('SUPERSEDED');
      expect(revokedFact.consumptions[0].status).toBe('REVOKED');
      expect(revokedFact.consumptions[0].objectiveProgress.currentCount).toBe(0);

      // 2. Restore English Cloze assessment to correct
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: engAssessmentId,
          newIsCorrect: true,
          newScore: 100,
          newStatus: 'EVALUATED',
          reason: 'Verified correct morphology',
        })
        .expect(HttpStatus.OK);

      const restoredFact = await prisma.qualifyingFact.findUniqueOrThrow({
        where: { id: engFactId },
        include: { consumptions: { include: { objectiveProgress: true } } },
      });
      expect(restoredFact.state).toBe('QUALIFIED');
      expect(restoredFact.consumptions[0].status).toBe('CONSUMED');
      expect(restoredFact.consumptions[0].objectiveProgress.currentCount).toBe(1);

      const engQuests = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${engVersionId}/quests`)
        .set('Cookie', bobCookie)
        .expect(HttpStatus.OK);
      const engPractice = engQuests.body.find((q: any) => q.questKey === 'eng-practice');
      expect(engPractice.status).toBe('COMPLETED');
    });
  });

  describe('Gate 12: Zero Domain Branching in Core State Models', () => {
    it('verifies canonical Prisma data models contain zero domain-specific columns or branching', () => {
      const coreModels = [
        'Course',
        'CourseVersion',
        'QuestInstance',
        'QualifyingFact',
        'ABRun',
        'AssessmentResult',
        'CourseEnrollment',
        'CourseAccessGrant',
      ];

      const domainRegex = /math|english|stem|humanities|domain_type|is_math|is_english/i;

      for (const modelName of coreModels) {
        const modelDef = Prisma.dmmf.datamodel.models.find((m) => m.name === modelName);
        expect(modelDef).toBeDefined();

        const offendingFields = modelDef!.fields.filter((f) => domainRegex.test(f.name));
        expect(offendingFields).toEqual([]);
      }
    });

    it('verifies zero domain-specific conditionals in canonical domain and engine source files', () => {
      const coreFiles = [
        'src/modules/courses/courses.service.ts',
        'src/modules/quests/quest-engine.service.ts',
        'src/modules/quests/qualification.service.ts',
        'src/modules/abp/runtime.service.ts',
        'src/modules/evidence/evidence-intake.service.ts',
      ];

      const forbiddenPatterns = [
        /\bdomain\s*===/i,
        /\.domain\s*===/i,
        /\bsubject\s*===/i,
        /\bisMath\b/i,
        /\bisEnglish\b/i,
      ];

      for (const relPath of coreFiles) {
        const fullPath = path.resolve(__dirname, '..', relPath);
        expect(fs.existsSync(fullPath)).toBe(true);
        const content = fs.readFileSync(fullPath, 'utf8');

        for (const pattern of forbiddenPatterns) {
          const match = content.match(pattern);
          expect(match).toBeNull();
        }
      }
    });
  });
});
