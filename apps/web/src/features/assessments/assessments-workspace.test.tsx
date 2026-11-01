import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ExamsPage from './ExamsPage';
import ExamTakingPage from './ExamTakingPage';
import ExamResultPage from './ExamResultPage';
import * as examService from '../../services/exams';
import { ExamResultSummaryDto, LearnerEligibleExamDto } from '@ule/contracts';

vi.mock('../../services/exams', async () => {
  const actual = await vi.importActual('../../services/exams');
  return {
    ...actual,
    fetchEligibleExams: vi.fn(),
    startExamAttempt: vi.fn(),
    fetchExamResult: vi.fn(),
    fetchExamAppeals: vi.fn(),
    createExamAppeal: vi.fn(),
    fetchExamQuestions: vi.fn(),
    fetchExamResponses: vi.fn(),
    saveExamResponse: vi.fn(),
    submitExamAttempt: vi.fn(),
  };
});

describe('Assessment Center Workspace (UI-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders eligible exams list with actions on ExamsPage', async () => {
    const mockExams: LearnerEligibleExamDto[] = [
      {
        assessmentId: 'ass-1',
        assessmentVersionId: 'ver-1',
        versionNumber: 1,
        title: 'TypeScript Fundamentals Exam',
        description: 'Comprehensive test of TS syntax and types.',
        instructions: 'Closed-book examination. 45 minutes limit.',
        durationMinutes: 45,
        maxAttempts: 2,
        passingScore: 70,
        totalPoints: 100,
        itemCount: 15,
        existingAttemptsCount: 0,
        activeAttempt: null,
        latestAttempt: null,
      },
      {
        assessmentId: 'ass-2',
        assessmentVersionId: 'ver-2',
        versionNumber: 1,
        title: 'In-Progress Assessment',
        description: null,
        instructions: null,
        durationMinutes: null,
        maxAttempts: 1,
        passingScore: null,
        totalPoints: 50,
        itemCount: 5,
        existingAttemptsCount: 1,
        activeAttempt: {
          id: 'att-active-1',
          status: 'IN_PROGRESS',
          startedAt: new Date().toISOString(),
          deadlineAt: null,
        },
        latestAttempt: null,
      },
    ];

    vi.mocked(examService.fetchEligibleExams).mockResolvedValue(mockExams);
    vi.mocked(examService.startExamAttempt).mockResolvedValue({
      id: 'new-att-1',
      assessmentVersionId: 'ver-1',
      learnerId: 'user-1',
      attemptNumber: 1,
      status: 'IN_PROGRESS',
      startedAt: new Date().toISOString(),
      deadlineAt: null,
      submittedAt: null,
      completedAt: null,
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    render(
      <MemoryRouter>
        <ExamsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('TypeScript Fundamentals Exam')).toBeInTheDocument();
      expect(screen.getByText('In-Progress Assessment')).toBeInTheDocument();
    });

    expect(screen.getByText('Start Assessment')).toBeInTheDocument();
    expect(screen.getByText('Resume Attempt →')).toBeInTheDocument();
  });

  it('renders ExamTakingPage with ExamTakingView and handles invalid param', () => {
    render(
      <MemoryRouter initialEntries={['/app/exams/attempts/']}>
        <Routes>
          <Route path="/app/exams/attempts/" element={<ExamTakingPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Invalid Examination Attempt')).toBeInTheDocument();
  });

  it('renders ExamResultPage with score breakdown and appeals section', async () => {
    const mockResult: ExamResultSummaryDto = {
      attemptId: 'att-12345678-abcd',
      status: 'COMPLETED',
      startedAt: '2026-10-31T10:00:00Z',
      submittedAt: '2026-10-31T10:30:00Z',
      deadlineAt: '2026-10-31T11:00:00Z',
      feedbackPolicy: 'IMMEDIATE',
      isReleased: true,
      releasedAt: '2026-10-31T10:30:00Z',
      grade: {
        id: 'grade-1',
        examAttemptId: 'att-12345678-abcd',
        objectivePoints: 85,
        pendingHumanPoints: 0,
        totalAwardedPoints: 85,
        maxPossiblePoints: 100,
        percentageScore: 85,
        isPassing: true,
        aggregationStatus: 'FULLY_GRADED',
        evaluatorVersion: '1.0.0',
        evaluatedAt: '2026-10-31T10:30:00Z',
        isReleased: true,
        releasedAt: '2026-10-31T10:30:00Z',
        itemGrades: [
          {
            id: 'ig-1',
            itemRefId: 'q-1',
            questionVersionId: 'qv-1',
            questionType: 'MULTIPLE_CHOICE',
            maxPoints: 50,
            awardedPoints: 50,
            isCorrect: true,
            isPendingHuman: false,
          },
        ],
      },
    };

    vi.mocked(examService.fetchExamResult).mockResolvedValue(mockResult);
    vi.mocked(examService.fetchExamAppeals).mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/app/exams/attempts/att-12345678-abcd/result']}>
        <Routes>
          <Route path="/app/exams/attempts/:attemptId/result" element={<ExamResultPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Examination Results')).toBeInTheDocument();
      expect(screen.getByText('85 / 100')).toBeInTheDocument();
      expect(screen.getByText('Grade Appeals & Regrading Requests')).toBeInTheDocument();
    });
  });

  it('submits a grade appeal on ExamResultPage', async () => {
    const mockResult: ExamResultSummaryDto = {
      attemptId: 'att-appeal-test',
      status: 'COMPLETED',
      startedAt: '2026-10-31T10:00:00Z',
      submittedAt: '2026-10-31T10:30:00Z',
      deadlineAt: null,
      feedbackPolicy: 'IMMEDIATE',
      isReleased: true,
      releasedAt: '2026-10-31T10:30:00Z',
    };

    vi.mocked(examService.fetchExamResult).mockResolvedValue(mockResult);
    vi.mocked(examService.fetchExamAppeals).mockResolvedValue([]);
    vi.mocked(examService.createExamAppeal).mockResolvedValue({ id: 'app-1', status: 'OPEN' });

    render(
      <MemoryRouter initialEntries={['/app/exams/attempts/att-appeal-test/result']}>
        <Routes>
          <Route path="/app/exams/attempts/:attemptId/result" element={<ExamResultPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Grade Appeals & Regrading Requests')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText(/Explain the specific factual or rubric discrepancy/i);
    fireEvent.change(textarea, { target: { value: 'Question 1 criterion 2 was evaluated incorrectly.' } });

    const submitBtn = screen.getByRole('button', { name: /Submit Appeal/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(examService.createExamAppeal).toHaveBeenCalledWith('att-appeal-test', {
        reason: 'Question 1 criterion 2 was evaluated incorrectly.',
      });
      expect(screen.getByText(/Your appeal has been submitted/i)).toBeInTheDocument();
    });
  });
});
