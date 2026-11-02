import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LoadingState } from '../../components/states/LoadingState';
import { useAuth } from './AuthContext';

export interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, sessionExpired } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState message="Checking session…" />;
  }

  if (!isAuthenticated) {
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    const reasonParam = sessionExpired ? '&reason=session_expired' : '';
    return <Navigate to={`/login?from=${returnUrl}${reasonParam}`} replace />;
  }

  return <>{children}</>;
}
