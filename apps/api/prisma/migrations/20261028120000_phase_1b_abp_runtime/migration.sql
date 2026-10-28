-- Phase 1B: Activity Block Protocol & Minimal Runtime Migration

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('CREATED', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RunCloseReason" AS ENUM ('COMPLETED', 'ABANDONED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('EVALUATED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "draft_block_instances" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "blockTypeId" TEXT NOT NULL,
    "typeVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "title" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_block_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseVersionId" TEXT NOT NULL,
    "blockInstanceId" TEXT NOT NULL,
    "blockTypeId" TEXT NOT NULL,
    "typeVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "status" "RunStatus" NOT NULL DEFAULT 'CREATED',
    "closeReason" "RunCloseReason",
    "failureDetails" TEXT,
    "startedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ab_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_attempts" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "submittedResponse" JSONB NOT NULL,
    "assisted" BOOLEAN NOT NULL DEFAULT false,
    "supportContext" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ab_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_results" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT,
    "runId" TEXT NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'EVALUATED',
    "isCorrect" BOOLEAN,
    "score" DOUBLE PRECISION,
    "feedback" JSONB,
    "evaluatorId" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_events" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "idempotencyKey" TEXT,
    "serverTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ab_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "draft_block_instances_draftId_idx" ON "draft_block_instances"("draftId");

-- CreateIndex
CREATE INDEX "draft_block_instances_draftId_orderIndex_idx" ON "draft_block_instances"("draftId", "orderIndex");

-- CreateIndex
CREATE INDEX "ab_runs_userId_idx" ON "ab_runs"("userId");

-- CreateIndex
CREATE INDEX "ab_runs_courseVersionId_idx" ON "ab_runs"("courseVersionId");

-- CreateIndex
CREATE INDEX "ab_runs_courseVersionId_blockInstanceId_idx" ON "ab_runs"("courseVersionId", "blockInstanceId");

-- CreateIndex
CREATE INDEX "ab_attempts_runId_idx" ON "ab_attempts"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ab_attempts_runId_attemptNumber_key" ON "ab_attempts"("runId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ab_attempts_runId_idempotencyKey_key" ON "ab_attempts"("runId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_results_attemptId_key" ON "assessment_results"("attemptId");

-- CreateIndex
CREATE INDEX "assessment_results_runId_idx" ON "assessment_results"("runId");

-- CreateIndex
CREATE INDEX "ab_events_runId_idx" ON "ab_events"("runId");

-- CreateIndex
CREATE INDEX "ab_events_runId_serverTimestamp_idx" ON "ab_events"("runId", "serverTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ab_events_runId_idempotencyKey_key" ON "ab_events"("runId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "draft_block_instances" ADD CONSTRAINT "draft_block_instances_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "course_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_runs" ADD CONSTRAINT "ab_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_runs" ADD CONSTRAINT "ab_runs_courseVersionId_fkey" FOREIGN KEY ("courseVersionId") REFERENCES "course_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_attempts" ADD CONSTRAINT "ab_attempts_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ab_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ab_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ab_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ab_events" ADD CONSTRAINT "ab_events_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ab_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
