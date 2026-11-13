# Kiểm tra chức năng tham chiếu chéo — 2026-11-14

## Kết quả

- E2E với backend thật và MySQL `crispy_bite_test`: 32/32 ca qua trên Desktop Chrome và Mobile Layout. Luồng thu ngân → hóa đơn → bếp nay khẳng định tên món thật trên cả hóa đơn và ticket.
- Backend MySQL: 79/79 ca qua ở 8 file đặt bàn, hoàn trả nhập hàng, công nợ nhà cung cấp, snapshot báo cáo cuối ngày, món hủy, cashbook đồng thời và hoa hồng. Nhóm đơn hàng đã qua 124/124 ca trong lượt kiểm trước.
- Frontend: 92/92 file, 337/337 ca qua với lệnh `npm run test:frontend`; `npm run typecheck --workspace frontend` qua. Đã sửa setup test cho module Expo native dùng trong helper PDF, cập nhật mock in báo cáo và dữ liệu giả lập phân trang nhân viên.

## Vấn đề cấu hình còn mở

- Nút đăng nhập tài khoản dùng thử ở frontend dùng mật khẩu mẫu cố định. Nếu `SEED_ADMIN_PASSWORD`, `SEED_CASHIER_PASSWORD` hoặc `SEED_KITCHEN_PASSWORD` được đổi khi seed, nút tương ứng sẽ báo sai mật khẩu. Lượt E2E đầu tiên tái hiện được; sau khi seed **riêng database test** bằng mật khẩu demo, 32/32 ca qua. Cần quyết định cách bật/tắt tài khoản dùng thử ở môi trường dùng mật khẩu tùy chỉnh; không đổi mật khẩu ngoài database test.
- Luồng QR sau check-in và thanh toán trên trình duyệt chưa có E2E hoàn chỉnh. Backend có các bài kiểm thử đặt bàn và xác nhận thanh toán; E2E hiện kiểm việc từ chối gửi món khi chưa có phiên đặt bàn hợp lệ.

## Phạm vi

Không chạy lại toàn bộ 1.136 ca backend trong lượt này; lần chạy đầy đủ trước đó đã qua. Các nhóm backend bị ảnh hưởng trực tiếp và các tham chiếu chéo nêu trên đã được chạy lại.
