import {
  CourseEnrollmentDto,
  CourseProgressDto,
  CourseQuestInstanceDto,
  LearnerCourseVersionDto,
  LearnerSkillProjectionDto,
  LearningEvidenceDto,
} from '@ule/contracts';
import { getApiBaseUrl } from './api';
import { checkAuthStatus } from './auth';

export async function fetchGrantedCourses(): Promise<LearnerCourseVersionDto[]> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/learner/courses`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    checkAuthStatus(res);
    throw new Error(`Failed to fetch granted courses: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchCourseProgress(
  versionId: string,
): Promise<CourseProgressDto> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/learner/courses/${versionId}/progress`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    checkAuthStatus(res);
    throw new Error(`Failed to fetch course progress: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchEvidenceSummary(
  versionId: string,
): Promise<LearningEvidenceDto[]> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/learner/courses/${versionId}/evidence`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    checkAuthStatus(res);
    throw new Error(`Failed to fetch evidence summary: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchSkillProjections(
  versionId: string,
): Promise<LearnerSkillProjectionDto[]> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/learner/courses/${versionId}/skills`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    checkAuthStatus(res);
    throw new Error(`Failed to fetch skill projections: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchCourseQuests(
  versionId: string,
): Promise<CourseQuestInstanceDto[]> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/learner/courses/${versionId}/quests`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    checkAuthStatus(res);
    throw new Error(`Failed to fetch course quests: ${res.statusText}`);
  }

  return res.json();
}

export async function fetchCourseEnrollment(
  versionId: string,
): Promise<CourseEnrollmentDto | null> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/learner/courses/${versionId}/enrollment`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    checkAuthStatus(res);
    throw new Error(`Failed to fetch course enrollment: ${res.statusText}`);
  }

  return res.json();
}

export async function enrollInCourse(
  versionId: string,
): Promise<{ enrollment: CourseEnrollmentDto; quests: CourseQuestInstanceDto[] }> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/learner/courses/${versionId}/enroll`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    checkAuthStatus(res);
    throw new Error(`Failed to enroll in course: ${res.statusText}`);
  }

  return res.json();
}
