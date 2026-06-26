/**
 * Platform Card Invoice Renderer — generates print-ready HTML in three
 * formats for cards sold via /platform-cards/sell.
 *
 * Formats:
 *   "thermal58"  → 58mm thermal printer roll (≈ 200px CSS width, 8pt font)
 *   "thermal80"  → 80mm thermal printer roll (≈ 280px CSS width, 10pt font)
 *   "a5"         → standard A5 sheet (148 × 210 mm) for an office printer
 *
 * Invoice content (per spec):
 *   - Store name (tenant_branding.name fallback to tenant.company_name)
 *   - Invoice number
 *   - Date & time
 *   - Card name (operator + denomination)
 *   - Sale price (what the customer paid)
 *   - PIN code (large mono box)
 *   - Payment method + customer name (when present)
 *   - Signature line + thank-you note
 */
import { escapeHtml } from './escape';

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const _fmtDateTime = (iso) => {
  if (!iso) return new Date().toLocaleString('ar-DZ');
  try {
    const d = new Date(iso);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()} — ${h}:${m}`;
  } catch {
    return iso;
  }
};

const _fmtAmount = (n) => Number(n || 0).toLocaleString('ar-DZ');

const _commonCSS = `
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',Tahoma,sans-serif;color:#111;margin:0;padding:0}
  .store{font-weight:700;font-size:1.2em;text-align:center;margin:0 0 4px 0}
  .title{text-align:center;font-weight:600;border-top:1px dashed #999;border-bottom:1px dashed #999;padding:4px 0;margin:6px 0}
  .meta{font-size:0.85em}
  .row{display:flex;justify-content:space-between;margin:3px 0}
  .label{color:#555}
  .value{font-weight:600}
  .pin-box{direction:ltr;text-align:center;background:#f3f4f6;border:1px solid #ccc;border-radius:6px;padding:10px 6px;margin:10px 0;font-family:'Courier New',monospace;font-size:1.4em;letter-spacing:2px;font-weight:700}
  .pin-label{font-size:0.75em;color:#666;text-align:center;margin-top:-6px;margin-bottom:8px}
  .sig{margin-top:14px;border-top:1px solid #999;padding-top:4px;font-size:0.78em;color:#555;text-align:center}
  .thanks{text-align:center;font-size:0.8em;color:#666;margin-top:6px}
  .footer-id{text-align:center;font-size:0.7em;color:#888;margin-top:4px;direction:ltr}
  @media print{ @page{margin:0} body{padding:0} }
`;

const _bodyHtml = ({ storeName, invoiceNo, dateTime, operator, denomination, sellPrice, pinCode, payment, customer, customerPhone, idShort }) => `
  <div class="store">${escapeHtml(storeName)}</div>
  <div class="title">فاتورة بطاقة شحن</div>
  <div class="meta">
    <div class="row"><span class="label">رقم الفاتورة:</span><span class="value" dir="ltr">${escapeHtml(invoiceNo)}</span></div>
    <div class="row"><span class="label">التاريخ:</span><span class="value">${escapeHtml(dateTime)}</span></div>
    <div class="row"><span class="label">البطاقة:</span><span class="value">${escapeHtml(operator)} — ${_fmtAmount(denomination)} دج</span></div>
    <div class="row"><span class="label">سعر البيع:</span><span class="value">${_fmtAmount(sellPrice)} دج</span></div>
    <div class="row"><span class="label">طريقة الدفع:</span><span class="value">${payment === 'credit' ? 'آجل (دَين)' : 'نقدي'}</span></div>
    ${customer ? `<div class="row"><span class="label">الزبون:</span><span class="value">${escapeHtml(customer)}</span></div>` : ''}
    ${customerPhone ? `<div class="row"><span class="label">الهاتف:</span><span class="value" dir="ltr">${escapeHtml(customerPhone)}</span></div>` : ''}
  </div>
  <div class="pin-box">${escapeHtml(pinCode)}</div>
  <div class="pin-label">كود التعبئة (PIN)</div>
  <div class="sig">توقيع الكاشير: ____________________</div>
  <div class="thanks">شكراً لتعاملكم معنا 💚</div>
  <div class="footer-id">#${escapeHtml(idShort)}</div>
`;

const _wrap = ({ widthCss, baseFontPt, padding, contentHtml }) => `
  <!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <title>Invoice</title>
  <style>
    html,body{width:${widthCss};font-size:${baseFontPt}pt}
    ${_commonCSS}
    body{padding:${padding}}
  </style></head><body>
  ${contentHtml}
  <script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script>
  </body></html>
`;

const _a5Wrap = (contentHtml) => `
  <!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <title>Invoice</title>
  <style>
    @page{size:A5;margin:14mm}
    html,body{font-size:11pt}
    ${_commonCSS}
    body{max-width:148mm;margin:0 auto;padding:8mm}
    .store{font-size:1.7em}
    .pin-box{font-size:1.8em;padding:18px 8px}
  </style></head><body>
  ${contentHtml}
  <script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script>
  </body></html>
`;

export const buildPlatformCardInvoice = ({
  format = 'thermal80',
  storeName = 'متجري',
  sale = {},
  card = {},
  customer = '',
  customerPhone = '',
}) => {
  const invoiceNo = sale.invoice_number || (sale.id ? `CARD-${String(sale.id).replace(/-/g, '').slice(0, 8).toUpperCase()}` : '—');
  const dateTime = _fmtDateTime(sale.created_at);
  const payload = {
    storeName,
    invoiceNo,
    dateTime,
    operator: card.operator || sale.operator || '—',
    denomination: card.denomination || sale.denomination || 0,
    sellPrice: sale.sell_price ?? card.denomination ?? 0,
    pinCode: card.code || '—',
    payment: sale.payment_method || 'cash',
    customer: customer || sale.customer_name || '',
    customerPhone,
    idShort: sale.id ? String(sale.id).slice(0, 8).toUpperCase() : '',
  };
  const content = _bodyHtml(payload);

  if (format === 'thermal58') {
    return _wrap({ widthCss: '200px', baseFontPt: 8, padding: '8px 6px', contentHtml: content });
  }
  if (format === 'a5') {
    return _a5Wrap(content);
  }
  // default: thermal80
  return _wrap({ widthCss: '280px', baseFontPt: 10, padding: '10px 8px', contentHtml: content });
};

export const printPlatformCardInvoice = (opts) => {
  const html = buildPlatformCardInvoice(opts);
  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
};
