# Tiến độ làm mới giao diện

## 2026-11-10

- Đã rà danh mục màn hình, điều hướng theo vai trò và kết quả kiểm tra Taste Skill trước đó.
- Đã lập phạm vi, hướng thiết kế, backlog UI-00 đến UI-07 và điều kiện nghiệm thu trong `task_plan.md`.
- Chưa bắt đầu UI-00. Lượt này chỉ tạo tài liệu lập kế hoạch.

## Đợt triển khai Taste Skill

- Tạo và xác minh nhánh backup `codex/backup-pkhanh-before-taste` tại `2a76b4c`. Tạo worktree `.worktrees/taste-redesign` trên nhánh `codex/taste-redesign`.
- UI-00 đang thực hiện. Baseline typecheck qua. Vitest có 306 test qua và ba suite không tải do `__DEV__` trong Expo. ESLint có một lỗi kiểu interface trống trong RestaurantContext và tám cảnh báo.
- UI-01 và UI-02 đang thực hiện. Đã chỉnh nút chung, Đăng nhập, POS và thẻ món. Web có hover/press và chuyển động mở đầu có hỗ trợ giảm chuyển động. Ảnh lỗi dùng biểu tượng dự phòng. Handler, API và phép tính đơn giữ nguyên.
- Kiểm tra lại trên nhánh triển khai cho cùng kết quả typecheck, unit test và lint với baseline.
- Build worktree ban đầu lỗi vì thiếu node_modules, sau đó Metro TreeFS xung đột với junction. Thử cấu hình preview tạm dùng đường dẫn dependency thật và phục hồi metro.config.js sau khi chạy.
- Build web thành công sau khi dùng cấu hình preview tạm. Đã phục hồi metro.config.js.
- Lần chạy Chrome đầu tiên chụp được đăng nhập nhưng thiếu thẻ món do fixture dùng sai tên trường. Đổi sang menuItems theo hợp đồng hiện tại.
- Chrome đã chụp Đăng nhập sáng/tối và POS giả lập ở 390, 768, 1024 và 1440 px, không tràn ngang toàn trang. Đã xem ảnh Đăng nhập desktop và POS mobile. Ảnh POS dùng URL lỗi để kiểm biểu tượng dự phòng.
- Chưa xác minh nghiệp vụ qua backend thật hay giao diện native.
- Bắt đầu UI-03 trên cùng worktree sau khi người dùng nhắc tiếp tục dùng Taste Skill. Đã đồng bộ đường căn của màn bếp, tăng độ rõ của mã đơn, giờ chờ và tên món, nhấn rõ tổng tiền trên thẻ bàn, và chuyển ngữ nghĩa heading của ScreenHeader vào đúng văn bản tiêu đề. Còn kiểm trực quan các màn này và tiếp tục nhóm đơn hàng, điều hướng cùng modal.
- Đã cập nhật kế hoạch bao phủ 40 tệp màn hình, chia P0/P1/P2 và đặt điều kiện chuyển đợt. Lượt cập nhật kế hoạch không sửa mã nguồn.
- Đã chỉnh cột bố cục và lời hướng dẫn Đặt bàn, cùng câu chữ dẫn vào giỏ ở luồng QR. Typecheck và diff check qua. Bản xuất đầu lỗi ghi tài nguyên, bản xuất lại vào dist của worktree thành công, cấu hình Metro được phục hồi.
- Chrome kiểm dữ liệu giả lập ở 390, 768, 1024 và 1440 px. Đã chụp Bếp có ticket, Bàn có dữ liệu, form Đặt bàn, màn tiền cọc, thực đơn QR và giỏ sau khi thêm món. Không phát hiện tràn ngang toàn trang. Fixture cảnh báo tồn kho được sửa về mảng theo API trước khi chạy lại.
- Còn kiểm giao dịch thật và native trước khi đóng nghiệm thu P0.

## Mở rộng qua các nhóm nghiệp vụ

