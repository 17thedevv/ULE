import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthCheckResponse } from '@ule/contracts';
import App from './App';
import * as apiService from './services/api';

describe('App Component (Frontend Architectural Boundary & UI State)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('demonstrates frontend consumes the API contract over HTTP rather than accessing database', async () => {
    // Spy on the HTTP API service
    const fetchHealthSpy = vi.spyOn(apiService, 'fetchHealth').mockResolvedValue({
      status: 'ok',
      timestamp: '2026-10-27T14:15:00.000Z',
      version: 'v1',
      uptimeSeconds: 42,
      database: {
        status: 'up',
        latencyMs: 2,
      },
    });

    render(<App />);

    // Verify loading indicator displays while HTTP request is in-flight
    expect(screen.getByTestId('status-loading')).toBeInTheDocument();

    // Verify it called the HTTP API function
    await waitFor(() => {
      expect(fetchHealthSpy).toHaveBeenCalledTimes(1);
    });

    // Verify data from contract is displayed in the UI
    await waitFor(() => {
      expect(screen.getByTestId('status-success')).toBeInTheDocument();
    });

    expect(screen.getByTestId('overall-status-badge')).toHaveTextContent('OK');
    expect(screen.getByTestId('db-status-badge')).toHaveTextContent('UP');
    expect(screen.getByText('42s')).toBeInTheDocument();

    // Confirm that frontend runtime environment does NOT have access to DATABASE_URL or Prisma
    expect(typeof (process?.env?.DATABASE_URL)).toBe('undefined');
  });

  it('renders failure state when backend API is unreachable', async () => {
    vi.spyOn(apiService, 'fetchHealth').mockRejectedValue(
      new Error('Failed to fetch from backend: Network error'),
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('status-error')).toBeInTheDocument();
    });

    expect(screen.getByText('API Unreachable')).toBeInTheDocument();
    expect(
      screen.getByText(/Failed to fetch from backend: Network error/),
    ).toBeInTheDocument();
  });

  it('supports refreshing health status on button click', async () => {
    const mockHealth: HealthCheckResponse = {
      status: 'ok',
      timestamp: '2026-10-27T14:15:00.000Z',
      version: 'v1',
      uptimeSeconds: 100,
      database: { status: 'up', latencyMs: 5 },
    };

    const fetchHealthSpy = vi
      .spyOn(apiService, 'fetchHealth')
      .mockResolvedValue(mockHealth);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('status-success')).toBeInTheDocument();
    });

    const refreshButton = screen.getByTestId('refresh-button');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(fetchHealthSpy).toHaveBeenCalledTimes(2);
    });
  });
});
