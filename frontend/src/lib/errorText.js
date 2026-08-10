// Normalize API error detail into a plain string safe to render/toast.
// FastAPI 422 returns detail as an array of {type, loc, msg, input} objects,
// which crashes React (#31) when rendered directly.
export function errText(err, fallback = 'حدث خطأ') {
  const d = err?.response?.data?.detail ?? err?.detail ?? err;
  if (typeof d === 'string' && d) return d;
  if (Array.isArray(d)) {
    const msgs = d.map(x => (x && (x.msg || x.message)) || '').filter(Boolean);
    if (msgs.length) return msgs.join(' — ');
  }
  if (d && typeof d === 'object') {
    if (typeof d.msg === 'string') return d.msg;
    if (typeof d.message === 'string') return d.message;
  }
  return fallback;
}
