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
  let otherId: string;

  let courseAId: string;
  let courseBId: string;
  let skill1Id: string;
  let skill2Id: string;
  let courseBSkillId: string;

  let videoBlockId: string;
  let mcq1BlockId: string;
  let mcqAssistedBlockId: string;
  let mcq2BlockId: string;
  let mcqDeferredBlockId: string;
  let unmappedMcqBlockId: string;
  let verificationBlockId: string;
  let multiSkillMcqBlockId: string;

  let courseAVersion1Id: string;
  let grantId: string;
  let correctedAssessmentId: string;
  let multiSkillAssessmentResultId: string;

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
    otherId = meOther.body.user.id;
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

      skill2Id = skill2Res.body.id;

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

      // 3. Add MCQ Assisted Block (practice with hint, draft revision 3 -> 4)
      const mcqAssistedRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'multiple-choice',
          typeVersion: '1.0.0',
          title: 'Quiz Hint: Assisted Solve Item',
          config: {
            question: 'Solve for z: 3z + 9 = 15',
            options: [
              { id: 'opt_h1', text: 'z = 2' },
              { id: 'opt_h2', text: 'z = 3' },
            ],
            answerKey: { correctOptionId: 'opt_h1' },
            allowHints: true,
            hintText: 'Subtract 9 from both sides first, then divide by 3.',
            feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
          },
          expectedRevision: 3,
        })
        .expect(HttpStatus.CREATED);
      mcqAssistedBlockId = mcqAssistedRes.body.id;

      // 4. Add MCQ Block 2 (practice 2, draft revision 4 -> 5)
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
          expectedRevision: 4,
        })
        .expect(HttpStatus.CREATED);
      mcq2BlockId = mcq2Res.body.id;

      // 5. Add MCQ Deferred Feedback Block (draft revision 5 -> 6)
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
          expectedRevision: 5,
        })
        .expect(HttpStatus.CREATED);
      mcqDeferredBlockId = mcqDefRes.body.id;

      // 6. Add Unmapped MCQ Block (draft revision 6 -> 7)
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
          expectedRevision: 6,
        })
        .expect(HttpStatus.CREATED);
      unmappedMcqBlockId = unmappedRes.body.id;

      // 7. Add Verification Block (draft revision 7 -> 8)
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
          expectedRevision: 7,
        })
        .expect(HttpStatus.CREATED);
      verificationBlockId = verifRes.body.id;

      // 8. Add Multi-Skill MCQ Block (draft revision 8 -> 9)
      const multiSkillRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'multiple-choice',
          typeVersion: '1.0.0',
          title: 'Quiz Multi-Skill: Graph & Solve',
          config: {
            question: 'Solve and graph line: x + y = 5',
            options: [
              { id: 'ms_1', text: '(0,5) and (5,0)' },
              { id: 'ms_2', text: '(0,0)' },
            ],
            answerKey: { correctOptionId: 'ms_1' },
          },
          expectedRevision: 8,
        })
        .expect(HttpStatus.CREATED);
      multiSkillMcqBlockId = multiSkillRes.body.id;

      // 9. Add Video Block titled "Verification Exam: Video Lecture" (draft revision 9 -> 10)
      const videoVerifRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'video',
          typeVersion: '1.0.0',
          title: 'Verification Exam: Video Lecture',
          config: {
            url: 'https://cdn.ule.internal/verif_video.mp4',
            isVerification: true,
          },
          expectedRevision: 9,
        })
        .expect(HttpStatus.CREATED);
      expect(videoVerifRes.body.id).toBeDefined();

      // Map mcq1 to skill1 (draft revision 10 -> 11)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mcq1BlockId,
          skillId: skill1Id,
          criterion: 'CORRECT_RESPONSE',
          weight: 1.0,
          expectedRevision: 10,
        })
        .expect(HttpStatus.OK);

      // Map mcqAssisted to skill1 (draft revision 11 -> 12)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mcqAssistedBlockId,
          skillId: skill1Id,
          criterion: 'CORRECT_RESPONSE',
          weight: 1.0,
          expectedRevision: 11,
        })
        .expect(HttpStatus.OK);

      // Map mcq2 to skill1 (draft revision 12 -> 13)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mcq2BlockId,
          skillId: skill1Id,
          criterion: 'CORRECT_RESPONSE',
          weight: 1.0,
          expectedRevision: 12,
        })
        .expect(HttpStatus.OK);

      // Map deferred block to skill1 (draft revision 13 -> 14)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mcqDeferredBlockId,
          skillId: skill1Id,
          expectedRevision: 13,
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

      // Map verification block to skill1 (draft revision 14 -> 15)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: verificationBlockId,
          skillId: skill1Id,
          expectedRevision: 14,
        })
        .expect(HttpStatus.OK);

      // Map multiSkill block to skill1 (draft revision 15 -> 16)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: multiSkillMcqBlockId,
          skillId: skill1Id,
          expectedRevision: 15,
        })
        .expect(HttpStatus.OK);

      // Map multiSkill block to skill2 (draft revision 16 -> 17)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: multiSkillMcqBlockId,
          skillId: skill2Id,
          expectedRevision: 16,
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
      expect(snapshot.blocks).toHaveLength(9);
      expect(snapshot.skills).toHaveLength(2);
      expect(snapshot.skillMappings).toHaveLength(7);
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
          blockInstanceId: mcqAssistedBlockId,
          idempotencyKey: `run_bob_mcq_assisted_${Date.now()}`,
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
          payload: { selectedOptionId: 'opt_h1', usedHint: false },
          idempotencyKey: `submit_mcq_assisted_${Date.now()}`,
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

      // Attempt 1 (repeat solve on same item across runs)
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

      expect(runEvs[0].isSameItemRepetition).toBe(true);
      expect(runEvs[0].classification).toBe('SAME_ITEM_REPETITION');
      expect(runEvs[0].exclusionReason).toBe('SAME_ITEM_REPETITION_NOT_INDEPENDENT');

      expect(runEvs[1].isSameItemRepetition).toBe(true);
      expect(runEvs[1].classification).toBe('SAME_ITEM_REPETITION');
      expect(runEvs[1].exclusionReason).toBe('SAME_ITEM_REPETITION_NOT_INDEPENDENT');
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

      // While run is ACTIVE, evidence is returned with deferred: true and redacted score/correctness and safe pending classification
      const activeEvidenceRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const deferredEv = activeEvidenceRes.body.find((e: any) => e.runId === defRun.body.id);
      expect(deferredEv.deferred).toBe(true);
      expect(deferredEv.isCorrect).toBeNull();
      expect(deferredEv.score).toBeNull();
      expect(deferredEv.classification).toBe('PENDING_EVALUATION');
      expect(deferredEv.status).toBe('PENDING_ASSESSMENT');
      expect(deferredEv.evaluatorId).toBeNull();

      // Skill projections while ACTIVE: deferred results are withheld and do not advance score counts
      const activeSkillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const activeSkill1 = activeSkillsRes.body.find((s: any) => s.skillId === skill1Id);
      expect(activeSkill1.reasons.some((r: string) => r.includes('deferred'))).toBe(true);
      expect(activeSkill1.proposedAction.category).toBe('CONTINUE');

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
      expect(releasedEv.classification).toBe('INDEPENDENT_CORRECT');
    });

    it('Deferred feedback is NEVER released for ABANDONED runs', async () => {
      const abandonRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcqDeferredBlockId,
          idempotencyKey: `run_abandon_def_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${abandonRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_x' },
          idempotencyKey: `sub_abandon_def_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Abandon the run
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${abandonRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'ABANDON',
          idempotencyKey: `abandon_def_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // After CLOSED ABANDONED, evidence remains withheld forever
      const evRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const abandonedEv = evRes.body.find((e: any) => e.runId === abandonRun.body.id);
      expect(abandonedEv.deferred).toBe(true);
      expect(abandonedEv.classification).toBe('PENDING_EVALUATION');
      expect(abandonedEv.isCorrect).toBeNull();
      expect(abandonedEv.score).toBeNull();

      // Also verify via run results endpoint: withheld forever
      const runResults = await request(app.getHttpServer())
        .get(`/api/v1/runs/${abandonRun.body.id}/results`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      expect(runResults.body.assessments[0].isCorrect).toBeNull();
      expect(runResults.body.assessments[0].score).toBeNull();
      expect((runResults.body.assessments[0].feedback as any).deferred).toBe(true);
      expect((runResults.body.run.latestAssessment.feedback as any).deferred).toBe(true);
      expect(runResults.body.run.latestAssessment.isCorrect).toBeNull();
      expect(runResults.body.run.latestAssessment.score).toBeNull();
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

      // Honest boundary: in Phase 3, no registered block has an authoritative verification capability.
      // Proposed action safely falls back to CONTINUE with isAvailable: false.
      expect(readySkill1.proposedAction.category).toBe('CONTINUE');
      expect(readySkill1.proposedAction.suggestedBlockInstanceId).toBeNull();
      expect(readySkill1.proposedAction.isAvailable).toBe(false);
      expect(readySkill1.proposedAction.reason).toContain('no schema-validated verification assessment capability is available');
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

  describe('6. Gate Integrity Corrections (PR #5 Review Gates)', () => {
    it('Gate 2: Two first attempts in separate Runs of the SAME MCQ do not produce two independent qualifying observations', async () => {
      // Grant Charlie access to Course A
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/versions/${courseAVersion1Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: otherId })
        .expect(HttpStatus.CREATED);

      // Charlie Run 1 on mcq1BlockId
      const charlieRun1 = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', otherCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcq1BlockId,
          idempotencyKey: `charlie_run1_mcq1_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${charlieRun1.body.id}/commands`)
        .set('Cookie', otherCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_a' },
          idempotencyKey: `charlie_sub1_mcq1_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Charlie Run 2 on the SAME mcq1BlockId
      const charlieRun2 = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', otherCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcq1BlockId,
          idempotencyKey: `charlie_run2_mcq1_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${charlieRun2.body.id}/commands`)
        .set('Cookie', otherCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_a' },
          idempotencyKey: `charlie_sub2_mcq1_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Query Charlie's skills: independentCount must be 1, repeatedCount must be 1. NOT 2!
      const charlieSkillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', otherCookie)
        .expect(HttpStatus.OK);

      const skill1 = charlieSkillsRes.body.find((s: any) => s.skillId === skill1Id);
      expect(skill1.independentCount).toBe(1);
      expect(skill1.repeatedCount).toBe(1);
      expect(skill1.state).toBe('DEVELOPING');
      expect(skill1.state).not.toBe('READY_TO_VERIFY');
    });

    it('Gate 2: Two distinct MCQs mapped to the same skill contribute distinct observations', async () => {
      // Charlie now solves mcq2BlockId (a distinct item mapped to skill1)
      const charlieRun3 = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', otherCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcq2BlockId,
          idempotencyKey: `charlie_run3_mcq2_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${charlieRun3.body.id}/commands`)
        .set('Cookie', otherCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_1' },
          idempotencyKey: `charlie_sub3_mcq2_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      const charlieSkillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', otherCookie)
        .expect(HttpStatus.OK);

      const skill1 = charlieSkillsRes.body.find((s: any) => s.skillId === skill1Id);
      // Now Charlie has 2 distinct independent solves!
      expect(skill1.independentCount).toBe(2);
      expect(skill1.repeatedCount).toBe(1);
    });

    it('Gate 2: Concurrent submissions across separate Runs cannot inflate independentCount', async () => {
      // Start two concurrent runs on mcq1BlockId for Charlie
      const [cRunA, cRunB] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/runs')
          .set('Cookie', otherCookie)
          .send({
            courseVersionId: courseAVersion1Id,
            blockInstanceId: mcq1BlockId,
            idempotencyKey: `c_conc_runA_${Date.now()}`,
          }),
        request(app.getHttpServer())
          .post('/api/v1/runs')
          .set('Cookie', otherCookie)
          .send({
            courseVersionId: courseAVersion1Id,
            blockInstanceId: mcq1BlockId,
            idempotencyKey: `c_conc_runB_${Date.now()}`,
          }),
      ]);

      // Submit concurrently across both runs
      await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/runs/${cRunA.body.id}/commands`)
          .set('Cookie', otherCookie)
          .send({
            command: 'SUBMIT_RESPONSE',
            payload: { selectedOptionId: 'opt_a' },
            idempotencyKey: `c_conc_subA_${Date.now()}`,
          }),
        request(app.getHttpServer())
          .post(`/api/v1/runs/${cRunB.body.id}/commands`)
          .set('Cookie', otherCookie)
          .send({
            command: 'SUBMIT_RESPONSE',
            payload: { selectedOptionId: 'opt_a' },
            idempotencyKey: `c_conc_subB_${Date.now()}`,
          }),
      ]);

      const charlieSkillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', otherCookie)
        .expect(HttpStatus.OK);

      const skill1 = charlieSkillsRes.body.find((s: any) => s.skillId === skill1Id);
      // independentCount CANNOT be inflated: still 2 (from distinct mcq1 + mcq2)
      expect(skill1.independentCount).toBe(2);
      expect(skill1.repeatedCount).toBeGreaterThanOrEqual(2);
    });

    it('Gate 2: Reprocessing or correcting evidence does not turn repetitions into novel items', async () => {
      // Find one of the repeated evidence records for Charlie on mcq1
      const repeatedEv = await prisma.learningEvidence.findFirst({
        where: {
          userId: otherId,
          blockInstanceId: mcq1BlockId,
          isSameItemRepetition: true,
          assessmentResultId: { not: null },
        },
      });

      expect(repeatedEv).toBeDefined();

      // Owner corrects this repeated assessment
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: repeatedEv!.assessmentResultId,
          newIsCorrect: true,
          newScore: 1.0,
          reason: 'Reprocessing correction check',
        })
        .expect(HttpStatus.OK);

      // Verify the corrected evidence record is still marked as repetition
      const updatedEv = await prisma.learningEvidence.findUnique({
        where: { id: repeatedEv!.id },
      });
      expect(updatedEv!.isSameItemRepetition).toBe(true);

      const charlieSkillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', otherCookie)
        .expect(HttpStatus.OK);

      const skill1 = charlieSkillsRes.body.find((s: any) => s.skillId === skill1Id);
      expect(skill1.independentCount).toBe(2);
    });

    it('Gate 2: A single repeated MCQ cannot cause READY_TO_VERIFY', async () => {
      // Register a brand new test learner Dave
      const userDave = {
        email: `dave_${Date.now()}@ule.internal`,
        password: 'DavePassword123!',
        name: 'Dave Learner',
      };
      const regDave = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-up/email')
        .send(userDave);
      const daveCookie = extractCookies(regDave);

      const meDave = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', daveCookie);
      const daveId = meDave.body.user.id;

      // Grant Dave access to Course A
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/versions/${courseAVersion1Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: daveId })
        .expect(HttpStatus.CREATED);

      // Dave runs mcq1BlockId three times in three separate runs, answering correctly every time
      for (let i = 1; i <= 3; i++) {
        const dRun = await request(app.getHttpServer())
          .post('/api/v1/runs')
          .set('Cookie', daveCookie)
          .send({
            courseVersionId: courseAVersion1Id,
            blockInstanceId: mcq1BlockId,
            idempotencyKey: `dave_run_${i}_${Date.now()}`,
          })
          .expect(HttpStatus.CREATED);

        await request(app.getHttpServer())
          .post(`/api/v1/runs/${dRun.body.id}/commands`)
          .set('Cookie', daveCookie)
          .send({
            command: 'SUBMIT_RESPONSE',
            payload: { selectedOptionId: 'opt_a' },
            idempotencyKey: `dave_sub_${i}_${Date.now()}`,
          })
          .expect(HttpStatus.OK);
      }

      const daveSkillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', daveCookie)
        .expect(HttpStatus.OK);

      const daveSkill1 = daveSkillsRes.body.find((s: any) => s.skillId === skill1Id);
      expect(daveSkill1.independentCount).toBe(1);
      expect(daveSkill1.repeatedCount).toBe(2);
      expect(daveSkill1.state).toBe('DEVELOPING');
      expect(daveSkill1.state).not.toBe('READY_TO_VERIFY');
      expect(daveSkill1.state).not.toBe('VERIFIED');
    });

    it('Gate 3: Single MCQ mapped to two distinct skills without criterion evaluation excludes both mappings and prevents silent evidence fabrication', async () => {
      // Bob executes multiSkillMcqBlockId (mapped to skill1 and skill2)
      const msRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: multiSkillMcqBlockId,
          idempotencyKey: `bob_run_multiskill_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      const msSubRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${msRun.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'ms_1' },
          idempotencyKey: `bob_sub_multiskill_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      multiSkillAssessmentResultId = msSubRes.body.latestAssessment.id;

      // Inspect Bob's evidence
      const evRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const msEvs = evRes.body.filter((e: any) => e.runId === msRun.body.id);
      expect(msEvs).toHaveLength(2);

      for (const ev of msEvs) {
        expect(ev.status).toBe('EXCLUDED');
        expect(ev.classification).toBe('EXCLUDED');
        expect(ev.exclusionReason).toBe('AMBIGUOUS_MULTI_SKILL_MAPPING_WITHOUT_CRITERION_EVALUATION');
        expect(ev.isCorrect).toBeNull();
        expect(ev.score).toBeNull();
      }

      // Check skill2: must NOT have received any independentCount from this ambiguous MCQ
      const bobSkillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const skill2 = bobSkillsRes.body.find((s: any) => s.skillId === skill2Id);
      expect(skill2.independentCount).toBe(0);
      expect(skill2.state).toBe('INSUFFICIENT_EVIDENCE');
    });

    it('Gate 4: Renaming or configuring a Video Block with "Verification Exam" cannot make it an eligible verification assessment', async () => {
      // Create Course C with a skill and ONLY a video block titled "Verification Exam: Advanced Skills"
      const courseCRes = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Cookie', ownerCookie)
        .send({ title: 'Course C: Video Verification Test' })
        .expect(HttpStatus.CREATED);

      const courseCId = courseCRes.body.course.id;

      const skillCRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseCId}/skills`)
        .set('Cookie', ownerCookie)
        .send({
          skillCode: 'video-test-skill',
          name: 'Video Test Skill',
        })
        .expect(HttpStatus.CREATED);

      const skillCId = skillCRes.body.id;

      // Add 2 distinct MCQs to allow learner to achieve readiness
      const mcqC1 = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseCId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'multiple-choice',
          title: 'Quiz C1',
          config: {
            question: '1+1?',
            options: [{ id: 'a', text: '2' }, { id: 'b', text: '3' }],
            answerKey: { correctOptionId: 'a' },
          },
          expectedRevision: 1,
        })
        .expect(HttpStatus.CREATED);

      const mcqC2 = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseCId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'multiple-choice',
          title: 'Quiz C2',
          config: {
            question: '2+2?',
            options: [{ id: 'a', text: '4' }, { id: 'b', text: '5' }],
            answerKey: { correctOptionId: 'a' },
          },
          expectedRevision: 2,
        })
        .expect(HttpStatus.CREATED);

      // Add a Video block explicitly titled "Verification Exam" with isVerification: true
      const videoVerif = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseCId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'video',
          title: 'Verification Exam: Advanced Skills',
          config: {
            url: 'https://cdn.ule.internal/verif.mp4',
            isVerification: true,
          },
          expectedRevision: 3,
        })
        .expect(HttpStatus.CREATED);

      expect(videoVerif.body.id).toBeDefined();

      // Map C1 and C2 to skillC
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseCId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mcqC1.body.id,
          skillId: skillCId,
          expectedRevision: 4,
        })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseCId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mcqC2.body.id,
          skillId: skillCId,
          expectedRevision: 5,
        })
        .expect(HttpStatus.OK);

      // Publish Course C version 1
      const cVersion = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseCId}/versions`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.CREATED);

      // Grant Bob access to Course C
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseCId}/versions/${cVersion.body.id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: learnerId })
        .expect(HttpStatus.CREATED);

      // Bob solves C1 and C2 independently
      const r1 = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: cVersion.body.id,
          blockInstanceId: mcqC1.body.id,
          idempotencyKey: `c_run1_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${r1.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'a' },
          idempotencyKey: `c_sub1_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      const r2 = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: cVersion.body.id,
          blockInstanceId: mcqC2.body.id,
          idempotencyKey: `c_run2_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${r2.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'a' },
          idempotencyKey: `c_sub2_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Check Bob's skill state in Course C: state is READY_TO_VERIFY (2 distinct independent solves)
      const cSkillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${cVersion.body.id}/skills`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const skillCProj = cSkillsRes.body.find((s: any) => s.skillId === skillCId);
      expect(skillCProj.state).toBe('READY_TO_VERIFY');
      expect(skillCProj.state).not.toBe('VERIFIED');

      // Crucial Gate 4 Assertion:
      // The video block titled "Verification Exam" MUST NOT be accepted as a verification assessment!
      // Proposed action MUST be CONTINUE with isAvailable: false and null suggestedBlockInstanceId!
      expect(skillCProj.proposedAction.category).toBe('CONTINUE');
      expect(skillCProj.proposedAction.isAvailable).toBe(false);
      expect(skillCProj.proposedAction.suggestedBlockInstanceId).toBeNull();
      expect(skillCProj.proposedAction.reason).toContain('no schema-validated verification assessment capability is available');
    });
  });

  describe('7. PR #5 Final Learner Confidentiality & Evidence Integrity Hardening', () => {
    it('Learner-safe CourseVersion listing eliminates snapshot/answerKey leaks, preserves owner authoring APIs, and prevents DEFERRED bypass', async () => {
      // 1. Non-owner Learner Bob calls GET /api/v1/learner/courses
      const res = await request(app.getHttpServer())
        .get('/api/v1/learner/courses')
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      expect(Array.isArray(res.body)).toBe(true);
      const courseA = res.body.find((c: any) => c.id === courseAVersion1Id);
      expect(courseA).toBeDefined();

      // SECURITY BLOCKER: Raw authoring snapshot MUST NOT be returned to learners!
      expect(courseA.snapshot).toBeUndefined();

      // Sanitized blocks array must be present for discovery and navigation
      expect(Array.isArray(courseA.blocks)).toBe(true);
      expect(courseA.blocks.length).toBeGreaterThan(0);

      // Verify each block is sanitized: answerKey, correctOptionId, undisclosed hints, option explanations are absent
      for (const block of courseA.blocks) {
        expect(block.config).toBeDefined();
        expect(block.config.answerKey).toBeUndefined();
        expect(block.config.correctOptionId).toBeUndefined();
        expect(block.config.hintText).toBeUndefined();

        if (block.blockTypeId === 'multiple-choice') {
          // Verify options array only has id and text
          expect(Array.isArray(block.config.options)).toBe(true);
          for (const opt of block.config.options) {
            expect(opt.id).toBeDefined();
            expect(opt.text).toBeDefined();
            expect(opt.explanation).toBeUndefined();
          }
        }
      }

      // 2. Learner can still discover and execute authorized Video and MCQ blocks
      const mcqBlock = courseA.blocks.find((b: any) => b.blockTypeId === 'multiple-choice');
      expect(mcqBlock).toBeDefined();
      const discoverRun = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: courseA.id,
          blockInstanceId: mcqBlock.id,
          idempotencyKey: `discover_run_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      expect(discoverRun.body.status).toBe('ACTIVE');

      // 3. Course owner Alice retains full authoring access through owner-only APIs
      const ownerVersionRes = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/versions/${courseAVersion1Id}`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.OK);

      expect(ownerVersionRes.body.snapshot).toBeDefined();
      expect(Array.isArray(ownerVersionRes.body.snapshot.blocks)).toBe(true);
      const ownerMcq = ownerVersionRes.body.snapshot.blocks.find((b: any) => b.blockTypeId === 'multiple-choice');
      expect(ownerMcq.config.answerKey).toBeDefined();
      expect(ownerMcq.config.answerKey.correctOptionId).toBeDefined();

      // 4. Non-owner Learner Bob cannot call owner-only version API (returns 404)
      await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseAId}/versions/${courseAVersion1Id}`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.NOT_FOUND);

      // 5. DEFERRED feedback cannot be bypassed: course listing does not leak deferred answer keys or evaluation
      const deferredBlock = courseA.blocks.find((b: any) => b.id === mcqDeferredBlockId);
      expect(deferredBlock).toBeDefined();
      expect(deferredBlock.config.answerKey).toBeUndefined();

      // 6. Cross-user access remains forbidden: User Charlie cannot access Bob's runs
      await request(app.getHttpServer())
        .get(`/api/v1/runs/${discoverRun.body.id}`)
        .set('Cookie', otherCookie)
        .expect(HttpStatus.NOT_FOUND);
    });

    it('Correcting an ambiguous multi-skill MCQ to newIsCorrect: true preserves EXCLUDED status and does NOT promote either skill', async () => {
      expect(multiSkillAssessmentResultId).toBeDefined();

      // Instructor Alice submits an authorized assessment correction for the multi-skill MCQ
      const correctionRes = await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: multiSkillAssessmentResultId,
          newStatus: 'EVALUATED',
          newIsCorrect: true,
          newScore: 1.0,
          reason: 'Manual instructor override on multi-skill MCQ',
        })
        .expect(HttpStatus.OK);

      expect(correctionRes.body.revision).toBe(1);
      expect(correctionRes.body.newIsCorrect).toBe(true);

      // Verify that the underlying evidence rows for this multi-skill MCQ REMAIN EXCLUDED
      const evRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const msEvs = evRes.body.filter((e: any) => e.assessmentResultId === multiSkillAssessmentResultId);
      expect(msEvs).toHaveLength(2);

      for (const ev of msEvs) {
        expect(ev.status).toBe('EXCLUDED');
        expect(ev.classification).toBe('EXCLUDED');
        expect(ev.exclusionReason).toBe('AMBIGUOUS_MULTI_SKILL_MAPPING_WITHOUT_CRITERION_EVALUATION');
        expect(ev.isCorrect).toBeNull();
        expect(ev.score).toBeNull();
      }

      // Verify Learner Bob skill projections: neither skill received independent qualifying credit
      const skillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const skill2Proj = skillsRes.body.find((s: any) => s.skillId === skill2Id);
      expect(skill2Proj.independentCount).toBe(0);
      expect(skill2Proj.state).toBe('INSUFFICIENT_EVIDENCE');
    });

    it('Valid single-skill MCQ correction updates evidence and projection appropriately', async () => {
      // Register fresh learner Eve who has not attempted any blocks yet
      const userEve = {
        email: `eve_${Date.now()}@ule.internal`,
        password: 'EvePassword123!',
        name: 'Learner Eve',
      };
      const regEve = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-up/email')
        .send(userEve);
      const eveCookie = extractCookies(regEve);
      const meEve = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', eveCookie);
      const eveId = meEve.body.user.id;

      // Alice grants Eve access to Course A
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseAId}/versions/${courseAVersion1Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: eveId })
        .expect(HttpStatus.CREATED);

      // Eve attempts mcq1BlockId with an incorrect option in her first run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', eveCookie)
        .send({
          courseVersionId: courseAVersion1Id,
          blockInstanceId: mcq1BlockId,
          idempotencyKey: `eve_run_incorrect_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/runs/${runRes.body.id}/commands`)
        .set('Cookie', eveCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_b' },
          idempotencyKey: `eve_sub_incorrect_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      const assessmentId = subRes.body.latestAssessment.id;

      // Alice applies correction for this single-skill assessment to true
      const corrRes = await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: assessmentId,
          newStatus: 'EVALUATED',
          newIsCorrect: true,
          newScore: 1.0,
          reason: 'Correction: Question wording was ambiguous, awarding full credit',
        })
        .expect(HttpStatus.OK);

      expect(corrRes.body.newIsCorrect).toBe(true);

      // Verify the evidence row for this run is updated to ACCEPTED INDEPENDENT_CORRECT
      const evRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', eveCookie)
        .expect(HttpStatus.OK);

      const correctedEv = evRes.body.find((e: any) => e.runId === runRes.body.id);
      expect(correctedEv).toBeDefined();
      expect(correctedEv.status).toBe('ACCEPTED');
      expect(correctedEv.classification).toBe('INDEPENDENT_CORRECT');
      expect(correctedEv.isCorrect).toBe(true);
      expect(correctedEv.score).toBe(1.0);
      expect(correctedEv.exclusionReason).toBeNull();

      // Verify Eve's skill projection is updated with the independent solve
      const eveSkillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/skills`)
        .set('Cookie', eveCookie)
        .expect(HttpStatus.OK);

      const eveSkillProj = eveSkillsRes.body.find((s: any) => s.skillId === skill1Id);
      expect(eveSkillProj.independentCount).toBe(1);
      expect(eveSkillProj.incorrectCount).toBe(0);
    });

    it('Replaying or retrying correction does not duplicate or inflate skill evidence', async () => {
      expect(multiSkillAssessmentResultId).toBeDefined();

      // Count evidence rows before replay
      const evBefore = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const countBefore = evBefore.body.length;

      // Alice re-applies the correction with a new revision note
      const retryRes = await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: multiSkillAssessmentResultId,
          newStatus: 'EVALUATED',
          newIsCorrect: true,
          newScore: 1.0,
          reason: 'Replay: second confirmation of regrade note',
        })
        .expect(HttpStatus.OK);

      expect(retryRes.body.revision).toBe(2);

      // Count evidence rows after replay: MUST NOT DUPLICATE
      const evAfter = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${courseAVersion1Id}/evidence`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      expect(evAfter.body.length).toBe(countBefore);
    });

    it('Creator adds isVerification: true to Multiple Choice block without authoritative contract; projection maintains honest boundary (CONTINUE, isAvailable: false)', async () => {
      // 1. Create Course D with MCQ block having config.isVerification: true
      const courseDRes = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Cookie', ownerCookie)
        .send({ title: 'Course D: Unvalidated Verification MCQ' })
        .expect(HttpStatus.CREATED);

      const courseDId = courseDRes.body.course.id;

      // Define Skill D
      const skillDRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseDId}/skills`)
        .set('Cookie', ownerCookie)
        .send({
          skillCode: 'SKILL_D',
          name: 'Skill D Competence',
          description: 'Demonstrating honest capability boundary',
        })
        .expect(HttpStatus.CREATED);

      const skillDId = skillDRes.body.id;

      // Add two MCQ blocks to Course D draft, one configured with isVerification: true
      const mcqD1 = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseDId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'multiple-choice',
          title: 'Quiz Item 1',
          orderIndex: 0,
          config: {
            question: 'What is 10 + 10?',
            options: [
              { id: 'opt_a', text: '20' },
              { id: 'opt_b', text: '30' },
            ],
            answerKey: { correctOptionId: 'opt_a' },
            feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
          },
          expectedRevision: 1,
        })
        .expect(HttpStatus.CREATED);

      const mcqD2 = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseDId}/draft/blocks`)
        .set('Cookie', ownerCookie)
        .send({
          blockTypeId: 'multiple-choice',
          title: 'Unvalidated Verification Quiz Item',
          orderIndex: 1,
          config: {
            question: 'What is 20 + 20?',
            options: [
              { id: 'opt_a', text: '40' },
              { id: 'opt_b', text: '50' },
            ],
            answerKey: { correctOptionId: 'opt_a' },
            feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
            isVerification: true, // Arbitrary creator config without authoritative verification contract
          },
          expectedRevision: 2,
        })
        .expect(HttpStatus.CREATED);

      // Map both items to skillD
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseDId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mcqD1.body.id,
          skillId: skillDId,
          expectedRevision: 3,
        })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseDId}/draft/skill-mappings`)
        .set('Cookie', ownerCookie)
        .send({
          blockInstanceId: mcqD2.body.id,
          skillId: skillDId,
          expectedRevision: 4,
        })
        .expect(HttpStatus.OK);

      // Publish Course D version 1
      const dVersion = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseDId}/versions`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.CREATED);

      // Grant Bob access to Course D
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseDId}/versions/${dVersion.body.id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: learnerId })
        .expect(HttpStatus.CREATED);

      // Bob solves item 1 independently
      const r1 = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: dVersion.body.id,
          blockInstanceId: mcqD1.body.id,
          idempotencyKey: `d_run1_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${r1.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_a' },
          idempotencyKey: `d_sub1_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Bob solves item 2 independently
      const r2 = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: dVersion.body.id,
          blockInstanceId: mcqD2.body.id,
          idempotencyKey: `d_run2_${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/runs/${r2.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_a' },
          idempotencyKey: `d_sub2_${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Check Bob's skill projection in Course D:
      const dSkillsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${dVersion.body.id}/skills`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const skillDProj = dSkillsRes.body.find((s: any) => s.skillId === skillDId);
      expect(skillDProj).toBeDefined();

      // State is READY_TO_VERIFY (2 distinct independent correct observations)
      expect(skillDProj.state).toBe('READY_TO_VERIFY');
      expect(skillDProj.state).not.toBe('VERIFIED');

      // Verify course progress confirms no mastery
      const dProg = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${dVersion.body.id}/progress`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);
      expect(dProg.body.isMastered).toBe(false);
      expect(dProg.body.masteryClaim).toBeNull();

      // CRITICAL REQUIREMENT 3 INVARIANT:
      // Even though creator added isVerification: true to MCQ item 2, MultipleChoice has no authoritative verification contract!
      // The projection MUST NOT advertise VERIFY or isAvailable: true!
      // Must return safe minimal fallback: category: CONTINUE with isAvailable: false and null suggestedBlockInstanceId!
      expect(skillDProj.proposedAction.category).toBe('CONTINUE');
      expect(skillDProj.proposedAction.isAvailable).toBe(false);
      expect(skillDProj.proposedAction.suggestedBlockInstanceId).toBeNull();
      expect(skillDProj.proposedAction.reason).toContain('no schema-validated verification assessment capability is available');
    });
  });
});
