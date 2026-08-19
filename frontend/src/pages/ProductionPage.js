// p188: Production (BOM) — recipes + manufacturing runs
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { errText } from '../lib/errorText';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { Factory, Plus, Trash2, Play, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const ProductionPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [recipes, setRecipes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showRecipeDialog, setShowRecipeDialog] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [rName, setRName] = useState('');
  const [rProductId, setRProductId] = useState('');
  const [rOutputQty, setROutputQty] = useState('1');
  const [rComponents, setRComponents] = useState([{ product_id: '', quantity: '1' }]);

  const [runRecipe, setRunRecipe] = useState(null);
  const [runBatches, setRunBatches] = useState('1');
  const [runMax, setRunMax] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [r, o, p] = await Promise.all([
        apiClient.get('/production/recipes'),
        apiClient.get('/production/orders'),
        apiClient.get('/products'),
      ]);
      setRecipes(r.data || []);
      setOrders(o.data || []);
      setProducts(Array.isArray(p.data) ? p.data : (p.data?.products || []));
    } catch (e) { toast.error(errText(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditingRecipe(null); setRName(''); setRProductId(''); setROutputQty('1');
    setRComponents([{ product_id: '', quantity: '1' }]);
    setShowRecipeDialog(true);
  };

  const openEdit = (r) => {
    setEditingRecipe(r); setRName(r.name); setRProductId(r.product_id);
    setROutputQty(String(r.output_qty));
    setRComponents(r.components.map(c => ({ product_id: c.product_id, quantity: String(c.quantity) })));
    setShowRecipeDialog(true);
  };

  const saveRecipe = async () => {
    const comps = rComponents.filter(c => c.product_id && Number(c.quantity) > 0)
      .map(c => ({ product_id: c.product_id, quantity: Number(c.quantity) }));
    if (!rName.trim() || comps.length === 0 || (!editingRecipe && !rProductId)) {
      toast.error(isAr ? 'أكمل الحقول' : 'Completez les champs'); return;
    }
    try {
      if (editingRecipe) {
        await apiClient.put(`/production/recipes/${editingRecipe.id}`, { name: rName.trim(), output_qty: Number(rOutputQty) || 1, components: comps });
      } else {
        await apiClient.post('/production/recipes', { product_id: rProductId, name: rName.trim(), output_qty: Number(rOutputQty) || 1, components: comps });
      }
      toast.success(isAr ? 'حُفظت الوصفة' : 'Recette enregistree');
      setShowRecipeDialog(false);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const deleteRecipe = async (r) => {
    try {
      await apiClient.delete(`/production/recipes/${r.id}`);
      toast.success(isAr ? 'حُذفت' : 'Supprimee');
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const openRun = async (r) => {
    setRunRecipe(r); setRunBatches('1'); setRunMax(null);
    try {
      const res = await apiClient.get(`/production/recipes/${r.id}/max-batches`);
      setRunMax(res.data);
    } catch (e) { toast.error(errText(e)); }
  };

  const doRun = async () => {
    try {
      const res = await apiClient.post('/production/run', { recipe_id: runRecipe.id, batches: Number(runBatches) || 1 });
      toast.success(isAr ? `تم الإنتاج ${res.data.code} — +${res.data.output_qty} ${res.data.product_name}` : `Production ${res.data.code} OK`);
      setRunRecipe(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const pName = (pid) => {
    const p = products.find(x => x.id === pid);
    return p ? (p.name_ar || p.name_en || p.name) : pid;
  };

  return (
    <Layout>
      <div className="p-4 space-y-4" dir={isAr ? 'rtl' : 'ltr'} data-testid="production-page">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2"><Factory className="h-5 w-5" />{isAr ? 'الإنتاج' : 'Production'}</h1>
          <Button onClick={openCreate} className="gap-1" data-testid="recipe-create-btn"><Plus className="h-4 w-4" />{isAr ? 'وصفة جديدة' : 'Nouvelle recette'}</Button>
        </div>

        <Tabs defaultValue="recipes">
          <TabsList>
            <TabsTrigger value="recipes">{isAr ? 'الوصفات' : 'Recettes'}</TabsTrigger>
            <TabsTrigger value="orders">{isAr ? 'أوامر الإنتاج' : 'Ordres'}</TabsTrigger>
          </TabsList>

          <TabsContent value="recipes" className="space-y-2 mt-3">
            {recipes.length === 0 && !loading && (
              <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">{isAr ? 'لا وصفات بعد — أنشئ وصفة لمنتج نهائي' : 'Aucune recette'}</CardContent></Card>
            )}
            {recipes.map(r => (
              <Card key={r.id}>
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      {r.name}
                      <Badge variant="secondary" className="text-[10px]">{r.product_name} ×{r.output_qty}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {r.components.map(c => `${c.product_name} (${c.quantity})`).join(' + ')}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">{isAr ? 'التكلفة' : 'Cout'}: <span className="font-bold text-foreground">{r.unit_cost} {isAr ? 'دج' : 'DA'}</span></div>
                  <div className="flex gap-1">
                    <Button size="sm" className="gap-1" data-testid={`run-btn-${r.id}`} onClick={() => openRun(r)}><Play className="h-3 w-3" />{isAr ? 'إنتاج' : 'Produire'}</Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteRecipe(r)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="orders" className="space-y-2 mt-3">
            {orders.length === 0 && !loading && (
              <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">{isAr ? 'لا أوامر إنتاج بعد' : 'Aucun ordre'}</CardContent></Card>
            )}
            {orders.map(o => (
              <Card key={o.id}>
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">{o.code} — {o.product_name} <span className="text-muted-foreground">×{o.output_qty}</span></div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {o.components.map(c => `${c.product_name}: ${c.consumed}`).join(' | ')}
                    </div>
                  </div>
                  <div className="text-left text-xs whitespace-nowrap">
                    <div className="font-bold">{o.total_cost} {isAr ? 'دج' : 'DA'}</div>
                    <div className="text-muted-foreground">{new Date(o.created_at).toLocaleString(isAr ? 'ar-DZ' : 'fr-FR')}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>

        {/* Recipe create/edit dialog */}
        <Dialog open={showRecipeDialog} onOpenChange={setShowRecipeDialog}>
          <DialogContent className="max-w-lg" data-testid="recipe-dialog">
            <DialogHeader><DialogTitle>{editingRecipe ? (isAr ? 'تعديل الوصفة' : 'Modifier') : (isAr ? 'وصفة إنتاج جديدة' : 'Nouvelle recette')}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{isAr ? 'اسم الوصفة' : 'Nom'}</Label>
                <Input value={rName} onChange={e => setRName(e.target.value)} data-testid="recipe-name-input" />
              </div>
              {!editingRecipe && (
                <div>
                  <Label>{isAr ? 'المنتج النهائي' : 'Produit fini'}</Label>
                  <Select value={rProductId} onValueChange={setRProductId}>
                    <SelectTrigger data-testid="recipe-product-select"><SelectValue placeholder={isAr ? 'اختر المنتج' : 'Choisir'} /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar || p.name_en || p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>{isAr ? 'الكمية المنتَجة لكل دفعة' : 'Quantite par lot'}</Label>
                <Input type="number" min="0.01" step="0.01" value={rOutputQty} onChange={e => setROutputQty(e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{isAr ? 'المكوّنات (لكل دفعة)' : 'Composants (par lot)'}</Label>
                {rComponents.map((c, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Select value={c.product_id} onValueChange={v => setRComponents(prev => prev.map((x, j) => j === i ? { ...x, product_id: v } : x))}>
                      <SelectTrigger className="flex-1" data-testid={`comp-select-${i}`}><SelectValue placeholder={isAr ? 'المكوّن' : 'Composant'} /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {products.filter(p => p.id !== rProductId).map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar || p.name_en || p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" min="0.01" step="0.01" className="w-24" dir="ltr" value={c.quantity}
                      onChange={e => setRComponents(prev => prev.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                      data-testid={`comp-qty-${i}`} />
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={rComponents.length === 1}
                      onClick={() => setRComponents(prev => prev.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="gap-1" data-testid="comp-add-btn"
                  onClick={() => setRComponents(prev => [...prev, { product_id: '', quantity: '1' }])}>
                  <Plus className="h-3 w-3" />{isAr ? 'إضافة مكوّن' : 'Ajouter'}
                </Button>
              </div>
              <Button onClick={saveRecipe} className="w-full" data-testid="recipe-save-btn">{isAr ? 'حفظ الوصفة' : 'Enregistrer'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Run dialog */}
        <Dialog open={!!runRecipe} onOpenChange={(o) => { if (!o) setRunRecipe(null); }}>
          <DialogContent className="max-w-sm" data-testid="run-dialog">
            <DialogHeader><DialogTitle>{isAr ? 'تشغيل الإنتاج' : 'Lancer la production'}</DialogTitle></DialogHeader>
            {runRecipe && (
              <div className="space-y-3">
                <p className="text-sm font-semibold">{runRecipe.name}</p>
                {runMax && (
                  <div className="text-xs space-y-1 border rounded-lg p-2">
                    {runMax.components.map(c => (
                      <div key={c.product_id} className="flex justify-between">
                        <span>{c.product_name}</span>
                        <span className={c.stock < c.needed_per_batch ? 'text-destructive font-bold' : ''}>{c.stock} / {c.needed_per_batch}</span>
                      </div>
                    ))}
                    <div className="border-t pt-1 font-bold">{isAr ? 'أقصى دفعات ممكنة' : 'Lots max'}: {runMax.max_batches}</div>
                  </div>
                )}
                <div>
                  <Label>{isAr ? 'عدد الدفعات' : 'Nombre de lots'}</Label>
                  <Input type="number" min="1" value={runBatches} onChange={e => setRunBatches(e.target.value)} dir="ltr" data-testid="run-batches-input" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {isAr ? `سيُنتَج: ${(Number(runBatches) || 0) * runRecipe.output_qty} ${runRecipe.product_name}` : `Production: ${(Number(runBatches) || 0) * runRecipe.output_qty}`}
                </p>
                <Button onClick={doRun} className="w-full gap-1" data-testid="run-confirm-btn"><Play className="h-4 w-4" />{isAr ? 'تنفيذ' : 'Executer'}</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default ProductionPage;
