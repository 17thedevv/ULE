import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthApiError,
  fetchCurrentUser,
  fetchGoogleLoginAvailability,
  signInWithGoogle,
} from '../../services/auth';
import { AuthProvider } from './AuthContext';
import GoogleAuthCompletePage from './GoogleAuthCompletePage';
import LoginPage from './LoginPage';
import { ProtectedRoute } from './ProtectedRoute';

vi.mock('../../services/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/auth')>(),
  fetchCurrentUser: vi.fn(),
  fetchGoogleLoginAvailability: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

const currentUser = vi.mocked(fetchCurrentUser);
const providerAvailability = vi.mocked(fetchGoogleLoginAvailability);
const signedIn = {
  user: {
    id: 'learner-1',
    name: 'Learner',
    email: 'learner@example.com',
    emailVerified: true,
    createdAt: '2026-11-05T01:00:00.000Z',
  },
  session: {
    id: 'session-1',
    userId: 'learner-1',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  },
};

function renderAuth(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/auth/complete" element={<GoogleAuthCompletePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<ProtectedRoute><p>Dashboard destination</p></ProtectedRoute>} />
          <Route path="/studio/courses" element={<ProtectedRoute><p>Studio destination</p></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('Google authentication in Product Login', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentUser.mockRejectedValue(new AuthApiError(401, 'Unauthorized'));
    providerAvailability.mockResolvedValue(false);
    vi.stubEnv('VITE_GOOGLE_LOGIN_ENABLED', 'false');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('offers Google in both login modes only when the server enables it', async () => {
    vi.stubEnv('VITE_GOOGLE_LOGIN_ENABLED', 'true');
    providerAvailability.mockResolvedValue(true);
    vi.mocked(signInWithGoogle).mockResolvedValue();
    renderAuth('/login?from=%2Fstudio%2Fcourses');

    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    fireEvent.click(screen.getByRole('tab', { name: 'Create Account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(signInWithGoogle).toHaveBeenCalledWith('/studio/courses');
    expect(screen.getByRole('button', { name: /redirecting to google/i })).toBeDisabled();
  });

  it('keeps email sign-in available when the server has no Google provider', async () => {
    vi.stubEnv('VITE_GOOGLE_LOGIN_ENABLED', 'true');
    renderAuth('/login');
    await waitFor(() => expect(providerAvailability).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
  });

  it('waits for /me before entering the requested protected destination', async () => {
    currentUser.mockResolvedValue(signedIn);
    renderAuth('/auth/complete?from=%2Fstudio%2Fcourses');

    expect(screen.queryByText('Studio destination')).not.toBeInTheDocument();
    expect(await screen.findByText('Studio destination')).toBeInTheDocument();
    expect(currentUser).toHaveBeenCalledTimes(1);
  });

  it('uses the dashboard for an unsafe destination and retries a service failure', async () => {
    currentUser.mockRejectedValueOnce(new AuthApiError(503, 'Unavailable')).mockResolvedValueOnce(signedIn);
    renderAuth('/auth/complete?from=%2F..%2F%2Fattacker.example');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not verify your session');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Dashboard destination')).toBeInTheDocument();
  });

  it.each([
    ['?from=%2Fstudio%2Fcourses', /could not verify a session/i],
    ['?failed=1&error=access_denied&error_description=provider-detail', /was canceled/i],
    ['?failed=1&error=account_not_linked', /existing ULE account/i],
  ])('returns an unverified or rejected callback to login (%s)', async (query, message) => {
    renderAuth(`/auth/complete${query}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('Studio destination')).not.toBeInTheDocument();
    expect(screen.queryByText('provider-detail')).not.toBeInTheDocument();
  });
});
