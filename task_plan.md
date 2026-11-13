# Kế hoạch: khép hai khoảng trống nghiệm thu 2026-11-14

## Mục tiêu
Nút tài khoản dùng thử phản ánh đúng cấu hình mật khẩu seed; luồng QR sau check-in và thanh toán có E2E với backend thật, database test riêng và kiểm tra tác động tới bếp.

## Nguyên tắc
- Không đưa mật khẩu seed hoặc token đặt bàn vào bundle/log công khai.
- Chỉ ghi dữ liệu vào `crispy_bite_test`; kiểm tra URL trước seed/test.
- Giữ API hiện có nếu đủ; thay đổi nghiệp vụ chỉ khi có lỗi tái hiện.
- Tài liệu kế hoạch, tiến độ và kết quả được commit để pull ở máy khác.

## Task
1. **Khảo sát [xong]:** đọc cấu hình seed, demoLogin, API đặt bàn/check-in, QR order và thanh toán; xác định đường đi E2E và dữ liệu fixture.
2. **Demo login [xong]:** khi mật khẩu mẫu không hợp lệ, đưa tên tài khoản vào form để nhập mật khẩu được cấp; thêm kiểm thử cho thành công và sai mật khẩu.
3. **QR E2E [xong]:** tạo đặt bàn, ghi nhận cọc/check-in, mở QR, gửi món, khai báo/xác nhận thanh toán, kiểm ticket KDS; bổ sung fixture bằng API nếu UI quản trị hiện không hỗ trợ chuẩn bị dữ liệu ổn định.
4. **Hồi quy [xong]:** E2E desktop/mobile 36/36, backend nhóm đặt bàn/đơn QR 22/22, frontend 338/338 và typecheck; web/Android export qua. Ghi rõ phần chưa bao phủ trong biên bản.
5. **Bàn giao [xong]:** cập nhật progress/findings, commit và push nhánh hiện tại, xác nhận worktree sạch.

## Lỗi và rủi ro gặp phải
- `npx ui-skills categories` không có output sau 30 giây; đã dừng, dùng các chỉ dẫn skill UI đọc trực tiếp.
- Test mới gọi `toJSON` trên ReactTestInstance và `unmount` không có trong type hiện tại; đã đổi assertion sang so khớp React element và bỏ thao tác không cần thiết.
- Seed lặp sau backend tests thất bại ở cashbook vì thời điểm giao dịch nguồn trước thời gian hoạt động đã tồn tại trong database test; cần reset **riêng** `crispy_bite_test` bằng migration chuẩn rồi seed lại ở chế độ test.
- Lệnh reset đầu dùng đường dẫn `.env` tương đối sai từ thư mục `backend`; guard không có URL nên Prisma dừng trước khi chạm database. Lần sau dùng `..\..\..\.env` và `$ErrorActionPreference='Stop'`.
- QR E2E đầu tiên dừng ở nút gửi giỏ: nhãn thực tế là `Tạo order & thanh toán trước`, không phải `Gửi bếp ngay`. Ảnh lỗi xác nhận UI và tổng tiền 427.680đ; sửa locator theo nhãn thật.
- Build web phát hiện `frontend/index.js` nhập React Native InitializeCore native vô điều kiện từ lần sửa Android trước; tách entry `.native.js`/`.web.js` để mỗi nền tảng nạp đúng runtime.
- Full seed bật Sổ quỹ nên xác nhận chuyển khoản cần `financialAccountId`. QR E2E cũ qua khi Sổ quỹ chưa bật; test mới sẽ đọc tài khoản BANK đang hoạt động qua API và truyền vào cả xác nhận cọc lẫn đơn hàng.
- Full seed không có tài khoản BANK, nên lần chạy toàn bộ 32 ca cũ qua nhưng 2 ca QR mới dừng tại xác nhận cọc. Fixture E2E sẽ tạo tài khoản BANK bằng API quản trị nếu thiếu.
- Android export đầu tiên bundle xong nhưng Hermes không ghi được `index.hbc` vào Temp sandbox của Codex; thử lại với TEMP/TMP trong workspace.
- Frontend typecheck bắt được type `ReactTestRenderer` thiếu `toJSON` dù Vitest chạy; assertion đổi sang `root` props có type hợp lệ.
- Lượt frontend cuối bắt thêm circular reference khi stringify `root.props.children` trong test demo; chuyển assertion sang so khớp React element như test đăng nhập hiện có.
