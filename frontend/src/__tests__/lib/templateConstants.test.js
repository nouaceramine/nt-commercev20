/**
 * Template Constants Tests
 * Phase 4g: Constants Unit Tests
 */
import {
  PAPER_OPTIONS,
  WIDTH_PRESETS,
  PAPER_WIDTH_MAP,
  DEFAULT_TEMPLATE,
  getPaperWidthPx,
  isA4Paper,
  getPrinterType,
} from '../../lib/templateConstants';

describe('templateConstants', () => {
  describe('PAPER_OPTIONS', () => {
    it('should have 3 paper options', () => {
      expect(PAPER_OPTIONS).toHaveLength(3);
    });

    it('should include 58mm option', () => {
      const opt58 = PAPER_OPTIONS.find(o => o.value === 58);
      expect(opt58).toBeDefined();
      expect(opt58.label).toContain('58mm');
    });

    it('should include A4 option', () => {
      const a4 = PAPER_OPTIONS.find(o => o.value === 210);
      expect(a4).toBeDefined();
      expect(a4.label).toContain('A4');
    });
  });

  describe('WIDTH_PRESETS', () => {
    it('should have 4 width presets', () => {
      expect(WIDTH_PRESETS).toHaveLength(4);
    });

    it('should include full width (100%)', () => {
      const full = WIDTH_PRESETS.find(w => w.value === 100);
      expect(full).toBeDefined();
    });
  });

  describe('PAPER_WIDTH_MAP', () => {
    it('should map 58mm to 219px', () => {
      expect(PAPER_WIDTH_MAP[58]).toBe(219);
    });

    it('should map 80mm to 302px', () => {
      expect(PAPER_WIDTH_MAP[80]).toBe(302);
    });

    it('should map A4 to 390px', () => {
      expect(PAPER_WIDTH_MAP[210]).toBe(390);
    });
  });

  describe('DEFAULT_TEMPLATE', () => {
    it('should have correct defaults', () => {
      expect(DEFAULT_TEMPLATE.name_ar).toBe('قالب جديد');
      expect(DEFAULT_TEMPLATE.paperWidth).toBe(80);
      expect(DEFAULT_TEMPLATE.accentColor).toBe('#0f766e');
      expect(DEFAULT_TEMPLATE.blocks).toEqual([]);
    });
  });

  describe('getPaperWidthPx', () => {
    it('should return correct pixel width', () => {
      expect(getPaperWidthPx(58)).toBe(219);
      expect(getPaperWidthPx(80)).toBe(302);
      expect(getPaperWidthPx(210)).toBe(390);
    });

    it('should fallback to 80mm for unknown width', () => {
      expect(getPaperWidthPx(999)).toBe(302);
    });
  });

  describe('isA4Paper', () => {
    it('should return true for 210mm', () => {
      expect(isA4Paper(210)).toBe(true);
    });

    it('should return false for non-A4', () => {
      expect(isA4Paper(80)).toBe(false);
      expect(isA4Paper(58)).toBe(false);
    });
  });

  describe('getPrinterType', () => {
    it('should return a4 for A4 paper', () => {
      expect(getPrinterType(210)).toBe('a4');
    });

    it('should return thermal for non-A4', () => {
      expect(getPrinterType(80)).toBe('thermal');
      expect(getPrinterType(58)).toBe('thermal');
    });
  });
});
