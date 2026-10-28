# Technical Spike: Better Auth, NestJS, and MCP Feasibility

**Author:** ULE Bootstrap Engineering Team  
**Date:** October 2026  
**Status:** Feasibility Evaluated & Architecture Defined (Runtime Integration & OAuth Unverified)

---

## 1. Executive Summary

This spike investigates the feasibility of adopting **Better Auth** as the authoritative authentication framework for the Universal Learning Engine (ULE), specifically examining its interoperability with:
1. The **NestJS** backend modular monolith (Express HTTP adapter).
2. The separate-origin **React + Vite** frontend SPA (`apps/web`).
3. External **Model Context Protocol (MCP)** clients and AI runtime tools.
4. Resource-scoped authorization for private, owner-scoped courses.

### Architectural Boundary Rules
- **Authentication Direction**: Better Auth is the preferred direction, but its compatibility with NestJS and MCP clients remains **unverified** until tested end-to-end.
- **No Insecure Workarounds**: No provisional token bypass guards or stubbed auth mechanisms have been introduced into runtime code.
- **Authoritative Domain Isolation**: Authentication (identity) is separate from Authorization. Resource-scoped authorization (e.g. course ownership) belongs authoritatively in the NestJS domain service layer, not in generic auth tables.

---

## 2. Technical Investigation

### A. Better Auth Integration with NestJS & Express Adapter

Better Auth relies on the Web Fetch API (`Request` / `Response`). In Node.js environments using Express, Better Auth provides a `toNodeHandler` bridge:

```typescript
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth';

// Express mounting
app.all('/api/auth/*', toNodeHandler(auth));
```

#### NestJS Integration Options
1. **NestJS Middleware (`NestMiddleware`)**: Mount on `/api/auth/*` or `/api/v1/auth/*` passing requests to `toNodeHandler(auth)`.
2. **Dedicated Auth Controller (`@All('*')`)**: A thin NestJS controller delegating `req` and `res` objects directly.

#### Database Adapter & Prisma Sharing
Better Auth includes a Prisma adapter (`@better-auth/prisma-adapter`). To avoid redundant database connection pools and maintain transaction safety:
- Better Auth **must** be initialized with the NestJS application's singleton `PrismaService`.
- Better Auth tables (`user`, `session`, `account`, `verification`) must be integrated into `apps/api/prisma/schema.prisma` in Phase 1.

---

### B. Session & Token Handling Across Separate Origins

The ULE architecture separates the frontend client (`apps/web` on `http://localhost:5173`) from the authoritative backend (`apps/api` on `http://localhost:3000`).

#### 1. Browser Web Client (SPA)
- **Mechanism**: Secure, HTTP-only session cookies.
- **CORS Requirements**:
  - `Access-Control-Allow-Credentials: true`.
  - Explicit origin matching: `Access-Control-Allow-Origin: http://localhost:5173` (wildcards `*` are rejected by browsers when credentials are enabled).
  - Local development: `SameSite=Lax`, `Secure=false`, `Path=/`.
  - Production (HTTPS): `SameSite=None` (or `SameSite=Lax` under unified domain), `Secure=true`, `HttpOnly=true`.

#### 2. Mobile & Non-Browser Clients
- Cookies are inapplicable or unreliable for non-browser clients (MCP servers, AI agents, CLI tools, native mobile apps).
- **Bearer Token Support**: Better Auth supports session token extraction via `Authorization: Bearer <session_token>`.
- **NestJS Auth Guard (`BetterAuthGuard`)**: A planned NestJS guard inspecting `req.headers.authorization` first (Bearer tokens) and falling back to incoming session cookies (`req.cookies`).

---

### C. Better Auth MCP OAuth Requirements & MCP TypeScript SDK Compatibility

#### The MCP Security Model
The official Model Context Protocol (`@modelcontextprotocol/sdk`) specifies:
1. **Transports**:
   - `stdio`: Local process communication (ideal for local IDE agents).
   - `SSE` (Server-Sent Events) / `Streamable HTTP`: Remote communication over HTTP.
2. **Authentication in MCP**:
   - The MCP specification recommends OAuth 2.0 (Authorization Code Grant with PKCE) for authenticating users to remote MCP servers.
   - The MCP TypeScript SDK (`@modelcontextprotocol/sdk/server`) does not mandate an internal authentication framework; it exposes transport lifecycle hooks allowing inspection of incoming HTTP request headers.

