import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authContextModule from './AuthContext';
import ForbiddenPage from './ForbiddenPage';
import UnauthorizedPage from './UnauthorizedPage';

describe('Friendly 401 & 403 Routing Pages', () => {
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('UnauthorizedPage (401)', () => {
    it('renders 401 status and link to login preserving destination', () => {
      render(
        <MemoryRouter initialEntries={['/401?from=%2Fapp%2Fexams']}>
          <Routes>
            <Route path="/401" element={<UnauthorizedPage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('401 Unauthorized')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Authentication Required' })).toBeInTheDocument();

      const signInLink = screen.getByRole('link', { name: /sign in with ule account/i });
      expect(signInLink).toHaveAttribute('href', '/login?from=%2Fapp%2Fexams');

      const homeLink = screen.getByRole('link', { name: /return to dashboard/i });
      expect(homeLink).toHaveAttribute('href', '/app');
    });
  });

  describe('ForbiddenPage (403)', () => {
    it('renders 403 status, current user details and recovery actions', async () => {
      vi.spyOn(authContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'usr-403',
          name: 'Restricted User',
          email: 'restricted@ule.internal',
          emailVerified: true,
          createdAt: '2026-11-01',
        },
        session: null,
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

      render(
        <MemoryRouter initialEntries={['/403']}>
          <Routes>
            <Route path="/403" element={<ForbiddenPage />} />
            <Route path="/login" element={<div data-testid="login-view">Login View</div>} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('403 Forbidden')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeInTheDocument();
      expect(screen.getByText(/Restricted User/)).toBeInTheDocument();
      expect(screen.getByText(/restricted@ule.internal/)).toBeInTheDocument();

      const dashboardLink = screen.getByRole('link', { name: /return to dashboard/i });
      expect(dashboardLink).toHaveAttribute('href', '/app');

      const switchBtn = screen.getByRole('button', {
        name: /sign in with different account/i,
      });
      await act(async () => {
        fireEvent.click(switchBtn);
      });

      expect(mockLogout).toHaveBeenCalled();
    });
  });
});

