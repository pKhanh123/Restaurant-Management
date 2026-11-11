# Ghi nhận cho kế hoạch giao diện

- Frontend dùng Expo, React Native và React Native Web. Theme và component dùng chung nằm ở `frontend/src/theme` và `frontend/src/ui`.
- `RoleTabs.tsx` phân nhánh thu ngân, bếp và quản trị, có ngưỡng bố cục 768 và 1200 px. `LoginScreen.tsx` đổi bố cục ở 900 px. `RootNavigator.tsx` có các luồng công khai cho đặt bàn, gọi món và kiosk.
- POS, KDS và các màn báo cáo có mật độ thông tin khác nhau. Cần duyệt một màn dày thông tin cùng màn đăng nhập trước khi áp dụng quy tắc thị giác toàn dự án.
- Kiểm tra trước đó cho thấy bản Expo web build thành công. Taste checker giả định container `.wrap`, trả kết quả thiếu phần sections rồi lỗi khi xuất báo cáo. Chưa có kết quả xác minh bố cục ở bốn kích thước. Dùng kiểm tra trực tiếp trên trình duyệt ở UI-00.
