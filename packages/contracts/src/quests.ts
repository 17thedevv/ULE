// Course Gamification, Quest Engine & Journey Contracts
// Phase 4: Course Gamification & Journey MVP

export type QuestTemplateId =
  | 'COMPLETE_DISTINCT_ACTIVITIES'
  | 'INDEPENDENT_PRACTICE'
  | 'EXPLORE_LEARNING_OPPORTUNITIES';

export type QuestRepeatability =
  | 'ONCE_PER_ENROLLMENT'
  | 'FINITE_OCCURRENCE'
  | 'DAILY_CAPPED';

export type QuestScope = 'COURSE' | 'GLOBAL';

export type QuestInstanceStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'REVOKED';

export type CourseEnrollmentStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export type QualifyingFactType =
  | 'ACTIVITY_COMPLETED'
  | 'INDEPENDENT_PRACTICE_CONFIRMED';

export type QualifyingFactState =
  | 'QUALIFIED'
  | 'INELIGIBLE'
  | 'SUPERSEDED'
  | 'REVOKED';

export interface CompleteDistinctActivitiesConfig {
  targetCount: number;
  requiredBlockInstanceIds?: string[];
}

export interface IndependentPracticeConfig {
  skillCode: string;
  targetCount: number;
}

export interface ExploreOpportunitiesConfig {
  targetCount: number;
  maxPerCourse?: number;
}

export type QuestObjectiveConfig =
  | CompleteDistinctActivitiesConfig
  | IndependentPracticeConfig
  | ExploreOpportunitiesConfig;

export interface CourseQuestRewardPolicyDto {
  courseXp?: number;
  badgeKey?: string;
}

export interface PlatformQuestRewardPolicyDto {
  platformXp?: number;
  badgeKey?: string;
}

export interface QuestRewardPolicyDto {
  courseXp?: number;
  platformXp?: number;
  badgeKey?: string;
}

export interface DraftCourseQuestDto {
  id: string;
  draftId: string;
  questKey: string;
  title: string;
  description: string | null;
  templateId: QuestTemplateId;
  config: QuestObjectiveConfig;
  rewardPolicy: CourseQuestRewardPolicyDto | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDraftCourseQuestRequest {
  questKey: string;
  title: string;
  description?: string;
  templateId: QuestTemplateId;
  config: QuestObjectiveConfig;
  rewardPolicy?: CourseQuestRewardPolicyDto;
}

export interface UpdateDraftCourseQuestRequest {
  expectedRevision: number;
  title?: string;
  description?: string;
  config?: QuestObjectiveConfig;
  rewardPolicy?: CourseQuestRewardPolicyDto;
}

export interface QuestDefinitionSnapshot {
  id: string;
  questKey: string;
  title: string;
  description: string | null;
  templateId: QuestTemplateId;
  config: QuestObjectiveConfig;
  rewardPolicy: QuestRewardPolicyDto | null;
  revision: number;
}

export interface CourseEnrollmentDto {
  id: string;
  userId: string;
  courseVersionId: string;
  status: CourseEnrollmentStatus;
  enrolledAt: string;
  lastActivityAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnrollCourseRequest {
  idempotencyKey?: string;
}

export interface QuestObjectiveProgressDto {
  id: string;
  questInstanceId: string;
  objectiveKey: string;
  currentCount: number;
  targetCount: number;
  isCompleted: boolean;
  completedAt: string | null;
}

export interface CourseQuestInstanceDto {
  id: string;
  userId: string;
  courseEnrollmentId: string;
  courseVersionId: string;
  questKey: string;
  templateId: QuestTemplateId;
  title: string;
  description: string | null;
  status: QuestInstanceStatus;
  occurrence: number;
  completedAt: string | null;
  objectives: QuestObjectiveProgressDto[];
  rewardPolicy: QuestRewardPolicyDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface QualifyingFactDto {
  id: string;
  sourceKey: string;
  userId: string;
  courseVersionId: string;
  factType: QualifyingFactType;
  blockInstanceId: string;
  skillId: string | null;
  skillCode: string | null;
  runId: string;
  attemptId: string | null;
  assessmentResultId: string | null;
  evidenceId: string | null;
  state: QualifyingFactState;
  policyVersion: string;
  createdAt: string;
}
