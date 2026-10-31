# ULE Phase 5.5: Assessment & Examination Engine
## D0 Architecture, Readiness Audit & Proposed Implementation Blueprint

> **Status**: D0 Architecture Proposal & Assessment Foundation Design  
> **Date**: 30 October 2026  
> **Repository**: `17thedevv/ULE`  
> **Baseline Commit**: `0780722ddb0437a759bb85497658690e819342f4` (`main` HEAD, PR #7 merged)  
> **Branch**: `feat/phase-5-5-assessment-foundation`  
> **Target Scope**: Phase 5.5 Exam Foundation — Question Bank, Versioning, Blueprint Composition & Immutable Assessment Publishing

---

## 1. Executive Summary & Repository Baseline Audit

Following the successful merge of Phase 5 PR #7 (`0780722`), ULE has established:
1. **Course Core & ABP Runtime**: Immutable `CourseVersion` snapshots containing sequentially ordered activity blocks (`DraftBlockInstance`), executed through `ABRun`, `ABAttempt`, `AssessmentResult`, and `AssessmentCorrection`.
2. **Learning Evidence & LII**: Deterministic skill evidence categorization (`LearningEvidence`) and learner skill projections (`LearnerSkillProjection`) under strict repetition and deferred feedback leak prevention rules.
3. **Course Quests & Multi-Domain Proof**: Participation and practice fact qualification (`QualifyingFact`), multi-course distinctness enforcement (`requireDistinctCourses` by canonical `courseId`), fail-closed evidence gates, and cross-domain compatibility (Mathematics & English Language Learning with allowlisted `cloze` v1.0.0).

### 1.1 The Architectural Gap: Per-Activity ABP vs. Examinations
While the existing ABP engine executes individual learning blocks (e.g. watching an introductory video or solving an isolated practice MCQ), it is fundamentally unsuited for orchestrating **multi-question examinations, timed assessments, midterms, or comprehensive evaluations**:

| Architectural Dimension | Existing ABP Per-Activity Model (`ABRun`) | Examination & Assessment Engine (`AssessmentDefinition` / `AssessmentVersion`) |
| :--- | :--- | :--- |
| **Unit of Execution** | Single activity block instance (e.g., 1 video or 1 MCQ). | Multi-item assessment blueprint composed of multiple questions across sections. |
| **Question Reusability** | Questions are inline configs tightly bound to a single block in a single course draft. | Reusable **Question Bank Items** authored independently and shared across courses and exams. |
| **Versioning & Pinned Immutability** | Block config is snapshotted into `CourseVersion.snapshot`. | Questions have their own immutable `QuestionVersion` lifecycle; exams pin specific question versions. |
| **Item Scoring & Weighting** | Binary 1.0 or single-block float score. | Sectional ordering, custom item point weights, passing score thresholds, and weighted totals. |
| **Evaluator Separation** | Single evaluator per block type. | Mixed-item assessments combining auto-evaluated items (MCQ, Cloze, Numeric) and human-graded rubrics (Essays). |
| **Feedback Policies** | Immediate vs. Deferred per run. | Exam-wide policies: `IMMEDIATE`, `ON_SUBMISSION`, `DEFERRED`, or `MANUAL_RELEASE`. |

---

## 2. Capability & Responsibility Matrix

To guarantee **no duplicate source of truth for the same outcome**, we define the operational boundaries across the ULE architecture:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                               CAPABILITY BOUNDARIES                                     │
├──────────────────────────┬──────────────────────────────────────────────────────────────┤
│ Capability               │ Authoritative Subsystem & Responsible Entity                 │
├──────────────────────────┼──────────────────────────────────────────────────────────────┤
│ 1. Question Bank Items   │ Question Bank Subsystem (QuestionBankItem & QuestionVersion) │
│ 2. Exam Blueprint        │ Assessment Subsystem (AssessmentDefinition & AssessmentVersion)│
│ 3. Per-Item Attempt/Run  │ Future Exam Attempt Subsystem (exam-level attempt session)   │
│ 4. Deterministic Auto-Eval│ ABP Evaluator Registry (reuses multiple-choice, cloze logic) │
│ 5. Rubric-Based Grading  │ Future Human Grading Subsystem (explicitly non-automated)    │
│ 6. Grade Reconciliation  │ Future Exam Correction Ledger (analogous to ADR-011)         │
│ 7. Evidence Intake       │ QualificationService / EvidenceIntake (interprets results)  │
│ 8. Quest Qualification   │ QuestEngineService (consumes authoritative qualified facts)  │
└──────────────────────────┴──────────────────────────────────────────────────────────────┘
```

1. **Per-Activity Evaluation**: Evaluates single response payloads deterministically against allowlisted type contracts.
2. **Multi-Question Examination Orchestration**: Owns section grouping, question sequencing, total point calculation, passing criteria, and immutable blueprint snapshots.
3. **Exam-Level Grading & Result Release**: Aggregates item scores, enforces feedback release policies (`DEFERRED`, `ON_SUBMISSION`), and withholds unreleased exam outcomes.
4. **Learning Evidence Interpretation**: Consumes evaluated outcomes to record canonical `LearningEvidence` without duplicating grading logic.
5. **Quest & Reward Qualification**: Consumes canonical facts emitted from released assessments; quest completion never equates to verified exam mastery.

---

## 3. Conceptual Entity Model & Schema Design

To ensure backward compatibility and follow ULE design principles (ADR-008), the assessment foundation introduces 4 core relational models:

```
Creator (User)
   │
   ├──> QuestionBankItem (Stable Identity, Type, Current Draft)
   │         │
   │         └──> QuestionVersion (Immutable Published Snapshot v1, v2...)
   │                   ▲
   │                   │ (pinned reference)
   │                   │
   └──> AssessmentDefinition (Draft Aggregate Root, Sections, Item Refs)
             │
             └──> AssessmentVersion (Immutable Exam Blueprint Snapshot)
                       │
                       └──> AssessmentVersionItem (Relational join & integrity lock)
```

### 3.1 `QuestionBankItem`
- Stable identity across revisions.
- Creator ownership (`ownerId` $\rightarrow$ `User`).
- Optional `courseId` for course-scoped authoring or null for platform-wide creator libraries.
- Validated item type (e.g. `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE`, `CLOZE`, `SHORT_TEXT`, `NUMERIC`, `ESSAY`, `MATCHING`, `ORDERING`).
- Current working draft payload: `prompt`, `content` (public instructions/options), `answerKey` (secret), `rubric` (scoring guidelines), `config` (evaluator parameters), `defaultPoints`, `skillCode`, `tags`.
- Optimistic concurrency `revision`.

### 3.2 `QuestionVersion`
- Immutable published snapshot created when a question draft is released.
- Natural version numbering (`questionBankItemId`, `versionNumber`).
- Captures frozen `prompt`, `content`, `answerKey`, `rubric`, `config`, `defaultPoints`, `skillCode`.
- Integrity invariant: Once pinned in any published `AssessmentVersion`, a `QuestionVersion` can **never be deleted or altered**.

### 3.3 `AssessmentDefinition`
- Creator-controlled draft exam blueprint.
- Aggregate root with optimistic concurrency `revision`.
- Relational child sections (`AssessmentSection`) and item references (`AssessmentItemRef`).
- Exam-level policy configuration: `durationMinutes`, `passingScore`, `maxAttempts`, `feedbackPolicy`.

### 3.4 `AssessmentVersion`
- Immutable published exam blueprint snapshot.
- Pinned question versions, section layout, item order, and point weights.
- Self-contained, immutable `snapshot: Json` containing full section and question payload data.
- Relational `AssessmentVersionItem` linkages preventing deletion or modification of referenced question versions.
- Future `ExamAttempt` entities will execute against `AssessmentVersion`, completely insulated from any subsequent edits to the draft question bank!

---

## 4. Question Type Architecture & Evaluation Matrix

ULE enforces an extensible contract across 9 allowlisted question types. In this Phase 5.5 foundation PR, we clearly delineate working runtime evaluators from authoring-supported types:

| Question Type | Status in Phase 5.5 PR | Content Schema | Protected Answer Key Schema | Evaluator Strategy |
| :--- | :---: | :--- | :--- | :--- |
| **`SINGLE_CHOICE`** | **Working Evaluator** | `{ prompt, options: [{ id, text }] }` | `{ correctOptionId: string }` | Reuses ABP `multiple-choice` deterministic option matcher. |
| **`CLOZE`** | **Working Evaluator** | `{ prompt, templateText, targetBlanks: [...] }` | `{ blanks: Record<string, string[]> }` | Reuses ABP `cloze` NFKC Unicode normalization matcher. |
| **`TRUE_FALSE`** | **Working Evaluator** | `{ prompt }` | `{ correctValue: boolean }` | Deterministic boolean matcher. |
| **`MULTIPLE_CHOICE`** | **Authoring Validated** | `{ prompt, options: [{ id, text }] }` | `{ correctOptionIds: string[] }` | Multi-select set equality (runtime execution scheduled for Phase 6). |
| **`SHORT_TEXT`** | **Authoring Validated** | `{ prompt, placeholder? }` | `{ acceptableAnswers: string[], caseSensitive? }` | Normalized token match (runtime execution scheduled for Phase 6). |
| **`NUMERIC`** | **Authoring Validated** | `{ prompt, unit? }` | `{ correctValue: number, tolerance: number, toleranceType: 'ABSOLUTE' \| 'PERCENT' }` | Mathematical interval evaluation (runtime execution in Phase 6). |
| **`ESSAY`** | **Authoring Validated (Rubric Only)** | `{ prompt, minWords?, maxWords? }` | `null` (no automated answer key) | **Rubric-based human grading only**. Naive string equality is strictly banned. |
| **`MATCHING`** | **Authoring Validated** | `{ prompt, premises: [...], targets: [...] }` | `{ pairs: Record<string, string> }` | Deterministic pair matcher (runtime execution in Phase 6). |
| **`ORDERING`** | **Authoring Validated** | `{ prompt, items: [{ id, text }] }` | `{ correctSequence: string[] }` | Sequence equality matcher (runtime execution in Phase 6). |

> [!CRITICAL]
> **Anti-Leakage Guarantee**: All question types implement `sanitizeForLearner(content)`, which strictly removes `answerKey`, correct options, solution derivations, and educator-only rubrics from any learner-facing payloads.

---

## 5. Security, Authorization & Concurrency Guarantees

1. **Strict Creator Authorization**: Every mutation on `QuestionBankItem` and `AssessmentDefinition` verifies ownership (`item.ownerId === user.id`). Unauthorized access returns `HTTP 404` or `HTTP 403`.
2. **Optimistic Concurrency**: Draft mutations require matching `expectedRevision`; stale requests fail immediately with `HTTP 409 Conflict`.
3. **Atomic Publication**: Assessment publishing executes inside an exclusive database transaction. If any referenced question lacks a published version or has invalid point weights, the entire publication rolls back.
4. **Immutability of Blueprints**: Once an `AssessmentVersion` is published, neither the blueprint nor any referenced `QuestionVersion` can be modified.
5. **No Premature State Emission**: Merely authoring or publishing a question or assessment emits **zero** LearningEvidence, Quest progress, Course XP, or Platform XP.
