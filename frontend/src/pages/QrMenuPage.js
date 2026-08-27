// p311: صفحة طلب QR العمومية — الزبون يمسح رمز الطاولة ويطلب دون تسجيل دخول
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';  // p325: navigate لاستبدال المسح بالرابط المؤقت
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Loader2, Share2, Check, Instagram, Facebook, Music2, MapPin, MessageCircle, Globe } from 'lucide-react';  // p334

const fmt = (n) => new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 2 }).format(n || 0);

export default function QrMenuPage() {
  const { tenantId, tableId, token } = useParams();
  const navigate = useNavigate();  // p325  // p323: token = الرابط المؤقت للطاولة
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState(null);
  const [cart, setCart] = useState([]); // {id,name,price,qty,mods:[]}
  const [modFor, setModFor] = useState(null);
  const [modSel, setModSel] = useState({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [phone, setPhone] = useState('');  // p315: اختياري — إشعار واتساب عند الجاهزية
  const [showCart, setShowCart] = useState(false);
  const [copied, setCopied] = useState(false);  // p334

  useEffect(() => {
    const EXPIRED = 'انتهت صلاحية رابط الطلب — امسح رمز الطاولة من جديد';
    if (!token) {
      // p325: المسح من الرمز المطبوع الدائم — نسترجع رابط الطلب المؤقت الحالي ونستبدل العنوان به
      fetch(`/api/restaurant/public/table-session/${tenantId}/${tableId}`)
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'رمز الطاولة غير صالح');
          return r.json();
        })
        .then((d) => navigate(`/r/${tenantId}/${tableId}/${d.token}`, { replace: true }))
        .catch((e) => setError(e.message));
      return;
    }
    fetch(`/api/restaurant/public/table-menu/${tenantId}/${tableId}/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))).detail || '';
          if (r.status === 410 || r.status === 404 || d === 'Not Found') throw new Error(EXPIRED);
          throw new Error(d || 'تعذر تحميل القائمة');
        }
        return r.json();
      })
      .then(setMenu)
      .catch((e) => setError(e.message));
  }, [tenantId, tableId, token]);  // p323

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
  // p334: مشاركة رابط الطاولة الدائم عبر Web Share API (ونسخ احتياطي)
  const shareTable = async () => {
    const url = `${window.location.origin}/r/${tenantId}/${tableId}`;
    const text = `اطلب معي من ${(menu?.restaurant_name) || 'المطعم'} — ${(menu?.table_name) || 'طاولتنا'}`;
    if (navigator.share) {
      try { await navigator.share({ title: (menu?.restaurant_name) || 'قائمة الطعام', text, url }); return; } catch (e) { /* أُلغيت المشاركة */ }
    }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch (e) {}
  };

  const SOCIAL_META = [  // p334
    { key: 'instagram', Icon: Instagram, label: 'إنستغرام' },
    { key: 'facebook', Icon: Facebook, label: 'فيسبوك' },
    { key: 'tiktok', Icon: Music2, label: 'تيك توك' },
    { key: 'google_maps', Icon: MapPin, label: 'قيّمنا على خرائط جوجل' },
    { key: 'whatsapp', Icon: MessageCircle, label: 'واتساب' },
    { key: 'website', Icon: Globe, label: 'موقعنا' },
  ];
  const socialLinks = SOCIAL_META.filter(m => ((menu?.social) || {})[m.key]);
  const socialCard = socialLinks.length > 0 && (
    <div className="border rounded-xl p-4 space-y-3 bg-muted/30 w-full max-w-sm mx-auto" data-testid="qr-social">
      <p className="font-semibold text-sm text-center">تابعنا وقيّمنا — دعمك يساعدنا على النمو</p>
      <div className="flex flex-wrap justify-center gap-2">
        {socialLinks.map(({ key, Icon, label }) => (
          <a key={key} href={menu.social[key]} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 border rounded-full px-3 py-1.5 text-sm font-medium hover:bg-muted"
             data-testid={`qr-social-${key}`}>
            <Icon className="h-4 w-4" />{label}
          </a>
        ))}
      </div>
    </div>
  );
  const shareBtn = (
    <Button variant="outline" onClick={shareTable} className="min-h-[44px]" data-testid="qr-share-table">
      {copied ? <Check className="h-4 w-4 ml-1" /> : <Share2 className="h-4 w-4 ml-1" />}
      {copied ? 'نُسخ رابط الطاولة — أرسله لصديقك' : 'شارك الطاولة مع أصدقائك'}
    </Button>
  );


  const submit = async () => {
    if (!cart.length || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/restaurant/public/order/${tenantId}/${tableId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((c) => ({ product_id: c.id, quantity: c.qty, modifiers: c.mods.length ? c.mods : null })),
          customer_phone: phone.trim() || null,  // p315
          token: token || null,  // p323
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || 'فشل إرسال الطلب');
      setDone({ code: d.code || 'تم', prepaid: d.status === 'pending_payment' });  // p336: نمط الدفع المسبق يغيّر الرسالة
      setCart([]);
    } catch (e) {
      setError(e.message);
    } finally { setSending(false); }
  };

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center" dir="rtl" data-testid="qr-error">
      <p className="text-lg text-muted-foreground">{error}</p>
    </div>
  );
  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center" dir="rtl" data-testid="qr-success">
      <CheckCircle2 className="h-16 w-16 text-emerald-600" />
      <h1 className="text-2xl font-bold">استلمنا طلبك!</h1>
      <p className="text-muted-foreground">رقم الطلب: <span className="font-mono font-bold">{done.code}</span></p>
      <p className="text-sm text-muted-foreground">
        {done.prepaid
          ? 'سجّلنا طلبك — أكّد الدفع عند الكاشير وسيبدأ التحضير فورًا'
          : 'سيصلك طلبك إلى طاولتك قريبًا'}
      </p>
      <Button onClick={() => setDone(null)} data-testid="qr-new-order">طلب جديد</Button>
      {/* p334: مشاركة الطاولة + سوشيال المطعم بعد نجاح الطلب */}
      {shareBtn}
      <p className="text-xs text-muted-foreground max-w-xs">شارك رابط الطاولة مع من معك — كل الطلبات تجتمع تلقائيًا على نفس الطاولة</p>
      {socialCard}
    </div>
  );
  if (!menu) return (
    <div className="min-h-screen flex items-center justify-center" dir="rtl"><Loader2 className="h-8 w-8 animate-spin" /></div>
  );

  return (
    <div className="min-h-screen bg-background pb-24" dir="rtl" data-testid="qr-menu-page">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b p-4">
        <h1 className="text-xl font-bold">{menu.restaurant_name || 'القائمة'}</h1>
        <p className="text-xs text-muted-foreground">اطلب مباشرة من طاولتك</p>
      </header>
      <main className="p-4 space-y-6">
        {Object.entries(families).map(([fam, items]) => (
          <section key={fam}>
            <h2 className="font-semibold mb-2">{fam}</h2>
            <div className="grid grid-cols-1 gap-2">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 border rounded-lg p-3" data-testid={`qr-item-${it.id}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{it.name}</p>
                    <p className="text-primary font-bold">{fmt(it.price)} دج</p>
                  </div>
                  <Button size="sm" className="min-h-[44px] min-w-[44px]"
                    data-testid={`qr-add-${it.id}`}
                    onClick={() => (it.modifier_groups || []).length ? (setModFor(it), setModSel({})) : addPlain(it)}>
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* p334: شريط المشاركة والسوشيال أسفل القائمة */}
      <section className="p-4 space-y-3 flex flex-col items-center">
        {shareBtn}
        {socialCard}
      </section>

      {cart.length > 0 && (
        <button onClick={() => setShowCart(true)}
          className="fixed bottom-4 inset-x-4 z-20 bg-primary text-primary-foreground rounded-xl p-4 flex items-center justify-between shadow-lg"
          data-testid="qr-cart-bar">
          <span className="flex items-center gap-2 font-bold"><ShoppingCart className="h-5 w-5" /> {cart.reduce((s, c) => s + c.qty, 0)} عنصر</span>
          <span className="font-bold">{fmt(total)} دج</span>
        </button>
      )}

      {modFor && (
        <div className="fixed inset-0 z-30 bg-black/50 flex items-end" onClick={() => setModFor(null)}>
          <div className="bg-background w-full rounded-t-2xl p-4 space-y-4 max-h-[75vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="qr-mod-dialog">
            <h3 className="font-bold text-lg">{modFor.name}</h3>
            {(modFor.modifier_groups || []).map((g) => (
              <div key={g.name}>
                <p className="font-semibold text-sm mb-1">{g.name}{g.required ? ' *' : ''}</p>
                <div className="flex flex-wrap gap-2">
                  {(g.options || []).map((op) => {
                    const sel = (modSel[g.name] || []).includes(op.name);
                    return (
                      <Button key={op.name} size="sm" variant={sel ? 'default' : 'outline'} className="min-h-[44px]"
                        data-testid={`qr-mod-${op.name}`}
                        onClick={() => setModSel((prev) => {
                          const cur = prev[g.name] || [];
                          const next = cur.includes(op.name) ? cur.filter((x) => x !== op.name)
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
            <Button className="w-full min-h-[44px]" onClick={addWithMods} data-testid="qr-mod-confirm">إضافة للسلة</Button>
          </div>
        </div>
      )}

      {showCart && (
        <div className="fixed inset-0 z-30 bg-black/50 flex items-end" onClick={() => setShowCart(false)}>
          <div className="bg-background w-full rounded-t-2xl p-4 space-y-3 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="qr-cart-sheet">
            <h3 className="font-bold text-lg">طلبك</h3>
            {cart.map((c, i) => (
              <div key={i} className="flex items-center gap-2 border-b pb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{c.name}</p>
                  {c.mods.length > 0 && <p className="text-xs text-muted-foreground">{c.mods.map((m) => m.option).join(' + ')}</p>}
                  <p className="text-primary text-sm font-bold">{fmt(c.price * c.qty)} دج</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setQty(i, c.qty - 1)} data-testid={`qr-minus-${i}`}>{c.qty === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}</Button>
                  <span className="w-6 text-center font-bold">{c.qty}</span>
                  <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => setQty(i, c.qty + 1)} data-testid={`qr-plus-${i}`}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            <div className="flex justify-between font-bold text-lg pt-1"><span>المجموع</span><span>{fmt(total)} دج</span></div>
            <p className="text-xs text-muted-foreground text-center">الدفع عند الكاشير</p>
            <input
              type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="رقم الهاتف (اختياري) — لإشعارك عند الجاهزية"
              className="w-full border rounded-lg p-3 text-sm bg-background"
              data-testid="qr-phone-input"
            />
            <Button className="w-full min-h-[48px] text-lg" onClick={submit} disabled={sending} data-testid="qr-submit-btn">
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'إرسال الطلب للمطبخ'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
