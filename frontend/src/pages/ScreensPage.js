// p322: إدارة شاشات العرض (TV) — إقران بالكود + تسمية + تحديد المحتوى مركزيًا
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';  // p329
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { toast } from 'sonner';
import { MonitorPlay, Link2, Trash2, Tv } from 'lucide-react';

export default function ScreensPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { isFeatureEnabled } = useAuth();  // p329
  const hasRest = isFeatureEnabled ? isFeatureEnabled('restaurant') : false;
  // p329: الكتالوج والشرائح لكل الأنشطة؛ أوضاع المطعم تظهر لمستأجري المطاعم فقط
  const MODES = [
    { value: 'catalog', labelAr: 'كتالوج المنتجات (شبكة)', labelFr: 'Catalogue (grille)' },
    { value: 'slider', labelAr: 'شرائح إعلانية بالصور', labelFr: 'Diaporama' },
    ...(hasRest ? [
      { value: 'menu', labelAr: 'قائمة المطعم (بالوصفات)', labelFr: 'Menu restaurant' },
      { value: 'orders', labelAr: 'أرقام الطلبات الجاهزة', labelFr: 'Commandes pretes' },
    ] : []),
  ];
  const [screens, setScreens] = useState([]);
  const [code, setCode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [renaming, setRenaming] = useState({});
  const [products, setProducts] = useState([]);   // p333: قائمة منتجات المستأجر لمنتقي الشاشة
  const [picker, setPicker] = useState({});       // p333: screenId -> {open, search, ids}

  useEffect(() => {  // p333
    apiClient.get('/products', { params: { limit: 1000 } }).then(r => {
      const arr = Array.isArray(r.data) ? r.data : (r.data?.items || r.data?.products || []);
      setProducts(arr);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/restaurant/screens');
      setScreens(res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000); // حالة الاتصال تتحدث دوريًا
    return () => clearInterval(t);
  }, [load]);

  const claim = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error(isAr ? 'الكود 6 أرقام كما يظهر على التلفاز' : 'Code a 6 chiffres'); return;
    }
    setClaiming(true);
    try {
      await apiClient.post('/restaurant/screens/claim', { code: code.trim() });
      toast.success(isAr ? 'تم ربط الشاشة — سيبدأ العرض عليها فورًا' : 'Ecran lie');
      setCode('');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الإقران' : 'Echec'));
    } finally { setClaiming(false); }
  };

  const setMode = async (id, mode) => {
    try {
      await apiClient.put(`/restaurant/screens/${id}`, { mode });
      toast.success(isAr ? 'تم تغيير المحتوى — سيظهر على التلفاز خلال ثوانٍ' : 'Mode change');
      load();
    } catch { toast.error(isAr ? 'فشل الحفظ' : 'Echec'); }
  };

  // p333: حفظ تقسيم الشاشة (0 = تلقائي)
  const setLayout = async (id, layout) => {
    try {
      await apiClient.put(`/restaurant/screens/${id}`, { grid_layout: Number(layout) });
      toast.success(isAr ? 'تم حفظ التقسيم — سيظهر على التلفاز خلال ثوانٍ' : 'Disposition enregistree');
      load();
    } catch { toast.error(isAr ? 'فشل الحفظ' : 'Echec'); }
  };

  // p333: فتح/غلق منتقي منتجات الشاشة
  const togglePicker = (s) => {
    setPicker(prev => {
      const cur = prev[s.id];
      if (cur?.open) { const n = { ...prev }; delete n[s.id]; return n; }
      return { ...prev, [s.id]: { open: true, search: '', ids: [...(s.product_ids || [])] } };
    });
  };

  // p333: حفظ منتجات الشاشة (فارغ = كل المنتجات)
  const saveProducts = async (id) => {
    const ids = picker[id]?.ids || [];
    try {
      await apiClient.put(`/restaurant/screens/${id}`, { product_ids: ids });
      toast.success(isAr ? (ids.length ? `تم تحديد ${ids.length} منتجًا لهذه الشاشة` : 'الشاشة تعرض كل المنتجات الآن') : 'Produits enregistres');
      setPicker(prev => { const n = { ...prev }; delete n[id]; return n; });
      load();
    } catch { toast.error(isAr ? 'فشل الحفظ' : 'Echec'); }
  };

  const rename = async (id) => {
    const name = (renaming[id] || '').trim();
    if (!name) return;
    try {
      await apiClient.put(`/restaurant/screens/${id}`, { name });
      toast.success(isAr ? 'تمت التسمية' : 'Renomme');
      setRenaming(prev => ({ ...prev, [id]: '' }));
      load();
    } catch { toast.error(isAr ? 'فشل الحفظ' : 'Echec'); }
  };

  const remove = async (id) => {
    if (!window.confirm(isAr ? 'فكّ ارتباط هذه الشاشة؟ سترجع لوضع الإقران' : 'Dissocier?')) return;
    try {
      await apiClient.delete(`/restaurant/screens/${id}`);
      toast.success(isAr ? 'فُكّ الارتباط' : 'Supprime');
      load();
    } catch { toast.error(isAr ? 'فشل الحذف' : 'Echec'); }
  };

  return (
    <Layout>
    <div className="p-4 md:p-6 space-y-6" dir={isAr ? 'rtl' : 'ltr'} data-testid="screens-page">
      <div className="flex items-center gap-2">
        <MonitorPlay className="h-6 w-6" />
        <h1 className="text-xl font-bold">{isAr ? 'شاشات العرض (التلفزيونات)' : 'Ecrans d\'affichage'}</h1>
      </div>

      {/* إقران شاشة جديدة */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Link2 className="h-4 w-4" />{isAr ? 'إقران شاشة جديدة' : 'Lier un ecran'}</h2>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? 'على التلفاز افتح المتصفح وادخل إلى: nt-commerce.net/tv — سيظهر كود من 6 أرقام، أدخله هنا. بعد الربط لن تحتاج إدخال أي عنوان على التلفاز مجددًا.'
              : 'Sur la TV ouvrez nt-commerce.net/tv puis saisissez le code affiche.'}
          </p>
          <div className="flex gap-2 max-w-md">
            <Input
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={isAr ? 'كود الإقران (6 أرقام)' : 'Code (6 chiffres)'}
              className="text-center text-2xl font-mono tracking-widest"
              dir="ltr"
              data-testid="screen-pair-code"
            />
            <Button onClick={claim} disabled={claiming} data-testid="screen-pair-btn">
              {isAr ? 'إقران' : 'Lier'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* الشاشات المرتبطة */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {screens.map(s => (
          <Card key={s.id} data-testid={`screen-card-${s.id}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${s.online ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`}
                    title={s.online ? (isAr ? 'متصلة الآن' : 'En ligne') : (isAr ? 'مطفأة/غير متصلة' : 'Hors ligne')}
                    data-testid={`screen-online-${s.id}`} />
                  <Tv className="h-5 w-5 text-muted-foreground" />
                  <span className="font-bold">{s.name}</span>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(s.id)} data-testid={`screen-del-${s.id}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{isAr ? 'المحتوى المعروض' : 'Contenu'}</label>
                <Select value={s.mode} onValueChange={v => setMode(s.id, v)}>
                  <SelectTrigger data-testid={`screen-mode-${s.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODES.map(m => <SelectItem key={m.value} value={m.value}>{isAr ? m.labelAr : m.labelFr}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* p333: تقسيم الشاشة + تحديد منتجاتها (لوضعَي الكتالوج والشرائح) */}
              {(s.mode === 'catalog' || s.mode === 'slider') && (
                <div className="space-y-2 border-t pt-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{isAr ? 'تقسيم الشاشة' : 'Disposition'}</label>
                    <Select value={String(s.grid_layout || 0)} onValueChange={v => setLayout(s.id, v)}>
                      <SelectTrigger data-testid={`screen-layout-${s.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">{isAr ? 'تلقائي (حسب عدد المنتجات)' : 'Auto'}</SelectItem>
                        <SelectItem value="1">{isAr ? 'منتج واحد بملء الشاشة' : '1 produit plein ecran'}</SelectItem>
                        <SelectItem value="4">{isAr ? '4 خانات (2×2)' : '4 zones (2x2)'}</SelectItem>
                        <SelectItem value="6">{isAr ? '6 خانات (3×2)' : '6 zones (3x2)'}</SelectItem>
                        <SelectItem value="8">{isAr ? '8 خانات (4×2)' : '8 zones (4x2)'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => togglePicker(s)} data-testid={`screen-products-${s.id}`}>
                    {isAr
                      ? `تحديد المنتجات ${(s.product_ids || []).length ? `(${(s.product_ids || []).length} محدد)` : '(الكل حاليًا)'}`
                      : 'Choisir les produits'}
                  </Button>
                  {picker[s.id]?.open && (
                    <div className="border rounded-lg p-2 space-y-2" data-testid={`screen-picker-${s.id}`}>
                      <Input
                        value={picker[s.id].search}
                        onChange={e => setPicker(prev => ({ ...prev, [s.id]: { ...prev[s.id], search: e.target.value } }))}
                        placeholder={isAr ? 'ابحث عن منتج…' : 'Rechercher…'}
                        className="h-8 text-sm"
                        data-testid={`screen-picker-search-${s.id}`}
                      />
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {products
                          .filter(p => !picker[s.id].search || (p.name_ar || p.name || '').toLowerCase().includes(picker[s.id].search.toLowerCase()))
                          .slice(0, 100)
                          .map(p => {
                            const checked = picker[s.id].ids.includes(p.id);
                            return (
                              <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5" data-testid={`screen-pick-${s.id}-${p.id}`}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => setPicker(prev => {
                                    const cur = prev[s.id];
                                    const ids = checked ? cur.ids.filter(x => x !== p.id) : [...cur.ids, p.id];
                                    return { ...prev, [s.id]: { ...cur, ids } };
                                  })}
                                />
                                <span className="truncate">{p.name_ar || p.name}</span>
                                <span className="text-xs text-muted-foreground ms-auto" dir="ltr">{p.retail_price}</span>
                              </label>
                            );
                          })}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={() => saveProducts(s.id)} data-testid={`screen-pick-save-${s.id}`}>{isAr ? 'حفظ التحديد' : 'Enregistrer'}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setPicker(prev => ({ ...prev, [s.id]: { ...prev[s.id], ids: [] } }))}>{isAr ? 'الكل' : 'Tous'}</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={renaming[s.id] ?? ''}
                  onChange={e => setRenaming(prev => ({ ...prev, [s.id]: e.target.value }))}
                  placeholder={isAr ? `إعادة تسمية («${s.name}»)` : 'Renommer'}
                  className="h-8 text-sm"
                  data-testid={`screen-rename-${s.id}`}
                />
                <Button size="sm" variant="outline" onClick={() => rename(s.id)} disabled={!(renaming[s.id] || '').trim()}>
                  {isAr ? 'حفظ' : 'OK'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {screens.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              {isAr ? 'لا شاشات مرتبطة بعد — افتح /tv على التلفاز وأدخل كوده أعلاه' : 'Aucun ecran lie'}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </Layout>
  );
}
