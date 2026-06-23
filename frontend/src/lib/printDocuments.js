/**
 * Print Documents Builder
 * يبني HTML لوصل/فاتورة/سند قابل للطباعة لكل أقسام البرنامج
 * (الزبائن، المنتجات، المشتريات، المبيعات، المصاريف) بأحجام 58/80مم وA4.
 */
import { formatCurrency, formatShortDate, formatDateTime } from '../utils/globalDateFormatter';

export const PRINT_DOC_TYPES = ['customer', 'product', 'purchase', 'sale', 'expense'];

export const DOC_LABELS = {
  customer: { ar: 'كشف حساب زبون', fr: 'Relevé client' },
  product: { ar: 'بطاقة منتج', fr: 'Fiche produit' },
  purchase: { ar: 'فاتورة شراء', fr: "Facture d'achat" },
  sale: { ar: 'فاتورة بيع', fr: 'Facture de vente' },
  expense: { ar: 'سند مصروف', fr: 'Bon de dépense' },
};

export const DEFAULT_DOC_OPTIONS = {
  customer: { paperSize: 'A4', showLogo: true, showHeader: true, showFooter: true, showColumns: true, accentColor: '#0f766e' },
  product: { paperSize: '80mm', showLogo: true, showHeader: true, showFooter: true, showColumns: true, accentColor: '#0f766e' },
  purchase: { paperSize: 'A4', showLogo: true, showHeader: true, showFooter: true, showColumns: true, accentColor: '#0f766e' },
  sale: { paperSize: '80mm', showLogo: true, showHeader: true, showFooter: true, showColumns: true, accentColor: '#0f766e' },
  expense: { paperSize: 'A4', showLogo: true, showHeader: true, showFooter: true, showColumns: true, accentColor: '#0f766e' },
};

const PAPER = {
  '58mm': { width: '58mm', body: '11px', title: '14px', total: '13px', page: 'size:58mm auto;margin:0', pad: '3mm', isA4: false },
  '80mm': { width: '80mm', body: '12px', title: '16px', total: '15px', page: 'size:80mm auto;margin:0', pad: '4mm', isA4: false },
  'A4': { width: '100%', body: '14px', title: '24px', total: '18px', page: 'size:A4;margin:14mm', pad: '0', isA4: true },
};

