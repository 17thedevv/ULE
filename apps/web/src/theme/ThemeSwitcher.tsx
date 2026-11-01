import React from 'react';
import {
  THEME_PREFERENCES,
  ThemePreference,
  resolveTheme,
} from './theme';
import { useTheme } from './ThemeProvider';

const LABELS: Record<ThemePreference, string> = {
  system: 'Auto',
  paper: 'Paper',
  midnight: 'Midnight',
  forest: 'Forest',
  contrast: 'Contrast',
};

const ICONS: Record<ThemePreference, string> = {
  system: '☀︎',
  paper: '📄',
  midnight: '🌙',
  forest: '🌿',
  contrast: '◑',
};

interface ThemeSwitcherProps {
  compact?: boolean;
}

export function ThemeSwitcher({ compact = false }: ThemeSwitcherProps) {
  const { preference, setPreference } = useTheme();
  const effective = resolveTheme(preference);

  return (
    <div
      role="group"
      aria-label="Theme"
      style={{
        display: 'flex',
        gap: '4px',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      {THEME_PREFERENCES.map((p) => {
        const isActive = p === preference;
        const label = LABELS[p];
        const icon = ICONS[p];
        const description =
          p === 'system'
            ? `Auto — currently resolves to ${effective}`
            : label;

        return (
          <button
            key={p}
            type="button"
            aria-pressed={isActive}
            aria-label={description}
            title={description}
            onClick={() => setPreference(p)}
            style={{
              cursor: 'pointer',
              border: `2px solid ${isActive ? 'var(--ui-primary)' : 'var(--ui-border)'}`,
              borderRadius: 'var(--radius-sm)',
              background: isActive
                ? 'var(--ui-primary)'
                : 'var(--ui-surface-muted)',
              color: isActive
                ? 'var(--ui-primary-contrast)'
                : 'var(--ui-text-muted)',
              padding: compact ? '4px 8px' : '4px 10px',
              fontSize: compact ? '0.75rem' : '0.78rem',
              fontWeight: 600,
              lineHeight: 1.2,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <span aria-hidden="true">{icon}</span>
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
