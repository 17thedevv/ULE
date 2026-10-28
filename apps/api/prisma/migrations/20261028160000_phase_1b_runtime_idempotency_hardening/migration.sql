-- AlterTable
ALTER TABLE "ab_runs" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ab_runs_idempotencyKey_key" ON "ab_runs"("idempotencyKey");
