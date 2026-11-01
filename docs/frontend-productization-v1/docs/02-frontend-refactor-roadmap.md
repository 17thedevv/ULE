# ULE Frontend Refactor / Productization Roadmap — v1

**Status:** Proposed for review  
**Date:** 2026-11-01  
**Repository baseline inspected:** default branch `main`, selected files only. Không khẳng định đã audit toàn bộ repo.  
**Execution:** UI-01 → UI-06, incremental, không rewrite, không backend scope creep.

## 1. Vấn đề hiện tại (evidence-based)

| File hiện hữu | Quan sát | Refactor đề xuất |
| --- | --- | --- |
| [`apps/web/src/App.tsx`](https://github.com/17thedevv/ULE/blob/main/apps/web/src/App.tsx) | Layout dạng hai cột với `LearnerEvidenceStudio`, `AuthCourseStudio`, `AbpVerificationStudio`, `HealthStatus`; header liệt kê stack kỹ thuật/Phase 3 | Tách app shell, route, workspace; giảm thông tin kỹ thuật khỏi learner screen |
| [`apps/web/src/index.css`](https://github.com/17thedevv/ULE/blob/main/apps/web/src/index.css) | Đã có CSS custom props nhưng nhiều hex màu cố định trong section styles | Chuyển sang semantic tokens cho bốn theme, giữ backward compatibility từng phần |
| [`apps/web/src/components/LearnerEvidenceStudio.tsx`](https://github.com/17thedevv/ULE/blob/main/apps/web/src/components/LearnerEvidenceStudio.tsx) | Data fetch của granted courses/progress/evidence/skill projection và ABP run đã có | Tách query UI, player và progress semantics; giữ backend service calls |
| [`apps/web/src/components/AuthCourseStudio.tsx`](https://github.com/17thedevv/ULE/blob/main/apps/web/src/components/AuthCourseStudio.tsx) | Auth + creator course editing được gom vào một studio | Tách authentication khỏi creator workflow, giữ Better Auth |
| [`apps/web/src/components/AbpVerificationStudio.tsx`](https://github.com/17thedevv/ULE/blob/main/apps/web/src/components/AbpVerificationStudio.tsx) | Debug/authoring/run sample flows trong một file | Giữ dưới developer verification screen, sau đó tái sử dụng business services |
| [`apps/web/src/components/HealthStatus.tsx`](https://github.com/17thedevv/ULE/blob/main/apps/web/src/components/HealthStatus.tsx) | Hiển thị API/DB health | Chỉ đặt trong tools/dev view (có kiểm soát), không đưa lên learner dashboard |
| [`apps/web/package.json`](https://github.com/17thedevv/ULE/blob/main/apps/web/package.json) | React 18, Vite 5, TypeScript, Vitest, Testing Library; không thấy router/CSS framework trong dependencies ở thời điểm kiểm tra | Reuse hiện trạng; bổ sung router/icon sau khi có nhu cầu cụ thể |

**Cẩn trọng:** Kiểm kê nói trên không có nghĩa tất cả endpoint frontend chưa dùng đều sẵn sàng. Trước mỗi PR cần kiểm tra `@ule/contracts`, `apps/web/src/services/`, `/docs-json` và authorization matrix backend. Các endpoint exam/grading có thể đã được backend triển khai nhưng web client chưa tích hợp.

## 2. Migration strategy

1. Thiết lập baseline: tạo screenshots/capture các verification scenarios trước khi sửa; chạy lint/typecheck/build/web tests. Ghi lại warning đang tồn tại thay vì tăng scope.
2. Introduce `AppShell` và theme tokens theo cách **additive**; legacy studios chạy tại route chuyển tiếp. Không xóa UI cũ ngày đầu.
3. Từng vertical slice tạo page + query/service adaptor + tests; không dùng fake APIs ở production. Test dữ liệu giả trong fixtures/test-only.
4. Cross-cutting shared components chỉ tách sau khi thấy duplication thực hoặc có state phức tạp đáng test độc lập.
5. Route + UI authorization chỉ để hiển thị; server vẫn check ownership, grant, exam privileges và grading authority.
6. Chỉ khi behavior parity được xác nhận mới deprecate phần verification studio trùng lặp, vẫn giữ test coverage kỹ thuật.

### Thư mục đề xuất (không bắt buộc tạo toàn bộ trong PR-01)

```text
apps/web/src/
  app/
    AppShell.tsx
    routes.tsx                 # when routing adopted
  styles/
    tokens.css
    global.css
  theme/
    theme.ts
    ThemeSwitcher.tsx
  components/
    ui/                       # tiny shared primitives
    states/                   # loading, empty, error
  features/
    learner/                  # dashboard, courses, learning player
    assessments/             # exam player, results
    grading/                 # queue, rubric, appeals
    creator/                 # drafts, blocks, versions, question banks
  services/                   # existing canonical HTTP clients retained
  components/                # legacy studios remain until migrated
```

## 3. PR plan — mỗi PR có thể chạy và kiểm thử độc lập

### UI-01 — Theming, shared shell và visual foundation (P0)

**Deliverables**
- Tách `index.css` thành global resets và semantic tokens; 4 palette Paper/Midnight/Forest/Contrast; chế độ System; theme persistence client-only.
- AppShell responsive: sidebar, topbar, workspace/nav theo dữ liệu có quyền; mobile drawer và focus keyboard.
- Route chuyển tiếp cho verification studios; learner landing chỉ dùng API thật hoặc empty state.
- Những component shared cần thiết đầu tiên: button, card, status label, loading/empty/error.

**Out-of-scope:** Backend theme API, user theme synchronization đa thiết bị, Tailwind migration, full design library.

**Acceptance**
- [ ] Thay theme không reload và sau reload giữ lựa chọn; System đổi khi OS đổi; storage denied không crash.
- [ ] Mỗi palette có check contrast; focus visible; no-color-only statuses; reduced-motion.
- [ ] Sidebar keyboard usable, route direct reload hoạt động theo Vite SPA hosting.
- [ ] Legacy studios vẫn truy cập/test được; không lộ developer tools cho user không được phép chỉ do route dự đoán.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:web` pass.

### UI-02 — Learner Workspace vertical slice (P0)

**Deliverables**
- Dashboard `Continue learning`, granted course list, course/version detail và Learning Player.
- Service layer dùng `fetchGrantedCourses`, `fetchCourseProgress`, `fetchSkillProjections`, ABP `startRun`, `executeRunCommand` khi hợp lệ.
- Phân biệt progress, evidence và skill state; action proposal/rationale hiển thị từ server.
- Loading/empty/revoked/error states.

**Acceptance**
- [ ] Chỉ course được cấp mới xuất hiện; inaccessible private course không bị lộ.
- [ ] Completion không hiển thị mastery/grade; assisted vs independent hiển thị chính xác.
- [ ] Deferred correctness được ẩn cả text, icon, tone/color và progress calculations gây suy luận.
- [ ] Duplicate click/retry không tạo activity attempt trùng (idempotency keys theo intent).
- [ ] Tests về loading, grant revoke, policy release, completion-only, skill projection.

### UI-03 — Assessment Center & Exam Player (P0)

**Preflight:** Xác minh contract/API exam attempt start, save answer, submit, fetch attempt/result, feedback release và quyền. Nếu thiếu thì tách backlog API-gap riêng; không tự invent backend semantics.

**Deliverables**
- Eligible assessment list hoặc empty state; Exam Player hỗ trợ question types từ backend.
- Server deadline display, save state, question navigation, submit confirmation, post-submit status.
- Results view tuân thủ release policy; pending human/appeal CTA chỉ khi đủ điều kiện.

**Acceptance**
- [ ] Reload/reconnect không reset answer đã được server xác nhận; stale revision được xử lý hiển thị rõ.
- [ ] Late submit không được client coi là successful nếu server đã từ chối.
- [ ] Answer key/rubric không nằm trong DOM hoặc state của learner view.
- [ ] `GRADING` không bị render như final score/pass; `COMPLETED` vẫn tôn trọng `isReleased`/policy.
- [ ] Keyboard và mobile navigation hoạt động, timer dễ tiếp cận.

### UI-04 — Grading Workspace & Appeals (P1)

**Deliverables**
- Grading queue với lọc status, read-only submitted answer, rubric grading form, grade revision timeline.
- Appeal status và review/disposition UI theo authorized contracts.

**Acceptance**
- [ ] Chỉ authorized grader thấy queue/actions; không hiển thị scoring controls trên objective items.
- [ ] Rubric validation, pending human, finalization và conflict 409 được phản ánh chính xác.
- [ ] Không sửa đáp án đã submitted; correction history hiển thị append-only từ backend.
- [ ] Không hiển thị revision/appeal data cho người không có quyền; tests bao phủ màn hình quan trọng.

### UI-05 — Creator Studio & Authoring (P1)

**Deliverables**
- Creator course list, draft editor, ABP block list/reorder/validation, publish version, preview.
- Question Bank và Assessment Builder riêng khỏi ABP authoring nếu contracts cần.
- Draft unsaved warning / optimistic revision handling.

**Acceptance**
- [ ] Draft/published/version labels rõ; publish immutable new version qua canonical API.
- [ ] Không ghi đè draft khi revision mismatch; UI giữ form context để sửa.
- [ ] Creator không xem learner-private dữ liệu trái quyền; legacy authoring studio chỉ bị remove sau parity.
- [ ] Form error meaningful; new screen có test cho create/edit/validate/publish.

### UI-06 — Accessibility, regression và cleanup (P1)

**Deliverables**
- Audit 4 palettes × responsive breakpoints × keyboard flows × screen-reader semantics.
- E2E happy paths và negative auth/release/conflict paths; optional visual snapshots trong một environment pinned.
- Chỉ bỏ legacy styles/components khi test coverage chứng minh parity.
- Documentation/screenshots/UX copy review.

**Acceptance**
- [ ] WCAG 2.2 AA test plan hoàn thành; automated a11y + manual evidence.
- [ ] Không regress authenticated ABP, exam, grading, creator workflows.
- [ ] Không có console errors trong critical paths; hidden release data không lộ.
- [ ] Lint/typecheck/build/unit/e2e/integration CI green theo từng thay đổi.

## 4. Release gates & traceability

| Gate | Khi nào kiểm thử | Evidence |
| --- | --- | --- |
| UI-UX | Trước merge mỗi PR | Screenshots desktop/mobile, 4 themes nếu áp dụng, UX review |
| Contract | Trước wire-up endpoint | OpenAPI + `@ule/contracts` mapping, trạng thái permission chính xác |
| Security/privacy | Mỗi learner/exam/grading route | Unauthorized/404/revoked/no leakage tests |
| Learning integrity | UI-02 | Completion-only, assisted/repeated/deferred, no false VERIFIED |
| Exam integrity | UI-03 | Server-clock, CAS, release, pending grade |
| Grading integrity | UI-04 | Rubric, revisions, appeals, authorized grading |
| Accessibility | UI-01 và UI-06 (incremental ở các PR) | Color contrast, keyboard, focus, zoom, reduced motion |
| Regression | Mỗi PR | `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:web`; API gates nếu touched |

## 5. Test matrix tối thiểu

**Theme:** system light→Paper, system dark→Midnight, explicit theme override, persistence, storage unavailable, cross-tab change, no flash severe, status legibility.  
**Viewport:** 360px mobile, 768px tablet, 1280px desktop (và kiểm thử zoom).  
**Keyboard:** Tab/Shift+Tab, Escape, arrows nơi widget pattern yêu cầu, dialog focus return.  
**Auth:** anonymous, authorized learner, course owner, authorized grader, revoked, unauthorized direct deep-link.  
**Exam:** save successful, slow network, conflict, expired while open, double submit, grading pending, result hidden/released.  
**Evidence:** video completed no mastery, assisted attempt, repeat variant, deferred feedback, projection rationale.

## 6. API mapping worksheet (điền khi bắt đầu từng PR)

| Screen | Needed fact/action | Candidate existing source | Verification required |
| --- | --- | --- | --- |
| Course Library | authorized granted versions | `services/learner.ts` | grant status, version-pinned titles, private 404 |
| Learning Player | start run, commands, results | `services/abp.ts` | feedback policy, hints, idempotency, accepted transitions |
| Skill view | progress/evidence/projection | `services/learner.ts` | progress vs mastery statuses |
| Creator | drafts/versions/blocks | `services/courses.ts`, `services/abp.ts` | auth, revision/CAS, publish validation |
| Exam | attempts/responses/submission | API contract audit required | deadline authority, revision, sanitized payload |
| Results | finalized/released score | API contract audit required | feedback release, pending human, 404/403 |
| Grading/appeals | queue/rubric/revision/appeals | API contract audit required | authorization, append-only ledger |

Không triển khai màn hình "đã kết nối" cho API chưa kiểm chứng. V1 không yêu cầu tạo thêm database table chỉ để hiển thị UI.

## 7. Rollback & integration discipline

- Mỗi PR có trước/sau screenshots và test; branch nhỏ, review nhanh. Không gộp redesign với domain rewrite.
- UI-01 có thể rollback riêng vì API business logic không bị đổi.
- Keep old studio path trong feature rollout; nếu màn mới có lỗi, revert route navigation mà không ảnh hưởng backend.
- `403/404` không được xử lý bằng client-side fallback làm lộ dữ liệu private.
- Không dùng API health để quyết định mastery hoặc học tiếp.

## 8. Definition of done toàn chương trình

1. Learner không phải nhìn thấy verification tags/technical health để học.
2. 4 themes nhất quán và accessible; system preference hoạt động.
3. Tối thiểu 4 user journeys có end-to-end trace: học, thi, chấm, tạo nội dung.
4. Domain integrity giữ nguyên: evidence/grades/mastery/deferred release/appeals do server kiểm soát.
5. Test quality gates green; tài liệu versioned kèm code.
6. Old verification studios được giữ, tách nội bộ, hoặc xóa có bằng chứng parity — không biến mất âm thầm.

## 9. Handoff task cho dev agent (copy/paste)

> Implement **UI-01 only** for `17thedevv/ULE`. Read `docs/01-product-ux-design-system.md` and `docs/02-frontend-refactor-roadmap.md` first. Start from latest `main`. Preserve React/Vite/TypeScript/NestJS REST boundaries and all legacy verification flows. Introduce semantic CSS tokens, Paper/Midnight/Forest/Contrast themes plus System preference, localStorage fallback, responsive AppShell and accessible theme switcher. Avoid backend/schema changes, new state management, mass dependency migration, and changes to evaluation/release policies. Run lint, typecheck, build, web tests. Include screenshot evidence at 360/768/1280 widths, theme tests, rollback notes, changed files, and documented limitations. Open a PR; do not merge without review.
