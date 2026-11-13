# Tiến độ — 2026-11-14

- Bắt đầu khảo sát hai vấn đề còn mở từ biên bản tham chiếu chéo. Đã đọc `planning-with-files` và `brainstorming`.
- Đã xác nhận phương án sửa demo: khi mật khẩu mẫu không còn đúng, dẫn về form đăng nhập bằng tên tài khoản vừa chọn và thông báo dùng mật khẩu được cấp. Luồng QR E2E sẽ chuẩn bị đặt bàn/check-in qua API, thao tác gọi món ở browser và kiểm xác nhận/KDS.
- Demo fallback đã triển khai: lỗi INVALID_CREDENTIALS từ nút demo chuyển sang form với username đúng và thông báo mật khẩu được cấp; test 2/2 qua.
- QR E2E mới đã qua 2/2 ca desktop/mobile: đặt bàn → cọc → check-in → QR order → chờ thanh toán → thu ngân duyệt → KDS thấy món. Database test đã reset theo 36 migration chuẩn sau lỗi seed cashbook cũ.
- Web export qua sau khi tách native/web entry. Android export qua với Hermes bundle 7.52 MB khi TEMP/TMP nằm trong workspace.
- Tổng E2E 36/36 ca qua trên database test sạch; frontend 92/92 file, 338/338 ca qua; frontend typecheck qua; backend QR/đặt bàn 3/3 file, 22/22 ca qua.
