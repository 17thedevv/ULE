import React, { useEffect, useState } from 'react';
import { HealthCheckResponse } from '@ule/contracts';
import { fetchHealth, getApiBaseUrl } from '../services/api';

export const HealthStatus: React.FC = () => {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const loadHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHealth();
      setHealth(data);
      setLastChecked(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown connection error';
      setError(message);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHealth();
  }, []);

  const apiUrl = getApiBaseUrl();

  return (
    <section className="card" aria-label="System Health">
      <div className="card-header">
        <h2>Backend API Connectivity</h2>
        <button
          className="button button-secondary"
          onClick={() => void loadHealth()}
          disabled={loading}
          data-testid="refresh-button"
        >
          {loading ? 'Checking...' : 'Refresh Status'}
        </button>
      </div>

      <p className="endpoint-info">
        Endpoint: <code>{apiUrl}/api/v1/health</code>
      </p>

      {loading && (
        <div className="status-box status-loading" data-testid="status-loading">
          <div className="spinner" />
          <span>Contacting NestJS API...</span>
        </div>
      )}

      {error && !loading && (
        <div className="status-box status-error" data-testid="status-error">
          <div className="badge badge-error">API Unreachable</div>
          <p className="error-message">{error}</p>
          <small>
            Verify that the NestJS backend is running at <code>{apiUrl}</code> and that
            CORS allows requests from this origin.
          </small>
        </div>
      )}

      {health && !loading && (
        <div className="health-details" data-testid="status-success">
          <div className="status-row">
            <span className="label">Overall System:</span>
            <span
              className={`badge badge-${health.status === 'ok' ? 'success' : 'warning'}`}
              data-testid="overall-status-badge"
            >
              {health.status.toUpperCase()}
            </span>
          </div>

          <div className="status-row">
            <span className="label">API Version:</span>
            <span className="value"><code>{health.version}</code></span>
          </div>

          <div className="status-row">
            <span className="label">Backend Uptime:</span>
            <span className="value">{health.uptimeSeconds}s</span>
          </div>

          <div className="status-row">
            <span className="label">PostgreSQL Database:</span>
            <span
              className={`badge badge-${health.database.status === 'up' ? 'success' : 'warning'}`}
              data-testid="db-status-badge"
            >
              {health.database.status.toUpperCase()}
            </span>
            {health.database.latencyMs !== undefined && (
              <span className="latency">({health.database.latencyMs}ms)</span>
            )}
          </div>

          {health.database.error && (
            <div className="db-error-alert" data-testid="db-error-alert">
              <strong>Database notice:</strong> {health.database.error}
            </div>
          )}

          {lastChecked && (
            <div className="last-checked">
              Last probe: {lastChecked.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
