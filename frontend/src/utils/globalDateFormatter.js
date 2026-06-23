/**
 * Global Date Formatter - تحويل جميع التواريخ للأرقام الغربية
 * يُطبق على كامل نظام NT Commerce
 */

// خريطة تحويل الأرقام العربية الشرقية إلى اللاتينية
const ARABIC_TO_LATIN = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

// خريطة تحويل الأرقام اللاتينية إلى العربية الشرقية
const LATIN_TO_ARABIC = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩'
};

// أسماء الأشهر بالعربية
const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

// أسماء الأشهر بالفرنسية
const FRENCH_MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

// أسماء الأيام بالعربية
const ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/**
 * تحويل الأرقام العربية الشرقية إلى اللاتينية (الغربية)
 * @param {string} str - النص المراد تحويله
 * @returns {string} - النص بالأرقام اللاتينية
 */
export function convertToWesternNumerals(str) {
  if (!str) return str;
  return String(str).replace(/[٠-٩]/g, d => ARABIC_TO_LATIN[d] || d);
}

/**
 * تحويل الأرقام اللاتينية إلى العربية الشرقية
 * @param {string} str - النص المراد تحويله
 * @returns {string} - النص بالأرقام العربية
 */
export function convertToArabicNumerals(str) {
  if (!str) return str;
  return String(str).replace(/[0-9]/g, d => LATIN_TO_ARABIC[d] || d);
}

/**
 * الإعدادات الافتراضية - الأرقام الغربية مفعلة
 */
const DEFAULT_CONFIG = {
  shortDateFormat: 'yyyy-MM-dd',
  longDateFormat: 'yyyy-MM-dd',
  timeFormat: 'HH:mm:ss',
  useWesternNumerals: true, // الأرقام الغربية افتراضياً
  language: 'ar'
};

// التكوين الحالي
let currentConfig = { ...DEFAULT_CONFIG };

/**
 * تحديث التكوين
 */
export function setConfig(config) {
  currentConfig = { ...currentConfig, ...config };
}

/**
 * الحصول على التكوين الحالي
 */
export function getConfig() {
  return { ...currentConfig };
}

/**
 * تنسيق الرقم مع تطبيق نوع الأرقام
 * @param {number|string} num - الرقم
 * @returns {string} - الرقم منسقاً
 */
export function formatNumber(num) {
  const str = String(num);
  return currentConfig.useWesternNumerals ? convertToWesternNumerals(str) : convertToArabicNumerals(str);
}

/**
 * تنسيق التاريخ القصير - dd/MM/yyyy
 * @param {Date|string} date - التاريخ
 * @returns {string} - التاريخ منسقاً بالأرقام الغربية
 */
export function formatShortDate(date) {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return '';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  
  let result = currentConfig.shortDateFormat
    .replace('dd', day)
    .replace('MM', month)
    .replace('yyyy', year)
    .replace('yy', String(year).slice(-2));
  
  // تطبيق الأرقام الغربية دائماً
  return convertToWesternNumerals(result);
}

/**
 * تنسيق التاريخ الطويل
 * @param {Date|string} date - التاريخ
 * @returns {string} - التاريخ منسقاً
 */
export function formatLongDate(date) {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return '';
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.getMonth();
  const year = d.getFullYear();
  const monthName = currentConfig.language === 'ar' ? ARABIC_MONTHS[month] : FRENCH_MONTHS[month];
  
  let result = currentConfig.longDateFormat
    .replace('dd', day)
    .replace('d', String(d.getDate()))
    .replace('MMMM', monthName)
    .replace('MM', String(month + 1).padStart(2, '0'))
    .replace('yyyy', year)
    .replace('yy', String(year).slice(-2));
  
  return convertToWesternNumerals(result);
}

/**
 * تنسيق الوقت - HH:mm:ss
 * @param {Date|string} date - التاريخ/الوقت
 * @returns {string} - الوقت منسقاً بالأرقام الغربية
 */
export function formatTime(date) {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return '';
  
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const hours12 = String(d.getHours() % 12 || 12).padStart(2, '0');
  const ampm = currentConfig.language === 'ar' ? (d.getHours() < 12 ? 'ص' : 'م') : (d.getHours() < 12 ? 'AM' : 'PM');
  
  let result = currentConfig.timeFormat
    .replace('HH', hours)
    .replace('H', String(d.getHours()))
    .replace('hh', hours12)
    .replace('h', String(d.getHours() % 12 || 12))
    .replace('mm', minutes)
    .replace('ss', seconds)
    .replace('a', ampm);
  
  return convertToWesternNumerals(result);
}

/**
 * تنسيق التاريخ والوقت معاً
 * @param {Date|string} date - التاريخ
 * @param {boolean} includeTime - تضمين الوقت
 * @returns {string} - التاريخ والوقت منسقاً
 */
export function formatDateTime(date, includeTime = true) {
  const dateStr = formatShortDate(date);
  if (!includeTime) return dateStr;
  const timeStr = formatTime(date);
  return `${dateStr} ${timeStr}`;
}

/**
 * تنسيق التاريخ النسبي (منذ...)
 * @param {Date|string} date - التاريخ
 * @returns {string} - التاريخ النسبي
 */
export function formatRelative(date) {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) return '';
  
  const now = new Date();
  const diff = (now - d) / 1000; // بالثواني
  
  const isArabic = currentConfig.language === 'ar';
  
  if (diff < 60) {
    return isArabic ? 'الآن' : 'Maintenant';
  }
  if (diff < 3600) {
    const mins = Math.floor(diff / 60);
    return isArabic ? `منذ ${convertToWesternNumerals(mins)} دقيقة` : `Il y a ${mins} minutes`;
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    return isArabic ? `منذ ${convertToWesternNumerals(hours)} ساعة` : `Il y a ${hours} heures`;
  }
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return isArabic ? `منذ ${convertToWesternNumerals(days)} يوم` : `Il y a ${days} jours`;
  }
  
  return formatShortDate(date);
}

