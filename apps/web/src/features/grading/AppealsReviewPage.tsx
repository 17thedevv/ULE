import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExamGradeAppealDto, ResolveExamAppealDto } from '@ule/contracts';
import { fetchAppeal, resolveAppeal, reviewAppeal } from '../../services/grading';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

export default function AppealsReviewPage() {
  const { appealId } = useParams<{ appealId: string }>();
  const navigate = useNavigate();

  const [appeal, setAppeal] = useState<ExamGradeAppealDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Review & Resolution state
  const [reviewing, setReviewing] = useState<boolean>(false);
  const [resolving, setResolving] = useState<boolean>(false);
  const [resolutionChoice, setResolutionChoice] = useState<'RESOLVED_UPHELD' | 'RESOLVED_CHANGED' | 'REJECTED'>('RESOLVED_UPHELD');
  const [reviewerNotes, setReviewerNotes] = useState<string>('');
  const [awardedPoints, setAwardedPoints] = useState<number>(0);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadAppeal = useCallback(async () => {
    if (!appealId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAppeal(appealId);
      setAppeal(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load appeal details.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [appealId]);

  useEffect(() => {
    loadAppeal();
  }, [loadAppeal]);

  const handleStartReview = async () => {
    if (!appealId) return;
    setActionError(null);
    setActionSuccess(null);
    setReviewing(true);
    try {
      const updated = await reviewAppeal(appealId);
      setAppeal(updated);
      setActionSuccess('Appeal transitioned to UNDER_REVIEW.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start review.';
      setActionError(msg);
    } finally {
      setReviewing(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealId || !reviewerNotes.trim()) return;

    setActionError(null);
    setActionSuccess(null);
    setResolving(true);
    try {
      const payload: ResolveExamAppealDto = {
        resolution: resolutionChoice,
        reviewerNotes: reviewerNotes.trim(),
      };
      if (resolutionChoice === 'RESOLVED_CHANGED') {
        payload.awardedPoints = awardedPoints;
        payload.correctionReason = correctionReason.trim() || 'Score adjusted upon appeal review';
      }

      const updated = await resolveAppeal(appealId, payload);
      setAppeal(updated);
      setActionSuccess(`Appeal resolved with decision: ${resolutionChoice}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resolve appeal.';
      setActionError(msg);
    } finally {
      setResolving(false);
    }
  };

  if (!appealId) {
    return (
      <ErrorState
        title="Invalid Appeal"
        message="No appeal ID was specified."
        onRetry={() => navigate('/studio/grading')}
      />
    );
  }

  if (loading) {
    return <LoadingState message="Loading appeal details…" />;
  }

  if (error || !appeal) {
    return (
      <ErrorState
        title="Could not load appeal"
        message={error ?? 'Appeal not found.'}
        onRetry={loadAppeal}
      />
    );
  }

  const isResolved =
    appeal.status === 'RESOLVED_UPHELD' ||
    appeal.status === 'RESOLVED_CHANGED' ||
    appeal.status === 'REJECTED';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <Button
          variant="ghost"
          onClick={() => navigate(`/studio/grading/attempts/${appeal.examAttemptId}`)}
          style={{ marginBottom: '0.5rem' }}
        >
          ← Back to Attempt
        </Button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--ui-text)', margin: '0 0 0.25rem' }}>
              Grade Appeal Review
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: 0 }}>
              Attempt: <code>{appeal.examAttemptId.slice(0, 8)}…</code> | Filed by learner: <code>{appeal.learnerId.slice(0, 8)}…</code>
            </p>
          </div>
          <Badge
            variant={
              appeal.status === 'RESOLVED_UPHELD' || appeal.status === 'RESOLVED_CHANGED'
                ? 'success'
                : appeal.status === 'UNDER_REVIEW'
                  ? 'warning'
                  : appeal.status === 'REJECTED'
                    ? 'danger'
                    : 'neutral'
            }
          >
            {appeal.status}
          </Badge>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: '0.75rem', backgroundColor: 'var(--ui-surface)', border: '1px solid var(--ui-danger)', color: 'var(--ui-danger)', borderRadius: 'var(--ui-radius-sm)', fontSize: '0.85rem' }}>
          ⚠️ {actionError}
        </div>
      )}

      {actionSuccess && (
        <div style={{ padding: '0.75rem', backgroundColor: 'var(--ui-surface)', border: '1px solid var(--ui-success)', color: 'var(--ui-success)', borderRadius: 'var(--ui-radius-sm)', fontSize: '0.85rem' }}>
          ✓ {actionSuccess}
        </div>
      )}

      {/* Appeal Details */}
      <Card>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.5rem' }}>
          Learner Contention & Reason
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--ui-text)', backgroundColor: 'var(--ui-surface-subtle)', padding: '0.75rem', borderRadius: 'var(--ui-radius-sm)', border: '1px solid var(--ui-border)' }}>
          {appeal.reason}
        </p>
        <div style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)', marginTop: '0.5rem' }}>
          Filed on {new Date(appeal.createdAt).toLocaleString()} | Baseline revision: {appeal.gradeRevisionAtSubmission}
        </div>
      </Card>

      {/* Review Actions */}
      {appeal.status === 'OPEN' && (
        <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.25rem' }}>
              Accept Appeal into Review
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: 0 }}>
              Transition this appeal status to UNDER_REVIEW so the learner knows you are investigating.
            </p>
          </div>
          <Button variant="primary" disabled={reviewing} onClick={handleStartReview}>
            {reviewing ? 'Accepting…' : 'Start Review'}
          </Button>
        </Card>
      )}

      {/* Resolution Form (if under review or open) */}
      {!isResolved && (
        <Card>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.75rem' }}>
            Issue Appeal Determination
          </h3>
          <form onSubmit={handleResolve} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
              Determination Outcome:
              <select
                value={resolutionChoice}
                onChange={(e) =>
                  setResolutionChoice(
                    e.target.value as 'RESOLVED_UPHELD' | 'RESOLVED_CHANGED' | 'REJECTED',
                  )
                }
                style={{
                  display: 'block',
                  marginTop: '0.25rem',
                  padding: '0.4rem',
                  borderRadius: 'var(--ui-radius-sm)',
                  border: '1px solid var(--ui-border)',
                  backgroundColor: 'var(--ui-bg)',
                  color: 'var(--ui-text)',
                  fontSize: '0.85rem',
                }}
              >
                <option value="RESOLVED_UPHELD">RESOLVED_UPHELD — Original grade stands verified</option>
                <option value="RESOLVED_CHANGED">RESOLVED_CHANGED — Modify points & issue grade correction</option>
                <option value="REJECTED">REJECTED — Appeal rejected</option>
              </select>
            </label>

            {resolutionChoice === 'RESOLVED_CHANGED' && (
              <>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                  New Awarded Points:
                  <input
                    type="number"
                    step={0.5}
                    value={awardedPoints}
                    onChange={(e) => setAwardedPoints(parseFloat(e.target.value) || 0)}
                    style={{
                      display: 'block',
                      marginTop: '0.25rem',
                      padding: '0.4rem',
                      borderRadius: 'var(--ui-radius-sm)',
                      border: '1px solid var(--ui-border)',
                      backgroundColor: 'var(--ui-bg)',
                      color: 'var(--ui-text)',
                      width: 120,
                    }}
                  />
                </label>

                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                  Correction Reason:
                  <input
                    type="text"
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    placeholder="e.g. Discrepancy acknowledged upon rubric re-evaluation"
                    style={{
                      display: 'block',
                      marginTop: '0.25rem',
                      padding: '0.4rem',
                      borderRadius: 'var(--ui-radius-sm)',
                      border: '1px solid var(--ui-border)',
                      backgroundColor: 'var(--ui-bg)',
                      color: 'var(--ui-text)',
                      width: '100%',
                    }}
                  />
                </label>
              </>
            )}

            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
              Reviewer Notes (shared with learner):
              <textarea
                rows={3}
                required
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="Detailed rationale explaining the determination..."
                style={{
                  display: 'block',
                  marginTop: '0.25rem',
                  padding: '0.4rem',
                  borderRadius: 'var(--ui-radius-sm)',
                  border: '1px solid var(--ui-border)',
                  backgroundColor: 'var(--ui-bg)',
                  color: 'var(--ui-text)',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                }}
              />
            </label>

            <div>
              <Button type="submit" variant="primary" disabled={resolving || !reviewerNotes.trim()}>
                {resolving ? 'Submitting Resolution…' : 'Submit Appeal Determination'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Outcome if already resolved */}
      {isResolved && (
        <Card>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.5rem' }}>
            Final Resolution
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--ui-text)', margin: '0 0 0.5rem' }}>
            <strong>Outcome:</strong> {appeal.resolution || appeal.status}
          </p>
          {appeal.reviewerNotes && (
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-text)', margin: '0 0 0.5rem' }}>
              <strong>Reviewer Notes:</strong> {appeal.reviewerNotes}
            </p>
          )}
          {appeal.resolvedAt && (
            <p style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)', margin: 0 }}>
              Resolved on {new Date(appeal.resolvedAt).toLocaleString()}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
