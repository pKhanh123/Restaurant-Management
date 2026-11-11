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

Không mang theo `node_modules`, `frontend/dist`, junction hoặc `.env` từ máy đã phát triển. Cài dependencies và cấu hình môi trường trên máy mới. Nhánh này chỉ thay đổi frontend; chưa kiểm luồng với backend thật hoặc Android. Lint frontend ở mốc gốc đã có 1 lỗi và 8 cảnh báo, Vitest frontend có 3 suite lỗi `__DEV__` ở mốc gốc.
