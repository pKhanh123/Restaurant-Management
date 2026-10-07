from __future__ import annotations

import re
from pathlib import Path

from build_report import (
    ROOT, Report, draw_architecture, draw_usecases, draw_erd,
    draw_sequence, draw_flow, parse_schema, parse_routes,
)

ABBR = [
    ('API','Application Programming Interface','Giao diện lập trình ứng dụng'),
    ('BOM','Bill of Materials','Định lượng nguyên liệu của món'),
    ('CSDL','—','Cơ sở dữ liệu'),
    ('COGS','Cost of Goods Sold','Giá vốn hàng bán'),
    ('CRUD','Create Read Update Delete','Thêm, đọc, sửa, xóa dữ liệu'),
    ('E2E','End to End','Kiểm thử toàn bộ luồng'),
    ('ERD','Entity Relationship Diagram','Sơ đồ thực thể và quan hệ'),
    ('FSM','Finite State Machine','Máy trạng thái hữu hạn'),
    ('HRM','Human Resource Management','Quản trị nhân sự'),
    ('HTTP','Hypertext Transfer Protocol','Giao thức trao đổi dữ liệu web'),
    ('JWT','JSON Web Token','Mã xác thực phiên'),
    ('KDS','Kitchen Display System','Màn hình tác nghiệp bếp'),
    ('KPI','Key Performance Indicator','Chỉ số đánh giá hoạt động'),
    ('ORM','Object Relational Mapping','Ánh xạ dữ liệu quan hệ'),
    ('POS','Point of Sale','Điểm bán hàng / màn hình thu ngân'),
    ('QSR','Quick Service Restaurant','Nhà hàng phục vụ nhanh'),
    ('QR','Quick Response','Mã phản hồi nhanh'),
    ('RBAC','Role Based Access Control','Phân quyền theo vai trò'),
    ('REST','Representational State Transfer','Kiểu thiết kế API theo tài nguyên'),
    ('SKU','Stock Keeping Unit','Mã quản lý mặt hàng'),
    ('SOS','Speed of Service','Thời gian phục vụ'),
    ('UML','Unified Modeling Language','Ngôn ngữ mô hình hóa thống nhất'),
    ('UI','User Interface','Giao diện người dùng'),
    ('UX','User Experience','Trải nghiệm người dùng'),
]

ACTORS = [
    ('Khách hàng','Quét mã bàn, xem thực đơn, đặt món, theo dõi trạng thái, đặt bàn'),
    ('Thu ngân','Tạo đơn tại quầy, quản lý bàn, thanh toán, hóa đơn, đơn hàng'),
    ('Bếp','Nhận vé chế biến, đổi trạng thái món/đơn, báo hết món, ghi nhận hao hụt'),
    ('Quản trị','Quản lý danh mục, giá, kho, nhân sự, báo cáo, kiểm toán'),
    ('Hệ thống nền','Tự hủy đơn quá hạn, phát sự kiện đồng bộ, cập nhật dữ liệu phát sinh'),
]

REQS = [
    ('F01','Đăng nhập và phân quyền','ADMIN, CASHIER, KITCHEN'),
    ('F02','Quản lý thực đơn, loại món, biến thể','Quản trị và bếp'),
    ('F03','Lập đơn bán tại quầy','Thu ngân'),
    ('F04','Khách gọi món bằng QR bàn','Khách hàng'),
    ('F05','Quản lý trạng thái bàn và chuyển bàn','Thu ngân, quản trị'),
    ('F06','Điều phối vé bếp theo trạng thái','Bếp'),
    ('F07','Thanh toán, xuất hóa đơn, hoàn trả','Thu ngân, quản trị'),
    ('F08','Áp dụng mã ưu đãi và bảng giá','Thu ngân, quản trị'),
    ('F09','Quản lý nguyên liệu và định lượng BOM','Quản trị'),
    ('F10','Nhập hàng, nhà cung cấp, kiểm kho','Quản trị'),
    ('F11','Đặt bàn và quản lý khách hàng','Khách, nhân viên'),
    ('F12','Quản lý nhân viên và ca làm','Quản trị'),
    ('F13','Chấm công, tính lương, hoa hồng','Nhân viên, quản trị'),
    ('F14','Xem báo cáo ngày và nhật ký','Quản trị'),
    ('F15','Sổ quỹ, phiếu thu chi','Thu ngân, quản trị'),
]

