import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentUser } from '../../services/auth';
import { authClient } from '../../services/auth-client';
import { connectGoogle } from '../../services/sign-in-methods';
import { AuthProvider } from '../auth/AuthContext';
import { useGoogleLoginAvailable } from '../auth/useGoogleLoginAvailable';
import SignInMethodsPage from './SignInMethodsPage';

vi.mock('../../services/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auth')>()),
  fetchCurrentUser: vi.fn(),
}));

vi.mock('../../services/auth-client', () => ({
  authClient: { listAccounts: vi.fn(), linkSocial: vi.fn() },
}));

vi.mock('../auth/useGoogleLoginAvailable', () => ({ useGoogleLoginAvailable: vi.fn() }));

const currentUser = {
  id: 'ule-learner',
  name: 'ULE Learner',
  email: 'learner@example.com',
  emailVerified: true,
  createdAt: '2026-11-04T00:00:00.000Z',
};

function account(providerId: string, userId = currentUser.id) {
  return {
    id: `${providerId}-record`,
    providerId,
    userId,
    accountId: `${providerId}-account`,
    scopes: [],
    createdAt: new Date(currentUser.createdAt),
    updatedAt: new Date(currentUser.createdAt),
  };
}

function LocationSearch() {
  const { search } = useLocation();
  return <output data-testid="location-search">{search}</output>;
}

function renderPage(path = '/account/security') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider initialSession={{ user: currentUser }}>
        <SignInMethodsPage />
        <LocationSearch />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('SignInMethodsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.sessionStorage.clear();
    vi.mocked(useGoogleLoginAvailable).mockReturnValue(true);
    vi.mocked(fetchCurrentUser).mockResolvedValue({ user: currentUser });
    vi.mocked(authClient.listAccounts).mockResolvedValue({
      data: [account('credential')],
      error: null,
    });
    vi.mocked(authClient.linkSocial).mockResolvedValue({
      data: { url: 'https://accounts.google.com/', redirect: true },
      error: null,
    });
  });

  it('starts one explicit authenticated link request with fixed same-origin callbacks', async () => {
    renderPage();
    expect(await screen.findByText('Email and password')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connect Google' }));
    const pendingButton = screen.getByRole('button', { name: /redirecting to google/i });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);

    const callbackURL = `${window.location.origin}/account/security?googleLink=return`;
    await waitFor(() =>
      expect(authClient.linkSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL,
        errorCallbackURL: callbackURL,
      }),
    );
    expect(authClient.linkSocial).toHaveBeenCalledTimes(1);
    expect(fetchCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('confirms a return only after the server shows Google connected to the initiating ULE user', async () => {
    await connectGoogle(currentUser.id);
    vi.mocked(authClient.listAccounts).mockResolvedValue({
      data: [account('credential'), account('google')],
      error: null,
    });

    renderPage('/account/security?googleLink=return');
    expect(await screen.findByText('Google is connected to this ULE account.')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Google' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toBeEmptyDOMElement();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('ignores a forged success indicator when Better Auth lists no Google account', async () => {
    renderPage('/account/security?googleLink=return&linked=success');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Google connection could not be confirmed.',
    );
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeEnabled();
  });

  it('does not confirm Google if the active session or the account list belongs to a different user', async () => {
    await connectGoogle(currentUser.id);
    vi.mocked(authClient.listAccounts).mockResolvedValue({
      data: [account('google', 'different-ule-user')],
      error: null,
    });
    const view = renderPage('/account/security?googleLink=return');
    expect(await screen.findByRole('alert')).toHaveTextContent('The active ULE account changed.');
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();

    view.unmount();
    vi.mocked(fetchCurrentUser).mockResolvedValue({ user: { ...currentUser, id: 'different-ule-user' } });
    vi.mocked(authClient.listAccounts).mockClear();
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('The active ULE account changed.');
    expect(authClient.listAccounts).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Connect Google' })).not.toBeInTheDocument();
  });

  it('keeps email sign-in visible, retries a failed account list, and hides an unavailable provider action', async () => {
    vi.mocked(useGoogleLoginAvailable).mockReturnValue(false);
    vi.mocked(authClient.listAccounts).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in methods unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Email and password')).toBeInTheDocument();
    expect(useGoogleLoginAvailable).toHaveBeenLastCalledWith(1);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Google' })).not.toBeInTheDocument();
  });

  it('explains a different Google email without treating the callback as a completed link', async () => {
    await connectGoogle(currentUser.id);
    renderPage('/account/security?googleLink=return&error=link_email_mismatch');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a Google account with the same email address as your ULE account.',
    );
    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeEnabled();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
  });
});
