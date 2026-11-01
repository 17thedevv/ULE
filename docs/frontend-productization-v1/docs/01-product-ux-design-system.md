# ULE Product UX & Design System — v1

**Status:** Proposed for review  
**Date:** 2026-11-01  
**Owner:** ULE product/frontend  
**Scope:** `apps/web` UI/UX; không sửa domain logic/API semantics.

## 1. Quyết định thiết kế (single source of truth)

**Product direction:** *Modern Learning Workspace*, learning-first, dễ dùng hơn studio kỹ thuật, đa theme, vẫn trung thực với evidence và quyền truy cập.

1. Một **App Shell** chung (topbar + responsive sidebar + workspace switcher), nhiều workspace theo năng lực/quyền của người dùng; backend luôn là authoritative authorization.
2. **Paper** là theme mặc định; thêm **Midnight**, **Forest**, **Contrast**. Có lựa chọn **Theo hệ thống**: tự chọn Paper/Midnight theo OS. Không tạo cross-product tất cả accent × light/dark ở v1.
3. **Progress ≠ evidence ≠ skill readiness ≠ verified mastery**. Không đánh đồng hoàn thành video/khóa học với thành thạo. `READY_TO_VERIFY` nghĩa là đã đủ điều kiện để thử xác minh, không phải chứng nhận.
4. `Assessment`/`Exam` và ABP learning activities là hai hệ thống khác nhau; giao diện phải giữ sự phân tách này.
5. Đưa development verification studios vào khu vực nội bộ trong khi chuyển đổi; không xóa hay phá các luồng test trước khi có đường thay thế.
6. Không xây theme service, API cá nhân hóa, design token compiler, microfrontend, animation engine hay i18n framework mới chỉ vì redesign.

### Non-goals v1

- Không tích hợp AI tự động vào workflow bắt buộc.
- Không xây marketplace/course discovery public khi course hiện private và dựa trên access grants.
- Không thay đổi exam scoring, quest settlement, evidence evaluation, appeals hoặc release policies.
- Không buộc chuyển frontend sang Next.js, Tailwind, shadcn/ui hoặc thư viện state management mới.

## 2. Kiến trúc thông tin và điều hướng

### Workspace và sitemap đề xuất

| Workspace | Điều hướng cấp một | Nhiệm vụ chính |
| --- | --- | --- |
| Learner | Trang chủ, Khóa học, Luyện tập, Bài kiểm tra, Kỹ năng, Nhiệm vụ | Tiếp tục việc học, xem tiến độ, thao tác được cấp quyền |
| Creator | Khóa học của tôi, Course Editor, Phiên bản, Question Bank, Assessment Builder | Soạn draft, validate, publish immutable snapshot |
| Grading | Hàng đợi chấm, Rubric, Lịch sử điều chỉnh, Khiếu nại | Đánh giá và xử lý nội dung có quyền chấm |
| Developer (restricted) | Verification Studio, API Health, API Docs | Kiểm thử và quan sát kỹ thuật, không phải UI chính |

**Route concepts (chưa khẳng định đã triển khai):** `/app`, `/app/courses`, `/app/courses/:courseVersionId`, `/app/learn/:runId`, `/app/exams`, `/app/exams/:attemptId`, `/app/exams/:attemptId/result`, `/studio/courses`, `/studio/grading`, `/dev/verification`. Chỉ tạo route sau khi đối chiếu data contracts, auth và quyền.

### Hành vi chung

- Primary navigation giữ nguyên giữa các màn hình; mobile chuyển sang drawer/bottom navigation nếu hành vi đã kiểm chứng.
- Người dùng có nhiều quyền có thể chuyển workspace; **client không được tự quyết định quyền** chỉ từ menu hoặc localStorage.
- Onboarding nhẹ: không có khóa học được cấp quyền thì empty state rõ ràng, không giả vờ có catalog public.
- Một primary action/screen; giảm dashboard noise. API health/tag kiến trúc không nằm trong learner dashboard.
- Error copy dễ hiểu và có hướng xử lý; không phơi chi tiết kỹ thuật, mã định danh nội bộ hoặc nội dung private.