USECASES = [
    ('UC01','Đăng nhập hệ thống','Nhân viên','Tài khoản còn hoạt động và có mật khẩu hợp lệ.',
     ['Mở màn hình đăng nhập và nhập tên đăng nhập, mật khẩu.','Giao diện gửi thông tin đến API xác thực.','Máy chủ kiểm tra người dùng và mật khẩu đã băm.','Máy chủ trả JWT cùng vai trò.','Giao diện lưu phiên và hiển thị tab đúng vai trò.'],
     ['Sai thông tin: trả lỗi xác thực, không phát token.','Tài khoản không được phép: từ chối vào chức năng.'],'Phiên hợp lệ được tạo; quyền được kiểm tra lại ở API.'),
    ('UC02','Tạo đơn tại quầy','Thu ngân','Đăng nhập vai trò thu ngân; thực đơn sẵn có.',
     ['Chọn loại đơn và bàn nếu phục vụ tại bàn.','Tìm món, chọn số lượng và tùy chọn bắt buộc.','Kiểm tra giỏ hàng, ghi chú và mã ưu đãi nếu có.','Gửi yêu cầu tạo đơn kèm khóa chống gửi trùng.','Máy chủ kiểm tra giá, tồn trạng thái và lưu đơn.','Bếp nhận sự kiện đơn mới.'],
     ['Thiếu tùy chọn bắt buộc: yêu cầu bổ sung.','Bàn không hợp lệ hoặc mã ưu đãi hết hiệu lực: báo lỗi.','Gửi lặp khóa: trả cùng kết quả hoặc từ chối theo hợp đồng.'],'Đơn được lưu, bàn cập nhật và vé bếp xuất hiện.'),
    ('UC03','Khách gọi món bằng QR bàn','Khách hàng','Mã bàn hoặc token truy cập được máy chủ xác thực.',
     ['Quét mã và mở trang gọi món.','Giao diện tải thông tin bàn và thực đơn.','Khách thêm món, tùy chọn và ghi chú.','Khách xác nhận giỏ hàng.','Máy chủ tạo đơn gắn bàn và phát sự kiện bếp.','Khách theo dõi trạng thái đơn.'],
     ['Token sai/hết hiệu lực: từ chối thao tác.','Món ngừng bán: yêu cầu chọn lại.'],'Đơn được tạo đúng bàn, không cần tài khoản nhân viên.'),
    ('UC04','Cập nhật vé bếp','Nhân viên bếp','Đơn ở trạng thái có thể chuyển tiếp.',
     ['Mở màn hình KDS.','Nhận danh sách vé và sự kiện đơn mới.','Chọn vé đang chờ và xác nhận chế biến.','Khi xong, chuyển sang sẵn sàng.','Máy chủ ghi trạng thái và phát sự kiện cho các màn hình.'],
     ['Nhảy cóc trạng thái: API từ chối.','Mạng gián đoạn: tải lại danh sách từ REST.'],'POS và giao diện khách nhìn thấy trạng thái mới.'),
    ('UC05','Thanh toán đơn hàng','Thu ngân','Đơn tồn tại, chưa thanh toán và đủ quyền.',
     ['Mở đơn và kiểm tra tiền hàng, giảm giá, thuế, phí.','Chọn phương thức và xác nhận thanh toán.','Máy chủ khóa giao dịch và kiểm tra thanh toán lặp.','Ghi giao dịch thanh toán và cập nhật trạng thái.','Trừ nguyên liệu theo định lượng nếu áp dụng.','Phát sự kiện cập nhật đơn và bàn.'],
     ['Đơn đã thanh toán: chặn thanh toán lần hai.','Giao dịch lỗi: rollback các ghi liên quan.'],'Đơn thanh toán thành công và dữ liệu tồn kho nhất quán.'),
    ('UC06','Chuyển bàn','Thu ngân','Bàn nguồn có đơn chưa thanh toán; bàn đích hợp lệ.',
     ['Chọn bàn nguồn và bàn đích.','Xác nhận chuyển toàn bộ đơn còn nợ.','Máy chủ kiểm tra trạng thái hai bàn.','Đổi liên kết đơn và trạng thái bàn trong giao dịch.','Phát sự kiện cập nhật sơ đồ bàn.'],
     ['Bàn đích không hợp lệ: từ chối.','Đơn đã chốt: không chuyển.'],'Đơn còn nợ gắn đúng bàn đích; có nhật ký thao tác.'),
    ('UC07','Hủy đơn có kiểm toán','Quản trị','Có quyền ADMIN; đơn được phép hủy.',
     ['Mở chi tiết đơn.','Nhập lý do hủy và xác nhận.','Máy chủ kiểm tra quyền, trạng thái và lý do.','Ghi thời điểm, người thực hiện, lý do và nhật ký.','Cập nhật bàn, hoàn tác tài nguyên liên quan theo nghiệp vụ.'],
     ['Lý do không hợp lệ: từ chối.','Đơn đã ở trạng thái không được hủy: chặn.'],'Đơn được đánh dấu hủy; truy vết được quyết định.'),
    ('UC08','Quản lý thực đơn','Quản trị','Đã đăng nhập ADMIN.',
     ['Mở danh sách món và lọc theo danh mục.','Tạo hoặc sửa tên, SKU, giá, trạng thái.','Cấu hình nhóm tùy chọn và lựa chọn.','Lưu thay đổi qua API.','Giao diện bán tải hoặc nhận dữ liệu mới.'],
     ['Trùng mã/giá sai: báo lỗi dữ liệu.','Món đang bị khóa: tuân thủ ràng buộc nghiệp vụ.'],'Thực đơn mới sẵn sàng cho các điểm bán.'),
    ('UC09','Quản lý định lượng món','Quản trị','Món và nguyên liệu đã được tạo.',
     ['Mở định lượng của món.','Chọn nguyên liệu và số lượng tiêu hao.','Lưu BOM qua API.','Máy chủ kiểm tra đơn vị và tính giá vốn tham chiếu.'],
     ['Nguyên liệu không tồn tại hoặc số lượng không dương: từ chối.'],'Công thức định lượng dùng khi phát sinh đơn đã thanh toán.'),
    ('UC10','Tạo phiếu nhập hàng','Quản trị','Nhà cung cấp và nguyên liệu hợp lệ.',
     ['Chọn nhà cung cấp và ngày chứng từ.','Thêm dòng nguyên liệu, số lượng, đơn giá.','Kiểm tra tổng tiền và lưu phiếu.','Máy chủ ghi giao dịch nhập, cập nhật tồn và công nợ.'],
     ['Dòng nhập thiếu dữ liệu: báo lỗi.','Lưu giao dịch lỗi: không cập nhật tồn một phần.'],'Phiếu nhập và lịch sử kho được lưu.'),
    ('UC11','Kiểm kê kho','Quản trị','Danh mục nguyên liệu đã có.',
     ['Tạo kỳ kiểm kê.','Nhập số đếm thực tế theo nguyên liệu.','Xem chênh lệch so với sổ.','Xác nhận và ghi giao dịch điều chỉnh nếu được phép.'],
     ['Kiểm kê đã chốt: không sửa.','Số lượng không hợp lệ: báo lỗi.'],'Có biên bản và dấu vết điều chỉnh tồn.'),
    ('UC12','Quản lý đặt bàn','Khách hàng và nhân viên','Có thông tin ngày, giờ và liên hệ.',
     ['Khách gửi yêu cầu đặt bàn.','Hệ thống kiểm tra dữ liệu và tình trạng bàn.','Nhân viên xác nhận hoặc thay đổi đặt bàn.','Ghi trạng thái và lịch sử thay đổi.'],
     ['Trùng lịch hoặc không đủ bàn: yêu cầu chọn thời điểm khác.'],'Đặt bàn có trạng thái và thông tin liên hệ rõ.'),
    ('UC13','Quản lý hồ sơ nhân viên','Quản trị','Đã đăng nhập ADMIN.',
     ['Mở danh sách nhân viên.','Tạo hoặc cập nhật hồ sơ, bộ phận, chức danh.','Lưu thông tin và kiểm tra trường bắt buộc.','Thay đổi trạng thái làm việc nếu có quyết định.'],
     ['Mã hoặc thông tin định danh trùng: từ chối.'],'Hồ sơ phục vụ lịch ca, công và lương.'),
    ('UC14','Lập lịch ca làm','Quản trị','Có nhân viên và ca làm hợp lệ.',
     ['Chọn tuần, nhân viên và ca.','Thiết lập ca lặp hoặc ngoại lệ.','Kiểm tra xung đột lịch.','Lưu và hiển thị lịch tuần.'],
     ['Ca chồng lấn hoặc nhân viên không hoạt động: báo lỗi.'],'Lịch làm việc có thể tra cứu theo tuần.'),
    ('UC15','Chấm công kiosk','Nhân viên','Có phiên kiosk hợp lệ và nhân viên đủ điều kiện.',
     ['Mở kiosk chấm công.','Nhập hoặc xác nhận thông tin nhận diện theo cấu hình.','Gửi thao tác vào/ra.','Máy chủ kiểm tra phiên, giới hạn tần suất và chống gửi lặp.','Ghi thời điểm và phản hồi kết quả.'],
     ['Phiên hết hiệu lực: yêu cầu mở lại.','Gửi lặp hoặc quá giới hạn: từ chối.'],'Bản ghi công xuất hiện để quản trị duyệt.'),
    ('UC16','Tính và duyệt lương','Quản trị','Có kỳ lương, chính sách và dữ liệu công.',
     ['Chọn kỳ và tập nhân viên.','Hệ thống tổng hợp công, điều chỉnh, hoa hồng liên quan.','Người quản trị rà soát dòng tính.','Duyệt hoặc khóa kỳ theo trạng thái.','Ghi thanh toán nếu thực hiện.'],
     ['Thiếu dữ liệu hoặc chính sách: nêu vấn đề cần xử lý.','Kỳ đã khóa: chặn tính lại tùy tiện.'],'Có bảng lương và lịch sử quyết định.'),
    ('UC17','Thiết lập hoa hồng','Quản trị','Có nhân viên và quy tắc áp dụng.',
     ['Tạo kế hoạch hoa hồng.','Chọn người hưởng và quy tắc.','Kích hoạt theo kỳ hiệu lực.','Hệ thống ghi nhận cơ sở doanh số khi đơn đủ điều kiện.','Quản trị đối soát vấn đề phát sinh.'],
     ['Quy tắc mâu thuẫn hoặc không hiệu lực: không áp dụng.'],'Bút toán hoa hồng có nguồn gốc và kỳ áp dụng.'),
    ('UC18','Xem báo cáo ngày','Quản trị','Đã đăng nhập ADMIN.',
     ['Chọn ngày theo múi giờ kinh doanh.','Giao diện gọi API báo cáo ngày.','Máy chủ tổng hợp đơn đủ điều kiện và chỉ số vận hành.','Hiển thị KPI và danh sách món nổi bật.'],
     ['Ngày sai định dạng: API báo lỗi.','Không có dữ liệu: hiển thị trạng thái rỗng.'],'Người quản trị xem được tổng quan ngày.'),
    ('UC19','Lập phiếu thu chi','Thu ngân hoặc quản trị','Có tài khoản quỹ và danh mục thu chi hợp lệ.',
     ['Chọn loại phiếu và tài khoản.','Nhập số tiền, nội dung, đối tượng liên quan.','Kiểm tra số dư và điều kiện nghiệp vụ.','Lưu phiếu và cập nhật sổ quỹ.'],
     ['Số tiền không hợp lệ hoặc chi vượt số dư: từ chối.','Gửi lặp: chống ghi hai lần.'],'Phiếu và biến động quỹ được lưu đồng nhất.'),
    ('UC20','Xem nhật ký kiểm toán','Quản trị','Đã đăng nhập ADMIN.',
     ['Mở màn hình nhật ký.','Chọn bộ lọc theo thời gian hoặc đối tượng.','Hệ thống trả bản ghi thao tác.','Đối chiếu người thực hiện, thời điểm và thay đổi.'],
     ['Không có bản ghi: hiển thị trạng thái rỗng.'],'Có thông tin phục vụ truy vết nghiệp vụ.'),
]

TESTS = [
    ('TC01','Đăng nhập đúng','Dùng tài khoản seed hợp lệ','Nhận phiên và tab đúng vai trò'),
    ('TC02','Đăng nhập sai mật khẩu','Nhập sai mật khẩu','Bị từ chối; không phát JWT'),
    ('TC03','Truy cập API trái vai trò','CASHIER gọi route ADMIN','HTTP lỗi phân quyền'),
    ('TC04','Tạo đơn tại bàn','Chọn bàn, món, tùy chọn','Đơn gắn bàn và vé bếp'),
    ('TC05','Tạo đơn mang về','Không chọn bàn','Đơn có loại mang về'),
    ('TC06','Thiếu modifier bắt buộc','Bỏ tùy chọn yêu cầu','Không tạo đơn'),
    ('TC07','Gửi trùng yêu cầu tạo đơn','Lặp khóa idempotency','Không sinh hai đơn'),
    ('TC08','Mã QR sai','Thay token bàn','Không tạo đơn khách'),
    ('TC09','Món báo hết','Bếp ngừng bán món','POS/khách không đặt món'),
    ('TC10','Chuyển trạng thái bếp hợp lệ','PENDING → PREPARING → READY','Trạng thái tăng đúng thứ tự'),
    ('TC11','Nhảy cóc trạng thái bếp','PENDING → READY trực tiếp','API từ chối'),
    ('TC12','Đồng bộ KDS','Tạo đơn từ POS','KDS nhận sự kiện hoặc REST'),
    ('TC13','Thanh toán hợp lệ','Thanh toán đơn chưa trả','Cập nhật đơn/giao dịch'),
    ('TC14','Thanh toán lặp','Gửi lần hai cho cùng đơn','Không ghi nhận hai lần'),
    ('TC15','Chuyển bàn','Chuyển đơn chưa trả','Bàn nguồn/đích nhất quán'),
    ('TC16','Hủy đơn với lý do','ADMIN nhập lý do hợp lệ','Có audit, đơn hủy'),
    ('TC17','Hủy đơn sai quyền','CASHIER gọi API hủy','Bị từ chối'),
    ('TC18','Voucher còn hiệu lực','Nhập mã đủ điều kiện','Giảm giá đúng điều kiện'),
    ('TC19','Voucher hết hạn','Nhập mã hết hiệu lực','Không giảm giá'),
    ('TC20','BOM tiêu hao','Thanh toán món có BOM','Tạo giao dịch trừ kho'),
    ('TC21','Nhập nguyên liệu','Lập phiếu nhập hợp lệ','Tăng tồn và ghi lịch sử'),
    ('TC22','Kiểm kê','Chốt chênh lệch','Ghi giao dịch điều chỉnh'),
    ('TC23','Hủy nguyên liệu bếp','Ghi nhận hủy có số lượng','Tồn kho và giá trị hủy cập nhật'),
    ('TC24','Đặt bàn hợp lệ','Chọn ngày/giờ và thông tin khách','Tạo đặt bàn'),
    ('TC25','Đặt bàn trùng lịch','Chọn thời điểm không khả dụng','Thông báo xung đột'),
    ('TC26','Thêm nhân viên','ADMIN tạo hồ sơ hợp lệ','Hồ sơ được lưu'),
    ('TC27','Lịch ca chồng nhau','Gán hai ca trùng','Cảnh báo hoặc từ chối'),
    ('TC28','Kiosk chấm công','Nhân viên thao tác vào/ra','Ghi đúng phiên công'),
    ('TC29','Kiosk gửi lặp','Lặp thao tác cùng khóa','Không nhân đôi bản ghi'),
    ('TC30','Bảng lương','Tính kỳ có dữ liệu công','Có dòng lương và snapshot'),
    ('TC31','Thanh toán lương','Chi từ tài khoản đã chọn','Đúng tài khoản và giao dịch'),
    ('TC32','Hoa hồng','Đơn đủ quy tắc','Có bút toán theo kế hoạch'),
    ('TC33','Sổ quỹ thu tiền','Tạo phiếu thu','Tăng số dư tài khoản'),
    ('TC34','Sổ quỹ chi tiền','Tạo phiếu chi hợp lệ','Giảm số dư tài khoản'),
    ('TC35','Chi vượt số dư','Tạo phiếu chi vượt số dư','Không ghi phiếu và số dư'),
    ('TC36','Báo cáo ngày','Chọn ngày có đơn hoàn tất','Tổng hợp theo ngày Việt Nam'),
    ('TC37','Báo cáo ngày trống','Chọn ngày không có dữ liệu','Hiển thị 0/rỗng hợp lý'),
    ('TC38','Phân trang danh sách','Tạo nhiều bản ghi','Không mất/nhân bản bản ghi'),
    ('TC39','Giao diện mobile','Viewport 390×844','Không tràn ngang chức năng chính'),
    ('TC40','Giao diện desktop','Viewport 1440×900','Điều hướng và bảng rõ ràng'),
]

