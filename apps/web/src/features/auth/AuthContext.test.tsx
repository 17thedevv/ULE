import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthApiError,
  emitSessionExpired,
  fetchCurrentUser,
  signInWithEmail,
  signOut,
  signUpWithEmail,
} from '../../services/auth';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('../../services/auth', async () => {
  const actual = await vi.importActual('../../services/auth');
  return {
    ...actual,
    fetchCurrentUser: vi.fn(),
    signInWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    signOut: vi.fn(),
  };
});

function ConsumerComponent() {
  const {
    user,
    isAuthenticated,
    isLoading,
    sessionExpired,
    error,
    login,
    logout,
    signUp,
    refreshSession,
  } = useAuth();

  return (
    <div>
      <div data-testid="auth-loading">{isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</div>
      <div data-testid="auth-expired">{sessionExpired ? 'expired' : 'active'}</div>
      <div data-testid="auth-user">{user ? user.name : 'no-user'}</div>
      <div data-testid="auth-error">{error || 'none'}</div>

      <button
        type="button"
        onClick={() => login({ email: 'test@ule.internal', password: 'Password123!' })}
      >
        Sign In Button
      </button>

      <button
        type="button"
        onClick={() =>
          signUp({ email: 'new@ule.internal', password: 'Password123!', name: 'New User' })
        }
      >
        Sign Up Button
      </button>

      <button type="button" onClick={() => logout()}>
        Sign Out Button
      </button>

      <button type="button" onClick={() => refreshSession()}>
        Refresh Button
      </button>
    </div>
  );
}

describe('AuthContext & AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with authenticated user when GET /api/v1/me succeeds', async () => {
    const mockUser = {
      id: 'usr-1',
      name: 'Alice Learner',
      email: 'alice@ule.internal',
      emailVerified: true,
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    const mockSession = {
      id: 'sess-1',
      userId: 'usr-1',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    vi.mocked(fetchCurrentUser).mockResolvedValueOnce({
      user: mockUser,
      session: mockSession,
    });

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>,
    );

    expect(screen.getByTestId('auth-loading')).toHaveTextContent('loading');

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('idle');
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('auth-user')).toHaveTextContent('Alice Learner');
    expect(screen.getByTestId('auth-expired')).toHaveTextContent('active');
  });

  it('initializes in unauthenticated state when GET /api/v1/me returns 401', async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValueOnce(
      new AuthApiError(401, 'Unauthorized session'),
    );

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('idle');
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('auth-user')).toHaveTextContent('no-user');
    expect(screen.getByTestId('auth-error')).toHaveTextContent('none');
  });

  it('updates state upon successful login', async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValueOnce(new AuthApiError(401, 'Unauthorized'));

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('idle');
    });

    const mockUser = {
      id: 'usr-2',
      name: 'Bob Author',
      email: 'bob@ule.internal',
      emailVerified: true,
      createdAt: '2026-11-01T00:00:00.000Z',
    };

    vi.mocked(signInWithEmail).mockResolvedValueOnce({
      user: mockUser,
      session: {
        id: 'sess-2',
        userId: 'usr-2',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    await act(async () => {
      screen.getByText('Sign In Button').click();
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('auth-user')).toHaveTextContent('Bob Author');
  });

  it('updates state upon successful signUp', async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValueOnce(new AuthApiError(401, 'Unauthorized'));

    render(
      <AuthProvider>
        <ConsumerComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-loading')).toHaveTextContent('idle');
    });

    const mockUser = {
      id: 'usr-3',
      name: 'New User',
      email: 'new@ule.internal',
      emailVerified: false,
      createdAt: '2026-11-01T00:00:00.000Z',
    };

    vi.mocked(signUpWithEmail).mockResolvedValueOnce({
      user: mockUser,
      session: {
        id: 'sess-3',
        userId: 'usr-3',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    await act(async () => {
      screen.getByText('Sign Up Button').click();
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('auth-user')).toHaveTextContent('New User');
  });

  it('resets state to unauthenticated when logout is called', async () => {
    const mockUser = {
      id: 'usr-1',
      name: 'Alice Learner',
      email: 'alice@ule.internal',
      emailVerified: true,
      createdAt: '2026-11-01T00:00:00.000Z',
    };

    render(
      <AuthProvider initialSession={{ user: mockUser }}>
        <ConsumerComponent />
      </AuthProvider>,
    );

    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');

    await act(async () => {
      screen.getByText('Sign Out Button').click();
    });

    expect(signOut).toHaveBeenCalled();
    expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('auth-user')).toHaveTextContent('no-user');
  });

  it('handles session expiration via broadcast event', async () => {
    const mockUser = {
      id: 'usr-1',
      name: 'Alice Learner',
      email: 'alice@ule.internal',
      emailVerified: true,
      createdAt: '2026-11-01T00:00:00.000Z',
    };

    render(
      <AuthProvider initialSession={{ user: mockUser }}>
        <ConsumerComponent />
      </AuthProvider>,
    );

    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');

    act(() => {
      emitSessionExpired();
    });

    expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('auth-expired')).toHaveTextContent('expired');
  });

  it('handles past session expiration timestamp on load', async () => {
    const mockUser = {
      id: 'usr-1',
      name: 'Alice Learner',
      email: 'alice@ule.internal',
      emailVerified: true,
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    const expiredSession = {
      id: 'sess-1',
      userId: 'usr-1',
      expiresAt: new Date(Date.now() - 60000).toISOString(),
    };

    render(
      <AuthProvider initialSession={{ user: mockUser, session: expiredSession }}>
        <ConsumerComponent />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
      expect(screen.getByTestId('auth-expired')).toHaveTextContent('expired');
    });
  });
});
