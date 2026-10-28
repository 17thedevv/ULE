# Universal Learning Engine (ULE)

[![CI Pipeline](https://github.com/17thedevv/ULE/actions/workflows/ci.yml/badge.svg)](https://github.com/17thedevv/ULE/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Node: >=20](https://img.shields.io/badge/Node-%3E%3D20-green.svg)](package.json)
[![Package Manager: pnpm](https://img.shields.io/badge/pnpm-11.24.0-orange.svg)](package.json)

The **Universal Learning Engine (ULE)** is an extensible, modular platform for verifiable learning experiences, activity evaluation, and progressive mastery.

---

## 1. Architectural Boundaries

- **Frontend Isolation**: `apps/web` (React + Vite + TypeScript) operates strictly as an HTTP client. It never connects directly to PostgreSQL, possesses no database credentials, and contains no authoritative evaluation logic.
- **Authoritative Backend**: `apps/api` (NestJS + TypeScript) holds authoritative business logic, course verification, learner evaluation, and persistence.
- **Canonical API Contract**: Versioned REST endpoints (`/api/v1`) documented via OpenAPI 3.0 at `/docs`. Web, future mobile clients, and MCP tools consume the same canonical contracts defined in `packages/contracts`.
- **Database & Persistence**: PostgreSQL managed exclusively through Prisma ORM within `apps/api`.
- **Modular Monolith**: Clean module boundaries in a unified backend service. No microservices, Kafka, or Redis are introduced prematurely.

---

## 2. Monorepo Structure

```text
ULE/
  apps/
    web/                   # React + Vite + TypeScript SPA
      src/
        components/        # UI components (HealthStatus, etc.)
        services/          # HTTP client communicating with NestJS API
        App.tsx            # Main application layout & boundary showcase
      vite.config.ts
      vitest.config.ts
    api/                   # NestJS + TypeScript Modular Monolith
      prisma/
        schema.prisma      # PostgreSQL schema & provisional migration probe
      src/
        common/            # Global filters (HttpExceptionFilter), interceptors (LoggingInterceptor)
        config/            # Environment validation & typed configuration
        modules/
          health/          # Health & PostgreSQL readiness probe (/api/v1/health)
          prisma/          # PrismaService singleton & lifecycle management
        main.ts            # Entrypoint with OpenAPI (Swagger) & strict CORS
      test/                # Unit tests, e2e tests, and config validations
  packages/
    contracts/             # Shared API contracts & TypeScript interfaces (@ule/contracts)
      src/
        health.ts          # HealthCheckResponse, DatabaseHealth
        errors.ts          # ApiErrorResponse
  docs/
    architecture/          # System topology and Architecture Decision Records (ADRs)
    technical-spikes/      # Better Auth + NestJS + MCP feasibility analysis
  .github/
    workflows/
      ci.yml               # GitHub Actions CI workflow (lint, typecheck, build, test, DB migration)
  docker-compose.yml       # Local PostgreSQL service definition
  package.json             # Root monorepo workspace scripts
  pnpm-workspace.yaml      # pnpm workspace definition
  tsconfig.base.json       # Base TypeScript compiler options
  .env.example             # Documented environment variable template
  LICENSE                  # GNU General Public License v3.0
```

---

## 3. Prerequisites

- **Node.js**: LTS version `>= 20.0.0` (v20, v22, or v24 verified).
- **pnpm**: Version `>= 9.0.0` (pinned: `11.24.0`).
- **PostgreSQL**: Version 16+ (via Docker Compose or local installation).

---

## 4. Getting Started

### A. Clone and Install Dependencies

```bash
git clone https://github.com/17thedevv/ULE.git
cd ULE
pnpm install
```

### B. Configure Environment Variables

Copy the example environment file to `.env`:

```bash
cp .env.example .env
```

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Runtime environment (`development`, `test`, `production`) |
| `PORT` | `3000` | Port for the NestJS backend API |
| `API_PREFIX` | `api/v1` | Global prefix for application endpoints |
| `CORS_ORIGIN` | `http://localhost:5173` | Explicit allowed origin(s) for browser CORS |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/ule_dev?schema=public` | PostgreSQL connection string |
| `VITE_API_BASE_URL` | `http://localhost:3000` | API base URL consumed by the React web frontend |

### C. Start Local PostgreSQL

Using Docker Compose:

```bash
# Start PostgreSQL container in background
pnpm docker:up

# To stop PostgreSQL
pnpm docker:down
```

*(If you already have a local PostgreSQL instance running, update `DATABASE_URL` in `.env` to match your local port and credentials).*

### D. Generate Prisma Client & Run Migrations

```bash
# Generate the Prisma Client
pnpm prisma:generate

# Apply migrations to development database (requires running PostgreSQL)
pnpm prisma:migrate
```

### E. Start Applications

You can start both applications concurrently or run them independently:

```bash
# Start both Backend and Frontend in development mode
pnpm dev

# Or start Backend API only (http://localhost:3000)
pnpm dev:api

# Or start Frontend Web only (http://localhost:5173)
pnpm dev:web
```

---

## 5. Endpoints & Documentation

Once the backend is running:

- **OpenAPI (Swagger) Interactive UI**: [http://localhost:3000/docs](http://localhost:3000/docs)
- **OpenAPI JSON Contract**: [http://localhost:3000/docs-json](http://localhost:3000/docs-json)
- **System Health & Readiness Probe**: `GET http://localhost:3000/api/v1/health`
  - Returns `HTTP 200 OK` when backend and PostgreSQL are connected.
  - Returns `HTTP 503 Service Unavailable` with degraded payload if PostgreSQL is unreachable.

---

## 6. Testing & Quality Checks

Run the verification suite across the monorepo:

```bash
# Run linting (ESLint with TypeScript & React plugins)
pnpm lint

# Run type-checking (TypeScript tsc --noEmit) across all workspaces
pnpm typecheck

# Build contracts, backend, and frontend
pnpm build

# Execute all unit tests and contract tests (offline, does not require running DB)
pnpm test

# Run Backend unit tests only
pnpm test:api

# Run Backend end-to-end tests (mocked DB ping & error handling)
pnpm --filter @ule/api test:e2e

# Run Real Database Integration tests (requires running PostgreSQL)
pnpm test:integration

# Run Frontend unit & contract consumption tests
pnpm test:web
```

### PostgreSQL Requirement Breakdown for Checks:
- **Offline (No PostgreSQL required)**: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:api`, `pnpm test:web`, `pnpm --filter @ule/api test:e2e`. All unit and e2e tests execute cleanly without an active database by utilizing mocks and isolated testing modules.
- **Requires running PostgreSQL**: `pnpm prisma:migrate`, `pnpm prisma:deploy`, `pnpm test:integration`, `pnpm dev` (for live database connectivity returning `status: "ok"` rather than degraded `status: "degraded"`).

---

## 7. Authentication & MCP Feasibility Spike

Better Auth was investigated as the primary authentication candidate for NestJS and MCP tool integration. Detailed findings, CORS considerations, session/Bearer token strategies, and authorization boundaries for private courses are documented in:

👉 [`docs/technical-spikes/better-auth-nestjs-mcp.md`](docs/technical-spikes/better-auth-nestjs-mcp.md)

---

## 8. License

This project is licensed under the **GNU General Public License v3.0** — see the [LICENSE](LICENSE) file for details.
