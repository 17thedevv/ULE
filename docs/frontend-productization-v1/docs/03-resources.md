# ULE Frontend — Resource Kit & Official References

**Version:** 2026-11-01. Nguồn ưu tiên official documentation; link cần được kiểm tra lại khi triển khai và dùng phiên bản dependency thực tế trong repo.

## 1. Product design + tokens

| Resource | Link | Sử dụng khi nào |
| --- | --- | --- |
| Figma Design Tokens guide | https://www.figma.com/resource-library/design-tokens/ | Hiểu semantic tokens, modes và sync design ↔ code |
| Figma Variables documentation | https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma | Tạo 4 màu mode và component preview khi thiết kế trên Figma |
| MDN CSS custom properties | https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties | Implement CSS token, kế thừa và fallback |
| MDN `prefers-color-scheme` | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-color-scheme | System theme |
| MDN `color-scheme` | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme | Native form/browser controls đúng theme |

**Asset-first approach:** Các palette trong `starter/theme-tokens.css` là proposal. Figma có thể dùng tokens thủ công ở v1, chưa cần plugin sync hoặc token build pipeline.

## 2. Accessibility & interaction patterns

| Resource | Link | Lý do |
| --- | --- | --- |
| WCAG 2.2 | https://www.w3.org/TR/WCAG22/ | Mục tiêu AA cho app |
| WAI-ARIA APG Patterns | https://www.w3.org/WAI/ARIA/apg/patterns/ | Dialog, tabs, keyboard, menu patterns |
| Playwright accessibility testing | https://playwright.dev/docs/accessibility-testing | Dùng axe + manual review; automation không cover hết lỗi |
| Playwright visual comparisons | https://playwright.dev/docs/test-snapshots | Screenshot regression trong pinned environment |
| React Testing Library | https://testing-library.com/docs/react-testing-library/intro/ | Test theo hành vi người dùng thay vì internals |

## 3. React implementation (lựa chọn, không bắt buộc)

| Resource | Link | Lưu ý |
| --- | --- | --- |
| React Router modes | https://reactrouter.com/start/modes | Vite SPA hiện có thể dùng Declarative mode khi cần deep links, không bắt đổi framework |
| Lucide React icons | https://lucide.dev/guide/react/ | Icon SVG tree-shakeable; cần kiểm tra license và consistency nếu adopt |
| Vite docs | https://vite.dev/guide/ | SPA config và build trong monorepo |
| TypeScript docs | https://www.typescriptlang.org/docs/ | Typed API adapters và status unions |

**Dependency policy:** Không cài shadcn/Tailwind/Redux/animation package mặc định. Chỉ đưa dependency vào PR khi giảm complexity so với code hiện có và đi kèm decision rationale.

## 4. Nguồn chính xác của ULE

| Source of truth | Link | Nội dung |
| --- | --- | --- |
| ULE repo | https://github.com/17thedevv/ULE | baseline và code history |
| App | https://github.com/17thedevv/ULE/blob/main/apps/web/src/App.tsx | existing verification layout |
| CSS | https://github.com/17thedevv/ULE/blob/main/apps/web/src/index.css | existing variables/hard-coded styles |
| Web package | https://github.com/17thedevv/ULE/blob/main/apps/web/package.json | actual libraries and scripts |
| Architecture overview | https://github.com/17thedevv/ULE/blob/main/docs/architecture/overview.md | API boundaries, private learning semantics |
| Phase 5.5 grading D0 | https://github.com/17thedevv/ULE/blob/main/docs/plans/phase-5-5-human-grading-appeals-d0-report.md | ExamAttempt, human grading, revisions, appeals |
| Local OpenAPI docs | http://localhost:3000/docs | canonical endpoints when backend running |
| Local OpenAPI JSON | http://localhost:3000/docs-json | API/schema source for mappings |

## 5. Resource checklist để designer/dev dùng ngay

**Trong Figma (nếu dùng):**
- File `ULE / Product UI v1`: page Foundations (color modes, type, spacing), page Components, page Learner, page Exam, page Creator, page Grading, page States.
- Frames: 1440 desktop, 768 tablet, 390 mobile; dark + contrast variants cho critical screens.
- 5 luồng clickable: Continue learning, ABP activity, exam submit, human grading, draft publish.
- Mỗi màn có annotations: data source, permission rule, loading/error/empty/revoked/release state.

**Trong code:**
- Dùng `starter/theme-tokens.css`, `starter/theme.ts` làm base để review, không copy blindly vào production.
- Cấu trúc `ui/`, `theme/`, `features/` chỉ tạo dần theo nhu cầu.
- Ảnh/illustration không phải điều kiện để ship UI-01; icon có thể dùng Unicode hoặc icon package nhất quán nếu cần.

**Testing:**
- Unit: `pnpm test:web`; repo-wide: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
- Khi thêm Playwright, pin browser/version và baseline screenshot trên CI để hạn chế flaky test.
- Đảm bảo manual test screen reader, keyboard và color contrast, không chỉ tin vào axe.

## 6. Một trang checklist để review PR

- [ ] UX flow đúng nhiệm vụ chính, không đưa debug info lên learner view.
- [ ] Theme có đủ semantic tokens; không hardcode accent/status vào component mới.
- [ ] Không leaky data: course privacy, grade release, answer key, rubric access, denied routes.
- [ ] Evidence/maturity wording đúng; completion không bị gọi verified mastery.
- [ ] Responsive, keyboard, focus, contrast, reduced-motion.
- [ ] Empty/loading/error/retry/saving/permission states.
- [ ] Tests, screenshots, API contract mapping, rollback note.
