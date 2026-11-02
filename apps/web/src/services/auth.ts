import { MeResponseDto, SessionDto, UserDto } from '@ule/contracts';
import { getApiBaseUrl } from './api';
import { authClient } from './auth-client';

export class AuthApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errorDetails?: unknown,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

export const SESSION_EXPIRED_EVENT = 'ule:session-expired';

/**
 * Dispatches an event notifying the application that the current session has expired.
 */
export function emitSessionExpired(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
}

/**
 * Subscribes a callback to session expiration events.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeSessionExpired(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const handler = () => callback();
  window.addEventListener(SESSION_EXPIRED_EVENT, handler);
  return () => {
    window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  };
}

/**
 * Checks an HTTP response status and dispatches a session-expired event
 * if the backend returned 401 Unauthorized.
 * Note: 403 Forbidden indicates permission denial and is NOT treated as session expiration.
 */
export function checkAuthStatus(response: { status: number }): void {
  if (response.status === 401) {
    emitSessionExpired();
  }
}

/**
 * Normalizes and validates return URLs to prevent open redirects and malformed URIs.
 * Returns a safe internal relative path (starts with single '/'), or defaultPath.
 */
export function sanitizeReturnUrl(rawFrom: string | null | undefined, defaultPath = '/app'): string {
  if (!rawFrom || typeof rawFrom !== 'string') {
    return defaultPath;
  }
  const trimmed = rawFrom.trim();
  // Safe internal paths must start with a single '/' and not '//' or '/\' or protocol 'xyz:'
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
  ) {
    return trimmed;
  }
  return defaultPath;
}

/**
 * Checks whether the given session has passed its expiration timestamp.
 */
export function isSessionExpired(session?: SessionDto | null): boolean {
  if (!session || !session.expiresAt) return false;
  const expiryTime = new Date(session.expiresAt).getTime();
  if (isNaN(expiryTime)) return false;
  return Date.now() >= expiryTime;
}

/**
 * Calls canonical GET /api/v1/me to verify and retrieve the active authenticated
 * user and session directly from the NestJS authoritative backend.
 */
export async function fetchCurrentUser(): Promise<MeResponseDto> {
  const baseUrl = getApiBaseUrl();
  const endpoint = `${baseUrl}/api/v1/me`;

  const response = await fetch(endpoint, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 401) {
    throw new AuthApiError(401, 'Unauthorized. Missing or expired session token.');
  }

  if (response.status === 403) {
    throw new AuthApiError(403, 'Forbidden. Access to this resource is denied.');
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      (errorBody && (errorBody.message || errorBody.error)) ||
      `HTTP Error ${response.status}: ${response.statusText}`;
    throw new AuthApiError(response.status, String(message), errorBody);
  }

  return response.json() as Promise<MeResponseDto>;
}

/**
 * Authenticates user credentials via Better Auth email sign-in,
 * then validates and returns canonical state via GET /api/v1/me.
 */
export async function signInWithEmail(credentials: {
  email: string;
  password: string;
}): Promise<MeResponseDto> {
  const { email, password } = credentials;
  const res = await authClient.signIn.email({
    email: email.trim(),
    password,
  });

  if (res.error) {
    throw new AuthApiError(401, res.error.message || 'Invalid email or password.');
  }

  return fetchCurrentUser();
}

/**
 * Registers a new user via Better Auth email sign-up,
 * then validates and returns canonical state via GET /api/v1/me.
 */
export async function signUpWithEmail(payload: {
  email: string;
  password: string;
  name: string;
}): Promise<MeResponseDto> {
  const { email, password, name } = payload;
  const res = await authClient.signUp.email({
    email: email.trim(),
    password,
    name: name.trim() || email.trim().split('@')[0],
  });

  if (res.error) {
    throw new AuthApiError(400, res.error.message || 'Account registration failed.');
  }

  return fetchCurrentUser();
}

/**
 * Terminates the active session via Better Auth sign-out.
 * Throws AuthApiError if the server rejects or fails the sign-out request.
 */
export async function signOut(): Promise<void> {
  const res = await authClient.signOut();
  if (res?.error) {
    throw new AuthApiError(
      500,
      res.error.message || 'Failed to terminate session on server.',
      res.error,
    );
  }
}

export type { UserDto, SessionDto, MeResponseDto };
