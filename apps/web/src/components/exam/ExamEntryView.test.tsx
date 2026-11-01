import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExamEntryView } from './ExamEntryView';
import * as examsApi from '../../services/exams';
import { LearnerEligibleExamDto } from '@ule/contracts';

vi.mock('../../services/exams', async () => {
  const actual = await vi.importActual<typeof examsApi>('../../services/exams');
  return {
    ...actual,
    fetchEligibleExams: vi.fn(),
    fetchEligibleExam: vi.fn(),
    startExamAttempt: vi.fn(),
  };
});

describe('Phase 6: ExamEntryView', () => {
  const onStartAttempt = vi.fn();
  const onViewResult = vi.fn();

  const mockExams: LearnerEligibleExamDto[] = [
    {
      assessmentId: 'asmt-1',
      assessmentVersionId: 'ver-1',
      versionNumber: 1,
      title: 'Distributed Systems Midterm',
      description: 'Comprehensive exam on consensus and raft',
      instructions: 'No calculators allowed.',
      durationMinutes: 60,
      maxAttempts: 2,
      passingScore: 70,
      totalPoints: 100,
      itemCount: 15,
      existingAttemptsCount: 0,
      activeAttempt: null,
      latestAttempt: null,
    },
    {
      assessmentId: 'asmt-2',
      assessmentVersionId: 'ver-2',
      versionNumber: 1,
      title: 'Database Architecture Final',
      description: 'ACID, WAL and linearizability',
      instructions: null,
      durationMinutes: null,
      maxAttempts: 1,
      passingScore: 80,
      totalPoints: 50,
      itemCount: 8,
      existingAttemptsCount: 1,
      activeAttempt: {
        id: 'att-active-2',
        status: 'IN_PROGRESS',
        startedAt: '2026-11-01T10:00:00.000Z',
        deadlineAt: null,
      },
      latestAttempt: {
        id: 'att-active-2',
        status: 'IN_PROGRESS',
        startedAt: '2026-11-01T10:00:00.000Z',
        completedAt: null,
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(examsApi.fetchEligibleExams).mockResolvedValue(mockExams);
  });

  it('renders eligible exams list with metadata', async () => {
    render(<ExamEntryView onStartAttempt={onStartAttempt} onViewResult={onViewResult} />);

    expect(await screen.findByText('Distributed Systems Midterm')).toBeInTheDocument();
    expect(screen.getByText('Database Architecture Final')).toBeInTheDocument();
    expect(screen.getByText(/60 min/)).toBeInTheDocument();
    expect(screen.getByText(/Untimed/)).toBeInTheDocument();
  });

  it('starts a new attempt when clicking Start Examination', async () => {
    vi.mocked(examsApi.startExamAttempt).mockResolvedValue({
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

    render(<ExamEntryView onStartAttempt={onStartAttempt} onViewResult={onViewResult} />);

    const startBtn = await screen.findByRole('button', { name: /Start Examination/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(examsApi.startExamAttempt).toHaveBeenCalledWith('ver-1');
      expect(onStartAttempt).toHaveBeenCalledWith('new-att-1');
    });
  });

  it('resumes active attempt directly without calling start API', async () => {
    render(<ExamEntryView onStartAttempt={onStartAttempt} onViewResult={onViewResult} />);

    const resumeBtn = await screen.findByRole('button', { name: /Resume Examination/i });
    fireEvent.click(resumeBtn);

    expect(examsApi.startExamAttempt).not.toHaveBeenCalled();
    expect(onStartAttempt).toHaveBeenCalledWith('att-active-2');
  });

  it('displays 403 Forbidden alert when access grant is missing', async () => {
    vi.mocked(examsApi.startExamAttempt).mockRejectedValue(
      new examsApi.ExamApiError(403, 'Learner is not authorized to attempt this examination.'),
    );

    render(<ExamEntryView onStartAttempt={onStartAttempt} onViewResult={onViewResult} />);

    const startBtn = await screen.findByRole('button', { name: /Start Examination/i });
    fireEvent.click(startBtn);

    expect(
      await screen.findByText(/Access Denied: Missing explicit access grant/i),
    ).toBeInTheDocument();
  });
});
