import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { useAuth } from './AuthContext';

export interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, sessionExpired, error, refreshSession } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState message="Checking session…" />;
  }

  // If session verification failed due to service outage or network error,
  // do not falsely claim unauthenticated credentials; provide retry state.
  if (error && !isAuthenticated && !sessionExpired) {
    return (
      <div style={{ maxWidth: '600px', margin: '2rem auto', padding: '1rem' }}>
        <ErrorState
          title="Service Unavailable"
          message={`Unable to verify session with the server: ${error}`}
          onRetry={refreshSession}
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    const reasonParam = sessionExpired ? '&reason=session_expired' : '';
    return <Navigate to={`/login?from=${returnUrl}${reasonParam}`} replace />;
  }

  return <>{children}</>;
}
