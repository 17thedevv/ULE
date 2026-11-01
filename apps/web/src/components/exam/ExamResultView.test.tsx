import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ExamResultSummaryDto } from '@ule/contracts';
import { ExamResultView } from './ExamResultView';

describe('Phase 6: ExamResultView', () => {
  const onReturn = vi.fn();

  it('renders COMPLETED released results with grade breakdown', () => {
    const result: ExamResultSummaryDto = {
      attemptId: 'att-12345',
      status: 'COMPLETED',
      startedAt: '2026-11-01T10:00:00.000Z',
      submittedAt: '2026-11-01T10:30:00.000Z',
      deadlineAt: '2026-11-01T11:00:00.000Z',
      feedbackPolicy: 'ON_SUBMISSION',
      isReleased: true,
      releasedAt: '2026-11-01T10:30:00.000Z',
      grade: {
        id: 'grade-1',
        examAttemptId: 'att-12345',
        objectivePoints: 40,
        pendingHumanPoints: 0,
        totalAwardedPoints: 40,
        maxPossiblePoints: 50,
        percentageScore: 80,
        isPassing: true,
        aggregationStatus: 'FULLY_GRADED',
        evaluatorVersion: 'v1.0.0',
        evaluatedAt: '2026-11-01T10:30:00.000Z',
        isReleased: true,
        releasedAt: '2026-11-01T10:30:00.000Z',
        itemGrades: [
          {
            id: 'ig-1',
            itemRefId: 'item-1',
            questionVersionId: 'qv-1',
            questionType: 'SINGLE_CHOICE',
            maxPoints: 25,
            awardedPoints: 25,
            isCorrect: true,
            isPendingHuman: false,
          },
          {
            id: 'ig-2',
            itemRefId: 'item-2',
            questionVersionId: 'qv-2',
            questionType: 'TRUE_FALSE',
            maxPoints: 25,
            awardedPoints: 15,
            isCorrect: false,
            isPendingHuman: false,
          },
        ],
      },
    };

    render(<ExamResultView result={result} onReturn={onReturn} />);

    expect(screen.getByTestId('result-completed-banner')).toHaveTextContent(/Examination Passed/i);
    expect(screen.getByText('40 / 50')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByTestId('item-breakdown-card')).toBeInTheDocument();
    expect(screen.getByText('Q1')).toBeInTheDocument();
    expect(screen.getByText('Q2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Return to Examinations/i }));
    expect(onReturn).toHaveBeenCalled();
  });

  it('renders GRADING status with human evaluation pending banner without score leaks', () => {
    const result: ExamResultSummaryDto = {
      attemptId: 'att-grading',
      status: 'GRADING',
      startedAt: '2026-11-01T10:00:00.000Z',
      submittedAt: '2026-11-01T10:45:00.000Z',
      deadlineAt: null,
      feedbackPolicy: 'ON_SUBMISSION',
      isReleased: false,
      releasedAt: null,
    };

    render(<ExamResultView result={result} onReturn={onReturn} />);

    expect(screen.getByTestId('result-grading-banner')).toHaveTextContent(/Pending Human Evaluation/i);
    // Never leaks internal grades while pending human review
    expect(screen.queryByTestId('item-breakdown-card')).not.toBeInTheDocument();
    expect(screen.queryByText(/Total Score/i)).not.toBeInTheDocument();
  });

  it('renders DEFERRED withheld banner when results are not yet released', () => {
    const result: ExamResultSummaryDto = {
      attemptId: 'att-deferred',
      status: 'COMPLETED',
      startedAt: '2026-11-01T10:00:00.000Z',
      submittedAt: '2026-11-01T10:30:00.000Z',
      deadlineAt: '2026-11-02T12:00:00.000Z',
      feedbackPolicy: 'DEFERRED',
      isReleased: false,
      releasedAt: null,
    };

    render(<ExamResultView result={result} onReturn={onReturn} />);

    expect(screen.getByTestId('result-deferred-banner')).toHaveTextContent(/Results Withheld/i);
    expect(screen.queryByTestId('item-breakdown-card')).not.toBeInTheDocument();
  });

  it('renders MANUAL withheld banner when educator release is required', () => {
    const result: ExamResultSummaryDto = {
      attemptId: 'att-manual',
      status: 'COMPLETED',
      startedAt: '2026-11-01T10:00:00.000Z',
      submittedAt: '2026-11-01T10:30:00.000Z',
      deadlineAt: null,
      feedbackPolicy: 'MANUAL',
      isReleased: false,
      releasedAt: null,
    };

    render(<ExamResultView result={result} onReturn={onReturn} />);

    expect(screen.getByTestId('result-manual-banner')).toHaveTextContent(
      /Results Awaiting Educator Release/i,
    );
  });

  it('renders EXPIRED session banner when deadline has passed', () => {
    const result: ExamResultSummaryDto = {
      attemptId: 'att-expired',
      status: 'EXPIRED',
      startedAt: '2026-11-01T10:00:00.000Z',
      submittedAt: null,
      deadlineAt: '2026-11-01T10:30:00.000Z',
      feedbackPolicy: 'ON_SUBMISSION',
      isReleased: false,
      releasedAt: null,
    };

    render(<ExamResultView result={result} onReturn={onReturn} />);

    expect(screen.getByTestId('result-expired-banner')).toHaveTextContent(
      /Examination Session Expired/i,
    );
  });
});
