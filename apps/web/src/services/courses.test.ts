import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as courseService from './courses';
import { subscribeSessionExpired } from './auth';

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

  it('dispatches session expired event when API responds with 401', async () => {
    const sessionExpiredCallback = vi.fn();
    const unsubscribe = subscribeSessionExpired(sessionExpiredCallback);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'Session expired' }),
    } as Response);

    await expect(courseService.listCourses()).rejects.toThrow('Session expired');
    expect(sessionExpiredCallback).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('does NOT dispatch session expired event when API responds with 403 Forbidden', async () => {
    const sessionExpiredCallback = vi.fn();
    const unsubscribe = subscribeSessionExpired(sessionExpiredCallback);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ message: 'Forbidden access' }),
    } as Response);

    await expect(courseService.listCourses()).rejects.toThrow('Forbidden access');
    expect(sessionExpiredCallback).not.toHaveBeenCalled();

    unsubscribe();
  });
});
