export type CourseVisibility = 'PRIVATE' | 'PUBLIC';

export interface CourseDto {
  id: string;
  ownerId: string;
  visibility: CourseVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface CourseDraftDto {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  summary: string | null;
  revision: number;
  sourceVersionId: string | null;
  updatedAt: string;
}

export interface CourseVersionDto {
  id: string;
  courseId: string;
  versionNumber: number;
  title: string;
  description: string | null;
  summary: string | null;
  snapshot: Record<string, unknown>;
  schemaVersion: string;
  draftRevision: number;
  createdById: string;
  createdAt: string;
}

export interface CreateCourseRequest {
  title: string;
  description?: string;
  summary?: string;
}

export interface CreateCourseResponse {
  course: CourseDto;
  draft: CourseDraftDto;
}

export interface UpdateCourseDraftRequest {
  title?: string;
  description?: string;
  summary?: string;
  expectedRevision?: number;
}
