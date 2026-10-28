export type HealthStatus = 'ok' | 'degraded' | 'down';
export type ComponentStatus = 'up' | 'down';

export interface DatabaseHealth {
  status: ComponentStatus;
  latencyMs?: number;
  error?: string;
}

export interface HealthCheckResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  uptimeSeconds: number;
  database: DatabaseHealth;
}
