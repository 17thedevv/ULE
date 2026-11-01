import React, { useEffect, useState } from 'react';
import { LearnerEligibleExamDto } from '@ule/contracts';
import { fetchEligibleExams } from '../../services/exams';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

export default function ExamsPage() {
  const [exams, setExams] = useState<LearnerEligibleExamDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
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

  return (
    <div>
      <h1
        style={{
          fontSize: '1.4rem',
          fontWeight: 700,
          color: 'var(--ui-text)',
          marginBottom: '0.25rem',
        }}
      >
        Assessments
      </h1>
      <p
        style={{
          color: 'var(--ui-text-muted)',
          fontSize: '0.9rem',
          marginBottom: '1.5rem',
        }}
      >
        Exams and assessments you are eligible to take.
      </p>

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
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}
        >
          {exams.map((exam) => (
            <Card key={exam.assessmentVersionId}>
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
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: 'var(--ui-text)',
                    margin: 0,
                  }}
                >
                  {exam.title ?? 'Untitled Assessment'}
                </h3>
                <Badge variant={exam.durationMinutes !== null ? 'warning' : 'neutral'}>
                  {exam.durationMinutes !== null
                    ? `⏱ ${exam.durationMinutes}min`
                    : 'Untimed'}
                </Badge>
              </div>
              {exam.description && (
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--ui-text-muted)',
                    margin: '0 0 0.75rem',
                    lineHeight: 1.5,
                  }}
                >
                  {exam.description}
                </p>
              )}
              <div
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--ui-text-muted)',
                  display: 'flex',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <span>{exam.itemCount} questions</span>
                <span>{exam.totalPoints} points</span>
                {exam.maxAttempts > 0 && (
                  <span>
                    {exam.existingAttemptsCount}/{exam.maxAttempts} attempts used
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
