export type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'CLOZE'
  | 'SHORT_TEXT'
  | 'NUMERIC'
  | 'ESSAY'
  | 'MATCHING'
  | 'ORDERING';

export type ExamFeedbackPolicy =
  | 'IMMEDIATE'
  | 'ON_SUBMISSION'
  | 'DEFERRED'
  | 'MANUAL';

export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

// ----------------------------------------------------
// Specific Question Content & Answer Key Schemas
// ----------------------------------------------------

export interface SingleChoiceOption {
  id: string;
  text: string;
}

export interface SingleChoiceContent {
  prompt: string;
  options: SingleChoiceOption[];
  shuffleOptions?: boolean;
}

export interface SingleChoiceAnswerKey {
  correctOptionId: string;
  explanation?: string;
}

export interface MultiSelectOption {
  id: string;
  text: string;
}

export interface MultiSelectContent {
  prompt: string;
  options: MultiSelectOption[];
  shuffleOptions?: boolean;
}

export interface MultiSelectAnswerKey {
  correctOptionIds: string[];
  explanation?: string;
}

export interface TrueFalseContent {
  prompt: string;
}

export interface TrueFalseAnswerKey {
  correctValue: boolean;
  explanation?: string;
}

export interface ClozeBlankTarget {
  blankKey: string;
  hint?: string;
}

export interface ClozeQuestionContent {
  prompt: string;
  templateText: string;
  targetBlanks: ClozeBlankTarget[];
}

export interface ClozeQuestionAnswerKey {
  blanks: Record<string, string[]>;
  explanation?: string;
}

export interface ShortTextContent {
  prompt: string;
  placeholder?: string;
}

export interface ShortTextAnswerKey {
  acceptableAnswers: string[];
  caseSensitive?: boolean;
  explanation?: string;
}

export interface NumericContent {
  prompt: string;
  unit?: string;
}

export interface NumericAnswerKey {
  correctValue: number;
  tolerance: number;
  toleranceType: 'ABSOLUTE' | 'PERCENT';
  explanation?: string;
}

export interface RubricCriterionLevel {
  score: number;
  label: string;
  description: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
  levels?: RubricCriterionLevel[];
}

export interface EssayRubric {
  criteria: RubricCriterion[];
  overallGuidelines?: string;
}

export interface EssayContent {
  prompt: string;
  minWords?: number;
  maxWords?: number;
}

export interface MatchingContent {
  prompt: string;
  premises: Array<{ id: string; text: string }>;
  targets: Array<{ id: string; text: string }>;
}

export interface MatchingAnswerKey {
  pairs: Record<string, string>; // premiseId -> targetId
  explanation?: string;
}

export interface OrderingItem {
  id: string;
  text: string;
}

export interface OrderingContent {
  prompt: string;
  items: OrderingItem[];
}

export interface OrderingAnswerKey {
  correctSequence: string[]; // array of item IDs in order
  explanation?: string;
}

// ----------------------------------------------------
// DTOs & Public API Contracts
// ----------------------------------------------------

export interface CreateQuestionBankItemDto {
  type: QuestionType;
  title: string;
  prompt: string;
  content: Record<string, unknown>;
  answerKey?: Record<string, unknown> | null;
  rubric?: EssayRubric | null;
  config?: Record<string, unknown> | null;
  defaultPoints?: number;
  skillCode?: string | null;
  difficulty?: string | null;
  tags?: string[];
  courseId?: string | null;
}

export interface UpdateQuestionBankItemDto {
  expectedRevision: number;
  title?: string;
  prompt?: string;
  content?: Record<string, unknown>;
  answerKey?: Record<string, unknown> | null;
  rubric?: EssayRubric | null;
  config?: Record<string, unknown> | null;
  defaultPoints?: number;
  skillCode?: string | null;
  difficulty?: string | null;
  tags?: string[];
  courseId?: string | null;
}

