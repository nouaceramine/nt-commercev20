// p320+p321: شاشة تلفاز المنتجات — توفر حي مربوط بالمخزون/الوصفات، تحديث كل 10 ث
// الوضع الافتراضي: شبكة بطاقات. ?mode=slider : شرائح صور بملء الشاشة تدور كل 8 ث
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ChefHat, Ban, WifiOff } from 'lucide-react';

export default function TvMenuPage({ tenantIdProp, forceSlider, menuFamilies } = {}) {  // p322: props for TvHub embedding; p552: menuFamilies = عائلات هذه الشاشة (فارغ = الكل)
  const { tenantId: paramTenantId } = useParams();
  const tenantId = tenantIdProp || paramTenantId;
  const [searchParams] = useSearchParams();
  const sliderMode = forceSlider || searchParams.get('mode') === 'slider';
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [slideIdx, setSlideIdx] = useState(0);

  const fetchMenu = useCallback(async () => {
    try {
      const r = await fetch(`/api/restaurant/public/menu-board/${tenantId}`);
      if (!r.ok) { setErr(true); return; }
      setData(await r.json());
      setErr(false);
    } catch { setErr(true); }
  }, [tenantId]);

  useEffect(() => {
    fetchMenu();
    const t = setInterval(fetchMenu, 10000);
    const c = setInterval(() => setClock(new Date()), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [fetchMenu]);

  const items = useMemo(() => {
    const all = data?.items || [];
    // p552: فلترة حسب عائلات الشاشة المحددة من لوحة التحكم (فارغ = كل العائلات)
    if (menuFamilies && menuFamilies.length) {
      const keep = new Set(menuFamilies);
      return all.filter(p => keep.has(p.family || ''));
    }
    return all;
  }, [data, menuFamilies]);

  // p321: شرائح الصور — المنتجات المتوفرة ذات الصور فقط، صورة لكل عنصر من المعرض
  const slides = useMemo(() => {
    const out = [];
    for (const p of items) {
      if (!p.available) continue;
      const imgs = (p.images && p.images.length ? p.images : (p.image_url ? [p.image_url] : [])).filter(Boolean);
      for (const src of imgs) out.push({ src, name: p.name, price: p.price, family: p.family, remaining: p.remaining });
    }
    return out;
  }, [items]);

  // p548: تجميع حسب العائلة + دمج الأحجام (L/XL/MEGA) في بطاقة واحدة لسهولة القراءة
  const SIZE_RE = /\s*حجم\s*(MEGA|XL|L)$/;
  const SIZE_ORDER = { 'L': 0, 'XL': 1, 'MEGA': 2 };
  const families = useMemo(() => {
    const famOrder = [];
    const famMap = new Map();
    for (const p of items) {
      const fam = p.family || '';
      if (!famMap.has(fam)) { famMap.set(fam, new Map()); famOrder.push(fam); }
      const groups = famMap.get(fam);
      const m = (p.name || '').match(SIZE_RE);
      const base = m ? (p.name || '').replace(SIZE_RE, '').trim() : (p.name || '');
      if (!groups.has(base)) groups.set(base, { key: base, name: base, image_url: p.image_url, sizes: [] });
      const g = groups.get(base);
      if (!g.image_url && p.image_url) g.image_url = p.image_url;
      g.sizes.push({ label: m ? m[1] : '', price: p.price, available: p.available, remaining: p.remaining });
    }
    return famOrder.map(f => [f, [...famMap.get(f).values()].map(g => ({
      ...g,
      sizes: g.sizes.sort((a, b) => (SIZE_ORDER[a.label] ?? 3) - (SIZE_ORDER[b.label] ?? 3)),
    }))]);
  }, [items]);
  const availBases = new Set();
  for (const p of items) {
    if (!p.available) continue;
    const m = (p.name || '').match(SIZE_RE);
    availBases.add(m ? (p.name || '').replace(SIZE_RE, '').trim() : (p.name || ''));
  }
  const soldOut = items.filter(i => {
    if (i.available) return false;
    const m = (i.name || '').match(SIZE_RE);
    const base = m ? (i.name || '').replace(SIZE_RE, '').trim() : (i.name || '');
    return !availBases.has(base);
  });


  useEffect(() => {
    if (!sliderMode || slides.length < 2) return;
    const t = setInterval(() => setSlideIdx(i => (i + 1) % slides.length), 8000);
    return () => clearInterval(t);
  }, [sliderMode, slides.length]);

  useEffect(() => { setSlideIdx(0); }, [slides.length]);

  // ---------- وضع الشرائح (إعلانات ملء الشاشة) ----------
  if (sliderMode && slides.length > 0 && !err) {
    const s = slides[slideIdx % slides.length];
    return (
      <div className="h-screen w-screen overflow-hidden bg-black relative" dir="rtl" data-testid="tvmenu-slider">
        {slides.map((sl, i) => (
          <img
            key={sl.src + i}
            src={sl.src}
            alt={sl.name}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === slideIdx % slides.length ? 'opacity-100' : 'opacity-0'}`}
          />
        ))}
        {/* تدرّج سفلي للقراءة */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black via-black/70 to-transparent" />
        {/* شريط علوي: اسم المطعم + ساعة */}
        <div className="absolute top-0 inset-x-0 flex items-center justify-between p-6 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-3">
            <ChefHat className="h-9 w-9 text-amber-400" />
            <span className="text-2xl font-bold text-white">{data?.restaurant_name || ''}</span>
          </div>
          <span className="text-2xl font-mono font-bold text-amber-400" dir="ltr">
            {clock.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {/* معلومات الطبق */}
        <div className="absolute bottom-0 inset-x-0 p-10 flex items-end justify-between">
          <div>
            {s.family && <div className="text-amber-400 text-xl mb-2">{s.family}</div>}
            <h1 className="text-6xl font-black text-white drop-shadow-lg">{s.name}</h1>
            {s.remaining != null && s.remaining <= 10 && (
              <div className="mt-3 inline-block bg-amber-500 text-black text-xl font-bold rounded-xl px-4 py-1" data-testid="tvmenu-slide-low">بقي {s.remaining} فقط</div>
            )}
          </div>
          <div className="text-left">
            <div className="inline-block bg-amber-400 text-black text-6xl font-black rounded-3xl px-8 py-3 shadow-2xl">{s.price} <span className="text-3xl">دج</span></div>
          </div>
        </div>
        {/* مؤشر الشرائح */}
        {slides.length > 1 && (
          <div className="absolute bottom-4 inset-x-0 flex justify-center gap-2">
            {slides.map((_, i) => (
              <span key={i} className={`h-2 rounded-full transition-all ${i === slideIdx % slides.length ? 'w-8 bg-amber-400' : 'w-2 bg-white/40'}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- الوضع الشبكي (افتراضي) ----------
  return (
    <div className="min-h-screen bg-black text-white p-8" dir="rtl" data-testid="tvmenu-page">
      {/* الترويسة */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-5 mb-8">
        <div className="flex items-center gap-4">
          <ChefHat className="h-12 w-12 text-amber-400" />
          <div>
            <h1 className="text-4xl font-black">{data?.restaurant_name || 'قائمة المنتجات'}</h1>
            <p className="text-neutral-400 text-lg mt-1">القائمة المتوفرة الآن — تُحدَّث لحظيًا</p>
          </div>
        </div>
        <div className="text-left" dir="ltr">
          <div className="text-4xl font-mono font-bold text-amber-400">
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

      {/* المتوفرة — مجمعة حسب العائلة، كل وجبة بأحجامها في بطاقة واحدة */}
      {families.map(([fam, groups]) => {
        const visGroups = groups.filter(g => g.sizes.some(s => s.available));
        if (visGroups.length === 0) return null;
        return (
          <div key={fam || 'general'} className="mb-12">
            <div className="mb-8 mt-2" data-testid={`tvmenu-family-${fam}`}>
              <span className="inline-block bg-gradient-to-l from-amber-400 via-orange-500 to-red-500 text-black text-4xl font-black rounded-2xl px-10 py-3 shadow-lg shadow-orange-950/60 tracking-wide">{fam || 'أصناف عامة'}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              {visGroups.map(g => (
                <div key={g.key} className="rounded-3xl bg-neutral-900 border-2 border-neutral-800 hover:border-amber-500/50 overflow-hidden shadow-xl shadow-black/60" data-testid={`tvmenu-card-${g.key}`}>
                  {g.image_url ? (
                    <img src={g.image_url} alt={g.name} className="w-full h-60 object-cover" />
                  ) : (
                    <div className="w-full h-60 bg-neutral-800 flex items-center justify-center">
                      <ChefHat className="h-16 w-16 text-neutral-700" />
                    </div>
                  )}
                  <div className="p-5 space-y-3">
                    <h3 className="text-2xl font-bold leading-snug">{g.name}</h3>
                    {g.sizes.length === 1 && !g.sizes[0].label ? (
                      <div className="flex items-center justify-between">
                        <span className="inline-block bg-amber-400 text-black text-3xl font-black rounded-2xl px-5 py-1.5 shadow-md">{g.sizes[0].price} <span className="text-lg font-bold">دج</span></span>
                        {g.sizes[0].remaining != null && g.sizes[0].remaining <= 10 && (
                          <span className="text-amber-400 text-lg font-bold">بقي {g.sizes[0].remaining}</span>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {g.sizes.map(sz => (
                          <div key={sz.label} className="flex items-center justify-between border-b border-neutral-800/60 pb-1 last:border-0">
                            <span className="text-xl font-extrabold text-neutral-300" dir="ltr">{sz.label}</span>
                            {sz.available ? (
                              <span className="inline-block bg-amber-400/95 text-black text-2xl font-black rounded-xl px-4 py-0.5">{sz.price} <span className="text-sm font-bold">دج</span></span>
                            ) : (
                              <span className="bg-red-600/80 text-white text-base font-bold rounded-lg px-3 py-0.5">نفذ</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* النافدة — تبقى ظاهرة كإشعار نفاد */}
      {soldOut.length > 0 && (
        <>
          <h2 className="text-2xl font-bold text-red-400 mt-12 mb-6 flex items-center gap-3">
            <Ban className="h-7 w-7" /> نفذت حاليًا
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
            {soldOut.map(p => (
              <div key={p.id} className="rounded-3xl bg-neutral-900/50 border border-red-900/40 overflow-hidden opacity-60" data-testid={`tvmenu-soldout-${p.id}`}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-44 object-cover grayscale" />
                ) : (
                  <div className="w-full h-44 bg-neutral-800/50 flex items-center justify-center grayscale">
                    <ChefHat className="h-16 w-16 text-neutral-700" />
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
