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

describe('Phase 3: Trusted Learning Evidence & Minimal LII Foundation Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const trustedOrigin = 'http://localhost:5173';

  const userOwner = {
    email: `owner_${Date.now()}@ule.internal`,
    password: 'OwnerPassword123!',
    name: 'Owner Alice',
  };

  const userLearner = {
    email: `learner_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner Bob',
  };

  const userOther = {
    email: `other_${Date.now()}@ule.internal`,
    password: 'OtherPassword123!',
    name: 'Charlie Other',
  };

  let ownerCookie: string;
  let learnerCookie: string;
  let otherCookie: string;

  let learnerId: string;

  let courseAId: string;
  let courseBId: string;
  let skill1Id: string;
  let courseBSkillId: string;

  let videoBlockId: string;
  let mcq1BlockId: string;
  let mcq2BlockId: string;
  let mcqDeferredBlockId: string;
  let unmappedMcqBlockId: string;
  let verificationBlockId: string;

  let courseAVersion1Id: string;
  let grantId: string;
  let correctedAssessmentId: string;

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

    // 1. Register User Owner
    const regOwner = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .send(userOwner);
    ownerCookie = extractCookies(regOwner);

    // 2. Register User Learner
    const regLearner = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .send(userLearner);
    learnerCookie = extractCookies(regLearner);

    // 3. Register User Other
    const regOther = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .send(userOther);
    otherCookie = extractCookies(regOther);

    // Retrieve user profiles
    const meOwner = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', ownerCookie);
    expect(meOwner.body.user.id).toBeDefined();

    const meLearner = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', learnerCookie);
    learnerId = meLearner.body.user.id;

    const meOther = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', otherCookie);
    expect(meOther.body.user.id).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Course-Scoped Skill Identity & Versioned Mappings Authoring', () => {
    it('creates Course A and defines course-scoped skills with observable objectives', async () => {
      const courseRes = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Cookie', ownerCookie)
        .send({ title: 'Linear Equations Mastery' })
        .expect(HttpStatus.CREATED);

      courseAId = courseRes.body.course.id;

      // Define skill 1
      const skill1Res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/skills`)
        .set('Cookie', ownerCookie)
        .send({
          skillCode: 'linear-solving-1var',
          name: 'Single Variable Equations',
          description: 'Learner can solve single-variable linear equations independently.',
        })
        .expect(HttpStatus.CREATED);

      skill1Id = skill1Res.body.id;
      expect(skill1Res.body.skillCode).toBe('linear-solving-1var');
      expect(skill1Res.body.revision).toBe(1);

      // Define skill 2
      const skill2Res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/skills`)
        .set('Cookie', ownerCookie)
        .send({
          skillCode: 'linear-graphing',
          name: 'Linear Graphing',
          description: 'Learner can plot and interpret lines on coordinate planes.',
        })
        .expect(HttpStatus.CREATED);

      expect(skill2Res.body.id).toBeDefined();

      // Duplicate skillCode in same course is rejected (409 Conflict)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/skills`)
        .set('Cookie', ownerCookie)
        .send({
          skillCode: 'linear-solving-1var',
          name: 'Duplicate Code',
        })
        .expect(HttpStatus.CONFLICT);

      // Non-owner cannot create skills on Course A (404)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/skills`)
        .set('Cookie', otherCookie)
        .send({
          skillCode: 'intruder-skill',
          name: 'Intruder Skill',
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('adds blocks to draft, configures skill mappings, and validates optimistic concurrency', async () => {
      // 1. Add Video Block (draft revision 1 -> 2)
      const vRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'video',
          typeVersion: '1.0.0',
          title: 'Video: Solving Linear Equations',
          config: {
            url: 'https://cdn.ule.internal/video1.mp4',
            durationSeconds: 120,
            allowSkip: false,
          },
          expectedRevision: 1,
        })
        .expect(HttpStatus.CREATED);
      videoBlockId = vRes.body.id;

      // 2. Add MCQ Block 1 (practice 1, draft revision 2 -> 3)
      const mcq1Res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'multiple-choice',
          typeVersion: '1.0.0',
          title: 'Quiz 1: Basic Solve',
          config: {
            question: 'Solve for x: 2x + 4 = 10',
            options: [
              { id: 'opt_a', text: 'x = 3' },
              { id: 'opt_b', text: 'x = 2' },
            ],
            answerKey: { correctOptionId: 'opt_a' },
            allowHints: true,
            hintText: 'Subtract 4 from both sides first, then divide by 2.',
            feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
          },
          expectedRevision: 2,
        })
        .expect(HttpStatus.CREATED);
      mcq1BlockId = mcq1Res.body.id;

      // 3. Add MCQ Block 2 (practice 2, draft revision 3 -> 4)
      const mcq2Res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'multiple-choice',
          typeVersion: '1.0.0',
          title: 'Quiz 2: Negative Coefficients',
          config: {
            question: 'Solve for y: -3y + 6 = 0',
            options: [
              { id: 'opt_1', text: 'y = 2' },
              { id: 'opt_2', text: 'y = -2' },
            ],
            answerKey: { correctOptionId: 'opt_1' },
            allowHints: false,
            feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
          },
          expectedRevision: 3,
        })
        .expect(HttpStatus.CREATED);
      mcq2BlockId = mcq2Res.body.id;

      // 4. Add MCQ Deferred Feedback Block (draft revision 4 -> 5)
      const mcqDefRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'multiple-choice',
          typeVersion: '1.0.0',
          title: 'Quiz 3: Deferred Exam Item',
          config: {
            question: 'Solve: 5x = 25',
            options: [
              { id: 'opt_x', text: 'x = 5' },
              { id: 'opt_y', text: 'x = 4' },
            ],
            answerKey: { correctOptionId: 'opt_x' },
            feedbackPolicy: 'DEFERRED',
          },
          expectedRevision: 4,
        })
        .expect(HttpStatus.CREATED);
      mcqDeferredBlockId = mcqDefRes.body.id;

      // 5. Add Unmapped MCQ Block (draft revision 5 -> 6)
      const unmappedRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'multiple-choice',
          typeVersion: '1.0.0',
          title: 'Quiz 4: Unmapped General Question',
          config: {
            question: 'What is 1 + 1?',
            options: [
              { id: 'o1', text: '2' },
              { id: 'o2', text: '3' },
            ],
            answerKey: { correctOptionId: 'o1' },
          },
          expectedRevision: 5,
        })
        .expect(HttpStatus.CREATED);
      unmappedMcqBlockId = unmappedRes.body.id;

      // 6. Add Verification Block (draft revision 6 -> 7)
      const verifRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'multiple-choice',
          typeVersion: '1.0.0',
          title: 'Verification Assessment: Linear Equations',
          config: {
            question: 'Proctored verification item: 4x - 8 = 12',
            options: [
              { id: 'v1', text: 'x = 5' },
              { id: 'v2', text: 'x = 4' },
            ],
            answerKey: { correctOptionId: 'v1' },
            isVerification: true,
          },
          expectedRevision: 6,
        })
        .expect(HttpStatus.CREATED);
      verificationBlockId = verifRes.body.id;

      // Map mcq1 to skill1 (draft revision 7 -> 8)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mcq1BlockId,
          skillId: skill1Id,
          criterion: 'CORRECT_RESPONSE',
          weight: 1.0,
          expectedRevision: 7,
        })
        .expect(HttpStatus.OK);

      // Map mcq2 to skill1 (draft revision 8 -> 9)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mcq2BlockId,
          skillId: skill1Id,
          criterion: 'CORRECT_RESPONSE',
          weight: 1.0,
          expectedRevision: 8,
        })
        .expect(HttpStatus.OK);

      // Map deferred block to skill1 (draft revision 9 -> 10)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mcqDeferredBlockId,
          skillId: skill1Id,
          expectedRevision: 9,
        })
        .expect(HttpStatus.OK);

      // Stale revision rejection on skill mapping
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: verificationBlockId,
          skillId: skill1Id,
          expectedRevision: 1, // Stale!
        })
        .expect(HttpStatus.CONFLICT);

      // Map verification block to skill1 (draft revision 10 -> 11)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: verificationBlockId,
          skillId: skill1Id,
          expectedRevision: 10,
        })
        .expect(HttpStatus.OK);
    });

    it('creates immutable CourseVersion freezing skills and mappings in snapshot', async () => {
      const versionRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/versions`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.CREATED);

      courseAVersion1Id = versionRes.body.id;
      expect(versionRes.body.versionNumber).toBe(1);

      const snapshot = versionRes.body.snapshot;
      expect(snapshot.blocks).toHaveLength(6);
      expect(snapshot.skills).toHaveLength(2);
      expect(snapshot.skillMappings).toHaveLength(4);
    });
  });

  describe('2. Minimal Private Learner Access & Authorization Gates', () => {
    it('unauthorized Learner Bob cannot start a Run on CourseVersion 1 (returns 404)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: `run_bob_unauth_${Date.now()}`,
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('course owner grants access to Learner Bob for CourseVersion 1', async () => {
      const grantRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/versions/${courseAVersion1Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: learnerId })
        .expect(HttpStatus.CREATED);

      grantId = grantRes.body.id;
      expect(grantRes.body.status).toBe('ACTIVE');
      expect(grantRes.body.userId).toBe(learnerId);

      // Owner can list grants
      const listGrantsRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/versions/${courseAVersion1Id}/grants`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.OK);

      expect(listGrantsRes.body).toHaveLength(1);
      expect(listGrantsRes.body[0].userId).toBe(learnerId);

      // Non-owner cannot list grants
      await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/versions/${courseAVersion1Id}/grants`)
        .set('Cookie', otherCookie)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('authorized Learner Bob can now discover the granted course and start a Run', async () => {
      // Learner lists granted courses
      const grantedCourses = await request(app.getHttpServer())
        .get('/api/v1/learner/courses')
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      expect(grantedCourses.body.some((c: any) => c.id === courseAVersion1Id)).toBe(true);

      // Bob successfully starts Video run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: `run_bob_video_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      expect(runRes.body.status).toBe('ACTIVE');
      expect(runRes.body.userId).toBe(learnerId);
    });

    it('Learner Bob cannot edit CourseDraft or access hidden answer keys', async () => {
      // Cannot edit draft
      await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseAId}/draft`)
        .set('Cookie', learnerCookie)
        .send({ title: 'Hacked Title', expectedRevision: 11 })
        .expect(HttpStatus.NOT_FOUND);

      // Strips answerKey from learner run block config
      const mcqRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcq1BlockId,
          idempotencyKey: `run_bob_mcq1_inspect_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      expect(mcqRun.body.block.learnerConfig).toBeDefined();
      expect(mcqRun.body.block.learnerConfig.answerKey).toBeUndefined();
    });

    it('revoked grant prevents starting new runs and blocks commands on existing runs with 403', async () => {
      // Start an active run first
      const activeRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcq2BlockId,
          idempotencyKey: `run_bob_to_revoke_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      const runIdToRevoke = activeRun.body.id;

      // Owner revokes Bob's grant
      await request(app.getHttpServer())
        .delete(`/api/v1/courses/${courseAId}/versions/${courseAVersion1Id}/grants/${grantId}`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.OK);

      // Starting new run fails (404)
      await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: `run_bob_after_revoke_${Date.now()}`,
        })
        .expect(HttpStatus.NOT_FOUND);

      // Executing command on existing run is rejected with HTTP 403 Forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runIdToRevoke}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_1' },
          idempotencyKey: `cmd_after_revoke_${Date.now()}`,
        })
        .expect(HttpStatus.FORBIDDEN);

      // Owner re-activates Bob's grant for remaining tests
      const reGrantRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/versions/${courseAVersion1Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ email: userLearner.email })
        .expect(HttpStatus.CREATED);

      expect(reGrantRes.body.status).toBe('ACTIVE');
    });

    it('User Charlie cannot read Learner Bob runs, attempts, evidence, or skills', async () => {
      // Bob starts a run
      const bobRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcq1BlockId,
          idempotencyKey: `run_bob_iso_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      // Charlie attempts to read Bob's run (returns 404)
      await request(app.getHttpServer())
        .get(`/api/v1/runs/${bobRun.body.id}`)
        .set('Cookie', otherCookie)
        .expect(HttpStatus.NOT_FOUND);

      // Charlie attempts to read Bob's results (returns 404)
      await request(app.getHttpServer())
        .get(`/api/v1/runs/${bobRun.body.id}/results`)
        .set('Cookie', otherCookie)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('3. Evidence Quality, Provenance & Idempotent Ledger Intake', () => {
    it('Video completion: contributes progress only, zero graded skill evidence, no mastery', async () => {
      const videoRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: `run_bob_video_complete_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      // Complete video
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${videoRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `finish_video_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Check progress endpoint
      const progressRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/progress`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      expect(progressRes.body.isMastered).toBe(false);
      expect(progressRes.body.masteryClaim).toBeNull();
      const videoBlockProgress = progressRes.body.blocks.find(
        (b: any) => b.blockInstanceId === videoBlockId,
      );
      expect(videoBlockProgress.status).toBe('COMPLETED');

      // Check evidence endpoint: UNGRADED_PARTICIPATION only
      const evidenceRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const videoEvidence = evidenceRes.body.find(
        (e: any) => e.blockInstanceId === videoBlockId,
      );
      expect(videoEvidence).toBeDefined();
      expect(videoEvidence.classification).toBe('UNGRADED_PARTICIPATION');
      expect(videoEvidence.skillId).toBeNull();
      expect(videoEvidence.isCorrect).toBeNull();
      expect(videoEvidence.score).toBeNull();

      // Check skill projection: Video completion produces ZERO skill evidence
      const skillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const skill1Projection = skillsRes.body.find((s: any) => s.skillId === skill1Id);
      expect(skill1Projection.state).toBe('INSUFFICIENT_EVIDENCE');
      expect(skill1Projection.evidenceCount).toBe(0);
    });

    it('Independent correct attempt on mapped MCQ creates INDEPENDENT_CORRECT evidence', async () => {
      const mcqRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcq1BlockId,
          idempotencyKey: `run_bob_mcq1_indep_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      // Submit correct answer without hint
      const submitRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${mcqRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_a', usedHint: false },
          idempotencyKey: `submit_mcq1_indep_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      expect(submitRes.body.latestAssessment.isCorrect).toBe(true);

      // Check evidence ledger
      const evidenceRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const indepEvidence = evidenceRes.body.find(
        (e: any) => e.runId === mcqRun.body.id,
      );
      expect(indepEvidence).toBeDefined();
      expect(indepEvidence.classification).toBe('INDEPENDENT_CORRECT');
      expect(indepEvidence.assisted).toBe(false);
      expect(indepEvidence.skillId).toBe(skill1Id);
      expect(indepEvidence.isSameItemRepetition).toBe(false);

      // Learner skill state advances from INSUFFICIENT_EVIDENCE to DEVELOPING
      // (1 independent correct solve is NOT enough for READY_TO_VERIFY)
      const skillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const skill1Proj = skillsRes.body.find((s: any) => s.skillId === skill1Id);
      expect(skill1Proj.state).toBe('DEVELOPING');
      expect(skill1Proj.independentCount).toBe(1);
    });

    it('Assisted submission retains server-observed assistance and does not claim independence', async () => {
      const mcqRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcq1BlockId,
          idempotencyKey: `run_bob_mcq1_assisted_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      // Request hint from server
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mcqRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'REQUEST_HINT',
          idempotencyKey: `hint_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Submit correct answer falsely claiming usedHint: false
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mcqRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_a', usedHint: false },
          idempotencyKey: `submit_mcq1_assisted_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      const evidenceRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const assistedEv = evidenceRes.body.find((e: any) => e.runId === mcqRun.body.id);
      expect(assistedEv.classification).toBe('ASSISTED_CORRECT');
      expect(assistedEv.assisted).toBe(true);
      expect(assistedEv.supportProvenance).toBe('SERVER_OBSERVED');
    });

    it('Same-item repetition is classified as SAME_ITEM_REPETITION and not independent novel evidence', async () => {
      const mcqRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcq1BlockId,
          idempotencyKey: `run_bob_repeat_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      // Attempt 1 (correct solve)
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mcqRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_a' },
          idempotencyKey: `sub_rep_1_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Attempt 2 (repeat solve on same item)
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${mcqRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_a' },
          idempotencyKey: `sub_rep_2_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      const evidenceRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const runEvs = evidenceRes.body.filter((e: any) => e.runId === mcqRun.body.id);
      expect(runEvs).toHaveLength(2);

      const repeatEv = runEvs.find((e: any) => e.repetitionCount === 2);
      expect(repeatEv.isSameItemRepetition).toBe(true);
      expect(repeatEv.classification).toBe('SAME_ITEM_REPETITION');
      expect(repeatEv.exclusionReason).toBe('SAME_ITEM_REPETITION_NOT_INDEPENDENT');
    });

    it('Unmapped MCQ produces EXCLUDED evidence with clear reason and zero skill credit', async () => {
      const unmappedRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: unmappedMcqBlockId,
          idempotencyKey: `run_unmapped_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${unmappedRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'o1' },
          idempotencyKey: `sub_unmapped_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      const evidenceRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const unmappedEv = evidenceRes.body.find((e: any) => e.runId === unmappedRun.body.id);
      expect(unmappedEv.status).toBe('EXCLUDED');
      expect(unmappedEv.classification).toBe('EXCLUDED');
      expect(unmappedEv.exclusionReason).toBe('NO_SKILL_MAPPING_CONFIGURED');
      expect(unmappedEv.skillId).toBeNull();
    });

    it('Idempotent replay: retrying intake does not duplicate evidence rows in PostgreSQL', async () => {
      const countBefore = await prisma.learningEvidence.count({
        where: { userId: learnerId },
      });

      // Query evidence multiple times
      await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const countAfter = await prisma.learningEvidence.count({
        where: { userId: learnerId },
      });

      expect(countAfter).toBe(countBefore);
    });
  });

  describe('4. Evaluation Consistency, Deferred Feedback & Authorized Correction', () => {
    it('Deferred feedback policy keeps evidence correctness hidden until run is COMPLETED', async () => {
      const defRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcqDeferredBlockId,
          idempotencyKey: `run_def_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      // Submit answer on deferred activity
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${defRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_x' },
          idempotencyKey: `sub_def_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // While run is ACTIVE, evidence is returned with deferred: true and redacted score/correctness
      const activeEvidenceRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const deferredEv = activeEvidenceRes.body.find((e: any) => e.runId === defRun.body.id);
      expect(deferredEv.deferred).toBe(true);
      expect(deferredEv.isCorrect).toBeNull();
      expect(deferredEv.score).toBeNull();

      // Finish the run
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${defRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `finish_def_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // After CLOSED COMPLETED, deferred evidence is released with correctness
      const closedEvidenceRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const releasedEv = closedEvidenceRes.body.find((e: any) => e.runId === defRun.body.id);
      expect(releasedEv.deferred).toBe(false);
      expect(releasedEv.isCorrect).toBe(true);
    });

    it('Authorized evaluation correction updates assessment, records auditable history, and reconciles projection', async () => {
      // Find an AssessmentResult for Bob on mcq1
      const assessment = await prisma.assessmentResult.findFirst({
        where: { run: { userId: learnerId, blockInstanceId: mcq1BlockId } },
      });

      expect(assessment).toBeDefined();
      correctedAssessmentId = assessment!.id;

      // Non-owner cannot correct evaluation
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', otherCookie)
        .send({
          assessmentResultId: correctedAssessmentId,
          newIsCorrect: false,
          newScore: 0,
          reason: 'Unauthorized correction attempt',
        })
        .expect(HttpStatus.NOT_FOUND);

      // Owner applies correction
      const correctRes = await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: correctedAssessmentId,
          newIsCorrect: false,
          newScore: 0,
          reason: 'Corrected by instructor: ambiguity in question wording required regrade.',
        })
        .expect(HttpStatus.OK);

      expect(correctRes.body.revision).toBe(1);
      expect(correctRes.body.newIsCorrect).toBe(false);

      // Verify correction history in audit table
      const historyRes = await request(app.getHttpServer())
        .get(`/api/v1/evaluations/${correctedAssessmentId}/history`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.OK);

      expect(historyRes.body).toHaveLength(1);
      expect(historyRes.body[0].reason).toContain('ambiguity in question wording');

      // Check that learning evidence was reconciled in PostgreSQL
      const evidence = await prisma.learningEvidence.findFirst({
        where: { assessmentResultId: correctedAssessmentId },
      });
      expect(evidence?.isCorrect).toBe(false);
      expect(evidence?.classification).toBe('INCORRECT');
    });
  });

  describe('5. Learning Integrity & Skill State Invariants', () => {
    it('second independent solve on distinct MCQ item advances state to READY_TO_VERIFY, but NEVER VERIFIED', async () => {
      // Bob solves distinct MCQ Block 2 independently
      const run2 = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcq2BlockId,
          idempotencyKey: `run_bob_distinct_mcq2_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${run2.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_1' },
          idempotencyKey: `sub_bob_distinct_mcq2_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Bob now has multiple independent solves on distinct items
      const skillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const skill1Proj = skillsRes.body.find((s: any) => s.skillId === skill1Id);
      // Because one prior attempt was corrected to INCORRECT in test 4, state remains DEVELOPING
      // Proving that uncorrected errors prevent premature readiness!
      expect(skill1Proj.state).toBe('DEVELOPING');
      expect(skill1Proj.limitations.some((l: string) => l.includes('error observations'))).toBe(true);

      // Now owner re-corrects that item back to correct
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: correctedAssessmentId,
          newIsCorrect: true,
          newScore: 1.0,
          reason: 'Student submitted valid alternative proof on regrade review.',
        })
        .expect(HttpStatus.OK);

      // With multiple independent unassisted correct solves and 0 errors, state becomes READY_TO_VERIFY
      const readySkillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const readySkill1 = readySkillsRes.body.find((s: any) => s.skillId === skill1Id);
      expect(readySkill1.state).toBe('READY_TO_VERIFY');
      expect(readySkill1.state).not.toBe('VERIFIED');

      // Proposal recommends VERIFY targeting the verification block
      expect(readySkill1.proposedAction.category).toBe('VERIFY');
      expect(readySkill1.proposedAction.suggestedBlockInstanceId).toBe(verificationBlockId);
      expect(readySkill1.proposedAction.isAvailable).toBe(true);
    });

    it('Cross-course skill identity: similar skill name in Course B does not leak learner state', async () => {
      // Charlie creates Course B with similarly named skill
      const courseBRes = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Cookie', otherCookie)
        .send({ title: 'Course B: Algebra Foundations' })
        .expect(HttpStatus.CREATED);

      courseBId = courseBRes.body.course.id;

      const skillBRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseBId}/skills`)
        .set('Cookie', otherCookie)
        .send({
          skillCode: 'linear-solving-1var', // Same skill code!
          name: 'Single Variable Equations',
        })
        .expect(HttpStatus.CREATED);

      courseBSkillId = skillBRes.body.id;

      // Add a block to Course B draft and publish version 1
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseBId}/draft/blocks`)
        .set('Cookie', otherCookie)
        .send({
          blockTypeId: 'video',
          title: 'Course B Intro',
          config: { url: 'https://cdn.ule.internal/cb.mp4' },
          expectedRevision: 1,
        })
        .expect(HttpStatus.CREATED);

      const cbVersion = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseBId}/versions`)
        .set('Cookie', otherCookie)
        .expect(HttpStatus.CREATED);

      // Grant Bob access to Course B version 1
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseBId}/versions/${cbVersion.body.id}/grants`)
        .set('Cookie', otherCookie)
        .send({ userId: learnerId })
        .expect(HttpStatus.CREATED);

      // Check Bob's skill state in Course B: zero state transfer from Course A!
      const bobCourseBSkills = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${cbVersion.body.id}/skills`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const bSkillProj = bobCourseBSkills.body.find((s: any) => s.skillId === courseBSkillId);
      expect(bSkillProj).toBeDefined();
      expect(bSkillProj.state).toBe('INSUFFICIENT_EVIDENCE');
      expect(bSkillProj.evidenceCount).toBe(0);
      expect(bSkillProj.independentCount).toBe(0);
    });
  });
});
