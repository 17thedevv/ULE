import React, { useState } from 'react';
import {
  ABRunDto,
  ClozeLearnerView,
  MultipleChoiceLearnerView,
  VideoLearnerView,
} from '@ule/contracts';
import { executeRunCommand } from '../../services/abp';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

interface LearningPlayerProps {
  run: ABRunDto;
  onRunUpdated: (updatedRun: ABRunDto) => void;
  onClose: () => void;
}

export function LearningPlayer({ run, onRunUpdated, onClose }: LearningPlayerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [clozeAnswers, setClozeAnswers] = useState<Record<string, string>>({});

  const blockTypeId = run.block.blockTypeId;
  const isClosed = run.status === 'CLOSED';

  const handleCompleteVideo = async () => {
    try {
      setLoading(true);
      setError(null);
      const idempotencyKey = `finish_${run.id}_${Date.now()}`;
      const updated = await executeRunCommand(run.id, {
        command: 'FINISH',
        idempotencyKey,
      });
      onRunUpdated(updated);
      setStatusMessage('Video completed! Activity progress updated (strictly non-mastery).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete video activity.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestHint = async () => {
    try {
      setLoading(true);
      setError(null);
      const idempotencyKey = `hint_${run.id}_${Date.now()}`;
      const updated = await executeRunCommand(run.id, {
        command: 'REQUEST_HINT',
        idempotencyKey,
      });
      onRunUpdated(updated);
      setStatusMessage('Hint delivered by server. Support provenance recorded as SERVER_OBSERVED.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request hint.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitMultipleChoice = async () => {
    if (!selectedOptionId) return;
    try {
      setLoading(true);
      setError(null);
      const idempotencyKey = `submit_mcq_${run.id}_${Date.now()}`;
      const updated = await executeRunCommand(run.id, {
        command: 'SUBMIT_RESPONSE',
        payload: { selectedOptionId },
        idempotencyKey,
      });
      onRunUpdated(updated);
      setStatusMessage('Response submitted and evaluated by authoritative server.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit response.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCloze = async () => {
    try {
      setLoading(true);
      setError(null);
      const idempotencyKey = `submit_cloze_${run.id}_${Date.now()}`;
      const updated = await executeRunCommand(run.id, {
        command: 'SUBMIT_RESPONSE',
        payload: { blanks: clozeAnswers },
        idempotencyKey,
      });
      onRunUpdated(updated);
      setStatusMessage('Cloze blanks submitted and normalized by server.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit cloze response.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        border: '2px solid var(--ui-primary)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--ui-surface)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid var(--ui-border)',
          paddingBottom: '0.75rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>
              {blockTypeId === 'video' ? '📺' : blockTypeId === 'cloze' ? '✍️' : '❓'}
            </span>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--ui-text)' }}>
              {run.block.title}
            </h2>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)', margin: '0.25rem 0 0' }}>
            Type: <code>{blockTypeId}</code> | Run: <code>{run.id.slice(0, 8)}…</code> | Attempts:{' '}
            <strong>{run.latestAttempt ? run.latestAttempt.attemptNumber : 0}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Badge
            variant={
              run.status === 'CLOSED'
                ? 'success'
                : run.status === 'ACTIVE'
                  ? 'primary'
                  : 'neutral'
            }
          >
            {run.status} {run.closeReason ? `(${run.closeReason})` : ''}
          </Badge>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Back to Course
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem',
            background: 'var(--ui-danger-bg)',
            border: '1px solid var(--ui-danger)',
            color: 'var(--ui-danger)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1rem',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          style={{
            padding: '0.75rem',
            background: 'var(--ui-info-bg)',
            border: '1px solid var(--ui-info)',
            color: 'var(--ui-info)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1rem',
            fontSize: '0.85rem',
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* VIDEO PLAYER */}
      {blockTypeId === 'video' && (() => {
        const video = run.block.learnerConfig as unknown as VideoLearnerView;
        const isEmbed =
          video.url?.includes('youtube.com') ||
          video.url?.includes('youtu.be') ||
          video.url?.includes('vimeo.com');

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                background: 'var(--ui-surface-muted)',
                border: '1px solid var(--ui-border)',
                borderRadius: 'var(--ui-radius-sm)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              {isEmbed ? (
                <iframe
                  title={run.block.title || 'Video Resource'}
                  src={video.url}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{
                    width: '100%',
                    height: '360px',
                    border: 'none',
                    display: 'block',
                  }}
                />
              ) : (
                <video
                  controls
                  preload="metadata"
                  src={video.url}
                  style={{
                    width: '100%',
                    maxHeight: '420px',
                    backgroundColor: '#000000',
                    display: 'block',
                  }}
                >
                  <track kind="captions" />
                  Your browser does not support HTML5 video streaming. Direct resource:{' '}
                  <a href={video.url} target="_blank" rel="noopener noreferrer">
                    {video.url}
                  </a>
                </video>
              )}

              <div
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  borderTop: '1px solid var(--ui-border)',
                  background: 'var(--ui-surface)',
                  fontSize: '0.8rem',
                  color: 'var(--ui-text-muted)',
                }}
              >
                <span>
                  Source: <code>{video.url}</code>
                </span>
                {video.durationSeconds && (
                  <span>
                    Duration: ~{Math.round(video.durationSeconds / 60)} min ({video.durationSeconds}s)
                  </span>
                )}
              </div>
            </div>

            {video.transcript && (
              <details
                style={{
                  background: 'var(--ui-surface-subtle)',
                  padding: '0.75rem',
                  borderRadius: 'var(--ui-radius-sm)',
                  border: '1px solid var(--ui-border)',
                }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                  View Video Transcript
                </summary>
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--ui-text-muted)',
                    marginTop: '0.5rem',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {video.transcript}
                </p>
              </details>
            )}

            <div
              style={{
                padding: '0.75rem',
                background: 'var(--ui-warning-bg)',
                border: '1px solid var(--ui-warning)',
                borderRadius: 'var(--ui-radius-sm)',
                fontSize: '0.82rem',
                color: 'var(--ui-warning)',
              }}
            >
              <strong>Pedagogical Invariant:</strong> Video completion is strictly non-evaluatable. It
              updates course activity progress, but creates <em>no score</em> and <em>no mastery claim</em>.
            </div>

            <div>
              <Button
                variant="primary"
                onClick={handleCompleteVideo}
                isLoading={loading}
                disabled={isClosed}
              >
                {isClosed ? '✓ Video Activity Completed' : 'Mark Video Completed'}
              </Button>
            </div>
          </div>
        );
      })()}

      {/* MULTIPLE CHOICE PLAYER */}
      {blockTypeId === 'multiple-choice' && (() => {
        const mcq = run.block.learnerConfig as unknown as MultipleChoiceLearnerView;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--ui-text)', margin: 0 }}>
              {mcq?.question || 'Multiple Choice Question'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {mcq?.options?.map((opt) => {
                const isSelected = selectedOptionId === opt.id;
                return (
                  <label
                    key={opt.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${isSelected ? 'var(--ui-primary)' : 'var(--ui-border)'}`,
                      background: isSelected ? 'var(--ui-info-bg)' : 'var(--ui-surface)',
                      cursor: isClosed ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      name="mcq-option"
                      value={opt.id}
                      checked={isSelected}
                      onChange={() => setSelectedOptionId(opt.id)}
                      disabled={loading || isClosed}
                    />
                    <span style={{ fontSize: '0.95rem', color: 'var(--ui-text)' }}>{opt.text}</span>
                  </label>
                );
              })}
            </div>

            {mcq?.allowHints && (
              <div style={{ borderTop: '1px dashed var(--ui-border)', paddingTop: '0.75rem' }}>
                {run.deliveredHint ? (
                  <div
                    style={{
                      padding: '0.6rem 0.85rem',
                      background: 'var(--ui-warning-bg)',
                      border: '1px solid var(--ui-warning)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.85rem',
                      color: 'var(--ui-warning)',
                    }}
                  >
                    💡 <strong>Delivered Hint:</strong> {run.deliveredHint}
                    <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.9 }}>
                      (Assistance provenance will be authoritatively recorded as <code>SERVER_OBSERVED</code>)
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRequestHint}
                    isLoading={loading}
                    disabled={isClosed}
                  >
                    💡 Request Hint
                  </Button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                onClick={handleSubmitMultipleChoice}
                isLoading={loading}
                disabled={isClosed || !selectedOptionId}
              >
                Submit Answer
              </Button>

              {run.latestAssessment && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)' }}>Latest Evaluation:</span>
                  {run.latestAssessment.isCorrect === null ? (
                    <Badge variant="warning">Deferred Feedback (Withheld)</Badge>
                  ) : run.latestAssessment.isCorrect ? (
                    <Badge variant="success">✓ Correct</Badge>
                  ) : (
                    <Badge variant="danger">✗ Incorrect</Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* CLOZE PLAYER */}
      {blockTypeId === 'cloze' && (() => {
        const cloze = run.block.learnerConfig as unknown as ClozeLearnerView;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--ui-text)', margin: 0 }}>
              {cloze?.prompt || 'Fill in the blanks'}
            </p>

            <Card style={{ lineHeight: '2.4', fontSize: '1rem' }}>
              {cloze?.templateText ? (
                <div>
                  {cloze.templateText.split(/({{[^}]+}})/g).map((part, index) => {
                    const match = part.match(/{{([^}]+)}}/);
                    if (match) {
                      const blankKey = match[1];
                      const blankDef = cloze.targetBlanks?.find((b) => b.blankKey === blankKey);
                      const blankId = blankDef?.id ?? blankKey;

                      return (
                        <input
                          key={index}
                          type="text"
                          aria-label={`Blank ${blankKey}`}
                          value={clozeAnswers[blankId] || ''}
                          onChange={(e) =>
                            setClozeAnswers((prev) => ({
                              ...prev,
                              [blankId]: e.target.value,
                            }))
                          }
                          disabled={loading || isClosed}
                          style={{
                            display: 'inline-block',
                            margin: '0 0.35rem',
                            padding: '0.2rem 0.5rem',
                            border: '1px solid var(--ui-border)',
                            borderRadius: 'var(--radius-sm)',
                            textAlign: 'center',
                            fontSize: '0.95rem',
                            width: '130px',
                            background: 'var(--ui-surface)',
                            color: 'var(--ui-text)',
                          }}
                        />
                      );
                    }
                    return <span key={index}>{part}</span>;
                  })}
                </div>
              ) : (
                <p>No template configured.</p>
              )}
            </Card>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Button
                variant="primary"
                onClick={handleSubmitCloze}
                isLoading={loading}
                disabled={isClosed}
              >
                Submit Cloze Responses
              </Button>

              {run.latestAssessment && (
                <div>
                  {run.latestAssessment.isCorrect === null ? (
                    <Badge variant="warning">Deferred Feedback</Badge>
                  ) : run.latestAssessment.isCorrect ? (
                    <Badge variant="success">✓ Correct</Badge>
                  ) : (
                    <Badge variant="danger">✗ Incorrect</Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
