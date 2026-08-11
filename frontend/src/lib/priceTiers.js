// فئات أسعار البيع — مصدر واحد لكل النظام (نقطة البيع، الزبائن، المنتجات)
// لا تكرار: أي مكان يحتاج فئات الأسعار يستورد من هنا
export const PRICE_TIERS = [
  { value: 'retail', field: 'retail_price', ar: 'تجزئة', fr: 'Détail' },
  { value: 'wholesale', field: 'wholesale_price', ar: 'جملة', fr: 'Gros' },
  { value: 'super_wholesale', field: 'super_wholesale_price', ar: 'سوبر جملة', fr: 'Super gros' },
  { value: 'tariff_a', field: 'tariff_a', ar: 'تعريفة A', fr: 'Tarif A' },
  { value: 'tariff_b', field: 'tariff_b', ar: 'تعريفة B', fr: 'Tarif B' },
  { value: 'tariff_c', field: 'tariff_c', ar: 'تعريفة C', fr: 'Tarif C' },
  { value: 'tariff_d', field: 'tariff_d', ar: 'تعريفة D', fr: 'Tarif D' },
];

// سعر منتج حسب الفئة — إن كانت الفئة غير معرّفة (0) نرجع لسعر التجزئة (الافتراضي دائماً)
export const getTierPrice = (product, tier) => {
  if (!product) return 0;
  const t = PRICE_TIERS.find(x => x.value === tier) || PRICE_TIERS[0];
  const v = product[t.field];
  return (v && v > 0) ? v : (product.retail_price || 0);
};

export const tierLabel = (tier, language) => {
  const t = PRICE_TIERS.find(x => x.value === tier) || PRICE_TIERS[0];
  return language === 'ar' ? t.ar : t.fr;
};

// التنقل الدائري بين الفئات (اختصار لوحة المفاتيح في نقطة البيع)
export const nextTier = (tier) => {
  const i = PRICE_TIERS.findIndex(x => x.value === tier);
  return PRICE_TIERS[(i + 1) % PRICE_TIERS.length].value;
};
