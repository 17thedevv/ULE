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


## ADR-009: Activity Block Protocol (ABP v0.2), Concurrency Hardening & Trusted Minimal Runtime

- **Status**: Accepted (Phase 1B Final Integrity Hardened & Verified)
- **Context**: ULE requires a modular, extensible Activity Block Protocol (ABP) to support diverse learning experiences (videos, quizzes, exercises) while enforcing strict trust boundaries, version pinning, server-side deterministic assessment, and learning science invariants. Direct source review identified four integrity gates requiring hardening: atomic draft block mutations, consistent CourseVersion snapshots, runtime concurrency/idempotency, and trusted support provenance.
- **Decision**: Establish an in-process, modular ABP vertical slice across `packages/contracts`, NestJS `AbpModule`, and PostgreSQL persistence:
  1. **Course Authoring Aggregate Lock & Atomic Concurrency**:
     - Concurrency strategy: Adopt a single, uniform lock acquisition order across the entire authoring aggregate: `SELECT id, owner_id FROM courses WHERE id = $1 FOR UPDATE` is executed first in all draft metadata updates, draft block mutations (`add`, `update`, `delete`, `reorder`), and version creation transactions.
     - Eliminates deadlocks and guarantees snapshot consistency: version creation snapshots cannot interleave with metadata or block mutations.
     - Mandatory `expectedRevision`: Required on all draft block mutations (`addDraftBlock`, `updateDraftBlock`, `deleteDraftBlock`, `reorderDraftBlocks`). Revisions are checked and incremented atomically inside the locked transaction; stale revisions return HTTP 409 Conflict. Duplicate block IDs in reordering are rejected with HTTP 400 Bad Request.
  2. **Technical Contract Separation**:
     - `ABType`: Developer-defined manifest, schema, capabilities, and optional evaluator. Creator configuration cannot weaken or remove structural requirements.
     - `DraftBlockInstance`: Creator-configured instance inside an owned CourseDraft. Participates in draft revision tracking and optimistic concurrency.
     - `CourseVersion Snapshot`: CourseVersion creation atomically validates all draft blocks against the registry and freezes an immutable snapshot (`snapshot.blocks`). Subsequent mutable draft edits cannot alter older versions.
     - `ABRun`: Pinned execution context bound to an immutable CourseVersion snapshot and block instance. Lifecycle: `CREATED → ACTIVE ↔ SUSPENDED → CLOSED` (`COMPLETED`, `ABANDONED`, `FAILED`).
     - `ABAttempt`: Submitted learner response with attempt provenance and assistance tracking.
     - `AssessmentResult`: Authoritative server-side evaluation result. Client-supplied scores, passes, or mastery have zero authority.
     - `ABEvent`: Audit trail of accepted runtime facts and server timestamps.
  3. **Runtime Idempotency, Atomicity & Command Surface**:
     - Mandatory `idempotencyKey` on all state-changing runtime operations (`startRun`, `executeCommand`). Missing keys return HTTP 400 Bad Request.
     - Concurrent `startRun` deduplication backed by `ab_runs.idempotencyKey` unique index and PostgreSQL unique constraint violation mapping: concurrent identical requests yield the same run ID without duplicate database rows; mismatched payloads yield HTTP 409 Conflict.
     - Runtime host commands execute under row-level lock on `ab_runs` (`SELECT id, user_id, status FROM ab_runs WHERE id = $1 FOR UPDATE`). Atomic state transitions prevent invalid lifecycle jumps. Racing submissions receive strictly monotonic, sequential attempt numbers (`1`, `2`...) without collisions.
     - Public command surface restriction: `FAIL` is reserved exclusively for trusted runtime authority and cannot be issued as a client command (returns HTTP 400 Bad Request).
      - Reliable request identity mechanism: Replaying a command with the same idempotency key and identical normalized payload executes idempotently without duplicate side effects, returning the original appropriate result (for submissions, returning the exact attempt created by that idempotency key rather than later attempts). Reusing the same key with a different command or payload yields HTTP 409 Conflict without leaking internal implementation details.
  4. **Learning Science Invariants & Trusted Support Provenance**:
     - **Video Completion vs. Assessment**: Video activities are renderable and completable, but strictly non-evaluatable (`evaluatable: false`). Completing a video run transitions its status to `CLOSED` (`closeReason: 'COMPLETED'`) and emits an authoritative `RUN_COMPLETED` event marked `{ ungraded: true }`. In accordance with the ABP contract for non-evaluatable learning content, zero `AssessmentResult` records are created, guaranteeing that content completion is never conflated with an evaluated assessment, pass, score, or mastery.
      - **Hint Exposure & Assistance Provenance Model**: Initial learner-facing block configuration strictly strips `hintText` to prevent premature disclosure. Authorized hints are delivered only after the server accepts `REQUEST_HINT` and records `HINT_DELIVERED` in the authoritative audit trail, populated in `deliveredHint` on the run response. Replaying `REQUEST_HINT` returns the authorized hint idempotently without duplicate events. Do not treat client-supplied `usedHint: false` as proof of independent work. When a hint was delivered by the server, `assisted: true` and `provenance: 'SERVER_OBSERVED'` are enforced authoritatively regardless of client claims. When no server assistance occurred, client claims are tracked as `'SELF_REPORTED_INDEPENDENT'` or `'SELF_REPORTED_ASSISTED'`, never mislabeled as proctored independent evidence.
      - **Deferred Feedback Visibility & Release Gate**: Under the `DEFERRED` feedback policy, evaluation results (`isCorrect`, `score`, and explanations) are redacted from all learner-facing surfaces (`latestAssessment` in all Run DTOs, `GET /runs/:id/results`, and learner-facing event payloads) unless the run is `CLOSED` with `closeReason === 'COMPLETED'`. Active (`ACTIVE`), suspended (`SUSPENDED`), abandoned (`ABANDONED`), or failed (`FAILED`) runs never disclose deferred evaluation results to the learner, returning `{ deferred: true }` with nullified correctness and scores. Reading an abandoned run later via `GET /runs/:id` or `GET /runs/:id/results` continues to withhold deferred feedback. Trusted internal evaluation records in PostgreSQL remain complete and intact throughout. Deferred feedback is authoritatively released to the learner only when the run transitions to `CLOSED` via `FINISH` (`closeReason === 'COMPLETED'`).
  5. **Block Type Versioning Policy**:
     - Registry resolves block types by tuple `(typeId, typeVersion)`. Mismatched or unsupported versions are rejected explicitly with HTTP 400 Bad Request.
     - Historical execution compatibility: Existing CourseVersion snapshots execute against their declared pinned type versions (verified with historical definition `video@0.9.0`).
