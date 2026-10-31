# ULE Phase 5.5 — Exam PR #2: D0 Runtime Architecture Report
## ExamAttempt Runtime, Timed Sessions & Deterministic Auto-Grading

**Document Status:** Approved D0 Baseline  
**Date:** 2026-10-31  
**Author:** Principal Software Architect, Senior NestJS/Prisma Engineer, Assessment Systems Engineer, Security Reviewer  
**Repository Baseline:** `17thedevv/ULE` on `main` at merge commit `86aedc0f04bf498dc09afd8316483d6742200d56` (PR #8 merged cleanly with verified CI)  
**Target Branch:** `feat/phase-5-5-exam-attempt-runtime`  

---

### 1. Architectural Mission & Baseline Verification

Phase 5.5 Assessment Foundation (PR #8) successfully established the creator-facing Question Bank and immutable `AssessmentVersion` blueprint lifecycle.
The mission of **Phase 5.5 — Exam PR #2** is to transform these frozen examination blueprints into an operational, secure, and deterministic examination runtime for authorized learners.

#### Baseline Verification
- **Merge SHA on `main`:** `86aedc0f04bf498dc09afd8316483d6742200d56` (`Merge pull request #8 from 17thedevv/feat/phase-5-5-assessment-foundation`)
- **Remote CI Run:** [GitHub Actions Run #41176076438](https://github.com/17thedevv/ULE/actions/runs/41176076438) — `completed / success` (100% green on Lint, Typecheck, Build, Unit, E2E, and Real PostgreSQL DB Integration).
- **Local Active Branch:** `feat/phase-5-5-exam-attempt-runtime` checked out from `86aedc0` and tracking `origin`.

---

### 2. Responsibility Matrix

| Subsystem / Entity | Responsibility Boundary | Scope in Exam PR #2 |
| :--- | :--- | :--- |
| **Activity Block Protocol (ABP / `ABRun`)** | Granular per-block execution for embedded course units (single interactive activities). | **Strictly preserved.** Not reused for full exams. Retains single-block boundary. Evaluator normalization logic (e.g. Unicode CLOZE) is reused without violating boundaries. |
| **Question Bank (`QuestionBankItem`, `QuestionVersion`)** | Creator-owned authoring of modular questions and immutable version snapshots. | **Read-only input.** Exam runtime reads question definitions and trusted answer keys exclusively from published `QuestionVersion` rows. |
| **Assessment Engine (`AssessmentDefinition`, `AssessmentVersion`)** | Multi-section blueprint composition and immutable exam publishing. | **Read-only input.** Exam attempts are pinned to an immutable `AssessmentVersion`. Deletion of referenced blueprints is strictly blocked. |
| **Exam Runtime (`ExamAttempt`, `ExamResponse`)** | Server-authoritative attempt lifecycle, attempt allocation under `maxAttempts`, server-derived timer deadlines, response autosave with CAS revisioning, and atomic submission freezing. | **Core implementation in this PR.** |
| **Deterministic Auto-Grading (`ExamGrade`, `ExamItemGrade`)** | Server-orchestrated scoring for all allowlisted objective question types (`SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE`, `CLOZE`, `NUMERIC`, `MATCHING`, `ORDERING`). | **Core implementation in this PR.** Unbiased, deterministic, bounded scoring without learner trust. |
| **Human-Grading Queue (`ESSAY`, `SHORT_TEXT`)** | Marking open responses as pending human rubric evaluation; calculating partial grades without faking final scores. | **Core foundation in this PR.** Full teacher grading UI and appeals are out of scope. |
| **Result Release Engine (`ExamFeedbackPolicy`)** | Governs when results (scores, item breakdown, correctness) become visible to learners based on policy (`IMMEDIATE`, `ON_SUBMISSION`, `DEFERRED`, `MANUAL`). | **Core implementation in this PR.** Absolute anti-leakage defense. |
| **Learning Evidence & Quest Engine** | Trusted evidence emission, mastery calculation, qualifying facts, and reward settlement. | **Deferred.** Exam authoring and taking emits ZERO premature evidence or quest completions. Exam results become candidate inputs for future evidence pipelines. |

---

### 3. ExamAttempt Lifecycle & State Machine

The examination runtime operates as a strictly server-authoritative, finite-state automaton:

```text
       [Authorized Learner Starts Exam]
                      |
                      v
               +--------------+
               | IN_PROGRESS  | <---+ (Autosave Response with CAS)
               +--------------+     | (Resume Unfinished Exam)
                 |          |
 (Submit before  |          | (now > deadlineAt or
    deadline)    |          |  explicit abandon)
                 v          v
          +-----------+  +-----------+
          | SUBMITTED |  |  EXPIRED  |
          +-----------+  +-----------+
                |              |
                v              v
          +-----------+  (Finalize saved
          |  GRADING  |   responses)
          +-----------+
            |       |
(All objective      | (Contains ESSAY /
 questions)         |  pending items)
            v       v
   +-----------+  +------------------------+
   | COMPLETED |  | GRADING (Pending Human)|
   +-----------+  +------------------------+
```

#### State Transition Invariants
1. **`IN_PROGRESS`**: Initial state upon attempt start. Learner can fetch sanitized question payloads, autosave responses, and reload without losing progress.
2. **`SUBMITTED`**: Transition triggered by the learner submitting before deadline. Atomically freezes the response snapshot and locks out any further modifications.
3. **`GRADING`**: The evaluation orchestrator calculates scores for all auto-gradable items.
   - If **100% of items are auto-gradable**: Transitions immediately to **`COMPLETED`**.
   - If **any item requires human grading** (e.g. `ESSAY`): Remains in **`GRADING`** with `aggregationStatus = PARTIAL_PENDING_HUMAN`.
4. **`EXPIRED` / `ABANDONED`**: If server time exceeds `deadlineAt`, the attempt cannot accept further learner responses. A submit request after deadline or a lazy expiration evaluation transitions the attempt into terminal finalized status.
5. **Terminal Protection**: Once an attempt reaches `SUBMITTED`, `GRADING`, `COMPLETED`, or `EXPIRED`, all subsequent autosave writes are strictly rejected (`HTTP 409 Conflict` or `HTTP 400 Bad Request`).
6. **Idempotent Submission**: Retrying submission on an already submitted attempt returns the existing submission outcome without duplicate scoring or state perturbation.

---

### 4. Database Schema Design

Four new relational models and two enums are introduced in Prisma:

```prisma
enum ExamAttemptStatus {
  IN_PROGRESS
  SUBMITTED
  GRADING
  COMPLETED
  ABANDONED
  EXPIRED
}

enum ExamGradeAggregationStatus {
  FULLY_GRADED
  PARTIAL_PENDING_HUMAN
}

model ExamAccessGrant {
  id                     String               @id @default(uuid())
  assessmentDefinitionId String
  assessmentDefinition   AssessmentDefinition @relation(fields: [assessmentDefinitionId], references: [id], onDelete: Cascade)
  userId                 String
  user                   User                 @relation("LearnerExamGrants", fields: [userId], references: [id], onDelete: Cascade)
  grantedById            String
  grantedBy              User                 @relation("GrantedByExamCreator", fields: [grantedById], references: [id], onDelete: Restrict)
  status                 AccessGrantStatus    @default(ACTIVE)
  revokedAt              DateTime?
  createdAt              DateTime             @default(now())
  updatedAt              DateTime             @updatedAt

  @@unique([assessmentDefinitionId, userId])
  @@index([userId])
  @@index([assessmentDefinitionId])
  @@map("exam_access_grants")
}

model ExamAttempt {
  id                  String            @id @default(uuid())
  assessmentVersionId String
  assessmentVersion   AssessmentVersion @relation(fields: [assessmentVersionId], references: [id], onDelete: Restrict)
  learnerId           String
  learner             User              @relation("LearnerExamAttempts", fields: [learnerId], references: [id], onDelete: Restrict)
  attemptNumber       Int
  status              ExamAttemptStatus @default(IN_PROGRESS)
  idempotencyKey      String?
  startedAt           DateTime          @default(now())
  deadlineAt          DateTime?
  submittedAt         DateTime?
  completedAt         DateTime?
  revision            Int               @default(1)
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  responses ExamResponse[]
  grade     ExamGrade?

  @@unique([assessmentVersionId, learnerId, attemptNumber])
  @@unique([assessmentVersionId, learnerId, idempotencyKey])
  @@index([learnerId])
  @@index([assessmentVersionId])
  @@index([status])
  @@map("exam_attempts")
}

model ExamResponse {
  id                String          @id @default(uuid())
  examAttemptId     String
  examAttempt       ExamAttempt     @relation(fields: [examAttemptId], references: [id], onDelete: Cascade)
  itemRefId         String
  questionVersionId String
  questionVersion   QuestionVersion @relation(fields: [questionVersionId], references: [id], onDelete: Restrict)
  responsePayload   Json
  revision          Int             @default(1)
  savedAt           DateTime        @default(now())
  isFinal           Boolean         @default(false)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  @@unique([examAttemptId, itemRefId])
  @@index([examAttemptId])
  @@index([questionVersionId])
  @@map("exam_responses")
}

model ExamGrade {
  id                 String                     @id @default(uuid())
  examAttemptId      String                     @unique
  examAttempt        ExamAttempt                @relation(fields: [examAttemptId], references: [id], onDelete: Cascade)
  objectivePoints    Float                      @default(0)
  pendingHumanPoints Float                      @default(0)
  totalAwardedPoints Float                      @default(0)
  maxPossiblePoints  Float
  percentageScore    Float                      @default(0)
  isPassing          Boolean                    @default(false)
  aggregationStatus  ExamGradeAggregationStatus
  evaluatorVersion   String                     @default("ule-exam-evaluator-v1")
  evaluatedAt        DateTime                   @default(now())
  isReleased         Boolean                    @default(false)
  releasedAt         DateTime?
  createdAt          DateTime                   @default(now())
  updatedAt          DateTime                   @updatedAt

  itemGrades ExamItemGrade[]

  @@index([examAttemptId])
  @@map("exam_grades")
}

model ExamItemGrade {
  id                String          @id @default(uuid())
  examGradeId       String
  examGrade         ExamGrade       @relation(fields: [examGradeId], references: [id], onDelete: Cascade)
  itemRefId         String
  questionVersionId String
  questionVersion   QuestionVersion @relation(fields: [questionVersionId], references: [id], onDelete: Restrict)
  questionType      QuestionType
  maxPoints         Float
  awardedPoints     Float           @default(0)
  isCorrect         Boolean         @default(false)
  isPendingHuman    Boolean         @default(false)
  evaluationDetails Json?
  createdAt         DateTime        @default(now())

  @@unique([examGradeId, itemRefId])
  @@index([examGradeId])
  @@index([questionVersionId])
  @@map("exam_item_grades")
}
```

---

### 5. Authorization & Eligibility Matrix

| Context | Authorization Check | Failure Result |
| :--- | :--- | :--- |
| **Creator / Author Access** | `assessmentDefinition.ownerId === userId` | Creator can inspect and test own exams. |
| **Course-Linked Exam** (`courseId != null`) | Learner must hold an active `CourseAccessGrant` where `status == ACTIVE` and `revokedAt == null`. | `HTTP 403 Forbidden` (`Learner does not have active enrollment in course`) |
| **Standalone Exam** (`courseId == null`) | Learner must hold an active `ExamAccessGrant` (`status == ACTIVE`, `revokedAt == null`) or be the owner. | `HTTP 403 Forbidden` (`Learner does not hold valid access grant for exam`) |
| **Attempt Limit** (`maxAttempts != null`) | Number of existing non-abandoned attempts must be `< assessmentVersion.maxAttempts`. Concurrency locked via aggregate transaction. | `HTTP 403 Forbidden` (`Maximum attempt limit reached`) |
| **Active Attempt Conflict** | If an attempt is currently `IN_PROGRESS` and within deadline, learner must resume it rather than spawning a concurrent duplicate attempt. | `HTTP 409 Conflict` (or returns existing active attempt on matching idempotency key). |

---

### 6. Server-Authoritative Timing & Expiration Policy

1. **Deadline Derivation**:
   - `durationMinutes` is read strictly from the immutable `AssessmentVersion` blueprint.
   - If `durationMinutes > 0`: `deadlineAt = startedAt + (durationMinutes * 60 * 1000)`.
   - If `durationMinutes == null` (untimed): `deadlineAt = null`.
2. **Client Clocks are Never Trusted**:
   - The browser timer is strictly an informational UI widget.
   - All comparisons compare server `new Date()` (UTC) against `attempt.deadlineAt`.
3. **Lazy Expiration Reconciliation**:
   - Whenever an attempt is read or mutated: If `attempt.status === 'IN_PROGRESS'` and `attempt.deadlineAt && now > attempt.deadlineAt`, the system automatically finalizes the attempt as `EXPIRED` (or auto-submits current saved responses if policy permits). Late autosaves are rejected with `HTTP 400 Bad Request` (`Examination session has expired`).

---

### 7. Deterministic Auto-Grading Specifications

| Question Type | Evaluator Algorithm | Normalization & Edge-Case Protection |
| :--- | :--- | :--- |
| **`SINGLE_CHOICE`** | Exact matching: `submission.selectedOptionId === answerKey.correctOptionId`. | Bounded score: full points if matched, 0 if not. |
| **`MULTIPLE_CHOICE`** | Set equality: Submitted array must contain all `answerKey.correctOptionIds` and zero incorrect option IDs. | Order-independent Set comparison. Partial credit is not inferred without explicit rubric. |
| **`TRUE_FALSE`** | Exact boolean comparison: `submission.selectedBoolean === answerKey.correctValue`. | Type-checked boolean comparison. |
| **`CLOZE`** | Unicode NFKC normalization, lowercase trimming, and accepted variant array matching for every blank. | Reuses proven Cloze ABP evaluation logic. All blanks must match an accepted variant for 100% item points. |
| **`NUMERIC`** | Absolute tolerance `\|v - target\| <= tol` or Percentage tolerance `\|v - target\| <= tol * \|target\| / 100`. | Rejects `NaN`, `Infinity`, non-numeric inputs. Zero-target percentage fallback handled cleanly. |
| **`MATCHING`** | Permutation check: for every `premiseId` in content, `submission.pairs[premiseId] === answerKey.pairs[premiseId]`. | All premises must be mapped and match the authoritative answer key. |
| **`ORDERING`** | Strict sequence equality: `submission.sequence[i] === answerKey.correctSequence[i]` for all indices. | Strict bijection: submitted array must match correct sequence exactly. |
| **`ESSAY`** | **Human Rubric Graded Only**. Auto-grading awards 0 points and marks `isPendingHuman = true`. | Naive string matching is strictly forbidden. |
| **`SHORT_TEXT`** | Marked `isPendingHuman = true` pending educator review. | Bounded scoring, preserves submitted text. |

---

### 8. Result Release Matrix (`ExamFeedbackPolicy`)

| Feedback Policy | During Active Attempt | Immediately Upon Submission | Pre-Deadline Release State | Post-Deadline / Manual Action |
| :--- | :--- | :--- | :--- | :--- |
| **`IMMEDIATE`** | Withheld | Released immediately | Released | Released |
| **`ON_SUBMISSION`** | Withheld | Released immediately upon final submission | Released | Released |
| **`DEFERRED`** | Withheld | **Withheld** (`status = WITHHELD_PENDING_DEADLINE`) | **Withheld** | **Released** once `serverNow >= attempt.deadlineAt`. |
| **`MANUAL`** | Withheld | **Withheld** (`status = WITHHELD_MANUAL`) | **Withheld** | **Withheld** until educator triggers `releaseGrades()`. |

**Anti-Leakage Guarantees:**
- Pre-release requests to `/api/v1/exam-attempts/:attemptId/result` return sanitized metadata (attempt status, submitted timestamp, policy notice), but strictly omit `objectivePoints`, `percentageScore`, item-by-item correctness, and answer keys.
- Autosave and resume payloads never include correctness or score markers.

---

### 9. Concurrency & Transaction Strategy

1. **Attempt Allocation Concurrency (`maxAttempts = 1`)**:
   - Inside `$transaction`:
     `SELECT id FROM exam_attempts WHERE "assessmentVersionId" = ${vId} AND "learnerId" = ${learnerId} FOR UPDATE`
   - Uniqueness constraint `@@unique([assessmentVersionId, learnerId, attemptNumber])` guarantees database-enforced non-bypassability.
2. **Autosave CAS Concurrency**:
   - `PUT /responses/:itemId` checks `expectedRevision`. Updates increment revision. Stale revisions trigger `HTTP 409 Conflict`.
3. **Atomic Submission & Freeze**:
   - `POST /submit` executes under `SELECT id FROM exam_attempts WHERE id = ${id} FOR UPDATE`.
   - Freezes `ExamResponse` rows with `isFinal = true`.
   - Computes deterministic grades and inserts `ExamGrade` and `ExamItemGrade` atomically.

---

### 10. Identified Risks & Accepted Trade-offs

1. **Risk:** In background environments without cron daemons, attempts could remain in `IN_PROGRESS` past `deadlineAt`.
   - **Mitigation (Accepted):** Lazy server-side evaluation. Any read or write to an attempt automatically evaluates server time against `deadlineAt` and transitions overdue attempts to `EXPIRED` before processing.
2. **Risk:** Mixed exams with human-graded essays cannot produce immediate final mastery facts.
   - **Mitigation (Accepted):** `ExamGradeAggregationStatus.PARTIAL_PENDING_HUMAN` keeps attempts in `GRADING` state until teacher grading PR is delivered. Zero premature mastery or evidence is emitted.
