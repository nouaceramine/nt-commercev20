// p82: صفحة هبوط مستقلة لكل منتج — سريعة، بفيديو وعرض وفورم طلب مباشر.
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { initPixels, trackPixel } from '../../lib/pixel';
import { captureUtm, getUtm } from '../../lib/utm';
import { toast, Toaster } from 'sonner';
import { Truck, Shield, RefreshCw, Minus, Plus, CheckCircle } from 'lucide-react';

export default function StoreLandingPage() {
  const { slug, productId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [product, setProduct] = useState(null);
  const [store, setStore] = useState(null);
  const [landing, setLanding] = useState(null);
  const [wilayasData, setWilayasData] = useState([]);
  const [deliveryRates, setDeliveryRates] = useState([]);
  const [availableCommunes, setAvailableCommunes] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [variantIdx, setVariantIdx] = useState(null);
  const [customerInfo, setCustomerInfo] = useState({
    name: '', phone: '', wilaya: '', commune: '', address: '', delivery_type: 'home',
  });
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);

  useEffect(() => {
    captureUtm();
    fetch('/algeria-wilayas.json')
      .then(r => r.json())
      .then(d => setWilayasData(d))
      .catch(() => setWilayasData([]));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await apiClient.get(`/shop/${slug}/lp/${productId}`);
        setProduct(r.data.product);
        setStore(r.data.settings);
        setLanding(r.data.landing);
        apiClient.get(`/shop/${slug}/delivery-rates`)
          .then(rr => setDeliveryRates(Array.isArray(rr.data) ? rr.data : ((rr.data && rr.data.rates) || [])))
          .catch(() => {});
        // بكسل الصفحة يتقدّم على بكسل المتجر إن وُجد
        const px = {
          fb_pixel_id: r.data.landing.fb_pixel_id || r.data.settings.fb_pixel_id,
          tiktok_pixel_id: r.data.landing.tiktok_pixel_id || r.data.settings.tiktok_pixel_id,
        };
        initPixels(px);
        const p = r.data.product;
        trackPixel('ViewContent', {
          content_name: p.name_ar || p.name_en || '',
          value: p.retail_price || p.selling_price || 0, currency: 'DZD',
        });
      } catch (e) {
        setError(e?.response?.data?.detail || 'الصفحة غير متوفرة');
      } finally { setLoading(false); }
    })();
  }, [slug, productId]);

  useEffect(() => {
    if (customerInfo.wilaya && wilayasData.length > 0) {
      const w = wilayasData.find(x => x.id === customerInfo.wilaya);
      setAvailableCommunes(w ? w.communes : []);
      if (w && !w.communes.includes(customerInfo.commune)) {
        setCustomerInfo(prev => ({ ...prev, commune: '' }));
      }
    } else {
      setAvailableCommunes([]);
    }
  }, [customerInfo.wilaya, wilayasData]); // eslint-disable-line react-hooks/exhaustive-deps

  // p83: التقاط السلة المهجورة
  useEffect(() => {
    const phone = (customerInfo.phone || '').replace(/[^0-9+]/g, '');
    if (phone.length < 9 || !product) return;
    const key = `lead_${slug}_lp_${productId}_${phone}`;
    if (sessionStorage.getItem(key)) return;
    const t = setTimeout(() => {
      apiClient.post(`/shop/${slug}/cart-lead`, {
        phone, name: customerInfo.name || '',
        items: [{ name: product.name_ar || product.name, quantity, price }],
        total: price * quantity,
      }).then(() => sessionStorage.setItem(key, '1')).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [customerInfo.phone, customerInfo.name, quantity, product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-400">جارٍ التحميل...</div></div>;
  }
  if (error || !product) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl"><div className="text-center"><p className="text-xl mb-3">😕 {error}</p><Link to={`/shop/${slug}`} className="text-orange-600 underline">زيارة المتجر</Link></div></div>;
  }

  const price = product.retail_price || product.selling_price || 0;
  const activeVariants = product.has_variants ? (product.variants || []).map((v, i) => ({ ...v, i })).filter(v => (v.quantity || 0) > 0) : [];
  const selectedVariant = variantIdx != null ? activeVariants.find(v => v.i === variantIdx) : null;
  const maxQty = selectedVariant ? (selectedVariant.quantity || 0) : (product.quantity || 0);
  const selectedRate = deliveryRates.find(r => String(r.id || r.wilaya_id || '') === String(customerInfo.wilaya || '').padStart(2, '0'));
  const deliveryFee = customerInfo.delivery_type === 'office'
    ? Number(selectedRate?.office_price || 0)
    : Number(selectedRate?.home_price || 0);
  const finalTotal = price * quantity + (customerInfo.wilaya ? deliveryFee : 0);

  const ytId = (landing?.video_url || '').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)?.[1];

  const handleOrder = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (product.has_variants && activeVariants.length > 0 && variantIdx == null) {
      toast.error('اختر اللون / الحجم أولاً');
      return;
    }
    setSubmitting(true);
    try {
      const orderData = {
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        delivery_type: customerInfo.delivery_type,
        delivery_address: customerInfo.delivery_type === 'office' ? '' : customerInfo.address,
        delivery_city: customerInfo.commune,
        delivery_wilaya: customerInfo.wilaya,
        delivery_fee: customerInfo.wilaya ? deliveryFee : 0,
        items: [{
          product_id: product.id,
          name: product.name_ar || product.name,
          quantity,
          price,
          ...(selectedVariant ? {
            variant_index: variantIdx,
            variant_label: [selectedVariant.color, selectedVariant.size].filter(Boolean).join(' / '),
          } : {}),
        }],
        subtotal: price * quantity,
        total: finalTotal,
        payment_method: 'cod',
        utm: getUtm(),
      };
      const response = await apiClient.post(`/shop/${slug}/order`, orderData);
      trackPixel('Purchase', { value: finalTotal, currency: 'DZD' }, { eventID: response.data?.order_number });
      setOrderSuccess(response.data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل إرسال الطلب');
    } finally { setSubmitting(false); }
  };

  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
        <Toaster position="top-center" richColors />
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center" data-testid="lp-success">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">تم استلام طلبك! 🎉</h1>
          <p className="text-gray-600 mb-1">رقم الطلب: <span className="font-mono font-bold">{orderSuccess.order_number}</span></p>
          <p className="text-gray-600">سنتصل بك قريباً لتأكيد الطلب.</p>
          <Link to={`/shop/${slug}`} className="inline-block mt-5 text-orange-600 underline">متابعة التسوق</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <Toaster position="top-center" richColors />
      {/* Header */}
      <div className="bg-white border-b py-3 px-4 text-center">
        <span className="font-bold text-lg text-orange-600">{store?.store_name || 'متجرنا'}</span>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-5">
        {/* Video / Image */}
        {ytId ? (
          <div className="rounded-2xl overflow-hidden shadow aspect-video bg-black">
            <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${ytId}`} title="video" allowFullScreen />
          </div>
        ) : landing?.video_url ? (
          <video className="rounded-2xl shadow w-full" src={landing.video_url} controls playsInline />
        ) : product.image_url ? (
          <img src={product.image_url} alt={product.name_ar || product.name} className="rounded-2xl shadow w-full object-cover max-h-96" />
        ) : null}

        {/* Headline + price */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-extrabold leading-snug" data-testid="lp-headline">
            {landing?.headline || product.name_ar || product.name}
          </h1>
          {landing?.offer_text && <p className="text-gray-600">{landing.offer_text}</p>}
          <div className="flex items-center justify-center gap-3">
            {landing?.old_price > price && (
              <span className="text-gray-400 line-through text-lg">{Number(landing.old_price).toLocaleString()} دج</span>
            )}
            <span className="text-3xl font-extrabold text-orange-600">{Number(price).toLocaleString()} دج</span>
            {landing?.old_price > price && (
              <span className="bg-red-100 text-red-700 text-sm font-bold rounded-full px-3 py-1">
                وفّر {Number(landing.old_price - price).toLocaleString()} دج
              </span>
            )}
          </div>
        </div>

        {/* Trust badges */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-600">
          <div className="bg-white rounded-xl border p-3"><Truck className="w-5 h-5 mx-auto mb-1 text-orange-500" />توصيل لكل الولايات</div>
          <div className="bg-white rounded-xl border p-3"><Shield className="w-5 h-5 mx-auto mb-1 text-orange-500" />الدفع عند الاستلام</div>
          <div className="bg-white rounded-xl border p-3"><RefreshCw className="w-5 h-5 mx-auto mb-1 text-orange-500" />إمكانية الاستبدال</div>
        </div>

        {/* Order form */}
        <form onSubmit={handleOrder} className="bg-white rounded-2xl shadow p-5 space-y-4" data-testid="lp-order-form">
          <h2 className="font-bold text-lg text-center">📦 اطلب الآن — الدفع عند الاستلام</h2>

          {activeVariants.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">اللون / الحجم *</label>
              <select required className="w-full border rounded-lg p-2.5" value={variantIdx ?? ''} onChange={e => setVariantIdx(e.target.value === '' ? null : Number(e.target.value))} data-testid="lp-variant-select">
                <option value="">اختر...</option>
                {activeVariants.map(v => (
                  <option key={v.i} value={v.i}>{[v.color, v.size].filter(Boolean).join(' / ') || `#${v.i + 1}`} — متوفر {v.quantity}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-center gap-4">
            <span className="text-sm font-medium">الكمية:</span>
            <div className="flex items-center gap-2">
              <button type="button" className="w-8 h-8 rounded-full border" onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus className="w-4 h-4 mx-auto" /></button>
              <span className="font-bold w-8 text-center">{quantity}</span>
              <button type="button" className="w-8 h-8 rounded-full border" onClick={() => setQuantity(q => Math.min(maxQty || 99, q + 1))}><Plus className="w-4 h-4 mx-auto" /></button>
            </div>
          </div>

          <input required className="w-full border rounded-lg p-2.5" placeholder="الاسم الكامل" value={customerInfo.name} onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })} data-testid="lp-name" />
          <input required type="tel" className="w-full border rounded-lg p-2.5" placeholder="رقم الهاتف (0555123456)" value={customerInfo.phone} onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })} data-testid="lp-phone" />

          <div className="grid grid-cols-2 gap-3">
            <select required className="border rounded-lg p-2.5" value={customerInfo.wilaya} onChange={e => setCustomerInfo({ ...customerInfo, wilaya: e.target.value })} data-testid="lp-wilaya">
              <option value="">الولاية *</option>
              {wilayasData.map(w => <option key={w.id} value={w.id}>{w.id} - {w.name}</option>)}
            </select>
            <select required className="border rounded-lg p-2.5" value={customerInfo.commune} onChange={e => setCustomerInfo({ ...customerInfo, commune: e.target.value })} data-testid="lp-commune">
              <option value="">البلدية *</option>
              {availableCommunes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex gap-3 text-sm">
            <label className={`flex-1 border rounded-lg p-3 text-center cursor-pointer ${customerInfo.delivery_type === 'home' ? 'border-orange-500 bg-orange-50' : ''}`}>
              <input type="radio" name="lp_dt" className="hidden" checked={customerInfo.delivery_type === 'home'} onChange={() => setCustomerInfo({ ...customerInfo, delivery_type: 'home' })} data-testid="lp-type-home" />
              🏠 للمنزل{selectedRate ? ` (${Number(selectedRate.home_price || 0).toLocaleString()} دج)` : ''}
            </label>
            <label className={`flex-1 border rounded-lg p-3 text-center cursor-pointer ${customerInfo.delivery_type === 'office' ? 'border-orange-500 bg-orange-50' : ''}`}>
              <input type="radio" name="lp_dt" className="hidden" checked={customerInfo.delivery_type === 'office'} onChange={() => setCustomerInfo({ ...customerInfo, delivery_type: 'office' })} data-testid="lp-type-office" />
              🏢 مكتب التوصيل{selectedRate ? ` (${Number(selectedRate.office_price || 0).toLocaleString()} دج)` : ''}
            </label>
          </div>

          {customerInfo.delivery_type === 'home' && (
            <input required className="w-full border rounded-lg p-2.5" placeholder="العنوان الكامل" value={customerInfo.address} onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })} data-testid="lp-address" />
          )}

          <div className="border-t pt-3 text-center space-y-1">
            <div className="text-sm text-gray-500">التوصيل: {customerInfo.wilaya ? `${Number(deliveryFee).toLocaleString()} دج` : '—'}</div>
            <div className="text-xl font-extrabold text-emerald-700">الإجمالي: {Number(finalTotal).toLocaleString()} دج</div>
          </div>

          <button type="submit" disabled={submitting || maxQty === 0} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl text-lg transition disabled:opacity-50" data-testid="lp-submit">
            {submitting ? 'جارٍ الإرسال...' : maxQty === 0 ? 'نفد المخزون' : '🛒 أكّد الطلب الآن'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 pb-6">
          <Link to={`/shop/${slug}`} className="underline">زيارة المتجر الكامل</Link>
        </p>
      </div>
    </div>
  );
}
