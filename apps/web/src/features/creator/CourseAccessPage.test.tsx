import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { CourseAccessGrantDto, CourseVersionDto } from '@ule/contracts';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatorApiError, fetchCourseVersion } from '../../services/creator';
import {
  createCourseAccessGrant,
  fetchCourseAccessGrants,
  revokeCourseAccessGrant,
} from '../../services/grants';
import CourseAccessPage from './CourseAccessPage';

vi.mock('../../services/creator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/creator')>()),
  fetchCourseVersion: vi.fn(),
}));

vi.mock('../../services/grants', () => ({
  createCourseAccessGrant: vi.fn(),
  fetchCourseAccessGrants: vi.fn(),
  revokeCourseAccessGrant: vi.fn(),
}));

const version: CourseVersionDto = {
  id: 'version-two',
  courseId: 'course-one',
  versionNumber: 2,
  title: 'Arithmetic',
  description: null,
  summary: null,
  snapshot: {},
  schemaVersion: '1.0.0',
  draftRevision: 3,
  createdById: 'creator-one',
  createdAt: '2026-11-04T10:00:00Z',
};

const activeGrant: CourseAccessGrantDto = {
  id: 'grant-one',
  courseId: version.courseId,
  courseVersionId: version.id,
  userId: 'learner-one',
  userEmail: 'student@example.com',
  grantedById: version.createdById,
  status: 'ACTIVE',
  createdAt: version.createdAt,
  updatedAt: version.createdAt,
};

function renderAccessPage() {
  return render(
    <MemoryRouter initialEntries={['/studio/courses/course-one/versions/version-two/access']}>
      <Routes>
        <Route
          path="/studio/courses/:courseId/versions/:versionId/access"
          element={<CourseAccessPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function grantByEmail(email: string) {
  fireEvent.change(screen.getByLabelText('Learner email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Grant Access' }));
}

describe('CourseAccessPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchCourseVersion).mockResolvedValue(version);
  });

  it('grants access by email, reloads status after each action, and confirms revocation', async () => {
    const revokedGrant = { ...activeGrant, status: 'REVOKED' } as const;
    vi.mocked(fetchCourseAccessGrants)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([activeGrant])
      .mockResolvedValueOnce([activeGrant])
      .mockResolvedValueOnce([revokedGrant])
      .mockResolvedValueOnce([activeGrant]);

    let completeGrant!: (grant: CourseAccessGrantDto) => void;
    vi.mocked(createCourseAccessGrant)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          completeGrant = resolve;
        }),
      )
      .mockResolvedValue(activeGrant);
    vi.mocked(revokeCourseAccessGrant).mockResolvedValue(revokedGrant);

    renderAccessPage();
    expect(await screen.findByText('Arithmetic — Version 2')).toBeInTheDocument();
    grantByEmail(activeGrant.userEmail!);
    const grantButton = screen.getByRole('button', { name: 'Grant Access' });
    expect(grantButton).toBeDisabled();
    fireEvent.click(grantButton);
    expect(createCourseAccessGrant).toHaveBeenCalledTimes(1);
    expect(createCourseAccessGrant).toHaveBeenCalledWith(version.courseId, version.id, {
      email: activeGrant.userEmail,
    });
    await act(async () => completeGrant(activeGrant));
    expect(await screen.findByRole('row', { name: /student@example.com.*Active/ })).toBeInTheDocument();

    grantByEmail(activeGrant.userEmail!);
    await waitFor(() => expect(fetchCourseAccessGrants).toHaveBeenCalledTimes(3));
    const activeRow = await screen.findByRole('row', { name: /student@example.com.*Active/ });
    expect(screen.getAllByRole('row', { name: /student@example.com/ })).toHaveLength(1);

    fireEvent.click(within(activeRow).getByRole('button', { name: 'Revoke' }));
    fireEvent.click(within(activeRow).getByRole('button', { name: 'Cancel' }));
    expect(revokeCourseAccessGrant).not.toHaveBeenCalled();
    fireEvent.click(within(activeRow).getByRole('button', { name: 'Revoke' }));
    fireEvent.click(within(activeRow).getByRole('button', { name: 'Confirm Revoke' }));
    expect(revokeCourseAccessGrant).toHaveBeenCalledTimes(1);
    expect(revokeCourseAccessGrant).toHaveBeenCalledWith(
      version.courseId,
      version.id,
      activeGrant.id,
    );

    const revokedRow = await screen.findByRole('row', { name: /student@example.com.*Revoked/ });
    fireEvent.click(within(revokedRow).getByRole('button', { name: 'Re-grant' }));
    expect(createCourseAccessGrant).toHaveBeenLastCalledWith(version.courseId, version.id, {
      userId: activeGrant.userId,
    });
    expect(await screen.findByRole('row', { name: /student@example.com.*Active/ })).toBeInTheDocument();
    expect(fetchCourseAccessGrants).toHaveBeenCalledTimes(5);
    expect(fetchCourseVersion).toHaveBeenCalledTimes(1);
    expect(fetchCourseVersion).toHaveBeenCalledWith(version.courseId, version.id);
  });

  it('keeps an unavailable list distinct from an empty list and explains an unregistered email', async () => {
    vi.mocked(fetchCourseAccessGrants)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce([]);
    vi.mocked(createCourseAccessGrant).mockRejectedValueOnce(
      new CreatorApiError(404, 'Target learner user not found.'),
    );

    renderAccessPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load learner access');
    expect(screen.queryByText(/No learners have been granted access/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/No learners have been granted access/)).toBeInTheDocument();

    grantByEmail('unregistered@example.com');
    expect(await screen.findByRole('alert')).toHaveTextContent('The learner must register for ULE');
    expect(screen.getByLabelText('Learner email')).toHaveValue('unregistered@example.com');
    expect(fetchCourseAccessGrants).toHaveBeenCalledTimes(2);
  });

  it('does not show management controls or version details if the grants API denies access', async () => {
    vi.mocked(fetchCourseAccessGrants).mockRejectedValueOnce(
      new CreatorApiError(404, 'Course not found.'),
    );

    renderAccessPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Course version unavailable');
    expect(screen.queryByText('Arithmetic — Version 2')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Learner email')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('reconciles the list when a write may have reached the API and its response was lost', async () => {
    vi.mocked(fetchCourseAccessGrants)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([activeGrant]);
    vi.mocked(createCourseAccessGrant).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderAccessPage();
    await screen.findByLabelText('Learner email');
    grantByEmail(activeGrant.userEmail!);
    expect(await screen.findByRole('alert')).toHaveTextContent('The access change could not be confirmed');
    expect(screen.getByRole('button', { name: 'Grant Access' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('row', { name: /student@example.com.*Active/ })).toBeInTheDocument();
    expect(createCourseAccessGrant).toHaveBeenCalledTimes(1);
  });
});
