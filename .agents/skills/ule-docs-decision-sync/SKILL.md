---
name: ule-docs-decision-sync
description: Use when changing an accepted architecture decision, implementation convention, public API contract, phase scope, or other behavior that should stay aligned across ULE documentation.
---

# ULE Documentation and Decision Sync

## Workflow
1. Identify the authoritative document for the topic and inspect the current repository docs before editing.
2. Distinguish status explicitly: accepted/frozen, proposed, provisional, rejected, or unverified.
3. Update the source-of-truth document first, then update affected implementation docs, README/setup instructions, API docs, and ADRs as needed.
4. Prefer a short Architecture Decision Record for a meaningful decision: context, decision, alternatives considered, consequences, status, and date.
5. Search for stale contradictory statements after changing a decision. Do not only append a new statement while leaving old instructions presented as current.
6. Keep documentation proportional to the change. Avoid duplicate long descriptions across multiple files; link to the authoritative explanation.
7. If an external workspace such as Notion is unavailable, do not claim it was updated. Make the repository change and report the external sync as pending.

## ULE-specific requirements
- Preserve the frozen stack: React + Vite + TypeScript, separate NestJS backend, PostgreSQL + Prisma, versioned HTTP API + OpenAPI.
- Better Auth/NestJS/MCP compatibility and hosting remain implementation gates until tested/selected.
- Do not reintroduce Next.js as the selected frontend.
- Keep bootstrap scope separate from future Course/ABP/Quest/AI implementation phases.

## Completion
List the authoritative docs changed, contradictory references checked, and any external documentation that still needs synchronization.
