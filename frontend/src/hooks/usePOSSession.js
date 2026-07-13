/**
 * usePOSSession - POS Session State Management Hook
 * Extracted from POSPage.js (Refactoring: Extract Hook)
 * Addresses: Large Class, Temporary Fields, Data Clumps
 */
import { useState, useCallback } from 'react';

export function usePOSSession({ language, toast, apiClient }) {
  const [hasOpenSession, setHasOpenSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionStats, setSessionStats] = useState(null);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [showCloseSessionDialog, setShowCloseSessionDialog] = useState(false);
  const [showSessionDetailsDialog, setShowSessionDetailsDialog] = useState(false);
  const [openingCash, setOpeningCash] = useState(0);
  const [closingCash, setClosingCash] = useState(0);
  const [closingNotes, setClosingNotes] = useState('');
  const [cashBoxBalance, setCashBoxBalance] = useState(0);
  const [isStaleSession, setIsStaleSession] = useState(false);

  const fetchCashBoxBalance = useCallback(async () => {
    try {
      const response = await apiClient.get('/cash-boxes');
      const cashBox = response.data.find(b => b.id === 'cash');
      if (cashBox) {
        setCashBoxBalance(cashBox.balance || 0);
        setOpeningCash(cashBox.balance || 0);
        setClosingCash(cashBox.balance || 0);
      }
    } catch (error) {
      console.error('Error fetching cash box:', error);
    }
  }, [apiClient]);

  const checkOpenSession = useCallback(async () => {
    try {
      const response = await apiClient.get('/daily-sessions/current');
      const session = response.data;
      if (session && session.status === 'open') {
        setHasOpenSession(true);
        setCurrentSession(session);
        const sessionDay = new Date(session.opened_at).toDateString();
        const today = new Date().toDateString();
        const stale = sessionDay !== today;
        setIsStaleSession(stale);
        if (stale) {
          setTimeout(() => toast.warning(
            language === 'ar'
              ? '⚠️ حصة من يوم سابق لا تزال مفتوحة — يُنصح بإغلاقها'
              : '⚠️ Session d\'un jour précédent toujours ouverte'
          ), 1500);
        }
      } else {
        setHasOpenSession(false);
        setCurrentSession(null);
        setSessionStats(null);
      }
    } catch (error) {
      setHasOpenSession(false);
      setCurrentSession(null);
      setSessionStats(null);
    } finally {
      setCheckingSession(false);
    }
  }, [apiClient, language, toast]);

  const fetchSessionStats = useCallback(async (sessionId) => {
    try {
      const salesRes = await apiClient.get('/sales');
      const today = new Date().toISOString().split('T')[0];
      const todaySales = (salesRes.data.sales || salesRes.data || []).filter(s => s.created_at?.startsWith(today));

      const cashSales = todaySales.filter(s => s.payment_type === 'cash').reduce((sum, s) => sum + (s.total || 0), 0);
      const creditSales = todaySales.filter(s => s.payment_type === 'credit').reduce((sum, s) => sum + (s.total || 0), 0);
      const totalSales = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
      const salesCount = todaySales.length;

      setSessionStats({ cashSales, creditSales, totalSales, salesCount, todaySales });
    } catch (error) {
      console.error('Error fetching session stats:', error);
    }
  }, [apiClient]);

  const openSession = useCallback(async () => {
    try {
      let code = '';
      try {
        const codeRes = await apiClient.get('/daily-sessions/generate-code');
        code = codeRes.data.code;
      } catch (e) { /* silent */ }

      const session = {
        code,
        opening_cash: openingCash,
        opened_at: new Date().toISOString(),
        status: 'open'
      };

      const response = await apiClient.post('/daily-sessions', session);
      setCurrentSession(response.data);
      setHasOpenSession(true);
      setShowSessionDialog(false);
      setSessionStats({ cashSales: 0, creditSales: 0, totalSales: 0, salesCount: 0, todaySales: [] });
      toast.success(language === 'ar' ? 'تم فتح الحصة بنجاح' : 'Session ouverte avec succes');
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'حدث خطأ' : 'Une erreur s\'est produite'));
    }
  }, [apiClient, openingCash, language, toast]);

  const closeSession = useCallback(async () => {
    if (!currentSession) return;
    try {
      const closingData = {
        closing_cash: closingCash,
        closed_at: new Date().toISOString(),
        notes: closingNotes,
        status: 'closed'
      };
      await apiClient.put(`/daily-sessions/${currentSession.id}/close`, closingData);
      setCurrentSession(null);
      setHasOpenSession(false);
      setSessionStats(null);
      setShowCloseSessionDialog(false);
      setClosingNotes('');
      toast.success(language === 'ar' ? 'تم غلق الحصة بنجاح' : 'Session fermee avec succes');
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'حدث خطأ' : 'Une erreur s\'est produite'));
    }
  }, [apiClient, currentSession, closingCash, closingNotes, language, toast]);

  return {
    // State
    hasOpenSession, setHasOpenSession,
    checkingSession, setCheckingSession,
    currentSession, setCurrentSession,
    sessionStats, setSessionStats,
    showSessionDialog, setShowSessionDialog,
    showCloseSessionDialog, setShowCloseSessionDialog,
    showSessionDetailsDialog, setShowSessionDetailsDialog,
    openingCash, setOpeningCash,
    closingCash, setClosingCash,
    closingNotes, setClosingNotes,
    cashBoxBalance, setCashBoxBalance,
    isStaleSession, setIsStaleSession,
    // Actions
    checkOpenSession,
    fetchSessionStats,
    fetchCashBoxBalance,
    openSession,
    closeSession,
  };
}
