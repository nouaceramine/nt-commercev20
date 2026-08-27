// p335: صفحة طلب عمومية لعمال محلات الجوار — أسعار خاصة، دفع دَين أو كاش
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, Store, CheckCircle2 } from 'lucide-react';

export default function NeighborOrderPage() {
  const { tenantId, token } = useParams();
  const [menu, setMenu] = useState(null); // {neighbor_name, payment, items[]}
  const [error, setError] = useState(null);
  const [cart, setCart] = useState({}); // product_id -> qty
  const [orderedBy, setOrderedBy] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null); // {code, payment}

  useEffect(() => {
    fetch(`/api/restaurant/public/neighbor-menu/${tenantId}/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('invalid');
        return r.json();
      })
      .then(setMenu)
      .catch(() => setError('invalid'));
  }, [tenantId, token]);

  const items = menu?.items || [];
  const cartList = useMemo(
    () => items.filter((i) => cart[i.id] > 0).map((i) => ({ ...i, qty: cart[i.id] })),
    [items, cart]
  );
  const total = useMemo(() => cartList.reduce((s, i) => s + i.price * i.qty, 0), [cartList]);
  const count = useMemo(() => cartList.reduce((s, i) => s + i.qty, 0), [cartList]);

  const add = (id, d) => setCart((c) => {
    const q = Math.max(0, (c[id] || 0) + d);
    const n = { ...c };
    if (q === 0) delete n[id]; else n[id] = q;
    return n;
  });

  const submit = useCallback(async () => {
    if (!cartList.length || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/restaurant/public/neighbor-order/${tenantId}/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartList.map((i) => ({ product_id: i.id, quantity: i.qty })),
          ordered_by: orderedBy.trim() || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.detail === 'string' ? d.detail : 'error');
      setDone({ code: d.code, payment: d.payment });
      setCart({});
    } catch (e) {
      alert(typeof e.message === 'string' ? e.message : 'خطأ');
    } finally { setSending(false); }
  }, [cartList, sending, tenantId, token, orderedBy]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6" dir="rtl">
        <div className="text-center space-y-2" data-testid="b2b-invalid">
          <Store className="w-12 h-12 mx-auto text-neutral-400" />
          <p className="font-semibold">هذا الرابط غير صالح أو انتهت صلاحيته</p>
          <p className="text-sm text-neutral-500">اطلب رابطًا جديدًا من إدارة المحل</p>
        </div>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50" dir="rtl">
        <p className="text-neutral-500">جارٍ التحميل…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 p-6 gap-4" dir="rtl">
        <CheckCircle2 className="w-16 h-16 text-emerald-500" />
        <div className="text-center space-y-1" data-testid="b2b-success">
          <p className="text-xl font-bold">تم استلام طلبك</p>
          <p className="text-neutral-600">رقم الطلب: <b data-testid="b2b-code" dir="ltr">{done.code}</b></p>
          <p className="text-sm text-neutral-500">
            {done.payment === 'debt'
              ? 'سيُضاف المبلغ إلى حساب محلّكم — يُسوّيه المدير لاحقًا'
              : 'ادفع كاش عند الاستلام'}
          </p>
        </div>
        <button onClick={() => setDone(null)} data-testid="b2b-again"
          className="px-6 py-2 rounded-full bg-neutral-900 text-white text-sm">
          طلب جديد
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-28" dir="rtl">
      <header className="bg-white border-b sticky top-0 z-10 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-bold" data-testid="b2b-neighbor-name">{menu.neighbor_name}</h1>
            <p className="text-xs text-neutral-500">
              أسعار خاصة بالجيران — {menu.payment === 'debt' ? 'الدفع دَينًا على حساب المحل' : 'الدفع كاش عند الاستلام'}
            </p>
          </div>
          <Store className="w-6 h-6 text-neutral-400" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-2">
        {items.map((i) => (
          <div key={i.id} className="bg-white rounded-xl border p-3 flex items-center gap-3" data-testid={`b2b-item-${i.id}`}>
            {i.image_url && <img src={i.image_url} alt="" className="w-14 h-14 rounded-lg object-cover" />}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{i.name}</div>
              <div className="text-sm">
                <b>{Number(i.price).toLocaleString()} دج</b>
                {i.base_price != null && Number(i.base_price) > Number(i.price) && (
                  <span className="text-neutral-400 line-through mr-2 text-xs">{Number(i.base_price).toLocaleString()}</span>
                )}
              </div>
            </div>
            {cart[i.id] ? (
              <div className="flex items-center gap-2">
                <button onClick={() => add(i.id, -1)} data-testid={`b2b-minus-${i.id}`}
                  className="w-8 h-8 rounded-full border flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                <b className="w-6 text-center">{cart[i.id]}</b>
                <button onClick={() => add(i.id, 1)} data-testid={`b2b-plus-${i.id}`}
                  className="w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center"><Plus className="w-4 h-4" /></button>
              </div>
            ) : (
              <button onClick={() => add(i.id, 1)} data-testid={`b2b-add-${i.id}`}
                className="w-9 h-9 rounded-full bg-neutral-900 text-white flex items-center justify-center"><Plus className="w-5 h-5" /></button>
            )}
          </div>
        ))}
      </main>

      {count > 0 && (
        <footer className="fixed bottom-0 inset-x-0 bg-white border-t p-4 z-20" data-testid="b2b-cart-bar">
          <div className="max-w-2xl mx-auto space-y-2">
            <input value={orderedBy} onChange={(e) => setOrderedBy(e.target.value)} data-testid="b2b-ordered-by"
              placeholder="اسمك (من يطلب؟)"
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <button onClick={submit} disabled={sending} data-testid="b2b-submit"
              className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
              <ShoppingCart className="w-5 h-5" />
              إرسال الطلب — {count} عنصر — {total.toLocaleString()} دج
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
