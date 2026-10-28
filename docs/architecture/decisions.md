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

- **Status**: Accepted (Verified in Phase 1A)
- **Context**: ULE requires secure identity, session management across separate frontend/backend origins, and seamless integration with PostgreSQL and the Express adapter.
- **Decision**: Adopt Better Auth (`better-auth@1.7.14`) sharing the NestJS singleton `PrismaService` via `better-auth/adapters/prisma` and mounted under `/api/v1/auth/*` via `toNodeHandler`. Support both HTTP-only session cookies and `Authorization: Bearer <token>` (via `bearer` plugin).
- **Consequences**: Server-side session verification in `AuthGuard`, no client-supplied `ownerId` trust, strict CORS origin matching without wildcards. MCP OAuth client flows remain separate and unverified until external client integration in future phases.

## ADR-008: Course Core, Authoritative Ownership & Immutable Versioning

- **Status**: Accepted (Phase 1A)
- **Context**: Course authoring requires clear relational separation between stable course identity, editable working drafts, and immutable historical snapshots.
- **Decision**: Model three distinct relational entities:
  - `Course`: Stable aggregate root, authoritative `ownerId` (FK to `users`), `visibility: PRIVATE` by default.
  - `CourseDraft`: 1-to-1 editable state per course, with optimistic concurrency control (`revision` integer).
  - `CourseVersion`: Immutable historical snapshot created atomically in a transaction from validated drafts, enforcing unique `(courseId, versionNumber)` and monotonically increasing version numbers.
- **Consequences**: Strong isolation between authors (User A vs User B) with consistent 404 responses on private resources; zero client-facing ability to set `visibility: PUBLIC` or `status: PUBLISHED` without future editorial review workflows.