- Đợt B đã chỉnh Hóa đơn, Sổ quỹ và Báo cáo tổng quan. Tập trung vào tổng tiền, bộ lọc, vùng chạm và token sáng/tối. Báo cáo cuối ngày và các đầu ra in/xuất giữ nguyên ở đợt này.
- Đợt C đã chỉnh thanh tab Kho và form mẫu Phiếu nhập. Các form trả, kiểm, hủy cần kiểm riêng với dữ liệu.
- Đợt D đã chuẩn hóa Field, Feedback và ScreenHeader. Sau kiểm ảnh 390 px, sửa tiêu đề bị ép, ngày lọc bị tràn và thanh tab quản trị bị cắt chữ. Chrome tiếp tục phát hiện tràn ở Thực đơn và Bảng giá. Đã sửa thanh công cụ và trường tìm kiếm, chờ kiểm lại trên build mới.
- Đợt E đã cho thanh tab Nhân viên xuống dòng trên màn hẹp. Các luồng chi tiết lịch, chấm công, lương và hoa hồng vẫn cần kiểm riêng.
- Chạy Vitest toàn frontend. 306 test qua và ba suite có lỗi `__DEV__` giống mốc gốc. Typecheck và build web của đợt đầu qua. Chạy lại build sau các điều chỉnh tràn ngang.
- Build cuối đã qua và cấu hình Metro tạm đã được phục hồi. Chrome đã kiểm P0 và 11 màn quản trị cấp đầu ở 390, 768, 1024 và 1440 px. Sau khi chỉnh Thực đơn và Bảng giá, không phát hiện tràn ngang toàn trang trong các màn đã chạy. Hóa đơn và Sổ quỹ có dữ liệu mẫu; một số màn quản trị được chụp ở trạng thái thiếu dữ liệu.
- Chưa nghiệm thu các màn con và modal toàn hệ thống, biểu đồ có dữ liệu, giao dịch backend thật hoặc native. Thay đổi tiếp tục nằm trong worktree riêng.
- Tiếp tục đợt C với form Phiếu trả hàng. Tiêu đề và các nút ở cuối form có thể xuống dòng, ô nhập đạt vùng chạm chung, tổng tiền dễ đọc hơn. Typecheck và diff check qua. Còn kiểm trực quan form với dữ liệu.
- Tiếp tục đợt C ở form Kiểm kho và Hủy nguyên liệu. Tiêu đề vùng form cùng nhóm nút cuối và nút nhập liệu có thể xuống dòng khi thiếu chỗ. Typecheck và diff check qua. Còn ảnh nghiệm thu của hai form với dữ liệu.
- Tiếp tục đợt C ở bốn màn danh sách Phiếu nhập, Phiếu trả, Kiểm kho và Hủy nguyên liệu. Nhóm nút tiêu đề và thanh công cụ có thể xuống dòng; hai bộ lọc ngày dùng vùng chạm chung và cho ô nhập co lại. Typecheck và diff check qua. Chưa chụp ảnh các danh sách có dữ liệu.

## 2026-11-10 - milestone cb4b141
- Committed UI-only presentation changes on codex/taste-redesign. Backup codex/backup-pkhanh-before-taste remains at 2a76b4c.
- Typecheck and web export pass. Chrome fixture screenshots at 390, 768, 1024, 1440 cover P0 entry states, 11 admin tabs, six inventory sections, four inventory composers, six employee sections, checkout modal, sales report, and dark-theme representatives. No page-level horizontal overflow after fixing employee schedule week controls; schedule grid intentionally scrolls inside its frame.
- Fixture endpoints absent from mock produce explicit error states. Backend integration and native device flows are still unverified; full browser screenshot sweep is representative rather than every modal/state. Existing frontend tests have 306 passing cases and three baseline Expo __DEV__ suite failures; lint has one baseline error in RestaurantContext.tsx.


## 2026-11-10 - milestone d51e493
- Added Chrome fixture coverage for kiosk, sales returns, delivery partners and table management at 390, 768, 1024, 1440. Found and fixed mobile overflow in table management buttons, sales return filter/table layout and date fields, and delivery partner buttons. Screenshots refreshed in visualization workspace.
- Frontend typecheck and web export pass; frontend lint remains at the previously recorded baseline of 1 error and 8 warnings. Worktree codex/taste-redesign is clean after commit d51e493.
- Backend E2E cannot run from this worktree yet: no .env or backend/.env, and no MySQL listener on 3306. Android SDK/adb/emulator are not installed. These remain verification gaps, not implementation changes.

## 2026-11-11 - mốc bàn giao d38236e
- Sửa modal chọn hóa đơn trả hàng và form thêm phòng/bàn ở màn 390 px. Kiểm hình học xác nhận ô nhập khu vực, nút tạo khu vực và trường kế tiếp không còn chồng nhau. Web export, typecheck và lượt ảnh ở 390, 768, 1024, 1440 px đã qua.
- Đã push các commit giao diện lên `codex/taste-redesign` tại `pKhanh123/Restaurant-Management`.
- Tài liệu kế hoạch, phát hiện và tiến độ được đưa vào `docs/taste-redesign/` để đi cùng nhánh khi pull trên máy khác. Hướng dẫn chạy nằm ở README trong cùng thư mục.

## 2026-11-12 - kiểm modal và script lặp lại
- Chụp và kiểm modal chi tiết bàn, chọn hóa đơn trả hàng, thêm phòng/bàn, thêm nhân viên, thiết lập lương, thêm món và tạo voucher ở bốn viewport. Các form nhân viên, món và voucher không phát hiện lỗi bố cục ở màn 390 px.
- Đưa kịch bản kiểm bằng dữ liệu giả lập vào `scripts/taste-visual-smoke.cjs` để có thể chạy lại trên máy khác. Script đã qua lượt chạy ở 390, 768, 1024 và 1440 px; có kiểm hình học cho ô nhập và nút tạo khu vực trong form phòng/bàn.
- Các giao dịch backend thật và Android vẫn chờ môi trường kiểm thử tương ứng.
