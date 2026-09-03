// p310: خريطة الطاولات البصرية — حالة حية لكل طاولة مع طلبها النشط
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { errText } from '../lib/errorText';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';  // p336
import { UtensilsCrossed, Plus, Trash2, Clock, RefreshCw, QrCode, Copy, Share2, Banknote, CalendarClock, Percent } from 'lucide-react';  // p334+p336+p337
import { QRCodeCanvas } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { startRealtime, onEvent, stopRealtime } from '../lib/realtime';

// p334: حقول روابط التواصل الاجتماعي
const SOCIAL_FIELDS = [
  { key: 'instagram', labelAr: 'رابط إنستغرام https://…', labelFr: 'Instagram https://…' },
  { key: 'facebook', labelAr: 'رابط فيسبوك https://…', labelFr: 'Facebook https://…' },
  { key: 'tiktok', labelAr: 'رابط تيك توك https://…', labelFr: 'TikTok https://…' },
  { key: 'google_maps', labelAr: 'رابط التقييم على خرائط جوجل https://…', labelFr: 'Google Maps https://…' },
  { key: 'whatsapp', labelAr: 'رابط واتساب https://wa.me/…', labelFr: 'WhatsApp https://wa.me/…' },
  { key: 'website', labelAr: 'موقعك الإلكتروني https://…', labelFr: 'Site web https://…' },
];

const elapsedMin = (iso) => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
};