## 3. Screen contracts và UX flows

### 3.1 Learner Dashboard

**Primary question:** "Mình cần học gì tiếp?"

- Hero: khóa học được cấp quyền gần nhất hoặc hành động `Continue` từ dữ liệu server thực.
- Section: khóa học của tôi, bài kiểm tra đang thực hiện/được phép xem, kỹ năng đang phát triển, các nhiệm vụ nếu có dữ liệu hợp lệ.
- Không vẽ % hoặc streak giả. Không dùng `course progress` làm thước đo verified mastery.
- Trạng thái: loading skeleton; empty (chưa được cấp khóa nào); errors (retry); revoked/inaccessible (nội dung trung lập, không tiết lộ tên bản private bị thu hồi).

### 3.2 Course Library + Learning Player

Flow: xem danh sách phiên bản được cấp quyền → mở version pinned → chọn activity → bắt đầu run → thao tác video/quiz theo ABP → xem feedback theo policy → hoàn tất hoặc quay lại.

- Tách **content completion** và **skill evidence** ở hai vùng hiển thị khác nhau.
- Với quiz có deferred feedback, khi chưa được server cho phép thì không hé lộ đúng/sai, điểm, đáp án, hint-derived correctness hoặc màu gợi ý.
- Hints/assisted submissions có badge "Có hỗ trợ" khi server quan sát; không biến thành chứng cứ độc lập.
- Same-item repetition không tự biến thành mới/đủ chứng cứ.
- Các trạng thái skill: `INSUFFICIENT_EVIDENCE` → "Chưa đủ bằng chứng"; `DEVELOPING` → "Đang phát triển"; `READY_TO_VERIFY` → "Sẵn sàng xác minh". Hiển thị rationale/missing evidence nếu contract cung cấp.
- Idempotency key cho một action phải ổn định qua retry cùng intent; tránh double run/command do click lặp.

### 3.3 Assessment Center + Exam Player

Flow: xem bài thi có quyền → bắt đầu attempt → trả lời → lưu/sync → nộp với confirm → trạng thái grading → chỉ xem kết quả theo feedback release policy → appeal nếu API/permission cho phép.

- Dùng `deadlineAt` **từ server**; đồng hồ client chỉ là hiển thị, server quyết định hạn. Không đề nghị local time là authority.
- Trạng thái người dùng hiểu được: `IN_PROGRESS` (đang làm), `SUBMITTED` (đã nộp), `GRADING` (đang chấm), `COMPLETED` (đã hoàn tất chấm), `EXPIRED` (hết giờ), `ABANDONED` (đã dừng).
- Autosave/submit sử dụng contract revision + concurrency; conflict không ghi đè âm thầm. Hiển thị saving/saved/error; có cơ chế refetch, quyết định retry khi an toàn.
- Không gửi answer keys, rubrics hoặc điểm ẩn trong payload người học; không render dù có lỡ xuất hiện trong mock.
- Nếu còn subjective items đang chấm, không hiển thị tổng điểm như kết quả cuối. `COMPLETED` không có nghĩa đã được công bố; release state phải xử lý độc lập.
- Không cho theme, animation, kiểu chữ làm thay đổi thứ tự/nội dung câu hỏi hay gây hiểu nhầm lựa chọn/đáp án.

### 3.4 Grading Workspace

Flow: queue có thẩm quyền → xem câu trả lời bất biến → rubric theo pinned version → đánh giá → xác nhận → revision history → appeal review/resolution.

- Chỉ cho chấm `ESSAY`, `SHORT_TEXT` khi backend cho phép; rubric criterion/point bounds bám API.
- Có thể hiển thị per-item score, pending human, grade revision, audit timeline theo quyền; không tự tính grade chính thức phía client.
- Appeals: `OPEN`, `UNDER_REVIEW`, `RESOLVED_UPHELD`, `RESOLVED_CHANGED`; phân biệt status appeal và grade release.
- Xử lý 409 conflict/expectedRevision rõ ràng; có xác nhận thao tác nhạy cảm, không silent overwrite.

