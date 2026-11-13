# Findings — khép khoảng trống nghiệm thu

- Biên bản 2026-11-14 ghi nhận demo login dùng mật khẩu cố định, lệch `SEED_*_PASSWORD` tùy chỉnh; E2E QR sau check-in/thanh toán chưa có.
- Nhánh `codex/taste-redesign` sạch ở đầu lượt; backup đã có từ đợt UI trước.
- `AuthContext.demoLogin` thử mật khẩu `admin123`/`cashier123`/`kitchen123` cố định; `LoginScreen` luôn hiện ba nút demo. `login` trả thông báo sai mật khẩu chung từ API.
- QR khách nhận `reservationToken` qua URL ở `RootNavigator`; `TableOrderScreen` tạo đơn rồi tự gọi `payment-declaration`. Backend chỉ đưa đơn tới KDS sau xác nhận chuyển khoản hoặc cho trả sau. Có backend tests cho việc chặn/nhả đơn.
- `ui-skills-root` được đọc; lệnh CLI `npx ui-skills categories` không trả kết quả trong 30 giây và đã dừng. Dùng Taste hiện có, giữ bố cục LoginScreen và chỉ đổi phản hồi tương tác.
- Demo fallback không bật/tắt theo build; khi máy chủ trả `INVALID_CREDENTIALS` từ lần thử mật khẩu mẫu, UI chuyển sang nhập thủ công. Lỗi mạng giữ thông báo mạng hiện có.
- Full seed kích hoạt Sổ quỹ và chỉ tạo tài khoản CASH; thanh toán BANK_TRANSFER cần chỉ định tài khoản BANK. E2E tạo tài khoản qua API quản trị khi thiếu. Không đổi seed hoặc nghiệp vụ thanh toán.
- `frontend/index.js` nhập `InitializeCore` native vô điều kiện nên web build thất bại. Entry `.native.js`/`.web.js` đã giải quyết mà không đổi luồng khởi tạo Android.