MODEL_GROUPS = [
    ('Nhân sự và chính sách', {'User','Branch','BranchEmployeeSettingsRevision','BranchAttendancePolicyVersion','BranchPayrollPolicyVersion','BranchWorkweekPolicyVersion','BranchHolidayPeriod','Department','JobTitle','Employee','EmployeeCompensation','EmployeePayrollBatch','EmployeePayrollLine','EmployeePayrollAdjustment','EmployeePayrollPayment','EmployeePayrollIdempotency','EmployeeScheduleIdempotency','WorkShift','EmployeeScheduleRule','EmployeeScheduleException','AttendanceKioskSession','EmployeeAttendanceSession','AttendanceKioskIdempotency','EmployeeAttendanceDisposition','AttendanceKioskRateLimitBucket','CommissionPlan','CommissionPlanEmployee','CommissionRule','CommissionSaleBasis','CommissionBasisResolution','CommissionRecognitionIssue','CommissionEntry','CommissionPayrollAllocation'}),
    ('Bán hàng và khách hàng', {'CustomerGroup','Customer','ReservationPolicy','Reservation','ReservationDepositTransaction','ReservationChange','Category','PriceList','MenuItem','PriceListItem','ModifierGroup','ModifierOption','DiningTable','TableArea','Order','OrderPaymentTransaction','OrderItem','OrderReturn','OrderReturnLine','DeliveryPartner','DeliveryPartnerGroup','Voucher','AuditLog'}),
    ('Kho và mua hàng', {'Ingredient','MenuItemIngredient','InventoryTransaction','InventoryCheck','InventoryCheckLine','InventoryWaste','InventoryWasteLine','Supplier','SupplierGroup','PurchaseReceipt','PurchaseReceiptLine','SupplierPayment','PurchaseReturn','PurchaseReturnLine'}),
    ('Sổ quỹ và tài chính', {'FinancialAccount','CashFlowCategory','FinancialParty','CashbookSetting','CashVoucher'}),
]

FIELD_MEANING = {
    'id':'Khóa chính của bản ghi','createdAt':'Thời điểm tạo','updatedAt':'Thời điểm cập nhật',
    'deletedAt':'Thời điểm xóa mềm','name':'Tên hiển thị','code':'Mã nghiệp vụ',
    'status':'Trạng thái nghiệp vụ','branchId':'Khóa ngoại chi nhánh','employeeId':'Khóa ngoại nhân viên',
    'userId':'Khóa ngoại người dùng','orderId':'Khóa ngoại đơn hàng','customerId':'Khóa ngoại khách hàng',
    'tableId':'Khóa ngoại bàn ăn','amount':'Số tiền','quantity':'Số lượng','unitPrice':'Đơn giá',
    'totalAmount':'Tổng giá trị','note':'Ghi chú','reason':'Lý do','effectiveAt':'Thời điểm hiệu lực',
    'effectiveFrom':'Bắt đầu hiệu lực','effectiveTo':'Kết thúc hiệu lực',
}

def meaning(name,typ):
    if name in FIELD_MEANING:return FIELD_MEANING[name]
    if name.endswith('Id'):return 'Khóa ngoại/liên kết đến '+name[:-2]
    if name.endswith('At'):return 'Mốc thời gian '+name
    if name.endswith('Date'):return 'Ngày '+name
    if name.endswith('Amount') or name.endswith('Cost') or name.endswith('Price'):return 'Giá trị tiền tệ '+name
    if name.endswith('Count') or name.endswith('Quantity'):return 'Số lượng '+name
    if typ.endswith('[]'):return 'Quan hệ một-nhiều với '+typ[:-2]
    if typ.rstrip('?').startswith('DateTime'):return 'Ngày/giờ '+name
    return 'Thuộc tính '+name

def main_front(r: Report):
    r.field_toc('toc')
    r.title('DANH MỤC CÁC THUẬT NGỮ')
    r.body('Các ký hiệu sau được dùng nhất quán trong phần phân tích, thiết kế và triển khai. Tên công nghệ giữ nguyên theo mã nguồn dự án.')
    r.table('0','Danh mục thuật ngữ và chữ viết tắt',['STT','Viết tắt','Tiếng Anh','Diễn giải'],[(i,a,b,c) for i,(a,b,c) in enumerate(ABBR,1)],[1.1,2.2,5.2,7.6],small=True)
    r.title('DANH MỤC CÁC BẢNG');r.field_toc('Bảng')
    fig_list_title=r.title('DANH MỤC CÁC HÌNH VẼ, ĐỒ THỊ')
    fig_list_title.paragraph_format.page_break_before=False
    r.field_toc('Hình')

def chapter1(r: Report):
    r.title('CHƯƠNG 1: TỔNG QUAN VỀ ĐỀ TÀI')
    r.h2('1.1. Lý do chọn đề tài')
    for t in [
        'Mô hình nhà hàng phục vụ nhanh cần xử lý nhiều thao tác trong cùng thời điểm: nhận yêu cầu của khách, chuyển món đến bếp, theo dõi bàn, chốt thanh toán và kiểm soát nguyên liệu. Nếu những thao tác này được ghi ở các công cụ rời rạc, dữ liệu dễ bị nhập lặp, trạng thái đơn khó đồng bộ và người quản lý thiếu căn cứ để đối soát.',
        'Đề tài lựa chọn xây dựng Crispy Bite như một hệ thống thống nhất cho khách gọi món bằng QR, thu ngân, bếp và quản trị. Một đơn hàng được lưu ở một nguồn dữ liệu; các màn hình nhận cập nhật trạng thái theo thời gian thực. Cách tiếp cận này giúp nghiên cứu đồng thời bài toán nghiệp vụ nhà hàng, thiết kế dữ liệu quan hệ, API và kiểm thử ứng dụng đa nền tảng.',
        'Sản phẩm hướng đến môi trường học tập và vận hành thử nghiệm. Các chỉ số trong báo cáo là kết quả đọc mã nguồn, tài liệu dự án và các lệnh kiểm tra được ghi rõ; báo cáo không suy diễn doanh thu hay hiệu quả thương mại của một nhà hàng đang hoạt động.'
    ]:r.body(t)
    r.h2('1.2. Mục tiêu của đề tài')
    r.h3('1.2.1. Mục tiêu tổng quát')
    r.body('Phân tích, thiết kế và triển khai hệ thống quản trị nhà hàng thông minh Crispy Bite, liên kết quy trình đặt món, chế biến, thanh toán và quản trị trên một cơ sở dữ liệu, với giao diện phù hợp các vai trò tác nghiệp.')
    r.h3('1.2.2. Mục tiêu cụ thể')
    objectives=[
        ('M1','Xây dựng xác thực và phân quyền theo vai trò nhân viên.'),
        ('M2','Tổ chức thực đơn, biến thể món, bàn ăn và đơn hàng.'),
        ('M3','Đồng bộ POS, KDS và trang gọi món của khách bằng API và sự kiện.'),
        ('M4','Thiết kế dữ liệu cho kho, nhà cung cấp, đặt bàn, nhân sự và tài chính.'),
        ('M5','Cung cấp báo cáo ngày, nhật ký và kịch bản kiểm thử có thể lặp lại.'),
    ]
    r.table('1','Mục tiêu có thể kiểm tra của đề tài',['Mã','Mục tiêu','Bằng chứng đánh giá'],[(a,b,'Mã nguồn, API, giao diện và kiểm thử liên quan') for a,b in objectives],[1.2,8.1,6.9])
    r.h2('1.3. Giới hạn và phạm vi của đề tài')
    r.h3('1.3.1. Đối tượng nghiên cứu')
    r.body('Đối tượng là quy trình số hóa hoạt động nhà hàng phục vụ nhanh: đặt món, phục vụ tại bàn hoặc mang đi, điều phối bếp, thanh toán, tồn kho và quản trị nhân sự. Nhóm người dùng gồm khách, thu ngân, bếp và quản trị. Dữ liệu khảo sát được mô hình hóa từ chức năng và yêu cầu nội bộ của dự án; báo cáo không trình bày một cuộc khảo sát doanh nghiệp độc lập nếu chưa có biên bản xác nhận.')
    r.h3('1.3.2. Phạm vi nghiên cứu')
    r.body('Ứng dụng gồm frontend React Native/Expo chạy trên web và có nền tảng cho thiết bị di động; backend Node.js/Express; MySQL qua Prisma ORM. Môi trường triển khai trong báo cáo là môi trường phát triển và kiểm thử của dự án. Tích hợp vận hành thật như thiết bị thanh toán, máy in chuyên dụng, dịch vụ giao hàng bên thứ ba và hạ tầng nhiều chi nhánh cần được nghiệm thu riêng.')
    r.h2('1.4. Nội dung thực hiện')
    r.body('Nội dung được chia thành bốn phần: khảo sát và xác định yêu cầu; nghiên cứu công nghệ; phân tích, thiết kế chức năng và dữ liệu; triển khai, kiểm thử và đánh giá. Phụ lục ghi từ điển dữ liệu, danh mục API và ca kiểm thử để người đọc có thể tra cứu chi tiết mà không làm đứt mạch các chương chính.')
    r.h2('1.5. Phương pháp tiếp cận')
    for x in ['Phân rã nghiệp vụ theo vai trò và ca sử dụng; xác định điều kiện trước, luồng chính, ngoại lệ và kết quả sau cho từng thao tác quan trọng.',
              'Thiết kế dữ liệu quan hệ dựa trên các thực thể và ràng buộc; tách lớp giao diện, API, dịch vụ nghiệp vụ và truy cập dữ liệu.',
              'Triển khai lặp: xây chức năng, viết kiểm thử ở mức phù hợp, chạy kiểm tra kiểu, kiểm tra giao diện, sau đó đối chiếu kết quả với yêu cầu.',
              'Sử dụng mã nguồn hiện tại làm nguồn sự thật cho phần mô tả kỹ thuật; đánh dấu riêng các nội dung cần ảnh chụp hoặc nghiệm thu thực tế.']:
        r.bullet(x)
    r.h2('1.6. Bố cục báo cáo')
    r.body('Chương 2 nêu cơ sở công nghệ. Chương 3 trình bày yêu cầu, use case, kiến trúc và dữ liệu. Chương 4 mô tả cách cài đặt, kiểm thử, triển khai. Kết luận tổng hợp kết quả và giới hạn; phụ lục cung cấp danh mục chi tiết trích từ repository.')

