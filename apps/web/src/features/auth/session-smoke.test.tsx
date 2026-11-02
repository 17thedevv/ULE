import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../app/AppShell';
import {
  AuthApiError,
  emitSessionExpired,
  fetchCurrentUser,
  signInWithEmail,
  signOut,
} from '../../services/auth';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { AuthProvider } from './AuthContext';
import LoginPage from './LoginPage';
import { ProtectedRoute } from './ProtectedRoute';

vi.mock('../../services/auth', async () => {
  const actual = await vi.importActual('../../services/auth');
  return {
    ...actual,
    fetchCurrentUser: vi.fn(),
    signInWithEmail: vi.fn(),
    signOut: vi.fn(),
  };
});

function MockCoursesPage() {
  return (
    <div>
      <h1>Enrolled Courses</h1>
      <p>Protected learning content is visible to authenticated learner.</p>
    </div>
  );
}

function SmokeAppRouter({ initialRoute = '/app/courses' }: { initialRoute?: string }) {
  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <AuthProvider>
        <ThemeProvider>
          <AppShell>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/app/courses"
                element={
                  <ProtectedRoute>
                    <MockCoursesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dev/verification"
                element={<div>Developer Verification Open Area</div>}
              />
            </Routes>
          </AppShell>
        </ThemeProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Real-Session Smoke Verification: Product Authentication & Session UX', () => {
  const authenticatedUser = {
    id: 'usr-smoke-1',
    name: 'Smoke Test Learner',
    email: 'smoke.learner@ule.internal',
    emailVerified: true,
    createdAt: '2026-11-02T00:00:00.000Z',
  };

  const activeSession = {
    id: 'sess-smoke-1',
    userId: 'usr-smoke-1',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes full session lifecycle: unauthenticated redirect -> login -> auth UX -> session expiry -> logout', async () => {
    // 1. Initial State: Unauthenticated (backend GET /api/v1/me returns 401)
    vi.mocked(fetchCurrentUser).mockRejectedValueOnce(
      new AuthApiError(401, 'Unauthorized session.'),
    );

    render(<SmokeAppRouter initialRoute="/app/courses" />);

    // ProtectedRoute intercepts and redirects unauthenticated visitor to /login with from parameter
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign In to ULE' })).toBeInTheDocument();
    });

    // Topbar shows "Sign In" link for unauthenticated visitor
    const signInButton = screen.getByRole('link', { name: 'Sign In' });
    expect(signInButton).toBeInTheDocument();
    expect(signInButton).toHaveAttribute('href', '/login');

    // 2. Perform Login with Credentials
    vi.mocked(signInWithEmail).mockResolvedValueOnce({
      user: authenticatedUser,
      session: activeSession,
    });
    vi.mocked(fetchCurrentUser).mockResolvedValue({
      user: authenticatedUser,
      session: activeSession,
    });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'smoke.learner@ule.internal' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'SecureLearnerPass123!' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    });

    // 3. User is redirected back to /app/courses and workspace is rendered
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Enrolled Courses' })).toBeInTheDocument();
    });

    // Topbar displays authenticated learner's identity and Sign Out button
    expect(screen.getByText('Smoke Test Learner')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument(); // Initial avatar
    const signOutButton = screen.getByRole('button', { name: /sign out/i });
    expect(signOutButton).toBeInTheDocument();

    // 4. Session Expiry Handling: Simulate session expiration event
    act(() => {
      emitSessionExpired();
    });

    // User is immediately redirected back to /login with session expired alert
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/session expired/i);
    });
    expect(screen.getByRole('heading', { name: 'Sign In to ULE' })).toBeInTheDocument();

    // 5. Re-authenticate, then trigger intentional Sign Out
    vi.mocked(signInWithEmail).mockResolvedValueOnce({
      user: authenticatedUser,
      session: activeSession,
    });

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'smoke.learner@ule.internal' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'SecureLearnerPass123!' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Enrolled Courses' })).toBeInTheDocument();
    });

    // Click Sign Out
    vi.mocked(signOut).mockResolvedValueOnce(undefined);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    });

    // State is wiped and Topbar returns to unauthenticated "Sign In" CTA
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Sign In' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Smoke Test Learner')).not.toBeInTheDocument();
  });
});
