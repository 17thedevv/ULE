import type { CourseAccessGrantDto, CreateAccessGrantRequest } from '@ule/contracts';
import { requestCreatorApi } from './creator';

function grantsPath(courseId: string, versionId: string): string {
  return `/api/v1/courses/${encodeURIComponent(courseId)}/versions/${encodeURIComponent(versionId)}/grants`;
}

export function fetchCourseAccessGrants(
  courseId: string,
  versionId: string,
): Promise<CourseAccessGrantDto[]> {
  return requestCreatorApi(grantsPath(courseId, versionId), { method: 'GET' });
}

export function createCourseAccessGrant(
  courseId: string,
  versionId: string,
  payload: CreateAccessGrantRequest,
): Promise<CourseAccessGrantDto> {
  return requestCreatorApi(grantsPath(courseId, versionId), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function revokeCourseAccessGrant(
  courseId: string,
  versionId: string,
  grantId: string,
): Promise<CourseAccessGrantDto> {
  return requestCreatorApi(`${grantsPath(courseId, versionId)}/${encodeURIComponent(grantId)}`, {
    method: 'DELETE',
  });
}
