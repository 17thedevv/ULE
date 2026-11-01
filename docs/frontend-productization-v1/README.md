# ULE — Frontend Productization v1

**Ngày:** 2026-11-01  
**Trạng thái:** Proposed / design baseline, chưa merge hoặc áp dụng vào repo  
**Repository:** https://github.com/17thedevv/ULE  
**Mục tiêu:** Chuyển verification UI sang sản phẩm learning-first, hỗ trợ multi-theme, không thay đổi authoritative backend.

## Bộ tài liệu

1. [`docs/01-product-ux-design-system.md`](docs/01-product-ux-design-system.md) — quyết định sản phẩm, UX, thông tin kiến trúc, theme, accessibility và UX contract.
2. [`docs/02-frontend-refactor-roadmap.md`](docs/02-frontend-refactor-roadmap.md) — audit frontend hiện có, migration strategy, từng PR, tiêu chí nghiệm thu, test matrix và rủi ro.
3. [`docs/03-resources.md`](docs/03-resources.md) — tài nguyên chính thức, tooling, checklist asset, workflow Figma-to-code.
4. [`starter/theme-tokens.css`](starter/theme-tokens.css) — CSS semantic tokens tham khảo cho 4 theme.
5. [`starter/theme.ts`](starter/theme.ts) — module TypeScript tham khảo để đọc/lưu theme, hỗ trợ chế độ hệ thống và đồng bộ các tab.

## Quy tắc

- Backend quyết định quyền, chấm điểm, evidence, mastery, timer và phản hồi hiển thị. Frontend không tạo kết luận authoritative.
- Không đưa answer keys, private course existence hay unpublished grades vào learner UI.
- Học xong khác với đạt mastery. `READY_TO_VERIFY` không phải `VERIFIED`.
- Chỉ thay đổi UI qua các PR nhỏ, giữ verification studios trong giai đoạn chuyển tiếp.
- Những route và screen trong tài liệu là **đề xuất**, phải đối chiếu API OpenAPI thực tế trước khi wire-up.

## Cách sử dụng

1. Đọc UX spec rồi duyệt user flows, labels, màu và component states.
2. Kiểm kê OpenAPI `/docs-json` và `@ule/contracts` theo checklist roadmap.
3. Tạo nhánh mới từ `main`; đưa cả bộ tài liệu vào một thư mục versioned như `docs/frontend-productization-v1/` (giữ nguyên liên kết tương đối). Code starter chỉ copy vào `apps/web/src/` sau khi được review.
4. Chỉ bắt đầu UI-01 sau khi baseline lint, typecheck, build, test chạy được và UX spec được duyệt.
5. Không merge bộ tài liệu như code đã được triển khai.

**Lưu ý:** GitHub connector tại thời điểm tạo bộ file có quyền đọc nhưng trả về 403 khi tạo branch. Các file này chưa được commit vào GitHub.
