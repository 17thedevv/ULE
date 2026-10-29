import React from 'react';
import { AbpVerificationStudio } from './components/AbpVerificationStudio';
import { AuthCourseStudio } from './components/AuthCourseStudio';
import { HealthStatus } from './components/HealthStatus';
import { LearnerEvidenceStudio } from './components/LearnerEvidenceStudio';
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
                Phase 3: Trusted Learning Evidence &amp; Minimal LII Foundation
              </p>
            </div>
          </div>
          <div className="header-meta">
            <span className="tag">React + Vite</span>
            <span className="tag">NestJS</span>
            <span className="tag">Better Auth</span>
            <span className="tag">Prisma 7</span>
            <span className="tag">ABP v0.2</span>
            <span className="tag">Evidence Ledger</span>
            <span className="tag">Minimal LII</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="grid">
          <div className="column">
            <LearnerEvidenceStudio />
            <AuthCourseStudio />
            <AbpVerificationStudio />
          </div>

          <div className="column">
            <HealthStatus />

            <section className="card">
              <h2>Phase 3 Evidence &amp; LII Boundaries</h2>
              <ul className="bullet-list">
                <li>
                  <strong>Private Learner Access:</strong> Course versions remain private and
                  non-discoverable. Learners execute only explicitly granted immutable CourseVersions.
                </li>
                <li>
                  <strong>Idempotent Evidence Ledger:</strong> Trusted Runtime evaluation facts produce
                  normalized, traceable evidence keyed to authenticated learner and pinned activity versions.
                </li>
                <li>
                  <strong>Course-Scoped Skill Identity:</strong> Skills are strictly scoped to parent
                  courses. No cross-course state transfer or ungrounded equivalence.
                </li>
                <li>
                  <strong>Conservative State Projections:</strong> States are derived transparently
                  (INSUFFICIENT_EVIDENCE &rarr; DEVELOPING &rarr; READY_TO_VERIFY). Same-item repetitions
                  and hint-assisted responses never count as independent proof of mastery.
                </li>
                <li>
                  <strong>No Premature Verified Mastery:</strong> Formal Verified Mastery claims remain
                  unavailable until proctored verification criteria and platform standards are verified.
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
                    <p className="resource-desc">Explore canonical /api/v1 endpoints including Evidence &amp; Learner</p>
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
        <p>Universal Learning Engine (ULE) &bull; Phase 3 Implementation</p>
      </footer>
    </div>
  );
};

export default App;