### 3.5 Creator Studio

Flow: course list → create/edit draft → thêm/sắp xếp ABP blocks → validate → preview → publish new `CourseVersion` immutable → quản lý access grants khi API cho phép.

- Draft vs Published vs Version rõ ràng. Chưa publish không bị trình bày như version đã phát hành.
- Question Bank/Assessment Builder riêng với ABP block builder, dùng canonical versioning từ server.
- Error validation theo field/row; không để người dùng mất thay đổi chưa lưu khi điều hướng.
- Chỉ hiển thị thao tác mà người dùng thực sự có quyền, đồng thời backend luôn kiểm soát authorization.

## 4. Visual design guidelines

**Nhận diện:** clean, có chiều sâu nhẹ, hiện đại nhưng không biến thành game dashboard; tôn trọng sự tập trung khi học/thi.

| Dimension | Baseline | Ghi chú |
| --- | --- | --- |
| Typeface | system sans, ưu tiên font sẵn có | Không bắt tải font mới ở v1 |
| Spacing | 4px grid: 4/8/12/16/24/32 | Không tạo hàng chục spacing token |
| Border radius | 6 / 10 / 14px | Cards 10px; form controls nhất quán |
| Interactive height | khoảng 40–44px | Touch target test theo thiết bị |
| Content width | tối ưu đọc 720–840px; dashboard tối đa ~1200px | Không ép lesson text chạy full width |
| Motion | nhẹ, ngắn; hỗ trợ reduced motion | Không dùng motion che trạng thái kết quả |
| Surface | lớp nền trang → cards → popover/modal | Không phụ thuộc bóng đổ để phân biệt |

### Semantic tokens

Các component dùng `--ui-*`, không trực tiếp gọi hex màu hoặc palette name. Nhóm tối thiểu:

- `--ui-bg`, `--ui-surface`, `--ui-surface-muted`, `--ui-text`, `--ui-text-muted`, `--ui-border`
- `--ui-primary`, `--ui-primary-contrast`, `--ui-focus-ring`
- `--ui-success`, `--ui-warning`, `--ui-danger`, `--ui-info` + biến nền cho status
- `--radius-sm`, `--radius-md`, `--radius-lg`, `--shadow-sm`, `--font-sans`

Mã tham khảo nằm trong [`../starter/theme-tokens.css`](../starter/theme-tokens.css). Màu là **starting palette, không phải chứng nhận WCAG**; phải test contrast theo từng cặp foreground/background và trạng thái.

### Theme contract

| Choice | Visual mood | Intended use |
| --- | --- | --- |
| System | tự chọn Paper/Midnight theo OS | lựa chọn mặc định trong settings |
| Paper | nền sáng, tím xanh dịu | default khi OS sáng |
| Midnight | navy sâu, accent lavender | OS dark / user chọn |
| Forest | xanh lá mềm, bề mặt sáng | ưu tiên cảm giác dịu |
| Contrast | trắng/đen, xanh đậm, border rõ | dành cho người cần phân biệt mạnh |

**Theme state:** `system | paper | midnight | forest | contrast`. V1 lưu ở `localStorage` (chỉ preferences, không dữ liệu nhạy cảm); `data-theme` trên `<html>`; `color-scheme` tương ứng. Nếu browser tắt storage thì fallback an toàn. Khi `system`, lắng nghe thay đổi OS; explicit theme override OS. Không cần migration DB hoặc theme preferences API v1.

**Anti-leak rule:** thay theme không được thay logic hiển thị feedback/deferred result/skills, và không truyền theme vào request authoritative.

## 5. Component inventory (minimum viable)

