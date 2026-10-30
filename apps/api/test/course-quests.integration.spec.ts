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

describe('Phase 4: Course Gamification & Quests Integration Tests (PR #6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const trustedOrigin = 'http://localhost:5173';

  const userOwner = {
    email: `owner_quest_${Date.now()}@ule.internal`,
    password: 'OwnerPassword123!',
    name: 'Owner Quest Alice',
  };

  const userLearner = {
    email: `learner_quest_${Date.now()}@ule.internal`,
    password: 'LearnerPassword123!',
    name: 'Learner Quest Bob',
  };

  const userOther = {
    email: `other_quest_${Date.now()}@ule.internal`,
    password: 'OtherPassword123!',
    name: 'Other Quest Charlie',
  };

  let ownerCookie: string;
  let learnerCookie: string;
  let otherCookie: string;

  let learnerId: string;

  let courseId: string;
  let version1Id: string;
  let grantId: string;

  let videoBlockId: string;
  let mcqPractice1BlockId: string;
  let mcqPractice2BlockId: string;
  let mcqDeferredBlockId: string;
  let mcqDistinctBlockId: string;
  let skillPracticeId: string;

  let distinctActivitiesQuestId: string;
  let practiceSkillQuestId: string;

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

    // 2. Register Learner
    const learnerRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userLearner)
      .expect(HttpStatus.OK);
    learnerCookie = extractCookies(learnerRegRes);
    const learnerMe = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', learnerCookie)
      .expect(HttpStatus.OK);
    learnerId = learnerMe.body.user.id;

    // 3. Register Other
    const otherRegRes = await request(app.getHttpServer())
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', trustedOrigin)
      .send(userOther)
      .expect(HttpStatus.OK);
    otherCookie = extractCookies(otherRegRes);
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Cookie', otherCookie)
      .expect(HttpStatus.OK);

    // 4. Create Course
    const courseRes = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Cookie', ownerCookie)
      .send({
        title: 'Gamification & Quests Test Course',
        description: 'Comprehensive course for testing Phase 4 quest engine',
      })
      .expect(HttpStatus.CREATED);
    courseId = courseRes.body.course.id;

    // 5. Add Video Block (non-evaluatable)
    const videoRes = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/draft/blocks`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: 1,
        blockTypeId: 'video',
        typeVersion: '1.0.0',
        title: 'Introduction Video',
        orderIndex: 0,
        config: {
          url: 'https://cdn.ule.internal/intro.mp4',
          durationSeconds: 120,
          allowSkip: false,
        },
      })
      .expect(HttpStatus.CREATED);
    videoBlockId = videoRes.body.id;

    // 6. Define Course Skill: SKILL_PRACTICE
    const skillRes = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/skills`)
      .set('Cookie', ownerCookie)
      .send({
        skillCode: 'SKILL_PRACTICE',
        name: 'Practice Reasoning Skill',
        description: 'Target skill for testing independent practice quest milestone',
      })
      .expect(HttpStatus.CREATED);
    skillPracticeId = skillRes.body.id;

    // 7. Add MCQ Practice Block 1 (immediate feedback, evaluatable)
    const mcq1Res = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/draft/blocks`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: 2,
        blockTypeId: 'multiple-choice',
        typeVersion: '1.0.0',
        title: 'Practice Quiz 1',
        orderIndex: 1,
        config: {
          question: 'What is 2 + 2?',
          options: [
            { id: 'opt_a', text: '3' },
            { id: 'opt_b', text: '4' },
          ],
          answerKey: {
            correctOptionId: 'opt_b',
            explanation: '2 + 2 equals 4.',
          },
          hintText: 'Think of basic addition',
          allowHints: true,
          feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
        },
      })
      .expect(HttpStatus.CREATED);
    mcqPractice1BlockId = mcq1Res.body.id;

    // Map MCQ 1 to SKILL_PRACTICE
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/draft/skill-mappings`)
      .set('Cookie', ownerCookie)
      .send({
        blockInstanceId: mcqPractice1BlockId,
        skillId: skillPracticeId,
        criterion: 'CORRECT_RESPONSE',
        weight: 1.0,
        expectedRevision: 3,
      })
      .expect(HttpStatus.OK);

    // 8. Add MCQ Practice Block 2 (immediate feedback, evaluatable)
    const mcq2Res = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/draft/blocks`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: 4,
        blockTypeId: 'multiple-choice',
        typeVersion: '1.0.0',
        title: 'Practice Quiz 2',
        orderIndex: 2,
        config: {
          question: 'What is 5 + 5?',
          options: [
            { id: 'opt_a', text: '10' },
            { id: 'opt_b', text: '9' },
          ],
          answerKey: {
            correctOptionId: 'opt_a',
            explanation: '5 + 5 equals 10.',
          },
          feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
        },
      })
      .expect(HttpStatus.CREATED);
    mcqPractice2BlockId = mcq2Res.body.id;

    // Map MCQ 2 to SKILL_PRACTICE
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/draft/skill-mappings`)
      .set('Cookie', ownerCookie)
      .send({
        blockInstanceId: mcqPractice2BlockId,
        skillId: skillPracticeId,
        criterion: 'CORRECT_RESPONSE',
        weight: 1.0,
        expectedRevision: 5,
      })
      .expect(HttpStatus.OK);

    // 9. Add MCQ Deferred Block
    const mcqDefRes = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/draft/blocks`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: 6,
        blockTypeId: 'multiple-choice',
        typeVersion: '1.0.0',
        title: 'Deferred Feedback Assessment',
        orderIndex: 3,
        config: {
          question: 'Is testing essential for learning platforms?',
          options: [
            { id: 'opt_yes', text: 'Yes' },
            { id: 'opt_no', text: 'No' },
          ],
          answerKey: {
            correctOptionId: 'opt_yes',
            explanation: 'Testing is essential.',
          },
          feedbackPolicy: 'DEFERRED',
        },
      })
      .expect(HttpStatus.CREATED);
    mcqDeferredBlockId = mcqDefRes.body.id;

    // Map Deferred MCQ to SKILL_PRACTICE
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/draft/skill-mappings`)
      .set('Cookie', ownerCookie)
      .send({
        blockInstanceId: mcqDeferredBlockId,
        skillId: skillPracticeId,
        criterion: 'CORRECT_RESPONSE',
        weight: 1.0,
        expectedRevision: 7,
      })
      .expect(HttpStatus.OK);

    // 10. Add MCQ Distinct Block (unmapped, distinct participation content)
    const mcqDistRes = await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/draft/blocks`)
      .set('Cookie', ownerCookie)
      .send({
        expectedRevision: 8,
        blockTypeId: 'multiple-choice',
        typeVersion: '1.0.0',
        title: 'Distinct Content Block',
        orderIndex: 4,
        config: {
          question: 'What is 1 + 1?',
          options: [
            { id: 'opt_1', text: '2' },
            { id: 'opt_2', text: '3' },
          ],
          answerKey: {
            correctOptionId: 'opt_1',
            explanation: '1 + 1 equals 2.',
          },
          feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
        },
      })
      .expect(HttpStatus.CREATED);
    mcqDistinctBlockId = mcqDistRes.body.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Gate 1 & Authoring: Draft Course Quest Configuration & Optimistic Concurrency', () => {
    it('allows course owner to configure a Complete Distinct Activities course quest', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'complete-distinct-2',
          title: 'Complete 2 Distinct Activities',
          description: 'Finish any 2 distinct activities in this course.',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          config: {
            targetCount: 2,
          },
          rewardPolicy: {
            courseXp: 50,
          },
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.id).toBeDefined();
      expect(res.body.questKey).toBe('complete-distinct-2');
      expect(res.body.templateId).toBe('COMPLETE_DISTINCT_ACTIVITIES');
      expect(res.body.config.targetCount).toBe(2);
      expect(res.body.rewardPolicy.courseXp).toBe(50);
      expect(res.body.revision).toBe(1);
      distinctActivitiesQuestId = res.body.id;
    });

    it('rejects duplicate questKey in the same course draft with HTTP 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'complete-distinct-2',
          title: 'Duplicate Key Quest',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          config: { targetCount: 1 },
        })
        .expect(HttpStatus.CONFLICT);

      expect(res.body.message).toContain('already exists in this course draft');
    });

    it('rejects invalid quest template ID with HTTP 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'invalid-template-quest',
          title: 'Invalid Template',
          templateId: 'UNKNOWN_TEMPLATE',
          config: {},
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('rejects Independent Practice quest bound to non-existent skill with HTTP 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'practice-fake-skill',
          title: 'Practice Non-Existent Skill',
          templateId: 'INDEPENDENT_PRACTICE',
          config: {
            skillCode: 'NON_EXISTENT_SKILL_CODE',
            targetCount: 1,
          },
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain("Target skillCode 'NON_EXISTENT_SKILL_CODE' not found");
    });

    it('allows course owner to configure a valid Independent Practice quest', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'practice-reasoning',
          title: 'Independent Practice Milestone',
          description: 'Demonstrate independent mastery on 1 practice item.',
          templateId: 'INDEPENDENT_PRACTICE',
          config: {
            skillCode: 'SKILL_PRACTICE',
            targetCount: 1,
          },
          rewardPolicy: {
            courseXp: 100,
          },
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.id).toBeDefined();
      expect(res.body.questKey).toBe('practice-reasoning');
      expect(res.body.config.skillCode).toBe('SKILL_PRACTICE');
      practiceSkillQuestId = res.body.id;
    });

    it('rejects quest creation containing platformXp in rewardPolicy with HTTP 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'illegal-platform-xp',
          title: 'Illegal Platform Reward Quest',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          config: { targetCount: 1 },
          rewardPolicy: {
            courseXp: 10,
            platformXp: 100,
          },
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain('platform-scoped rewards (platformXp)');
    });

    it('rejects quest update containing platformXp in rewardPolicy with HTTP 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseId}/draft/quests/${practiceSkillQuestId}`)
        .set('Cookie', ownerCookie)
        .send({
          expectedRevision: 1,
          rewardPolicy: {
            platformXp: 50,
          },
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain('platform-scoped rewards (platformXp)');
    });

    it('rejects quest creation containing non-allowlisted properties in rewardPolicy (P2)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'illegal-gems',
          title: 'Illegal Reward Properties',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          config: { targetCount: 1 },
          rewardPolicy: {
            courseXp: 10,
            gems: 50,
          },
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain("Unexpected property 'gems' in course quest rewardPolicy");
    });

    it('rejects quest creation with invalid courseXp (negative or over limit) (P2)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'invalid-xp-negative',
          title: 'Negative XP Quest',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          config: { targetCount: 1 },
          rewardPolicy: { courseXp: -5 },
        })
        .expect(HttpStatus.BAD_REQUEST);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'invalid-xp-over-limit',
          title: 'Excessive XP Quest',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          config: { targetCount: 1 },
          rewardPolicy: { courseXp: 50000 },
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('rejects quest creation with invalid badgeKey format (P2)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .send({
          questKey: 'invalid-badge-format',
          title: 'Invalid Badge Quest',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          config: { targetCount: 1 },
          rewardPolicy: {
            badgeKey: 'badge with illegal spaces and @!',
          },
        })
        .expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toContain('alphanumeric identifier');
    });

    it('enforces optimistic locking on quest updates: rejects stale revision with HTTP 409', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseId}/draft/quests/${distinctActivitiesQuestId}`)
        .set('Cookie', ownerCookie)
        .send({
          expectedRevision: 999,
          title: 'Conflicting Title Update',
        })
        .expect(HttpStatus.CONFLICT);
    });

    it('updates quest successfully when expectedRevision matches', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/courses/${courseId}/draft/quests/${distinctActivitiesQuestId}`)
        .set('Cookie', ownerCookie)
        .send({
          expectedRevision: 1,
          title: 'Updated: Complete 2 Distinct Activities',
        })
        .expect(HttpStatus.OK);

      expect(res.body.title).toBe('Updated: Complete 2 Distinct Activities');
      expect(res.body.revision).toBe(2);
    });

    it('prevents non-owner User B from reading or modifying draft quests (Gate G1)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', otherCookie)
        .expect(HttpStatus.NOT_FOUND);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', otherCookie)
        .send({
          questKey: 'unauthorized-quest',
          title: 'Unauthorized Quest',
          templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
          config: { targetCount: 1 },
        })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('Immutable Version Snapshotting: CourseVersion Quest Snapshot', () => {
    it('creates CourseVersion v1 and freezes quest definitions into snapshot.quests', async () => {
      const versionRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.CREATED);

      version1Id = versionRes.body.id;
      expect(versionRes.body.versionNumber).toBe(1);

      const dbVersion = await prisma.courseVersion.findUniqueOrThrow({
        where: { id: version1Id },
      });

      const snapshot = dbVersion.snapshot as any;
      expect(snapshot.quests).toBeDefined();
      expect(snapshot.quests.length).toBe(2);

      const questKeys = snapshot.quests.map((q: any) => q.questKey);
      expect(questKeys).toContain('complete-distinct-2');
      expect(questKeys).toContain('practice-reasoning');
    });

    it('preserves historical snapshot when draft quests are mutated afterward', async () => {
      // Delete one quest from the active draft
      await request(app.getHttpServer())
        .delete(`/api/v1/courses/${courseId}/draft/quests/${practiceSkillQuestId}?expectedRevision=1`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.OK);

      // Verify the draft only has 1 quest now
      const draftQuests = await request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId}/draft/quests`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.OK);
      expect(draftQuests.body.length).toBe(1);

      // Verify CourseVersion 1 still contains both pinned quests
      const dbVersion = await prisma.courseVersion.findUniqueOrThrow({
        where: { id: version1Id },
      });
      const snapshot = dbVersion.snapshot as any;
      expect(snapshot.quests.length).toBe(2);
    });
  });

  describe('Gate 1: Learner Enrollment & Access Grant Authorization', () => {
    it('denies enrollment if learner does not possess an ACTIVE CourseAccessGrant (HTTP 403)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${version1Id}/enroll`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.message).toContain('Course access grant has been revoked or is not active');
    });

    it('allows learner to enroll after owner issues an ACTIVE CourseAccessGrant', async () => {
      // 1. Owner issues grant
      const grantRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions/${version1Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: learnerId })
        .expect(HttpStatus.CREATED);
      grantId = grantRes.body.id;

      // 2. Learner enrolls
      const enrollRes = await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${version1Id}/enroll`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.CREATED);

      expect(enrollRes.body.enrollment).toBeDefined();
      expect(enrollRes.body.enrollment.userId).toBe(learnerId);
      expect(enrollRes.body.enrollment.status).toBe('ACTIVE');

      // 3. Verifies initialized QuestInstances
      expect(enrollRes.body.quests).toBeDefined();
      expect(enrollRes.body.quests.length).toBe(2);

      const distinctQuest = enrollRes.body.quests.find((q: any) => q.questKey === 'complete-distinct-2');
      expect(distinctQuest).toBeDefined();
      expect(distinctQuest.status).toBe('ACTIVE');
      expect(distinctQuest.objectives[0].targetCount).toBe(2);
      expect(distinctQuest.objectives[0].currentCount).toBe(0);
      expect(distinctQuest.objectives[0].isCompleted).toBe(false);

      const practiceQuest = enrollRes.body.quests.find((q: any) => q.questKey === 'practice-reasoning');
      expect(practiceQuest).toBeDefined();
      expect(practiceQuest.status).toBe('ACTIVE');
      expect(practiceQuest.objectives[0].targetCount).toBe(1);
      expect(practiceQuest.objectives[0].currentCount).toBe(0);
    });

    it('returns existing enrollment idempotently on duplicate enroll request', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${version1Id}/enroll`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.CREATED);

      expect(res.body.quests.length).toBe(2);
    });

    it('allows learner to retrieve current enrollment via GET /enrollment', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/enrollment`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      expect(res.body.userId).toBe(learnerId);
      expect(res.body.status).toBe('ACTIVE');
    });

    it('allows learner to retrieve quest list via GET /quests', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      expect(res.body.length).toBe(2);
    });

    it('isolates learners: User Other cannot inspect or progress Learner Bob quests', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', otherCookie)
        .expect(HttpStatus.OK);

      expect(res.body.length).toBe(0);
    });
  });

  describe('Gate 2 & Gate 3: Complete Distinct Activities Quest (Participation)', () => {
    let videoRunId: string;

    it('completing Video activity increments Complete Distinct Activities quest progress by 1', async () => {
      // 1. Start Video Run
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: `run-video-finish-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      videoRunId = startRes.body.id;

      // 2. Finish Video Run
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${videoRunId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-finish-video-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Inspect Quest Progress
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const distinctQuest = questsRes.body.find((q: any) => q.questKey === 'complete-distinct-2');
      expect(distinctQuest.objectives[0].currentCount).toBe(1);
      expect(distinctQuest.objectives[0].isCompleted).toBe(false);
      expect(distinctQuest.status).toBe('ACTIVE');
    });

    it('replay idempotency: replaying FINISH with same idempotency key does not duplicate quest progress', async () => {
      const duplicateKey = `cmd-finish-replay-dup-${Date.now()}`;

      // Start another video run
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: `run-video-dup-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);

      // Finish once
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${startRes.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: duplicateKey,
        })
        .expect(HttpStatus.OK);

      // Finish replay
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${startRes.body.id}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: duplicateKey,
        })
        .expect(HttpStatus.OK);

      // Inspect Quest Progress
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const distinctQuest = questsRes.body.find((q: any) => q.questKey === 'complete-distinct-2');
      expect(distinctQuest.status).toBe('ACTIVE');
    });

    it('completing a second distinct activity completes the Complete Distinct Activities quest exactly once', async () => {
      // Start and complete MCQ Distinct Block (unmapped to skill, distinct activity)
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: mcqDistinctBlockId,
          idempotencyKey: `run-mcqdist-finish-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const distRunId = startRes.body.id;

      // Submit response
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${distRunId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_1' },
          idempotencyKey: `cmd-sub-mcqdist-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Finish run
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${distRunId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-finish-mcqdist-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Verify quest is now COMPLETED
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const distinctQuest = questsRes.body.find((q: any) => q.questKey === 'complete-distinct-2');
      expect(distinctQuest.objectives[0].currentCount).toBe(2);
      expect(distinctQuest.objectives[0].isCompleted).toBe(true);
      expect(distinctQuest.status).toBe('COMPLETED');
      expect(distinctQuest.completedAt).toBeDefined();
    });
  });

  describe('Gate 2 & Gate 3: Independent Practice Milestone Quest', () => {
    it('video completion NEVER qualifies for Independent Practice quest (learning science invariant)', async () => {
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const practiceQuest = questsRes.body.find((q: any) => q.questKey === 'practice-reasoning');
      expect(practiceQuest.objectives[0].currentCount).toBe(0);
      expect(practiceQuest.status).toBe('ACTIVE');
    });

    it('assisted MCQ attempt (server hint delivered) NEVER qualifies for Independent Practice quest', async () => {
      // 1. Start MCQ 1 Run
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: mcqPractice1BlockId,
          idempotencyKey: `run-assisted-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = startRes.body.id;

      // 2. Request hint (server records assistance provenance)
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'REQUEST_HINT',
          idempotencyKey: `cmd-hint-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Submit correct answer
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_b' },
          idempotencyKey: `cmd-sub-assisted-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 4. Verify practice quest was NOT credited
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const practiceQuest = questsRes.body.find((q: any) => q.questKey === 'practice-reasoning');
      expect(practiceQuest.objectives[0].currentCount).toBe(0);
      expect(practiceQuest.status).toBe('ACTIVE');
    });

    it('unassisted correct attempt on fresh item qualifies and completes Independent Practice quest', async () => {
      // 1. Start fresh MCQ Run on mcqPractice2BlockId (first attempt on this skill item)
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: mcqPractice2BlockId,
          idempotencyKey: `run-unassisted-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = startRes.body.id;

      // 2. Submit correct answer directly without hints
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_a' },
          idempotencyKey: `cmd-sub-clean-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Verify practice quest is now credited and completed
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      const practiceQuest = questsRes.body.find((q: any) => q.questKey === 'practice-reasoning');
      expect(practiceQuest.objectives[0].currentCount).toBe(1);
      expect(practiceQuest.objectives[0].isCompleted).toBe(true);
      expect(practiceQuest.status).toBe('COMPLETED');
      expect(practiceQuest.completedAt).toBeDefined();
    });
  });

  describe('Gate 2: Deferred Feedback Leak Prevention', () => {
    it('under DEFERRED feedback policy, active attempt does not leak correctness through quest progress', async () => {
      // 1. Start Deferred Run
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: mcqDeferredBlockId,
          idempotencyKey: `run-def-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = startRes.body.id;

      // 2. Submit correct response while run is ACTIVE
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_yes' },
          idempotencyKey: `cmd-sub-def-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Check qualifying facts in database: zero facts emitted while run is unreleased/active
      const facts = await prisma.qualifyingFact.findMany({
        where: {
          runId,
          factType: 'INDEPENDENT_PRACTICE_CONFIRMED',
        },
      });
      expect(facts.length).toBe(0);

      // 4. Suspend run
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${runId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUSPEND',
          idempotencyKey: `cmd-sus-def-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      const factsAfterSuspend = await prisma.qualifyingFact.findMany({
        where: { runId, factType: 'INDEPENDENT_PRACTICE_CONFIRMED' },
      });
      expect(factsAfterSuspend.length).toBe(0);
    });

    it('abandoning a deferred run NEVER releases hidden correctness or qualifies quest', async () => {
      // 1. Start a new run on mcqDeferredBlockId
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: mcqDeferredBlockId,
          idempotencyKey: `run-def-abandon-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const defRunId = startRes.body.id;

      // 2. Submit response
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${defRunId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_yes' },
          idempotencyKey: `cmd-sub-abandon-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Abandon run
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${defRunId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'ABANDON',
          idempotencyKey: `cmd-abandon-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 4. Verify no fact is created for ABANDONED run
      const facts = await prisma.qualifyingFact.findMany({
        where: { runId: defRunId },
      });
      expect(facts.length).toBe(0);
    });

    it('finishing a deferred run reconciles and qualifies quest upon CLOSED COMPLETED', async () => {
      // 1. Start another run on mcqDeferredBlockId
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: mcqDeferredBlockId,
          idempotencyKey: `run-def-finish-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const defRunId = startRes.body.id;

      // 2. Submit response
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${defRunId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_yes' },
          idempotencyKey: `cmd-sub-deffinish-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 3. Finish run
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${defRunId}/commands`)
        .set('Cookie', learnerCookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-finish-deffinish-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 4. Verify activity completion fact and independent practice fact are qualified upon close
      const facts = await prisma.qualifyingFact.findMany({
        where: { runId: defRunId },
      });
      expect(facts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('P1: Assessment Correction Reconciliation Lifecycle', () => {
    let targetAssessmentResultId: string;
    let targetFactId: string;
    let initialCount: number;

    it('correcting an assessment from correct to incorrect supercedes fact and decrements quest progress', async () => {
      // 1. Locate an existing QUALIFIED fact for independent practice
      const fact = await prisma.qualifyingFact.findFirst({
        where: {
          userId: learnerId,
          factType: 'INDEPENDENT_PRACTICE_CONFIRMED',
          state: 'QUALIFIED',
          assessmentResultId: { not: null },
        },
        include: {
          consumptions: {
            include: { objectiveProgress: true },
          },
        },
      });

      if (!fact || !fact.assessmentResultId) {
        throw new Error('Expected at least one qualified practice fact with assessmentResultId.');
      }

      targetAssessmentResultId = fact.assessmentResultId;
      targetFactId = fact.id;
      initialCount = fact.consumptions[0]?.objectiveProgress?.currentCount ?? 1;

      // 2. Course owner issues assessment correction to false
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: targetAssessmentResultId,
          newIsCorrect: false,
          newScore: 0,
          newStatus: 'FAILED',
          reason: 'Manual re-grading audit found learner error',
        })
        .expect(HttpStatus.OK);

      // 3. Verify fact state is SUPERSEDED in database
      const updatedFact = await prisma.qualifyingFact.findUniqueOrThrow({
        where: { id: targetFactId },
        include: { consumptions: { include: { objectiveProgress: true } } },
      });
      expect(updatedFact.state).toBe('SUPERSEDED');

      // 4. Verify fact consumption is REVOKED
      expect(updatedFact.consumptions[0].status).toBe('REVOKED');

      // 5. Verify quest progress was decremented
      expect(updatedFact.consumptions[0].objectiveProgress.currentCount).toBe(
        Math.max(0, initialCount - 1),
      );
    });

    it('two-way reconciliation: correcting assessment back to correct restores fact and increments quest progress', async () => {
      // Course owner regrades back to correct
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: targetAssessmentResultId,
          newIsCorrect: true,
          newScore: 100,
          newStatus: 'EVALUATED',
          reason: 'Instructor confirmed correct answer after student appeal',
        })
        .expect(HttpStatus.OK);

      // Verify fact state is restored to QUALIFIED
      const restoredFact = await prisma.qualifyingFact.findUniqueOrThrow({
        where: { id: targetFactId },
        include: { consumptions: { include: { objectiveProgress: true } } },
      });
      expect(restoredFact.state).toBe('QUALIFIED');

      // Verify consumption is reactivated to CONSUMED
      expect(restoredFact.consumptions[0].status).toBe('CONSUMED');

      // Verify quest progress count restored
      expect(restoredFact.consumptions[0].objectiveProgress.currentCount).toBe(initialCount);
    });

    it('correcting an assessment to PENDING (unreleased) revokes qualification even if isCorrect is true', async () => {
      // Owner sets assessment to PENDING for investigation
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: targetAssessmentResultId,
          newIsCorrect: true,
          newScore: 100,
          newStatus: 'PENDING',
          reason: 'Placed in pending review status for moderation',
        })
        .expect(HttpStatus.OK);

      // Verify fact state is SUPERSEDED because PENDING status must never qualify or leak
      const pendingFact = await prisma.qualifyingFact.findUniqueOrThrow({
        where: { id: targetFactId },
        include: { consumptions: { include: { objectiveProgress: true } } },
      });
      expect(pendingFact.state).toBe('SUPERSEDED');
      expect(pendingFact.consumptions[0].status).toBe('REVOKED');
      expect(pendingFact.consumptions[0].objectiveProgress.currentCount).toBe(
        Math.max(0, initialCount - 1),
      );

      // Restore to EVALUATED for subsequent tests
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: targetAssessmentResultId,
          newIsCorrect: true,
          newScore: 100,
          newStatus: 'EVALUATED',
          reason: 'Moderation complete: approved as evaluated',
        })
        .expect(HttpStatus.OK);
    });
  });

  describe('P1 Regression: Assessment Correction under DEFERRED Feedback Policy', () => {
    let defLearner1Cookie: string;
    let defLearner1Id: string;
    let defLearner2Cookie: string;
    let defLearner2Id: string;

    it('correction while DEFERRED run is ACTIVE does NOT qualify fact or leak quest progress', async () => {
      // 1. Register fresh learner 1
      const regRes = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-up/email')
        .set('Origin', trustedOrigin)
        .send({
          email: `def-learner-1-${Date.now()}@ule.test`,
          password: 'TestPassword123!',
          name: 'Deferred Test Learner 1',
        })
        .expect(HttpStatus.OK);
      defLearner1Cookie = extractCookies(regRes);
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', defLearner1Cookie)
        .expect(HttpStatus.OK);
      defLearner1Id = meRes.body.user.id;

      // Grant access and enroll
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions/${version1Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: defLearner1Id })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${version1Id}/enroll`)
        .set('Cookie', defLearner1Cookie)
        .expect(HttpStatus.CREATED);

      // 2. Start DEFERRED MCQ run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', defLearner1Cookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: mcqDeferredBlockId,
          idempotencyKey: `run-def-active-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const activeRunId = runRes.body.id;

      // 3. Submit incorrect response
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${activeRunId}/commands`)
        .set('Cookie', defLearner1Cookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_no' },
          idempotencyKey: `cmd-sub-def-active-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Verify assessment exists
      const assessment = await prisma.assessmentResult.findFirstOrThrow({
        where: { runId: activeRunId },
      });

      // 4. Owner corrects assessment to EVALUATED / isCorrect: true while run is still ACTIVE
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: assessment.id,
          newIsCorrect: true,
          newScore: 100,
          newStatus: 'EVALUATED',
          reason: 'Instructor early correction on active deferred run',
        })
        .expect(HttpStatus.OK);

      // 5. Invariant check: NO QualifyingFact is QUALIFIED because DEFERRED feedback is withheld
      const facts = await prisma.qualifyingFact.findMany({
        where: { assessmentResultId: assessment.id, state: 'QUALIFIED' },
      });
      expect(facts.length).toBe(0);

      // 6. Invariant check: Learner-facing quest progress is 0 (NO correctness leak)
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', defLearner1Cookie)
        .expect(HttpStatus.OK);
      const practiceQuest = questsRes.body.find((q: any) => q.templateId === 'INDEPENDENT_PRACTICE');
      expect(practiceQuest.status).toBe('ACTIVE');
      expect(practiceQuest.objectives[0].currentCount).toBe(0);

      // 7. Test SUSPENDED state: Learner suspends the run
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${activeRunId}/commands`)
        .set('Cookie', defLearner1Cookie)
        .send({
          command: 'SUSPEND',
          idempotencyKey: `cmd-suspend-def-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Owner re-evaluates while SUSPENDED
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: assessment.id,
          newIsCorrect: true,
          newScore: 100,
          newStatus: 'EVALUATED',
          reason: 'Instructor correction while run is suspended',
        })
        .expect(HttpStatus.OK);

      // Still no qualified fact or leaked quest progress
      const factsAfterSuspend = await prisma.qualifyingFact.findMany({
        where: { assessmentResultId: assessment.id, state: 'QUALIFIED' },
      });
      expect(factsAfterSuspend.length).toBe(0);

      const questsAfterSuspend = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', defLearner1Cookie)
        .expect(HttpStatus.OK);
      const practiceQuestAfterSuspend = questsAfterSuspend.body.find((q: any) => q.templateId === 'INDEPENDENT_PRACTICE');
      expect(practiceQuestAfterSuspend.objectives[0].currentCount).toBe(0);

      // 8. Test ABANDONED state: Learner abandons the run
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${activeRunId}/commands`)
        .set('Cookie', defLearner1Cookie)
        .send({
          command: 'ABANDON',
          idempotencyKey: `cmd-abandon-def-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Owner issues correction on abandoned run
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: assessment.id,
          newIsCorrect: true,
          newScore: 100,
          newStatus: 'EVALUATED',
          reason: 'Correction on abandoned run',
        })
        .expect(HttpStatus.OK);

      // Invariant: ABANDONED run NEVER qualifies or leaks
      const factsAfterAbandon = await prisma.qualifyingFact.findMany({
        where: { assessmentResultId: assessment.id, state: 'QUALIFIED' },
      });
      expect(factsAfterAbandon.length).toBe(0);

      const questsAfterAbandon = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', defLearner1Cookie)
        .expect(HttpStatus.OK);
      const practiceQuestAfterAbandon = questsAfterAbandon.body.find((q: any) => q.templateId === 'INDEPENDENT_PRACTICE');
      expect(practiceQuestAfterAbandon.objectives[0].currentCount).toBe(0);
    });

    it('correction on CLOSED COMPLETED deferred run qualifies fact and updates quest progress with two-way reconciliation', async () => {
      // 1. Register fresh learner 2
      const regRes = await request(app.getHttpServer())
        .post('/api/v1/auth/sign-up/email')
        .set('Origin', trustedOrigin)
        .send({
          email: `def-learner-2-${Date.now()}@ule.test`,
          password: 'TestPassword123!',
          name: 'Deferred Test Learner 2',
        })
        .expect(HttpStatus.OK);
      defLearner2Cookie = extractCookies(regRes);
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Cookie', defLearner2Cookie)
        .expect(HttpStatus.OK);
      defLearner2Id = meRes.body.user.id;

      // Grant access and enroll
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions/${version1Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: defLearner2Id })
        .expect(HttpStatus.CREATED);

      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${version1Id}/enroll`)
        .set('Cookie', defLearner2Cookie)
        .expect(HttpStatus.CREATED);

      // 2. Start DEFERRED MCQ run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', defLearner2Cookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: mcqDeferredBlockId,
          idempotencyKey: `run-def-completed-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const defRunId = runRes.body.id;

      // 3. Submit incorrect response
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${defRunId}/commands`)
        .set('Cookie', defLearner2Cookie)
        .send({
          command: 'SUBMIT_RESPONSE',
          payload: { selectedOptionId: 'opt_no' },
          idempotencyKey: `cmd-sub-def-comp-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // 4. Finish run (CLOSED COMPLETED)
      await request(app.getHttpServer())
        .post(`/api/v1/runs/${defRunId}/commands`)
        .set('Cookie', defLearner2Cookie)
        .send({
          command: 'FINISH',
          idempotencyKey: `cmd-fin-def-comp-${Date.now()}`,
        })
        .expect(HttpStatus.OK);

      // Verify quest progress is 0 because answer was incorrect
      const questsBeforeCorr = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', defLearner2Cookie)
        .expect(HttpStatus.OK);
      const practiceBefore = questsBeforeCorr.body.find((q: any) => q.templateId === 'INDEPENDENT_PRACTICE');
      expect(practiceBefore.status).toBe('ACTIVE');
      expect(practiceBefore.objectives[0].currentCount).toBe(0);

      // 5. Owner corrects assessment to EVALUATED / isCorrect: true on this CLOSED COMPLETED run
      const assessment = await prisma.assessmentResult.findFirstOrThrow({
        where: { runId: defRunId },
      });

      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: assessment.id,
          newIsCorrect: true,
          newScore: 100,
          newStatus: 'EVALUATED',
          reason: 'Post-completion regrade: appeal accepted',
        })
        .expect(HttpStatus.OK);

      // 6. Because run is CLOSED COMPLETED, the fact QUALIFIES
      const fact = await prisma.qualifyingFact.findFirstOrThrow({
        where: { assessmentResultId: assessment.id, state: 'QUALIFIED' },
      });
      expect(fact.state).toBe('QUALIFIED');

      // 7. Quest progress increments and quest reaches COMPLETED
      const questsAfterCorr = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', defLearner2Cookie)
        .expect(HttpStatus.OK);
      const practiceAfter = questsAfterCorr.body.find((q: any) => q.templateId === 'INDEPENDENT_PRACTICE');
      expect(practiceAfter.status).toBe('COMPLETED');
      expect(practiceAfter.objectives[0].currentCount).toBe(1);

      // 8. Reverse: Owner corrects to FAILED / isCorrect: false
      await request(app.getHttpServer())
        .post('/api/v1/evaluations/correct')
        .set('Cookie', ownerCookie)
        .send({
          assessmentResultId: assessment.id,
          newIsCorrect: false,
          newScore: 0,
          newStatus: 'FAILED',
          reason: 'Audit reversal: found misconduct',
        })
        .expect(HttpStatus.OK);

      // Fact is SUPERSEDED, quest progress decremented to 0, status reverted to ACTIVE
      const factRevoked = await prisma.qualifyingFact.findFirstOrThrow({
        where: { id: fact.id },
      });
      expect(factRevoked.state).toBe('SUPERSEDED');

      const questsAfterRevoke = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', defLearner2Cookie)
        .expect(HttpStatus.OK);
      const practiceAfterRevoke = questsAfterRevoke.body.find((q: any) => q.templateId === 'INDEPENDENT_PRACTICE');
      expect(practiceAfterRevoke.status).toBe('ACTIVE');
      expect(practiceAfterRevoke.objectives[0].currentCount).toBe(0);
    });
  });

  describe('P1 & Gate 1: Strict Concurrency & Deadlock Freedom', () => {
    it('concurrent grant revocation and run command execution serialize cleanly without deadlock', async () => {
      // Re-activate grant for learner first
      const grantRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions/${version1Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: learnerId })
        .expect(HttpStatus.CREATED);

      const activeGrantId = grantRes.body.id;

      // Start a run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: `run-conc-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // Concurrently execute: Owner revokes grant, Learner sends SUSPEND
      const [revokeResult, cmdResult] = await Promise.all([
        request(app.getHttpServer())
          .delete(`/api/v1/courses/${courseId}/versions/${version1Id}/grants/${activeGrantId}`)
          .set('Cookie', ownerCookie),
        request(app.getHttpServer())
          .post(`/api/v1/runs/${runId}/commands`)
          .set('Cookie', learnerCookie)
          .send({
            command: 'SUSPEND',
            idempotencyKey: `cmd-sus-conc-${Date.now()}`,
          }),
      ]);

      // Both must return valid HTTP status (no 500 deadlock / 40P01)
      expect(revokeResult.status).toBe(HttpStatus.OK);
      expect([HttpStatus.OK, HttpStatus.FORBIDDEN]).toContain(cmdResult.status);
    });

    it('concurrent grant revocation and FINISH execution serialize cleanly through Quest Engine', async () => {
      // 1. Re-activate grant for learner
      const grantRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions/${version1Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: learnerId })
        .expect(HttpStatus.CREATED);

      const activeGrantId = grantRes.body.id;

      // 2. Start Video Run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: `run-conc-finish-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // 3. Concurrently execute: Owner revokes grant, Learner calls FINISH (goes through Qualification & QuestEngine)
      const [revokeResult, finishResult] = await Promise.all([
        request(app.getHttpServer())
          .delete(`/api/v1/courses/${courseId}/versions/${version1Id}/grants/${activeGrantId}`)
          .set('Cookie', ownerCookie),
        request(app.getHttpServer())
          .post(`/api/v1/runs/${runId}/commands`)
          .set('Cookie', learnerCookie)
          .send({
            command: 'FINISH',
            idempotencyKey: `cmd-fin-conc-${Date.now()}`,
          }),
      ]);

      expect(revokeResult.status).toBe(HttpStatus.OK);
      expect([HttpStatus.OK, HttpStatus.FORBIDDEN]).toContain(finishResult.status);
    });

    it('concurrent grant revocation and SUBMIT_RESPONSE execution serialize cleanly through Quest Engine', async () => {
      // 1. Re-activate grant for learner
      const grantRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/versions/${version1Id}/grants`)
        .set('Cookie', ownerCookie)
        .send({ userId: learnerId })
        .expect(HttpStatus.CREATED);

      const activeGrantId = grantRes.body.id;

      // 2. Start MCQ Distinct Run
      const runRes = await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: mcqDistinctBlockId,
          idempotencyKey: `run-conc-sub-${Date.now()}`,
        })
        .expect(HttpStatus.CREATED);
      const runId = runRes.body.id;

      // 3. Concurrently execute: Owner revokes grant, Learner submits response
      const [revokeResult, subResult] = await Promise.all([
        request(app.getHttpServer())
          .delete(`/api/v1/courses/${courseId}/versions/${version1Id}/grants/${activeGrantId}`)
          .set('Cookie', ownerCookie),
        request(app.getHttpServer())
          .post(`/api/v1/runs/${runId}/commands`)
          .set('Cookie', learnerCookie)
          .send({
            command: 'SUBMIT_RESPONSE',
            payload: { selectedOptionId: 'opt_1' },
            idempotencyKey: `cmd-sub-conc-${Date.now()}`,
          }),
      ]);

      expect(revokeResult.status).toBe(HttpStatus.OK);
      expect([HttpStatus.OK, HttpStatus.FORBIDDEN]).toContain(subResult.status);
    });
  });

  describe('Gate 1: Access Grant Revocation Concurrency Gate', () => {
    it('revoking access grant immediately blocks learner from starting runs or re-enrolling (HTTP 403)', async () => {
      // 1. Owner revokes grant
      await request(app.getHttpServer())
        .delete(`/api/v1/courses/${courseId}/versions/${version1Id}/grants/${grantId}`)
        .set('Cookie', ownerCookie)
        .expect(HttpStatus.OK);

      // 2. Learner tries to start a new run: fails closed
      await request(app.getHttpServer())
        .post('/api/v1/runs')
        .set('Cookie', learnerCookie)
        .send({
          courseVersionId: version1Id,
          blockInstanceId: videoBlockId,
          idempotencyKey: `run-after-revoked-${Date.now()}`,
        })
        .expect(HttpStatus.NOT_FOUND);

      // 3. Learner tries to re-enroll: fails closed with 403
      await request(app.getHttpServer())
        .post(`/api/v1/learner/courses/${version1Id}/enroll`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.FORBIDDEN);

      // 4. Historical quest completion records are preserved (not erased)
      const questsRes = await request(app.getHttpServer())
        .get(`/api/v1/learner/courses/${version1Id}/quests`)
        .set('Cookie', learnerCookie)
        .expect(HttpStatus.OK);

      expect(questsRes.body.length).toBe(2);
      const completedCount = questsRes.body.filter((q: any) => q.status === 'COMPLETED').length;
      expect(completedCount).toBe(2);
      const activeCount = questsRes.body.filter((q: any) => q.status === 'ACTIVE').length;
      expect(activeCount).toBe(0);
    });
  });
});
