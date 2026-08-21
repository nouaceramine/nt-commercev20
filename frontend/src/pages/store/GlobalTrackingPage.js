import { useState } from 'react';
import apiClient from '../../lib/apiClient';
import { Package, Truck, CheckCircle, Clock, AlertCircle, Search, MapPin, ClipboardCheck } from 'lucide-react';

const STATUS_FLOW = ['new', 'confirmed', 'packed', 'shipped', 'delivered'];

const STATUS_CONFIG = {
  new: { icon: <Clock size={20} />, color: '#f39c12', text: 'قيد المراجعة' },
  awaiting_confirmation: { icon: <Clock size={20} />, color: '#f39c12', text: 'بانتظار التأكيد' },
  needs_review: { icon: <Clock size={20} />, color: '#f39c12', text: 'قيد التدقيق' },
  confirmed: { icon: <ClipboardCheck size={20} />, color: '#3498db', text: 'تم التأكيد' },
  packed: { icon: <Package size={20} />, color: '#9b59b6', text: 'تم التجهيز' },
  shipped: { icon: <Truck size={20} />, color: '#e67e22', text: 'خرج للتوصيل' },
  out_for_delivery: { icon: <MapPin size={20} />, color: '#2ecc71', text: 'قيد التوصيل' },
  delivered: { icon: <CheckCircle size={20} />, color: '#27ae60', text: 'تم التوصيل' },
  cancelled: { icon: <AlertCircle size={20} />, color: '#e74c3c', text: 'ملغي' },
  refunded: { icon: <AlertCircle size={20} />, color: '#95a5a6', text: 'مسترجع' },
  returned: { icon: <AlertCircle size={20} />, color: '#95a5a6', text: 'مسترجع' },
};

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function GlobalTrackingPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [searched, setSearched] = useState(false);

  const track = async (e) => {
    if (e) e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const { data } = await apiClient.get(`/track/${encodeURIComponent(code.trim())}`);
      setResult(data);
    } catch {
      setResult({ ok: false, found: false });
    } finally {
      setLoading(false);
    }
  };

  const order = result?.order;
  const currentCfg = order ? (STATUS_CONFIG[order.status] || STATUS_CONFIG.new) : null;
  const reachedIdx = order ? STATUS_FLOW.indexOf(order.status) : -1;

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f0f4ff 0%,#f8f9fa 40%)', fontFamily: 'inherit' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>📦</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>تتبع طلبك</h1>
          <p style={{ color: '#6b7280', marginTop: 8 }}>أدخل رقم الطلب أو رقم التتبع لمعرفة حالة طردك لحظة بلحظة</p>
        </div>

        <form onSubmit={track} style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          <input
            data-testid="track-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="مثال: WEB000001 أو MP00012"
            style={{ flex: 1, padding: '14px 16px', borderRadius: 12, border: '2px solid #e5e7eb', fontSize: 16, outline: 'none', direction: 'ltr', textAlign: 'center' }}
          />
          <button
            data-testid="track-submit-btn"
            type="submit"
            disabled={loading}
            style={{ padding: '14px 24px', borderRadius: 12, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={18} /> {loading ? '...' : 'تتبع'}
          </button>
        </form>

        {searched && !loading && result && !result.found && (
          <div data-testid="track-not-found" style={{ background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', border: '1px solid #fee2e2' }}>
            <AlertCircle size={40} color="#e74c3c" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 700, color: '#1a1a2e' }}>لم نعثر على طلب بهذا الرقم</p>
            <p style={{ color: '#6b7280', fontSize: 14 }}>تأكد من الرقم أو تواصل مع المتجر الذي اشتريت منه</p>
          </div>
        )}

        {order && (
          <div data-testid="track-result" style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e5e7eb', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>رقم الطلب</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', direction: 'ltr' }}>{order.order_code}</div>
              </div>
              <span style={{ padding: '8px 16px', borderRadius: 999, fontWeight: 700, fontSize: 14, color: '#fff', background: currentCfg.color, display: 'flex', alignItems: 'center', gap: 6 }}>
                {currentCfg.icon} {order.status_ar}
              </span>
            </div>

            {/* progress bar for the happy path */}
            {!['cancelled', 'refunded', 'returned'].includes(order.status) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, position: 'relative' }}>
                {STATUS_FLOW.map((st, i) => {
                  const cfg = STATUS_CONFIG[st];
                  const done = reachedIdx >= i;
                  return (
                    <div key={st} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                      {i > 0 && (
                        <div style={{ position: 'absolute', top: 16, right: '50%', width: '100%', height: 3, background: done ? '#27ae60' : '#e5e7eb', zIndex: 0 }} />
                      )}
                      <div style={{ position: 'relative', zIndex: 1, width: 34, height: 34, borderRadius: '50%', margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? '#27ae60' : '#e5e7eb', color: done ? '#fff' : '#9ca3af' }}>
                        {cfg.icon}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: done ? 700 : 400, color: done ? '#1a1a2e' : '#9ca3af' }}>{cfg.text}</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {order.store && (
                <div style={{ background: '#f8f9fa', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>المتجر</div>
                  <div style={{ fontWeight: 700 }}>{order.store}</div>
                </div>
              )}
              <div style={{ background: '#f8f9fa', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>الإجمالي</div>
                <div style={{ fontWeight: 700 }}>{order.total} {order.currency}</div>
              </div>
              {order.tracking_number && (
                <div style={{ background: '#f8f9fa', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>رقم التتبع {order.courier ? `(${order.courier})` : ''}</div>
                  <div style={{ fontWeight: 700, direction: 'ltr', textAlign: 'right' }}>{order.tracking_number}</div>
                </div>
              )}
              <div style={{ background: '#f8f9fa', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>عدد القطع</div>
                <div style={{ fontWeight: 700 }}>{order.items_count}</div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#1a1a2e' }}>سجل الحالات</div>
              <div style={{ borderRight: '2px solid #e5e7eb', paddingRight: 16 }}>
                {[...order.timeline].reverse().map((h, i) => (
                  <div key={i} style={{ position: 'relative', paddingBottom: 14 }}>
                    <div style={{ position: 'absolute', right: -21.5, top: 4, width: 9, height: 9, borderRadius: '50%', background: i === 0 ? currentCfg.color : '#d1d5db' }} />
                    <div style={{ fontWeight: i === 0 ? 700 : 500, fontSize: 14 }}>{h.status_ar}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{formatDate(h.at)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 32 }}>
          خدمة التتبع مقدمة من منصة NT Commerce
        </p>
      </div>
    </div>
  );
}
