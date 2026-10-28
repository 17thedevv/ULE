# Architecture Decision Records (ADRs)

## ADR-001: Monorepo Foundation with pnpm

- **Status**: Accepted
- **Context**: ULE requires coordinated development between the frontend, backend, and shared contract types while maintaining strict deployment decoupling.
- **Decision**: Adopt pnpm workspaces with dedicated directories:
  - `apps/web`: React + Vite client.
  - `apps/api`: NestJS server.
  - `packages/contracts`: Minimal shared API contract types.
- **Consequences**: Fast installations via hard-linking, explicit workspace boundaries (`workspace:*`), and reproducible CI executions.

## ADR-002: Backend Framework Selection — NestJS (Express Adapter)

- **Status**: Accepted
- **Context**: Need a structured, enterprise-ready, modular TypeScript framework with native dependency injection, OpenAPI tooling, and robust testing utilities.
- **Decision**: NestJS v11 using the default Express HTTP adapter.
- **Consequences**: Standardized controller-service-repository patterns, declarative request validation via `class-validator`, and seamless integration with OpenAPI Swagger generation.

## ADR-003: Frontend Application Selection — React + Vite

- **Status**: Accepted
- **Context**: The web application requires high developer velocity, lightweight bundling, independent deployment capabilities, and clear separation from the backend server.
- **Decision**: React 18 + Vite SPA with TypeScript. Next.js was explicitly evaluated and rejected to maintain complete separation between the frontend presentation tier and the authoritative NestJS API.
- **Consequences**: Fast HMR during development, static asset builds for edge distribution, and zero direct database exposure.

## ADR-004: Relational Persistence — PostgreSQL + Prisma ORM (v7)

- **Status**: Accepted
- **Context**: Complex learning engine domains (courses, activity versions, learner progress) demand strong ACID guarantees, relational integrity, and schema-driven type safety.
- **Decision**: PostgreSQL managed through Prisma ORM v7 with `@prisma/adapter-pg` native driver adapter. Local development uses Docker Compose (`postgres:16-alpine`).
- **Consequences**: Declarative migrations via `prisma.config.ts`, JS-native database driver adapter architecture without legacy Rust query engine overhead, generated type-safe database clients, and structured health-check readiness probes.

## ADR-005: Canonical REST Contract with OpenAPI

- **Status**: Accepted
- **Context**: The API must support the React web client today, native mobile clients in future phases, and external automation/MCP tools.
- **Decision**: Versioned REST API under `/api/v1` documented with OpenAPI 3.0 via `@nestjs/swagger` at `/docs`.
- **Consequences**: Strict DTOs for inputs and responses, predictable error envelopes (`ApiErrorResponse`), and automatic client SDK generation readiness without custom protocol bloat.

## ADR-006: Modular Monolith vs. Microservices

- **Status**: Accepted
- **Context**: Premature distributed architectures introduce network partitions, distributed transactions, and operational complexity.
- **Decision**: All domain modules reside within a single NestJS backend application. No microservices, Kafka, Redis, or Kubernetes in Phase 0.
- **Consequences**: Direct in-process communication, simplified testing and deployment, with clear internal module boundaries that can be extracted later if necessary.

## ADR-007: Authoritative Authentication via Better Auth

- **Status**: Accepted (Runtime Integration & Session Lifecycle Verified in Phase 1A)
- **Context**: ULE requires secure identity, session management across separate frontend/backend origins, and seamless integration with PostgreSQL and the Express adapter.
- **Decision**: Adopt Better Auth (`better-auth@1.7.14`) sharing the NestJS singleton `PrismaService` via `better-auth/adapters/prisma` and mounted under `/api/v1/auth/*` via `toNodeHandler`. Support both HTTP-only session cookies and `Authorization: Bearer <token>` (via `bearer` plugin). Remove hardcoded fallback secrets: mandate strong secrets (`BETTER_AUTH_SECRET` >= 32 characters) validated at application startup with credential redaction in configuration logs and errors.
- **Consequences**: Server-side session verification in `AuthGuard`, no client-supplied `ownerId` trust, strict CORS origin matching without wildcards. Real Better Auth registration, sign-in, session cookie reuse, `/api/v1/me`, sign-out, session invalidation, and two-user isolation verified via real HTTP tests against PostgreSQL in `test/auth-and-concurrency.integration.spec.ts` (distinguished from mocked controller tests in `test/course-core.e2e.spec.ts`). External MCP OAuth client flows remain explicitly unverified pending future MCP spikes.

