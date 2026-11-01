import React from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AbpVerificationStudio } from '../../components/AbpVerificationStudio';
import { AuthCourseStudio } from '../../components/AuthCourseStudio';
import { HealthStatus } from '../../components/HealthStatus';
import { LearnerEvidenceStudio } from '../../components/LearnerEvidenceStudio';
import { LearnerExamStudio } from '../../components/LearnerExamStudio';
import { getApiBaseUrl } from '../../services/api';

function DevNav() {
  const loc = useLocation();
  return (
    <nav
      aria-label="Developer tools navigation"
      style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
    >
      {[
        { path: '/dev/verification', label: '🔍 Verification' },
        { path: '/dev/exam', label: '📝 Exam Studio' },
        { path: '/dev/auth', label: '🔐 Auth / Course' },
        { path: '/dev/abp', label: '⚙️ ABP' },
        { path: '/dev/health', label: '🩺 Health' },
      ].map(({ path, label }) => (
        <a
          key={path}
          href={path}
          aria-current={loc.pathname === path ? 'page' : undefined}
          style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-sm)',
            textDecoration: 'none',
            fontSize: '0.82rem',
            fontWeight: 600,
            background: loc.pathname === path ? 'var(--ui-primary)' : 'var(--ui-surface-muted)',
            color: loc.pathname === path ? 'var(--ui-primary-contrast)' : 'var(--ui-text)',
            border: '1px solid var(--ui-border)',
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

export default function DevPage() {
  const apiUrl = getApiBaseUrl();

  return (
    <div>
      <div
        style={{
          background: 'var(--ui-warning-bg)',
          border: '1px solid var(--ui-warning)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.6rem 1rem',
          marginBottom: '1rem',
          fontSize: '0.82rem',
          color: 'var(--ui-warning)',
          fontWeight: 600,
        }}
      >
        🔧 Developer Area — Technical verification interfaces are preserved here.
        Navigating here does not bypass server-side authorization.
      </div>

      <DevNav />

      <Routes>
        <Route
          path="verification"
          element={
            <div className="column" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <LearnerEvidenceStudio />
            </div>
          }
        />
        <Route path="exam" element={<LearnerExamStudio />} />
        <Route path="auth" element={<AuthCourseStudio />} />
        <Route path="abp" element={<AbpVerificationStudio />} />
        <Route
          path="health"
          element={
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <HealthStatus />
              <div className="card">
                <h2>API Resources</h2>
                <div className="resource-list" style={{ marginTop: '0.75rem' }}>
                  <a
                    href={`${apiUrl}/docs`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="resource-link"
                  >
                    <span className="resource-icon">📚</span>
                    <div>
                      <strong>OpenAPI Documentation (Swagger)</strong>
                      <p className="resource-desc">
                        Canonical /api/v1 endpoints
                      </p>
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
                      <strong>Health Check JSON</strong>
                      <p className="resource-desc">
                        Live readiness &amp; liveness endpoint
                      </p>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          }
        />
        <Route
          path="*"
          element={
            <div>
              <p style={{ color: 'var(--ui-text-muted)' }}>
                Select a verification studio above.
              </p>
            </div>
          }
        />
      </Routes>
    </div>
  );
}
