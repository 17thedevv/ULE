# ULE MCP client setup

ULE exposes 17 course authoring tools at `http://localhost:3000/api/v1/mcp` over Streamable HTTP. The tools call the same authorized NestJS services and PostgreSQL records as Creator Studio. The external AI client supplies its model; ULE does not call or pay for model inference.

**Verification boundary:** Engineering Ready requires quality/build checks, automated HTTP/SDK and PostgreSQL checks, and passing CI. The local checks passed; CI status is tracked in the [P7-05 verification record](../plans/phase-7-mcp-client-usability.md). Cursor Desktop authoring and the visible Creator Studio/learner journey establish Product Verified, which remains **Pending** until a real client run is recorded. Inspector or JSDOM execution alone does not close that gate.

## Start ULE

Follow the [repository setup](../../README.md#4-getting-started) to install dependencies, configure the API environment, and start PostgreSQL. Use a disposable database for integration checks: the tests create users, courses, tokens, and learning records.

```sh
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

Check `http://localhost:3000/api/v1/health`, then open `http://localhost:5173` and register an email/password account if needed. Use that same account for MCP consent and Creator Studio. `BETTER_AUTH_URL` must match the API origin used by the client; keep the MCP resource URI, issuer, and browser origin configuration consistent. Do not switch between `localhost` and `127.0.0.1` halfway through OAuth.

MCP OAuth uses the ULE email/password account. It does not require Google Client ID, Google Client Secret, or completion of PR #16.

## Connect Cursor Desktop

Cursor is the primary P7-05 product verification client. Its [official MCP documentation](https://cursor.com/docs/mcp) describes Streamable HTTP, OAuth authorization code with PKCE, and public dynamic client registration. This describes client capability; compatibility with this ULE server still requires the run below.

Add this entry to the project's `.cursor/mcp.json` or merge it into your global `~/.cursor/mcp.json` without replacing other servers:

```json
{
  "mcpServers": {
    "ule-authoring": {
      "url": "http://localhost:3000/api/v1/mcp"
    }
  }
}
```

1. Open Cursor's MCP settings and enable/connect `ule-authoring`.
2. Follow its OAuth sign-in action. The client discovers the ULE authorization server and registers its callback before beginning PKCE.
3. In the browser, sign in on ULE's `/auth/login` page with email/password and inspect `/auth/consent`.
4. Approve only the requested scopes you intend to grant. `course:read` permits inspection; authoring also needs `course:write`. If only read access was granted, reconnect/reauthorize for writing rather than changing backend permissions.
5. Confirm the callback completes, exactly 17 tools appear, and `ule_get_authoring_capabilities` succeeds.

The target configuration has no pasted bearer token, account password, session cookie, or OAuth client secret. OAuth state belongs to the client. Do not put those values into chat, screenshots, or the repository.

Current Cursor docs describe a Desktop loopback callback at `http://localhost:8787/callback` and a web callback at `https://www.cursor.com/agents/mcp/oauth/callback`; dynamic registration may register both. Record the callback actually used by the installed Desktop version. Do not add wildcard redirects or weaken Origin/Host validation to resolve a callback failure.

For SDK diagnostics, an HTTP loopback callback must be registered as `application_type: "native"`; Better Auth rejects that callback for a web client. The SDK fixture declares native explicitly. This does not prove which metadata Cursor sends; inspect its actual registration if it reports `invalid_redirect_uri`.

## Diagnose with MCP Inspector

The [official Inspector](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector) offers Web, CLI, and TUI clients. It is a diagnostic tool; direct tool calls do not demonstrate AI tool selection.

```sh
npx @modelcontextprotocol/inspector
```

In the Web client add a Streamable HTTP connection to `http://localhost:3000/api/v1/mcp`, complete OAuth, list tools, and call `ule_get_authoring_capabilities`. Record the Inspector version and negotiated protocol/era. Consult that version's help if connection controls differ. Current Inspector requires Node 22.19+; ULE's own supported runtime requirements are separate.

For repeatable repository smoke coverage without an AI client:

```sh
pnpm test:mcp:smoke
```

This runs the official SDK OAuth/transport, MCP-to-Web REST authoring, and focused token revocation integration suites against PostgreSQL. It creates isolated fixtures and private version snapshots to test persistence, not a manually approved product course. Run the full integration suite with `pnpm test:integration` for existing scope, ownership, expiry, revocation, answer protection, idempotency, and audit regressions. The smoke command requires the same database environment as that suite.

## Discovery and protocol negotiation

| Resource | Local URL |
| --- | --- |
| MCP | `http://localhost:3000/api/v1/mcp` |
| Protected resource metadata | `http://localhost:3000/.well-known/oauth-protected-resource` |
| Resource-scoped metadata alias | `http://localhost:3000/api/v1/mcp/.well-known/oauth-protected-resource` |
| Authorization server issuer | `http://localhost:3000/api/v1/auth` |
| RFC 8414 authorization metadata | `http://localhost:3000/.well-known/oauth-authorization-server/api/v1/auth` |

Protected metadata advertises that resource, authorization server, bearer header authentication, and the scopes `course:read` / `course:write`. A protected request without valid authentication returns HTTP 401 and a `WWW-Authenticate` challenge pointing to resource metadata. Let the client discover the authorization, registration, token, and revocation endpoints rather than constructing an authorization URL without PKCE/state/resource parameters.

Authentication is required before MCP `initialize` and `notifications/initialized`, as well as subsequent requests. This starts OAuth at connection time; clients must finish it before negotiating the authenticated transport and listing tools.

The [2025-03-26 transport specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) introduced Streamable HTTP in place of the separate HTTP+SSE transport from 2024-11-05. The earlier guide's description of Streamable HTTP as protocol `2024-11-05` was incorrect.

Installed `@modelcontextprotocol/server` 2.4.0 and test client `@modelcontextprotocol/sdk` 1.32.2 both export `2025-11-25` as their latest legacy initialization revision, with supported legacy values `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`, and `2024-10-07`. The official SDK OAuth smoke observed negotiation of **`2025-11-25`** and exactly 17 tools. Exported compatibility values are not evidence that every revision/client combination was exercised. The [verification record](../plans/phase-7-mcp-client-usability.md) distinguishes that result from pending Cursor/Inspector negotiation. No SDK upgrade is required merely to correct this documentation.

Streamable HTTP POST clients must accept both `application/json` and `text/event-stream`. A plain browser navigation to the endpoint is not a protocol test. Tool-level domain failures are MCP results with `isError: true`, such as `[Error 409]`; the enclosing HTTP response can still be 200. Authentication failures occur at the HTTP boundary.

## Author a course from Cursor

Use this prompt after authorizing both course scopes:

```text
Create a private ULE course titled "P7-05 AI Authored Course".

Add these three activities in order:
1. A video lesson titled "Introduction to Arithmetic" with a valid HTTPS video URL.
2. A multiple-choice question: "What is 2 + 3?" with options 4, 5, and 6. The correct option is 5.
3. A Cloze activity: "The capital of France is {{blank_1}}." with accepted answer "Paris".
Use the ULE MCP tools to inspect the block schemas before creating activities. After each mutation, read the latest draft revision before continuing.

Validate the complete course draft. Show me the validation result and a summary of the authored content.

Do not publish a CourseVersion without my explicit approval.
```

Expected calls include `ule_get_block_type_schema` for `video`, `multiple-choice`, and `cloze`, `ule_create_private_course`, three `ule_add_draft_block` calls, draft reads between mutations, and `ule_validate_course_draft`. Discover the actual schemas instead of guessing configuration fields. Record the returned Course ID and draft revision.

Open Creator Studio at `/studio` using the same owner account, reload it, and open `/studio/courses/<courseId>/edit`. Confirm the three blocks, ordering, creator answer keys, and draft revision. Save an MCQ change on the web and ask Cursor to read the latest draft. Ask Cursor to edit Cloze, reload the editor, and compare the saved values. MCP and UI validation should agree on validity/block count, although their response shapes differ.

Stop for explicit user approval before creating a CourseVersion. After approval, publish through the editor or the private version tool, compare its immutable snapshot, grant a learner through Course Access, and verify the learner can open the version, submit activities, and see persisted progress after reload. A private CourseVersion does not make a course public.

## Revision conflicts and retries

Every write tool requires an `idempotencyKey`. Reuse the exact key and payload to retry an uncertain outcome; that returns the stored result without another mutation. Changing a payload under the same key is rejected. Use a new key for a deliberately revised operation.

For mutations that accept `expectedRevision`, read the draft before each operation. To verify conflict behavior, keep an old revision in Cursor, save a conflicting edit in the web editor, then attempt the old MCP mutation. It must fail with domain conflict 409 and preserve the web change. Cursor must reread and present conflicting content for the user's decision before retrying. The backend checks revision integrity; it does not enforce how an AI explains a conflict or obtains approval. No realtime collaboration system is added.

Domain mutation, idempotency completion, and mandatory successful mutation audit commit in one PostgreSQL transaction. Audit persistence failure rolls the mutation back. Idempotency reservations use a 30-second worker lease with fencing; an existing course alone never proves that a failed update succeeded.

## Permissions and tool catalog

`course:read` permits discovery and owner-scoped inspection/validation; it cannot mutate. `course:write` permits owner-scoped authoring and private snapshot creation. Creator configurations with protected answer values require the owning writer; read-only inspection strips evaluator secrets. Other users' private courses fail closed rather than exposing their contents.

| Category | Tools |
| --- | --- |
| Discovery (3) | `ule_get_authoring_capabilities`, `ule_list_block_types`, `ule_get_block_type_schema` |
| Course/draft (5) | `ule_create_private_course`, `ule_list_my_courses`, `ule_get_my_course`, `ule_get_course_draft`, `ule_update_course_draft` |
| Blocks (5) | `ule_list_draft_blocks`, `ule_add_draft_block`, `ule_update_draft_block`, `ule_delete_draft_block`, `ule_reorder_draft_blocks` |
| Validation/versions (4) | `ule_validate_course_draft`, `ule_create_private_course_version`, `ule_list_course_versions`, `ule_get_course_version` |

The catalog exposes no tool for learner impersonation, evidence/score/mastery fabrication, XP/rewards, arbitrary execution, or public publication. The current block registry includes Cloze; discover its current contents through `ule_list_block_types`. OAuth token expiry, revocation, client status, audience, issuer, scopes, and PostgreSQL issuance records are checked server-side. After revocation through the discovered endpoint, subsequent protected MCP calls must fail with HTTP 401; reconnecting requires fresh authorization.

For issued MCP access JWTs, revocation uses Better Auth's supported hook and canonical client authentication, then marks the matching client/resource-bound ULE issuance record revoked. Registering a different client cannot revoke the owner's token. Refresh-token and non-MCP behavior remains provider-owned.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Cannot reach API / degraded health | PostgreSQL readiness, migrations, API port, and local API environment. |
| OAuth does not start | MCP client enabled, correct URL, 401 resource metadata challenge and authorization metadata reachable; capture client version and sanitized logs. |
| Login/consent loops or redirect fails | Consistent issuer/resource origin, registered exact callback, browser cookies, preserved PKCE/state/query; do not manually strip parameters. |
| Tool list differs from 17 | Correct server/branch, completed OAuth, stale client configuration/cache; compare official SDK smoke. |
| Write rejected | Inspect consented scope. Read-only access must remain unable to write. |
| Domain 409 in MCP tool result | Read current revision and resolve the conflict; check `isError` even when HTTP status is 200. |
| Expired/revoked token | Reauthorize; do not reuse browser session cookies as MCP bearer tokens. |
| Cursor works but course is missing | Same ULE account, exact Course ID, reload `/studio`, then compare owner REST draft and MCP draft revisions. |

For a reproducible transport/discovery bug, record the client and SDK versions, negotiated protocol, request method/path, response status, and redacted error. Fix demonstrated compatibility problems without adding scopes, wildcard CORS/redirects, or bypassing domain services.
