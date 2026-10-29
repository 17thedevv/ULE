// Learning Evidence, Skill Identity & Minimal LII Contracts
// Phase 3: Trusted Learning Evidence & Minimal LII Foundation

export type AccessGrantStatus = 'ACTIVE' | 'REVOKED';

export interface CourseAccessGrantDto {
  id: string;
  courseId: string;
  courseVersionId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  grantedById: string;
  status: AccessGrantStatus;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccessGrantRequest {
  userId?: string;
  email?: string;
}

export interface CourseSkillDto {
  id: string;
  courseId: string;
  skillCode: string;
  name: string;
  description: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCourseSkillRequest {
  skillCode: string;
  name: string;
  description?: string;
}

export interface DraftSkillMappingDto {
  id: string;
  draftId: string;
  blockInstanceId: string;
  skillId: string;
  skillCode?: string;
  skillName?: string;
  itemKey?: string | null;
  criterion: string;
  weight: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertDraftSkillMappingRequest {
  blockInstanceId: string;
  skillId: string;
  itemKey?: string;
  criterion?: string;
  weight?: number;
  expectedRevision: number;
}

export type EvidenceClassification =
  | 'UNGRADED_PARTICIPATION'
  | 'INDEPENDENT_CORRECT'
  | 'ASSISTED_CORRECT'
  | 'INCORRECT'
  | 'SAME_ITEM_REPETITION'
  | 'PENDING_EVALUATION'
  | 'EXCLUDED';

export type EvidenceStatus =
  | 'ACCEPTED'
  | 'EXCLUDED'
  | 'PENDING_ASSESSMENT'
  | 'SUPERSEDED';

export interface LearningEvidenceDto {
  id: string;
  userId: string;
  courseVersionId: string;
  skillId?: string | null;
  skillCode?: string | null;
  skillRevision?: number | null;
  blockInstanceId: string;
  blockTypeId: string;
  typeVersion: string;
  runId: string;
  attemptId?: string | null;
  assessmentResultId?: string | null;
  eventId?: string | null;
  itemKey?: string | null;
  mappingRevision?: number | null;
  evaluatorId?: string | null;
  evaluatorVersion?: string | null;
  assessmentStatus: string;
  evaluatedAt?: string | null;
  assisted: boolean;
  supportProvenance?: string | null;
  supportContext?: Record<string, unknown> | null;
  isCorrect?: boolean | null;
  score?: number | null;
  classification: EvidenceClassification;
  status: EvidenceStatus;
  exclusionReason?: string | null;
  policyVersion: string;
  isSameItemRepetition: boolean;
  repetitionCount: number;
  deferred?: boolean;
  createdAt: string;
}

export interface AssessmentCorrectionRequest {
  assessmentResultId: string;
  newStatus?: 'EVALUATED' | 'FAILED' | 'SKIPPED';
  newIsCorrect?: boolean;
  newScore?: number;
  reason: string;
}

export interface AssessmentCorrectionDto {
  id: string;
  assessmentResultId: string;
  revision: number;
  previousStatus: string;
  newStatus: string;
  previousIsCorrect?: boolean | null;
  newIsCorrect?: boolean | null;
  previousScore?: number | null;
  newScore?: number | null;
  reason: string;
  actorId: string;
  createdAt: string;
}

export type LearnerSkillState =
  | 'INSUFFICIENT_EVIDENCE'
  | 'DEVELOPING'
  | 'READY_TO_VERIFY';

export type LiiActionCategory =
  | 'CONTINUE'
  | 'PROBE'
  | 'SUPPORT'
  | 'RECOVERY'
  | 'VERIFY';

export interface LiiActionProposalDto {
  category: LiiActionCategory;
  targetSkillId: string;
  reason: string;
  sourceEvidenceIds: string[];
  policyVersion: string;
  validityConditions: string[];
  suggestedBlockInstanceId?: string | null;
  isAvailable: boolean;
}

export interface LearnerSkillProjectionDto {
  id: string;
  userId: string;
  courseVersionId: string;
  skillId: string;
  skillCode: string;
  skillName: string;
  learningObjective?: string | null;
  state: LearnerSkillState;
  revision: number;
  policyVersion: string;
  evidenceCount: number;
  independentCount: number;
  assistedCount: number;
  incorrectCount: number;
  repeatedCount: number;
  evidenceIds: string[];
  reasons: string[];
  limitations: string[];
  proposedAction: LiiActionProposalDto;
  lastEvaluatedAt?: string | null;
  updatedAt: string;
}

export type ActivityProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface BlockProgressDto {
  blockInstanceId: string;
  blockTypeId: string;
  title: string;
  orderIndex: number;
  status: ActivityProgressStatus;
  completedAt?: string | null;
  attemptsCount: number;
}

export interface CourseProgressDto {
  courseVersionId: string;
  totalBlocks: number;
  completedBlocks: number;
  percentComplete: number;
  isMastered: false;
  masteryClaim: null;
  blocks: BlockProgressDto[];
}
