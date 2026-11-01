import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { EmptyState } from '../states/EmptyState';
import { ErrorState } from '../states/ErrorState';
import { LoadingState } from '../states/LoadingState';

describe('Shared UI Primitives & States (UI-01)', () => {
  describe('Button', () => {
    it('renders accessible button with variant and size', () => {
      render(
        <Button variant="primary" size="lg">
          Submit Action
        </Button>,
      );
      const btn = screen.getByRole('button', { name: /submit action/i });
      expect(btn).toBeInTheDocument();
      expect(btn).not.toBeDisabled();
    });

    it('handles loading state with aria-busy', () => {
      render(<Button isLoading>Processing</Button>);
      const btn = screen.getByRole('button', { name: /processing/i });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Card', () => {
    it('renders children within a surface container', () => {
      render(
        <Card>
          <h3>Card Title</h3>
          <p>Card Body</p>
        </Card>,
      );
      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Card Body')).toBeInTheDocument();
    });
  });

  describe('Badge', () => {
    it('renders with accessible status text and variant', () => {
      render(<Badge variant="success">Completed</Badge>);
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
  });

  describe('LoadingState', () => {
    it('renders polite live region for screen readers', () => {
      render(<LoadingState message="Fetching data…" />);
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('Fetching data…');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('EmptyState', () => {
    it('renders title, description and optional action', () => {
      render(
        <EmptyState
          title="No items found"
          description="Try creating one now."
          action={<button>Create Item</button>}
        />,
      );
      expect(screen.getByText('No items found')).toBeInTheDocument();
      expect(screen.getByText('Try creating one now.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create item/i })).toBeInTheDocument();
    });
  });

  describe('ErrorState', () => {
    it('renders alert region with retry trigger', () => {
      const onRetry = () => {};
      render(
        <ErrorState
          title="Failed to load"
          message="Connection timed out"
          onRetry={onRetry}
        />,
      );
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
      expect(screen.getByText('Connection timed out')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });
});
