---
name: ule-architecture-guard
description: Use when planning or changing ULE architecture, dependencies, repository structure, module boundaries, or technology choices; prevent accidental drift from the frozen ULE stack and separation rules.
---

# ULE Architecture Guard

## Workflow
1. Read the root `AGENTS.md` and inspect the current repository before proposing changes.
2. Identify which accepted decision or boundary the task touches. Check current architecture docs and existing code rather than relying only on memory.
3. Preserve the frozen stack:
   - React + Vite + TypeScript frontend.
   - Separate NestJS + TypeScript backend.
   - PostgreSQL + Prisma.
   - Versioned HTTP API + OpenAPI.
   - Better Auth is preferred but integration remains unverified until tested.
4. Keep the frontend and backend independently runnable and deployable. A shared monorepo or shared contract package is allowed; runtime coupling is not.
5. Keep authoritative domain rules in backend services, not React components, client state, controllers, or MCP adapters.
6. Prefer a modular monolith. Do not add microservices or infrastructure dependencies without a demonstrated requirement.
7. If a requested change conflicts with a frozen decision, explain the conflict and its trade-offs before changing the decision.
8. Make the smallest change that satisfies the task and add/update tests where behavior changes.

## Required output
For architecture-impacting work, report:
- Decision/boundary affected.
- Files or modules affected.
- Why the change preserves or intentionally changes the architecture.
- Verification performed.
- Any unresolved trade-off.

## Guardrails
- Do not introduce Next.js.
- Do not let the frontend access PostgreSQL directly.
- Do not duplicate domain rules across HTTP and MCP.
- Do not mark a provisional integration as proven without an executable test.
