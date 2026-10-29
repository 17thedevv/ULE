-- AlterTable
ALTER TABLE "mcp_mutation_idempotencies" ADD COLUMN "ownerToken" TEXT,
ADD COLUMN "fenceToken" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "mcp_mutation_idempotencies_status_leaseExpiresAt_idx" ON "mcp_mutation_idempotencies"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "mcp_mutation_idempotencies_fenceToken_idx" ON "mcp_mutation_idempotencies"("fenceToken");
