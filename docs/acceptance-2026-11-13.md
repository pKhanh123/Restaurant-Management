# Nghiệm thu giao diện và giao dịch — 2026-11-13

## Đã xác minh

- Chạy Playwright với backend thật và MySQL `crispy_bite_test`: 32/32 bài qua ở Desktop Chrome và Mobile Layout. Các luồng có tạo đơn POS, xem hóa đơn, chuyển trạng thái trong KDS, xem báo cáo, bàn, và kiểm tra giao diện QR.
- Kiểm thử báo cáo dòng tiền cuối ngày trên MySQL test: 31/31 bài qua sau khi thêm bản ghi chi nhánh `MAIN` mà migration chuẩn thường tạo.
- `npm run typecheck`: backend và frontend đều qua.
- Expo export Android tạo thành công Hermes bundle. Android SDK và AVD `Pixel_3a` đã được tìm thấy trên máy; chạy ứng dụng bằng Expo Go trên Android emulator API 37.1 với backend thật và MySQL `crispy_bite_test`.
- Trên giả lập, đăng nhập thu ngân, chọn món có modifier bắt buộc, tạo đơn ăn tại bàn, xem hóa đơn với VAT 8%, đăng nhập bếp và chuyển ticket qua `Đang chế biến` rồi `Sẵn sàng` đều chạy được. Đã sửa lỗi tên món trên hóa đơn và KDS bị thay bằng `Món #ID`; xác nhận KDS tải lại và hiển thị tên món thật. Kiểm thử hồi quy API tạo đơn, danh sách và chuyển trạng thái: 7/7 ca qua.
- Đã sửa header chồng lên thanh trạng thái trên Android edge-to-edge bằng safe area; chụp lại trên emulator xác nhận header nằm dưới status bar. Frontend typecheck và backend build đều qua sau thay đổi.
- Sau khi sửa tên món, toàn bộ nhóm backend `test/orders` qua: 17/17 file, 124/124 ca. Bộ backend đầy đủ 1.136 ca đã qua trước thay đổi này; lượt chạy lại đầy đủ được dừng sau khi nhóm cashflow 31/31 ca qua để tập trung xác minh nhóm đơn hàng bị ảnh hưởng.
- Ngày 2026-11-13, `prisma migrate reset --force --skip-seed --skip-generate` chạy thành công trên riêng `crispy_bite_test`: đủ 36 migration từ database trống. `prisma migrate status` trên database dev cũng báo up to date. Hai migration cashbook tháng 9 bị merge trùng đã được loại theo xác nhận của chủ repository; hai migration bếp/bàn từng bị thiếu được khôi phục nguyên bản từ lịch sử Git.
- Toàn bộ backend suite trên database test vừa tạo bằng migration chuẩn: 136/136 file và 1.136/1.136 ca qua. Vòng kiểm thử trước trên database test dựng bằng `db push` có một ca fail do bản ghi `MAIN` thiếu `isDefault=true`; lỗi này biến mất khi dùng migration chuẩn.

## Việc còn lại trước khi nghiệm thu toàn hệ thống

1. Nghiệm thu trên thiết bị Android vật lý vẫn cần thực hiện khi có thiết bị kết nối; hiện đã kiểm trên Android emulator bằng Expo Go.
2. Kiểm tra luồng QR đặt món sau khi đặt bàn và check-in. Bài hiện tại xác nhận đúng việc chặn gửi món khi chưa có phiên đặt bàn hợp lệ; luồng thanh toán QR sau check-in chưa được E2E bao phủ.

## Cách chạy lại E2E

Chuẩn bị backend build, frontend build, Chrome cài trên máy, và database test đã có schema/seed. Đặt `PLAYWRIGHT_CHANNEL=chrome` nếu Playwright Chromium chưa được cài. Chỉ trỏ `DATABASE_URL` vào database test khi chạy, không dùng database phát triển hoặc production.
