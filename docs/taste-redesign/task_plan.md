# Kế hoạch làm mới giao diện Crispy Bite

**Trạng thái:** Giao diện web đã được sửa theo từng đợt và push lên `codex/taste-redesign`. Còn nghiệm thu với backend thật và Android trước khi tích hợp.

## Cô lập thay đổi và phục hồi

- Mốc gốc: `2a76b4c2ff1cdb0521c2512d079467c70111b70a`. Nhánh backup cục bộ `codex/backup-pkhanh-before-taste` trỏ đến commit này.
- Nhánh triển khai: `codex/taste-redesign`, worktree `.worktrees/taste-redesign`. Các thay đổi chưa commit và stash ở worktree `pKhanh` nằm ngoài nhánh backup và được giữ tại chỗ.
- Mỗi đợt rà `git diff --check`, danh sách đường dẫn và diff logic trước khi tạo mốc. Chỉ chấp nhận file trình bày frontend. Dừng để tách task khi một cải tiến đòi hỏi sửa API, state nghiệp vụ, schema hoặc test hợp đồng.
- Nếu một đợt có hồi quy, sửa trên nhánh triển khai hoặc hoàn tác đúng commit của đợt đó. Chỉ tích hợp về `pKhanh` sau khi đối chiếu kết quả nghiệm thu.

## Tiêu chí Taste theo bề mặt

| Bề mặt | Tiêu chí kiểm |
| --- | --- |
| Đăng nhập | Một hành động chính, cùng đường căn trái/phải, thương hiệu rõ, nội dung hiện ngay. Chuyển động mở đầu nhẹ và tôn trọng giảm chuyển động. |
| Đặt bàn và gọi món | Ảnh món có sẵn được ưu tiên, ô ảnh có nội dung dự phòng, tên và giá đọc ngay, một hành động chính theo trạng thái. Hiệu ứng giữ nhẹ, tránh che nút và thông tin. |
| POS, bếp, báo cáo, quản trị | Giữ cấu trúc thao tác, căn lề thống nhất, chữ và số rõ, phân cấp ít lớp, dùng phản hồi hover/press/focus vừa đủ. Bảng có vùng cuộn riêng nếu cần giữ cột. |

Các quy tắc về hero toàn màn hình, chuỗi ảnh, cảnh và điểm nhấn chuyển động của landing page được đánh giá riêng. App hiện tại có các màn tác nghiệp, nên áp dụng tiêu chí thị giác và khả năng sử dụng phù hợp từng màn, ghi rõ các quy tắc landing page nằm ngoài phạm vi.

## Trình tự trong mỗi đợt

1. Ghi màn hình, vai trò, dữ liệu mẫu và trạng thái cần chụp trước khi sửa.
2. Tách thay đổi token/component chung khỏi thay đổi từng màn. So sánh cấu trúc điều hướng, callback, test ID và thứ tự hành động.
3. Chạy kiểm tra code và ảnh sáng/tối ở viewport mục tiêu. Khi thiếu backend hoặc thiết bị, ghi rõ luồng chưa kiểm.
4. Đánh dấu kết quả theo màn, lỗi cần sửa và mức hồi quy so với baseline. Chỉ chuyển đợt khi các lỗi chặn đã được xử lý.

## Mục tiêu và phạm vi

Làm mới toàn bộ giao diện Expo/React Native, gồm web và native, theo hướng dễ đọc và thao tác nhanh trong ca làm. Giữ cấu trúc điều hướng theo vai trò và vị trí tương đối của các vùng thao tác quen thuộc. Cải thiện cách căn lề, nhóm thông tin và sắp xếp trên màn hình nhỏ.

Đợt đầu chỉ thay đổi token, style, tài sản thương hiệu và thành phần trình bày. Có thể sắp xếp lại JSX khi giữ nguyên điều kiện hiển thị, thứ tự thao tác, dữ liệu, callbacks, định danh và thứ tự focus hợp lý. Giữ nguyên API, backend, schema, quyền, route, state, hooks, nghiệp vụ, validation, phép tính và nội dung xuất PDF/in. Nếu phát hiện vấn đề cần sửa logic, ghi thành task riêng.

