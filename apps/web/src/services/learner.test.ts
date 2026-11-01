import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enrollInCourse,
  fetchCourseEnrollment,
  fetchCourseProgress,
  fetchCourseQuests,
  fetchEvidenceSummary,
  fetchGrantedCourses,
  fetchSkillProjections,
} from './learner';

describe('Learner Service API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchGrantedCourses returns parsed list of granted courses', async () => {
    const mockData = [
      {
        id: 'ver-123',
        courseId: 'c-1',
        versionNumber: 1,
        title: 'Introduction to Logic',
        description: 'Basics of propositional logic',
        summary: null,
        blocks: [],
        schemaVersion: '1.0',
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    } as Response);

    const result = await fetchGrantedCourses();
    expect(result).toEqual(mockData);
  });

  it('fetchCourseProgress returns progress summary', async () => {
    const mockProgress = {
      courseVersionId: 'ver-123',
      userId: 'user-1',
      totalBlocks: 2,
      completedBlocks: 1,
      percentComplete: 50,
      blocks: [],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockProgress,
    } as Response);

    const result = await fetchCourseProgress('ver-123');
    expect(result.percentComplete).toBe(50);
  });

  it('fetchEvidenceSummary returns evidence ledger records', async () => {
    const mockEvidence = [
      {
        id: 'ev-1',
        classification: 'INDEPENDENT_CORRECT',
        status: 'ACCEPTED',
        supportProvenance: 'SERVER_OBSERVED',
        isSameItemRepetition: false,
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockEvidence,
    } as Response);

    const result = await fetchEvidenceSummary('ver-123');
    expect(result).toHaveLength(1);
    expect(result[0].classification).toBe('INDEPENDENT_CORRECT');
  });

  it('fetchSkillProjections returns conservative skill projections', async () => {
    const mockSkills = [
      {
        skillId: 'sk-1',
        skillCode: 'LOGIC_101',
        skillName: 'Propositional Logic',
        state: 'DEVELOPING',
        evidenceCount: 1,
        independentCount: 1,
        assistedCount: 0,
        repeatedCount: 0,
        reasons: ['1 independent observation'],
        limitations: ['Need 2 observations for verification eligibility'],
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockSkills,
    } as Response);

    const result = await fetchSkillProjections('ver-123');
    expect(result[0].state).toBe('DEVELOPING');
  });

  it('fetchCourseEnrollment returns null on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response);

    const result = await fetchCourseEnrollment('ver-123');
    expect(result).toBeNull();
  });

  it('enrollInCourse posts to enrollment endpoint and returns result', async () => {
    const mockEnrollment = {
      enrollment: {
        id: 'en-1',
        userId: 'user-1',
        courseVersionId: 'ver-123',
        status: 'ACTIVE',
        enrolledAt: '2026-11-01T00:00:00.000Z',
      },
      quests: [],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockEnrollment,
    } as Response);

    const result = await enrollInCourse('ver-123');
    expect(result.enrollment.status).toBe('ACTIVE');
  });

  it('fetchCourseQuests returns quest instances', async () => {
    const mockQuests = [
      {
        id: 'q-1',
        questKey: 'quest-start',
        title: 'First Steps',
        status: 'ACTIVE',
        objectives: [],
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockQuests,
    } as Response);

    const result = await fetchCourseQuests('ver-123');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('First Steps');
  });
});
