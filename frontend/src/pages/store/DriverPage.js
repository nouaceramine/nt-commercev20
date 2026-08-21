import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { Html5Qrcode } from 'html5-qrcode';
import { Package, Truck, CheckCircle, AlertCircle, Phone, MapPin, Camera, XCircle, RefreshCw } from 'lucide-react';

function normalizeScanned(text) {
  if (!text) return '';
  // QR may encode a full URL (...?code=XXX) or a bare code
  try {
    const u = new URL(text);
    const c = u.searchParams.get('code');
    if (c) return c;
  } catch { /* not a URL */ }
  return text.trim();
}

export default function DriverPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState(null);
  const scannerRef = useRef(null);
  const readerId = 'driver-qr-reader';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/driver/${token}/orders`);
      setData(data);
      setError('');
    } catch {
      setError('رابط غير صالح أو معطّل — راجع المكتب');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!scanning) return undefined;
    const scanner = new Html5Qrcode(readerId);
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: 'environment' },
      { fps: 8, qrbox: { width: 220, height: 220 } },
      async (text) => {
        const c = normalizeScanned(text);
        setScanning(false);
        if (c) lookup(c);
      },
      () => {},
    ).catch(() => setScanning(false));
    return () => {
      scanner.stop().catch(() => {}).finally(() => scanner.clear());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const lookup = async (c) => {
    const val = (c ?? code).trim();
    if (!val) return;
    setBusy('scan');
    try {
      const { data } = await apiClient.post(`/driver/${token}/scan`, { code: val });
      setFound(data.order);
    } catch {
      setFound(null);
      setError('الطرد غير موجود في مشاويرك');
      setTimeout(() => setError(''), 3000);
    } finally {
      setBusy('');
    }
  };

  const mark = async (orderId, outcome) => {
    let note = '';
    if (outcome === 'failed') {
      note = window.prompt('سبب الفشل (اختياري):', '') || '';
    } else if (!window.confirm('تأكيد التسليم وتحصيل المبلغ؟')) {
      return;
    }
    setBusy(orderId);
    try {
      await apiClient.post(`/driver/${token}/orders/${orderId}/result`, { outcome, note });
      setFound(null);
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || 'تعذر تنفيذ العملية');
      setTimeout(() => setError(''), 4000);
    } finally {
      setBusy('');
    }
  };

  const OrderCard = ({ o }) => (
    <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 17, direction: 'ltr' }}>{o.order_code}</strong>
        <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '4px 12px', fontWeight: 800, fontSize: 15 }}>
          {o.total} دج
        </span>
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{o.customer_name}</div>
      <a href={`tel:${o.customer_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2563eb', textDecoration: 'none', fontSize: 15, direction: 'ltr', justifyContent: 'flex-end', marginBottom: 4 }}>
        {o.customer_phone} <Phone size={15} />
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4b5563', fontSize: 14, marginBottom: 8 }}>
        <MapPin size={15} /> {o.wilaya} — {o.city} {o.address}
      </div>
      {o.notes ? <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 8, fontSize: 13, color: '#6b7280', marginBottom: 8 }}>📝 {o.notes}</div> : null}
      {o.delivery_attempts > 0 && (
        <div style={{ color: '#b45309', fontSize: 13, marginBottom: 8 }}>⚠️ محاولات فاشلة سابقة: {o.delivery_attempts}</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          data-testid={`deliver-btn-${o.order_code}`}
          onClick={() => mark(o.id, 'delivered')}
          disabled={busy === o.id || o.status !== 'shipped'}
          style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: o.status === 'shipped' ? '#16a34a' : '#d1d5db', color: '#fff', fontWeight: 700, fontSize: 15, cursor: o.status === 'shipped' ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <CheckCircle size={18} /> تم التوصيل
        </button>
        <button
          data-testid={`fail-btn-${o.order_code}`}
          onClick={() => mark(o.id, 'failed')}
          disabled={busy === o.id}
          style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <XCircle size={18} /> فشل
        </button>
      </div>
      {o.status === 'packed' && (
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6, textAlign: 'center' }}>الطرد لم يُشحن بعد — التسليم يتاح بعد الشحن</div>
      )}
    </div>
  );

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <div style={{ background: '#1e3a8a', color: '#fff', padding: '16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>🚚 {data?.driver?.name || 'واجهة السائق'}</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{data?.store}</div>
          </div>
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 8, padding: 8, cursor: 'pointer' }}>
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: 16 }}>
        {error && (
          <div data-testid="driver-error" style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 10, padding: 14, textAlign: 'center', fontWeight: 600, marginBottom: 12 }}>{error}</div>
        )}

        {data && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1, background: '#fff', borderRadius: 10, padding: 12, textAlign: 'center', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1d4ed8' }}>{data.orders.length}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>مشاوير مفتوحة</div>
            </div>
            <div style={{ flex: 1, background: '#fff', borderRadius: 10, padding: 12, textAlign: 'center', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{data.done_today}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>سُلّمت اليوم</div>
            </div>
          </div>
        )}

        {/* scan / lookup */}
        {data && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                data-testid="driver-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="رمز الطلب أو رقم التتبع"
                style={{ flex: 1, padding: 12, borderRadius: 10, border: '2px solid #e5e7eb', direction: 'ltr', textAlign: 'center', fontSize: 15 }}
                onKeyDown={(e) => e.key === 'Enter' && lookup()}
              />
              <button data-testid="driver-lookup-btn" onClick={() => lookup()} disabled={busy === 'scan'}
                style={{ padding: '12px 16px', borderRadius: 10, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                بحث
              </button>
              <button data-testid="driver-scan-toggle" onClick={() => setScanning((s) => !s)}
                style={{ padding: '12px 16px', borderRadius: 10, border: 'none', background: scanning ? '#dc2626' : '#0f766e', color: '#fff', cursor: 'pointer' }}>
                <Camera size={18} />
              </button>
            </div>
            {scanning && <div id={readerId} style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden' }} />}
            {found && (
              <div style={{ marginTop: 10 }}>
                <OrderCard o={found} />
              </div>
            )}
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 24 }}>جارٍ التحميل…</div>}

        {data && data.orders.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>
            <Package size={42} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <div>لا مشاوير مفتوحة — أحسنت اليوم! 👏</div>
          </div>
        )}

        {data && data.orders.map((o) => <OrderCard key={o.id} o={o} />)}

        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 20 }}>
          واجهة السائق — منصة NT Commerce
        </p>
      </div>
    </div>
  );
}
