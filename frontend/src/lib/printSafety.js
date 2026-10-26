export function safeLabelUrl(value, origin = window.location.origin) {
  try {
    const url = new URL(value, origin);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === origin) ? url.href : '';
  } catch {
    return '';
  }
}

export function safeCssColor(value, fallback = '#0f766e') {
  const color = String(value ?? '').trim();
  return /^#[0-9a-f]{3,4}(?:[0-9a-f]{2}){0,2}$/i.test(color) && [4, 5, 7, 9].includes(color.length)
    ? color
    : fallback;
}

export function safeCssNumber(value, fallback, min = 0, max = 10000) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function safeHtmlId(value, fallback = 'block') {
  return String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || fallback;
}

export function toSafeJsString(value) {
  return JSON.stringify(String(value ?? ''))
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
