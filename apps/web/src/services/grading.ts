import {
  CorrectExamItemGradeDto,
  EvaluateExamItemDto,
  ExamGradeAppealDto,
  ExamGradeRevisionDto,
  ExamGradingQueueItemDto,
  ExamHumanGradeRevisionDto,
  ExamItemGradeDto,
  FinalizeExamGradingDto,
  ResolveExamAppealDto,
} from '@ule/contracts';
import { getApiBaseUrl } from './api';
import { checkAuthStatus } from './auth';

export class GradingApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errorDetails?: unknown,
  ) {
    super(message);
    this.name = 'GradingApiError';
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
    checkAuthStatus(res);
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
      // Non-JSON fallback
    }
    throw new GradingApiError(res.status, errorMsg, details);
  }

  return (await res.json()) as T;
}

/**
 * Lists examination attempts pending educator human rubric evaluation.
 */
export async function fetchGradingQueue(
  assessmentDefinitionId?: string,
): Promise<ExamGradingQueueItemDto[]> {
  const query = assessmentDefinitionId
    ? `?assessmentDefinitionId=${encodeURIComponent(assessmentDefinitionId)}`
    : '';
  return request<ExamGradingQueueItemDto[]>(`/api/v1/exam-grading/queue${query}`);
}

/**
 * Fetches the complete grading context for an attempt (responses, rubrics, item grades).
 */
export async function fetchGradingAttempt(attemptId: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/v1/exam-grading/attempts/${attemptId}`);
}

/**
 * Submits an authoritative human rubric evaluation for an exam item.
 */
export async function evaluateExamItem(
  itemGradeId: string,
  dto: EvaluateExamItemDto,
): Promise<ExamItemGradeDto> {
  return request<ExamItemGradeDto>(`/api/v1/exam-grading/items/${itemGradeId}/evaluations`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Issues an authorized correction to a previously graded exam item.
 */
export async function correctExamItemGrade(
  itemGradeId: string,
  dto: CorrectExamItemGradeDto,
): Promise<ExamItemGradeDto> {
  return request<ExamItemGradeDto>(`/api/v1/exam-grading/items/${itemGradeId}/corrections`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Explicitly finalizes human grading for an examination attempt.
 */
export async function finalizeExamGrading(
  attemptId: string,
  dto?: FinalizeExamGradingDto,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/v1/exam-grading/attempts/${attemptId}/finalize`, {
    method: 'POST',
    body: JSON.stringify(dto || {}),
  });
}

/**
 * Retrieves the append-only revision ledger for an examination attempt.
 */
export async function fetchGradeRevisions(attemptId: string): Promise<{
  aggregateRevisions: ExamGradeRevisionDto[];
  itemRevisions: ExamHumanGradeRevisionDto[];
}> {
  return request<{
    aggregateRevisions: ExamGradeRevisionDto[];
    itemRevisions: ExamHumanGradeRevisionDto[];
  }>(`/api/v1/exam-grading/attempts/${attemptId}/revisions`);
}

/**
 * Lists appeals filed for an examination attempt.
 */
export async function fetchAppealsForAttempt(attemptId: string): Promise<ExamGradeAppealDto[]> {
  return request<ExamGradeAppealDto[]>(`/api/v1/exam-attempts/${attemptId}/appeals`);
}

/**
 * Retrieves details of a specific grade appeal.
 */
export async function fetchAppeal(appealId: string): Promise<ExamGradeAppealDto> {
  return request<ExamGradeAppealDto>(`/api/v1/exam-appeals/${appealId}`);
}

/**
 * Acknowledges and accepts an appeal into review (transitions to UNDER_REVIEW).
 */
export async function reviewAppeal(appealId: string): Promise<ExamGradeAppealDto> {
  return request<ExamGradeAppealDto>(`/api/v1/exam-appeals/${appealId}/review`, {
    method: 'POST',
  });
}

/**
 * Resolves an appeal with reasoned determination and optional score adjustment.
 */
export async function resolveAppeal(
  appealId: string,
  dto: ResolveExamAppealDto,
): Promise<ExamGradeAppealDto> {
  return request<ExamGradeAppealDto>(`/api/v1/exam-appeals/${appealId}/resolve`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}
