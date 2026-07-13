/**
 * useErrorHandler Hook Tests
 * Phase 4e: Unit Tests
 */
import { renderHook } from '@testing-library/react-hooks';
import { useErrorHandler } from '../../hooks/useErrorHandler';

describe('useErrorHandler', () => {
  const mockToast = { error: jest.fn(), success: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── handleError ─────────────────────────────────────────────────
  describe('handleError', () => {
    it('should show toast with error detail', () => {
      const { result } = renderHook(() => useErrorHandler({ language: 'ar', toast: mockToast }));
      const error = { response: { data: { detail: 'Something went wrong' } } };

      result.current.handleError(error);

      expect(mockToast.error).toHaveBeenCalledWith('Something went wrong');
    });

    it('should use fallback message when no detail', () => {
      const { result } = renderHook(() => useErrorHandler({ language: 'ar', toast: mockToast }));
      result.current.handleError(new Error('Generic error'), { fallbackMessage: 'Custom error' });
      expect(mockToast.error).toHaveBeenCalledWith('Custom error');
    });

    it('should not show toast when silent', () => {
      const { result } = renderHook(() => useErrorHandler({ language: 'ar', toast: mockToast }));
      result.current.handleError(new Error('Test'), { silent: true });
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('should log to console with context', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const { result } = renderHook(() => useErrorHandler({ language: 'ar', toast: mockToast }));
      result.current.handleError(new Error('Test'), { context: 'CartOperations' });
      expect(consoleSpy).toHaveBeenCalledWith('[CartOperations] Error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  // ── handleSuccess ───────────────────────────────────────────────
  describe('handleSuccess', () => {
    it('should show success toast', () => {
      const { result } = renderHook(() => useErrorHandler({ toast: mockToast }));
      result.current.handleSuccess('Operation completed');
      expect(mockToast.success).toHaveBeenCalledWith('Operation completed');
    });
  });

  // ── wrapAsync ───────────────────────────────────────────────────
  describe('wrapAsync', () => {
    it('should return result on success', async () => {
      const { result } = renderHook(() => useErrorHandler({ toast: mockToast }));
      const asyncFn = async () => 42;
      const value = await result.current.wrapAsync(asyncFn);
      expect(value).toBe(42);
    });

    it('should handle error and rethrow', async () => {
      const { result } = renderHook(() => useErrorHandler({ language: 'ar', toast: mockToast }));
      const asyncFn = async () => { throw new Error('Failed'); };
      await expect(result.current.wrapAsync(asyncFn)).rejects.toThrow('Failed');
      expect(mockToast.error).toHaveBeenCalled();
    });
  });
});
