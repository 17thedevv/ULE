import React, { lazy, Suspense } from 'react';
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from 'react-router-dom';
import { AppShell } from './AppShell';
import { LoadingState } from '../components/states/LoadingState';
import { AuthProvider } from '../features/auth/AuthContext';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';

const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const GoogleAuthCompletePage = lazy(() => import('../features/auth/GoogleAuthCompletePage'));
const SignInMethodsPage = lazy(() => import('../features/account/SignInMethodsPage'));
const UnauthorizedPage = lazy(() => import('../features/auth/UnauthorizedPage'));
const ForbiddenPage = lazy(() => import('../features/auth/ForbiddenPage'));

const LearnerDashboard = lazy(() => import('../features/learner/LearnerDashboard'));
const CoursesPage = lazy(() => import('../features/learner/CoursesPage'));
const CourseDetailPage = lazy(() => import('../features/learner/CourseDetailPage'));
const SkillsPage = lazy(() => import('../features/learner/SkillsPage'));
const QuestsPage = lazy(() => import('../features/learner/QuestsPage'));
const ExamsPage = lazy(() => import('../features/assessments/ExamsPage'));
const ExamTakingPage = lazy(() => import('../features/assessments/ExamTakingPage'));
const ExamResultPage = lazy(() => import('../features/assessments/ExamResultPage'));
const GradingQueuePage = lazy(() => import('../features/grading/GradingQueuePage'));
const RubricEvaluationPage = lazy(() => import('../features/grading/RubricEvaluationPage'));
const AppealsReviewPage = lazy(() => import('../features/grading/AppealsReviewPage'));
const StudioPage = lazy(() => import('../features/creator/StudioPage'));
const CourseDraftEditor = lazy(() => import('../features/creator/CourseDraftEditor'));
const CourseAccessPage = lazy(() => import('../features/creator/CourseAccessPage'));
const QuestionBankPage = lazy(() => import('../features/creator/QuestionBankPage'));
const DevPage = lazy(() => import('../features/dev/DevPage'));

export function AppRouter() {
  return (
    <Router>
      <AuthProvider>
        <AppShell>
          <Suspense fallback={<LoadingState message="Loading page…" />}>
            <Routes>
              <Route path="/" element={<Navigate to="/app" replace />} />

              {/* Product Authentication & Authorization Views */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/complete" element={<GoogleAuthCompletePage />} />
              <Route
                path="/account/security"
                element={
                  <ProtectedRoute>
                    <SignInMethodsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/401" element={<UnauthorizedPage />} />
              <Route path="/403" element={<ForbiddenPage />} />

              {/* Learner Workspace (UI-02) - Protected */}
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <LearnerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/app/courses"
                element={
                  <ProtectedRoute>
                    <CoursesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/app/courses/:courseVersionId"
                element={
                  <ProtectedRoute>
                    <CourseDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/app/skills"
                element={
                  <ProtectedRoute>
                    <SkillsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/app/quests"
                element={
                  <ProtectedRoute>
                    <QuestsPage />
                  </ProtectedRoute>
                }
              />

              {/* Assessment Center (UI-03) - Protected */}
              <Route
                path="/app/exams"
                element={
                  <ProtectedRoute>
                    <ExamsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/app/exams/attempts/:attemptId"
                element={
                  <ProtectedRoute>
                    <ExamTakingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/app/exams/attempts/:attemptId/result"
                element={
                  <ProtectedRoute>
                    <ExamResultPage />
                  </ProtectedRoute>
                }
              />

              {/* Creator Studio (UI-05) - Protected */}
              <Route
                path="/studio"
                element={
                  <ProtectedRoute>
                    <Navigate to="/studio/courses" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/studio/courses"
                element={
                  <ProtectedRoute>
                    <StudioPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/studio/courses/:courseId/edit"
                element={
                  <ProtectedRoute>
                    <CourseDraftEditor />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/studio/courses/:courseId/versions/:versionId/access"
                element={
                  <ProtectedRoute>
                    <CourseAccessPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/studio/question-bank"
                element={
                  <ProtectedRoute>
                    <QuestionBankPage />
                  </ProtectedRoute>
                }
              />

              {/* Grading Workspace (UI-04) - Protected */}
              <Route
                path="/studio/grading"
                element={
                  <ProtectedRoute>
                    <GradingQueuePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/studio/grading/attempts/:attemptId"
                element={
                  <ProtectedRoute>
                    <RubricEvaluationPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/studio/grading/appeals/:appealId"
                element={
                  <ProtectedRoute>
                    <AppealsReviewPage />
                  </ProtectedRoute>
                }
              />

              {/* Technical Verification (Preserved & Unblocked) */}
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
      </AuthProvider>
    </Router>
  );
}
