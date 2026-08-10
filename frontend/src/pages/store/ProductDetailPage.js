import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { toast } from 'sonner';
import { ShoppingCart, Truck, Shield, RefreshCw, ChevronLeft } from 'lucide-react';

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

  const WILAYAS = [
    { id: '16', name: 'الجزائر العاصمة' },
    { id: '31', name: 'وهران' },
    { id: '25', name: 'قسنطينة' },
    { id: '9', name: 'بليدة' },
    { id: '15', name: 'تيزي وزو' },
    { id: '26', name: 'المدية' },
    { id: '6', name: 'بجاية' },
    { id: '23', name: 'عنابة' },
    { id: '19', name: 'سطيف' },
    { id: '22', name: 'سيدي بلعباس' },
  ];

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

  const handleOrder = async (e) => {
    e.preventDefault();
    try {
      const price = product.retail_price || product.selling_price || 0;
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
        subtotal: price * quantity,
        total: price * quantity,
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
              <div style={{ fontWeight: 800, fontSize: '18px', color: '#f7941d' }}>
                الإجمالي: {(price * quantity).toLocaleString()} دج
              </div>
            </div>

            <form onSubmit={handleOrder}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>الاسم الكامل *</label>
                  <input required value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} placeholder="أحمد بن علي" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>رقم الهاتف *</label>
                  <input required type="tel" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} placeholder="0555123456" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
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
                    {WILAYAS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>البلدية *</label>
                  <input required value={customerInfo.commune} onChange={e => setCustomerInfo({...customerInfo, commune: e.target.value})} placeholder="باب الزوار" style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }} />
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
                ✅ تأكيد الطلب (الدفع عند الاستلام)
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
            <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontWeight: 700 }}>رقم الطلب: {orderSuccess.order_number}</div>
            <button style={{ padding: '14px 32px', background: '#f7941d', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', cursor: 'pointer' }} onClick={() => { setShowOrderForm(false); setOrderSuccess(null); navigate(`/shop/${slug}`); }}>
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