#### Better Auth as an MCP Auth Provider
- Better Auth provides plugins for social OAuth *consumption* (Google, GitHub), and experimental OpenID Connect / OAuth 2.0 provider capabilities.
- Using Better Auth as a full-fledged OAuth 2.0 Authorization Server to issue tokens to external AI clients (e.g. Claude Desktop, Cursor) requires either:
  1. **Personal Access Tokens (PAT) / API Keys**: A custom or Better Auth API key plugin where users generate an API key in the ULE Web UI and configure it in their MCP client config.
  2. **OAuth 2.0 Authorization Server Plugin**: Exposing `/oauth/authorize` and `/oauth/token` endpoints.

---

### D. External AI Client Transport & Authentication Matrix

| Client Type | Transport | Authentication Mechanism | Feasibility Status |
| :--- | :--- | :--- | :--- |
| **Local IDE / CLI (e.g. Claude Code)** | `stdio` | Injected environment variable (`ULE_API_KEY`) | Documented feasible; lowest complexity |
| **Desktop AI (Claude Desktop, Cursor)** | `SSE` / HTTP | Bearer API Key or OAuth 2.0 Access Token | Documented feasible via HTTP Header |
| **Cloud AI Agents (Headless Workers)** | `SSE` / HTTP | Service Account Token / M2M JWT | Documented feasible via NestJS Guard |

---

### E. Authorization Boundaries for Private, Owner-Scoped Courses

Authentication (identifying who the caller is) must be cleanly decoupled from Domain Authorization (determining whether the caller can mutate a specific course).

#### Boundary Rules
1. **Never rely solely on generic role flags**: A global role like `user` or `author` is insufficient. Permissions must be evaluated against the specific aggregate: `(callerId, courseId, action)`.
2. **Authoritative Enforcement in NestJS**:
   - Controller level: NestJS `@UseGuards(CourseOwnerGuard)` verifies that the authenticated `req.user.id` matches `course.authorId`.
   - Domain service level: Domain services verify course visibility (`draft`, `published`, `archived`) and reject unauthorized access regardless of whether the call originated from the REST API or an MCP tool.
3. **MCP Tool Parity**:
   - When an MCP tool calls `CourseService.updateActivityBlock(blockId, patch)`, it must execute under the identity of the authenticated user.
   - MCP tools must **never** run with elevated bypass privileges against private courses.

---

## 3. Categorized Audit of Findings

To ensure transparent engineering discipline, the current state of authentication and MCP integration is categorized into four explicit tiers:

### 1. Confirmed Implementation Facts (Actually built and verified in this codebase)
- Express adapter in NestJS 11 is operational and handles custom middleware and global interceptors.
- CORS configuration in `apps/api/src/main.ts` enforces explicit environment-specific allowed origins and enables `credentials: true`.
- Global error filter formats errors consistently (`ApiErrorResponse`), and logger records structured response status and duration.
- Shared `@ule/contracts` defines canonical contract structures shared by frontend and backend.
- **No fake, provisional, or insecure auth bypass guards have been introduced.**

### 2. Findings Supported by Official Documentation
- Better Auth provides `toNodeHandler()` to bridge Web Standard `Request`/`Response` to Express `req`/`res`.
- `@better-auth/prisma-adapter` accepts an existing PrismaClient instance, allowing reuse of `PrismaService`.
- `@modelcontextprotocol/sdk` supports extracting arbitrary HTTP headers (`Authorization`) from incoming SSE connections.
- Browsers enforce credentialed CORS restrictions, rejecting wildcard `*` origins when cookies are transmitted.

### 3. Hypotheses Requiring Live Testing
- Whether NestJS global exception filters and validation pipes cleanly intercept errors originating within Better Auth's `toNodeHandler`.
- Performance and connection pooling characteristics when Better Auth and NestJS business services concurrently query PostgreSQL via the same `PrismaService`.
- The UX trade-offs between implementing full OAuth 2.0 PKCE for MCP desktop clients versus issuing scoped Personal Access Tokens (PAT).

### 4. Integrations That Have NOT Been Exercised (Unverified)
- `better-auth` package is **not installed** in `apps/api` dependencies in Phase 0.
- Better Auth database tables (`User`, `Session`, etc.) have **not been created or migrated**.
- End-to-end OAuth login flow (e.g. Google or GitHub social login) has **not been run or tested**.
- MCP client connection over stdio or SSE has **not been executed**.

---

## 4. Smallest Next Experiment (Phase 1)

Before treating Better Auth as production-ready:
1. In Phase 1, install `better-auth` and `@better-auth/prisma-adapter` into `apps/api`.
2. Add the minimum required auth models (`User`, `Session`, `Account`, `Verification`) to `apps/api/prisma/schema.prisma` and create a migration.
3. Mount Better Auth under `/api/v1/auth/*` sharing the singleton `PrismaService`.
4. Create an automated test in `apps/api/test/` exercising:
   - User creation and session cookie issuance.
   - Extraction of session identity from both cookie and `Bearer <token>` headers.
   - Rejection of expired or forged session tokens.
