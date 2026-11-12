import _React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { Truck, Plus, Loader2, PackageOpen, PackageMinus, PlayCircle, Lock, RefreshCw } from 'lucide-react';

// M9: van sales (البيع المتجول) — mobile warehouse load/unload + daily cash reconciliation.
const VanSalesPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const cur = isAr ? 'دج' : 'DA';
  const today = new Date().toISOString().slice(0, 10);

  const [vans, setVans] = useState([]);
  const [activeVan, setActiveVan] = useState(null);
  const [stock, setStock] = useState(null);
  const [days, setDays] = useState([]);
  const [loads, setLoads] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [vanOpen, setVanOpen] = useState(false);
  const [vanForm, setVanForm] = useState({ name: '', driver_name: '', vehicle_plate: '', phone: '' });
  const [moveOpen, setMoveOpen] = useState(null); // 'load' | 'unload'
  const [moveItems, setMoveItems] = useState([{ product_id: '', quantity: 1 }]);
  const [closeTarget, setCloseTarget] = useState(null);
  const [cashCounted, setCashCounted] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/van-sales/vans');
      const list = r.data.items || [];
      setVans(list);
      const van = activeVan && list.find(v => v.id === activeVan.id) ? activeVan : (list[0] || null);
      setActiveVan(van);
      if (van) {
        const [s, d, l] = await Promise.all([
          apiClient.get(`/van-sales/vans/${van.id}/stock`),
          apiClient.get('/van-sales/days', { params: { van_id: van.id } }),
          apiClient.get('/van-sales/loads', { params: { van_id: van.id } }),
        ]);
        setStock(s.data);
        setDays(d.data.items || []);
        setLoads(l.data.items || []);
      } else {
        setStock(null); setDays([]); setLoads([]);
      }
    } catch (_e) {
      toast.error(isAr ? 'فشل التحميل' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVan?.id, isAr]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    apiClient.get('/products', { params: { limit: 500 } }).then(r => {
      const d = Array.isArray(r.data) ? r.data : (r.data.items || r.data.products || []);
      setProducts(d);
    }).catch(() => {});
  }, []);

  const createVan = async () => {
    setSaving(true);
    try {
      await apiClient.post('/van-sales/vans', vanForm);
      toast.success(isAr ? 'أُضيفت الشاحنة' : 'Camion ajouté');
      setVanOpen(false);
      setVanForm({ name: '', driver_name: '', vehicle_plate: '', phone: '' });
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل' : 'Échec'));
    } finally { setSaving(false); }
  };

  const move = async () => {
    const items = moveItems.filter(i => i.product_id && Number(i.quantity) > 0)
      .map(i => ({ product_id: i.product_id, quantity: Number(i.quantity) }));
    if (!items.length) { toast.error(isAr ? 'أضف صنفاً واحداً على الأقل' : 'Ajoutez un article'); return; }
    setSaving(true);
    try {
      const r = await apiClient.post(`/van-sales/${moveOpen}`, { van_id: activeVan.id, items });
      toast.success(isAr
        ? `${moveOpen === 'load' ? 'تحميل' : 'إرجاع'} ${r.data.code} — ${r.data.total_value.toLocaleString()} ${cur}`
        : r.data.code);
      setMoveOpen(null);
      setMoveItems([{ product_id: '', quantity: 1 }]);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل' : 'Échec'));
    } finally { setSaving(false); }
  };

  const openDay = async () => {
    setSaving(true);
    try {
      const r = await apiClient.post('/van-sales/days/open', { van_id: activeVan.id, date: today });
      toast.success(isAr ? `فُتح اليوم ${r.data.code}` : `Journée ${r.data.code} ouverte`);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل' : 'Échec'));
    } finally { setSaving(false); }
  };

  const closeDay = async () => {
    setSaving(true);
    try {
      const r = await apiClient.post(`/van-sales/days/${closeTarget.id}/close`, { cash_counted: Number(cashCounted) || 0 });
      const v = r.data.variance;
      toast.success(isAr
        ? `أُغلق اليوم — فرق الصندوق: ${v === 0 ? 'بدون فرق' : v.toLocaleString() + ' ' + cur}`
        : 'Journée clôturée');
      setCloseTarget(null);
      setCashCounted('');
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الإغلاق' : 'Échec'));
    } finally { setSaving(false); }
  };

  const openDayDoc = days.find(d => d.status === 'open' && d.date === today);

  return (
    <Layout>
      <div className="space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6" />
            {isAr ? 'البيع المتجول (الشاحنات)' : 'Vente ambulante'}
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setVanOpen(true)}>
              <Plus className="h-4 w-4 me-1" />{isAr ? 'شاحنة جديدة' : 'Nouveau camion'}
            </Button>
            <Button variant="outline" onClick={loadAll} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {vans.map(v => (
            <Badge key={v.id}
              className={`cursor-pointer px-3 py-2 ${activeVan?.id === v.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              onClick={() => setActiveVan(v)}>
              {v.name} · {v.driver_name || (isAr ? 'بدون سائق' : 'Sans chauffeur')} {v.vehicle_plate ? `· ${v.vehicle_plate}` : ''}
            </Badge>
          ))}
          {vans.length === 0 && !loading && (
            <span className="text-muted-foreground text-sm">{isAr ? 'أضف أول شاحنة بيع متجول' : 'Ajoutez un premier camion'}</span>
          )}
        </div>

        {activeVan && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card><CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold text-blue-700">{(stock?.total_value || 0).toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">{isAr ? `قيمة بضاعة الشاحنة (${cur} بسعر الشراء)` : 'Valeur du stock (prix achat)'}</div>
              </CardContent></Card>
              <Card><CardContent className="pt-6 text-center">
                <div className="text-3xl font-bold">{stock?.items?.length || 0}</div>
                <div className="text-sm text-muted-foreground">{isAr ? 'أصناف محمّلة' : 'Articles chargés'}</div>
              </CardContent></Card>
              <Card><CardContent className="pt-6 text-center">
                {openDayDoc ? (
                  <>
                    <Badge className="bg-green-100 text-green-700 text-base px-3 py-1">{openDayDoc.code} — {isAr ? 'مفتوح' : 'Ouverte'}</Badge>
                    <div className="mt-2">
                      <Button size="sm" variant="destructive" onClick={() => { setCloseTarget(openDayDoc); setCashCounted(''); }}>
                        <Lock className="h-4 w-4 me-1" />{isAr ? 'إغلاق اليوم وجرد النقد' : 'Clôturer + compter'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button size="sm" onClick={openDay} disabled={saving}>
                    <PlayCircle className="h-4 w-4 me-1" />{isAr ? 'فتح يوم البيع' : 'Ouvrir la journée'}
                  </Button>
                )}
              </CardContent></Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{isAr ? 'بضاعة الشاحنة' : 'Stock du camion'}</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setMoveOpen('load')}><PackageOpen className="h-4 w-4 me-1" />{isAr ? 'تحميل من المخزن' : 'Charger'}</Button>
                  <Button size="sm" variant="outline" onClick={() => setMoveOpen('unload')}><PackageMinus className="h-4 w-4 me-1" />{isAr ? 'إرجاع للمخزن' : 'Retour'}</Button>
                </div>
              </CardHeader>
              <CardContent>
                {!stock?.items?.length ? (
                  <div className="py-8 text-center text-muted-foreground">{isAr ? 'الشاحنة فارغة' : 'Camion vide'}</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="p-2 text-start">{isAr ? 'المنتج' : 'Produit'}</th>
                        <th className="p-2">{isAr ? 'الكمية' : 'Qté'}</th>
                        <th className="p-2">{isAr ? 'سعر البيع' : 'Prix vente'}</th>
                        <th className="p-2">{isAr ? 'القيمة (شراء)' : 'Valeur'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stock.items.map(i => (
                        <tr key={i.product_id} className="border-b last:border-0">
                          <td className="p-2">{i.product_name}<div className="text-xs text-muted-foreground">{i.barcode}</div></td>
                          <td className="p-2 text-center font-bold">{i.quantity}</td>
                          <td className="p-2 text-center">{(i.retail_price || 0).toLocaleString()}</td>
                          <td className="p-2 text-center">{i.stock_value.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>{isAr ? 'أيام البيع' : 'Journées'} ({days.length})</CardTitle></CardHeader>
                <CardContent>
                  {days.length === 0 ? <div className="text-muted-foreground text-sm">{isAr ? 'لا أيام بعد' : 'Aucune journée'}</div> : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="p-2 text-start">{isAr ? 'الكود' : 'Code'}</th>
                          <th className="p-2">{isAr ? 'التاريخ' : 'Date'}</th>
                          <th className="p-2">{isAr ? 'المبيعات' : 'Ventes'}</th>
                          <th className="p-2">{isAr ? 'المعدود' : 'Compté'}</th>
                          <th className="p-2">{isAr ? 'الفرق' : 'Écart'}</th>
                          <th className="p-2">{isAr ? 'الحالة' : 'Statut'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {days.map(d => (
                          <tr key={d.id} className="border-b last:border-0">
                            <td className="p-2 font-mono">{d.code}</td>
                            <td className="p-2 text-center">{d.date}</td>
                            <td className="p-2 text-center">{d.status === 'closed' ? (d.sales_total || 0).toLocaleString() : '—'}</td>
                            <td className="p-2 text-center">{d.status === 'closed' ? (d.cash_counted || 0).toLocaleString() : '—'}</td>
                            <td className={`p-2 text-center font-semibold ${d.variance < 0 ? 'text-red-600' : d.variance > 0 ? 'text-blue-600' : ''}`}>
                              {d.status === 'closed' ? (d.variance || 0).toLocaleString() : '—'}
                            </td>
                            <td className="p-2 text-center">
                              <Badge className={d.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}>
                                {d.status === 'open' ? (isAr ? 'مفتوح' : 'Ouverte') : (isAr ? 'مغلق' : 'Clôturée')}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{isAr ? 'حركات التحميل والإرجاع' : 'Chargements / retours'} ({loads.length})</CardTitle></CardHeader>
                <CardContent>
                  {loads.length === 0 ? <div className="text-muted-foreground text-sm">{isAr ? 'لا حركات بعد' : 'Aucun mouvement'}</div> : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="p-2 text-start">{isAr ? 'الكود' : 'Code'}</th>
                          <th className="p-2">{isAr ? 'النوع' : 'Type'}</th>
                          <th className="p-2">{isAr ? 'الأصناف' : 'Articles'}</th>
                          <th className="p-2">{isAr ? 'القيمة' : 'Valeur'}</th>
                          <th className="p-2">{isAr ? 'التاريخ' : 'Date'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loads.map(l => (
                          <tr key={l.id} className="border-b last:border-0">
                            <td className="p-2 font-mono">{l.code}</td>
                            <td className="p-2 text-center">
                              <Badge className={l.type === 'load' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}>
                                {l.type === 'load' ? (isAr ? 'تحميل' : 'Charge') : (isAr ? 'إرجاع' : 'Retour')}
                              </Badge>
                            </td>
                            <td className="p-2 text-center">{l.items.length}</td>
                            <td className="p-2 text-center">{(l.total_value || 0).toLocaleString()}</td>
                            <td className="p-2 text-center text-muted-foreground">{(l.created_at || '').slice(0, 10)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* new van dialog */}
        <Dialog open={vanOpen} onOpenChange={setVanOpen}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'شاحنة بيع جديدة' : 'Nouveau camion'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{isAr ? 'اسم الشاحنة' : 'Nom'}</Label>
                <Input value={vanForm.name} onChange={e => setVanForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{isAr ? 'السائق / الوكيل' : 'Chauffeur'}</Label>
                  <Input value={vanForm.driver_name} onChange={e => setVanForm(f => ({ ...f, driver_name: e.target.value }))} /></div>
                <div><Label>{isAr ? 'رقم اللوحة' : 'Plaque'}</Label>
                  <Input value={vanForm.vehicle_plate} onChange={e => setVanForm(f => ({ ...f, vehicle_plate: e.target.value }))} /></div>
              </div>
              <Button className="w-full" onClick={createVan} disabled={saving || !vanForm.name.trim()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}{isAr ? 'إضافة' : 'Ajouter'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* load / unload dialog */}
        <Dialog open={!!moveOpen} onOpenChange={() => setMoveOpen(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{moveOpen === 'load' ? (isAr ? 'تحميل من المخزن الرئيسي' : 'Charger depuis le dépôt') : (isAr ? 'إرجاع إلى المخزن' : 'Retour au dépôt')}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {moveItems.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_90px_36px] gap-2 items-end">
                  <div>
                    <Label>{isAr ? 'المنتج' : 'Produit'}</Label>
                    <Select value={it.product_id} onValueChange={v => setMoveItems(arr => arr.map((x, i) => i === idx ? { ...x, product_id: v } : x))}>
                      <SelectTrigger><SelectValue placeholder="..." /></SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {(p.name || p.name_ar || p.name_en)} ({moveOpen === 'load' ? (p.quantity ?? 0) : (stock?.items?.find(s => s.product_id === p.id)?.quantity ?? 0)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>{isAr ? 'الكمية' : 'Qté'}</Label>
                    <Input type="number" min="1" value={it.quantity}
                      onChange={e => setMoveItems(arr => arr.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} /></div>
                  <Button size="icon" variant="ghost" onClick={() => setMoveItems(arr => arr.filter((_, i) => i !== idx))} disabled={moveItems.length === 1}>×</Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setMoveItems(arr => [...arr, { product_id: '', quantity: 1 }])}>
                <Plus className="h-4 w-4 me-1" />{isAr ? 'صنف آخر' : 'Article'}
              </Button>
              <Button className="w-full" onClick={move} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {moveOpen === 'load' ? (isAr ? 'تأكيد التحميل' : 'Confirmer le chargement') : (isAr ? 'تأكيد الإرجاع' : 'Confirmer le retour')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* close day dialog */}
        <Dialog open={!!closeTarget} onOpenChange={() => setCloseTarget(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'إغلاق اليوم' : 'Clôturer'} {closeTarget?.code}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {isAr ? 'عُدّ النقد الذي سلّمه الوكيل. سيُقارن تلقائياً بمبيعات الشاحنة النقدية المسجلة اليوم ويُوثَّق الفرق محاسبياً.'
                      : 'Comptez les espèces remises. L’écart avec les ventes espèces du camion sera comptabilisé.'}
              </p>
              <div><Label>{isAr ? 'النقد المعدود' : 'Espèces comptées'}</Label>
                <Input type="number" min="0" value={cashCounted} onChange={e => setCashCounted(e.target.value)} /></div>
              <Button className="w-full" variant="destructive" onClick={closeDay} disabled={saving || cashCounted === ''}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}{isAr ? 'إغلاق اليوم' : 'Clôturer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default VanSalesPage;