/**
 * تنسيق العملة مع الأرقام الغربية
 * @param {number} amount - المبلغ
 * @param {string} currency - العملة (افتراضي: دج)
 * @returns {string} - المبلغ منسقاً
 */
export function formatCurrency(amount, currency = 'DZD') {
  const num = Number(amount) || 0;
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  // دائماً بالأرقام الغربية
  const result = convertToWesternNumerals(formatted);
  
  if (currentConfig.language === 'ar') {
    return `${result} دج`;
  }
  return `${result} DA`;
}

/**
 * تنسيق رقم كبير (مع فواصل)
 * @param {number} num - الرقم
 * @returns {string} - الرقم منسقاً
 */
export function formatLargeNumber(num) {
  const formatted = Number(num).toLocaleString('en-US');
  return convertToWesternNumerals(formatted);
}

/**
 * تنسيق النسبة المئوية
 * @param {number} value - القيمة
 * @param {number} decimals - عدد الأرقام العشرية
 * @returns {string} - النسبة منسقة
 */
export function formatPercent(value, decimals = 1) {
  const num = Number(value) || 0;
  const formatted = num.toFixed(decimals);
  return `${convertToWesternNumerals(formatted)}%`;
}

/**
 * تحليل تاريخ من نص (يدعم الأرقام العربية والغربية)
 * @param {string} dateStr - نص التاريخ
 * @param {string} format - صيغة التاريخ
 * @returns {Date|null} - كائن التاريخ
 */
export function parseDate(dateStr, format = 'dd/MM/yyyy') {
  if (!dateStr) return null;
  
  // تحويل أي أرقام عربية إلى غربية أولاً
  const western = convertToWesternNumerals(dateStr);
  
  // محاولة التحليل حسب الصيغة
  if (format === 'dd/MM/yyyy') {
    const parts = western.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  }
  
  // محاولة التحليل القياسي
  const parsed = new Date(western);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * الحصول على التاريخ الحالي منسقاً
 * @returns {string} - التاريخ الحالي
 */
export function getCurrentDate() {
  return formatShortDate(new Date());
}

/**
 * الحصول على الوقت الحالي منسقاً
 * @returns {string} - الوقت الحالي
 */
export function getCurrentTime() {
  return formatTime(new Date());
}

/**
 * الحصول على التاريخ والوقت الحالي منسقاً
 * @returns {string} - التاريخ والوقت الحالي
 */
export function getCurrentDateTime() {
  return formatDateTime(new Date());
}

// تصدير افتراضي مع كل الدوال
const globalDateFormatter = {
  // إعدادات
  setConfig,
  getConfig,
  
  // تحويل الأرقام
  convertToWesternNumerals,
  convertToArabicNumerals,
  
  // تنسيق التاريخ
  formatShortDate,
  formatLongDate,
  formatTime,
  formatDateTime,
  formatRelative,
  
  // تنسيق الأرقام
  formatNumber,
  formatCurrency,
  formatLargeNumber,
  formatPercent,
  
  // تحليل
  parseDate,
  
  // الوقت الحالي
  getCurrentDate,
  getCurrentTime,
  getCurrentDateTime
};

export default globalDateFormatter;

// ============================================
// تطبيق تلقائي على كامل النظام
// ============================================

// ── 1. Date.prototype ──
const originalToLocaleString = Date.prototype.toLocaleString;
Date.prototype.toLocaleString = function(...args) {
  return convertToWesternNumerals(originalToLocaleString.apply(this, args));
};

const originalToLocaleDateString = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function(...args) {
  return convertToWesternNumerals(originalToLocaleDateString.apply(this, args));
};

const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
Date.prototype.toLocaleTimeString = function(...args) {
  return convertToWesternNumerals(originalToLocaleTimeString.apply(this, args));
};

// ── 2. Number.prototype.toLocaleString ──
const _origNumToLocaleString = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function(...args) {
  return convertToWesternNumerals(_origNumToLocaleString.apply(this, args));
};

// ── 3. Intl.NumberFormat.prototype.format (getter) ──
try {
  const _nfDesc = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, 'format');
  if (_nfDesc && _nfDesc.get) {
    Object.defineProperty(Intl.NumberFormat.prototype, 'format', {
      get() {
        const origFn = _nfDesc.get.call(this);
        return (value) => convertToWesternNumerals(origFn(value));
      },
      configurable: true,
    });
  }
} catch (_) { /* silent */ }

// ── 4. Intl.DateTimeFormat.prototype.format (getter) ──
try {
  const _dtfDesc = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format');
  if (_dtfDesc && _dtfDesc.get) {
    Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
      get() {
        const origFn = _dtfDesc.get.call(this);
        return (value) => convertToWesternNumerals(origFn(value));
      },
      configurable: true,
    });
  }
} catch (_) { /* silent */ }

// ── 5. Intl.DateTimeFormat.prototype.formatToParts ──
try {
  const _origFormatToParts = Intl.DateTimeFormat.prototype.formatToParts;
  Intl.DateTimeFormat.prototype.formatToParts = function(...args) {
    const parts = _origFormatToParts.apply(this, args);
    return parts.map(p => ({ ...p, value: convertToWesternNumerals(p.value) }));
  };
} catch (_) { /* silent */ }
