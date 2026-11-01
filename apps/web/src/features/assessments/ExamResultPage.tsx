import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExamGradeAppealDto, ExamResultSummaryDto } from '@ule/contracts';
import {
  createExamAppeal,
  ExamApiError,
  fetchExamAppeals,
  fetchExamResult,
} from '../../services/exams';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { ExamResultView } from '../../components/exam/ExamResultView';

export default function ExamResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [result, setResult] = useState<ExamResultSummaryDto | null>(null);
  const [appeals, setAppeals] = useState<ExamGradeAppealDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Appeal form state
  const [appealReason, setAppealReason] = useState<string>('');
  const [submittingAppeal, setSubmittingAppeal] = useState<boolean>(false);
  const [appealError, setAppealError] = useState<string | null>(null);
  const [appealSuccess, setAppealSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!attemptId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchExamResult(attemptId);
      setResult(res);

      // Load appeals if available
      try {
        const appealList = (await fetchExamAppeals(attemptId)) as ExamGradeAppealDto[];
        setAppeals(appealList);
      } catch {
        // Non-blocking: appeals endpoint may return 404 or empty if none
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load examination result.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAppealSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attemptId || !appealReason.trim()) return;

    setSubmittingAppeal(true);
    setAppealError(null);
    setAppealSuccess(null);
    try {
      await createExamAppeal(attemptId, { reason: appealReason.trim() });
      setAppealSuccess('Your appeal has been submitted and is currently in OPEN status.');
      setAppealReason('');
      // Refresh appeals list
      const updated = (await fetchExamAppeals(attemptId)) as ExamGradeAppealDto[];
      setAppeals(updated);
    } catch (err) {
      if (err instanceof ExamApiError && err.statusCode === 409) {
        setAppealError('An active appeal already exists for this examination attempt.');
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to submit grade appeal.';
        setAppealError(msg);
      }
    } finally {
      setSubmittingAppeal(false);
    }
  };

  if (!attemptId) {
    return (
      <ErrorState
        title="Invalid Request"
        message="No examination attempt ID was specified."
        onRetry={() => navigate('/app/exams')}
      />
    );
  }

  if (loading) {
    return <LoadingState message="Retrieving authoritative examination result…" />;
  }

  if (error || !result) {
    return (
      <ErrorState
        title="Could not load examination result"
        message={error ?? 'Result not found.'}
        onRetry={loadData}
      />
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <ExamResultView
        result={result}
        onReturn={() => {
          navigate('/app/exams');
        }}
      />

      {/* Appeals section */}
      {result.status === 'COMPLETED' && (
        <Card>
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.25rem' }}>
              Grade Appeals & Regrading Requests
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: 0 }}>
              If you believe an item evaluation was inaccurate or rubric criteria were misapplied, you may file a reasoned appeal.
            </p>
          </div>

          {appeals.length > 0 && (
            <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ui-text)', margin: 0 }}>
                Existing Appeals
              </h4>
              {appeals.map((app) => (
                <div
                  key={app.id}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--ui-radius-sm)',
                    border: '1px solid var(--ui-border)',
                    backgroundColor: 'var(--ui-bg)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                      Filed on {new Date(app.createdAt).toLocaleString()}
                    </span>
                    <Badge
                      variant={
                        app.status === 'RESOLVED_CHANGED' || app.status === 'RESOLVED_UPHELD'
                          ? 'success'
                          : app.status === 'UNDER_REVIEW'
                            ? 'warning'
                            : app.status === 'REJECTED'
                              ? 'danger'
                              : 'neutral'
                      }
                    >
                      {app.status}
                    </Badge>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--ui-text)', margin: 0 }}>
                    <strong>Reason:</strong> {app.reason}
                  </p>
                  {app.reviewerNotes && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--ui-text-muted)', margin: 0 }}>
                      <strong>Reviewer Note:</strong> {app.reviewerNotes}
                    </p>
                  )}
                  {app.resolution && (
                    <p style={{ fontSize: '0.82rem', color: 'var(--ui-text-muted)', margin: 0 }}>
                      <strong>Outcome:</strong> {app.resolution}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* New appeal form */}
          <form onSubmit={handleAppealSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
              Submit a Grade Appeal
              <textarea
                value={appealReason}
                onChange={(e) => setAppealReason(e.target.value)}
                rows={3}
                placeholder="Explain the specific factual or rubric discrepancy in detail..."
                required
                style={{
                  width: '100%',
                  marginTop: '0.35rem',
                  padding: '0.5rem',
                  borderRadius: 'var(--ui-radius-sm)',
                  border: '1px solid var(--ui-border)',
                  backgroundColor: 'var(--ui-bg)',
                  color: 'var(--ui-text)',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </label>

            {appealError && (
              <div
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--ui-danger)',
                  padding: '0.5rem',
                  backgroundColor: 'var(--ui-surface)',
                  borderRadius: 'var(--ui-radius-sm)',
                }}
              >
                ⚠️ {appealError}
              </div>
            )}

            {appealSuccess && (
              <div
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--ui-success)',
                  padding: '0.5rem',
                  backgroundColor: 'var(--ui-surface)',
                  borderRadius: 'var(--ui-radius-sm)',
                }}
              >
                ✓ {appealSuccess}
              </div>
            )}

            <div>
              <Button
                type="submit"
                variant="secondary"
                disabled={submittingAppeal || !appealReason.trim()}
              >
                {submittingAppeal ? 'Submitting Appeal…' : 'Submit Appeal'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
