/**
 * p261: barcode/QR helpers for printed documents (invoices, receipts).
 *
 * - barcodeDataURL(): Code128 linear barcode rendered offline via JsBarcode
 *   (already bundled) into an offscreen canvas -> data: URL for <img>.
 * - qrImgUrl(): server-rendered QR PNG (backend /api/qr.png, python qrcode) —
 *   same-origin, cacheable, works inside print windows without any CDN.
 */
import JsBarcode from 'jsbarcode';
import { escapeHtml } from './escape';
import { safeCssNumber } from './printSafety';

export function barcodeDataURL(text, { width = 1.4, height = 34, fontSize = 11 } = {}) {
  const value = String(text || '').trim();
  if (!value) return '';
  width = safeCssNumber(width, 1.4, 0.5, 5);
  height = safeCssNumber(height, 34, 10, 300);
  fontSize = safeCssNumber(fontSize, 11, 6, 40);
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width,
      height,
      displayValue: true,
      fontSize,
      margin: 2,
      background: '#ffffff',
    });
    return canvas.toDataURL('image/png');
  } catch (_e) {
    return '';
  }
}

export function qrImgUrl(text, size = 140) {
  const value = String(text || '').trim();
  if (!value) return '';
  const safeSize = safeCssNumber(size, 140, 16, 512);
  return `/api/qr.png?text=${encodeURIComponent(value)}&size=${safeSize}`;
}

/** QR + barcode block shared by receipt/invoice templates (same look). */
export function docCodesHtml(code, { qrText = '', qrSize = 90, barcodeHeight = 34, label = '' } = {}) {
  const value = String(code || '').trim();
  if (!value) return '';
  const parts = [];
  const safeQrSize = safeCssNumber(qrSize, 90, 16, 512);
  const qr = qrImgUrl(qrText || value, safeQrSize);
  const bc = barcodeDataURL(value, { height: barcodeHeight });
  parts.push('<div class="doc-codes" style="text-align:center;margin-top:10px">');
  if (qr) parts.push(`<img src="${qr}" alt="QR" style="width:${safeQrSize}px;height:${safeQrSize}px;display:inline-block" />`);
  if (bc) parts.push(`<div style="margin-top:4px"><img src="${bc}" alt="barcode" style="max-width:100%" /></div>`);
  if (label) parts.push(`<div style="font-size:10px;color:#555;margin-top:2px">${escapeHtml(label)}</div>`);
  parts.push('</div>');
  return parts.join('');
}
