/**
 * useEcomOrderNotifications — Polls /api/ecom/orders/summary every 30s and fires
 * a desktop notification when the "new" orders counter increases.
 *
 * Lightweight: only runs while the hook is mounted (i.e. while user is on /ecom-hub),
 * stores last-seen counter in localStorage so we don't re-notify after a reload.
 */
import { useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';

const STORAGE_KEY = 'ecom_last_new_count';
const POLL_INTERVAL_MS = 30_000;

export function useEcomOrderNotifications(enabled = true) {
  const lastCountRef = useRef(parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10));
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const tick = async () => {
      try {
        const res = await apiClient.get('/ecom/orders/summary');
        const newCount = res.data?.by_status?.new || 0;
        const previous = lastCountRef.current;
        if (newCount > previous && previous > 0) {
          const delta = newCount - previous;
          new Notification('🛍️ طلب جديد في صندوقك', {
            body: delta === 1
              ? 'وصل طلب جديد — افتح صندوق الطلبات لمتابعته.'
              : `وصل ${delta} طلب جديد — افتح صندوق الطلبات لمتابعتها.`,
            tag: 'ecom-new-orders',
            requireInteraction: false,
            icon: '/favicon.ico',
          });
        }
        lastCountRef.current = newCount;
        localStorage.setItem(STORAGE_KEY, String(newCount));
      } catch {
        /* silent — quotation polling failure is not user-visible */
      }
    };

    // Run once immediately to sync baseline, then on interval
    tick();
    timerRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled]);
}

/** Helper to request browser notification permission once, with a toast. */
export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { granted: false, reason: 'unsupported' };
  }
  if (Notification.permission === 'granted') return { granted: true };
  if (Notification.permission === 'denied') return { granted: false, reason: 'denied' };
  const result = await Notification.requestPermission();
  return { granted: result === 'granted', reason: result };
}
