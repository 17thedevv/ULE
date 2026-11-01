import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LearnerEligibleExamDto } from '@ule/contracts';
import { fetchEligibleExams, startExamAttempt, ExamApiError } from '../../services/exams';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

export default function ExamsPage() {
  const [exams, setExams] = useState<LearnerEligibleExamDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingVersionId, setStartingVersionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    setError(null);
    setActionError(null);
    fetchEligibleExams()
      .then(setExams)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load exams';
        setError(msg);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleStart = async (versionId: string) => {
    setActionError(null);
    setStartingVersionId(versionId);
    try {
      const attempt = await startExamAttempt(versionId);
      navigate(`/app/exams/attempts/${attempt.id}`);
    } catch (err) {
      if (err instanceof ExamApiError) {
        if (err.statusCode === 403) {
          setActionError('You are not authorized to attempt this examination or access has been revoked.');
        } else if (err.statusCode === 409) {
          setActionError('A conflicting attempt is already active or attempt limits have been reached.');
        } else {
          setActionError(`Failed to start examination: ${err.message}`);
        }
      } else {
        setActionError('An unexpected error occurred while starting the examination.');
      }
    } finally {
      setStartingVersionId(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1
          style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            color: 'var(--ui-text)',
            margin: '0 0 0.25rem',
          }}
        >
          Assessment Center
        </h1>
        <p
          style={{
            color: 'var(--ui-text-muted)',
            fontSize: '0.9rem',
            margin: 0,
          }}
        >
          Examinations and authoritative assessments you are eligible to take.
        </p>
      </div>

      {actionError && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            backgroundColor: 'var(--ui-surface)',
            border: '1px solid var(--ui-danger)',
            borderRadius: 'var(--ui-radius-sm)',
            color: 'var(--ui-danger)',
            fontSize: '0.85rem',
          }}
        >
          ⚠️ {actionError}
        </div>
      )}

      {loading && <LoadingState message="Loading assessments…" />}
      {!loading && error && (
        <ErrorState
          title="Could not load assessments"
          message="Please check your connection and try again."
          onRetry={load}
        />
      )}
      {!loading && !error && exams !== null && exams.length === 0 && (
        <EmptyState
          icon="📝"
          title="No assessments available"
          description="You do not have any eligible exams at this time. Assessments become available when a course owner grants you access."
        />
      )}
      {!loading && !error && exams && exams.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {exams.map((exam) => {
            const hasActiveAttempt =
              exam.activeAttempt && exam.activeAttempt.status === 'IN_PROGRESS';
            const hasCompletedAttempt =
              exam.latestAttempt && exam.latestAttempt.status !== 'IN_PROGRESS';
            const attemptsExhausted =
              exam.maxAttempts > 0 && exam.existingAttemptsCount >= exam.maxAttempts;

            return (
              <Card key={exam.assessmentVersionId} style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.5rem',
                  }}
                >
                  <h3
                    style={{
                      fontSize: '1.05rem',
                      fontWeight: 600,
                      color: 'var(--ui-text)',
                      margin: 0,
                    }}
                  >
                    {exam.title ?? 'Untitled Assessment'}
                  </h3>
                  <Badge variant={exam.durationMinutes !== null ? 'warning' : 'neutral'}>
                    {exam.durationMinutes !== null ? `⏱ ${exam.durationMinutes}min` : 'Untimed'}
                  </Badge>
                </div>

                {exam.description && (
                  <p
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--ui-text-muted)',
                      margin: '0 0 0.75rem',
                      lineHeight: 1.5,
                      flex: 1,
                    }}
                  >
                    {exam.description}
                  </p>
                )}

                {exam.instructions && (
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--ui-text-muted)',
                      backgroundColor: 'var(--ui-surface-subtle)',
                      padding: '0.5rem',
                      borderRadius: 'var(--ui-radius-sm)',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <strong>Instructions:</strong> {exam.instructions}
                  </div>
                )}

                <div
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--ui-text-muted)',
                    display: 'flex',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                    marginBottom: '1rem',
                  }}
                >
                  <span>{exam.itemCount} questions</span>
                  <span>{exam.totalPoints} points</span>
                  {exam.passingScore !== null && <span>Pass: {exam.passingScore} pts</span>}
                  {exam.maxAttempts > 0 && (
                    <span>
                      {exam.existingAttemptsCount}/{exam.maxAttempts} attempts used
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 'auto' }}>
                  {hasActiveAttempt && (
                    <Button
                      variant="primary"
                      onClick={() => navigate(`/app/exams/attempts/${exam.activeAttempt!.id}`)}
                    >
                      Resume Attempt →
                    </Button>
                  )}

                  {!hasActiveAttempt && !attemptsExhausted && (
                    <Button
                      variant="primary"
                      disabled={startingVersionId === exam.assessmentVersionId}
                      onClick={() => handleStart(exam.assessmentVersionId)}
                    >
                      {startingVersionId === exam.assessmentVersionId
                        ? 'Starting Attempt…'
                        : exam.existingAttemptsCount > 0
                          ? 'Retake Assessment'
                          : 'Start Assessment'}
                    </Button>
                  )}

                  {attemptsExhausted && !hasActiveAttempt && (
                    <Badge variant="neutral">Attempts Exhausted</Badge>
                  )}

                  {hasCompletedAttempt && (
                    <Button
                      variant="secondary"
                      onClick={() => navigate(`/app/exams/attempts/${exam.latestAttempt!.id}/result`)}
                    >
                      View Latest Result
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
