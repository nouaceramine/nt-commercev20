// p78: UTM campaign attribution for storefront orders.
// Captures utm_* params from the landing URL into sessionStorage (per-tab,
// survives in-store navigation), and attaches them to the order payload.
const KEY = 'ntc_utm';
const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

export function captureUtm() {
  try {
    const q = new URLSearchParams(window.location.search);
    const found = {};
    FIELDS.forEach(f => {
      const v = q.get(f);
      if (v) found[f] = v.slice(0, 100);
    });
    if (Object.keys(found).length) sessionStorage.setItem(KEY, JSON.stringify(found));
  } catch (e) { /* tracking must never break the store */ }
}

export function getUtm() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}');
  } catch (e) {
    return {};
  }
}