def chapter2(r: Report):
    r.title('CHƯƠNG 2: CƠ SỞ LÝ THUYẾT')
    r.h2('2.1. Quy trình phát triển phần mềm')
    r.body('Đề tài sử dụng quy trình lặp theo chức năng. Mỗi vòng gồm: nhận diện vấn đề nghiệp vụ, mô hình hóa dữ liệu và tương tác, cài đặt API/giao diện, kiểm thử, phản hồi rồi điều chỉnh. Việc đặt hợp đồng API và trạng thái nghiệp vụ trước khi mở rộng giao diện giúp giảm bất nhất giữa thu ngân, bếp và khách.')
    r.table('2','Đầu ra của các hoạt động phát triển',['Hoạt động','Đầu ra','Điểm kiểm tra'],[
        ('Phân tích','Vai trò, yêu cầu, use case','Đúng phạm vi và ngoại lệ'),('Thiết kế','ERD, luồng xử lý, giao diện','Quan hệ và trách nhiệm rõ'),('Cài đặt','Frontend, backend, migration','Kiểu dữ liệu và API thống nhất'),('Kiểm thử','Unit, integration, E2E','Luồng chính và lỗi'),('Triển khai','Build, cấu hình, dữ liệu mẫu','Chạy được trong môi trường đích')],[3.2,6.5,6.5])
    r.h2('2.2. Phân tích thiết kế hướng đối tượng và UML')
    r.body('Use case mô tả mục tiêu của tác nhân từ góc nhìn bên ngoài hệ thống; biểu đồ hoạt động diễn tả các bước và nhánh điều kiện; biểu đồ tuần tự cho thấy thứ tự tương tác giữa giao diện, API, dịch vụ và dữ liệu. ERD mô tả ràng buộc giữa các thực thể lưu trữ. Những biểu đồ này là các góc nhìn khác nhau của cùng quy trình, không thay thế cho việc kiểm tra mã nguồn.')
    r.h2('2.3. Kiến trúc client server và Web API')
    r.body('Frontend gửi yêu cầu HTTP đến backend, nhận dữ liệu JSON và hiển thị theo quyền. Express phân tuyến tài nguyên, middleware xác thực/ủy quyền, controller kiểm tra đầu vào và service xử lý nghiệp vụ. Mỗi thao tác có phản hồi lỗi rõ để giao diện không phải suy đoán trạng thái. Cách tổ chức route và middleware của Express được mô tả trong tài liệu chính thức [2].')
    r.h2('2.4. React Native, Expo và TypeScript')
    r.body('React Native cho phép xây giao diện bằng thành phần, trạng thái và luồng dữ liệu. Expo cung cấp bộ công cụ phát triển và xuất bản cho ứng dụng React Native; trong dự án, cùng mã nguồn frontend phục vụ giao diện web và các ngữ cảnh thiết bị. TypeScript giúp kiểm tra hợp đồng dữ liệu giữa thành phần và API ở giai đoạn biên dịch. Tài liệu chính thức về React Native và Expo SDK được dùng làm tham khảo [1], [3].')
    r.table('2','Công nghệ chính đang dùng',['Lớp','Công nghệ','Vai trò'],[
        ('Giao diện','React Native 0.81.5, Expo SDK 54, TypeScript','Màn hình theo vai trò, chạy web/mobile'),
        ('API','Node.js, Express 4, TypeScript','Route, middleware và nghiệp vụ'),
        ('Dữ liệu','Prisma Client 5, MySQL 8.4','Mô hình, truy vấn, migration'),
        ('Đồng bộ','Socket.IO 4','Sự kiện đơn, bàn, bếp'),
        ('Kiểm thử','Vitest, Jest, Supertest, Playwright','Tự động hóa nhiều cấp')],[2.2,5.5,8.5])
    r.h2('2.5. Cơ sở dữ liệu quan hệ và giao dịch')
    r.body('Dữ liệu nhà hàng có nhiều liên kết: đơn hàng chứa dòng món, bàn gắn nhiều đơn theo thời gian, nguyên liệu liên quan công thức và giao dịch kho. Khóa chính, khóa ngoại, chỉ mục và ràng buộc duy nhất giúp bảo vệ cấu trúc dữ liệu. Prisma schema là mô tả hiện hành của mô hình; migration ghi lại thay đổi lược đồ. Các thao tác gồm nhiều ghi cần dùng giao dịch để hoặc cùng hoàn tất hoặc cùng hủy [4], [5].')
    r.h2('2.6. Đồng bộ thời gian thực và FSM')
    r.body('Socket.IO phát sự kiện đến nhóm màn hình quan tâm, ví dụ bếp nhận đơn mới và POS nhận thay đổi trạng thái. Sự kiện chỉ mang vai trò thông báo; dữ liệu chuẩn vẫn được đọc lại qua API khi cần. Vòng đời đơn và vé bếp được xem như máy trạng thái hữu hạn: trạng thái kế tiếp hợp lệ được kiểm tra ở server, tránh việc giao diện chuyển trực tiếp từ “chờ” sang “hoàn tất”. Rooms của Socket.IO là khái niệm ở máy chủ dùng để phát sự kiện đến nhóm client [6].')
    r.h2('2.7. Xác thực, phân quyền và an toàn dữ liệu')
    r.body('Hệ thống dùng JWT cho phiên nhân viên và RBAC để giới hạn API theo vai trò. Kiểm tra quyền được đặt ở server, không chỉ ẩn nút trên giao diện. Mật khẩu được băm trước khi lưu; thao tác nhạy cảm như hủy đơn cần ghi lý do và audit. Phần đánh giá bảo mật tham khảo nguyên tắc xác thực và ủy quyền của OWASP [7], [8], đồng thời kiểm tra trực tiếp middleware trong repository.')
    r.h2('2.8. Kiểm thử nhiều cấp')
    r.body('Kiểm thử đơn vị kiểm tra hàm nghiệp vụ và mô hình giao diện; kiểm thử tích hợp kiểm tra route, middleware, dữ liệu và transaction; E2E mô phỏng chuỗi thao tác từ giao diện người dùng. Typecheck và lint phát hiện lỗi kiểu/cú pháp trước khi chạy. Từng loại kiểm thử có giới hạn: một bài test đơn vị xanh không chứng minh quy trình trên thiết bị thật đã được nghiệm thu.')

def usecase_specs(r: Report):
    r.h2('3.5. Đặc tả các ca sử dụng trọng yếu')
    r.body('Mỗi ca sử dụng dưới đây diễn tả hành vi có thể kiểm tra. Tên API và cấu trúc dữ liệu chi tiết được tra ở phụ lục; điều kiện ngoại lệ là tiêu chí bắt buộc khi nghiệm thu.')
    for i,(code,name,actor,pre,steps,exceptions,post) in enumerate(USECASES):
        r.item(f'{code}: {name}',break_before=i>0)
        r.table('3',f'Đặc tả {code} – {name}',['Thuộc tính','Nội dung'],[
            ('Tác nhân',actor),('Điều kiện trước',pre),
            ('Luồng chính','\n'.join(f'{j+1}. {s}' for j,s in enumerate(steps))),
            ('Ngoại lệ','\n'.join(f'{j+1}. {s}' for j,s in enumerate(exceptions))),
            ('Điều kiện sau',post),
            ('Truy vết',f'Các route và thực thể liên quan được liệt kê ở Phụ lục B và Phụ lục A.')],[3.1,13.1])