export default function TablesMapPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { user } = useAuth();
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selTable, setSelTable] = useState(null);
  const [tName, setTName] = useState('');
  const [tSeats, setTSeats] = useState('4');
  const [tZone, setTZone] = useState('');
  const [, setTick] = useState(0);
  const [social, setSocial] = useState({ instagram: '', facebook: '', tiktok: '', google_maps: '', whatsapp: '', website: '' });  // p334
  const [savingSocial, setSavingSocial] = useState(false);  // p334
  const [payMode, setPayMode] = useState('postpaid');  // p336
  const [kiosk, setKiosk] = useState({ enabled: false, counter_name: 'كشك', require_phone: false });  // p360
  const [savingKiosk, setSavingKiosk] = useState(false);  // p360
  // p337: خصومات + طلبيات مجدولة
  const [schedList, setSchedList] = useState([]);
  const [schedDlg, setSchedDlg] = useState(false);
  const [schedWhen, setSchedWhen] = useState('');
  const [schedRemind, setSchedRemind] = useState('1');
  const [schedPhone, setSchedPhone] = useState('');
  const [schedNotes, setSchedNotes] = useState('');
  const [schedItems, setSchedItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [prodSearch, setProdSearch] = useState('');
  const [discType, setDiscType] = useState('percent');
  const [discValue, setDiscValue] = useState('');
  const [discCode, setDiscCode] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [t, o, sc] = await Promise.all([
        apiClient.get('/restaurant/tables'),
        apiClient.get('/restaurant/kitchen-orders?all=1'),  // p336: نرى طلبات «بانتظار الدفع» أيضًا
        apiClient.get('/restaurant/scheduled-orders').catch(() => ({ data: [] })),  // p337
      ]);
      setTables(t.data || []);
      setOrders((o.data || []).filter(x => x.status !== 'served' && x.status !== 'cancelled'));
      setSchedList(sc.data || []);  // p337
    } catch (e) { /* جلب دوري صامت */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    startRealtime();
    const un1 = onEvent('kitchen_order.created', fetchAll);
    const un2 = onEvent('kitchen_order.updated', fetchAll);
    const poll = setInterval(fetchAll, 15000);
    const tick = setInterval(() => setTick(x => x + 1), 30000);
    return () => { un1 && un1(); un2 && un2(); clearInterval(poll); clearInterval(tick); stopRealtime(); };
  }, [fetchAll]);

  // p334: تحميل/حفظ روابط التواصل
  useEffect(() => {
    apiClient.get('/restaurant/settings/social').then(r => setSocial(prev => ({ ...prev, ...(r.data || {}) }))).catch(() => {});
    apiClient.get('/restaurant/settings/orders').then(r => setPayMode(r.data?.payment_mode || 'postpaid')).catch(() => {});  // p336
    apiClient.get('/restaurant/settings/kiosk').then(r => setKiosk(prev => ({ ...prev, ...(r.data || {}) }))).catch(() => {});  // p360
  }, []);

  const saveSocial = async () => {
    setSavingSocial(true);
    try {
      await apiClient.put('/restaurant/settings/social', social);
      toast.success(isAr ? 'حُفظت الروابط — ستظهر للزبائن في صفحة الطلب' : 'Liens enregistres');
    } catch (e) { toast.error(errText(e)); }
    finally { setSavingSocial(false); }
  };

  // p336: حفظ نمط الدفع
  const savePayMode = async (v) => {
    try {
      await apiClient.put('/restaurant/settings/orders', { payment_mode: v });
      setPayMode(v);
      toast.success(isAr
        ? (v === 'prepaid' ? 'الدفع المسبق مفعّل — الطلبات الجديدة لا تدخل المطبخ إلا بعد تأكيد الدفع' : 'الدفع بعد التسليم — الطلبات تدخل المطبخ فورًا')
        : 'Mode enregistre');
    } catch (e) { toast.error(errText(e)); }
  };

  // p360: حفظ إعدادات الكشك الذاتي
  const saveKiosk = async (patch) => {
    const next = { ...kiosk, ...patch };
    setKiosk(next);
    setSavingKiosk(true);
    try {
      await apiClient.put('/restaurant/settings/kiosk', next);
      toast.success(isAr ? (next.enabled ? 'الكشك مفعّل — افتح الرابط على شاشة المحل' : 'الكشك موقوف') : 'Kiosque enregistre');
    } catch (e) { toast.error(errText(e)); }
    finally { setSavingKiosk(false); }
  };

  // p336: تأكيد دفع طلب (كاش) من خريطة الطاولات
  const payOrder = async (oid) => {
    try {
      await apiClient.post(`/restaurant/kitchen-orders/${oid}/pay`, { method: 'cash' });
      toast.success(isAr ? 'أُكّد الدفع — الطلب في المطبخ الآن' : 'Paiement confirme');
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  // p337: خصم على الطلب النشط — نسبة/مبلغ مباشر أو كوبون
  const applyDiscount = async (oid) => {
    try {
      const body = discCode.trim()
        ? { code: discCode.trim() }
        : { type: discType, value: Number(discValue) };
      await apiClient.post(`/restaurant/kitchen-orders/${oid}/discount`, body);
      toast.success(isAr ? 'طُبّق الخصم' : 'Remise appliquee');
      setDiscCode(''); setDiscValue('');
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };
  const removeDiscount = async (oid) => {
    try {
      await apiClient.delete(`/restaurant/kitchen-orders/${oid}/discount`);
      toast.success(isAr ? 'أُزيل الخصم' : 'Remise retiree');
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  // p337: الطلبيات المجدولة — إرسال للمطبخ + تسجيل طلبية جديدة
  const activateSched = async (oid) => {
    try {
      await apiClient.post(`/restaurant/scheduled-orders/${oid}/activate`);
      toast.success(isAr ? 'دخلت المطبخ الآن' : 'Envoyee en cuisine');
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };
  const loadProducts = async () => {
    if (products.length) return;
    try {
      const { data } = await apiClient.get('/products?limit=1000');
      setProducts((data?.items || data || []).filter(p => Number(p.retail_price) > 0 && p.is_active !== false));
    } catch (e) { /* صامت */ }
  };
  const addSchedItem = (p) => {
    setSchedItems(prev => {
      const ex = prev.find(x => x.product_id === p.id);
      if (ex) return prev.map(x => x.product_id === p.id ? { ...x, quantity: x.quantity + 1 } : x);
      return [...prev, { product_id: p.id, product_name: p.name_ar || p.name, quantity: 1, unit_price: Number(p.retail_price) || 0 }];
    });
  };
  const submitSched = async () => {
    if (!schedWhen) { toast.error(isAr ? 'حدد موعد التجهيز' : 'Date requise'); return; }
    if (!schedItems.length) { toast.error(isAr ? 'أضف صنفًا واحدًا على الأقل' : 'Ajoutez un article'); return; }
    try {
      await apiClient.post('/restaurant/kitchen-orders', {
        items: schedItems,
        scheduled_for: new Date(schedWhen).toISOString(),
        remind_days: Number(schedRemind),
        customer_phone: schedPhone.trim() || null,
        notes: schedNotes.trim() || null,
        source: 'pos',
      });
      toast.success(isAr ? 'سُجّلت الطلبية المجدولة' : 'Commande planifiee');
      setSchedDlg(false); setSchedItems([]); setSchedWhen(''); setSchedPhone(''); setSchedNotes('');
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const addTable = async () => {
    if (!tName.trim()) { toast.error(isAr ? 'اسم الطاولة مطلوب' : 'Nom requis'); return; }
    try {
      await apiClient.post('/restaurant/tables', { name: tName.trim(), seats: parseInt(tSeats) || 4, zone: tZone.trim() || null });
      toast.success(isAr ? 'أُضيفت الطاولة' : 'Table ajoutee');
      setTName(''); setTSeats('4'); setTZone('');
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const deleteTable = async (t) => {
    try {
      await apiClient.delete(`/restaurant/tables/${t.id}`);
      toast.success(isAr ? 'حُذفت الطاولة' : 'Table supprimee');
      setSelTable(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const checkout = async (t) => {
    try {
      await apiClient.post(`/restaurant/tables/${t.id}/checkout`, {});
      toast.success(isAr ? 'حُرّرت الطاولة' : 'Table liberee');
      setSelTable(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const activeOrder = (t) => orders.find(o => o.id === t.active_order_id);
  const zones = [...new Set(tables.map(t => t.zone).filter(Boolean))];
  const zoneOf = (z) => tables.filter(t => (t.zone || '') === z);
  const groups = zones.length ? [...zones.map(z => ({ z, list: zoneOf(z) })), { z: '', list: zoneOf('') }].filter(g => g.list.length)
    : [{ z: '', list: tables }];

  return (
    <Layout>
      <div className="p-4 space-y-4" dir="rtl" data-testid="tables-map-page">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="h-7 w-7" /> {isAr ? 'خريطة الطاولات' : 'Plan des tables'}
          </h1>
          <Button variant="outline" size="sm" onClick={fetchAll} data-testid="tables-refresh">
            <RefreshCw className="h-4 w-4 ml-1" /> {isAr ? 'تحديث' : 'Rafraichir'}
          </Button>
        </div>

        <Card>
          <CardContent className="p-3 flex flex-wrap gap-2 items-center">
            <Input value={tName} onChange={e => setTName(e.target.value)} placeholder={isAr ? 'اسم الطاولة (T1)' : 'Nom'} className="w-40" data-testid="table-add-name" />
            <Input value={tSeats} onChange={e => setTSeats(e.target.value)} type="number" min="1" className="w-20" dir="ltr" title={isAr ? 'المقاعد' : 'Places'} data-testid="table-add-seats" />
            <Input value={tZone} onChange={e => setTZone(e.target.value)} placeholder={isAr ? 'المنطقة (اختياري)' : 'Zone'} className="w-32" data-testid="table-add-zone" />
            <Button onClick={addTable} data-testid="table-add-btn"><Plus className="h-4 w-4 ml-1" />{isAr ? 'إضافة طاولة' : 'Ajouter'}</Button>
          </CardContent>
        </Card>

        {/* p334: روابط التواصل الاجتماعي — تظهر للزبون في صفحة QR مع زر مشاركة الطاولة */}
        <Card data-testid="social-links-card">
          <CardContent className="p-3 space-y-2">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Share2 className="h-4 w-4" />{isAr ? 'روابط التواصل الاجتماعي (تظهر للزبون في صفحة الطلب)' : 'Reseaux sociaux'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {SOCIAL_FIELDS.map(f => (
                <Input key={f.key} value={social[f.key]} onChange={e => setSocial(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={isAr ? f.labelAr : f.labelFr} className="h-9 text-sm" dir="ltr" data-testid={`social-${f.key}`} />
              ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button size="sm" onClick={saveSocial} disabled={savingSocial} data-testid="social-save">{isAr ? 'حفظ الروابط' : 'Enregistrer'}</Button>
              <p className="text-[11px] text-muted-foreground">
                {isAr ? 'عند حفظ أي رابط يظهر للزبون قسم «تابعنا وقيّمنا» + زر «شارك الطاولة مع أصدقائك» — طلبات الأصدقاء تجتمع تلقائيًا على نفس الطاولة' : ''}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* p336: نمط الدفع — مسبق أو بعد التسليم */}
        <Card data-testid="order-settings-card">
          <CardContent className="p-3 flex flex-wrap items-center gap-3">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4" />{isAr ? 'نمط الدفع للطلبات' : 'Mode de paiement'}
            </h2>
            <Select value={payMode} onValueChange={savePayMode}>
              <SelectTrigger className="w-full sm:w-96" data-testid="payment-mode-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="postpaid" data-testid="payment-mode-postpaid">{isAr ? 'الدفع بعد التسليم — الطلب يدخل المطبخ فورًا' : 'Paiement apres livraison'}</SelectItem>
                <SelectItem value="prepaid" data-testid="payment-mode-prepaid">{isAr ? 'الدفع مسبقًا — لا يدخل المطبخ إلا بعد تأكيد الدفع' : 'Paiement anticipe'}</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* p360: الكشك الذاتي — الزبون يطلب من شاشة المحل */}
        <Card data-testid="kiosk-settings-card">
          <CardContent className="p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <QrCode className="h-4 w-4" />{isAr ? 'الكشك الذاتي (الزبون يطلب من شاشة المحل)' : 'Kiosque libre-service'}
              </h2>
              <Button size="sm" variant={kiosk.enabled ? 'default' : 'outline'} disabled={savingKiosk}
                onClick={() => saveKiosk({ enabled: !kiosk.enabled })} data-testid="kiosk-toggle">
                {kiosk.enabled ? (isAr ? 'مفعّل — اضغط للإيقاف' : 'Actif') : (isAr ? 'موقوف — اضغط للتفعيل' : 'Inactif')}
              </Button>
              <Input value={kiosk.counter_name || ''} onChange={e => setKiosk(prev => ({ ...prev, counter_name: e.target.value }))}
                onBlur={() => saveKiosk({})} placeholder={isAr ? 'اسم الكشك (كشك 1…)' : 'Nom'} className="h-9 text-sm w-40" data-testid="kiosk-counter-name" />
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={!!kiosk.require_phone} onChange={e => saveKiosk({ require_phone: e.target.checked })} data-testid="kiosk-require-phone" />
                {isAr ? 'الهاتف إجباري' : 'Tel obligatoire'}
              </label>
            </div>
            {kiosk.enabled && (
              <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="kiosk-link-row">
                <span className="text-muted-foreground">{isAr ? 'افتح هذا الرابط بملء الشاشة على جهاز الكونتوار:' : 'Lien:'}</span>
                <code className="bg-muted rounded px-2 py-1 break-all" dir="ltr" data-testid="kiosk-url">{`${window.location.origin}/kiosk/${user?.tenant_id}`}</code>
                <Button size="sm" variant="outline" className="h-7"
                  onClick={() => { try { navigator.clipboard.writeText(`${window.location.origin}/kiosk/${user?.tenant_id}`); toast.success(isAr ? 'نُسخ الرابط' : 'Lien copie'); } catch (e) {} }}
                  data-testid="kiosk-copy">
                  <Copy className="h-3.5 w-3.5 ml-1" />{isAr ? 'نسخ' : 'Copier'}
                </Button>
                <a href={`/kiosk/${user?.tenant_id}`} target="_blank" rel="noopener noreferrer"
                  className="underline text-primary" data-testid="kiosk-open">{isAr ? 'فتح الكشك' : 'Ouvrir'}</a>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              {isAr ? 'طلبات الكشك تدخل شاشة المطبخ فورًا (أو بعد الدفع في النمط المسبق) باسم الكشك بدل الطاولة، ويظهر للزبون رقم طلب كبير' : ''}
            </p>
          </CardContent>
        </Card>

        {/* p337: الطلبيات المجدولة — لوحة قيد التجهيز مرتبة زمنيًا */}
        <Card data-testid="sched-card">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />{isAr ? 'طلبيات مجدولة (قيد التجهيز)' : 'Commandes planifiees'}
              </h2>
              <Button size="sm" variant="outline" data-testid="sched-add" onClick={() => { setSchedDlg(true); loadProducts(); }}>
                <Plus className="h-4 w-4 ml-1" />{isAr ? 'طلبية ليوم محدد' : 'Planifier'}
              </Button>
            </div>
            {schedList.length === 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="sched-empty">{isAr ? 'لا طلبيات مجدولة — سجّل طلبية مناسبة/عرس ليوم محدد وسيذكّرك النظام قبلها بيوم أو ثلاثة' : 'Aucune commande planifiee'}</p>
            ) : (
              <div className="space-y-1">
                {schedList.map(o => (
                  <div key={o.id} className="flex items-center justify-between gap-2 border rounded p-2 text-sm" data-testid={`sched-row-${o.id}`}>
                    <div className="min-w-0">
                      <span className="font-semibold">{o.code}</span>
                      <span className="text-muted-foreground"> — {(o.items || []).length} {isAr ? 'أصناف' : 'articles'} — </span>
                      <span className="font-mono" dir="ltr">{o.total ?? 0}</span>
                      {o.notes ? <div className="text-xs text-amber-700 truncate">{o.notes}</div> : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={o.due_soon ? 'destructive' : 'secondary'} data-testid={`sched-when-${o.id}`}>
                        {o.scheduled_for ? new Date(o.scheduled_for).toLocaleString('fr-DZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => activateSched(o.id)} data-testid={`sched-activate-${o.id}`}>
                        {isAr ? 'أرسل للمطبخ' : 'Cuisine'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {loading ? <p className="text-muted-foreground">{isAr ? 'جارٍ التحميل...' : 'Chargement...'}</p> : (
          groups.map(g => (
            <div key={g.z || '_'} className="space-y-2">
              {g.z ? <h2 className="font-semibold text-sm text-muted-foreground">{g.z}</h2> : null}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {g.list.map(t => {
                  const occ = !!t.active_order_id;
                  const ord = activeOrder(t);
                  const mins = ord ? elapsedMin(ord.created_at) : 0;
                  const late = occ && mins >= 15;
                  return (
                    <Card key={t.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${occ ? (late ? 'border-destructive bg-destructive/5' : 'border-amber-500 bg-amber-50/50') : 'border-emerald-500/50'}`}
                      data-testid={`table-card-${t.id}`}
                      onClick={() => setSelTable(t)}>
                      <CardContent className="p-3 text-center space-y-1">
                        <div className="font-bold text-lg">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.seats} {isAr ? 'مقاعد' : 'places'}</div>
                        <Badge variant={occ ? (late ? 'destructive' : 'secondary') : 'default'}
                          className={occ ? '' : 'bg-emerald-600'}>
                          {occ ? (isAr ? 'مشغولة' : 'Occupee') : (isAr ? 'فارغة' : 'Libre')}
                        </Badge>
                        {ord && (
                          <div className={`text-xs flex items-center justify-center gap-1 ${late ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                            <Clock className="h-3 w-3" /> {mins} {isAr ? 'د' : 'min'}
                          </div>
                        )}
                        {/* p336: حالة الدفع + الإجمالي على البطاقة */}
                        {ord && (
                          <div className="text-xs space-y-0.5">
                            {ord.status === 'pending_payment' || ord.payment_status === 'unpaid'
                              ? <span className="font-bold text-red-600" data-testid={`table-unpaid-${t.id}`}>{isAr ? 'غير مدفوع' : 'Non paye'}</span>
                              : ord.payment_status === 'paid'
                                ? <span className="font-bold text-emerald-600" data-testid={`table-paid-${t.id}`}>{isAr ? 'مدفوع' : 'Paye'}</span>
                                : null}
                            {ord.total > 0 && <div className="font-mono text-muted-foreground" dir="ltr">{ord.total} {isAr ? 'دج' : 'DA'}</div>}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {!loading && tables.length === 0 && (
          <p className="text-center text-muted-foreground py-10">{isAr ? 'لا طاولات بعد — أضف أول طاولة أعلاه' : 'Aucune table'}</p>
        )}

        <Dialog open={!!selTable} onOpenChange={(o) => { if (!o) setSelTable(null); }}>
          <DialogContent className="max-w-sm" data-testid="table-dialog">
            <DialogHeader><DialogTitle>{selTable?.name}</DialogTitle></DialogHeader>
            {selTable && (() => {
              const ord = activeOrder(selTable);
              return (
                <div className="space-y-3">
                  {ord ? (
                    <>
                      <div className="text-sm">
                        <span className="font-semibold">{ord.code}</span>
                        <span className="text-muted-foreground"> — {ord.waiter_name || '-'}</span>
                      </div>
                      <ul className="text-sm space-y-1 border rounded p-2 max-h-48 overflow-y-auto">
                        {(ord.items || []).map((it, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span>{it.product_name}{it.note ? <span className="text-xs text-amber-700"> ({it.note})</span> : null}</span>
                            <span className="font-mono">×{it.quantity}</span>
                          </li>
                        ))}
                      </ul>
                      {/* p336: الفاتورة الموحدة — الإجمالي + حالة الدفع + تأكيد الدفع */}
                      <div className="flex items-center justify-between text-sm border rounded p-2" data-testid="table-bill">
                        <span className="font-bold">{isAr ? 'الإجمالي' : 'Total'}: {ord.discount_amount > 0 ? (
                          <>
                            <span className="font-mono line-through text-muted-foreground text-xs" dir="ltr">{ord.total}</span>{' '}
                            <span className="font-mono text-emerald-700" dir="ltr" data-testid="table-final-total">{ord.final_total} {isAr ? 'دج' : 'DA'}</span>
                          </>
                        ) : (
                          <span className="font-mono" dir="ltr">{ord.total ?? 0} {isAr ? 'دج' : 'DA'}</span>
                        )}</span>
                        {ord.payment_status === 'paid'
                          ? <Badge className="bg-emerald-600">{isAr ? 'مدفوع' : 'Paye'}</Badge>
                          : (ord.payment_status === 'unpaid' || ord.status === 'pending_payment')
                            ? <Badge variant="destructive">{isAr ? 'غير مدفوع' : 'Non paye'}</Badge>
                            : <Badge variant="secondary">{isAr ? 'يُدفع عند الإنهاء' : 'A la cloture'}</Badge>}
                      </div>
                      {/* p337: خصم على الفاتورة — نسبة/مبلغ مباشر أو كود كوبون */}
                      <div className="border rounded p-2 space-y-2" data-testid="table-discount">
                        {ord.discount_amount > 0 ? (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-emerald-700 font-semibold" data-testid="table-disc-applied">
                              {isAr ? 'خصم' : 'Remise'}: <span dir="ltr">{ord.discount?.type === 'percent' ? `${ord.discount.value}%` : `${ord.discount_amount} ${isAr ? 'دج' : 'DA'}`}</span>
                              {ord.discount?.code ? <span className="text-xs text-muted-foreground"> ({ord.discount.code})</span> : null}
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => removeDiscount(ord.id)} data-testid="table-disc-remove">
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Select value={discType} onValueChange={setDiscType}>
                              <SelectTrigger className="w-20 h-8" data-testid="table-disc-type"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percent">%</SelectItem>
                                <SelectItem value="amount">{isAr ? 'دج' : 'DA'}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input value={discValue} onChange={e => setDiscValue(e.target.value)} type="number" min="0"
                              className="w-20 h-8" dir="ltr" placeholder="0" data-testid="table-disc-value" />
                            <Input value={discCode} onChange={e => setDiscCode(e.target.value)}
                              className="flex-1 h-8" placeholder={isAr ? 'أو كود كوبون' : 'ou coupon'} data-testid="table-disc-code" />
                            <Button size="sm" variant="outline" className="h-8" onClick={() => applyDiscount(ord.id)} data-testid="table-disc-apply">
                              <Percent className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {ord.payment_status !== 'paid' && (
                        <Button variant="outline" className="w-full min-h-[44px]" onClick={() => payOrder(ord.id)} data-testid="table-pay-btn">
                          <Banknote className="h-4 w-4 ml-1" />{isAr ? 'تأكيد الدفع (كاش)' : 'Confirmer paiement'}
                        </Button>
                      )}
                      <Button className="w-full min-h-[44px]" onClick={() => checkout(selTable)} data-testid="table-checkout-btn">
                        {isAr ? 'إنهاء وتحرير الطاولة' : 'Cloturer et liberer'}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{isAr ? 'الطاولة فارغة — أنشئ طلبًا من نقطة البيع' : 'Table libre — commande via le POS'}</p>
                  )}
                  {/* p311: رمز QR للطلب من الطاولة */}
                  <div className="border rounded p-3 flex flex-col items-center gap-2" data-testid={`table-qr-${selTable.id}`}>
                    <QRCodeCanvas value={`${window.location.origin}/r/${user?.tenant_id}/${selTable.id}`} size={140} />  {/* p325: رمز مطبوع دائم — المسح ينشئ رابط طلب مؤقتًا */}
                    <p className="text-[11px] text-muted-foreground text-center break-all" dir="ltr">{`${window.location.origin}/r/${user?.tenant_id}/${selTable.id}`}</p>
                    <Button variant="outline" size="sm" className="w-full"
                      data-testid={`table-qr-copy-${selTable.id}`}
                      onClick={() => { try { navigator.clipboard.writeText(`${window.location.origin}/r/${user?.tenant_id}/${selTable.id}`); toast.success(isAr ? 'نُسخ الرابط' : 'Lien copie'); } catch (e) {} }}>
                      <Copy className="h-4 w-4 ml-1" />{isAr ? 'نسخ رابط الطلب' : 'Copier le lien'}
                    </Button>
                    {/* p325: الرمز المطبوع دائم — روابط الطلب المؤقتة تموت عند تحرير الطاولة */}
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 text-center">
                      {isAr ? 'هذا الرمز دائم — اطبعه مرة واحدة. كل مسح ينشئ رابط طلب مؤقتًا يموت تلقائيًا بعد الدفع، فلا يمكن لزبون قديم الطلب من بيته' : 'QR permanent — lien de commande temporaire'}
                    </p>
                    <Button variant="outline" size="sm" className="w-full"
                      data-testid={`table-qr-rotate-${selTable.id}`}
                      onClick={async () => {
                        try {
                          await apiClient.post(`/restaurant/tables/${selTable.id}/rotate-qr`);
                          toast.success(isAr ? 'جُدّد الرابط — الرابط السابق مات فورًا' : 'Lien renouvele');
                          setSelTable(null);
                          fetchAll();
                        } catch (e) { toast.error(isAr ? 'فشل التجديد' : 'Echec'); }
                      }}>
                      <RefreshCw className="h-4 w-4 ml-1" />{isAr ? 'تجديد الرابط الآن' : 'Renouveler le lien'}
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full text-destructive" onClick={() => deleteTable(selTable)} data-testid={`table-delete-${selTable.id}`}>
                    <Trash2 className="h-4 w-4 ml-1" />{isAr ? 'حذف الطاولة' : 'Supprimer'}
                  </Button>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* p337: تسجيل طلبية مجدولة ليوم محدد */}
        <Dialog open={schedDlg} onOpenChange={setSchedDlg}>
          <DialogContent className="max-w-md" data-testid="sched-dialog">
            <DialogHeader><DialogTitle>{isAr ? 'طلبية مجدولة ليوم محدد' : 'Commande planifiee'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">{isAr ? 'موعد التجهيز' : 'Date de preparation'}</label>
                <Input type="datetime-local" value={schedWhen} onChange={e => setSchedWhen(e.target.value)} dir="ltr" data-testid="sched-when" />
              </div>
              <div className="flex gap-2">
                <Select value={schedRemind} onValueChange={setSchedRemind}>
                  <SelectTrigger className="flex-1" data-testid="sched-remind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{isAr ? 'تذكير قبل يوم' : 'Rappel J-1'}</SelectItem>
                    <SelectItem value="3">{isAr ? 'تذكير قبل 3 أيام' : 'Rappel J-3'}</SelectItem>
                  </SelectContent>
                </Select>
                <Input value={schedPhone} onChange={e => setSchedPhone(e.target.value)} placeholder={isAr ? 'هاتف الزبون' : 'Tel'} className="flex-1" dir="ltr" data-testid="sched-phone" />
              </div>
              <Input value={schedNotes} onChange={e => setSchedNotes(e.target.value)} placeholder={isAr ? 'ملاحظات (مناسبة، عنوان...)' : 'Notes'} data-testid="sched-notes" />
              <Input value={prodSearch} onChange={e => setProdSearch(e.target.value)} placeholder={isAr ? 'ابحث عن صنف لإضافته...' : 'Chercher un article...'} data-testid="sched-prod-search" />
              {prodSearch.trim() && (
                <div className="max-h-40 overflow-y-auto border rounded divide-y">
                  {products.filter(p => (p.name_ar || p.name || '').includes(prodSearch.trim())).slice(0, 12).map(p => (
                    <button key={p.id} type="button" className="w-full text-right px-2 py-1.5 text-sm hover:bg-muted flex justify-between"
                      onClick={() => { addSchedItem(p); setProdSearch(''); }} data-testid={`sched-prod-${p.id}`}>
                      <span>{p.name_ar || p.name}</span>
                      <span className="font-mono text-muted-foreground" dir="ltr">{p.retail_price}</span>
                    </button>
                  ))}
                </div>
              )}
              {schedItems.length > 0 && (
                <ul className="border rounded divide-y text-sm" data-testid="sched-items">
                  {schedItems.map((it, i) => (
                    <li key={it.product_id} className="flex items-center justify-between px-2 py-1.5">
                      <span>{it.product_name}</span>
                      <span className="flex items-center gap-1">
                        <button type="button" className="w-6 h-6 border rounded" onClick={() => setSchedItems(prev => prev.map((x, j) => j === i ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}>-</button>
                        <b className="w-6 text-center">{it.quantity}</b>
                        <button type="button" className="w-6 h-6 border rounded" onClick={() => setSchedItems(prev => prev.map((x, j) => j === i ? { ...x, quantity: x.quantity + 1 } : x))}>+</button>
                        <button type="button" className="text-red-500 mr-1" onClick={() => setSchedItems(prev => prev.filter((_, j) => j !== i))} data-testid={`sched-item-del-${i}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Button className="w-full" onClick={submitSched} data-testid="sched-submit">
                <CalendarClock className="h-4 w-4 ml-1" />{isAr ? 'تسجيل الطلبية' : 'Enregistrer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
