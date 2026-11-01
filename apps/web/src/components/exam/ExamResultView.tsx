import React from 'react';
import { ExamResultSummaryDto } from '@ule/contracts';

interface ExamResultViewProps {
  result: ExamResultSummaryDto;
  onReturn: () => void;
}

export const ExamResultView: React.FC<ExamResultViewProps> = ({ result, onReturn }) => {
  const { status, feedbackPolicy, isReleased, grade } = result;

  const renderStatusBanner = () => {
    if (status === 'EXPIRED') {
      return (
        <div className="alert alert-danger" data-testid="result-expired-banner">
          <h3>&#9888; Examination Session Expired</h3>
          <p>
            The authoritative server deadline elapsed before completion. Unsubmitted answers have been frozen.
          </p>
        </div>
      );
    }

    if (status === 'GRADING') {
      return (
        <div className="alert alert-info" data-testid="result-grading-banner">
          <h3>&#9998; Pending Human Evaluation</h3>
          <p>
            Your examination has been submitted successfully. Subjective responses (such as essays or extended text)
            are queued for educator rubric evaluation.
          </p>
          <p className="help-text">
            Authoritative results will become visible once the educator finishes grading.
          </p>
        </div>
      );
    }

    if (!isReleased && feedbackPolicy === 'DEFERRED') {
      return (
        <div className="alert alert-warning" data-testid="result-deferred-banner">
          <h3>&#128274; Results Withheld (Deferred Feedback)</h3>
          <p>
            This examination uses a Deferred feedback policy. In accordance with examination integrity rules,
            scores and answer evaluations are withheld until the final deadline.
          </p>
          {result.deadlineAt && (
            <p className="help-text">
              Expected release: {new Date(result.deadlineAt).toLocaleString()}
            </p>
          )}
        </div>
      );
    }

    if (!isReleased && feedbackPolicy === 'MANUAL') {
      return (
        <div className="alert alert-warning" data-testid="result-manual-banner">
          <h3>&#128274; Results Awaiting Educator Release</h3>
          <p>
            This examination uses a Manual feedback policy. Your submission is complete and awaiting explicit release
            by the assessment author.
          </p>
        </div>
      );
    }

    if (status === 'COMPLETED' && isReleased && grade) {
      const isPassed = grade.isPassing;
      return (
        <div
          className={`alert ${isPassed ? 'alert-success' : 'alert-danger'}`}
          data-testid="result-completed-banner"
        >
          <h3>{isPassed ? '&#10003; Examination Passed' : '&#10007; Examination Not Passed'}</h3>
          <div className="score-summary-grid">
            <div className="score-stat">
              <span className="stat-label">Total Score</span>
              <span className="stat-value">
                {grade.totalAwardedPoints} / {grade.maxPossiblePoints}
              </span>
            </div>
            <div className="score-stat">
              <span className="stat-label">Percentage</span>
              <span className="stat-value">{grade.percentageScore ?? 0}%</span>
            </div>
            <div className="score-stat">
              <span className="stat-label">Status</span>
              <span className="stat-value">{isPassed ? 'Passed' : 'Failed'}</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="alert alert-info">
        <h3>Examination Status: {status}</h3>
        <p>Submitted at: {result.submittedAt ? new Date(result.submittedAt).toLocaleString() : 'N/A'}</p>
      </div>
    );
  };

  const renderItemGrades = () => {
    if (!isReleased || !grade?.itemGrades || grade.itemGrades.length === 0) {
      return null;
    }

    return (
      <div className="card item-breakdown-card" data-testid="item-breakdown-card">
        <h3>Question Breakdown</h3>
        <div className="item-grade-list">
          {grade.itemGrades.map((item, idx) => (
            <div key={item.id || idx} className="item-grade-row">
              <span className="item-index">Q{idx + 1}</span>
              <span className="item-type badge badge-neutral">{item.questionType}</span>
              <span className="item-points">
                {item.awardedPoints} / {item.maxPoints} pts
              </span>
              <span className={`item-badge ${item.isCorrect ? 'badge-success' : 'badge-danger'}`}>
                {item.isCorrect ? 'Correct' : 'Incorrect'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="exam-result-view" data-testid="exam-result-view">
      <div className="result-header">
        <h2>Examination Results</h2>
        <span className="tag">Attempt: {result.attemptId.slice(0, 8)}...</span>
      </div>

      {renderStatusBanner()}

      {renderItemGrades()}

      <div className="result-actions">
        <button type="button" className="btn btn-primary" onClick={onReturn}>
          &larr; Return to Examinations
        </button>
      </div>
    </div>
  );
};