- **Consequences**: Proven, concurrency-hardened ABP vertical slice without distributed message queues or premature microservices. Real PostgreSQL verification in `test/abp-runtime.integration.spec.ts` (26 tests) and `test/abp-concurrency-and-integrity.integration.spec.ts` (14 tests) covers type discovery, draft validation, version snapshot pinning, secret stripping, lifecycle transitions, sequential and concurrent idempotency, assistance provenance, and cross-user isolation.


## ADR-010: Model Context Protocol (MCP) Authoring MVP, OAuth 2.1 & Secure ABP Runtime Integration

- **Status**: Accepted (Phase 2 Verified)
- **Context**: External AI coding and authoring assistants (e.g. Claude Desktop, Cursor, external autonomous agents) need to configure private ULE courses and activity blocks without running ULE-paid model inferences, without bypassing backend domain authority, and without exposing learner progress or evaluator secrets.
- **Decision**: Implement a secure, streamable Model Context Protocol (MCP) authoring subsystem within the existing NestJS modular monolith:
  1. **Transport & Protocol Negotiation**:
     - Standard endpoint: `/api/v1/mcp` using `@modelcontextprotocol/server` (`createMcpHandler`) over Web Standard Streamable HTTP.
     - RFC 9728 Protected Resource discovery at `/.well-known/oauth-protected-resource` and `/api/v1/mcp/.well-known/oauth-protected-resource`.
     - DNS rebinding and cross-site hijacking protection: Host header validation and Origin validation against configured trusted hosts and CORS origins.
     - Multi-session concurrency: Request-level handler factory ensures each client connection operates on an isolated `McpServer` instance without "Server already initialized" collisions.
  2. **Identity, Real OAuth 2.1 & Token Authority (Gate 1)**:
     - Integration with Better Auth (`@better-auth/mcp`, `@better-auth/oauth-provider`, `@better-auth/cimd`, `jwt`) with EdDSA JWT verification via server JWKS (`jose.jwtVerify`).
     - Real OAuth 2.1 authorization code flow with PKCE (`S256`), dynamic client registration, and explicit user consent.
     - Functional browser routes for authentication and consent:
       - `GET /auth/login`: Functional HTML login form posting credentials to `/api/v1/auth/sign-in/email`.
       - `GET /auth/consent`: Functional HTML OAuth consent page displaying requested scopes and providing Authorize / Deny actions.
     - Authoritative token validation: Tokens must possess a verified EdDSA signature, valid unexpired lifetime, correct audience and issuer, and an active issuance record in PostgreSQL `oauth_access_tokens` as well as an active user consent grant in `oauth_consents`.
     - Immediate revocation: Revoking tokens in `oauth_access_tokens` or revoking consent in `oauth_consents` causes subsequent tool invocations to fail closed with HTTP 401 Unauthorized.
     - Minimal fine-grained permission scopes:
       - `course:read`: Authoring capability discovery, block type listing, schema inspection, reading owned courses/drafts/blocks/versions, and draft validation.
       - `course:write`: Private course creation, draft block addition, updating, deletion, reordering, draft metadata updating, and immutable version allocation.
     - Security gates: Anonymous callers fail closed (HTTP 401 with RFC 9728 `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="..."`). Expired, revoked, wrong-audience (`aud`), or forged tokens are rejected authoritatively.
     - Leak-proof principal propagation: `AsyncLocalStorage<McpAuthContext>` propagates verified `{ userId, clientId, scopes }` into tool execution callbacks without cross-request state leakage.
  3. **Authoritative Domain Reuse (Adapter Pattern)**:
     - MCP tools do not perform direct, unguarded database writes. Every tool validates inputs via Zod and calls existing domain services (`CoursesService`, `DraftBlocksService`, `BlockTypeRegistry`).
     - Ownership invariants: Course creation strictly derives `ownerId` from authenticated MCP token claims and always creates `visibility: PRIVATE`.
     - Optimistic concurrency: Mandatory `expectedRevision` on all draft block mutations (`ule_add_draft_block`, `ule_update_draft_block`, `ule_delete_draft_block`, `ule_reorder_draft_blocks`) and draft metadata updates (`ule_update_course_draft`), enforced under course row locks.
  4. **Durable Mutation Idempotency & Audit Trail (Gates 2 & 4)**:
     - Mandatory `idempotencyKey` on all 7 mutation tools.
     - `mcp_mutation_idempotency` table: Unique constraint on `[userId, clientId, toolName, idempotencyKey]`.
     - Reservation-based concurrency: Atomically inserts an `IN_PROGRESS` row prior to execution to lock concurrent duplicate calls. Winner runs mutation and marks `COMPLETED`; concurrent calls wait and receive cached result. Exactly one Course or CourseVersion is created even under simultaneous parallel requests.
     - Deterministic deduplication: Replaying mutations with identical payload hashes returns cached results without duplicate database side-effects. Reusing idempotency keys with changed payloads yields explicit HTTP 409 Conflict.
     - `mcp_audit_logs` table: Audits every tool execution with `userId`, `clientId`, `toolName`, `action: 'EXECUTE'`, `resourceType`, `resourceId`, `idempotencyKey`, `status` (`SUCCESS`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `ERROR`), and `durationMs`. Raw secrets and Bearer tokens are excluded. Internal errors return sanitized `[Error 500]` without leaking Prisma/SQL traces.
  5. **Least-Privilege Authoring Data Exposure (Gate 3)**:
     - Discovery schemas and learner-facing endpoints never expose answer keys or evaluator rubrics.
     - Callers holding only `course:read` tokens receive sanitized block configurations across `ule_get_course_draft`, `ule_list_draft_blocks`, and `ule_get_course_version` (MultipleChoice `answerKey` and `explanation` are omitted).
     - Full configurations with `answerKey` are restricted to authorized creators holding `course:write` scope.
     - Prohibitions enforced in registry: Exactly 17 authoring tools are exposed. Tools for learner attempt submission (`submit_learner_attempt`), test runs (`create_test_run`), mastery alteration (`alter_mastery`), reward grants (`grant_xp_or_rewards`), or public course publication (`publish_course_publicly`) are strictly omitted.
   6. **Transactional Correctness, Fencing Tokens & Durable Audit (Phase 2 Integrity Hardened)**:
      - **Shared Transactional Boundary (Zero Unaudited Committed Mutations)**: Domain mutation, idempotency completion (`status: 'COMPLETED'`), and mandatory audit log (`mcp_audit_logs`) commit within a single PostgreSQL transaction (`prisma.$transaction`). Domain services (`CoursesService`, `DraftBlocksService`) accept an optional `txClient?: Prisma.TransactionClient` to participate in caller-managed atomic boundaries. If audit persistence fails prior to transaction commit, the entire transaction rolls back, guaranteeing zero unaudited committed domain mutations in PostgreSQL. Read-only inspection queries continue using best-effort auditing.
      - **Never Infer Mutation Success from Resource Existence**: `recoverCommittedMutation()` strictly returns `null` for `UPDATE_COURSE_DRAFT`, `UPDATE_DRAFT_BLOCK`, `DELETE_DRAFT_BLOCK`, and `REORDER_DRAFT_BLOCKS`. Finding an existing aggregate or block in PostgreSQL does not prove a specific update or deletion succeeded. Genuine domain errors, such as stale `expectedRevision` (HTTP 409 Conflict), are preserved and never falsely marked as successful recoveries. Pre-allocated ID recovery is reserved strictly for `CREATE_COURSE` and `ADD_DRAFT_BLOCK` where immutable resource IDs guarantee identity.
      - **Active Worker Lease & Monotonic Fencing Tokens**: Replace naive fixed timeouts with an active worker protection lease (`LEASE_DURATION_MS = 30000`) and monotonic fencing tokens (`fenceToken Int @default(1)`) combined with unique owner tokens (`ownerToken String?`). A worker that takes longer than expected cannot be overwritten by split-brain collisions; if a lease expires, competing retries use atomic conditional state transitions (`updateMany` with `fenceToken: currentFence, leaseExpiresAt: { lte: now }` and `fenceToken: { increment: 1 }`), ensuring exactly one winner acquires the lease. Stale workers attempting to complete after preemption fail with HTTP 409 Conflict.
      - **Browser OAuth Consent Correctness & DOM XSS Hardening**: `/auth/login` and `/auth/consent` preserve full authorization context and PKCE parameters. `/auth/consent` renders requesting client information and authorized scopes using strict DOM APIs and `textContent` (never untrusted `innerHTML`), completely eliminating DOM XSS vulnerabilities. Unknown or malformed scope query parameters are safely rejected, displaying a safe text warning and disabling the Authorize action to ensure invalid scope requests cannot obtain elevated OAuth grants.
      - **External Client Compatibility**: Desktop GUI clients (Claude Desktop / Cursor) are not installed on headless CI/server environments. Protocol-level external client compatibility is proven via real HTTP/SSE integration tests as well as an official `@modelcontextprotocol/sdk/client` TypeScript SDK (`Client` + `StreamableHTTPClientTransport`) headless smoke test over live HTTP/SSE.
- **Consequences**: Proven external AI authoring integration that preserves all Phase 1A/1B concurrency guarantees without introducing external LLM costs. Verified via real PostgreSQL automated tests: `test/mcp-auth.integration.spec.ts` (27 tests covering discovery, real OAuth 2.1 code flow, PKCE, browser DOM automation, denial/acceptance, revocation, scope gates, and DOM XSS regression prevention) and `test/mcp-authoring.integration.spec.ts` (49 tests covering the 13-step scenario, shared transaction rollback on audit failure, exactly-once authoritative mutation audit, fencing lease takeover, non-inference of mutation success, concurrent idempotency, least-privilege answer key protection, and official MCP SDK client smoke test).
