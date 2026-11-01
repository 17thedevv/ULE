import React, { lazy, Suspense } from 'react';
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from 'react-router-dom';
import { AppShell } from './AppShell';
import { LoadingState } from '../components/states/LoadingState';

const LearnerDashboard = lazy(() => import('../features/learner/LearnerDashboard'));
const CoursesPage = lazy(() => import('../features/learner/CoursesPage'));
const CourseDetailPage = lazy(() => import('../features/learner/CourseDetailPage'));
const SkillsPage = lazy(() => import('../features/learner/SkillsPage'));
const QuestsPage = lazy(() => import('../features/learner/QuestsPage'));
const ExamsPage = lazy(() => import('../features/assessments/ExamsPage'));
const ExamTakingPage = lazy(() => import('../features/assessments/ExamTakingPage'));
const ExamResultPage = lazy(() => import('../features/assessments/ExamResultPage'));
const StudioPage = lazy(() => import('../features/creator/StudioPage'));
const DevPage = lazy(() => import('../features/dev/DevPage'));

function ComingSoon({ title }: { title: string }) {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--ui-text)' }}>
        {title}
      </h1>
      <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.9rem' }}>
        This module is scheduled for an upcoming productization phase.
        All authoritative backend business services remain active.
      </p>
    </div>
  );
}

export function AppRouter() {
  return (
    <Router>
      <AppShell>
        <Suspense fallback={<LoadingState message="Loading page…" />}>
          <Routes>
            <Route path="/" element={<Navigate to="/app" replace />} />

            {/* Learner Workspace (UI-02) */}
            <Route path="/app" element={<LearnerDashboard />} />
            <Route path="/app/courses" element={<CoursesPage />} />
            <Route path="/app/courses/:courseVersionId" element={<CourseDetailPage />} />
            <Route path="/app/skills" element={<SkillsPage />} />
            <Route path="/app/quests" element={<QuestsPage />} />

            {/* Assessment Center (UI-03) */}
            <Route path="/app/exams" element={<ExamsPage />} />
            <Route path="/app/exams/attempts/:attemptId" element={<ExamTakingPage />} />
            <Route path="/app/exams/attempts/:attemptId/result" element={<ExamResultPage />} />

            {/* Creator Studio (UI-05) */}
            <Route path="/studio" element={<Navigate to="/studio/courses" replace />} />
            <Route path="/studio/courses" element={<StudioPage />} />
            <Route
              path="/studio/grading"
              element={<ComingSoon title="Grading Workspace (UI-04)" />}
            />

            {/* Technical Verification (Preserved) */}
            <Route path="/dev" element={<Navigate to="/dev/verification" replace />} />
            <Route path="/dev/*" element={<DevPage />} />

            {/* Fallback */}
            <Route
              path="*"
              element={
                <div style={{ padding: '2rem' }}>
                  <h1 style={{ color: 'var(--ui-text)', marginBottom: '0.5rem' }}>
                    Page not found
                  </h1>
                  <p style={{ color: 'var(--ui-text-muted)' }}>
                    <a href="/app" style={{ color: 'var(--ui-primary)' }}>
                      Return to Dashboard
                    </a>
                  </p>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </AppShell>
    </Router>
  );
}
