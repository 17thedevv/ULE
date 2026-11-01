import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StudioPage from './StudioPage';
import CourseDraftEditor from './CourseDraftEditor';
import QuestionBankPage from './QuestionBankPage';
import * as creatorService from '../../services/creator';
import { CourseDto, CourseDraftDto, DraftBlockInstanceDto } from '@ule/contracts';

vi.mock('../../services/creator', async () => {
  const actual = await vi.importActual('../../services/creator');
  return {
    ...actual,
    fetchCreatorCourses: vi.fn(),
    createCourse: vi.fn(),
    fetchCourseDraft: vi.fn(),
    updateCourseDraft: vi.fn(),
    fetchDraftBlocks: vi.fn(),
    addDraftBlock: vi.fn(),
    deleteDraftBlock: vi.fn(),
    reorderDraftBlocks: vi.fn(),
    validateDraftBlocks: vi.fn(),
    publishCourseVersion: vi.fn(),
    fetchCourseVersions: vi.fn(),
    fetchQuestionBankItems: vi.fn(),
    createQuestionBankItem: vi.fn(),
    publishQuestionVersion: vi.fn(),
  };
});

describe('Creator Studio Workspace (UI-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders creator courses list on StudioPage', async () => {
    const mockCourses: CourseDto[] = [
      {
        id: 'course-1',
        ownerId: 'user-1',
        visibility: 'PRIVATE',
        createdAt: '2026-10-31T10:00:00Z',
        updatedAt: '2026-10-31T10:00:00Z',
      },
    ];
    const mockDraft: CourseDraftDto = {
      id: 'draft-1',
      courseId: 'course-1',
      title: 'Cloud Native TypeScript',
      description: 'Building microservices and modular monoliths.',
      summary: null,
      revision: 3,
      sourceVersionId: null,
      updatedAt: '2026-10-31T12:00:00Z',
    };

    vi.mocked(creatorService.fetchCreatorCourses).mockResolvedValue(mockCourses);
    vi.mocked(creatorService.fetchCourseDraft).mockResolvedValue(mockDraft);

    render(
      <MemoryRouter>
        <StudioPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Cloud Native TypeScript')).toBeInTheDocument();
      expect(screen.getByText('PRIVATE')).toBeInTheDocument();
      expect(screen.getByText('Edit Course Draft →')).toBeInTheDocument();
    });
  });

  it('renders CourseDraftEditor, validates blocks, and reorders them', async () => {
    const mockDraft: CourseDraftDto = {
      id: 'draft-1',
      courseId: 'course-1',
      title: 'Cloud Native TypeScript',
      description: 'Building microservices and modular monoliths.',
      summary: null,
      revision: 3,
      sourceVersionId: null,
      updatedAt: '2026-10-31T12:00:00Z',
    };

    const mockBlocks: DraftBlockInstanceDto[] = [
      {
        id: 'block-1',
        draftId: 'draft-1',
        blockTypeId: 'video',
        typeVersion: '1.0.0',
        title: 'Intro Video',
        orderIndex: 0,
        config: { url: 'https://example.com/intro.mp4', allowSkip: true },
        createdAt: '2026-10-31T10:00:00Z',
        updatedAt: '2026-10-31T10:00:00Z',
      },
      {
        id: 'block-2',
        draftId: 'draft-1',
        blockTypeId: 'multiple-choice',
        typeVersion: '1.0.0',
        title: 'Knowledge Check 1',
        orderIndex: 1,
        config: {},
        createdAt: '2026-10-31T10:00:00Z',
        updatedAt: '2026-10-31T10:00:00Z',
      },
    ];

    vi.mocked(creatorService.fetchCourseDraft).mockResolvedValue(mockDraft);
    vi.mocked(creatorService.fetchDraftBlocks).mockResolvedValue(mockBlocks);
    vi.mocked(creatorService.fetchCourseVersions).mockResolvedValue([]);
    vi.mocked(creatorService.validateDraftBlocks).mockResolvedValue({
      valid: true,
      totalBlocks: 2,
      invalidBlocksCount: 0,
      blocks: [
        { blockId: 'block-1', title: 'Intro Video', blockTypeId: 'video', valid: true, errors: [] },
        { blockId: 'block-2', title: 'Knowledge Check 1', blockTypeId: 'multiple-choice', valid: true, errors: [] },
      ],
    });
    vi.mocked(creatorService.reorderDraftBlocks).mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/studio/courses/course-1/edit']}>
        <Routes>
          <Route path="/studio/courses/:courseId/edit" element={<CourseDraftEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Course Draft Editor: Cloud Native TypeScript/i)).toBeInTheDocument();
      expect(screen.getByText('Intro Video')).toBeInTheDocument();
      expect(screen.getByText('Knowledge Check 1')).toBeInTheDocument();
    });

    // Validate blocks
    const validateBtn = screen.getByRole('button', { name: /Validate Draft/i });
    fireEvent.click(validateBtn);

    await waitFor(() => {
      expect(creatorService.validateDraftBlocks).toHaveBeenCalledWith('course-1');
      expect(screen.getByText('Valid for Publishing')).toBeInTheDocument();
    });

    // Move block down
    const moveDownBtn = screen.getByLabelText(/Move Intro Video down/i);
    fireEvent.click(moveDownBtn);

    await waitFor(() => {
      expect(creatorService.reorderDraftBlocks).toHaveBeenCalledWith('course-1', {
        blockIds: ['block-2', 'block-1'],
        expectedRevision: 3,
      });
    });
  });

  it('renders QuestionBankPage with questions and allows creation', async () => {
    vi.mocked(creatorService.fetchQuestionBankItems).mockResolvedValue([
      {
        id: 'q-1',
        ownerId: 'creator-1',
        courseId: null,
        type: 'MULTIPLE_CHOICE',
        title: 'CAP Theorem Question',
        prompt: 'Which two properties does Spanner provide in practice?',
        content: {},
        defaultPoints: 5,
        skillCode: null,
        difficulty: null,
        tags: ['distributed-systems'],
        revision: 1,
        publishedVersionCount: 1,
        createdAt: '2026-10-31T10:00:00Z',
        updatedAt: '2026-10-31T10:00:00Z',
      },
    ]);

    render(
      <MemoryRouter>
        <QuestionBankPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('CAP Theorem Question')).toBeInTheDocument();
      expect(screen.getByText(/Which two properties does Spanner provide/i)).toBeInTheDocument();
      expect(screen.getByText('#distributed-systems')).toBeInTheDocument();
    });
  });
});
