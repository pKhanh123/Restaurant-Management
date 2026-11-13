# Kiểm tra chức năng tham chiếu chéo — 2026-11-14

## Kết quả

- E2E với backend thật và MySQL `crispy_bite_test`: 32/32 ca qua trên Desktop Chrome và Mobile Layout. Luồng thu ngân → hóa đơn → bếp nay khẳng định tên món thật trên cả hóa đơn và ticket.
- Backend MySQL: 79/79 ca qua ở 8 file đặt bàn, hoàn trả nhập hàng, công nợ nhà cung cấp, snapshot báo cáo cuối ngày, món hủy, cashbook đồng thời và hoa hồng. Nhóm đơn hàng đã qua 124/124 ca trong lượt kiểm trước.
- Frontend: 92/92 file, 337/337 ca qua với lệnh `npm run test:frontend`; `npm run typecheck --workspace frontend` qua. Đã sửa setup test cho module Expo native dùng trong helper PDF, cập nhật mock in báo cáo và dữ liệu giả lập phân trang nhân viên.

## Đã xử lý trong lượt tiếp theo

- Nút tài khoản dùng thử vẫn đăng nhập một chạm khi mật khẩu mẫu còn đúng. Nếu máy chủ trả `INVALID_CREDENTIALS`, màn hình điền sẵn tên tài khoản và yêu cầu mật khẩu được cấp; không đưa mật khẩu tùy chỉnh vào frontend. Unit test và E2E desktop/mobile xác nhận fallback.
- E2E QR mới đi từ tạo đặt bàn, khai báo và xác nhận cọc, check-in, gọi món trong trình duyệt khách đến xác nhận chuyển khoản và ticket bếp. Test kiểm đơn không xuất hiện trong KDS trước khi thu ngân xác nhận. Với Sổ quỹ đã kích hoạt, fixture dùng API quản trị tạo tài khoản BANK khi seed chưa có, rồi dùng tài khoản này cho cả hai giao dịch.
- Web build từng thất bại vì entry Android nạp `InitializeCore` cho web. Đã tách entry theo nền tảng; web export và Android Hermes export đều qua.

## Nghiệm thu bổ sung

- E2E với backend thật và MySQL test dựng từ 36 migration: **36/36 ca qua** trên Desktop Chrome và Mobile Layout.
- Frontend: **92/92 file, 338/338 ca qua**, frontend typecheck qua.
- Backend nhóm đặt bàn và đơn QR: **3/3 file, 22/22 ca qua**. Các nhóm khác 79/79 ca và nhóm đơn hàng 124/124 ca đã qua ở lượt kiểm trước.
- Android Hermes bundle xuất thành công; lượt này chưa chạy lại UI trên thiết bị vật lý. Kiểm tra trên Android emulator của lượt trước vẫn là mốc native hiện có.

## Phạm vi

Không chạy lại toàn bộ 1.136 ca backend trong lượt này; lần chạy đầy đủ trước đó đã qua. Database dev không bị seed/reset; chỉ `crispy_bite_test` được dựng lại để chạy E2E.
