import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthApiError,
  checkAuthStatus,
  emitSessionExpired,
  fetchCurrentUser,
  isSessionExpired,
  sanitizeReturnUrl,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  subscribeSessionExpired,
} from './auth';
import { authClient } from './auth-client';

vi.mock('./auth-client', () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
    },
    signUp: {
      email: vi.fn(),
    },
    signOut: vi.fn(),
  },
}));

describe('Auth Service (services/auth.ts)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchCurrentUser', () => {
    it('returns user and session on successful 200 response', async () => {
      const mockPayload = {
        user: {
          id: 'usr-1',
          name: 'Jane Doe',
          email: 'jane@ule.internal',
          emailVerified: true,
          createdAt: new Date().toISOString(),
        },
        session: {
          id: 'sess-1',
          userId: 'usr-1',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPayload,
      } as Response);

      const result = await fetchCurrentUser();
      expect(result).toEqual(mockPayload);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/me',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        }),
      );
    });

    it('throws AuthApiError with statusCode 401 on unauthorized response and does not emit session-expired event', async () => {
      const expiredSpy = vi.fn();
      const unsubscribe = subscribeSessionExpired(expiredSpy);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Unauthorized' }),
      } as Response);

      await expect(fetchCurrentUser()).rejects.toThrow(AuthApiError);
      await expect(fetchCurrentUser()).rejects.toMatchObject({
        statusCode: 401,
      });

      // Anonymous visitors must NOT receive a session-expired event on initialization
      expect(expiredSpy).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('throws AuthApiError with statusCode 403 on forbidden response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ message: 'Forbidden' }),
      } as Response);

      await expect(fetchCurrentUser()).rejects.toThrow(AuthApiError);
      await expect(fetchCurrentUser()).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('throws AuthApiError with response message on server error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ message: 'Database connection failed' }),
      } as Response);

      await expect(fetchCurrentUser()).rejects.toThrow('Database connection failed');
    });
  });

  describe('signInWithEmail', () => {
    it('authenticates with authClient and verifies session via GET /api/v1/me', async () => {
      const mockUser = {
        id: 'usr-123',
        name: 'Learner User',
        email: 'learner@ule.internal',
        emailVerified: true,
        createdAt: new Date().toISOString(),
      };

      vi.mocked(authClient.signIn.email).mockResolvedValue({
        data: { user: mockUser, session: { id: 's-1' } },
        error: null,
      } as unknown as Awaited<ReturnType<typeof authClient.signIn.email>>);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: mockUser, session: { id: 's-1', userId: 'usr-123', expiresAt: '2099-01-01' } }),
      } as Response);

      const result = await signInWithEmail({
        email: 'learner@ule.internal',
        password: 'Password123!',
      });

      expect(authClient.signIn.email).toHaveBeenCalledWith({
        email: 'learner@ule.internal',
        password: 'Password123!',
      });
      expect(result.user.id).toBe('usr-123');
    });

    it('throws AuthApiError when authClient fails authentication', async () => {
      vi.mocked(authClient.signIn.email).mockResolvedValue({
        data: null,
        error: { message: 'Invalid email or password' },
      } as unknown as Awaited<ReturnType<typeof authClient.signIn.email>>);

      await expect(
        signInWithEmail({
          email: 'wrong@ule.internal',
          password: 'BadPassword',
        }),
      ).rejects.toThrow('Invalid email or password');
    });
  });

  describe('signUpWithEmail', () => {
    it('creates account with authClient and verifies canonical session', async () => {
      const mockUser = {
        id: 'usr-new',
        name: 'New Author',
        email: 'author@ule.internal',
        emailVerified: false,
        createdAt: new Date().toISOString(),
      };

      vi.mocked(authClient.signUp.email).mockResolvedValue({
        data: { user: mockUser, session: { id: 's-new' } },
        error: null,
      } as unknown as Awaited<ReturnType<typeof authClient.signUp.email>>);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: mockUser }),
      } as Response);

      const result = await signUpWithEmail({
        email: 'author@ule.internal',
        password: 'Password123!',
        name: 'New Author',
      });

      expect(authClient.signUp.email).toHaveBeenCalledWith({
        email: 'author@ule.internal',
        password: 'Password123!',
        name: 'New Author',
      });
      expect(result.user.name).toBe('New Author');
    });

    it('throws AuthApiError on sign-up failure', async () => {
      vi.mocked(authClient.signUp.email).mockResolvedValue({
        data: null,
        error: { message: 'User already exists' },
      } as unknown as Awaited<ReturnType<typeof authClient.signUp.email>>);

      await expect(
        signUpWithEmail({
          email: 'existing@ule.internal',
          password: 'Password123!',
          name: 'Existing User',
        }),
      ).rejects.toThrow('User already exists');
    });
  });

  describe('signOut', () => {
    it('invokes authClient.signOut to clear session', async () => {
      vi.mocked(authClient.signOut).mockResolvedValue({} as unknown as Awaited<
        ReturnType<typeof authClient.signOut>
      >);

      await signOut();
      expect(authClient.signOut).toHaveBeenCalled();
    });

    it('throws AuthApiError with statusCode 500 when remote signOut returns error', async () => {
      vi.mocked(authClient.signOut).mockResolvedValue({
        error: { message: 'Network disconnected during sign-out' },
      } as unknown as Awaited<ReturnType<typeof authClient.signOut>>);

      await expect(signOut()).rejects.toThrow('Network disconnected during sign-out');
      await expect(signOut()).rejects.toMatchObject({
        statusCode: 500,
      });
    });
  });

  describe('checkAuthStatus', () => {
    it('calls emitSessionExpired when response status is 401', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeSessionExpired(callback);

      checkAuthStatus({ status: 401 });
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('does NOT call emitSessionExpired when response status is 403, 500, or 200', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeSessionExpired(callback);

      checkAuthStatus({ status: 403 });
      checkAuthStatus({ status: 500 });
      checkAuthStatus({ status: 200 });
      expect(callback).not.toHaveBeenCalled();

      unsubscribe();
    });
  });

  describe('sanitizeReturnUrl', () => {
    it('preserves valid relative paths and search params', () => {
      expect(sanitizeReturnUrl('/app/courses')).toBe('/app/courses');
      expect(sanitizeReturnUrl('/studio/grading?filter=pending')).toBe(
        '/studio/grading?filter=pending',
      );
    });

    it('falls back to default path for open redirects, malformed URIs and external protocols', () => {
      expect(sanitizeReturnUrl('//attacker.com')).toBe('/app');
      expect(sanitizeReturnUrl('/\\attacker.com')).toBe('/app');
      expect(sanitizeReturnUrl('https://evil.com/app')).toBe('/app');
      expect(sanitizeReturnUrl('javascript:alert(1)')).toBe('/app');
      expect(sanitizeReturnUrl('%25')).toBe('/app');
      expect(sanitizeReturnUrl('')).toBe('/app');
      expect(sanitizeReturnUrl(null)).toBe('/app');
      expect(sanitizeReturnUrl(undefined, '/custom')).toBe('/custom');
    });
  });

  describe('isSessionExpired', () => {
    it('returns true when expiresAt is in the past', () => {
      const pastSession = {
        id: 's-old',
        userId: 'u-1',
        expiresAt: new Date(Date.now() - 60000).toISOString(),
      };
      expect(isSessionExpired(pastSession)).toBe(true);
    });

    it('returns false when expiresAt is in the future', () => {
      const activeSession = {
        id: 's-act',
        userId: 'u-1',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      expect(isSessionExpired(activeSession)).toBe(false);
    });

    it('returns false when session or expiresAt is missing', () => {
      expect(isSessionExpired(null)).toBe(false);
      expect(isSessionExpired(undefined)).toBe(false);
      expect(isSessionExpired({ id: 's-1', userId: 'u-1', expiresAt: '' })).toBe(false);
    });
  });

  describe('session expiration events', () => {
    it('notifies subscribers when emitSessionExpired is called', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeSessionExpired(callback);

      emitSessionExpired();
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      emitSessionExpired();
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
