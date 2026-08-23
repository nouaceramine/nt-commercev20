/**
 * ReceiptService - Thermal Receipt Generation Service
 * Extracted from POSPage.js (Refactoring: Feature Envy -> Move Method)
 * Addresses: Feature Envy, Long Method, Primitive Obsession
 */

import { docCodesHtml } from '../lib/docCodes';

export class ReceiptService {
  constructor(settings, language, isRTL, cashierName) {
    this.settings = settings;
    this.language = language;
    this.isRTL = isRTL;
    this.cashierName = cashierName;
  }

  generateThermalReceiptHtml(sale, printerSize = '80mm') {
    const storeName = this.settings?.store_name || 'NT Commerce';
    const storeAddress = this.settings?.store_address || '';
    const storePhone = this.settings?.store_phone || '';
    const fontSize = printerSize === '58mm' ? '10px' : '12px';
    const titleSize = printerSize === '58mm' ? '14px' : '16px';
    const totalSize = printerSize === '58mm' ? '12px' : '14px';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt</title>
<style>
@page{size:${printerSize} auto;margin:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New','Lucida Console',monospace;font-size:${fontSize};width:${printerSize};padding:3mm;direction:${this.isRTL ? 'rtl' : 'ltr'};line-height:1.4}
.center{text-align:center}.bold{font-weight:bold}.line{border-bottom:1px dashed #000;margin:4px 0}
.double-line{border-bottom:2px solid #000;margin:4px 0}.row{display:flex;justify-content:space-between;gap:4px}
.items{margin:8px 0}.item{margin:4px 0;padding-bottom:2px}.total{font-size:${totalSize};font-weight:bold}
.footer{margin-top:12px;font-size:9px}.cashier{font-size:9px;color:#666;margin-top:4px}
</style></head><body>
<div class="center bold" style="font-size:${titleSize}">${storeName}</div>
${storeAddress ? `<div class="center" style="font-size:10px">${storeAddress}</div>` : ''}
${storePhone ? `<div class="center" style="font-size:10px">${storePhone}</div>` : ''}
<div class="double-line"></div>
<div class="row"><span>${this.language === 'ar' ? 'رقم:' : 'N°:'}</span><span class="bold">${sale.invoice_number || sale.code}</span></div>
<div class="row"><span>${this.language === 'ar' ? 'التاريخ:' : 'Date:'}</span><span>${new Date(sale.created_at).toLocaleString(this.language === 'ar' ? 'ar-DZ' : 'fr-FR')}</span></div>
${sale.customer_name ? `<div class="row"><span>${this.language === 'ar' ? 'الزبون:' : 'Client:'}</span><span>${sale.customer_name}</span></div>` : ''}
<div class="line"></div>
<div class="items">${(sale.items || []).map(item => `<div class="item"><div class="bold">${item.product_name}</div><div class="row"><span>${item.quantity} x ${this.formatCurrency(item.unit_price)}</span><span class="bold">${this.formatCurrency(item.total)}</span></div></div>`).join('')}</div>
<div class="line"></div>
<div class="row"><span>${this.language === 'ar' ? 'المجموع الفرعي:' : 'Sous-total:'}</span><span>${this.formatCurrency(sale.subtotal)}</span></div>
${sale.discount > 0 ? `<div class="row"><span>${this.language === 'ar' ? 'الخصم:' : 'Remise:'}</span><span>-${this.formatCurrency(sale.discount)}</span></div>` : ''}
${sale.delivery?.fee > 0 ? `<div class="row"><span>${this.language === 'ar' ? 'التوصيل:' : 'Livraison:'}</span><span>${this.formatCurrency(sale.delivery.fee)}</span></div>` : ''}
<div class="double-line"></div>
<div class="row total"><span>${this.language === 'ar' ? 'الإجمالي:' : 'TOTAL:'}</span><span>${this.formatCurrency(sale.total)} ${this.language === 'ar' ? 'دج' : 'DA'}</span></div>
${sale.paid_amount ? `<div class="row" style="margin-top:4px"><span>${this.language === 'ar' ? 'المدفوع:' : 'Paye:'}</span><span>${this.formatCurrency(sale.paid_amount)}</span></div>${sale.total - sale.paid_amount > 0 ? `<div class="row"><span>${this.language === 'ar' ? 'الباقي:' : 'Reste:'}</span><span>${this.formatCurrency(sale.total - sale.paid_amount)}</span></div>` : ''}` : ''}
${docCodesHtml(sale.invoice_number || sale.code || '', { qrSize: 80, barcodeHeight: 30, label: this.language === 'ar' ? 'امسح الرمز لعرض بيانات الفاتورة' : 'Scannez pour voir la facture' })}
<div class="footer center"><div class="line"></div><div style="margin-top:6px">${this.language === 'ar' ? 'شكراً لزيارتكم' : 'Merci de votre visite'}</div><div class="cashier">${this.language === 'ar' ? 'البائع:' : 'Caissier:'} ${this.cashierName}</div></div>
</body></html>`;
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('ar-DZ', { minimumFractionDigits: 2 }).format(amount || 0);
  }

  printReceipt(sale, printerSize = '80mm') {
    const receiptHtml = this.generateThermalReceiptHtml(sale, printerSize);
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (printWindow) {
      printWindow.document.write(receiptHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }
  }

  static async printSaleReceipt(apiClient, saleId, settings, language, isRTL, cashierName, printerSize = '80mm') {
    try {
      const response = await apiClient.get(`/sales/${saleId}`);
      const sale = response.data;
      const service = new ReceiptService(settings, language, isRTL, cashierName);
      service.printReceipt(sale, printerSize);
      return { success: true };
    } catch (error) {
      console.error('Print error:', error);
      return { success: false, error };
    }
  }
}
