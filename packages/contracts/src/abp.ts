// Activity Block Protocol (ABP) Shared Contracts
// Phase 1B: Activity Block Protocol & Minimal Runtime

export interface ABTypeCapabilities {
  renderable: boolean;
  submittable: boolean;
  evaluatable: boolean;
  completable: boolean;
  runtimeExecutionSupported: boolean;
}

export interface ABTypeManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  capabilities: ABTypeCapabilities;
  defaultConfig: Record<string, unknown>;
  schemaDescription: Record<string, unknown>;
}

// ----------------------------------------------------
// Block Configurations (Creator-Configured)
// ----------------------------------------------------

export interface VideoConfig {
  url: string;
  durationSeconds?: number;
  transcript?: string;
  allowSkip?: boolean;
}

export interface MultipleChoiceOption {
  id: string;
  text: string;
  explanation?: string;
}

export interface MultipleChoiceAnswerKey {
  correctOptionId: string;
  explanation?: string;
}

export type MultipleChoiceFeedbackPolicy =
  | 'IMMEDIATE_WITH_EXPLANATION'
  | 'IMMEDIATE_CORRECTNESS_ONLY'
  | 'DEFERRED';

export interface MultipleChoiceConfig {
  question: string;
  options: MultipleChoiceOption[];
  answerKey: MultipleChoiceAnswerKey;
  feedbackPolicy?: MultipleChoiceFeedbackPolicy;
  allowHints?: boolean;
  hintText?: string;
}

export interface CodingConfig {
  language: string;
  starterCode: string;
  instructions: string;
  expectedOutput?: string;
}

// ----------------------------------------------------
// Learner-Facing Views (Protected Evaluator Data Removed)
// ----------------------------------------------------

export interface MultipleChoiceLearnerView {
  question: string;
  options: Array<{ id: string; text: string }>;
  allowHints: boolean;
  hintText?: string;
  feedbackPolicy: MultipleChoiceFeedbackPolicy;
}

export interface VideoLearnerView {
  url: string;
  durationSeconds?: number;
  transcript?: string;
  allowSkip: boolean;
}

// ----------------------------------------------------
// Draft Block Instances
// ----------------------------------------------------

export interface DraftBlockInstanceDto {
  id: string;
  draftId: string;
  blockTypeId: string;
  typeVersion: string;
  title: string;
  orderIndex: number;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AddDraftBlockRequest {
  blockTypeId: string;
  typeVersion?: string;
  title: string;
  config: Record<string, unknown>;
  orderIndex?: number;
  expectedRevision: number;
}

export interface UpdateDraftBlockRequest {
  title?: string;
  config?: Record<string, unknown>;
  expectedRevision: number;
}

export interface ReorderDraftBlocksRequest {
  blockIds: string[];
  expectedRevision: number;
}

export interface BlockValidationResultDto {
  blockId: string;
  title: string;
  blockTypeId: string;
  valid: boolean;
  errors: string[];
}

export interface DraftValidationResponseDto {
  valid: boolean;
  totalBlocks: number;
  invalidBlocksCount: number;
  blocks: BlockValidationResultDto[];
}

// ----------------------------------------------------
// Versioned Block Instance Snapshot
// ----------------------------------------------------

export interface BlockInstanceSnapshot {
  id: string;
  blockTypeId: string;
  typeVersion: string;
  title: string;
  orderIndex: number;
  config: Record<string, unknown>;
}

// ----------------------------------------------------
// Minimal AB Runtime
// ----------------------------------------------------

export type RunStatus = 'CREATED' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

export type RunCloseReason = 'COMPLETED' | 'ABANDONED' | 'FAILED';

export type RunCommandType =
  | 'START'
  | 'SUSPEND'
  | 'RESUME'
  | 'SUBMIT_RESPONSE'
  | 'REQUEST_HINT'
  | 'FINISH'
  | 'ABANDON';

export interface StartRunRequest {
  courseVersionId: string;
  blockInstanceId: string;
  idempotencyKey: string;
}

export type SupportProvenance =
  | 'SERVER_OBSERVED'
  | 'SELF_REPORTED_ASSISTED'
  | 'SELF_REPORTED_INDEPENDENT'
  | 'UNVERIFIED';

export interface SupportContextDto {
  hintUsed: boolean;
  assistanceLevel: string;
  provenance: SupportProvenance;
  hintDelivered?: boolean;
  [key: string]: unknown;
}

export interface SubmitResponsePayload {
  selectedOptionId?: string;
  usedHint?: boolean;
  response?: Record<string, unknown>;
}

export interface ExecuteRunCommandRequest {
  command: RunCommandType;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
}

export interface ABAttemptDto {
  id: string;
  runId: string;
  attemptNumber: number;
  submittedResponse: Record<string, unknown>;
  assisted: boolean;
  supportContext: Record<string, unknown> | null;
  createdAt: string;
}

export type AssessmentStatus = 'EVALUATED' | 'SKIPPED' | 'FAILED';

export interface AssessmentResultDto {
  id: string;
  attemptId: string | null;
  runId: string;
  status: AssessmentStatus;
  isCorrect: boolean | null;
  score: number | null;
  feedback: Record<string, unknown> | string | null;
  evaluatorId: string;
  evaluatedAt: string;
  createdAt: string;
}

export interface ABEventDto {
  id: string;
  runId: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  idempotencyKey: string | null;
  serverTimestamp: string;
}

export interface ABRunDto {
  id: string;
  userId: string;
  courseVersionId: string;
  blockInstanceId: string;
  blockTypeId: string;
  typeVersion: string;
  status: RunStatus;
  closeReason: RunCloseReason | null;
  failureDetails: string | null;
  startedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Learner-sanitized view of the pinned block instance
  block: {
    id: string;
    blockTypeId: string;
    typeVersion: string;
    title: string;
    orderIndex: number;
    learnerConfig: Record<string, unknown>;
  };
  latestAttempt?: ABAttemptDto | null;
  latestAssessment?: AssessmentResultDto | null;
}

export interface RunResultsDto {
  run: ABRunDto;
  attempts: ABAttemptDto[];
  assessments: AssessmentResultDto[];
  events: ABEventDto[];
}
