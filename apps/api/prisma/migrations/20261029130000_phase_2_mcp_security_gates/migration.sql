-- AlterTable: McpAuditLog userId becomes nullable, add status index
ALTER TABLE "mcp_audit_logs" ALTER COLUMN "userId" DROP NOT NULL;
CREATE INDEX "mcp_audit_logs_status_idx" ON "mcp_audit_logs"("status");

-- AlterTable: McpMutationIdempotency add clientId, status, updatedAt, nullable response
ALTER TABLE "mcp_mutation_idempotencies" ADD COLUMN "clientId" TEXT NOT NULL DEFAULT 'unknown_client';
ALTER TABLE "mcp_mutation_idempotencies" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE "mcp_mutation_idempotencies" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "mcp_mutation_idempotencies" ALTER COLUMN "response" DROP NOT NULL;

-- Update unique constraint on mcp_mutation_idempotencies to include clientId
DROP INDEX "mcp_mutation_idempotencies_userId_toolName_idempotencyKey_key";
CREATE UNIQUE INDEX "mcp_mutation_idempotencies_userId_clientId_toolName_idempotencyKey_key" ON "mcp_mutation_idempotencies"("userId", "clientId", "toolName", "idempotencyKey");
CREATE INDEX "mcp_mutation_idempotencies_clientId_idx" ON "mcp_mutation_idempotencies"("clientId");
