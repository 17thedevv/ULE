---
name: ule-auth-mcp-security
description: Use when implementing or reviewing authentication, sessions, tokens, authorization, ownership checks, OAuth, MCP endpoints/tools, secrets, or security-sensitive API behavior in ULE.
---

# ULE Authentication and MCP Security

## Workflow
1. Identify the actor, resource owner, action, trust boundary, and required permissions for each operation.
2. Inspect the actual Better Auth/NestJS integration and MCP SDK versions in the repository. Treat compatibility as unverified until the target flow has been exercised.
3. Prefer least privilege and server-side authorization. Authentication alone is not authorization.
4. Enforce ownership and action permissions in backend services/guards for every relevant request; never rely on frontend visibility checks.
5. For MCP, validate tool arguments, authenticate the caller, authorize each operation, and call the same backend services as HTTP endpoints.
6. Consider token audience/resource binding, expiry, revocation, CSRF/cookie behavior, CORS, redirect URIs, PKCE, replay/retry behavior, and audit logs as relevant to the selected flow.
7. Keep secrets out of logs, browser bundles, tool outputs, committed files, and error messages.
8. Make meaningful mutations idempotent where possible and audit them when appropriate.
9. Test both authorized and unauthorized paths, including cross-user access attempts.

## ULE-specific prohibitions
- Do not create an MCP tool that lets a learner or external AI directly fabricate trusted learning evidence, mastery conclusions, Quest completion, or reward-ledger entries.
- Do not expose hidden answer keys, private learner context, or another user's courses.
- Do not bypass domain rules by accessing Prisma repositories directly from an MCP adapter.
- Do not weaken CORS or authentication controls merely to make a local demo work.
- Do not claim OAuth/MCP compatibility unless tested with the intended client and deployment shape.

## Completion
Describe the threat boundary, permissions enforced, tests run, and remaining unverified assumptions. Escalate architectural incompatibilities instead of inventing an insecure workaround.
