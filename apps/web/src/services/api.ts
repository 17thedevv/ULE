import { HealthCheckResponse } from '@ule/contracts';

/**
 * Returns the configured NestJS API base URL.
 * Falls back to http://localhost:3000 for local development if not set in environment.
 */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

/**
 * Calls the versioned NestJS health check endpoint: GET /api/v1/health.
 *
 * NOTE: The frontend communicates strictly over HTTP as a client to the NestJS API.
 * It never imports Prisma or connects to PostgreSQL directly.
 */
export async function fetchHealth(): Promise<HealthCheckResponse> {
  const baseUrl = getApiBaseUrl();
  const endpoint = `${baseUrl}/api/v1/health`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  // Both 200 (healthy) and 503 (degraded/database down) respond with the HealthCheckResponse payload
  if (response.status === 200 || response.status === 503) {
    const data = (await response.json()) as HealthCheckResponse;
    return data;
  }

  throw new Error(
    `API responded with unexpected HTTP status ${response.status}: ${response.statusText}`,
  );
}
