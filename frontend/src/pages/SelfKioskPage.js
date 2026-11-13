import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Smartphone, CreditCard, CheckCircle2, XCircle, Hourglass,
  Delete, ArrowRight, Loader2, Store, Banknote,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL || ''}/api`;

const OPERATOR_STYLE = {
  mobilis: { bg: 'bg-green-600', ring: 'ring-green-400' },
  djezzy: { bg: 'bg-red-500', ring: 'ring-red-400' },
  ooredoo: { bg: 'bg-orange-500', ring: 'ring-orange-400' },
  idoom: { bg: 'bg-blue-500', ring: 'ring-blue-400' },
};

const TYPE_LABELS = { credit: 'رصيد', internet: 'أنترنت', flexy: 'فليكسي' };

const fmt = (n) => `${Number(n || 0).toLocaleString('fr-DZ')} دج`;

export default function KioskPage() {
  const { token } = useParams();
  const [catalog, setCatalog] = useState(null);
  const [fatal, setFatal] = useState('');
  const [step, setStep] = useState('home'); // home|operator|type|amount|phone|card|qty|confirm|track
  const [sel, setSel] = useState({ kind: null, operator: null, type: null, amount: null, phone: '', card: null, qty: 1 });
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);
  const idleRef = useRef(null);

  const reset = useCallback(() => {
    setSel({ kind: null, operator: null, type: null, amount: null, phone: '', card: null, qty: 1 });
    setRequest(null);
    setError('');
    setStep('home');
  }, []);

  // Inactivity auto-reset (selection steps only)
  useEffect(() => {
    if (['track', 'home', 'loading'].includes(step)) return undefined;
    idleRef.current = setTimeout(reset, 120000);
    return () => clearTimeout(idleRef.current);
  }, [step, sel, reset]);

  useEffect(() => {
    fetch(`${API}/kiosk/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.detail || 'رابط الكشك غير صالح');
        }
        return r.json();
      })
      .then(setCatalog)
      .catch((e) => setFatal(e.message));
  }, [token]);

  // Poll request status while tracking
  useEffect(() => {
    if (step !== 'track' || !request) return undefined;
    const tick = async () => {
      try {
        const r = await fetch(`${API}/kiosk/${token}/requests/${request.id}`);
        if (!r.ok) return;
        const d = await r.json();
        setRequest((prev) => ({ ...prev, status: d.status, price_final: d.price_final }));
      } catch { /* keep polling */ }
    };
    pollRef.current = setInterval(tick, 4000);
    return () => clearInterval(pollRef.current);
  }, [step, request?.id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-reset after terminal state
  useEffect(() => {
    if (step === 'track' && request && ['done', 'failed', 'rejected', 'expired'].includes(request.status)) {
      const t = setTimeout(reset, request.status === 'done' ? 9000 : 15000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [step, request, reset]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = sel.kind === 'recharge'
        ? { kind: 'recharge', operator: sel.operator, recharge_type: sel.type, amount: sel.amount, phone_number: sel.phone }
        : { kind: 'card', card_id: sel.card.id, quantity: sel.qty };
      const r = await fetch(`${API}/kiosk/${token}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || 'تعذر إرسال الطلب');
      setRequest(d);
      setStep('track');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const pressNum = (d) => {
    if (sel.phone.length < 10) setSel((s) => ({ ...s, phone: s.phone + d }));
  };

  const BigButton = ({ onClick, className = '', children, testid, disabled }) => (
    <button
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-3xl font-bold text-white shadow-lg active:scale-95 transition-transform disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );

  if (fatal) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
        <div className="text-center text-white">
          <XCircle className="w-20 h-20 mx-auto text-red-400 mb-6" />
          <p className="text-2xl font-bold">{fatal}</p>
          <p className="text-slate-400 mt-3">اطلب من البائع رابطاً جديداً</p>
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-14 h-14 text-emerald-400 animate-spin" />
      </div>
    );
  }

  const ops = Object.entries(catalog.operators || {});
  const cards = catalog.cards || [];
  const curOp = sel.operator ? catalog.operators[sel.operator] : null;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-white flex flex-col select-none" data-testid="kiosk-page">
      {/* Header */}
      <header className="py-5 text-center border-b border-slate-800">
        <div className="flex items-center justify-center gap-2 text-emerald-400 text-lg font-semibold">
          <Store className="w-5 h-5" />
          <span>{catalog.store_name || catalog.label || 'كشك الخدمة الذاتية'}</span>
        </div>
        <h1 className="text-3xl font-black mt-1">شحن الرصيد والبطاقات</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-2xl mx-auto">

        {step === 'home' && (
          <div className="grid grid-cols-1 gap-6 w-full">
            {catalog.allow_recharge && ops.length > 0 && (
              <BigButton testid="kiosk-choice-recharge" onClick={() => { setSel((s) => ({ ...s, kind: 'recharge' })); setStep('operator'); }}
                className="bg-emerald-600 py-14 text-3xl flex items-center justify-center gap-4">
                <Smartphone className="w-10 h-10" /> تعبئة رصيد
              </BigButton>
            )}
            {catalog.allow_cards && cards.length > 0 && (
              <BigButton testid="kiosk-choice-card" onClick={() => { setSel((s) => ({ ...s, kind: 'card' })); setStep('card'); }}
                className="bg-cyan-600 py-14 text-3xl flex items-center justify-center gap-4">
                <CreditCard className="w-10 h-10" /> بطاقة شحن
              </BigButton>
            )}
          </div>
        )}

        {step === 'operator' && (
          <Section title="اختر المشغّل" onBack={reset}>
            <div className="grid grid-cols-1 gap-4 w-full">
              {ops.map(([key, op]) => (
                <BigButton key={key} testid={`kiosk-op-${key}`}
                  onClick={() => { setSel((s) => ({ ...s, operator: key })); setStep('type'); }}
                  className={`${OPERATOR_STYLE[key]?.bg || 'bg-slate-700'} py-8 text-2xl`}>
                  {op.name}
                </BigButton>
              ))}
            </div>
          </Section>
        )}

        {step === 'type' && curOp && (
          <Section title="نوع الشحن" onBack={() => setStep('operator')}>
            <div className="grid grid-cols-1 gap-4 w-full">
              {curOp.types.map((t) => (
                <BigButton key={t} testid={`kiosk-type-${t}`}
                  onClick={() => { setSel((s) => ({ ...s, type: t })); setStep('amount'); }}
                  className="bg-slate-700 py-8 text-2xl">
                  {TYPE_LABELS[t] || t}
                </BigButton>
              ))}
            </div>
          </Section>
        )}

        {step === 'amount' && curOp && (
          <Section title="اختر المبلغ" onBack={() => setStep('type')}>
            <div className="grid grid-cols-2 gap-4 w-full">
              {curOp.amounts.map((a) => (
                <BigButton key={a} testid={`kiosk-amount-${a}`}
                  onClick={() => { setSel((s) => ({ ...s, amount: a })); setStep('phone'); }}
                  className="bg-slate-700 py-8 text-3xl">
                  {fmt(a)}
                </BigButton>
              ))}
            </div>
          </Section>
        )}

        {step === 'phone' && (
          <Section title="أدخل رقم الهاتف" onBack={() => setStep(sel.kind === 'recharge' ? 'amount' : 'card')}>
            <div className="w-full">
              <div data-testid="kiosk-phone-display" dir="ltr"
                className="bg-slate-900 border-2 border-slate-700 rounded-2xl text-center text-4xl font-mono tracking-[0.3em] py-5 mb-5 min-h-[4.5rem]">
                {sel.phone || <span className="text-slate-600">05XXXXXXXX</span>}
              </div>
              <div className="grid grid-cols-3 gap-3" dir="ltr">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                  <button key={k} data-testid={k === '⌫' ? 'kiosk-num-del' : k === 'C' ? 'kiosk-num-clear' : `kiosk-num-${k}`}
                    onClick={() => {
                      if (k === '⌫') setSel((s) => ({ ...s, phone: s.phone.slice(0, -1) }));
                      else if (k === 'C') setSel((s) => ({ ...s, phone: '' }));
                      else pressNum(k);
                    }}
                    className="bg-slate-800 rounded-2xl py-5 text-3xl font-bold active:scale-95 transition-transform flex items-center justify-center">
                    {k === '⌫' ? <Delete className="w-8 h-8" /> : k}
                  </button>
                ))}
              </div>
              <BigButton testid="kiosk-phone-confirm" disabled={sel.phone.length !== 10}
                onClick={() => setStep('confirm')}
                className="bg-emerald-600 w-full py-6 text-2xl mt-5">
                متابعة
              </BigButton>
            </div>
          </Section>
        )}

        {step === 'card' && (
          <Section title="اختر البطاقة" onBack={reset}>
            <div className="grid grid-cols-1 gap-4 w-full">
              {cards.map((c) => (
                <BigButton key={c.id} testid={`kiosk-card-${c.id}`} disabled={!c.available}
                  onClick={() => { setSel((s) => ({ ...s, card: c })); setStep('qty'); }}
                  className={`${OPERATOR_STYLE[c.operator]?.bg || 'bg-slate-700'} py-6 text-2xl flex items-center justify-between px-8`}>
                  <span>{c.name}</span>
                  <span className="text-xl opacity-90">{c.available ? fmt(c.price) : 'غير متوفرة'}</span>
                </BigButton>
              ))}
            </div>
          </Section>
        )}

        {step === 'qty' && sel.card && (
          <Section title={`${sel.card.name} — الكمية`} onBack={() => setStep('card')}>
            <div className="grid grid-cols-3 gap-4 w-full">
              {[1, 2, 3].map((n) => (
                <BigButton key={n} testid={`kiosk-qty-${n}`}
                  onClick={() => { setSel((s) => ({ ...s, qty: n })); setStep('confirm'); }}
                  className="bg-slate-700 py-10 text-4xl">
                  {n}
                </BigButton>
              ))}
            </div>
          </Section>
        )}

        {step === 'confirm' && (
          <Section title="تأكيد الطلب" onBack={() => setStep(sel.kind === 'recharge' ? 'phone' : 'qty')}>
            <div className="w-full bg-slate-900 rounded-3xl p-8 text-center border border-slate-700">
              {sel.kind === 'recharge' ? (
                <>
                  <p className="text-2xl font-bold">{curOp?.name} — {TYPE_LABELS[sel.type] || sel.type}</p>
                  <p className="text-5xl font-black text-emerald-400 my-4">{fmt(sel.amount)}</p>
                  <p className="text-2xl font-mono tracking-widest" dir="ltr">{sel.phone}</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold">{sel.card?.name}</p>
                  <p className="text-5xl font-black text-emerald-400 my-4">{fmt((sel.card?.price || 0) * sel.qty)}</p>
                  <p className="text-xl text-slate-300">الكمية: {sel.qty}</p>
                </>
              )}
              <div className="flex items-center justify-center gap-2 text-amber-300 mt-5 text-lg">
                <Banknote className="w-6 h-6" />
                <span>الدفع نقداً عند البائع قبل التنفيذ</span>
              </div>
            </div>
            {error && <p className="text-red-400 text-center mt-4 text-lg" data-testid="kiosk-error">{error}</p>}
            <BigButton testid="kiosk-confirm" disabled={busy} onClick={submit}
              className="bg-emerald-600 w-full py-7 text-3xl mt-6 flex items-center justify-center gap-3">
              {busy ? <Loader2 className="w-8 h-8 animate-spin" /> : <CheckCircle2 className="w-8 h-8" />}
              إرسال الطلب
            </BigButton>
          </Section>
        )}

        {step === 'track' && request && (
          <div className="w-full text-center">
            {['pending', 'processing'].includes(request.status) && (
              <>
                <Hourglass className="w-20 h-20 mx-auto text-amber-400 mb-4 animate-pulse" />
                <p className="text-2xl text-slate-300">رقم طلبك</p>
                <p data-testid="kiosk-code" className="text-7xl font-black text-amber-300 tracking-wider my-4">{request.code}</p>
                <p className="text-3xl font-bold mb-2">{request.summary}</p>
                <p className="text-4xl font-black text-emerald-400 mb-6">{fmt(request.price_estimate)}</p>
                <div className="bg-amber-500/10 border border-amber-500/40 rounded-3xl p-6 text-2xl font-bold text-amber-200">
                  ادفع المبلغ للبائع ليتم التنفيذ فوراً
                </div>
                <p className="text-slate-500 mt-4" data-testid="kiosk-status">بانتظار تأكيد البائع...</p>
              </>
            )}
            {request.status === 'done' && (
              <>
                <CheckCircle2 className="w-28 h-28 mx-auto text-emerald-400 mb-6" />
                <p className="text-4xl font-black text-emerald-300" data-testid="kiosk-status">تم التنفيذ بنجاح!</p>
                <p className="text-2xl text-slate-300 mt-3">{request.summary}</p>
                <button data-testid="kiosk-new-request" onClick={reset}
                  className="mt-8 bg-slate-700 rounded-2xl px-10 py-4 text-xl font-bold active:scale-95">
                  طلب جديد
                </button>
              </>
            )}
            {['failed', 'rejected', 'expired'].includes(request.status) && (
              <>
                <XCircle className="w-24 h-24 mx-auto text-red-400 mb-6" />
                <p className="text-3xl font-bold text-red-300" data-testid="kiosk-status">
                  {request.status === 'rejected' ? 'تم رفض الطلب' : request.status === 'expired' ? 'انتهت مهلة الطلب' : 'تعذر تنفيذ الطلب'}
                </p>
                <p className="text-xl text-slate-400 mt-3">راجع البائع</p>
                <button data-testid="kiosk-new-request" onClick={reset}
                  className="mt-8 bg-slate-700 rounded-2xl px-10 py-4 text-xl font-bold active:scale-95">
                  طلب جديد
                </button>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="py-4 text-center text-slate-600 text-sm">
        خدمة ذاتية آمنة — لا يُنفَّذ أي شحن قبل تأكيد البائع
      </footer>
    </div>
  );
}

function Section({ title, onBack, children }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">{title}</h2>
        <button onClick={onBack} className="flex items-center gap-1 text-slate-400 text-lg active:scale-95">
          <ArrowRight className="w-5 h-5" /> رجوع
        </button>
      </div>
      {children}
    </div>
  );
}
