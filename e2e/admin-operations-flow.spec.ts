import { test, expect } from '@playwright/test';

test.describe('E2E Flow: Admin Operations & Reporting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should login as admin, inspect reporting, and open table operations', async ({ page }) => {
    // 1. Login using Admin Demo Button
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    const adminBtn = page.getByTestId('demo-btn-admin');
    await expect(adminBtn).toBeVisible({ timeout: 10000 });
    await adminBtn.click();

    // 2. Reports is the default Admin screen from the workspace sidebar
    const reportsTab = page.getByTestId('tab-reports');
    await expect(reportsTab).toBeVisible({ timeout: 10000 });
    await expect(reportsTab.getByText('Báo cáo')).toBeVisible();
    await page.getByTestId('reports-workspace-sales').click();

    const kpiRevenue = page.getByTestId('kpi-revenue');
    const kpiOrders = page.getByTestId('kpi-orders');
    const kpiAov = page.getByTestId('kpi-aov');
    const kpiSos = page.getByTestId('kpi-sos');

    await expect(kpiRevenue).toBeVisible({ timeout: 8000 });
    await expect(kpiOrders).toBeVisible();
    await expect(kpiAov).toBeVisible();
    await expect(kpiSos).toBeVisible();
    await expect(kpiRevenue.getByText('Doanh thu thuần')).toBeVisible();
    await expect(kpiOrders.getByText('Đơn hàng')).toBeVisible();
    await expect(kpiAov.getByText('Giá trị đơn TB')).toBeVisible();
    await expect(kpiSos.getByText('Tốc độ phục vụ')).toBeVisible();

    // Verify Top 5 Sellers section
    await expect(page.getByRole('heading', { name: 'Món bán chạy' })).toBeVisible();

    // 3. Navigate to Menu Screen directly from workspace sidebar
    const menuTab = page.getByTestId('tab-menu');
    await expect(menuTab).toBeVisible();
    await expect(menuTab.getByText('Thực đơn')).toBeVisible();
    await menuTab.click();

    // Menu Management: Verify filters, actions, items, and availability controls.
    await expect(page.getByRole('textbox', { name: 'Tìm món' })).toBeVisible();
    await expect(page.getByTestId('admin-btn-add-item')).toContainText('Món mới');

    const firstSwitch = page.locator('[data-testid^="menu-item-switch-"]').first();
    await expect(firstSwitch).toBeVisible({ timeout: 8000 });
    const switchBounds = await firstSwitch.boundingBox();
    expect(switchBounds!.width).toBeGreaterThanOrEqual(44);
    expect(switchBounds!.height).toBeGreaterThanOrEqual(44);

    // 6. Navigate to Table Map to verify Admin Void functionality
    const tablesTab = page.getByTestId('tab-tables');
    await expect(tablesTab).toBeVisible();
    await tablesTab.click();

    // Table operations expose status filters and readable status text.
    const allTablesFilter = page.getByRole('button', { name: /^Tất cả \(\d+\)$/ });
    await expect(allTablesFilter).toBeVisible();
    const totalTables = Number((await allTablesFilter.textContent())!.match(/\((\d+)\)/)![1]);
    // Other lifecycle tests may have created orders. Verify the live filter counts,
    // rather than assuming every project starts with twelve empty tables.
    const counts: number[] = [];
    for (const label of ['Bàn trống', 'Đang phục vụ', 'Chờ dọn']) {
      const filter = page.getByRole('button', { name: new RegExp(`^${label} \\(\\d+\\)$`) });
      await expect(filter).toBeVisible();
      counts.push(Number((await filter.textContent())!.match(/\((\d+)\)/)![1]));
    }
    expect(counts.reduce((total, count) => total + count, 0)).toBe(totalTables);
    await expect(page.getByText('Sẵn sàng', { exact: true }).first()).toBeVisible();

    // Check Table 01
    const table1Card = page.getByTestId('table-card-1');
    await expect(table1Card).toBeVisible({ timeout: 8000 });
    await table1Card.click();

    // Check if table modal opened
    const tableModal = page.getByTestId('table-detail-modal');
    await expect(tableModal).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('table-detail-title')).toContainText('Bàn 01');
  });

  test('shows a mobile-first customer table ordering flow without internal system wording', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/?table=4&token=QR-TABLE-04');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Bàn 04', { exact: true })).toBeVisible({ timeout: 10000 });
    const addMoreBtn = page.getByRole('button', { name: 'Gọi thêm món' });
    if (await addMoreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addMoreBtn.click();
    }
    await expect(page.getByRole('heading', { name: 'Thực đơn' })).toBeVisible({ timeout: 10000 });

    await page.getByText('Gà Rán Giòn Cay (3 Miếng)', { exact: true }).click();
    await page.getByTestId('btn-modal-add-to-cart').click();
    const cartSummary = page.getByTestId('customer-cart-summary');
    await expect(cartSummary).toBeVisible();
    await expect(cartSummary).toContainText('Xem giỏ hàng');
    await expect(cartSummary).toContainText('(1)');
    await expect(cartSummary.getByRole('button', { name: 'Gửi món' })).toBeVisible();

    await expect(page.locator('body')).not.toContainText(/\b(?:KDS|POS)\b/);
  });
});
