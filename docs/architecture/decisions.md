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


## ADR-011: Phase 3 Trusted Learning Evidence, Idempotent Evidence Ledger & Minimal LII Foundation

- **Status**: Accepted (Phase 3 Verified)
- **Context**: Authentic learning requires transforming raw runtime attempts and evaluations into traceable, trustworthy evidence without conflating activity completion, quiz performance, and verified skill mastery. Direct learning science requirements mandate that video completion cannot generate evaluatable skill scores, multiple-choice correctness cannot automatically grant mastery, assistance provenance must be server-observed rather than client-trusted, and private CourseVersions require explicit owner-delegated access with active revocation.
- **Decision**: Implement a dedicated, conservative learning evidence and minimal LII subsystem within the NestJS modular monolith and PostgreSQL:
  1. **Minimal Private Learner Access Grant Lifecycle**:
     - Model: `CourseAccessGrant` binds a registered learner (`userId`) to a specific immutable `CourseVersion` (`courseVersionId`), issued explicitly by the course owner (`grantedBy`).
     - Course visibility remains strictly `PRIVATE`; courses are not public or discoverable.
     - Runtime authorization gate: `startRun()` requires caller to be either the course owner or hold an `ACTIVE` grant for the requested `courseVersionId`. Unauthorized starts return HTTP 404 (preventing existence leaks).
     - Explicit revocation policy: Revoking a grant immediately transitions its status to `REVOKED`, prevents starting new runs, and causes any subsequent runtime host commands on existing runs to fail closed with HTTP 403 Forbidden.
     - Cross-user isolation: Learners cannot access drafts, blocks, answer keys, or other learners' runs or evidence. Course owners cannot use learner endpoints to impersonate learners.
  2. **Course-Scoped Skill Identity & Versioned Snapshot Mappings**:
     - `CourseSkill`: Aggregate entity strictly scoped to its parent course (`courseId`, `skillCode`, `name`, `description`, `revision`). Unique constraint `[courseId, skillCode]` ensures skills are never conflated across courses; no cross-course mastery transfer.
     - `DraftSkillMapping`: Maps a draft block instance to a skill (`courseId`, `blockInstanceId`, `skillId`, `weight`, `mappingRevision`).
     - Atomic snapshotting: On `CourseVersion` creation under course row-lock, all active draft skills and mappings are validated and frozen immutably into `CourseVersion.snapshot` (`snapshot.skills`, `snapshot.skillMappings`). Existing course versions are never rewritten.
  3. **Trusted Evidence Intake & Idempotent Ledger**:
     - Dedicated `EvidenceIntakeService` ingests verified runtime facts directly from `RuntimeService`:
       - `SUBMIT_RESPONSE`: Ingests evaluated attempt evidence linked to `AssessmentResult`.
       - `FINISH`: Ingests completion progress evidence (`COMPLETION_ONLY`) for non-evaluatable content.
     - Normalized `LearningEvidence` schema captures: `userId`, `courseVersionId`, `skillId`, `skillRevision`, `blockInstanceId`, `blockTypeVersion`, `runId`, `attemptId`, `assessmentResultId`, `itemIdentity`, `classification`, `status`, `assistanceProvenance`, `deliveredHint`, `serverObservedHint`, `evidenceSchemaVersion`, and `rejectionReason`.
     - Database uniqueness enforcing idempotency: Unique constraints on `[runId, attemptId, skillId]` for attempt evidence and `[runId, blockInstanceId, classification]` for completion evidence. Retried commands or duplicate events never produce duplicate ledger entries.
     - Ledger integrity: Evidence rows form an append-only audit trail and are never edited as aggregate scores. Arbitrary evidence creation is strictly blocked from public REST and MCP endpoints.
  4. **Pedagogical Invariants, Quality Rules & Feedback Redaction**:
     - **Video / Ungraded Content**: Generates completion progress evidence (`COMPLETION_ONLY`) and updates course progress metrics. Strictly non-evaluatable; never creates graded skill evidence and never contributes to skill mastery.
     - **Assistance Provenance**: When the server delivered a hint (`REQUEST_HINT` -> `HINT_DELIVERED`), the ledger authoritatively records `serverObservedHint: true` and `assistanceProvenance: 'SERVER_OBSERVED'`, overriding client claims. Same-item repetitions retain explicit attempt relationships and are classified as repeated observations, not novel independent proof.
     - **Deferred Feedback Visibility Gate**: Under `DEFERRED` policy runs that are `ACTIVE` or `SUSPENDED`, learner-facing queries (`GET /api/v1/learner/courses/:versionId/evidence`) redact correctness and score (`deferred: true`). Unredacted details are released only after run completion (`CLOSED / COMPLETED`).
  5. **Evaluation Corrections & Auditable Replay**:
     - `AssessmentCorrection`: Records append-only correction history (`assessmentResultId`, `correctionRevision`, `previousScore`, `newScore`, `previousIsCorrect`, `newIsCorrect`, `reason`, `authorizedBy`, `appliedAt`).
     - Atomic correction execution: Updates `AssessmentResult`, transitions affected `LearningEvidence` (`EVALUATED` or `EXCLUDED`), and recalculates affected learner skill projections idempotently without deleting or rewriting historical records.
  6. **Minimal LII Skill State Projection & Action Proposal**:
     - Transparent, deterministic read model per `(userId, courseVersionId, skillId)`.
     - Three conservative states:
       - `INSUFFICIENT_EVIDENCE`: Less than 2 independent valid observations or only non-evaluatable content.
       - `DEVELOPING`: Active attempts, hint-assisted solves, repetitions, or uncorrected errors.
       - `READY_TO_VERIFY`: At least 2 distinct independent unassisted correct observations without active errors, and a verification block exists in the course version.
     - **Absolute Invariant**: `VERIFIED` mastery is NEVER declared in this slice under any circumstances. No single quiz score or activity completion equals verified mastery.
     - Explainable outputs: Plain-language rationale, explicit uncertainty, and missing evidence statements.
     - Minimal action proposals (`LiiActionProposalDto`): `CONTINUE` (with `isAvailable: false` when in `READY_TO_VERIFY` state pending formal verification capability), `SUPPORT`, or fallback.
     - Exclusion of black-box ML (BKT/DKT/CD-CAT), Redis, Kafka, or external AI orchestration.
  7. **Trusted Evidence Integrity Corrections & Final Hardening (PR #5 Review Findings)**:
     - **Confidentiality & Learner-Safe CourseVersion DTO**:
       - `GET /api/v1/learner/courses` returns dedicated `LearnerCourseVersionDto[]` with sanitized blocks; raw authoring `snapshot` is never returned to learners.
       - Reuses registered `sanitizeForLearner` methods from `BlockTypeRegistry` to strip `answerKey`, `correctOptionId`, protected explanations, and undisclosed hints. Video and Coding blocks are similarly sanitized. Course owners retain full authoring snapshot access via owner-only endpoints.
     - **Preserving Evidence Eligibility Across Assessment Corrections**:
       - Authoritative grading corrections (`POST /api/v1/evaluations/correct`) separate grading outcomes from educational evidence eligibility.
       - Ineligible evidence (`AMBIGUOUS_MULTI_SKILL_MAPPING_WITHOUT_CRITERION_EVALUATION`, `NO_SKILL_MAPPING_CONFIGURED`, `UNGRADED_CONTENT_COMPLETION_ONLY`) remains strictly `EXCLUDED` even when corrected to `newIsCorrect: true`.
       - Same-item repetitions (`SAME_ITEM_REPETITION`) remain classified as repetitions and cannot become novel independent observations.
       - Replaying or retrying corrections preserves append-only revision history without duplicating evidence rows or inflating projections.
     - **Gate 1 — Deferred Feedback Leak Prevention**:
       - Under `DEFERRED` runs that are not `CLOSED COMPLETED`, `GET /evidence` sanitizes `classification` to `PENDING_EVALUATION`, `status` to `PENDING_ASSESSMENT`, `assessmentStatus` to `PENDING`, and blanks `isCorrect`, `score`, `evaluatorId`, `evaluatorVersion`, `assessmentResultId`, and `exclusionReason`.
       - Learner skill projection calculation withholds unreleased deferred evidence, returning a safe explicitly pending projection (`state: 'INSUFFICIENT_EVIDENCE'`) with plain-language explanations without revealing correctness.
       - Abandoned runs never release deferred correctness through any endpoint.
       - Projections are reconciled authoritatively on `RuntimeService.executeCommand` when `FINISH` transitions the run to `CLOSED COMPLETED`.
     - **Gate 2 — Cross-Run Same-Item Repetition Detection**:
       - Stable assessment item identity pinned to CourseVersion: `(courseVersionId, blockInstanceId, itemKey)`.
       - Repetitions are detected across multiple runs belonging to the same learner and CourseVersion: repeated attempts of the same MCQ in separate runs are classified as `SAME_ITEM_REPETITION` and cannot produce multiple qualifying independent observations or cause `READY_TO_VERIFY`.
       - Projection engine tracks chronological distinct item identities (`seenItems = new Set<string>()`), ensuring duplicate item observations are strictly categorized as repetitions (`repeatedCount++`) and never increment `independentCount`, even under racing concurrent submissions or idempotent reprocessing.
     - **Gate 3 — Criterion-Level Skill Mapping Enforcement**:
       - Multiple Choice evaluator outputs aggregate scores without criterion-specific breakdown.
       - When an assessment item is mapped to multiple skills without criterion-specific evaluator output (`assessmentResult.feedback.criteriaResults`), all ambiguous mappings are excluded (`status: 'EXCLUDED'`, `classification: 'EXCLUDED'`, `exclusionReason: 'AMBIGUOUS_MULTI_SKILL_MAPPING_WITHOUT_CRITERION_EVALUATION'`) and grant zero independent skill credit. Single-item, single-skill Multiple Choice flow remains fully valid.
     - **Gate 4 — Honest Verification Capability Boundary**:
       - Title-based verification detection and arbitrary unvalidated creator config properties (`isVerification: true`) are eliminated.
       - In Phase 3, because no registered block type defines or validates a formal runtime verification contract, `READY_TO_VERIFY` projections return the honest minimal fallback: `category: 'CONTINUE'` with `isAvailable: false`.
       - Conservative `READY_TO_VERIFY` learner state is preserved without issuing premature `VERIFIED` mastery claims.
     - **P1 — Access Grant Revocation Concurrency Hardening**:
       - `RuntimeService.startRun` includes course version retrieval, grant verification, and run creation in a single atomic transaction synchronized with a row-level lock (`FOR SHARE`) on `course_access_grants`.
       - `RuntimeService.executeCommand` synchronizes grant validation under `FOR SHARE` on `course_access_grants`.
       - `AccessGrantsService.revokeGrant` executes under `FOR UPDATE` row lock on `course_access_grants`.
       - Racing grant revocations and run starts or attempt submissions are serialized strictly at the database tier; racing operations fail closed immediately (HTTP 404 or HTTP 403).
     - **P2 — Serialized Skill Projection via Advisory Transaction Locking**:
       - `LearnerSkillProjectionService.recomputeProjection` synchronizes calculations per `(userId, courseVersionId, skillId)` using PostgreSQL advisory transaction locks (`SELECT pg_advisory_xact_lock(hashtext(...))`).
       - Concurrent attempt submissions on distinct items mapped to the same skill are strictly serialized across database transactions, ensuring downstream projections compute on committed evidence without undercounting or overwriting each other with stale snapshots.
- **Consequences**: Complete Phase 3 vertical slice verified by 35 real PostgreSQL automated integration tests (`test/learning-evidence.integration.spec.ts`, 100% pass) and 183 total integration tests across the monorepo. Zero regressions across Phase 1A, Phase 1B, Phase 2, and Phase 3 suites.

## ADR-012: Course Quests, Economy Separation, Reward Ledger & Deterministic Journey MVP

- **Status**: Accepted (Phase 4 Foundation)
- **Context**: ULE requires a gamification and journey layer that increases learner motivation and agency without compromising learning science or pedagogical integrity. Quests must never conflate participation with verified skill mastery, event replays must be strictly idempotent, course economies must be completely isolated from platform economies, and journey recommendations must be explainable and deterministic rather than opaque or engagement-driven.
- **Decision**: Implement a modular, trusted Quest, Reward, and Journey subsystem within the NestJS backend and PostgreSQL:
  1. **CourseEnrollment Lifecycle & Authorization Distinction**:
     - Model: `CourseEnrollment` tracks learner participation context per immutable `CourseVersion` (`userId`, `courseVersionId`, `status: 'ACTIVE' | 'PAUSED' | 'COMPLETED'`).
     - Distinct authorization boundary: `CourseAccessGrant` remains the authoritative owner-issued access gate. Revoking a grant immediately suspends runtime execution and quest progression. Re-granting resumes the existing active enrollment.
     - Course quest instances are uniquely keyed by `(courseEnrollmentId, questKey, occurrence)`.
  2. **Qualified Fact Pipeline & Pedagogical Boundaries**:
     - Dedicated `QualificationService` maps authoritative ABP runtime events and evaluated evidence into normalized `QualifyingFact` projections.
     - Closed allowlist for MVP:
       - `ACTIVITY_COMPLETED`: Emitted when an evaluatable or non-evaluatable block run reaches `CLOSED` with `closeReason === 'COMPLETED'`. Satisfies participation-only quest objectives (`CompleteDistinctActivities`). Strictly excluded from skill mastery.
       - `INDEPENDENT_PRACTICE_CONFIRMED`: Emitted when an evaluatable attempt satisfies `isCorrect === true`, `assisted === false`, `supportProvenance === 'SERVER_OBSERVED'` (or verified unassisted), `isSameItemRepetition === false`, unambiguous skill mapping, and released feedback (`CLOSED COMPLETED` under `DEFERRED` policy).
     - Strict anti-leak rule: Unreleased `DEFERRED` feedback is withheld from qualification; abandoned or active deferred runs never qualify practice milestones.
     - Absolute invariant: Quest completion is never equivalent to verified skill mastery.
  3. **Dual-Ledger Economy Isolation & Append-Only Adjustments**:
     - Strict database and domain isolation between Course XP (`CourseRewardGrant` + `CourseRewardAdjustment`) and Platform XP (`PlatformRewardGrant` + `PlatformRewardAdjustment`).
     - Zero exchange rate, zero currency conversion, zero leakage. Platform rewards are governed exclusively by ULE-owned global quests.
     - Retroactive grading corrections (`AssessmentCorrection`) append compensating adjustments with audit lineages, never mutating historical grant rows.
  4. **Deterministic Journey Planner**:
     - Explicit learner goal capture with hard constraint filtering (prerequisites, availability, permissions).
     - Deterministic multi-factor ranking (goal fit > availability > continuity > effort preference).
     - Short-horizon DAG output with 4 edge kinds (`REQUIRED`, `OPTIONAL`, `CHOICE`, `FALLBACK`) and R0-R3 revision lifecycles.
     - Agency boundary: Journey provides user choices; it does not force runtime navigation or claim Course Flow authority.
  5. **Transaction Lock Hierarchy**:
     - Strict 5-tier lock hierarchy (`Grant FOR SHARE` -> `Run FOR UPDATE` -> `Advisory Lock` -> `Quest Instance FOR UPDATE (sorted ASC)` -> `Reward Append`) preventing deadlocks.
- **Consequences**: Proven, concurrency-safe gamification and learner agency vertical slice. Verified via real PostgreSQL tests across 5 staged pull requests (PR #6 to PR #10) meeting Gates G1-G7.


