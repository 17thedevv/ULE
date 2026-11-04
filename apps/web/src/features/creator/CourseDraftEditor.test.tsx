import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CourseDraftEditor from './CourseDraftEditor';
import * as creatorService from '../../services/creator';
import {
  CourseDraftDto,
  CourseVersionDto,
  DraftBlockInstanceDto,
  MultipleChoiceConfig,
  ClozeConfig,
} from '@ule/contracts';

vi.mock('../../services/creator', async () => {
  const actual = await vi.importActual('../../services/creator');
  return {
    ...actual,
    fetchCourseDraft: vi.fn(),
    updateCourseDraft: vi.fn(),
    fetchDraftBlocks: vi.fn(),
    addDraftBlock: vi.fn(),
    updateDraftBlock: vi.fn(),
    deleteDraftBlock: vi.fn(),
    reorderDraftBlocks: vi.fn(),
    validateDraftBlocks: vi.fn(),
    publishCourseVersion: vi.fn(),
    fetchCourseVersions: vi.fn(),
  };
});

describe('CourseDraftEditor authoring workflows', () => {
  const mockDraft: CourseDraftDto = {
    id: 'draft-100',
    courseId: 'course-100',
    title: 'Distributed Systems & Algorithms',
    description: 'Advanced course on consensus and replication.',
    summary: null,
    revision: 5,
    sourceVersionId: null,
    updatedAt: '2026-11-04T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderEditor = () =>
    render(
      <MemoryRouter initialEntries={['/studio/courses/course-100/edit']}>
        <Routes>
          <Route path="/studio/courses/:courseId/edit" element={<CourseDraftEditor />} />
        </Routes>
      </MemoryRouter>,
    );

  it('1. Creator enters a custom MCQ question, choices, selects a correct option, and saves exact payload (no hardcoded demo content)', async () => {
    vi.mocked(creatorService.fetchCourseDraft).mockResolvedValue(mockDraft);
    vi.mocked(creatorService.fetchDraftBlocks).mockResolvedValue([]);
    vi.mocked(creatorService.fetchCourseVersions).mockResolvedValue([]);
    vi.mocked(creatorService.addDraftBlock).mockResolvedValue({
      id: 'block-mcq-1',
      draftId: 'draft-100',
      blockTypeId: 'multiple-choice',
      typeVersion: '1.0.0',
      title: 'Paxos Protocol Check',
      orderIndex: 0,
      config: {},
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z',
    });

    renderEditor();

    await waitFor(() => {
      expect(screen.getByText(/Course Draft Editor: Distributed Systems/i)).toBeInTheDocument();
    });

    // Open Add Activity Block drawer
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Activity Block/i }));

    // Fill Title
    fireEvent.change(screen.getByPlaceholderText(/e.g. Core Architecture Knowledge Check/i), {
      target: { value: 'Paxos Protocol Check' },
    });

    // Select Multiple Choice block type
    fireEvent.change(screen.getByLabelText(/Block Type:/i), {
      target: { value: 'multiple-choice' },
    });

    // Fill custom Question text
    fireEvent.change(screen.getByLabelText(/Question Prompt/i), {
      target: { value: 'What is the minimum quorum required in Basic Paxos for 2F + 1 nodes?' },
    });

    // Fill choices
    fireEvent.change(screen.getByPlaceholderText(/Choice 1 text/i), {
      target: { value: 'F + 1 nodes' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Choice 2 text/i), {
      target: { value: '2F nodes' },
    });

    // Add a 3rd choice
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Option/i }));
    fireEvent.change(screen.getByPlaceholderText(/Choice 3 text/i), {
      target: { value: 'F nodes' },
    });

    // Select Choice 1 as the correct answer
    fireEvent.click(screen.getByLabelText(/Mark option 1 as correct/i));

    // Fill explanation
    fireEvent.change(screen.getByPlaceholderText(/Paris is the capital/i), {
      target: { value: 'Any majority of F + 1 nodes guarantees overlap in Paxos rounds.' },
    });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /Add Block to Draft/i }));

    await waitFor(() => {
      expect(creatorService.addDraftBlock).toHaveBeenCalledTimes(1);
    });

    const addCallArgs = vi.mocked(creatorService.addDraftBlock).mock.calls[0];
    expect(addCallArgs[0]).toBe('course-100');
    expect(addCallArgs[1].title).toBe('Paxos Protocol Check');
    expect(addCallArgs[1].blockTypeId).toBe('multiple-choice');
    expect(addCallArgs[1].expectedRevision).toBe(5);

    const savedConfig = addCallArgs[1].config as unknown as MultipleChoiceConfig;
    expect(savedConfig.question).toBe(
      'What is the minimum quorum required in Basic Paxos for 2F + 1 nodes?',
    );
    expect(savedConfig.options).toHaveLength(3);
    expect(savedConfig.options[0].text).toBe('F + 1 nodes');
    expect(savedConfig.options[1].text).toBe('2F nodes');
    expect(savedConfig.options[2].text).toBe('F nodes');
    expect(savedConfig.answerKey.correctOptionId).toBe(savedConfig.options[0].id);
    expect(savedConfig.answerKey.explanation).toBe(
      'Any majority of F + 1 nodes guarantees overlap in Paxos rounds.',
    );
  });

  it('2. Removing the selected correct option clears selection and prevents submission until a new one is selected', async () => {
    vi.mocked(creatorService.fetchCourseDraft).mockResolvedValue(mockDraft);
    vi.mocked(creatorService.fetchDraftBlocks).mockResolvedValue([]);
    vi.mocked(creatorService.fetchCourseVersions).mockResolvedValue([]);

    renderEditor();

    await waitFor(() => {
      expect(screen.getByText(/Course Draft Editor: Distributed Systems/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /\+ Add Activity Block/i }));
    fireEvent.change(screen.getByPlaceholderText(/e.g. Core Architecture Knowledge Check/i), {
      target: { value: 'Test MCQ' },
    });
    fireEvent.change(screen.getByLabelText(/Block Type:/i), {
      target: { value: 'multiple-choice' },
    });

    fireEvent.change(screen.getByLabelText(/Question Prompt/i), {
      target: { value: 'Valid question text here' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Choice 1 text/i), {
      target: { value: 'Answer A' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Choice 2 text/i), {
      target: { value: 'Answer B' },
    });

    // Add Option 3 and select Option 3 as correct
    fireEvent.click(screen.getByRole('button', { name: /\+ Add Option/i }));
    fireEvent.change(screen.getByPlaceholderText(/Choice 3 text/i), {
      target: { value: 'Answer C' },
    });
    fireEvent.click(screen.getByLabelText(/Mark option 3 as correct/i));

    const submitBtn = screen.getByRole('button', { name: /Add Block to Draft/i });
    expect(submitBtn).not.toBeDisabled();

    // Delete Option 3
    fireEvent.click(screen.getByLabelText(/Remove option 3/i));

    // The submit button must now be disabled because no option is selected as correct!
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText(/Please select which choice is the correct answer/i)).toBeInTheDocument();

    // Select Option 2 as correct
    fireEvent.click(screen.getByLabelText(/Mark option 2 as correct/i));
    expect(submitBtn).not.toBeDisabled();
  });

  it('3 & 7. Reopening an existing block rehydrates persisted MCQ data and saving calls updateDraftBlock', async () => {
    const existingMCQBlock: DraftBlockInstanceDto = {
      id: 'block-mcq-persisted',
      draftId: 'draft-100',
      blockTypeId: 'multiple-choice',
      typeVersion: '1.0.0',
      title: 'Raft Leader Election',
      orderIndex: 0,
      config: {
        question: 'How does Raft elect a leader?',
        options: [
          { id: 'opt_raft_1', text: 'Randomized election timers' },
          { id: 'opt_raft_2', text: 'Centralized coordinator' },
        ],
        answerKey: {
          correctOptionId: 'opt_raft_1',
          explanation: 'Raft uses randomized election timeouts to prevent split votes.',
        },
        feedbackPolicy: 'IMMEDIATE_WITH_EXPLANATION',
        allowHints: true,
        hintText: 'Think about timeout jitter.',
      },
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z',
    };

    vi.mocked(creatorService.fetchCourseDraft).mockResolvedValue(mockDraft);
    vi.mocked(creatorService.fetchDraftBlocks).mockResolvedValue([existingMCQBlock]);
    vi.mocked(creatorService.fetchCourseVersions).mockResolvedValue([]);
    vi.mocked(creatorService.updateDraftBlock).mockResolvedValue(existingMCQBlock);

    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('Raft Leader Election')).toBeInTheDocument();
      expect(screen.getByText(/2 choices/i)).toBeInTheDocument();
    });

    // Click Edit on the block card
    const editBtn = screen.getByRole('button', { name: /Edit Raft Leader Election/i });
    fireEvent.click(editBtn);

    // Form must rehydrate with existing question, choices, and explanation
    await waitFor(() => {
      expect(screen.getByDisplayValue('How does Raft elect a leader?')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Randomized election timers')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Centralized coordinator')).toBeInTheDocument();
      expect(
        screen.getByDisplayValue('Raft uses randomized election timeouts to prevent split votes.'),
      ).toBeInTheDocument();
      expect(screen.getByDisplayValue('Think about timeout jitter.')).toBeInTheDocument();
    });

    // Modify question title and choice
    fireEvent.change(screen.getByDisplayValue('Randomized election timers'), {
      target: { value: 'Randomized heartbeat election timers' },
    });

    // Save changes
    const saveBtn = screen.getByRole('button', { name: /Save Block Changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(creatorService.updateDraftBlock).toHaveBeenCalledTimes(1);
    });

    const updateArgs = vi.mocked(creatorService.updateDraftBlock).mock.calls[0];
    expect(updateArgs[0]).toBe('course-100');
    expect(updateArgs[1]).toBe('block-mcq-persisted');
    expect(updateArgs[2].expectedRevision).toBe(5);

    const updatedConfig = updateArgs[2].config as unknown as MultipleChoiceConfig;
    expect(updatedConfig.options[0].text).toBe('Randomized heartbeat election timers');
  });

  it('4. Creator creates Cloze with multiple blanks and accepted answers, saving exact payload', async () => {
    vi.mocked(creatorService.fetchCourseDraft).mockResolvedValue(mockDraft);
    vi.mocked(creatorService.fetchDraftBlocks).mockResolvedValue([]);
    vi.mocked(creatorService.fetchCourseVersions).mockResolvedValue([]);
    vi.mocked(creatorService.addDraftBlock).mockResolvedValue({
      id: 'block-cloze-1',
      draftId: 'draft-100',
      blockTypeId: 'cloze',
      typeVersion: '1.0.0',
      title: 'Database Cloze',
      orderIndex: 0,
      config: {},
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z',
    });

    renderEditor();

    await waitFor(() => {
      expect(screen.getByText(/Course Draft Editor: Distributed Systems/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /\+ Add Activity Block/i }));

    fireEvent.change(screen.getByPlaceholderText(/e.g. Core Architecture Knowledge Check/i), {
      target: { value: 'Database Cloze' },
    });
    fireEvent.change(screen.getByLabelText(/Block Type:/i), {
      target: { value: 'cloze' },
    });

    // Set prompt & passage template
    fireEvent.change(screen.getByLabelText(/Activity Prompt/i), {
      target: { value: 'Fill in the relational engine details.' },
    });
    fireEvent.change(screen.getByLabelText(/Passage Text/i), {
      target: { value: 'PostgreSQL provides {{blank_1}} isolation and uses {{blank_2}} logging.' },
    });

    // Auto-detect blanks creates the 2nd blank entry
    fireEvent.click(screen.getByRole('button', { name: /Auto-detect Blanks/i }));

    // Enter accepted answers for Blank 1
    const variantInputs = screen.getAllByPlaceholderText(/Accepted variant 1/i);
    expect(variantInputs.length).toBe(2);

    fireEvent.change(variantInputs[0], { target: { value: 'serializable' } });
    fireEvent.change(variantInputs[1], { target: { value: 'WAL' } });

    // Add variant to Blank 2 (Write-Ahead Logging)
    const addVariantBtns = screen.getAllByRole('button', { name: /\+ Add Variant/i });
    fireEvent.click(addVariantBtns[1]);

    const allVariantInputs = screen.getAllByPlaceholderText(/Accepted variant/i);
    fireEvent.change(allVariantInputs[2], { target: { value: 'write ahead' } });

    // Submit Cloze block
    fireEvent.click(screen.getByRole('button', { name: /Add Block to Draft/i }));

    await waitFor(() => {
      expect(creatorService.addDraftBlock).toHaveBeenCalledTimes(1);
    });

    const addCallArgs = vi.mocked(creatorService.addDraftBlock).mock.calls[0];
    const savedConfig = addCallArgs[1].config as unknown as ClozeConfig;
    expect(savedConfig.prompt).toBe('Fill in the relational engine details.');
    expect(savedConfig.templateText).toBe(
      'PostgreSQL provides {{blank_1}} isolation and uses {{blank_2}} logging.',
    );
    expect(savedConfig.targetBlanks).toHaveLength(2);
    expect(savedConfig.answerKey.blanks['blank_1']).toEqual(['serializable']);
    expect(savedConfig.answerKey.blanks['blank_2']).toEqual(['WAL', 'write ahead']);
  });

  it('5. Cloze validation prevents submission when blanks or accepted answers are missing', async () => {
    vi.mocked(creatorService.fetchCourseDraft).mockResolvedValue(mockDraft);
    vi.mocked(creatorService.fetchDraftBlocks).mockResolvedValue([]);
    vi.mocked(creatorService.fetchCourseVersions).mockResolvedValue([]);

    renderEditor();

    await waitFor(() => {
      expect(screen.getByText(/Course Draft Editor: Distributed Systems/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /\+ Add Activity Block/i }));
    fireEvent.change(screen.getByPlaceholderText(/e.g. Core Architecture Knowledge Check/i), {
      target: { value: 'Incomplete Cloze' },
    });
    fireEvent.change(screen.getByLabelText(/Block Type:/i), {
      target: { value: 'cloze' },
    });

    const submitBtn = screen.getByRole('button', { name: /Add Block to Draft/i });
    // Initially template text and accepted answer are empty -> disabled
    expect(submitBtn).toBeDisabled();

    // Type text with missing placeholder
    fireEvent.change(screen.getByLabelText(/Passage Text/i), {
      target: { value: 'Passage without any placeholder.' },
    });

    // Blank_1 is configured by default, but not in passage -> warns and disables
    expect(screen.getByText(/Not found in text/i)).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();
  });

  it('6. Creator edits and saves an existing Video block URL and properties', async () => {
    const existingVideoBlock: DraftBlockInstanceDto = {
      id: 'block-video-1',
      draftId: 'draft-100',
      blockTypeId: 'video',
      typeVersion: '1.0.0',
      title: 'Consensus Video',
      orderIndex: 0,
      config: {
        url: 'https://example.com/old-video.mp4',
        durationSeconds: 120,
        transcript: 'Old transcript',
        allowSkip: true,
      },
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z',
    };

    vi.mocked(creatorService.fetchCourseDraft).mockResolvedValue(mockDraft);
    vi.mocked(creatorService.fetchDraftBlocks).mockResolvedValue([existingVideoBlock]);
    vi.mocked(creatorService.fetchCourseVersions).mockResolvedValue([]);
    vi.mocked(creatorService.updateDraftBlock).mockResolvedValue(existingVideoBlock);

    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('Consensus Video')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Edit Consensus Video/i }));

    const urlInput = screen.getByLabelText(/Video URL/i);
    expect(urlInput).toHaveValue('https://example.com/old-video.mp4');

    fireEvent.change(urlInput, {
      target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Save Block Changes/i }));

    await waitFor(() => {
      expect(creatorService.updateDraftBlock).toHaveBeenCalledTimes(1);
    });

    const updateCall = vi.mocked(creatorService.updateDraftBlock).mock.calls[0];
    expect(updateCall[2].config).toMatchObject({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
  });

  it('8. Preview modal displays configured content without triggering runtime attempts', async () => {
    const block: DraftBlockInstanceDto = {
      id: 'block-preview-test',
      draftId: 'draft-100',
      blockTypeId: 'multiple-choice',
      typeVersion: '1.0.0',
      title: 'Previewable MCQ',
      orderIndex: 0,
      config: {
        question: 'What is 10 + 10?',
        options: [
          { id: 'opt_1', text: '20' },
          { id: 'opt_2', text: '30' },
        ],
        answerKey: { correctOptionId: 'opt_1' },
      },
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z',
    };

    vi.mocked(creatorService.fetchCourseDraft).mockResolvedValue(mockDraft);
    vi.mocked(creatorService.fetchDraftBlocks).mockResolvedValue([block]);
    vi.mocked(creatorService.fetchCourseVersions).mockResolvedValue([]);

    renderEditor();

    await waitFor(() => {
      expect(screen.getByText('Previewable MCQ')).toBeInTheDocument();
    });

    // Click Preview button
    fireEvent.click(screen.getByRole('button', { name: /Preview Previewable MCQ/i }));

    expect(screen.getByRole('dialog', { name: /Preview: Previewable MCQ/i })).toBeInTheDocument();
    expect(screen.getByText('What is 10 + 10?')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText(/Saved Configuration/i)).toBeInTheDocument();

    // Close preview
    const closeBtns = screen.getAllByRole('button', { name: /Close Preview/i });
    fireEvent.click(closeBtns[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('9. Discards stale block edits after reloading a conflict between two sessions', async () => {
    const block: DraftBlockInstanceDto = {
      id: 'block-conflict-test',
      draftId: 'draft-100',
      blockTypeId: 'video',
      typeVersion: '1.0.0',
      title: 'Conflict Block',
      orderIndex: 0,
      config: { url: 'https://example.com/video.mp4' },
      createdAt: '2026-11-04T10:00:00Z',
      updatedAt: '2026-11-04T10:00:00Z',
    };

    const latestBlock = { ...block, config: { url: 'https://example.com/newer-video.mp4' } };
    vi.mocked(creatorService.fetchCourseDraft)
      .mockResolvedValueOnce(mockDraft)
      .mockResolvedValueOnce(mockDraft)
      .mockResolvedValue({ ...mockDraft, revision: 6 });
    vi.mocked(creatorService.fetchDraftBlocks)
      .mockResolvedValueOnce([block])
      .mockResolvedValueOnce([block])
      .mockResolvedValue([latestBlock]);
    vi.mocked(creatorService.fetchCourseVersions).mockResolvedValue([]);

    const conflictError = new Error('Draft revision conflict. Expected revision 5, but current revision is 6.');
    Object.assign(conflictError, { statusCode: 409 });
    vi.mocked(creatorService.updateDraftBlock)
      .mockResolvedValueOnce(latestBlock)
      .mockRejectedValueOnce(conflictError);

    const firstSession = within(renderEditor().container);
    const secondSession = within(renderEditor().container);
    const videoUrlPlaceholder = /e\.g\. https:\/\/www\.youtube\.com/i;
    fireEvent.click(await firstSession.findByRole('button', { name: /Edit Conflict Block/i }));
    fireEvent.change(firstSession.getByPlaceholderText(videoUrlPlaceholder), {
      target: { value: 'https://example.com/stale-video.mp4' },
    });
    fireEvent.click(await secondSession.findByRole('button', { name: /Edit Conflict Block/i }));
    fireEvent.change(secondSession.getByPlaceholderText(videoUrlPlaceholder), {
      target: { value: latestBlock.config.url },
    });
    fireEvent.click(secondSession.getByRole('button', { name: /Save Block Changes/i }));
    expect(await secondSession.findByText('#6')).toBeInTheDocument();

    fireEvent.click(firstSession.getByRole('button', { name: /Save Block Changes/i }));
    expect(await firstSession.findByRole('alert')).toHaveTextContent(/Concurrency Conflict/i);
    expect(creatorService.updateDraftBlock).toHaveBeenNthCalledWith(2, 'course-100', block.id, {
      title: block.title,
      config: expect.objectContaining({ url: 'https://example.com/stale-video.mp4' }),
      expectedRevision: 5,
    });
    fireEvent.click(firstSession.getByRole('button', { name: /Reload Course Draft/i }));

    expect(await firstSession.findByText('#6')).toBeInTheDocument();
    expect(firstSession.queryByRole('alert')).not.toBeInTheDocument();
    expect(firstSession.queryByRole('button', { name: /Save Block Changes/i })).not.toBeInTheDocument();
    expect(creatorService.updateDraftBlock).toHaveBeenCalledTimes(2);

    fireEvent.click(firstSession.getByRole('button', { name: /Edit Conflict Block/i }));
    expect(firstSession.getByPlaceholderText(videoUrlPlaceholder)).toHaveValue(latestBlock.config.url);
  });

  it('10. Publishing displays the success message for the new version', async () => {
    const publishedVersion: CourseVersionDto = {
      id: 'version-snapshot-1',
      courseId: 'course-100',
      versionNumber: 1,
      title: 'Distributed Systems & Algorithms',
      description: 'Advanced course on consensus and replication.',
      summary: null,
      snapshot: {},
      schemaVersion: '1.0.0',
      draftRevision: 5,
      createdById: 'user-1',
      createdAt: '2026-11-04T11:00:00Z',
    };

    vi.mocked(creatorService.fetchCourseDraft).mockResolvedValue(mockDraft);
    vi.mocked(creatorService.fetchDraftBlocks).mockResolvedValue([]);
    vi.mocked(creatorService.fetchCourseVersions).mockResolvedValue([]);
    vi.mocked(creatorService.publishCourseVersion).mockResolvedValue(publishedVersion);

    renderEditor();

    await waitFor(() => {
      expect(screen.getByText(/Course Draft Editor: Distributed Systems/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Publish Version 🚀/i }));

    await waitFor(() => {
      expect(creatorService.publishCourseVersion).toHaveBeenCalledWith('course-100');
      expect(
        screen.getByText(/Course Version snapshot v1 published successfully/i),
      ).toBeInTheDocument();
    });
  });
});
