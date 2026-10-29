import {
  CourseProgressDto,
  CourseVersionDto,
  LearnerSkillProjectionDto,
  LearningEvidenceDto,
} from '@ule/contracts';
import { getApiBaseUrl } from './api';

export async function fetchGrantedCourses(): Promise<CourseVersionDto[]> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/api/v1/learner/courses`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
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
    throw new Error(`Failed to fetch skill projections: ${res.statusText}`);
  }

  return res.json();
}
