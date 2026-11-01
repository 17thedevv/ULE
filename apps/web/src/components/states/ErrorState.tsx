import React from 'react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '1rem',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--ui-danger-bg)',
        border: '1px solid var(--ui-danger)',
        color: 'var(--ui-danger)',
      }}
    >
      <p style={{ fontWeight: 600, margin: 0, fontSize: '0.9rem' }}>
        {title}
      </p>
      {message && (
        <p style={{ margin: 0, fontSize: '0.85rem' }}>{message}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            alignSelf: 'flex-start',
            marginTop: '0.25rem',
            cursor: 'pointer',
            background: 'transparent',
            border: '1px solid var(--ui-danger)',
            color: 'var(--ui-danger)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 12px',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
