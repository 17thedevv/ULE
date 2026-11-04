import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ABRunDto } from '@ule/contracts';
import { afterEach, expect, it, vi } from 'vitest';
import { LearningPlayer } from './LearningPlayer';

const timestamp = '2026-11-05T00:00:00.000Z';
const initialRun: ABRunDto = {
  id: 'run-1',
  userId: 'learner-1',
  courseVersionId: 'version-1',
  blockInstanceId: 'block-1',
  blockTypeId: 'cloze',
  typeVersion: '1.0.0',
  status: 'ACTIVE',
  closeReason: null,
  failureDetails: null,
  startedAt: timestamp,
  closedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  block: {
    id: 'block-1',
    blockTypeId: 'cloze',
    typeVersion: '1.0.0',
    title: 'Addition practice',
    orderIndex: 0,
    learnerConfig: { templateText: 'Two plus three is {{sum}}.', feedbackPolicy: 'DEFERRED' },
  },
};

afterEach(() => vi.restoreAllMocks());

it('keeps a deferred result hidden until the learner finishes the graded activity', async () => {
  const withheldRun: ABRunDto = {
    ...initialRun,
    latestAttempt: {
      id: 'attempt-1',
      runId: initialRun.id,
      attemptNumber: 1,
      submittedResponse: { answers: { sum: '5' } },
      assisted: false,
      supportContext: null,
      createdAt: timestamp,
    },
    latestAssessment: {
      id: 'assessment-1',
      attemptId: 'attempt-1',
      runId: initialRun.id,
      status: 'EVALUATED',
      isCorrect: null,
      score: null,
      feedback: { deferred: true },
      evaluatorId: 'ule-cloze-evaluator',
      evaluatedAt: timestamp,
      createdAt: timestamp,
    },
  };
  const explanation = 'Adding two and three gives five.';
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(Response.json(withheldRun))
    .mockResolvedValueOnce(Response.json({
      ...withheldRun,
      status: 'CLOSED',
      closeReason: 'COMPLETED',
      latestAssessment: {
        ...withheldRun.latestAssessment,
        isCorrect: true,
        score: 1,
        feedback: { deferred: false, released: true, explanation },
      },
    }));

  function Player() {
    const [run, setRun] = useState(initialRun);
    return <LearningPlayer run={run} onRunUpdated={setRun} onClose={() => {}} />;
  }

  render(<Player />);
  expect(screen.queryByRole('button', { name: 'Finish Activity' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Blank sum' }), { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit Cloze Responses' }));
  expect(await screen.findByText('Feedback available after finishing')).toBeInTheDocument();
  expect(screen.queryByText(explanation)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Finish Activity' }));
  expect(await screen.findByText(explanation)).toBeInTheDocument();
  expect(screen.getByText('✓ Correct')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Finish Activity' })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    expect.stringContaining(`/api/v1/runs/${initialRun.id}/commands`),
    expect.objectContaining({ body: expect.stringContaining('"command":"FINISH"') }),
  );
});
