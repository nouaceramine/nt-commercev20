/**
 * ReceiptService Tests
 * Phase 4f: Unit Tests for Receipt Generation Service
 */
import JsBarcode from 'jsbarcode';
import { ReceiptService } from '../../services/ReceiptService';

describe('ReceiptService', () => {
  const settings = { store_name: 'Test Store', store_address: '123 Main St', store_phone: '0555123456' };
  const canvasContext = {
    save: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    translate: jest.fn(),
    restore: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn(text => ({ width: text.length * 7 })),
  };
  let canvasContextSpy;
  let canvasDataUrlSpy;

  beforeEach(() => {
    canvasContextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => canvasContext);
    canvasDataUrlSpy = jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,dGVzdA==');
  });

  afterEach(() => {
    canvasContextSpy.mockRestore();
    canvasDataUrlSpy.mockRestore();
  });
  const language = 'ar';
  const isRTL = true;
  const cashierName = 'John Doe';

  it('should render a CODE128 barcode through the canvas test adapter', () => {
    const canvas = document.createElement('canvas');
    expect(canvas.getContext('2d')).toBe(canvasContext);
    JsBarcode(canvas, 'INV-001', {
      format: 'CODE128',
      displayValue: true,
      margin: 2,
    });

    expect(canvas.toDataURL('image/png')).toBe('data:image/png;base64,dGVzdA==');
    expect(canvasContext.fillRect).toHaveBeenCalled();
  });

  // ── generateThermalReceiptHtml ──────────────────────────────────
  describe('generateThermalReceiptHtml', () => {
    it('should generate valid HTML receipt', () => {
      const service = new ReceiptService(settings, language, isRTL, cashierName);
      const sale = {
        invoice_number: 'INV-001',
        code: 'S001',
        created_at: new Date().toISOString(),
        customer_name: 'Ahmed',
        items: [
          { product_name: 'Product A', quantity: 2, unit_price: 100, total: 200 },
        ],
        subtotal: 200,
        discount: 0,
        total: 200,
        paid_amount: 200,
      };

      const html = service.generateThermalReceiptHtml(sale, '80mm');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Test Store');
      expect(html).toContain('INV-001');
      expect(html).toContain('Product A');
      expect(html).toContain('200');
      expect(html).toContain('80mm'); // paper width in style
      expect(html).toContain('src="data:image/png;base64,dGVzdA=="');
      expect(html).toContain('alt="barcode"');
    });

    it('should include store details when available', () => {
      const service = new ReceiptService(settings, language, isRTL, cashierName);
      const sale = {
        invoice_number: 'INV-001',
        created_at: new Date().toISOString(),
        items: [],
        subtotal: 0,
        discount: 0,
        total: 0,
      };

      const html = service.generateThermalReceiptHtml(sale);

      expect(html).toContain('123 Main St');
      expect(html).toContain('0555123456');
    });

    it('should show discount when present', () => {
      const service = new ReceiptService(settings, language, isRTL, cashierName);
      const sale = {
        invoice_number: 'INV-001',
        created_at: new Date().toISOString(),
        items: [{ product_name: 'Item', quantity: 1, unit_price: 100, total: 100 }],
        subtotal: 100,
        discount: 10,
        total: 90,
      };

      const html = service.generateThermalReceiptHtml(sale);

      expect(html).toContain('10'); // discount amount
    });

    it('should handle different paper sizes', () => {
      const service = new ReceiptService(settings, language, isRTL, cashierName);
      const sale = {
        invoice_number: 'INV-001',
        created_at: new Date().toISOString(),
        items: [],
        subtotal: 0,
        discount: 0,
        total: 0,
      };

      const html58 = service.generateThermalReceiptHtml(sale, '58mm');
      const html80 = service.generateThermalReceiptHtml(sale, '80mm');

      expect(html58).toContain('10px'); // smaller font
      expect(html80).toContain('12px');
    });
  });

  // ── formatCurrency ──────────────────────────────────────────────
  describe('formatCurrency', () => {
    it('should format currency correctly', () => {
      const service = new ReceiptService(settings, language, isRTL, cashierName);
      expect(service.formatCurrency(1500)).toBe(new Intl.NumberFormat('ar-DZ', { minimumFractionDigits: 2 }).format(1500));
      expect(service.formatCurrency(0)).toBe(new Intl.NumberFormat('ar-DZ', { minimumFractionDigits: 2 }).format(0));
      expect(service.formatCurrency(null)).toBe(new Intl.NumberFormat('ar-DZ', { minimumFractionDigits: 2 }).format(0));
    });
  });

  // ── printReceipt ────────────────────────────────────────────────
  describe('printReceipt', () => {
    it('should open print window', () => {
      const service = new ReceiptService(settings, language, isRTL, cashierName);
      const sale = {
        invoice_number: 'INV-001',
        created_at: new Date().toISOString(),
        items: [],
        subtotal: 0,
        discount: 0,
        total: 0,
      };

      service.printReceipt(sale);

      expect(window.open).toHaveBeenCalled();
    });
  });
});
