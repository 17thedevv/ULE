import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GradingQueuePage from './GradingQueuePage';
import RubricEvaluationPage from './RubricEvaluationPage';
import AppealsReviewPage from './AppealsReviewPage';
import * as gradingService from '../../services/grading';
import { ExamGradingQueueItemDto, ExamGradeAppealDto } from '@ule/contracts';

vi.mock('../../services/grading', async () => {
  const actual = await vi.importActual('../../services/grading');
  return {
    ...actual,
    fetchGradingQueue: vi.fn(),
    fetchGradingAttempt: vi.fn(),
    evaluateExamItem: vi.fn(),
    correctExamItemGrade: vi.fn(),
    finalizeExamGrading: vi.fn(),
    fetchGradeRevisions: vi.fn(),
    fetchAppealsForAttempt: vi.fn(),
    fetchAppeal: vi.fn(),
    reviewAppeal: vi.fn(),
    resolveAppeal: vi.fn(),
  };
});

describe('Grading Workspace (UI-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pending attempts in GradingQueuePage', async () => {
    const mockQueue: ExamGradingQueueItemDto[] = [
      {
        attemptId: 'att-queue-1',
        assessmentVersionId: 'ver-1',
        assessmentTitle: 'Advanced Data Structures Midterm',
        learnerId: 'learner-1',
        learnerName: 'Alice Learner',
        submittedAt: '2026-10-31T14:00:00Z',
        pendingItemCount: 2,
        pendingItems: [],
      },
    ];

    vi.mocked(gradingService.fetchGradingQueue).mockResolvedValue(mockQueue);

    render(
      <MemoryRouter>
        <GradingQueuePage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Advanced Data Structures Midterm')).toBeInTheDocument();
      expect(screen.getByText('Alice Learner')).toBeInTheDocument();
      expect(screen.getByText('2 pending items')).toBeInTheDocument();
      expect(screen.getByText('Grade Attempt →')).toBeInTheDocument();
    });
  });

  it('renders RubricEvaluationPage with submitted response and evaluates item', async () => {
    const mockContext = {
      id: 'att-grading-1',
      status: 'GRADING',
      learnerId: 'learner-1',
      learner: { name: 'Bob Smith', email: 'bob@example.com' },
      assessmentVersion: {
        assessmentDefinition: { title: 'Modern Web Architecture Exam' },
      },
      responses: [
        {
          itemRefId: 'item-ref-1',
          responsePayload: { text: 'In micro-frontends, shared state should be decoupled using events.' },
        },
      ],
      grade: {
        totalAwardedPoints: 0,
        maxPossiblePoints: 50,
        itemGrades: [
          {
            id: 'ig-subjective-1',
            itemRefId: 'item-ref-1',
            questionType: 'ESSAY',
            maxPoints: 20,
            awardedPoints: 0,
            isPendingHuman: true,
            revision: 1,
          },
        ],
      },
    };

    vi.mocked(gradingService.fetchGradingAttempt).mockResolvedValue(mockContext);
    vi.mocked(gradingService.fetchGradeRevisions).mockResolvedValue({
      aggregateRevisions: [],
      itemRevisions: [],
    });
    vi.mocked(gradingService.fetchAppealsForAttempt).mockResolvedValue([]);
    vi.mocked(gradingService.evaluateExamItem).mockResolvedValue({
      id: 'ig-subjective-1',
      itemRefId: 'item-ref-1',
      questionVersionId: 'qv-1',
      questionType: 'ESSAY',
      maxPoints: 20,
      awardedPoints: 18,
      isCorrect: true,
      isPendingHuman: false,
    });

    render(
      <MemoryRouter initialEntries={['/studio/grading/attempts/att-grading-1']}>
        <Routes>
          <Route path="/studio/grading/attempts/:attemptId" element={<RubricEvaluationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Grade Attempt: Modern Web Architecture Exam/i)).toBeInTheDocument();
      expect(screen.getByText(/In micro-frontends, shared state should be decoupled/i)).toBeInTheDocument();
      expect(screen.getByText('Pending Evaluation')).toBeInTheDocument();
    });

    // Enter points
    const pointsInput = screen.getByLabelText(/Awarded Points/i);
    fireEvent.change(pointsInput, { target: { value: '18' } });

    // Submit evaluation
    const submitBtn = screen.getByRole('button', { name: /Submit Evaluation/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(gradingService.evaluateExamItem).toHaveBeenCalledWith('ig-subjective-1', {
        awardedPoints: 18,
        feedback: '',
        expectedRevision: 1,
      });
    });
  });

  it('renders AppealsReviewPage and transitions appeal to UNDER_REVIEW', async () => {
    const mockAppeal: ExamGradeAppealDto = {
      id: 'appeal-review-1',
      examAttemptId: 'att-appeal-1',
      examItemGradeId: 'ig-1',
      learnerId: 'learner-99',
      status: 'OPEN',
      reason: 'Rubric criterion for caching architecture was fulfilled in paragraph 3.',
      gradeRevisionAtSubmission: 1,
      reviewerId: null,
      reviewerNotes: null,
      resolution: null,
      resolvedAt: null,
      createdAt: '2026-10-31T15:00:00Z',
      updatedAt: '2026-10-31T15:00:00Z',
    };

    vi.mocked(gradingService.fetchAppeal).mockResolvedValue(mockAppeal);
    vi.mocked(gradingService.reviewAppeal).mockResolvedValue({
      ...mockAppeal,
      status: 'UNDER_REVIEW',
    });

    render(
      <MemoryRouter initialEntries={['/studio/grading/appeals/appeal-review-1']}>
        <Routes>
          <Route path="/studio/grading/appeals/:appealId" element={<AppealsReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Grade Appeal Review/i)).toBeInTheDocument();
      expect(screen.getByText(/Rubric criterion for caching architecture was fulfilled/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Start Review/i })).toBeInTheDocument();
    });

    // Click start review
    fireEvent.click(screen.getByRole('button', { name: /Start Review/i }));

    await waitFor(() => {
      expect(gradingService.reviewAppeal).toHaveBeenCalledWith('appeal-review-1');
    });
  });
});
