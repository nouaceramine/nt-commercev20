/**
 * useCurrencyFormatter Hook Tests
 * Phase 4e: Unit Tests
 */
import { renderHook } from '@testing-library/react-hooks';
import { useCurrencyFormatter } from '../../hooks/useCurrencyFormatter';

describe('useCurrencyFormatter', () => {
  // ── formatCurrency ──────────────────────────────────────────────
  describe('formatCurrency', () => {
    it('should format with currency symbol', () => {
      const { result } = renderHook(() => useCurrencyFormatter('ar-DZ', 'DA'));
      expect(result.current.formatCurrency(1500)).toBe('1,500.00 DA');
    });

    it('should format without currency symbol', () => {
      const { result } = renderHook(() => useCurrencyFormatter('ar-DZ', 'DA'));
      expect(result.current.formatCurrency(1500, { showCurrency: false })).toBe('1,500.00');
    });

    it('should handle zero amount', () => {
      const { result } = renderHook(() => useCurrencyFormatter());
      expect(result.current.formatCurrency(0)).toBe('0.00 DA');
    });

    it('should handle null/undefined', () => {
      const { result } = renderHook(() => useCurrencyFormatter());
      expect(result.current.formatCurrency(null)).toBe('0.00 DA');
      expect(result.current.formatCurrency(undefined)).toBe('0.00 DA');
    });

    it('should format with custom fraction digits', () => {
      const { result } = renderHook(() => useCurrencyFormatter());
      expect(result.current.formatCurrency(1500.555, { minimumFractionDigits: 3 })).toBe('1,500.555 DA');
    });
  });

  // ── formatNumber ────────────────────────────────────────────────
  describe('formatNumber', () => {
    it('should format number without decimals', () => {
      const { result } = renderHook(() => useCurrencyFormatter());
      expect(result.current.formatNumber(1500)).toBe('1,500');
    });

    it('should format number with decimals', () => {
      const { result } = renderHook(() => useCurrencyFormatter());
      expect(result.current.formatNumber(1500.5, 2)).toBe('1,500.50');
    });
  });

  // ── Memoization ─────────────────────────────────────────────────
  describe('Memoization', () => {
    it('should return same function reference across renders', () => {
      const { result, rerender } = renderHook(() => useCurrencyFormatter('ar-DZ', 'DA'));
      const firstFormat = result.current.formatCurrency;
      rerender();
      expect(result.current.formatCurrency).toBe(firstFormat);
    });
  });
});
