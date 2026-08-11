import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { toast } from 'sonner';
import { ShoppingCart, Truck, Shield, RefreshCw, ChevronLeft, Tag, Gift, MapPin } from 'lucide-react';

export default function ProductDetailPage() {
  const { slug, productId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [store, setStore] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);

  const [customerInfo, setCustomerInfo] = useState({
    name: '', phone: '', email: '', wilaya: '', commune: '', address: '', notes: ''
  });

  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const [loyaltyPoints, setLoyaltyPoints] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(0);

  const [wilayasData, setWilayasData] = useState([]);
  const [availableCommunes, setAvailableCommunes] = useState([]);

  useEffect(() => {
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
        setCustomerInfo(prev => ({...prev, commune: ''}));
      }
    } else {
      setAvailableCommunes([]);
    }
  }, [customerInfo.wilaya, wilayasData]);

  useEffect(() => {
    fetchProduct();
  }, [slug, productId]);

  const fetchProduct = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/shop/${slug}/product/${productId}`);
      setProduct(response.data.product);
      setRelatedProducts(response.data.related_products || []);
      setStore(response.data.settings);
    } catch (error) {
      toast.error('المنتج غير متوفر');
      navigate(`/shop/${slug}`);
    } finally {
      setLoading(false);
    }
  };

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const price = product.retail_price || product.selling_price || 0;
      const response = await apiClient.post(`/shop/${slug}/validate-coupon`, {
        code: couponCode,
        subtotal: price * quantity,
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
      // Silently fail - loyalty is optional
    }
  };

  const handleOrder = async (e) => {
    e.preventDefault();
    try {
      const price = product.retail_price || product.selling_price || 0;
      const subtotal = price * quantity;
      const total = Math.max(0, subtotal - couponDiscount);

      const orderData = {
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        customer_email: customerInfo.email,
        delivery_address: customerInfo.address,
        delivery_city: customerInfo.commune,
        delivery_wilaya: customerInfo.wilaya,
        items: [{
          product_id: product.id,
          name: product.name_ar || product.name,
          quantity: quantity,
          price: price
        }],
        subtotal: subtotal,
        total: total,
        coupon_code: couponCode || undefined,
        coupon_discount: couponDiscount || undefined,
        notes: customerInfo.notes,
        payment_method: 'cod'
      };
      const response = await apiClient.post(`/shop/${slug}/order`, orderData);
      setOrderSuccess(response.data);
      setShowOrderForm(false);
    } catch (error) {
      toast.error('فشل إرسال الطلب');
    }
  };

  if (loading) return <div className="nouacer-store"><div className="nc-loading"><div className="nc-spinner" /></div></div>;
  if (!product) return null;

  const price = product.retail_price || product.selling_price || 0;
  const finalPrice = Math.max(0, price * quantity - couponDiscount);

  return (
    <div className="nouacer-store" dir="rtl">
      <header className="nc-header">
        <div className="nc-header-inner">
          <Link to={`/shop/${slug}`} className="nc-logo">
            <ChevronLeft size={20} /> {store?.store_name || 'المتجر'}
          </Link>
        </div>
      </header>

      <section className="nc-section" style={{ paddingTop: '40px' }}>
        <div className="nc-section-inner">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
            <div className="nc-product-image" style={{ height: '400px', borderRadius: '16px' }}>
              {product.image_url ? (
                <img src={product.image_url} alt={product.name_ar} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '16px' }} />
              ) : (
                <div className="nc-product-placeholder" style={{ fontSize: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>📦</div>
              )}
            </div>

            <div>
              <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#1a1a2e', marginBottom: '16px' }}>
                {product.name_ar || product.name}
              </h1>
              <p style={{ color: '#636e72', marginBottom: '24px', lineHeight: 1.7 }}>
                {product.description_ar || product.description || 'لا يوجد وصف'}
              </p>

              <div className="nc-product-price" style={{ marginBottom: '24px' }}>
                <span className="nc-price-current" style={{ fontSize: '36px' }}>
                  {price.toLocaleString()} دج
                </span>
                {product.purchase_price > 0 && (
                  <span className="nc-price-old" style={{ fontSize: '20px', marginRight: '12px', textDecoration: 'line-through', color: '#999' }}>
                    {Math.round(price * 1.2).toLocaleString()} دج
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <span>الكمية:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="nc-qty-btn" onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>-</button>
                  <span style={{ fontWeight: 700, fontSize: '18px', minWidth: '30px', textAlign: 'center' }}>{quantity}</span>
                  <button className="nc-qty-btn" onClick={() => setQuantity(quantity + 1)} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>+</button>
                </div>
                <span style={{ color: '#636e72' }}>
                  {product.quantity > 0 ? `(${product.quantity} متوفر)` : '(نفذت الكمية)'}
                </span>
              </div>

              <button
                className="nc-add-cart-btn"
                style={{ fontSize: '18px', padding: '16px 32px', background: '#f7941d', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}
                onClick={() => setShowOrderForm(true)}
                disabled={product.quantity <= 0}
              >
                <ShoppingCart size={20} /> اطلب الآن (الدفع عند الاستلام)
              </button>

              <div style={{ display: 'flex', gap: '16px', marginTop: '24px', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#636e72', fontSize: '14px' }}>
                  <Truck size={16} /> توصيل سريع
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#636e72', fontSize: '14px' }}>
                  <Shield size={16} /> ضمان أصلي
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#636e72', fontSize: '14px' }}>
                  <RefreshCw size={16} /> إرجاع خلال 3 أيام
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showOrderForm && !orderSuccess && (
        <div className="nc-modal-overlay active" onClick={() => setShowOrderForm(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="nc-modal" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px', padding: '32px', maxWidth: '500px', width: '90%', maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ marginBottom: '20px', textAlign: 'center' }}>📝 إتمام الطلب</h2>
            <div style={{ background: '#f8f9fa', padding: '16px', borderRadius: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span>{product.name_ar}</span>
                <span>× {quantity}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#636e72', fontSize: '14px' }}>
                <span>المجموع الفرعي</span>
                <span>{(price * quantity).toLocaleString()} دج</span>
              </div>
              {couponDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#27ae60', fontSize: '14px' }}>
                  <span>خصم الكوبون</span>
                  <span>-{couponDiscount.toLocaleString()} دج</span>
                </div>
              )}
              <div style={{ fontWeight: 800, fontSize: '18px', color: '#f7941d', borderTop: '1px solid #ddd', paddingTop: '8px' }}>
                الإجمالي: {finalPrice.toLocaleString()} دج
              </div>
            </div>

            {/* Coupon Input */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Tag size={16} style={{ color: '#f7941d' }} />
                <input
                  type="text"
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="أدخل كود الخصم"
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                />
                <button
                  onClick={validateCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                  style={{ padding: '10px 16px', background: '#f7941d', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
                >
                  {couponLoading ? '...' : 'تطبيق'}
                </button>
              </div>
              {couponMessage && (
                <p style={{ fontSize: '13px', marginTop: '4px', color: couponDiscount > 0 ? '#27ae60' : '#e74c3c' }}>
                  {couponMessage}
                </p>
              )}
            </div>

            {/* Loyalty Points (if customer has points) */}
            {loyaltyPoints && loyaltyPoints.points > 0 && (
              <div style={{ background: '#fff8e1', padding: '12px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Gift size={16} style={{ color: '#f7941d' }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: 600 }}>🎁 لديك {loyaltyPoints.points} نقطة ولاء</p>
                  <p style={{ fontSize: '12px', color: '#636e72' }}>100 نقطة = 500 دج خصم</p>
                </div>
                <button
                  onClick={() => {
                    const pointsToUse = Math.min(loyaltyPoints.points, Math.floor((price * quantity) / 500) * 100);
                    const discount = (pointsToUse / 100) * 500;
                    setRedeemPoints(pointsToUse);
                    setCouponDiscount(prev => prev + discount);
                    toast.success(`تم استبدال ${pointsToUse} نقطة بخصم ${discount.toLocaleString()} دج`);
                  }}
                  style={{ padding: '6px 12px', background: '#fff', border: '1px solid #f7941d', color: '#f7941d', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                >
                  استبدال
                </button>
              </div>
            )}

            <form onSubmit={handleOrder}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>الاسم الكامل *</label>
                  <input required value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} placeholder="أحمد بن علي" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>رقم الهاتف *</label>
                  <input required type="tel" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} onBlur={checkLoyalty} placeholder="0555123456" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>البريد الإلكتروني</label>
                <input type="email" value={customerInfo.email} onChange={e => setCustomerInfo({...customerInfo, email: e.target.value})} placeholder="email@example.com" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>الولاية *</label>
                  <select required value={customerInfo.wilaya} onChange={e => setCustomerInfo({...customerInfo, wilaya: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}>
                    <option value="">اختر الولاية</option>
                    {wilayasData.map(w => <option key={w.id} value={w.id}>{w.id} - {w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>البلدية *</label>
                  <select required value={customerInfo.commune} onChange={e => setCustomerInfo({...customerInfo, commune: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}>
                    <option value="">{customerInfo.wilaya ? 'اختر البلدية' : 'اختر الولاية أولا'}</option>
                    {availableCommunes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>العنوان التفصيلي *</label>
                <input required value={customerInfo.address} onChange={e => setCustomerInfo({...customerInfo, address: e.target.value})} placeholder="حي ..., شارع ..., عمارة ..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>ملاحظات</label>
                <textarea rows={3} value={customerInfo.notes} onChange={e => setCustomerInfo({...customerInfo, notes: e.target.value})} placeholder="أي ملاحظات خاصة..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', resize: 'vertical' }} />
              </div>
              <button type="submit" style={{ width: '100%', padding: '14px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}>
                ✅ تأكيد الطلب (الدفع عند الاستلام) — {finalPrice.toLocaleString()} دج
              </button>
            </form>
          </div>
        </div>
      )}

      {orderSuccess && (
        <div className="nc-modal-overlay active" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="nc-modal" style={{ background: '#fff', borderRadius: '16px', padding: '40px', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
            <h3 style={{ marginBottom: '8px' }}>تم استلام طلبك بنجاح!</h3>
            <p style={{ color: '#636e72', marginBottom: '16px' }}>سنتواصل معك قريباً لتأكيد الطلب</p>
            <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontWeight: 700 }}>رقم الطلب: {orderSuccess.order_number}</div>

            {/* Tracking Link */}
            <div style={{ marginBottom: '24px' }}>
              <Link to={`/shop/${slug}/track/${orderSuccess.order_id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#f7941d', textDecoration: 'none', fontSize: '14px' }}>
                <MapPin size={16} /> تتبع طلبك
              </Link>
            </div>

            <button style={{ padding: '14px 32px', background: '#f7941d', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', cursor: 'pointer' }} onClick={() => { setShowOrderForm(false); setOrderSuccess(null); setCouponCode(''); setCouponDiscount(0); setCouponMessage(''); navigate(`/shop/${slug}`); }}>
              متابعة التسوق
            </button>
          </div>
        </div>
      )}

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
                      <span className="nc-price-current" style={{ color: '#f7941d', fontWeight: 700 }}>{(p.retail_price || p.selling_price || 0).toLocaleString()} دج</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
