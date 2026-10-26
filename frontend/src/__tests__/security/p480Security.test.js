import { buildCustomTemplateHTML } from '../../lib/customTemplateRenderer';
import { buildPrintHTML } from '../../lib/printDocuments';
import { qrImgUrl } from '../../lib/docCodes';
import { safeCssColor, safeCssNumber, safeHtmlId } from '../../lib/printSafety';

describe('p480 stored template and print hardening', () => {
  it('neutralizes CSS, attribute and identifier injection in custom templates', () => {
    const attack = 'red;background:url(https://evil.test);"><img src=x onerror=alert(1)>';
    const html = buildCustomTemplateHTML({
      language: 'ar',
      branding: { name: 'متجر' },
      record: { code: 'INV-1' },
      template: {
        name_ar: 'قالب', paper_width: 80, accent_color: attack,
        blocks: [
          { id: 'store', type: 'store_name', style: {} },
          { id: attack, type: 'text', content: 'آمن', style: { color: attack, textAlign: attack, fontWeight: attack, widthPercent: attack, marginTop: attack } },
          { id: attack, type: 'qr', fieldKey: 'code', qrSize: attack, style: {} },
          { id: 'space', type: 'spacer', height: attack, style: {} },
        ],
      },
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('https://evil.test');
    expect(html).toContain('color:#0f766e');
    expect(html).toContain('color:#000');
    expect(html).toContain('data-size="80"');
    expect(html).toContain('height:12px');
  });

  it('keeps valid template values pixel-compatible', () => {
    expect(safeCssColor('#0f766e')).toBe('#0f766e');
    expect(safeCssNumber(80, 12, 16, 512)).toBe(80);
    expect(safeHtmlId('block_1-ar')).toBe('block_1-ar');
  });

  it('sanitizes standard print accents and QR dimensions', () => {
    const html = buildPrintHTML({
      docType: 'sale', language: 'ar', record: { invoice_number: 'INV-1', total: 10 },
      options: { accentColor: '#000;}</style><script>alert(1)</script>', showCodes: false },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('color:#0f766e');
    expect(qrImgUrl('INV-1', '90px;animation:x')).toContain('size=140');
  });
});
