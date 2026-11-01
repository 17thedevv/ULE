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

  // 1. Initial Load
  useEffect(() => {
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
      // Clear any pending timers on unmount
      Object.values(timers).forEach(clearTimeout);
    };
  }, [attemptId]);

  // 2. Perform Save
  const performSave = useCallback(
    async (itemId: string, payload: Record<string, unknown>, expectedRevision?: number) => {
      setAutosaveStatus('SAVING');
      setAutosaveError(null);
      try {
        const saved = await saveExamResponse(attemptId, itemId, payload, expectedRevision);
        setAnswers((prev) => ({
          ...prev,
          [itemId]: {
            payload: saved.responsePayload,
            revision: saved.revision,
          },
        }));
        setAutosaveStatus('SAVED');
        setLastSavedAt(new Date());
      } catch (err) {
        if (err instanceof ExamApiError && err.statusCode === 409) {
          setAutosaveStatus('ERROR');
          setAutosaveError(err.message || 'Stale response revision (409 Conflict).');
        } else {
          setAutosaveStatus('ERROR');
          setAutosaveError(err instanceof Error ? err.message : 'Autosave failed.');
        }
      }
    },
    [attemptId],
  );

  // 3. Question Response Changed
  const handleAnswerChange = (itemId: string, newPayload: Record<string, unknown>) => {
    if (isExpired || isSubmitting) return;

    const currentItem = answersRef.current[itemId];
    const currentRev = currentItem?.revision ?? 0;

    // Optimistically update UI
    setAnswers((prev) => ({
      ...prev,
      [itemId]: {
        payload: newPayload,
        revision: currentRev,
      },
    }));

    // Debounce save request
    if (debounceTimers.current[itemId]) {
      clearTimeout(debounceTimers.current[itemId]);
    }

    setAutosaveStatus('SAVING');
    debounceTimers.current[itemId] = setTimeout(() => {
      performSave(itemId, newPayload, currentRev > 0 ? currentRev : undefined);
    }, debounceMs);
  };

  // 4. Timer Expiration Handler
  const handleTimerExpire = () => {
    setIsExpired(true);
  };

  // 5. Check unanswered questions
  const getUnansweredQuestions = () => {
    if (!blueprint) return [];
    const unanswered: Array<{ id: string; title: string; orderIndex: number }> = [];

    for (const sec of blueprint.sections) {
      for (const item of sec.items) {
        const ans = answers[item.id];
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

  // 6. Final Submission
  const handleSubmit = async () => {
    setShowSubmitConfirm(false);
    setIsSubmitting(true);
    setSubmitError(null);

    // Flush any pending debounces before submission
    const pendingItems = Object.keys(debounceTimers.current);
    if (pendingItems.length > 0) {
      for (const itemId of pendingItems) {
        clearTimeout(debounceTimers.current[itemId]);
        delete debounceTimers.current[itemId];
      }
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
            onRetry={() => {
              // Retry any pending
              Object.entries(answers).forEach(([k, v]) => performSave(k, v.payload, v.revision));
            }}
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
            onClick={onCancel}
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
