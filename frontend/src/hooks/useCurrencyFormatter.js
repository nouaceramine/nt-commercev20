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

    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(amount || 0);

    return showCurrency ? `${formatted} ${currency}` : formatted;
  }, [locale, currency]);

  const formatNumber = useCallback((number, decimals = 0) => {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(number || 0);
  }, [locale]);

  return { formatCurrency, formatNumber };
}
