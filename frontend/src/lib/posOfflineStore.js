/**
 * E2 — offline POS persistent store (IndexedDB).
 *
 * Why: the M10 catalog cache lived in localStorage (≈5 MB/origin). The owner's
 * catalog (NT-0004) is ≈7.8 MB raw — setItem failed SILENTLY (empty catch), so
 * large tenants effectively had NO offline catalog. IndexedDB quota is hundreds
 * of MB. This module is a tiny promise wrapper; no dependencies.
 *
 * Stores: `kv` — blobs keyed `${scope}:${kind}` (scope = tenant id from the JWT,
 * so tenants never share a cache on a shared device). On first read, legacy
 * localStorage keys are migrated into IDB and removed. If IDB is unavailable
 * (private mode), we degrade to the old localStorage behaviour.
 */

const DB_NAME = 'nt_pos_offline';
const DB_VERSION = 1;
const LS_KEYS = { products: 'pos_cache_products_v1', customers: 'pos_cache_customers_v1' };

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no idb')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb open failed'));
  });
  return _dbPromise;
}

export function currentScope() {
  try {
    const t = localStorage.getItem('token');
    if (!t) return 'anon';
    const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return p.tenant_id || p.sub || 'anon';
  } catch { return 'anon'; }
}

function lsRead(kind) {
  try { return JSON.parse(localStorage.getItem(LS_KEYS[kind]) || 'null'); } catch { return null; }
}
function lsWrite(kind, payload) {
  try { localStorage.setItem(LS_KEYS[kind], JSON.stringify(payload)); } catch { /* quota */ }
}

/** Read cached {at, items} for a kind ('products' | 'customers'). Migrates LS→IDB on first hit. */
export async function idbCacheRead(kind) {
  const key = `${currentScope()}:${kind}`;
  try {
    const db = await openDb();
    const hit = await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (hit) return hit;
    const legacy = lsRead(kind);
    if (legacy && Array.isArray(legacy.items)) {
      await idbCacheWrite(kind, legacy.items);           // migrate
      try { localStorage.removeItem(LS_KEYS[kind]); } catch { /* noop */ }
      return legacy;
    }
    return null;
  } catch {
    return lsRead(kind);                                  // IDB unavailable → legacy path
  }
}

/** Write cache blob {at, items}. */
export async function idbCacheWrite(kind, items) {
  const payload = { at: new Date().toISOString(), items };
  const key = `${currentScope()}:${kind}`;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(payload, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    lsWrite(kind, payload);                               // degrade (small catalogs only)
  }
}

/**
 * Stock shadow: after an OFFLINE sale, decrement the cached catalog so the same
 * unit (or serial item) can't be sold twice on this device. adjustments:
 * [{ product_id, quantity }]. Returns the adjustment list applied (for the
 * in-memory state mirror) — best-effort, never throws.
 */
export async function idbCacheAdjustStock(kind, adjustments) {
  const applied = [];
  try {
    const cached = await idbCacheRead(kind);
    if (!cached || !Array.isArray(cached.items)) return applied;
    const byId = {};
    for (const a of adjustments) {
      if (a.product_id) byId[a.product_id] = (byId[a.product_id] || 0) + (Number(a.quantity) || 0);
    }
    let touched = false;
    const items = cached.items.map((p) => {
      const d = byId[p.id];
      if (!d) return p;
      touched = true;
      applied.push({ product_id: p.id, quantity: d });
      return { ...p, quantity: (typeof p.quantity === 'number' ? p.quantity : 0) - d };
    });
    if (touched) await idbCacheWrite(kind, items);
  } catch { /* best-effort */ }
  return applied;
}

/** Device tag + monotonic per-device sequence for provisional offline numbers. */
export function nextOfflineNo() {
  try {
    let dev = localStorage.getItem('pos_device_tag');
    if (!dev) {
      dev = Math.random().toString(36).slice(2, 6).toUpperCase();
      localStorage.setItem('pos_device_tag', dev);
    }
    const seq = (parseInt(localStorage.getItem('pos_offline_seq') || '0', 10) + 1);
    localStorage.setItem('pos_offline_seq', String(seq));
    return `OFF-${dev}-${String(seq).padStart(4, '0')}`;
  } catch {
    return `OFF-X-${Date.now()}`;
  }
}
