/**
 * Template Editor Constants
 * Extracted from TemplateEditorPage.js (Refactoring: Replace Magic Numbers)
 * Following Martin Fowler's Refactoring patterns
 */

export const PAPER_OPTIONS = [
  { value: 58, label: '58mm (حراري صغير)' },
  { value: 80, label: '80mm (حراري قياسي)' },
  { value: 210, label: 'A4 (صفحة كاملة)' },
];

export const WIDTH_PRESETS = [
  { value: 25, label: '¼' },
  { value: 50, label: '½' },
  { value: 75, label: '¾' },
  { value: 100, label: '■' },
];

export const PAPER_WIDTH_MAP = {
  58: 219,   // 58mm thermal → 219px
  80: 302,   // 80mm thermal → 302px
  210: 390,  // A4 → 390px
};

export const DEFAULT_TEMPLATE = {
  name_ar: 'قالب جديد',
  name_fr: 'Nouveau modèle',
  docType: 'sale',
  paperWidth: 80,
  accentColor: '#0f766e',
  blocks: [],
};

/**
 * Get paper width in pixels
 */
export function getPaperWidthPx(paperWidth) {
  return PAPER_WIDTH_MAP[paperWidth] || PAPER_WIDTH_MAP[80];
}

/**
 * Check if paper is A4
 */
export function isA4Paper(paperWidth) {
  return paperWidth === 210;
}

/**
 * Get printer type from paper width
 */
export function getPrinterType(paperWidth) {
  return isA4Paper(paperWidth) ? 'a4' : 'thermal';
}
