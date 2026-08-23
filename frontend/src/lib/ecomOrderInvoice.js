/**
 * E-Commerce Order Invoice Renderer — A4 print-ready HTML invoice
 * that prints from the browser (no backend PDF dependency needed).
 *
 * The browser's "Save as PDF" dialog turns it into a downloadable PDF file.
 *
 * Invoice content:
 *   - Store name (from tenant-branding) + invoice number
 *   - Customer details (name / phone / address)
 *   - Channel + status badges
 *   - Items table (name, SKU, qty, unit price, line total)
 *   - Subtotal, shipping, grand total
 *   - Notes + tracking number (if shipped)
 *   - Footer with thank-you note
 */
import { docCodesHtml } from './docCodes';
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

const CHANNEL_LABELS_AR = {
  pos: 'نقطة البيع', shopify: 'Shopify', facebook: 'Facebook', instagram: 'Instagram',
  tiktok: 'TikTok', whatsapp: 'واتساب', telegram: 'تيليجرام', viber: 'Viber',
  manual: 'إدخال يدوي',
};

const STATUS_LABELS_AR = {
  new: 'جديد', confirmed: 'مؤكَّد', packed: 'محضَّر', shipped: 'في الشحن',
  delivered: 'تم التسليم', cancelled: 'ملغى', refunded: 'مُستردّ',
};

/**
 * @returns {string} full HTML document (with @page A4 rule) ready to printed.
 */
