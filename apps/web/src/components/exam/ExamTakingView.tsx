import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExamAttemptQuestionsDto,
  ExamResultSummaryDto,
} from '@ule/contracts';
import {
  ExamApiError,
  fetchExamQuestions,
  fetchExamResponses,
  saveExamResponse,
  submitExamAttempt,
} from '../../services/exams';
import { AutosaveIndicator, AutosaveStatus } from './AutosaveIndicator';
import { ExamTimer } from './ExamTimer';
import { QuestionRenderer } from './QuestionRenderer';

interface ExamTakingViewProps {
  attemptId: string;
  onFinish: (result: ExamResultSummaryDto) => void;
  onCancel: () => void;
  debounceMs?: number;
}

interface ItemState {
  payload: Record<string, unknown>;
  revision: number;
}

interface DirtyItem {
  payload: Record<string, unknown>;
  seq: number;
}

export const ExamTakingView: React.FC<ExamTakingViewProps> = ({
  attemptId,
  onFinish,
  onCancel,
  debounceMs = 600,
}) => {
  const [blueprint, setBlueprint] = useState<ExamAttemptQuestionsDto | null>(null);
  const [answers, setAnswers] = useState<Record<string, ItemState>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Autosave status
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('IDLE');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);

  // Submission status & confirmation
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false);

  // Expiration
  const [isExpired, setIsExpired] = useState<boolean>(false);

  // Debounce timers per item
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const answersRef = useRef<Record<string, ItemState>>(answers);
  answersRef.current = answers;

  // Local edit sequence per item to prevent older in-flight saves from overwriting newer local state
  const localEditSeqRef = useRef<Record<string, number>>({});

  // Dirty items tracking pending unpersisted edits
  const dirtyItemsRef = useRef<Map<string, DirtyItem>>(new Map());

  // In-flight save promises per item to serialize saves per item and await on submit
  const inFlightSavesRef = useRef<Map<string, Promise<void>>>(new Map());

  // Component mounted guard
  const isMountedRef = useRef<boolean>(true);

  // 1. Initial Load
  useEffect(() => {
    isMountedRef.current = true;
    let mounted = true;
    const init = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [questionsData, responsesData] = await Promise.all([
          fetchExamQuestions(attemptId),
          fetchExamResponses(attemptId),
        ]);

        if (!mounted) return;
        setBlueprint(questionsData);

        // Pre-populate saved responses
        const initialAnswers: Record<string, ItemState> = {};
        for (const resp of responsesData) {
          initialAnswers[resp.itemRefId] = {
            payload: resp.responsePayload,
            revision: resp.revision,
          };
        }
        setAnswers(initialAnswers);
        answersRef.current = initialAnswers;
        dirtyItemsRef.current.clear();
        localEditSeqRef.current = {};
        inFlightSavesRef.current.clear();

        if (questionsData.status === 'EXPIRED') {
          setIsExpired(true);
        }
      } catch (err) {
        if (!mounted) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load exam session');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    const timers = debounceTimers.current;
    return () => {
      mounted = false;
      isMountedRef.current = false;
      // Clear any pending timers on unmount
      Object.values(timers).forEach(clearTimeout);
    };
  }, [attemptId]);

  // 2. Perform Save
  const doSave = useCallback(
    async (itemId: string): Promise<void> => {
      const dirty = dirtyItemsRef.current.get(itemId);
      if (!dirty) return;

      const payloadToSave = dirty.payload;
      const seqToSave = dirty.seq;
      const currentRev = answersRef.current[itemId]?.revision ?? 0;
      const expectedRevision = currentRev > 0 ? currentRev : undefined;

      if (isMountedRef.current) {
        setAutosaveStatus('SAVING');
        setAutosaveError(null);
      }

      try {
        const saved = await saveExamResponse(attemptId, itemId, payloadToSave, expectedRevision);

        const currentSeq = localEditSeqRef.current[itemId] ?? 0;
        const isNewerLocalEdit = currentSeq > seqToSave;

        // Clear dirty flag only if no newer local edit occurred while in-flight
        if (!isNewerLocalEdit) {
          dirtyItemsRef.current.delete(itemId);
        }

        if (isMountedRef.current) {
          // Never overwrite with older in-flight payload if learner typed newer answer
          setAnswers((prev) => {
            const existing = prev[itemId];
            return {
              ...prev,
              [itemId]: {
                payload: isNewerLocalEdit ? (existing?.payload ?? payloadToSave) : saved.responsePayload,
                revision: saved.revision,
              },
            };
          });

          answersRef.current[itemId] = {
            payload: isNewerLocalEdit ? (answersRef.current[itemId]?.payload ?? payloadToSave) : saved.responsePayload,
            revision: saved.revision,
          };

          if (inFlightSavesRef.current.size <= 1 && dirtyItemsRef.current.size === 0) {
            setAutosaveStatus('SAVED');
          }
          setLastSavedAt(new Date());
        }
      } catch (err) {
        if (isMountedRef.current) {
          if (err instanceof ExamApiError && err.statusCode === 409) {
            setAutosaveStatus('ERROR');
            setAutosaveError(err.message || 'Stale response revision (409 Conflict).');
          } else {
            setAutosaveStatus('ERROR');
            setAutosaveError(err instanceof Error ? err.message : 'Autosave failed.');
          }
        }
        throw err;
      }
    },
    [attemptId],
  );

  const executeSaveForItem = useCallback(
    (itemId: string): Promise<void> => {
      const currentInFlight = inFlightSavesRef.current.get(itemId) || Promise.resolve();

      const nextPromise: Promise<void> = currentInFlight
        .then(async () => {
          if (!dirtyItemsRef.current.has(itemId)) {
            return;
          }
          await doSave(itemId);
        })
        .finally(() => {
          if (inFlightSavesRef.current.get(itemId) === nextPromise) {
            inFlightSavesRef.current.delete(itemId);
          }
        });

      inFlightSavesRef.current.set(itemId, nextPromise);
      return nextPromise;
    },
    [doSave],
  );

  // 3. Question Response Changed
  const handleAnswerChange = (itemId: string, newPayload: Record<string, unknown>) => {
    if (isExpired || isSubmitting) return;

    const currentItem = answersRef.current[itemId];
    const currentRev = currentItem?.revision ?? 0;

    const nextSeq = (localEditSeqRef.current[itemId] ?? 0) + 1;
    localEditSeqRef.current[itemId] = nextSeq;

    dirtyItemsRef.current.set(itemId, {
      payload: newPayload,
      seq: nextSeq,
    });

    // Optimistically update UI
    setAnswers((prev) => ({
      ...prev,
      [itemId]: {
        payload: newPayload,
        revision: currentRev,
      },
    }));

    answersRef.current[itemId] = {
      payload: newPayload,
      revision: currentRev,
    };

    // Debounce save request
    if (debounceTimers.current[itemId]) {
      clearTimeout(debounceTimers.current[itemId]);
    }

    setAutosaveStatus('SAVING');
    debounceTimers.current[itemId] = setTimeout(() => {
      executeSaveForItem(itemId).catch(() => {
        // Error state handled inside doSave
      });
    }, debounceMs);
  };

  // 4. Retry handler for autosave indicator
  const handleRetryAutosave = useCallback(() => {
    if (dirtyItemsRef.current.size > 0) {
      for (const itemId of Array.from(dirtyItemsRef.current.keys())) {
        executeSaveForItem(itemId).catch(() => {});
      }
    } else {
      for (const [itemId, item] of Object.entries(answersRef.current)) {
        dirtyItemsRef.current.set(itemId, {
          payload: item.payload,
          seq: (localEditSeqRef.current[itemId] ?? 0) + 1,
        });
        executeSaveForItem(itemId).catch(() => {});
      }
    }
  }, [executeSaveForItem]);

  // 5. Timer Expiration Handler
  const handleTimerExpire = () => {
    setIsExpired(true);
  };

  // 6. Check unanswered questions
  const getUnansweredQuestions = () => {
    if (!blueprint) return [];
    const unanswered: Array<{ id: string; title: string; orderIndex: number }> = [];

    for (const sec of blueprint.sections) {
      for (const item of sec.items) {
        const ans = answersRef.current[item.id] ?? answers[item.id];
        if (!ans || !ans.payload || Object.keys(ans.payload).length === 0) {
          unanswered.push({ id: item.id, title: item.title, orderIndex: item.orderIndex });
          continue;
        }

        // Specific empties check
        if (item.type === 'SHORT_TEXT' || item.type === 'ESSAY') {
          const txt = (ans.payload.text as string) || (ans.payload.essayText as string) || '';
          if (!txt.trim()) {
            unanswered.push({ id: item.id, title: item.title, orderIndex: item.orderIndex });
          }
        }
      }
    }
    return unanswered;
  };

  // 7. Final Submission: Flush & await all pending/in-flight autosaves
  const handleSubmit = async () => {
    if (isSubmitting) return;
    setShowSubmitConfirm(false);
    setIsSubmitting(true);
    setSubmitError(null);

    // Flush any pending debounces before submission
    const pendingTimers = Object.values(debounceTimers.current);
    pendingTimers.forEach(clearTimeout);
    debounceTimers.current = {};

    // Trigger save for any dirty items
    for (const itemId of Array.from(dirtyItemsRef.current.keys())) {
      executeSaveForItem(itemId);
    }

    // Await all in-flight and flushed saves before submitting
    try {
      const inFlight = Array.from(inFlightSavesRef.current.values());
      if (inFlight.length > 0) {
        await Promise.all(inFlight);
      }
    } catch (saveErr) {
      setIsSubmitting(false);
      const errMsg =
        saveErr instanceof ExamApiError
          ? saveErr.message
          : saveErr instanceof Error
            ? saveErr.message
            : 'Failed to save responses before submission.';
      setSubmitError(`Failed to save responses before submission: ${errMsg}`);
      return; // Abort submission so learner does not lose answers
    }

    try {
      const result = await submitExamAttempt(attemptId);
      onFinish(result);
    } catch (err) {
      if (err instanceof ExamApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Submission failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 8. Leave with flush
  const handleLeave = async () => {
    if (isSubmitting) return;
    const pendingTimers = Object.values(debounceTimers.current);
    pendingTimers.forEach(clearTimeout);
    debounceTimers.current = {};

    for (const itemId of Array.from(dirtyItemsRef.current.keys())) {
      executeSaveForItem(itemId).catch(() => {});
    }

    const inFlight = Array.from(inFlightSavesRef.current.values());
    if (inFlight.length > 0) {
      try {
        await Promise.all(inFlight);
      } catch {
        // Continue to onCancel even if autosave failed
      }
    }
    onCancel();
  };

  const handlePreSubmit = () => {
    setSubmitError(null);
    const unanswered = getUnansweredQuestions();
    if (unanswered.length > 0) {
      setShowSubmitConfirm(true);
    } else {
      handleSubmit();
    }
  };

  if (loading) {
    return (
      <div className="exam-taking-view loading-state" data-testid="exam-loading">
        <p>Loading examination questions and saved responses...</p>
      </div>
    );
  }

  if (loadError || !blueprint) {
    return (
      <div className="exam-taking-view error-state">
        <div className="alert alert-danger">
          <h3>Failed to load examination</h3>
          <p>{loadError || 'Missing blueprint data'}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          &larr; Back to Examinations
        </button>
      </div>
    );
  }

  const allItems = blueprint.sections.flatMap((s) => s.items);
  const answeredCount = allItems.filter((item) => {
    const ans = answers[item.id];
    if (!ans || !ans.payload || Object.keys(ans.payload).length === 0) return false;
    if (item.type === 'SHORT_TEXT' || item.type === 'ESSAY') {
      const txt = (ans.payload.text as string) || (ans.payload.essayText as string) || '';
      return txt.trim().length > 0;
    }
    return true;
  }).length;

  const unanswered = getUnansweredQuestions();

  return (
    <div className="exam-taking-view" data-testid="exam-taking-view">
      {/* Sticky Exam Session Header */}
      <header className="exam-session-header">
        <div className="session-header-left">
          <span className="exam-attempt-tag">Attempt #{attemptId.slice(0, 8)}</span>
          <h2 className="exam-session-title">Examination in Progress</h2>
          <span className="exam-progress-tag">
            Answered: {answeredCount} / {allItems.length}
          </span>
        </div>

        <div className="session-header-center">
          <ExamTimer deadlineAt={blueprint.deadlineAt} onExpire={handleTimerExpire} />
        </div>

        <div className="session-header-right">
          <AutosaveIndicator
            status={autosaveStatus}
            lastSavedAt={lastSavedAt}
            errorMessage={autosaveError}
            onRetry={handleRetryAutosave}
          />
        </div>
      </header>

      {/* Expiration Banner */}
      {isExpired && (
        <div className="alert alert-danger" data-testid="taking-expired-alert">
          <strong>&#9888; Time has expired!</strong> Your responses have been locked. Please submit
          your examination now.
        </div>
      )}

      {submitError && (
        <div className="alert alert-danger" data-testid="submit-error-alert">
          <strong>Submission Error:</strong> {submitError}
        </div>
      )}

      {/* Sections & Questions */}
      <main className="exam-sections-container">
        {blueprint.sections.map((section) => (
          <section key={section.id} className="exam-section-block">
            <div className="section-header">
              <h3 className="section-title">{section.title}</h3>
              {section.description && <p className="section-desc">{section.description}</p>}
            </div>

            <div className="section-questions-list">
              {section.items.map((item) => (
                <QuestionRenderer
                  key={item.id}
                  item={item}
                  value={answers[item.id]?.payload ?? null}
                  onChange={(newPayload) => handleAnswerChange(item.id, newPayload)}
                  disabled={isExpired || isSubmitting}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* Footer Submit Bar */}
      <footer className="exam-submit-bar">
        <div className="submit-bar-info">
          <span>
            {answeredCount} of {allItems.length} questions completed
          </span>
          {unanswered.length > 0 && (
            <span className="text-warning">({unanswered.length} unanswered)</span>
          )}
        </div>

        <div className="submit-bar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleLeave}
            disabled={isSubmitting}
          >
            Leave (Answers Saved)
          </button>
          <button
            type="button"
            className="btn btn-primary btn-submit-exam"
            onClick={handlePreSubmit}
            disabled={isSubmitting}
            data-testid="submit-exam-button"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Examination'}
          </button>
        </div>
      </footer>

      {/* Confirmation Modal for Unanswered Questions */}
      {showSubmitConfirm && (
        <div className="modal-backdrop" data-testid="unanswered-warning-modal">
          <div className="modal-card">
            <h3>&#9888; Warning: Unanswered Questions</h3>
            <p>
              You have <strong>{unanswered.length}</strong> unanswered question(s):
            </p>
            <ul className="unanswered-list">
              {unanswered.map((u) => (
                <li key={u.id}>
                  #{u.orderIndex + 1}: {u.title}
                </li>
              ))}
            </ul>
            <p className="help-text">
              Unanswered questions will receive 0 points. Are you sure you want to finalize and submit?
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSubmitConfirm(false)}
              >
                Return to Exam
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleSubmit}
                data-testid="confirm-submit-button"
              >
                Submit Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
