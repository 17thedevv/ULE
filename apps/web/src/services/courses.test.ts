import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as courseService from './courses';

describe('Course Service HTTP Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists courses by calling GET /api/v1/courses with credentials', async () => {
    const mockCourses = [
      {
        id: 'c-1',
        ownerId: 'u-1',
        visibility: 'PRIVATE',
        createdAt: '2026-10-28T00:00:00Z',
        updatedAt: '2026-10-28T00:00:00Z',
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockCourses,
    } as Response);

    const result = await courseService.listCourses();

    expect(result).toEqual(mockCourses);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/courses',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      }),
    );
  });

  it('creates course by calling POST /api/v1/courses with payload', async () => {
    const mockResponse = {
      course: {
        id: 'c-1',
        ownerId: 'u-1',
        visibility: 'PRIVATE',
        createdAt: '2026-10-28T00:00:00Z',
        updatedAt: '2026-10-28T00:00:00Z',
      },
      draft: {
        id: 'd-1',
        courseId: 'c-1',
        title: 'New Course',
        description: 'Test Description',
        summary: null,
        revision: 1,
        sourceVersionId: null,
        updatedAt: '2026-10-28T00:00:00Z',
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await courseService.createCourse({
      title: 'New Course',
      description: 'Test Description',
    });

    expect(result).toEqual(mockResponse);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/courses',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'New Course',
          description: 'Test Description',
        }),
        credentials: 'include',
      }),
    );
  });
});