## ADR-008: Course Core Relational Model, Atomic Optimistic Locking & Concurrency-Safe Versioning

- **Status**: Accepted (Phase 1A Hardened)
- **Context**: Course authoring requires clear relational separation between stable course identity, editable working drafts, and immutable historical snapshots, with strict protection against concurrent edit collisions and duplicate version allocation.
- **Decision**: Model three distinct relational entities using UUID v4 identifiers (RFC 4122 generated via Prisma `@default(uuid())`):
  - `Course`: Stable aggregate root, authoritative `ownerId` (FK to `users`), `visibility: PRIVATE` by default.
  - `CourseDraft`: 1-to-1 editable state per course with mandatory `expectedRevision`. Draft updates use atomic conditional updates in PostgreSQL (`updateMany` on `courseId` and `revision: expectedRevision` with atomic `revision: { increment: 1 }`), returning HTTP 409 Conflict on stale revisions.
  - `CourseVersion`: Immutable historical snapshot created atomically in a transaction. Employs PostgreSQL row-level locking on the parent course row (`SELECT id FROM courses WHERE id = $1 FOR UPDATE`) to serialize snapshot requests per course, guaranteeing monotonic version numbering without races, duplicates, or exposed 500 errors, backed by database unique constraint `@@unique([courseId, versionNumber])` and graceful 409 Conflict mapping (`P2002`).
- **Consequences**: Strong isolation between authors (User A vs User B) with consistent 404 responses on private resources; zero client-facing ability to set `visibility: PUBLIC` or `status: PUBLISHED` without future editorial review workflows. Real concurrent draft edits and concurrent version allocations verified in `test/auth-and-concurrency.integration.spec.ts`.


## ADR-009: Activity Block Protocol (ABP v0.2), Developer-Owned Registry & Minimal Runtime

- **Status**: Accepted (Phase 1B Vertical Slice Verified)
- **Context**: ULE requires a modular, extensible Activity Block Protocol (ABP) to support diverse learning experiences (videos, quizzes, exercises) while enforcing strict trust boundaries, version pinning, server-side deterministic assessment, and learning science invariants.
- **Decision**: Establish an in-process, modular ABP vertical slice across `packages/contracts`, NestJS `AbpModule`, and PostgreSQL persistence:
  1. **Technical Contract Separation**:
     - `ABType`: Developer-defined manifest, schema, capabilities, and optional evaluator. Creator configuration cannot weaken or remove structural requirements.
     - `DraftBlockInstance`: Creator-configured instance inside an owned CourseDraft. Participates in draft revision tracking and optimistic concurrency.
     - `CourseVersion Snapshot`: CourseVersion creation atomically validates all draft blocks and freezes an immutable snapshot (`snapshot.blocks`). Subsequent mutable draft edits cannot alter older versions.
     - `ABRun`: Pinned execution context bound to an immutable CourseVersion snapshot and block instance. Lifecycle: `CREATED → ACTIVE ↔ SUSPENDED → CLOSED` (`COMPLETED`, `ABANDONED`, `FAILED`).
     - `ABAttempt`: Submitted learner response with attempt provenance and assistance tracking (`assisted: boolean`, `supportContext: { hintUsed, assistanceLevel }`).
     - `AssessmentResult`: Authoritative server-side evaluation result. Client-supplied scores, passes, or mastery have zero authority.
     - `ABEvent`: Audit trail of accepted runtime facts and server timestamps.
  2. **Initial Block Types**:
     - `video`: Renderable and completable. Strictly ungraded; completion never produces a score, pass, or mastery.
     - `multiple-choice`: Evaluatable and submittable. Evaluator secrets and answer keys are strictly stripped from learner-facing runtime payloads. Assesses responses on the server; distinguishes assisted vs. independent attempts.
     - `coding`: Demonstrates extensible contract validation. Runtime execution is marked unsupported (`runtimeExecutionSupported: false`) pending an isolated sandboxing capability.
  3. **Idempotency & Security**:
     - Repeated command executions or response submissions with the same `idempotencyKey` are deduplicated and do not produce duplicate attempts or events.
     - Cross-user access isolation: non-owners receive consistent HTTP 404 responses.
- **Consequences**: Proven ABP vertical slice without distributed message queues or premature microservices. Real PostgreSQL verification in `test/abp-runtime.integration.spec.ts` covers type discovery, draft validation, version snapshot pinning, secret stripping, lifecycle transitions, idempotency, assistance provenance, and cross-user isolation.
