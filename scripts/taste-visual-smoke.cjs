const { chromium } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const QRCode = require('qrcode');

const root = path.resolve(process.argv[2] || 'frontend/dist');
const output = path.resolve(process.argv[3] || 'visual-smoke-shots');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.ttf': 'font/ttf', '.png': 'image/png' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' || !path.extname(pathname) ? '/index.html' : pathname));
    if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error('outside preview');
    const content = await fs.readFile(file);
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});

async function run() {
  await fs.mkdir(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true }).catch(() => chromium.launch({ channel: 'chrome', headless: true }));
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const qrUrl = await QRCode.toDataURL('Crispy Bite UI fixture');
    for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', async route => {
        const endpoint = new URL(route.request().url()).pathname;
        const item = { id: 1, name: 'Gà giòn sốt cay', basePrice: 79000, isAvailable: true, description: 'Gà giòn, sốt cay', imageUrl: url + '/missing.jpg', modifierGroups: [] };
        const table = { id: 1, tableNumber: 1, capacity: 4, status: 'AVAILABLE', orders: [] };
        const order = { id: 1, code: 'DH0001', orderType: 'DINE_IN', status: 'PENDING', tableId: 1, tableNumber: 1, createdAt: new Date().toISOString(), items: [{ id: 1, menuItemId: 1, menuItemName: item.name, quantity: 2 }] };
        const booking = { code: 'DB0001', accessToken: 'fixture', status: 'PENDING_DEPOSIT', depositStatus: 'UNPAID', depositAmount: 100000, scheduledAt: new Date().toISOString(), partySize: 4, transferContent: 'COC DB0001', tableOrder: null, paymentInstructions: { qrUrl, bankId: 'Ngân hàng mẫu', accountNumber: '000000', accountName: 'CRISPY BITE' } };
        const invoices = { items: [{ ...order, customerName: 'Khách tại bàn', paymentStatus: 'PAID', paymentMethod: 'CASH', totalGoods: 158000, discountAmount: 0, totalAfterDiscount: 158000, vatAmount: 12640, finalAmount: 170640, paidAmount: 170640, itemCount: 2 }], pagination: { page: 1, pageSize: 25, totalRows: 1, totalPages: 1 }, summary: { totalGoods: 158000, totalDiscount: 0, totalAfterDiscount: 158000, totalVat: 12640, totalFinal: 170640, totalPaid: 170640 } };
        const ledger = { page: 1, pageSize: 25, items: [], balanceSummary: { openingBalance: 800000, closingBalance: 950000, accountCount: 1 }, filteredSummary: { rowCount: 0, totalReceipts: 150000, totalPayments: 0, netMovement: 150000 } };
        const data = endpoint === '/api/menu' ? { categories: [{ id: 1, name: 'Gà giòn', menuItems: [item, { ...item, id: 2, name: 'Khoai tây chiên' }] }] }
          : endpoint === '/api/tables' ? { tables: [table] } : endpoint.startsWith('/api/tables/qr/') ? { table }
          : endpoint === '/api/orders' ? [order] : endpoint === '/api/inventory/low-stock-alerts' ? []
          : endpoint === '/api/reservations/public/fixture' ? booking : endpoint === '/api/orders/invoices' ? invoices
          : endpoint === '/api/cashbook' ? ledger : endpoint === '/api/cashbook/settings' ? { activatedAt: order.createdAt, accounts: [], categories: [] }
          : null;
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
        await route.fulfill(data === null
          ? { headers, status: 503, json: { error: { message: 'Dữ liệu chưa có trong bản kiểm thử giao diện' } } }
          : { headers, json: { data } });
      });
      await page.routeWebSocket('**/socket.io/**', socket => socket.close());
      const capture = async name => {
        await page.evaluate(() => document.fonts.ready.then(() => true));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        if (overflow) {
          const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('[style*="overflow"]')).slice(0, 6).map(el => ({ text: el.textContent.slice(0, 90), bounds: el.getBoundingClientRect().right })));
          console.warn(`${name} ${width}: horizontal overflow`, offenders);
        }
        await page.screenshot({ path: path.join(output, `${name}-${width}.png`), animations: 'disabled' });
      };
      await page.goto(url);
      await page.getByTestId('btn-login').waitFor();
      await capture('login-light');
      await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
      await capture('login-dark');
      await page.evaluate(() => {
        localStorage.setItem('crispy_token', 'fixture');
        localStorage.setItem('crispy_user', JSON.stringify({ id: 1, username: 'cashier', name: 'Thu ngân', role: 'CASHIER' }));
      });
      await page.reload();
      await page.getByTestId('btn-logout').waitFor();
      await page.getByTestId('menu-item-1').waitFor();
      await capture('pos');
      await page.getByTestId('menu-item-1').click();
      await page.getByTestId('btn-open-checkout').first().click();
      await capture('pos-checkout');
      await page.reload();
      await page.getByTestId('menu-item-1').waitFor();
      await page.getByTestId('tab-tables').click();
      await page.getByTestId('table-card-1').waitFor();
      await capture('tables');
      await page.getByTestId('table-card-1').click();
      await page.getByTestId('table-detail-modal').waitFor();
      await capture('table-detail');
      await page.evaluate(() => {
        localStorage.setItem('crispy_user', JSON.stringify({ id: 2, username: 'kitchen', name: 'Bếp', role: 'KITCHEN' }));
      });
      await page.reload();
      await page.getByTestId('kds-card-DH0001').waitFor({ timeout: 8000 }).catch(async error => {
        console.error('KDS:', errors, (await page.locator('body').innerText()).slice(0, 1000));
        throw error;
      });
      await capture('kds');
      await page.evaluate(() => localStorage.clear());
      await page.goto(url + '/?booking=1');
      await page.getByRole('heading', { name: 'Đặt bàn tại Crispy Bite' }).waitFor();
      await capture('booking');
      await page.goto(url + '/kiosk-cham-cong');
      await capture('attendance-kiosk');
      await page.goto(url + '/?bookingToken=fixture');
      await page.getByText('Mã đặt bàn DB0001').waitFor();
      await capture('booking-deposit');
      await page.goto(url + '/?table=1&token=fixture');
      await page.getByTestId('menu-item-1').waitFor();
      await capture('qr-menu');
      await page.getByTestId('menu-item-1').click();
      await page.getByTestId('customer-cart-summary').waitFor();
      await capture('qr-cart-summary');
      await page.evaluate(() => {
        localStorage.setItem('crispy_token', 'fixture');
        localStorage.setItem('crispy_user', JSON.stringify({ id: 3, username: 'admin', name: 'Quản trị', role: 'ADMIN' }));
      });
      await page.goto(url);
      for (const [tab, name] of [
        ['orders', 'invoices'], ['cashbook', 'cashbook'], ['reports', 'reports'],
        ['inventory', 'inventory'], ['employees', 'employees'], ['menu', 'menu-admin'],
        ['pricing', 'pricing'], ['customers', 'customers'], ['vouchers', 'vouchers'],
        ['reservations', 'reservations-admin'], ['audit', 'audit']
      ]) {
        await page.getByTestId('tab-' + tab).click();
        if (tab === 'orders') {
          await page.getByText('DH0001', { exact: true }).waitFor();
          const heading = await page.getByRole('heading', { name: 'Hóa đơn', exact: true }).boundingBox();
          if (heading && heading.width < 180) throw new Error(`Invoice heading too narrow at ${width}px`);
        }
        if (tab === 'cashbook') await page.getByText('Số dư thực của quỹ', { exact: true }).waitFor();
        await capture(name);
      }
      await page.getByTestId('tab-orders').click();
      for (const [label, name] of [['Trả hàng', 'sales-returns'], ['Đối tác giao hàng', 'delivery-partners']]) {
        await page.getByRole('tab', { name: label, exact: true }).click();
        await capture(name);
      }
      await page.getByRole('tab', { name: 'Trả hàng', exact: true }).click();
      await page.getByRole('button', { name: 'Trả hàng', exact: true }).first().click();
      await page.getByText('Chọn hóa đơn trả hàng', { exact: true }).waitFor();
      await capture('sales-return-selector');
      await page.getByLabel('Đóng chọn hóa đơn').click();
      await page.getByTestId('tab-tables').click();
      await page.getByRole('button', { name: 'Danh sách phòng/bàn' }).click();
      await capture('table-management');
      await page.getByRole('button', { name: 'Thêm phòng/bàn', exact: true }).first().click();
      await page.getByText('Mã QR được tạo tự động và giữ nguyên khi cập nhật.').waitFor();
      await capture('table-management-form');
      if (width === 390) {
        const input = await page.getByPlaceholder('Tạo khu vực mới').boundingBox();
        const button = await page.getByRole('button', { name: 'Tạo khu vực' }).boundingBox();
        const next = await page.getByText('Số thứ tự', { exact: true }).boundingBox();
        console.log('table form geometry', { input, button, next });
        if (input && button && next && (button.y < input.y + input.height || next.y < button.y + button.height)) throw new Error('Table form controls overlap');
      }
      await page.getByLabel('Đóng', { exact: true }).last().click();
      await page.getByTestId('tab-inventory').click();
      for (const [label, name] of [
        ['Phiếu nhập hàng', 'inventory-receipts'], ['Kiểm kho', 'inventory-checks'],
        ['Xuất hủy', 'inventory-wastes'], ['Trả hàng nhập', 'inventory-returns'],
        ['Nhà cung cấp', 'inventory-suppliers'], ['Quản lý nguyên liệu / BOM', 'inventory-bom']
      ]) {
        await page.getByText(label, { exact: true }).first().click();
        await capture(name);
      }
      await page.getByTestId('tab-employees').click();
      for (const [section, name] of [
        ['directory', 'employee-directory'], ['schedule', 'employee-schedule'],
        ['attendance', 'employee-attendance'], ['payroll', 'employee-payroll'],
        ['commission', 'employee-commission'], ['settings', 'employee-settings']
      ]) {
        await page.getByTestId('employee-workspace-' + section).click();
        await capture(name);
      }
      await page.getByTestId('employee-workspace-directory').click();
      await page.getByTestId('employee-add').click();
      await page.getByTestId('employee-name').waitFor();
      await capture('employee-form');
      await page.getByTestId('employee-form-tab-salary').click();
      await capture('employee-salary-form');
      await page.getByRole('button', { name: 'Đóng', exact: true }).last().click();
      await page.getByTestId('tab-menu').click();
      await page.getByTestId('admin-btn-add-item').click();
      await capture('menu-item-form');
      await page.getByRole('button', { name: 'Đóng biểu mẫu' }).click();
      await page.getByTestId('tab-vouchers').click();
      await page.getByRole('button', { name: 'Tạo voucher' }).click();
      await capture('voucher-form');
      await page.getByLabel('Đóng modal').click();
      await page.getByTestId('tab-reports').click();
      await page.getByTestId('reports-workspace-sales').click();
      await capture('reports-sales');
      await page.getByTestId('tab-inventory').click();
      for (const [section, action, name] of [
        ['Phiếu nhập hàng', 'Nhập hàng', 'receipt-composer'],
        ['Kiểm kho', 'Kiểm kho', 'check-composer'],
        ['Xuất hủy', 'Xuất hủy', 'waste-composer'],
        ['Trả hàng nhập', 'Trả hàng nhập', 'return-composer']
      ]) {
        await page.getByText(section, { exact: true }).first().click();
        await page.getByRole('button', { name: action, exact: true }).last().click();
        await capture(name);
      }
      await page.getByRole('button', { name: 'Chuyển sang giao diện tối' }).click();
      await capture('inventory-dark');
      await page.getByTestId('tab-employees').click();
      await capture('employees-dark');
      await page.getByTestId('tab-reports').click();
      await capture('reports-dark');
      if (errors.length) throw new Error(errors.join('\n'));
      console.log(`${width}x${height}: P0 and 11 admin entry screens inspected`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
