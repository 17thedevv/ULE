# ULE System Architecture Overview

## 1. System Topology & Tier Isolation

The Universal Learning Engine (ULE) is structured as a modular monorepo containing independently deployable frontend and backend applications, connected through a canonical, versioned REST API.

```mermaid
flowchart LR
    subgraph Clients["Client Tier"]
        Web["Web Client (React + Vite)"]
        Mobile["Future Mobile Client"]
        MCP["MCP AI Clients / IDE Tools"]
    end

    subgraph Backend["Authoritative Backend Tier (NestJS)"]
        API["HTTP Controllers (/api/v1)"]
        GlobalFilters["Error Filters & Logging"]
        Domain["Core Services (Authoritative Logic)"]
        Prisma["Prisma ORM"]
    end

    subgraph DataTier["Data Tier"]
        Postgres[("PostgreSQL")]
    end

    Web -->|HTTP / JSON / CORS| API
    Mobile -.->|Canonical HTTP API| API
    MCP -.->|Authorized Service Calls| Domain

    API --> GlobalFilters
    GlobalFilters --> Domain
    Domain --> Prisma
    Prisma -->|TCP Connection Pool| Postgres
```

## 2. Core Architectural Principles

1. **Frontend Isolation**:
   - The React web application (`apps/web`) is strictly an HTTP client consuming the NestJS REST API.
   - It possesses zero direct database access, has no knowledge of PostgreSQL connection strings, and never imports Prisma or raw SQL queries.

2. **Authoritative Backend**:
   - Authoritative business logic, course verification, learner evaluations, and progress persistence reside exclusively in the NestJS application (`apps/api`).
   - The UI never computes or stores authoritative state.

3. **Canonical API Surface**:
   - Application endpoints are prefixed with `/api/v1`.
   - The API is formally documented via OpenAPI 3.0 at `/docs` (and `/docs-json`), allowing identical consumption by the React web client, future native mobile applications, and automated clients.

4. **MCP Tool Integration Strategy**:
   - Model Context Protocol (MCP) authoring and discovery tools, when introduced, must invoke the exact same authorized domain services as HTTP controllers.
   - MCP tools must not bypass business rules, authorization gates, or data integrity constraints.

5. **AI as an Unblocked, Optional Layer**:
   - Artificial intelligence runtime capabilities (e.g. adaptive quest generation, tutoring assistance) are non-blocking enhancement layers.
   - Core course creation, learning workflows, evaluation, and progress persistence must function deterministically without requiring an active AI model.

6. **Modular Monolith**:
   - The backend is organized as a modular monolith within a single deployable NestJS service.
   - Microservices, message brokers (Kafka/RabbitMQ), and distributed caches (Redis) are deliberately avoided until concrete scale or domain boundaries necessitate them.


## 3. Activity Block Protocol (ABP v0.2) & Minimal Runtime

```mermaid
flowchart TD
    subgraph Authoring["1. Authoring & Validation"]
        Registry["Developer-Owned Block Registry\n(video, multiple-choice, coding)"]
        Draft["CourseDraft (Mutable Revision N)\n+ DraftBlockInstances"]
        Registry -->|Validate Schema & Invariants| Draft
    end

    subgraph Snapshotting["2. Immutable Snapshotting"]
        CourseVersion["CourseVersion (Immutable vX)\nSnapshot: { blocks: [...] }"]
        Draft -->|createVersion under Row Lock| CourseVersion
    end

    subgraph Runtime["3. ABP Runtime Execution"]
        Run["ABRun (Pinned to CourseVersion vX)\nStatus: Created -> Active <-> Suspended -> Closed"]
        Attempt["ABAttempt\n(Submitted Response + Assistance Provenance)"]
        Evaluator["Server Evaluator\n(Protected Answer Key Assessment)"]
        Assessment["AssessmentResult\n(Score, Correctness, Feedback)"]
        EventLog["ABEvent (Audit Trail of Accepted Facts)"]

        CourseVersion -->|Instantiate Run| Run
        Run -->|SUBMIT_RESPONSE Command| Attempt
        Attempt -->|Evaluated by| Evaluator
        Evaluator --> Assessment
        Run -->|Accepted Facts| EventLog
    end
```

### ABP Architectural Responsibilities
1. **Definition**: Developer-defined `ABTypeManifest` dictates structure, validation, schema, and capabilities. Creators cannot delete or weaken required structure.
2. **Configuration**: Creator-configured `DraftBlockInstance` inside an owned `CourseDraft`. Revisions participate in atomic optimistic locking.
3. **Snapshotting**: `CourseVersion` captures an immutable, validated snapshot of activities. Mutable draft edits never leak into historical versions.
4. **Runtime**: `ABRun` executes strictly against a pinned `CourseVersion`. Lifecycle follows `CREATED → ACTIVE ↔ SUSPENDED → CLOSED` (`COMPLETED`, `ABANDONED`, `FAILED`).
5. **Host Commands**: Commands are validated requests. Repeated requests with the same `idempotencyKey` prevent duplicate attempts or events.
6. **Events & Results**: Authoritative evaluation occurs on the server. Answer keys are strictly stripped from learner payloads.
7. **Learning Science Invariants**:
   - Video completion is ungraded and produces no score, pass, or mastery.
   - Assisted/hinted attempts retain distinct provenance from independent attempts.
