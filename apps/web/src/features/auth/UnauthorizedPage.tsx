import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { sanitizeReturnUrl } from '../../services/auth';

export default function UnauthorizedPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const rawFrom = searchParams.get('from') || (location.state as { from?: string })?.from || '';
  const safeFrom = sanitizeReturnUrl(rawFrom, '');
  const loginUrl = safeFrom ? `/login?from=${encodeURIComponent(safeFrom)}` : '/login';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: '2rem 1rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          background: 'var(--ui-surface)',
          border: '1px solid var(--ui-border)',
          borderRadius: 'var(--radius-md)',
          padding: '2.5rem 2rem',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div
          style={{
            fontSize: '2.5rem',
            marginBottom: '1rem',
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          🔐
        </div>

        <span
          style={{
            display: 'inline-block',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ui-warning)',
            background: 'var(--ui-warning-bg)',
            border: '1px solid var(--ui-warning)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '0.75rem',
          }}
        >
          401 Unauthorized
        </span>

        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--ui-text)',
            margin: '0 0 0.75rem',
          }}
        >
          Authentication Required
        </h1>

        <p
          style={{
            fontSize: '0.925rem',
            lineHeight: 1.5,
            color: 'var(--ui-text-muted)',
            margin: '0 0 1.75rem',
          }}
        >
          You must be signed in to view this page or perform this action. Your session
          may have expired or you may have navigated here directly.
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <Link
            to={loginUrl}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.625rem 1.25rem',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 600,
              fontSize: '0.9rem',
              background: 'var(--ui-primary)',
              color: 'var(--ui-primary-contrast)',
              textDecoration: 'none',
              transition: 'background 0.15s ease',
            }}
          >
            Sign In with ULE Account
          </Link>

          <Link
            to="/app"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 500,
              fontSize: '0.875rem',
              background: 'transparent',
              color: 'var(--ui-text)',
              textDecoration: 'none',
              border: '1px solid var(--ui-border)',
            }}
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
