-- CreateEnum
CREATE TYPE "ExamGradeRevisionEventType" AS ENUM ('INITIAL_EVALUATION', 'CORRECTION', 'APPEAL_RESOLUTION', 'UNANSWERED_DISPOSITION');

-- CreateEnum
CREATE TYPE "ExamAppealStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED_UPHELD', 'RESOLVED_CHANGED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "exam_grades" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "exam_item_grades" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "exam_human_grade_revisions" (
    "id" TEXT NOT NULL,
    "examItemGradeId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "eventType" "ExamGradeRevisionEventType" NOT NULL DEFAULT 'INITIAL_EVALUATION',
    "previousAwardedPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newAwardedPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criterionScores" JSONB,
    "comments" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_human_grade_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_grade_revisions" (
    "id" TEXT NOT NULL,
    "examGradeId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "eventType" "ExamGradeRevisionEventType" NOT NULL DEFAULT 'INITIAL_EVALUATION',
    "previousTotalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newTotalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previousPercentage" DOUBLE PRECISION,
    "newPercentage" DOUBLE PRECISION,
    "previousPassingStatus" BOOLEAN,
    "newPassingStatus" BOOLEAN,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_grade_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_grade_appeals" (
    "id" TEXT NOT NULL,
    "examAttemptId" TEXT NOT NULL,
    "examItemGradeId" TEXT,
    "learnerId" TEXT NOT NULL,
    "status" "ExamAppealStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "gradeRevisionAtSubmission" INTEGER NOT NULL DEFAULT 1,
    "reviewerId" TEXT,
    "reviewerNotes" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_grade_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_human_grade_revisions_examItemGradeId_revision_key" ON "exam_human_grade_revisions"("examItemGradeId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "exam_human_grade_revisions_examItemGradeId_idempotencyKey_key" ON "exam_human_grade_revisions"("examItemGradeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "exam_human_grade_revisions_examItemGradeId_idx" ON "exam_human_grade_revisions"("examItemGradeId");

-- CreateIndex
CREATE INDEX "exam_human_grade_revisions_actorId_idx" ON "exam_human_grade_revisions"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_grade_revisions_examGradeId_revision_key" ON "exam_grade_revisions"("examGradeId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "exam_grade_revisions_examGradeId_idempotencyKey_key" ON "exam_grade_revisions"("examGradeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "exam_grade_revisions_examGradeId_idx" ON "exam_grade_revisions"("examGradeId");

-- CreateIndex
CREATE INDEX "exam_grade_revisions_actorId_idx" ON "exam_grade_revisions"("actorId");

-- CreateIndex
CREATE INDEX "exam_grade_appeals_examAttemptId_idx" ON "exam_grade_appeals"("examAttemptId");

-- CreateIndex
CREATE INDEX "exam_grade_appeals_examItemGradeId_idx" ON "exam_grade_appeals"("examItemGradeId");

-- CreateIndex
CREATE INDEX "exam_grade_appeals_learnerId_idx" ON "exam_grade_appeals"("learnerId");

-- CreateIndex
CREATE INDEX "exam_grade_appeals_status_idx" ON "exam_grade_appeals"("status");

-- AddForeignKey
ALTER TABLE "exam_human_grade_revisions" ADD CONSTRAINT "exam_human_grade_revisions_examItemGradeId_fkey" FOREIGN KEY ("examItemGradeId") REFERENCES "exam_item_grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_grade_revisions" ADD CONSTRAINT "exam_grade_revisions_examGradeId_fkey" FOREIGN KEY ("examGradeId") REFERENCES "exam_grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_grade_appeals" ADD CONSTRAINT "exam_grade_appeals_examAttemptId_fkey" FOREIGN KEY ("examAttemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_grade_appeals" ADD CONSTRAINT "exam_grade_appeals_examItemGradeId_fkey" FOREIGN KEY ("examItemGradeId") REFERENCES "exam_item_grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_grade_appeals" ADD CONSTRAINT "exam_grade_appeals_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_grade_appeals" ADD CONSTRAINT "exam_grade_appeals_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
