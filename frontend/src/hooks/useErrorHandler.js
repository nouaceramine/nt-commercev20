/**
 * useErrorHandler - Shared Error Handling Hook
 * Extracted from multiple pages (Refactoring: Consolidate Duplicate Code)
 * Addresses: Duplicate Code, Dead Code
 */
import { useCallback } from 'react';

export function useErrorHandler({ language, toast } = {}) {
  const handleError = useCallback((error, options = {}) => {
    const {
      fallbackMessage,
      silent = false,
      context = '',
    } = options;

    const message = error?.response?.data?.detail
      || fallbackMessage
      || (language === 'ar' ? 'حدث خطأ' : 'Une erreur s\'est produite');

    if (context) {
      console.error(`[${context}] Error:`, error);
    } else {
      console.error('Error:', error);
    }

    if (!silent && toast) {
      toast.error(message);
    }

    return message;
  }, [language, toast]);

  const handleSuccess = useCallback((message) => {
    if (toast && message) {
      toast.success(message);
    }
  }, [toast]);

  const wrapAsync = useCallback(async (asyncFn, options = {}) => {
    try {
      return await asyncFn();
    } catch (error) {
      handleError(error, options);
      throw error;
    }
  }, [handleError]);

  return { handleError, handleSuccess, wrapAsync };
}
