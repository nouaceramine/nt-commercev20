/**
 * Modern ready-made print template presets (p122)
 * Three modern block-based templates with QR codes:
 *   - sale invoice (QR = invoice number for verification)
 *   - product card (QR = barcode)
 *   - repair ticket (QR = ticket number for tracking)
 * Imported on demand from the printing settings page.
 */
import { createBlock } from './customTemplateRenderer';

const b = (type, docType, patch = {}) => Object.assign(createBlock(type, docType), patch);

const field = (docType, key, ar, fr, stylePatch = {}) =>
  b('field', docType, { fieldKey: key, fieldLabel: ar, fieldLabelFr: fr, style: { ...createBlock('field', docType).style, ...stylePatch } });

export const MODERN_TEMPLATE_PRESETS = [
  {
    key: 'modern-sale-qr',
    name_ar: 'فاتورة عصرية + QR',
    name_fr: 'Facture moderne + QR',
    type: 'sale',
    paperWidth: 80,
    accentColor: '#0f766e',
    buildBlocks: () => [
      b('logo', 'sale'),
      b('store_name', 'sale'),
      b('separator', 'sale'),
      field('sale', 'invoice_number', 'رقم الفاتورة', 'N° facture'),
      field('sale', 'date', 'التاريخ', 'Date'),
      field('sale', 'customer_name', 'الزبون', 'Client'),
      b('separator', 'sale'),
      b('items_table', 'sale'),
      b('totals', 'sale'),
      b('separator', 'sale'),
      b('qr', 'sale', { fieldKey: 'invoice_number', fieldLabel: 'رقم الفاتورة', fieldLabelFr: 'N° facture', qrSize: 90 }),
      b('text', 'sale', { content: 'شكراً لتسوقكم معنا', style: { ...createBlock('text', 'sale').style, fontSize: 11 } }),
    ],
  },
  {
    key: 'modern-product-qr',
    name_ar: 'بطاقة منتج عصرية + QR',
    name_fr: 'Fiche produit moderne + QR',
    type: 'product',
    paperWidth: 80,
    accentColor: '#1d4ed8',
    buildBlocks: () => [
      b('store_name', 'product', { style: { ...createBlock('store_name', 'product').style, fontSize: 14 } }),
      b('separator', 'product'),
      field('product', 'name', 'المنتج', 'Produit', { fontSize: 13 }),
      field('product', 'retail_price', 'السعر', 'Prix', { fontSize: 14, fontWeight: 'bold' }),
      b('barcode', 'product', { fieldKey: 'barcode', fieldLabel: 'الباركود', fieldLabelFr: 'Code-barres' }),
      b('qr', 'product', { fieldKey: 'barcode', fieldLabel: 'الباركود', fieldLabelFr: 'Code-barres', qrSize: 70 }),
    ],
  },
  {
    key: 'modern-repair-qr',
    name_ar: 'تذكرة صيانة عصرية + QR',
    name_fr: 'Ticket réparation moderne + QR',
    type: 'repair',
    paperWidth: 80,
    accentColor: '#b45309',
    buildBlocks: () => [
      b('store_name', 'repair'),
      b('text', 'repair', { content: 'إيصال استلام جهاز للصيانة', style: { ...createBlock('text', 'repair').style, fontSize: 11, color: '#666666' } }),
      field('repair', 'ticket_number', 'رقم التذكرة', 'N° ticket', { fontSize: 15, fontWeight: 'bold' }),
      b('qr', 'repair', { fieldKey: 'ticket_number', fieldLabel: 'رقم التذكرة', fieldLabelFr: 'N° ticket', qrSize: 90 }),
      b('separator', 'repair'),
      field('repair', 'customer_name', 'الزبون', 'Client'),
      field('repair', 'customer_phone', 'الهاتف', 'Tél'),
      field('repair', 'device_brand', 'الماركة', 'Marque'),
      field('repair', 'device_model', 'الموديل', 'Modèle'),
      field('repair', 'problem_description', 'المشكلة', 'Problème'),
      b('separator', 'repair'),
      field('repair', 'estimated_cost', 'التكلفة المقدرة', 'Coût estimé'),
      field('repair', 'advance_payment', 'الدفعة المقدمة', 'Avance'),
      field('repair', 'final_cost', 'التكلفة النهائية', 'Coût final'),
      field('repair', 'status', 'الحالة', 'Statut'),
      field('repair', 'date', 'التاريخ', 'Date'),
      b('separator', 'repair'),
      b('text', 'repair', { content: 'يرجى الاحتفاظ بهذا الإيصال لاستلام الجهاز', style: { ...createBlock('text', 'repair').style, fontSize: 10, color: '#666666' } }),
    ],
  },
];
