# ULE MCP Authoring Setup & External Client Guide

The Universal Learning Engine (ULE) provides a secure, streamable Model Context Protocol (MCP) endpoint that enables authorized external AI assistants (such as Claude Desktop, Cursor, or autonomous agent runners) to author and validate private courses and Activity Blocks.

All authoring workflows run against the canonical ULE NestJS domain services and PostgreSQL backend. **ULE pays zero AI inference costs; external clients bring their own AI model.**

---

## 1. MCP Endpoint & Discovery

- **MCP Streamable HTTP Endpoint**: `http://localhost:3000/api/v1/mcp`
- **RFC 9728 Protected Resource Discovery**:
  - `GET /.well-known/oauth-protected-resource`
  - `GET /api/v1/mcp/.well-known/oauth-protected-resource`
- **Supported Transport**: Streamable HTTP with Server-Sent Events (`text/event-stream`) and JSON-RPC 2.0.

### Discovery Metadata Example
```json
{
  "resource": "http://localhost:3000/api/v1/mcp",
  "authorization_servers": [
    "http://localhost:3000/api/v1/auth"
  ],
  "scopes_supported": [
    "course:read",
    "course:write"
  ],
  "bearer_methods_supported": [
    "header"
  ],
  "resource_documentation": "http://localhost:3000/api/v1/mcp/docs"
}
```

---

## 2. Tested External Clients

The ULE MCP Authoring implementation has been verified with:
1. **MCP Streamable HTTP Protocol v2 (2024-11-05 & modern draft revisions)**.
2. **External AI Coding Assistants** (Claude Desktop, Cursor IDE with Streamable HTTP).
3. **Automated Protocol Integration Test Clients** (`supertest` + HTTP/SSE JSON-RPC 2.0).

---

## 3. Connecting an External Client

> [!WARNING]
> **Credential Security**: Never paste your ULE account password or permanent browser session cookies into AI chat prompts or untrusted client configurations. Use dedicated OAuth 2.1 access tokens.

### Configuration for Claude Desktop / Cursor
Add the ULE server entry to your client configuration file (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ule-authoring": {
      "url": "http://localhost:3000/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_ULE_MCP_ACCESS_TOKEN>"
      }
    }
  }
}
```

### Obtaining an Access Token
1. Log in to your ULE account.
2. Authorize an external client via the OAuth 2.1 authorization endpoint:
   `GET /api/v1/auth/oauth2/authorize?client_id=<CLIENT_ID>&response_type=code&scope=course:read%20course:write&redirect_uri=<REDIRECT_URI>`
3. Exchange the authorization code at `/api/v1/auth/oauth2/token` for an access token.
4. Pass the access token in the `Authorization: Bearer <TOKEN>` header.

### Revoking Access
To immediately terminate external AI access:
1. Revoke the token via `POST /api/v1/auth/oauth2/revoke`.
2. Any subsequent MCP tool calls using the revoked token will immediately fail closed with HTTP 401 Unauthorized.

---

## 4. Permission Scopes

ULE enforces least-privilege scope-based authorization server-side:

| Scope | Permission Level | Permitted Operations |
|---|---|---|
| `course:read` | Read-only | List block types, inspect block schemas, get authoring capabilities, view owned courses, inspect drafts, validate drafts, view immutable versions. |
| `course:write` | Authoring / Mutation | Create private courses, add draft blocks, update draft blocks, delete draft blocks, reorder draft blocks, update draft metadata, create immutable CourseVersions. |

Attempts to invoke mutation tools with a `course:read` token are rejected with:
`[Forbidden] Insufficient scope. Tool 'ule_create_private_course' requires scope 'course:write'.`

---

## 5. Tool Catalog

The authoritative MCP authoring catalog exposes 17 dedicated tools:

### Discovery
- `ule_get_authoring_capabilities`: Invariants, constraints, supported block types, and prohibited operations.
- `ule_list_block_types`: Supported ABP block types (`video`, `multiple-choice`, `coding`) and capabilities.
- `ule_get_block_type_schema`: Creator configuration JSON schema (evaluator secrets stripped).

### Private Course Core
- `ule_create_private_course`: Creates a new private Course and Draft for the authenticated user.
- `ule_list_my_courses`: Lists courses owned by the authenticated caller.
- `ule_get_my_course`: Gets course details for an owned course.
- `ule_get_course_draft`: Retrieves editable draft details and current `revision`.
- `ule_update_course_draft`: Updates draft title, description, and summary under atomic revision check.

### Draft Block Authoring
- `ule_list_draft_blocks`: Lists configured block instances in a CourseDraft.
- `ule_add_draft_block`: Validates and appends a block instance under atomic `expectedRevision` check.
- `ule_update_draft_block`: Updates block title/configuration under atomic `expectedRevision` check.
- `ule_delete_draft_block`: Removes a block instance and re-indexes remaining sequence.
- `ule_reorder_draft_blocks`: Atomically reorders block instances.

### Validation & Immutable Versions
- `ule_validate_course_draft`: Validates all blocks against developer schemas without creating a version.
- `ule_create_private_course_version`: Validates draft, locks aggregate, and captures an immutable snapshot.
- `ule_list_course_versions`: Lists historical snapshots for an owned course.
- `ule_get_course_version`: Retrieves an immutable snapshot with pinned block configurations.

---

## 6. Confidentiality & Trust Boundaries

- **Untrusted Input**: All titles, descriptions, and JSON block configurations generated by external AI clients are strictly validated server-side against developer Zod schemas before being persisted.
- **Two-User Isolation**: Courses created via MCP are private to the authenticating user (`visibility: PRIVATE`). User B cannot read, mutate, or create versions on User A's courses (returns HTTP 404).
- **Secret Answer Key Stripping**: Discovery schemas and read endpoints never expose answer keys or evaluator rubrics.
- **Data Sharing Boundary**: Only the course title, description, and block configuration within the authorized user's course drafts are transmitted to the external client. No learner records, submissions, or private data are ever shared.

---

## 7. Confirming Course Privacy

Every Course created via the MCP tool `ule_create_private_course` is strictly created with `visibility: PRIVATE`. You can verify this in two ways:
1. **Via MCP Tool**: Call `ule_get_my_course({ courseId })` — verify `"visibility": "PRIVATE"`.
2. **Via ULE Web SPA**: Navigate to your Course Dashboard (`http://localhost:5173`) — the course will display the private padlock badge. Other users cannot discover or enroll in it.

---

## 8. Intentionally Unsupported Features

The following features are **explicitly excluded** from the MCP Authoring integration:
- ❌ **No ULE-Paid Model Inference**: ULE does not proxy or pay for LLM inference.
- ❌ **No Learner Impersonation**: MCP cannot submit learner responses (`submit_learner_attempt`).
- ❌ **No Mastery Fabrication**: External clients cannot alter learner mastery (`alter_mastery`).
- ❌ **No Quest or XP Manipulation**: External clients cannot complete Quests or award XP (`grant_xp_or_rewards`).
- ❌ **No Public Publishing**: Courses cannot be made public or distributed without official editorial review.
- ❌ **No Code Execution**: External clients cannot execute arbitrary shell commands or code on the ULE server.
