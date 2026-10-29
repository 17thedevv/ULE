-- CreateEnum
CREATE TYPE "AccessGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "EvidenceClassification" AS ENUM ('UNGRADED_PARTICIPATION', 'INDEPENDENT_CORRECT', 'ASSISTED_CORRECT', 'INCORRECT', 'SAME_ITEM_REPETITION', 'PENDING_EVALUATION', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('ACCEPTED', 'EXCLUDED', 'PENDING_ASSESSMENT', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "LearnerSkillState" AS ENUM ('INSUFFICIENT_EVIDENCE', 'DEVELOPING', 'READY_TO_VERIFY');

-- AlterEnum
ALTER TYPE "AssessmentStatus" ADD VALUE 'PENDING';

-- CreateTable
CREATE TABLE "course_access_grants" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseVersionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "status" "AccessGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_skills" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "skillCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_skill_mappings" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "blockInstanceId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "itemKey" TEXT,
    "criterion" TEXT NOT NULL DEFAULT 'CORRECT_RESPONSE',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_skill_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_evidence" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseVersionId" TEXT NOT NULL,
    "skillId" TEXT,
    "skillCode" TEXT,
    "skillRevision" INTEGER,
    "blockInstanceId" TEXT NOT NULL,
    "blockTypeId" TEXT NOT NULL,
    "typeVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "runId" TEXT NOT NULL,
    "attemptId" TEXT,
    "assessmentResultId" TEXT,
    "eventId" TEXT,
    "itemKey" TEXT,
    "mappingRevision" INTEGER,
    "evaluatorId" TEXT,
    "evaluatorVersion" TEXT,
    "assessmentStatus" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3),
    "assisted" BOOLEAN NOT NULL DEFAULT false,
    "supportProvenance" TEXT,
    "supportContext" JSONB,
    "isCorrect" BOOLEAN,
    "score" DOUBLE PRECISION,
    "classification" "EvidenceClassification" NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'ACCEPTED',
    "exclusionReason" TEXT,
    "policyVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "isSameItemRepetition" BOOLEAN NOT NULL DEFAULT false,
    "repetitionCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_corrections" (
    "id" TEXT NOT NULL,
    "assessmentResultId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "previousStatus" "AssessmentStatus" NOT NULL,
    "newStatus" "AssessmentStatus" NOT NULL,
    "previousIsCorrect" BOOLEAN,
    "newIsCorrect" BOOLEAN,
    "previousScore" DOUBLE PRECISION,
    "newScore" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_skill_projections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseVersionId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillCode" TEXT NOT NULL,
    "state" "LearnerSkillState" NOT NULL DEFAULT 'INSUFFICIENT_EVIDENCE',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "policyVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "independentCount" INTEGER NOT NULL DEFAULT 0,
    "assistedCount" INTEGER NOT NULL DEFAULT 0,
    "incorrectCount" INTEGER NOT NULL DEFAULT 0,
    "repeatedCount" INTEGER NOT NULL DEFAULT 0,
    "evidenceIds" JSONB NOT NULL,
    "reasons" JSONB NOT NULL,
    "limitations" JSONB NOT NULL,
    "proposedAction" JSONB,
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learner_skill_projections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_access_grants_userId_idx" ON "course_access_grants"("userId");

-- CreateIndex
CREATE INDEX "course_access_grants_courseVersionId_idx" ON "course_access_grants"("courseVersionId");

-- CreateIndex
CREATE INDEX "course_access_grants_courseId_idx" ON "course_access_grants"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "course_access_grants_courseVersionId_userId_key" ON "course_access_grants"("courseVersionId", "userId");

-- CreateIndex
CREATE INDEX "course_skills_courseId_idx" ON "course_skills"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "course_skills_courseId_skillCode_key" ON "course_skills"("courseId", "skillCode");

-- CreateIndex
CREATE INDEX "draft_skill_mappings_draftId_idx" ON "draft_skill_mappings"("draftId");

-- CreateIndex
CREATE INDEX "draft_skill_mappings_skillId_idx" ON "draft_skill_mappings"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "draft_skill_mappings_draftId_blockInstanceId_skillId_itemKe_key" ON "draft_skill_mappings"("draftId", "blockInstanceId", "skillId", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "learning_evidence_sourceKey_key" ON "learning_evidence"("sourceKey");

-- CreateIndex
CREATE INDEX "learning_evidence_userId_courseVersionId_idx" ON "learning_evidence"("userId", "courseVersionId");

-- CreateIndex
CREATE INDEX "learning_evidence_userId_skillId_idx" ON "learning_evidence"("userId", "skillId");

-- CreateIndex
CREATE INDEX "learning_evidence_runId_idx" ON "learning_evidence"("runId");

-- CreateIndex
CREATE INDEX "assessment_corrections_assessmentResultId_idx" ON "assessment_corrections"("assessmentResultId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_corrections_assessmentResultId_revision_key" ON "assessment_corrections"("assessmentResultId", "revision");

-- CreateIndex
CREATE INDEX "learner_skill_projections_userId_courseVersionId_idx" ON "learner_skill_projections"("userId", "courseVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "learner_skill_projections_courseVersionId_userId_skillId_key" ON "learner_skill_projections"("courseVersionId", "userId", "skillId");

-- AddForeignKey
ALTER TABLE "course_access_grants" ADD CONSTRAINT "course_access_grants_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_access_grants" ADD CONSTRAINT "course_access_grants_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_access_grants" ADD CONSTRAINT "course_access_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_access_grants" ADD CONSTRAINT "course_access_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_skills" ADD CONSTRAINT "course_skills_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_skill_mappings" ADD CONSTRAINT "draft_skill_mappings_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "course_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_skill_mappings" ADD CONSTRAINT "draft_skill_mappings_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "course_skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ab_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ab_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_evidence" ADD CONSTRAINT "learning_evidence_assessmentResultId_fkey" FOREIGN KEY ("assessmentResultId") REFERENCES "assessment_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_corrections" ADD CONSTRAINT "assessment_corrections_assessmentResultId_fkey" FOREIGN KEY ("assessmentResultId") REFERENCES "assessment_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_skill_projections" ADD CONSTRAINT "learner_skill_projections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_skill_projections" ADD CONSTRAINT "learner_skill_projections_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
