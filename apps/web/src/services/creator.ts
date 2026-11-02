import {
  ABTypeManifest,
  AddDraftBlockRequest,
  AssessmentDefinitionDto,
  AssessmentVersionDto,
  CourseDto,
  CourseDraftDto,
  CourseVersionDto,
  CreateAssessmentDefinitionDto,
  CreateCourseRequest,
  CreateCourseResponse,
  DraftBlockInstanceDto,
  DraftValidationResponseDto,
  QuestionBankItemDto,
  QuestionType,
  ReorderDraftBlocksRequest,
  UpdateCourseDraftRequest,
  UpdateDraftBlockRequest,
} from '@ule/contracts';
import { getApiBaseUrl } from './api';
import { checkAuthStatus } from './auth';

export class CreatorApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly errorDetails?: unknown,
  ) {
    super(message);
    this.name = 'CreatorApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    checkAuthStatus(response);
    let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
    let details: unknown;
    try {
      const body = await response.json();
      details = body;
      if (body && typeof body === 'object') {
        if (Array.isArray(body.message)) {
          errorMsg = body.message.join(', ');
        } else if (typeof body.message === 'string') {
          errorMsg = body.message;
        } else if (body.error?.message) {
          errorMsg = body.error.message;
        }
      }
    } catch {
      // Non-JSON fallback
    }
    throw new CreatorApiError(response.status, errorMsg, details);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Courses & Drafts
// ---------------------------------------------------------------------------

export async function fetchCreatorCourses(): Promise<CourseDto[]> {
  return request<CourseDto[]>('/api/v1/courses');
}

export async function createCourse(payload: CreateCourseRequest): Promise<CreateCourseResponse> {
  return request<CreateCourseResponse>('/api/v1/courses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchCourseDraft(courseId: string): Promise<CourseDraftDto> {
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

export async function publishCourseVersion(courseId: string): Promise<CourseVersionDto> {
  return request<CourseVersionDto>(`/api/v1/courses/${courseId}/versions`, {
    method: 'POST',
  });
}

export async function fetchCourseVersions(courseId: string): Promise<CourseVersionDto[]> {
  return request<CourseVersionDto[]>(`/api/v1/courses/${courseId}/versions`);
}

// ---------------------------------------------------------------------------
// Activity Blocks (ABP)
// ---------------------------------------------------------------------------

export async function fetchBlockTypes(): Promise<ABTypeManifest[]> {
  return request<ABTypeManifest[]>('/api/v1/abp/types');
}

export async function fetchDraftBlocks(courseId: string): Promise<DraftBlockInstanceDto[]> {
  return request<DraftBlockInstanceDto[]>(`/api/v1/courses/${courseId}/draft/blocks`);
}

export async function addDraftBlock(
  courseId: string,
  payload: AddDraftBlockRequest,
): Promise<DraftBlockInstanceDto> {
  return request<DraftBlockInstanceDto>(`/api/v1/courses/${courseId}/draft/blocks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDraftBlock(
  courseId: string,
  blockId: string,
  payload: UpdateDraftBlockRequest,
): Promise<DraftBlockInstanceDto> {
  return request<DraftBlockInstanceDto>(
    `/api/v1/courses/${courseId}/draft/blocks/${blockId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteDraftBlock(
  courseId: string,
  blockId: string,
  expectedRevision: number,
): Promise<void> {
  return request<void>(
    `/api/v1/courses/${courseId}/draft/blocks/${blockId}?expectedRevision=${expectedRevision}`,
    {
      method: 'DELETE',
    },
  );
}

export async function reorderDraftBlocks(
  courseId: string,
  payload: ReorderDraftBlocksRequest,
): Promise<DraftBlockInstanceDto[]> {
  return request<DraftBlockInstanceDto[]>(
    `/api/v1/courses/${courseId}/draft/blocks/reorder`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
}

export async function validateDraftBlocks(
  courseId: string,
): Promise<DraftValidationResponseDto> {
  return request<DraftValidationResponseDto>(
    `/api/v1/courses/${courseId}/draft/blocks/validate`,
    {
      method: 'POST',
    },
  );
}

// ---------------------------------------------------------------------------
// Question Bank
// ---------------------------------------------------------------------------

export interface CreateQuestionBankItemDto {
  type: QuestionType;
  title: string;
  prompt: string;
  defaultPoints?: number;
  content: Record<string, unknown>;
  answerKey?: Record<string, unknown> | null;
  rubric?: Record<string, unknown> | null;
  tags?: string[];
}

export async function fetchQuestionBankItems(query?: {
  type?: string;
  tag?: string;
}): Promise<QuestionBankItemDto[]> {
  const params = new URLSearchParams();
  if (query?.type) params.append('type', query.type);
  if (query?.tag) params.append('tag', query.tag);
  const qStr = params.toString() ? `?${params.toString()}` : '';
  return request<QuestionBankItemDto[]>(`/api/v1/question-bank${qStr}`);
}

export async function createQuestionBankItem(
  dto: CreateQuestionBankItemDto,
): Promise<QuestionBankItemDto> {
  return request<QuestionBankItemDto>('/api/v1/question-bank', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function publishQuestionVersion(
  itemId: string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/v1/question-bank/${itemId}/versions`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Assessment Definitions
// ---------------------------------------------------------------------------

export async function fetchAssessmentDefinitions(
  courseId?: string,
): Promise<AssessmentDefinitionDto[]> {
  const qStr = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
  return request<AssessmentDefinitionDto[]>(`/api/v1/assessments${qStr}`);
}

export async function createAssessmentDefinition(
  dto: CreateAssessmentDefinitionDto,
): Promise<AssessmentDefinitionDto> {
  return request<AssessmentDefinitionDto>('/api/v1/assessments', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function publishAssessmentDefinition(
  assessmentId: string,
  idempotencyKey?: string,
): Promise<AssessmentVersionDto> {
  return request<AssessmentVersionDto>(`/api/v1/assessments/${assessmentId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ idempotencyKey }),
  });
}
