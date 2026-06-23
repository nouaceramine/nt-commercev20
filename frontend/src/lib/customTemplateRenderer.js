/**
 * Custom Template Renderer
 * Converts a block-based custom template + record data → printable HTML string.
 * Works alongside buildPrintHTML from printDocuments.js.
 */
import { formatCurrency, formatShortDate, formatDateTime } from '../utils/globalDateFormatter';

const esc = (v) => {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const safeImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  const u = url.trim();
  if (/[<>"'\s]/.test(u)) return '';
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(u)) return u;
  return '';
};

const paymentLabel = (m, ar) => {
  const map = { cash: ar ? 'نقدي' : 'Espèces', bank: ar ? 'تحويل بنكي' : 'Virement', card: ar ? 'بطاقة' : 'Carte', wallet: ar ? 'محفظة' : 'Portefeuille' };
  return map[m] || m || '';
};

const statusLabel = (s, ar) => {
  const map = { paid: ar ? 'مدفوع' : 'Payé', partial: ar ? 'جزئي' : 'Partiel', unpaid: ar ? 'غير مدفوع' : 'Impayé', returned: ar ? 'مرتجع' : 'Retourné', pending: ar ? 'قيد الانتظار' : 'En attente' };
  return map[s] || s || '';
};

// ── Field bindings per document type ──────────────────────────────────────────

export const FIELD_BINDINGS = {
  sale: [
    { key: 'invoice_number', ar: 'رقم الفاتورة', fr: 'N° facture' },
    { key: 'customer_name', ar: 'اسم الزبون', fr: 'Nom client' },
    { key: 'payment_method', ar: 'طريقة الدفع', fr: 'Mode de paiement' },
    { key: 'status', ar: 'الحالة', fr: 'Statut' },
    { key: 'date', ar: 'التاريخ', fr: 'Date' },
    { key: 'subtotal', ar: 'المجموع الفرعي', fr: 'Sous-total' },
    { key: 'discount', ar: 'الخصم', fr: 'Remise' },
    { key: 'total', ar: 'الإجمالي', fr: 'Total' },
    { key: 'paid_amount', ar: 'المدفوع', fr: 'Payé' },
    { key: 'remaining', ar: 'الباقي', fr: 'Reste' },
  ],
  purchase: [
    { key: 'invoice_number', ar: 'رقم الفاتورة', fr: 'N° facture' },
    { key: 'supplier_name', ar: 'اسم المورّد', fr: 'Nom fournisseur' },
    { key: 'payment_method', ar: 'طريقة الدفع', fr: 'Mode de paiement' },
    { key: 'status', ar: 'الحالة', fr: 'Statut' },
    { key: 'date', ar: 'التاريخ', fr: 'Date' },
    { key: 'total', ar: 'الإجمالي', fr: 'Total' },
    { key: 'paid_amount', ar: 'المدفوع', fr: 'Payé' },
    { key: 'remaining', ar: 'الباقي', fr: 'Reste' },
  ],
  customer: [
    { key: 'code', ar: 'الكود', fr: 'Code' },
    { key: 'name', ar: 'الاسم', fr: 'Nom' },
    { key: 'phone', ar: 'الهاتف', fr: 'Tél' },
    { key: 'address', ar: 'العنوان', fr: 'Adresse' },
    { key: 'family_name', ar: 'العائلة', fr: 'Famille' },
    { key: 'total_purchases', ar: 'إجمالي المشتريات', fr: 'Total achats' },
    { key: 'balance', ar: 'الرصيد', fr: 'Solde' },
  ],
  product: [
    { key: 'name', ar: 'اسم المنتج', fr: 'Nom produit' },
    { key: 'article_code', ar: 'الكود', fr: 'Code' },
    { key: 'barcode', ar: 'الباركود', fr: 'Code-barres' },
    { key: 'family_name', ar: 'العائلة', fr: 'Famille' },
    { key: 'quantity', ar: 'المخزون', fr: 'Stock' },
    { key: 'purchase_price', ar: 'سعر الشراء', fr: "Prix d'achat" },
    { key: 'wholesale_price', ar: 'سعر الجملة', fr: 'Prix de gros' },
    { key: 'retail_price', ar: 'سعر البيع', fr: 'Prix de vente' },
  ],
  expense: [
    { key: 'expense_number', ar: 'الرقم', fr: 'N°' },
    { key: 'description', ar: 'البيان', fr: 'Libellé' },
    { key: 'category', ar: 'الفئة', fr: 'Catégorie' },
    { key: 'vendor', ar: 'المستفيد', fr: 'Bénéficiaire' },
    { key: 'payment_method', ar: 'طريقة الدفع', fr: 'Paiement' },
    { key: 'amount', ar: 'المبلغ', fr: 'Montant' },
  ],
};

// ── Block type definitions for the editor palette ─────────────────────────────

export const BLOCK_TYPES = [
  { type: 'logo', icon: '🖼', ar: 'شعار المتجر', fr: 'Logo boutique' },
  { type: 'store_name', icon: '🏪', ar: 'اسم المتجر', fr: 'Nom boutique' },
  { type: 'text', icon: '✏️', ar: 'نص حر', fr: 'Texte libre' },
  { type: 'field', icon: '🔤', ar: 'حقل ديناميكي', fr: 'Champ dynamique' },
  { type: 'items_table', icon: '📋', ar: 'جدول البنود', fr: 'Tableau articles' },
  { type: 'totals', icon: '🧮', ar: 'المجاميع', fr: 'Totaux' },
  { type: 'separator', icon: '─', ar: 'فاصل', fr: 'Séparateur' },
  { type: 'spacer', icon: '⬜', ar: 'مسافة فارغة', fr: 'Espace vide' },
  { type: 'barcode', icon: '▐▌', ar: 'باركود (CODE128)', fr: 'Code-barres' },
  { type: 'qr', icon: '⬛', ar: 'رمز QR', fr: 'Code QR' },
];

export const DEFAULT_BLOCK_STYLE = {
  fontSize: 12,
  fontWeight: 'normal',
  textAlign: 'center',
  color: '#000000',
  marginTop: 4,
  marginBottom: 4,
  widthPercent: 100,
};

export function createBlock(type, docType = 'sale') {
  const id = Math.random().toString(36).slice(2);
  const firstField = FIELD_BINDINGS[docType]?.[0] || { key: 'invoice_number', ar: 'رقم الفاتورة', fr: 'N° facture' };
  const style = { ...DEFAULT_BLOCK_STYLE };
  switch (type) {
    case 'logo':
      return { id, type, style: { ...style, textAlign: 'center', marginBottom: 6, widthPercent: 100 } };
    case 'store_name':
      return { id, type, style: { ...style, fontSize: 16, fontWeight: 'bold', textAlign: 'center', widthPercent: 100 } };
    case 'text':
      return { id, type, content: 'نص هنا', style: { ...style, textAlign: 'center', widthPercent: 100 } };
    case 'field':
      return { id, type, fieldKey: firstField.key, fieldLabel: firstField.ar, fieldLabelFr: firstField.fr, style: { ...style, textAlign: 'right', widthPercent: 100 } };
    case 'items_table':
      return { id, type, style: { ...style, marginTop: 8, marginBottom: 8, widthPercent: 100 } };
    case 'totals':
      return { id, type, style: { ...style, textAlign: 'right', marginTop: 8, widthPercent: 100 } };
    case 'separator':
      return { id, type, separatorStyle: 'dashed', style: { ...style, marginTop: 6, marginBottom: 6, widthPercent: 100 } };
    case 'spacer':
      return { id, type, height: 12, style: { ...style, widthPercent: 100 } };
    case 'barcode':
      return { id, type, fieldKey: firstField.key, fieldLabel: firstField.ar, fieldLabelFr: firstField.fr, style: { ...style, textAlign: 'center', widthPercent: 100 } };
    case 'qr':
      return { id, type, fieldKey: firstField.key, fieldLabel: firstField.ar, fieldLabelFr: firstField.fr, qrSize: 80, style: { ...style, textAlign: 'center', widthPercent: 50 } };
    default:
      return { id, type, style: { ...style, widthPercent: 100 } };
  }
}

// ── Resolve a field key against a record ──────────────────────────────────────

function resolveField(key, record, ar) {
  if (!record) return '';
  const r = record;
  switch (key) {
    case 'invoice_number': return r.invoice_number || r.code || '';
    case 'customer_name': return r.customer_name || (ar ? 'زبون عابر' : 'Client passant');
    case 'supplier_name': return r.supplier_name || '';
    case 'payment_method': return paymentLabel(r.payment_method, ar);
    case 'status': return statusLabel(r.status, ar);
    case 'date': {
      const raw = r.created_at || r.expense_date || r.date;
      if (!raw) return formatShortDate(new Date());
      try { return formatDateTime(raw); } catch { return formatShortDate(raw); }
    }
    case 'subtotal': return formatCurrency(r.subtotal);
    case 'discount': return r.discount ? formatCurrency(r.discount) : '';
    case 'total': return formatCurrency(r.total);
    case 'paid_amount': return r.paid_amount != null ? formatCurrency(r.paid_amount) : '';
    case 'remaining': return (r.remaining != null ? r.remaining : r.debt_amount) != null ? formatCurrency(r.remaining ?? r.debt_amount) : '';
    case 'code': return r.code || '';
    case 'name': return ar ? (r.name_ar || r.name_en || r.name || '') : (r.name_en || r.name_ar || r.name || '');
    case 'phone': return r.phone || '';
    case 'address': return r.address || '';
    case 'family_name': return r.family_name || '';
    case 'total_purchases': return formatCurrency(r.total_purchases);
    case 'balance': return formatCurrency(r.balance);
    case 'article_code': return r.article_code || '';
    case 'barcode': return r.barcode || '';
    case 'quantity': return r.quantity != null ? String(r.quantity) : '';
    case 'purchase_price': return formatCurrency(r.purchase_price);
    case 'wholesale_price': return formatCurrency(r.wholesale_price);
    case 'retail_price': return formatCurrency(r.retail_price ?? r.price);
    case 'expense_number': return r.expense_number || r.code || '';
    case 'description': return r.description || r.title || '';
    case 'category': return r.category || '';
    case 'vendor': return r.vendor || '';
    case 'amount': return formatCurrency(r.amount);
    default: return r[key] != null ? String(r[key]) : '';
  }
}

// ── Build outer wrapper for a block with width/alignment support ──────────────

function blockWrap(inner, s, extraStyle = '') {
  const wp = s.widthPercent || 100;
  const mt = s.marginTop || 0;
  const mb = s.marginBottom || 0;
  const align = s.blockAlign || (s.textAlign === 'right' ? 'flex-end' : s.textAlign === 'left' ? 'flex-start' : 'center');
  if (wp >= 100) {
    return `<div style="width:100%;margin-top:${mt}px;margin-bottom:${mb}px;${extraStyle}">${inner}</div>`;
  }
  return `<div style="width:100%;display:flex;justify-content:${align};margin-top:${mt}px;margin-bottom:${mb}px;${extraStyle}"><div style="width:${wp}%;">${inner}</div></div>`;
}

function innerStyle(s) {
  return `font-size:${s.fontSize || 12}px;font-weight:${s.fontWeight || 'normal'};text-align:${s.textAlign || 'right'};color:${s.color || '#000'};`;
}

// ── Render individual blocks to HTML ─────────────────────────────────────────

function renderBlock(block, record, branding, ar, accentColor, isA4) {
  const s = block.style || {};

  switch (block.type) {
    case 'logo': {
      const logoUrl = safeImageUrl(branding?.logo_url || '');
      if (!logoUrl) {
        return blockWrap(`<div style="${innerStyle(s)}padding:4px 0;color:#aaa;font-size:11px;text-align:center;">[${ar ? 'شعار المتجر' : 'Logo'}]</div>`, s);
      }
      return blockWrap(`<div style="text-align:center;"><img src="${logoUrl}" style="max-height:${isA4 ? '70px' : '46px'};max-width:100%;object-fit:contain;" alt="logo"/></div>`, s);
    }
    case 'store_name':
      return blockWrap(`<div style="${innerStyle(s)}color:${accentColor};">${esc(branding?.name || 'NT Commerce')}</div>`, s);
    case 'text':
      return blockWrap(`<div style="${innerStyle(s)}">${esc(block.content || '')}</div>`, s);
    case 'field': {
      if (!record) {
        const label = ar ? block.fieldLabel : (block.fieldLabelFr || block.fieldLabel);
        return blockWrap(`<div style="${innerStyle(s)}"><span style="color:#888;">[${esc(label)}]</span></div>`, s);
      }
      const val = resolveField(block.fieldKey, record, ar);
      const label = ar ? block.fieldLabel : (block.fieldLabelFr || block.fieldLabel);
      return blockWrap(`<div style="display:flex;justify-content:space-between;gap:8px;${innerStyle(s)}"><span style="color:#555;">${esc(label)}</span><span style="font-weight:bold;">${esc(val)}</span></div>`, s);
    }
    case 'items_table': {
      const items = record?.items || [];
      if (!items.length) {
        return blockWrap(`<div style="color:#aaa;text-align:center;font-size:11px;">[${ar ? 'جدول البنود' : 'Tableau articles'}]</div>`, s);
      }
      if (isA4) {
        const head = `<tr><th>${ar ? 'المنتج' : 'Produit'}</th><th>${ar ? 'الكمية' : 'Qté'}</th><th>${ar ? 'السعر' : 'Prix'}</th><th>${ar ? 'الإجمالي' : 'Total'}</th></tr>`;
        const rows = items.map(it => `<tr><td>${esc(it.product_name)}</td><td style="text-align:center;">${esc(it.quantity)}</td><td style="text-align:${ar?'left':'right'};">${formatCurrency(it.unit_price)}</td><td style="text-align:${ar?'left':'right'};font-weight:bold;">${formatCurrency(it.total)}</td></tr>`).join('');
        return blockWrap(`<table style="width:100%;border-collapse:collapse;${innerStyle(s)}"><thead style="background:${accentColor};color:#fff;">${head}</thead><tbody>${rows}</tbody></table>`, s);
      }
      const rows = items.map(it => `<div style="margin:4px 0;"><div style="font-weight:bold;">${esc(it.product_name)}</div><div style="display:flex;justify-content:space-between;font-size:${(s.fontSize||12)-1}px;"><span>${esc(it.quantity)} × ${formatCurrency(it.unit_price)}</span><span style="font-weight:bold;">${formatCurrency(it.total)}</span></div></div>`).join('');
      return blockWrap(`<div style="${innerStyle(s)}">${rows}</div>`, s);
    }
    case 'totals': {
      if (!record) {
        return blockWrap(`<div style="color:#aaa;text-align:center;font-size:11px;">[${ar ? 'المجاميع' : 'Totaux'}]</div>`, s);
      }
      const totals = [];
      if (record.subtotal != null) totals.push({ label: ar ? 'المجموع الفرعي' : 'Sous-total', value: formatCurrency(record.subtotal), bold: false });
      if (record.discount) totals.push({ label: ar ? 'الخصم' : 'Remise', value: '-' + formatCurrency(record.discount), bold: false });
      const fee = record.delivery_fee || (record.delivery && record.delivery.fee);
      if (fee) totals.push({ label: ar ? 'التوصيل' : 'Livraison', value: formatCurrency(fee), bold: false });
      if (record.total != null) totals.push({ label: ar ? 'الإجمالي' : 'Total', value: formatCurrency(record.total), bold: true });
      if (record.paid_amount != null) totals.push({ label: ar ? 'المدفوع' : 'Payé', value: formatCurrency(record.paid_amount), bold: false });
      const rem = record.remaining ?? record.debt_amount;
      if (rem != null) totals.push({ label: ar ? 'الباقي' : 'Reste', value: formatCurrency(rem), bold: false });
      if (record.amount != null && !record.total) totals.push({ label: ar ? 'المبلغ' : 'Montant', value: formatCurrency(record.amount), bold: true });
      const rows = totals.map(t => `<div style="display:flex;justify-content:space-between;gap:8px;${t.bold ? `font-weight:bold;font-size:${(s.fontSize||12)+2}px;border-top:2px solid ${accentColor};padding-top:6px;margin-top:6px;color:${accentColor};` : innerStyle(s)}">${esc(t.label)}<span>${esc(t.value)}</span></div>`).join('');
      return blockWrap(rows, s);
    }
    case 'separator':
      return blockWrap(`<hr style="border:none;border-top:${block.separatorStyle === 'solid' ? '1px solid #999' : '1px dashed #999'};margin:0;"/>`, s);
    case 'spacer':
      return `<div style="height:${block.height || 12}px;"></div>`;
    case 'barcode': {
      const val = record ? resolveField(block.fieldKey, record, ar) : '';
      if (!val) {
        return blockWrap(`<div style="color:#aaa;text-align:center;font-size:11px;">[${ar ? 'باركود' : 'Code-barres'}]</div>`, s);
      }
      return blockWrap(`<div style="text-align:center;" class="barcode-placeholder" data-value="${esc(val)}" data-id="${block.id}"><svg id="bc-${block.id}"></svg></div>`, s);
    }
    case 'qr': {
      const val = record ? resolveField(block.fieldKey, record, ar) : '';
      const size = block.qrSize || 80;
      if (!val) {
        return blockWrap(`<div style="display:inline-block;width:${size}px;height:${size}px;border:1px dashed #aaa;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:10px;text-align:center;">[QR]</div>`, s);
      }
      return blockWrap(`<div style="text-align:center;" class="qr-placeholder" data-value="${esc(val)}" data-size="${size}" data-id="${block.id}"><canvas id="qr-${block.id}"></canvas></div>`, s);
    }
    default:
      return '';
  }
}

// ── Main export: build full print HTML from custom template ───────────────────

export function buildCustomTemplateHTML({ template, record, branding = {}, language = 'ar' }) {
  const ar = language === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const paperSize = template.paper_width === 58 ? '58mm' : template.paper_width === 210 ? 'A4' : '80mm';
  const isA4 = paperSize === 'A4';
  const accentColor = template.accent_color || '#0f766e';

  const blocksHtml = (template.blocks || [])
    .map(b => renderBlock(b, record, branding, ar, accentColor, isA4))
    .join('\n');

  const pageStyle = isA4 ? 'size:A4;margin:14mm' : `size:${paperSize} auto;margin:0`;
  const bodyWidth = isA4 ? '100%' : paperSize;
  const bodyPad = isA4 ? '0' : '4mm';
  const fontFamily = isA4 ? "'Segoe UI',Tahoma,Arial,sans-serif" : "'Courier New',monospace";

  // Inline barcode + QR rendering scripts (CDN)
  const scriptHtml = `
<script>
(function(){
  var bcs = document.querySelectorAll('.barcode-placeholder');
  var qrs = document.querySelectorAll('.qr-placeholder');
  var need = bcs.length + qrs.length;
  if(!need) return;
  function loadBarcode(){
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    s.onload = function(){
      bcs.forEach(function(el){
        var val = el.getAttribute('data-value');
        var svg = el.querySelector('svg');
        if(svg && val) try{ JsBarcode(svg, val, {format:'CODE128',width:1.5,height:40,displayValue:true,fontSize:11,margin:2}); }catch(e){}
      });
    };
    document.head.appendChild(s);
  }
  function loadQR(){
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
    s.onload = function(){
      qrs.forEach(function(el){
        var val = el.getAttribute('data-value');
        var size = parseInt(el.getAttribute('data-size')) || 80;
        var canvas = el.querySelector('canvas');
        if(canvas && val && window.QRCode) try{ QRCode.toCanvas(canvas, val, {width:size,margin:1}); }catch(e){}
      });
    };
    document.head.appendChild(s);
  }
  if(bcs.length) loadBarcode();
  if(qrs.length) loadQR();
})();
</script>`;

  return `<!DOCTYPE html><html dir="${dir}" lang="${ar ? 'ar' : 'fr'}"><head><meta charset="UTF-8">
<title>${esc(ar ? template.name_ar : template.name_fr)}</title>
<style>
@page{${pageStyle}}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${fontFamily};font-size:12px;width:${bodyWidth};padding:${bodyPad};direction:${dir};line-height:1.5;color:#111}
table th{color:#fff;padding:8px;text-align:${ar?'right':'left'};font-size:13px}
table td{padding:7px 8px;border-bottom:1px solid #eee}
</style>
</head><body>
${blocksHtml}
${scriptHtml}
</body></html>`;
}

// ── Preview HTML for the editor canvas (no record data) ───────────────────────

export function buildEditorPreviewHTML({ template, branding = {}, language = 'ar' }) {
  return buildCustomTemplateHTML({ template, record: null, branding, language });
}
