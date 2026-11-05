# P7-05 — MCP Client Usability

Date: 2026-11-05. Scope: one private course authored over MCP, visible/editable in Creator Studio, then explicitly approved for a private immutable version and learner access.

## Scope and release policy

- Branch `feat/phase-7-mcp-client-usability` starts at `main` / `5ab3542`, independently of Google Login PR #16 (`db0fee2`). Do not merge either PR automatically.
- PR #16 remains separate and Draft. Its live Google OAuth verification is deferred, not accepted. Google Login stays disabled by default on that branch; P7-05 adds no Google configuration or code dependency.
- Cursor Desktop is the primary product client; MCP Inspector is diagnostic. No embedded ULE AI client, inference provider, new tool, new permission, or realtime collaboration is required.
- Existing NestJS domain services remain authoritative. Web and MCP operate on the same Course ID, draft, revisions, and private snapshots.
- P7-06 may proceed after Engineering Ready. Product client verification and live Google/deployment checks remain release verification work until executed.

## Demonstrated compatibility correction

The official SDK OAuth flow reproduced these compatibility blockers:

1. Standard RFC 8414 discovery at `GET /.well-known/oauth-authorization-server/api/v1/auth` returned 404. Without metadata, the SDK fell back to `POST /register`, also 404. A thin GET adapter now delegates RFC 8414 issuer-path requests to the existing Better Auth handler, which serves only the configured issuer and rejects others. The metadata response returns the issuer, provider endpoints, and S256 support; no second OAuth implementation or OpenID endpoint is added.
2. With discovery working but the anonymous registration flag deliberately removed, `POST /api/v1/auth/oauth2/register` returned 401: `Authentication required for client registration`. `allowDynamicClientRegistration: true` enabled registration but did not override Better Auth's unauthenticated registration default. A public desktop client has no user session yet. P7-05 explicitly enables `allowUnauthenticatedClientRegistration: true`.
3. Normal SDK `Client.connect` followed immediately by `listTools` could start competing authorization flows because unauthenticated initialization succeeded before protected SSE/tool requests. Repeated runs produced duplicate registration/redirect attempts and an invalid grant during browser OAuth. MCP initialization and initialized notifications now require a valid bearer token too, so normal connection receives the discovery challenge before starting a session. The regression requires one registration and one authorization redirect before reconnecting with the issued token.
4. Revoking an actually issued MCP JWT at the advertised `/api/v1/auth/oauth2/revoke` endpoint returned 400 `unsupported_token_type`; Better Auth 1.7.14 does not itself revoke these self-contained access JWTs. A supported Better Auth before-hook now authenticates the requesting client with the provider's exported client-authentication API, then revokes only an exact ULE MCP issuance record belonging to that client and resource. Existing token verification already checks this ledger. Refresh-token requests and tokens outside that ledger stay with the provider; this is not a replacement OAuth server or general JWT revocation service.

Course access still requires subsequent user login, consent, PKCE, a valid resource-bound token, scope checks, and ownership authorization. Registration alone grants no course access. The official SDK regression exercises these corrections through the HTTP boundary.

The SDK fixture registers `application_type: "native"` for its HTTP loopback callback. With the default web application type, Better Auth correctly rejects that redirect with `invalid_redirect_uri`; callback validation is preserved. Cursor's actual registration metadata/callback remain part of the pending product gate.

## Gate definitions

| Gate | Required evidence | Current status |
| --- | --- | --- |
| Engineering Ready | Lint, typecheck, build, Web/API unit tests, mocked API e2e, official MCP SDK protocol/OAuth smoke, full PostgreSQL integration, and CI pass | **Local checks complete — Pending CI** |
| Product Verified | Real Cursor OAuth + tool discovery + AI authoring, visible Web edits in both directions, approved publish, learner grant/activity/progress journey | **Pending — no real Cursor/AI product run recorded** |

Do not promote an automated fixture run to Product Verified. Private version creation in tests is an explicitly scripted fixture action; a real AI conversation must stop for the user's approval before publishing.

## Reproducible engineering checks

Set `DATABASE_URL` to a disposable PostgreSQL database and configure the test authentication environment. Keep real credentials out of logs and Git. The test setup supplies test-only auth defaults when not already configured; Prisma commands require the intended database environment.

```sh
pnpm prisma:generate
pnpm prisma:deploy
pnpm test:mcp:smoke
pnpm lint
pnpm typecheck
pnpm build
pnpm test:web
pnpm test:api
pnpm test:e2e
pnpm test:integration
```

The smoke command runs:

- `apps/api/test/mcp-client.integration.spec.ts`: official SDK over a real listening HTTP server, resource/authorization discovery, dynamic client registration, email/password OAuth/PKCE, negotiated initialization, exact catalog, read access, write denial, and revoke behavior.
- `apps/api/test/mcp-web-authoring.integration.spec.ts`: MCP authoring of Video/MCQ/Cloze with canonical Web REST reads/writes, revision and idempotency checks, private snapshot, learner access, and persistence. REST parity does not assert that a browser rendered the course.
- `apps/api/test/mcp-token-revocation.integration.spec.ts`: exact client/resource binding, repeated revocation, browser-cookie rejection, public/confidential client authentication, and provider delegation boundaries.

Existing MCP suites retain the wider ownership, audience/issuer/expiry, protected answer, forbidden-operation, crash recovery, and transactional audit coverage. These suites complement the smoke flow rather than a new client implementation.

## Protocol and execution record

