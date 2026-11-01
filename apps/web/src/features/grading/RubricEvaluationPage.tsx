import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ExamGradeAppealDto,
  ExamGradeRevisionDto,
  ExamHumanGradeRevisionDto,
} from '@ule/contracts';
import {
  correctExamItemGrade,
  evaluateExamItem,
  fetchAppealsForAttempt,
  fetchGradeRevisions,
  fetchGradingAttempt,
  finalizeExamGrading,
  GradingApiError,
} from '../../services/grading';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

interface GradingItemGrade {
  id: string;
  itemRefId: string;
  questionType: string;
  maxPoints: number;
  awardedPoints?: number;
  isPendingHuman: boolean;
  revision?: number;
}

interface GradingContext {
  id: string;
  status: string;
  learnerId?: string;
  learner?: { name?: string; email?: string };
  assessmentVersion?: {
    assessmentDefinition?: { title: string };
  };
  responses?: Array<{
    itemRefId: string;
    responsePayload?: Record<string, unknown>;
  }>;
  grade?: {
    totalAwardedPoints?: number;
    maxPossiblePoints?: number;
    itemGrades?: GradingItemGrade[];
  };
}

export default function RubricEvaluationPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [gradingContext, setGradingContext] = useState<GradingContext | null>(null);
  const [revisions, setRevisions] = useState<{
    aggregateRevisions: ExamGradeRevisionDto[];
    itemRevisions: ExamHumanGradeRevisionDto[];
  } | null>(null);
  const [appeals, setAppeals] = useState<ExamGradeAppealDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Per-item evaluation input state
  const [evaluatingItemId, setEvaluatingItemId] = useState<string | null>(null);
  const [awardedPointsMap, setAwardedPointsMap] = useState<Record<string, number>>({});
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [correctionReasonMap, setCorrectionReasonMap] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    if (!attemptId) return;
    setLoading(true);
    setError(null);
    try {
      const [context, revs, apps] = await Promise.all([
        fetchGradingAttempt(attemptId) as unknown as Promise<GradingContext>,
        fetchGradeRevisions(attemptId).catch(() => ({ aggregateRevisions: [], itemRevisions: [] })),
        fetchAppealsForAttempt(attemptId).catch(() => []),
      ]);
      setGradingContext(context);
      setRevisions(revs);
      setAppeals(apps);

      // Pre-fill existing awarded points
      if (context.grade?.itemGrades) {
        const initialPoints: Record<string, number> = {};
        for (const ig of context.grade.itemGrades) {
          initialPoints[ig.id] = ig.awardedPoints ?? 0;
        }
        setAwardedPointsMap(initialPoints);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load grading context.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEvaluate = async (itemGrade: GradingItemGrade) => {
    setActionError(null);
    setActionSuccess(null);
    setEvaluatingItemId(itemGrade.id);

    const points = awardedPointsMap[itemGrade.id] ?? 0;
    const feedback = feedbackMap[itemGrade.id] || '';
    const isCorrection = !itemGrade.isPendingHuman && itemGrade.awardedPoints !== undefined;

    try {
      if (isCorrection) {
        const reason = correctionReasonMap[itemGrade.id] || 'Grade revision by educator';
        await correctExamItemGrade(itemGrade.id, {
          awardedPoints: points,
          feedback,
          reason,
          expectedRevision: itemGrade.revision ?? 1,
        });
        setActionSuccess(`Grade for item ${itemGrade.id.slice(0, 8)} corrected successfully.`);
      } else {
        await evaluateExamItem(itemGrade.id, {
          awardedPoints: points,
          feedback,
          expectedRevision: itemGrade.revision ?? 1,
        });
        setActionSuccess(`Item ${itemGrade.id.slice(0, 8)} evaluated successfully.`);
      }
      await loadData();
    } catch (err) {
      if (err instanceof GradingApiError) {
        setActionError(err.message);
      } else {
        setActionError('Failed to record evaluation.');
      }
    } finally {
      setEvaluatingItemId(null);
    }
  };

  const handleFinalize = async () => {
    if (!attemptId) return;
    setActionError(null);
    setActionSuccess(null);
    setFinalizing(true);
    try {
      await finalizeExamGrading(attemptId);
      setActionSuccess('Examination human grading finalized successfully!');
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to finalize grading.';
      setActionError(msg);
    } finally {
      setFinalizing(false);
    }
  };

  if (!attemptId) {
    return (
      <ErrorState
        title="Invalid Attempt"
        message="No examination attempt specified."
        onRetry={() => navigate('/studio/grading')}
      />
    );
  }

  if (loading) {
    return <LoadingState message="Loading grading attempt context…" />;
  }

  if (error || !gradingContext) {
    return (
      <ErrorState
        title="Could not load grading attempt"
        message={error ?? 'Grading context not found.'}
        onRetry={loadData}
      />
    );
  }

  const { learner, assessmentVersion, responses, grade } = gradingContext;
  const itemGrades = grade?.itemGrades || [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <Button variant="ghost" onClick={() => navigate('/studio/grading')} style={{ marginBottom: '0.5rem' }}>
          ← Back to Grading Queue
        </Button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--ui-text)', margin: '0 0 0.25rem' }}>
              Grade Attempt: {assessmentVersion?.assessmentDefinition?.title || 'Examination'}
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: 0 }}>
              Learner: <strong>{learner?.name || learner?.email || gradingContext.learnerId}</strong> | Attempt: <code>{attemptId.slice(0, 8)}…</code>
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Badge variant={gradingContext.status === 'COMPLETED' ? 'success' : 'warning'}>
              {gradingContext.status}
            </Badge>
            {grade && (
              <Badge variant="neutral">
                Score: {grade.totalAwardedPoints} / {grade.maxPossiblePoints} pts
              </Badge>
            )}
          </div>
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

      {/* Item evaluations */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--ui-text)', margin: 0 }}>
          Items Pending / Evaluated ({itemGrades.length})
        </h2>

        {itemGrades.map((itemGrade: GradingItemGrade, index: number) => {
          const resp = responses?.find((r) => r.itemRefId === itemGrade.itemRefId);
          const responsePayload = resp?.responsePayload || {};
          const isPending = itemGrade.isPendingHuman;

          return (
            <Card key={itemGrade.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ui-text)' }}>
                    Item #{index + 1}
                  </span>
                  <Badge variant="neutral">{itemGrade.questionType}</Badge>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)' }}>
                    Max Points: <strong>{itemGrade.maxPoints}</strong>
                  </span>
                  <Badge variant={isPending ? 'warning' : 'success'}>
                    {isPending ? 'Pending Evaluation' : `Graded: ${itemGrade.awardedPoints} pts`}
                  </Badge>
                </div>
              </div>

              {/* Submitted Response Preview */}
              <div
                style={{
                  backgroundColor: 'var(--ui-surface-subtle)',
                  padding: '0.75rem',
                  borderRadius: 'var(--ui-radius-sm)',
                  marginBottom: '1rem',
                  border: '1px solid var(--ui-border)',
                }}
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ui-text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                  Learner Submitted Response:
                </span>
                <div style={{ fontSize: '0.9rem', color: 'var(--ui-text)', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                  {(typeof responsePayload.text === 'string' && responsePayload.text) ||
                    (typeof responsePayload.code === 'string' && responsePayload.code) ||
                    JSON.stringify(responsePayload, null, 2) || (
                      <em>No response provided.</em>
                    )}
                </div>
              </div>

              {/* Scoring Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                    Awarded Points (0 - {itemGrade.maxPoints}):
                    <input
                      type="number"
                      min={0}
                      max={itemGrade.maxPoints}
                      step={0.5}
                      value={awardedPointsMap[itemGrade.id] ?? 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setAwardedPointsMap((prev) => ({ ...prev, [itemGrade.id]: val }));
                      }}
                      style={{
                        display: 'block',
                        marginTop: '0.25rem',
                        padding: '0.35rem 0.5rem',
                        borderRadius: 'var(--ui-radius-sm)',
                        border: '1px solid var(--ui-border)',
                        backgroundColor: 'var(--ui-bg)',
                        color: 'var(--ui-text)',
                        width: 100,
                      }}
                    />
                  </label>

                  <label style={{ flex: 1, minWidth: 200, fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                    Feedback to Learner:
                    <input
                      type="text"
                      placeholder="Optional feedback comment..."
                      value={feedbackMap[itemGrade.id] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFeedbackMap((prev) => ({ ...prev, [itemGrade.id]: val }));
                      }}
                      style={{
                        display: 'block',
                        marginTop: '0.25rem',
                        padding: '0.35rem 0.5rem',
                        borderRadius: 'var(--ui-radius-sm)',
                        border: '1px solid var(--ui-border)',
                        backgroundColor: 'var(--ui-bg)',
                        color: 'var(--ui-text)',
                        width: '100%',
                      }}
                    />
                  </label>
                </div>

                {!isPending && (
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                    Correction Reason (required for regrading):
                    <input
                      type="text"
                      placeholder="Reason for modifying previously finalized grade..."
                      value={correctionReasonMap[itemGrade.id] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCorrectionReasonMap((prev) => ({ ...prev, [itemGrade.id]: val }));
                      }}
                      style={{
                        display: 'block',
                        marginTop: '0.25rem',
                        padding: '0.35rem 0.5rem',
                        borderRadius: 'var(--ui-radius-sm)',
                        border: '1px solid var(--ui-border)',
                        backgroundColor: 'var(--ui-bg)',
                        color: 'var(--ui-text)',
                        width: '100%',
                      }}
                    />
                  </label>
                )}

                <div>
                  <Button
                    variant="secondary"
                    disabled={evaluatingItemId === itemGrade.id}
                    onClick={() => handleEvaluate(itemGrade)}
                  >
                    {evaluatingItemId === itemGrade.id
                      ? 'Saving Evaluation…'
                      : !isPending
                        ? 'Update Grade'
                        : 'Submit Evaluation'}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Finalize Action */}
      <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.25rem' }}>
            Finalize Examination Grading
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: 0 }}>
            Transitions attempt status to COMPLETED, aggregates scores, and releases results per assessment feedback policy.
          </p>
        </div>
        <Button variant="primary" disabled={finalizing} onClick={handleFinalize}>
          {finalizing ? 'Finalizing…' : 'Finalize Grading ✓'}
        </Button>
      </Card>

      {/* Appeals section */}
      {appeals.length > 0 && (
        <Card>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.75rem' }}>
            Filed Appeals ({appeals.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {appeals.map((app) => (
              <div
                key={app.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--ui-radius-sm)',
                  border: '1px solid var(--ui-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Badge variant={app.status === 'OPEN' ? 'warning' : 'neutral'}>{app.status}</Badge>
                    <span style={{ fontSize: '0.85rem', color: 'var(--ui-text)' }}>{app.reason}</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)' }}>
                    Filed: {new Date(app.createdAt).toLocaleString()}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => navigate(`/studio/grading/appeals/${app.id}`)}
                >
                  Review Appeal →
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Revision History Ledger */}
      {revisions && (revisions.aggregateRevisions.length > 0 || revisions.itemRevisions.length > 0) && (
        <Card>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.75rem' }}>
            Audit & Revision Ledger
          </h3>
          <ul style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)', margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {revisions.itemRevisions.map((rev) => (
              <li key={rev.id}>
                <strong>Rev {rev.revision}</strong>: {rev.eventType} on item <code>{rev.examItemGradeId.slice(0, 8)}…</code> — {rev.previousAwardedPoints}pts → <strong>{rev.newAwardedPoints}pts</strong> ({new Date(rev.createdAt).toLocaleString()})
              </li>
            ))}
            {revisions.aggregateRevisions.map((rev) => (
              <li key={rev.id}>
                <strong>Aggregate Rev {rev.revision}</strong>: {rev.eventType} — Total: {rev.previousTotalPoints}pts → <strong>{rev.newTotalPoints}pts</strong> ({new Date(rev.createdAt).toLocaleString()})
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
