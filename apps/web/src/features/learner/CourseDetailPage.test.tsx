import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CourseDetailPage from './CourseDetailPage';

const coursePath = '/api/v1/learner/courses';
const versionId = 'version-1';

function renderCourseDetail(enrollmentResponse: () => Response | Promise<Response>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    switch (path) {
      case coursePath:
        return Response.json([{ id: versionId, title: 'Introduction to Logic', versionNumber: 1 }]);
      case `${coursePath}/${versionId}/progress`:
        return Response.json({ percentComplete: 0, completedBlocks: 0, totalBlocks: 0, blocks: [] });
      case `${coursePath}/${versionId}/evidence`:
      case `${coursePath}/${versionId}/skills`:
        return Response.json([]);
      case `${coursePath}/${versionId}/enrollment`:
        return enrollmentResponse();
      default:
        throw new Error(`Unexpected request: ${path}`);
    }
  });

  render(
    <MemoryRouter initialEntries={[`/app/courses/${versionId}`]}>
      <Routes>
        <Route path="/app/courses/:courseVersionId" element={<CourseDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CourseDetailPage enrollment', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers enrollment when the enrollment endpoint returns 404', async () => {
    renderCourseDetail(() => new Response(null, { status: 404 }));

    expect(await screen.findByRole('button', { name: 'Enroll in Quests' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    {
      label: 'server error',
      fail: () => new Response(null, { status: 500, statusText: 'Internal Server Error' }),
      message: 'Failed to fetch course enrollment: Internal Server Error',
    },
    {
      label: 'network error',
      fail: () => Promise.reject(new TypeError('Failed to fetch')),
      message: 'Failed to fetch',
    },
  ])('shows Retry after an enrollment $label and handles an empty successful response', async ({
    fail,
    message,
  }) => {
    const enrollmentResponse = vi
      .fn<() => Response | Promise<Response>>(() => new Response(null))
      .mockImplementationOnce(fail);
    renderCourseDetail(enrollmentResponse);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('button', { name: 'Enroll in Quests' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('button', { name: 'Enroll in Quests' })).toBeEnabled();
    expect(enrollmentResponse).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
