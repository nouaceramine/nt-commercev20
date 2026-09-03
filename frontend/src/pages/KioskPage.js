// p360: صفحة الكشك الذاتي داخل المحل — الزبون يطلب بنفسه من شاشة عند الكونتوار (بلا حساب)
import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Loader2, Store, Timer } from 'lucide-react';

const fmt = (n) => new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 2 }).format(n || 0);
const RESET_SECONDS = 15;

export default function KioskPage() {
  const { tenantId } = useParams();
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState([]); // {id,name,price,qty,mods:[]}
  const [modFor, setModFor] = useState(null);
  const [modSel, setModSel] = useState({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    fetch(`/api/restaurant/public/kiosk/${tenantId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail === 'غير موجود' ? 'الكشك غير مفعّل حالياً' : 'تعذر تحميل القائمة');
        return r.json();
      })
      .then(setMenu)
      .catch((e) => setError(e.message));
  }, [tenantId]);

  // شاشة النجاح: عدّاد ثم إعادة ضبط تلقائية للزبون التالي
  useEffect(() => {
    if (!done) return;
    setCountdown(RESET_SECONDS);
    const iv = setInterval(() => setCountdown((c) => {
      if (c <= 1) { clearInterval(iv); resetAll(); return 0; }
      return c - 1;
    }), 1000);
    return () => clearInterval(iv);
  }, [done]);

  const resetAll = () => { setDone(null); setCart([]); setName(''); setPhone(''); setShowCart(false); };

  const families = useMemo(() => {
    const m = {};
    (menu?.items || []).forEach((it) => { (m[it.family || 'القائمة'] = m[it.family || 'القائمة'] || []).push(it); });
    return m;
  }, [menu]);

  const addPlain = (it) => {
    setCart((prev) => {
      const ex = prev.find((c) => c.id === it.id && !c.mods.length);
      if (ex) return prev.map((c) => (c === ex ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, { id: it.id, name: it.name, price: it.price, qty: 1, mods: [] }];
    });
  };

  const addWithMods = () => {
    const groups = modFor?.modifier_groups || [];
    for (const g of groups) {
      if (g.required && !(modSel[g.name] || []).length) return;
    }
    const mods = [];
    let delta = 0;
    for (const g of groups) {
      for (const opName of (modSel[g.name] || [])) {
        const op = (g.options || []).find((o) => o.name === opName);
        if (op) { mods.push({ group: g.name, option: op.name }); delta += Number(op.price_delta) || 0; }
      }
    }
    setCart((prev) => [...prev, { id: modFor.id, name: modFor.name, price: modFor.price + delta, qty: 1, mods }]);
    setModFor(null); setModSel({});
  };

  const setQty = (idx, q) => setCart((prev) => q <= 0 ? prev.filter((_, i) => i !== idx) : prev.map((c, i) => (i === idx ? { ...c, qty: q } : c)));
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  const submit = async () => {
    if (!cart.length || sending) return;
    if (menu?.require_phone && !phone.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`/api/restaurant/public/kiosk/${tenantId}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((c) => ({ product_id: c.id, quantity: c.qty, modifiers: c.mods.length ? c.mods : undefined })),
          customer_name: name.trim() || undefined,
          customer_phone: phone.trim() || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail === 'انتظر قليلاً قبل إرسال طلب آخر' ? d.detail : (d.detail || 'تعذر إرسال الطلب'));
      setDone(d);
    } catch (e) {
      alert(e.message);
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-3" data-testid="kiosk-error">
          <Store className="h-14 w-14 mx-auto text-muted-foreground" />
          <p className="text-xl font-bold">{error}</p>
          <p className="text-sm text-muted-foreground">اسأل الموظف عن طريقة الطلب</p>
        </div>
      </div>
    );
  }

  if (!menu) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" data-testid="kiosk-loading" />
      </div>
    );
  }

  if (done) {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center bg-background p-6 gap-5">
        <CheckCircle2 className="h-20 w-20 text-green-600" />
        <p className="text-2xl font-bold" data-testid="kiosk-done-title">استلمنا طلبك!</p>
        <p className="text-muted-foreground">{menu.payment_mode === 'prepaid' ? 'ادفع عند الكاشير ثم يجهز طلبك' : 'طلبك الآن في المطبخ'}</p>
        <div className="border-4 border-primary rounded-3xl px-10 py-6 text-center">
          <p className="text-sm text-muted-foreground mb-1">رقم طلبك</p>
          <p className="text-4xl font-black tracking-wider" dir="ltr" data-testid="kiosk-done-code">{done.code}</p>
        </div>
        <p className="text-lg font-semibold">المجموع: {fmt(done.final_total ?? done.total)} دج</p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Timer className="h-4 w-4" />
          <span data-testid="kiosk-countdown">طلب جديد خلال {countdown} ث</span>
        </div>
        <Button size="lg" className="min-h-[56px] px-10 text-lg" onClick={resetAll} data-testid="kiosk-new-order">طلب جديد الآن</Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background pb-28" data-testid="kiosk-page">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">{menu.restaurant_name}</h1>
          <p className="text-xs text-muted-foreground">{menu.counter_name} — اطلب بنفسك</p>
        </div>
        <Badge variant="secondary" className="text-sm px-3 py-1" data-testid="kiosk-counter-badge">{menu.counter_name}</Badge>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-8">
        {Object.entries(families).map(([fam, items]) => (
          <section key={fam}>
            <h2 className="text-lg font-bold mb-3">{fam}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {items.map((it) => (
                <button key={it.id}
                  onClick={() => (it.modifier_groups || []).length ? (setModFor(it), setModSel({})) : addPlain(it)}
                  className="border rounded-2xl p-4 text-right hover:border-primary active:scale-95 transition-all bg-card min-h-[96px] flex flex-col justify-between"
                  data-testid={`kiosk-item-${it.name}`}>
                  <span className="font-bold text-base leading-snug">{it.name}</span>
                  <span className="text-primary font-black text-lg mt-2">{fmt(it.price)} دج</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* شريط السلة السفلي */}
      {cart.length > 0 && !showCart && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-background via-background">
          <Button size="lg" className="w-full min-h-[60px] text-lg font-bold rounded-2xl" onClick={() => setShowCart(true)} data-testid="kiosk-open-cart">
            <ShoppingCart className="h-5 w-5 ml-2" />
            السلة ({cartCount}) — {fmt(total)} دج
          </Button>
        </div>
      )}

      {/* نافذة الإضافات */}
      {modFor && (
        <div className="fixed inset-0 z-20 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setModFor(null)}>
          <div className="bg-background rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="kiosk-mods">
            <h3 className="text-lg font-bold">{modFor.name}</h3>
            {(modFor.modifier_groups || []).map((g) => (
              <div key={g.name}>
                <p className="font-semibold mb-2">{g.name}{g.required ? ' *' : ''}</p>
                <div className="flex flex-wrap gap-2">
                  {(g.options || []).map((op) => {
                    const sel = (modSel[g.name] || []).includes(op.name);
                    return (
                      <button key={op.name}
                        onClick={() => setModSel((prev) => {
                          const cur = prev[g.name] || [];
                          const next = sel ? cur.filter((x) => x !== op.name) : (g.multi ? [...cur, op.name] : [op.name]);
                          return { ...prev, [g.name]: next };
                        })}
                        className={`border rounded-full px-4 py-2 text-sm font-medium min-h-[44px] ${sel ? 'bg-primary text-primary-foreground border-primary' : ''}`}
                        data-testid={`kiosk-mod-${op.name}`}>
                        {op.name}{Number(op.price_delta) ? ` (+${fmt(op.price_delta)})` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <Button size="lg" className="w-full min-h-[56px] text-lg" onClick={addWithMods} data-testid="kiosk-mods-add">أضف للسلة</Button>
          </div>
        </div>
      )}

      {/* نافذة السلة */}
      {showCart && (
        <div className="fixed inset-0 z-20 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowCart(false)}>
          <div className="bg-background rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="kiosk-cart">
            <h3 className="text-lg font-bold">سلتك</h3>
            {cart.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-2 border rounded-xl p-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{c.name}</p>
                  {c.mods.length > 0 && <p className="text-xs text-muted-foreground truncate">{c.mods.map((m) => m.option).join('، ')}</p>}
                  <p className="text-sm text-primary font-bold">{fmt(c.price * c.qty)} دج</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="outline" className="h-11 w-11" onClick={() => setQty(i, c.qty - 1)} data-testid="kiosk-qty-minus">
                    {c.qty === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                  </Button>
                  <span className="w-8 text-center font-bold">{c.qty}</span>
                  <Button size="icon" variant="outline" className="h-11 w-11" onClick={() => setQty(i, c.qty + 1)} data-testid="kiosk-qty-plus">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="space-y-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمك (اختياري — لناديك عند الجاهزية)"
                className="w-full border rounded-xl px-4 min-h-[52px] text-base bg-background" data-testid="kiosk-name" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={menu.require_phone ? 'رقم هاتفك (إجباري)' : 'رقم هاتفك (اختياري)'}
                inputMode="tel" dir="ltr" className="w-full border rounded-xl px-4 min-h-[52px] text-base bg-background text-right" data-testid="kiosk-phone" />
            </div>
            <div className="flex items-center justify-between text-lg font-black border-t pt-3">
              <span>المجموع</span><span data-testid="kiosk-total">{fmt(total)} دج</span>
            </div>
            <Button size="lg" className="w-full min-h-[60px] text-lg font-bold"
              disabled={sending || (menu.require_phone && !phone.trim())}
              onClick={submit} data-testid="kiosk-submit">
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : (menu.payment_mode === 'prepaid' ? 'أرسل الطلب وادفع عند الكاشير' : 'أرسل الطلب للمطبخ')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
