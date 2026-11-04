import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function ForbiddenPage() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleSwitchAccount = async () => {
    await logout();
    navigate('/login');
  };

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
          maxWidth: '500px',
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
          ⛔
        </div>

        <span
          style={{
            display: 'inline-block',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--ui-danger)',
            background: 'var(--ui-danger-bg)',
            border: '1px solid var(--ui-danger)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '0.75rem',
          }}
        >
          403 Forbidden
        </span>

        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: 'var(--ui-text)',
            margin: '0 0 0.75rem',
          }}
        >
          Access Denied
        </h1>

        <p
          style={{
            fontSize: '0.925rem',
            lineHeight: 1.5,
            color: 'var(--ui-text-muted)',
            margin: '0 0 1.25rem',
          }}
        >
          You do not have permission to view or manage this resource. Authoritative
          server-side authorization policies restrict access to enrolled learners, assigned
          graders, or resource owners.
        </p>

        {user && (
          <div
            style={{
              fontSize: '0.825rem',
              color: 'var(--ui-text-muted)',
              background: 'var(--ui-surface-muted)',
              border: '1px solid var(--ui-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.5rem 0.75rem',
              marginBottom: '1.75rem',
            }}
          >
            Signed in as: <strong style={{ color: 'var(--ui-text)' }}>{user.name}</strong> ({user.email})
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <Link
            to="/app"
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
            }}
          >
            Return to Dashboard
          </Link>

          <button
            type="button"
            onClick={handleSwitchAccount}
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
              border: '1px solid var(--ui-border)',
              cursor: 'pointer',
            }}
          >
            Sign In with Different Account
          </button>
        </div>
      </div>
    </div>
  );
}
