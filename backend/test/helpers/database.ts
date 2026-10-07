import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { resolveTestDatabaseTarget } from '../../scripts/test-database-guard';

// Load .env tu thu muc goc monorepo (WebAppQuanLyNhaHang/.env)
// process.cwd() trong test = backend/ nen can di len 1 cap
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') }); // fallback

const testTarget = resolveTestDatabaseTarget(process.env);

// Kiem tra an toan tuyet doi de khong bao gio xoa nham Development DB trong test
export function validateTestEnvironment() {
  resolveTestDatabaseTarget(process.env);
}

export const prismaTest = new PrismaClient({
  datasources: {
    db: {
      url: testTarget.url
    }
  }
});

export async function truncateAllTables() {
  validateTestEnvironment();
  // Xoa du lieu theo thu tu khoa ngoai
  await prismaTest.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 0;`);
  const tables = [
    'OrderItemCancellation',
    'CashVoucher',
    'CashbookSetting',
    'CashFlowCategory',
    'FinancialParty',
    'FinancialAccount',
    'CommissionPayrollAllocation',
    'CommissionEntry',
    'CommissionRecognitionIssue',
    'CommissionBasisResolution',
    'CommissionSaleBasis',
    'CommissionRule',
    'CommissionPlanEmployee',
    'CommissionPlan',
    'EmployeeScheduleIdempotency',
    'EmployeePayrollIdempotency',
    'EmployeePayrollPayment',
    'EmployeePayrollAdjustment',
    'EmployeePayrollLine',
    'EmployeePayrollBatch',
    'AttendanceKioskIdempotency',
    'EmployeeAttendanceDisposition',
    'EmployeeAttendanceSession',
    'BranchHolidayPeriod',
    'BranchAttendancePolicyVersion',
    'BranchPayrollPolicyVersion',
    'BranchWorkweekPolicyVersion',
    'BranchEmployeeSettingsRevision',
    'AttendanceKioskRateLimitBucket',
    'AttendanceKioskSession',
    'EmployeeScheduleException',
    'EmployeeScheduleRule',
    'WorkShift',
    'OrderPaymentTransaction',
    'ReservationDepositTransaction',
    'ReservationChange',
    'Reservation',
    'ReservationPolicy',
    'Customer',
    'CustomerGroup',
    'EmployeeCompensation',
    'Employee',
    'Department',
    'JobTitle',
    'OrderReturnLine',
    'OrderReturn',
    'PurchaseReturnLine',
    'PurchaseReturn',
    'InventoryWasteLine',
    'InventoryWaste',
    'InventoryCheckLine',
    'InventoryCheck',
    'InventoryTransaction',
    'SupplierPayment',
    'PurchaseReceiptLine',
    'PurchaseReceipt',
    'Supplier',
    'SupplierGroup',
    'MenuItemIngredient',
    'Ingredient',
    'AuditLog',
    'OrderItem',
    'Order',
    'Voucher',
    'DeliveryPartner',
    'DeliveryPartnerGroup',
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
      try {
        await prismaTest.$executeRawUnsafe(`DELETE FROM \`${table}\`;`);
      } catch {
        // Bang co the chua ton tai neu chua migrate
      }
    }
  }
  try {
    await prismaTest.branch.deleteMany({ where: { code: { not: 'MAIN' } } });
  } catch {
    // Branch table may not exist before the attendance foundation migration is applied.
  }
  await prismaTest.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 1;`);

  // The Cashbook foundation migration seeds these defaults. Recreate them after
  // truncation so legacy transaction tests exercise the post-migration baseline.
  const baselineAt = new Date();
  await prismaTest.financialAccount.upsert({
    where: { code: 'CASH' },
    create: { code: 'CASH', name: 'Tiền mặt', type: 'CASH', openingAt: baselineAt, isDefault: true },
    update: { name: 'Tiền mặt', type: 'CASH', openingBalance: 0, openingAt: baselineAt, isDefault: true, isActive: true }
  });
  await prismaTest.cashbookSetting.upsert({
    where: { id: 1 },
    create: { id: 1, activatedAt: null },
    update: { activatedAt: null, activatedByUserId: null }
  });
  const systemCategories = [
    ['CUSTOMER_PAYMENT', 'Khách thanh toán', 'RECEIPT', false],
    ['SUPPLIER_REFUND', 'Nhà cung cấp hoàn tiền', 'RECEIPT', false],
    ['OTHER_INCOME', 'Thu khác', 'RECEIPT', true],
    ['SUPPLIER_PAYMENT', 'Trả nhà cung cấp', 'PAYMENT', false],
    ['CUSTOMER_REFUND', 'Hoàn tiền khách', 'PAYMENT', false],
    ['OPERATING_EXPENSE', 'Chi phí vận hành', 'PAYMENT', true],
    ['OTHER_EXPENSE', 'Chi khác', 'PAYMENT', true],
    ['REVERSAL_RECEIPT', 'Đảo phiếu chi', 'RECEIPT', false],
    ['REVERSAL_PAYMENT', 'Đảo phiếu thu', 'PAYMENT', false],
    ['PAYROLL_PAYMENT', 'Chi trả lương', 'PAYMENT', false]
  ] as const;
  try {
    await prismaTest.cashFlowCategory.deleteMany({ where: { isSystem: false } });
  } catch {
    // Ignore if table not yet migrated
  }
  for (const [code, name, direction, affectsBusinessResultDefault] of systemCategories) {
    await prismaTest.cashFlowCategory.upsert({
      where: { code },
      create: {
        code,
        name,
        direction,
        affectsBusinessResultDefault,
        isSystem: true,
        isActive: true,
        updatedAt: baselineAt
      },
      update: {
        name,
        direction,
        affectsBusinessResultDefault,
        isSystem: true,
        isActive: true,
        updatedAt: baselineAt
      }
    });
  }
}

export async function seedEmployeeSettingsBaselines(branchId: number, createdByUserId?: number) {
  const effectiveFrom = new Date('1970-01-01T00:00:00.000Z');
  await prismaTest.branchPayrollPolicyVersion.create({
    data: { branchId, effectiveFrom, revision: 1, createdByUserId }
  });
  await prismaTest.branchWorkweekPolicyVersion.create({
    data: { branchId, effectiveFrom, revision: 1, createdByUserId }
  });
}
