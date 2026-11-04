import { AuthApiError, checkAuthStatus, fetchCurrentUser } from './auth';
import { authClient } from './auth-client';

export const SIGN_IN_METHODS_PATH = '/account/security';
const pendingGoogleLinkKey = 'ule.pending-google-link';

export class SignInIdentityChangedError extends Error {
  constructor() {
    super('The active ULE account changed. Return to the account you started with and try again.');
  }
}

async function verifyCurrentIdentity(userId: string): Promise<void> {
  try {
    const { user, session } = await fetchCurrentUser();
    if (user.id !== userId || (session && session.userId !== userId)) {
      throw new SignInIdentityChangedError();
    }
  } catch (error) {
    if (error instanceof AuthApiError) checkAuthStatus({ status: error.statusCode });
    throw error;
  }
}

export async function listSignInMethods(userId: string): Promise<string[]> {
  await verifyCurrentIdentity(userId);
  const result = await authClient.listAccounts();
  if (result.error) {
    checkAuthStatus(result.error);
    throw new AuthApiError(result.error.status, 'Could not retrieve sign-in methods.');
  }
  if (result.data.some((account) => account.userId !== userId)) {
    throw new SignInIdentityChangedError();
  }
  return result.data.map((account) => account.providerId);
}

export function getPendingGoogleLinkUser(): string | null {
  try {
    return window.sessionStorage.getItem(pendingGoogleLinkKey);
  } catch {
    return null;
  }
}

export function clearPendingGoogleLink(): void {
  try {
    window.sessionStorage.removeItem(pendingGoogleLinkKey);
  } catch {
    // An unavailable tab store cannot hold a new link attempt.
  }
}

export async function connectGoogle(userId: string): Promise<void> {
  await verifyCurrentIdentity(userId);
  const callbackURL = new URL(
    `${SIGN_IN_METHODS_PATH}?googleLink=return`,
    window.location.origin,
  ).href;

  // Keep only the initiating ULE user ID in this tab to correlate the return.
  window.sessionStorage.setItem(pendingGoogleLinkKey, userId);
  try {
    const result = await authClient.linkSocial({
      provider: 'google',
      callbackURL,
      errorCallbackURL: callbackURL,
    });
    if (result.error) {
      checkAuthStatus(result.error);
      throw new AuthApiError(result.error.status, 'Could not start the Google connection.');
    }
    if (!result.data.redirect || !result.data.url) {
      throw new Error('Google did not return an authorization redirect.');
    }
  } catch (error) {
    clearPendingGoogleLink();
    throw error;
  }
}
