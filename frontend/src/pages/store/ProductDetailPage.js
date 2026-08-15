import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { initPixels, trackPixel } from '../../lib/pixel';
import { captureUtm, getUtm } from '../../lib/utm';
import { toast } from 'sonner';
import { ShoppingCart, Truck, Shield, RefreshCw, ChevronLeft, Tag, Gift, MapPin, Minus, Plus, CheckCircle } from 'lucide-react';

export default function ProductDetailPage() {
  const { slug, productId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [store, setStore] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [variantIdx, setVariantIdx] = useState(null);  // p73
  const [mainImage, setMainImage] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [customerInfo, setCustomerInfo] = useState({
    name: '', phone: '', wilaya: '', commune: '', address: '', notes: '', delivery_type: 'home'
  });

  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const [loyaltyPoints, setLoyaltyPoints] = useState(null);

  const [wilayasData, setWilayasData] = useState([]);
  const [deliveryRates, setDeliveryRates] = useState([]);  // p72
  const [availableCommunes, setAvailableCommunes] = useState([]);

  useEffect(() => {
    captureUtm();  // p78: capture campaign params from landing URL
    fetch('/algeria-wilayas.json')
      .then(r => r.json())
      .then(data => setWilayasData(data))
      .catch(() => setWilayasData([]));
  }, []);

  useEffect(() => {
    if (customerInfo.wilaya && wilayasData.length > 0) {
      const wilaya = wilayasData.find(w => w.id === customerInfo.wilaya);
      setAvailableCommunes(wilaya ? wilaya.communes : []);
      if (wilaya && !wilaya.communes.includes(customerInfo.commune)) {
        setCustomerInfo(prev => ({ ...prev, commune: '' }));
      }
    } else {
      setAvailableCommunes([]);
    }
  }, [customerInfo.wilaya, wilayasData]);

  useEffect(() => {
    fetchProduct();
  }, [slug, productId]); // eslint-disable-line react-hooks/exhaustive-deps

  // p83: abandoned-cart capture for the single-product page
  useEffect(() => {
    const phone = (customerInfo.phone || '').replace(/[^0-9+]/g, '');
    if (phone.length < 9 || !product) return;
    const key = `lead_${slug}_${productId}_${phone}`;
    if (sessionStorage.getItem(key)) return;
    const t = setTimeout(() => {
      apiClient.post(`/shop/${slug}/cart-lead`, {
        phone, name: customerInfo.name || '',
        items: [{ name: product.name_ar || product.name, quantity: quantity, price: price }],
        total: price * quantity,
      }).then(() => sessionStorage.setItem(key, '1')).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [customerInfo.phone, customerInfo.name, quantity, product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProduct = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/shop/${slug}/product/${productId}`);
      setProduct(response.data.product);
      setRelatedProducts(response.data.related_products || []);
      setStore(response.data.settings);
      apiClient.get(`/shop/${slug}/delivery-rates`)
        .then(r => setDeliveryRates(Array.isArray(r.data) ? r.data : ((r.data && r.data.rates) || [])))
        .catch(() => {});
      initPixels(response.data.settings);
      trackPixel('ViewContent', { content_name: response.data.product.name_ar || response.data.product.name_en || '', value: response.data.product.retail_price || response.data.product.selling_price || 0, currency: 'DZD' });
      const p = response.data.product;
      setMainImage(p.image_url || (p.images && p.images[0]) || '');
      window.scrollTo(0, 0);
    } catch (error) {
      toast.error('المنتج غير متوفر');
      navigate(`/shop/${slug}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Gallery: image_url + images array, deduplicated ──
  const galleryImages = useMemo(() => {
    if (!product) return [];
    const list = [product.image_url, ...(product.images || [])].filter(Boolean);
    return [...new Set(list)];
  }, [product]);

  const price = product ? (product.retail_price || product.selling_price || 0) : 0;
  // p73: variant selection for has_variants products
  const activeVariants = product?.has_variants
    ? (product.variants || []).map((v, i) => ({ ...v, i })).filter(v => Number(v.quantity) > 0)
    : [];
  const selectedVariant = (variantIdx != null && product?.variants) ? product.variants[variantIdx] : null;
  const maxQty = selectedVariant ? Number(selectedVariant.quantity) : (product?.quantity || 99);
  const oldPrice = product && product.purchase_price > 0 ? Math.round(price * 1.2) : 0;
  const savePercent = oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;
  const selectedRate = deliveryRates.find(r => String(r.id || r.wilaya_id || '') === String(customerInfo.wilaya).padStart(2, '0'));
  const rateFee = selectedRate ? (customerInfo.delivery_type === 'office' ? selectedRate.office_price : selectedRate.home_price) : null;
  const deliveryFee = store?.delivery_enabled === false ? 0 : (rateFee != null ? rateFee : (store?.delivery_fee || 0));
  const freeDelivery = store?.free_delivery_threshold > 0 && (price * quantity) >= store.free_delivery_threshold;
  const effectiveDelivery = freeDelivery ? 0 : deliveryFee;
  const subtotal = price * quantity;
  const finalTotal = Math.max(0, subtotal - couponDiscount) + effectiveDelivery;

  const primary = store?.primary_color || '#f7941d';

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const response = await apiClient.post(`/shop/${slug}/validate-coupon`, {
        code: couponCode,
        subtotal: subtotal,
        customer_phone: customerInfo.phone,
        product_ids: [product.id]
      });
      if (response.data.valid) {
        setCouponDiscount(response.data.discount);
        setCouponMessage(response.data.message);
        toast.success(response.data.message);
      } else {
        setCouponDiscount(0);
        setCouponMessage(response.data.error);
        toast.error(response.data.error);
      }
    } catch (error) {
      toast.error('فشل التحقق من الكوبون');
    } finally {
      setCouponLoading(false);
    }
  };

  const checkLoyalty = async () => {
    if (!customerInfo.phone || customerInfo.phone.length < 10) return;
    try {
      const response = await apiClient.get(`/store/loyalty/customer/${customerInfo.phone}`);
      if (response.data.success) {
        setLoyaltyPoints(response.data.data);
      }
    } catch (error) {
      // نقاط الولاء اختيارية — تجاهل الخطأ
    }
  };

  const handleOrder = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (product?.has_variants && activeVariants.length > 0 && variantIdx == null) {
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
        delivery_fee: effectiveDelivery,
        items: [{
          product_id: product.id,
          name: product.name_ar || product.name,
          quantity: quantity,
          price: price,
          ...(selectedVariant ? {
            variant_index: variantIdx,
            variant_label: [selectedVariant.color, selectedVariant.size].filter(Boolean).join(' / ')
          } : {})
        }],
        subtotal: subtotal,
        total: finalTotal,
        coupon_code: couponCode || undefined,
        coupon_discount: couponDiscount || undefined,
        notes: customerInfo.notes,
        payment_method: 'cod',
        utm: getUtm()
      };
      const response = await apiClient.post(`/shop/${slug}/order`, orderData);
      trackPixel('Purchase', { value: finalTotal, currency: 'DZD' }, { eventID: response.data?.order_number });
      setOrderSuccess(response.data);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'فشل إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="nouacer-store"><div className="nc-loading"><div className="nc-spinner" /></div></div>;
  if (!product) return null;

  const inputStyle = {
    width: '100%', padding: '11px 14px', border: '1px solid #d1d5db', borderRadius: '8px',
    fontSize: '13px', background: '#fff', fontFamily: 'inherit', outline: 'none'
  };

  return (
    <div className="nouacer-store" dir="rtl">
      <header className="nc-header">
        <div className="nc-header-inner">
          <Link to={`/shop/${slug}`} className="nc-logo">
            <ChevronLeft size={20} /> {store?.store_name || 'المتجر'}
          </Link>
        </div>
      </header>

      {/* ===== صف المنتج الرئيسي: صورة يمين + معلومات ونموذج يسار ===== */}
      <section style={{ maxWidth: '1100px', margin: '30px auto', padding: '0 20px' }}>
        <div className="pd-main-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', alignItems: 'start' }}>

          {/* عمود الصور */}
          <div className="pd-image-col" style={{ position: 'sticky', top: '100px' }}>
            {mainImage ? (
              <img
                src={mainImage}
                alt={product.name_ar || product.name}
                data-testid="pd-main-image"
                style={{
                  width: '100%', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                  maxHeight: '420px', objectFit: 'contain', background: '#fff', display: 'block'
                }}
              />
            ) : (
              <div style={{
                width: '100%', height: '320px', borderRadius: '12px', background: '#f8f9fa',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '100px'
              }}>📦</div>
            )}
            {galleryImages.length > 1 && (
              <div data-testid="pd-gallery" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '12px' }}>
                {galleryImages.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt={`${product.name_ar || product.name} ${i + 1}`}
                    onClick={() => setMainImage(img)}
                    data-testid={`pd-thumb-${i}`}
                    style={{
                      width: '100%', height: '70px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer',
                      border: mainImage === img ? `2px solid ${primary}` : '2px solid transparent',
                      opacity: mainImage === img ? 1 : 0.75, transition: 'all 0.2s', background: '#fff'
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* عمود المعلومات + نموذج الطلب */}
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#1a1a2e', marginBottom: '12px', lineHeight: 1.3 }}>
              {product.name_ar || product.name}
            </h1>

            {/* السعر + التوفير */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <span data-testid="pd-price" style={{ fontSize: '26px', fontWeight: 900, color: primary }}>
                {price.toLocaleString()} دج
              </span>
              {oldPrice > price && (
                <span style={{ fontSize: '18px', textDecoration: 'line-through', color: '#9ca3af' }}>
                  {oldPrice.toLocaleString()} دج
                </span>
              )}
              {savePercent > 0 && (
                <span data-testid="pd-save-badge" style={{
                  background: '#dcfce7', color: '#16a34a', fontSize: '13px', fontWeight: 700,
                  padding: '3px 10px', borderRadius: '20px'
                }}>
                  وفر {savePercent}%
                </span>
              )}
            </div>

            {/* الوصف القصير */}
            {(product.short_description || product.description_ar || product.description) && (
              <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: 1.7, marginBottom: '16px' }}>
                {product.short_description || product.description_ar || product.description}
              </p>
            )}

            {product.has_variants && (
              <div style={{ marginBottom: '12px' }} data-testid="pdp-variant-block">
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>اللون / الحجم *</label>
                {activeVariants.length > 0 ? (
                  <select
                    value={variantIdx ?? ''}
                    onChange={e => { setVariantIdx(e.target.value === '' ? null : parseInt(e.target.value)); setQuantity(1); }}
                    style={{ ...inputStyle, cursor: 'pointer' }} data-testid="pdp-variant-select"
                  >
                    <option value="">اختر اللون / الحجم...</option>
                    {activeVariants.map(v => (
                      <option key={v.i} value={v.i}>
                        {[v.color, v.size].filter(Boolean).join(' / ') || `متغير ${v.i + 1}`} — متوفر {v.quantity}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={{ fontSize: '13px', color: '#dc2626', fontWeight: 600 }}>✖ نفذت كل المتغيرات</p>
                )}
              </div>
            )}

            <p style={{ fontSize: '13px', marginBottom: '16px', color: product.quantity > 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
              {product.has_variants
                ? (selectedVariant ? `✔ متوفر (${selectedVariant.quantity})` : (activeVariants.length > 0 ? 'اختر اللون / الحجم لمعرفة التوفر' : '✖ نفذت الكمية'))
                : (product.quantity > 0 ? `✔ متوفر في المخزون (${product.quantity})` : '✖ نفذت الكمية')}
            </p>

            {/* ===== صندوق طلب COD المضمّن ===== */}
            <form
              onSubmit={handleOrder}
              data-testid="cod-form-box"
              style={{
                background: '#f0f9ff', border: '2px solid #7dd3fc', borderRadius: '14px',
                padding: '20px', marginBottom: '15px'
              }}
            >
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#1a1a2e', textAlign: 'center', marginBottom: '15px' }}>
                🛒 أدخل معلوماتك لطلب المنتج
              </p>

              <div className="pd-form-row-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <input
                  required type="text" placeholder="الاسم الكامل *"
                  value={customerInfo.name}
                  onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                  style={inputStyle} data-testid="cod-name"
                />
                <input
                  required type="tel" placeholder="رقم الهاتف *"
                  pattern="0[5-7][0-9]{8}"
                  value={customerInfo.phone}
                  onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                  onBlur={checkLoyalty}
                  style={inputStyle} data-testid="cod-phone"
                />
              </div>

              <div className="pd-form-row-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <select
                  required
                  value={customerInfo.wilaya}
                  onChange={e => setCustomerInfo({ ...customerInfo, wilaya: e.target.value })}
                  style={{ ...inputStyle, cursor: 'pointer' }} data-testid="cod-wilaya"
                >
                  <option value="">اختر الولاية *</option>
                  {wilayasData.map(w => <option key={w.id} value={w.id}>{w.id} - {w.name}</option>)}
                </select>
                <select
                  required
                  value={customerInfo.commune}
                  onChange={e => setCustomerInfo({ ...customerInfo, commune: e.target.value })}
                  style={{ ...inputStyle, cursor: 'pointer' }} data-testid="cod-commune"
                >
                  <option value="">{customerInfo.wilaya ? 'اختر البلدية *' : 'اختر الولاية أولا'}</option>
                  {availableCommunes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {selectedRate && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }} data-testid="pdp-delivery-type">
                  <label style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', border: customerInfo.delivery_type === 'home' ? '2px solid #f7941d' : '1px solid #d1d5db' }}>
                    <input type="radio" name="pdp_dtype" checked={customerInfo.delivery_type === 'home'} onChange={() => setCustomerInfo({ ...customerInfo, delivery_type: 'home' })} data-testid="pdp-type-home" />
                    🏠 للمنزل — {Number(selectedRate.home_price).toLocaleString()} دج
                  </label>
                  <label style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', border: customerInfo.delivery_type === 'office' ? '2px solid #f7941d' : '1px solid #d1d5db' }}>
                    <input type="radio" name="pdp_dtype" checked={customerInfo.delivery_type === 'office'} onChange={() => setCustomerInfo({ ...customerInfo, delivery_type: 'office' })} data-testid="pdp-type-office" />
                    🏢 مكتب التوصيل — {Number(selectedRate.office_price).toLocaleString()} دج
                  </label>
                </div>
              )}

              {customerInfo.delivery_type !== 'office' && (
                <input
                  required type="text" placeholder="العنوان التفصيلي *"
                  value={customerInfo.address}
                  onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                  style={{ ...inputStyle, marginBottom: '10px' }} data-testid="cod-address"
                />
              )}

              {/* الكوبون */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                <Tag size={14} style={{ color: primary, flexShrink: 0 }} />
                <input
                  type="text" placeholder="كود الخصم (اختياري)"
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  type="button" onClick={validateCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                  style={{
                    padding: '10px 16px', background: primary, color: '#fff', border: 'none',
                    borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600
                  }}
                >
                  {couponLoading ? '...' : 'تطبيق'}
                </button>
              </div>
              {couponMessage && (
                <p style={{ fontSize: '12px', marginBottom: '10px', color: couponDiscount > 0 ? '#16a34a' : '#dc2626' }}>
                  {couponMessage}
                </p>
              )}

              {/* نقاط الولاء */}
              {loyaltyPoints && loyaltyPoints.points > 0 && (
                <div style={{
                  background: '#fff8e1', padding: '10px 12px', borderRadius: '8px', marginBottom: '10px',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <Gift size={16} style={{ color: primary }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600 }}>لديك {loyaltyPoints.points} نقطة ولاء</p>
                    <p style={{ fontSize: '11px', color: '#6b7280' }}>100 نقطة = 500 دج خصم</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const pointsToUse = Math.min(loyaltyPoints.points, Math.floor(subtotal / 500) * 100);
                      const discount = (pointsToUse / 100) * 500;
                      setCouponDiscount(prev => prev + discount);
                      toast.success(`تم استبدال ${pointsToUse} نقطة بخصم ${discount.toLocaleString()} دج`);
                    }}
                    style={{
                      padding: '6px 12px', background: '#fff', border: `1px solid ${primary}`,
                      color: primary, borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
                    }}
                  >
                    استبدال
                  </button>
                </div>
              )}

              {/* الكمية + ملخص الطلب */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px',
                background: '#fff', borderRadius: '10px', padding: '10px 12px'
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', border: '1px solid #d1d5db',
                  borderRadius: '8px', overflow: 'hidden', height: '40px', background: '#fff', flexShrink: 0
                }}>
                  <button type="button" onClick={() => setQuantity(Math.min(maxQty, quantity + 1))}
                    style={{ width: '36px', height: '100%', background: '#f3f4f6', border: 'none', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={14} />
                  </button>
                  <span data-testid="cod-qty" style={{ width: '40px', textAlign: 'center', fontWeight: 700, fontSize: '15px' }}>{quantity}</span>
                  <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    style={{ width: '36px', height: '100%', background: '#f3f4f6', border: 'none', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Minus size={14} />
                  </button>
                </div>
                <div style={{ flex: 1, fontSize: '13px', lineHeight: 1.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                    <span>المنتج × {quantity}</span><span>{subtotal.toLocaleString()} دج</span>
                  </div>
                  {couponDiscount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                      <span>الخصم</span><span>-{couponDiscount.toLocaleString()} دج</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                    <span>التوصيل</span>
                    <span data-testid="cod-delivery">{effectiveDelivery > 0 ? `${effectiveDelivery.toLocaleString()} دج` : 'مجاني'}</span>
                  </div>
                </div>
              </div>

              {/* زر تأكيد الطلب */}
              <button
                type="submit"
                disabled={submitting || product.quantity <= 0}
                data-testid="cod-confirm-btn"
                style={{
                  width: '100%', height: '48px', marginTop: '12px',
                  background: `linear-gradient(135deg, ${primary}, #e67e22)`,
                  color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px',
                  fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '8px', transition: 'all 0.2s',
                  opacity: (submitting || product.quantity <= 0) ? 0.6 : 1
                }}
              >
                {submitting ? 'جارٍ إرسال الطلب...' : (
                  <>
                    <CheckCircle size={18} />
                    انقر هنا لتأكيد الطلب — {finalTotal.toLocaleString()} دج
                  </>
                )}
              </button>
              <p style={{ textAlign: 'center', fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
                💵 الدفع عند الاستلام
              </p>
            </form>

            {/* شارات الثقة */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '13px' }}>
                <Truck size={15} /> توصيل سريع
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '13px' }}>
                <Shield size={15} /> ضمان أصلي
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '13px' }}>
                <RefreshCw size={15} /> إرجاع خلال 3 أيام
              </span>
            </div>
          </div>
        </div>

        {/* ===== الوصف الطويل في بطاقة منفصلة ===== */}
        {(product.description_ar || product.description) && (
          <div data-testid="pd-long-desc" style={{
            marginTop: '40px', padding: '30px', background: '#fff', borderRadius: '16px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)', lineHeight: 1.8, color: '#374151', fontSize: '15px'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px', color: '#1a1a2e' }}>وصف المنتج</h2>
            <p style={{ whiteSpace: 'pre-line' }}>{product.description_ar || product.description}</p>
          </div>
        )}
      </section>

      {/* ===== نجاح الطلب ===== */}
      {orderSuccess && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '40px', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
            <h3 style={{ marginBottom: '8px' }}>تم استلام طلبك بنجاح!</h3>
            <p style={{ color: '#6b7280', marginBottom: '16px' }}>سنتواصل معك قريباً لتأكيد الطلب</p>
            <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontWeight: 700 }}>
              رقم الطلب: {orderSuccess.order_number}
            </div>
            <div style={{ marginBottom: '24px' }}>
              <Link to={`/shop/${slug}/track/${orderSuccess.order_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: primary, textDecoration: 'none', fontSize: '14px' }}>
                <MapPin size={16} /> تتبع طلبك
              </Link>
            </div>
            <button
              style={{ padding: '14px 32px', background: primary, color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', cursor: 'pointer' }}
              onClick={() => { setOrderSuccess(null); setCouponCode(''); setCouponDiscount(0); setCouponMessage(''); navigate(`/shop/${slug}`); }}
            >
              متابعة التسوق
            </button>
          </div>
        </div>
      )}

      {/* ===== منتجات مشابهة ===== */}
      {relatedProducts.length > 0 && (
        <section className="nc-section" style={{ background: '#f8f9fa' }}>
          <div className="nc-section-inner">
            <h2 className="nc-section-title" style={{ textAlign: 'center', marginBottom: '32px' }}>منتجات مشابهة</h2>
            <div className="nc-products-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '24px' }}>
              {relatedProducts.map(p => (
                <Link key={p.id} to={`/shop/${slug}/product/${p.id}`} className="nc-product-card" style={{ textDecoration: 'none', color: 'inherit', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                  <div className="nc-product-image" style={{ height: '180px' }}>
                    {p.image_url ? <img src={p.image_url} alt={p.name_ar} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div className="nc-product-placeholder" style={{ fontSize: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>📦</div>}
                  </div>
                  <div className="nc-product-info" style={{ padding: '16px' }}>
                    <h3 className="nc-product-title" style={{ fontSize: '16px', marginBottom: '8px' }}>{p.name_ar || p.name}</h3>
                    <div className="nc-product-price">
                      <span className="nc-price-current" style={{ color: primary, fontWeight: 700 }}>{(p.retail_price || p.selling_price || 0).toLocaleString()} دج</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* تجاوب الجوال: عمود واحد */}
      <style>{`
        @media (max-width: 768px) {
          .pd-main-row { grid-template-columns: 1fr !important; }
          .pd-image-col { position: static !important; }
          .pd-form-row-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
