import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExamTakingView } from './ExamTakingView';
import * as examsApi from '../../services/exams';
import { ExamAttemptQuestionsDto, ExamResponseDto, ExamResultSummaryDto } from '@ule/contracts';

vi.mock('../../services/exams', async () => {
  const actual = await vi.importActual<typeof examsApi>('../../services/exams');
  return {
    ...actual,
    fetchExamQuestions: vi.fn(),
    fetchExamResponses: vi.fn(),
    saveExamResponse: vi.fn(),
    submitExamAttempt: vi.fn(),
  };
});

describe('Phase 6: ExamTakingView', () => {
  const onFinish = vi.fn();
  const onCancel = vi.fn();

  const mockQuestions: ExamAttemptQuestionsDto = {
    attemptId: 'att-100',
    assessmentVersionId: 'ver-100',
    status: 'IN_PROGRESS',
    startedAt: '2026-11-01T10:00:00.000Z',
    deadlineAt: new Date(Date.now() + 600000).toISOString(),
    durationMinutes: 30,
    totalPoints: 10,
    itemCount: 2,
    sections: [
      {
        id: 'sec-1',
        title: 'Section 1',
        description: 'First section',
        orderIndex: 0,
        items: [
          {
            id: 'item-1',
            questionVersionId: 'qv-1',
            type: 'SINGLE_CHOICE',
            title: 'Q1 Choice',
            prompt: 'Pick one',
            content: {
              options: [
                { id: 'opt-a', text: 'Alpha' },
                { id: 'opt-b', text: 'Beta' },
              ],
            },
            points: 5,
            orderIndex: 0,
            isRequired: true,
          },
          {
            id: 'item-2',
            questionVersionId: 'qv-2',
            type: 'SHORT_TEXT',
            title: 'Q2 Text',
            prompt: 'Type word',
            content: { placeholder: 'Your word' },
            points: 5,
            orderIndex: 1,
            isRequired: true,
          },
        ],
      },
    ],
  };

  const mockResponses: ExamResponseDto[] = [
    {
      id: 'resp-1',
      examAttemptId: 'att-100',
      itemRefId: 'item-1',
      questionVersionId: 'qv-1',
      responsePayload: { selectedOptionId: 'opt-a' },
      revision: 1,
      savedAt: '2026-11-01T10:05:00.000Z',
      isFinal: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(examsApi.fetchExamQuestions).mockResolvedValue(mockQuestions);
    vi.mocked(examsApi.fetchExamResponses).mockResolvedValue(mockResponses);
  });

  it('loads questions and existing saved responses correctly', async () => {
    render(
      <ExamTakingView
        attemptId="att-100"
        onFinish={onFinish}
        onCancel={onCancel}
        debounceMs={50}
      />,
    );

    expect(screen.getByTestId('exam-loading')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('exam-taking-view')).toBeInTheDocument();
    });

    expect(screen.getByText('Q1 Choice')).toBeInTheDocument();
    expect(screen.getByText('Q2 Text')).toBeInTheDocument();
    // Opt-a should be checked from initial saved response
    expect(screen.getByLabelText('Alpha')).toBeChecked();
  });

  it('performs debounced autosave when an answer is changed', async () => {
    vi.mocked(examsApi.saveExamResponse).mockResolvedValue({
      id: 'resp-1',
      examAttemptId: 'att-100',
      itemRefId: 'item-1',
      questionVersionId: 'qv-1',
      responsePayload: { selectedOptionId: 'opt-b' },
      revision: 2,
      savedAt: new Date().toISOString(),
      isFinal: false,
    });

    render(
      <ExamTakingView
        attemptId="att-100"
        onFinish={onFinish}
        onCancel={onCancel}
        debounceMs={50}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    // Select Option Beta
    fireEvent.click(screen.getByLabelText('Beta'));

    await waitFor(() => {
      expect(examsApi.saveExamResponse).toHaveBeenCalledWith(
        'att-100',
        'item-1',
        { selectedOptionId: 'opt-b' },
        1, // expectedRevision
      );
    });

    await waitFor(() => {
      const indicator = screen.getByTestId('autosave-indicator');
      expect(indicator).toHaveTextContent(/Saved/);
    });
  });

  it('displays error and conflict warning when autosave returns HTTP 409', async () => {
    vi.mocked(examsApi.saveExamResponse).mockRejectedValue(
      new examsApi.ExamApiError(409, 'Conflict: Expected revision 1 but found 3.'),
    );

    render(
      <ExamTakingView
        attemptId="att-100"
        onFinish={onFinish}
        onCancel={onCancel}
        debounceMs={50}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Beta'));

    await waitFor(() => {
      expect(screen.getByText(/Conflict: Expected revision/i)).toBeInTheDocument();
    });
  });

  it('displays unanswered warning modal when attempting submit with missing required items', async () => {
    render(
      <ExamTakingView
        attemptId="att-100"
        onFinish={onFinish}
        onCancel={onCancel}
        debounceMs={50}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('submit-exam-button')).toBeInTheDocument();
    });

    // item-2 is unanswered
    fireEvent.click(screen.getByTestId('submit-exam-button'));

    expect(await screen.findByTestId('unanswered-warning-modal')).toBeInTheDocument();
    expect(screen.getByText(/#2: Q2 Text/)).toBeInTheDocument();

    // Confirm submission anyway
    const mockResult: ExamResultSummaryDto = {
      attemptId: 'att-100',
      status: 'COMPLETED',
      startedAt: '2026-11-01T10:00:00.000Z',
      submittedAt: '2026-11-01T10:15:00.000Z',
      deadlineAt: null,
      feedbackPolicy: 'ON_SUBMISSION',
      isReleased: true,
      releasedAt: '2026-11-01T10:15:00.000Z',
    };
    vi.mocked(examsApi.submitExamAttempt).mockResolvedValue(mockResult);

    fireEvent.click(screen.getByTestId('confirm-submit-button'));

    await waitFor(() => {
      expect(examsApi.submitExamAttempt).toHaveBeenCalledWith('att-100');
      expect(onFinish).toHaveBeenCalledWith(mockResult);
    });
  });
});
