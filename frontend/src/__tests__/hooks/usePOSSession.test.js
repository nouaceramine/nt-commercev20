/**
 * usePOSSession Hook Tests
 * Phase 4c: Unit Tests for Session Management Hook
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { usePOSSession } from '../../hooks/usePOSSession';
import { createMockSession, createMockToast, createMockApiClient } from '../testUtils';

describe('usePOSSession', () => {
  const mockToast = createMockToast();
  const mockApi = createMockApiClient();
  const defaultProps = { language: 'ar', toast: mockToast, apiClient: mockApi };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Initialization ──────────────────────────────────────────────
  describe('Initialization', () => {
    it('should initialize with no open session', () => {
      const { result } = renderHook(() => usePOSSession(defaultProps));
      expect(result.current.hasOpenSession).toBe(false);
      expect(result.current.currentSession).toBeNull();
      expect(result.current.checkingSession).toBe(true);
    });
  });

  // ── checkOpenSession ─────────────────────────────────────────────
  describe('checkOpenSession', () => {
    it('should detect open session', async () => {
      const session = createMockSession();
      mockApi.get.mockResolvedValue({ data: session });

      const { result, waitForNextUpdate } = renderHook(() => usePOSSession(defaultProps));
      
      act(() => { result.current.checkOpenSession(); });
      await waitForNextUpdate();

      expect(result.current.hasOpenSession).toBe(true);
      expect(result.current.currentSession).toEqual(session);
      expect(result.current.checkingSession).toBe(false);
    });

    it('should handle no open session', async () => {
      mockApi.get.mockRejectedValue(new Error('No session'));

      const { result, waitForNextUpdate } = renderHook(() => usePOSSession(defaultProps));
      
      act(() => { result.current.checkOpenSession(); });
      await waitForNextUpdate();

      expect(result.current.hasOpenSession).toBe(false);
      expect(result.current.currentSession).toBeNull();
    });

    it('should detect stale session (different day)', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const session = createMockSession({ opened_at: yesterday.toISOString() });
      mockApi.get.mockResolvedValue({ data: session });

      const { result, waitForNextUpdate } = renderHook(() => usePOSSession(defaultProps));
      
      act(() => { result.current.checkOpenSession(); });
      await waitForNextUpdate();

      expect(result.current.isStaleSession).toBe(true);
    });
  });

  // ── openSession ──────────────────────────────────────────────────
  describe('openSession', () => {
    it('should open a new session', async () => {
      const newSession = createMockSession();
      mockApi.get.mockResolvedValue({ data: {} }); // generate-code
      mockApi.post.mockResolvedValue({ data: newSession });

      const { result } = renderHook(() => usePOSSession(defaultProps));
      
      act(() => { result.current.setOpeningCash(5000); });
      
      let success;
      await act(async () => {
        success = await result.current.openSession();
      });

      expect(mockApi.post).toHaveBeenCalledWith('/daily-sessions', expect.objectContaining({
        opening_cash: 5000,
        status: 'open',
      }));
      expect(result.current.hasOpenSession).toBe(true);
    });
  });

  // ── closeSession ─────────────────────────────────────────────────
  describe('closeSession', () => {
    it('should close current session', async () => {
      const session = createMockSession();
      mockApi.put.mockResolvedValue({ data: {} });

      const { result } = renderHook(() => usePOSSession(defaultProps));
      
      act(() => {
        result.current.setCurrentSession(session);
        result.current.setHasOpenSession(true);
        result.current.setClosingCash(4500);
        result.current.setClosingNotes('Good day');
      });

      await act(async () => {
        await result.current.closeSession();
      });

      expect(mockApi.put).toHaveBeenCalledWith(`/daily-sessions/${session.id}/close`, expect.objectContaining({
        closing_cash: 4500,
        notes: 'Good day',
        status: 'closed',
      }));
      expect(result.current.hasOpenSession).toBe(false);
      expect(result.current.currentSession).toBeNull();
    });
  });

  // ── fetchCashBoxBalance ──────────────────────────────────────────
  describe('fetchCashBoxBalance', () => {
    it('should fetch and set cash box balance', async () => {
      mockApi.get.mockResolvedValue({ data: [{ id: 'cash', balance: 7500 }] });

      const { result } = renderHook(() => usePOSSession(defaultProps));
      
      await act(async () => {
        await result.current.fetchCashBoxBalance();
      });

      expect(result.current.cashBoxBalance).toBe(7500);
      expect(result.current.openingCash).toBe(7500);
      expect(result.current.closingCash).toBe(7500);
    });
  });
});
