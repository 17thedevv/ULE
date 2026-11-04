import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl } from './api';
import { subscribeSessionExpired } from './auth';
import { CreatorApiError } from './creator';
import {
  createCourseAccessGrant,
  fetchCourseAccessGrants,
  revokeCourseAccessGrant,
} from './grants';

const path = `${getApiBaseUrl()}/api/v1/courses/course-1/versions/version-2/grants`;
const grant = {
  id: 'grant-1',
  courseId: 'course-1',
  courseVersionId: 'version-2',
  userId: 'learner-1',
  userEmail: 'learner@example.com',
  grantedById: 'creator-1',
  status: 'ACTIVE',
  createdAt: '2026-11-05T09:00:00.000Z',
  updatedAt: '2026-11-05T09:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Course access grants API', () => {
  it('lists grants and sends the session cookie for the selected version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([grant]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCourseAccessGrants('course-1', 'version-2')).resolves.toEqual([grant]);
    expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({
      method: 'GET',
      credentials: 'include',
      headers: expect.objectContaining({ Accept: 'application/json' }),
    }));
  });

  it('creates a grant by email and re-grants by user ID using the same POST', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(grant, { status: 201 }))
      .mockResolvedValueOnce(Response.json(grant, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createCourseAccessGrant('course-1', 'version-2', { email: grant.userEmail }))
      .resolves.toEqual(grant);
    await expect(createCourseAccessGrant('course-1', 'version-2', { userId: grant.userId }))
      .resolves.toEqual(grant);
    expect(fetchMock).toHaveBeenNthCalledWith(1, path, expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email: grant.userEmail }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, path, expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ userId: grant.userId }),
    }));
  });

  it('revokes only the selected grant in that version', async () => {
    const revoked = { ...grant, status: 'REVOKED' };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(revoked));
    vi.stubGlobal('fetch', fetchMock);

    await expect(revokeCourseAccessGrant('course-1', 'version-2', grant.id))
      .resolves.toEqual(revoked);
    expect(fetchMock).toHaveBeenCalledWith(`${path}/grant-1`, expect.objectContaining({
      method: 'DELETE',
      credentials: 'include',
    }));
  });

  it.each([
    { status: 401, message: 'Unauthorized', sessionExpired: true },
    { status: 403, message: 'Forbidden', sessionExpired: false },
    { status: 404, message: 'Target learner user not found.', sessionExpired: false },
    { status: 503, message: 'Service Unavailable', sessionExpired: false },
  ])('preserves HTTP $status and only expires the session on 401', async ({
    status, message, sessionExpired,
  }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message }, { status })));
    const onSessionExpired = vi.fn();
    const unsubscribe = subscribeSessionExpired(onSessionExpired);

    try {
      const failure = createCourseAccessGrant('course-1', 'version-2', { email: grant.userEmail });
      await expect(failure).rejects.toBeInstanceOf(CreatorApiError);
      await expect(failure).rejects.toMatchObject({ statusCode: status, message });
      expect(onSessionExpired).toHaveBeenCalledTimes(sessionExpired ? 1 : 0);
    } finally {
      unsubscribe();
    }
  });
});
