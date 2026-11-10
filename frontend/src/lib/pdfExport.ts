import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const sharedPrintStyles = `
  :root { color-scheme: light; font-family: Arial, "Helvetica Neue", sans-serif; color: #24211f; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; font-size: 10pt; line-height: 1.5; }
  @page { size: A4; margin: 15mm 16mm 17mm; }
  @media print {
    html, body { width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
  }
  .document { max-width: 178mm; margin: 0 auto; }
  .brand { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #b42318; padding-bottom: 16px; }
  .brand-mark { display: grid; place-items: center; width: 42px; height: 42px; flex: 0 0 42px; border-radius: 13px; background: #b42318; color: #fff; font-size: 13pt; font-weight: 800; letter-spacing: -.08em; }
  .brand-name { margin: 0; color: #24211f; font-size: 16pt; font-weight: 800; letter-spacing: .025em; }
  .brand-caption { margin-top: 2px; color: #706962; font-size: 8pt; }
  .document-type { margin-left: auto; color: #b42318; font-size: 8pt; font-weight: 700; letter-spacing: .1em; text-align: right; text-transform: uppercase; }
  .document-title { margin: 24px 0 4px; font-size: 22pt; line-height: 1.15; letter-spacing: -.035em; }
  .document-subtitle { margin: 0; color: #706962; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 22px; margin: 20px 0; padding: 15px 16px; border: 1px solid #e5e0da; border-radius: 9px; background: #faf9f7; }
  .meta-label { display: block; margin-bottom: 2px; color: #706962; font-size: 8pt; }
  .meta-value { font-weight: 600; overflow-wrap: anywhere; }
  .section-title { margin: 22px 0 10px; font-size: 11pt; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead { display: table-header-group; }
  th { padding: 9px 8px; border-bottom: 1px solid #bdb7af; background: #f4f3f0; color: #514c47; font-size: 8pt; font-weight: 700; text-align: left; }
  td { padding: 10px 8px; border-bottom: 1px solid #eeeae5; vertical-align: top; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .number { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  .muted { color: #706962; font-size: 8pt; }
  .summary { width: min(100%, 340px); margin: 18px 0 0 auto; }
  .summary-row { display: flex; justify-content: space-between; gap: 18px; padding: 5px 0; }
  .summary-total { margin-top: 7px; padding-top: 12px; border-top: 2px solid #24211f; color: #b42318; font-size: 15pt; font-weight: 800; }
  .notice { margin: 16px 0; padding: 10px 12px; border-left: 3px solid #b42318; background: #fce9e7; color: #8f1c13; }
  .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e5e0da; color: #706962; font-size: 8pt; text-align: center; }
  .footer strong { display: block; margin-bottom: 2px; color: #24211f; font-size: 10pt; }
  .metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
  .metric { padding: 13px 15px; border: 1px solid #e5e0da; border-radius: 9px; }
  .metric-label { color: #706962; font-size: 8pt; }
  .metric-value { margin-top: 4px; font-size: 17pt; font-weight: 800; font-variant-numeric: tabular-nums; }
  .report-chart { display: flex; height: 9px; overflow: hidden; margin-top: 10px; border-radius: 99px; background: #eeeae5; }
  .report-chart > span { min-width: 2px; }
  .status-list { display: flex; flex-wrap: wrap; gap: 12px 22px; margin: 10px 0 0; color: #514c47; font-size: 8pt; }
`;

export function createBrandedPrintHtml(title: string, content: string, orientation: 'portrait' | 'landscape' = 'portrait'): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title><style>${sharedPrintStyles}@page{size:A4 ${orientation};}</style></head><body>${content}</body></html>`;
}

export async function exportHtmlAsPdf(html: string, fileName: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return new Promise((resolve, reject) => {
      const frame = document.createElement('iframe');
      frame.setAttribute('title', `Bản in ${fileName}`);
      frame.style.position = 'fixed';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      document.body.appendChild(frame);
      const printWindow = frame.contentWindow;
      const printDocument = frame.contentDocument;
      if (!printWindow || !printDocument) {
        frame.remove();
        reject(new Error('Không thể mở bản in. Vui lòng thử lại.'));
        return;
      }

      const removeFrame = () => window.setTimeout(() => frame.remove(), 1000);
      printWindow.addEventListener('afterprint', removeFrame, { once: true });
      frame.addEventListener('load', () => {
        try {
          printWindow.focus();
          printWindow.print();
          resolve();
        } catch {
          frame.remove();
          reject(new Error('Trình duyệt không thể mở hộp thoại in. Vui lòng thử lại.'));
        }
      }, { once: true });
      printDocument.open();
      printDocument.write(html);
      printDocument.close();
    });
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (!uri) throw new Error('Thiết bị chưa tạo được tệp PDF.');
  const sharingAvailable = await Sharing.isAvailableAsync();
  if (!sharingAvailable) throw new Error(`PDF đã tạo nhưng thiết bị chưa hỗ trợ chia sẻ tệp: ${uri}`);

  await Sharing.shareAsync(uri, {
    dialogTitle: `Chia sẻ ${fileName}`,
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf'
  });
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] ?? character);
}
