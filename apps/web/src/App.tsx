import React from 'react';
import { AuthCourseStudio } from './components/AuthCourseStudio';
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
              <p className="subtitle">
                Phase 1A: Course Core, Ownership &amp; Versioning
              </p>
            </div>
          </div>
          <div className="header-meta">
            <span className="tag">React + Vite</span>
            <span className="tag">NestJS</span>
            <span className="tag">Better Auth</span>
            <span className="tag">Prisma 7</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="grid">
          <div className="column">
            <AuthCourseStudio />
          </div>

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
                  <strong>Immutability &amp; Ownership:</strong> Courses are private by default;
                  version snapshots are immutable; public publication is disabled without editorial review.
                </li>
              </ul>
            </section>

            <section className="card">
              <h2>Developer Resources</h2>
              <div className="resource-list">
                <a
                  href={`${apiUrl}/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="resource-link"
                >
                  <span className="resource-icon">📚</span>
                  <div>
                    <strong>OpenAPI Documentation (Swagger)</strong>
                    <p className="resource-desc">Explore canonical /api/v1 endpoints</p>
                  </div>
                </a>
                <a
                  href={`${apiUrl}/api/v1/health`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="resource-link"
                >
                  <span className="resource-icon">🩺</span>
                  <div>
                    <strong>Direct Health Check</strong>
                    <p className="resource-desc">Live readiness &amp; liveness JSON endpoint</p>
                  </div>
                </a>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>Universal Learning Engine (ULE) &bull; Phase 1A Implementation</p>
      </footer>
    </div>
  );
};

export default App;