| Evidence | Result |
| --- | --- |
| Installed server/client | `@modelcontextprotocol/server` 2.4.0; `@modelcontextprotocol/sdk` 1.32.2; no SDK upgrade for P7-05 |
| SDK constants inspected | Both export latest legacy initialization revision `2025-11-25` and the same legacy compatibility list; see [setup guide](../architecture/mcp-setup.md#discovery-and-protocol-negotiation) |
| SDK negotiated protocol | `2025-11-25` observed through normal official SDK connect → initial 401 discovery → one registration/redirect → real email/password/consent → finishAuth → authenticated connect; exact 17 tools and a read tool passed |
| Local baseline | Existing MCP suites: 76 tests passed; lint/typecheck/build, Web 189, API 144, mocked e2e 25 tests passed before P7-05 additions |
| PostgreSQL setup | Isolated PostgreSQL 18 database; all 15 existing migrations applied successfully |
| Official SDK OAuth suite | 5/5 passed over real HTTP/PostgreSQL, including one registration/redirect, exact catalog/protocol, PKCE/callback/unsupported-grant negatives, read-only write denial, real JWT revoke endpoint 200, and revoked-token SDK rejection 401 |
| MCP-to-Web parity suite | 4/4 tests passed: shared course/draft, Video/MCQ/Cloze, edits/conflict/retry/audit, secret/scope/owner boundaries, exact private Web snapshot, learner grant/enrollment and all three completed runs; assessed MCQ/Cloze results and 100% progress persisted |
| Focused revocation suite | 6/6 passed: owner revoke 200 then MCP 401, stable repeated revoke, wrong-client no-op without token revocation, cookie/unknown/missing client denial, confidential Basic/POST credential/method checks, expired tracked token revocation, and unchanged provider handling outside the MCP ledger |
| Combined MCP smoke | `pnpm test:mcp:smoke`: 3 suites / 15 tests passed against PostgreSQL |
| Full PostgreSQL integration | `pnpm test:integration`: 16 suites / 369 tests passed |
| Final quality/build checks | `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed |
| Final unit/e2e checks | `pnpm test:web`: 189 passed; `pnpm test:api`: 14 suites / 144 passed; `pnpm test:e2e`: 2 suites / 25 passed |
| CI | Pending Draft PR run |
| Cursor version / negotiated protocol / callback | Not recorded; real client run Pending |
| Inspector version / negotiated protocol | Not recorded; diagnostic run Pending |

Add the commit/CI link after the Draft PR run and actual client details after manual execution. Do not copy tokens, authorization codes, cookies, PKCE verifier, passwords, or secrets into evidence.

Observed runner limitation: the passing API unit run exited with code 0 but Jest printed a worker shutdown warning (`A worker process has failed to exit gracefully` and force-exited it). This is recorded separately from assertion results; no cause has been established.

The passing PostgreSQL integration run also emitted a `pg` deprecation warning about issuing a query while another query is executing on the same client, and the existing JSDOM navigation warning. All 369 assertions passed and the process exited successfully; these warnings remain visible limitations rather than hidden failures.

## Product verification checklist

Use the [connection guide and exact sample prompt](../architecture/mcp-setup.md#author-a-course-from-cursor). The unchecked cases below are manual product acceptance, even where automated backend coverage exists.

Connection and OAuth:

- [ ] Cursor connects to localhost MCP and records client version, negotiated protocol, and actual callback.
- [ ] OAuth completes with a ULE email/password account and the intended consented scopes.
- [ ] Client sees exactly 17 tools and successfully invokes a `course:read` tool.
- [ ] A read-only authorization cannot invoke a write tool.

AI authoring and Web parity:

- [ ] AI creates a real private course via MCP and records its Course ID.
- [ ] AI inspects schemas and creates Video, MCQ, and Cloze in order with correct creator configurations.
- [ ] AI validates the full draft successfully and reports content/revision.
- [ ] The same course and blocks appear correctly in Creator Studio for the same owner.
- [ ] Web MCQ edits appear on MCP reads; MCP Cloze edits appear after editor reload with matching revision/content.
- [ ] After explicit user approval, publish creates a private immutable snapshot containing the reviewed content.

Security and reliability:

- [ ] Another user's account cannot read/edit the private course.
- [ ] Revoked OAuth access cannot perform further protected MCP calls; expired tokens also fail.
- [ ] Read-only draft/block/version inspection omits protected answer values; creator writer access remains correct.
- [ ] A stale revision conflicts without overwrite; AI rereads and asks the user to resolve conflicting content.
- [ ] Exact key/payload retry creates no duplicate mutation; changed payload with the same key is rejected; successful writes retain audit/idempotency evidence.

Product completion:

- [ ] Teacher grants a learner on the Web; that learner can open and learn the AI-authored course version.
- [ ] Evaluation results and progress persist in PostgreSQL and remain after learner reload.
- [ ] Setup/evidence records reflect the exact client/version actually tested, including limitations.

Additional boundary probes: prompts requesting score/evidence/XP manipulation must find no permitted tool; public publishing remains unavailable. Denied operations must not gain a new scope or bypass a domain service to complete the prompt.

## Manual evidence to retain

Record the commit and local service versions, sanitized OAuth/discovery outcome, exact 17-tool catalog, Course ID, draft revision after each change, validation results, and approved CourseVersion ID. Capture the client's tool-call transcript and a Web observation of the same records. For conflicts, retain the stale/current revision and user decision; for retries, retain nonsecret key/payload identity and resulting block count. For learner verification, record grant/version identity, evaluated activity outcomes, and progress after reload.

When a client defect is reproduced, add a focused regression and fix only the demonstrated transport/discovery/schema/output issue. Keep Product Verified Pending if the actual Cursor environment is unavailable; this does not block P7-06 after the engineering gate passes.
