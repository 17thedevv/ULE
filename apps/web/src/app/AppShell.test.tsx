import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import * as authContextModule from '../features/auth/AuthContext';
import { ThemeProvider } from '../theme/ThemeProvider';

describe('AppShell Component (UI-01)', () => {
  const renderShell = (initialRoute = '/app') =>
    render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <ThemeProvider>
          <AppShell>
            <div data-testid="test-content">Workspace Content</div>
          </AppShell>
        </ThemeProvider>
      </MemoryRouter>,
    );

  it('renders topbar with brand and theme controls', () => {
    renderShell();

    expect(screen.getByText('Universal Learning Engine')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
  });

  it('renders navigation links to primary workspaces', () => {
    renderShell();

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my courses/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /assessments/i })).toBeInTheDocument();
  });

  it('handles mobile sidebar drawer toggle and close on escape', () => {
    renderShell();

    const toggleButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    // Click hamburger to open
    fireEvent.click(toggleButton);
    expect(screen.getByRole('button', { name: /close navigation menu/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    // Escape closes drawer
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('renders Sign In link when user is unauthenticated', () => {
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

    renderShell();

    const signInLink = screen.getByRole('link', { name: /sign in/i });
    expect(signInLink).toBeInTheDocument();
    expect(signInLink).toHaveAttribute('href', '/login');
  });

  it('renders user identity and Sign Out button when authenticated', () => {
    const mockLogout = vi.fn();
    vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-alice',
        name: 'Alice Learner',
        email: 'alice@ule.internal',
        emailVerified: true,
        createdAt: '2026-11-01',
      },
      session: {
        id: 'sess-alice',
        userId: 'usr-alice',
        expiresAt: '2099-01-01',
      },
      isAuthenticated: true,
      isLoading: false,
      sessionExpired: false,
      error: null,
      login: vi.fn(),
      signUp: vi.fn(),
      logout: mockLogout,
      refreshSession: vi.fn(),
      clearSessionExpired: vi.fn(),
    });

    renderShell();

    expect(screen.getByText('Alice Learner')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument(); // Avatar initial

    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    expect(signOutBtn).toBeInTheDocument();

    fireEvent.click(signOutBtn);
    expect(mockLogout).toHaveBeenCalled();
  });
});