export function buildEcomOrderInvoice({ storeName, order }) {
  const store = escapeHtml(storeName || 'متجر إلكتروني');
  const code = escapeHtml(order.order_code || order.id || '');
  const channel = CHANNEL_LABELS_AR[order.channel] || order.channel || '';
  const status = STATUS_LABELS_AR[order.status] || order.status || '';
  const customer = order.customer || {};
  const items = order.items || [];

  const customerLines = [
    customer.name && `الاسم: ${escapeHtml(customer.name)}`,
    customer.phone && `الهاتف: ${escapeHtml(customer.phone)}`,
    [customer.address, customer.city, customer.wilaya].filter(Boolean).map(escapeHtml).join('، ') &&
      `العنوان: ${[customer.address, customer.city, customer.wilaya].filter(Boolean).map(escapeHtml).join('، ')}`,
  ].filter(Boolean).join('<br>');

  const itemRows = items.map((it, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${escapeHtml(it.name || '—')}</td>
      <td class="sku">${escapeHtml(it.sku || '—')}</td>
      <td class="num">${it.qty || 0}</td>
      <td class="num">${_fmtAmount(it.price)} دج</td>
      <td class="num"><strong>${_fmtAmount(it.total)} دج</strong></td>
    </tr>
  `).join('');

  // p261: QR opens the public tracking page (phone scan), barcode carries the order code
  const _origin = (typeof window !== 'undefined' && window.location && window.location.origin) || '';
  const _trackUrl = _origin && order.order_code
    ? `${_origin}/track/${encodeURIComponent(order.order_code)}` : '';
  const codesBlock = docCodesHtml(order.order_code || '', {
    qrText: _trackUrl, qrSize: 100, barcodeHeight: 36,
    label: 'امسح QR لتتبع طلبك مباشرة',
  });

  const trackingBlock = order.tracking_number
    ? `<div class="tracking">رقم التتبع: <span class="mono">${escapeHtml(order.tracking_number)}</span> (${escapeHtml(order.courier || '')})</div>`
    : '';

  const notesBlock = order.notes
    ? `<div class="notes"><strong>ملاحظات:</strong> ${escapeHtml(order.notes)}</div>`
    : '';

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>فاتورة ${code}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',Tahoma,'Arial',sans-serif;color:#111;margin:0;padding:0;background:#fff}
    .invoice{max-width:760px;margin:0 auto;padding:0}
    header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #059669;padding-bottom:10px;margin-bottom:14px}
    .store-name{font-size:1.6em;font-weight:800;color:#059669;margin:0}
    .invoice-meta{text-align:left;font-size:0.85em;color:#444;direction:ltr}
    .invoice-meta strong{color:#111;font-size:1.05em}
    .badges{margin-top:6px}
    .badge{display:inline-block;padding:3px 8px;border-radius:999px;font-size:0.75em;font-weight:600;margin-left:4px}
    .badge.channel{background:#dbeafe;color:#1e40af}
    .badge.status{background:#d1fae5;color:#065f46}
    section{margin:14px 0}
    section h2{font-size:0.95em;color:#059669;border-bottom:1px solid #d1fae5;padding-bottom:3px;margin:0 0 6px 0}
    .customer-grid{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;font-size:0.9em;line-height:1.7}
    table{width:100%;border-collapse:collapse;margin-top:4px;font-size:0.88em}
    thead th{background:#059669;color:#fff;padding:6px 8px;text-align:right;font-weight:600}
    tbody td{padding:6px 8px;border-bottom:1px solid #e5e7eb}
    tbody tr:nth-child(even){background:#f9fafb}
    td.num{text-align:left;direction:ltr;white-space:nowrap}
    td.sku{font-family:'Courier New',monospace;font-size:0.85em;color:#666}
    .totals{margin-top:10px;display:flex;justify-content:flex-end}
    .totals-box{min-width:280px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;font-size:0.92em}
    .totals-row{display:flex;justify-content:space-between;padding:3px 0}
    .totals-row.grand{border-top:2px solid #059669;margin-top:6px;padding-top:6px;font-size:1.1em;font-weight:700;color:#059669}
    .notes{margin-top:14px;padding:8px;background:#fef9c3;border:1px solid #fde047;border-radius:6px;font-size:0.85em}
    .tracking{margin-top:10px;padding:8px;background:#ecfeff;border:1px solid #06b6d4;border-radius:6px;font-size:0.9em}
    .tracking .mono{font-family:'Courier New',monospace;font-weight:700}
    footer{margin-top:24px;border-top:1px dashed #999;padding-top:10px;text-align:center;color:#666;font-size:0.85em}
    @media print { body{print-color-adjust:exact;-webkit-print-color-adjust:exact} }
  </style>
</head>
<body>
  <div class="invoice">
    <header>
      <div>
        <h1 class="store-name">${store}</h1>
        <div style="font-size:0.85em;color:#666;margin-top:2px">فاتورة طلب إلكتروني</div>
        <div class="badges">
          <span class="badge channel">${escapeHtml(channel)}</span>
          <span class="badge status">${escapeHtml(status)}</span>
        </div>
      </div>
      <div class="invoice-meta">
        <strong>${code}</strong><br>
        ${_fmtDateTime(order.created_at)}
      </div>
    </header>

    <section>
      <h2>بيانات العميل</h2>
      <div class="customer-grid">${customerLines || '—'}</div>
    </section>

    <section>
      <h2>تفاصيل المنتجات</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>المنتج</th>
            <th>SKU</th>
            <th>الكمية</th>
            <th>سعر الوحدة</th>
            <th>المجموع</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="totals">
        <div class="totals-box">
          <div class="totals-row"><span>المجموع الفرعي</span><strong>${_fmtAmount(order.subtotal)} دج</strong></div>
          <div class="totals-row"><span>رسوم الشحن</span><strong>${_fmtAmount(order.shipping_fee)} دج</strong></div>
          <div class="totals-row grand"><span>الإجمالي</span><span>${_fmtAmount(order.total)} دج</span></div>
        </div>
      </div>

      ${trackingBlock}
      ${notesBlock}
    </section>

    ${codesBlock}
    <footer>
      شكراً لاختياركم <strong>${store}</strong> — للاستفسار، الرجاء التواصل معنا مع الاحتفاظ برقم الفاتورة <strong>${code}</strong>.
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Open a print window with the invoice HTML.
 * The user can then "Save as PDF" from the browser's native print dialog.
 */
export function printEcomOrderInvoice({ storeName, order }) {
  const html = buildEcomOrderInvoice({ storeName, order });
  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) {
    return { ok: false, reason: 'popup_blocked' };
  }
  win.document.write(html);
  win.document.close();
  // Defer print so external fonts / styles parse first
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { /* ignore */ }
  }, 250);
  return { ok: true };
}
