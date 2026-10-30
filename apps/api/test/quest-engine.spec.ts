/* eslint-disable @typescript-eslint/no-explicit-any */
import { QuestEngineService } from '../src/modules/quests/quest-engine.service';
import { QuestInstance, QualifyingFact } from '@prisma/client';

describe('QuestEngineService Unit Tests', () => {
  let service: QuestEngineService;

  beforeEach(() => {
    // PrismaService is injected, mocked here for unit testing evaluateObjectiveMatch
    service = new QuestEngineService({} as any);
  });

  describe('evaluateObjectiveMatch — COMPLETE_DISTINCT_ACTIVITIES', () => {
    const baseInstance: QuestInstance = {
      id: 'inst-1',
      userId: 'user-1',
      courseEnrollmentId: 'enr-1',
      courseVersionId: 'cv-1',
      questKey: 'test-quest',
      templateId: 'COMPLETE_DISTINCT_ACTIVITIES',
      title: 'Complete Activities',
      description: null,
      scope: 'COURSE',
      status: 'ACTIVE',
      definitionRevision: 1,
      occurrence: 1,
      config: { targetCount: 2, requiredBlockInstanceIds: ['block-a', 'block-b'] },
      rewardPolicy: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const baseFact: QualifyingFact = {
      id: 'fact-1',
      sourceKey: 'fact:act_comp:run-1',
      userId: 'user-1',
      courseVersionId: 'cv-1',
      factType: 'ACTIVITY_COMPLETED',
      blockInstanceId: 'block-a',
      skillId: null,
      skillCode: null,
      runId: 'run-1',
      attemptId: null,
      assessmentResultId: null,
      evidenceId: null,
      policyVersion: '1.0.0',
      state: 'QUALIFIED',
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns true when fact matches required block and state is QUALIFIED', () => {
      const match = service.evaluateObjectiveMatch(
        baseInstance,
        'complete_distinct_activities',
        baseFact,
      );
      expect(match).toBe(true);
    });

    it('returns false when blockInstanceId is not in requiredBlockInstanceIds', () => {
      const match = service.evaluateObjectiveMatch(
        baseInstance,
        'complete_distinct_activities',
        { ...baseFact, blockInstanceId: 'block-other' },
      );
      expect(match).toBe(false);
    });

    it('returns false when factType is not ACTIVITY_COMPLETED', () => {
      const match = service.evaluateObjectiveMatch(
        baseInstance,
        'complete_distinct_activities',
        { ...baseFact, factType: 'INDEPENDENT_PRACTICE_CONFIRMED' },
      );
      expect(match).toBe(false);
    });

    it('returns false when fact state is not QUALIFIED', () => {
      const match = service.evaluateObjectiveMatch(
        baseInstance,
        'complete_distinct_activities',
        { ...baseFact, state: 'REVOKED' },
      );
      expect(match).toBe(false);
    });
  });

  describe('evaluateObjectiveMatch — INDEPENDENT_PRACTICE (Fail-Closed Verification)', () => {
    const globalPracticeInstance: QuestInstance = {
      id: 'inst-global',
      userId: 'user-1',
      courseEnrollmentId: null,
      courseVersionId: null,
      questKey: 'global-practice',
      templateId: 'INDEPENDENT_PRACTICE',
      title: 'Global Verified Practice',
      description: null,
      scope: 'GLOBAL',
      status: 'ACTIVE',
      definitionRevision: 1,
      occurrence: 1,
      config: { skillCode: 'SKILL_MATH', targetCount: 1 },
      rewardPolicy: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const coursePracticeInstance: QuestInstance = {
      ...globalPracticeInstance,
      id: 'inst-course',
      scope: 'COURSE',
      courseEnrollmentId: 'enr-1',
      courseVersionId: 'cv-1',
    };

    const basePracticeFact: QualifyingFact = {
      id: 'fact-practice',
      sourceKey: 'fact:ind_prac:att-1:SKILL_MATH',
      userId: 'user-1',
      courseVersionId: 'cv-1',
      factType: 'INDEPENDENT_PRACTICE_CONFIRMED',
      blockInstanceId: 'block-1',
      skillId: 'skill-1',
      skillCode: 'SKILL_MATH',
      runId: 'run-1',
      attemptId: 'att-1',
      assessmentResultId: 'res-1',
      evidenceId: null,
      policyVersion: '1.0.0',
      state: 'QUALIFIED',
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('rejects Global Quest when metadata is null (fail-closed)', () => {
      const match = service.evaluateObjectiveMatch(
        globalPracticeInstance,
        'independent_practice',
        { ...basePracticeFact, metadata: null },
      );
      expect(match).toBe(false);
    });

    it('rejects Global Quest when metadata is an empty object (fail-closed)', () => {
      const match = service.evaluateObjectiveMatch(
        globalPracticeInstance,
        'independent_practice',
        { ...basePracticeFact, metadata: {} },
      );
      expect(match).toBe(false);
    });

    it('rejects Global Quest when verificationLevel is non-string or unknown (fail-closed)', () => {
      expect(
        service.evaluateObjectiveMatch(
          globalPracticeInstance,
          'independent_practice',
          { ...basePracticeFact, metadata: { verificationLevel: 12345 } },
        ),
      ).toBe(false);

      expect(
        service.evaluateObjectiveMatch(
          globalPracticeInstance,
          'independent_practice',
          { ...basePracticeFact, metadata: { verificationLevel: 'PROVISIONAL_UNOFFICIAL' } },
        ),
      ).toBe(false);
    });

    it('rejects Global Quest when verificationLevel is UNVERIFIED_PRACTICE', () => {
      const match = service.evaluateObjectiveMatch(
        globalPracticeInstance,
        'independent_practice',
        {
          ...basePracticeFact,
          metadata: {
            verificationLevel: 'UNVERIFIED_PRACTICE',
            provenance: 'SERVER_OBSERVED',
          },
        },
      );
      expect(match).toBe(false);
    });

    it('rejects Global Quest when provenance is SELF_REPORTED_INDEPENDENT even if marked verified', () => {
      const match = service.evaluateObjectiveMatch(
        globalPracticeInstance,
        'independent_practice',
        {
          ...basePracticeFact,
          metadata: {
            verificationLevel: 'VERIFIED_ASSESSMENT',
            provenance: 'SELF_REPORTED_INDEPENDENT',
          },
        },
      );
      expect(match).toBe(false);
    });

    it('accepts Global Quest when metadata has VERIFIED_ASSESSMENT and trusted provenance', () => {
      const match = service.evaluateObjectiveMatch(
        globalPracticeInstance,
        'independent_practice',
        {
          ...basePracticeFact,
          metadata: {
            verificationLevel: 'VERIFIED_ASSESSMENT',
            provenance: 'SERVER_OBSERVED',
          },
        },
      );
      expect(match).toBe(true);
    });

    it('allows UNVERIFIED_PRACTICE for COURSE-scoped quest when minVerificationLevel is not required', () => {
      const match = service.evaluateObjectiveMatch(
        coursePracticeInstance,
        'independent_practice',
        {
          ...basePracticeFact,
          metadata: {
            verificationLevel: 'UNVERIFIED_PRACTICE',
            provenance: 'SELF_REPORTED_INDEPENDENT',
          },
        },
      );
      expect(match).toBe(true);
    });

    it('rejects COURSE-scoped quest when config requires minVerificationLevel VERIFIED_ASSESSMENT but metadata is unverified', () => {
      const strictCourseInstance: QuestInstance = {
        ...coursePracticeInstance,
        config: {
          skillCode: 'SKILL_MATH',
          targetCount: 1,
          minVerificationLevel: 'VERIFIED_ASSESSMENT',
        },
      };

      const match = service.evaluateObjectiveMatch(
        strictCourseInstance,
        'independent_practice',
        {
          ...basePracticeFact,
          metadata: {
            verificationLevel: 'UNVERIFIED_PRACTICE',
          },
        },
      );
      expect(match).toBe(false);
    });
  });
});
