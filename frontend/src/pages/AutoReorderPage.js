import _React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { PackagePlus, Loader2, RefreshCw, Ban, Undo2, Settings2 } from 'lucide-react';

// M5: auto-reorder (إعادة الطلب التلقائي) — low-stock → draft purchase orders per supplier.
const AutoReorderPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const cur = isAr ? 'دج' : 'DA';

  const [groups, setGroups] = useState([]);
  const [productsCount, setProductsCount] = useState(0);
  const [skippedPending, setSkippedPending] = useState(0);
  const [drafts, setDrafts] = useState([]);
  const [settings, setSettings] = useState({ enabled: true, qty_multiplier: 2, min_order_qty: 1 });
  const [selected, setSelected] = useState({}); // product_id -> bool
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editSettings, setEditSettings] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        apiClient.get('/auto-reorder/suggestions'),
        apiClient.get('/auto-reorder/drafts'),
      ]);
      setGroups(s.data.suppliers || []);
      setProductsCount(s.data.products_count || 0);
      setSkippedPending(s.data.skipped_pending_drafts || 0);
      setDrafts(d.data.drafts || []);
      setSelected({});
    } catch (_e) {
      toast.error(isAr ? 'فشل تحميل الاقتراحات' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const loadSettings = useCallback(async () => {
    try {
      const r = await apiClient.get('/auto-reorder/settings');
      setSettings(r.data);
    } catch (_e) { /* defaults */ }
  }, []);

  useEffect(() => { loadAll(); loadSettings(); }, [loadAll, loadSettings]);

  const toggleItem = (pid) => setSelected(s => ({ ...s, [pid]: !s[pid] }));
  const toggleGroup = (g, on) => {
    setSelected(s => {
      const n = { ...s };
      g.items.forEach(i => { n[i.product_id] = on; });
      return n;
    });
  };

  const generate = async (g) => {
    const items = g.items
      .filter(i => selected[i.product_id])
      .map(i => ({ product_id: i.product_id, quantity: i.suggested_qty }));
    if (!items.length) {
      toast.error(isAr ? 'حدّد صنفاً واحداً على الأقل' : 'Sélectionnez au moins un article');
      return;
    }
    setSaving(true);
    try {
      const r = await apiClient.post('/auto-reorder/generate', { supplier_id: g.supplier_id, items });
      const p = r.data.purchase;
      toast.success(isAr
        ? `مسودة ${p.invoice_number}: ${p.items.length} صنفاً، ${p.total.toLocaleString()} ${cur}`
        : `Brouillon ${p.invoice_number} créé`);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل إنشاء المسودة' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const exclude = async (pid) => {
    try {
      await apiClient.post(`/auto-reorder/exclude/${pid}`);
      toast.success(isAr ? 'استُبعد المنتج من الطلب التلقائي' : 'Produit exclu');
      loadAll();
    } catch (_e) { toast.error(isAr ? 'فشل' : 'Échec'); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const r = await apiClient.put('/auto-reorder/settings', settings);
      setSettings(r.data);
      setEditSettings(false);
      toast.success(isAr ? 'حُفظت الإعدادات' : 'Paramètres enregistrés');
      loadAll();
    } catch (_e) {
      toast.error(isAr ? 'فشل الحفظ' : 'Échec');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PackagePlus className="h-6 w-6" />
            {isAr ? 'إعادة الطلب التلقائي' : 'Réassort automatique'}
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditSettings(v => !v)}>
              <Settings2 className="h-4 w-4 me-1" />{isAr ? 'الإعدادات' : 'Paramètres'}
            </Button>
            <Button variant="outline" onClick={loadAll} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {editSettings && (
          <Card>
            <CardHeader><CardTitle>{isAr ? 'إعدادات إعادة الطلب' : 'Paramètres de réassort'}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-end gap-4">
              <div>
                <Label>{isAr ? 'مضاعف الكمية (الهدف = الحد × المضاعف)' : 'Multiplicateur (cible = seuil × N)'}</Label>
                <Input type="number" min="1" max="20" className="w-28"
                  value={settings.qty_multiplier}
                  onChange={e => setSettings(s => ({ ...s, qty_multiplier: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>{isAr ? 'أدنى كمية طلب' : 'Quantité minimale'}</Label>
                <Input type="number" min="0" className="w-28"
                  value={settings.min_order_qty}
                  onChange={e => setSettings(s => ({ ...s, min_order_qty: Number(e.target.value) }))} />
              </div>
              <Button onClick={saveSettings} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {isAr ? 'حفظ' : 'Enregistrer'}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-orange-600">{productsCount}</div>
            <div className="text-sm text-muted-foreground">{isAr ? 'منتجات تحتاج إعادة طلب' : 'Produits à réapprovisionner'}</div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-blue-600">{skippedPending}</div>
            <div className="text-sm text-muted-foreground">{isAr ? 'لها مسودات مفتوحة (تُخطى تلقائياً)' : 'Brouillons ouverts (ignorés)'}</div>
          </CardContent></Card>
          <Card><CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-green-600">{drafts.length}</div>
            <div className="text-sm text-muted-foreground">{isAr ? 'مسودات طلبات شراء تلقائية' : 'Brouillons automatiques'}</div>
          </CardContent></Card>
        </div>

        {groups.map(g => (
          <Card key={g.supplier_id || '_none'}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">
                {g.supplier_name}
                <Badge className="ms-2 bg-orange-100 text-orange-700">{g.items.length}</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{g.total.toLocaleString()} {cur}</span>
                <Button size="sm" variant="outline" onClick={() => toggleGroup(g, true)}>{isAr ? 'تحديد الكل' : 'Tout'}</Button>
                <Button size="sm" variant="outline" onClick={() => toggleGroup(g, false)}>{isAr ? 'إلغاء' : 'Aucun'}</Button>
                {g.supplier_id ? (
                  <Button size="sm" onClick={() => generate(g)} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                    {isAr ? 'إنشاء مسودة طلب' : 'Créer le brouillon'}
                  </Button>
                ) : (
                  <Badge className="bg-gray-200 text-gray-700">{isAr ? 'اربط المنتجات بمورد أولاً' : 'Liez un fournisseur'}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-2"></th>
                    <th className="p-2 text-start">{isAr ? 'المنتج' : 'Produit'}</th>
                    <th className="p-2">{isAr ? 'الحالي' : 'Stock'}</th>
                    <th className="p-2">{isAr ? 'الحد' : 'Seuil'}</th>
                    <th className="p-2">{isAr ? 'الكمية المقترحة' : 'Qté suggérée'}</th>
                    <th className="p-2">{isAr ? 'سعر الشراء' : 'Prix achat'}</th>
                    <th className="p-2">{isAr ? 'الإجمالي' : 'Total'}</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map(i => (
                    <tr key={i.product_id} className="border-b last:border-0">
                      <td className="p-2 text-center">
                        <input type="checkbox" checked={!!selected[i.product_id]} onChange={() => toggleItem(i.product_id)} />
                      </td>
                      <td className="p-2">{i.product_name}<div className="text-xs text-muted-foreground">{i.barcode}</div></td>
                      <td className="p-2 text-center text-red-600 font-semibold">{i.current_quantity}</td>
                      <td className="p-2 text-center">{i.threshold}</td>
                      <td className="p-2 text-center font-bold">{i.suggested_qty}</td>
                      <td className="p-2 text-center">{i.unit_price.toLocaleString()}</td>
                      <td className="p-2 text-center">{i.line_total.toLocaleString()}</td>
                      <td className="p-2 text-center">
                        <Button size="icon" variant="ghost" title={isAr ? 'استبعاد من الطلب التلقائي' : 'Exclure'}
                          onClick={() => exclude(i.product_id)}>
                          <Ban className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}

        {!loading && groups.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">
            {isAr ? 'لا توجد منتجات تحتاج إعادة طلب — المخزون بحالة جيدة' : 'Aucun produit à réapprovisionner'}
          </CardContent></Card>
        )}

        {drafts.length > 0 && (
          <Card>
            <CardHeader><CardTitle>{isAr ? 'مسودات الطلبات التلقائية المفتوحة' : 'Brouillons automatiques ouverts'}</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-2 text-start">{isAr ? 'الفاتورة' : 'Facture'}</th>
                    <th className="p-2 text-start">{isAr ? 'المورد' : 'Fournisseur'}</th>
                    <th className="p-2">{isAr ? 'الأصناف' : 'Articles'}</th>
                    <th className="p-2">{isAr ? 'الإجمالي' : 'Total'}</th>
                    <th className="p-2">{isAr ? 'التاريخ' : 'Date'}</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts.map(d => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="p-2 font-mono">{d.invoice_number}</td>
                      <td className="p-2">{d.supplier_name}</td>
                      <td className="p-2 text-center">{(d.items || []).length}</td>
                      <td className="p-2 text-center font-semibold">{(d.total || 0).toLocaleString()} {cur}</td>
                      <td className="p-2 text-center text-muted-foreground">{(d.created_at || '').slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                <Undo2 className="h-3 w-3" />
                {isAr ? 'تُؤكَّد المسودات من صفحة المشتريات (تأكيد المخزون) فتدخل الحسابات والمخزون تلقائياً.'
                      : 'Confirmez les brouillons depuis la page Achats pour activer stock et comptabilité.'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default AutoReorderPage;
