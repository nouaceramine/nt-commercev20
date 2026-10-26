/**
 * useCurrencyFormatter - Shared Currency Formatting Hook
 * Extracted from multiple pages (Refactoring: Consolidate Duplicate Code)
 * Addresses: Duplicate Code
 */
import { useCallback } from 'react';

export function useCurrencyFormatter(locale = 'ar-DZ', currency = 'DA') {
  const formatCurrency = useCallback((amount, options = {}) => {
    const {
      minimumFractionDigits = 2,
      maximumFractionDigits = 2,
      showCurrency = true,
    } = options;

    const safeMinimum = Math.max(0, Math.min(20, Number(minimumFractionDigits) || 0));
    const safeMaximum = Math.max(safeMinimum, Math.min(20, Number(maximumFractionDigits) || 0));
    const numericAmount = Number(amount);
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: safeMinimum,
      maximumFractionDigits: safeMaximum,
    }).format(Number.isFinite(numericAmount) ? numericAmount : 0);

    return showCurrency ? `${formatted} ${currency}` : formatted;
  }, [locale, currency]);

  const formatNumber = useCallback((number, decimals = 0) => {
    const digits = Math.max(0, Math.min(20, Number(decimals) || 0));
    const numericValue = Number(number);
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number.isFinite(numericValue) ? numericValue : 0);
  }, [locale]);

  return { formatCurrency, formatNumber };
}
