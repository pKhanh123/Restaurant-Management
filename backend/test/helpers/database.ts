import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

// Load .env tu thu muc goc monorepo (WebAppQuanLyNhaHang/.env)
// process.cwd() trong test = backend/ nen can di len 1 cap
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') }); // fallback

const devUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL || devUrl;

// Kiem tra an toan tuyet doi de khong bao gio xoa nham Development DB trong test
export function validateTestEnvironment() {
  if (process.env.NODE_ENV === 'test' && devUrl && testUrl && devUrl === testUrl) {
    throw new Error('NGUY HIEM: TEST_DATABASE_URL va DATABASE_URL khong duoc phep trung nhau khi chay test!');
  }
}

export const prismaTest = new PrismaClient({
  datasources: {
    db: {
      url: testUrl
    }
  }
});

export async function truncateAllTables() {
  validateTestEnvironment();
  // Xoa du lieu theo thu tu khoa ngoai
  await prismaTest.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 0;`);
  const tables = [
    'CashVoucher',
    'CashbookSetting',
    'FinancialParty',
    'CashFlowCategory',
    'FinancialAccount',
    'OrderReturnLine',
    'OrderReturn',
    'PurchaseReturnLine',
    'PurchaseReturn',
    'InventoryWasteLine',
    'InventoryWaste',
    'InventoryCheckLine',
    'InventoryCheck',
    'InventoryTransaction',
    'PurchaseReceiptLine',
    'PurchaseReceipt',
    'Supplier',
    'SupplierGroup',
    'MenuItemIngredient',
    'Ingredient',
    'AuditLog',
    'OrderItem',
    'Order',
    'PriceListItem',
    'PriceList',
    'ModifierOption',
    'ModifierGroup',
    'MenuItem',
    'Category',
    'DiningTable',
    'TableArea',
    'User'
  ];
  for (const table of tables) {
    try {
      await prismaTest.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\`;`);
    } catch {
      // Bang co the chua ton tai neu chua migrate
    }
  }
  await prismaTest.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 1;`);
}
