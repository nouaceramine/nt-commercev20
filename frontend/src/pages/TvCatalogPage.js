// p329: شاشة كتالوج عامة لكل الأنشطة — منتجات بأسعار + توفر حي من المخزون، تحديث كل 10 ث
// شبكة بطاقات افتراضيًا؛ forceSlider أو ?mode=slider : شرائح صور بملء الشاشة تدور كل 8 ث
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Store, Ban, WifiOff } from 'lucide-react';

export default function TvCatalogPage({ tenantIdProp, forceSlider, screenToken, gridLayout } = {}) {  // p333
  const { tenantId: paramTenantId } = useParams();
  const tenantId = tenantIdProp || paramTenantId;
  const [searchParams] = useSearchParams();
  const sliderMode = forceSlider || searchParams.get('mode') === 'slider';
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [slideIdx, setSlideIdx] = useState(0);

  const fetchCatalog = useCallback(async () => {
    try {
      const r = await fetch(`/api/restaurant/public/catalog-board/${tenantId}` + (screenToken ? `?screen=${encodeURIComponent(screenToken)}` : ''));  // p333
      if (!r.ok) { setErr(true); return; }
      setData(await r.json());
      setErr(false);
    } catch { setErr(true); }
  }, [tenantId, screenToken]);  // p333

  useEffect(() => {
    fetchCatalog();
    const t = setInterval(fetchCatalog, 10000);
    const c = setInterval(() => setClock(new Date()), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [fetchCatalog]);

  const items = data?.items || [];

  const slides = useMemo(() => {
    const out = [];
    for (const p of items) {
      if (!p.available) continue;
      const imgs = (p.images && p.images.length ? p.images : (p.image_url ? [p.image_url] : [])).filter(Boolean);
      for (const src of imgs) out.push({ src, name: p.name, price: p.price, family: p.family, remaining: p.remaining });
    }
    return out;
  }, [items]);

  // p333: صفحات وضع التقسيم — كل صفحة splitN منتجات وتدور كل 8 ث
  const splitN = Number(gridLayout) || 0;
  const splitPages = useMemo(() => {
    if (splitN < 1) return [];
    const out = [];
    for (let i = 0; i < items.length; i += splitN) out.push(items.slice(i, i + splitN));
    return out;
  }, [items, splitN]);

  useEffect(() => {
    if (splitPages.length < 2) return;
    const t = setInterval(() => setSlideIdx(i => (i + 1) % splitPages.length), 8000);
    return () => clearInterval(t);
  }, [splitPages.length]);

  useEffect(() => {
    if (!sliderMode || slides.length < 2) return;
    const t = setInterval(() => setSlideIdx(i => (i + 1) % slides.length), 8000);
    return () => clearInterval(t);
  }, [sliderMode, slides.length]);

  useEffect(() => { setSlideIdx(0); }, [slides.length]);

  // ---------- وضع الشرائح ----------
  if (sliderMode && slides.length > 0 && !err) {
    const s = slides[slideIdx % slides.length];
    return (
      <div className="h-screen w-screen overflow-hidden bg-black relative" dir="rtl" data-testid="tvcat-slider">
        {slides.map((sl, i) => (
          <img
            key={sl.src + i}
            src={sl.src}
            alt={sl.name}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === slideIdx % slides.length ? 'opacity-100' : 'opacity-0'}`}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black via-black/70 to-transparent" />
        <div className="absolute top-0 inset-x-0 flex items-center justify-between p-6 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-3">
            <Store className="h-9 w-9 text-sky-400" />
            <span className="text-2xl font-bold text-white">{data?.business_name || ''}</span>
          </div>
          <span className="text-2xl font-mono font-bold text-sky-400" dir="ltr">
            {clock.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="absolute bottom-0 inset-x-0 p-10 flex items-end justify-between">
          <div>
            {s.family && <div className="text-sky-400 text-xl mb-2">{s.family}</div>}
            <h1 className="text-6xl font-black text-white drop-shadow-lg">{s.name}</h1>
            {s.remaining != null && s.remaining <= 10 && (
              <div className="mt-3 inline-block bg-amber-500 text-black text-xl font-bold rounded-xl px-4 py-1" data-testid="tvcat-slide-low">بقي {s.remaining} فقط</div>
            )}
          </div>
          <div className="text-left">
            <div className="text-7xl font-black text-emerald-400 drop-shadow-lg">{s.price} <span className="text-3xl">دج</span></div>
          </div>
        </div>
        {slides.length > 1 && (
          <div className="absolute bottom-4 inset-x-0 flex justify-center gap-2">
            {slides.map((_, i) => (
              <span key={i} className={`h-2 rounded-full transition-all ${i === slideIdx % slides.length ? 'w-8 bg-sky-400' : 'w-2 bg-white/40'}`} />
            ))}
          </div>
        )}
      </div>
    );
  }


  // ---------- p333: وضع التقسيم (1/4/6/8 خانات ثابتة بملء الشاشة) ----------
  if (splitN >= 1 && !err) {
    if (items.length === 0) {
      return (
        <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center" dir="rtl" data-testid="tvcat-split-empty">
          <p className="text-2xl text-neutral-500">لا توجد منتجات محددة لهذه الشاشة</p>
        </div>
      );
    }
    const page = splitPages[slideIdx % splitPages.length] || [];
    const cols = splitN === 1 ? 'grid-cols-1' : splitN === 4 ? 'grid-cols-2' : splitN === 6 ? 'grid-cols-3' : 'grid-cols-4';
    const rows = splitN === 1 ? '' : 'grid-rows-2';
    return (
      <div className="h-screen w-screen bg-neutral-950 text-white p-4 flex flex-col" dir="rtl" data-testid={`tvcat-split-${splitN}`}>
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-3">
            <Store className="h-8 w-8 text-sky-400" />
            <span className="text-2xl font-bold">{data?.business_name || ''}</span>
          </div>
          <span className="text-xl font-mono font-bold text-sky-400" dir="ltr">
            {clock.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className={`grid ${cols} ${rows} gap-4 flex-1 min-h-0`}>
          {page.map(p => {
            const img = (p.images && p.images[0]) || p.image_url;
            return (
              <div key={p.id} className={`relative rounded-3xl overflow-hidden border ${p.available ? 'border-neutral-800' : 'border-red-900/50'} bg-neutral-900`} data-testid={`tvcat-split-card-${p.id}`}>
                {img
                  ? <img src={img} alt={p.name} className={`absolute inset-0 w-full h-full object-cover ${p.available ? '' : 'grayscale opacity-50'}`} />
                  : <div className="absolute inset-0 flex items-center justify-center bg-neutral-800"><Store className="h-20 w-20 text-neutral-700" /></div>}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent p-5 pt-14">
                  {p.family && <div className="text-sky-400 text-base mb-1">{p.family}</div>}
                  <h2 className={`font-black text-white leading-tight ${splitN === 1 ? 'text-6xl' : splitN <= 4 ? 'text-3xl' : 'text-2xl'}`}>{p.name}</h2>
                  <div className="mt-1 flex items-end justify-between">
                    <span className={`font-black text-emerald-400 ${splitN === 1 ? 'text-5xl' : 'text-3xl'}`}>{p.price} <span className="text-lg font-normal">دج</span></span>
                    {!p.available
                      ? <span className="bg-red-600 text-white text-base font-bold rounded-xl px-3 py-1">نفذت الكمية</span>
                      : (p.remaining != null && p.remaining <= 10 && (
                          <span className="bg-amber-500 text-black text-base font-bold rounded-xl px-3 py-1" data-testid={`tvcat-split-low-${p.id}`}>بقي {p.remaining}</span>
                        ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {splitPages.length > 1 && (
          <div className="flex justify-center gap-2 pt-3">
            {splitPages.map((_, i) => (
              <span key={i} className={`h-2 rounded-full transition-all ${i === slideIdx % splitPages.length ? 'w-8 bg-sky-400' : 'w-2 bg-white/40'}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- الوضع الشبكي ----------
  const available = items.filter(i => i.available);
  const soldOut = items.filter(i => !i.available);

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8" dir="rtl" data-testid="tvcat-page">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-5 mb-8">
        <div className="flex items-center gap-4">
          <Store className="h-12 w-12 text-sky-400" />
          <div>
            <h1 className="text-4xl font-black">{data?.business_name || 'المنتجات'}</h1>
            <p className="text-neutral-400 text-lg mt-1">المنتجات المتوفرة الآن — تُحدَّث لحظيًا</p>
          </div>
        </div>
        <div className="text-left" dir="ltr">
          <div className="text-4xl font-mono font-bold text-sky-400">
            {clock.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-neutral-500 text-sm text-center">
            {clock.toLocaleDateString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {err && (
        <div className="flex flex-col items-center justify-center py-32 text-neutral-500 gap-4">
          <WifiOff className="h-16 w-16" />
          <p className="text-2xl">الشاشة غير متاحة حاليًا</p>
        </div>
      )}

      {!err && items.length === 0 && (
        <p className="text-center text-neutral-500 text-2xl py-32">لا توجد منتجات معروضة بعد</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
        {available.map(p => (
          <div key={p.id} className="rounded-3xl bg-neutral-900 border border-neutral-800 overflow-hidden" data-testid={`tvcat-card-${p.id}`}>
            {p.image_url ? (
              <img src={p.image_url} alt={p.name} className="w-full h-44 object-cover" />
            ) : (
              <div className="w-full h-44 bg-neutral-800 flex items-center justify-center">
                <Store className="h-16 w-16 text-neutral-700" />
              </div>
            )}
            <div className="p-5 space-y-2">
              {p.family && <span className="text-sm text-sky-400/80">{p.family}</span>}
              <h2 className="text-2xl font-bold leading-snug">{p.name}</h2>
              <div className="flex items-center justify-between">
                <span className="text-3xl font-black text-emerald-400">{p.price} <span className="text-lg font-normal">دج</span></span>
                {p.remaining != null && p.remaining <= 10 && (
                  <span className="text-amber-400 text-lg font-bold" data-testid={`tvcat-low-${p.id}`}>بقي {p.remaining}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {soldOut.length > 0 && (
        <>
          <h2 className="text-2xl font-bold text-red-400 mt-12 mb-6 flex items-center gap-3">
            <Ban className="h-7 w-7" /> نفذت حاليًا
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
            {soldOut.map(p => (
              <div key={p.id} className="rounded-3xl bg-neutral-900/50 border border-red-900/40 overflow-hidden opacity-60" data-testid={`tvcat-soldout-${p.id}`}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-44 object-cover grayscale" />
                ) : (
                  <div className="w-full h-44 bg-neutral-800/50 flex items-center justify-center grayscale">
                    <Store className="h-16 w-16 text-neutral-700" />
                  </div>
                )}
                <div className="p-5 space-y-2">
                  <h2 className="text-2xl font-bold text-neutral-400 leading-snug">{p.name}</h2>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-neutral-500 line-through">{p.price} دج</span>
                    <span className="bg-red-600 text-white text-lg font-bold rounded-xl px-4 py-1">نفذت الكمية</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
