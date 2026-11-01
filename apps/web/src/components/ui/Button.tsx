import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--ui-primary)',
    color: 'var(--ui-primary-contrast)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--ui-surface-muted)',
    color: 'var(--ui-text)',
    border: '1px solid var(--ui-border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--ui-primary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--ui-danger-bg)',
    color: 'var(--ui-danger)',
    border: '1px solid var(--ui-danger)',
  },
};

const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '4px 10px', fontSize: '0.8rem', minHeight: '30px' },
  md: { padding: '7px 14px', fontSize: '0.875rem', minHeight: '36px' },
  lg: { padding: '10px 20px', fontSize: '1rem', minHeight: '44px' },
};

export function Button({
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      {...rest}
      disabled={isDisabled}
      aria-busy={isLoading}
      style={{
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        borderRadius: 'var(--radius-sm)',
        fontWeight: 500,
        fontFamily: 'var(--font-sans)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'background 0.15s, opacity 0.15s',
        opacity: isDisabled ? 0.55 : 1,
        lineHeight: 1.25,
        ...VARIANT_STYLES[variant],
        ...SIZE_STYLES[size],
        ...style,
      }}
    >
      {isLoading && (
        <span
          aria-hidden="true"
          style={{
            width: '0.85em',
            height: '0.85em',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.7s linear infinite',
          }}
        />
      )}
      {children}
    </button>
  );
}
