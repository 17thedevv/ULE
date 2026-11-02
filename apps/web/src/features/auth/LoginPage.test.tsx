import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authContextModule from './AuthContext';
import LoginPage from './LoginPage';

describe('LoginPage', () => {
  const mockLogin = vi.fn();
  const mockSignUp = vi.fn();
  const mockLogout = vi.fn();
  const mockClearSessionExpired = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderLoginPage = (initialRoute = '/login') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<div data-testid="dashboard-page">Dashboard</div>} />
          <Route
            path="/app/courses"
            element={<div data-testid="courses-page">Courses Destination</div>}
          />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('renders sign in form with email and password inputs', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      sessionExpired: false,
      error: null,
      login: mockLogin,
      signUp: mockSignUp,
      logout: mockLogout,
      refreshSession: vi.fn(),
      clearSessionExpired: mockClearSessionExpired,
    });

    renderLoginPage();

    expect(screen.getByRole('heading', { name: 'Sign In to ULE' })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('toggles to Create Account tab and shows full name input', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      sessionExpired: false,
      error: null,
      login: mockLogin,
      signUp: mockSignUp,
      logout: mockLogout,
      refreshSession: vi.fn(),
      clearSessionExpired: mockClearSessionExpired,
    });

    renderLoginPage();

    const createTab = screen.getByRole('tab', { name: /create account/i });
    fireEvent.click(createTab);

    expect(screen.getByRole('heading', { name: 'Create ULE Account' })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
  });

  it('submits credentials and navigates to from destination on successful login', async () => {
    mockLogin.mockResolvedValueOnce({
      user: {
        id: 'u-1',
        name: 'Learner User',
        email: 'learner@ule.internal',
        emailVerified: true,
        createdAt: '2026-11-01',
      },
    });

    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      sessionExpired: false,
      error: null,
      login: mockLogin,
      signUp: mockSignUp,
      logout: mockLogout,
      refreshSession: vi.fn(),
      clearSessionExpired: mockClearSessionExpired,
    });

    renderLoginPage('/login?from=%2Fapp%2Fcourses');

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'learner@ule.internal' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Secret123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'learner@ule.internal',
        password: 'Secret123!',
      });
      expect(mockClearSessionExpired).toHaveBeenCalled();
      expect(screen.getByTestId('courses-page')).toBeInTheDocument();
    });
  });

  it('displays error alert on login failure', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid email or password.'));

    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      sessionExpired: false,
      error: null,
      login: mockLogin,
      signUp: mockSignUp,
      logout: mockLogout,
      refreshSession: vi.fn(),
      clearSessionExpired: mockClearSessionExpired,
    });

    renderLoginPage();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'bad@ule.internal' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'WrongPass' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
    });
  });

  it('displays session expired alert banner when reason is session_expired', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      sessionExpired: true,
      error: null,
      login: mockLogin,
      signUp: mockSignUp,
      logout: mockLogout,
      refreshSession: vi.fn(),
      clearSessionExpired: mockClearSessionExpired,
    });

    renderLoginPage('/login?reason=session_expired');

    expect(screen.getByRole('alert')).toHaveTextContent(/session expired/i);
  });

  it('renders already signed in state when authenticated user visits /login', () => {
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-signed',
        name: 'Existing Signed User',
        email: 'signed@ule.internal',
        emailVerified: true,
        createdAt: '2026-11-01',
      },
      session: {
        id: 's-1',
        userId: 'usr-signed',
        expiresAt: '2099-01-01',
      },
      isAuthenticated: true,
      isLoading: false,
      sessionExpired: false,
      error: null,
      login: mockLogin,
      signUp: mockSignUp,
      logout: mockLogout,
      refreshSession: vi.fn(),
      clearSessionExpired: mockClearSessionExpired,
    });

    renderLoginPage();

    expect(screen.getByText('Already Signed In')).toBeInTheDocument();
    expect(screen.getByText(/Existing Signed User/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue to dashboard/i })).toBeInTheDocument();
  });

  it('safely handles malformed return URL without throwing URIError and navigates to safe fallback', async () => {
    mockLogin.mockResolvedValueOnce({
      user: {
        id: 'u-1',
        name: 'Learner User',
        email: 'learner@ule.internal',
        emailVerified: true,
        createdAt: '2026-11-01',
      },
    });

    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      sessionExpired: false,
      error: null,
      login: mockLogin,
      signUp: mockSignUp,
      logout: mockLogout,
      refreshSession: vi.fn(),
      clearSessionExpired: mockClearSessionExpired,
    });

    expect(() => renderLoginPage('/login?from=%25')).not.toThrow();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'learner@ule.internal' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Secret123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    });
  });

  it('neutralizes open redirect URLs and redirects to /app dashboard', async () => {
    mockLogin.mockResolvedValueOnce({
      user: {
        id: 'u-1',
        name: 'Learner User',
        email: 'learner@ule.internal',
        emailVerified: true,
        createdAt: '2026-11-01',
      },
    });

    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      isAuthenticated: false,
      isLoading: false,
      sessionExpired: false,
      error: null,
      login: mockLogin,
      signUp: mockSignUp,
      logout: mockLogout,
      refreshSession: vi.fn(),
      clearSessionExpired: mockClearSessionExpired,
    });

    renderLoginPage('/login?from=%2F%2Fmalicious-phishing.com%2Fsteal');

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'learner@ule.internal' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Secret123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    });
  });
});
