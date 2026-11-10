import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaTest, truncateAllTables } from '../../../test/helpers/database';
import { EmployeePayrollMutationService } from './employee-payroll.mutation.service';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('EmployeePayrollMutationService', () => {
  let actor: { id: number; name: string };
  let branchId = 0;
  let workingId = 0;
  let resignedId = 0;
  let emit: ReturnType<typeof vi.fn>;
  let service: EmployeePayrollMutationService;

  beforeEach(async () => {
    await truncateAllTables();
    const admin = await prismaTest.user.create({
      data: { username: `payroll-mutation-${Date.now()}`, passwordHash: 'hash', name: 'Payroll Admin', role: 'ADMIN' }
    });
    actor = { id: admin.id, name: admin.name };
    branchId = (await prismaTest.branch.findUniqueOrThrow({ where: { code: 'MAIN' } })).id;
    await prismaTest.branchPayrollPolicyVersion.create({
      data: { branchId, effectiveFrom: day('1970-01-01'), revision: 1, createdByUserId: admin.id }
    });
    await prismaTest.branchWorkweekPolicyVersion.create({
      data: { branchId, effectiveFrom: day('1970-01-01'), revision: 1, createdByUserId: admin.id }
    });
    const working = await prismaTest.employee.create({
      data: {
        code: 'NV-PM-001', attendanceCode: 'CC-PM-001', name: 'Nhân viên đang làm', phone: '0900000101',
        startDate: day('2026-01-01'), bankAccountNumber: '111111111'
      }
    });
    const resigned = await prismaTest.employee.create({
      data: {
        code: 'NV-PM-002', attendanceCode: 'CC-PM-002', name: 'Nhân viên đã nghỉ', phone: '0900000102',
        status: 'RESIGNED', startDate: day('2026-01-01'), endDate: day('2026-09-15')
      }
    });
    await prismaTest.employee.create({
      data: {
        code: 'NV-PM-003', attendanceCode: 'CC-PM-003', name: 'Nghỉ trước kỳ', phone: '0900000103',
        status: 'RESIGNED', startDate: day('2025-01-01'), endDate: day('2026-08-31')
      }
    });
    workingId = working.id;
    resignedId = resigned.id;
    await prismaTest.employeeCompensation.createMany({ data: [
      { employeeId: working.id, payBasis: 'MONTHLY', baseRate: 12_000_000, effectiveFrom: day('2026-01-01'), createdByUserId: admin.id },
      { employeeId: resigned.id, payBasis: 'MONTHLY', baseRate: 9_000_000, effectiveFrom: day('2026-01-01'), createdByUserId: admin.id }
    ] });
    emit = vi.fn();
    service = new EmployeePayrollMutationService(prismaTest, emit);
  });

  async function seedCommissionEntry(amount: number, accountingDate: string) {
    const nonce = `${Date.now()}-${Math.random()}`;
    const category = await prismaTest.category.create({ data: { name: `Payroll commission ${nonce}` } });
    const menuItem = await prismaTest.menuItem.create({ data: { categoryId: category.id, sku: `PC-${nonce}`, name: 'Món hoa hồng', basePrice: 100_000 } });
    const order = await prismaTest.order.create({ data: {
      code: `PC-ORDER-${nonce}`, status: 'COMPLETED', paymentStatus: 'PAID', paidAt: day(accountingDate),
      totalAmount: 100_000, vatAmount: 0, finalAmount: 100_000, createdByUserId: actor.id,
      items: { create: { menuItemId: menuItem.id, quantity: 1, unitPrice: 100_000, subtotal: 100_000, commissionEmployeeId: workingId } }
    }, include: { items: true } });
    const basis = await prismaTest.commissionSaleBasis.create({ data: {
      eventKey: `PAYROLL-BASIS-${nonce}`, orderId: order.id, orderItemId: order.items[0].id, menuItemId: menuItem.id,
      commissionEmployeeIdAtPayment: workingId, soldQuantity: 1, saleBusinessDate: day(accountingDate), paidAt: day(accountingDate),
      itemSku: menuItem.sku, itemName: menuItem.name, unitPrice: 100_000, grossRevenue: 100_000,
      allocatedDiscount: 0, netRevenue: 100_000, costStatus: 'MISSING', ruleCandidatesSnapshot: []
    } });
    return prismaTest.commissionEntry.create({ data: {
      eventKey: `PAYROLL-ENTRY-${nonce}`, type: amount >= 0 ? 'EARNING' : 'RETURN_REVERSAL',
      saleBasisId: basis.id, orderId: order.id, orderItemId: order.items[0].id, employeeId: workingId,
      saleBusinessDate: day(accountingDate), accountingDate: day(accountingDate), occurredAt: day(accountingDate),
      quantityDelta: amount >= 0 ? 1 : -1, grossRevenueDelta: 0, allocatedDiscountDelta: 0, netRevenueDelta: 0,
      costAmountDelta: 0, grossProfitDelta: 0, commissionAmountDelta: amount,
      employeeSnapshot: { id: workingId }, itemSnapshot: { id: menuItem.id }, ruleSnapshot: { type: 'TEST' }
    } });
  }

  it('atomically creates ALL scope, includes resigned-in-period staff, and generates snapshot identity', async () => {
    const result = await service.create(
      { branchId, month: '2026-09', scope: 'ALL', employeeIds: [] },
      actor,
      'create-all-202609'
    );

    expect(result).toMatchObject({ code: 'BL202609001', name: 'Bảng lương tháng 9/2026', status: 'CALCULATED' });
    const stored = await prismaTest.employeePayrollBatch.findUniqueOrThrow({ where: { id: result.id }, include: { lines: true } });
    expect(stored.lines.map(line => line.employeeId).sort((a, b) => a - b)).toEqual([workingId, resignedId].sort((a, b) => a - b));
    expect(stored.lines.find(line => line.employeeId === workingId)).toMatchObject({ activeCalendarDays: 30, grossAmount: 12_000_000 });
    expect(stored.lines.find(line => line.employeeId === resignedId)).toMatchObject({ activeCalendarDays: 15 });
    expect(stored.lines[0].sourceSnapshot).toMatchObject({
      settings: {
        payrollPolicy: { revision: 1, effectiveFrom: '1970-01-01' },
        attendancePolicies: [],
        workweekPolicies: [{ revision: 1, effectiveFrom: '1970-01-01' }],
        holidays: []
      }
    });
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_PAYROLL_CREATED', targetId: result.id } })).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('employee-payroll:changed', expect.objectContaining({
      batchId: result.id,
      branchId,
      employeeIds: [workingId, resignedId].sort((a, b) => a - b)
    }));
  });

  it('caps negative commission, carries the remainder, and releases finalized allocations on unpaid cancellation', async () => {
    const positive = await seedCommissionEntry(100_000, '2026-09-10');
    const negative = await seedCommissionEntry(-12_200_000, '2026-09-20');
    const created = await service.create(
      { branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [workingId] }, actor, 'commission-payroll-create'
    );
    let stored = await prismaTest.employeePayrollBatch.findUniqueOrThrow({ where: { id: created.id }, include: { lines: true, commissionAllocations: true } });
    expect(stored).toMatchObject({ totalCommissionAmount: -12_000_000, totalCommissionDeferredDebitAmount: 100_000, totalNetAmount: 0 });
    expect(stored.lines[0]).toMatchObject({ commissionAmount: -12_000_000, commissionDeferredDebitAmount: 100_000, netAmount: 0 });
    expect(stored.commissionAllocations.map(item => [item.commissionEntryId, item.allocatedAmount])).toEqual([
      [positive.id, 100_000], [negative.id, -12_100_000]
    ]);

    await service.recalculate(created.id, actor, 'commission-payroll-recalculate');
    expect(await prismaTest.commissionPayrollAllocation.count({ where: { payrollBatchId: created.id, type: 'RELEASED' } })).toBe(2);
    expect(await prismaTest.commissionPayrollAllocation.count({ where: { payrollBatchId: created.id, type: 'RESERVED' } })).toBe(4);
    await service.finalize(created.id, actor, 'commission-payroll-finalize');
    expect(await prismaTest.commissionPayrollAllocation.count({ where: { payrollBatchId: created.id, type: 'FINALIZED' } })).toBe(2);
    const nextPeriod = await service.create(
      { branchId, month: '2026-10', scope: 'CUSTOM', employeeIds: [workingId] }, actor, 'commission-payroll-next-period'
    );
    const nextStored = await prismaTest.employeePayrollBatch.findUniqueOrThrow({ where: { id: nextPeriod.id }, include: { lines: true } });
    expect(nextStored.lines[0]).toMatchObject({ commissionAmount: -100_000, commissionDeferredDebitAmount: 0, netAmount: 11_900_000 });

    await service.cancel(created.id, { reason: 'Hủy kỳ chưa chi để lập lại' }, actor);
    expect(await prismaTest.commissionPayrollAllocation.count({ where: { payrollBatchId: created.id, type: 'RELEASED' } })).toBe(4);
  });

  it('rolls back the whole custom batch when one employee does not exist', async () => {
    await expect(service.create(
      { branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [workingId, 999_999] },
      actor,
      'create-invalid-employee'
    )).rejects.toMatchObject({ statusCode: 404, code: 'EMPLOYEE_NOT_FOUND' });

    expect(await prismaTest.employeePayrollBatch.count()).toBe(0);
    expect(await prismaTest.employeePayrollLine.count()).toBe(0);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_PAYROLL_CREATED' } })).toBe(0);
    expect(emit).not.toHaveBeenCalled();
  });

  it('persists a complete DRAFT snapshot when one included employee has a finalization blocker', async () => {
    await prismaTest.employeeCompensation.deleteMany({ where: { employeeId: resignedId } });

    const result = await service.create(
      { branchId, month: '2026-09', scope: 'ALL', employeeIds: [] }, actor, 'create-draft-202609'
    );
    const stored = await prismaTest.employeePayrollBatch.findUniqueOrThrow({ where: { id: result.id }, include: { lines: true } });

    expect(stored.status).toBe('DRAFT');
    expect(stored.lines).toHaveLength(2);
    expect(stored.lines.find(line => line.employeeId === resignedId)).toMatchObject({ calculationStatus: 'REVIEW_REQUIRED', grossAmount: 0 });
  });

  it('replays the same idempotency request and rejects reuse with a different digest', async () => {
    const first = await service.create(
      { branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [workingId] }, actor, 'stable-create-key'
    );
    const replay = await service.create(
      { branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [workingId] }, actor, 'stable-create-key'
    );

    expect(replay).toEqual(first);
    expect(await prismaTest.employeePayrollBatch.count()).toBe(1);
    expect(emit).toHaveBeenCalledTimes(1);
    await expect(service.create(
      { branchId, month: '2026-08', scope: 'CUSTOM', employeeIds: [workingId] }, actor, 'stable-create-key'
    )).rejects.toMatchObject({ statusCode: 409, code: 'PAYROLL_IDEMPOTENCY_KEY_REUSED' });
  });

  it('recalculates current sources atomically while preserving active adjustments', async () => {
    const created = await service.create(
      { branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [workingId] }, actor, 'create-for-recalc'
    );
    const line = await prismaTest.employeePayrollLine.findFirstOrThrow({ where: { payrollBatchId: created.id } });
    await prismaTest.employeePayrollAdjustment.create({
      data: { payrollLineId: line.id, type: 'BONUS', amount: 500_000, reason: 'Thưởng hiệu suất', createdByUserId: actor.id }
    });
    await prismaTest.employeeCompensation.create({
      data: { employeeId: workingId, payBasis: 'MONTHLY', baseRate: 18_000_000, effectiveFrom: day('2026-09-16'), createdByUserId: actor.id }
    });

    const recalculated = await service.recalculate(created.id, actor, 'recalculate-202609');
    const stored = await prismaTest.employeePayrollBatch.findUniqueOrThrow({
      where: { id: created.id }, include: { lines: { include: { adjustments: true } } }
    });

    expect(recalculated).toMatchObject({ id: created.id, status: 'CALCULATED', version: 2, totalGrossAmount: 15_000_000, totalNetAmount: 15_500_000 });
    expect(stored.lines[0]).toMatchObject({ grossAmount: 15_000_000, bonusAmount: 500_000, netAmount: 15_500_000, remainingAmount: 15_500_000 });
    expect(stored.lines[0].adjustments).toHaveLength(1);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_PAYROLL_RECALCULATED', targetId: created.id } })).toBe(1);

    expect(await service.recalculate(created.id, actor, 'recalculate-202609')).toEqual(recalculated);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_PAYROLL_RECALCULATED', targetId: created.id } })).toBe(1);
  });

  it('appends and reverses adjustments while recomputing line and batch totals atomically', async () => {
    const created = await service.create(
      { branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [workingId] }, actor, 'create-for-adjustment'
    );
    const line = await prismaTest.employeePayrollLine.findFirstOrThrow({ where: { payrollBatchId: created.id } });

    const adjustment = await service.addAdjustment(created.id, line.id, {
      type: 'BONUS', amount: 500_000, reason: 'Thưởng hiệu suất'
    }, actor);
    let stored = await prismaTest.employeePayrollBatch.findUniqueOrThrow({ where: { id: created.id }, include: { lines: true } });
    expect(adjustment).toMatchObject({ type: 'BONUS', amount: 500_000, reversedAt: null });
    expect(stored).toMatchObject({ totalAdjustmentAmount: 500_000, totalNetAmount: 12_500_000, totalRemainingAmount: 12_500_000 });
    expect(stored.lines[0]).toMatchObject({ bonusAmount: 500_000, netAmount: 12_500_000, remainingAmount: 12_500_000 });

    await service.reverseAdjustment(created.id, line.id, adjustment.id, { reason: 'Thưởng nhập nhầm' }, actor);
    stored = await prismaTest.employeePayrollBatch.findUniqueOrThrow({ where: { id: created.id }, include: { lines: true } });
    expect(stored).toMatchObject({ totalAdjustmentAmount: 0, totalNetAmount: 12_000_000, totalRemainingAmount: 12_000_000 });
    expect(stored.lines[0]).toMatchObject({ bonusAmount: 0, netAmount: 12_000_000, remainingAmount: 12_000_000 });
    await expect(service.reverseAdjustment(created.id, line.id, adjustment.id, { reason: 'Đảo lần nữa' }, actor))
      .rejects.toMatchObject({ statusCode: 409, code: 'PAYROLL_STATE_INVALID' });
  });

  it('finalizes only blocker-free calculated batches and replays the same request identity', async () => {
    const created = await service.create(
      { branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [workingId] }, actor, 'create-for-finalize'
    );
    const finalized = await service.finalize(created.id, actor, 'finalize-stable-key');

    expect(finalized).toMatchObject({ id: created.id, status: 'FINALIZED', version: 2 });
    expect(await service.finalize(created.id, actor, 'finalize-stable-key')).toEqual(finalized);
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_PAYROLL_FINALIZED', targetId: created.id } })).toBe(1);
    await expect(service.finalize(created.id, actor, 'finalize-other-key'))
      .rejects.toMatchObject({ statusCode: 409, code: 'PAYROLL_STATE_INVALID' });

    await prismaTest.employeeCompensation.deleteMany({ where: { employeeId: resignedId } });
    const draft = await service.create(
      { branchId, month: '2026-08', scope: 'CUSTOM', employeeIds: [resignedId] }, actor, 'create-blocked-finalize'
    );
    expect(draft.status).toBe('DRAFT');
    await expect(service.finalize(draft.id, actor, 'finalize-blocked-key'))
      .rejects.toMatchObject({ statusCode: 409, code: 'PAYROLL_ATTENDANCE_UNRESOLVED' });
  });

  it('cancels calculated or finalized-unpaid batches with audit while preserving line history', async () => {
    const calculated = await service.create(
      { branchId, month: '2026-09', scope: 'CUSTOM', employeeIds: [workingId] }, actor, 'create-for-cancel'
    );
    const cancelled = await service.cancel(calculated.id, { reason: 'Tạo nhầm kỳ lương' }, actor);
    expect(cancelled).toMatchObject({ id: calculated.id, status: 'CANCELLED', cancelReason: 'Tạo nhầm kỳ lương' });
    expect(await prismaTest.employeePayrollLine.count({ where: { payrollBatchId: calculated.id } })).toBe(1);

    const finalizedCandidate = await service.create(
      { branchId, month: '2026-08', scope: 'CUSTOM', employeeIds: [workingId] }, actor, 'create-finalized-cancel'
    );
    await service.finalize(finalizedCandidate.id, actor, 'finalize-before-cancel');
    const finalizedCancelled = await service.cancel(finalizedCandidate.id, { reason: 'Hủy bảng chưa chi trả' }, actor);
    expect(finalizedCancelled.status).toBe('CANCELLED');
    expect(await prismaTest.auditLog.count({ where: { action: 'EMPLOYEE_PAYROLL_CANCELLED' } })).toBe(2);
  });
});
