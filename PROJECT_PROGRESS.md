# 📊 BÁO CÁO TIẾN ĐỘ DỰ ÁN: CRISPY BITE QSR FAST FOOD SYSTEM

> **Hệ Thống Đa Nền Tảng Đặt Món & Quản Lý Nhà Hàng Fast Food "CRISPY BITE"**  
> **Kiến trúc**: Full-Stack Monorepo (React Native / Expo SDK 54 + Node.js / Express / Prisma / MySQL + Real-time Socket.io)  
> **Trạng thái**: Đã hợp nhất thành công toàn bộ đợt 4 từ nhánh `pKhanh` vào `main` (Merge PR #2 `0a4dba6`). Tích hợp hoàn hảo Hệ thống Sổ Quỹ & Dòng Tiền (Cashbook Ledger) và Động Cơ Tính Hoa Hồng Nhân Viên (Employee Commission Engine); Full Quality Gate PASS 100% (1,111/1,111 tests).  
> **Cập nhật lần cuối**: 2026-10-03 20:30:00

---

## 📈 1. TỔNG QUAN TIẾN ĐỘ (OVERALL PROGRESS)

```
[████████████████████] 100% HOÀN THÀNH (Phase 0 đến Phase 13; Hệ sinh thái Vận hành, Quản trị QSR, Nhân sự HRM, Sổ Quỹ & Hoa Hồng Toàn diện)
```

### 🧪 Bằng chứng kiểm chứng chất lượng (Verification Metrics)
- **Backend Test Suite (Vitest)**: 123/123 test files passed (822/822 tests pass 100% — bao gồm Toàn bộ cụm Sổ quỹ Cashbook, Hoa hồng nhân viên Employee Commissions, Nhân sự Employees, Lịch ca kíp Schedules, Chấm công Kiosk/Admin, Tính lương Payroll, Cài đặt chính sách Employee Settings, Đặt bàn Reservations, Khách hàng Customers, Đối tác giao hàng Delivery Partners, Kho NVL, BOM & COGS, Price List, Menu Bulk/Import/Export, Voucher Engine, Table Transfer, KDS Kitchen Waste, Order Idempotency, FSM, Auth RBAC, Reports & Real-time Socket).
- **Frontend Test Suite (Vitest)**: 86/86 test files passed (289/289 tests pass 100% — bao gồm Sổ quỹ Cashbook, Hoa hồng nhân viên Employee Commissions, ViewModels & Screens cho Nhân sự, Lịch làm việc tuần, Chấm công Kiosk/Admin, Bảng lương, Cài đặt chính sách, Đặt bàn, Khách hàng, NCC, Phiếu nhập, Phiếu hủy, Phiếu kiểm kho, Bảng giá, Menu bulk, Notification helper, UI Tokens & Guards).
- **Tổng Unit / Integration Tests**: **1,111/1,111 tests passed 100%** (822 backend + 289 frontend).
- **Monorepo Typecheck (TypeScript)**: `npm run typecheck` $\rightarrow$ 0 lỗi biên dịch trên toàn bộ workspaces (`backend` + `frontend`).
- **Monorepo Lint (ESLint)**: `npm run lint` $\rightarrow$ 0 lỗi trên toàn bộ workspaces.
- **Expo Doctor Check**: `npm run doctor` $\rightarrow$ 18/18 checks đạt tiêu chuẩn Expo SDK 54.
- **Database Migrations**: Đồng bộ nhất quán **33 migrations** trên cả `crispy_bite_dev` và `crispy_bite_test` kèm bảng kiểm toán `_prisma_migrations`.

### 🗂️ Tiến độ theo Giai đoạn (Phase Summary)
| Giai đoạn | Mục tiêu cốt lõi | Trạng thái |
| :--- | :--- | :---: |
| **Phase 0: Khảo sát & Kiến trúc** | Đặc tả 8 quy chuẩn QSR, Schema Prisma quan hệ, WebSocket Gateway | **HOÀN TẤT** (100%) |
| **Phase 1: Nền tảng Monorepo** | Expo SDK 54, Express + Prisma + MySQL dev/test cô lập | **HOÀN TẤT** (100%) |
| **Phase 2: Auth & RBAC (M1-M2)** | Đăng nhập JWT, phân quyền Cashier/Kitchen/Admin, Seed 21+ món, 12 bàn | **HOÀN TẤT** (100%) |
| **Phase 3: POS & KDS Bếp (M3-M5)** | Lưới món, Modifier bắt buộc, Idempotency, FSM Bếp (Pending $\rightarrow$ Ready) | **HOÀN TẤT** (100%) |
| **Phase 4: Sơ đồ Bàn & Void (M6)** | Sơ đồ 12 bàn, Báo hết món 86'd, Hủy đơn kiểm toán (Admin Void) | **HOÀN TẤT** (100%) |
| **Phase 5: Menu, Báo cáo & PDF (M7)** | Quản lý menu Admin, Doanh thu múi giờ VN (UTC+7), SOS, Hóa đơn PDF | **HOÀN TẤT** (100%) |
| **Phase 6: E2E & Nghiệm Thu (M8)** | Playwright E2E Desktop & Mobile layout, xử lý rate-limit 429 | **HOÀN TẤT** (100%) |
| **Phase 7: UI/UX Redesign QSR** | Design tokens, Phông Barlow/Inter, UI Primitives, điều phối Theme vai trò | **HOÀN TẤT** (100%) |
| **Phase 8: Vận hành Thực tế** | QR Token bảo mật, LAN auto-detect, Virtual Buzzer, Menu KiotViet, Auto-Cancel | **HOÀN TẤT** (100%) |
| **Phase 9: Kho & BOM & COGS** | Tồn kho thực tế, Định lượng BOM món, Giá vốn bình quân, Báo cáo lãi gộp, Nhập/Xuất Excel | **HOÀN TẤT** (100%) |
| **Phase 10: Mở Rộng Nghiệp Vụ QSR** | Chuyển bàn thông minh, Báo hủy bếp, Cảnh báo NVL KDS, Voucher & Coupon Engine | **HOÀN TẤT** (100%) |
| **Phase 11: Chuỗi Cung Ứng & Vận Hành** | Quản lý NCC, Phiếu nhập, Kiểm kho, Xuất hủy, Trả hàng nhập, Hóa đơn & Đổi trả bán | **HOÀN TẤT** (100%) |
| **Phase 12: Quản Trị Nhân Sự (HRM)** | Hồ sơ NV, Lịch ca kíp, Chấm công Kiosk/Admin, Tính lương, Cài đặt chính sách, Đặt bàn | **HOÀN TẤT** (100%) |
| **Phase 13: Sổ Quỹ & Hoa Hồng (Cashbook & Commissions)** | Sổ quỹ tiền mặt/ngân hàng, phiếu thu chi, hạch toán liên thông, động cơ hoa hồng NV & bảng lương | **HOÀN TẤT** (100%) |

---

## 📋 2. CÁC TÍNH NĂNG VẬN HÀNH CHÍNH (KEY HIGHLIGHTS)

### 1. Phân hệ Bán hàng POS & Sơ đồ Bàn (Cashier)
- **POS Gọi món**: Lưới thực đơn kèm bộ lọc danh mục, popup chọn Modifier bắt buộc (Size, Vị, Topping).
- **Phân luồng đơn hàng**: Modal xác nhận phân tách rõ Tại bàn (`DINE_IN`) và Mang về (`TAKE_AWAY`).
- **Sơ đồ 12 Bàn ăn**: Hiển thị trực quan trạng thái bàn (`AVAILABLE`, `OCCUPIED`, `DIRTY`). Hỗ trợ bàn có nhiều đơn hàng chưa thanh toán và gộp tổng nợ.
- **Thanh toán & Hóa đơn**: Phân quyền chỉ Thu ngân/Admin, chống double-pay, xuất hóa đơn in nhiệt và tải file PDF.

### 2. Phân hệ Màn hình Bếp KDS (Kitchen)
- **Quản lý vé đơn hàng**: Giao diện Dark OLED chuyên dụng cho nhà bếp, thẻ vé phân loại trực quan theo trạng thái.
- **Vòng đời FSM chuẩn**: Chuyển trạng thái `PENDING` $\rightarrow$ `PREPARING` $\rightarrow$ `READY` $\rightarrow$ `COMPLETED` một chiều, chặn nhảy cóc.
- **Bộ đếm thời gian Prep Timer**: Tự động đổi màu cảnh báo trễ đơn (Xanh $< 3$p, Vàng $3-5$p, Đỏ nhấp nháy $> 5$p).
- **Báo hết món (86'd)**: Bếp bật/tắt hết món tức thì, tự động phát Socket cập nhật đến POS và Khách.

### 3. Phân hệ Khách hàng Gọi món tại bàn (Customer QR Experience)
- **Bảo mật mã QR**: Khách vãng lai gọi món bắt buộc có `qrCodeToken` khớp với bàn vật lý, ngăn chặn đơn ảo từ xa.
- **Cơ chế phục hồi 2 tầng**: Hỗ trợ mở qua QR có token hoặc gõ số bàn `?table=X`, server tự cấp context an toàn qua `GET /api/tables/by-number/:tableNumber`.
- **Theo dõi đa đợt gọi món**: Hiển thị thanh chuyển đổi đợt gọi món (`#ORD-001`, `#ORD-002`), hỗ trợ cuộn ngang mượt mà trên Web PC bằng chuột (`onWheel` + nút mũi tên điều hướng).
- **Quản lý Giỏ hàng (Customer Cart Modal) & Chi tiết Tùy chọn (Modifier)**: Cho phép khách xem chi tiết giỏ hàng, tăng/giảm số lượng (+/-), xóa món, nhập ghi chú cho bếp và đối soát tổng tiền có thuế VAT 8% trước khi bấm gửi bếp. Giao diện khách hàng được chuẩn hóa tinh gọn (chỉ hiển thị chi tiết đợt món và mã VietQR thanh toán, loại bỏ các nút in/xuất hóa đơn vốn thuộc vai trò thu ngân POS).
- **Thẻ rung ảo (Virtual Buzzer)**: Rung điện thoại dồn dập 2.6s kèm chuông báo khi món sẵn sàng (`READY`), hộp thoại xin quyền Web Notification.
- **Thanh toán VietQR**: Tự động sinh mã QR chuyển khoản ngân hàng chứa đúng số tiền tổng bill cả bàn và nội dung giao dịch.

### 4. Phân hệ Quản trị & Báo cáo Doanh thu (Admin)
- **Giao diện Menu phong cách KiotViet**: Sidebar lọc danh mục/trạng thái bên trái, Command search bar, bảng dữ liệu mật độ cao, tự động sinh mã SKU hệ thống (`SP000001`).
- **Báo cáo chuẩn giờ Việt Nam (`Asia/Ho_Chi_Minh` UTC+7)**: Doanh thu thuần chỉ tính đơn `COMPLETED`, tính chỉ số thời gian phục vụ trung bình (SOS), Top 5 món bán chạy nhất.
- **Hủy đơn kiểm toán (Admin Void)**: Chỉ Admin có quyền hủy đơn, bắt buộc nhập lý do void $\ge 3$ ký tự, ghi nhận audit trail (`voidedByUserId`, `voidReason`, `voidedAt`).
- **Tự động hủy đơn quá hạn (Auto-Cancel Scheduler)**: Quét ngầm mỗi 60s, tự động hủy các đơn `PENDING` quá 1 tiếng và giải phóng bàn ăn nếu không còn đơn nợ khác.

### 5. Phân hệ Quản lý Kho & Định Lượng BOM (Admin Inventory & BOM)
- **Quản lý Nguyên vật liệu (NVL)**: Bảng dữ liệu mật độ cao hiển thị đầy đủ SKU (`ING-*`), tên nguyên liệu, đơn vị tính, mức tồn hiện tại, ngưỡng tồn tối thiểu, đơn giá vốn bình quân gia quyền và tổng giá trị kho.
- **Định lượng Món ăn (BOM Recipe)**: Cấu hình nguyên liệu trọng yếu tiêu hao cho từng món ăn. Tính toán tự động tổng giá vốn BOM và tỷ suất lợi nhuận gộp thời gian thực ngay trên giao diện.
- **Trừ kho tự động theo Giao dịch (Transactional Stock Deduction)**: Trừ kho ngay lập tức khi đơn hàng chuyển sang trạng thái `PAID` (trong Prisma Interactive Transaction). Ghi log kiểm toán `ORDER_DEDUCT` kèm mã đơn.
- **Xử lý Tồn âm Thông minh**: Cho phép bán âm khi hết hàng và cảnh báo đỏ; áp dụng thuật toán bù trừ net-positive khi nhập hàng mới để không làm biến dạng công thức bình quân gia quyền.
- **Quy trình Nhập/Xuất Excel chuẩn chỉnh**: Tải file mẫu 6 cột (`Mã NVL | Tên NVL | Đơn vị | Số lượng | Đơn giá | Ghi chú`), hỗ trợ kiểm tra trước (Preview Modal), nhập từng phần (Partial Import) các dòng hợp lệ mà không chặn đứng cả tệp; xuất báo cáo tồn kho kèm cột kiểm kê đối soát thực tế.
- **Bóc tách Lợi nhuận Gộp trên Dashboard**: Tự động tính tổng giá vốn hàng bán (`totalCogs`), lợi nhuận gộp (`grossProfit`), và tỷ suất biên lời (`grossMargin`) bóc tách riêng trong báo cáo tài chính ngày.

### 6. Phân hệ Mở Rộng Nghiệp Vụ Vận Hành Thực Tế (Phase 10 QSR Operations)
- **Chuyển Bàn Ăn Thông Minh (Smart Table Transfer)**: API `POST /api/tables/transfer` hỗ trợ chuyển toàn bộ đơn hàng chưa thanh toán (`UNPAID`) từ bàn nguồn sang bàn đích. Tự động xử lý trạng thái bàn (`AVAILABLE`, `OCCUPIED`), phát Socket real-time đồng bộ sơ đồ bàn cho tất cả Thu ngân và Quản trị, ghi nhật ký AuditLog chi tiết.
- **Báo Hủy Món & Nguyên Liệu Bếp (Kitchen Waste Logging)**: API `POST /api/inventory/kitchen-waste` cho phép Đầu bếp/Thu ngân ghi nhận nguyên liệu hoặc món bị cháy, hỏng, đổ vỡ. Tự động quy đổi định lượng BOM nếu hủy theo món, trừ kho với loại giao dịch `KITCHEN_WASTE`, cập nhật chi phí hủy vào giá vốn hàng bán (`kitchenWasteCost`) trong báo cáo tài chính.
- **Màn hình Bếp KDS Tích hợp**: Ticker cảnh báo nguyên liệu sắp hết tồn kho (`currentStock <= minThreshold`), modal báo hủy nhanh cho bếp thao tác 1 chạm không cần mở trang quản trị kho.
- **Hệ Thống Voucher & Mã Giảm Giá Đa Nền Tảng (Voucher & Coupon Engine)**:
  - **Prisma Schema & Migrations**: Bảng `Voucher` hỗ trợ cả 2 hình thức: Giảm theo % (`PERCENTAGE`) kèm mức giảm tối đa (`maxDiscount`) và Giảm số tiền cố định (`FIXED_AMOUNT`), điều kiện đơn tối thiểu (`minOrderValue`), thời hạn hiệu lực, giới hạn tổng lượt dùng (`usageLimit`).
  - **Chuẩn Hóa Thuế VAT 8% Sau Giảm Giá**: Tuân thủ luật thuế hiện hành, VAT chỉ tính trên doanh thu chịu thuế sau khi đã trừ giảm giá (`taxableAmount = Math.max(0, subtotal - discountAmount)`).
  - **Hoàn Trả Lượt Dùng Khi Void/Hủy Đơn**: Tự động tăng `usedCount` khi tạo đơn và hoàn trả lại số lượt dùng nếu đơn hàng bị Quản trị viên Void hủy bỏ.
  - **Trải Nghiệm Khách Hàng & POS**: Ô nhập mã khuyến mãi trực quan, kiểm tra điều kiện tức thì (báo lỗi rõ ràng nếu chưa đạt đơn tối thiểu hoặc hết hạn), hiển thị dòng giảm giá chi tiết trên Giỏ hàng, Màn hình thu ngân POS, Hóa đơn nhiệt và Bản in PDF.
  - **Giao Diện Quản Trị Voucher (Admin Voucher Management)**: Tab chuyên dụng trong sidebar Admin cho phép Quản lý theo dõi danh sách, số lượt đã dùng/tổng lượt, tạo mới/sửa/xóa mã voucher với modal thiết kế trực quan chuẩn Design System.

---

## 📝 3. NHẬT KÝ MỐC PHÁT TRIỂN CHÍNH (MILESTONE RELEASES)

| Mốc / Ngày | Hạng mục cốt lõi | Kết quả / Đóng góp |
| :--- | :--- | :--- |
| **M1 - M4 (08/29)** | Nền tảng Monorepo, Auth RBAC, POS & Sơ đồ bàn | Hoàn thiện khung Full-Stack, CSDL MySQL cô lập, 29/29 tests pass |
| **M5 - M6 (09/09)** | Real-time KDS Bếp, Vòng đời FSM, Admin Void | Ticket KDS đổi màu, quản lý trạng thái DIRTY, 90/90 tests pass |
| **M7 - M8 (09/09)** | Admin Menu, Báo cáo Doanh thu & Playwright E2E | Quản trị menu, Báo cáo UTC+7, E2E đa nền tảng, 115/115 tests pass |
| **UI/UX QSR (09/13)** | Tích hợp Design Tokens & Dual Theme từ `pKhanh` | Bảng màu Brick/Charcoal, phông Barlow/Inter, UI Primitives, 123 tests |
| **Buzzer & UX (09/14)** | Virtual Buzzer, Theo dõi đa đơn & Polling tự phục hồi | Chuỗi rung 2.6s, nút Gọi thêm món, Deduplication Ref chống spam |
| **Vận hành (09/17)** | Mã SKU tự động, Menu KiotViet, Migration Toolchain | SKU tự sinh, bố cục KiotViet, script `apply-migration.js`, 151 tests |
| **Tối ưu Bàn (09/17)** | Web Horizontal Scroll & Auto-Cancel Timeout 1h | Cuộn chuột `onWheel`, nút mũi tên `<` `>`, hủy đơn quá hạn, 151 tests |
| **Bảo mật QR (09/17)** | Đồng bộ QR Token & Public Table Endpoint | Endpoint `/by-number/:tableNumber`, nâng cấp `qr.html`, 153 tests |
| **Giỏ Khách & UI (09/17)** | Modal Giỏ hàng Khách & Tinh gọn Giao diện Bàn | `CustomerCartModal` chỉnh sửa món/ghi chú, phân định rõ vai trò POS/Khách, 100% tests |
| **Biểu Đồ Doanh Thu (09/17)** | Tích hợp react-native-gifted-charts BarChart | Biểu đồ cột Top 5 món bán chạy, tương tác chọn cột, 100% tests & bundle |
| **Chuẩn Hóa Phân Quyền (09/17)** | Gỡ bỏ Tab Khách QR khỏi Admin/Thu Ngân & Rà soát Nghiệp vụ | Khách truy cập qua QR bàn độc lập không cần login, Nhân viên chỉ thấy đúng nghiệp vụ nội bộ, 100% E2E tests pass |
| **Tập Trung Quản Trị (09/17)** | Tinh Gọn Vai Trò Quản Lý (Admin Focused Governance) | Loại bỏ POS Bán hàng và KDS Bếp khỏi Admin; Admin tập trung 100% vào Quản trị & Giám sát bàn; 100% E2E tests pass |
| **Phẳng Hóa Điều Hướng (09/17)** | Tách nhỏ Trung tâm quản trị ra Khu vực làm việc | Đưa Báo cáo, Thực đơn, Bàn thành các tab trực tiếp trên sidebar (xóa bỏ lồng 2 tầng tab); 100% E2E tests pass |
| **Upload Ảnh Món Ăn (09/17)** | Cho phép Admin tải ảnh từ máy tính lên server | Button "Tải ảnh từ máy tính" + FileReader base64 → POST /api/menu/upload-image (ADMIN only) → lưu vào `uploads/` → URL tương đối `/uploads/menu_*.jpg`; `resolveImageUrl()` fix thumbnail trên Metro; 17/17 tests pass; typecheck 0 lỗi |
| **Audit Log Hệ Thống (09/17)** | Thêm Nhật ký kiểm toán thao tác quản trị (AuditLog) | Bảng `AuditLog` + Prisma migration; API `GET /api/audit` phân quyền ADMIN only; tự động ghi nhận 5 hành động (`MENU_ITEM_CREATED`, `MENU_ITEM_UPDATED`, `MENU_ITEM_AVAILABILITY_CHANGED`, `MENU_IMAGE_UPLOADED`, `ORDER_VOIDED`); màn hình `AuditLogScreen` timeline UI, phân loại icon/tone, bộ lọc, load-more; tab "Nhật ký" trong sidebar Admin; 18/18 test files (133/133 tests) pass 100%; typecheck 0 lỗi |
| **Tối Ưu Trải Nghiệm Admin (09/17)** | Tối ưu trải nghiệm quản lý | Thẻ xem trước thực tế (Live Preview Card) ngay trong modal tạo/sửa món; Mẫu tùy chọn 1 chạm (Presets: Kích cỡ, Độ cay, Topping); Toast thông báo tức thì khi mở bán/hết hàng/lưu món; 100% typecheck pass, 33/33 tests frontend pass |
| **Nâng Cấp UI Báo Cáo (09/17)** | Tối ưu trải nghiệm quản lý: Tái cấu trúc Dashboard & Modal chọn ngày | 4 Thẻ KPI chuẩn hóa đồng đều, Bố cục 2 cột cân bằng (Cột trái: Tỷ lệ kết quả đơn + Đối soát hóa đơn; Cột phải: Top 5 món bán chạy + BarChart + Spotlight card); Modal chọn ngày trực quan (`DatePickerModal`: Chọn nhanh Hôm nay, Hôm qua, 3 ngày, 7 ngày, Đầu tháng + Lưới lịch tháng); 100% typecheck pass, 33/33 tests pass |
| **Đối Soát Chốt Két (09/17)** | Phân bổ Doanh thu theo Tiền mặt vs Chuyển khoản QR | TDD backend tính toán `paymentBreakdown` (CASH, BANK_TRANSFER, OTHER); cập nhật `DailyReportDto`; Card trực quan "Phân bổ thanh toán & Chốt két" trên Dashboard (Thanh tỷ trọng, số tiền, số đơn, % doanh thu phục vụ kiểm két); 18/18 test files backend (133 tests) pass 100%, 7/7 test files frontend (33 tests) pass 100%, typecheck 0 lỗi |
| **Đóng Băng Nghiệp Vụ Kho (09/17)** | Hoàn tất Discovery & Chốt Kiến trúc Quản lý Kho, Định lượng (BOM), Giá vốn (COGS) & Excel | Hoàn thành `INVENTORY_DISCOVERY.md`; chốt 5 quyết định nghiệp vụ (Bình quân gia quyền, trừ kho khi PAID, cho phép bán âm kèm thuật toán bù trừ net positive không méo mó giá vốn, BOM nguyên liệu trọng yếu ≥2% hoặc ≥20k, cuốn chiếu Phase 1 cho Món chính); chốt quy trình Nhập hàng Excel (Template cố định, Parse/Validate dòng, Preview modal, Non-blocking partial import) & Xuất Excel tồn kho |
| **Kho & BOM Toàn Diện (09/17)** | Hoàn thành trọn vẹn Phân hệ Quản lý Kho, BOM, Giá vốn COGS & Excel | Schema 3 bảng mới (`Ingredient`, `MenuItemIngredient`, `InventoryTransaction`), migration áp dụng dev/test; Backend Service & Controller 11 API endpoints; Tích hợp trừ kho tự động khi PAID; Báo cáo Dashboard tích hợp COGS & Gross Profit; Giao diện 2 tab Kho & BOM đẹp mắt chuẩn QSR, 3 modal (Tạo NVL, Nhập nhanh, Preview Excel); 22 test files backend (157 tests), 7 test files frontend (33 tests) pass 100%; `npm run check` PASS 100% |
| **Mở Rộng Nghiệp Vụ QSR (09/20)** | Mở Rộng Nghiệp Vụ Vận Hành Thực Tế QSR: Chuyển Bàn, Báo Hủy Bếp, Cảnh Báo NVL KDS & Voucher Giảm Giá | Đặc tả thiết kế `mo-rong-nghiep-vu-qsr-design.md`; API Chuyển bàn (`/api/tables/transfer`) + FSM lock + Socket; API Báo hủy bếp (`/api/inventory/kitchen-waste`) + Ticker/Modal KDS; Voucher Engine (`/api/vouchers`) + Schema `Voucher` + Recalculate VAT 8% sau giảm giá + Giỏ hàng Khách + POS Thu ngân + Hóa đơn nhiệt & PDF + Màn hình Quản trị Voucher Admin; 25 test files backend (191 tests), 9 test files frontend (39 tests) pass 100%; typecheck 0 lỗi, lint 0 lỗi, expo-doctor 18/18 checks pass |

---

---


## 🧠 4. QUY TẮC KIẾN TRÚC & BÀI HỌC KINH NGHIỆM CỐT LÕI

### 🔒 Nhóm 1: Bảo Mật, Phân Quyền & Xác Thực (Security & RBAC)
1. **Bảo mật mã QR bàn ăn (Table QR Token Authorization)**: Khách vãng lai (`DINE_IN`) bắt buộc phải có `qrCodeToken` khớp với CSDL để chống đơn ảo từ xa. Cung cấp route công khai có giới hạn `/api/tables/by-number/:tableNumber` để hỗ trợ link cũ và phòng ngừa sự cố.
2. **Tách biệt tuyệt đối giữa Khách hàng, Vận hành và Quản trị (Strict Separation of Duties)**: Thực khách tại bàn tự phục vụ qua QR (`TableOrderScreen`). Nhân sự vận hành gồm: Thu ngân (`CASHIER`) phụ trách Bán hàng POS & Sơ đồ bàn; Đầu bếp (`KITCHEN`) phụ trách Màn hình vé KDS. Quản lý (`ADMIN`) tập trung 100% vào điều hành: Trung tâm quản trị (Thực đơn, Báo cáo doanh thu & KPI) và Giám sát bàn ăn (Duyệt Hủy đơn kiểm toán Void Order). Tuyệt đối không để Quản lý vừa tạo đơn bán hàng vừa duyệt hủy đơn nhằm triệt tiêu rủi ro gian lận nội bộ.
3. **Nguyên tắc Security by Default**: Mọi thao tác tài chính, đổi menu, hoặc tra cứu danh sách bàn mặc định yêu cầu `authenticate` và `authorize`. Phân định rõ: `CASHIER`/`ADMIN` xem bàn; `KITCHEN`/`ADMIN` xem KDS; chỉ `ADMIN` được hủy đơn (Void) và chỉnh sửa menu.
4. **Reset Rate-Limit khi đăng nhập đúng**: Bộ đếm brute-force theo IP chỉ khóa khi nhập sai mật khẩu liên tiếp. Khi đăng nhập thành công, lập tức xóa cache IP để không gây lỗi `429 RATE_LIMITED` giả cho người dùng hợp lệ.
5. **Role-Aware Fetch Guards ở Context**: Không bao giờ gọi API không có thẩm quyền trong `useEffect` toàn cục. Bếp (`KITCHEN`) không gọi `/api/tables`, Thu ngân (`CASHIER`) không gọi KDS endpoints.

### 💾 Nhóm 2: CSDL, Giao Dịch & Nhất Quán Dữ Liệu (Database Integrity)
5. **Ràng buộc duy nhất với giá trị NULL trong MySQL**: Chuẩn SQL quy định `NULL != NULL`. Với mã giao dịch duy nhất (như `idempotencyKey`), phải đặt `@unique` trực tiếp lên cột, không dựa vào composite key có chứa trường nullable.
6. **Tuyệt đối không tin giá tiền từ Client**: Payload tạo đơn chỉ gửi ID tham chiếu `{ modifierGroupId, optionId }`. Backend bắt buộc query DB để lấy giá gốc, phụ phí `priceDelta`, kiểm tra món còn bán (`isAvailable`) và min/max selection.
7. **Khóa dòng CSDL & Nhất quán đa đơn trên cùng bàn**: Dùng `SELECT ... FOR UPDATE` khi tạo đơn hoặc thanh toán. Bàn ăn chỉ chuyển về `AVAILABLE` khi không còn bất kỳ đơn `UNPAID` nào khác.
8. **Chuẩn hóa Idempotency đa tầng**: Băm payload thành `requestHash` kết hợp với `idempotencyScope` (`guest` hoặc `staff:{id}`). Cùng hash $\rightarrow$ trả về kết quả cũ (retry an toàn); khác hash $\rightarrow$ chặn lỗi `409 CONFLICT`.
9. **Bắt buộc Audit Trail khi Hủy đơn (Admin Void)**: Phải lưu `voidReason` ($\ge 3$ ký tự), `voidedByUserId`, `voidedAt` và chuyển `paymentStatus: VOIDED`. Không cho phép void đơn đã `COMPLETED`.

### ⚡ Nhóm 3: Real-Time, Trải Nghiệm Khách Hàng & Giao Diện (Real-Time & UI/UX)
10. **Đồng bộ Socket.io LAN tuyệt đối**: URL Socket client phải luôn đồng bộ theo kết quả `getApiBaseUrl()` (host và port 4000) để không bị kẹt IP cũ khi đổi Wi-Fi. Payload sự kiện bàn bắt buộc gửi kèm `tableId` và `tableNumber`.
11. **Chống bão thông báo bằng Ref Deduplication**: Dùng `lastNotifiedStatusKeyRef` lưu `${orderId}_${status}` để đảm bảo mỗi lần đổi trạng thái chỉ rung/chuông/toast đúng 1 lần duy nhất, tránh vòng lặp kích hoạt lại từ `fetchTables` polling.
12. **Cuộn ngang danh sách đơn trên Web**: `ScrollView` ngang lồng trong dọc trên React Native Web không tự nhận diện lăn chuột. Bắt buộc can thiệp `onWheel` chuyển đổi `deltaY` sang `scrollLeft`, đồng thời gắn `flexShrink: 0` và cung cấp nút mũi tên `<` `>` điều hướng trực quan.
13. **Báo cáo chuẩn giờ địa phương (`Asia/Ho_Chi_Minh` UTC+7)**: Khóa offset `+07:00` tường minh khi query CSDL để ranh giới ngày không bị lệch múi giờ so với UTC. Doanh thu thuần chỉ tính từ đơn `COMPLETED`.
14. **Snapshot hóa đơn bất biến (Immutable Receipts)**: Hóa đơn thanh toán phải lưu và đọc giá trị snapshot tại thời điểm mua (`unitPrice`, `priceDelta`, `taxAmount`, `finalAmount`), không query lại bảng món ăn tránh sai lệch khi đổi giá tương lai.

### ⚙️ Nhóm 4: Tự Động Hóa Vận Hành & Khắc Phục Lỗi (Automation & Reliability)
15. **Tự động hủy đơn quá giờ an toàn (Auto-Cancel Scheduler)**: Chỉ quét các đơn thỏa mãn đồng thời: `status === 'PENDING'`, `paymentStatus !== 'PAID'` và `createdAt <= now - 60 phút`. Giữ nguyên các đơn đang nấu (`PREPARING`) hoặc đã xong (`READY`). Sử dụng `timer.unref()` để không rò rỉ Event Loop khi test.
16. **Độc lập hóa kiểm thử (Test Isolation)**: Mọi integration test phải gọi `truncateAllTables()` trong `beforeAll` trước khi seed lại DB. Tách biệt hoàn toàn giữa database dev và test.

### 🖼️ Nhóm 5: Lưu Trữ Tệp & Đường Dẫn Ảnh (File Storage & Image URLs)
17. **Không lưu base64 vào cột VARCHAR của MySQL**: Chuỗi base64 ảnh PNG/JPEG ≥ 10KB sẽ vượt giới hạn `VARCHAR(191)` và gây crash `Data too long for column`. Quy trình đúng: Backend nhận base64, giải mã, ghi ra file `.jpg/.png` trong `uploads/`, trả về URL tương đối `/uploads/menu_*.jpg` (≤ 35 ký tự).
18. **`resolveImageUrl()` bắt buộc cho mọi `<Image source={{ uri }}>` khi dùng `/uploads/`**: Trong dev, Metro chạy port 8081 khác backend port 4000. Ảnh tương đối `/uploads/...` sẽ 404 nếu không prefix `getApiBaseUrl()`. Hàm `resolveImageUrl()` xử lý toàn bộ: prefix URL tương đối, giữ nguyên `http://`, `https://`, `data:`. Áp dụng cho: `MenuItemCard`, `MenuManagementScreen` (thumbnail bảng, mobile card, form preview).
19. **Dùng `document.createElement('input')` thay vì JSX `<input>` cho file picker trên Web**: React Native không có `<input type="file">` native. Tạo element DOM trực tiếp qua `document.createElement('input')`, trigger `.click()`, đọc kết quả qua `FileReader`. Bảo vệ bằng `if (Platform.OS !== 'web') return;` để không crash trên mobile.

### 📜 Nhóm 6: Nhật Ký Kiểm Toán & Khả Năng Quan Sát (Audit Logging & Observability)
20. **Ghi nhận Audit Log không chặn luồng chính (Non-blocking Audit Logging)**: Bọc hàm ghi log trong try/catch an toàn để sự cố phát sinh từ ghi log không làm gián đoạn giao dịch nghiệp vụ cốt lõi (tạo món, cập nhật giá, hủy đơn).
21. **Snapshot tên người thao tác (Actor Snapshot)**: CSDL lưu cả `actorId` và `actorName` tại thời điểm thực hiện thao tác để đảm bảo khi tài khoản nhân viên bị vô hiệu hóa hoặc xóa thì lịch sử kiểm toán vẫn bảo lưu chính xác danh tính người thực hiện.
22. **Đầy đủ bộ lọc và dọn dẹp Test Isolation cho bảng Log**: Khi bổ sung bảng kiểm toán mới, bắt buộc bổ sung vào danh sách bảng cần TRUNCATE trong test helper (`truncateAllTables()`) để tránh rò rỉ dữ liệu log qua các test suite khác.

### 📦 Nhóm 7: Quản Lý Kho, BOM & Giá Vốn (Inventory, BOM & COGS Management)
23. **Xử lý Tồn âm trong Bình quân gia quyền (Weighted Average with Negative Stock)**: Khi kho hàng rơi vào trạng thái tồn âm (do nhà hàng linh hoạt cho phép bán âm để phục vụ khách kịp giờ cao điểm), tuyệt đối KHÔNG đưa số lượng âm vào công thức nhân bình quân gia quyền vì sẽ làm biến dạng và méo mó giá vốn. Thuật toán chuẩn: Lô hàng mới nhập sẽ dùng để bù đắp phần âm trước; chỉ phần dư thực dương còn lại mới lấy theo đơn giá của lô hàng mới nhập.
24. **Trừ kho đồng bộ trong Giao dịch thanh toán (Transactional Stock Deduction)**: Trừ kho nguyên liệu theo BOM được kích hoạt tự động ngay khi đơn hàng chuyển sang trạng thái `PAID`. Thao tác này bắt buộc đặt trong cùng một Interactive Transaction (`prisma.$transaction`) với lệnh thanh toán, sử dụng `increment: -qty` để tránh race condition khi nhiều thu ngân thanh toán đồng thời. Đồng thời ghi log giao dịch kho loại `ORDER_DEDUCT` kèm theo `orderId` đối soát.
25. **Quy trình Nhập Excel An Toàn (Non-blocking Partial Import & Preview Modal)**: Người dùng bắt buộc được xem trước bản phân tích dữ liệu (Preview Modal) hiển thị chi tiết số dòng hợp lệ, số dòng lỗi và số lượng NVL mới sẽ tạo. Áp dụng cơ chế nhập từng phần (Partial Import) để các dòng hợp lệ vẫn được nhập kho thành công mà không bị chặn đứng bởi 1 dòng lỗi chính tả, mang lại trải nghiệm mượt mà và thực tế.
26. **Giải phóng File Lock trên Windows khi Prisma Generate**: Khi dev server backend (`ts-node-dev`) đang chạy, tiến trình Node giữ file lock trên `query_engine-windows.dll.node`. Phải tạm dừng dev server trước khi thực thi `prisma generate` hoặc migrate schema để tránh lỗi `EPERM / EBUSY`.
27. **Tải tệp đính kèm & Xác thực Trình duyệt (File Downloads & Dual Authentication Strategy)**:
    - *Nguyên nhân gốc rễ (RCA)*: Trình duyệt mở liên kết trực tiếp (qua `window.open`, thẻ `<a>`, hoặc thanh URL) không đính kèm header `Authorization: Bearer <token>` từ bộ nhớ ứng dụng.
    - *Khóa lỗi bằng Regression Test*: Đã bổ sung 2 regression test cases trong `test/inventory/inventory.api.spec.ts` kiểm chứng: (1) Route template tải về `200 OK` không cần token; (2) Route export tải về `200 OK` khi truyền `?token=...` qua query param và chặn `401` khi thiếu token.
    - *Quét phòng ngừa toàn diện (Horizontal Scan)*: Rà soát toàn bộ dự án, xác nhận `/uploads` đã cấu hình static public đúng chuẩn; `/excel/template` chuyển public; `/excel/export` bảo vệ chặt chẽ bằng Dual-Channel Authentication (Header + Query).
28. **Đồng bộ Dữ liệu Danh mục Thực đơn với Định lượng BOM (BOM Recipe Synchronization & Atomic Decrement)**:
    - *Nguyên nhân gốc rễ (RCA)*: Trong tệp seed hoặc cấu hình BOM ban đầu, nếu định nghĩa công thức dựa theo chuỗi tên món (`menuItemByName.get(name)`) mà không có cảnh báo nghiêm ngặt khi không tìm thấy món, các sai khác nhỏ (viết hoa/thường 'miếng' vs 'Miếng', hoặc thiếu chữ 'Nướng') sẽ làm CSDL bỏ qua âm thầm việc gắn BOM. Khi khách gọi nhiều món cùng dùng 1 nguyên liệu (ví dụ Combo gà + Gà miếng cùng dùng gà và dầu), việc trừ kho nếu lấy `ing.currentStock - qty` theo biến bộ nhớ sẽ bị ghi đè giá trị cũ (stale read overwrite).
    - *Giải pháp triệt để*:
      1. Rà soát và chuẩn hóa 100% định nghĩa BOM khớp chính xác 20/20 món ăn có nguyên liệu tiêu hao trong thực đơn, bổ sung cảnh báo `console.warn` nếu phát hiện bất kỳ tên món nào không khớp.
      2. Trước khi seed lại BOM, thực hiện dọn dẹp sạch `menuItemIngredient.deleteMany()` để không bị tồn lưu dữ liệu rác từ các lần chạy thử nghiệm trước.
      3. Nâng cấp hàm `deductInventoryForOrder` sang toán tử nguyên tử của CSDL: `data: { currentStock: { decrement: qtyNeeded } }` để triệt tiêu hoàn toàn nguy cơ race condition và ghi đè giá trị cũ khi nhiều món cùng trừ 1 nguyên liệu trong 1 giao dịch.
    - *Khóa lỗi bằng Regression Test*: Đã bổ sung 2 test cases trong `seed.spec.ts` và `inventory.api.spec.ts`: (1) Kiểm chứng 20/20 món ăn có BOM đầy đủ; (2) Kiểm chứng đơn hàng nhiều món dùng chung nguyên liệu được trừ kho nguyên tử chính xác tuyệt đối.

29. **Hiển thị Nhật ký Hệ thống thân thiện cho người dùng Non-Code (Human-Friendly Audit Log UI & Metadata Enrichment)**:
    - *Nguyên nhân gốc rễ (RCA)*: Các action quản trị kho và định lượng mới (`MENU_RECIPE_UPDATED`, `INGREDIENT_CREATED`, `INGREDIENT_UPDATED`, `INVENTORY_STOCK_IN`, `INVENTORY_EXCEL_IMPORT`) chưa được định nghĩa nhãn và view trong `AuditLogScreen.tsx`, khiến hệ thống rơi vào case fallback `JSON.stringify(meta)` in chuỗi JSON thô như `{"ingredientsCount":1}` và mã code kỹ thuật gây khó hiểu cho người dùng vận hành nhà hàng.
    - *Giải pháp triệt để*:
      1. **Làm giàu Metadata từ Backend**: Bổ sung `menuItemName`, `ingredientName`, `unit`, và các trường biến động chi tiết vào `AuditService.log` trong `inventory.service.ts`.
      2. **Thiết kế UI chuyên biệt**: Ánh xạ toàn bộ action sang nhãn tiếng Việt dễ hiểu ("Định lượng món (BOM)", "Nhập kho nguyên liệu", "Tạo mới nguyên liệu", "Nhập kho từ Excel"), kết hợp icon ngữ cảnh (`Layers`, `Package`, `ArrowDownToLine`, `FileSpreadsheet`).
      3. **Card chi tiết thân thiện**: Hiển thị tên món ăn rõ ràng, số lượng NVL cấu thành kèm badge màu, biến động tồn kho cũ $\rightarrow$ mới, đơn giá nhập, giá vốn bình quân; xóa bỏ 100% việc hiển thị JSON thô.
      4. **Bộ nhớ tra cứu tự động**: Sử dụng `useRestaurant()` và tải danh mục nguyên liệu để tự động bù tên món ăn/tên NVL cho cả các bản ghi log cũ đã lưu trong DB.
      5. **Bổ sung bộ lọc "Kho & Định lượng"**: Hỗ trợ param `category=INVENTORY` trên cả API và giao diện để chủ nhà hàng dễ dàng tách biệt nhật ký kho/BOM với thực đơn hay hủy đơn.
    - *Khóa lỗi bằng Regression Test*: Đã bổ sung 2 test cases trong `backend/test/audit/audit.spec.ts` kiểm chứng chính xác việc lọc theo `category=INVENTORY` và `category=MENU`. 163/163 tests backend và 33/33 tests frontend pass 100%.

30. **Tách biệt Trạng thái Khôi phục Phiên với Đăng nhập & Đảm bảo `await` khi ghi Audit Log (Session Restore Separation & Async Audit Await)**:
    - *Nguyên nhân gốc rễ (RCA)*:
      1. Trong `AuthContext.tsx`, `isLoading` được dùng chung cho cả việc khôi phục phiên (`restoreSession`) và quá trình gọi API đăng nhập (`login`). Trong `RootNavigator.tsx`, điều kiện `if (isLoading && !user)` render spinner toàn màn hình, vô tình làm unmount `LoginScreen` khi người dùng bấm Đăng nhập. Khi API trả về lỗi 401, `isLoading` chuyển về false và `LoginScreen` mount lại từ đầu, làm biến mất toàn bộ input `username` người dùng đã nhập.
      2. Trong `InventoryService` (`inventory.service.ts`), 5 lời gọi `AuditService.log` bị thiếu từ khóa `await`. Dù `AuditService.log` có try-catch an toàn, việc không `await` khiến tác vụ ghi CSDL chạy bất đồng bộ trong background. Khi test hoặc client gửi ngay request tiếp theo để query audit log, bản ghi chưa kịp hoàn tất vào database gây lỗi sai lệch kết quả (race condition).
    - *Giải pháp triệt để*:
      1. **Frontend**: Tách riêng trạng thái `isRestoringSession` (chỉ dùng khi khởi động ứng dụng khôi phục token từ AsyncStorage) và `isLoading` (dùng cho nút bấm Đăng nhập). `RootNavigator` chỉ hiển thị spinner splash khi `isRestoringSession && !user`, giúp `LoginScreen` luôn giữ nguyên vẹn trên màn hình và không làm mất state input khi đăng nhập thất bại.
      2. **Backend**: Thêm `await` trước toàn bộ các lệnh `AuditService.log({...})` trong `inventory.service.ts` để đảm bảo bản ghi audit log được commit an toàn trước khi trả lời phản hồi cho client.
      3. **Swagger UI & OpenAPI 3.0**: Tích hợp hoàn chỉnh `swagger-ui-express` và định nghĩa tài liệu API trực quan tại `/api-docs`.
      4. **Web Warnings Guard**: Loại bỏ các style prop deprecated trên React Native Web (`shadow*` sang `boxShadow`, `pointerEvents` prop sang style, và bảo vệ `accessibilityLabel` trên `AppIcon`).
    - *Khóa lỗi bằng Regression Test*:
      1. `frontend/src/features/auth/loginInvalidCredentials.test.tsx`: Kiểm chứng `input-username` giữ nguyên giá trị sau phản hồi 401.
      2. `frontend/src/webWarningGuards.test.ts`: 5 tests kiểm chứng không vi phạm deprecation cảnh báo web.
      3. `backend/test/audit/audit.spec.ts`: Kiểm chứng ghi và đọc audit log ngay lập tức sau thao tác kho không còn bị race condition.
31. **Đồng bộ hóa Nhánh Phân tán & Gỡ Xung đột Toàn vẹn (Distributed Branch Synchronization & Conflict Resolution Gate)**:
    - *Bối cảnh & Thách thức*: Nhánh `origin/pKhanh` tách rẽ từ mốc cũ (`6283b7a`) và phát triển song song trong khi `main` đã hoàn thành Phân hệ M-3 (Kho & BOM), Nhật ký hệ thống AuditLog, Upload ảnh món, DatePicker báo cáo và Swagger API. `pKhanh` bổ sung bộ sưu tập Postman (`postman/`), tối ưu regex nhận diện QR bàn, mở rộng metadata món ăn (`menuType`, `itemType`, `trackStock`, `stockQuantity`, `position`) và phân quyền KITCHEN xem bàn ăn.
    - *Giải pháp triệt để*:
      1. Tạo nhánh tích hợp an toàn `sync/pkhanh-to-main` để gộp và giải quyết xung đột mà không gây rủi ro cho nhánh `main`.
      2. Hợp nhất `backend/src/app.ts`, `backend/src/config/swagger.ts`, `backend/src/server.ts`, giữ nguyên 100% routes và Swagger docs của Kho, BOM và AuditLog.
      3. Kết hợp đầy đủ các trường Metadata món ăn mới của `pKhanh` vào `menu.schemas.ts`, `menu.service.ts` và đồng thời bảo tồn trọn vẹn việc ghi nhật ký `AuditService.log` của `main`.
      4. Chuẩn hóa `frontend/package.json` giữ vững phiên bản tương thích Expo SDK 54 (`expo: ~54.0.37`), sửa khớp tài khoản seed demo trong `AuthContext.tsx`.
    - *Kết quả nghiệm thu*:
      - Backend: 22 test files, 166/166 tests PASS (100%), typecheck 0 lỗi, lint 0 lỗi.
      - Frontend: 9 test files, 39/39 tests PASS (100%), typecheck 0 lỗi, lint 0 lỗi.
      - Đã Fast-forward cập nhật hoàn tất vào `main`.

32. **Xử lý Múi Giờ UTC vs Múi Giờ Nghiệp Vụ Địa Phương trong Truy Vấn Báo Cáo (Timezone Boundary Alignment in Reporting Queries)**:
    - *Nguyên nhân gốc rễ (RCA)*: Trong `kitchen-waste.spec.ts`, lệnh `new Date().toISOString().split('T')[0]` lấy ngày theo giờ UTC. Khi chạy test trong khung giờ rạng sáng tại Việt Nam (00:00 - 07:00 ICT = UTC+7), ngày UTC vẫn là ngày hôm trước (`2026-09-19`), trong khi giao dịch hủy kho phát sinh theo thời điểm hiện tại (`2026-09-20` ICT). Khi API `/api/reports/daily?date=2026-09-19` truy vấn theo khoảng `[2026-09-19T00:00:00+07:00, 2026-09-19T23:59:59+07:00]`, nó bỏ qua các bản ghi phát sinh vào sáng `2026-09-20` ICT, dẫn đến `kitchenWasteCost = 0`.
    - *Khóa lỗi bằng Regression Test*: Chuẩn hóa việc sinh chuỗi ngày theo đúng múi giờ nghiệp vụ Việt Nam: `new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())` trong test case báo cáo của `kitchen-waste.spec.ts`. 6/6 tests của `kitchen-waste.spec.ts` và toàn bộ 25/25 test files backend (191/191 tests) PASS 100%.
    - *Quét phòng ngừa toàn diện (Horizontal Scan)*: Rà soát toàn bộ các bộ test báo cáo và dịch vụ báo cáo (`reports.service.ts`, `reports.spec.ts`), đảm bảo `ReportsService.getDailyReport` mặc định sử dụng `Asia/Ho_Chi_Minh` khi không truyền tham số, và các test queries đều nhất quán múi giờ Việt Nam.

33. **Tính Toán Thuế GTGT (VAT) Hợp Pháp Khi Áp Dụng Khuyến Mãi/Voucher (VAT Calculation on Discounted Taxable Base)**:
    - *Nguyên nhân gốc rễ & Quy định Pháp lý*: Theo quy định thuế GTGT hiện hành (Thông tư 219/2013/TT-BTC & Nghị định giảm thuế VAT 8%), thuế GTGT được tính trên giá bán thực tế sau khi đã trừ các khoản giảm giá, chiết khấu thương mại hợp lệ (`taxableAmount = Math.max(0, subtotal - discountAmount)`). Nếu tính VAT trên tổng phụ trước chiết khấu (`subtotal * 0.08`), khách hàng sẽ phải chịu thuế trên khoản tiền họ không thanh toán, gây sai lệch sổ sách kế toán.
    - *Giải pháp triệt để*: Tại `orders.service.ts`, `subtotal` được tính từ tổng món ăn; sau đó áp dụng voucher để ra `discountAmount`; tiền chịu thuế `taxableAmount = Math.max(0, subtotal - discountAmount)`; tiền thuế `tax = Math.round(taxableAmount * 0.08)`; và tổng thanh toán `total = taxableAmount + tax`. Công thức này được đồng bộ 100% trên cả Backend, Frontend Customer Cart, POS Screen và Snapshot Hóa đơn PDF.

34. **Hợp nhất Toàn diện Nhánh `pKhanh` (53 commits) vào `main` — Hệ sinh thái Vận hành & Chuỗi cung ứng QSR Hoàn chỉnh**:
    - *Bối cảnh*: Nhánh `pKhanh` phát triển 53 commit với khối lượng nghiệp vụ chuỗi cung ứng rất lớn (Nhà cung cấp, Phiếu nhập kho, Phiếu kiểm kê kho, Phiếu xuất hủy kho có snapshot giá vốn, Quản lý Bảng giá chung PriceList, Bulk Actions và Import/Export Excel thực đơn). Trong khi đó, nhánh `main` sở hữu Hệ thống Voucher đa kênh, Chuyển bàn realtime và Báo hao hụt bếp KDS.
    - *Giải pháp hợp nhất & Gỡ xung đột*:
      1. Khởi tạo nhánh tích hợp thử nghiệm `feat/integrate-pkhanh-full`, thực hiện `git merge pKhanh` và xử lý triệt để 9 tệp xung đột nội dung.
      2. Mở rộng Prisma Schema đồng bộ 12 migration tuần tự (thêm các model `Supplier`, `SupplierGroup`, `PurchaseReceipt`, `InventoryCheck`, `InventoryWaste`, `PriceList`, `PriceListItem` song song với `Voucher`).
      3. Hợp nhất `RoleTabs.tsx` hiển thị đầy đủ cả tab **Bảng giá** lẫn tab **Ưu đãi** cho vai trò Quản trị (Admin).
      4. Ghép nối `orders.service.ts`: đơn hàng vừa phân giải giá hiệu lực theo PriceList vừa áp dụng mã giảm giá Voucher và tính thuế VAT 8% chính xác.
    - *Kết quả nghiệm thu*:
      - Backend: 52 test files, 360/360 tests PASS (100%), typecheck 0 lỗi.
      - Frontend: 31 test files, 98/98 tests PASS (100%), typecheck 0 lỗi.
      - Tổng cộng: 458/458 tests PASS 100%. Fast-forward merge vào `main`.

35. **Bài học Kinh nghiệm & Quy tắc Phòng ngừa Lỗi (Post-Fix Retrospective & Prevention)**:
    - *RCA 1: Lỗi Unit Test Mock Transaction thiếu Sub-client (`priceList` is undefined)*:
      - *Hiện tượng*: Một số unit test mock `$transaction` cũ chỉ cung cấp `{ order, diningTable }`, khiến lời gọi `PriceListService.getGeneralPriceList(tx)` và `resolveEffectivePrices(tx)` bị `TypeError: Cannot read properties of undefined (reading 'findFirst')`.
      - *Giải pháp*: Bổ sung kiểm tra an toàn `if (!client?.priceList) return null;` và fallback tự động về `item.basePrice` khi client không hỗ trợ `priceList`. Điều này giúp code vừa tương thích với môi trường chạy thật có DB, vừa tương thích với các unit test mock tối giản.
    - *RCA 2: Lỗi Gán lại Biến `const` khi Tính Toán Lại Tiền trong Transaction*:
      - *Hiện tượng*: `vatAmount` và `finalAmount` khai báo `const` ở scope ngoài, sau khi resolve lại giá theo Price List trong transaction thì bị gán lại gây lỗi TS2588.
      - *Giải pháp*: Chuyển thành `let` và chuẩn hóa công thức: tính lại `totalAmount` $\rightarrow$ trừ `voucherDiscount` $\rightarrow$ tính `vatAmount = Math.round(effectiveTaxable * 0.08)` $\rightarrow$ `finalAmount = effectiveTaxable + vatAmount`.
    - *RCA 3: Lệch Mật khẩu Demo giữa `AuthContext` và Cấu hình Seed*:
      - *Hiện tượng*: Commit cũ trên `pKhanh` đổi demo password thành `change-me-*`, làm fail test `webWarningGuards.test.ts`.
      - *Giải pháp*: Đồng bộ tuyệt đối với `SEED_CASHIER_PASSWORD`, `SEED_KITCHEN_PASSWORD`, `SEED_ADMIN_PASSWORD` trong `.env`.
    - *RCA 4: Xung đột Foreign Key khi Chạy Test Database Song song*:
      - *Hiện tượng*: Khi chạy `vitest` không có cờ `--fileParallelism=false`, nhiều test file cùng gọi `seedDatabase()` và `cleanDatabase()` đồng thời vào database test, dẫn đến lỗi Foreign key constraint violated.
      - *Giải pháp*: Luôn tuân thủ chạy với `--fileParallelism=false` cho test database integration.

36. **Hợp nhất Nhánh `pKhanh` Đợt 2 (7 commits: Trả hàng nhập, Hóa đơn bán hàng, Trả hàng bán, Quản lý phòng bàn & Đặc tả Sổ quỹ)**:
    - *Bối cảnh & Nghiệp vụ tiếp nhận*: Nhánh `origin/pKhanh` phát triển thêm 7 commit mới với các tính năng:
      1. **Trả hàng nhập (Purchase Returns)**: Phiếu trả hàng nhập nhà cung cấp, kiểm tra tồn kho, hoàn tiền, import/export Excel.
      2. **Quản lý hóa đơn (Order Invoices)**: Danh sách hóa đơn, chi tiết, xuất PDF/Excel hóa đơn bán hàng.
      3. **Trả hàng bán (Sales Returns)**: Đổi trả hàng cho khách sau khi thanh toán, hoàn trả tồn kho nguyên liệu tự động.
      4. **Quản lý phòng bàn & Khu vực (Table Management)**: CRUD danh mục phòng bàn, chia khu vực (Area), Import/Export Excel và in/xuất QR code bàn hàng loạt.
      5. **Đặc tả kiến trúc & Kế hoạch Sổ quỹ (Cashbook Design & Plan)**: Tài liệu kiến trúc phân hệ Thu/Chi tiền mặt/ngân hàng.
    - *Giải quyết Xung đột & Tích hợp An toàn*:
      1. Khởi tạo nhánh trung gian an toàn `integrate/pkhanh-batch2`.
      2. Xử lý triệt để xung đột nội dung trên 5 tệp: `backend/prisma/schema.prisma` (kết hợp `DiscountType` voucher và `OrderReturnStatus` / `PurchaseReturn`), `tables.schemas.ts`, `tables.controller.ts`, `tables.service.ts` (bảo toàn 100% logic Chuyển bàn realtime/KDS socket), và `RoleTabs.tsx` (hiển thị đầy đủ cả tab Đơn hàng và Ưu đãi cho Admin).
      3. Cài đặt các thư viện mới vào frontend: `expo-document-picker`, `expo-sharing`, `jszip`, `qrcode`, `react-native-qrcode-svg`.
      4. Vá lỗi lint (`prefer-const`, unused variables) và bổ sung alias `getTableByNumber` trong `tables.controller.ts`.
      5. Đồng bộ schema cơ sở dữ liệu kiểm thử `crispy_bite_test` bằng `npx prisma db push`.
    - *Kết quả nghiệm thu*:
      - Backend: 56/56 test files, 378/378 tests PASS (100%).
      - Frontend: 38/38 test files, 113/113 tests PASS (100%).
      - Tổng cộng hệ thống: **491/491 tests PASS (100%)**.
      - `npm run typecheck`: 100% không lỗi (backend + frontend).
      - `npm run lint`: Sạch lỗi (0 error).
      - `npm run doctor`: 18/18 checks đạt tiêu chuẩn Expo SDK 54.
      - Đã hoàn tất gộp vào nhánh chính `main` và cập nhật fast-forward cho local `pKhanh`.

37. **Hợp nhất Toàn diện Nhánh `pKhanh` Đợt 3 (52 commits) vào `main` — Hệ Sinh Thái Quản Trị Nhân Sự (HRM), Lịch Ca Kíp, Chấm Công Kiosk, Bảng Lương, Đặt Bàn & Đối Tác Giao Hàng**:
    - *Bối cảnh & Nghiệp vụ tiếp nhận*: Nhánh `origin/pKhanh` phát triển khối lượng nghiệp vụ đồ sộ (238 files thay đổi, +30,239 dòng code) bổ sung trọn bộ hệ thống HRM chuyên nghiệp cho chuỗi QSR:
      1. **Hồ sơ & Danh bạ Nhân viên (Employee Directory & Avatars)**: API quản lý nhân sự, chức vụ, bộ phận, hồ sơ lương cơ bản, upload ảnh đại diện bảo mật (`/api/employees/avatar`), modal form responsive thích ứng mọi kích thước màn hình.
      2. **Quản lý Lịch Làm Việc & Ca Kíp (Work Schedules & Shift Catalog)**: Quản lý danh mục ca (`MORNING`, `AFTERNOON`, `EVENING`, ca tùy biến), lập lịch theo tuần dạng lưới ma trận cuộn ngang, phát hiện xung đột ca, bảo toàn lịch sử ca làm khi nhân viên thôi việc hoặc điều chuyển, import/export lịch làm việc qua Excel.
      3. **Chấm Công Kiosk & Quản Trị Duyệt Công (Attendance System)**: Màn hình Kiosk chấm công độc lập tại cửa hàng với mã PIN/AttendanceCode, chống brute-force và cấp session an toàn, giao diện Quản trị viên theo dõi/điều chỉnh giờ công (`AttendanceCorrectionModal`), cập nhật WebSocket realtime khi nhân viên check-in/check-out.
      4. **Bảng Lương & Tính Lương Tự Động (Snapshot Payroll Engine & Payment Ledger)**: Động cơ tính toán lương nguyên tử theo kỳ (lương theo giờ công thực tế hoặc ca dự kiến, phụ cấp, giảm trừ), lưu snapshot bất biến các chính sách tại thời điểm chốt lương, sổ cái chi trả lương (`PayrollPaymentLedger`), xuất phiếu lương PDF/Excel.
      5. **Chính Sách & Cài Đặt Nhân Sự Phiên Bản Hóa (Versioned Workforce Policies & Settings)**: Quản lý lịch tuần làm việc, ngày nghỉ lễ, ngưỡng đi muộn/về sớm có lưu phiên bản lịch sử kiểm toán (`AuditLog`), tự động cảnh báo ngày nghỉ trên lịch ca và cập nhật checklist Kiosk theo thời gian thực.
      6. **Quản Lý Đặt Bàn & Đặt Cọc (Reservations & Deposit Booking Lifecycle)**: Khách đặt bàn trước kèm tiền cọc VietQR, ràng buộc thanh toán/check-in tại POS, hoàn cọc tự động theo chính sách.
      7. **Quản Lý Khách Hàng (Customer Management) & Đối Tác Giao Hàng (Delivery Partners)**: Phân hệ quản lý tệp khách hàng thân thiết và đối tác vận chuyển giao hàng tận nơi.
    - *Xử lý Kỹ thuật & Sửa lỗi Root Cause (RCA)*:
      1. **RCA 1: Lỗi Hạn chế InnoDB Foreign Key Truncate (MySQL Error 1701)**:
         - *Nguyên nhân*: MySQL InnoDB chặn lệnh `TRUNCATE TABLE` trên các bảng có khóa ngoại tham chiếu đến nó (`WorkShift`, `Employee`, `BranchAttendancePolicyVersion`), ngay cả khi bật `FOREIGN_KEY_CHECKS = 0`. Khối try/catch trong `truncateAllTables()` nuốt lỗi âm thầm, làm dữ liệu ca kíp và nhân viên cũ từ test trước không bị xóa, gây xung đột `WorkShift_code_key` và `Employee_code_key`.
         - *Giải pháp*: Cải tiến `truncateAllTables()` với cơ chế fallback: ưu tiên `TRUNCATE TABLE` để reset auto-increment, nếu InnoDB chặn thì chuyển ngay sang `DELETE FROM \`${table}\``. Đảm bảo 100% dữ liệu được dọn dẹp sạch sẽ mà không làm lệch ID của `User` hay `DiningTable`.
      2. **RCA 2: Va chạm Mã SKU trong Quá trình Seed CSDL (`MenuItem_sku_key`)**:
         - *Nguyên nhân*: Hàm `seedDatabase` khởi tạo `itemSkuSeq = 1`. Khi test import tạo trước các món ăn có mã SKU `SP000001`, việc seed lại món chính bị trùng lặp SKU.
         - *Giải pháp*: Tự động đọc danh sách `existingSkus` trong DB và tăng lũy tiến `itemSkuSeq` vượt qua các SKU đã tồn tại trước khi tạo mới món ăn.
      3. **RCA 3: Đồng bộ Metadata Bảng `_prisma_migrations`**:
         - Phát triển script `scripts/sync-migrations-record.js` sử dụng `prisma migrate resolve --applied <name>` để đồng bộ đầy đủ 25 migration vào `_prisma_migrations` trên cả `crispy_bite_test` và `crispy_bite_dev`.
      4. **RCA 4: Lệch Mật khẩu Demo trong `AuthContext`**:
         - Khôi phục `cashier123`, `kitchen123`, `admin123` khớp 100% với cấu hình `.env`, vượt qua bài test `src/webWarningGuards.test.ts`.
    - *Kết quả nghiệm thu*:
      - Backend: 105/105 test files, 725/725 tests PASS (100%).
      - Frontend: 71/71 test files, 247/247 tests PASS (100%).
      - Tổng cộng hệ thống: **972/972 tests PASS (100%)**.
      - `npm run typecheck`: 100% không lỗi (backend + frontend).
      - `npm run lint`: Sạch lỗi (0 error).
      - `npm run doctor`: 18/18 checks đạt tiêu chuẩn Expo SDK 54.
38. **Hợp nhất Toàn diện Nhánh `pKhanh` Đợt 4 (26 commits) vào `main` — Hệ Thống Sổ Quỹ & Dòng Tiền (Cashbook Ledger) và Động Cơ Tính Hoa Hồng Nhân Viên (Employee Commission Engine)**:
    - *Bối cảnh & Nghiệp vụ tiếp nhận*: Nhánh `origin/pKhanh` hoàn thành tích hợp đợt 4 (PR #1 từ `codex/cashbook-commission-integration` vào `pKhanh` và PR #2 vào `main` commit `0a4dba6`) bổ sung 152 files thay đổi, +9,567 dòng code:
      1. **Hệ thống Sổ Quỹ & Dòng Tiền (Cashbook Ledger & Money Events)**: Quản lý tài khoản tiền mặt (`CASH`), tài khoản ngân hàng (`BANK`), kiểm soát số dư theo thời gian thực (Chronological Balance Enforcement); hạch toán tự động từ bán hàng POS (`POS_SALE`), đổi trả hàng (`SALES_RETURN`), nhập kho NCC (`PURCHASE_RECEIPT`), trả hàng NCC (`PURCHASE_RETURN`), thanh toán công nợ (`SUPPLIER_PAYMENT`), chi lương (`PAYROLL_PAYMENT`), cọc/hoàn cọc bàn (`RESERVATION_DEPOSIT`, `RESERVATION_REFUND`); phiếu thu/chi thủ công và in phiếu nhiệt/PDF.
      2. **Động cơ Hoa Hồng Nhân Viên (Employee Commission Engine)**: Cấu hình chính sách hoa hồng theo món ăn hoặc doanh thu, gán nhân viên tư vấn/bán hàng theo từng dòng đơn hàng POS (`CommissionAssigneePicker`, `commissionCart`), ghi nhận doanh thu và tính hoa hồng tự động khi đơn hoàn tất, tự động khấu trừ/đảo ngược khi phát sinh trả hàng (`Sales Return`), kết chuyển phân bổ vào bảng lương định kỳ (`Payroll Allocation`), màn hình Quản trị hoa hồng (`EmployeeCommissionScreen`) và WebSocket realtime.
    - *Xử lý Kỹ thuật & Sửa lỗi Root Cause (RCA)*:
      1. **RCA 1: Lỗi Unique Constraint Violated trên `CashFlowCategory_code_key` trong `database.ts`**:
         - *Nguyên nhân*: Bảng `CashFlowCategory` bị `CashVoucher` tham chiếu (`onDelete: Restrict`). Lệnh `TRUNCATE TABLE CashFlowCategory` quăng lỗi MySQL 1701 (`Cannot truncate a table referenced in a foreign key constraint`). Khối catch chuyển sang `DELETE FROM CashFlowCategory` nhưng nếu transaction trước đó bị gián đoạn, 10 bản ghi hệ thống không bị xóa sạch. Lệnh `prismaTest.cashFlowCategory.createMany()` sau đó chèn đè gây lỗi vi phạm khóa duy nhất `CashFlowCategory_code_key`.
         - *Giải pháp*: Chuyển `cashFlowCategory` sang cơ chế `upsert` theo `code` cho 10 `systemCategories` (giống chuẩn của `financialAccount` và `cashbookSetting`), kèm lệnh `deleteMany({ where: { isSystem: false } })` để dọn sạch các danh mục tùy biến từ các test case khác.
      2. **RCA 2: Timeout Mặc định Vitest khi Chạy Full Suite Cơ Sở Dữ Liệu Lớn**:
         - *Nguyên nhân*: Quá trình seed dữ liệu mẫu đầy đủ trong `beforeEach` cho các test suite phức tạp (như `menu-import-api.spec.ts`) có thể tiệm cận ngưỡng `hookTimeout: 10000ms`, gây timeout và để lại transaction MySQL dở dang.
         - *Giải pháp*: Cập nhật script test trong `backend/package.json` với `--testTimeout=30000 --hookTimeout=30000` để các bài test database integration chạy tuần tự ổn định 100%.
      3. **RCA 3: Chuẩn Hóa TypeScript Linting (prefer-const & no-empty-object-type)**:
         - Sửa biến `stored` từ `let` thành `const` trong `employee-payroll.mutation.service.spec.ts`.
         - Đổi `interface CartItem extends CommissionCartLine {}` thành `type CartItem = CommissionCartLine;` trong `RestaurantContext.tsx` để tuân thủ rule `@typescript-eslint/no-empty-object-type`.
    - *Kết quả nghiệm thu*:
      - Backend: 123/123 test files, 822/822 tests PASS (100%).
      - Frontend: 86/86 test files, 289/289 tests PASS (100%).
      - Tổng cộng hệ thống: **1,111/1,111 tests PASS (100%)** (Vượt mốc 1,100 tests!).
      - `npm run typecheck`: 100% không lỗi (backend + frontend).
      - `npm run lint`: Sạch lỗi (0 error, 1 warning nhỏ unused).
      - `npm run doctor`: 18/18 checks đạt tiêu chuẩn Expo SDK 54.
      - 33 migrations Prisma đã deploy và đồng bộ vào `_prisma_migrations` trên cả `crispy_bite_dev` và `crispy_bite_test`.

---
*Tệp tiến độ được tối ưu hóa tinh gọn, lưu trữ các quy chuẩn kiến trúc và tiến độ cập nhật phục vụ phát triển liên tục.*


