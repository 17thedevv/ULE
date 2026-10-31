-- CreateEnum
CREATE TYPE "ExamAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADING', 'COMPLETED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ExamGradeAggregationStatus" AS ENUM ('FULLY_GRADED', 'PARTIAL_PENDING_HUMAN');

-- CreateTable
CREATE TABLE "exam_access_grants" (
    "id" TEXT NOT NULL,
    "assessmentDefinitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "status" "AccessGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" TEXT NOT NULL,
    "assessmentVersionId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "ExamAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "idempotencyKey" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_responses" (
    "id" TEXT NOT NULL,
    "examAttemptId" TEXT NOT NULL,
    "itemRefId" TEXT NOT NULL,
    "questionVersionId" TEXT NOT NULL,
    "responsePayload" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_grades" (
    "id" TEXT NOT NULL,
    "examAttemptId" TEXT NOT NULL,
    "objectivePoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendingHumanPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAwardedPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxPossiblePoints" DOUBLE PRECISION NOT NULL,
    "percentageScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPassing" BOOLEAN NOT NULL DEFAULT false,
    "aggregationStatus" "ExamGradeAggregationStatus" NOT NULL,
    "evaluatorVersion" TEXT NOT NULL DEFAULT 'ule-exam-evaluator-v1',
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isReleased" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_item_grades" (
    "id" TEXT NOT NULL,
    "examGradeId" TEXT NOT NULL,
    "itemRefId" TEXT NOT NULL,
    "questionVersionId" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL,
    "maxPoints" DOUBLE PRECISION NOT NULL,
    "awardedPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "isPendingHuman" BOOLEAN NOT NULL DEFAULT false,
    "evaluationDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_item_grades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_access_grants_userId_idx" ON "exam_access_grants"("userId");

-- CreateIndex
CREATE INDEX "exam_access_grants_assessmentDefinitionId_idx" ON "exam_access_grants"("assessmentDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_access_grants_assessmentDefinitionId_userId_key" ON "exam_access_grants"("assessmentDefinitionId", "userId");

-- CreateIndex
CREATE INDEX "exam_attempts_learnerId_idx" ON "exam_attempts"("learnerId");

-- CreateIndex
CREATE INDEX "exam_attempts_assessmentVersionId_idx" ON "exam_attempts"("assessmentVersionId");

-- CreateIndex
CREATE INDEX "exam_attempts_status_idx" ON "exam_attempts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_assessmentVersionId_learnerId_attemptNumber_key" ON "exam_attempts"("assessmentVersionId", "learnerId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_assessmentVersionId_learnerId_idempotencyKey_key" ON "exam_attempts"("assessmentVersionId", "learnerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "exam_responses_examAttemptId_idx" ON "exam_responses"("examAttemptId");

-- CreateIndex
CREATE INDEX "exam_responses_questionVersionId_idx" ON "exam_responses"("questionVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_responses_examAttemptId_itemRefId_key" ON "exam_responses"("examAttemptId", "itemRefId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_grades_examAttemptId_key" ON "exam_grades"("examAttemptId");

-- CreateIndex
CREATE INDEX "exam_grades_examAttemptId_idx" ON "exam_grades"("examAttemptId");

-- CreateIndex
CREATE INDEX "exam_item_grades_examGradeId_idx" ON "exam_item_grades"("examGradeId");

-- CreateIndex
CREATE INDEX "exam_item_grades_questionVersionId_idx" ON "exam_item_grades"("questionVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_item_grades_examGradeId_itemRefId_key" ON "exam_item_grades"("examGradeId", "itemRefId");

-- AddForeignKey
ALTER TABLE "exam_access_grants" ADD CONSTRAINT "exam_access_grants_assessmentDefinitionId_fkey" FOREIGN KEY ("assessmentDefinitionId") REFERENCES "assessment_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_access_grants" ADD CONSTRAINT "exam_access_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_access_grants" ADD CONSTRAINT "exam_access_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_assessmentVersionId_fkey" FOREIGN KEY ("assessmentVersionId") REFERENCES "assessment_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_responses" ADD CONSTRAINT "exam_responses_examAttemptId_fkey" FOREIGN KEY ("examAttemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_responses" ADD CONSTRAINT "exam_responses_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_grades" ADD CONSTRAINT "exam_grades_examAttemptId_fkey" FOREIGN KEY ("examAttemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_item_grades" ADD CONSTRAINT "exam_item_grades_examGradeId_fkey" FOREIGN KEY ("examGradeId") REFERENCES "exam_grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_item_grades" ADD CONSTRAINT "exam_item_grades_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
