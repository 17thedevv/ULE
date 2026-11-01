import React from 'react';

export type BadgeVariant =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'primary';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const VARIANT_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  neutral: {
    background: 'var(--ui-surface-muted)',
    color: 'var(--ui-text-muted)',
    border: '1px solid var(--ui-border)',
  },
  success: {
    background: 'var(--ui-success-bg)',
    color: 'var(--ui-success)',
  },
  warning: {
    background: 'var(--ui-warning-bg)',
    color: 'var(--ui-warning)',
  },
  danger: {
    background: 'var(--ui-danger-bg)',
    color: 'var(--ui-danger)',
  },
  info: {
    background: 'var(--ui-info-bg)',
    color: 'var(--ui-info)',
  },
  primary: {
    background: 'var(--ui-primary)',
    color: 'var(--ui-primary-contrast)',
  },
};

export function Badge({ variant = 'neutral', children, style }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
        ...VARIANT_STYLES[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}
