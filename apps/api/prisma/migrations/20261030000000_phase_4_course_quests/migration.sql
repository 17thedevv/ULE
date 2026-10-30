-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "QuestStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "QuestScope" AS ENUM ('COURSE', 'GLOBAL');

-- CreateEnum
CREATE TYPE "FactType" AS ENUM ('ACTIVITY_COMPLETED', 'INDEPENDENT_PRACTICE_CONFIRMED');

-- CreateEnum
CREATE TYPE "FactState" AS ENUM ('QUALIFIED', 'INELIGIBLE', 'SUPERSEDED', 'REVOKED');

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseVersionId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_course_quests" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "questKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "templateId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "rewardPolicy" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_course_quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualifying_facts" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseVersionId" TEXT NOT NULL,
    "factType" "FactType" NOT NULL,
    "blockInstanceId" TEXT NOT NULL,
    "skillId" TEXT,
    "skillCode" TEXT,
    "runId" TEXT NOT NULL,
    "attemptId" TEXT,
    "assessmentResultId" TEXT,
    "evidenceId" TEXT,
    "policyVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "state" "FactState" NOT NULL DEFAULT 'QUALIFIED',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qualifying_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_instances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseEnrollmentId" TEXT,
    "courseVersionId" TEXT,
    "questKey" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scope" "QuestScope" NOT NULL DEFAULT 'COURSE',
    "definitionRevision" INTEGER NOT NULL DEFAULT 1,
    "status" "QuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "occurrence" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB,
    "rewardPolicy" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quest_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_objective_progress" (
    "id" TEXT NOT NULL,
    "questInstanceId" TEXT NOT NULL,
    "objectiveKey" TEXT NOT NULL,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "targetCount" INTEGER NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quest_objective_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_fact_consumptions" (
    "id" TEXT NOT NULL,
    "questInstanceId" TEXT NOT NULL,
    "objectiveProgressId" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "factSourceKey" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'CONSUMED',

    CONSTRAINT "quest_fact_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_enrollments_userId_courseVersionId_key" ON "course_enrollments"("userId", "courseVersionId");
CREATE INDEX "course_enrollments_userId_idx" ON "course_enrollments"("userId");
CREATE INDEX "course_enrollments_courseVersionId_idx" ON "course_enrollments"("courseVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "draft_course_quests_draftId_questKey_key" ON "draft_course_quests"("draftId", "questKey");
CREATE INDEX "draft_course_quests_draftId_idx" ON "draft_course_quests"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "qualifying_facts_sourceKey_key" ON "qualifying_facts"("sourceKey");
CREATE INDEX "qualifying_facts_userId_courseVersionId_idx" ON "qualifying_facts"("userId", "courseVersionId");
CREATE INDEX "qualifying_facts_runId_idx" ON "qualifying_facts"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "quest_instances_courseEnrollmentId_questKey_occurrence_key" ON "quest_instances"("courseEnrollmentId", "questKey", "occurrence");
CREATE INDEX "quest_instances_userId_scope_status_idx" ON "quest_instances"("userId", "scope", "status");
CREATE INDEX "quest_instances_courseVersionId_idx" ON "quest_instances"("courseVersionId");
CREATE INDEX "quest_instances_courseEnrollmentId_idx" ON "quest_instances"("courseEnrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "quest_objective_progress_questInstanceId_objectiveKey_key" ON "quest_objective_progress"("questInstanceId", "objectiveKey");
CREATE INDEX "quest_objective_progress_questInstanceId_idx" ON "quest_objective_progress"("questInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "quest_fact_consumptions_questInstanceId_objectiveProgressId_factSourceKey_key" ON "quest_fact_consumptions"("questInstanceId", "objectiveProgressId", "factSourceKey");
CREATE INDEX "quest_fact_consumptions_questInstanceId_idx" ON "quest_fact_consumptions"("questInstanceId");
CREATE INDEX "quest_fact_consumptions_factId_idx" ON "quest_fact_consumptions"("factId");

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_course_quests" ADD CONSTRAINT "draft_course_quests_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "course_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualifying_facts" ADD CONSTRAINT "qualifying_facts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "qualifying_facts" ADD CONSTRAINT "qualifying_facts_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "qualifying_facts" ADD CONSTRAINT "qualifying_facts_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ab_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "qualifying_facts" ADD CONSTRAINT "qualifying_facts_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ab_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "qualifying_facts" ADD CONSTRAINT "qualifying_facts_assessmentResultId_fkey" FOREIGN KEY ("assessmentResultId") REFERENCES "assessment_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_courseEnrollmentId_fkey" FOREIGN KEY ("courseEnrollmentId") REFERENCES "course_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quest_instances" ADD CONSTRAINT "quest_instances_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_objective_progress" ADD CONSTRAINT "quest_objective_progress_questInstanceId_fkey" FOREIGN KEY ("questInstanceId") REFERENCES "quest_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_fact_consumptions" ADD CONSTRAINT "quest_fact_consumptions_questInstanceId_fkey" FOREIGN KEY ("questInstanceId") REFERENCES "quest_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quest_fact_consumptions" ADD CONSTRAINT "quest_fact_consumptions_objectiveProgressId_fkey" FOREIGN KEY ("objectiveProgressId") REFERENCES "quest_objective_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quest_fact_consumptions" ADD CONSTRAINT "quest_fact_consumptions_factId_fkey" FOREIGN KEY ("factId") REFERENCES "qualifying_facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
