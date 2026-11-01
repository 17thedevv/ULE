import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        color: 'var(--ui-text-muted)',
      }}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: '2.5rem', lineHeight: 1 }}
      >
        {icon}
      </span>
      <p
        style={{
          fontWeight: 600,
          fontSize: '1rem',
          color: 'var(--ui-text)',
          margin: 0,
        }}
      >
        {title}
      </p>
      {description && (
        <p style={{ fontSize: '0.875rem', margin: 0, maxWidth: '28rem' }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: '0.5rem' }}>{action}</div>}
    </div>
  );
}
