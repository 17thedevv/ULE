import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExamGradingQueueItemDto } from '@ule/contracts';
import { fetchGradingQueue } from '../../services/grading';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

export default function GradingQueuePage() {
  const [queue, setQueue] = useState<ExamGradingQueueItemDto[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadQueue = () => {
    setLoading(true);
    setError(null);
    fetchGradingQueue()
      .then(setQueue)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load grading queue.';
        setError(msg);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadQueue();
  }, []);

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
          Educator Grading Workspace
        </h1>
        <p
          style={{
            color: 'var(--ui-text-muted)',
            fontSize: '0.9rem',
            margin: 0,
          }}
        >
          Authoritative queue of submitted examination attempts with subjective open responses awaiting human rubric evaluation.
        </p>
      </div>

      {loading && <LoadingState message="Loading grading queue…" />}
      {!loading && error && (
        <ErrorState
          title="Could not load grading queue"
          message={error}
          onRetry={loadQueue}
        />
      )}
      {!loading && !error && queue !== null && queue.length === 0 && (
        <EmptyState
          icon="✨"
          title="Grading queue is clear"
          description="There are currently no examination attempts pending educator evaluation for your courses."
        />
      )}
      {!loading && !error && queue && queue.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {queue.map((item) => (
            <Card key={item.attemptId}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--ui-text)', margin: 0 }}>
                      {item.assessmentTitle}
                    </h3>
                    <Badge variant="warning">
                      {item.pendingItemCount} pending {item.pendingItemCount === 1 ? 'item' : 'items'}
                    </Badge>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: '0 0 0.5rem' }}>
                    Learner: <strong>{item.learnerName || item.learnerId}</strong> | Attempt: <code>{item.attemptId.slice(0, 8)}…</code>
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)', margin: 0 }}>
                    Submitted: {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : 'N/A'}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Button
                    variant="primary"
                    onClick={() => navigate(`/studio/grading/attempts/${item.attemptId}`)}
                  >
                    Grade Attempt →
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
