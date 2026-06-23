import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { toast, Toaster } from 'sonner';
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  Phone, 
  MapPin, 
  Clock, 
  Package,
  Store,
  CheckCircle,
  X,
  Truck,
  Banknote,
  Search,
  ChevronLeft,
  ShoppingBag,
  Heart,
  Share2
} from 'lucide-react';

export default function PublicStorePage() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [language, setLanguage] = useState('ar');
  
  // Customer info for checkout
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    wilaya: '',
    notes: ''
  });

  useEffect(() => {
    fetchStore();
    // Load cart from localStorage
    const savedCart = localStorage.getItem(`cart_${slug}`);
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {}
    }
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save cart to localStorage
  useEffect(() => {
    localStorage.setItem(`cart_${slug}`, JSON.stringify(cart));
  }, [cart, slug]);

  const fetchStore = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/shop/${slug}`);
      setStore(response.data.settings);
      setProducts(response.data.products);
    } catch (error) {
      console.error('Error fetching store:', error);
      setStore(null);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product) => {
    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      setCart(cart.map(item => 
        item.product_id === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        name: language === 'ar' ? product.name_ar : product.name_en,
        price: product.retail_price,
        image: product.image_url,
        quantity: 1
      }]);
    }
    toast.success(language === 'ar' ? 'تمت الإضافة للسلة' : 'Added to cart');
  };

  const updateQuantity = (productId, delta) => {
    setCart(cart.map(item => {
      if (item.product_id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.product_id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  
  const deliveryFee = store?.delivery_enabled 
    ? (store?.free_delivery_threshold && cartTotal >= store.free_delivery_threshold ? 0 : (store?.delivery_fee || 0))
    : 0;
  
  const orderTotal = cartTotal + deliveryFee;

  const filteredProducts = products.filter(p => {
    if (!searchQuery) return true;
    const name = language === 'ar' ? p.name_ar : p.name_en;
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const submitOrder = async () => {
    // Validation
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.address) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    if (store?.min_order_amount && cartTotal < store.min_order_amount) {
      toast.error(language === 'ar' 
        ? `الحد الأدنى للطلب ${store.min_order_amount} دج`
        : `Minimum order amount is ${store.min_order_amount} DZD`);
      return;
    }

    setSubmittingOrder(true);
    try {
      const orderData = {
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        customer_email: customerInfo.email,
        delivery_address: customerInfo.address,
        delivery_city: customerInfo.city,
        delivery_wilaya: customerInfo.wilaya,
        items: cart.map(item => ({
          product_id: item.product_id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          total: item.price * item.quantity
        })),
        subtotal: cartTotal,
        delivery_fee: deliveryFee,
        total: orderTotal,
        notes: customerInfo.notes,
        payment_method: 'cod'
      };

      const response = await apiClient.post(`/shop/${slug}/order`, orderData);
      
      setOrderSuccess({
        order_number: response.data.order_number,
        total: orderTotal
      });
      
      // Clear cart
      setCart([]);
      localStorage.removeItem(`cart_${slug}`);
      setShowCheckout(false);
      
    } catch (error) {
      console.error('Order error:', error);
      toast.error(language === 'ar' ? 'حدث خطأ أثناء إرسال الطلب' : 'Error submitting order');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ar-DZ').format(price);
  };

  const isRTL = language === 'ar';

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">{language === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  // Store not found
  if (!store) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Store className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">{language === 'ar' ? 'المتجر غير موجود' : 'Store not found'}</h1>
          <p className="text-muted-foreground mb-4">
            {language === 'ar' ? 'عذراً، هذا المتجر غير متوفر' : 'Sorry, this store is not available'}
          </p>
          <Link to="/">
            <Button>{language === 'ar' ? 'العودة للرئيسية' : 'Back to Home'}</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Order success
  if (orderSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50 to-white p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <Card className="max-w-md w-full text-center p-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-green-800 mb-2">
            {language === 'ar' ? 'تم استلام طلبك بنجاح!' : 'Order Received Successfully!'}
          </h1>
          <p className="text-muted-foreground mb-6">
            {language === 'ar' 
              ? 'سيتم التواصل معك قريباً لتأكيد الطلب'
              : 'We will contact you soon to confirm your order'}
          </p>
          
          <div className="bg-slate-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground mb-1">
              {language === 'ar' ? 'رقم الطلب' : 'Order Number'}
            </p>
            <p className="text-2xl font-mono font-bold text-primary">{orderSuccess.order_number}</p>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg mb-6">
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-amber-600" />
              <span className="text-amber-800">{language === 'ar' ? 'الدفع عند الاستلام' : 'Cash on Delivery'}</span>
            </div>
            <span className="font-bold text-amber-800">{formatPrice(orderSuccess.total)} {language === 'ar' ? 'دج' : 'DZD'}</span>
          </div>
          
          <Button onClick={() => setOrderSuccess(null)} className="w-full">
            {language === 'ar' ? 'متابعة التسوق' : 'Continue Shopping'}
          </Button>
        </Card>
      </div>
    );
  }

  const primaryColor = store.primary_color || '#3b82f6';

  return (
    <div className="min-h-screen bg-slate-50" dir={isRTL ? 'rtl' : 'ltr'}>
      <Toaster position={isRTL ? 'top-left' : 'top-right'} />
      
      {/* Header */}
      <header 
        className="sticky top-0 z-50 backdrop-blur-sm border-b"
        style={{ backgroundColor: `${primaryColor}ee` }}
      >
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo & Name */}
            <div className="flex items-center gap-3">
              {store.logo_url ? (
                <img src={store.logo_url} alt={store.store_name} className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <Store className="h-6 w-6 text-white" />
                </div>
              )}
              <div>
                <h1 className="text-lg font-bold text-white">{store.store_name}</h1>
                {store.working_hours && (
                  <p className="text-xs text-white/70 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {store.working_hours}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Language Toggle */}
              <button
                onClick={() => setLanguage(language === 'ar' ? 'fr' : 'ar')}
                className="px-2 py-1 rounded bg-white/20 text-white text-sm hover:bg-white/30 transition-colors"
              >
                {language === 'ar' ? 'FR' : 'عربي'}
              </button>
              
              {/* Cart Button */}
              <button
                onClick={() => setShowCart(true)}
                className="relative p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
              >
                <ShoppingCart className="h-6 w-6" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'ar' ? 'ابحث عن منتج...' : 'Search products...'}
              className="ps-10 bg-white/90 border-0 focus-visible:ring-2 focus-visible:ring-white"
            />
          </div>
        </div>
      </header>

      {/* Store Info Banner */}
      {store.description && (
        <div className="bg-white border-b">
          <div className="container mx-auto px-4 py-3">
            <p className="text-sm text-muted-foreground">{store.description}</p>
          </div>
        </div>
      )}

      {/* Products Grid */}
      <main className="container mx-auto px-4 py-6">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {searchQuery 
                ? (language === 'ar' ? 'لا توجد نتائج للبحث' : 'No search results')
                : (language === 'ar' ? 'لا توجد منتجات متوفرة' : 'No products available')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map(product => {
              const name = language === 'ar' ? (product.name_ar || product.name_en) : (product.name_en || product.name_ar);
              const inCart = cart.find(item => item.product_id === product.id);
              
              return (
                <Card 
                  key={product.id} 
                  className="overflow-hidden hover:shadow-lg transition-shadow group"
                >
                  {/* Product Image */}
                  <div className="aspect-square bg-slate-100 relative overflow-hidden">
                    {product.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt={name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-12 w-12 text-slate-300" />
                      </div>
                    )}
                    
                    {/* Quick Add Button */}
                    {inCart ? (
                      <div className="absolute bottom-2 inset-x-2 flex items-center justify-between bg-white rounded-lg shadow-lg p-1">
                        <button
                          onClick={() => updateQuantity(product.id, -1)}
                          className="p-2 hover:bg-slate-100 rounded"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="font-bold">{inCart.quantity}</span>
                        <button
                          onClick={() => updateQuantity(product.id, 1)}
                          className="p-2 hover:bg-slate-100 rounded"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product)}
                        className="absolute bottom-2 end-2 p-2 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
                        style={{ color: primaryColor }}
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    )}
                  </div>

                  {/* Product Info */}
                  <CardContent className="p-3">
                    <h3 className="font-medium text-sm line-clamp-2 mb-2 min-h-[2.5rem]">{name}</h3>
                    <div className="flex items-center justify-between">
                      <p className="font-bold" style={{ color: primaryColor }}>
                        {formatPrice(product.retail_price)} <span className="text-xs">{language === 'ar' ? 'دج' : 'DZD'}</span>
                      </p>
                      {!inCart && (
                        <Button 
                          size="sm" 
                          onClick={() => addToCart(product)}
                          style={{ backgroundColor: primaryColor }}
                          className="text-white"
                        >
                          <ShoppingCart className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Cart Button (Mobile) */}
      {cartCount > 0 && (
        <div className="fixed bottom-4 inset-x-4 md:hidden z-40">
          <Button
            onClick={() => setShowCart(true)}
            className="w-full py-6 text-lg shadow-xl"
            style={{ backgroundColor: primaryColor }}
          >
            <ShoppingCart className="h-5 w-5 me-2" />
            {language === 'ar' ? 'عرض السلة' : 'View Cart'}
            <Badge variant="secondary" className="ms-2 bg-white text-slate-900">
              {cartCount}
            </Badge>
            <span className="ms-auto font-bold">{formatPrice(cartTotal)} {language === 'ar' ? 'دج' : 'DZD'}</span>
          </Button>
        </div>
      )}

      {/* Cart Drawer */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              {language === 'ar' ? 'سلة التسوق' : 'Shopping Cart'}
              <Badge variant="secondary">{cartCount}</Badge>
            </DialogTitle>
          </DialogHeader>

          {cart.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{language === 'ar' ? 'السلة فارغة' : 'Cart is empty'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cart Items */}
              <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                {cart.map(item => (
                  <div key={item.product_id} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className="w-16 h-16 bg-white rounded-lg overflow-hidden flex-shrink-0">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-6 w-6 text-slate-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{item.name}</h4>
                      <p className="text-sm" style={{ color: primaryColor }}>{formatPrice(item.price)} {language === 'ar' ? 'دج' : 'DZD'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          onClick={() => updateQuantity(item.product_id, -1)}
                          className="p-1 bg-white rounded border hover:bg-slate-50"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-medium w-6 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product_id, 1)}
                          className="p-1 bg-white rounded border hover:bg-slate-50"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeFromCart(item.product_id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded ms-auto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{language === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
                  <span>{formatPrice(cartTotal)} {language === 'ar' ? 'دج' : 'DZD'}</span>
                </div>
                
                {store?.delivery_enabled && (
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <Truck className="h-4 w-4" />
                      {language === 'ar' ? 'التوصيل' : 'Delivery'}
                    </span>
                    <span>
                      {deliveryFee === 0 
                        ? (language === 'ar' ? 'مجاني' : 'Free')
                        : `${formatPrice(deliveryFee)} ${language === 'ar' ? 'دج' : 'DZD'}`
                      }
                    </span>
                  </div>
                )}
                
                {store?.free_delivery_threshold && cartTotal < store.free_delivery_threshold && (
                  <p className="text-xs text-green-600">
                    {language === 'ar' 
                      ? `أضف ${formatPrice(store.free_delivery_threshold - cartTotal)} دج للتوصيل المجاني`
                      : `Add ${formatPrice(store.free_delivery_threshold - cartTotal)} DZD for free delivery`}
                  </p>
                )}
                
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>{language === 'ar' ? 'الإجمالي' : 'Total'}</span>
                  <span style={{ color: primaryColor }}>{formatPrice(orderTotal)} {language === 'ar' ? 'دج' : 'DZD'}</span>
                </div>
              </div>

              {/* Checkout Button */}
              <Button 
                onClick={() => { setShowCart(false); setShowCheckout(true); }}
                className="w-full py-6 text-lg"
                style={{ backgroundColor: primaryColor }}
              >
                {language === 'ar' ? 'إتمام الطلب' : 'Checkout'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Checkout Dialog */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {language === 'ar' ? 'معلومات التوصيل' : 'Delivery Information'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'الاسم الكامل *' : 'Full Name *'}</Label>
              <Input
                value={customerInfo.name}
                onChange={(e) => setCustomerInfo(prev => ({ ...prev, name: e.target.value }))}
                placeholder={language === 'ar' ? 'أدخل اسمك' : 'Enter your name'}
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'رقم الهاتف *' : 'Phone Number *'}</Label>
              <Input
                value={customerInfo.phone}
                onChange={(e) => setCustomerInfo(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="0555 123 456"
                dir="ltr"
              />
            </div>

            {/* Wilaya */}
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'الولاية' : 'Wilaya'}</Label>
              <Input
                value={customerInfo.wilaya}
                onChange={(e) => setCustomerInfo(prev => ({ ...prev, wilaya: e.target.value }))}
                placeholder={language === 'ar' ? 'الجزائر العاصمة' : 'Alger'}
              />
            </div>

            {/* City */}
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'البلدية / المدينة' : 'City'}</Label>
              <Input
                value={customerInfo.city}
                onChange={(e) => setCustomerInfo(prev => ({ ...prev, city: e.target.value }))}
                placeholder={language === 'ar' ? 'باب الوادي' : 'Bab El Oued'}
              />
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'العنوان بالتفصيل *' : 'Full Address *'}</Label>
              <Textarea
                value={customerInfo.address}
                onChange={(e) => setCustomerInfo(prev => ({ ...prev, address: e.target.value }))}
                placeholder={language === 'ar' ? 'رقم الشارع، اسم الحي، الطابق...' : 'Street number, neighborhood, floor...'}
                rows={2}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'ملاحظات إضافية' : 'Additional Notes'}</Label>
              <Textarea
                value={customerInfo.notes}
                onChange={(e) => setCustomerInfo(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={language === 'ar' ? 'أي ملاحظات للتوصيل...' : 'Any delivery notes...'}
                rows={2}
              />
            </div>

            {/* Payment Method */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-3">
                <Banknote className="h-6 w-6 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">
                    {language === 'ar' ? 'الدفع عند الاستلام' : 'Cash on Delivery'}
                  </p>
                  <p className="text-xs text-amber-600">
                    {language === 'ar' ? 'ادفع نقداً عند استلام طلبك' : 'Pay cash when you receive your order'}
                  </p>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>{language === 'ar' ? 'المنتجات' : 'Products'} ({cartCount})</span>
                <span>{formatPrice(cartTotal)} {language === 'ar' ? 'دج' : 'DZD'}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span>{language === 'ar' ? 'التوصيل' : 'Delivery'}</span>
                  <span>{formatPrice(deliveryFee)} {language === 'ar' ? 'دج' : 'DZD'}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>{language === 'ar' ? 'الإجمالي' : 'Total'}</span>
                <span style={{ color: primaryColor }}>{formatPrice(orderTotal)} {language === 'ar' ? 'دج' : 'DZD'}</span>
              </div>
            </div>

            {/* Min Order Warning */}
            {store?.min_order_amount && cartTotal < store.min_order_amount && (
              <p className="text-sm text-red-500">
                {language === 'ar' 
                  ? `الحد الأدنى للطلب ${formatPrice(store.min_order_amount)} دج`
                  : `Minimum order amount is ${formatPrice(store.min_order_amount)} DZD`}
              </p>
            )}

            {/* Submit Button */}
            <Button
              onClick={submitOrder}
              disabled={submittingOrder || (store?.min_order_amount && cartTotal < store.min_order_amount)}
              className="w-full py-6 text-lg"
              style={{ backgroundColor: primaryColor }}
            >
              {submittingOrder 
                ? (language === 'ar' ? 'جاري الإرسال...' : 'Submitting...')
                : (language === 'ar' ? 'تأكيد الطلب' : 'Confirm Order')
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="mt-12 border-t bg-white">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {store.contact_phone && (
                <a href={`tel:${store.contact_phone}`} className="flex items-center gap-1 hover:text-primary">
                  <Phone className="h-4 w-4" />
                  {store.contact_phone}
                </a>
              )}
              {store.contact_address && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {store.contact_address}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} {store.store_name} - Powered by NT Commerce
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