export interface QuestionBankItemDto {
  id: string;
  ownerId: string;
  courseId: string | null;
  type: QuestionType;
  title: string;
  prompt: string;
  content: Record<string, unknown>;
  answerKey?: Record<string, unknown> | null;
  rubric?: EssayRubric | null;
  config?: Record<string, unknown> | null;
  defaultPoints: number;
  skillCode: string | null;
  difficulty: string | null;
  tags: string[];
  revision: number;
  publishedVersionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionVersionDto {
  id: string;
  questionBankItemId: string;
  versionNumber: number;
  type: QuestionType;
  title: string;
  prompt: string;
  content: Record<string, unknown>;
  answerKey?: Record<string, unknown> | null;
  rubric?: EssayRubric | null;
  config?: Record<string, unknown> | null;
  defaultPoints: number;
  skillCode: string | null;
  sourceRevision: number;
  createdById: string;
  createdAt: string;
}

export interface CreateAssessmentDefinitionDto {
  title: string;
  description?: string | null;
  instructions?: string | null;
  durationMinutes?: number | null;
  passingScore?: number | null;
  maxAttempts?: number | null;
  feedbackPolicy?: ExamFeedbackPolicy;
  courseId?: string | null;
}

export interface UpdateAssessmentDefinitionDto {
  expectedRevision: number;
  title?: string;
  description?: string | null;
  instructions?: string | null;
  durationMinutes?: number | null;
  passingScore?: number | null;
  maxAttempts?: number | null;
  feedbackPolicy?: ExamFeedbackPolicy;
  courseId?: string | null;
}

export interface CreateAssessmentSectionDto {
  title: string;
  description?: string | null;
  orderIndex?: number;
}

export interface UpdateAssessmentSectionDto {
  title?: string;
  description?: string | null;
  orderIndex?: number;
}

export interface AddAssessmentItemDto {
  questionBankItemId: string;
  pinnedQuestionVersionId?: string | null;
  points?: number;
  orderIndex?: number;
  isRequired?: boolean;
}

export interface UpdateAssessmentItemDto {
  pinnedQuestionVersionId?: string | null;
  points?: number;
  orderIndex?: number;
  isRequired?: boolean;
}

export interface AssessmentItemRefDto {
  id: string;
  sectionId: string;
  questionBankItemId: string;
  pinnedQuestionVersionId: string | null;
  orderIndex: number;
  points: number;
  isRequired: boolean;
  questionItem?: {
    id: string;
    title: string;
    type: QuestionType;
    prompt: string;
    defaultPoints: number;
    skillCode: string | null;
  };
  pinnedVersion?: QuestionVersionDto;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentSectionDto {
  id: string;
  assessmentDefinitionId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  items: AssessmentItemRefDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentDefinitionDto {
  id: string;
  ownerId: string;
  courseId: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  durationMinutes: number | null;
  passingScore: number | null;
  maxAttempts: number | null;
  feedbackPolicy: ExamFeedbackPolicy;
  status: ExamStatus;
  revision: number;
  sections: AssessmentSectionDto[];
  publishedVersionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublishAssessmentDto {
  idempotencyKey?: string;
}

export interface AssessmentVersionDto {
  id: string;
  assessmentDefinitionId: string;
  versionNumber: number;
  idempotencyKey?: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  durationMinutes: number | null;
  passingScore: number | null;
  maxAttempts: number | null;
  feedbackPolicy: ExamFeedbackPolicy;
  totalPoints: number;
  itemCount: number;
  snapshot: Record<string, unknown>;
  draftRevision: number;
  createdById: string;
  createdAt: string;
}

export interface SanitizedLearnerQuestionPreviewDto {
  id: string;
  type: QuestionType;
  title: string;
  prompt: string;
  content: Record<string, unknown>; // secret answerKey and explanation stripped!
  points: number;
  orderIndex: number;
  isRequired: boolean;
}

export interface SanitizedLearnerAssessmentPreviewDto {
  id: string;
  assessmentDefinitionId: string;
  versionNumber: number;
  title: string;
  description: string | null;
  instructions: string | null;
  durationMinutes: number | null;
  passingScore: number | null;
  totalPoints: number;
  itemCount: number;
  sections: Array<{
    id: string;
    title: string;
    description: string | null;
    orderIndex: number;
    items: SanitizedLearnerQuestionPreviewDto[];
  }>;
}

// ----------------------------------------------------
// Phase 5.5: ExamAttempt Runtime & Grading Contracts
// ----------------------------------------------------

export type ExamAttemptStatus =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'GRADING'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'EXPIRED';

export type ExamGradeAggregationStatus =
  | 'FULLY_GRADED'
  | 'PARTIAL_PENDING_HUMAN';

export interface StartExamAttemptDto {
  idempotencyKey?: string;
}

export interface ExamAttemptDto {
  id: string;
  assessmentVersionId: string;
  learnerId: string;
  attemptNumber: number;
  status: ExamAttemptStatus;
  idempotencyKey?: string | null;
  startedAt: string;
  deadlineAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaveExamResponseDto {
  responsePayload: Record<string, unknown>;
  expectedRevision?: number;
}

export interface ExamResponseDto {
  id: string;
  examAttemptId: string;
  itemRefId: string;
  questionVersionId: string;
  responsePayload: Record<string, unknown>;
  revision: number;
  savedAt: string;
  isFinal: boolean;
}

export interface SubmitExamAttemptDto {
  idempotencyKey?: string;
}

export interface ExamItemGradeDto {
  id: string;
  itemRefId: string;
  questionVersionId: string;
  questionType: QuestionType;
  maxPoints: number;
  awardedPoints: number;
  isCorrect: boolean;
  isPendingHuman: boolean;
  evaluationDetails?: Record<string, unknown> | null;
}

export interface ExamGradeDto {
  id: string;
  examAttemptId: string;
  objectivePoints: number;
  pendingHumanPoints: number;
  totalAwardedPoints: number;
  maxPossiblePoints: number;
  percentageScore: number;
  isPassing: boolean;
  aggregationStatus: ExamGradeAggregationStatus;
  evaluatorVersion: string;
  evaluatedAt: string;
  isReleased: boolean;
  releasedAt: string | null;
  itemGrades?: ExamItemGradeDto[];
}

export interface ExamResultSummaryDto {
  attemptId: string;
  status: ExamAttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  deadlineAt: string | null;
  feedbackPolicy: ExamFeedbackPolicy;
  isReleased: boolean;
  releasedAt: string | null;
  notice?: string;
  grade?: ExamGradeDto;
}

export interface GrantExamAccessDto {
  userId: string;
}

export interface ExamAccessGrantDto {
  id: string;
  assessmentDefinitionId: string;
  userId: string;
  grantedById: string;
  status: 'ACTIVE' | 'REVOKED';
  revokedAt: string | null;
  createdAt: string;
}
