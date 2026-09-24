# Insta Quote AI — Project Overview

## 1. Mục tiêu

Ứng dụng nhận PDF invoice, packing list hoặc delivery docket và trả về:

- Các line item có quantity.
- Unit nếu xác định được.
- Trang chứa dữ liệu.
- Exact source text làm bằng chứng.
- Danh sách refusal cho những giá trị không đủ chắc chắn.

Nguyên tắc cốt lõi: không lưu một quantity nếu hệ thống không thể chỉ ra page và source text của quantity đó.

## 2. Hai cách đọc tài liệu

### Deterministic text parser

Được dùng cho PDF có text layer đầy đủ.

Luồng:

1. PDF.js đọc text theo từng page.
2. Parser tìm quantity, description và unit.
3. Quantity được lưu cùng exact source line.
4. Dòng mơ hồ được lưu vào `refusals`, không đoán.

### Gemini AI document extraction

Được dùng khi:

- PDF là scan/image-only.
- PDF hybrid có page có text và page không có text.
- Người dùng chủ động bấm nút Gemini AI cho bất kỳ PDF nào.

Gemini nhận toàn bộ PDF và phải trả JSON có:

- `description`
- `quantity`
- `unit` nếu có
- `page`
- `sourceText`
- `confidence`

Mọi kết quả AI luôn hiển thị `Needs review — AI result`, kể cả khi request có status `completed`. `completed` chỉ có nghĩa request đã xử lý xong, không có nghĩa con người không cần kiểm tra.

## 3. Vì sao một số PDF có unit nhưng vẫn bị refusal?

Text layer của PDF thường không giữ semantic column. Ví dụ mắt người thấy:

```text
1 10mm GIB Standard board 2400x1200 48 sheet $24.90 $1,195.20
```

Nhưng parser nhận một dòng phẳng có nhiều số:

- `1`: số thứ tự.
- `10mm`, `2400x1200`: kích thước.
- `48`: quantity.
- `24.90`, `1,195.20`: giá và tổng tiền.

Parser hiện tại cố tình refusal khi có nhiều quantity candidate để tránh chọn nhầm. Vì vậy unit `sheet` có thể nhìn thấy nhưng cả dòng vẫn không được lưu.

Đây là vấn đề mất cấu trúc cột khi extract text, không nhất thiết là PDF bị lỗi.

Các dòng đơn giản như `Concrete blocks 24 each` được chấp nhận. Các dòng có số đứng ngay trước unit có thể được cải thiện bằng parser theo vị trí cột, nhưng phải giữ refusal cho các dòng thật sự mơ hồ như `4 25kg $68 /bag`.

## 4. Guardrails chống bịa số

### Deterministic path

- Chỉ lấy quantity xuất hiện trong source text.
- Refusal nếu không có quantity.
- Refusal nếu có nhiều quantity candidate.
- Refusal nếu unit không được nhận diện.
- Lưu page và exact source text cho mọi item.

### AI path

- Prompt cấm tính toán, ước lượng, suy luận, gộp hoặc sửa số.
- `confidence < 0.9` trở thành refusal.
- Quantity phải xuất hiện trực tiếp trong `sourceText`.
- Output được validate bằng Zod.
- Output không hợp lệ không được lưu vào `line_items`.
- PDF mờ, bị cắt, mâu thuẫn hoặc không chắc chắn phải trở thành refusal.
- Kết quả AI luôn cần human review.

Không thể tuyên bố AI tuyệt đối không bao giờ chọn nhầm một số đang có trên trang. Hệ thống chỉ lưu giá trị đã qua evidence validation và luôn đánh dấu AI để kiểm tra lại.

## 5. API chính

### `POST /api/extract`

Smart route:

- Text PDF đầy đủ → deterministic.
- Scan/hybrid PDF → Gemini AI.
- Trả `meta.mode` là `deterministic` hoặc `ai`.

### `POST /api/extract/ai`

Luôn dùng Gemini AI cho mọi PDF.

### `POST /api/extract/image`

Alias tương thích cũ của AI route.

### `GET /api/documents`

Trả danh sách document đã xử lý, gồm document type, processing mode, status và page count.

### `GET /api/documents/:id`

Trả kết quả đầy đủ gồm items, evidence và refusals.

### `GET /api/documents/refusals`

Trả các refusal để phục vụ review hoặc workflow OCR riêng.

## 6. Dedupe và retry

File được hash bằng SHA-256.

- Cùng file + cùng processing mode đã hoàn tất → trả kết quả cũ, không đọc lại.
- Document có status `failed` → không reuse; lần upload tiếp theo được retry.
- Deterministic và AI của cùng một file có thể tồn tại riêng vì có processing mode khác nhau.

## 7. Supabase schema

Các bảng chính:

- `documents`: metadata, hash, processing mode, document type, status.
- `line_items`: quantity và evidence.
- `refusals`: giá trị không được trích xuất và lý do hiển thị cho người dùng.

Migration cho database đã tồn tại:

```text
supabase/migrations/20260924_document_extraction_modes.sql
```

## 8. Gemini configuration

Gemini key chỉ được đọc ở server qua `.env`. Không đưa key vào browser.

Các biến:

```text
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash
GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite,gemini-3.6-flash
```

Nếu model chính trả `503`, `UNAVAILABLE` hoặc lỗi quá tải, service thử các fallback. Nếu tất cả đều không khả dụng, API trả lỗi `GEMINI_UNAVAILABLE` và không lưu quantities.

## 9. Chạy project

```bash
pnpm install
pnpm dev
```

Kiểm tra chất lượng:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Không chạy `pnpm build` đồng thời với `pnpm dev`, vì hai tiến trình cùng ghi `.next` có thể làm hỏng cache chunk/manifest.

## 10. Hướng cải thiện tiếp theo

1. Dùng vị trí X/Y của PDF.js để nhóm text theo column thay vì chỉ parse dòng phẳng.
2. Nhận diện quantity đứng ngay trước unit trong table row, nhưng vẫn refusal khi có nhiều candidate ngang nhau.
3. Hiển thị source bounding box hoặc link tới page preview để reviewer đối chiếu nhanh.
4. Thêm auth/tenant isolation trước khi dùng với dữ liệu customer thật.
5. Thêm rate limit và quota tracking cho Gemini.
