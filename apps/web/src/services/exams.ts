import {
  ExamAttemptDto,
  ExamAttemptQuestionsDto,
  ExamResponseDto,
  ExamResultSummaryDto,
  LearnerEligibleExamDto,
} from '@ule/contracts';
import { getApiBaseUrl } from './api';

export class ExamApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errorDetails?: unknown,
  ) {
    super(message);
    this.name = 'ExamApiError';
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
    let details: unknown;
    try {
      const body = await res.json();
      details = body;
      if (body && typeof body === 'object') {
        if (Array.isArray(body.message)) {
          errorMsg = body.message.join(', ');
        } else if (typeof body.message === 'string') {
          errorMsg = body.message;
        }
      }
    } catch {
      // Non-JSON error body fallback
    }
    throw new ExamApiError(res.status, errorMsg, details);
  }

  return (await res.json()) as T;
}

/**
 * Lists authorized examinations for the current authenticated learner.
 */
export async function fetchEligibleExams(): Promise<LearnerEligibleExamDto[]> {
  return request<LearnerEligibleExamDto[]>('/api/v1/learner/exams');
}

/**
 * Fetches authorized exam metadata for a specific AssessmentVersion.
 */
export async function fetchEligibleExam(versionId: string): Promise<LearnerEligibleExamDto> {
  return request<LearnerEligibleExamDto>(`/api/v1/learner/exams/${versionId}`);
}

/**
 * Starts or resumes an examination attempt.
 */
export async function startExamAttempt(
  versionId: string,
  idempotencyKey?: string,
): Promise<ExamAttemptDto> {
  return request<ExamAttemptDto>(`/api/v1/exams/${versionId}/attempts`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  });
}

/**
 * Retrieves attempt metadata and server deadline.
 */
export async function fetchExamAttempt(attemptId: string): Promise<ExamAttemptDto> {
  return request<ExamAttemptDto>(`/api/v1/exam-attempts/${attemptId}`);
}

/**
 * Retrieves sanitized question blueprint for the attempt.
 */
export async function fetchExamQuestions(attemptId: string): Promise<ExamAttemptQuestionsDto> {
  return request<ExamAttemptQuestionsDto>(`/api/v1/exam-attempts/${attemptId}/questions`);
}

/**
 * Retrieves all saved responses for the attempt.
 */
export async function fetchExamResponses(attemptId: string): Promise<ExamResponseDto[]> {
  return request<ExamResponseDto[]>(`/api/v1/exam-attempts/${attemptId}/responses`);
}

/**
 * Saves or autosaves a learner response with CAS revision check.
 */
export async function saveExamResponse(
  attemptId: string,
  itemId: string,
  responsePayload: Record<string, unknown>,
  expectedRevision?: number,
): Promise<ExamResponseDto> {
  return request<ExamResponseDto>(`/api/v1/exam-attempts/${attemptId}/responses/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify({ responsePayload, expectedRevision }),
  });
}

/**
 * Finalizes and submits an examination attempt.
 */
export async function submitExamAttempt(
  attemptId: string,
  idempotencyKey?: string,
): Promise<ExamResultSummaryDto> {
  return request<ExamResultSummaryDto>(`/api/v1/exam-attempts/${attemptId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  });
}

/**
 * Retrieves final released or withheld examination result.
 */
export async function fetchExamResult(attemptId: string): Promise<ExamResultSummaryDto> {
  return request<ExamResultSummaryDto>(`/api/v1/exam-attempts/${attemptId}/result`);
}