DETAIL_GROUPS = [
    ('Tài khoản, chi nhánh và hồ sơ', ['User','Branch','Department','JobTitle','Employee','EmployeeCompensation']),
    ('Ca làm việc', ['Employee','WorkShift','EmployeeScheduleRule','EmployeeScheduleException','EmployeeScheduleIdempotency']),
    ('Chấm công', ['Employee','AttendanceKioskSession','EmployeeAttendanceSession','EmployeeAttendanceDisposition','BranchAttendancePolicyVersion']),
    ('Bảng lương', ['Employee','EmployeePayrollBatch','EmployeePayrollLine','EmployeePayrollAdjustment','EmployeePayrollPayment']),
    ('Hoa hồng', ['CommissionPlan','CommissionPlanEmployee','CommissionRule','CommissionSaleBasis','CommissionEntry','CommissionPayrollAllocation']),
    ('Khách hàng và đặt bàn', ['Customer','Reservation','ReservationPolicy','ReservationDepositTransaction','ReservationChange','DiningTable']),
    ('Thực đơn và bảng giá', ['Category','MenuItem','ModifierGroup','ModifierOption','PriceList','PriceListItem']),
    ('Đơn hàng và thanh toán', ['DiningTable','Order','OrderItem','OrderPaymentTransaction','OrderReturn','OrderReturnLine']),
    ('Nguyên liệu và định lượng', ['Ingredient','MenuItemIngredient','InventoryTransaction','InventoryCheck','InventoryCheckLine','InventoryWaste']),
    ('Nhập hàng và công nợ', ['Supplier','PurchaseReceipt','PurchaseReceiptLine','SupplierPayment','PurchaseReturn','PurchaseReturnLine']),
    ('Sổ quỹ', ['FinancialAccount','CashVoucher','CashFlowCategory','FinancialParty','SupplierPayment']),
    ('Đối tác giao hàng', ['CustomerGroup','Customer','DeliveryPartner','DeliveryPartnerGroup','Order']),
    ('Chính sách nhân sự', ['Branch','BranchEmployeeSettingsRevision','BranchPayrollPolicyVersion','BranchWorkweekPolicyVersion','BranchHolidayPeriod']),
]

def detailed_erd(r:Report):
    byname={name:(fields,rules) for name,fields,rules in parse_schema()}
    r.h3('3.7.2. Các lược đồ quan hệ chi tiết theo miền')
    r.body('Các hình dưới đây mở rộng bốn ERD tổng quan thành nhóm thực thể nhỏ. Mỗi cạnh được suy ra từ khai báo @relation có fields và references trong Prisma schema. Hình chỉ hiện một số trường nhận diện và khóa ngoại để đọc được trên khổ A4; Phụ lục A là từ điển đầy đủ.')
    for i,(label,names) in enumerate(DETAIL_GROUPS,1):
        names=[x for x in names if x in byname]
        node_rows=[]; rel_rows=[]
        for name in names:
            fields,_=byname[name]
            chosen=[]
            for n,t,rule in fields:
                if '@id' in rule and n not in chosen:chosen.append(n)
            for n,t,rule in fields:
                if n.endswith('Id') and n not in chosen:chosen.append(n)
            for n,t,rule in fields:
                if t.rstrip('?[]') not in byname and n not in chosen and len(n)<22:chosen.append(n)
            shown=[('PK ' if any(x==n and '@id' in rr for x,tt,rr in fields) else 'FK ' if n.endswith('Id') else '')+n for n in chosen[:5]]
            node_rows.append((name,shown))
            for n,t,rule in fields:
                target=t.rstrip('?[]')
                if target in names and '@relation' in rule and 'fields:' in rule:
                    m=re.search(r'fields:\s*\[([^\]]+)\]',rule)
                    keys=m.group(1) if m else '—'
                    item=(name,target,keys)
                    if item not in rel_rows:rel_rows.append(item)
        r.item(f'Miền {i}: {label}')
        r.body(f'Nhóm {label.lower()} gồm {len(names)} model liên quan. Các bảng chính là '+', '.join(names)+'.')
        path=draw_erd(f'erd_detail_{i:02d}',f'ERD chi tiết {label}',node_rows,[(a,b) for a,b,k in rel_rows])
        r.figure('3',f'ERD chi tiết {label.lower()}',path)
        if rel_rows:r.table('3',f'Khóa liên kết trong miền {label.lower()}',['Model nguồn','Model đích','Trường FK'],rel_rows,[5.0,5.0,6.2],small=True)

def additional_activities(r:Report):
    r.h3('3.8.1. Các quy trình bổ trợ')
    r.body('Các biểu đồ hoạt động tiếp theo tóm tắt điểm kiểm soát trong đặt bàn, nhập kho, tính lương, sổ quỹ và hoàn trả. Mỗi bước được kiểm tra ở server và thay đổi dữ liệu liên quan cần hoàn tất trong cùng giao dịch khi nghiệp vụ yêu cầu.')
    flows=[
        ('Đặt bàn', ['Khách chọn ngày, giờ và số người','Kiểm tra thông tin liên hệ','Kiểm tra khả dụng của bàn','Tạo yêu cầu đặt chỗ','Nhân viên xác nhận hoặc từ chối','Ghi lịch sử thay đổi']),
        ('Nhập hàng', ['Chọn nhà cung cấp và chứng từ','Nhập dòng nguyên liệu','Kiểm tra số lượng và đơn giá','Lưu phiếu nhập','Ghi biến động kho và công nợ','Đối soát phiếu và tồn']),
        ('Tính lương', ['Chọn kỳ lương và nhân viên','Tổng hợp công và chính sách hiệu lực','Tính dòng lương và điều chỉnh','Rà soát ngoại lệ','Duyệt bảng lương','Ghi thanh toán và lưu snapshot']),
        ('Phiếu thu chi', ['Chọn tài khoản quỹ','Nhập loại phiếu, số tiền và đối tượng','Kiểm tra quyền và số dư','Ghi chứng từ và bút toán','Cập nhật số dư theo thứ tự thời gian','Lưu nhật ký đối soát']),
        ('Trả hàng bán', ['Chọn hóa đơn gốc','Chọn dòng món và số lượng trả','Kiểm tra số còn được trả','Tạo chứng từ hoàn trả','Cập nhật giao dịch tiền/kho liên quan','Đối soát hóa đơn và công nợ']),
    ]
    for i,(label,steps) in enumerate(flows,1):
        r.figure('3',f'Biểu đồ hoạt động {label.lower()}',draw_flow(f'activity_detail_{i:02d}',f'Quy trình {label.lower()}',steps))
        r.body(f'Luồng {label.lower()} cần kiểm tra cả nhánh lỗi: đầu vào thiếu, quyền không phù hợp, trạng thái chứng từ đã chốt hoặc một bước lưu thất bại. Kết quả cuối phải truy vết được về bản ghi nguồn.')

