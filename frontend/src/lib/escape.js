// Tiny escape helper for HTML to avoid injection when interpolating into
// generated print templates. Standalone (no deps) so it can be imported
// from print/template utilities.
export const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export default escapeHtml;