## Hướng thiết kế đề xuất

- Giữ logo và tông đỏ Crispy Bite. Dùng nền trung tính, chữ rõ và khoảng cách nhất quán. Màu thương hiệu dành cho thao tác chính. Màu trạng thái đi cùng nhãn chữ.
- Giữ Inter cho nội dung và Barlow Condensed cho tiêu đề. Ưu tiên độ dễ đọc của giá tiền, số bàn, trạng thái món và giờ đặt. Đồng bộ giao diện sáng/tối.
- Dùng một hệ thống chung với hai mật độ. POS, bếp và bảng dữ liệu ưu tiên nhìn nhanh. Đặt bàn và gọi món ưu tiên khoảng thở, ảnh món và thao tác chạm. Áp dụng Taste Skill cho căn lề, hình ảnh, câu chữ và phản hồi tương tác. Giữ mật độ và bố cục theo nhu cầu vận hành của từng màn.
- So với chỉ đổi màu, hướng này giải quyết cả phân cấp thông tin và responsive. So với thiết kế lại luồng, nó giảm phạm vi hồi quy và giữ thói quen thao tác của nhân viên.

## Backlog theo thứ tự triển khai

Phạm vi kiểm kê gồm 40 tệp màn hình, cùng các modal và thành phần điều hướng đang được dùng. Chọn mức thay đổi theo công việc người dùng thực hiện trên từng màn. Mỗi màn trong danh mục có kết quả riêng: thiết kế lại, đồng bộ UI chung hoặc giữ bố cục sau khi kiểm tra.

### Ưu tiên theo luồng

| Ưu tiên | Màn hình | Mức thay đổi và tiêu chí riêng |
| --- | --- | --- |
| P0 | Đăng nhập và khung điều hướng | Hoàn thiện mẫu đăng nhập, làm rõ vai trò và tab đang chọn. Giữ thứ tự tab. Rà tên điều khiển, focus và chế độ giảm chuyển động. |
| P0 | POS, giỏ, thanh toán, hóa đơn | Giữ tìm món, danh mục và giỏ ở vị trí quen thuộc. Căn lề lưới với đầu màn, phân cấp tên món, giá, tổng tiền và nút xác nhận. Kiểm giỏ trống, giỏ dài, lỗi ảnh và modal checkout. |
| P0 | Bếp, bàn và chi tiết bàn | Ưu tiên mã đơn, thời gian chờ, số bàn và trạng thái. Dùng chữ cùng màu trạng thái. Kiểm thẻ có tên món dài và nhiều ghi chú trên màn hẹp. |
| P0 | Đặt bàn công khai, gọi món QR, giỏ khách | Thiết kế theo hành trình hiện có. Dùng ảnh món từ dữ liệu và biểu tượng dự phòng khi lỗi. Mỗi bước có một nút chính rõ ràng. Kiểm QR, cọc và thông báo xác nhận trên điện thoại. |
| P1 | Đơn hàng, trả hàng, đặt bàn nội bộ, sổ quỹ | Đồng bộ cấu trúc tiêu đề, lọc, bảng và chi tiết. Giữ cột số tiền dễ đối chiếu. Trên mobile cho bảng cuộn trong vùng riêng và bảo đảm thao tác chính nhìn thấy được. |
| P1 | Báo cáo tổng quan và cuối ngày, kho và các phiếu | Chuẩn hóa tiêu đề, KPI, biểu đồ, bộ lọc và bảng. Kiểm trường hợp dữ liệu dài và trống. So sánh số liệu và đầu ra in/xuất với mốc trước khi sửa. |
| P2 | Thực đơn quản trị, bảng giá, ưu đãi, khách hàng, đối tác giao hàng, nhật ký, quản lý bàn | Áp dụng thành phần form, bảng, nhãn và modal dùng chung. Giữ bố cục màn đã dễ đọc. Chỉ sửa riêng khi kiểm tra thấy vấn đề cụ thể. |
| P2 | Nhân viên, lịch, chấm công, lương, hoa hồng và cài đặt | Đồng bộ điều hướng phụ, biểu mẫu và bảng. Rà các nút xác nhận, lỗi và quyền. Kiosk chấm công ưu tiên nút lớn, trạng thái dễ đọc và kiểm trên thiết bị chạm. |