def chapter3(r: Report):
    r.title('CHƯƠNG 3: PHÂN TÍCH VÀ THIẾT KẾ HỆ THỐNG')
    r.h2('3.1. Khảo sát nghiệp vụ và tác nhân')
    r.body('Một ca bán hàng bắt đầu từ lựa chọn món, tạo đơn, chế biến và kết thúc ở thanh toán/đóng đơn. Những quy trình hỗ trợ gồm quản lý thực đơn, nguyên liệu, đặt bàn, nhân sự và đối soát. Hệ thống lưu một sự thật nghiệp vụ ở backend; màn hình của từng vai trò chỉ thể hiện phần dữ liệu và thao tác được phép.')
    r.table('3','Tác nhân và mục tiêu',['Tác nhân','Mục tiêu'],ACTORS,[3.0,13.2])
    r.h2('3.2. Yêu cầu chức năng')
    r.body('Bảng sau là danh mục chức năng đã có dấu vết ở mã nguồn hiện tại. Phân hệ báo cáo đang có API báo cáo ngày; workspace báo cáo nhiều loại trong tài liệu thiết kế chưa được mô tả là chức năng đã hoàn thành.')
    r.table('3','Danh mục yêu cầu chức năng',['Mã','Yêu cầu','Vai trò'],REQS,[1.2,9.4,5.6])
    r.h2('3.3. Yêu cầu phi chức năng')
    r.table('3','Yêu cầu phi chức năng và cách đánh giá',['Nhóm','Yêu cầu','Cách đánh giá'],[
        ('Bảo mật','Server kiểm tra JWT và vai trò; không lộ mật khẩu.','Test quyền và quan sát phản hồi lỗi.'),
        ('Tính nhất quán','Đơn, thanh toán, kho và sổ quỹ không ghi một phần.','Kiểm thử transaction, gửi lặp và rollback.'),
        ('Khả dụng','Màn hình chính dùng được ở mobile/tablet/desktop.','Kiểm tra viewport và thao tác chạm.'),
        ('Bảo trì','Tách route, controller, service, schema và giao diện.','Typecheck, lint và kiểm tra cấu trúc.'),
        ('Thời gian thực','Thông báo thay đổi đến màn hình liên quan.','Kịch bản hai thiết bị và tải lại REST.'),
        ('Truy vết','Ghi người, thời điểm, lý do ở thao tác nhạy cảm.','Đối chiếu nhật ký kiểm toán.')],[2.4,7.8,6.0])
    r.h2('3.4. Biểu đồ ca sử dụng')
    sales=draw_usecases('uc_sales','Use case bán hàng và khách','Khách / Thu ngân',[
        'Xem thực đơn','Gọi món bằng QR','Tạo đơn tại POS','Áp dụng voucher','Theo dõi đơn','Thanh toán','Chuyển bàn','Xem hóa đơn'])
    kitchen=draw_usecases('uc_kitchen','Use case bếp','Nhân viên bếp',[
        'Xem vé bếp','Nhận đơn mới','Bắt đầu chế biến','Đánh dấu sẵn sàng','Báo hết món','Ghi nhận hao hụt'])
    admin=draw_usecases('uc_admin','Use case quản trị vận hành','Quản trị',[
        'Quản lý menu','Quản lý bảng giá','Quản lý kho','Quản lý nhà cung cấp','Quản lý đặt bàn','Xem báo cáo ngày','Xem nhật ký','Quản lý sổ quỹ'])
    hr=draw_usecases('uc_hr','Use case nhân sự','Quản trị / Nhân viên',[
        'Quản lý hồ sơ','Phân ca','Chấm công','Duyệt công','Tính lương','Thanh toán lương','Quản lý hoa hồng'])
    for title,path in [('Use case bán hàng và khách',sales),('Use case bếp',kitchen),('Use case quản trị',admin),('Use case nhân sự',hr)]:r.figure('3',title,path)
    usecase_specs(r)
    r.h2('3.6. Thiết kế kiến trúc hệ thống')
    r.body('Frontend gọi REST API cho thao tác bền vững và đọc lại dữ liệu. Backend Express tổ chức các module nghiệp vụ, dùng Prisma để truy cập MySQL. Socket.IO phát tín hiệu khi đơn, bàn hoặc trạng thái bếp thay đổi. Tách API và sự kiện giúp màn hình khôi phục được trạng thái ngay cả khi mất kết nối thời gian thực tạm thời.')
    r.figure('3','Kiến trúc tổng thể hệ thống Crispy Bite',draw_architecture())
    r.table('3','Trách nhiệm các lớp kiến trúc',['Lớp','Trách nhiệm','Ví dụ trong mã nguồn'],[
        ('Giao diện','Thu thao tác, hiển thị dữ liệu và lỗi','frontend/src/features'),
        ('API/middleware','Xác thực, phân quyền, phân tuyến','backend/src/app.ts; modules/*.routes.ts'),
        ('Service','Quy tắc và giao dịch nghiệp vụ','backend/src/modules/*/*.service.ts'),
        ('Dữ liệu','Schema, migration, truy vấn','backend/prisma/schema.prisma'),
        ('Sự kiện','Thông báo đổi trạng thái','Socket.IO gateway')],[2.3,6.2,7.7])
    r.h2('3.7. Thiết kế dữ liệu quan hệ')
    r.body('Lược đồ hiện có 75 model. Để ERD còn đọc được trên khổ A4, đồ án chia thành các miền: đơn hàng, kho, nhân sự và tài chính. Các sơ đồ thể hiện khóa và quan hệ chính; Phụ lục A ghi toàn bộ trường và ràng buộc trích từ Prisma schema.')
    erds=[
        ('Quan hệ dữ liệu đơn hàng',draw_erd('erd_sales','ERD bán hàng',[
            ('User',['PK id','username','role']),('DiningTable',['PK id','tableNumber','status']),('Order',['PK id','FK tableId','FK userId','status','finalAmount']),('OrderItem',['PK id','FK orderId','FK menuItemId','quantity']),('MenuItem',['PK id','FK categoryId','name','basePrice']),('OrderPaymentTransaction',['PK id','FK orderId','amount','status'])],
            [('User','Order'),('DiningTable','Order'),('Order','OrderItem'),('MenuItem','OrderItem'),('Order','OrderPaymentTransaction')])) ,
        ('Quan hệ dữ liệu kho và mua hàng',draw_erd('erd_inventory','ERD kho và mua hàng',[
            ('Ingredient',['PK id','name','unit','currentStock']),('MenuItemIngredient',['PK id','FK ingredientId','FK menuItemId','quantityRequired']),('InventoryTransaction',['PK id','FK ingredientId','type','quantity']),('Supplier',['PK id','name','code']),('PurchaseReceipt',['PK id','FK supplierId','status']),('PurchaseReceiptLine',['PK id','FK purchaseReceiptId','FK ingredientId','quantity'])],
            [('Ingredient','MenuItemIngredient'),('Ingredient','InventoryTransaction'),('Supplier','PurchaseReceipt'),('PurchaseReceipt','PurchaseReceiptLine'),('Ingredient','PurchaseReceiptLine')])) ,
        ('Quan hệ dữ liệu nhân sự',draw_erd('erd_hr','ERD nhân sự',[
            ('Employee',['PK id','FK departmentId','FK jobTitleId','status']),('Department',['PK id','name']),('JobTitle',['PK id','name']),('WorkShift',['PK id','name','startMinute','endMinute']),('EmployeeAttendanceSession',['PK id','FK employeeId','checkInAt']),('EmployeePayrollLine',['PK id','FK employeeId','actualMinutes'])],
            [('Department','Employee'),('JobTitle','Employee'),('Employee','EmployeeAttendanceSession'),('Employee','EmployeePayrollLine')])) ,
        ('Quan hệ dữ liệu tài chính',draw_erd('erd_finance','ERD sổ quỹ',[
            ('FinancialAccount',['PK id','name','type','openingBalance']),('CashVoucher',['PK id','FK accountId','direction','amount','status']),('CashFlowCategory',['PK id','name','direction']),('Supplier',['PK id','name']),('PurchaseReceipt',['PK id','FK supplierId']),('SupplierPayment',['PK id','FK supplierId','FK financialAccountId','amount'])],
            [('FinancialAccount','CashVoucher'),('CashFlowCategory','CashVoucher'),('FinancialAccount','SupplierPayment'),('Supplier','SupplierPayment'),('PurchaseReceipt','SupplierPayment')]))
    ]
    for title,path in erds:r.figure('3',title,path)
    r.h3('3.7.1. Quy tắc toàn vẹn dữ liệu')
    r.body('Khóa chính định danh duy nhất mỗi bản ghi; khóa ngoại nối dữ liệu giữa các miền. Những quan hệ có nhiều dòng chi tiết như Order–OrderItem hay PurchaseReceipt–PurchaseReceiptLine phải ghi trong giao dịch khi thay đổi tổng số hoặc tồn kho. Các ràng buộc duy nhất và chỉ mục ở Prisma schema được thống kê theo từng model trong phụ lục.')
    detailed_erd(r)
    r.h2('3.8. Thiết kế luồng xử lý')
    r.figure('3','Biểu đồ tuần tự tạo đơn và chuyển bếp',draw_sequence('seq_order','Tạo đơn tại POS và chuyển bếp',['Thu ngân','Giao diện','API','MySQL','KDS'],[
        (0,1,'Chọn món và xác nhận'),(1,2,'POST tạo đơn'),(2,3,'Kiểm tra và lưu giao dịch'),(3,2,'Trả mã đơn'),(2,4,'Phát sự kiện đơn mới'),(4,2,'GET danh sách vé'),(2,1,'Trả kết quả'),(1,0,'Hiển thị hóa đơn')]))
    r.figure('3','Biểu đồ tuần tự thanh toán',draw_sequence('seq_payment','Thanh toán đơn hàng',['Thu ngân','POS','API','MySQL','Kho'],[
        (0,1,'Xác nhận phương thức'),(1,2,'POST thanh toán'),(2,3,'Khóa/kiểm tra đơn'),(2,3,'Ghi giao dịch'),(2,4,'Tính tiêu hao BOM'),(4,3,'Ghi biến động tồn'),(3,2,'Commit'),(2,1,'Kết quả'),(1,0,'Hiển thị hóa đơn')]))
    r.figure('3','Biểu đồ hoạt động vòng đời đơn',draw_flow('activity_order','Vòng đời đơn hàng',[
        'Khách hoặc thu ngân chọn món','Xác thực bàn, giá và tùy chọn','Tạo đơn PENDING','Bếp chuyển PREPARING','Bếp đánh dấu READY','Phục vụ, thanh toán hoặc hủy có lý do','Đóng đơn và đối soát']))
    additional_activities(r)
    r.h2('3.9. Thiết kế giao diện')
    r.body('Điều hướng thay đổi theo vai trò: thu ngân có POS, bàn, đặt bàn, đơn và sổ quỹ; bếp có KDS; quản trị có báo cáo, thực đơn, giá, kho, khách, nhân viên và nhật ký. Giao diện di động sử dụng điều hướng gọn, còn desktop có thanh điều hướng và vùng thao tác rộng. Các ảnh chụp thực tế cần bổ sung sau khi người thực hiện chạy bản build nghiệm thu.')
    r.table('3','Quy tắc thiết kế giao diện',['Màn hình','Dữ liệu chính','Tác vụ trọng tâm'],[
        ('POS','Món, giỏ, bàn, tổng tiền','Tạo đơn và thanh toán'),('KDS','Vé bếp, thời gian chờ, trạng thái','Đổi trạng thái chế biến'),('Bàn','Sơ đồ và tình trạng bàn','Chọn/chuyển bàn'),('Kho','Nguyên liệu, tồn, cảnh báo','Nhập và kiểm kê'),('Nhân sự','Hồ sơ, ca, công, lương','Quản trị vòng đời nhân viên'),('Báo cáo','KPI theo ngày','Theo dõi vận hành')],[2.4,6.4,7.4])

