-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'CLOZE', 'SHORT_TEXT', 'NUMERIC', 'ESSAY', 'MATCHING', 'ORDERING');

-- CreateEnum
CREATE TYPE "ExamFeedbackPolicy" AS ENUM ('IMMEDIATE', 'ON_SUBMISSION', 'DEFERRED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "mcp_mutation_idempotencies" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "question_bank_items" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "courseId" TEXT,
    "type" "QuestionType" NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "answerKey" JSONB,
    "rubric" JSONB,
    "config" JSONB,
    "defaultPoints" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "skillCode" TEXT,
    "difficulty" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publishedVersionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_bank_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_versions" (
    "id" TEXT NOT NULL,
    "questionBankItemId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "answerKey" JSONB,
    "rubric" JSONB,
    "config" JSONB,
    "defaultPoints" DOUBLE PRECISION NOT NULL,
    "skillCode" TEXT,
    "sourceRevision" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_definitions" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "durationMinutes" INTEGER,
    "passingScore" DOUBLE PRECISION,
    "maxAttempts" INTEGER,
    "feedbackPolicy" "ExamFeedbackPolicy" NOT NULL DEFAULT 'ON_SUBMISSION',
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "publishedVersionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_sections" (
    "id" TEXT NOT NULL,
    "assessmentDefinitionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_item_refs" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "questionBankItemId" TEXT NOT NULL,
    "pinnedQuestionVersionId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_item_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_versions" (
    "id" TEXT NOT NULL,
    "assessmentDefinitionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "durationMinutes" INTEGER,
    "passingScore" DOUBLE PRECISION,
    "maxAttempts" INTEGER,
    "feedbackPolicy" "ExamFeedbackPolicy" NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "draftRevision" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_version_items" (
    "id" TEXT NOT NULL,
    "assessmentVersionId" TEXT NOT NULL,
    "questionVersionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "assessment_version_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_bank_items_ownerId_idx" ON "question_bank_items"("ownerId");

-- CreateIndex
CREATE INDEX "question_bank_items_courseId_idx" ON "question_bank_items"("courseId");

-- CreateIndex
CREATE INDEX "question_bank_items_type_idx" ON "question_bank_items"("type");

-- CreateIndex
CREATE INDEX "question_versions_questionBankItemId_idx" ON "question_versions"("questionBankItemId");

-- CreateIndex
CREATE INDEX "question_versions_createdById_idx" ON "question_versions"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "question_versions_questionBankItemId_versionNumber_key" ON "question_versions"("questionBankItemId", "versionNumber");

-- CreateIndex
CREATE INDEX "assessment_definitions_ownerId_idx" ON "assessment_definitions"("ownerId");

-- CreateIndex
CREATE INDEX "assessment_definitions_courseId_idx" ON "assessment_definitions"("courseId");

-- CreateIndex
CREATE INDEX "assessment_sections_assessmentDefinitionId_idx" ON "assessment_sections"("assessmentDefinitionId");

-- CreateIndex
CREATE INDEX "assessment_sections_assessmentDefinitionId_orderIndex_idx" ON "assessment_sections"("assessmentDefinitionId", "orderIndex");

-- CreateIndex
CREATE INDEX "assessment_item_refs_sectionId_idx" ON "assessment_item_refs"("sectionId");

-- CreateIndex
CREATE INDEX "assessment_item_refs_sectionId_orderIndex_idx" ON "assessment_item_refs"("sectionId", "orderIndex");

-- CreateIndex
CREATE INDEX "assessment_item_refs_questionBankItemId_idx" ON "assessment_item_refs"("questionBankItemId");

-- CreateIndex
CREATE INDEX "assessment_versions_assessmentDefinitionId_idx" ON "assessment_versions"("assessmentDefinitionId");

-- CreateIndex
CREATE INDEX "assessment_versions_createdById_idx" ON "assessment_versions"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_versions_assessmentDefinitionId_versionNumber_key" ON "assessment_versions"("assessmentDefinitionId", "versionNumber");

-- CreateIndex
CREATE INDEX "assessment_version_items_assessmentVersionId_idx" ON "assessment_version_items"("assessmentVersionId");

-- CreateIndex
CREATE INDEX "assessment_version_items_questionVersionId_idx" ON "assessment_version_items"("questionVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_version_items_assessmentVersionId_questionVersio_key" ON "assessment_version_items"("assessmentVersionId", "questionVersionId", "orderIndex");

-- AddForeignKey
ALTER TABLE "question_bank_items" ADD CONSTRAINT "question_bank_items_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank_items" ADD CONSTRAINT "question_bank_items_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_questionBankItemId_fkey" FOREIGN KEY ("questionBankItemId") REFERENCES "question_bank_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_definitions" ADD CONSTRAINT "assessment_definitions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_definitions" ADD CONSTRAINT "assessment_definitions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_sections" ADD CONSTRAINT "assessment_sections_assessmentDefinitionId_fkey" FOREIGN KEY ("assessmentDefinitionId") REFERENCES "assessment_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_item_refs" ADD CONSTRAINT "assessment_item_refs_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "assessment_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_item_refs" ADD CONSTRAINT "assessment_item_refs_questionBankItemId_fkey" FOREIGN KEY ("questionBankItemId") REFERENCES "question_bank_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_item_refs" ADD CONSTRAINT "assessment_item_refs_pinnedQuestionVersionId_fkey" FOREIGN KEY ("pinnedQuestionVersionId") REFERENCES "question_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_assessmentDefinitionId_fkey" FOREIGN KEY ("assessmentDefinitionId") REFERENCES "assessment_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_versions" ADD CONSTRAINT "assessment_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_version_items" ADD CONSTRAINT "assessment_version_items_assessmentVersionId_fkey" FOREIGN KEY ("assessmentVersionId") REFERENCES "assessment_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_version_items" ADD CONSTRAINT "assessment_version_items_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "mcp_mutation_idempotencies_userId_clientId_toolName_idempotency" RENAME TO "mcp_mutation_idempotencies_userId_clientId_toolName_idempot_key";

-- RenameIndex
ALTER INDEX "quest_fact_consumptions_questInstanceId_objectiveProgressId_fac" RENAME TO "quest_fact_consumptions_questInstanceId_objectiveProgressId_key";
