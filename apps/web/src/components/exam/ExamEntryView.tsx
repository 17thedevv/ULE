import React, { useEffect, useState } from 'react';
import { LearnerEligibleExamDto } from '@ule/contracts';
import {
  ExamApiError,
  fetchEligibleExam,
  fetchEligibleExams,
  startExamAttempt,
} from '../../services/exams';

interface ExamEntryViewProps {
  onStartAttempt: (attemptId: string) => void;
  onViewResult: (attemptId: string) => void;
}

export const ExamEntryView: React.FC<ExamEntryViewProps> = ({
  onStartAttempt,
  onViewResult,
}) => {
  const [exams, setExams] = useState<LearnerEligibleExamDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [startingVersionId, setStartingVersionId] = useState<string | null>(null);

  // Direct version lookup input
  const [customVersionId, setCustomVersionId] = useState<string>('');
  const [searchingCustom, setSearchingCustom] = useState<boolean>(false);

  const loadExams = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEligibleExams();
      setExams(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load eligible examinations';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, []);

  const handleStartOrResume = async (exam: LearnerEligibleExamDto) => {
    setActionError(null);
    // If active attempt exists, resume directly
    if (exam.activeAttempt && exam.activeAttempt.status === 'IN_PROGRESS') {
      onStartAttempt(exam.activeAttempt.id);
      return;
    }

    setStartingVersionId(exam.assessmentVersionId);
    try {
      const attempt = await startExamAttempt(exam.assessmentVersionId);
      onStartAttempt(attempt.id);
    } catch (err) {
      if (err instanceof ExamApiError) {
        if (err.statusCode === 403) {
          setActionError('Access Denied: Missing explicit access grant or active course enrollment.');
        } else if (err.statusCode === 409) {
          setActionError(err.message || 'Attempt limit exceeded or attempt already in progress.');
        } else {
          setActionError(err.message);
        }
      } else {
        setActionError(err instanceof Error ? err.message : 'Failed to start examination');
      }
    } finally {
      setStartingVersionId(null);
    }
  };

  const handleLookupCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customVersionId.trim();
    if (!trimmed) return;

    setSearchingCustom(true);
    setActionError(null);
    try {
      const exam = await fetchEligibleExam(trimmed);
      // If not already in list, prepend
      setExams((prev) => {
        const exists = prev.some((x) => x.assessmentVersionId === exam.assessmentVersionId);
        return exists ? prev : [exam, ...prev];
      });
      setCustomVersionId('');
    } catch (err) {
      if (err instanceof ExamApiError && err.statusCode === 403) {
        setActionError(`Unauthorized: You do not have access to examination '${trimmed}'.`);
      } else if (err instanceof ExamApiError && err.statusCode === 404) {
        setActionError(`Examination version '${trimmed}' not found.`);
      } else {
        setActionError(err instanceof Error ? err.message : 'Lookup failed');
      }
    } finally {
      setSearchingCustom(false);
    }
  };

  return (
    <div className="exam-entry-view" data-testid="exam-entry-view">
      <div className="entry-header">
        <h2>Eligible Examinations</h2>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={loadExams}
          disabled={loading}
        >
          &#8635; Refresh
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {actionError && (
        <div className="alert alert-warning" data-testid="entry-action-error">
          {actionError}
        </div>
      )}

      {/* Direct Version Lookup Form */}
      <form onSubmit={handleLookupCustom} className="custom-exam-form">
        <label htmlFor="customVersionInput" className="form-label">
          Have an Examination Version ID?
        </label>
        <div className="input-group">
          <input
            id="customVersionInput"
            type="text"
            className="input"
            placeholder="Enter AssessmentVersion UUID"
            value={customVersionId}
            onChange={(e) => setCustomVersionId(e.target.value)}
            disabled={searchingCustom}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={searchingCustom || !customVersionId.trim()}
          >
            {searchingCustom ? 'Checking...' : 'Find Exam'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="loading-state">Loading eligible examinations...</div>
      ) : exams.length === 0 ? (
        <div className="empty-state">
          <p>No examinations currently authorized for your account.</p>
          <span className="help-text">
            Enroll in a course with published exams or request an access grant from your instructor.
          </span>
        </div>
      ) : (
        <div className="exam-cards-grid">
          {exams.map((exam) => {
            const hasActiveAttempt =
              exam.activeAttempt && exam.activeAttempt.status === 'IN_PROGRESS';
            const attemptsLeft =
              exam.maxAttempts > 0 ? Math.max(0, exam.maxAttempts - exam.existingAttemptsCount) : null;
            const isLimitReached = exam.maxAttempts > 0 && exam.existingAttemptsCount >= exam.maxAttempts;
            const canStart = !isLimitReached || hasActiveAttempt;

            return (
              <div
                key={exam.assessmentVersionId}
                className="card exam-entry-card"
                data-testid={`exam-card-${exam.assessmentVersionId}`}
              >
                <div className="exam-card-header">
                  <div className="exam-badge-row">
                    <span className="tag">v{exam.versionNumber}</span>
                    {exam.durationMinutes ? (
                      <span className="tag tag-timed">&#9201; {exam.durationMinutes} min</span>
                    ) : (
                      <span className="tag tag-untimed">&#9200; Untimed</span>
                    )}
                    {hasActiveAttempt && (
                      <span className="tag tag-active">&#9679; Attempt In Progress</span>
                    )}
                  </div>
                  <h3 className="exam-card-title">{exam.title}</h3>
                  {exam.description && <p className="exam-card-desc">{exam.description}</p>}
                </div>

                <div className="exam-card-meta">
                  <div className="meta-item">
                    <span className="meta-label">Questions:</span>
                    <span className="meta-value">{exam.itemCount}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Total Points:</span>
                    <span className="meta-value">{exam.totalPoints} pts</span>
                  </div>
                  {exam.passingScore != null && (
                    <div className="meta-item">
                      <span className="meta-label">Passing Score:</span>
                      <span className="meta-value">{exam.passingScore}%</span>
                    </div>
                  )}
                  <div className="meta-item">
                    <span className="meta-label">Attempts:</span>
                    <span className="meta-value">
                      {exam.existingAttemptsCount} / {exam.maxAttempts || 'Unlimited'}
                      {attemptsLeft !== null && ` (${attemptsLeft} left)`}
                    </span>
                  </div>
                </div>

                {exam.instructions && (
                  <div className="exam-instructions-box">
                    <strong>Instructions:</strong> {exam.instructions}
                  </div>
                )}

                <div className="exam-card-actions">
                  {hasActiveAttempt ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleStartOrResume(exam)}
                    >
                      Resume Examination &rarr;
                    </button>
                  ) : canStart ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleStartOrResume(exam)}
                      disabled={startingVersionId === exam.assessmentVersionId}
                    >
                      {startingVersionId === exam.assessmentVersionId
                        ? 'Starting Attempt...'
                        : 'Start Examination &rarr;'}
                    </button>
                  ) : (
                    <span className="badge badge-neutral">Max Attempts Reached</span>
                  )}

                  {exam.latestAttempt && !hasActiveAttempt && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onViewResult(exam.latestAttempt!.id)}
                    >
                      View Last Result
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