def chapter4(r: Report):
    r.title('CHƯƠNG 4: TRIỂN KHAI VÀ KIỂM THỬ HỆ THỐNG')
    r.h2('4.1. Môi trường và cấu trúc mã nguồn')
    r.body('Repository được tổ chức theo npm workspaces gồm backend, frontend, thư mục tài liệu, bộ kiểm thử E2E và script hỗ trợ. README khóa môi trường phát triển Node.js 24.19.0, npm 11.17.0 và MySQL 8.4. Tên biến cấu hình được đặt trong .env.example; thông tin nhạy cảm không được ghi vào báo cáo.')
    r.table('4','Cấu trúc dự án',['Đường dẫn','Nội dung'],[
        ('backend/src/modules','API theo miền nghiệp vụ'),('backend/prisma','schema, migration, seed'),('frontend/src/features','màn hình theo chức năng'),('frontend/src/navigation','điều hướng theo vai trò'),('e2e','kịch bản Playwright'),('docs','đặc tả và thiết kế nội bộ')],[5.3,10.9])
    r.h2('4.2. Triển khai phân hệ người dùng')
    for title,paras,screenshot in [
        ('4.2.1. Đăng nhập và điều hướng','RootNavigator lựa chọn màn hình đăng nhập, đặt bàn công khai, gọi món QR hoặc kiosk chấm công theo ngữ cảnh URL. Sau khi đăng nhập, RoleTabs giới hạn tập tab theo vai trò. Backend xác thực lại quyền qua middleware của từng route.','Màn hình đăng nhập và tab theo ba vai trò'),
        ('4.2.2. POS và giỏ hàng','POSScreen trình bày danh mục món, bộ lọc, lựa chọn biến thể, giỏ hàng và bước tạo đơn. Dữ liệu hiển thị chỉ hỗ trợ chọn món; server phải kiểm tra lại giá và điều kiện trước khi ghi. Việc tạo đơn sử dụng khóa chống thao tác lặp khi mạng chập chờn.','POS với giỏ hàng và bước xác nhận tạo đơn'),
        ('4.2.3. Màn hình bếp KDS','KDSScreen nhận danh sách đơn đang chờ và cho phép bếp cập nhật theo luồng trạng thái. Sự kiện Socket.IO giúp hiển thị thay đổi kịp thời; tải lại qua API là cơ chế khôi phục khi phiên kết nối thay đổi.','KDS có vé ở trạng thái chờ, chế biến, sẵn sàng'),
        ('4.2.4. Khách hàng gọi món tại bàn','TableOrderScreen nhận số bàn hoặc token từ liên kết QR, tải thực đơn và cho khách thêm món. API phải gắn đơn với bàn hợp lệ và kiểm tra token. Màn hình theo dõi trạng thái giúp khách biết tiến độ mà không cần tài khoản nhân viên.','Trang QR của khách, giỏ hàng và theo dõi đơn'),
        ('4.2.5. Bàn ăn và đặt bàn','TableScreen và các màn hình đặt bàn thể hiện trạng thái sử dụng, lựa chọn bàn và đặt chỗ. Dịch vụ backend kiểm tra xung đột, lịch sử thay đổi và liên kết đơn với bàn.','Sơ đồ bàn và danh sách đặt bàn'),
    ]:
        r.h3(title);r.body(paras);r.figure('4',screenshot,note=screenshot+'; chụp bản build ngày nghiệm thu, che dữ liệu cá nhân')
    r.h2('4.3. Triển khai phân hệ quản trị')
    for title,body,screenshot in [
        ('4.3.1. Thực đơn, bảng giá và voucher','Quản trị tạo/sửa món, danh mục, tùy chọn và bảng giá. Mã ưu đãi được kiểm tra thời gian, điều kiện đơn và số lượt dùng ở backend. Màn hình quản trị cho phép tra cứu nhanh danh sách và kiểm soát trạng thái bán.','Quản lý thực đơn, bảng giá và voucher'),
        ('4.3.2. Kho, BOM và chuỗi cung ứng','Ingredient, MenuItemIngredient và InventoryTransaction tách danh mục, công thức và lịch sử biến động. Những phiếu nhập, kiểm kê, xuất hủy và trả hàng có model và service riêng. Giá vốn và tồn kho phải được đối soát theo giao dịch, tránh sửa số tồn trực tiếp thiếu dấu vết.','Màn hình kho, định lượng và phiếu nhập'),
        ('4.3.3. Khách hàng và đối tác giao hàng','Hồ sơ khách, nhóm khách, đặt bàn và đối tác giao hàng dùng các model riêng. Nhân viên được giới hạn thao tác trong phạm vi công việc; quản trị có danh sách và bộ lọc để tra cứu.','Màn hình khách hàng và đối tác'),
        ('4.3.4. Nhân sự, lịch ca, công và lương','Hồ sơ nhân viên liên kết bộ phận, chức danh, lịch ca, phiên công và bảng lương. Chính sách lương, chấm công có phiên bản để kết quả đã chốt không phụ thuộc cấu hình mới. Kiosk có luồng truy cập riêng với giới hạn và chống gửi lặp.','Workspace nhân sự, lịch ca, chấm công và lương'),
        ('4.3.5. Sổ quỹ và phiếu thu chi','FinancialAccount, CashVoucher và các bảng nguồn ghi nhận biến động tiền theo tài khoản và loại chứng từ. Quy tắc ghi sổ, đảo giao dịch và chống trùng phải được kiểm tra khi thanh toán đơn, nhà cung cấp hoặc lương.','Sổ quỹ, phiếu thu, phiếu chi'),
        ('4.3.6. Báo cáo ngày và nhật ký','API hiện hành GET /api/reports/daily chỉ dành cho ADMIN. DashboardScreen hiển thị chỉ số tổng hợp theo ngày và món bán chạy. Các báo cáo mở rộng trong tài liệu thiết kế là hướng phát triển, không được xem là kết quả đã nghiệm thu ở bản mã nguồn này.','Dashboard báo cáo ngày và nhật ký kiểm toán'),
    ]:
        r.h3(title);r.body(body);r.figure('4',screenshot,note=screenshot+'; đối chiếu nội dung với dữ liệu thử nghiệm')
    r.h2('4.4. Cài đặt API và xử lý dữ liệu')
    r.body('Backend khai báo route theo module trong app.ts. Mỗi route áp dụng middleware xác thực và phân quyền khi cần, sau đó chuyển đến controller/service. Zod được dùng để kiểm tra dữ liệu đầu vào ở các luồng có schema. Prisma Client ánh xạ model và migration với MySQL. Phụ lục B liệt kê route được trích trực tiếp từ tệp *.routes.ts; đường dẫn module trong bảng cần ghép với tiền tố mount ở app.ts khi gọi thực tế.')
    r.table('4','Ví dụ hợp đồng API',['Chức năng','Method và path','Quyền'],[
        ('Báo cáo ngày','GET /api/reports/daily','ADMIN'),('Đăng nhập','POST /api/auth/login','Công khai'),('Danh sách món','GET /api/menu/...','Theo route'),('Tạo đơn','POST /api/orders/...','Theo route'),('Sổ quỹ','/api/cashbook/...','Theo route')],[4.3,7.6,4.3])
    r.h2('4.5. Kiểm thử')
    r.h3('4.5.1. Chiến lược kiểm thử')
    r.body('Các bài kiểm tra được chia theo phạm vi: TypeScript typecheck, kiểm thử frontend không cần DB, kiểm thử backend với DB test cô lập và E2E trên bản build. Khi kiểm thử có thể thay đổi dữ liệu, phải xác nhận kết nối trỏ đúng cơ sở dữ liệu thử nghiệm, tránh dùng DB phát triển hoặc sản xuất. Phụ lục C ghi đầy đủ ca và đầu ra mong đợi.')
    r.table('4','Các lệnh kiểm chứng',['Lệnh','Mục đích','Điều kiện an toàn'],[
        ('npm run typecheck','Kiểm tra kiểu backend và frontend','Không ghi DB'),('npm run test:frontend','Kiểm thử UI/view model','Không ghi DB'),('npm run test:backend','Kiểm thử API và service','Chỉ chạy với DB test cô lập'),('npm run test:e2e','Luồng người dùng','Bản build và DB test riêng'),('npm run build','Đóng gói ứng dụng','Cấu hình môi trường phù hợp')],[4.5,5.8,5.9])
    r.h3('4.5.2. Kết quả và bằng chứng')
    r.body('Ngày 03/10/2026, lệnh kiểm tra kiểu hoàn tất với mã thoát 0. Bộ kiểm thử frontend chạy 289 ca: 287 đạt, 2 thất bại ở màn hình bảng lương và lịch ca do lời gọi API phân trang/trạng thái khác kỳ vọng của test. Báo cáo ghi nguyên tình trạng này; các kịch bản cần MySQL test và thiết bị vẫn phải có log/ảnh riêng trước khi khẳng định đạt.')
    r.table('4','Tình trạng kiểm chứng tại thời điểm lập báo cáo',['Hạng mục','Kết quả','Nguồn bằng chứng'],[
        ('Kiểm tra kiểu TypeScript','Đạt; exit code 0','npm run typecheck, 03/10/2026'),
        ('Frontend unit tests','287/289 đạt; 2 thất bại','npm run test:frontend, 03/10/2026'),
        ('Backend integration','Chưa chạy trong tác vụ lập báo cáo','Cần DB test cô lập'),
        ('E2E và thiết bị','Chưa nghiệm thu trong tác vụ lập báo cáo','Cần ảnh/video và log Playwright')],[4.5,5.1,6.6])
    r.body('Hai ca thất bại là EmployeePayrollScreen.test.tsx (lọc/phân trang bảng lương) và employeeScheduleScreen.test.tsx (phân trang nhân viên trong lịch ca). Cần sửa hoặc cập nhật kỳ vọng test theo hợp đồng hiện hành, sau đó chạy lại trước khi nộp bản nghiệm thu cuối.')
    r.h2('4.6. Đóng gói và triển khai')
    r.body('README mô tả việc cấu hình MySQL và biến môi trường, cài đặt dependency, khởi động backend/frontend, sau đó build web để server phục vụ tệp tĩnh khi có thư mục dist. Quy trình triển khai cần tạo schema bằng migration đã được rà soát, nạp dữ liệu mẫu chỉ ở môi trường thử nghiệm, cấu hình khóa JWT và thông tin DB ngoài mã nguồn, kiểm tra /health và xác nhận các vai trò thao tác được.')
    r.figure('4','Sơ đồ triển khai môi trường ứng dụng',draw_flow('deployment','Các bước triển khai',[
        'Cấu hình Node.js, npm và MySQL','Cấp biến môi trường, khóa bí mật','Chạy migration đã kiểm chứng','Build backend và Expo web','Khởi động API, phục vụ frontend','Kiểm tra /health, đăng nhập, POS và KDS']))
    r.h2('4.7. Giới hạn kỹ thuật đã nhận diện')
    r.body('Báo cáo ngày hiện là điểm bắt đầu của phân hệ phân tích; báo cáo nhiều trang cần triển khai riêng. Nghiệm thu thực địa còn phụ thuộc mạng, thiết bị, thanh toán và dữ liệu thật.')

