import React from 'react';
import { HealthStatus } from './components/HealthStatus';
import { getApiBaseUrl } from './services/api';

export const App: React.FC = () => {
  const apiUrl = getApiBaseUrl();

  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <div className="brand">
            <span className="logo-badge">ULE</span>
            <div>
              <h1>Universal Learning Engine</h1>
              <p className="subtitle">Phase 0: Bootstrap & Architecture Foundation</p>
            </div>
          </div>
          <div className="header-meta">
            <span className="tag">React + Vite</span>
            <span className="tag">NestJS</span>
            <span className="tag">PostgreSQL + Prisma</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="grid">
          <div className="column">
            <HealthStatus />

            <section className="card">
              <h2>Architectural Boundaries</h2>
              <ul className="bullet-list">
                <li>
                  <strong>Frontend Isolation:</strong> The React application is strictly an HTTP
                  client of the NestJS API. Direct database connectivity from the UI is prohibited.
                </li>
                <li>
                  <strong>Authoritative Backend:</strong> All business logic, course verification,
                  and data persistence belong in NestJS domain services.
                </li>
                <li>
                  <strong>Canonical API:</strong> The versioned OpenAPI contract serves Web, future
                  Mobile clients, and MCP tools identically.
                </li>
                <li>
                  <strong>Prisma ORM:</strong> PostgreSQL migrations and data access are managed
                  authoritatively within the NestJS API.
                </li>
              </ul>
            </section>
          </div>

          <div className="column">
            <section className="card">
              <h2>Developer Resources</h2>
              <div className="resource-list">
                <a
                  href={`${apiUrl}/docs`}
                  target="_blank"
                  rel="noreferrer"
                  className="resource-item"
                >
                  <div className="resource-title">OpenAPI (Swagger) Documentation</div>
                  <div className="resource-desc">
                    Explore and test canonical endpoints at <code>{apiUrl}/docs</code>
                  </div>
                </a>

                <div className="resource-item">
                  <div className="resource-title">Shared Contracts Package</div>
                  <div className="resource-desc">
                    Type definitions and schemas exported via <code>@ule/contracts</code>
                  </div>
                </div>

                <div className="resource-item">
                  <div className="resource-title">Authentication Feasibility Spike</div>
                  <div className="resource-desc">
                    Better Auth + NestJS + MCP review located in{' '}
                    <code>docs/technical-spikes/better-auth-nestjs-mcp.md</code>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>ULE Engine &copy; 2026. Licensed under GNU General Public License v3.0.</p>
      </footer>
    </div>
  );
};

export default App;
