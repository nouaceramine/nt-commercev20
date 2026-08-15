// p75: Meta (Facebook) Pixel + TikTok Pixel — loaded only when the store
// settings carry pixel IDs. All tracking lives in the public storefront pages.
let fbReady = false;
let ttReady = false;

export function initPixels(settings) {
  const fbId = (settings?.fb_pixel_id || '').trim();
  if (fbId && !fbReady && typeof window !== 'undefined') {
    const n = (window.fbq = window.fbq || function () { n.queue.push(arguments); });
    if (!window._fbq) window._fbq = n;
    n.queue = n.queue || [];
    n.loaded = true;
    n.version = '2.0';
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    window.fbq('init', fbId);
    window.fbq('track', 'PageView');
    fbReady = true;
  }

  const ttId = (settings?.tiktok_pixel_id || '').trim();
  if (ttId && !ttReady && typeof window !== 'undefined') {
    (function (w, d, t) {
      w.TiktokAnalyticsObject = t;
      const ttq = (w[t] = w[t] || []);
      ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
      ttq.setAndDefer = function (o, m) {
        o[m] = function () { o.push([m].concat(Array.prototype.slice.call(arguments, 0))); };
      };
      for (let i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.load = function (e) {
        const r = 'https://analytics.tiktok.com/i18n/pixel/events.js';
        ttq._i = ttq._i || {};
        ttq._i[e] = [];
        ttq._i[e]._u = r;
        const s = d.createElement('script');
        s.type = 'text/javascript';
        s.async = true;
        s.src = r + '?sdkid=' + e + '&lib=' + t;
        const x = d.getElementsByTagName('script')[0];
        x.parentNode.insertBefore(s, x);
      };
      ttq.load(ttId);
      ttq.page();
    })(window, document, 'ttq');
    ttReady = true;
  }
}

// event: standard Meta event name. TikTok uses its own naming (Purchase → CompletePayment).
export function trackPixel(event, params = {}) {
  try {
    if (fbReady && window.fbq) window.fbq('track', event, params);
  } catch (e) { /* never break the storefront on tracking errors */ }
  try {
    if (ttReady && window.ttq) {
      const mapped = event === 'Purchase' ? 'CompletePayment' : event;
      window.ttq.track(mapped, params);
    }
  } catch (e) { /* noop */ }
}
