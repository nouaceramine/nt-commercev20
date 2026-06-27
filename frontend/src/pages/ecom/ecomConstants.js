/**
 * Channel and status metadata — single source of truth for the E-Commerce Hub UI.
 * Keep keys in sync with backend/routes/ecom/constants.py.
 */

export const CHANNELS = {
  pos:       { labelAr: 'نقطة البيع',   icon: '🏪', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  shopify:   { labelAr: 'Shopify',     icon: '🛍️', color: 'bg-lime-100 text-lime-800 border-lime-200' },
  facebook:  { labelAr: 'Facebook',    icon: '📘', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  instagram: { labelAr: 'Instagram',   icon: '📸', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  tiktok:    { labelAr: 'TikTok',      icon: '🎵', color: 'bg-slate-200 text-slate-900 border-slate-300' },
  whatsapp:  { labelAr: 'واتساب',      icon: '💬', color: 'bg-green-100 text-green-800 border-green-200' },
  telegram:  { labelAr: 'تيليجرام',    icon: '✈️', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  viber:     { labelAr: 'Viber',       icon: '🟣', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  manual:    { labelAr: 'إدخال يدوي',  icon: '✍️', color: 'bg-gray-100 text-gray-800 border-gray-200' },
};

export const ORDER_STATUSES = {
  new:       { labelAr: 'جديد',         color: 'bg-blue-100 text-blue-800 border-blue-200',     dot: 'bg-blue-500' },
  confirmed: { labelAr: 'مؤكَّد',       color: 'bg-violet-100 text-violet-800 border-violet-200', dot: 'bg-violet-500' },
  packed:    { labelAr: 'محضَّر',       color: 'bg-amber-100 text-amber-800 border-amber-200',  dot: 'bg-amber-500' },
  shipped:   { labelAr: 'في الشحن',     color: 'bg-cyan-100 text-cyan-800 border-cyan-200',     dot: 'bg-cyan-500' },
  delivered: { labelAr: 'تم التسليم',   color: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
  cancelled: { labelAr: 'ملغى',         color: 'bg-gray-100 text-gray-700 border-gray-200',     dot: 'bg-gray-400' },
  refunded:  { labelAr: 'مُستردّ',      color: 'bg-rose-100 text-rose-800 border-rose-200',     dot: 'bg-rose-500' },
};

export const SHIPPING_PROVIDERS = {
  mock:     { labelAr: 'وهمي (اختبار)' },
  yalidine: { labelAr: 'يالدين' },
  zr:       { labelAr: 'ZR Express' },
  maystro:  { labelAr: 'Maystro' },
};

// Forward state machine — must mirror STATUS_TRANSITIONS in backend constants.py
export const NEXT_STATUSES = {
  new:       ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed:    ['shipped', 'cancelled'],
  shipped:   ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded:  [],
};