- Layout: `AppShell`, `WorkspaceSwitcher`, `SidebarNav`, `PageHeader`, `ContentContainer`.
- Primitives: `Button`, `TextField`, `Select`, `Dialog`, `Notice`, `StatusLabel`, `Card`, `Progress`.
- UX states: `LoadingState`, `EmptyState`, `ErrorState`, `PermissionState`, `SavingIndicator`.
- Domain-specific: `CourseCard`, `ActivityPlayer`, `SkillState`, `ExamQuestion`, `ExamTimer`, `ExamAutosaveStatus`, `RubricCriterion`, `GradeTimeline`, `AppealStatus`.
- Tránh xây component thư viện khổng lồ trước nhu cầu thật. Chỉ tách component khi được dùng lại >=2 nơi hoặc có state/logic cần test độc lập.

## 6. Accessibility & content

**Quality target:** WCAG 2.2 AA, xác minh bằng automated + manual tests.

- Contrast tối thiểu thường: 4.5:1 cho text thường, 3:1 cho text lớn; non-text UI và focus có quy tắc riêng; kiểm tra đúng trường hợp.
- Keyboard-only hoạt động; focus visible, focus order đúng, dialog focus trap/restore chuẩn; semantic HTML và labels đầy đủ.
- Không chỉ dùng màu để thể hiện trạng thái; luôn có text/icon phù hợp.
- Hỗ trợ zoom 200%, mobile narrow viewport, `prefers-reduced-motion` và screen readers.
- Tiếng Việt làm ngôn ngữ copy mẫu trong kế hoạch; không hard-code mọi màn hình theo một thứ tiếng khi app mở rộng, nhưng chưa cần thêm i18n framework v1.
- UX copy hành động: "Tiếp tục học", "Đã lưu", "Lưu thất bại — thử lại", "Đang chấm bài", "Chưa đủ bằng chứng", "Sẵn sàng xác minh", "Kết quả chưa được công bố".

## 7. UI-to-backend trust boundary (không được vi phạm)

| Backend fact | Cách hiển thị đúng | Tuyệt đối không |
| --- | --- | --- |
| `CourseAccessGrant` + pinned `CourseVersion` | chỉ hiện course đã được cấp; xử lý revoke/404/403 | public discovery từ danh sách private hoặc đoán course existence |
| ABP `COMPLETION_ONLY` | "Đã hoàn thành nội dung" | "Đã thành thạo" |
| Skill projection `READY_TO_VERIFY` | "Sẵn sàng xác minh" | `VERIFIED` mastery |
| Assisted/repeated evidence | provenance được giải thích | gộp là independent evidence |
| Deferred feedback | trạng thái chờ cho đến khi server cho xem | suy đoán correctness từ badge/màu/hint |
| Exam `deadlineAt` | timer hiển thị | client tự chấp nhận submit quá hạn |
| Pending human grading | "Đang chấm" | final total/pass/fail trước server finalize/release |
| Grade revision / appeal | history/status từ backend | chỉnh điểm trên UI rồi xem như đã có hiệu lực |

## 8. Duyệt thiết kế trước code

- [ ] Phê duyệt wireframe Dashboard, Learning Player, Exam Player, Creator Editor, Grading Workspace.
- [ ] Kiểm tra mỗi flow có states: loading, empty, error, unauthorized/revoked, success, pending.
- [ ] Duyệt nhãn và ý nghĩa các status mastery/evidence/grading.
- [ ] Duyệt bốn themes + system; test màu trạng thái trên từng theme.
- [ ] Chỉ implement route có contract/permission verified; các route còn thiếu là backlog, không fake production endpoints.
- [ ] Đảm bảo studio kỹ thuật vẫn chạy trong giai đoạn migration.

## Reference

- [`apps/web/src/App.tsx`](https://github.com/17thedevv/ULE/blob/main/apps/web/src/App.tsx)
- [`apps/web/src/index.css`](https://github.com/17thedevv/ULE/blob/main/apps/web/src/index.css)
- [`docs/architecture/overview.md`](https://github.com/17thedevv/ULE/blob/main/docs/architecture/overview.md)
- [Exam human grading D0](https://github.com/17thedevv/ULE/blob/main/docs/plans/phase-5-5-human-grading-appeals-d0-report.md)
