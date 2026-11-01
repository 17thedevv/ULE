import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

  it('flushes pending debounced save immediately and awaits it before submitting', async () => {
    let saveCompleted = false;
    let submittedAfterSave = false;

    vi.mocked(examsApi.saveExamResponse).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      saveCompleted = true;
      return {
        id: 'resp-2',
        examAttemptId: 'att-100',
        itemRefId: 'item-2',
        questionVersionId: 'qv-2',
        responsePayload: { text: 'Immediate answer' },
        revision: 1,
        savedAt: new Date().toISOString(),
        isFinal: false,
      };
    });

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

    vi.mocked(examsApi.submitExamAttempt).mockImplementation(async () => {
      if (saveCompleted) {
        submittedAfterSave = true;
      }
      return mockResult;
    });

    render(
      <ExamTakingView
        attemptId="att-100"
        onFinish={onFinish}
        onCancel={onCancel}
        debounceMs={1000} // High debounce so timer has not fired
      />,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Your word')).toBeInTheDocument();
    });

    // Enter answer in item-2
    const input = screen.getByPlaceholderText('Your word');
    fireEvent.change(input, { target: { value: 'Immediate answer' } });

    // Submit immediately before 1000ms debounce fires
    fireEvent.click(screen.getByTestId('submit-exam-button'));

    await waitFor(() => {
      expect(examsApi.saveExamResponse).toHaveBeenCalledWith(
        'att-100',
        'item-2',
        { text: 'Immediate answer' },
        undefined,
      );
      expect(examsApi.submitExamAttempt).toHaveBeenCalledWith('att-100');
      expect(submittedAfterSave).toBe(true);
      expect(onFinish).toHaveBeenCalledWith(mockResult);
    });
  });

  it('awaits in-flight autosave before submission, and aborts submission if autosave fails with 409 Conflict', async () => {
    let rejectInFlightSave!: (err: Error) => void;
    const inFlightPromise = new Promise<ExamResponseDto>((_, reject) => {
      rejectInFlightSave = reject;
    });

    vi.mocked(examsApi.saveExamResponse).mockImplementation(() => inFlightPromise);

    render(
      <ExamTakingView
        attemptId="att-100"
        onFinish={onFinish}
        onCancel={onCancel}
        debounceMs={10}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    // Click Beta on item-1 to initiate autosave
    fireEvent.click(screen.getByLabelText('Beta'));

    await waitFor(() => {
      expect(examsApi.saveExamResponse).toHaveBeenCalledWith(
        'att-100',
        'item-1',
        { selectedOptionId: 'opt-b' },
        1,
      );
    });

    // Also type answer for item-2 so getUnansweredQuestions is empty
    const input = screen.getByPlaceholderText('Your word');
    fireEvent.change(input, { target: { value: 'Existing text' } });

    // Click submit while item-1 save is in-flight
    fireEvent.click(screen.getByTestId('submit-exam-button'));

    // Verify submitExamAttempt has NOT been called yet while item-1 is still in flight
    expect(examsApi.submitExamAttempt).not.toHaveBeenCalled();

    // Now fail the in-flight save with 409 Conflict
    act(() => {
      rejectInFlightSave(new examsApi.ExamApiError(409, 'Conflict: Expected revision 1 but found 3.'));
    });

    // Verify submit was aborted and error is displayed
    await waitFor(() => {
      expect(screen.getByTestId('submit-error-alert')).toBeInTheDocument();
      expect(screen.getByTestId('submit-error-alert')).toHaveTextContent(/Conflict: Expected revision 1 but found 3/);
    });

    // Ensure submitExamAttempt was never called
    expect(examsApi.submitExamAttempt).not.toHaveBeenCalled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('prevents older in-flight save response from overwriting newer local state if the user kept typing', async () => {
    let resolveFirstSave!: (val: ExamResponseDto) => void;
    const firstSavePromise = new Promise<ExamResponseDto>((resolve) => {
      resolveFirstSave = resolve;
    });

    let callCount = 0;
    vi.mocked(examsApi.saveExamResponse).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return firstSavePromise;
      }
      return {
        id: 'resp-2',
        examAttemptId: 'att-100',
        itemRefId: 'item-2',
        questionVersionId: 'qv-2',
        responsePayload: { text: 'Second typing' },
        revision: 2,
        savedAt: new Date().toISOString(),
        isFinal: false,
      };
    });

    render(
      <ExamTakingView
        attemptId="att-100"
        onFinish={onFinish}
        onCancel={onCancel}
        debounceMs={20}
      />,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Your word')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Your word') as HTMLInputElement;

    // Type first text
    fireEvent.change(input, { target: { value: 'First typing' } });

    // Wait for first save to start
    await waitFor(() => {
      expect(examsApi.saveExamResponse).toHaveBeenCalledWith(
        'att-100',
        'item-2',
        { text: 'First typing' },
        undefined,
      );
    });

    // While first save is still in flight, user types more
    fireEvent.change(input, { target: { value: 'Second typing' } });
    expect(input.value).toBe('Second typing');

    // Now resolve first save with older text ('First typing') and revision 1
    await act(async () => {
      resolveFirstSave({
        id: 'resp-2',
        examAttemptId: 'att-100',
        itemRefId: 'item-2',
        questionVersionId: 'qv-2',
        responsePayload: { text: 'First typing' },
        revision: 1,
        savedAt: new Date().toISOString(),
        isFinal: false,
      });
      await new Promise((r) => setTimeout(r, 50));
    });

    // Input MUST retain 'Second typing' and NOT be overwritten with 'First typing'
    expect(input.value).toBe('Second typing');
  });
});
