import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  clearPendingGoogleLink,
  connectGoogle,
  getPendingGoogleLinkUser,
  listSignInMethods,
  SIGN_IN_METHODS_PATH,
  SignInIdentityChangedError,
} from '../../services/sign-in-methods';
import { useAuth } from '../auth/AuthContext';
import { useGoogleLoginAvailable } from '../auth/useGoogleLoginAvailable';

function getGoogleLinkError(code: string | null): string {
  switch (code) {
    case 'access_denied':
      return 'The Google connection was canceled. You can try again.';
    case 'email_does_not_match':
    case 'link_email_mismatch':
      return 'Choose a Google account with the same email address as your ULE account.';
    case 'link_session_required':
      return 'Sign in to the ULE account you started with, then try connecting Google again.';
    case 'google_email_unverified':
      return 'Verify your email address in Google before connecting this account.';
    case 'account_already_linked_to_different_user':
      return 'This Google account is already connected to another ULE account.';
    default:
      return 'The Google connection could not be confirmed. You can try again.';
  }
}

type MethodsState =
  | { status: 'loading' }
  | { status: 'ready'; providers: string[] }
  | { status: 'error'; identityChanged: boolean; message: string };

const methodRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '0.5rem',
};

function AccountSignInMethods({ userId, email }: { userId: string; email: string }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [linkReturn] = useState(() => {
    const params = new URLSearchParams(search);
    return params.get('googleLink') === 'return'
      ? { userId: getPendingGoogleLinkUser(), error: params.get('error') }
      : null;
  });
  const [methods, setMethods] = useState<MethodsState>({ status: 'loading' });
  const [retry, setRetry] = useState(0);
  const googleAvailable = useGoogleLoginAvailable(retry);
  const [isConnecting, setIsConnecting] = useState(false);
  const connectInFlight = useRef(false);
  const [linkError, setLinkError] = useState<string>();
  const [linkConfirmed, setLinkConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    const finishReturn = () => {
      if (linkReturn) {
        clearPendingGoogleLink();
        navigate(SIGN_IN_METHODS_PATH, { replace: true });
      }
    };

    async function loadMethods() {
      try {
        if (linkReturn?.userId && linkReturn.userId !== userId) {
          throw new SignInIdentityChangedError();
        }

        const providers = await listSignInMethods(userId);
        if (!active) return;
        setMethods({ status: 'ready', providers });
        if (linkReturn) {
          if (linkReturn.userId === userId && !linkReturn.error && providers.includes('google')) {
            setLinkConfirmed(true);
          } else {
            setLinkError(getGoogleLinkError(linkReturn.userId === userId ? linkReturn.error : null));
          }
        }
        finishReturn();
      } catch (error) {
        if (!active) return;
        const identityChanged = error instanceof SignInIdentityChangedError;
        setMethods({
          status: 'error',
          identityChanged,
          message: identityChanged
            ? error.message
            : 'Could not retrieve your sign-in methods. Try again.',
        });
        if (identityChanged) finishReturn();
      }
    }

    void loadMethods();
    return () => {
      active = false;
    };
  }, [linkReturn, navigate, retry, userId]);

  function retryLoad() {
    setMethods({ status: 'loading' });
    setRetry((attempt) => attempt + 1);
  }

  async function handleConnectGoogle() {
    if (!googleAvailable || connectInFlight.current) return;
    connectInFlight.current = true;
    setIsConnecting(true);
    setLinkError(undefined);
    try {
      await connectGoogle(userId);
    } catch (error) {
      connectInFlight.current = false;
      setIsConnecting(false);
      if (error instanceof SignInIdentityChangedError) {
        setMethods({ status: 'error', identityChanged: true, message: error.message });
      } else {
        setLinkError('Could not start the Google connection. Try again.');
      }
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1rem', maxWidth: '36rem' }}>
      <header>
        <h1>Sign-in Methods</h1>
        <p style={{ color: 'var(--ui-text-muted)' }}>Manage how you sign in to {email}.</p>
      </header>

      {methods.status === 'loading' && <LoadingState message="Checking sign-in methods…" />}
      {methods.status === 'error' && (
        <ErrorState
          title="Sign-in methods unavailable"
          message={methods.message}
          onRetry={methods.identityChanged ? undefined : retryLoad}
        />
      )}
      {methods.status === 'ready' && (
        <>
          {linkError && <ErrorState title="Google connection" message={linkError} />}
          {linkConfirmed && <p role="status">Google is connected to this ULE account.</p>}
          <Card>
            <ul
              aria-label="Sign-in methods"
              style={{ display: 'grid', gap: '0.75rem', listStyle: 'none' }}
            >
              {methods.providers.includes('credential') && (
                <li style={methodRow}>
                  <span>Email and password</span>
                  <Badge variant="success">Available</Badge>
                </li>
              )}
              <li style={methodRow}>
                <span>Google</span>
                {methods.providers.includes('google') ? (
                  <Badge variant="success">Connected</Badge>
                ) : googleAvailable ? (
                  <Button
                    type="button"
                    variant="primary"
                    isLoading={isConnecting}
                    onClick={() => void handleConnectGoogle()}
                  >
                    {isConnecting ? 'Redirecting to Google…' : 'Connect Google'}
                  </Button>
                ) : (
                  <Badge>Unavailable</Badge>
                )}
              </li>
            </ul>
          </Card>
          {googleAvailable && !methods.providers.includes('google') && (
            <p style={{ color: 'var(--ui-text-muted)' }}>
              Use the Google account with the same email address as this ULE account.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function SignInMethodsPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <AccountSignInMethods key={user.id} userId={user.id} email={user.email} />;
}
