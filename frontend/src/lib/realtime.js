// p191: realtime SSE client — singleton. Pages subscribe to domain events;
// the browser receives them the moment they happen (no polling).
// EventSource auto-reconnects on network drops.

const listeners = {};   // { eventType: Set<cb> }
let es = null;
let connected = false;

function currentToken() {
  try {
    return localStorage.getItem('token') || '';
  } catch {
    return '';
  }
}

export function startRealtime() {
  const token = currentToken();
  if (!token) return;
  if (es && connected) return;
  try { if (es) es.close(); } catch {}
  es = new EventSource(`/api/events/stream?token=${encodeURIComponent(token)}`);
  es.onopen = () => { connected = true; };
  es.onerror = () => { connected = false; /* EventSource retries on its own */ };
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (!data || !data.type || data.type === 'connected') return;
      const cbs = listeners[data.type];
      if (cbs) cbs.forEach(cb => { try { cb(data.payload || {}, data); } catch {} });
      const anyCbs = listeners['*'];
      if (anyCbs) anyCbs.forEach(cb => { try { cb(data.payload || {}, data); } catch {} });
    } catch {}
  };
}

export function onEvent(type, cb) {
  if (!listeners[type]) listeners[type] = new Set();
  listeners[type].add(cb);
  return () => listeners[type] && listeners[type].delete(cb);
}

export function stopRealtime() {
  try { if (es) es.close(); } catch {}
  es = null;
  connected = false;
}
