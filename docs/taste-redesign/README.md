# Taste redesign: bàn giao để chạy trên máy khác

Nhánh làm việc: `codex/taste-redesign`. Các thay đổi giao diện đã commit; chưa tích hợp vào `pKhanh`. `task_plan.md`, `findings.md` và `progress.md` trong thư mục này ghi phạm vi, quyết định và kết quả kiểm tra.

## Lấy mã và chạy

```bash
git fetch https://github.com/pKhanh123/Restaurant-Management.git codex/taste-redesign
git switch -c codex/taste-redesign FETCH_HEAD
npm install
```

Repo dùng Node và npm theo `package.json` và `.nvmrc`. Để chạy cùng backend, sao chép `.env.example` thành `.env`, cấu hình MySQL theo [README gốc](../../README.md), rồi chạy backend và frontend ở hai terminal:

```bash
npm run dev:backend
npm run dev:frontend
```

Kiểm tra nhanh:

```bash
npm run typecheck:frontend
npm run build:frontend
```

Để lặp lại lượt kiểm bố cục bằng dữ liệu giả lập ở 390, 768, 1024 và 1440 px, cài trình duyệt Playwright một lần rồi chạy script từ gốc repo:

```bash
npx playwright install chromium
node scripts/taste-visual-smoke.cjs frontend/dist visual-smoke-shots
```

Ảnh được lưu trong `visual-smoke-shots/` và không được đưa vào Git. Script chỉ dùng server cục bộ và dữ liệu giả lập; các thông báo lỗi tải dữ liệu là trạng thái thiếu fixture, không phản ánh backend thật.

Không mang theo `node_modules`, `frontend/dist`, junction hoặc `.env` từ máy đã phát triển. Cài dependencies và cấu hình môi trường trên máy mới. Nhánh này chỉ thay đổi frontend; chưa kiểm luồng với backend thật hoặc Android. Lint frontend ở mốc gốc đã có 1 lỗi và 8 cảnh báo, Vitest frontend có 3 suite lỗi `__DEV__` ở mốc gốc.
