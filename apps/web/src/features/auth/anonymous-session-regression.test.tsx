import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitSessionExpired } from '../../services/auth';
import { AuthProvider } from './AuthContext';
import LoginPage from './LoginPage';
import { ProtectedRoute } from './ProtectedRoute';

// We do NOT mock ../../services/auth here!
// We test the real fetchCurrentUser() implementation against a mocked global.fetch.
describe('Anonymous visitor session regression test (P1 Auth UX)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('anonymous visitor accessing protected route is redirected to /login WITHOUT session expired warning', async () => {
    // Mock canonical GET /api/v1/me returning 401 Unauthorized for an unauthenticated visitor
    global.fetch = vi.fn().mockImplementation((url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/me')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ message: 'Unauthorized. Missing session token.' }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/app/courses']}>
          <Routes>
            <Route
              path="/app/*"
              element={
                <ProtectedRoute>
                  <div data-testid="protected-content">Protected Course Studio</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    // Initial state: checking session
    expect(screen.getByText(/checking session/i)).toBeInTheDocument();

    // After session check resolves with 401 for an anonymous user:
    await waitFor(() => {
      // Must be redirected to LoginPage
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    });

    // The protected content must not be rendered
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

    // REGRESSION ASSERTION: The session expired alert banner MUST NOT be present for anonymous users!
    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/your previous session has timed out/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('displays session expired warning when an active session actually expires', async () => {
    // Initial fetchCurrentUser returns 401 (anonymous)
    global.fetch = vi.fn().mockImplementation((url: RequestInfo | URL) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/v1/me')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ message: 'Unauthorized' }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    });

    expect(screen.queryByText(/session expired/i)).not.toBeInTheDocument();

    // Now simulate an authenticated session expiration event (from a business service)
    await React.act(async () => {
      emitSessionExpired();
    });

    // The warning MUST now appear
    await waitFor(() => {
      expect(screen.getByText(/session expired:/i)).toBeInTheDocument();
      expect(screen.getByText(/your previous session has timed out/i)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
