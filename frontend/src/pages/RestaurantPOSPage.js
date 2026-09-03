// p339: نقطة بيع مخصصة للمطاعم — وضع طاولات / وضع سريع، شبكة مصورة بأهداف لمس كبيرة، الأكثر مبيعًا أولًا
import { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../lib/apiClient';
import { errText } from '../lib/errorText';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { UtensilsCrossed, Plus, Minus, Send, Trash2, RefreshCw, Search, Banknote, Zap, Percent, ReceiptText, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { startRealtime, onEvent, stopRealtime } from '../lib/realtime';

const fmt = (n) => new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 2 }).format(n || 0);

export default function RestaurantPOSPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [mode, setMode] = useState('tables'); // tables | fast
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [topIds, setTopIds] = useState([]);
  const [payMode, setPayMode] = useState('postpaid');
  const [selTable, setSelTable] = useState(null);
  const [cart, setCart] = useState([]); // {key, product_id, name, price, qty, mods}
  const [search, setSearch] = useState('');
  const [fam, setFam] = useState('');
  const [modFor, setModFor] = useState(null);
  const [modSel, setModSel] = useState({});
  const [sending, setSending] = useState(false);
  const [bill, setBill] = useState(null); // order being billed (table mode)
  const [discType, setDiscType] = useState('percent');
  const [discValue, setDiscValue] = useState('');
  const [custPhone, setCustPhone] = useState('');  // p356: ولاء

  const fetchAll = useCallback(async () => {
    try {
      const [t, o, p, tp, pm] = await Promise.all([
        apiClient.get('/restaurant/tables'),
        apiClient.get('/restaurant/kitchen-orders?all=1'),
        apiClient.get('/products?limit=1000'),
        apiClient.get('/restaurant/top-sellers').catch(() => ({ data: { top: [] } })),
        apiClient.get('/restaurant/settings/orders').catch(() => ({ data: {} })),
      ]);
      setTables(t.data || []);
      setOrders((o.data || []).filter(x => !['served', 'cancelled'].includes(x.status)));
      setProducts(((p.data && p.data.items) || p.data || []).filter(x => Number(x.retail_price) > 0 && x.is_active !== false));
      setTopIds((tp.data?.top || []).map(x => x.product_id));
      setPayMode(pm.data?.payment_mode || 'postpaid');
    } catch (e) { /* صامت */ }
  }, []);

  useEffect(() => {
    fetchAll();
    startRealtime();
    const un1 = onEvent('kitchen_order.created', fetchAll);
    const un2 = onEvent('kitchen_order.updated', fetchAll);
    const poll = setInterval(fetchAll, 20000);
    return () => { un1 && un1(); un2 && un2(); clearInterval(poll); stopRealtime(); };
  }, [fetchAll]);

  const dishes = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const q = search.trim();
      list = list.filter(p => (p.name_ar || '').includes(q) || (p.name || '').toLowerCase().includes(q.toLowerCase()) || (p.barcode || '') === q);
    }
    if (fam) list = list.filter(p => (p.family_name || '') === fam);
    const rank = new Map(topIds.map((id, i) => [id, i]));
    return [...list].sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999));
  }, [products, search, fam, topIds]);

  const families = useMemo(() => [...new Set(products.map(p => p.family_name).filter(Boolean))], [products]);
  const tableOrder = useCallback((t) => orders.find(o => o.id === t?.active_order_id), [orders]);

  const addDish = (p, mods = []) => {
    const delta = mods.reduce((a, m) => a + (Number(m.price_delta) || 0), 0);
    const key = p.id + '|' + mods.map(m => m.option).join('+');
    setCart(prev => {
      const ex = prev.find(o => o.key === key);
      if (ex) return prev.map(o => o.key === key ? { ...o, qty: o.qty + 1 } : o);
      return [...prev, { key, product_id: p.id, name: p.name_ar || p.name || p.name_en, price: (Number(p.retail_price) || 0) + delta, qty: 1, mods }];
    });
  };
  const setQty = (key, q) => setCart(prev => q <= 0 ? prev.filter(o => o.key !== key) : prev.map(o => o.key === key ? { ...o, qty: q } : o));
  const total = cart.reduce((s, o) => s + o.price * o.qty, 0);
  const count = cart.reduce((s, o) => s + o.qty, 0);

  const payload = () => ({
    table_id: mode === 'tables' ? selTable?.id : null,
    items: cart.map(o => ({
      product_id: o.product_id, unit_price: o.price, product_name: o.name, quantity: o.qty,
      modifiers: o.mods.length ? o.mods : null,
      note: o.mods.length ? o.mods.map(m => m.option).join(' + ') : null,
    })),
    source: 'pos',
    customer_phone: custPhone.trim() || null,  // p356
  });

  const sendToKitchen = async () => {
    if (!cart.length || sending) return;
    if (mode === 'tables' && !selTable) { toast.error(isAr ? 'اختر طاولة أولًا' : 'Choisissez une table'); return; }
    setSending(true);
    try {
      const r = await apiClient.post('/restaurant/kitchen-orders', payload());
      toast.success((isAr ? 'أُرسل للمطبخ ' : 'Envoye ') + (r.data.code || ''));
      setCart([]);
      setCustPhone('');
      fetchAll();
      return r.data;
    } catch (e) { toast.error(errText(e)); }
    finally { setSending(false); }
  };

  const sendAndPay = async () => {
    const ord = await sendToKitchen();
    if (!ord) return;
    try {
      const _pr = await apiClient.post(`/restaurant/kitchen-orders/${ord.id}/pay`, { method: 'cash' });
      toast.success(isAr ? 'دُفع كاش — الطلب في المطبخ' : 'Paye cash');
      if (_pr.data?.loyalty_earned) toast.success(isAr ? `كسب الزبون ${_pr.data.loyalty_earned} نقطة ولاء` : `+${_pr.data.loyalty_earned} pts`);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const payOrder = async (oid) => {
    try {
      const _pr = await apiClient.post(`/restaurant/kitchen-orders/${oid}/pay`, { method: 'cash' });
      toast.success(isAr ? 'أُكّد الدفع' : 'Paiement confirme');
      if (_pr.data?.loyalty_earned) toast.success(isAr ? `كسب الزبون ${_pr.data.loyalty_earned} نقطة ولاء` : `+${_pr.data.loyalty_earned} pts`);
      setBill(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const applyDiscount = async (oid) => {
    try {
      await apiClient.post(`/restaurant/kitchen-orders/${oid}/discount`, { type: discType, value: Number(discValue) });
      toast.success(isAr ? 'طُبّق الخصم' : 'Remise appliquee');
      setDiscValue('');
      fetchAll();
      const cur = orders.find(o => o.id === oid);
      if (cur) setBill({ ...cur });
    } catch (e) { toast.error(errText(e)); }
  };

  const checkoutTable = async (t) => {
    try {
      await apiClient.post(`/restaurant/tables/${t.id}/checkout`, {});
      toast.success(isAr ? 'حُرّرت الطاولة' : 'Table liberee');
      setBill(null); setSelTable(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const billOrder = bill ? (orders.find(o => o.id === bill.id) || bill) : null;

  return (
    <Layout>
      <div className="p-3 space-y-3 pb-32" dir="rtl" data-testid="resto-pos-page">
        {/* header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6" />{isAr ? 'POS المطعم' : 'POS Restaurant'}
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-lg overflow-hidden" data-testid="resto-mode">
              <button onClick={() => setMode('tables')} data-testid="resto-mode-tables"
                className={`px-4 py-2 text-sm font-semibold min-h-[44px] ${mode === 'tables' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                {isAr ? 'طاولات' : 'Tables'}
              </button>
              <button onClick={() => { setMode('fast'); setSelTable(null); }} data-testid="resto-mode-fast"
                className={`px-4 py-2 text-sm font-semibold min-h-[44px] flex items-center gap-1 ${mode === 'fast' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}>
                <Zap className="h-4 w-4" />{isAr ? 'سريع' : 'Rapide'}
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAll} data-testid="resto-refresh"><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* table strip (tables mode) */}
        {mode === 'tables' && (
          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="resto-tables-strip">
            {tables.map(t => {
              const occ = !!t.active_order_id;
              const sel = selTable?.id === t.id;
              return (
                <button key={t.id} data-testid={`resto-table-${t.id}`}
                  onClick={() => setSelTable(sel ? null : t)}
                  className={`shrink-0 min-w-[84px] min-h-[56px] rounded-xl border-2 px-3 py-1 text-center transition-all ${
                    sel ? 'border-primary bg-primary/10' : occ ? 'border-amber-500 bg-amber-50/60' : 'border-emerald-500/50'}`}>
                  <div className="font-bold">{t.name}</div>
                  <div className={`text-[11px] ${occ ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {occ ? (isAr ? 'مشغولة' : 'Occ.') : (isAr ? 'فارغة' : 'Libre')}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {mode === 'tables' && selTable && tableOrder(selTable) && (
          <Button variant="outline" size="sm" className="w-full" data-testid="resto-bill-open"
            onClick={() => setBill(tableOrder(selTable))}>
            <ReceiptText className="h-4 w-4 ml-1" />
            {isAr ? `فاتورة ${selTable.name} — ${fmt((tableOrder(selTable) || {}).final_total ?? (tableOrder(selTable) || {}).total)} دج` : 'Facture'}
          </Button>
        )}

        {/* search + families */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} className="pr-9 min-h-[44px]"
              placeholder={isAr ? 'بحث فوري عن صنف...' : 'Recherche...'} data-testid="resto-search" />
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1" data-testid="resto-families">
          <button onClick={() => setFam('')} data-testid="resto-fam-all"
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${!fam ? 'bg-primary text-primary-foreground' : ''}`}>
            {isAr ? 'الكل' : 'Tout'}
          </button>
          {families.map(f => (
            <button key={f} onClick={() => setFam(fam === f ? '' : f)} data-testid={`resto-fam-${f}`}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${fam === f ? 'bg-primary text-primary-foreground' : ''}`}>
              {f}
            </button>
          ))}
        </div>

        {/* products grid — big touch targets with photos, top sellers first */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2" data-testid="resto-grid">
          {dishes.map((p, idx) => (
            <button key={p.id} data-testid={`resto-item-${p.id}`}
              onClick={() => (p.modifier_groups || []).length ? (setModFor(p), setModSel({})) : addDish(p)}
              className="relative rounded-xl border bg-card overflow-hidden text-right active:scale-95 transition-transform min-h-[110px] flex flex-col">
              {p.image_url ? (
                <img src={p.image_url} alt="" className="w-full h-20 object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-20 bg-muted flex items-center justify-center">
                  <UtensilsCrossed className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}
              {topIds.includes(p.id) && idx < 10 && (
                <span className="absolute top-1 right-1 bg-orange-500 text-white rounded-full p-1" title={isAr ? 'الأكثر مبيعًا' : 'Top'}>
                  <Flame className="h-3 w-3" />
                </span>
              )}
              <div className="p-1.5 flex-1 flex flex-col justify-between">
                <div className="text-xs font-bold leading-tight line-clamp-2">{p.name_ar || p.name || p.name_en}</div>
                <div className="text-primary font-bold text-sm">{fmt(p.retail_price)}</div>
              </div>
            </button>
          ))}
        </div>
        {dishes.length === 0 && (
          <p className="text-center text-muted-foreground py-8" data-testid="resto-empty">{isAr ? 'لا أصناف مطابقة' : 'Aucun article'}</p>
        )}

        {/* cart bar */}
        {cart.length > 0 && (
          <div className="fixed bottom-16 md:bottom-2 inset-x-2 z-20 bg-card border rounded-2xl shadow-xl p-3 space-y-2 max-w-3xl mx-auto" data-testid="resto-cart">
            <div className="max-h-32 overflow-y-auto divide-y">
              {cart.map(o => (
                <div key={o.key} className="flex items-center gap-2 py-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{o.name}</p>
                    {o.mods.length > 0 && <p className="text-[11px] text-muted-foreground truncate">{o.mods.map(m => m.option).join(' + ')}</p>}
                  </div>
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setQty(o.key, o.qty - 1)} data-testid={`resto-minus-${o.product_id}`}>
                    {o.qty === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                  </Button>
                  <span className="w-6 text-center font-bold">{o.qty}</span>
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setQty(o.key, o.qty + 1)} data-testid={`resto-plus-${o.product_id}`}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Input
              value={custPhone}
              onChange={e => setCustPhone(e.target.value)}
              placeholder={isAr ? 'هاتف الزبون (اختياري — لنقاط الولاء)' : 'Tel client (fidelite)'}
              className="text-center"
              data-testid="resto-cust-phone"
              inputMode="tel"
            />
            <div className="flex gap-2">
              {mode === 'fast' ? (
                <>
                  <Button className="flex-1 min-h-[52px] text-base" disabled={sending} onClick={sendAndPay} data-testid="resto-send-pay">
                    <Banknote className="h-5 w-5 ml-1" />{isAr ? `دفع كاش — ${fmt(total)} دج` : `Cash — ${fmt(total)}`}
                  </Button>
                  <Button variant="outline" className="flex-1 min-h-[52px] text-base" disabled={sending} onClick={sendToKitchen} data-testid="resto-send-only">
                    <Send className="h-5 w-5 ml-1" />{isAr ? 'للمطبخ فقط' : 'Cuisine'}
                  </Button>
                </>
              ) : (
                <Button className="w-full min-h-[52px] text-base" disabled={sending || !selTable} onClick={sendToKitchen} data-testid="resto-send">
                  <Send className="h-5 w-5 ml-1" />
                  {selTable
                    ? (isAr ? `إرسال لطاولة ${selTable.name} — ${count} صنف — ${fmt(total)} دج` : `Table ${selTable.name} — ${fmt(total)}`)
                    : (isAr ? 'اختر طاولة من الأعلى' : 'Choisissez une table')}
                </Button>
              )}
            </div>
            {mode === 'fast' && payMode === 'prepaid' && (
              <p className="text-[11px] text-center text-amber-700">{isAr ? 'نمط الدفع المسبق مفعّل — «للمطبخ فقط» يبقى بانتظار الدفع' : 'Paiement anticipe actif'}</p>
            )}
          </div>
        )}

        {/* modifier dialog */}
        {modFor && (
          <div className="fixed inset-0 z-30 bg-black/50 flex items-end md:items-center md:justify-center" onClick={() => setModFor(null)}>
            <div className="bg-background w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-4 space-y-4 max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="resto-mod-dialog">
              <h3 className="font-bold text-lg">{modFor.name_ar || modFor.name || modFor.name_en}</h3>
              {(modFor.modifier_groups || []).map(g => (
                <div key={g.name}>
                  <p className="font-semibold text-sm mb-1">{g.name}{g.required ? ' *' : ''}</p>
                  <div className="flex flex-wrap gap-2">
                    {(g.options || []).map(op => {
                      const sel = (modSel[g.name] || []).includes(op.name);
                      return (
                        <Button key={op.name} size="sm" variant={sel ? 'default' : 'outline'} className="min-h-[44px]"
                          data-testid={`resto-mod-${op.name}`}
                          onClick={() => setModSel(prev => {
                            const cur = prev[g.name] || [];
                            const next = cur.includes(op.name) ? cur.filter(x => x !== op.name)
                              : (g.max_select === 1 ? [op.name] : [...cur, op.name]);
                            return { ...prev, [g.name]: next };
                          })}>
                          {op.name}{op.price_delta ? ` (+${fmt(op.price_delta)})` : ''}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <Button className="w-full min-h-[48px]" data-testid="resto-mod-confirm"
                onClick={() => {
                  const groups = modFor?.modifier_groups || [];
                  for (const g of groups) if (g.required && !(modSel[g.name] || []).length) { toast.error((isAr ? 'اختر من: ' : 'Choix: ') + g.name); return; }
                  const mods = [];
                  for (const g of groups) for (const opName of (modSel[g.name] || [])) {
                    const op = (g.options || []).find(o2 => o2.name === opName);
                    if (op) mods.push({ group: g.name, option: op.name, price_delta: Number(op.price_delta) || 0, product_id: op.product_id || null, qty: op.qty || 1 });
                  }
                  addDish(modFor, mods);
                  setModFor(null); setModSel({});
                }}>
                {isAr ? 'إضافة' : 'Ajouter'}
              </Button>
            </div>
          </div>
        )}

        {/* table bill dialog: pay + discount + checkout */}
        <Dialog open={!!billOrder} onOpenChange={(o) => !o && setBill(null)}>
          <DialogContent className="max-w-sm" dir="rtl" data-testid="resto-bill-dialog">
            <DialogHeader><DialogTitle>{isAr ? 'الفاتورة' : 'Facture'} — {billOrder?.code}</DialogTitle></DialogHeader>
            {billOrder && (
              <div className="space-y-3">
                <ul className="text-sm space-y-1 border rounded p-2 max-h-44 overflow-y-auto">
                  {(billOrder.items || []).map((it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{it.product_name}{it.note ? <span className="text-xs text-amber-700"> ({it.note})</span> : null}</span>
                      <span className="font-mono">×{it.quantity}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between text-sm border rounded p-2" data-testid="resto-bill-total">
                  <span className="font-bold">{isAr ? 'الإجمالي' : 'Total'}: {billOrder.discount_amount > 0 ? (
                    <>
                      <span className="font-mono line-through text-muted-foreground text-xs" dir="ltr">{billOrder.total}</span>{' '}
                      <span className="font-mono text-emerald-700" dir="ltr">{fmt(billOrder.final_total)} {isAr ? 'دج' : 'DA'}</span>
                    </>
                  ) : (
                    <span className="font-mono" dir="ltr">{fmt(billOrder.total)} {isAr ? 'دج' : 'DA'}</span>
                  )}</span>
                  {billOrder.payment_status === 'paid'
                    ? <Badge className="bg-emerald-600">{isAr ? 'مدفوع' : 'Paye'}</Badge>
                    : <Badge variant="destructive">{isAr ? 'غير مدفوع' : 'Non paye'}</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <Select value={discType} onValueChange={setDiscType}>
                    <SelectTrigger className="w-20 h-9" data-testid="resto-disc-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="amount">{isAr ? 'دج' : 'DA'}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={discValue} onChange={e => setDiscValue(e.target.value)} type="number" min="0"
                    className="w-24 h-9" dir="ltr" placeholder="0" data-testid="resto-disc-value" />
                  <Button size="sm" variant="outline" className="h-9" onClick={() => applyDiscount(billOrder.id)} data-testid="resto-disc-apply">
                    <Percent className="h-4 w-4 ml-1" />{isAr ? 'خصم' : 'Remise'}
                  </Button>
                </div>
                {billOrder.payment_status !== 'paid' && (
                  <Button className="w-full min-h-[48px]" onClick={() => payOrder(billOrder.id)} data-testid="resto-bill-pay">
                    <Banknote className="h-4 w-4 ml-1" />{isAr ? 'تأكيد الدفع (كاش)' : 'Paiement cash'}
                  </Button>
                )}
                <Button variant="outline" className="w-full min-h-[44px]" data-testid="resto-bill-checkout"
                  onClick={() => checkoutTable(tables.find(t => t.active_order_id === billOrder.id) || { id: billOrder.table_id })}>
                  {isAr ? 'إنهاء وتحرير الطاولة' : 'Cloturer la table'}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
