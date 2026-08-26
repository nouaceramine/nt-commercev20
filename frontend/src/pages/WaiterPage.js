// p312: واجهة النادل — موبايل أولاً: طاولة → أصناف كبيرة → إرسال للمطبخ (بدون دفع)
import { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../lib/apiClient';
import { errText } from '../lib/errorText';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { UtensilsCrossed, Plus, Minus, Send, ArrowRight, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { startRealtime, onEvent, stopRealtime } from '../lib/realtime';

const fmt = (n) => new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 2 }).format(n || 0);

export default function WaiterPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [tables, setTables] = useState([]);
  const [products, setProducts] = useState([]);
  const [selTable, setSelTable] = useState(null);
  const [order, setOrder] = useState([]); // {product_id,name,price,qty,mods}
  const [modFor, setModFor] = useState(null);
  const [modSel, setModSel] = useState({});
  const [sending, setSending] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([
        apiClient.get('/restaurant/tables'),
        apiClient.get('/products'),
      ]);
      setTables(t.data || []);
      setProducts(p.data || []);
    } catch (e) { /* صامت */ }
  }, []);
  useEffect(() => {
    fetchAll();
    startRealtime();
    const un1 = onEvent('kitchen_order.created', fetchAll);
    const un2 = onEvent('kitchen_order.updated', fetchAll);
    return () => { un1 && un1(); un2 && un2(); stopRealtime(); };
  }, [fetchAll]);

  const dishes = useMemo(() => (products || []).filter(p => (p.retail_price || 0) > 0), [products]);
  const families = useMemo(() => {
    const m = {};
    dishes.forEach(p => { const f = p.family_name || (isAr ? 'أخرى' : 'Autres'); (m[f] = m[f] || []).push(p); });
    return m;
  }, [dishes, isAr]);

  const addDish = (p, mods = []) => {
    const delta = mods.reduce((a, m) => a + (Number(m.price_delta) || 0), 0);
    const key = p.id + '|' + mods.map(m => m.option).join('+');
    setOrder(prev => {
      const ex = prev.find(o => o.key === key);
      if (ex) return prev.map(o => o.key === key ? { ...o, qty: o.qty + 1 } : o);
      return [...prev, { key, product_id: p.id, name: p.name_ar || p.name || p.name_en, price: (p.retail_price || 0) + delta, qty: 1, mods }];
    });
  };
  const setQty = (key, q) => setOrder(prev => q <= 0 ? prev.filter(o => o.key !== key) : prev.map(o => o.key === key ? { ...o, qty: q } : o));
  const total = order.reduce((s, o) => s + o.price * o.qty, 0);

  const send = async () => {
    if (!selTable || !order.length || sending) return;
    setSending(true);
    try {
      const r = await apiClient.post('/restaurant/kitchen-orders', {
        table_id: selTable.id,
        items: order.map(o => ({
          product_id: o.product_id, unit_price: o.price, product_name: o.name, quantity: o.qty,
          modifiers: o.mods.length ? o.mods : null,
          note: o.mods.length ? o.mods.map(m => m.option).join(' + ') : null,
        })),
      });
      toast.success((isAr ? 'أُرسل للمطبخ ' : 'Envoye ') + (r.data.code || ''));
      setOrder([]); setSelTable(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
    finally { setSending(false); }
  };

  // شاشة اختيار الطاولة
  if (!selTable) return (
    <Layout>
      <div className="p-4 space-y-4" dir="rtl" data-testid="waiter-page">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2"><UtensilsCrossed className="h-6 w-6" /> {isAr ? 'واجهة النادل' : 'Serveur'}</h1>
          <Button variant="outline" size="sm" onClick={fetchAll} data-testid="waiter-refresh"><RefreshCw className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {tables.map(t => (
            <Card key={t.id}
              className={`cursor-pointer transition-all ${t.status === 'occupied' ? 'border-amber-500 bg-amber-50/60' : 'border-emerald-500/50'}`}
              data-testid={`waiter-table-${t.id}`}
              onClick={() => { setSelTable(t); setOrder([]); }}>
              <CardContent className="p-4 text-center space-y-1">
                <div className="font-bold text-xl">{t.name}</div>
                <Badge variant={t.status === 'occupied' ? 'secondary' : 'default'} className={t.status === 'occupied' ? '' : 'bg-emerald-600'}>
                  {t.status === 'occupied' ? (isAr ? 'مشغولة — إلحاق' : 'Occupee') : (isAr ? 'فارغة' : 'Libre')}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
        {tables.length === 0 && <p className="text-center text-muted-foreground py-10">{isAr ? 'لا طاولات — أضفها من خريطة الطاولات' : 'Aucune table'}</p>}
      </div>
    </Layout>
  );

  // شاشة الطلب
  return (
    <Layout>
      <div className="p-3 space-y-3 pb-28" dir="rtl" data-testid="waiter-order-page">
        <div className="flex items-center justify-between sticky top-0 bg-background z-10 py-1">
          <Button variant="ghost" size="sm" onClick={() => setSelTable(null)} data-testid="waiter-back">
            <ArrowRight className="h-5 w-5 ml-1" /> {selTable.name}
          </Button>
          <Badge variant="secondary" className="text-base px-3">{fmt(total)} {isAr ? 'دج' : 'DA'}</Badge>
        </div>
        {Object.entries(families).map(([fam, list]) => (
          <section key={fam}>
            <h2 className="text-sm font-semibold text-muted-foreground mb-1">{fam}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {list.map(p => (
                <Button key={p.id} variant="outline" className="h-auto min-h-[64px] flex-col py-2 px-1"
                  data-testid={`waiter-item-${p.id}`}
                  onClick={() => (p.modifier_groups || []).length ? (setModFor(p), setModSel({})) : addDish(p)}>
                  <span className="font-bold text-sm leading-tight">{p.name_ar || p.name || p.name_en}</span>
                  <span className="text-primary font-bold text-sm">{fmt(p.retail_price)}</span>
                </Button>
              ))}
            </div>
          </section>
        ))}
        {order.length > 0 && (
          <div className="border rounded-lg divide-y bg-card" data-testid="waiter-order-list">
            {order.map(o => (
              <div key={o.key} className="flex items-center gap-2 p-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{o.name}</p>
                  {o.mods.length > 0 && <p className="text-xs text-muted-foreground">{o.mods.map(m => m.option).join(' + ')}</p>}
                </div>
                <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setQty(o.key, o.qty - 1)} data-testid={`waiter-minus-${o.product_id}`}>{o.qty === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</Button>
                <span className="w-6 text-center font-bold">{o.qty}</span>
                <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setQty(o.key, o.qty + 1)} data-testid={`waiter-plus-${o.product_id}`}><Plus className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
        <Button className="fixed bottom-20 md:bottom-4 inset-x-4 z-20 min-h-[52px] text-lg shadow-lg" disabled={!order.length || sending}
          onClick={send} data-testid="waiter-send-btn">
          <Send className="h-5 w-5 ml-2" /> {isAr ? 'إرسال للمطبخ' : 'Envoyer'} ({order.reduce((s, o) => s + o.qty, 0)})
        </Button>

        {modFor && (
          <div className="fixed inset-0 z-30 bg-black/50 flex items-end" onClick={() => setModFor(null)}>
            <div className="bg-background w-full rounded-t-2xl p-4 space-y-4 max-h-[75vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="waiter-mod-dialog">
              <h3 className="font-bold text-lg">{modFor.name_ar || modFor.name || modFor.name_en}</h3>
              {(modFor.modifier_groups || []).map(g => (
                <div key={g.name}>
                  <p className="font-semibold text-sm mb-1">{g.name}{g.required ? ' *' : ''}</p>
                  <div className="flex flex-wrap gap-2">
                    {(g.options || []).map(op => {
                      const sel = (modSel[g.name] || []).includes(op.name);
                      return (
                        <Button key={op.name} size="sm" variant={sel ? 'default' : 'outline'} className="min-h-[44px]"
                          data-testid={`waiter-mod-${op.name}`}
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
              <Button className="w-full min-h-[48px]" data-testid="waiter-mod-confirm"
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
      </div>
    </Layout>
  );
}
