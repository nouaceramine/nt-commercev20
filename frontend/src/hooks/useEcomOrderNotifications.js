/**
 * useEcomOrderNotifications — Polls /api/ecom/orders/summary every 30s and, when the
 * "new" orders counter increases, plays a sound chime (always) plus a desktop
 * notification (when permission is granted).
 *
 * p139 fix: previously the hook returned early unless Notification.permission ===
 * 'granted', so no polling — and there was no audio at all. Sound now works
 * independently of desktop-notification permission. Browsers require a user gesture
 * before audio can play, so we lazily unlock the AudioContext on the first
 * pointerdown/keydown anywhere on the page.
 */
import { useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';

const STORAGE_KEY = 'ecom_last_new_count';
const POLL_INTERVAL_MS = 30_000;

let _audioCtx = null;
function getAudioCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_audioCtx) _audioCtx = new AC();
  if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
  return _audioCtx;
}

/** Pleasant two-tone chime via WebAudio — no asset file needed. */
export function playNewOrderChime() {
  try {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    [
      { f: 880, t: 0 },      // A5
      { f: 1318.5, t: 0.18 }, // E6
    ].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.5);
    });
  } catch {
    /* audio is best-effort */
  }
}

export function useEcomOrderNotifications(enabled = true) {
  const lastCountRef = useRef(parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10));
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    // Unlock WebAudio on the first user gesture (browser autoplay policy).
    const unlock = () => { getAudioCtx(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    const tick = async () => {
      try {
        const res = await apiClient.get('/ecom/orders/summary');
        const newCount = res.data?.by_status?.new || 0;
        const previous = lastCountRef.current;
        if (newCount > previous && previous > 0) {
          const delta = newCount - previous;
          playNewOrderChime();
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('🛍️ طلب جديد في صندوقك', {
              body: delta === 1
                ? 'وصل طلب جديد — افتح صندوق الطلبات لمتابعته.'
                : `وصل ${delta} طلب جديد — افتح صندوق الطلبات لمتابعتها.`,
              tag: 'ecom-new-orders',
              requireInteraction: false,
              icon: '/favicon.ico',
            });
          }
        }
        lastCountRef.current = newCount;
        localStorage.setItem(STORAGE_KEY, String(newCount));
      } catch {
        /* silent — polling failure is not user-visible */
      }
    };

    // Run once immediately to sync baseline, then on interval
    tick();
    timerRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
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
