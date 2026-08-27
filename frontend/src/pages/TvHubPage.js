// p322: مركز التلفاز /tv — إقران بكود ثم عرض حسب ما يحدده المدير مركزيًا
// التلفاز يفتح هذه الصفحة مرة واحدة؛ التوكن يُحفظ محليًا فيبقى مرتبطًا بعد إطفاء الجهاز
import { useState, useEffect, useCallback } from 'react';
import { Tv, Link2, WifiOff } from 'lucide-react';  // p329: أيقونة عامة لكل الأنشطة
import OrderBoardPage from './OrderBoardPage';
import TvMenuPage from './TvMenuPage';
import TvCatalogPage from './TvCatalogPage';  // p329

const LS_KEY = 'tv_screen_token';

export default function TvHubPage() {
  const [token, setToken] = useState(() => localStorage.getItem(LS_KEY) || '');
  const [config, setConfig] = useState(null); // {name, mode, tenant_id, restaurant_name}
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  // مرحلة الإقران: طلب كود ثم انتظار المدير
  useEffect(() => {
    if (token) return;
    let stop = false;
    let timer = null;
    (async () => {
      try {
        const r = await fetch('/api/restaurant/public/screens/pair', { method: 'POST' });
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (stop) return;
        setCode(d.code);
        timer = setInterval(async () => {
          try {
            const pr = await fetch(`/api/restaurant/public/screens/pair/${d.code}`);
            if (pr.status === 404 || pr.status === 410) { // منتهي — اطلب كوداً جديداً
              clearInterval(timer);
              if (!stop) { setCode(''); setToken(prev => prev); window.location.reload(); }
              return;
            }
            if (!pr.ok) return;
            const pd = await pr.json();
            if (pd.paired && pd.token) {
              clearInterval(timer);
              localStorage.setItem(LS_KEY, pd.token);
              if (!stop) setToken(pd.token);
            }
          } catch { /* retry */ }
        }, 3000);
      } catch {
        if (!stop) setErr('تعذّر الاتصال بالخادم — تحقق من الشبكة');
      }
    })();
    return () => { stop = true; if (timer) clearInterval(timer); };
  }, [token]);

  // مرحلة العرض: استعلام الإعداد كل 10 ث (يتقاطع مع تحديثات المحتوى الداخلية)
  const pollConfig = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`/api/restaurant/public/screens/${token}`);
      if (r.status === 404) { // الشاشة حُذفت من لوحة التحكم — عودة لوضع الإقران
        localStorage.removeItem(LS_KEY);
        setConfig(null);
        setToken('');
        return;
      }
      if (!r.ok) return;
      setConfig(await r.json());
      setErr('');
    } catch { setErr('انقطع الاتصال — تُعاد المحاولة تلقائيًا'); }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    pollConfig();
    const t = setInterval(pollConfig, 10000);
    return () => clearInterval(t);
  }, [token, pollConfig]);

  // ---------- شاشة الإقران ----------
  if (!token) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center gap-8 p-8" dir="rtl" data-testid="tvhub-pair">
        <Tv className="h-20 w-20 text-amber-400" />
        <h1 className="text-4xl font-black">ربط هذه الشاشة بحسابك</h1>  {/* p329 */}
        {err && <p className="text-red-400 text-xl flex items-center gap-2"><WifiOff className="h-6 w-6" />{err}</p>}
        {code ? (
          <>
            <div className="bg-neutral-900 border-2 border-amber-500 rounded-3xl px-16 py-8" data-testid="tvhub-code">
              <span className="text-8xl font-mono font-black tracking-[0.3em] text-amber-400" dir="ltr">{code}</span>
            </div>
            <div className="text-center space-y-2 text-neutral-300 text-xl max-w-xl">
              <p className="flex items-center justify-center gap-2"><Link2 className="h-6 w-6" /> من لوحة التحكم افتح:</p>
              <p className="font-bold text-white text-2xl">الإعدادات ← شاشات العرض ← «إقران شاشة جديدة»</p>  {/* p329 */}
              <p>وأدخل هذا الكود خلال 15 دقيقة — لن تحتاجه مجددًا بعد الربط</p>
            </div>
          </>
        ) : (
          <p className="text-neutral-400 text-2xl animate-pulse">جارٍ توليد كود الربط…</p>
        )}
      </div>
    );
  }

  // ---------- العرض حسب الإعداد المركزي ----------
  if (!config) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center" dir="rtl" data-testid="tvhub-loading">
        <p className="text-2xl text-neutral-400 animate-pulse">جارٍ تحميل إعداد الشاشة…</p>
      </div>
    );
  }
  // p329: catalog/slider عامان لكل الأنشطة؛ orders/menu للمطاعم
  if (config.mode === 'orders') return <OrderBoardPage tenantIdProp={config.tenant_id} />;
  if (config.mode === 'menu') return <TvMenuPage tenantIdProp={config.tenant_id} />;
  if (config.mode === 'slider') {
    return config.has_restaurant
      ? <TvMenuPage tenantIdProp={config.tenant_id} forceSlider />
      : <TvCatalogPage tenantIdProp={config.tenant_id} forceSlider />;
  }
  return <TvCatalogPage tenantIdProp={config.tenant_id} />;
}
