import {
  ABRunDto,
  ABTypeManifest,
  AddDraftBlockRequest,
  DraftBlockInstanceDto,
  DraftValidationResponseDto,
  ExecuteRunCommandRequest,
  RunResultsDto,
  StartRunRequest,
  UpdateDraftBlockRequest,
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
      errorBody.message ||
      errorBody.error?.message ||
      `HTTP Error ${response.status}: ${response.statusText}`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

export async function listBlockTypes(): Promise<ABTypeManifest[]> {
  return request<ABTypeManifest[]>('/api/v1/abp/types');
}

export async function listDraftBlocks(
  courseId: string,
): Promise<DraftBlockInstanceDto[]> {
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
): Promise<void> {
  return request<void>(`/api/v1/courses/${courseId}/draft/blocks/${blockId}`, {
    method: 'DELETE',
  });
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

export async function startRun(payload: StartRunRequest): Promise<ABRunDto> {
  return request<ABRunDto>('/api/v1/runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getRun(runId: string): Promise<ABRunDto> {
  return request<ABRunDto>(`/api/v1/runs/${runId}`);
}

export async function executeRunCommand(
  runId: string,
  payload: ExecuteRunCommandRequest,
): Promise<ABRunDto> {
  return request<ABRunDto>(`/api/v1/runs/${runId}/commands`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getRunResults(runId: string): Promise<RunResultsDto> {
  return request<RunResultsDto>(`/api/v1/runs/${runId}/results`);
}