def conclusion_and_refs(r:Report):
    r.title('KẾT LUẬN')
    r.h2('Kết quả đạt được')
    r.body('Đồ án đã xây dựng một nền tảng quản trị nhà hàng phục vụ nhanh gồm các luồng bán hàng, điều phối bếp, gọi món tại bàn, quản lý dữ liệu vận hành và báo cáo ngày. Kiến trúc tách frontend, API, service và CSDL giúp mỗi phần có trách nhiệm rõ; schema và route hiện hành cung cấp bằng chứng cho chức năng đã trình bày. Báo cáo đã đặc tả 20 ca sử dụng trọng yếu và hệ thống hóa lược đồ, API, kịch bản kiểm thử để hỗ trợ việc đối chiếu.')
    r.h2('Hạn chế')
    r.body('Các sơ đồ trong báo cáo là bản diễn giải có chọn lọc từ mã nguồn, cần được rà soát với giảng viên và bản triển khai cuối. Ảnh giao diện thực tế, biên bản nghiệm thu thiết bị và kết quả kiểm thử dùng CSDL riêng chưa thể thay bằng ảnh minh họa. Dashboard hiện chỉ có báo cáo ngày; các báo cáo chuyên sâu cần một giai đoạn phát triển và đánh giá riêng.')
    r.h2('Hướng phát triển')
    r.body('Hướng tiếp theo là hoàn thiện bộ báo cáo vận hành theo loại dữ liệu, tăng mức kiểm thử E2E trên thiết bị, xây quy trình triển khai có giám sát/sao lưu và đối soát dữ liệu tài chính với chứng từ thật. Khi bổ sung ảnh chụp, người thực hiện cần cập nhật chú thích, mục lục hình và các số trang trong Word.')
    r.title('TÀI LIỆU THAM KHẢO')
    refs=[
        '[1] React Native, “Introduction”, https://reactnative.dev/docs/getting-started (truy cập 03/10/2026).',
        '[2] Express.js, “Routing”, https://expressjs.com/en/guide/routing/ (truy cập 03/10/2026).',
        '[3] Expo, “Expo SDK 54 reference”, https://docs.expo.dev/versions/v54.0.0/ (truy cập 03/10/2026).',
        '[4] Prisma, “Prisma ORM v6 – Transactions and batch queries”, https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions (truy cập 03/10/2026). Khái niệm giao dịch áp dụng cho dự án dùng Prisma 5.',
        '[5] Oracle, “MySQL 8.4 Reference Manual – START TRANSACTION, COMMIT, ROLLBACK”, https://dev.mysql.com/doc/refman/8.4/en/commit.html (truy cập 03/10/2026).',
        '[6] Socket.IO, “Rooms”, https://socket.io/docs/v4/rooms/ (truy cập 03/10/2026).',
        '[7] OWASP, “Authentication Cheat Sheet”, https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html (truy cập 03/10/2026).',
        '[8] OWASP, “Authorization Cheat Sheet”, https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html (truy cập 03/10/2026).',
        '[9] Nhóm phát triển Crispy Bite, README.md, package.json, backend/prisma/schema.prisma, backend/src và frontend/src trong repository dự án; đối chiếu ngày 03/10/2026.',
    ]
    for x in refs:r.body(x)

def appendix_dictionary(r:Report):
    r.title('PHỤ LỤC A: TỪ ĐIỂN DỮ LIỆU')
    r.body('Phụ lục này sinh từ backend/prisma/schema.prisma tại thời điểm lập báo cáo. Kiểu có dấu ? là có thể rỗng, [] là quan hệ nhiều bản ghi. Cột ràng buộc ghi nguyên dạng Prisma để dễ đối chiếu; danh sách @@ cuối mỗi model thể hiện chỉ mục và quy tắc ở mức bảng.')
    models=parse_schema(); groups={}
    for label,names in MODEL_GROUPS:
        for name in names:groups[name]=label
    ordered=sorted(models,key=lambda x:(next((i for i,(l,n) in enumerate(MODEL_GROUPS) if x[0] in n),99),x[0]))
    last_group=None
    previous_field_count=0
    for idx,(name,fields,rules) in enumerate(ordered,1):
        group=groups.get(name,'Khác')
        if group!=last_group:
            r.item(group.upper(),break_before=True)
            last_group=group
            r.item(f'A.{idx:02d}. Model {name}')
        else:r.item(f'A.{idx:02d}. Model {name}',break_before=previous_field_count<18)
        fk=[n for n,typ,rule in fields if n.endswith('Id') and not typ.endswith('[]')]
        r.note(f'Miền: {group}. Số trường/quan hệ: {len(fields)}. Trường liên kết nổi bật: {", ".join(fk[:7]) if fk else "không có khóa ngoại đặt tên theo quy ước"}.')
        rows=[(n,t,meaning(n,t),rule or '—') for n,t,rule in fields]
        r.table('A',f'Cấu trúc model {name}',['Trường','Kiểu','Ý nghĩa','Ràng buộc / mặc định'],rows,[3.2,3.2,4.2,5.6],small=True)
        if rules:r.note('Quy tắc mức model: '+'; '.join(rules))
        previous_field_count=len(fields)

def appendix_routes(r:Report):
    r.title('PHỤ LỤC B: DANH MỤC API')
    r.body('Danh mục này được trích máy từ các lời gọi get/post/put/patch/delete trong backend/src/modules/**/*.routes.ts. Path trong từng tệp là đường dẫn tương đối; tiền tố mount của module được khai báo trong backend/src/app.ts. Danh mục phục vụ tra cứu cấu trúc, không thay cho hợp đồng request/response và kiểm thử quyền.')
    routegroups=parse_routes()
    r.table('B','Số khai báo route theo module',['Module','Số route'],[(module,len(routes)) for module,routes in routegroups],[10.0,6.2])
    for module,items in routegroups:
        if not items:continue
        r.item(f'Module {module}')
        r.body(f'Tệp route của miền {module} khai báo {len(items)} method/path. Cần kiểm tra middleware của route khi sử dụng một API trong môi trường thật.')
        rows=[(f'{i:02d}',method,path) for i,(method,path) in enumerate(items,1)]
        r.table('B',f'Các API của module {module}',['STT','Method','Path tương đối'],rows,[1.3,2.1,12.8],small=True)

def appendix_tests(r:Report):
    r.title('PHỤ LỤC C: KỊCH BẢN KIỂM THỬ VÀ NGHIỆM THU')
    r.body('Các kịch bản là bộ tiêu chí cần thực thi trước nghiệm thu. Cột kết quả mong đợi được thiết kế từ quy tắc nghiệp vụ; chưa được hiểu là tất cả kịch bản đã chạy. Cần ghi ngày chạy, phiên bản mã nguồn, dữ liệu test, log và ảnh vào phiếu nghiệm thu sau khi thực hiện.')
    r.table('C','Ma trận kịch bản kiểm thử',['Mã','Tình huống','Đầu ra mong đợi'],[(a,b,d) for a,b,c,d in TESTS],[1.2,6.1,8.9],small=True)
    for i,(code,title,action,expected) in enumerate(TESTS):
        r.item(f'{code}: {title}',break_before=i>0 and i%2==0)
        r.table('C',f'Phiếu kiểm thử {code}',['Trường','Nội dung'],[
            ('Mục tiêu',title),('Điều kiện chuẩn bị','Chạy trên dữ liệu thử nghiệm độc lập; xác nhận quyền phù hợp.'),
            ('Thao tác',action),('Kết quả mong đợi',expected),('Kết quả thực tế','[CẦN GHI KHI NGHIỆM THU]'),
            ('Bằng chứng','[CẦN ĐÍNH KÈM LOG/ẢNH CHỤP NẾU ÁP DỤNG]')],[3.2,13.0],small=True)

def appendix_figures(r:Report):
    r.title('PHỤ LỤC D: DANH SÁCH ẢNH CẦN BỔ SUNG')
    r.body('Các vị trí đã được ghi trực tiếp ở Chương 4. Khi chụp ảnh, dùng dữ liệu thử nghiệm, che tên/số điện thoại cá nhân và chụp cả trạng thái thành công lẫn lỗi có ý nghĩa. Sau khi thay hình, chọn toàn bộ tài liệu và cập nhật trường để mục lục hình, mục lục chung và số trang chính xác.')
    tasks=[
        ('Đăng nhập','Ba vai trò với điều hướng khác nhau'),('POS','Giỏ hàng, modifier, xác nhận đơn'),('KDS','Ba trạng thái vé và bộ đếm thời gian'),('QR bàn','Trang menu khách và lịch sử đơn'),('Bàn','Sơ đồ bàn và chuyển bàn'),('Đặt bàn','Danh sách và chi tiết đặt bàn'),('Thực đơn','Danh mục, món, bảng giá, ưu đãi'),('Kho','Danh mục nguyên liệu, BOM, phiếu nhập, kiểm kê'),('Khách hàng','Danh sách và chi tiết'),('Nhân sự','Hồ sơ, ca, công, lương, hoa hồng'),('Sổ quỹ','Tài khoản, phiếu thu, phiếu chi'),('Báo cáo','Dashboard và nhật ký')
    ]
    r.table('D','Checklist ảnh chụp nghiệm thu',['STT','Màn hình','Nội dung cần thấy','Trạng thái'],[(i,a,b,'Chưa chèn') for i,(a,b) in enumerate(tasks,1)],[1.0,3.0,9.4,2.8])

def fill_report(r:Report):
    main_front(r)
    chapter1(r);chapter2(r);chapter3(r);chapter4(r)
    conclusion_and_refs(r)
    appendix_dictionary(r);appendix_routes(r);appendix_tests(r);appendix_figures(r)
