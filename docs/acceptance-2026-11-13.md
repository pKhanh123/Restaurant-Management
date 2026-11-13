# Nghiệm thu giao diện và giao dịch — 2026-11-13

## Đã xác minh

- Chạy Playwright với backend thật và MySQL `crispy_bite_test`: 32/32 bài qua ở Desktop Chrome và Mobile Layout. Các luồng có tạo đơn POS, xem hóa đơn, chuyển trạng thái trong KDS, xem báo cáo, bàn, và kiểm tra giao diện QR.
- Kiểm thử báo cáo dòng tiền cuối ngày trên MySQL test: 31/31 bài qua sau khi thêm bản ghi chi nhánh `MAIN` mà migration chuẩn thường tạo.
- `npm run typecheck`: backend và frontend đều qua.
- Expo export Android tạo thành công Hermes bundle. Đây là kiểm tra build JavaScript, chưa phải chạy ứng dụng trên thiết bị Android.

## Việc còn lại trước khi nghiệm thu toàn hệ thống

1. Chạy ứng dụng trên máy Android hoặc emulator thật. Máy kiểm thử hiện tại không có Android SDK, `adb` hay emulator.
2. Chạy toàn bộ backend suite. Bộ kiểm thử chạy tuần tự và chậm; lần này đã xác minh riêng 31 bài dòng tiền, chưa có kết quả trọn bộ.
3. Sửa lịch sử Prisma migration trước khi khởi tạo database mới. Hai migration `20260923190000_cashbook_foundation` và `20260923200000_cashbook_purchase_links` tạo bảng/cột trùng với các migration cashbook tháng 10. `prisma migrate reset` trên database test riêng dừng tại lần tạo `FinancialAccount` thứ hai. Không chỉnh sửa hoặc xóa migration lịch sử khi chưa đối chiếu các môi trường đã triển khai, vì checksum và trạng thái áp dụng có thể khác nhau. Database test phục vụ E2E được tạo bằng `prisma db push` và seed riêng; database dev không bị reset.
4. Kiểm tra luồng QR đặt món sau khi đặt bàn và check-in. Bài hiện tại xác nhận đúng việc chặn gửi món khi chưa có phiên đặt bàn hợp lệ; luồng thanh toán QR sau check-in chưa được E2E bao phủ.

## Cách chạy lại E2E

Chuẩn bị backend build, frontend build, Chrome cài trên máy, và database test đã có schema/seed. Đặt `PLAYWRIGHT_CHANNEL=chrome` nếu Playwright Chromium chưa được cài. Chỉ trỏ `DATABASE_URL` vào database test khi chạy, không dùng database phát triển hoặc production.
