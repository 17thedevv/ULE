import React, { useCallback, useEffect, useState } from 'react';
import {
  ABRunDto,
  CourseDraftDto,
  CourseDto,
  CourseVersionDto,
  DraftBlockInstanceDto,
  DraftValidationResponseDto,
  RunResultsDto,
} from '@ule/contracts';
import {
  addDraftBlock,
  deleteDraftBlock,
  executeRunCommand,
  getRunResults,
  listDraftBlocks,
  startRun,
  validateDraftBlocks,
} from '../services/abp';
import { createCourseVersion, getCourseDraft, listCourses, listCourseVersions } from '../services/courses';

export const AbpVerificationStudio: React.FC = () => {
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [currentDraft, setCurrentDraft] = useState<CourseDraftDto | null>(null);
  const [draftBlocks, setDraftBlocks] = useState<DraftBlockInstanceDto[]>([]);
  const [validationReport, setValidationReport] = useState<DraftValidationResponseDto | null>(null);
  const [versions, setVersions] = useState<CourseVersionDto[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [activeRun, setActiveRun] = useState<ABRunDto | null>(null);
  const [runResults, setRunResults] = useState<RunResultsDto | null>(null);

  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [usedHint, setUsedHint] = useState<boolean>(false);
  const [serverHintText, setServerHintText] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const loadCourses = useCallback(async () => {
    try {
      const data = await listCourses();
      setCourses(data);
      if (data.length > 0 && !selectedCourseId) {
        setSelectedCourseId(data[0].id);
      }
    } catch {
      // User might not be authenticated yet
    }
  }, [selectedCourseId]);

  const loadDraftAndBlocks = useCallback(async (courseId: string) => {
    try {
      const [draft, blocks] = await Promise.all([
        getCourseDraft(courseId),
        listDraftBlocks(courseId),
      ]);
      setCurrentDraft(draft);
      setDraftBlocks(blocks);
      setValidationReport(null);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(`Failed to load draft blocks: ${e.message}`);
    }
  }, []);

  const loadVersions = useCallback(async (courseId: string) => {
    try {
      const data = await listCourseVersions(courseId);
      setVersions(data);
      if (data.length > 0) {
        setSelectedVersionId(data[data.length - 1].id);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(`Failed to load versions: ${e.message}`);
    }
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  useEffect(() => {
    if (selectedCourseId) {
      void loadDraftAndBlocks(selectedCourseId);
      void loadVersions(selectedCourseId);
    } else {
      setCurrentDraft(null);
      setDraftBlocks([]);
      setVersions([]);
    }
  }, [selectedCourseId, loadDraftAndBlocks, loadVersions]);

  const handleAddSampleVideo = async () => {
    if (!selectedCourseId || !currentDraft) return;
    setLoading(true);
    setErrorMessage('');
    try {
      await addDraftBlock(selectedCourseId, {
        blockTypeId: 'video',
        title: 'Video: Core Architecture Overview',
        expectedRevision: currentDraft.revision,
        config: {
          url: 'https://cdn.ule.internal/lessons/architecture-overview.mp4',
          durationSeconds: 240,
          transcript: 'This lesson covers the modular monolith architecture of ULE.',
          allowSkip: true,
        },
      });
      setStatusMessage('Added Video block successfully.');
      await loadDraftAndBlocks(selectedCourseId);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSampleMcq = async () => {
    if (!selectedCourseId || !currentDraft) return;
    setLoading(true);
    setErrorMessage('');
    try {
      await addDraftBlock(selectedCourseId, {
        blockTypeId: 'multiple-choice',
        title: 'Quiz: Architecture Knowledge Check',
        expectedRevision: currentDraft.revision,
        config: {
          question: 'Which framework powers the ULE backend tier?',
          options: [
            { id: 'opt_nestjs', text: 'NestJS (Modular Monolith)' },
            { id: 'opt_nextjs', text: 'Next.js (Full Stack)' },
            { id: 'opt_express', text: 'Plain Express without DI' },
          ],
          answerKey: {
            correctOptionId: 'opt_nestjs',
            explanation: 'NestJS is the frozen technology choice for the ULE backend.',
          },
          feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
          allowHints: true,
          hintText: 'Recall the frozen MVP backend decisions in AGENTS.md',
        },
      });
      setStatusMessage('Added Multiple Choice Quiz block successfully.');
      await loadDraftAndBlocks(selectedCourseId);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerValidationError = async () => {
    if (!selectedCourseId || !currentDraft) return;
    setLoading(true);
    setErrorMessage('');
    try {
      await addDraftBlock(selectedCourseId, {
        blockTypeId: 'multiple-choice',
        title: 'Broken MCQ (Mismatched Key)',
        expectedRevision: currentDraft.revision,
        config: {
          question: 'What is 1 + 1?',
          options: [{ id: 'opt_1', text: '2' }],
          answerKey: { correctOptionId: 'opt_ghost' }, // Mismatched key
        },
      });
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(`Expected validation rejection caught: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleValidateDraft = async () => {
    if (!selectedCourseId) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const report = await validateDraftBlocks(selectedCourseId);
      setValidationReport(report);
      setStatusMessage(
        report.valid
          ? `All ${report.totalBlocks} draft blocks are valid!`
          : `Validation failed: ${report.invalidBlocksCount} invalid block(s) detected.`,
      );
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!selectedCourseId || !currentDraft) return;
    setLoading(true);
    try {
      await deleteDraftBlock(selectedCourseId, blockId, currentDraft.revision);
      setStatusMessage('Deleted block.');
      await loadDraftAndBlocks(selectedCourseId);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!selectedCourseId) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const v = await createCourseVersion(selectedCourseId);
      setStatusMessage(`Created CourseVersion v${v.versionNumber} successfully!`);
      await loadVersions(selectedCourseId);
      setSelectedVersionId(v.id);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(`Version creation error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStartRun = async (blockInstanceId: string) => {
    if (!selectedVersionId) {
      setErrorMessage('Please select a CourseVersion first.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const run = await startRun({
        courseVersionId: selectedVersionId,
        blockInstanceId,
        idempotencyKey: `client_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
      setActiveRun(run);
      setSelectedOptionId('');
      setUsedHint(false);
      setServerHintText(run.deliveredHint || '');
      setStatusMessage(`Started Run (${run.blockTypeId}) in ACTIVE status.`);
      loadRunResults(run.id);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(`Failed to start run: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteCommand = async (command: 'START' | 'SUSPEND' | 'RESUME' | 'FINISH' | 'ABANDON') => {
    if (!activeRun) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const updated = await executeRunCommand(activeRun.id, {
        command,
        idempotencyKey: `client_cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
      setActiveRun(updated);
      setStatusMessage(`Command ${command} executed. Status is now ${updated.status}.`);
      loadRunResults(updated.id);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(`Command execution failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestServerHint = async () => {
    if (!activeRun) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const updated = await executeRunCommand(activeRun.id, {
        command: 'REQUEST_HINT',
        idempotencyKey: `client_hint_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
      setActiveRun(updated);
      setUsedHint(true);
      if (updated.deliveredHint) {
        setServerHintText(updated.deliveredHint);
      }
      setStatusMessage('Server hint delivered and logged in authoritative runtime audit trail.');
      loadRunResults(updated.id);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(`Request hint failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!activeRun) return;
    if (!selectedOptionId) {
      setErrorMessage('Please choose an option before submitting.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const updated = await executeRunCommand(activeRun.id, {
        command: 'SUBMIT_RESPONSE',
        payload: {
          selectedOptionId,
          usedHint,
        },
        idempotencyKey: `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      });
      setActiveRun(updated);
      setStatusMessage('Response submitted and evaluated by authoritative server evaluator.');
      loadRunResults(updated.id);
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(`Submission failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadRunResults = async (runId: string) => {
    try {
      const results = await getRunResults(runId);
      setRunResults(results);
    } catch {
      // Ignored
    }
  };

  const selectedVersion = versions.find((v) => v.id === selectedVersionId);
  const versionBlocks = (selectedVersion?.snapshot as { blocks?: Array<{ id: string; title: string; blockTypeId: string }> })?.blocks ?? [];

  return (
    <section className="card abp-studio">
      <div className="section-header">
        <div>
          <h2>Phase 1B: ABP &amp; Minimal Runtime Studio</h2>
          <p className="section-desc">
            Verify Activity Block Protocol vertical slice: Video (ungraded), Multiple Choice (server evaluation &amp; assistance tracking), version pinning, and trust boundaries.
          </p>
        </div>
        <button className="btn-secondary" onClick={loadCourses} disabled={loading}>
          Refresh Courses
        </button>
      </div>

      {statusMessage && <div className="alert alert-success">{statusMessage}</div>}
      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

      {/* Course Selection */}
      <div className="form-group" style={{ marginBottom: '1.25rem' }}>
        <label htmlFor="course-select">Active Owned Course Draft:</label>
        <select
          id="course-select"
          className="input-select"
          value={selectedCourseId}
          onChange={(e) => setSelectedCourseId(e.target.value)}
        >
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              Course {c.id.slice(0, 8)}... ({c.visibility})
            </option>
          ))}
        </select>
      </div>

      {selectedCourseId ? (
        <>
          {/* STEP 1: Draft Activity Blocks */}
          <div className="sub-card">
            <h3>1. Draft Activity Block Instances</h3>
            <p className="text-muted">Configure and validate block instances inside the current working Draft.</p>

            <div className="btn-group" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
              <button className="btn-primary" onClick={handleAddSampleVideo} disabled={loading}>
                + Add Video Block
              </button>
              <button className="btn-primary" onClick={handleAddSampleMcq} disabled={loading}>
                + Add MCQ Quiz Block
              </button>
              <button className="btn-warning" onClick={handleTriggerValidationError} disabled={loading}>
                Test Validation Rejection
              </button>
              <button className="btn-secondary" onClick={handleValidateDraft} disabled={loading}>
                Validate All Blocks
              </button>
            </div>

            {validationReport && (
              <div className={`validation-box ${validationReport.valid ? 'valid' : 'invalid'}`}>
                <strong>Validation Status: {validationReport.valid ? 'PASSED (Ready for versioning)' : 'ERRORS DETECTED'}</strong>
                <ul>
                  {validationReport.blocks.map((b) => (
                    <li key={b.blockId}>
                      {b.title} ({b.blockTypeId}): {b.valid ? 'Valid' : b.errors.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="blocks-list">
              {draftBlocks.length === 0 ? (
                <p className="empty-text">No activity blocks in draft. Click buttons above to add.</p>
              ) : (
                draftBlocks.map((b) => (
                  <div key={b.id} className="block-item">
                    <div>
                      <strong>#{b.orderIndex + 1} {b.title}</strong>
                      <span className="badge badge-outline">{b.blockTypeId} v{b.typeVersion}</span>
                    </div>
                    <button className="btn-danger btn-sm" onClick={() => handleDeleteBlock(b.id)} disabled={loading}>
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* STEP 2: Create CourseVersion Snapshot */}
          <div className="sub-card" style={{ marginTop: '1.25rem' }}>
            <h3>2. Immutable Version Snapshot Creation</h3>
            <p className="text-muted">
              Creates an immutable version snapshot holding the exact validated activity blocks.
            </p>
            <div className="btn-group" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
              <button className="btn-success" onClick={handleCreateVersion} disabled={loading || draftBlocks.length === 0}>
                Create CourseVersion Snapshot
              </button>
            </div>

            <div className="form-group">
              <label htmlFor="version-select">Select Pinned Version to Exercise:</label>
              <select
                id="version-select"
                className="input-select"
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version #{v.versionNumber} (Created {new Date(v.createdAt).toLocaleTimeString()})
                  </option>
                ))}
              </select>
            </div>

            {selectedVersion && (
              <div className="version-info">
                <p><strong>Pinned Snapshot Blocks ({versionBlocks.length}):</strong></p>
                <ul>
                  {versionBlocks.map((b) => (
                    <li key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
                      <span>{b.title} ({b.blockTypeId})</span>
                      <button className="btn-secondary btn-sm" onClick={() => handleStartRun(b.id)} disabled={loading}>
                        Run Block
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* STEP 3: Minimal ABP Runtime */}
          {activeRun && (
            <div className="sub-card runtime-card" style={{ marginTop: '1.25rem' }}>
              <div className="runtime-header">
                <h3>3. Minimal ABP Runtime Execution</h3>
                <span className={`status-pill status-${activeRun.status.toLowerCase()}`}>
                  {activeRun.status} {activeRun.closeReason ? `(${activeRun.closeReason})` : ''}
                </span>
              </div>
              <p className="text-muted">
                Run ID: <code>{activeRun.id}</code> (Pinned to Version <code>{activeRun.courseVersionId.slice(0, 8)}</code>)
              </p>

              {/* Host Lifecycle Controls */}
              <div className="btn-group" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                {activeRun.status === 'ACTIVE' && (
                  <button className="btn-warning btn-sm" onClick={() => handleExecuteCommand('SUSPEND')} disabled={loading}>
                    Suspend Run
                  </button>
                )}
                {activeRun.status === 'SUSPENDED' && (
                  <button className="btn-success btn-sm" onClick={() => handleExecuteCommand('RESUME')} disabled={loading}>
                    Resume Run
                  </button>
                )}
                {activeRun.status !== 'CLOSED' && (
                  <button className="btn-danger btn-sm" onClick={() => handleExecuteCommand('ABANDON')} disabled={loading}>
                    Abandon Run
                  </button>
                )}
              </div>

              {/* Learner View (Secret Evaluator Data Stripped) */}
              <div className="learner-box">
                <h4>Learner-Visible View ({activeRun.block.title})</h4>
                <div className="security-notice">
                  <span>🔒 Protected Boundary: Evaluator secrets and answer keys stripped from payload.</span>
                </div>

                {/* VIDEO BLOCK RUNTIME */}
                {activeRun.blockTypeId === 'video' && (
                  <div className="video-player-stub">
                    <p>🎬 <strong>Video URL:</strong> {String(activeRun.block.learnerConfig.url)}</p>
                    <p>⏱ <strong>Duration:</strong> {String(activeRun.block.learnerConfig.durationSeconds ?? 0)} seconds</p>
                    <p>📝 <strong>Transcript:</strong> {String(activeRun.block.learnerConfig.transcript || 'None')}</p>
                    {activeRun.status === 'ACTIVE' && (
                      <button className="btn-success" onClick={() => handleExecuteCommand('FINISH')} disabled={loading} style={{ marginTop: '0.75rem' }}>
                        Mark Video Completed (Ungraded)
                      </button>
                    )}
                    {activeRun.status === 'CLOSED' && activeRun.closeReason === 'COMPLETED' && (
                      <div className="alert alert-info" style={{ marginTop: '0.75rem' }}>
                        ✅ Video completed successfully. By Learning Science invariant, video completion is strictly ungraded and produces no score or mastery.
                      </div>
                    )}
                  </div>
                )}

                {/* MULTIPLE CHOICE RUNTIME */}
                {activeRun.blockTypeId === 'multiple-choice' && (
                  <div className="quiz-stub">
                    <p className="quiz-question"><strong>Question:</strong> {String(activeRun.block.learnerConfig.question)}</p>
                    <div className="quiz-options">
                      {Array.isArray(activeRun.block.learnerConfig.options) &&
                        (activeRun.block.learnerConfig.options as Array<{ id: string; text: string }>).map((opt) => (
                          <label key={opt.id} className="quiz-option-label">
                            <input
                              type="radio"
                              name="mcq-option"
                              value={opt.id}
                              checked={selectedOptionId === opt.id}
                              onChange={(e) => setSelectedOptionId(e.target.value)}
                              disabled={activeRun.status !== 'ACTIVE' || loading}
                            />
                            <span>{opt.text}</span>
                          </label>
                        ))}
                    </div>

                    <div style={{ margin: '0.75rem 0' }}>
                      {Boolean(activeRun.block.learnerConfig.allowHints) && (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn-warning btn-sm"
                            onClick={handleRequestServerHint}
                            disabled={activeRun.status !== 'ACTIVE' || loading}
                          >
                            💡 Request Official Server Hint
                          </button>
                        </div>
                      )}
                      {serverHintText && (
                        <p className="hint-text">💡 <strong>Delivered Server Hint:</strong> {serverHintText}</p>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={usedHint}
                          onChange={(e) => setUsedHint(e.target.checked)}
                          disabled={activeRun.status !== 'ACTIVE' || loading}
                        />
                        <span>Self-reported assistance indicator (Client hint checkbox)</span>
                      </label>
                    </div>

                    {activeRun.status === 'ACTIVE' && (
                      <button className="btn-primary" onClick={handleSubmitAnswer} disabled={loading || !selectedOptionId}>
                        Submit Answer for Server Evaluation
                      </button>
                    )}

                    {/* LATEST ASSESSMENT RESULT */}
                    {activeRun.latestAssessment && (
                      <div className={`assessment-result ${activeRun.latestAssessment.isCorrect ? 'correct' : 'incorrect'}`} style={{ marginTop: '1rem' }}>
                        <h4>Authoritative Assessment Result:</h4>
                        <p>
                          <strong>Verdict:</strong> {activeRun.latestAssessment.isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}
                        </p>
                        <p><strong>Score:</strong> {activeRun.latestAssessment.score} / 1.0</p>
                        <p><strong>Evaluator:</strong> {activeRun.latestAssessment.evaluatorId}</p>
                        <p>
                          <strong>Attempt Support Provenance:</strong>{' '}
                          {activeRun.latestAttempt?.assisted
                            ? `⚠️ Assisted [${String(activeRun.latestAttempt.supportContext?.provenance || 'ASSISTED')}]`
                            : `✨ Independent [${String(activeRun.latestAttempt?.supportContext?.provenance || 'SELF_REPORTED_INDEPENDENT')}]`}
                        </p>
                        {activeRun.latestAssessment.feedback && (
                          <p>
                            <strong>Feedback:</strong>{' '}
                            {typeof activeRun.latestAssessment.feedback === 'object'
                              ? JSON.stringify(activeRun.latestAssessment.feedback)
                              : String(activeRun.latestAssessment.feedback)}
                          </p>
                        )}
                        {activeRun.status === 'ACTIVE' && (
                          <button className="btn-secondary btn-sm" onClick={() => handleExecuteCommand('FINISH')} disabled={loading} style={{ marginTop: '0.5rem' }}>
                            Finish Run
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* AUDIT TRAIL / EVENTS */}
              {runResults && runResults.events.length > 0 && (
                <div className="events-trail" style={{ marginTop: '1rem' }}>
                  <h4>Server Audit Trail (Accepted Facts):</h4>
                  <ul className="events-list">
                    {runResults.events.map((e) => (
                      <li key={e.id}>
                        <code>{new Date(e.serverTimestamp).toLocaleTimeString()}</code> &bull; <strong>{e.eventType}</strong>
                        {e.payload ? ` (${JSON.stringify(e.payload)})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="empty-text">Please sign in and select or create a course above to test ABP runtime.</p>
      )}
    </section>
  );
};
