import React, { useState } from 'react';
import { ExamResultSummaryDto } from '@ule/contracts';
import { fetchExamResult } from '../services/exams';
import { ExamEntryView } from './exam/ExamEntryView';
import { ExamResultView } from './exam/ExamResultView';
import { ExamTakingView } from './exam/ExamTakingView';

type ExamViewMode = 'ENTRY' | 'TAKING' | 'RESULT';

export const LearnerExamStudio: React.FC = () => {
  const [viewMode, setViewMode] = useState<ExamViewMode>('ENTRY');
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<ExamResultSummaryDto | null>(null);
  const [loadingResult, setLoadingResult] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartAttempt = (attemptId: string) => {
    setActiveAttemptId(attemptId);
    setViewMode('TAKING');
  };

  const handleFinishAttempt = (result: ExamResultSummaryDto) => {
    setResultSummary(result);
    setViewMode('RESULT');
  };

  const handleCancelTaking = () => {
    setActiveAttemptId(null);
    setViewMode('ENTRY');
  };

  const handleViewResult = async (attemptId: string) => {
    setLoadingResult(true);
    setError(null);
    try {
      const res = await fetchExamResult(attemptId);
      setResultSummary(res);
      setViewMode('RESULT');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retrieve examination result');
    } finally {
      setLoadingResult(false);
    }
  };

  const handleReturnToEntry = () => {
    setActiveAttemptId(null);
    setResultSummary(null);
    setViewMode('ENTRY');
  };

  return (
    <div className="card learner-exam-studio" data-testid="learner-exam-studio">
      <div className="studio-header">
        <div className="studio-brand">
          <span className="badge badge-primary">Phase 6</span>
          <h2>Learner Examination Experience</h2>
        </div>
        {viewMode !== 'ENTRY' && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={handleReturnToEntry}
          >
            &larr; Exit to List
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {loadingResult && <div className="loading-state">Loading examination result...</div>}

      {viewMode === 'ENTRY' && !loadingResult && (
        <ExamEntryView
          onStartAttempt={handleStartAttempt}
          onViewResult={handleViewResult}
        />
      )}

      {viewMode === 'TAKING' && activeAttemptId && (
        <ExamTakingView
          attemptId={activeAttemptId}
          onFinish={handleFinishAttempt}
          onCancel={handleCancelTaking}
        />
      )}

      {viewMode === 'RESULT' && resultSummary && (
        <ExamResultView
          result={resultSummary}
          onReturn={handleReturnToEntry}
        />
      )}
    </div>
  );
};
