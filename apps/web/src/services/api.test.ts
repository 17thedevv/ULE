import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthCheckResponse } from '@ule/contracts';
import { fetchHealth, getApiBaseUrl } from './api';

describe('Frontend API Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return default localhost:3000 if VITE_API_BASE_URL is not set', () => {
    const originalEnv = import.meta.env.VITE_API_BASE_URL;
    try {
      (import.meta.env as Record<string, unknown>).VITE_API_BASE_URL = '';
      expect(getApiBaseUrl()).toBe('http://localhost:3000');
    } finally {
      (import.meta.env as Record<string, unknown>).VITE_API_BASE_URL = originalEnv;
    }
  });

  it('should call GET /api/v1/health over HTTP with appropriate headers', async () => {
    const mockPayload: HealthCheckResponse = {
      status: 'ok',
      timestamp: '2026-10-27T14:00:00.000Z',
      version: 'v1',
      uptimeSeconds: 120,
      database: {
        status: 'up',
        latencyMs: 3,
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => mockPayload,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchHealth();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/api/v1/health');
    expect(result).toEqual(mockPayload);
  });

  it('should handle degraded 503 response and still parse HealthCheckResponse payload', async () => {
    const mockDegraded: HealthCheckResponse = {
      status: 'degraded',
      timestamp: '2026-10-27T14:00:00.000Z',
      version: 'v1',
      uptimeSeconds: 120,
      database: {
        status: 'down',
        error: 'Database connection failed',
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      status: 503,
      json: async () => mockDegraded,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchHealth();

    expect(result.status).toBe('degraded');
    expect(result.database.status).toBe('down');
  });

  it('should throw an error when API returns unexpected HTTP error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 500,
      statusText: 'Internal Server Error',
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHealth()).rejects.toThrow(
      'API responded with unexpected HTTP status 500',
    );
  });
});
