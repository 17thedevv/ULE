# ULE Phase 5.5 — Exam PR #3: D0 Architecture Report
## Human Rubric Grading, Grade Revisions & Appeals

**Document Status:** Approved D0 Baseline  
**Date:** 2026-10-31  
**Author:** Principal Software Architect, Senior NestJS/Prisma Engineer, Assessment & Grading Systems Engineer, Security Reviewer  
**Repository Baseline:** `17thedevv/ULE` on `main` at verified merge commit `55d72da27530df572275cc72e764a6a972e75881` (PR #9 merged cleanly with verified CI)  
**Target Branch:** `feat/phase-5-5-human-grading-appeals`  

---

### 1. Architectural Mission & Baseline Verification

Phase 5.5 Assessment Foundation (PR #8) established creator-facing Question Banks and immutable `AssessmentVersion` blueprints. Phase 5.5 Exam Runtime (PR #9) established server-authoritative `ExamAttempt` execution, strict deadline timers, autosave with optimistic concurrency, and deterministic auto-grading across all 7 objective question types.

The mission of **Phase 5.5 — Exam PR #3** is to implement the end-to-end **Human Grading, Grade Revision & Appeals** lifecycle for examinations containing subjective items (`ESSAY` and `SHORT_TEXT`).

#### Baseline Verification
- **Verified Merge SHA on `main`:** `55d72da27530df572275cc72e764a6a972e75881` (`Merge pull request #9 from 17thedevv/feat/phase-5-5-exam-attempt-runtime`).
- **Remote CI Run:** [GitHub Actions Run #41187102657](https://github.com/17thedevv/ULE/actions/runs/41187102657) — `completed / success` (100% green on Lint, Typecheck, Build, Unit, E2E, and Real PostgreSQL DB Integration).
- **Active Working Branch:** `feat/phase-5-5-human-grading-appeals` branched cleanly from `55d72da`.

---

### 2. D0 Architecture Audit & System Inventory

| Subsystem / Model | Existing Responsibility | Interaction in Exam PR #3 |
| :--- | :--- | :--- |
| **`QuestionBankItem` / `QuestionVersion`** | Creator-owned authoring of modular items and frozen published snapshots. | **Read-only input.** Rubrics (e.g. `EssayRubric`) and answer keys are read strictly from immutable `QuestionVersion` rows. Never mutated during grading. |
| **`AssessmentDefinition` / `AssessmentVersion`** | Exam blueprint definition and published immutable snapshot with sections and item point weights. | **Read-only input & Authorization root.** Assessment ownership (`creatorId`) defines the authoritative grader. Blueprint snapshot provides pinned `points` and `feedbackPolicy`. |
| **`ExamAttempt`** | Lifecycle state machine (`IN_PROGRESS`, `SUBMITTED`, `GRADING`, `COMPLETED`, `EXPIRED`, `ABANDONED`). | **State transition target.** Mixed exams enter `GRADING` upon submission. When all human-evaluated items are resolved, transitions atomically to `COMPLETED`. |
| **`ExamResponse`** | Frozen learner response payload (`responsePayload: Json`) with revision and `isFinal: true`. | **Read-only evaluation subject.** Submitted responses are completely immutable. Human grading evaluates the frozen answer; the student's text is never edited or overwritten. |
| **`ExamGrade`** | Authoritative exam aggregate score (`objectivePoints`, `pendingHumanPoints`, `totalAwardedPoints`, `percentageScore`, `isPassing`, `aggregationStatus`). | **Authoritative current summary.** Calculated partially on submission (`PARTIAL_PENDING_HUMAN`); recomputed atomically upon human item evaluation and grade corrections into `FULLY_GRADED`. |
| **`ExamItemGrade`** | Per-item score observation (`awardedPoints`, `isCorrect`, `isPendingHuman`, `evaluationDetails`). | **Authoritative current item score.** Human evaluation updates `awardedPoints`, `isCorrect`, sets `isPendingHuman = false`, and attaches rubric scoring breakdown. |
| **`AssessmentCorrection` (ABP)** | Append-only correction ledger for Activity Block Protocol (`assessment_results`). | **Reference pattern only.** Bound via foreign key to ABP `AssessmentResult` (`ABRun`). **Must NOT be reused directly** for exams; exam runtime requires dedicated append-only ledgers (`ExamHumanGradeRevision` and `ExamGradeRevision`). |
| **`LearningEvidence` & Quest Engine** | Trusted learning evidence ledger, skill projections, qualifying facts, and reward settlement. | **Strictly isolated.** Human grading, grade finalization, corrections, and appeals emit **zero** premature LearningEvidence or Quest progress. |

---

### 3. Human Grading State Machine

The human-grading lifecycle integrates seamlessly with the existing `ExamAttempt` state machine:

```text
[Exam Attempt Submitted]
          |
          v
+-----------------------------------+
| ExamAttempt: GRADING              |
| ExamGrade: PARTIAL_PENDING_HUMAN  |
| percentageScore: null             |
| isPassing: null                   |
| isReleased: false                 |
+-----------------------------------+
          |
          | (Creator fetches queue: GET /api/v1/exam-grading/queue)
          v
+-----------------------------------+
| Pending Human ExamItemGrades      |
| (isPendingHuman: true)            |
+-----------------------------------+
          |
          | (Authorized Rubric Evaluation: POST /api/v1/exam-grading/items/:id/evaluations)
          v
+-------------------------------------------------------------+
| Item Grade Updated (awardedPoints, isPendingHuman: false)   |
| Append-only Revision logged in ExamHumanGradeRevision       |
+-------------------------------------------------------------+
          |
          +---> [Are any other items still isPendingHuman: true?]
          |       |
          |       +-- YES --> Attempt remains GRADING
          |
          +-- NO (All required human items finalized)
                  |
                  v
+-------------------------------------------------------------+
| Finalize Attempt: POST /api/v1/exam-grading/attempts/:id/finalize
| (or auto-finalized upon last pending item completion)        |
| - totalAwardedPoints = objectivePoints + humanPoints        |
| - pendingHumanPoints = 0                                    |
| - percentageScore = (totalAwardedPoints / maxPossible) * 100|
| - isPassing = percentageScore >= passingScorePercentage     |
| - ExamGrade.aggregationStatus = FULLY_GRADED                |
| - ExamAttempt.status = COMPLETED (completedAt: server now)  |
| - ExamGradeRevision appended                                |
| - Apply Feedback Release Policy                             |
+-------------------------------------------------------------+
```

#### Invariants:
1. **Prior Submission Required:** Only attempts in `GRADING` status with an existing `ExamGrade` can be graded. Public APIs reject grading attempts in `IN_PROGRESS`, `EXPIRED`, or `ABANDONED` (`HTTP 400 Bad Request`).
2. **Objective Item Protection:** Endpoints for human evaluation reject attempts to score objective items (`SINGLE_CHOICE`, `CLOZE`, etc.) (`HTTP 400 Bad Request`).
3. **Null Scores Until Full Grading:** `percentageScore` and `isPassing` remain `null` while any item remains `isPendingHuman = true`.
4. **Idempotent Finalization:** Multiple finalization requests for an already finalized attempt are idempotent and return the current final grade without duplicate scoring.
5. **Unanswered Subjective Items Policy:**
   - If a learner did not attempt a subjective question (`responsePayload == null` or empty), the item was marked `isPendingHuman: true` by the submission auto-grader.
   - **Explicit Disposition Policy:** The authorized grader can record a rubric evaluation with 0 points and disposition comment `"UNANSWERED"`, OR the finalization engine disposes unattempted subjective items deterministically with `awardedPoints: 0`, `isCorrect: false`, `isPendingHuman: false`, and evaluation details `{ status: 'DISPOSED_UNANSWERED', reason: 'Learner left response blank' }`. An audit revision is appended, making the 0-score deterministic and distinguishable from an evaluated 0-point answer.

---

### 4. Rubric-Based Grading Engine & Score Normalization

#### Rubric Schema (`EssayRubric`)
Pinned inside the immutable `QuestionVersion`:
```typescript
interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
  levels?: RubricCriterionLevel[];
}

interface EssayRubric {
  criteria: RubricCriterion[];
  overallGuidelines?: string;
}
```

#### Evaluation Input Validation
When an educator submits rubric evaluation:
1. Every criterion in the pinned rubric must be evaluated.
2. Missing criteria, unknown criteria, and duplicate criteria are strictly rejected (`HTTP 400 Bad Request`).
3. Criterion scores must be finite, non-negative numbers: `0 <= criterionScore <= criterion.maxPoints`.
4. Values such as `NaN`, `Infinity`, negative numbers, or strings are rejected.
5. Grader feedback / comments are sanitized and bounded (`maxLength: 2000`).

#### Point Normalization Formula
Examination blueprints allow creators to override item points (`AssessmentVersionItem.points` or `ExamItemGrade.maxPoints`), which may differ from the sum of rubric criteria max points:
$$\text{rubricRawMax} = \sum_{c \in \text{criteria}} c.\text{maxPoints}$$
$$\text{rubricRawAwarded} = \sum_{c \in \text{criteria}} \text{score}(c)$$

If $\text{rubricRawMax} > 0$:
$$\text{normalizedPoints} = \text{round}_2 \left( \frac{\text{rubricRawAwarded}}{\text{rubricRawMax}} \times \text{itemMaxPoints} \right)$$
Where $\text{round}_2(x) = \frac{\lfloor x \times 100 + 0.5 \rfloor}{100}$.

If $\text{rubricRawMax} == 0$ (e.g. unweighted rubric), $\text{awardedPoints} = 0$.

**Bounded Points Invariant:**
$$0 \le \text{awardedPoints} \le \text{ExamItemGrade.maxPoints}$$

#### `SHORT_TEXT` Evaluation
If a `SHORT_TEXT` question requires human grading (e.g. manual review of responses not matching automated acceptable strings):
- Grader submits `awardedPoints` directly, bounded by $0 \le \text{awardedPoints} \le \text{itemMaxPoints}$.
- Grader must supply a non-empty `feedback` / `justification` string explaining the score.
- Naive automated string matching is not applied during human grading.

---

### 5. Grader Authorization Matrix

Authorization strictly reuses authenticated Better Auth sessions and Assessment ownership:

| Actor | Action | Permitted? | Condition |
| :--- | :--- | :--- | :--- |
| **Assessment Creator** | Fetch grading queue for assessment | **YES** | `assessmentDefinition.creatorId === user.id` |
| **Assessment Creator** | Grade subjective items (`ESSAY`, `SHORT_TEXT`) | **YES** | `assessmentDefinition.creatorId === user.id` |
| **Assessment Creator** | Finalize grade & apply release policy | **YES** | `assessmentDefinition.creatorId === user.id` |
| **Assessment Creator** | Correct finalized grade / resolve appeal | **YES** | `assessmentDefinition.creatorId === user.id` |
| **Learner** | Grade own attempt | **NO** | `HTTP 403 Forbidden` (`attempt.learnerId === user.id`) |
| **Unrelated Creator** | Access or grade another creator's exam | **NO** | `HTTP 403 Forbidden` |
| **Learner** | View pending human grading breakdown | **NO** | Protected until released (`HTTP 200` with notice, or `HTTP 403`) |
| **Learner** | Submit grade appeal | **YES** | `attempt.learnerId === user.id` AND attempt is `COMPLETED` AND `isReleased: true` |

**Security Rules:**
- Grader identity (`actorId`, `gradedById`, `reviewerId`) is always extracted from the authenticated server session (`req.user.id`). Client-supplied actor IDs are strictly ignored.
- Grader-only comments and rubric point calculations are withheld from learners until official release.

---

### 6. Database Design — Append-Only Audit History

To satisfy the core invariant ("A grade may evolve through authorized revisions, but its historical grading decisions, supporting evidence and prior released outcomes must remain reconstructable and auditable"), three new relational models are added to `schema.prisma`:

#### A. `ExamHumanGradeRevision`
Records each individual human evaluation, regrade, or correction of an `ExamItemGrade`.
- `id: String @id @default(uuid())`
- `examItemGradeId: String`
- `revision: Int` (Monotonically increasing: 1, 2, 3...)
- `actorId: String` (Authenticated grader ID)
- `eventType: ExamGradeRevisionEventType` (`INITIAL_EVALUATION`, `CORRECTION`, `APPEAL_RESOLUTION`, `UNANSWERED_DISPOSITION`)
- `previousAwardedPoints: Float`
- `newAwardedPoints: Float`
- `criterionScores: Json?` (Array of `{ criterionId, score, maxPoints, comment }`)
- `comments: String?` (General feedback)
- `reason: String?` (Mandatory for corrections and appeal resolutions)
- `idempotencyKey: String?`
- `createdAt: DateTime @default(now())`
- Constraints:
  - `@@unique([examItemGradeId, revision])`
  - `@@unique([examItemGradeId, idempotencyKey])`

#### B. `ExamGradeRevision`
Records snapshot versions of the authoritative aggregate `ExamGrade` whenever finalized or corrected.
- `id: String @id @default(uuid())`
- `examGradeId: String`
- `revision: Int` (Monotonically increasing: 1, 2, 3...)
- `actorId: String`
- `eventType: ExamGradeRevisionEventType`
- `previousTotalPoints: Float`
- `newTotalPoints: Float`
- `previousPercentage: Float?`
- `newPercentage: Float?`
- `previousPassingStatus: Boolean?`
- `newPassingStatus: Boolean?`
- `reason: String?`
- `idempotencyKey: String?`
- `createdAt: DateTime @default(now())`
- Constraints:
  - `@@unique([examGradeId, revision])`

#### C. `ExamGradeAppeal`
Represents learner-initiated grade appeals.
- `id: String @id @default(uuid())`
- `examAttemptId: String`
- `examItemGradeId: String?` (Optional specific item appeal; null indicates overall grade appeal)
- `learnerId: String`
- `status: ExamAppealStatus` (`OPEN`, `UNDER_REVIEW`, `RESOLVED_UPHELD`, `RESOLVED_CHANGED`, `REJECTED`, `WITHDRAWN`)
- `reason: String` (Learner justification)
- `gradeRevisionAtSubmission: Int` (Binds appeal to specific grade revision)
- `reviewerId: String?`
- `reviewerNotes: String?`
- `resolution: String?`
- `resolvedAt: DateTime?`
- `createdAt: DateTime @default(now())`
- `updatedAt: DateTime @updatedAt`
- Constraints:
  - `@@index([examAttemptId])`
  - `@@index([learnerId])`
  - `@@index([status])`

---

### 7. Grade Revisions & Corrections Workflow

After an examination is fully graded, an authorized creator may need to correct a grade due to clerical error, reassessment, or appeal resolution.

1. **Optimistic Locking:** The correction request must supply `expectedRevision`. If the current revision in the database does not match, the request is rejected with `HTTP 409 Conflict`.
2. **Atomic Aggregate Recomputation:**
   - In a single database transaction:
     - Lock `ExamAttempt` and `ExamGrade` (`FOR UPDATE`).
     - Update `ExamItemGrade` with new `awardedPoints` and `isCorrect`.
     - Append `ExamHumanGradeRevision` with monotonic `revision = lastRevision + 1`.
     - Recompute `ExamGrade.totalAwardedPoints`, `percentageScore`, and `isPassing`.
     - Append `ExamGradeRevision` with monotonic revision.
     - Commit transaction.
3. **Idempotency Guarantee:** Replaying a correction with the same `idempotencyKey` returns the existing revision without creating duplicate entries. Providing the same key with different payload returns `HTTP 409 Conflict`.

---

### 8. Appeals Lifecycle

```text
[Learner Submits Appeal]
         |
         v
     +--------+
     |  OPEN  | <---+ (Learner may withdraw if OPEN)
     +--------+
         |
         | (Reviewer accepts review)
         v
+------------------+
|  UNDER_REVIEW    |
+------------------+
    |         |        |
    |         |        +---> [RESOLVED_UPHELD] (Score remains unchanged)
    |         |
    |         +------------> [REJECTED]        (Appeal dismissed with reason)
    |
    v
[RESOLVED_CHANGED]
    - Authoritative grade correction applied atomically
    - Score recomputed and release state updated
    - Appeal marked RESOLVED_CHANGED with resolution notes
```

**Appeal Rules:**
- Only completed, released attempts can be appealed.
- Learners can only appeal their own attempts.
- Only one active (`OPEN` or `UNDER_REVIEW`) appeal is permitted per attempt or item to prevent flood attacks.
- Reviewer must be the authorized assessment creator.
- Appeal resolution preserves reviewer identity, timestamp, and reasoned justification.

---

### 9. Result Release & Anti-Leakage Defense

Integrates with all four `ExamFeedbackPolicy` values without exception:

| Feedback Policy | Post-Human Grading Release Behavior | Post-Correction Release Behavior |
| :--- | :--- | :--- |
| **`IMMEDIATE`** | Releases immediately upon full grading (`isReleased = true`, `releasedAt = now`). | Updated score is released immediately. |
| **`ON_SUBMISSION`** | Releases immediately upon full grading (`isReleased = true`, `releasedAt = now`). | Updated score is released immediately. |
| **`DEFERRED`** | Releases only if full grading is complete **AND** server deadline has passed (`now >= attempt.deadlineAt`). Otherwise stays withheld. | If deadline passed, released; otherwise remains withheld. |
| **`MANUAL`** | Remains withheld (`isReleased = false`) until creator explicitly invokes `POST /api/v1/exams/:attemptId/release`. | Remains withheld until explicitly released. |

**Anti-Leakage Guarantees:**
- While `isReleased === false`, `GET /exam-attempts/:id` and `GET /exam-attempts/:id/questions` return sanitized payloads with notice: `"Final scores and pass/fail determination will be released upon completion of grading."`
- Grader internal rubrics, criterion notes, and draft evaluations are never exposed in learner DTOs.

---

### 10. Concurrency Strategy & Lock Ordering

To prevent deadlocks and race conditions between concurrent grading, corrections, and submissions:
1. **Canonical Lock Hierarchy (PostgreSQL Row-Level Locks):**
   ```text
   ExamAttempt (FOR UPDATE)
       -> ExamGrade (FOR UPDATE)
           -> ExamItemGrade (FOR UPDATE)
               -> Insert Revision / Appeal
   ```
2. **Linearizability & CAS:**
   - Grader evaluations and corrections verify optimistic concurrency revisions.
   - Database unique constraints (`[examItemGradeId, revision]`, `[examItemGradeId, idempotencyKey]`) enforce that parallel writes cannot duplicate or lose audit revisions.
   - All mutations run within serializable/read-committed transactional boundaries with explicit aggregate recomputation.

---

### 11. Verification Gates Plan

1. **Gate A: Grader Authorization & RBAC**
   - Creator can access grading queue and evaluate items.
   - Learners cannot grade own submissions (403).
   - Cross-creator grading is rejected (403).
2. **Gate B: Rubric Validation & Point Normalization**
   - Criterion score bounds ($0 \le score \le max$).
   - Point normalization handles differing rubric criteria sums.
   - Bounded item points ($0 \le awarded \le item.maxPoints$).
3. **Gate C: Human Grading Lifecycle & State Transitions**
   - Mixed attempt transitions `GRADING` -> `COMPLETED`.
   - Idempotent finalization.
   - Deterministic unanswered question disposition.
4. **Gate D: Append-Only Audit History & Idempotency**
   - Initial evaluation and corrections produce immutable revisions.
   - Monotonic revisions.
   - Replay idempotency.
5. **Gate E: Concurrency & Linearizability**
   - Two parallel graders cannot overwrite one score without conflict.
   - Stale expectedRevision returns 409 Conflict.
6. **Gate F: Appeals Lifecycle**
   - Learner creates appeal on released attempt.
   - Duplicate appeal prevention.
   - Reviewer resolution (Upheld, Rejected, Changed with correction).
7. **Gate G: Release Policies & Anti-Leakage**
   - `IMMEDIATE`, `ON_SUBMISSION`, `DEFERRED`, `MANUAL` policies strictly respected.
   - Zero leak of unreleased grades or educator comments.
8. **Gate H: Pinned Blueprint & Version Immutability**
   - Questions and assessments remain completely immutable.
9. **Gate I: Zero Premature Evidence or Gamification Emissions**
   - Zero LearningEvidence, QualifyingFact, or Quest progress emitted.
10. **Gate J: Backward Compatibility**
   - All existing 486 tests across Course, ABP, Evidence, Quest, Foundation, and Exam Runtime remain 100% green.
