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

  // p305: food cost report + waste
  const [fcDays, setFcDays] = useState(30);
  const [fcstDays, setFcstDays] = useState(30);
  const [forecast, setForecast] = useState(null);
  const [fcReport, setFcReport] = useState(null);
  const [wasteList, setWasteList] = useState([]);
  const [showWasteDialog, setShowWasteDialog] = useState(false);
  const [wProductId, setWProductId] = useState('');
  const [wQty, setWQty] = useState('1');
  const [wReason, setWReason] = useState('');

  // p308: modifier groups editor state
  const [modRecipe, setModRecipe] = useState(null);
  const [modGroups, setModGroups] = useState([]);
  const [modSaving, setModSaving] = useState(false);

  // p309: combo meal wizard state
  const [showComboDialog, setShowComboDialog] = useState(false);
  const [cName, setCName] = useState('');
  const [cPrice, setCPrice] = useState('');
  const [cItems, setCItems] = useState([{ product_id: '', quantity: '1' }, { product_id: '', quantity: '1' }]);
  const [cSaving, setCSaving] = useState(false);

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

  const fetchFc = useCallback(async (d) => {
    try {
      const [rep, ws] = await Promise.all([
        apiClient.get(`/production/food-cost-report?days=${d}`),
        apiClient.get(`/production/waste?days=${d}`),
      ]);
      setFcReport(rep.data || null);
      setWasteList(Array.isArray(ws.data) ? ws.data : []);
    } catch (e) { /* silent */ }
  }, []);

  const doWaste = async () => {
    try {
      await apiClient.post('/production/waste', { product_id: wProductId, quantity: Number(wQty) || 0, reason: wReason.trim() });
      toast.success(isAr ? 'سُجّل الهالك' : 'Dechet enregistre');
      setShowWasteDialog(false); setWReason(''); setWQty('1');
      fetchFc(fcDays);
    } catch (e) { toast.error(errText(e)); }
  };

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchFc(fcDays); }, [fetchFc, fcDays]);

  const fetchFcst = useCallback(async (d) => {
    try {
      const r = await apiClient.get(`/production/demand-forecast?days=${d}&cover=7`);
      setForecast(r.data || null);
    } catch (e) { /* silent */ }
  }, []);
  useEffect(() => { fetchFcst(fcstDays); }, [fetchFcst, fcstDays]);

  // p308: modifier groups editor (إضافات/بدائل الطبق — مثل جبن إضافي أو حجم أكبر)
  const openMods = async (r) => {
    setModRecipe(r);
    try {
      const res = await apiClient.get(`/restaurant/products/${r.product_id}/modifier-groups`);
      setModGroups(res.data.groups || []);
    } catch { setModGroups([]); }
  };
  const saveMods = async () => {
    for (const g of modGroups) {
      if (!(g.name || '').trim()) { toast.error(isAr ? 'اسم المجموعة مطلوب' : 'Nom du groupe requis'); return; }
      for (const op of (g.options || [])) {
        if (!(op.name || '').trim()) { toast.error(isAr ? 'اسم الخيار مطلوب' : 'Nom requis'); return; }
      }
    }
    setModSaving(true);
    try {
      await apiClient.put(`/restaurant/products/${modRecipe.product_id}/modifier-groups`, { groups: modGroups });
      toast.success(isAr ? 'حُفظت الإضافات' : 'Options enregistrees');
      setModRecipe(null);
    } catch (e) { toast.error(errText(e)); }
    finally { setModSaving(false); }
  };

  // p309: combo = منتج حزمة قابل للبيع + وصفة مكوّناتها منتجات قابلة للبيع
  // البيع يستهلك المكونات تلقائيًا ويكلّف السطر بتكلفتها الحقيقية (p303)
  const saveCombo = async () => {
    const comps = cItems.filter(c => c.product_id && Number(c.quantity) > 0)
      .map(c => ({ product_id: c.product_id, quantity: Number(c.quantity) }));
    if (!cName.trim() || !(Number(cPrice) > 0) || comps.length < 2) {
      toast.error(isAr ? 'الاسم + السعر + مكوّنان على الأقل' : 'Nom + prix + 2 composants min'); return;
    }
    setCSaving(true);
    try {
      const pr = await apiClient.post('/products', {
        name_en: cName.trim(), name_ar: cName.trim(),
        retail_price: Number(cPrice), purchase_price: 0,
        quantity: 0, is_non_stockable: true,
      });
      await apiClient.post('/production/recipes', {
        product_id: pr.data.id, name: cName.trim(), output_qty: 1, components: comps,
      });
      toast.success(isAr ? 'أُنشئت وجبة Combo' : 'Combo cree');
      setShowComboDialog(false);
      setCName(''); setCPrice('');
      setCItems([{ product_id: '', quantity: '1' }, { product_id: '', quantity: '1' }]);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
    finally { setCSaving(false); }
  };

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
          <Button onClick={() => setShowComboDialog(true)} variant="outline" className="gap-1" data-testid="combo-create-btn"><Plus className="h-4 w-4" />{isAr ? 'وجبة Combo' : 'Combo'}</Button>
        </div>

        <Tabs defaultValue="recipes">
          <TabsList>
            <TabsTrigger value="recipes">{isAr ? 'الوصفات' : 'Recettes'}</TabsTrigger>
            <TabsTrigger value="orders">{isAr ? 'أوامر الإنتاج' : 'Ordres'}</TabsTrigger>
            <TabsTrigger value="foodcost" data-testid="foodcost-tab-trigger">{isAr ? 'تكلفة الطعام' : 'Food Cost'}</TabsTrigger>
            <TabsTrigger value="forecast" data-testid="forecast-tab-trigger">{isAr ? 'توقع الطلب' : 'Prevision'}</TabsTrigger>
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
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    <div>{isAr ? 'التكلفة الحية' : 'Cout live'}: <span className="font-bold text-foreground" data-testid={`live-cost-${r.id}`}>{r.live_unit_cost ?? r.unit_cost} {isAr ? 'دج' : 'DA'}</span></div>
                    {(r.dish_price > 0) && (
                      <div className="mt-1" data-testid={`margin-${r.id}`}>{isAr ? 'سعر البيع' : 'Prix'}: {r.dish_price} · {isAr ? 'الهامش' : 'Marge'}: <span className={(r.margin ?? 0) >= 0 ? 'font-bold text-emerald-600' : 'font-bold text-destructive'}>{r.margin_pct}%</span> · FC: {r.food_cost_pct}%</div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" className="gap-1" data-testid={`run-btn-${r.id}`} onClick={() => openRun(r)}><Play className="h-3 w-3" />{isAr ? 'إنتاج' : 'Produire'}</Button>
                    <Button size="sm" variant="outline" data-testid={`mods-btn-${r.id}`} onClick={() => openMods(r)}>{isAr ? 'الإضافات' : 'Options'}</Button>
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
          <TabsContent value="foodcost" className="space-y-2 mt-3" data-testid="foodcost-tab">
            <div className="flex gap-1">
              {[7, 30, 90].map(d => (
                <Button key={d} size="sm" variant={fcDays === d ? 'default' : 'outline'} onClick={() => setFcDays(d)} data-testid={`fc-days-${d}`}>{d}{isAr ? ' يوم' : 'j'}</Button>
              ))}
              <Button size="sm" variant="outline" className="mr-auto gap-1" onClick={() => setShowWasteDialog(true)} data-testid="waste-add-btn"><Plus className="h-3 w-3" />{isAr ? 'تسجيل هالك' : 'Dechet'}</Button>
            </div>
            {fcReport && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Card><CardContent className="p-3 text-center"><div className="text-xs text-muted-foreground">{isAr ? 'إيراد الأطباق' : 'Revenus'}</div><div className="font-bold" data-testid="fc-revenue">{fcReport.summary.revenue}</div></CardContent></Card>
                  <Card><CardContent className="p-3 text-center"><div className="text-xs text-muted-foreground">{isAr ? 'تكلفة الطعام' : 'Cout'}</div><div className="font-bold" data-testid="fc-cost">{fcReport.summary.cost}</div></CardContent></Card>
                  <Card><CardContent className="p-3 text-center"><div className="text-xs text-muted-foreground">Food Cost %</div><div className="font-bold" data-testid="fc-pct">{fcReport.summary.food_cost_pct ?? '—'}%</div></CardContent></Card>
                  <Card><CardContent className="p-3 text-center"><div className="text-xs text-muted-foreground">{isAr ? 'الهالك' : 'Dechets'}</div><div className="font-bold" data-testid="fc-waste">{fcReport.summary.waste_total}</div></CardContent></Card>
                </div>
                {fcReport.dishes.length === 0 && (
                  <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">{isAr ? 'لا مبيعات أطباق في الفترة — بيانات التكلفة تُجمع من المبيعات المربوطة بالوصفات' : 'Aucune vente sur la periode'}</CardContent></Card>
                )}
                {fcReport.dishes.map(d => (
                  <Card key={d.product_id} data-testid={`fc-dish-${d.product_id}`}>
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{d.product_name} <span className="text-muted-foreground">×{d.qty}</span></div>
                        <div className="text-xs text-muted-foreground mt-1">{isAr ? 'إيراد' : 'Rev'}: {d.revenue} · {isAr ? 'تكلفة' : 'Cout'}: {d.cost}</div>
                      </div>
                      <div className="text-xs whitespace-nowrap">
                        <span className="font-bold">FC: {d.food_cost_pct ?? '—'}%</span>
                        <span className={d.margin >= 0 ? 'text-emerald-600 font-bold' : 'text-destructive font-bold'}> · {d.margin} {isAr ? 'دج' : 'DA'}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {fcReport.ingredients.length > 0 && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="font-semibold text-sm mb-2">{isAr ? 'الاستهلاك النظري للمكونات' : 'Consommation theorique'}</div>
                      {fcReport.ingredients.map(ing => (
                        <div key={ing.product_id} className="flex justify-between text-xs py-1 border-b last:border-0">
                          <span>{ing.product_name}</span>
                          <span className="text-muted-foreground">{ing.qty} · {ing.cost} {isAr ? 'دج' : 'DA'} · {isAr ? 'المخزون' : 'Stock'}: {ing.stock_now ?? '—'}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {wasteList.length > 0 && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="font-semibold text-sm mb-2">{isAr ? 'سجل الهالك' : 'Dechets recents'}</div>
                      {wasteList.slice(0, 10).map(w => (
                        <div key={w.id} className="flex justify-between text-xs py-1 border-b last:border-0">
                          <span>{w.product_name}{w.reason ? ` — ${w.reason}` : ''}</span>
                          <span className="text-muted-foreground">{w.quantity} · {w.total_cost} {isAr ? 'دج' : 'DA'}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
          <TabsContent value="forecast" className="space-y-3 mt-3" data-testid="forecast-tab">
            <div className="flex gap-2 flex-wrap">
              {[14, 30, 60].map(d => (
                <Button key={d} size="sm" variant={fcstDays === d ? 'default' : 'outline'} onClick={() => setFcstDays(d)} data-testid={`fcst-days-${d}`}>{d}{isAr ? ' يوم' : 'j'}</Button>
              ))}
            </div>
            {forecast && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Card><CardContent className="p-3 text-center"><div className="text-lg font-bold" data-testid="fcst-ingredients">{forecast.summary.ingredients}</div><div className="text-xs text-muted-foreground">{isAr ? 'مكوّن مستهلك' : 'Ingredients'}</div></CardContent></Card>
                  <Card><CardContent className="p-3 text-center"><div className={`text-lg font-bold ${forecast.summary.urgent > 0 ? 'text-destructive' : ''}`} data-testid="fcst-urgent">{forecast.summary.urgent}</div><div className="text-xs text-muted-foreground">{isAr ? 'يحتاج شراء عاجل' : 'Urgent'}</div></CardContent></Card>
                  <Card><CardContent className="p-3 text-center"><div className="text-lg font-bold" data-testid="fcst-cost">{forecast.summary.est_purchase_cost}</div><div className="text-xs text-muted-foreground">{isAr ? 'تكلفة شراء تقديرية' : 'Cout estime'}</div></CardContent></Card>
                </div>
                <Card>
                  <CardContent className="p-3 space-y-2">
                    <h3 className="font-semibold text-sm">{isAr ? 'قائمة المشتريات المقترحة (تغطية 7 أيام)' : 'Achats suggeres (7j)'}</h3>
                    {forecast.items.length === 0 && <p className="text-xs text-muted-foreground">{isAr ? 'لا استهلاك وصفات في الفترة' : 'Aucune consommation'}</p>}
                    {forecast.items.map(i => (
                      <div key={i.product_id} className={`flex items-center justify-between text-sm border-b pb-1 ${i.urgent ? 'text-destructive' : ''}`} data-testid={`fcst-item-${i.product_id}`}>
                        <span>{i.product_name}</span>
                        <span className="text-xs">
                          {isAr ? 'يوميًا' : '/j'} {i.avg_daily} · {isAr ? 'مخزون' : 'stock'} {i.stock_now}
                          {i.days_remaining != null && <> · {isAr ? 'يكفي' : 'reste'} {i.days_remaining}{isAr ? ' يوم' : 'j'}</>}
                          {i.suggested_qty > 0 && <b> · {isAr ? 'اقتراح' : 'sugg.'} {i.suggested_qty}</b>}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* p305: waste dialog */}
        <Dialog open={showWasteDialog} onOpenChange={setShowWasteDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>{isAr ? 'تسجيل هالك' : 'Enregistrer un dechet'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{isAr ? 'المكوّن' : 'Composant'}</Label>
                <Select value={wProductId} onValueChange={setWProductId}>
                  <SelectTrigger data-testid="waste-product-select"><SelectValue placeholder={isAr ? 'اختر المنتج' : 'Choisir'} /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {products.filter(p => !p.is_non_stockable).map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar || p.name_en || p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isAr ? 'الكمية' : 'Quantite'}</Label>
                <Input type="number" min="0.01" step="0.01" dir="ltr" value={wQty} onChange={e => setWQty(e.target.value)} data-testid="waste-qty-input" />
              </div>
              <div>
                <Label>{isAr ? 'السبب' : 'Raison'}</Label>
                <Input value={wReason} onChange={e => setWReason(e.target.value)} placeholder={isAr ? 'تالف / مسكوب / منتهي الصلاحية' : 'Perime / renverse'} data-testid="waste-reason-input" />
              </div>
              <Button onClick={doWaste} className="w-full" data-testid="waste-confirm-btn">{isAr ? 'تسجيل' : 'Enregistrer'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* p308: modifier groups editor */}
        <Dialog open={!!modRecipe} onOpenChange={(o) => { if (!o) setModRecipe(null); }}>
          <DialogContent className="max-w-lg" data-testid="mods-dialog">
            <DialogHeader><DialogTitle>{isAr ? 'إضافات وبدائل' : 'Options'} — {modRecipe?.product_name}</DialogTitle></DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {modGroups.map((g, gi) => (
                <div key={gi} className="border rounded p-2 space-y-2" data-testid={`mods-group-${gi}`}>
                  <div className="flex gap-2 items-center">
                    <Input value={g.name} placeholder={isAr ? 'اسم المجموعة (إضافات / الحجم)' : 'Nom du groupe'} onChange={e => setModGroups(prev => prev.map((x, i) => i === gi ? { ...x, name: e.target.value } : x))} data-testid={`mods-group-name-${gi}`} />
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <input type="checkbox" checked={!!g.required} onChange={e => setModGroups(prev => prev.map((x, i) => i === gi ? { ...x, required: e.target.checked } : x))} data-testid={`mods-group-required-${gi}`} />
                      {isAr ? 'إجباري' : 'Requis'}
                    </label>
                    <Input type="number" min="1" className="w-20" value={g.max_select} title={isAr ? 'أقصى اختيار' : 'Max'} onChange={e => setModGroups(prev => prev.map((x, i) => i === gi ? { ...x, max_select: Math.max(1, parseInt(e.target.value) || 1) } : x))} data-testid={`mods-group-max-${gi}`} />
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setModGroups(prev => prev.filter((_, i) => i !== gi))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  {(g.options || []).map((op, oi) => (
                    <div key={oi} className="flex gap-2 items-center pr-3">
                      <Input value={op.name} placeholder={isAr ? 'الخيار (جبن إضافي)' : 'Option'} onChange={e => setModGroups(prev => prev.map((x, i) => i === gi ? { ...x, options: x.options.map((o2, j) => j === oi ? { ...o2, name: e.target.value } : o2) } : x))} data-testid={`mods-option-name-${gi}-${oi}`} />
                      <Input type="number" className="w-24" value={op.price_delta} title={isAr ? 'فرق السعر' : 'Delta prix'} onChange={e => setModGroups(prev => prev.map((x, i) => i === gi ? { ...x, options: x.options.map((o2, j) => j === oi ? { ...o2, price_delta: parseFloat(e.target.value) || 0 } : o2) } : x))} data-testid={`mods-option-price-${gi}-${oi}`} />
                      <Select value={op.product_id || 'none'} onValueChange={v => setModGroups(prev => prev.map((x, i) => i === gi ? { ...x, options: x.options.map((o2, j) => j === oi ? { ...o2, product_id: v === 'none' ? null : v } : o2) } : x))}>
                        <SelectTrigger className="w-40" data-testid={`mods-option-product-${gi}-${oi}`}><SelectValue placeholder={isAr ? 'مكوّن؟' : 'Ingredient?'} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{isAr ? 'بدون خصم مخزون' : 'Sans stock'}</SelectItem>
                          {products.map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setModGroups(prev => prev.map((x, i) => i === gi ? { ...x, options: x.options.filter((_, j) => j !== oi) } : x))}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setModGroups(prev => prev.map((x, i) => i === gi ? { ...x, options: [...(x.options || []), { name: '', price_delta: 0, product_id: null, qty: 1 }] } : x))} data-testid={`mods-add-option-${gi}`}>
                    <Plus className="h-3 w-3 ml-1" />{isAr ? 'خيار' : 'Option'}
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="w-full" onClick={() => setModGroups(prev => [...prev, { name: '', required: false, max_select: 1, options: [] }])} data-testid="mods-add-group">
                <Plus className="h-3 w-3 ml-1" />{isAr ? 'مجموعة إضافات جديدة' : 'Nouveau groupe'}
              </Button>
              <Button className="w-full" onClick={saveMods} disabled={modSaving} data-testid="mods-save-btn">{isAr ? 'حفظ الإضافات' : 'Enregistrer'}</Button>
            </div>
          </DialogContent>
        </Dialog>

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

        {/* p309: combo meal wizard */}
        <Dialog open={showComboDialog} onOpenChange={setShowComboDialog}>
          <DialogContent className="max-w-md" data-testid="combo-dialog">
            <DialogHeader><DialogTitle>{isAr ? 'وجبة Combo جديدة' : 'Nouveau combo'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{isAr ? 'اسم الوجبة' : 'Nom du combo'}</Label>
                <Input value={cName} onChange={e => setCName(e.target.value)} placeholder={isAr ? 'مثال: وجبة بيتزا + مشروب' : 'Ex: Menu pizza + boisson'} data-testid="combo-name-input" />
              </div>
              <div>
                <Label>{isAr ? 'سعر الوجبة (دج)' : 'Prix du combo'}</Label>
                <Input type="number" min="0" step="0.01" value={cPrice} onChange={e => setCPrice(e.target.value)} dir="ltr" data-testid="combo-price-input" />
              </div>
              <div className="space-y-2">
                <Label>{isAr ? 'مكوّنات الوجبة' : 'Composants'}</Label>
                {cItems.map((c, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Select value={c.product_id} onValueChange={v => setCItems(prev => prev.map((x, j) => j === i ? { ...x, product_id: v } : x))}>
                      <SelectTrigger className="flex-1" data-testid={`combo-comp-${i}`}><SelectValue placeholder={isAr ? 'المنتج' : 'Produit'} /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar || p.name_en || p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" min="0.01" step="0.01" className="w-20" dir="ltr" value={c.quantity}
                      onChange={e => setCItems(prev => prev.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                      data-testid={`combo-qty-${i}`} />
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={cItems.length <= 2}
                      onClick={() => setCItems(prev => prev.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="gap-1" data-testid="combo-add-item"
                  onClick={() => setCItems(prev => [...prev, { product_id: '', quantity: '1' }])}>
                  <Plus className="h-3 w-3" />{isAr ? 'إضافة مكوّن' : 'Ajouter'}
                </Button>
                {Number(cPrice) > 0 && (
                  <p className="text-xs text-muted-foreground" data-testid="combo-cost-preview">
                    {isAr ? 'التكلفة الحالية للمكونات' : 'Cout actuel'}: {' '}
                    {cItems.reduce((sum, c) => {
                      const pr = products.find(p => p.id === c.product_id);
                      return sum + (pr ? (pr.purchase_price || 0) * (Number(c.quantity) || 0) : 0);
                    }, 0).toFixed(2)} {isAr ? 'دج' : 'DA'}
                  </p>
                )}
              </div>
              <Button onClick={saveCombo} className="w-full" disabled={cSaving} data-testid="combo-save-btn">{isAr ? 'إنشاء الوجبة' : 'Creer le combo'}</Button>
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
