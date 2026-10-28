---
name: ule-prisma-postgres
description: Use when designing PostgreSQL schemas, editing Prisma models, creating migrations, handling JSONB configuration, transactions, ownership, versioning, or persistence bugs in ULE.
---

# ULE PostgreSQL and Prisma

## Workflow
1. Inspect the existing Prisma version, schema, migrations, datasource configuration, and repository conventions.
2. Use the stable Prisma version already selected by the project; verify version-specific commands against official docs.
3. Model ownership, lifecycle, and important relationships relationally. Use JSONB only for genuinely flexible, versioned configuration such as Activity Block configuration—not as a substitute for the entire relational model.
4. Treat persisted untrusted configuration as untrusted: validate it against the correct versioned schema before use.
5. Create migrations with the repository's migration workflow. Never silently edit an already-applied migration; create a new migration for a change.
6. Use transactions for multi-step state changes that must succeed or fail together.
7. Consider uniqueness/idempotency, foreign keys, deletion behavior, concurrency, and owner-scoped access for meaningful mutations.
8. Never put database credentials in source control. Use environment variables and update `.env.example` with placeholders only.
9. Test migrations and important transaction behavior against a real disposable/local PostgreSQL instance when possible.

## ULE-specific cautions
- Published course versions and versioned block definitions may need immutability guarantees; do not casually mutate historical versions.
- Do not infer learner mastery from raw database fields in a frontend.
- Do not let MCP bypass service-level authorization by writing directly to repositories.
- Do not design the full domain schema during bootstrap; create only the minimal schema required by the current task.

## Completion
Report schema changes, migration commands, database prerequisites, tests performed, and any unresolved migration risks.
