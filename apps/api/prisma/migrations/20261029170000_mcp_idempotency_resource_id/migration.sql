-- AlterTable
ALTER TABLE "mcp_mutation_idempotencies" ADD COLUMN "resourceId" TEXT;

-- CreateIndex
CREATE INDEX "mcp_mutation_idempotencies_resourceId_idx" ON "mcp_mutation_idempotencies"("resourceId");
