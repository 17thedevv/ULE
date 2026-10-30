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


## 4. Phase 3: Trusted Learning Evidence & Minimal LII Foundation

```mermaid
flowchart TD
    subgraph Access["1. Access Delegation"]
        Owner["Course Owner"] -->|Explicit Grant (CourseVersion)| Grant["CourseAccessGrant (ACTIVE)"]
        Learner["Registered Learner"] -->|Authorized via Grant| LearnerRun["Learner ABRun"]
    end

    subgraph RuntimeEvents["2. Authentic ABP Facts"]
        LearnerRun -->|Submit Response| Attempt["ABAttempt + AssessmentResult"]
        LearnerRun -->|Finish Video| Completion["RUN_COMPLETED (ungraded)"]
    end

    subgraph Ledger["3. Idempotent Evidence Ledger"]
        Attempt -->|Evaluated Ingestion| Ev1["LearningEvidence (EVALUATED)\nProvenance: SERVER_OBSERVED\nUnique: runId+attemptId+skillId"]
        Completion -->|Progress Ingestion| Ev2["LearningEvidence (COMPLETION_ONLY)\nNo Graded Score"]
    end

    subgraph Projections["4. Minimal LII Skill Projections"]
        Ev1 --> Projection["LearnerSkillProjection\nState: INSUFFICIENT_EVIDENCE\n| DEVELOPING | READY_TO_VERIFY\n(Never Premature Mastery)"]
        Ev2 -.->|Progress Metrics Only| Progress["Course Progress (0..100%)\nisMastered: false"]
    end
```

### Key Boundaries & Invariants
1. **Explicit Private Learner Access**: Private CourseVersions require explicit owner-issued `CourseAccessGrant` records. Grant revocation immediately prevents starting new runs and rejects in-flight commands (HTTP 403 Forbidden).
2. **Course-Scoped Skills & Versioned Snapshots**: Skills and block-to-skill mappings are course-scoped and freeze into immutable `CourseVersion.snapshot` upon version creation.
3. **Evidence Ledger Idempotency & Provenance**: Evidence is ingested deterministically with database uniqueness constraints (`[runId, attemptId, skillId]`). Server-delivered hints strictly enforce `SERVER_OBSERVED` assistance provenance, overriding client claims.
4. **Pedagogical Distinctions**:
   - Activity progress $\neq$ submitted attempt $\neq$ assessment result $\neq$ learning evidence $\neq$ skill state $\neq$ verified mastery claim.
   - Non-evaluatable video completion produces progress metrics only, never graded skill evidence or mastery.
   - Deferred feedback policy redacts correctness and scores until runs are `CLOSED (COMPLETED)`.
5. **Conservative Skill State Projections**: Deterministic projections derive `INSUFFICIENT_EVIDENCE`, `DEVELOPING`, or `READY_TO_VERIFY` states with transparent reasoning and missing evidence explanations. `VERIFIED` mastery is strictly out of scope for this slice and is never granted.
6. **Append-Only Assessment Corrections**: Corrections append an auditable `AssessmentCorrection` record and idempotently re-evaluate affected evidence and skill projections without mutating history.

## 5. Phase 4: Course Gamification, Economy Isolation & Deterministic Journey MVP

```mermaid
flowchart TD
    subgraph Enrollment["1. Enrollment & Authorization"]
        Grant["CourseAccessGrant (ACTIVE)\nOwner-Delegated Auth Gate"]
        Enrollment["CourseEnrollment\nLearner Journey Lifecycle\n(ACTIVE | PAUSED | COMPLETED)"]
        Grant -->|Authorizes| Enrollment
    end

    subgraph Facts["2. Fact Qualification Pipeline"]
        ABEvent["ABP Runtime Event\n(RUN_COMPLETED / SUBMIT_RESPONSE)"]
        Evidence["LearningEvidence\n(EVALUATED / COMPLETION_ONLY)"]
        QualService["QualificationService\n(Closed Fact Allowlist)"]
        Fact["QualifyingFact\nACTIVITY_COMPLETED\nINDEPENDENT_PRACTICE_CONFIRMED\nUnique: sourceKey"]

        ABEvent --> QualService
        Evidence --> QualService
        QualService --> Fact
    end

    subgraph Quests["3. Quest Engine & Progress"]
        Fact --> Engine["QuestEngine (Idempotent Ingestion)"]
        PinnedDef["CourseVersion.snapshot.quests\n(Immutable Quest Definitions)"]
        PinnedDef --> Engine
        Instance["QuestInstance\nScope: COURSE | GLOBAL\nUnique: enrollmentId + questKey + occurrence"]
        Progress["QuestObjectiveProgress\n(Target Count / Completion)"]
        Consumption["QuestFactConsumption\n(Exactly-Once Deduplication)"]

        Engine --> Instance
        Instance --> Progress
        Engine --> Consumption
    end

    subgraph Economy["4. Dual-Ledger Economy Isolation"]
        CourseReward["CourseRewardGrant / Adjustment\n(Course XP Only)"]
        PlatformReward["PlatformRewardGrant / Adjustment\n(Platform-Owned Rewards Only)"]
        Instance -->|Course Scope| CourseReward
        Instance -->|Global Scope| PlatformReward
    end

    subgraph Agency["5. Deterministic Journey Planner"]
        Goal["Explicit Learner Goal"] --> Planner["JourneyPlanner\nDeterministic Filter & Multi-Factor Rank"]
        Planner --> DAG["Short-Horizon DAG\n(REQUIRED, OPTIONAL, CHOICE, FALLBACK)\nRevisions R0-R3"]
    end
```

### Key Boundaries & Invariants
1. **Enrollment vs. Access Grant**: `CourseAccessGrant` controls authorization; `CourseEnrollment` tracks participation context. Revoking a grant immediately suspends runtime and quest progression; re-granting resumes active enrollment.
2. **Pedagogical Integrity**:
   - Quest completion is participation and practice achievement, **never verified skill mastery**.
   - Video completion qualifies `ACTIVITY_COMPLETED` (participation-only) and never satisfies independent practice.
   - Assisted attempts, repetitions, and unreleased `DEFERRED` feedback never qualify for practice quests.
3. **Dual Economy Isolation**:
   - Zero exchange rate, zero currency conversion between Course XP and Platform XP.
   - Course creators cannot configure global quests or mint platform rewards.
   - Adjustments resulting from `AssessmentCorrection` append compensating entries; historical grants are never deleted.
4. **Deterministic Concurrency & Lock Hierarchy**:
   - Strict lock acquisition order prevents deadlocks: `Grant FOR SHARE` -> `Run FOR UPDATE` -> `Skill Advisory Lock` -> `QuestInstance FOR UPDATE (sorted ASC)` -> `Reward Append`.
5. **Learner Agency**:
   - Journey Planner presents bounded candidate options with transparent reason codes.
   - Journey does not act as a Course Flow Resolver and never hijacks ABP runtime navigation.


