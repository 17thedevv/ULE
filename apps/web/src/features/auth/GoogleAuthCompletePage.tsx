import React, { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { sanitizeReturnUrl } from '../../services/auth';
import { useAuth } from './AuthContext';

export default function GoogleAuthCompletePage() {
  const [params] = useSearchParams();
  const { refreshSession, isAuthenticated, error } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [verifying, setVerifying] = useState(true);
  const destination = sanitizeReturnUrl(params.get('from'));
  const returnTo = destination.split(/[?#]/, 1)[0] === '/auth/complete' ? '/app' : destination;
  const providerError = params.get('error');
  const failed = params.get('failed') === '1' || params.has('error');

  useEffect(() => {
    if (failed) return;
    let current = true;
    void refreshSession().then(() => {
      if (current) setVerifying(false);
    });
    return () => {
      current = false;
    };
  }, [attempt, failed, refreshSession]);

  const loginUrl = (reason?: string) => {
    const query = new URLSearchParams({ from: returnTo });
    if (reason) query.set('google_error', reason);
    return `/login?${query}`;
  };

  if (failed) {
    let reason = 'failed';
    if (providerError === 'access_denied') reason = 'cancelled';
    if (providerError === 'account_not_linked') reason = 'account_not_linked';
    return <Navigate to={loginUrl(reason)} replace />;
  }

  if (verifying) return <LoadingState message="Verifying your ULE session…" />;

  if (error) {
    return (
      <div style={{ maxWidth: '38rem', margin: '2rem auto', display: 'grid', gap: '1rem' }}>
        <ErrorState
          title="Could not verify your session"
          message="Check your connection and retry."
          onRetry={() => {
            setVerifying(true);
            setAttempt((current) => current + 1);
          }}
        />
        <Link to={loginUrl()}>Back to Sign In</Link>
      </div>
    );
  }

  return <Navigate to={isAuthenticated ? returnTo : loginUrl('session')} replace />;
}
