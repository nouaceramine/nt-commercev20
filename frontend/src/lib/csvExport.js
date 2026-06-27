/**
 * Lightweight client-side CSV export.
 *
 * - Adds the UTF-8 BOM so Excel/Google Sheets opens Arabic correctly.
 * - Escapes commas, quotes, and newlines per RFC-4180.
 * - Triggers a download by injecting a hidden <a download="..."> element.
 */

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * @param {string} filename — saved file name (e.g. 'revenue-2026-02.csv').
 * @param {string[]} headers — column titles in order.
 * @param {Array<Array<any>>} rows — same length as headers.
 */
export function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  const csv = '\uFEFF' + lines.join('\r\n');  // UTF-8 BOM for Excel/Arabic
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/** Today as YYYY-MM-DD for filenames. */
export function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
