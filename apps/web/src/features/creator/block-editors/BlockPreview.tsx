import React, { useState } from 'react';
import {
  ClozeConfig,
  MultipleChoiceConfig,
  VideoConfig,
} from '@ule/contracts';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { normalizeVideoEmbedUrl } from '../../learner/video-embed';

interface BlockPreviewProps {
  blockTypeId: string;
  title: string;
  config: Record<string, unknown>;
  onClose: () => void;
  isUnsaved?: boolean;
}

export function BlockPreview({
  blockTypeId,
  title,
  config,
  onClose,
  isUnsaved = false,
}: BlockPreviewProps) {
  // Learner interactive state for preview (temporary, local-only, no API calls)
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [clozeAnswers, setClozeAnswers] = useState<Record<string, string>>({});
  const [showAuthorKey, setShowAuthorKey] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${title}`}
    >
      <div
        style={{
          backgroundColor: 'var(--ui-surface)',
          border: '1px solid var(--ui-border)',
          borderRadius: 'var(--radius-md)',
          maxWidth: '750px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--ui-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--ui-surface-muted)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Badge variant="primary">Creator Preview</Badge>
              {isUnsaved ? (
                <Badge variant="warning">Unsaved Changes</Badge>
              ) : (
                <Badge variant="success">Saved Configuration</Badge>
              )}
              <span style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                <code>{blockTypeId}</code>
              </span>
            </div>
            <h3
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: 'var(--ui-text)',
                margin: '0.35rem 0 0',
              }}
            >
              {title || 'Untitled Activity'}
            </h3>
          </div>

          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close Preview">
            ✕ Close
          </Button>
        </div>

        {/* Informative Learner Simulation Notice */}
        <div
          style={{
            padding: '0.6rem 1.25rem',
            backgroundColor: 'var(--ui-info-bg)',
            borderBottom: '1px solid var(--ui-border)',
            fontSize: '0.8rem',
            color: 'var(--ui-info)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <span>
            👁️ <strong>Learner View Simulation:</strong> Answer keys are withheld. No attempts or
            progress records are persisted.
          </span>
          {(blockTypeId === 'multiple-choice' || blockTypeId === 'cloze') && (
            <button
              type="button"
              onClick={() => setShowAuthorKey(!showAuthorKey)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ui-primary)',
                fontWeight: 600,
                fontSize: '0.78rem',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {showAuthorKey ? 'Hide Creator Answer Key' : 'Reveal Creator Answer Key'}
            </button>
          )}
        </div>

        {/* Preview Content Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1 }}>
          {/* VIDEO PREVIEW */}
          {blockTypeId === 'video' && (() => {
            const video = config as Partial<VideoConfig>;
            const rawUrl = video.url || '';
            const { embedUrl, isEmbed } = normalizeVideoEmbedUrl(rawUrl);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div
                  style={{
                    background: 'var(--ui-surface-muted)',
                    border: '1px solid var(--ui-border)',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                  }}
                >
                  {isEmbed && embedUrl ? (
                    <iframe
                      title={title || 'Video Resource'}
                      src={embedUrl}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{
                        width: '100%',
                        height: '360px',
                        border: 'none',
                        display: 'block',
                      }}
                    />
                  ) : rawUrl.startsWith('http') || rawUrl.startsWith('/') || rawUrl.startsWith('./') ? (
                    <video
                      controls
                      preload="metadata"
                      src={rawUrl}
                      style={{
                        width: '100%',
                        maxHeight: '380px',
                        backgroundColor: '#000',
                        display: 'block',
                      }}
                    >
                      <track kind="captions" />
                      HTML5 video playback: {rawUrl}
                    </video>
                  ) : (
                    <div
                      style={{
                        padding: '2rem 1rem',
                        textAlign: 'center',
                        color: 'var(--ui-text-muted)',
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 600 }}>⚠️ No playable video URL configured</p>
                      <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                        Configure a valid YouTube, Vimeo, or HTTP/HTTPS video URL in the editor.
                      </p>
                    </div>
                  )}

                  <div
                    style={{
                      padding: '0.5rem 0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: 'var(--ui-text-muted)',
                      borderTop: '1px solid var(--ui-border)',
                      background: 'var(--ui-surface)',
                    }}
                  >
                    <span>
                      URL: <code>{rawUrl || '(none)'}</code>
                    </span>
                    {video.durationSeconds ? (
                      <span>Duration: {video.durationSeconds}s</span>
                    ) : null}
                  </div>
                </div>

                {video.transcript && (
                  <details
                    style={{
                      padding: '0.75rem',
                      background: 'var(--ui-surface-muted)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--ui-border)',
                    }}
                  >
                    <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                      Video Transcript
                    </summary>
                    <p
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--ui-text)',
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
                    padding: '0.65rem 0.85rem',
                    background: 'var(--ui-warning-bg)',
                    border: '1px solid var(--ui-warning)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                    color: 'var(--ui-warning)',
                  }}
                >
                  <strong>Learner Preview Note:</strong> Video completion is strictly non-evaluatable
                  (practice tracking only).
                </div>
              </div>
            );
          })()}

          {/* MULTIPLE CHOICE PREVIEW */}
          {blockTypeId === 'multiple-choice' && (() => {
            const mcq = config as Partial<MultipleChoiceConfig>;
            const options = Array.isArray(mcq.options) ? mcq.options : [];
            const correctId = mcq.answerKey?.correctOptionId;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    color: 'var(--ui-text)',
                    margin: 0,
                  }}
                >
                  {mcq.question || '(No question text configured)'}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {options.map((opt) => {
                    const isSelected = selectedOptionId === opt.id;
                    const isCorrect = showAuthorKey && correctId === opt.id;
                    return (
                      <label
                        key={opt.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.75rem 1rem',
                          borderRadius: 'var(--radius-sm)',
                          border: `1px solid ${
                            isCorrect
                              ? 'var(--ui-success)'
                              : isSelected
                                ? 'var(--ui-primary)'
                                : 'var(--ui-border)'
                          }`,
                          background: isCorrect
                            ? 'var(--ui-success-bg, #f0fdf4)'
                            : isSelected
                              ? 'var(--ui-info-bg)'
                              : 'var(--ui-surface)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="radio"
                          name="preview-mcq-choice"
                          value={opt.id}
                          checked={isSelected}
                          onChange={() => setSelectedOptionId(opt.id)}
                          style={{ cursor: 'pointer' }}
                        />
                        <span style={{ flex: 1, fontSize: '0.925rem', color: 'var(--ui-text)' }}>
                          {opt.text || '(empty choice)'}
                        </span>
                        {isCorrect && (
                          <Badge variant="success">✓ Creator Answer Key</Badge>
                        )}
                      </label>
                    );
                  })}
                </div>

                {mcq.allowHints && (
                  <div style={{ borderTop: '1px dashed var(--ui-border)', paddingTop: '0.75rem' }}>
                    {showHint ? (
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
                        💡 <strong>Hint:</strong> {mcq.hintText || '(No hint text specified)'}
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowHint(true)}
                      >
                        💡 Test Hint Button
                      </Button>
                    )}
                  </div>
                )}

                {showAuthorKey && mcq.answerKey?.explanation && (
                  <Card style={{ background: 'var(--ui-surface-muted)' }}>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--ui-text)' }}>
                      Author Explanation:
                    </strong>
                    <p style={{ fontSize: '0.825rem', color: 'var(--ui-text-muted)', margin: '0.25rem 0 0' }}>
                      {mcq.answerKey.explanation}
                    </p>
                  </Card>
                )}
              </div>
            );
          })()}

          {/* CLOZE PREVIEW */}
          {blockTypeId === 'cloze' && (() => {
            const cloze = config as Partial<ClozeConfig>;
            const text = cloze.templateText || '';
            const blanks = cloze.targetBlanks || [];
            const answerMap = cloze.answerKey?.blanks || {};

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <p
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    color: 'var(--ui-text)',
                    margin: 0,
                  }}
                >
                  {cloze.prompt || 'Fill in the blanks'}
                </p>

                <Card style={{ lineHeight: '2.5', fontSize: '1rem' }}>
                  {text ? (
                    <div>
                      {text.split(/({{[^}]+}})/g).map((part, index) => {
                        const match = part.match(/{{([^}]+)}}/);
                        if (match) {
                          const blankKey = match[1].trim();
                          const blankDef = blanks.find((b) => b.blankKey === blankKey);
                          const accepted = answerMap[blankKey] || [];

                          return (
                            <span
                              key={index}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                margin: '0 0.35rem',
                                verticalAlign: 'baseline',
                              }}
                            >
                              <input
                                type="text"
                                aria-label={`Blank ${blankKey}`}
                                placeholder={`[${blankKey}]`}
                                value={clozeAnswers[blankKey] || ''}
                                onChange={(e) =>
                                  setClozeAnswers({
                                    ...clozeAnswers,
                                    [blankKey]: e.target.value,
                                  })
                                }
                                style={{
                                  padding: '0.2rem 0.5rem',
                                  fontSize: '0.9rem',
                                  borderRadius: 'var(--radius-sm)',
                                  border: `1px solid ${
                                    showAuthorKey ? 'var(--ui-success)' : 'var(--ui-primary)'
                                  }`,
                                  backgroundColor: showAuthorKey
                                    ? 'var(--ui-success-bg, #f0fdf4)'
                                    : 'var(--ui-bg)',
                                  color: 'var(--ui-text)',
                                  width: '140px',
                                }}
                              />
                              {blankDef?.hintText && (
                                <span
                                  title={`Hint: ${blankDef.hintText}`}
                                  style={{
                                    marginLeft: '0.2rem',
                                    fontSize: '0.75rem',
                                    cursor: 'help',
                                  }}
                                >
                                  💡
                                </span>
                              )}
                              {showAuthorKey && (
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--ui-success)',
                                    marginLeft: '0.25rem',
                                  }}
                                >
                                  ({accepted.join(' / ') || 'no answer'})
                                </span>
                              )}
                            </span>
                          );
                        }
                        return <span key={index}>{part}</span>;
                      })}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--ui-text-muted)', margin: 0, fontStyle: 'italic' }}>
                      (No passage template configured)
                    </p>
                  )}
                </Card>

                {showAuthorKey && cloze.answerKey?.explanation && (
                  <Card style={{ background: 'var(--ui-surface-muted)' }}>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--ui-text)' }}>
                      Author Explanation:
                    </strong>
                    <p style={{ fontSize: '0.825rem', color: 'var(--ui-text-muted)', margin: '0.25rem 0 0' }}>
                      {cloze.answerKey.explanation}
                    </p>
                  </Card>
                )}
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid var(--ui-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: 'var(--ui-surface-muted)',
          }}
        >
          <Button variant="secondary" onClick={onClose}>
            Close Preview
          </Button>
        </div>
      </div>
    </div>
  );
}
