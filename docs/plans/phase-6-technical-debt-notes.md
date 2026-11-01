# ULE Technical Debt & Architecture Notes — Phase 6 Baseline

## Scope & Context
This document records known technical debt, concurrency edge cases, and future refinement opportunities identified during Phase 5.5 (PR #8, PR #9, and PR #10) before embarking on Phase 6 Web MVP implementation. As mandated by project policy, Phase 5.5 architecture decisions remain frozen and are not silently rewritten.

---

## 1. Grade Appeal & Revision Ledger Concurrency Considerations
*Observed in Phase 5.5 PR #10 (Commit `d968c62`)*

1. **Appeal Review Serialization**:
   - `ExamGradeAppeal` status transitions (`OPEN` $\rightarrow$ `UNDER_REVIEW` $\rightarrow$ `RESOLVED_*`) currently lock the associated `ExamAttempt` row using `FOR UPDATE`.
   - While effective for single-attempt isolation, high-frequency concurrent appeals across different items on the same attempt rely on parent lock ordering.
   - *Recommendation for future phase*: Introduce dedicated optimistic concurrency (`appealRevision`) on `ExamGradeAppeal` itself if multi-grader parallel resolution becomes a requirement.

2. **Idempotency Key Scope & Purging**:
   - Revision ledger models (`ExamHumanGradeRevision` and `ExamGradeRevision`) store nullable `idempotencyKey` with unique constraints scoped to `(examItemGradeId, idempotencyKey)` and `(examGradeId, idempotencyKey)`.
   - Replaying an identical payload succeeds cleanly, but no TTL or automated purging policy is currently attached to historical keys.
   - *Recommendation for future phase*: Add a maintenance retention policy or background job to partition or archive resolved evaluation idempotency keys older than 90 days.

3. **Rubric Criteria Score Normalization Edge Cases**:
   - The normalization formula $\text{round}\left(\frac{\sum \text{criterionScores}}{\sum \text{criterionMaxPoints}} \times \text{itemMaxPoints}, 4\right)$ handles standard rubrics where criteria sum $\neq$ item max points.
   - In rare degenerate configurations where $\sum \text{criterionMaxPoints} == 0$, the system defaults to $0.0$ awarded points.
   - *Status*: Working safely as verified by Gate B tests; blueprint authoring validation prevents publishing rubrics with non-positive criteria.

---

## 2. ExamAttempt Runtime & Timer Grace Boundaries
*Observed in Phase 5.5 PR #9 (Commit `55d72da`)*

1. **15-Second Grace Transmission Margin**:
   - `EXAM_DEADLINE_GRACE_MS = 15_000` provides network transmission tolerance for in-flight requests.
   - Lazy expiration reconciliation (`reconcileExpirationIfOverdue`) reconciles status to `EXPIRED` only if the attempt is in `IN_PROGRESS` state.
   - Terminal states (`COMPLETED`, `GRADING`, `SUBMITTED`, `ABANDONED`) are strictly protected from being overwritten.
   - *Client constraint*: The web client countdown displays time remaining until `deadlineAt`, while treating server rejection with 409 (Expired) as authoritative.

2. **Autosave CAS Concurrency**:
   - `saveResponse` requires `expectedRevision` to match the current response revision in database.
   - In low-connectivity environments with fast rapid keystrokes, an unthrottled frontend could trigger spurious 409 Conflict errors.
   - *Client requirement*: The web UI must debounce autosaves (e.g., 500ms-1000ms), track the latest server-acknowledged revision, and serialize in-flight saves per item.

---

## 3. Summary
These notes preserve architectural transparency without blocking the Phase 6 Learner Exam Web MVP. The core backend engines remain immutable, stable, and covered by 521 passing tests.