### Điều kiện để chuyển đợt

- **P0:** Có ảnh trước/sau và kiểm trực tiếp tại bốn viewport. Với đăng nhập và POS đã có bản Chrome giả lập. Việc còn lại là đối chiếu luồng trên môi trường thử nghiệm và kiểm trực quan Bếp, Bàn, Đặt bàn và QR.
- **P1/P2:** Dùng một màn đại diện cho mỗi kiểu bảng, form, modal và báo cáo để chốt thành phần dùng chung. Rà từng màn về dữ liệu, bố cục và thao tác. Ghi lý do khi giữ bố cục cũ.
- **Bàn giao:** Lưu danh sách màn đã kiểm, ảnh đối chiếu, kết quả chạy trên web/native và các ngoại lệ Taste có lý do. Nếu có lỗi baseline, ghi rõ kết quả trước và sau. Kiểm tra backup còn trỏ về mốc gốc trước khi đề xuất tích hợp.

### Sổ theo dõi triển khai

| Đợt | Trạng thái đầu đợt | Thứ tự công việc |
| --- | --- | --- |
| A · P0 | Đã có ảnh Chrome giả lập ở bốn kích thước. Chưa nghiệm thu backend/native. | Giữ mốc preview, hoàn thiện nhịp chung và rà điều hướng. |
| B · P1 giao dịch | Đã chỉnh và kiểm màn cấp đầu | Hóa đơn, Sổ quỹ và Báo cáo tổng quan. Còn kiểm dữ liệu báo cáo, trả hàng và modal giao dịch. |
| C · P1 kho | Đã chỉnh khung và form mẫu | Đã kiểm khung Kho. Còn phiếu nhập/trả/kiểm/hủy với dữ liệu và các trạng thái form. |
| D · P2 quản trị | Đã kiểm các màn chính | Đã sửa Thực đơn, Bảng giá và thành phần chung. Còn kiểm màn con và modal với dữ liệu dài. |
| E · P2 nhân viên | Đã chỉnh và kiểm khung | Còn lịch, chấm công/kiosk, lương, hoa hồng, cài đặt với dữ liệu thử. |
| F · Tổng kiểm | Đã kiểm web cấp đầu | P0 và 11 màn quản trị ở bốn viewport. Còn hồi quy màn con, backend/native và rà trước tích hợp. |

### Quy tắc Taste dùng chung

- Cùng lưới căn lề, một hệ thống chữ/màu/khoảng cách, ưu tiên hành động chính, tiêu đề gọi đúng tên tác vụ.
- Ảnh món có khung ổn định và nội dung dự phòng. Các điều khiển có tên, nhãn và focus rõ. Phản hồi hover/press nhẹ, tôn trọng giảm chuyển động. Kiểm tương phản trong cả hai theme.
- Màn tác nghiệp giữ mật độ thông tin và cấu trúc thao tác. Quy tắc hero toàn màn hình và các đoạn trình diễn chuyển động dành cho trang giới thiệu nếu dự án có trang đó.

