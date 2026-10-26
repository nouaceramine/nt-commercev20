import { safeSpreadsheetValue, escapeCell } from '../../lib/csvExport';
import { readFirstWorksheetRows, rowsToXlsxBlob } from '../../lib/spreadsheet';
import { safeLabelUrl, toSafeJsString } from '../../lib/printSafety';
import { ReceiptService } from '../../services/ReceiptService';

jest.mock('../../lib/docCodes', () => ({ docCodesHtml: () => '<div>codes</div>' }));

describe('p479 spreadsheet and print hardening', () => {
  it.each(['=1+1', '  +SUM(A1:A2)', '\t-10', '@cmd'])('neutralizes spreadsheet formula %p', value => {
    expect(safeSpreadsheetValue(value)).toBe(`'${value}`);
    expect(escapeCell(value)).not.toMatch(/^\s*[=+\-@]/);
  });

  it('quotes CSV separators after formula neutralization', () => {
    expect(escapeCell('=1,"x"')).toBe('"\'=1,""x"""');
    expect(escapeCell('normal')).toBe('normal');
  });

  it('round-trips XLSX values and rejects oversized input', async () => {
    const blob = await rowsToXlsxBlob([['name', 'price'], ['منتج', 12.5]]);
    expect(blob.size).toBeGreaterThan(100);
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    worksheetRows(workbook);
    const buffer = await workbook.xlsx.writeBuffer();
    await expect(readFirstWorksheetRows(buffer)).resolves.toEqual([['name', 'price'], ['منتج', 12.5]]);
    const huge = { byteLength: 10 * 1024 * 1024 + 1 };
    await expect(readFirstWorksheetRows(huge)).rejects.toThrow('10 MB');
  });

  it('allows only HTTPS or same-origin HTTP label links', () => {
    expect(safeLabelUrl('javascript:alert(1)', 'https://nt-commerce.net')).toBe('');
    expect(safeLabelUrl('http://169.254.169.254/x', 'https://nt-commerce.net')).toBe('');
    expect(safeLabelUrl('/label.pdf', 'https://nt-commerce.net')).toBe('https://nt-commerce.net/label.pdf');
    expect(safeLabelUrl('https://cdn.example.test/label.pdf', 'https://nt-commerce.net')).toBe('https://cdn.example.test/label.pdf');
  });

  it('keeps user input out of executable JavaScript and receipt markup', () => {
    const payload = '</script><img src=x onerror=alert(1)>&\u2028';
    const encoded = toSafeJsString(payload);
    expect(encoded).not.toContain('</script>');
    expect(encoded).toContain('\\u003c');
    expect(encoded).toContain('\\u2028');

    const service = new ReceiptService({ store_name: payload }, 'ar', true, payload);
    const html = service.generateThermalReceiptHtml({
      invoice_number: payload, created_at: new Date().toISOString(), customer_name: payload,
      items: [{ product_name: payload, quantity: payload, unit_price: 'invalid', total: 0 }],
      subtotal: 0, discount: 0, total: 0,
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('</script><img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('NaN');
  });
});

function worksheetRows(workbook) {
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRows([['name', 'price'], ['منتج', 12.5]]);
}
