import { expect, test } from '@playwright/test';

const dishName = 'Gà Rán Giòn Cay (3 Miếng)';

function assertTestDatabase() {
  const development = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!development || !testUrl || development !== testUrl || new URL(testUrl).pathname !== '/crispy_bite_test') {
    throw new Error('QR E2E chỉ được chạy với DATABASE_URL trỏ tới crispy_bite_test');
  }
}

test('khách QR đặt món sau check-in, bếp chỉ nhận sau xác nhận thanh toán', async ({ page, request }) => {
  test.setTimeout(90_000);
  assertTestDatabase();
  const cashierLogin = await request.post('/api/auth/login', { data: { username: 'cashier', password: 'cashier123' } });
  expect(cashierLogin.ok(), await cashierLogin.text()).toBeTruthy();
  const cashierToken = (await cashierLogin.json()).data.token as string;
  const kitchenLogin = await request.post('/api/auth/login', { data: { username: 'kitchen', password: 'kitchen123' } });
  expect(kitchenLogin.ok(), await kitchenLogin.text()).toBeTruthy();
  const kitchenToken = (await kitchenLogin.json()).data.token as string;
  const cashierHeaders = { Authorization: `Bearer ${cashierToken}` };
  const kitchenHeaders = { Authorization: `Bearer ${kitchenToken}` };
  const settingsResponse = await request.get('/api/cashbook/settings', { headers: cashierHeaders });
  expect(settingsResponse.ok()).toBeTruthy();
  const accounts = (await settingsResponse.json()).data.accounts as Array<{ id: number; type: string; isActive: boolean }>;
  let bankAccount = accounts.find(account => account.type === 'BANK' && account.isActive);
  if (!bankAccount) {
    const adminLogin = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin123' } });
    expect(adminLogin.ok(), await adminLogin.text()).toBeTruthy();
    const adminToken = (await adminLogin.json()).data.token as string;
    const created = await request.post('/api/cashbook/accounts', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { code: `E2E_BANK_${Date.now()}`, name: 'Ngân hàng E2E', type: 'BANK', bankName: 'Test bank', isDefault: true }
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    bankAccount = (await created.json()).data;
  }
  expect(bankAccount).toBeDefined();

  const tablesResponse = await request.get('/api/tables/public');
  expect(tablesResponse.ok()).toBeTruthy();
  const tables = (await tablesResponse.json()).data.tables as Array<{ id: number; tableNumber: number; capacity: number; status: string; qrCodeToken: string }>;
  const table = tables.find(row => row.status === 'AVAILABLE' && row.capacity >= 2 && row.qrCodeToken);
  expect(table).toBeDefined();

  const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const bookingResponse = await request.post('/api/reservations', { data: {
    name: 'Khách E2E QR', phone: `09${unique.slice(-8)}`,
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), partySize: 2
  } });
  expect(bookingResponse.ok(), await bookingResponse.text()).toBeTruthy();
  const booking = (await bookingResponse.json()).data as { code: string; accessToken: string; depositAmount: number };
  const declaration = await request.post(`/api/reservations/public/${booking.accessToken}/payment-declaration`, { data: {} });
  expect(declaration.ok(), await declaration.text()).toBeTruthy();
  const listResponse = await request.get(`/api/reservations?search=${encodeURIComponent(booking.code)}`, { headers: cashierHeaders });
  expect(listResponse.ok()).toBeTruthy();
  const reservation = (await listResponse.json()).data.items.find((row: { code: string }) => row.code === booking.code) as { id: number };
  expect(reservation).toBeDefined();
  const deposit = await request.post(`/api/reservations/${reservation.id}/deposit/confirm`, {
    headers: cashierHeaders,
    data: { amount: booking.depositAmount, paymentMethod: 'BANK_TRANSFER', financialAccountId: bankAccount!.id, externalReference: `E2E-COC-${unique}` }
  });
  expect(deposit.ok(), await deposit.text()).toBeTruthy();
  const checkIn = await request.post(`/api/reservations/${reservation.id}/check-in`, { headers: cashierHeaders, data: { tableId: table!.id } });
  expect(checkIn.ok(), await checkIn.text()).toBeTruthy();

  await page.goto(`/?table=${table!.tableNumber}&token=${encodeURIComponent(table!.qrCodeToken)}&reservationToken=${encodeURIComponent(booking.accessToken)}`);
  await expect(page.getByText(dishName, { exact: true })).toBeVisible();
  await page.getByText(dishName, { exact: true }).click();
  await page.getByTestId('btn-modal-add-to-cart').click();
  await page.getByRole('button', { name: /Xem giỏ hàng có 1 món/ }).click();
  for (let quantity = 1; quantity < 4; quantity++) {
    await page.getByRole('button', { name: `Tăng số lượng ${dishName}` }).click();
  }

  const paymentResponsePromise = page.waitForResponse(response => /\/api\/orders\/\d+\/payment-declaration$/.test(response.url()) && response.request().method() === 'POST');
  await page.getByTestId('customer-cart-modal').getByRole('button', { name: /Tạo order & thanh toán trước/ }).click();
  const paymentResponse = await paymentResponsePromise;
  expect(paymentResponse.ok(), await paymentResponse.text()).toBeTruthy();
  const payment = (await paymentResponse.json()).data as { order: { id: number; code: string; paymentStatus: string }; amountDue: number };
  expect(payment.amountDue).toBeGreaterThan(0);
  expect(payment.order.paymentStatus).toBe('WAITING_CONFIRMATION');
  await expect(page.getByText(`Thanh toán order ${payment.order.code}`)).toBeVisible();

  const before = await request.get('/api/orders?status=PENDING', { headers: kitchenHeaders });
  expect(before.ok()).toBeTruthy();
  expect((await before.json()).data).not.toContainEqual(expect.objectContaining({ id: payment.order.id }));
  const queue = await request.get('/api/orders/payment-confirmations', { headers: cashierHeaders });
  expect(queue.ok()).toBeTruthy();
  expect((await queue.json()).data).toContainEqual(expect.objectContaining({ id: payment.order.id, paymentStatus: 'WAITING_CONFIRMATION' }));

  const confirmed = await request.post(`/api/orders/${payment.order.id}/payment/confirm`, {
    headers: cashierHeaders,
    data: { amount: payment.amountDue, financialAccountId: bankAccount!.id, externalReference: `E2E-ORDER-${unique}` }
  });
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
  expect((await confirmed.json()).data.paymentStatus).toBe('PAID');
  const after = await request.get('/api/orders?status=PENDING', { headers: kitchenHeaders });
  expect((await after.json()).data).toContainEqual(expect.objectContaining({ id: payment.order.id, code: payment.order.code }));

  await page.goto('/');
  await page.getByTestId('demo-btn-kitchen').click();
  const ticket = page.getByTestId(`kds-card-${payment.order.code}`);
  await expect(ticket).toBeVisible();
  await expect(ticket).toContainText(dishName);
});
