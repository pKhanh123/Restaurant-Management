import {
  DiscountType,
  InventoryCheckStatus,
  InventoryWasteStatus,
  MenuItemType,
  MenuType,
  OrderReturnStatus,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PriceListScopeType,
  PriceListType,
  PrismaClient,
  PurchaseReceiptStatus,
  PurchaseReturnStatus,
  Role,
  TableStatus,
  DeliveryPartnerType
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { CashbookPostingService } from '../src/modules/cashbook/cashbook-posting.service';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const defaultPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

function formatMenuSku(sequence: number) {
  return `SP${sequence.toString().padStart(6, '0')}`;
}

export async function seedDatabase(prisma: PrismaClient = defaultPrisma) {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  console.log(`🌱 Bắt đầu seed dữ liệu mẫu cho CRISPY BITE (TestEnv: ${isTestEnv})...`);

  // Pre-calculate bcrypt hashes ONCE for ultra-fast performance
  const salt = await bcrypt.genSalt(10);
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const cashierPassword = process.env.SEED_CASHIER_PASSWORD || 'cashier123';
  const kitchenPassword = process.env.SEED_KITCHEN_PASSWORD || 'kitchen123';

  const adminHash = await bcrypt.hash(adminPassword, salt);
  const cashierHash = await bcrypt.hash(cashierPassword, salt);
  const kitchenHash = await bcrypt.hash(kitchenPassword, salt);
  const commonHash = await bcrypt.hash('role123', salt);

  // =========================================================================
  // 1. SEED 20 TÀI KHOẢN NGƯỜI DÙNG (USERS)
  // =========================================================================
  const userData = [
    { username: 'admin', name: 'Quản Lý Nhà Hàng (Admin)', role: Role.ADMIN, pass: adminHash },
    { username: 'cashier', name: 'Thu Ngân Quầy (Cashier)', role: Role.CASHIER, pass: cashierHash },
    { username: 'kitchen', name: 'Bếp Trưởng (Kitchen)', role: Role.KITCHEN, pass: kitchenHash },
    { username: 'manager_01', name: 'Nguyễn Văn Quản Lý', role: Role.ADMIN, pass: commonHash },
    { username: 'manager_02', name: 'Trần Thị Giám Sát', role: Role.ADMIN, pass: commonHash },
    { username: 'cashier_01', name: 'Lê Thu Ngân (Ca Sáng)', role: Role.CASHIER, pass: commonHash },
    { username: 'cashier_02', name: 'Phạm Thu Ngân (Ca Chiều)', role: Role.CASHIER, pass: commonHash },
    { username: 'cashier_03', name: 'Hoàng Thu Ngân (Ca Tối)', role: Role.CASHIER, pass: commonHash },
    { username: 'cashier_04', name: 'Đặng Thị Mai', role: Role.CASHIER, pass: commonHash },
    { username: 'cashier_05', name: 'Vũ Văn Tuấn', role: Role.CASHIER, pass: commonHash },
    { username: 'cashier_06', name: 'Nông Thị Hoa', role: Role.CASHIER, pass: commonHash },
    { username: 'cashier_07', name: 'Bùi Văn Hùng', role: Role.CASHIER, pass: commonHash },
    { username: 'cashier_08', name: 'Đỗ Thị Linh', role: Role.CASHIER, pass: commonHash },
    { username: 'cashier_09', name: 'Hồ Văn Nam', role: Role.CASHIER, pass: commonHash },
    { username: 'cashier_10', name: 'Ngô Thị Kim', role: Role.CASHIER, pass: commonHash },
    { username: 'kitchen_01', name: 'Nguyễn Bếp Chính', role: Role.KITCHEN, pass: commonHash },
    { username: 'kitchen_02', name: 'Trần Phụ Bếp 1', role: Role.KITCHEN, pass: commonHash },
    { username: 'kitchen_03', name: 'Lê Phụ Bếp 2', role: Role.KITCHEN, pass: commonHash },
    { username: 'kitchen_04', name: 'Phạm Sơ Chế', role: Role.KITCHEN, pass: commonHash },
    { username: 'kitchen_05', name: 'Hoàng Đóng Gói', role: Role.KITCHEN, pass: commonHash }
  ];

  const createdUsers: Record<string, number> = {};
  for (const u of userData) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name, role: u.role, passwordHash: u.pass },
      create: { username: u.username, name: u.name, role: u.role, passwordHash: u.pass }
    });
    createdUsers[u.username] = user.id;
  }
  console.log(`✅ Da seed ${userData.length} User (Admin, Cashier, Kitchen, Manager)`);

  await prisma.reservationPolicy.upsert({
    where: { name: 'Chính sách đặt cọc mặc định' },
    update: {
      depositAmount: 300000,
      freeCancelBeforeMinutes: 120,
      lateCancelRefundPercent: 0,
      noShowRefundPercent: 0,
      gracePeriodMinutes: 30,
      isActive: true
    },
    create: {
      name: 'Chính sách đặt cọc mặc định',
      depositAmount: 300000,
      freeCancelBeforeMinutes: 120,
      lateCancelRefundPercent: 0,
      noShowRefundPercent: 0,
      gracePeriodMinutes: 30,
      isActive: true
    }
  });

  // =========================================================================
  // 2. SEED 20 KHU VỰC BÀN (TABLE AREAS) & 24 BÀN ĂN (DINING TABLES)
  // =========================================================================
  const areaNames = [
    'Khu Tầng 1 - Sảnh Chính',
    'Khu Tầng 2 - Máy Lạnh',
    'Khu Ngoài Trời - Sân Vườn',
    'Khu VIP 101 - Sang Trọng',
    'Khu VIP 102 - Gia Đình',
    'Khu VIP 103 - Hội Nghị',
    'Khu Ban Công - View Phố',
    'Khu Sân Thượng - Skyview',
    'Khu Sảnh Chờ - Takeaway',
    'Khu Phòng Tiệc A',
    'Khu Phòng Tiệc B',
    'Khu Trẻ Em - Playzone',
    'Khu Quầy Bar Trung Tâm',
    'Khu Tầng Trệt - Quầy Order',
    'Khu Hành Lang T1',
    'Khu Hành Lang T2',
    'Khu Sân Sau Outdoor',
    'Khu VIP Executive 1',
    'Khu VIP Executive 2',
    'Khu Event Hall'
  ];

  const createdAreas: number[] = [];
  for (let i = 0; i < areaNames.length; i++) {
    const area = await prisma.tableArea.upsert({
      where: { name: areaNames[i] },
      update: { displayOrder: i + 1, isActive: true },
      create: { name: areaNames[i], displayOrder: i + 1, isActive: true }
    });
    createdAreas.push(area.id);
  }

  const createdTables: number[] = [];
  for (let i = 1; i <= 24; i++) {
    const areaId = createdAreas[(i - 1) % createdAreas.length];
    const cap = i <= 6 ? 2 : i <= 18 ? 4 : 8;
    const token = `qr_table_token_crispy_${i.toString().padStart(3, '0')}`;

    const dt = await prisma.diningTable.upsert({
      where: { tableNumber: i },
      update: {
        displayName: `Bàn ${i.toString().padStart(2, '0')}`,
        areaId,
        capacity: cap,
        status: TableStatus.AVAILABLE,
        isActive: true
      },
      create: {
        tableNumber: i,
        displayName: `Bàn ${i.toString().padStart(2, '0')}`,
        areaId,
        qrCodeToken: token,
        capacity: cap,
        status: TableStatus.AVAILABLE,
        isActive: true
      }
    });
    createdTables.push(dt.id);
  }
  console.log(`✅ Da seed ${createdAreas.length} TableArea & ${createdTables.length} DiningTable`);

  // =========================================================================
  // 3. SEED 6 DANH MỤC & 25 MÓN ĂN (MENU ITEMS) + MODIFIERS
  // =========================================================================
  const categoriesDefinition = [
    {
      name: 'Combo Tiết Kiệm',
      displayOrder: 1,
      items: [
        { name: 'Combo 1 Người: Gà Giòn + Khoai + Nước', price: 69000, desc: '1 gà rán + 1 khoai vừa + 1 Pepsi' },
        { name: 'Combo 2 Người: Siêu No Đậm Vị', price: 159000, desc: '3 gà rán + 1 Burger Bò + 2 Pepsi' },
        { name: 'Combo Gia Đình Vui Vẻ', price: 289000, desc: '6 gà rán + 1 Gà Popcorn + 1 Khoai lớn + 4 Pepsi' },
        { name: 'Combo Sinh Viên Giá Rẻ', price: 49000, desc: '1 Burger Gà + 1 Pepsi mát lạnh' }
      ]
    },
    {
      name: 'Gà Rán Giòn Rụm',
      displayOrder: 2,
      items: [
        { name: 'Gà Rán Giòn Cay (1 Miếng)', price: 35000, desc: 'Gà tẩm bột chiên giòn chuẩn vị Crispy' },
        { name: 'Gà Rán Giòn Cay (2 Miếng)', price: 68000, desc: '2 miếng gà giòn rụm vàng ươm' },
        { name: 'Gà Rán Giòn Cay (3 Miếng)', price: 99000, desc: '3 miếng gà giòn ăn thỏa thích' },
        { name: 'Gà Rán Sốt Phô Mai Cay (2 Miếng)', price: 79000, desc: 'Gà rán ngập sốt phô mai cay béo ngậy' },
        { name: 'Gà Popcorn Lắc Phô Mai', price: 45000, desc: 'Thịt gà viên rút xương giòn lắc phô mai' },
        { name: 'Cánh Gà Sốt Bơ Tỏi Hàn Quốc (4 Cánh)', price: 85000, desc: 'Cánh gà giòn sốt bơ tỏi thơm nức' }
      ]
    },
    {
      name: 'Burger & Cơm',
      displayOrder: 3,
      items: [
        { name: 'Burger Bò Nướng Phô Mai', price: 55000, desc: 'Bò nướng lửa hồng kèm phô mai Cheddar' },
        { name: 'Burger Gà Giòn Cay Đặc Biệt', price: 49000, desc: 'Đùi gà phi lê chiên xù sốt mayo' },
        { name: 'Burger Tôm Hoàng Gia', price: 59000, desc: 'Chả tôm giòn ngọt kèm sốt Tartar' },
        { name: 'Cơm Gà Rán Sốt Tiêu Đen', price: 49000, desc: 'Cơm dẻo ăn kèm gà rán sốt tiêu đậm vị' },
        { name: 'Cơm Gà Giòn Sốt Teriyaki', price: 49000, desc: 'Cơm dẻo ăn kèm gà giòn sốt Teriyaki Nhật' }
      ]
    },
    {
      name: 'Món Ăn Kèm & Snack',
      displayOrder: 4,
      items: [
        { name: 'Khoai Tây Chiên Giòn (Vừa)', price: 25000, desc: 'Khoai tây thanh vàng giòn' },
        { name: 'Khoai Tây Chiên Giòn (Lớn)', price: 35000, desc: 'Khoai tây phần lớn chia sẻ' },
        { name: 'Phô Mai Que Mozzarella (3 Cây)', price: 39000, desc: 'Phô mai kéo sợi béo ngậy' },
        { name: 'Bắp Cải Trộn Coleslaw', price: 19000, desc: 'Rau bắp cải trộn sốt kem chua' },
        { name: 'Mực Vòng Chiên Giòn Calamari', price: 49000, desc: 'Khoanh mực tẩm bột chiên vàng' }
      ]
    },
    {
      name: 'Đồ Uống & Tráng Miệng',
      displayOrder: 5,
      items: [
        { name: 'Pepsi Tươi Mát Lạnh', price: 18000, desc: 'Nước ngọt Pepsi tươi' },
        { name: '7Up Vị Chanh Tươi', price: 18000, desc: 'Nước ngọt 7Up mát rượi' },
        { name: 'Mirinda Cam Sủi Bọt', price: 18000, desc: 'Nước ngọt vị cam' },
        { name: 'Trà Đào Cam Sả Tươi Mát', price: 32000, desc: 'Trà đào thơm ngát cam sả' },
        { name: 'Kem Tươi Vani Ốc Quế', price: 10000, desc: 'Kem vani ốc quế giòn' }
      ]
    },
    {
      name: 'Nước Ép & Trà Tươi',
      displayOrder: 6,
      items: [
        { name: 'Nước Ép Dưa Hấu Nguyên Chất', price: 35000, desc: 'Dưa hấu tươi ép nguyên chất' },
        { name: 'Trà Vải Hạt Chia Thanh Mát', price: 35000, desc: 'Trà vải thơm ngọt kèm hạt chia' }
      ]
    }
  ];

  let itemSkuSeq = 1;
  const createdMenuItems: Array<{ id: number; basePrice: number; name: string }> = [];

  const existingSkus = new Set(
    (await prisma.menuItem.findMany({ select: { sku: true } }))
      .map(i => i.sku)
      .filter((s): s is string => Boolean(s))
  );

  for (const catDef of categoriesDefinition) {
    let cat = await prisma.category.findFirst({ where: { name: catDef.name } });
    if (!cat) {
      cat = await prisma.category.create({
        data: { name: catDef.name, displayOrder: catDef.displayOrder }
      });
    }

    for (const itemDef of catDef.items) {
      let menuItem = await prisma.menuItem.findFirst({ where: { name: itemDef.name } });
      if (!menuItem) {
        while (existingSkus.has(formatMenuSku(itemSkuSeq))) {
          itemSkuSeq++;
        }
        const assignedSku = formatMenuSku(itemSkuSeq++);
        existingSkus.add(assignedSku);
        menuItem = await prisma.menuItem.create({
          data: {
            categoryId: cat.id,
            sku: assignedSku,
            name: itemDef.name,
            description: itemDef.desc,
            basePrice: itemDef.price,
            isAvailable: true,
            menuType: catDef.name.includes('Đồ Uống') || catDef.name.includes('Nước Ép') ? MenuType.DRINK : MenuType.FOOD,
            itemType: catDef.name.includes('Combo') ? MenuItemType.COMBO : MenuItemType.REGULAR
          }
        });
      }
      createdMenuItems.push({ id: menuItem.id, basePrice: menuItem.basePrice, name: menuItem.name });
    }
  }

  // Clear existing modifier groups before recreating
  await prisma.modifierGroup.deleteMany();
  let modGroupCount = 0;
  let modOptCount = 0;

  for (let i = 0; i < 12; i++) {
    const item = createdMenuItems[i];
    if (!item) continue;
    const groupName = `Tùy Chọn Cho ${item.name.substring(0, 15)}`;
    const isReq = i === 0; // Only Combo 1 has isRequired = true

    await prisma.modifierGroup.create({
      data: {
        menuItemId: item.id,
        name: groupName,
        isRequired: isReq,
        minSelect: isReq ? 1 : 0,
        maxSelect: 2,
        options: {
          create: [
            { name: 'Thêm Phô Mai Béo', priceDelta: 8000, isAvailable: true },
            { name: 'Nâng Size Lớn', priceDelta: 10000, isAvailable: true }
          ]
        }
      }
    });
    modGroupCount++;
    modOptCount += 2;
  }
  console.log(`✅ Da seed ${createdMenuItems.length} MenuItem, ${modGroupCount} ModifierGroup & ${modOptCount} ModifierOption`);

  // =========================================================================
  // 4. SEED 20 BẢNG GIÁ (PRICE LISTS) & PRICE LIST ITEMS
  // =========================================================================
  const priceListCodes = [
    { code: 'GENERAL', name: 'Bảng giá chung', type: PriceListType.GENERAL, scope: PriceListScopeType.GLOBAL, isDef: true },
    { code: 'GRABFOOD', name: 'Bảng Giá Kênh GrabFood', type: PriceListType.CUSTOM, scope: PriceListScopeType.CHANNEL, isDef: false },
    { code: 'SHOPEEFOOD', name: 'Bảng Giá Kênh ShopeeFood', type: PriceListType.CUSTOM, scope: PriceListScopeType.CHANNEL, isDef: false },
    { code: 'GOFOOD', name: 'Bảng Giá Kênh GoFood', type: PriceListType.CUSTOM, scope: PriceListScopeType.CHANNEL, isDef: false },
    { code: 'BEFOOD', name: 'Bảng Giá Kênh BeFood', type: PriceListType.CUSTOM, scope: PriceListScopeType.CHANNEL, isDef: false },
    { code: 'NIGHT_MENU', name: 'Bảng Giá Phụ Thụ Ca Đêm', type: PriceListType.CUSTOM, scope: PriceListScopeType.GLOBAL, isDef: false },
    { code: 'VIP_MEMBER', name: 'Bảng Giá Khách Hàng VIP', type: PriceListType.CUSTOM, scope: PriceListScopeType.CUSTOMER_GROUP, isDef: false },
    { code: 'AIRPORT_BRANCH', name: 'Bảng Giá Chi Nhánh Sân Bay', type: PriceListType.CUSTOM, scope: PriceListScopeType.BRANCH, isDef: false },
    { code: 'FESTIVAL_2026', name: 'Bảng Giá Mùa Lễ Hội 2026', type: PriceListType.CUSTOM, scope: PriceListScopeType.GLOBAL, isDef: false },
    { code: 'HAPPY_HOUR', name: 'Bảng Giá Giờ Vàng Khuyến Mãi', type: PriceListType.CUSTOM, scope: PriceListScopeType.GLOBAL, isDef: false },
    { code: 'CORPORATE_EVENT', name: 'Bảng Giá Khách Hàng Doanh Nghiệp', type: PriceListType.CUSTOM, scope: PriceListScopeType.CUSTOMER_GROUP, isDef: false },
    { code: 'STUDENT_DISCOUNT', name: 'Bảng Giá Ưu Đãi Học Sinh Sinh Viên', type: PriceListType.CUSTOM, scope: PriceListScopeType.CUSTOMER_GROUP, isDef: false },
    { code: 'BRANCH_Q1', name: 'Bảng Giá Chi Nhánh Quận 1', type: PriceListType.CUSTOM, scope: PriceListScopeType.BRANCH, isDef: false },
    { code: 'BRANCH_Q3', name: 'Bảng Giá Chi Nhánh Quận 3', type: PriceListType.CUSTOM, scope: PriceListScopeType.BRANCH, isDef: false },
    { code: 'BRANCH_Q5', name: 'Bảng Giá Chi Nhánh Quận 5', type: PriceListType.CUSTOM, scope: PriceListScopeType.BRANCH, isDef: false },
    { code: 'BRANCH_Q7', name: 'Bảng Giá Chi Nhánh Quận 7', type: PriceListType.CUSTOM, scope: PriceListScopeType.BRANCH, isDef: false },
    { code: 'BRANCH_THUDUC', name: 'Bảng Giá Chi Nhánh Thành Phố Thủ Đức', type: PriceListType.CUSTOM, scope: PriceListScopeType.BRANCH, isDef: false },
    { code: 'WHOLESALE_DEAL', name: 'Bảng Giá Đơn Hàng Đại Lý', type: PriceListType.CUSTOM, scope: PriceListScopeType.CUSTOMER_GROUP, isDef: false },
    { code: 'LATE_NIGHT_PROMO', name: 'Bảng Giá Ưu Đãi Khai Trương', type: PriceListType.CUSTOM, scope: PriceListScopeType.GLOBAL, isDef: false },
    { code: 'DELIVERY_DEFAULT', name: 'Bảng Giá Mặc Định Giao Trực Tiếp', type: PriceListType.CUSTOM, scope: PriceListScopeType.CHANNEL, isDef: false }
  ];

  const createdPriceLists: number[] = [];
  const priceListItemBatch: Array<{ priceListId: number; menuItemId: number; salePrice: number }> = [];

  for (const pl of priceListCodes) {
    const record = await prisma.priceList.upsert({
      where: { code: pl.code },
      update: { name: pl.name, type: pl.type, scopeType: pl.scope, isDefault: pl.isDef, isActive: true },
      create: { code: pl.code, name: pl.name, type: pl.type, scopeType: pl.scope, isDefault: pl.isDef, isActive: true }
    });
    createdPriceLists.push(record.id);

    for (const item of createdMenuItems) {
      priceListItemBatch.push({
        priceListId: record.id,
        menuItemId: item.id,
        salePrice: pl.isDef ? item.basePrice : Math.round(item.basePrice * 1.1)
      });
    }
  }

  await prisma.priceListItem.createMany({
    data: priceListItemBatch,
    skipDuplicates: true
  });
  console.log(`✅ Da seed ${createdPriceLists.length} PriceList & ${priceListItemBatch.length} PriceListItem`);

  // =========================================================================
  // 5. SEED 20 NGUYÊN VẬT LIỆU (INGREDIENTS) & BOM (MENU ITEM INGREDIENTS)
  // =========================================================================
  const ingredientDefinitions = [
    { sku: 'ING-CHICKEN-01', name: 'Thịt gà fillet tươi', unit: 'gram', stock: 50000, min: 5000, cost: 85 },
    { sku: 'ING-WINGS-01', name: 'Cánh gà khúc giữa tươi', unit: 'gram', stock: 30000, min: 3000, cost: 95 },
    { sku: 'ING-POTATO-01', name: 'Khoai tây đông lạnh nhập khẩu', unit: 'gram', stock: 60000, min: 10000, cost: 35 },
    { sku: 'ING-OIL-01', name: 'Dầu chiên thực vật cao cấp', unit: 'ml', stock: 80000, min: 15000, cost: 40 },
    { sku: 'ING-BUN-01', name: 'Vỏ bánh Burger mè vàng', unit: 'cái', stock: 500, min: 50, cost: 6000 },
    { sku: 'ING-BEEF-01', name: 'Bò miếng nướng Burger 100g', unit: 'miếng', stock: 300, min: 40, cost: 22000 },
    { sku: 'ING-CHEESE-01', name: 'Phô mai Cheddar lát béo', unit: 'lát', stock: 800, min: 100, cost: 5000 },
    { sku: 'ING-COCA-01', name: 'Lon nước ngọt Coca-Cola 320ml', unit: 'lon', stock: 500, min: 50, cost: 7500 },
    { sku: 'ING-PEPSI-01', name: 'Lon Pepsi 320ml chính hãng', unit: 'lon', stock: 500, min: 50, cost: 7500 },
    { sku: 'ING-TEA-01', name: 'Cốt trà đào đặc sản', unit: 'ml', stock: 20000, min: 3000, cost: 25 },
    { sku: 'ING-SAUCE-PEPPER-01', name: 'Sốt tiêu đen đậm đà', unit: 'ml', stock: 15000, min: 2000, cost: 30 },
    { sku: 'ING-SAUCE-TERIYAKI-01', name: 'Sốt Teriyaki Nhật Bản', unit: 'ml', stock: 15000, min: 2000, cost: 35 },
    { sku: 'ING-FLOUR-MIX-01', name: 'Bột chiên giòn độc quyền', unit: 'gram', stock: 40000, min: 5000, cost: 20 },
    { sku: 'ING-SPICE-HOT-01', name: 'Bột ớt cay nồng Crispy', unit: 'gram', stock: 10000, min: 1000, cost: 50 },
    { sku: 'ING-GARLIC-BUTTER-01', name: 'Sốt bơ tỏi Hàn Quốc', unit: 'ml', stock: 12000, min: 1500, cost: 45 },
    { sku: 'ING-CABBAGE-01', name: 'Rau bắp cải tươi sơ chế', unit: 'gram', stock: 25000, min: 3000, cost: 15 },
    { sku: 'ING-ICE-CREAM-MIX-01', name: 'Bột kem tươi Vani', unit: 'gram', stock: 30000, min: 4000, cost: 60 },
    { sku: 'ING-CALAMARI-01', name: 'Mực vòng đông lạnh xuất khẩu', unit: 'gram', stock: 15000, min: 2000, cost: 120 },
    { sku: 'ING-BOX-BURGER-01', name: 'Hộp giấy đựng Burger eco', unit: 'cái', stock: 1000, min: 100, cost: 1500 },
    { sku: 'ING-CUP-PAPER-01', name: 'Ly giấy 500ml kèm nắp', unit: 'cái', stock: 2000, min: 200, cost: 1200 }
  ];

  const ingredientMap = new Map<string, number>();
  for (const ing of ingredientDefinitions) {
    const rec = await prisma.ingredient.upsert({
      where: { sku: ing.sku },
      update: { name: ing.name, unit: ing.unit, currentStock: ing.stock, minThreshold: ing.min, costPerUnit: ing.cost, isActive: true },
      create: { sku: ing.sku, name: ing.name, unit: ing.unit, currentStock: ing.stock, minThreshold: ing.min, costPerUnit: ing.cost, isActive: true }
    });
    ingredientMap.set(ing.sku, rec.id);
  }
  console.log(`✅ Da seed ${ingredientMap.size} Ingredient`);

  // Build BOM mappings precisely including Combo 1 Nguoi (4 ing) and Burger Bo (3 ing)
  await prisma.menuItemIngredient.deleteMany();
  const bomBatch: Array<{ menuItemId: number; ingredientId: number; quantityRequired: number }> = [];

  const combo1 = createdMenuItems.find((m) => m.name === 'Combo 1 Người: Gà Giòn + Khoai + Nước');
  if (combo1) {
    bomBatch.push(
      { menuItemId: combo1.id, ingredientId: ingredientMap.get('ING-CHICKEN-01')!, quantityRequired: 180 },
      { menuItemId: combo1.id, ingredientId: ingredientMap.get('ING-POTATO-01')!, quantityRequired: 120 },
      { menuItemId: combo1.id, ingredientId: ingredientMap.get('ING-OIL-01')!, quantityRequired: 35 },
      { menuItemId: combo1.id, ingredientId: ingredientMap.get('ING-COCA-01')!, quantityRequired: 1 }
    );
  }

  const burgerBo = createdMenuItems.find((m) => m.name === 'Burger Bò Nướng Phô Mai');
  if (burgerBo) {
    bomBatch.push(
      { menuItemId: burgerBo.id, ingredientId: ingredientMap.get('ING-BUN-01')!, quantityRequired: 1 },
      { menuItemId: burgerBo.id, ingredientId: ingredientMap.get('ING-BEEF-01')!, quantityRequired: 1 },
      { menuItemId: burgerBo.id, ingredientId: ingredientMap.get('ING-CHEESE-01')!, quantityRequired: 1 }
    );
  }

  for (const item of createdMenuItems) {
    if (item.id === combo1?.id || item.id === burgerBo?.id) continue;
    const chickenId = ingredientMap.get('ING-CHICKEN-01')!;
    const oilId = ingredientMap.get('ING-OIL-01')!;

    bomBatch.push(
      { menuItemId: item.id, ingredientId: chickenId, quantityRequired: 150 },
      { menuItemId: item.id, ingredientId: oilId, quantityRequired: 20 }
    );
  }

  await prisma.menuItemIngredient.createMany({
    data: bomBatch,
    skipDuplicates: true
  });
  console.log(`✅ Da seed ${bomBatch.length} MenuItemIngredient (BOM)`);

  // =========================================================================
  // 6. SEED 20 NHÓM NHÀ CUNG CẤP & 20 NHÀ CUNG CẤP (SUPPLIERS)
  // =========================================================================
  const supplierGroupNames = [
    'Nhà cung cấp Thịt tươi',
    'Nhà cung cấp Bột & Gia vị',
    'Nhà cung cấp Nước giải khát',
    'Nhà cung cấp Bao bì',
    'Nhà cung cấp Rau củ tươi',
    'Nhà cung cấp Dầu ăn',
    'Nhà cung cấp Phô mai',
    'Nhà cung cấp Đồ đông lạnh',
    'Nhà cung cấp Trang thiết bị',
    'Nhà cung cấp Hóa phẩm vệ sinh',
    'Nhà cung cấp Bánh mì burger',
    'Nhà cung cấp Đồ uống đóng lon',
    'Nhà cung cấp Nước sốt nhập khẩu',
    'Nhà cung cấp Đồng phục nhân viên',
    'Nhà cung cấp Vật tư tiêu hao',
    'Nhà cung cấp Thùng carton',
    'Nhà cung cấp Đá sạch tinh khiết',
    'Nhà cung cấp Tem nhãn in ấn',
    'Nhà cung cấp Gas công nghiệp',
    'Nhà cung cấp Máy móc bảo trì'
  ];

  const createdSupplierGroups: number[] = [];
  for (const name of supplierGroupNames) {
    const sg = await prisma.supplierGroup.upsert({
      where: { name },
      update: {},
      create: { name }
    });
    createdSupplierGroups.push(sg.id);
  }

  const supplierDefs = [
    { code: 'NCC001', name: 'Công ty CP Thực Phẩm CP Việt Nam', phone: '02838111222', email: 'cpfood@cp.com.vn' },
    { code: 'NCC002', name: 'Công ty TNHH PepsiCo Việt Nam', phone: '02838333444', email: 'orders@pepsico.com.vn' },
    { code: 'NCC003', name: 'Công ty TNHH Bánh Mỳ Tươi ABC', phone: '02838555666', email: 'sales@abcbakery.vn' },
    { code: 'NCC004', name: 'Công ty TNHH Nông Sản Đà Lạt Tươi', phone: '02838777888', email: 'dalatfresh@dalat.vn' },
    { code: 'NCC005', name: 'Công ty TNHH Dầu Ăn Tường An', phone: '02838999000', email: 'tuongan@tuongan.com.vn' },
    { code: 'NCC006', name: 'Công ty TNHH Phô Mai Anchor Việt Nam', phone: '02839111222', email: 'anchor@fonterra.com' },
    { code: 'NCC007', name: 'Công ty CP Gia Vị Vifon', phone: '02839333444', email: 'vifon@vifon.com.vn' },
    { code: 'NCC008', name: 'Công ty TNHH Bao Bì Giấy Bình Minh', phone: '02839555666', email: 'binhminhpack@pack.vn' },
    { code: 'NCC009', name: 'Công ty TNHH Thực Phẩm Đông Lạnh Kido', phone: '02839777888', email: 'kido@kido.vn' },
    { code: 'NCC010', name: 'Công ty TNHH Nước Giải Khát Coca-Cola', phone: '02839999000', email: 'cocacola@coca.com' },
    { code: 'NCC011', name: 'Công ty TNHH Hải Sản Biển Xanh', phone: '02840111222', email: 'seafood@bienxanh.vn' },
    { code: 'NCC012', name: 'Công ty TNHH Nông Sản Sạch VinEco', phone: '02840333444', email: 'vineco@vin.vn' },
    { code: 'NCC013', name: 'Công ty TNHH Khí Đốt Petrovietnam', phone: '02840555666', email: 'gas@petro.vn' },
    { code: 'NCC014', name: 'Công ty TNHH Tem Nhãn In Nhanh', phone: '02840777888', email: 'innhanh@print.vn' },
    { code: 'NCC015', name: 'Công ty TNHH Vật Tư Nhà Hàng Việt', phone: '02840999000', email: 'vattu@nhahangviet.vn' },
    { code: 'NCC016', name: 'Công ty CP Sữa Việt Nam Vinamilk', phone: '02841111222', email: 'vinamilk@vinamilk.com.vn' },
    { code: 'NCC017', name: 'Công ty TNHH Đá Tinh Khiết Hùng Cường', phone: '02841333444', email: 'dahungcuong@ice.vn' },
    { code: 'NCC018', name: 'Công ty TNHH Sốt Nhập Khẩu Knorr', phone: '02841555666', email: 'knorr@unilever.com' },
    { code: 'NCC019', name: 'Công ty TNHH Bột Mỳ Bình Đông', phone: '02841777888', email: 'botmy@binhdong.vn' },
    { code: 'NCC020', name: 'Công ty TNHH Thiết Bị Bếp Công Nghiệp', phone: '02841999000', email: 'thietbibep@bepcongnghiep.vn' }
  ];

  const createdSuppliers: number[] = [];
  for (let i = 0; i < supplierDefs.length; i++) {
    const s = supplierDefs[i];
    const groupId = createdSupplierGroups[i % createdSupplierGroups.length];
    const rec = await prisma.supplier.upsert({
      where: { code: s.code },
      update: { name: s.name, phone: s.phone, email: s.email, groupId, isActive: true },
      create: { code: s.code, name: s.name, phone: s.phone, email: s.email, groupId, isActive: true }
    });
    createdSuppliers.push(rec.id);
  }
  console.log(`✅ Da seed ${createdSupplierGroups.length} SupplierGroup & ${createdSuppliers.length} Supplier`);

  // =========================================================================
  // 7. SEED 20 NHÓM ĐỐI TÁC GIAO HÀNG & 20 ĐỐI TÁC GIAO HÀNG (DELIVERY PARTNERS)
  // =========================================================================
  const deliveryGroupNames = [
    'Ứng dụng Giao hàng Công nghệ',
    'Đội Shipper Nội bộ Ca Sáng',
    'Đội Shipper Nội bộ Ca Tối',
    'Bưu chính Chuyển phát Nhanh',
    'Đối tác Giao hàng Siêu Tốc',
    'Đối tác Giao hàng Liên Tỉnh',
    'Đội Shipper VIP Executive',
    'Đội Giao hàng Bán Sỉ',
    'Đội Giao Tiệc Sự Kiện',
    'Đối tác Giao hàng Đêm',
    'Đối tác Giao hàng Giờ Cao Điểm',
    'Đối tác Logistics Ahamove',
    'Đối tác Logistics Lalamove',
    'Đối tác Logistics Ninja Van',
    'Đối tác Logistics ViettelPost',
    'Đối tác Logistics VNPost',
    'Đối tác Logistics J&T Express',
    'Đối tác Logistics BEST Express',
    'Đối tác Logistics SPX Express',
    'Đối tác Giao hàng Dự phòng'
  ];

  const createdDeliveryGroups: number[] = [];
  for (const name of deliveryGroupNames) {
    const dg = await prisma.deliveryPartnerGroup.upsert({
      where: { name },
      update: {},
      create: { name }
    });
    createdDeliveryGroups.push(dg.id);
  }

  const deliveryDefs = [
    { code: 'DTGH001', name: 'GrabFood Vietnam', type: DeliveryPartnerType.COMPANY, phone: '19001000' },
    { code: 'DTGH002', name: 'ShopeeFood (Foody)', type: DeliveryPartnerType.COMPANY, phone: '19002000' },
    { code: 'DTGH003', name: 'GoFood (Gojek)', type: DeliveryPartnerType.COMPANY, phone: '19003000' },
    { code: 'DTGH004', name: 'BeFood (Be Group)', type: DeliveryPartnerType.COMPANY, phone: '19004000' },
    { code: 'DTGH005', name: 'Ahamove Delivery', type: DeliveryPartnerType.COMPANY, phone: '19005000' },
    { code: 'DTGH006', name: 'Lalamove Express', type: DeliveryPartnerType.COMPANY, phone: '19006000' },
    { code: 'DTGH007', name: 'Shipper Nội Bộ - Nguyễn Văn Nam', type: DeliveryPartnerType.INDIVIDUAL, phone: '0901111222' },
    { code: 'DTGH008', name: 'Shipper Nội Bộ - Trần Văn Bình', type: DeliveryPartnerType.INDIVIDUAL, phone: '0902222333' },
    { code: 'DTGH009', name: 'Shipper Nội Bộ - Lê Hoàng Cường', type: DeliveryPartnerType.INDIVIDUAL, phone: '0903333444' },
    { code: 'DTGH010', name: 'Shipper Nội Bộ - Phạm Minh Đức', type: DeliveryPartnerType.INDIVIDUAL, phone: '0904444555' },
    { code: 'DTGH011', name: 'Shipper Nội Bộ - Hoàng Văn Trọng', type: DeliveryPartnerType.INDIVIDUAL, phone: '0905555666' },
    { code: 'DTGH012', name: 'Shipper Nội Bộ - Võ Minh Tuấn', type: DeliveryPartnerType.INDIVIDUAL, phone: '0906666777' },
    { code: 'DTGH013', name: 'Shipper Nội Bộ - Đặng Văn Hải', type: DeliveryPartnerType.INDIVIDUAL, phone: '0907777888' },
    { code: 'DTGH014', name: 'Shipper Nội Bộ - Bùi Thành Đạt', type: DeliveryPartnerType.INDIVIDUAL, phone: '0908888999' },
    { code: 'DTGH015', name: 'Shipper Nội Bộ - Ngô Quốc Bảo', type: DeliveryPartnerType.INDIVIDUAL, phone: '0909999000' },
    { code: 'DTGH016', name: 'Shipper Nội Bộ - Dương Văn Tâm', type: DeliveryPartnerType.INDIVIDUAL, phone: '0910000111' },
    { code: 'DTGH017', name: 'Shipper Nội Bộ - Phan Thanh Tùng', type: DeliveryPartnerType.INDIVIDUAL, phone: '0911111222' },
    { code: 'DTGH018', name: 'Shipper Nội Bộ - Đỗ Hoàng Long', type: DeliveryPartnerType.INDIVIDUAL, phone: '0912222333' },
    { code: 'DTGH019', name: 'Shipper Nội Bộ - Nguyễn Việt Tiến', type: DeliveryPartnerType.INDIVIDUAL, phone: '0913333444' },
    { code: 'DTGH020', name: 'Shipper Nội Bộ - Trịnh Văn Hoàng', type: DeliveryPartnerType.INDIVIDUAL, phone: '0914444555' }
  ];

  const createdDeliveryPartners: number[] = [];
  for (let i = 0; i < deliveryDefs.length; i++) {
    const d = deliveryDefs[i];
    const groupId = createdDeliveryGroups[i % createdDeliveryGroups.length];
    const rec = await prisma.deliveryPartner.upsert({
      where: { code: d.code },
      update: { name: d.name, partnerType: d.type, phone: d.phone, groupId, isActive: true },
      create: { code: d.code, name: d.name, partnerType: d.type, phone: d.phone, groupId, isActive: true }
    });
    createdDeliveryPartners.push(rec.id);
  }
  console.log(`✅ Da seed ${createdDeliveryGroups.length} DeliveryPartnerGroup & ${createdDeliveryPartners.length} DeliveryPartner`);

  // =========================================================================
  // 8. SEED 20 KHUYẾN MÃI / VOUCHER (VOUCHERS)
  // =========================================================================
  const voucherDefs = [
    { code: 'CRISPY10', title: 'Giảm 10% tối đa 50.000đ cho đơn từ 50.000đ', type: DiscountType.PERCENTAGE, val: 10, minVal: 50000, maxDisc: 50000 },
    { code: 'GIAM20K', title: 'Giảm ngay 20.000đ trực tiếp cho đơn từ 100.000đ', type: DiscountType.FIXED_AMOUNT, val: 20000, minVal: 100000, maxDisc: null },
    { code: 'WELCOME50', title: 'Siêu ưu đãi chào mừng: Giảm 50% tối đa 100.000đ cho đơn từ 80.000đ', type: DiscountType.PERCENTAGE, val: 50, minVal: 80000, maxDisc: 100000 },
    { code: 'FREESHIP', title: 'Miễn phí giao hàng 15.000đ cho đơn từ 99.000đ', type: DiscountType.FIXED_AMOUNT, val: 15000, minVal: 99000, maxDisc: null },
    { code: 'VIPMEMBER', title: 'Ưu đãi thành viên VIP: Giảm 15% tối đa 150.000đ', type: DiscountType.PERCENTAGE, val: 15, minVal: 200000, maxDisc: 150000 },
    { code: 'MIDWEEK15', title: 'Ưu đãi giữa tuần: Giảm 15% đơn từ 120.000đ', type: DiscountType.PERCENTAGE, val: 15, minVal: 120000, maxDisc: 40000 },
    { code: 'HAPPYHOUR30', title: 'Giờ vàng 14h-17h: Giảm 30% tối đa 60.000đ', type: DiscountType.PERCENTAGE, val: 30, minVal: 70000, maxDisc: 60000 },
    { code: 'FESTIVAL100K', title: 'Mùa lễ hội: Giảm 100.000đ cho đơn từ 500.000đ', type: DiscountType.FIXED_AMOUNT, val: 100000, minVal: 500000, maxDisc: null },
    { code: 'SUMMER2026', title: 'Chào hè 2026: Giảm 20% tối đa 80.000đ', type: DiscountType.PERCENTAGE, val: 20, minVal: 150000, maxDisc: 80000 },
    { code: 'COMBO50K', title: 'Mua Combo tặng Voucher 50.000đ', type: DiscountType.FIXED_AMOUNT, val: 50000, minVal: 250000, maxDisc: null },
    { code: 'STUDENT10', title: 'Giảm 10k cho HSSV có thẻ học sinh', type: DiscountType.FIXED_AMOUNT, val: 10000, minVal: 40000, maxDisc: null },
    { code: 'LUNCH20K', title: 'Bữa trưa vui vẻ: Giảm 20.000đ', type: DiscountType.FIXED_AMOUNT, val: 20000, minVal: 80000, maxDisc: null },
    { code: 'NIGHT25', title: 'Ăn đêm thả ga: Giảm 25% tối da 50k', type: DiscountType.PERCENTAGE, val: 25, minVal: 100000, maxDisc: 50000 },
    { code: 'APP20OFF', title: 'Đặt qua App giảm 20%', type: DiscountType.PERCENTAGE, val: 20, minVal: 100000, maxDisc: 50000 },
    { code: 'NEWYEAR50K', title: 'Tết rộn ràng: Giảm 50.000đ', type: DiscountType.FIXED_AMOUNT, val: 50000, minVal: 300000, maxDisc: null },
    { code: 'BLACKFRIDAY', title: 'Siêu bão Black Friday: Giảm 40%', type: DiscountType.PERCENTAGE, val: 40, minVal: 150000, maxDisc: 120000 },
    { code: 'FAMILY100K', title: 'Tiệc gia đình: Giảm 100k đơn từ 600k', type: DiscountType.FIXED_AMOUNT, val: 100000, minVal: 600000, maxDisc: null },
    { code: 'WEEKEND15', title: 'Cuối tuần rực rỡ: Giảm 15%', type: DiscountType.PERCENTAGE, val: 15, minVal: 150000, maxDisc: 60000 },
    { code: 'LOYALTY30K', title: 'Tri ân khách hàng thân thiết: Giảm 30k', type: DiscountType.FIXED_AMOUNT, val: 30000, minVal: 150000, maxDisc: null },
    { code: 'BIRTHDAY50', title: 'Quà sinh nhật đặc biệt: Giảm 50k', type: DiscountType.FIXED_AMOUNT, val: 50000, minVal: 200000, maxDisc: null }
  ];

  const createdVouchers: Record<string, number> = {};
  for (const v of voucherDefs) {
    const rec = await prisma.voucher.upsert({
      where: { code: v.code },
      update: {
        title: v.title,
        discountType: v.type,
        discountValue: v.val,
        minOrderValue: v.minVal,
        maxDiscount: v.maxDisc,
        usageLimit: 500,
        isActive: true
      },
      create: {
        code: v.code,
        title: v.title,
        discountType: v.type,
        discountValue: v.val,
        minOrderValue: v.minVal,
        maxDiscount: v.maxDisc,
        usageLimit: 500,
        usedCount: 0,
        isActive: true,
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-12-31T23:59:59Z')
      }
    });
    createdVouchers[v.code] = rec.id;
  }
  console.log(`✅ Da seed ${Object.keys(createdVouchers).length} Voucher`);

  // Skip seeding transaction history in automated test runs so test suites can isolate their test orders
  if (!isTestEnv) {
    // =========================================================================
    // 9. SEED 20 ĐƠN NHẬP HÀNG (PURCHASE RECEIPTS) & LINES
    // =========================================================================
    const allIngredientArray = Array.from(ingredientMap.entries());
    const createdReceipts: number[] = [];
    const createdReceiptLines: Array<{ id: number; receiptId: number; ingredientId: number; qty: number; cost: number }> = [];

    for (let i = 1; i <= 20; i++) {
      const code = `NH-20260901-${i.toString().padStart(4, '0')}`;
      const supplierId = createdSuppliers[(i - 1) % createdSuppliers.length];
      const recDate = new Date(Date.now() - (21 - i) * 86400000);

      const receipt = await prisma.purchaseReceipt.upsert({
        where: { receiptCode: code },
        update: { status: PurchaseReceiptStatus.POSTED, supplierId, receivedAt: recDate },
        create: {
          receiptCode: code,
          supplierId,
          receivedAt: recDate,
          invoiceNumber: `INV-CRISPY-2026-${1000 + i}`,
          invoiceDate: recDate,
          status: PurchaseReceiptStatus.POSTED,
          subtotalAmount: 5000000,
          paidAmount: 5000000,
          note: `Nhập hàng nguyên liệu định kỳ đợt ${i}`,
          createdByUserId: createdUsers['admin'],
          postedByUserId: createdUsers['admin'],
          postedAt: recDate
        }
      });
      createdReceipts.push(receipt.id);

      for (let j = 0; j < 2; j++) {
        const ingEntry = allIngredientArray[(i * 2 + j) % allIngredientArray.length];
        const ingSku = ingEntry[0];
        const ingId = ingEntry[1];
        const ingDef = ingredientDefinitions.find((x) => x.sku === ingSku)!;

        const line = await prisma.purchaseReceiptLine.upsert({
          where: {
            purchaseReceiptId_ingredientId: { purchaseReceiptId: receipt.id, ingredientId: ingId }
          },
          update: { quantity: 100, unitCost: ingDef.cost },
          create: {
            purchaseReceiptId: receipt.id,
            ingredientId: ingId,
            ingredientSku: ingSku,
            ingredientName: ingDef.name,
            unit: ingDef.unit,
            quantity: 100,
            unitCost: ingDef.cost,
            discountAmount: 0
          }
        });
        createdReceiptLines.push({ id: line.id, receiptId: receipt.id, ingredientId: ingId, qty: 100, cost: ingDef.cost });
      }
    }
    console.log(`✅ Da seed ${createdReceipts.length} PurchaseReceipt & ${createdReceiptLines.length} PurchaseReceiptLine`);

    // =========================================================================
    // 10. SEED 20 ĐƠN TRẢ HÀNG NHẬP (PURCHASE RETURNS) & LINES
    // =========================================================================
    const createdPurchaseReturns: number[] = [];
    for (let i = 1; i <= 20; i++) {
      const code = `TH-20260901-${i.toString().padStart(4, '0')}`;
      const receiptId = createdReceipts[(i - 1) % createdReceipts.length];
      const receiptLine = createdReceiptLines.find((l) => l.receiptId === receiptId)!;
      const ingDef = ingredientDefinitions.find((x) => x.sku === allIngredientArray[receiptLine.ingredientId % allIngredientArray.length]?.[0]) || ingredientDefinitions[0];
      const retDate = new Date(Date.now() - (21 - i) * 86400000 + 3600000);

      const pReturn = await prisma.purchaseReturn.upsert({
        where: { returnCode: code },
        update: { status: PurchaseReturnStatus.COMPLETED },
        create: {
          returnCode: code,
          supplierId: createdSuppliers[(i - 1) % createdSuppliers.length],
          sourceReceiptId: receiptId,
          returnedAt: retDate,
          status: PurchaseReturnStatus.COMPLETED,
          subtotalAmount: 50000,
          refundAmount: 50000,
          refundMethod: 'CASH',
          note: `Trả hàng do hỏng bao bì lô ${i}`,
          createdByUserId: createdUsers['admin'],
          completedByUserId: createdUsers['admin'],
          completedAt: retDate
        }
      });
      createdPurchaseReturns.push(pReturn.id);

      await prisma.purchaseReturnLine.upsert({
        where: {
          purchaseReturnId_ingredientId: { purchaseReturnId: pReturn.id, ingredientId: receiptLine.ingredientId }
        },
        update: { quantity: 5 },
        create: {
          purchaseReturnId: pReturn.id,
          ingredientId: receiptLine.ingredientId,
          sourceReceiptLineId: receiptLine.id,
          ingredientSku: ingDef.sku,
          ingredientName: ingDef.name,
          unit: ingDef.unit,
          quantity: 5,
          purchaseUnitCost: receiptLine.cost,
          returnUnitPrice: receiptLine.cost,
          lineAmount: 5 * receiptLine.cost,
          stockCostPerUnit: receiptLine.cost,
          stockCostAmount: 5 * receiptLine.cost
        }
      });
    }
    console.log(`✅ Da seed ${createdPurchaseReturns.length} PurchaseReturn & Lines`);

    // =========================================================================
    // 11. SEED 20 PHIẾU KIỂM KHO (INVENTORY CHECKS) & LINES
    // =========================================================================
    const createdChecks: number[] = [];
    for (let i = 1; i <= 20; i++) {
      const code = `KK-20260901-${i.toString().padStart(4, '0')}`;
      const checkDate = new Date(Date.now() - (21 - i) * 86400000 + 7200000);

      const check = await prisma.inventoryCheck.upsert({
        where: { checkCode: code },
        update: { status: InventoryCheckStatus.BALANCED },
        create: {
          checkCode: code,
          status: InventoryCheckStatus.BALANCED,
          countedAt: checkDate,
          balancedAt: checkDate,
          note: `Kiểm kho định kỳ ca ${i}`,
          createdByUserId: createdUsers['admin'],
          balancedByUserId: createdUsers['admin']
        }
      });
      createdChecks.push(check.id);

      for (let j = 0; j < 2; j++) {
        const ingEntry = allIngredientArray[(i * 2 + j) % allIngredientArray.length];
        const ingSku = ingEntry[0];
        const ingId = ingEntry[1];
        const ingDef = ingredientDefinitions.find((x) => x.sku === ingSku)!;

        await prisma.inventoryCheckLine.upsert({
          where: {
            inventoryCheckId_ingredientId: { inventoryCheckId: check.id, ingredientId: ingId }
          },
          update: { actualQuantity: 98, varianceQuantity: -2 },
          create: {
            inventoryCheckId: check.id,
            ingredientId: ingId,
            ingredientSku: ingSku,
            ingredientName: ingDef.name,
            unit: ingDef.unit,
            systemQuantity: 100,
            actualQuantity: 98,
            varianceQuantity: -2,
            costPerUnit: ingDef.cost,
            varianceValue: -2 * ingDef.cost
          }
        });
      }
    }
    console.log(`✅ Da seed ${createdChecks.length} InventoryCheck & Lines`);

    // =========================================================================
    // 12. SEED 20 PHIẾU XUẤT HỦY (INVENTORY WASTES) & LINES
    // =========================================================================
    const createdWastes: number[] = [];
    for (let i = 1; i <= 20; i++) {
      const code = `XH-20260901-${i.toString().padStart(4, '0')}`;
      const wasteDate = new Date(Date.now() - (21 - i) * 86400000 + 10800000);

      const waste = await prisma.inventoryWaste.upsert({
        where: { wasteCode: code },
        update: { status: InventoryWasteStatus.COMPLETED },
        create: {
          wasteCode: code,
          status: InventoryWasteStatus.COMPLETED,
          wastedAt: wasteDate,
          completedAt: wasteDate,
          note: `Xuất hủy nguyên liệu hết hạn ca ${i}`,
          totalValue: 30000,
          createdByUserId: createdUsers['kitchen'],
          completedByUserId: createdUsers['admin']
        }
      });
      createdWastes.push(waste.id);

      const ingEntry = allIngredientArray[i % allIngredientArray.length];
      const ingSku = ingEntry[0];
      const ingId = ingEntry[1];
      const ingDef = ingredientDefinitions.find((x) => x.sku === ingSku)!;

      await prisma.inventoryWasteLine.upsert({
        where: {
          inventoryWasteId_ingredientId: { inventoryWasteId: waste.id, ingredientId: ingId }
        },
        update: { quantity: 2 },
        create: {
          inventoryWasteId: waste.id,
          ingredientId: ingId,
          ingredientSku: ingSku,
          ingredientName: ingDef.name,
          unit: ingDef.unit,
          systemQuantity: 50,
          quantity: 2,
          costPerUnit: ingDef.cost,
          lineValue: 2 * ingDef.cost
        }
      });
    }
    console.log(`✅ Da seed ${createdWastes.length} InventoryWaste & Lines`);

    // =========================================================================
    // 13. CASHBOOK DEFAULTS + SEED 25 ĐƠN HÀNG (ORDERS) & ORDER ITEMS
    // =========================================================================
    await prisma.financialAccount.updateMany({
      where: { type: 'CASH', isDefault: true, code: { not: 'CASH' } },
      data: { isDefault: false }
    });
    const cashAccount = await prisma.financialAccount.upsert({
      where: { code: 'CASH' },
      update: { name: 'Tiền mặt tại quầy', type: 'CASH', isDefault: true, isActive: true },
      create: { code: 'CASH', name: 'Tiền mặt tại quầy', type: 'CASH', openingBalance: 0, isDefault: true, isActive: true }
    });
    const cashbookCategoryDefs = [
      { code: 'CUSTOMER_PAYMENT', name: 'Khách thanh toán', direction: 'RECEIPT', affectsBusinessResultDefault: false },
      { code: 'SUPPLIER_REFUND', name: 'Nhà cung cấp hoàn tiền', direction: 'RECEIPT', affectsBusinessResultDefault: false },
      { code: 'OTHER_INCOME', name: 'Thu khác', direction: 'RECEIPT', affectsBusinessResultDefault: true },
      { code: 'SUPPLIER_PAYMENT', name: 'Trả nhà cung cấp', direction: 'PAYMENT', affectsBusinessResultDefault: false },
      { code: 'CUSTOMER_REFUND', name: 'Hoàn tiền khách', direction: 'PAYMENT', affectsBusinessResultDefault: false },
      { code: 'OPERATING_EXPENSE', name: 'Chi phí vận hành', direction: 'PAYMENT', affectsBusinessResultDefault: true },
      { code: 'OTHER_EXPENSE', name: 'Chi khác', direction: 'PAYMENT', affectsBusinessResultDefault: true },
      { code: 'REVERSAL_RECEIPT', name: 'Đảo phiếu chi', direction: 'RECEIPT', affectsBusinessResultDefault: false },
      { code: 'REVERSAL_PAYMENT', name: 'Đảo phiếu thu', direction: 'PAYMENT', affectsBusinessResultDefault: false }
    ] as const;
    for (const category of cashbookCategoryDefs) {
      await prisma.cashFlowCategory.upsert({
        where: { code: category.code },
        update: { ...category, isSystem: true, isActive: true },
        create: { ...category, isSystem: true, isActive: true }
      });
    }
    await prisma.cashbookSetting.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 }
    });

    const createdOrders: Array<{ id: number; total: number; code: string }> = [];
    const createdOrderItems: Array<{ id: number; orderId: number; menuItemId: number; price: number }> = [];
    const redundantSeedOrderItemIds: number[] = [];
    const seededOrderItemNote = 'Chiên giòn cay nhiều';

    for (let i = 1; i <= 25; i++) {
      const code = 'CRISPY-20260901-' + i.toString().padStart(4, '0');
      const existingOrder = await prisma.order.findUnique({ where: { code }, select: { createdAt: true, paidAt: true, completedAt: true } });
      const orderDate = existingOrder?.paidAt ?? existingOrder?.createdAt ?? new Date(Date.now() - (26 - i) * 3600000 * 8);
      const orderType = i % 3 === 0 ? OrderType.DELIVERY : i % 2 === 0 ? OrderType.TAKE_AWAY : OrderType.DINE_IN;
      const tableId = orderType === OrderType.DINE_IN ? createdTables[(i - 1) % createdTables.length] : null;
      const deliveryPartnerId = orderType === OrderType.DELIVERY ? createdDeliveryPartners[i % createdDeliveryPartners.length] : null;
      const expectedItems = [0, 1].map((j) => {
        const menuItem = createdMenuItems[(i * 2 + j) % createdMenuItems.length];
        return { menuItem, quantity: 2, subtotal: menuItem.basePrice * 2 };
      });
      const totalAmount = expectedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const voucherApplies = totalAmount >= 50000;
      const discountAmount = voucherApplies
        ? Math.min(totalAmount, Math.min(Math.round(totalAmount * 0.1), 50000))
        : 0;
      const taxableAmount = Math.max(0, totalAmount - discountAmount);
      const vatAmount = Math.round(taxableAmount * 0.08);
      const deliveryFee = 0;
      const finalAmount = taxableAmount + vatAmount + deliveryFee;

      const order = await prisma.order.upsert({
        where: { code },
        update: {
          orderType,
          status: OrderStatus.COMPLETED,
          tableId,
          deliveryPartnerId,
          deliveryAddress: orderType === OrderType.DELIVERY ? 'Địa chỉ demo ' + i + ', TP. Hồ Chí Minh' : null,
          deliveryFee,
          deliveryFeePaid: 0,
          priceListId: createdPriceLists[0],
          totalAmount,
          discountAmount,
          vatAmount,
          finalAmount,
          voucherId: voucherApplies ? createdVouchers['CRISPY10'] : null,
          voucherCode: voucherApplies ? 'CRISPY10' : null,
          paymentMethod: PaymentMethod.CASH,
          paymentStatus: PaymentStatus.PAID,
          paidAt: orderDate,
          completedAt: existingOrder?.completedAt ?? orderDate,
          createdByUserId: createdUsers['cashier']
        },
        create: {
          code,
          orderType,
          status: OrderStatus.COMPLETED,
          tableId,
          deliveryPartnerId,
          deliveryAddress: orderType === OrderType.DELIVERY ? 'Địa chỉ demo ' + i + ', TP. Hồ Chí Minh' : null,
          deliveryFee,
          deliveryFeePaid: 0,
          priceListId: createdPriceLists[0],
          totalAmount,
          discountAmount,
          vatAmount,
          finalAmount,
          voucherId: voucherApplies ? createdVouchers['CRISPY10'] : null,
          voucherCode: voucherApplies ? 'CRISPY10' : null,
          paymentMethod: PaymentMethod.CASH,
          paymentStatus: PaymentStatus.PAID,
          paidAt: orderDate,
          completedAt: orderDate,
          createdByUserId: createdUsers['cashier']
        }
      });

      const existingItems = await prisma.orderItem.findMany({
        where: { orderId: order.id },
        orderBy: { id: 'asc' }
      });
      for (let j = 0; j < expectedItems.length; j++) {
        const expected = expectedItems[j];
        const itemData = {
          orderId: order.id,
          menuItemId: expected.menuItem.id,
          quantity: expected.quantity,
          unitPrice: expected.menuItem.basePrice,
          subtotal: expected.subtotal,
          notes: seededOrderItemNote
        };
        const item = existingItems[j]
          ? await prisma.orderItem.update({ where: { id: existingItems[j].id }, data: itemData })
          : await prisma.orderItem.create({ data: itemData });
        createdOrderItems.push({ id: item.id, orderId: order.id, menuItemId: item.menuItemId, price: item.unitPrice });
      }
      redundantSeedOrderItemIds.push(...existingItems.slice(expectedItems.length).map((item) => item.id));

      const confirmedAt = order.paidAt ?? orderDate;
      const existingPayments = await prisma.orderPaymentTransaction.findMany({
        where: { orderId: order.id, status: 'SUCCESS', paymentMethod: PaymentMethod.CASH },
        orderBy: { id: 'asc' }
      });
      if (existingPayments.length > 1) {
        throw new Error('Order ' + code + ' có nhiều giao dịch tiền mặt thành công; cần rà soát trước khi seed.');
      }
      if (existingPayments[0]) {
        await prisma.orderPaymentTransaction.update({
          where: { id: existingPayments[0].id },
          data: {
            amount: finalAmount,
            financialAccountId: cashAccount.id,
            confirmedByUserId: createdUsers['cashier'],
            confirmedAt,
            createdAt: confirmedAt
          }
        });
      } else {
        await prisma.orderPaymentTransaction.create({
          data: {
            orderId: order.id,
            status: 'SUCCESS',
            amount: finalAmount,
            paymentMethod: PaymentMethod.CASH,
            financialAccountId: cashAccount.id,
            confirmedByUserId: createdUsers['cashier'],
            confirmedAt,
            createdAt: confirmedAt
          }
        });
      }
      createdOrders.push({ id: order.id, total: finalAmount, code });
    }
    console.log('✅ Da seed ' + createdOrders.length + ' Order, ' + createdOrderItems.length + ' OrderItem va payment transaction');

    // =========================================================================
    // 14. SEED 20 ĐƠN TRẢ MÓN (ORDER RETURNS) & LINES
    // =========================================================================
    const createdOrderReturns: number[] = [];
    for (let i = 1; i <= 20; i++) {
      const code = 'TRA-20260901-' + i.toString().padStart(4, '0');
      const orderObj = createdOrders[(i - 1) % createdOrders.length];
      const orderItem = createdOrderItems.find((oi) => oi.orderId === orderObj.id)!;
      const menuItem = createdMenuItems.find((m) => m.id === orderItem.menuItemId)!;
      const retDate = new Date(Date.now() - (21 - i) * 3600000 * 4);

      const oReturn = await prisma.orderReturn.upsert({
        where: { returnCode: code },
        update: {
          status: OrderReturnStatus.COMPLETED,
          totalRefundDue: menuItem.basePrice,
          refundedAmount: menuItem.basePrice,
          refundMethod: PaymentMethod.CASH,
          financialAccountId: cashAccount.id,
          note: 'Khách trả món do làm nhầm vị ca ' + i,
          createdByUserId: createdUsers['cashier']
        },
        create: {
          returnCode: code,
          orderId: orderObj.id,
          status: OrderReturnStatus.COMPLETED,
          returnedAt: retDate,
          totalRefundDue: menuItem.basePrice,
          refundedAmount: menuItem.basePrice,
          refundMethod: PaymentMethod.CASH,
          financialAccountId: cashAccount.id,
          note: 'Khách trả món do làm nhầm vị ca ' + i,
          createdByUserId: createdUsers['cashier'],
          createdByName: 'Thu Ngân Quầy (Cashier)',
          completedAt: retDate
        }
      });
      createdOrderReturns.push(oReturn.id);

      await prisma.orderReturnLine.upsert({
        where: {
          orderReturnId_orderItemId: { orderReturnId: oReturn.id, orderItemId: orderItem.id }
        },
        update: {
          quantity: 1,
          unitPrice: menuItem.basePrice,
          lineAmount: menuItem.basePrice
        },
        create: {
          orderReturnId: oReturn.id,
          orderItemId: orderItem.id,
          menuItemId: menuItem.id,
          menuItemSku: formatMenuSku(menuItem.id),
          menuItemName: menuItem.name,
          quantity: 1,
          unitPrice: menuItem.basePrice,
          lineAmount: menuItem.basePrice
        }
      });
      await prisma.orderReturnLine.deleteMany({
        where: { orderReturnId: oReturn.id, orderItemId: { not: orderItem.id } }
      });
    }
    if (redundantSeedOrderItemIds.length) {
      const referencedDuplicates = await prisma.orderReturnLine.count({
        where: { orderItemId: { in: redundantSeedOrderItemIds } }
      });
      if (referencedDuplicates) {
        throw new Error('Không thể dọn dòng món seed cũ vì còn dòng trả hàng tham chiếu.');
      }
      await prisma.orderItem.deleteMany({ where: { id: { in: redundantSeedOrderItemIds } } });
    }
    console.log('✅ Da seed ' + createdOrderReturns.length + ' OrderReturn & Lines');

    // =========================================================================
    // 14b. ACTIVATE DEMO CASHBOOK AND POST SOURCE TRANSACTIONS
    // =========================================================================
    const seedPaymentTransactions = await prisma.orderPaymentTransaction.findMany({
      where: {
        orderId: { in: createdOrders.map((order) => order.id) },
        status: 'SUCCESS',
        paymentMethod: PaymentMethod.CASH,
        financialAccountId: cashAccount.id
      },
      include: { order: { select: { code: true, customerId: true } } }
    });
    const seedReturns = await prisma.orderReturn.findMany({
      where: {
        id: { in: createdOrderReturns },
        status: OrderReturnStatus.COMPLETED,
        refundMethod: PaymentMethod.CASH,
        refundedAmount: { gt: 0 },
        financialAccountId: cashAccount.id
      },
      include: { order: { select: { customerId: true } } }
    });
    const firstCashbookEventAt = [
      ...seedPaymentTransactions.map((payment) => payment.confirmedAt ?? payment.createdAt),
      ...seedReturns.map((orderReturn) => orderReturn.completedAt ?? orderReturn.returnedAt)
    ].sort((left, right) => left.getTime() - right.getTime())[0];
    if (firstCashbookEventAt) {
      const setting = await prisma.cashbookSetting.findUniqueOrThrow({ where: { id: 1 } });
      if (!setting.activatedAt) {
        if (await prisma.cashVoucher.count()) {
          throw new Error('Sổ quỹ có phiếu nhưng chưa kích hoạt; không tự đổi ngày/số dư đầu kỳ.');
        }
        const activeAccounts = await prisma.financialAccount.findMany({ where: { isActive: true } });
        for (const account of activeAccounts) {
          if (account.openingAt > firstCashbookEventAt) {
            await prisma.financialAccount.update({
              where: { id: account.id },
              data: { openingAt: firstCashbookEventAt }
            });
          }
        }
        await prisma.cashbookSetting.update({
          where: { id: 1 },
          data: { activatedAt: firstCashbookEventAt, activatedByUserId: createdUsers['cashier'] }
        });
      }

      const paymentCategory = await prisma.cashFlowCategory.findUniqueOrThrow({ where: { code: 'CUSTOMER_PAYMENT' } });
      const refundCategory = await prisma.cashFlowCategory.findUniqueOrThrow({ where: { code: 'CUSTOMER_REFUND' } });
      const postingEvents = [
        ...seedPaymentTransactions.map((payment) => ({
          occurredAt: payment.confirmedAt ?? payment.createdAt,
          tieBreaker: payment.id,
          direction: 'RECEIPT' as const,
          amount: payment.amount,
          accountId: payment.financialAccountId!,
          categoryId: paymentCategory.id,
          paymentMethod: PaymentMethod.CASH,
          sourceType: 'ORDER_PAYMENT' as const,
          sourceTransactionId: payment.id,
          sourceCode: payment.order.code,
          counterpartyType: payment.order.customerId ? 'CUSTOMER' : null,
          counterpartyId: payment.order.customerId,
          counterpartyName: null,
          note: 'Khách thanh toán order'
        })),
        ...seedReturns.map((orderReturn) => ({
          occurredAt: orderReturn.completedAt ?? orderReturn.returnedAt,
          tieBreaker: orderReturn.id,
          direction: 'PAYMENT' as const,
          amount: orderReturn.refundedAmount,
          accountId: orderReturn.financialAccountId!,
          categoryId: refundCategory.id,
          paymentMethod: PaymentMethod.CASH,
          sourceType: 'SALES_RETURN_REFUND' as const,
          sourceTransactionId: orderReturn.id,
          sourceCode: orderReturn.returnCode,
          counterpartyType: orderReturn.order.customerId ? 'CUSTOMER' : null,
          counterpartyId: orderReturn.order.customerId,
          counterpartyName: null,
          note: orderReturn.note ?? 'Hoàn tiền trả hàng ' + orderReturn.returnCode
        }))
      ].sort((left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() || left.tieBreaker - right.tieBreaker
      );
      for (const event of postingEvents) {
        await prisma.$transaction((tx) => CashbookPostingService.post(tx, event, {
          id: createdUsers['cashier'],
          name: 'Thu Ngân Quầy (Cashier)',
          role: 'CASHIER'
        }));
      }
    }

    // =========================================================================
    // 15. SEED 60 GIAO DỊCH KHO (INVENTORY TRANSACTIONS)
    // =========================================================================
    await prisma.inventoryTransaction.deleteMany();
    const txBatch: Array<{
      ingredientId: number;
      type: 'STOCK_IN' | 'PURCHASE_RETURN' | 'KITCHEN_WASTE';
      quantity: number;
      costAmount: number;
      purchaseReceiptId?: number;
      purchaseReturnId?: number;
      inventoryWasteId?: number;
      note: string;
      createdByUserId: number;
    }> = [];

    for (let i = 0; i < 20; i++) {
      const receiptId = createdReceipts[i];
      const line = createdReceiptLines.find((l) => l.receiptId === receiptId)!;
      txBatch.push({
        ingredientId: line.ingredientId,
        type: 'STOCK_IN',
        quantity: line.qty,
        costAmount: line.qty * line.cost,
        purchaseReceiptId: receiptId,
        note: `Nhập kho từ đơn nhập ${receiptId}`,
        createdByUserId: createdUsers['admin']
      });
    }

    for (let i = 0; i < 20; i++) {
      const pReturnId = createdPurchaseReturns[i];
      const ingEntry = allIngredientArray[i % allIngredientArray.length];
      txBatch.push({
        ingredientId: ingEntry[1],
        type: 'PURCHASE_RETURN',
        quantity: -5,
        costAmount: -50000,
        purchaseReturnId: pReturnId,
        note: `Xuất kho do trả nhà cung cấp đơn ${pReturnId}`,
        createdByUserId: createdUsers['admin']
      });
    }

    for (let i = 0; i < 20; i++) {
      const ingEntry = allIngredientArray[i % allIngredientArray.length];
      txBatch.push({
        ingredientId: ingEntry[1],
        type: 'KITCHEN_WASTE',
        quantity: -2,
        costAmount: -20000,
        inventoryWasteId: createdWastes[i],
        note: `Hao hụt chế biến ca ${i + 1}`,
        createdByUserId: createdUsers['kitchen']
      });
    }

    await prisma.inventoryTransaction.createMany({
      data: txBatch,
      skipDuplicates: true
    });
    console.log(`✅ Da seed ${txBatch.length} InventoryTransaction`);

    // =========================================================================
    // 16. SEED 25 NHẬT KÝ HỆ THỐNG (AUDIT LOGS)
    // =========================================================================
    await prisma.auditLog.deleteMany();
    const auditActions = [
      'USER_LOGIN',
      'MENU_ITEM_CREATED',
      'MENU_ITEM_UPDATED',
      'ORDER_CREATED',
      'ORDER_COMPLETED',
      'PURCHASE_RECEIPT_POSTED',
      'INVENTORY_CHECK_BALANCED',
      'INVENTORY_WASTE_COMPLETED',
      'PRICE_LIST_CREATED'
    ];

    const auditBatch: Array<{
      action: string;
      targetType: string;
      targetId: number;
      actorId: number;
      actorName: string;
      metadata: any;
      createdAt: Date;
    }> = [];

    for (let i = 1; i <= 25; i++) {
      const action = auditActions[i % auditActions.length];
      auditBatch.push({
        action,
        targetType: i % 2 === 0 ? 'MenuItem' : 'Order',
        targetId: i,
        actorId: createdUsers['admin'],
        actorName: 'Quản Lý Nhà Hàng (Admin)',
        metadata: { info: `Nhật ký hệ thống hành động ${action} thứ ${i}` },
        createdAt: new Date(Date.now() - (26 - i) * 3600000)
      });
    }

    await prisma.auditLog.createMany({
      data: auditBatch,
      skipDuplicates: true
    });
    console.log(`✅ Da seed ${auditBatch.length} AuditLog`);
  }

  console.log('\n=========================================================================');
  console.log('🎉 ĐÃ SEED THÀNH CÔNG 100% DỮ LIỆU MẪU MỌI CHỨC NĂNG (TOÀN BỘ >20 BẢN GHI)');
  console.log('=========================================================================\n');
}

if (require.main === module) {
  seedDatabase()
    .catch((e) => {
      console.error('❌ Loi trong qua trinh seed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await defaultPrisma.$disconnect();
    });
}
