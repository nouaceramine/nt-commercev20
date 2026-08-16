import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Store, 
  Package, 
  ShoppingCart, 
  ExternalLink,
  Copy,
  Settings,
  Eye,
  EyeOff,
  Check,
  X,
  RefreshCw,
  Save,
  Plus,
  Minus,
  Image,
  Edit,
  Trash2,
  Globe,
  Palette,
  Layout as LayoutIcon,
  Phone,
  MapPin,
  Clock,
  Truck,
  CreditCard,
  Banknote,
  Megaphone
} from 'lucide-react';

export default function StoreManagementPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [storeSettings, setStoreSettings] = useState({
    enabled: false,
    store_name: '',
    fb_pixel_id: '',
    tiktok_pixel_id: '',
    store_slug: '',
    description: '',
    logo_url: '',
    banner_url: '',
    primary_color: '#3b82f6',
    contact_phone: '',
    contact_email: '',
    contact_address: '',
    working_hours: '09:00 - 18:00',
    cod_enabled: true,
    delivery_enabled: true,
    min_order_amount: 0,
    delivery_fee: 0,
    free_delivery_threshold: 0
  });
  const [products, setProducts] = useState([]);
  const [storeProducts, setStoreProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cartLeads, setCartLeads] = useState([]);  // p83
  const [cartRecovered, setCartRecovered] = useState(0);  // p107
  const [tgTesting, setTgTesting] = useState(false);  // p84
  const [saving, setSaving] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [landingDialog, setLandingDialog] = useState(null);
  const [landingCfg, setLandingCfg] = useState(null);
  const [landingSaving, setLandingSaving] = useState(false);
  const [landingAi, setLandingAi] = useState(false);  // p110
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [activeTab, setActiveTab] = useState('settings');
  
  // Store URL
  const storeUrl = storeSettings.store_slug 
    ? `${window.location.origin}/shop/${storeSettings.store_slug}`
    : '';

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // تحديث تلقائي للطلبات كل 20 ثانية (صامت — بدون مؤشر تحميل)
  useEffect(() => {
    const tick = setInterval(() => { fetchOrdersOnly(); fetchCartLeads(); }, 20000);
    fetchCartLeads();
    return () => clearInterval(tick);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const testTelegram = async () => {  // p84
    setTgTesting(true);
    try {
      await apiClient.post('/store/telegram/test', {});
      toast.success('أُرسلت رسالة الاختبار — تحقق من تيليجرام ✅');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'فشل إرسال الاختبار');
    } finally { setTgTesting(false); }
  };

  const fetchCartLeads = async () => {  // p83
    try {
      const r = await apiClient.get('/store/cart-leads');
      setCartLeads(r.data?.leads || []);
      setCartRecovered(r.data?.recovered || 0);  // p107
    } catch (e) { /* optional */ }
  };

  const fetchOrdersOnly = async () => {
    try {
      const ordersRes = await apiClient.get(`/store/orders`);
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
    } catch { /* صامت */ }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Fetch store settings
      const settingsRes = await apiClient.get(`/store/settings`, { headers }).catch(() => ({ data: null }));
      if (settingsRes.data) {
        setStoreSettings(prev => ({ ...prev, ...settingsRes.data }));
      }
      
      // Fetch all products
      const productsRes = await apiClient.get(`/products`, { headers });
      setProducts(productsRes.data);
      
      // Fetch store products
      const storeProductsRes = await apiClient.get(`/store/products`, { headers }).catch(() => ({ data: [] }));
      setStoreProducts(storeProductsRes.data);
      setSelectedProducts(storeProductsRes.data.map(p => p.product_id));
      
      // Fetch orders
      const ordersRes = await apiClient.get(`/store/orders`, { headers }).catch(() => ({ data: [] }));
      setOrders(ordersRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveStoreSettings = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/store/settings`, storeSettings);
      toast.success(language === 'ar' ? 'تم حفظ إعدادات المتجر' : 'Store settings saved');
    } catch (error) {
      console.error('Error saving store settings:', error);
      toast.error(language === 'ar' ? 'فشل حفظ الإعدادات' : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const openLanding = async (product) => {
    try {
      const headers = getAuthHeaders();
      const res = await apiClient.get(`/store/landing/${product.id}`, { headers });
      setLandingCfg(res.data);
      setLandingDialog(product);
    } catch (e) {
      toast.error(language === 'ar' ? 'تعذر تحميل إعدادات صفحة الهبوط' : 'Erreur');
    }
  };

  const saveLanding = async () => {
    if (!landingDialog || !landingCfg) return;
    setLandingSaving(true);
    try {
      const headers = getAuthHeaders();
      const payload = {
        enabled: !!landingCfg.enabled,
        headline: landingCfg.headline || '',
        offer_text: landingCfg.offer_text || '',
        video_url: landingCfg.video_url || '',
        old_price: Number(landingCfg.old_price) || 0,
        fb_pixel_id: landingCfg.fb_pixel_id || '',
        tiktok_pixel_id: landingCfg.tiktok_pixel_id || '',
      };
      await apiClient.put(`/store/landing/${landingDialog.id}`, payload, { headers });
      toast.success(language === 'ar' ? 'تم حفظ صفحة الهبوط' : 'Sauvegardé');
      setLandingDialog(null);
    } catch (e) {
      toast.error(language === 'ar' ? 'فشل الحفظ' : 'Erreur');
    } finally {
      setLandingSaving(false);
    }
  };

  const aiGenerateLanding = async () => {  // p110
    if (!landingDialog) return;
    setLandingAi(true);
    try {
      const headers = getAuthHeaders();
      const r = await apiClient.post(`/store/landing/${landingDialog.id}/ai-generate`, {}, { headers });
      setLandingCfg({ ...landingCfg, headline: r.data.headline, offer_text: r.data.offer_text, old_price: r.data.old_price });
      toast.success(language === 'ar' ? '✨ وُلّد المحتوى — راجعه ثم احفظ' : 'Généré');
    } catch (e) {
      toast.error(e?.response?.data?.detail || (language === 'ar' ? 'فشل التوليد' : 'Erreur'));
    } finally { setLandingAi(false); }
  };

  const landingUrl = () => {
    if (!landingDialog) return '';
    const base = window.location.origin;
    const slug = storeSettings?.store_slug || '';
    return `${base}/shop/${slug}/lp/${landingDialog.id}`;
  };

  const toggleProductInStore = async (productId, add) => {
    try {
      const token = localStorage.getItem('token');
      if (add) {
        await apiClient.post(`/store/products`, { product_id: productId });
        setSelectedProducts(prev => [...prev, productId]);
        toast.success(language === 'ar' ? 'تمت إضافة المنتج للمتجر' : 'Product added to store');
      } else {
        await apiClient.delete(`/store/products/${productId}`);
        setSelectedProducts(prev => prev.filter(id => id !== productId));
        toast.success(language === 'ar' ? 'تمت إزالة المنتج من المتجر' : 'Product removed from store');
      }
    } catch (error) {
      toast.error(language === 'ar' ? 'حدث خطأ' : 'An error occurred');
    }
  };

  const updateOrderStatus = async (orderId, status) => {
    try {
      await apiClient.put(`/store/orders/${orderId}/status`, { status });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      fetchOrdersOnly();
      toast.success(language === 'ar' ? 'تم تحديث حالة الطلب' : 'Order status updated');
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل تحديث الحالة' : 'Failed to update status');
    }
  };

  const generateSlug = (name) => {
    return name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const copyStoreUrl = () => {
    navigator.clipboard.writeText(storeUrl);
    toast.success(language === 'ar' ? 'تم نسخ الرابط' : 'URL copied');
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      pending: { label: language === 'ar' ? 'قيد الانتظار' : 'Pending', color: 'bg-yellow-100 text-yellow-800' },
      confirmed: { label: language === 'ar' ? 'مؤكد' : 'Confirmed', color: 'bg-blue-100 text-blue-800' },
      processing: { label: language === 'ar' ? 'قيد المعالجة' : 'Processing', color: 'bg-purple-100 text-purple-800' },
      shipped: { label: language === 'ar' ? 'تم الشحن' : 'Shipped', color: 'bg-indigo-100 text-indigo-800' },
      delivered: { label: language === 'ar' ? 'تم التوصيل' : 'Delivered', color: 'bg-green-100 text-green-800' },
      cancelled: { label: language === 'ar' ? 'ملغي' : 'Cancelled', color: 'bg-red-100 text-red-800' }
    };
    const s = statusMap[status] || statusMap.pending;
    return <Badge className={s.color}>{s.label}</Badge>;
  };

  return (
    <>
      <div className="space-y-6" data-testid="store-management-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Store className="h-6 w-6 text-primary" />
              {language === 'ar' ? 'المتجر الإلكتروني' : 'Online Store'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {language === 'ar' 
                ? (storeSettings.enabled ? 'إدارة متجرك الإلكتروني والطلبات' : 'أنشئ متجرك الإلكتروني وابدأ البيع')
                : (storeSettings.enabled ? 'Manage your online store and orders' : 'Create your online store and start selling')}
            </p>
          </div>

          {storeSettings.enabled && storeUrl && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <code className="text-sm">{storeUrl}</code>
              </div>
              <Button variant="outline" size="icon" onClick={copyStoreUrl}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => window.open(storeUrl, '_blank')}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              {language === 'ar' ? 'الإعدادات' : 'Settings'}
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2">
              <Package className="h-4 w-4" />
              {language === 'ar' ? 'المنتجات' : 'Products'}
              {selectedProducts.length > 0 && (
                <Badge variant="secondary">{selectedProducts.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              {language === 'ar' ? 'الطلبات' : 'Orders'}
              {orders.filter(o => o.status === 'pending').length > 0 && (
                <Badge variant="destructive">{orders.filter(o => o.status === 'pending').length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            {/* Enable/Disable Store */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Store className={`h-6 w-6 ${storeSettings.enabled ? 'text-green-600' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="font-medium">
                        {language === 'ar' ? 'تفعيل المتجر الإلكتروني' : 'Enable Online Store'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' 
                          ? 'السماح للزبائن بالطلب عبر الإنترنت'
                          : 'Allow customers to order online'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={storeSettings.enabled}
                    onCheckedChange={(checked) => setStoreSettings(prev => ({ ...prev, enabled: checked }))}
                    data-testid="toggle-store"
                  />
                </div>
              </CardContent>
            </Card>

            {storeSettings.enabled && (
              <>
                {/* Basic Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <LayoutIcon className="h-5 w-5" />
                      {language === 'ar' ? 'المعلومات الأساسية' : 'Basic Information'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{language === 'ar' ? 'اسم المتجر' : 'Store Name'}</Label>
                        <Input
                          value={storeSettings.store_name}
                          onChange={(e) => {
                            const name = e.target.value;
                            setStoreSettings(prev => ({ 
                              ...prev, 
                              store_name: name,
                              store_slug: generateSlug(name)
                            }));
                          }}
                          placeholder={language === 'ar' ? 'اسم متجرك' : 'Your store name'}
                          data-testid="store-name-input"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{language === 'ar' ? 'رابط المتجر' : 'Store URL'}</Label>
                        <div className="flex gap-2">
                          <Input
                            value={storeSettings.store_slug}
                            onChange={(e) => setStoreSettings(prev => ({ ...prev, store_slug: e.target.value }))}
                            dir="ltr"
                            className="font-mono"
                            data-testid="store-slug-input"
                          />
                          <button
                            onClick={async () => {
                              if (!storeSettings.store_slug || storeSettings.store_slug.length < 3) {
                                toast.error('Slug يجب أن يكون 3 أحرف على الأقل');
                                return;
                              }
                              try {
                                const res = await apiClient.get(`/store/check-slug?slug=${storeSettings.store_slug}`);
                                if (res.data.available) {
                                  toast.success('الرابط متاح!');
                                } else {
                                  toast.error('الرابط مستخدم، جرب اسماً آخر');
                                }
                              } catch (e) {
                                toast.error('فشل التحقق');
                              }
                            }}
                            className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50 mt-2"
                          >
                            التحقق من التوفر
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'وصف المتجر' : 'Store Description'}</Label>
                      <Textarea
                        value={storeSettings.description}
                        onChange={(e) => setStoreSettings(prev => ({ ...prev, description: e.target.value }))}
                        placeholder={language === 'ar' ? 'وصف قصير لمتجرك' : 'Short description of your store'}
                        rows={3}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Design */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Palette className="h-5 w-5" />
                      {language === 'ar' ? 'التصميم' : 'Design'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{language === 'ar' ? 'رابط الشعار' : 'Logo URL'}</Label>
                        <Input
                          value={storeSettings.logo_url}
                          onChange={(e) => setStoreSettings(prev => ({ ...prev, logo_url: e.target.value }))}
                          placeholder="https://..."
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{language === 'ar' ? 'اللون الرئيسي' : 'Primary Color'}</Label>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={storeSettings.primary_color}
                            onChange={(e) => setStoreSettings(prev => ({ ...prev, primary_color: e.target.value }))}
                            className="w-14 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            value={storeSettings.primary_color}
                            onChange={(e) => setStoreSettings(prev => ({ ...prev, primary_color: e.target.value }))}
                            dir="ltr"
                            className="font-mono flex-1"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tracking Pixels — p75 */}
                <Card data-testid="pixels-card">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Megaphone className="h-5 w-5" />
                      {language === 'ar' ? 'بكسلات التتبع (للإعلانات الممولة)' : 'Pixels de suivi'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Facebook Pixel ID</Label>
                      <Input
                        value={storeSettings.fb_pixel_id || ''}
                        onChange={(e) => setStoreSettings(prev => ({ ...prev, fb_pixel_id: e.target.value.trim() }))}
                        placeholder="1234567890123456"
                        dir="ltr"
                        data-testid="fb-pixel-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>TikTok Pixel ID</Label>
                      <Input
                        value={storeSettings.tiktok_pixel_id || ''}
                        onChange={(e) => setStoreSettings(prev => ({ ...prev, tiktok_pixel_id: e.target.value.trim() }))}
                        placeholder="C4AB1C2D3E4F5G6H7I8J"
                        dir="ltr"
                        data-testid="tiktok-pixel-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Facebook Access Token (Conversions API)</Label>
                      <Input
                        type="password"
                        value={storeSettings.fb_access_token || ''}
                        onChange={(e) => setStoreSettings(prev => ({ ...prev, fb_access_token: e.target.value.trim() }))}
                        placeholder="EAA..."
                        dir="ltr"
                        data-testid="fb-token-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>TikTok Access Token (Events API)</Label>
                      <Input
                        type="password"
                        value={storeSettings.tiktok_access_token || ''}
                        onChange={(e) => setStoreSettings(prev => ({ ...prev, tiktok_access_token: e.target.value.trim() }))}
                        placeholder="توكن الأحداث"
                        dir="ltr"
                        data-testid="tiktok-token-input"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      التوكنات تفعّل إرسال الأحداث من الخادم (Conversions API) — أدق ضد حاجب الإعلانات. تُحفظ بسرّية ولا تظهر للزوار.
                    </p>

                    {/* p84: Telegram daily summary */}
                    <div className="border-t pt-3 mt-3 space-y-2" data-testid="telegram-daily-card">
                      <Label className="font-semibold">📊 الملخص اليومي عبر تيليجرام (21:00)</Label>
                      <div className="space-y-2">
                        <Input
                          type="password"
                          value={storeSettings.telegram_bot_token || ''}
                          onChange={(e) => setStoreSettings(prev => ({ ...prev, telegram_bot_token: e.target.value.trim() }))}
                          placeholder="توكن البوت (من BotFather)"
                          dir="ltr"
                          data-testid="tg-token-input"
                        />
                        <Input
                          value={storeSettings.telegram_chat_id || ''}
                          onChange={(e) => setStoreSettings(prev => ({ ...prev, telegram_chat_id: e.target.value.trim() }))}
                          placeholder="معرف المحادثة (Chat ID)"
                          dir="ltr"
                          data-testid="tg-chat-input"
                        />
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!storeSettings.telegram_daily_enabled}
                              onChange={(e) => setStoreSettings(prev => ({ ...prev, telegram_daily_enabled: e.target.checked }))}
                              data-testid="tg-enabled-toggle"
                            />
                            تفعيل الملخص اليومي
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!storeSettings.telegram_notify_new_order}
                              onChange={(e) => setStoreSettings(prev => ({ ...prev, telegram_notify_new_order: e.target.checked }))}
                              data-testid="tg-instant-toggle"
                            />
                            إشعار فوري عند كل طلب جديد
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!storeSettings.wa_confirm_enabled}
                              onChange={(e) => setStoreSettings(prev => ({ ...prev, wa_confirm_enabled: e.target.checked }))}
                              data-testid="wa-confirm-toggle"
                            />
                            تأكيد طلبات المتجر تلقائياً عبر واتساب قبل الشحن
                          </label>
                          <Button type="button" size="sm" variant="outline" onClick={testTelegram} disabled={tgTesting} data-testid="tg-test-btn">
                            {tgTesting ? '...' : 'إرسال اختبار'}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          أنشئ بوتاً من @BotFather، أرسل له أي رسالة، ثم احفظ التوكن والمعرف هنا واضغط حفظ — يصلك كل مساء: طلبات اليوم والمُسلَّم والمُرجع وصافي الربح. تأكيد واتساب يتطلب تكامل واتساب مضبوطاً (مركز التجارة ← القنوات) — يصل الزبون رسالة «رد بـ 1 للتأكيد أو 2 للإلغاء» ويُحجز الطلب حتى يرد.
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {language === 'ar'
                        ? 'تُفعَّل تلقائياً في متجرك العام: مشاهدة المنتج (ViewContent)، الإضافة للسلة، بدء الطلب، وإتمام الشراء (Purchase).'
                        : 'Activés automatiquement sur la boutique: ViewContent, AddToCart, InitiateCheckout, Purchase.'}
                    </p>
                  </CardContent>
                </Card>

                {/* Contact */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Phone className="h-5 w-5" />
                      {language === 'ar' ? 'معلومات التواصل' : 'Contact Information'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}</Label>
                        <Input
                          value={storeSettings.contact_phone}
                          onChange={(e) => setStoreSettings(prev => ({ ...prev, contact_phone: e.target.value }))}
                          placeholder="0555 123 456"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{language === 'ar' ? 'ساعات العمل' : 'Working Hours'}</Label>
                        <Input
                          value={storeSettings.working_hours}
                          onChange={(e) => setStoreSettings(prev => ({ ...prev, working_hours: e.target.value }))}
                          placeholder="09:00 - 18:00"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{language === 'ar' ? 'العنوان' : 'Address'}</Label>
                      <Input
                        value={storeSettings.contact_address}
                        onChange={(e) => setStoreSettings(prev => ({ ...prev, contact_address: e.target.value }))}
                        placeholder={language === 'ar' ? 'عنوان متجرك' : 'Your store address'}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Delivery & Payment */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      {language === 'ar' ? 'التوصيل والدفع' : 'Delivery & Payment'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* COD */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Banknote className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium">{language === 'ar' ? 'الدفع عند الاستلام' : 'Cash on Delivery'}</p>
                          <p className="text-xs text-muted-foreground">
                            {language === 'ar' ? 'السماح للزبائن بالدفع عند التوصيل' : 'Allow customers to pay on delivery'}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={storeSettings.cod_enabled}
                        onCheckedChange={(checked) => setStoreSettings(prev => ({ ...prev, cod_enabled: checked }))}
                      />
                    </div>

                    {/* Delivery */}
                    <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Truck className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="font-medium">{language === 'ar' ? 'تفعيل التوصيل' : 'Enable Delivery'}</p>
                          <p className="text-xs text-muted-foreground">
                            {language === 'ar' ? 'توصيل الطلبات للزبائن' : 'Deliver orders to customers'}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={storeSettings.delivery_enabled}
                        onCheckedChange={(checked) => setStoreSettings(prev => ({ ...prev, delivery_enabled: checked }))}
                      />
                    </div>

                    {storeSettings.delivery_enabled && (
                      <div className="grid grid-cols-3 gap-4 pt-2">
                        <div className="space-y-2">
                          <Label>{language === 'ar' ? 'رسوم التوصيل' : 'Delivery Fee'}</Label>
                          <Input
                            type="number"
                            value={storeSettings.delivery_fee}
                            onChange={(e) => setStoreSettings(prev => ({ ...prev, delivery_fee: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{language === 'ar' ? 'التوصيل المجاني من' : 'Free Delivery From'}</Label>
                          <Input
                            type="number"
                            value={storeSettings.free_delivery_threshold}
                            onChange={(e) => setStoreSettings(prev => ({ ...prev, free_delivery_threshold: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{language === 'ar' ? 'الحد الأدنى للطلب' : 'Min. Order Amount'}</Label>
                          <Input
                            type="number"
                            value={storeSettings.min_order_amount}
                            onChange={(e) => setStoreSettings(prev => ({ ...prev, min_order_amount: parseFloat(e.target.value) || 0 }))}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button onClick={saveStoreSettings} disabled={saving} className="gap-2" data-testid="save-store-settings">
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {language === 'ar' ? 'حفظ الإعدادات' : 'Save Settings'}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{language === 'ar' ? 'منتجات المتجر' : 'Store Products'}</span>
                  <Badge variant="secondary">{selectedProducts.length} / {products.length}</Badge>
                </CardTitle>
                <CardDescription>
                  {language === 'ar' 
                    ? 'اختر المنتجات التي ستظهر في متجرك الإلكتروني'
                    : 'Select products to display in your online store'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">{language === 'ar' ? 'عرض' : 'Show'}</TableHead>
                        <TableHead>{language === 'ar' ? 'المنتج' : 'Product'}</TableHead>
                        <TableHead>{language === 'ar' ? 'السعر' : 'Price'}</TableHead>
                        <TableHead>{language === 'ar' ? 'المخزون' : 'Stock'}</TableHead>
                        <TableHead>{language === 'ar' ? 'صفحة هبوط' : 'Landing'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map(product => {
                        const isSelected = selectedProducts.includes(product.id);
                        return (
                          <TableRow key={product.id} className={isSelected ? 'bg-green-50 dark:bg-green-900/10' : ''}>
                            <TableCell>
                              <Switch
                                checked={isSelected}
                                onCheckedChange={(checked) => toggleProductInStore(product.id, checked)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                                  {product.image_url ? (
                                    <img src={product.image_url} alt="" className="w-full h-full object-cover rounded" />
                                  ) : (
                                    <Package className="h-5 w-5 text-muted-foreground" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium">{language === 'ar' ? product.name_ar : product.name_en}</p>
                                  <p className="text-xs text-muted-foreground">{product.barcode}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{product.retail_price} {language === 'ar' ? 'دج' : 'DZD'}</TableCell>
                            <TableCell>
                              <Badge variant={product.quantity > 10 ? 'default' : product.quantity > 0 ? 'warning' : 'destructive'}>
                                {product.quantity}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {isSelected && (
                                <Button size="sm" variant="outline" className="gap-1" data-testid="landing-config-btn" onClick={() => openLanding(product)}>
                                  <Globe className="h-4 w-4" />
                                  {language === 'ar' ? 'صفحة هبوط' : 'LP'}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* p82: landing page config dialog */}
      <Dialog open={!!landingDialog} onOpenChange={(o) => !o && setLandingDialog(null)}>
        <DialogContent className="max-w-lg" data-testid="landing-dialog">
          <DialogHeader>
            <DialogTitle>{language === 'ar' ? `صفحة هبوط: ${landingDialog ? (language === 'ar' ? landingDialog.name_ar : landingDialog.name_en) : ''}` : 'Landing page'}</DialogTitle>
          </DialogHeader>
          {landingCfg && (
            <div className="space-y-4">
              <Button type="button" variant="outline" className="w-full" onClick={aiGenerateLanding} disabled={landingAi} data-testid="lp-ai-generate-btn">
                {landingAi ? (language === 'ar' ? '⏳ يولّد المحتوى...' : '...') : (language === 'ar' ? '✨ ولّد العنوان والعرض بالذكاء الاصطناعي' : '✨ Générer par IA')}
              </Button>
              <div className="flex items-center justify-between border rounded-lg p-3">
                <Label>{language === 'ar' ? 'تفعيل صفحة الهبوط' : 'Enable'}</Label>
                <Switch data-testid="lp-enabled-toggle" checked={!!landingCfg.enabled} onCheckedChange={(v) => setLandingCfg({ ...landingCfg, enabled: v })} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'العنوان الرئيسي (اختياري — افتراضياً اسم المنتج)' : 'Headline'}</Label>
                <Input data-testid="lp-headline-input" value={landingCfg.headline || ''} onChange={(e) => setLandingCfg({ ...landingCfg, headline: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'نص العرض (مثال: توصيل مجاني اليوم فقط)' : 'Offer text'}</Label>
                <Input data-testid="lp-offer-input" value={landingCfg.offer_text || ''} onChange={(e) => setLandingCfg({ ...landingCfg, offer_text: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'رابط فيديو (يوتيوب أو mp4)' : 'Video URL'}</Label>
                <Input data-testid="lp-video-input" dir="ltr" value={landingCfg.video_url || ''} onChange={(e) => setLandingCfg({ ...landingCfg, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'السعر قبل التخفيض (0 = إخفاء)' : 'Old price'}</Label>
                <Input data-testid="lp-oldprice-input" type="number" dir="ltr" value={landingCfg.old_price || 0} onChange={(e) => setLandingCfg({ ...landingCfg, old_price: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'بكسل فيسبوك خاص (اختياري)' : 'FB Pixel'}</Label>
                  <Input data-testid="lp-fbpixel-input" dir="ltr" value={landingCfg.fb_pixel_id || ''} onChange={(e) => setLandingCfg({ ...landingCfg, fb_pixel_id: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'بكسل تيك توك خاص (اختياري)' : 'TikTok Pixel'}</Label>
                  <Input data-testid="lp-ttpixel-input" dir="ltr" value={landingCfg.tiktok_pixel_id || ''} onChange={(e) => setLandingCfg({ ...landingCfg, tiktok_pixel_id: e.target.value })} />
                </div>
              </div>
              {landingCfg.enabled && (
                <div className="flex items-center gap-2 border rounded-lg p-2 bg-muted/50">
                  <Input readOnly dir="ltr" className="text-xs" value={landingUrl()} data-testid="lp-url" />
                  <Button size="sm" variant="outline" data-testid="lp-copy-btn" onClick={() => { navigator.clipboard.writeText(landingUrl()); toast.success(language === 'ar' ? 'تم النسخ' : 'Copié'); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <Button className="w-full" data-testid="lp-save-btn" disabled={landingSaving} onClick={saveLanding}>
                <Save className="h-4 w-4 ml-2" />
                {landingSaving ? (language === 'ar' ? 'جارٍ الحفظ...' : '...') : (language === 'ar' ? 'حفظ' : 'Save')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-6">
      {/* p83: abandoned carts */}
      {cartLeads.length > 0 && (
        <Card className="mb-4" data-testid="abandoned-carts-card">
          <CardHeader>
            <CardTitle>{language === 'ar' ? `🛒 سلات مهجورة (${cartLeads.length}) — بدأوا الطلب ولم يكملوه${cartRecovered > 0 ? ` · ✅ استُرجعت ${cartRecovered}` : ''}` : 'Paniers abandonnés'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cartLeads.slice(0, 10).map(l => (
                <div key={l.id} className="flex items-center justify-between border rounded-lg p-2 text-sm" data-testid="cart-lead-row">
                  <div>
                    <a href={`tel:${l.phone}`} className="font-semibold text-emerald-700 underline" dir="ltr">{l.phone}</a>
                    {l.name && <span className="mr-2 text-muted-foreground">{l.name}</span>}
                    <div className="text-xs text-muted-foreground">
                      {(l.items || []).map(i => `${i.name}×${i.quantity}`).join('، ')}
                    </div>
                  </div>
                  <div className="text-left space-y-1">
                    <div className="font-semibold">{Number(l.total || 0).toLocaleString()} {language === 'ar' ? 'دج' : 'DZD'}</div>
                    <div className="text-xs text-muted-foreground">{l.last_seen ? new Date(l.last_seen).toLocaleString('ar-DZ') : ''}</div>
                    {l.reminder_sent && <div className="text-xs text-emerald-700" data-testid="cart-reminded-badge">{language === 'ar' ? '✓ ذُكّر تلقائياً' : 'Relancé'}</div>}
                    <a
                      href={`https://wa.me/${String(l.phone || '').replace(/\D/g, '').replace(/^0+/, '213')}?text=${encodeURIComponent(`مرحباً ${l.name || ''} 👋 لاحظنا اهتمامك بـ ${(l.items || []).map(i => i.name).join('، ')} — سلتك بقيمة ${Number(l.total || 0).toLocaleString()} دج بانتظارك. هل تريد إتمام طلبك؟`)}`}
                      target="_blank" rel="noreferrer"
                    >
                      <Button size="sm" variant="outline" className="h-7 text-xs mt-1" data-testid="cart-wa-btn">{language === 'ar' ? '💬 ذكّره واتساب' : 'WhatsApp'}</Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{language === 'ar' ? 'الطلبات' : 'Orders'}</span>
                  <Button variant="outline" size="sm" onClick={fetchData}>
                    <RefreshCw className="h-4 w-4 me-2" />
                    {language === 'ar' ? 'تحديث' : 'Refresh'}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>{language === 'ar' ? 'لا توجد طلبات بعد' : 'No orders yet'}</p>
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{language === 'ar' ? 'رقم الطلب' : 'Order #'}</TableHead>
                          <TableHead>{language === 'ar' ? 'الزبون' : 'Customer'}</TableHead>
                          <TableHead>{language === 'ar' ? 'الإجمالي' : 'Total'}</TableHead>
                          <TableHead>{language === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                          <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                          <TableHead>{language === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map(order => (
                          <TableRow key={order.id}>
                            <TableCell className="font-mono">{order.order_number}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{order.customer_name}</p>
                                <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold">{order.total} {language === 'ar' ? 'دج' : 'DZD'}</TableCell>
                            <TableCell>{getStatusBadge(order.status)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(order.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <Select 
                                value={order.status} 
                                onValueChange={(status) => updateOrderStatus(order.id, status)}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">{language === 'ar' ? 'قيد الانتظار' : 'Pending'}</SelectItem>
                                  <SelectItem value="confirmed">{language === 'ar' ? 'مؤكد' : 'Confirmed'}</SelectItem>
                                  <SelectItem value="processing">{language === 'ar' ? 'قيد المعالجة' : 'Processing'}</SelectItem>
                                  <SelectItem value="shipped">{language === 'ar' ? 'تم الشحن' : 'Shipped'}</SelectItem>
                                  <SelectItem value="delivered">{language === 'ar' ? 'تم التوصيل' : 'Delivered'}</SelectItem>
                                  <SelectItem value="cancelled">{language === 'ar' ? 'ملغي' : 'Cancelled'}</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
