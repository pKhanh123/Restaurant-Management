import { test, expect, type Page, type Locator } from '@playwright/test';

async function login(page: Page, role: 'cashier' | 'kitchen' | 'admin') {
  await page.goto('/');
  await page.getByTestId(`demo-btn-${role}`).click();
  await expect(page.getByTestId('btn-logout')).toBeVisible();
}

async function addFirstMenuItem(page: Page) {
  await page.locator('[data-testid^="menu-item-"]').first().click();
  const firstModifier = page.locator('[data-testid^="modifier-option-"]').first();
  if (await firstModifier.isVisible()) await firstModifier.click();
  await page.getByTestId('btn-modal-add-to-cart').click();
}

async function capture(page: Page, name: string, testInfo: { outputPath: (name: string) => string }) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function expectContentContained(cards: Locator) {
  const violations = await cards.evaluateAll(elements => elements.flatMap(card => {
    const bounds = card.getBoundingClientRect();
    return [...card.querySelectorAll('div')].filter(node => node.childElementCount === 0 && node.textContent?.trim()).flatMap(node => {
      const rect = node.getBoundingClientRect();
      return rect.left < bounds.left - 1 || rect.right > bounds.right + 1
        ? [`${node.textContent}: ${Math.round(rect.right)} outside ${Math.round(bounds.right)}`] : [];
    });
  }));
  expect(violations).toEqual([]);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`login remains usable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('img', { name: 'Crispy Bite' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chuyển sang giao diện tối' })).toBeVisible();
    await capture(page, 'login-light', testInfo);
    if (viewport.width === 390) await expect(page.getByTestId('demo-btn-admin')).toBeInViewport();
    await page.getByTestId('demo-btn-admin').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('demo-btn-admin')).toBeInViewport();
    await page.getByTestId('input-username').fill('cashier');
    await page.getByTestId('input-password').fill('cashier123');
    await page.getByTestId('btn-login').click();
    await expect(page.getByTestId('tab-pos')).toBeVisible();
  });
}

for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test(`POS keeps menu content and checkout accessible at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await login(page, 'cashier');
    const cards = page.locator('[data-testid^="menu-item-"]');
    await expect(cards.first()).toBeVisible();
    await expectContentContained(cards);
    await addFirstMenuItem(page);
    await expect(page.getByTestId('btn-open-checkout')).toBeInViewport();
    await capture(page, 'pos-light', testInfo);
    await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Chuyển sang giao diện sáng' })).toBeVisible();
    await capture(page, 'pos-dark-restored', testInfo);
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  test(`KDS tickets and actions remain reachable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await login(page, 'cashier');
    await addFirstMenuItem(page);
    await page.getByTestId('btn-open-checkout').click();
    await page.getByTestId('btn-takeaway').click();
    const createdResponse = page.waitForResponse(response => response.url().endsWith('/api/orders') && response.request().method() === 'POST');
    await page.getByTestId('btn-confirm-order').click();
    const createdOrder = (await (await createdResponse).json()).data.order;
    await page.getByTestId('btn-done-order').click();
    await page.getByTestId('btn-logout').click();
    await page.getByTestId('demo-btn-kitchen').click();
    await expect(page.getByRole('button', { name: 'Chuyển sang giao diện sáng' })).toBeVisible();
    const ticket = page.getByTestId(`kds-card-${createdOrder.code}`);
    await expect(ticket).toContainText(/Combo 1 Người|Món #\d+/);
    await expect(page.getByText('Đồng bộ ticket', { exact: true })).toBeVisible();
    const action = page.getByTestId(`kds-action-btn-${createdOrder.code}`);
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport();
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(52);
    await capture(page, 'kds-dark', testInfo);
    await action.click();
    if (viewport.width < 768) await page.getByRole('button', { name: /Đang chế biến/ }).click();
    const nextAction = ticket.getByRole('button', { name: 'Chuyển sang sẵn sàng', exact: true });
    await nextAction.scrollIntoViewIfNeeded();
    await expect(nextAction).toBeInViewport();
    await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).click();
    await capture(page, 'kds-light', testInfo);
  });
}

test('QR menu cards contain price and status at 390x844', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?table=4&token=QR-TABLE-04');
  await page.waitForLoadState('networkidle');
  const addMoreBtn = page.getByRole('button', { name: 'Gọi thêm món' });
  if (await addMoreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await addMoreBtn.click();
  }
  const cards = page.locator('[data-testid^="menu-item-"]');
  await expect(cards.first()).toBeVisible();
  await expectContentContained(cards);
  await page.getByText('Gà Rán Giòn Cay (3 Miếng)', { exact: true }).click();
  await page.getByTestId('btn-modal-add-to-cart').click();
  await expect(page.getByTestId('customer-cart-summary').getByRole('button', { name: 'Gửi món' })).toBeInViewport();
  await capture(page, 'qr-cart-light', testInfo);
});

test('Admin menu, reports and table actions fit at 1440x900', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'admin');
  await page.getByTestId('tab-menu').click();
  await expect(page.getByTestId('admin-btn-add-item')).toBeInViewport();
  await capture(page, 'admin-menu-light', testInfo);
  await page.getByTestId('admin-btn-add-item').click();
  await expect(page.getByRole('button', { name: 'Tạo món', exact: true })).toBeInViewport();
  await capture(page, 'admin-form-light', testInfo);
  await page.getByRole('button', { name: 'Đóng biểu mẫu' }).click();
  await page.getByTestId('tab-reports').click();
  await page.getByTestId('reports-workspace-sales').click();
  await expect(page.getByTestId('kpi-revenue')).toBeVisible();
  expect((await page.getByTestId('kpi-revenue').boundingBox())!.height).toBeGreaterThanOrEqual(100);
  await capture(page, 'admin-reports-light', testInfo);
  await page.getByTestId('tab-tables').click();
  await expect(page.getByTestId('table-card-1')).toBeVisible();
  await capture(page, 'tables-light', testInfo);
  await page.getByTestId('table-card-1').click();
  await capture(page, 'table-detail-light', testInfo);
});

test('font request failure still renders a usable login form', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\.(?:ttf|woff2?)(?:\?|$)/, route => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByTestId('input-username')).toBeVisible();
  await page.getByTestId('input-username').fill('cashier');
  await page.getByTestId('input-password').fill('cashier123');
  await capture(page, 'font-fallback', testInfo);
  await page.getByTestId('btn-login').click();
  await expect(page.getByTestId('tab-pos')).toBeVisible();
});

test('QR ordering requires a checked-in reservation before sending food', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?table=4&token=QR-TABLE-04');
  await page.waitForLoadState('networkidle');
  const addMoreBtn = page.getByRole('button', { name: 'Gọi thêm món' });
  if (await addMoreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await addMoreBtn.click();
  }
  const menuItem = page.getByText('Gà Rán Giòn Cay (3 Miếng)', { exact: true });
  await expect(menuItem).toBeVisible();
  await menuItem.click();
  await page.getByTestId('btn-modal-add-to-cart').click();
  await page.getByRole('button', { name: 'Gửi món', exact: true }).click();
  await expect(page.getByText('Đặt bàn cần được nhân viên check-in trước khi gọi món. Hãy đưa mã đặt chỗ cho nhân viên.')).toBeVisible();
  await capture(page, 'qr-checkin-required', testInfo);
});

test('KDS reports failed REST synchronization without claiming a socket connection', async ({ page }) => {
  await page.route('**/api/orders?status=*', route => route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE', message: 'Test synchronization unavailable' } } }));
  await login(page, 'kitchen');
  await expect(page.getByText('Đồng bộ ticket', { exact: true })).toBeVisible();
  await expect(page.getByText('Đồng bộ thất bại', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible();
  await expect(page.getByText('Đã kết nối', { exact: true })).toHaveCount(0);
});
