import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';
import { ThemeProvider } from '../theme/ThemeProvider';

describe('AppShell Component (UI-01)', () => {
  const renderShell = (initialRoute = '/app') =>
    render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <ThemeProvider>
          <AppShell>
            <div data-testid="test-content">Workspace Content</div>
          </AppShell>
        </ThemeProvider>
      </MemoryRouter>,
    );

  it('renders topbar with brand and theme controls', () => {
    renderShell();

    expect(screen.getByText('Universal Learning Engine')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
  });

  it('renders navigation links to primary workspaces', () => {
    renderShell();

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my courses/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /assessments/i })).toBeInTheDocument();
  });

  it('handles mobile sidebar drawer toggle and close on escape', () => {
    renderShell();

    const toggleButton = screen.getByRole('button', { name: /open navigation menu/i });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    // Click hamburger to open
    fireEvent.click(toggleButton);
    expect(screen.getByRole('button', { name: /close navigation menu/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    // Escape closes drawer
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