| Task | Phạm vi | Điều kiện nghiệm thu |
| --- | --- | --- |
| UI-00 | Chụp mốc hiện tại. Lập danh mục màn hình, modal, trạng thái và quyền từ RootNavigator, RoleTabs và các màn workspace. Ghi kết quả typecheck, lint và test frontend trước khi sửa. | Có ảnh mốc và ma trận route × vai trò × viewport. Ghi riêng lỗi đã tồn tại. |
| UI-01 | Chuẩn hóa theme, spacing, typography, màu trạng thái và các thành phần dùng chung như Button, Field, Surface, ScreenHeader, StatusBadge, Feedback. | Nút chính, phụ, nguy hiểm và các trạng thái focus, pressed, disabled, loading hiển thị nhất quán ở hai theme. |
| UI-02 | Làm mẫu đăng nhập và POS. Ở POS giữ vùng tìm món, danh mục, lưới món, giỏ và thanh toán. Duyệt mẫu desktop và mobile trước khi mở rộng. | Hai màn thể hiện được cả form và giao diện dày thông tin. Luồng đăng nhập và các thao tác POS hiện có chạy qua cùng handler và cho cùng kết quả. |
| UI-03 | Áp dụng vào khung điều hướng, bàn, đơn hàng, trả hàng, đối tác giao hàng và bếp. Rà cả modal thanh toán, hóa đơn và chi tiết bàn. | Vai trò thấy đúng tab. Bếp đọc được trạng thái từ xa. Thu ngân nhận diện bàn, tổng tiền và nút thao tác mà không phải tìm qua nhiều vùng. |
| UI-04 | Làm mới đặt bàn, gọi món QR, giỏ khách và kiosk chấm công. | Kiểm tra ảnh món, cọc, QR, xác nhận và các trạng thái trống/lỗi ở màn hẹp. So sánh luồng và nội dung với mốc hiện tại. |
| UI-05 | Đồng bộ màn quản trị gồm thực đơn, bảng giá, ưu đãi, khách hàng, đặt bàn, quản lý bàn, nhật ký, kho và các phiếu nhập/trả/kiểm/hủy. | Bảng, bộ lọc, biểu mẫu và modal cùng quy tắc. Thứ tự trường, dữ liệu và thao tác tạo/sửa/xóa giữ nguyên. |
| UI-06 | Đồng bộ báo cáo, sổ quỹ và các màn nhân viên gồm hồ sơ, lịch, chấm công, lương, hoa hồng và cài đặt. | Giá trị KPI, tổng tiền, kết quả lọc, các thao tác hiện có và đầu ra in/xuất khớp bản trước. |
| UI-07 | Kiểm thử toàn bộ, rà diff theo phạm vi và xử lý lỗi giao diện. | Tất cả màn và modal trong danh mục được kiểm. Typecheck, lint, test và build web không phát sinh lỗi mới. |

## Kiểm chứng trước khi bàn giao

- Web ở 390×844, 768×1024, 1024×768 và 1440×900. Kiểm tra thêm quanh các ngưỡng bố cục hiện tại nếu có thay đổi. Android kiểm tra tối thiểu một màn hẹp và một thiết bị rộng khi có môi trường. Ghi rõ nền tảng chưa được chạy.
- Kiểm tra sáng/tối, bàn phím và focus trên web, vùng chạm, cuộn có chủ đích, chữ dài, trạng thái rỗng, loading, lỗi và modal. Không có tràn ngang toàn trang, nội dung bị cắt hay CTA bị che bởi bàn phím.
- Smoke test đăng nhập theo vai trò, tạo đơn và thanh toán, bếp cập nhật món, đặt bàn/QR và lọc báo cáo. Dùng dữ liệu kiểm thử. So sánh API được gọi, payload và kết quả trước/sau cho các luồng đã chạy.
- Ưu tiên ảnh chụp và kiểm trực tiếp trên bản Expo. Checker của Taste Skill yêu cầu markup landing page và từng không xuất được kết quả khi thiếu `.wrap`.

## Mức độ khó

Trung bình đến cao. Thiết kế nền và hai màn mẫu có phạm vi rõ. Phần tốn công là áp dụng nhất quán cho nhiều màn, modal và trạng thái dữ liệu, rồi kiểm tra đủ vai trò, kích thước và nền tảng. Chốt ước lượng triển khai sau UI-00 và UI-02.
