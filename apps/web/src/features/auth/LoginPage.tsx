import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function LoginPage() {
  const { user, isAuthenticated, login, signUp, logout, sessionExpired, clearSessionExpired } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const rawFrom = searchParams.get('from');
  const returnTo = rawFrom ? decodeURIComponent(rawFrom) : '/app';
  const isReasonExpired = searchParams.get('reason') === 'session_expired' || sessionExpired;

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated and not expired, display signed-in status
  if (isAuthenticated && user && !isReasonExpired) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '65vh',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: '440px',
            width: '100%',
            background: 'var(--ui-surface)',
            border: '1px solid var(--ui-border)',
            borderRadius: 'var(--radius-md)',
            padding: '2rem',
            boxShadow: 'var(--shadow-md)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }} aria-hidden="true">
            👋
          </div>
          <h1
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              color: 'var(--ui-text)',
              marginBottom: '0.5rem',
            }}
          >
            Already Signed In
          </h1>
          <p
            style={{
              fontSize: '0.9rem',
              color: 'var(--ui-text-muted)',
              marginBottom: '1.5rem',
            }}
          >
            You are signed in as <strong style={{ color: 'var(--ui-text)' }}>{user.name}</strong> (
            {user.email}).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              style={{
                padding: '0.625rem 1rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: '0.9rem',
                background: 'var(--ui-primary)',
                color: 'var(--ui-primary-contrast)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Continue to {rawFrom ? 'Requested Page' : 'Dashboard'}
            </button>
            <button
              type="button"
              onClick={async () => {
                await logout();
              }}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 500,
                fontSize: '0.875rem',
                background: 'transparent',
                color: 'var(--ui-text)',
                border: '1px solid var(--ui-border)',
                cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError('Please enter both your email address and password.');
      return;
    }

    if (mode === 'signup' && !name.trim()) {
      setFormError('Please enter your full name.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signUp({ email, password, name });
      } else {
        await login({ email, password });
      }
      clearSessionExpired();
      navigate(returnTo, { replace: true });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please verify your credentials.';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '65vh',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          background: 'var(--ui-surface)',
          border: '1px solid var(--ui-border)',
          borderRadius: 'var(--radius-md)',
          padding: '2rem',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <span
            style={{
              background: 'var(--ui-primary)',
              color: 'var(--ui-primary-contrast)',
              fontWeight: 700,
              fontSize: '0.9rem',
              padding: '3px 8px',
              borderRadius: 'var(--radius-sm)',
              letterSpacing: '0.05em',
            }}
          >
            ULE
          </span>
          <h1
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              color: 'var(--ui-text)',
              marginTop: '0.75rem',
              marginBottom: '0.25rem',
            }}
          >
            {mode === 'signin' ? 'Sign In to ULE' : 'Create ULE Account'}
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: 0 }}>
            {mode === 'signin'
              ? 'Enter your credentials to access your courses and workspace.'
              : 'Register to start learning and tracking evidence.'}
          </p>
        </div>

        {/* Session expired friendly banner */}
        {isReasonExpired && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              background: 'var(--ui-warning-bg)',
              border: '1px solid var(--ui-warning)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.625rem 0.875rem',
              marginBottom: '1.25rem',
              color: 'var(--ui-warning)',
              fontSize: '0.85rem',
            }}
          >
            <span aria-hidden="true">⚠️</span>
            <div>
              <strong>Session Expired:</strong> Your previous session has timed out. Please sign in
              again to continue where you left off.
            </div>
          </div>
        )}

        {/* Error notification */}
        {formError && (
          <div
            role="alert"
            style={{
              background: 'var(--ui-danger-bg)',
              border: '1px solid var(--ui-danger)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.625rem 0.875rem',
              marginBottom: '1.25rem',
              color: 'var(--ui-danger)',
              fontSize: '0.85rem',
              fontWeight: 500,
            }}
          >
            {formError}
          </div>
        )}

        {/* Mode switcher tabs */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--ui-border)',
            marginBottom: '1.25rem',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            onClick={() => {
              setMode('signin');
              setFormError(null);
            }}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: 'transparent',
              border: 'none',
              borderBottom: mode === 'signin' ? '2px solid var(--ui-primary)' : '2px solid transparent',
              color: mode === 'signin' ? 'var(--ui-primary)' : 'var(--ui-text-muted)',
              fontWeight: mode === 'signin' ? 600 : 400,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            onClick={() => {
              setMode('signup');
              setFormError(null);
            }}
            style={{
              flex: 1,
              padding: '0.5rem',
              background: 'transparent',
              border: 'none',
              borderBottom: mode === 'signup' ? '2px solid var(--ui-primary)' : '2px solid transparent',
              color: mode === 'signup' ? 'var(--ui-primary)' : 'var(--ui-text-muted)',
              fontWeight: mode === 'signup' ? 600 : 400,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {mode === 'signup' && (
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="auth-name"
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--ui-text)',
                  marginBottom: '0.25rem',
                }}
              >
                Full Name
              </label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                required
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--ui-border)',
                  background: 'var(--ui-surface)',
                  color: 'var(--ui-text)',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="auth-email"
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--ui-text)',
                marginBottom: '0.25rem',
              }}
            >
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="learner@ule.internal"
              required
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-surface)',
                color: 'var(--ui-text)',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="auth-password"
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--ui-text)',
                marginBottom: '0.25rem',
              }}
            >
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-surface)',
                color: 'var(--ui-text)',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '0.625rem',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '0.9rem',
              background: 'var(--ui-primary)',
              color: 'var(--ui-primary-contrast)',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
              transition: 'background 0.15s ease',
            }}
          >
            {submitting
              ? mode === 'signin'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
          <Link
            to="/dev/verification"
            style={{
              fontSize: '0.8rem',
              color: 'var(--ui-text-muted)',
              textDecoration: 'none',
            }}
          >
            🔧 Need technical verification tools? Open Developer Verification
          </Link>
        </div>
      </div>
    </div>
  );
}
