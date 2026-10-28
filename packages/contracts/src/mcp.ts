/**
 * Model Context Protocol (MCP) Authoring Contracts for ULE.
 * Enforces OAuth 2.1 scopes, explicit tool interfaces, and security invariants.
 */

export const MCP_SCOPES = {
  READ: 'course:read',
  WRITE: 'course:write',
} as const;

export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES];

export const MCP_AUTHORING_TOOLS = {
  // Discovery
  GET_AUTHORING_CAPABILITIES: 'ule_get_authoring_capabilities',
  LIST_BLOCK_TYPES: 'ule_list_block_types',
  GET_BLOCK_TYPE_SCHEMA: 'ule_get_block_type_schema',

  // Private Course Core
  CREATE_PRIVATE_COURSE: 'ule_create_private_course',
  LIST_MY_COURSES: 'ule_list_my_courses',
  GET_MY_COURSE: 'ule_get_my_course',
  GET_COURSE_DRAFT: 'ule_get_course_draft',
  UPDATE_COURSE_DRAFT: 'ule_update_course_draft',

  // Draft Block Authoring
  LIST_DRAFT_BLOCKS: 'ule_list_draft_blocks',
  ADD_DRAFT_BLOCK: 'ule_add_draft_block',
  UPDATE_DRAFT_BLOCK: 'ule_update_draft_block',
  DELETE_DRAFT_BLOCK: 'ule_delete_draft_block',
  REORDER_DRAFT_BLOCKS: 'ule_reorder_draft_blocks',

  // Validation & Immutable Versions
  VALIDATE_COURSE_DRAFT: 'ule_validate_course_draft',
  CREATE_PRIVATE_COURSE_VERSION: 'ule_create_private_course_version',
  LIST_COURSE_VERSIONS: 'ule_list_course_versions',
  GET_COURSE_VERSION: 'ule_get_course_version',
} as const;

export type McpAuthoringToolName =
  (typeof MCP_AUTHORING_TOOLS)[keyof typeof MCP_AUTHORING_TOOLS];

// Discovery Tool Types
export interface McpAuthoringCapabilitiesDto {
  version: string;
  architecture: string;
  enforcesOwnership: boolean;
  visibilityDefault: 'PRIVATE';
  supportedBlockTypes: string[];
  optimisticConcurrencyRequired: boolean;
  immutableVersionsEnforced: boolean;
  prohibitedOperations: string[];
}

export interface McpBlockTypeSummaryDto {
  blockTypeId: string;
  typeVersion: string;
  name: string;
  description: string;
  capabilities: {
    renderable: boolean;
    completable: boolean;
    evaluatable: boolean;
  };
}

export interface McpBlockTypeSchemaDto {
  blockTypeId: string;
  typeVersion: string;
  name: string;
  description: string;
  configSchema: Record<string, unknown>;
  authoringGuidelines: string;
}

// Course Authoring Tool Parameter Types
export interface McpCreatePrivateCourseParams {
  title?: string;
  description?: string;
  summary?: string;
  idempotencyKey?: string;
}

export interface McpGetCourseParams {
  courseId: string;
}

export interface McpUpdateCourseDraftParams {
  courseId: string;
  expectedRevision: number;
  title?: string;
  description?: string;
  summary?: string;
  idempotencyKey?: string;
}

// Draft Block Tool Parameter Types
export interface McpListDraftBlocksParams {
  courseId: string;
}

export interface McpAddDraftBlockParams {
  courseId: string;
  expectedRevision: number;
  blockTypeId: string;
  typeVersion?: string;
  title: string;
  orderIndex?: number;
  config: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface McpUpdateDraftBlockParams {
  courseId: string;
  blockId: string;
  expectedRevision: number;
  title?: string;
  config?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface McpDeleteDraftBlockParams {
  courseId: string;
  blockId: string;
  expectedRevision: number;
  idempotencyKey?: string;
}

export interface McpReorderDraftBlocksParams {
  courseId: string;
  expectedRevision: number;
  blockOrders: Array<{ blockId: string; orderIndex: number }>;
  idempotencyKey?: string;
}

// Validation & Version Tool Parameter Types
export interface McpValidateCourseDraftParams {
  courseId: string;
}

export interface McpValidationResultDto {
  courseId: string;
  draftId: string;
  revision: number;
  valid: boolean;
  blockCount: number;
  errors?: Array<{
    blockId?: string;
    blockTitle?: string;
    message: string;
  }>;
}

export interface McpCreateCourseVersionParams {
  courseId: string;
  idempotencyKey?: string;
}

export interface McpGetCourseVersionParams {
  courseId: string;
  versionId: string;
}

// Protected Resource Metadata (RFC 9728)
export interface McpProtectedResourceMetadataDto {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_documentation?: string;
}
