# ULE Agent Instructions

## Purpose
ULE (Universal Learning Engine) is being developed incrementally. Make small, verified changes that preserve the approved product and architecture decisions.

## Frozen MVP technology decisions
- Frontend: React + Vite + TypeScript. **Do not introduce Next.js.**
- Backend: NestJS + TypeScript, separate from the frontend.
- Database: PostgreSQL.
- ORM and migrations: Prisma.
- Authentication direction: Better Auth, but NestJS/MCP integration must be proven before being treated as production-ready.
- API: versioned HTTP API (initial convention `/api/v1`) with OpenAPI.
- Package manager: pnpm.
- Backend architecture: modular monolith, not microservices.

## Mandatory architecture boundaries
- The frontend is an API client. It must never connect directly to PostgreSQL.
- NestJS owns authoritative business rules, validation, authorization, and state transitions.
- Keep controllers thin. Put business logic in domain/application services.
- Web and future mobile clients must be able to consume the same canonical backend API.
- MCP tools must call the same authorized backend services as the HTTP API; do not duplicate business rules or bypass authorization.
- AI is optional. Core course creation, learning, evaluation, and progress persistence must not depend on an AI provider.
- Do not add infrastructure such as Redis, Kafka, Kubernetes, microservices, or an AI orchestration framework without a concrete requirement.

## How to use skills
- Before a change, inspect the repository and relevant documentation.
- Read the applicable skill under `.agents/skills/` when its description matches the task. Do not load every skill for every task.
- Skills provide workflows; they do not override these frozen decisions or explicit user instructions.
- If repository reality conflicts with these instructions, inspect evidence and report the conflict. Do not silently rewrite an accepted decision.

## Engineering discipline
- Preserve the existing license and useful work.
- Never commit secrets or real `.env` files.
- Run the relevant checks and report exactly what was and was not run.
- Do not claim an integration, test, build, migration, deployment, or external service worked unless it was actually verified.
- Prefer the smallest complete vertical slice over scaffolding many empty modules.
- Update architecture documentation when a decision or boundary changes. Distinguish accepted, provisional, and unverified decisions.
- Do not implement future product domains merely because their names appear in the architecture. Follow the scope of the current task.

## Bootstrap scope
For the initial bootstrap, establish the independently runnable frontend and backend, a versioned health endpoint, OpenAPI, environment configuration, Prisma/PostgreSQL development workflow, baseline tests, and CI. Do not implement the full Course domain, ABP runtime, Quest Engine, mastery, rewards, production AI Runtime, or production MCP authoring tools during bootstrap.