const esc = (v) => {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

// يسمح فقط بمصادر صور آمنة (data:image / http(s) / blob) ويرفض أي محارف قد تكسر السمة.
const safeImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  const u = url.trim();
  if (/[<>"'\s]/.test(u)) return '';
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(u)) return u;
  return '';
};

const paymentLabel = (m, ar) => {
  const map = {
    cash: ar ? 'نقدي' : 'Espèces',
    bank: ar ? 'تحويل بنكي' : 'Virement',
    card: ar ? 'بطاقة' : 'Carte',
    wallet: ar ? 'محفظة' : 'Portefeuille',
  };
  return map[m] || m || '';
};

const statusLabel = (s, ar) => {
  const map = {
    paid: ar ? 'مدفوع' : 'Payé',
    partial: ar ? 'جزئي' : 'Partiel',
    unpaid: ar ? 'غير مدفوع' : 'Impayé',
    returned: ar ? 'مرتجع' : 'Retourné',
    pending: ar ? 'قيد الانتظار' : 'En attente',
  };
  return map[s] || s || '';
};

const dateOf = (record) => {
  const raw = record.created_at || record.expense_date || record.date || record.updated_at;
  if (!raw) return formatShortDate(new Date());
  try { return formatDateTime(raw); } catch (e) { return formatShortDate(raw); }
};

/**
 * يبني نموذج المستند (العنوان، البيانات الوصفية، البنود، المجاميع) لكل نوع.
 */
function getDocModel(docType, record, language) {
  const ar = language === 'ar';
  const r = record || {};

  switch (docType) {
    case 'customer':
      return {
        title: ar ? DOC_LABELS.customer.ar : DOC_LABELS.customer.fr,
        refNumber: r.code || '',
        meta: [
          { label: ar ? 'الكود' : 'Code', value: r.code },
          { label: ar ? 'الاسم' : 'Nom', value: r.name },
          { label: ar ? 'الهاتف' : 'Tél', value: r.phone },
          { label: ar ? 'العنوان' : 'Adresse', value: r.address },
          { label: ar ? 'العائلة' : 'Famille', value: r.family_name },
        ],
        totals: [
          { label: ar ? 'إجمالي المشتريات' : 'Total achats', value: formatCurrency(r.total_purchases) },
          { label: ar ? 'الرصيد (الدين)' : 'Solde (dette)', value: formatCurrency(r.balance), bold: true },
        ],
      };

    case 'product': {
      const name = ar ? (r.name_ar || r.name_en) : (r.name_en || r.name_ar);
      return {
        title: ar ? DOC_LABELS.product.ar : DOC_LABELS.product.fr,
        refNumber: r.article_code || r.barcode || '',
        meta: [
          { label: ar ? 'المنتج' : 'Produit', value: name },
          { label: ar ? 'الكود' : 'Code', value: r.article_code },
          { label: ar ? 'الباركود' : 'Code-barres', value: r.barcode },
          { label: ar ? 'العائلة' : 'Famille', value: r.family_name },
          { label: ar ? 'المخزون' : 'Stock', value: r.quantity },
        ],
        totals: [
          { label: ar ? 'سعر الشراء' : "Prix d'achat", value: formatCurrency(r.purchase_price) },
          { label: ar ? 'سعر الجملة' : 'Prix de gros', value: formatCurrency(r.wholesale_price) },
          { label: ar ? 'سعر البيع' : 'Prix de vente', value: formatCurrency(r.retail_price), bold: true },
        ],
      };
    }

    case 'purchase': {
      const items = (r.items || []).map((it) => ({
        name: it.product_name,
        qty: it.quantity,
        price: formatCurrency(it.unit_price),
        total: formatCurrency(it.total),
      }));
      const totals = [
        { label: ar ? 'الإجمالي' : 'Total', value: formatCurrency(r.total), bold: true },
      ];
      if (r.paid_amount != null) totals.push({ label: ar ? 'المدفوع' : 'Payé', value: formatCurrency(r.paid_amount) });
      if (r.remaining != null) totals.push({ label: ar ? 'الباقي' : 'Reste', value: formatCurrency(r.remaining) });
      return {
        title: ar ? DOC_LABELS.purchase.ar : DOC_LABELS.purchase.fr,
        refNumber: r.invoice_number || r.code || '',
        meta: [
          { label: ar ? 'رقم الفاتورة' : 'N° facture', value: r.invoice_number || r.code },
          { label: ar ? 'المورّد' : 'Fournisseur', value: r.supplier_name },
          { label: ar ? 'طريقة الدفع' : 'Paiement', value: paymentLabel(r.payment_method, ar) },
          { label: ar ? 'الحالة' : 'Statut', value: statusLabel(r.status, ar) },
        ],
        items,
        totals,
      };
    }

    case 'sale': {
      const items = (r.items || []).map((it) => ({
        name: it.product_name,
        qty: it.quantity,
        price: formatCurrency(it.unit_price),
        total: formatCurrency(it.total),
      }));
      const totals = [];
      if (r.subtotal !== undefined && r.subtotal !== null) totals.push({ label: ar ? 'المجموع الفرعي' : 'Sous-total', value: formatCurrency(r.subtotal) });
      if (r.discount) totals.push({ label: ar ? 'الخصم' : 'Remise', value: '-' + formatCurrency(r.discount) });
      const deliveryFee = r.delivery_fee || (r.delivery && r.delivery.fee);
      if (deliveryFee) totals.push({ label: ar ? 'التوصيل' : 'Livraison', value: formatCurrency(deliveryFee) });
      totals.push({ label: ar ? 'الإجمالي' : 'Total', value: formatCurrency(r.total), bold: true });
      if (r.paid_amount != null) totals.push({ label: ar ? 'المدفوع' : 'Payé', value: formatCurrency(r.paid_amount) });
      const remaining = r.remaining != null ? r.remaining : r.debt_amount;
      if (remaining != null) totals.push({ label: ar ? 'الباقي' : 'Reste', value: formatCurrency(remaining) });
      return {
        title: ar ? DOC_LABELS.sale.ar : DOC_LABELS.sale.fr,
        refNumber: r.invoice_number || r.code || '',
        meta: [
          { label: ar ? 'رقم الفاتورة' : 'N° facture', value: r.invoice_number || r.code },
          { label: ar ? 'الزبون' : 'Client', value: r.customer_name || (ar ? 'زبون عابر' : 'Client passant') },
          { label: ar ? 'طريقة الدفع' : 'Paiement', value: paymentLabel(r.payment_method, ar) },
          { label: ar ? 'الحالة' : 'Statut', value: statusLabel(r.status, ar) },
        ],
        items,
        totals,
      };
    }

    case 'expense':
      return {
        title: ar ? DOC_LABELS.expense.ar : DOC_LABELS.expense.fr,
        refNumber: r.expense_number || r.code || '',
        meta: [
          { label: ar ? 'الرقم' : 'N°', value: r.expense_number || r.code },
          { label: ar ? 'البيان' : 'Libellé', value: r.description || r.title },
          { label: ar ? 'الفئة' : 'Catégorie', value: r.category },
          { label: ar ? 'المستفيد' : 'Bénéficiaire', value: r.vendor },
          { label: ar ? 'طريقة الدفع' : 'Paiement', value: paymentLabel(r.payment_method, ar) },
        ],
        totals: [
          { label: ar ? 'المبلغ' : 'Montant', value: formatCurrency(r.amount), bold: true },
        ],
      };

    default:
      return { title: '', refNumber: '', meta: [], totals: [] };
  }
}

function renderMetaRows(meta) {
  return meta
    .filter((m) => m.value !== undefined && m.value !== null && m.value !== '')
    .map((m) => `<div class="row"><span class="muted">${esc(m.label)}</span><span class="bold">${esc(m.value)}</span></div>`)
    .join('');
}

function renderItemsThermal(items, ar) {
  if (!items || !items.length) return '';
  const body = items
    .map(
      (it) =>
        `<div class="item"><div class="bold">${esc(it.name)}</div><div class="row"><span>${esc(it.qty)} × ${esc(it.price)}</span><span class="bold">${esc(it.total)}</span></div></div>`
    )
    .join('');
  return `<div class="line"></div><div class="items">${body}</div>`;
}

function renderItemsTable(items, ar, accent) {
  if (!items || !items.length) return '';
  const head = `<tr><th>${ar ? 'المنتج' : 'Produit'}</th><th>${ar ? 'الكمية' : 'Qté'}</th><th>${ar ? 'السعر' : 'Prix'}</th><th>${ar ? 'الإجمالي' : 'Total'}</th></tr>`;
  const rows = items
    .map(
      (it) =>
        `<tr><td>${esc(it.name)}</td><td class="c">${esc(it.qty)}</td><td class="e">${esc(it.price)}</td><td class="e bold">${esc(it.total)}</td></tr>`
    )
    .join('');
  return `<table class="items-table"><thead style="background:${accent}">${head}</thead><tbody>${rows}</tbody></table>`;
}

function renderTotals(totals) {
  return totals
    .map(
      (tt) =>
        `<div class="row ${tt.bold ? 'total' : ''}"><span>${esc(tt.label)}</span><span>${esc(tt.value)}</span></div>`
    )
    .join('');
}

/**
 * يبني وثيقة HTML كاملة جاهزة للطباعة/المعاينة.
 */
export function buildPrintHTML({ docType, record, options = {}, branding = {}, language = 'ar' }) {
  const ar = language === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const opt = { ...(DEFAULT_DOC_OPTIONS[docType] || DEFAULT_DOC_OPTIONS.sale), ...options };
  const p = PAPER[opt.paperSize] || PAPER['80mm'];
  const accent = opt.accentColor || '#0f766e';
  const showLogo = opt.showLogo !== false;
  const showHeader = opt.showHeader !== false;
  const showFooter = opt.showFooter !== false;
  const showColumns = opt.showColumns !== false;

  const model = getDocModel(docType, record, language);
  const storeName = esc(branding.name || opt.storeName || 'NT Commerce');
  const logo = branding.logo_url || '';
  const headerText = esc(opt.headerText || '');
  const footerText = esc(opt.footerText || (ar ? 'شكراً لتعاملكم معنا' : 'Merci de votre confiance'));

  const safeLogo = safeImageUrl(logo);
  const logoHtml = showLogo && safeLogo ? `<img class="logo" src="${safeLogo}" alt="logo" />` : '';
  const headerHtml = showHeader
    ? `<div class="head">${logoHtml}<div class="store">${storeName}</div>${headerText ? `<div class="muted small">${headerText}</div>` : ''}</div>`
    : '';

  const itemsHtml = showColumns
    ? (p.isA4 ? renderItemsTable(model.items, ar, accent) : renderItemsThermal(model.items, ar))
    : '';

  const docTitle = esc(model.title) + (model.refNumber ? ` — ${esc(model.refNumber)}` : '');
  const totalsAlign = p.isA4 ? `max-width:340px;margin-${ar ? 'right' : 'left'}:auto;` : '';

  return `<!DOCTYPE html><html dir="${dir}" lang="${ar ? 'ar' : 'fr'}"><head><meta charset="UTF-8"><title>${esc(model.title)}</title>
<style>
@page{${p.page}}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${p.isA4 ? "'Segoe UI',Tahoma,Arial,sans-serif" : "'Courier New',monospace"};font-size:${p.body};width:${p.width};padding:${p.pad};direction:${dir};line-height:1.5;color:#111}
.head{text-align:center;margin-bottom:8px}
.logo{max-height:${p.isA4 ? '70px' : '46px'};max-width:80%;object-fit:contain;margin:0 auto 6px}
.store{font-weight:bold;font-size:${p.title};color:${accent}}
.title{text-align:center;font-weight:bold;margin:8px 0;padding:6px 0;border-top:2px solid ${accent};border-bottom:2px solid ${accent};font-size:${p.isA4 ? '16px' : '13px'}}
.meta{margin:8px 0}
.row{display:flex;justify-content:space-between;gap:8px;margin:3px 0}
.muted{color:#555}.small{font-size:11px}.bold{font-weight:bold}
.line{border-bottom:1px dashed #999;margin:8px 0}
.items{margin:6px 0}.item{margin:6px 0}
.items-table{width:100%;border-collapse:collapse;margin:10px 0}
.items-table th{color:#fff;padding:8px;text-align:${ar ? 'right' : 'left'};font-size:13px}
.items-table td{padding:7px 8px;border-bottom:1px solid #eee}
.items-table td.c{text-align:center}.items-table td.e{text-align:${ar ? 'left' : 'right'}}
.totals{margin-top:10px;${totalsAlign}}
.total{font-size:${p.total};font-weight:bold;border-top:2px solid ${accent};padding-top:6px;margin-top:6px;color:${accent}}
.footer{text-align:center;margin-top:16px;color:#555;font-size:11px}
.date{text-align:center;color:#777;font-size:11px;margin-top:4px}
</style></head><body>
${headerHtml}
<div class="title">${docTitle}</div>
<div class="date">${esc(dateOf(record))}</div>
<div class="meta">${renderMetaRows(model.meta)}</div>
${itemsHtml}
<div class="totals">${renderTotals(model.totals)}</div>
${showFooter ? `<div class="footer"><div class="line"></div>${footerText}</div>` : ''}
</body></html>`;
}
