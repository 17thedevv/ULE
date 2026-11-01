import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1rem',
        color: 'var(--ui-text-muted)',
        fontSize: '0.9rem',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '1rem',
          height: '1rem',
          border: '2px solid var(--ui-border)',
          borderTopColor: 'var(--ui-primary)',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 0.8s linear infinite',
          flexShrink: 0,
        }}
      />
      <span>{message}</span>
    </div>
  );
}
