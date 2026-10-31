-- AlterTable
ALTER TABLE "assessment_versions" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "assessment_versions_assessmentDefinitionId_idempotencyKey_key" ON "assessment_versions"("assessmentDefinitionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "assessment_versions_idempotencyKey_idx" ON "assessment_versions"("idempotencyKey");
