// Multi-store management (p255 UI for p250 backend) — sub-stores with their own
// slug/name/description and a hand-picked catalog subset; default store untouched.
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Checkbox } from '../../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Store, Plus, RefreshCcw, Trash2, ExternalLink, PackageSearch } from 'lucide-react';
import { toast } from 'sonner';

const emptyForm = { name: '', slug: '', description: '' };

export default function EcomMultiStorePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState(null); // {store, items}
  const [allProducts, setAllProducts] = useState([]);
  const [picked, setPicked] = useState({});
  const [productSearch, setProductSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/store/multi');
      setItems(r.data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر تحميل المتاجر');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !form.slug.trim()) { toast.error('الاسم والرابط مطلوبان'); return; }
    setSaving(true);
    try {
      await apiClient.post('/store/multi', {
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        description: form.description.trim(),
      });
      toast.success('أُنشئ المتجر الفرعي');
      setShowCreate(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإنشاء');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (s) => {
    try {
      await apiClient.put(`/store/multi/${s.id}`, { enabled: !s.enabled });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل التحديث');
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`حذف متجر «${s.name}»؟ يُفصل كتالوجه ويتحرر رابطه.`)) return;
    try {
      await apiClient.delete(`/store/multi/${s.id}`);
      toast.success('حُذف المتجر');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحذف');
    }
  };

  const openCatalog = async (s) => {
    try {
      const [cat, prods] = await Promise.all([
        apiClient.get(`/store/multi/${s.id}/products`),
        apiClient.get('/products'),
      ]);
      setCatalog({ store: s, items: cat.data.items || [] });
      const list = Array.isArray(prods.data) ? prods.data : (prods.data.items || prods.data.products || []);
      setAllProducts(list);
      setPicked({});
      setProductSearch('');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر تحميل الكتالوج');
    }
  };

  const attach = async () => {
    const ids = Object.keys(picked).filter(k => picked[k]);
    if (!ids.length) { toast.error('اختر منتجاً واحداً على الأقل'); return; }
    setSaving(true);
    try {
      const r = await apiClient.post(`/store/multi/${catalog.store.id}/products`, { product_ids: ids });
      toast.success(`أُضيف ${r.data.added} منتج${r.data.skipped ? ` (تُخطّي ${r.data.skipped})` : ''}`);
      setPicked({});
      openCatalog(catalog.store);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الربط');
    } finally {
      setSaving(false);
    }
  };

  const detach = async (pid) => {
    try {
      await apiClient.delete(`/store/multi/${catalog.store.id}/products/${pid}`);
      openCatalog(catalog.store);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الفصل');
    }
  };

  const attachedIds = new Set((catalog?.items || []).map(p => p.id));
  const filteredProducts = allProducts.filter(p => {
    if (attachedIds.has(p.id)) return false;
    const q = productSearch.trim().toLowerCase();
    if (!q) return true;
    return (p.name_ar || '').toLowerCase().includes(q) || (p.name_en || '').toLowerCase().includes(q);
  }).slice(0, 100);

  return (
    <div className="p-4 md:p-6 pt-2 md:pt-2 space-y-4" dir="rtl" data-testid="multi-store-page">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="w-4 h-4" /> المتاجر الفرعية — واجهات منفصلة بكتالوج منتقى
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="stores-refresh-btn">
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" className="gap-1" onClick={() => setShowCreate(true)} data-testid="store-create-btn">
              <Plus className="w-4 h-4" /> متجر فرعي جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            كل متجر فرعي له رابط /shop/slug خاص واسم مستقل ويعرض المنتجات التي تربطها به فقط —
            المتجر الافتراضي لا يتأثر.
          </p>
          {items.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="stores-empty">لا متاجر فرعية بعد</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الرابط</TableHead>
                  <TableHead>المنتجات</TableHead>
                  <TableHead>مفعّل</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(s => (
                  <TableRow key={s.id} data-testid={`store-row-${s.id}`}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <a href={s.url} target="_blank" rel="noreferrer" className="font-mono text-xs flex items-center gap-1" dir="ltr">
                        {s.url} <ExternalLink className="w-3 h-3" />
                      </a>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{s.products_count || 0}</Badge></TableCell>
                    <TableCell>
                      <Switch checked={!!s.enabled} onCheckedChange={() => toggleEnabled(s)} data-testid={`store-enabled-${s.id}`} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => openCatalog(s)} data-testid={`store-catalog-${s.id}`}>
                          <PackageSearch className="w-3.5 h-3.5" /> الكتالوج
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => remove(s)} data-testid={`store-delete-${s.id}`}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl" data-testid="store-create-dialog">
          <DialogHeader><DialogTitle>متجر فرعي جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الاسم</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="store-name-input" />
            </div>
            <div>
              <Label>الرابط (أحرف لاتينية صغيرة وأرقام وشرطات)</Label>
              <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} dir="ltr" placeholder="my-shop" data-testid="store-slug-input" />
            </div>
            <div>
              <Label>الوصف (اختياري)</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={saving} data-testid="store-save-btn">{saving ? 'جارٍ الحفظ…' : 'إنشاء'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!catalog} onOpenChange={(o) => !o && setCatalog(null)}>
        <DialogContent dir="rtl" className="max-w-2xl" data-testid="catalog-dialog">
          <DialogHeader><DialogTitle>كتالوج «{catalog?.store?.name}»</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[65vh] overflow-y-auto">
            <div>
              <h4 className="text-sm font-medium mb-2">المنتجات المرتبطة ({catalog?.items?.length || 0})</h4>
              {catalog?.items?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المنتج</TableHead>
                      <TableHead>السعر</TableHead>
                      <TableHead>المخزون</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalog.items.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>{p.name_ar || p.name_en}</TableCell>
                        <TableCell dir="ltr">{p.retail_price}</TableCell>
                        <TableCell dir="ltr">{p.quantity}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => detach(p.id)} data-testid={`detach-${p.id}`}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="text-xs text-muted-foreground">الكتالوج فارغ — اربط منتجات من الأسفل</p>}
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">إضافة منتجات</h4>
              <Input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="ابحث بالاسم…" className="mb-2" data-testid="product-search-input" />
              <div className="space-y-1 max-h-48 overflow-y-auto border rounded p-2">
                {filteredProducts.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5">
                    <Checkbox checked={!!picked[p.id]} onCheckedChange={v => setPicked({ ...picked, [p.id]: !!v })} data-testid={`pick-${p.id}`} />
                    <span className="flex-1">{p.name_ar || p.name_en}</span>
                    <span className="text-xs text-muted-foreground" dir="ltr">{p.retail_price} دج</span>
                  </label>
                ))}
                {filteredProducts.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">لا نتائج</p>}
              </div>
              <Button className="mt-2" size="sm" onClick={attach} disabled={saving} data-testid="attach-btn">
                {saving ? 'جارٍ الربط…' : `ربط المحدد (${Object.values(picked).filter(Boolean).length})`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
