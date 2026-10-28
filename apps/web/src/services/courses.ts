import {
  CourseDto,
  CourseDraftDto,
  CourseVersionDto,
  CreateCourseRequest,
  CreateCourseResponse,
  UpdateCourseDraftRequest,
} from '@ule/contracts';
import { getApiBaseUrl } from './api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      errorBody.error?.message ||
      errorBody.message ||
      `HTTP Error ${response.status}: ${response.statusText}`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function listCourses(): Promise<CourseDto[]> {
  return request<CourseDto[]>('/api/v1/courses');
}

export async function createCourse(
  payload: CreateCourseRequest,
): Promise<CreateCourseResponse> {
  return request<CreateCourseResponse>('/api/v1/courses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getCourseDraft(
  courseId: string,
): Promise<CourseDraftDto> {
  return request<CourseDraftDto>(`/api/v1/courses/${courseId}/draft`);
}

export async function updateCourseDraft(
  courseId: string,
  payload: UpdateCourseDraftRequest,
): Promise<CourseDraftDto> {
  return request<CourseDraftDto>(`/api/v1/courses/${courseId}/draft`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function createCourseVersion(
  courseId: string,
): Promise<CourseVersionDto> {
  return request<CourseVersionDto>(`/api/v1/courses/${courseId}/versions`, {
    method: 'POST',
  });
}

export async function listCourseVersions(
  courseId: string,
): Promise<CourseVersionDto[]> {
  return request<CourseVersionDto[]>(`/api/v1/courses/${courseId}/versions`);
}
