import * as XLSX from 'xlsx';

export const cashbookExportHeaders = ['Mã phiếu', 'Thời gian', 'Loại thu/chi', 'Tài khoản', 'Người nộp/nhận', 'Giá trị', 'Ghi chú', 'Trạng thái'] as const;

export type CashbookExportRow = {
  code: string;
  occurredAt: Date;
  categoryName: string;
  accountName: string;
  counterpartyName: string | null;
  signedValue: number;
  note: string | null;
  status: string;
};

const values = (row: CashbookExportRow): Array<string | number> => [
  row.code, row.occurredAt.toISOString(), row.categoryName, row.accountName,
  row.counterpartyName ?? '', row.signedValue, row.note ?? '', row.status
];

const csvCell = (value: string | number) => {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function serializeCashbookCsv(rows: CashbookExportRow[]): Buffer {
  const allRows = [cashbookExportHeaders, ...rows.map(values)];
  return Buffer.from(`\uFEFF${allRows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`, 'utf8');
}

export function serializeCashbookWorkbook(rows: CashbookExportRow[]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([[...cashbookExportHeaders], ...rows.map(values)]);
  sheet['!cols'] = cashbookExportHeaders.map(header => ({ wch: Math.max(header.length + 2, 16) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'So_quy');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
