import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { toast } from 'sonner';
import { MapPin, ChevronLeft, Package, Truck, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export default function OrderTrackingPage() {
  const { slug } = useParams();
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState(null);

  const trackOrder = async () => {
    if (!orderId.trim()) {
      toast.error('أدخل رقم الطلب');
      return;
    }
    setLoading(true);
    try {
      const response = await apiClient.get(`/shop/${slug}/track/${orderId}`);
      if (response.data.success) {
        setTracking(response.data);
      } else {
        toast.error('الطلب غير موجود');
      }
    } catch (error) {
      toast.error('فشل جلب التتبع');
    } finally {
      setLoading(false);
    }
  };

  const statusConfig = {
    pending: { icon: <Clock size={20} />, color: '#f39c12', bg: '#fff8e1', text: 'قيد المراجعة' },
    processing: { icon: <Package size={20} />, color: '#3498db', bg: '#ebf5fb', text: 'جاري التجهيز' },
    shipped: { icon: <Truck size={20} />, color: '#9b59b6', bg: '#f5eef8', text: 'خرج للتوصيل' },
    in_transit: { icon: <Truck size={20} />, color: '#e67e22', bg: '#fef5e7', text: 'في الطريق' },
    out_for_delivery: { icon: <MapPin size={20} />, color: '#2ecc71', bg: '#e8f8f5', text: 'قيد التوصيل' },
    delivered: { icon: <CheckCircle size={20} />, color: '#27ae60', bg: '#e8f8f5', text: 'تم التوصيل' },
    cancelled: { icon: <AlertCircle size={20} />, color: '#e74c3c', bg: '#fdedec', text: 'ملغي' },
    returned: { icon: <AlertCircle size={20} />, color: '#95a5a6', bg: '#f4f6f7', text: 'مرتجع' }
  };

  const currentStatus = tracking?.status_display || statusConfig.pending;

  return (
    <div className="nouacer-store" dir="rtl" style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      <header className="nc-header">
        <div className="nc-header-inner">
          <Link to={`/shop/${slug}`} className="nc-logo">
            <ChevronLeft size={20} /> العودة للمتجر
          </Link>
        </div>
      </header>

      <section className="nc-section" style={{ paddingTop: '40px' }}>
        <div className="nc-section-inner" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 800, textAlign: 'center', marginBottom: '32px', color: '#1a1a2e' }}>
            📦 تتبع طلبك
          </h1>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
            <input
              type="text"
              value={orderId}
              onChange={e => setOrderId(e.target.value)}
              placeholder="أدخل رقم الطلب (مثال: ORD-12345)"
              style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ddd', fontSize: '16px' }}
              onKeyPress={e => e.key === 'Enter' && trackOrder()}
            />
            <button
              onClick={trackOrder}
              disabled={loading}
              style={{ padding: '14px 24px', background: '#f7941d', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}
            >
              {loading ? '...' : 'تتبع'}
            </button>
          </div>

          {tracking && tracking.order && (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
              {/* Order Info */}
              <div style={{ borderBottom: '1px solid #eee', paddingBottom: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#636e72' }}>رقم الطلب</span>
                  <span style={{ fontWeight: 700 }}>#{tracking.order.id}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#636e72' }}>التاريخ</span>
                  <span>{new Date(tracking.order.created_at).toLocaleDateString('ar-DZ')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#636e72' }}>المبلغ</span>
                  <span style={{ fontWeight: 700, color: '#f7941d' }}>{tracking.order.total?.toLocaleString()} دج</span>
                </div>
              </div>

              {/* Status */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                padding: '16px', 
                background: currentStatus.bg, 
                borderRadius: '12px',
                marginBottom: '24px'
              }}>
                <div style={{ color: currentStatus.color }}>{currentStatus.icon}</div>
                <div>
                  <p style={{ fontWeight: 700, color: currentStatus.color }}>{currentStatus.text}</p>
                  <p style={{ fontSize: '13px', color: '#636e72' }}>
                    {tracking.tracking?.updated_at ? `آخر تحديث: ${new Date(tracking.tracking.updated_at).toLocaleDateString('ar-DZ')}` : 'جاري التجهيز'}
                  </p>
                </div>
              </div>

              {/* Timeline */}
              {tracking.tracking?.history && tracking.tracking.history.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>سجل التتبع</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {tracking.tracking.history.map((event, idx) => {
                      const cfg = statusConfig[event.status] || statusConfig.pending;
                      return (
                        <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <div style={{ 
                            width: '36px', 
                            height: '36px', 
                            borderRadius: '50%', 
                            background: cfg.bg, 
                            color: cfg.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {cfg.icon}
                          </div>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: '14px' }}>{cfg.text}</p>
                            {event.note && <p style={{ fontSize: '13px', color: '#636e72' }}>{event.note}</p>}
                            <p style={{ fontSize: '12px', color: '#999' }}>
                              {new Date(event.timestamp).toLocaleString('ar-DZ')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No tracking yet */}
              {!tracking.tracking && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#636e72' }}>
                  <Package size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <p>سيتم تحديث حالة الشحن قريباً</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
