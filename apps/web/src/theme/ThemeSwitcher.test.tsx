import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeSwitcher } from './ThemeSwitcher';
import { ThemeProvider } from './ThemeProvider';
import { THEME_STORAGE_KEY } from './theme';

describe('ThemeSwitcher Component (UI-01)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dataset.theme = '';
  });

  const renderSwitcher = (compact = false) =>
    render(
      <ThemeProvider>
        <ThemeSwitcher compact={compact} />
      </ThemeProvider>,
    );

  it('renders all 5 theme options (Auto, Paper, Midnight, Forest, Contrast)', () => {
    renderSwitcher();

    expect(screen.getByRole('group', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^auto/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^paper$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^midnight$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^forest$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^contrast$/i })).toBeInTheDocument();
  });

  it('switches theme and persists to localStorage on click without reload', () => {
    renderSwitcher();

    const midnightBtn = screen.getByRole('button', { name: /^midnight$/i });
    fireEvent.click(midnightBtn);

    expect(midnightBtn).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight');
    expect(document.documentElement.dataset.theme).toBe('midnight');
  });

  it('renders in compact mode with icon-only buttons', () => {
    renderSwitcher(true);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
    expect(screen.getByRole('button', { name: /^midnight$/i })).toBeInTheDocument();
  });
});
