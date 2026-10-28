-- CreateTable
CREATE TABLE "provisional_migration_probes" (
    "id" TEXT NOT NULL,
    "probedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "probeNote" TEXT NOT NULL DEFAULT 'Phase 0 bootstrap migration validation probe',

    CONSTRAINT "provisional_migration_probes_pkey" PRIMARY KEY ("id")
);
