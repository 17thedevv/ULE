import React, { useCallback, useEffect, useState } from 'react';
import {
  ABRunDto,
  CourseProgressDto,
  LearnerCourseVersionDto,
  LearnerSkillProjectionDto,
  LearningEvidenceDto,
  MultipleChoiceLearnerView,
} from '@ule/contracts';
import { executeRunCommand, startRun } from '../services/abp';
import {
  fetchCourseProgress,
  fetchEvidenceSummary,
  fetchGrantedCourses,
  fetchSkillProjections,
} from '../services/learner';

export const LearnerEvidenceStudio: React.FC = () => {
  const [courses, setCourses] = useState<LearnerCourseVersionDto[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [progress, setProgress] = useState<CourseProgressDto | null>(null);
  const [evidence, setEvidence] = useState<LearningEvidenceDto[]>([]);
  const [skills, setSkills] = useState<LearnerSkillProjectionDto[]>([]);
  const [activeRun, setActiveRun] = useState<ABRunDto | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadGrantedCourses = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await fetchGrantedCourses();
      setCourses(list);
      if (list.length > 0 && !selectedVersionId) {
        setSelectedVersionId(list[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courses.');
    } finally {
      setLoading(false);
    }
  }, [selectedVersionId]);

  const loadVersionData = useCallback(async (versionId: string) => {
    if (!versionId) return;
    try {
      setLoading(true);
      setError(null);
      const [prog, evList, skList] = await Promise.all([
        fetchCourseProgress(versionId),
        fetchEvidenceSummary(versionId),
        fetchSkillProjections(versionId),
      ]);
      setProgress(prog);
      setEvidence(evList);
      setSkills(skList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGrantedCourses();
  }, [loadGrantedCourses]);

  useEffect(() => {
    if (selectedVersionId) {
      loadVersionData(selectedVersionId);
      setActiveRun(null);
    }
  }, [selectedVersionId, loadVersionData]);

  const handleStartActivity = async (blockInstanceId: string) => {
    if (!selectedVersionId) return;
    try {
      setLoading(true);
      setError(null);
      const idempotencyKey = `learner_run_${blockInstanceId}_${Date.now()}`;
      const run = await startRun({
        courseVersionId: selectedVersionId,
        blockInstanceId,
        idempotencyKey,
      });
      setActiveRun(run);
      setStatusMessage(`Started activity: ${run.block.title}`);
      await loadVersionData(selectedVersionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start activity.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteVideo = async () => {
    if (!activeRun) return;
    try {
      setLoading(true);
      setError(null);
      const idempotencyKey = `learner_finish_${activeRun.id}_${Date.now()}`;
      const updated = await executeRunCommand(activeRun.id, {
        command: 'FINISH',
        idempotencyKey,
      });
      setActiveRun(updated);
      setStatusMessage('Video completed! Progress updated without a score or mastery claim.');
      await loadVersionData(selectedVersionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete video.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestHint = async () => {
    if (!activeRun) return;
    try {
      setLoading(true);
      setError(null);
      const idempotencyKey = `learner_hint_${activeRun.id}_${Date.now()}`;
      const updated = await executeRunCommand(activeRun.id, {
        command: 'REQUEST_HINT',
        idempotencyKey,
      });
      setActiveRun(updated);
      setStatusMessage('Hint delivered by server. Provenance recorded as SERVER_OBSERVED.');
      await loadVersionData(selectedVersionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request hint.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitQuizAnswer = async () => {
    if (!activeRun || !selectedOptionId) return;
    try {
      setLoading(true);
      setError(null);
      const idempotencyKey = `learner_submit_${activeRun.id}_${Date.now()}`;
      const updated = await executeRunCommand(activeRun.id, {
        command: 'SUBMIT_RESPONSE',
        payload: { selectedOptionId },
        idempotencyKey,
      });
      setActiveRun(updated);
      setStatusMessage('Answer submitted and evaluated by server. Trusted evidence ingested.');
      await loadVersionData(selectedVersionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit response.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <div className="section-header">
        <h2>Phase 3: Learner Evidence &amp; Minimal LII Studio</h2>
        <span className="badge badge-info">Learner Interface</span>
      </div>

      <p className="description">
        Demonstrates authentic learner execution of private CourseVersions, progressive activity
        tracking without premature mastery claims, idempotent evidence intake, and conservative LII skill projections.
      </p>

      {error && <div className="alert alert-error">{error}</div>}
      {statusMessage && <div className="alert alert-info">{statusMessage}</div>}

      <div className="form-group">
        <label htmlFor="course-version-select">Select Authorized Private CourseVersion:</label>
        <div className="form-row">
          <select
            id="course-version-select"
            value={selectedVersionId}
            onChange={(e) => setSelectedVersionId(e.target.value)}
            disabled={loading || courses.length === 0}
          >
            {courses.length === 0 ? (
              <option value="">No authorized courses found. Sign in as learner or grant access.</option>
            ) : (
              courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} (v{c.versionNumber}) — {c.id.slice(0, 8)}...
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadGrantedCourses}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {progress && (
        <div className="status-box" style={{ marginTop: '1rem' }}>
          <h3>Activity Progress (Strictly Non-Mastery)</h3>
          <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem' }}>
            <div>
              <strong>Completed:</strong> {progress.completedBlocks} / {progress.totalBlocks} ({progress.percentComplete}%)
            </div>
            <div>
              <strong>Verified Mastery Claim:</strong>{' '}
              <span className="badge badge-warning">NONE (Unavailable in Phase 3)</span>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <h4>Available Activities:</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
              {progress.blocks.map((b) => (
                <div
                  key={b.blockInstanceId}
                  style={{
                    padding: '0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: activeRun?.blockInstanceId === b.blockInstanceId ? '#f0f9ff' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{b.title}</strong>
                    <span className={`badge ${b.status === 'COMPLETED' ? 'badge-success' : b.status === 'IN_PROGRESS' ? 'badge-info' : 'badge-secondary'}`}>
                      {b.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                    Type: {b.blockTypeId} | Attempts: {b.attemptsCount}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => handleStartActivity(b.blockInstanceId)}
                    disabled={loading}
                  >
                    {activeRun?.blockInstanceId === b.blockInstanceId ? 'Active' : 'Start / Open'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeRun && (
        <div className="status-box" style={{ marginTop: '1.5rem', background: '#fafafa', border: '1px solid #0284c7' }}>
          <h3>Executing: {activeRun.block.title}</h3>
          <p style={{ fontSize: '0.85rem', color: '#666' }}>
            Run ID: {activeRun.id} | Status: <span className="badge badge-info">{activeRun.status}</span>
          </p>

          {activeRun.block.blockTypeId === 'video' && (
            <div style={{ marginTop: '1rem' }}>
              <p>Video Activity: Non-evaluatable content. Completing contributes progress only.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCompleteVideo}
                disabled={loading || activeRun.status === 'CLOSED'}
              >
                {activeRun.status === 'CLOSED' ? 'Video Completed' : 'Complete Video Activity'}
              </button>
            </div>
          )}

          {activeRun.block.blockTypeId === 'multiple-choice' && (
            <div style={{ marginTop: '1rem' }}>
              {(() => {
                const mcq = activeRun.block.learnerConfig as unknown as MultipleChoiceLearnerView;
                return (
                  <div>
                    <p style={{ fontWeight: 'bold' }}>{mcq?.question || 'Multiple Choice Question'}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {mcq?.options?.map((opt) => (
                        <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="radio"
                            name="quiz-option"
                            value={opt.id}
                            checked={selectedOptionId === opt.id}
                            onChange={() => setSelectedOptionId(opt.id)}
                            disabled={loading || activeRun.status === 'CLOSED'}
                          />
                          <span>{opt.text}</span>
                        </label>
                      ))}
                    </div>

                    {mcq?.allowHints && (
                      <div style={{ marginTop: '1rem' }}>
                        {activeRun.deliveredHint ? (
                          <div className="alert alert-info" style={{ padding: '0.5rem' }}>
                            <strong>Server Hint:</strong> {activeRun.deliveredHint}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleRequestHint}
                            disabled={loading || activeRun.status === 'CLOSED'}
                          >
                            Request Hint (Records Assistance Provenance)
                          </button>
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSubmitQuizAnswer}
                        disabled={loading || !selectedOptionId || activeRun.status === 'CLOSED'}
                      >
                        Submit Response
                      </button>

                      {activeRun.latestAssessment && (
                        <div>
                          Assessment:{' '}
                          {activeRun.latestAssessment.isCorrect === null ? (
                            <span className="badge badge-warning">Deferred Feedback</span>
                          ) : activeRun.latestAssessment.isCorrect ? (
                            <span className="badge badge-success">Correct</span>
                          ) : (
                            <span className="badge badge-error">Incorrect</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Trusted Evidence Ledger Section */}
      <div style={{ marginTop: '1.5rem' }}>
        <h3>Trusted Evidence Ledger (Idempotent Facts)</h3>
        {evidence.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>No learning evidence ingested yet for this version.</p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
            <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: '6px' }}>Classification</th>
                  <th style={{ padding: '6px' }}>Status</th>
                  <th style={{ padding: '6px' }}>Skill Code</th>
                  <th style={{ padding: '6px' }}>Outcome</th>
                  <th style={{ padding: '6px' }}>Provenance</th>
                  <th style={{ padding: '6px' }}>Repetition</th>
                  <th style={{ padding: '6px' }}>Exclusion Reason</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((ev) => (
                  <tr key={ev.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px' }}>
                      <span className={`badge ${ev.classification === 'INDEPENDENT_CORRECT' ? 'badge-success' : ev.classification === 'ASSISTED_CORRECT' ? 'badge-warning' : ev.classification === 'UNGRADED_PARTICIPATION' ? 'badge-info' : 'badge-secondary'}`}>
                        {ev.classification}
                      </span>
                    </td>
                    <td style={{ padding: '6px' }}>{ev.status}</td>
                    <td style={{ padding: '6px' }}>{ev.skillCode || 'None (Unmapped)'}</td>
                    <td style={{ padding: '6px' }}>
                      {ev.deferred ? (
                        <span className="badge badge-warning">Deferred</span>
                      ) : ev.isCorrect === true ? (
                        'Correct'
                      ) : ev.isCorrect === false ? (
                        'Incorrect'
                      ) : (
                        'Ungraded'
                      )}
                    </td>
                    <td style={{ padding: '6px' }}>{ev.supportProvenance || (ev.assisted ? 'Assisted' : 'Independent')}</td>
                    <td style={{ padding: '6px' }}>{ev.isSameItemRepetition ? `Repeat (#${ev.repetitionCount})` : 'Novel (1st)'}</td>
                    <td style={{ padding: '6px', color: '#666' }}>{ev.exclusionReason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Conservative Minimal LII Skill Projections */}
      <div style={{ marginTop: '1.5rem' }}>
        <h3>Learning Intelligence Projections (Conservative Read Model)</h3>
        {skills.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>No skills configured for this CourseVersion.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
            {skills.map((s) => (
              <div
                key={s.skillId}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  background: s.state === 'READY_TO_VERIFY' ? '#f0fdf4' : '#fafafa',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0 }}>{s.skillName}</h4>
                  <span className={`badge ${s.state === 'READY_TO_VERIFY' ? 'badge-success' : s.state === 'DEVELOPING' ? 'badge-info' : 'badge-secondary'}`}>
                    {s.state}
                  </span>
                </div>
                {s.learningObjective && (
                  <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.25rem', marginBottom: '0.5rem' }}>
                    {s.learningObjective}
                  </p>
                )}

                <div style={{ fontSize: '0.8rem', color: '#444', borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
                  <div>
                    Evidence: {s.evidenceCount} total | Independent: {s.independentCount} | Assisted: {s.assistedCount} | Repeats: {s.repeatedCount}
                  </div>
                </div>

                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                  <strong>Reasons:</strong>
                  <ul style={{ margin: '0.25rem 0', paddingLeft: '1.2rem' }}>
                    {s.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#b45309' }}>
                  <strong>Explicit Limitations:</strong>
                  <ul style={{ margin: '0.25rem 0', paddingLeft: '1.2rem' }}>
                    {s.limitations.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>

                {s.proposedAction && (
                  <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: '#fff', border: '1px dashed #cbd5e1', borderRadius: '4px', fontSize: '0.8rem' }}>
                    <strong>LII Proposal:</strong>{' '}
                    <span className="badge badge-info">{s.proposedAction.category}</span>
                    <p style={{ margin: '0.25rem 0' }}>{s.proposedAction.reason}</p>
                    {!s.proposedAction.isAvailable && (
                      <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>[Action capability not available in this CourseVersion]</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
