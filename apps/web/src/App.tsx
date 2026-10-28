import React from 'react';
import { AbpVerificationStudio } from './components/AbpVerificationStudio';
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
                Phase 1B: Activity Block Protocol &amp; Minimal Runtime
              </p>
            </div>
          </div>
          <div className="header-meta">
            <span className="tag">React + Vite</span>
            <span className="tag">NestJS</span>
            <span className="tag">Better Auth</span>
            <span className="tag">Prisma 7</span>
            <span className="tag">ABP v0.2</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="grid">
          <div className="column">
            <AuthCourseStudio />
            <AbpVerificationStudio />
          </div>

          <div className="column">
            <HealthStatus />

            <section className="card">
              <h2>ABP Architectural Boundaries</h2>
              <ul className="bullet-list">
                <li>
                  <strong>Frontend Isolation:</strong> The React application is strictly an API
                  client of NestJS. Direct database connectivity from the UI is prohibited.
                </li>
                <li>
                  <strong>Protected Evaluator Configuration:</strong> Multiple Choice answer keys
                  and option explanations are never returned to learner runtime endpoints.
                </li>
                <li>
                  <strong>Authoritative Evaluation:</strong> Server-side logic assesses submitted
                  attempts deterministically. Client-supplied scores, passes, or mastery have zero authority.
                </li>
                <li>
                  <strong>Learning Science Invariants:</strong> Video completion is strictly ungraded
                  and never produces a score or mastery. Assisted and independent attempts retain distinct context.
                </li>
                <li>
                  <strong>Pinned Immutability:</strong> Runs execute strictly against pinned immutable
                  CourseVersion snapshots. Subsequent mutable draft edits cannot alter older versions or runs.
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
                    <p className="resource-desc">Explore canonical /api/v1 endpoints including ABP &amp; Runs</p>
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
        <p>Universal Learning Engine (ULE) &bull; Phase 1B Implementation</p>
      </footer>
    </div>
  );
};

export default App;
