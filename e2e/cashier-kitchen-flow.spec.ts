import { test, expect } from '@playwright/test';

test.describe('E2E Flow: Cashier to Kitchen Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to local Crispy Bite Web App
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should login as cashier, order combo with required modifier, send to kitchen, view receipt, and advance status in KDS', async ({ page }) => {
    // 1. Login using Cashier Demo Button
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    const cashierBtn = page.getByTestId('demo-btn-cashier');
    await expect(cashierBtn).toBeVisible({ timeout: 10000 });
    await cashierBtn.click();

    // Verify logged in and POS Tab is visible
    const posTab = page.getByTestId('tab-pos');
    await expect(posTab).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Bán hàng')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Thực đơn' })).toBeVisible();
    await expect(page.getByText('Giỏ hàng', { exact: true })).toBeVisible();

    // 2. Select first combo menu item (requires modifiers)
    const firstMenuItem = page.getByRole('button', { name: /Combo 1 Người: Gà Giòn/ });
    await expect(firstMenuItem).toBeVisible({ timeout: 8000 });
    await firstMenuItem.click();

    // 3. Modifier Modal appears
    const addToCartBtn = page.getByTestId('btn-modal-add-to-cart');
    await expect(addToCartBtn).toBeVisible({ timeout: 5000 });

    // If mandatory modifier is required, select the first available modifier option
    const firstModifierOpt = page.locator('[data-testid^="modifier-option-"]').first();
    if (await firstModifierOpt.isVisible()) {
      await firstModifierOpt.click();
    }

    // Confirm adding to cart
    await expect(addToCartBtn).toBeEnabled();
    await addToCartBtn.click();

    const cartSummary = page.getByTestId('pos-cart-summary');
    await expect(cartSummary).toBeVisible();
    await expect(cartSummary).toContainText('1 món');
    await expect(page.getByTestId('pos-cart-total')).toHaveText(/\d[\d.]*\s*₫/);

    // 4. Open Checkout
    const openCheckoutBtn = page.getByTestId('btn-open-checkout');
    await expect(openCheckoutBtn).toBeVisible({ timeout: 5000 });
    await openCheckoutBtn.click();

    // 5. Select Dine-in and choose table 01
    const dineInBtn = page.getByTestId('btn-dinein');
    await expect(dineInBtn).toBeVisible();
    await dineInBtn.click();

    const table1Btn = page.getByTestId('pos-table-option-1');
    if (await table1Btn.isVisible()) {
      await table1Btn.click();
    }

    // 6. Submit order to kitchen
    const confirmOrderBtn = page.getByTestId('btn-confirm-order');
    await expect(confirmOrderBtn).toBeVisible();
    await confirmOrderBtn.click();

    // 7. Verify success panel and view receipt
    const viewReceiptBtn = page.getByTestId('btn-view-receipt');
    await expect(viewReceiptBtn).toBeVisible({ timeout: 8000 });
    await viewReceiptBtn.click();

    // Assert thermal receipt modal is open and shows VAT
    const receiptModal = page.getByTestId('receipt-modal');
    await expect(receiptModal).toBeVisible({ timeout: 5000 });
    await expect(receiptModal.getByRole('img', { name: 'Crispy Bite' })).toBeVisible();
    await expect(receiptModal.getByRole('heading', { name: 'Hóa đơn bán hàng' })).toBeVisible();
    await expect(receiptModal.getByText('Thuế GTGT (VAT 8%)')).toBeVisible();
    await expect(receiptModal.getByText('Tổng thanh toán')).toBeVisible();
    await expect(receiptModal).toContainText('Combo 1 Người: Gà Giòn + Khoai + Nước');
    const createdOrderCode = (await receiptModal.getByText(/^CRISPY-\d{8}-\d{4}$/).textContent())?.trim();
    expect(createdOrderCode).toBeTruthy();

    // Close receipt modal
    const closeReceiptBtn = page.getByTestId('btn-close-receipt');
    if (await closeReceiptBtn.isVisible()) {
      await closeReceiptBtn.click();
    }

    // Done order
    const doneOrderBtn = page.getByTestId('btn-done-order');
    if (await doneOrderBtn.isVisible()) {
      await doneOrderBtn.click();
    }

    // 8. Logout
    const logoutBtn = page.getByTestId('btn-logout');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // 9. Login as Kitchen (KDS)
    const kitchenBtn = page.getByTestId('demo-btn-kitchen');
    await expect(kitchenBtn).toBeVisible({ timeout: 10000 });
    await kitchenBtn.scrollIntoViewIfNeeded();
    await kitchenBtn.click();

    // Verify KDS screen
    await expect(page.getByTestId('kds-screen-title')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Đồng bộ ticket', { exact: true })).toBeVisible();

    if ((page.viewportSize()?.width ?? 1280) >= 768) {
      await expect(page.getByRole('heading', { name: 'Chờ chế biến' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Đang chế biến' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Sẵn sàng' })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: /Chờ chế biến/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Đang chế biến/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Sẵn sàng/ })).toBeVisible();
    }

    const createdTicket = page.getByTestId(`kds-card-${createdOrderCode}`);
    await expect(createdTicket).toBeVisible();
    await expect(createdTicket).toContainText(createdOrderCode!);
    await expect(createdTicket).toContainText('Combo 1 Người: Gà Giòn + Khoai + Nước');

    // Verify at least one order action button is visible and transition it
    const kdsActionBtn = page.getByTestId(`kds-action-btn-${createdOrderCode}`);
    if (await kdsActionBtn.isVisible()) {
      await kdsActionBtn.click();
      if ((page.viewportSize()?.width ?? 1280) < 768) {
        await page.getByRole('button', { name: /Đang chế biến/ }).click();
        await expect(createdTicket).toBeVisible();
      }
      await expect(kdsActionBtn).toContainText('Chuyển sang sẵn sàng');
    }
  });
});
