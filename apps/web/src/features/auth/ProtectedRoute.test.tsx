import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as authContextModule from './AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

describe('ProtectedRoute', () => {
  const renderWithRouter = (initialRoute: string) =>
    render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route
            path="/protected"
            element={
              <ProtectedRoute>
                <div data-testid="protected-content">Secret Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route
            path="/login"
            element={<div data-testid="login-page">Login Destination</div>}
          />
        </Routes>
      </MemoryRouter>,
    );

  it('renders loading state when session is loading', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: true,
      sessionExpired: false,
      error: null,
      login: vi.fn(),
      signUp: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
      clearSessionExpired: vi.fn(),
    });

    renderWithRouter('/protected');
    expect(screen.getByText('Checking session…')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('redirects to /login with encoded from parameter when unauthenticated', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      sessionExpired: false,
      error: null,
      login: vi.fn(),
      signUp: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
      clearSessionExpired: vi.fn(),
    });

    renderWithRouter('/protected?tab=details');
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('redirects to /login with reason=session_expired when session has expired', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      sessionExpired: true,
      error: null,
      login: vi.fn(),
      signUp: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
      clearSessionExpired: vi.fn(),
    });

    renderWithRouter('/protected');
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('renders protected children when authenticated', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        name: 'Alice',
        email: 'alice@ule.internal',
        emailVerified: true,
        createdAt: '2026-11-01T00:00:00.000Z',
      },
      session: {
        id: 'sess-1',
        userId: 'usr-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
      isAuthenticated: true,
      isLoading: false,
      sessionExpired: false,
      error: null,
      login: vi.fn(),
      signUp: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
      clearSessionExpired: vi.fn(),
    });

    renderWithRouter('/protected');
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('renders Service Unavailable error state and retry button when auth verification fails with server error', () => {
    const mockRefresh = vi.fn();
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      sessionExpired: false,
      error: 'Backend API service unavailable (503)',
      login: vi.fn(),
      signUp: vi.fn(),
      logout: vi.fn(),
      refreshSession: mockRefresh,
      clearSessionExpired: vi.fn(),
    });

    renderWithRouter('/protected');
    expect(screen.getByText('Service Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Backend API service unavailable/)).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
  });
});
