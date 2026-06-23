import { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Printer, X, LayoutTemplate } from 'lucide-react';
import { buildPrintHTML, DOC_LABELS, DEFAULT_DOC_OPTIONS } from '../../lib/printDocuments';
import { buildCustomTemplateHTML } from '../../lib/customTemplateRenderer';

const PAPER_SIZES = ['58mm', '80mm', 'A4'];

/**
 * حوار معاينة وطباعة مستند (وصل/فاتورة/سند) لأي سجل في البرنامج.
 * يجلب العلامة التجارية وإعدادات المستندات، يعرض معاينة حيّة، ثم يطبع.
 * يدعم القوالب الجاهزة والقوالب المخصصة (block-based).
 */
export default function PrintDocumentDialog({ open, onOpenChange, docType, record, documentId }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const iframeRef = useRef(null);

  const [branding, setBranding] = useState({});
  const [options, setOptions] = useState(DEFAULT_DOC_OPTIONS[docType] || {});
  const [paperSize, setPaperSize] = useState((DEFAULT_DOC_OPTIONS[docType] || {}).paperSize || '80mm');
  const [loading, setLoading] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);

  // Custom template support
  const [customTemplates, setCustomTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('__builtin__');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [brandRes, receiptRes, templatesRes] = await Promise.all([
          apiClient.get('/settings/tenant-branding').catch(() => ({ data: {} })),
          apiClient.get('/settings/receipt').catch(() => ({ data: {} })),
          apiClient.get(`/printing/templates?type=${docType}`).catch(() => ({ data: [] })),
        ]);
        if (!active) return;
        setBranding(brandRes.data || {});
        const docDefaults = DEFAULT_DOC_OPTIONS[docType] || {};
        const saved = (receiptRes.data?.document_print && receiptRes.data.document_print[docType]) || {};
        const merged = { ...docDefaults, ...saved };
        setOptions(merged);
        setPaperSize(merged.paperSize || docDefaults.paperSize || '80mm');

        // Load custom templates for this doc type
        const custom = (templatesRes.data || []).filter(t => t.is_custom);
        setCustomTemplates(custom);
        // If there's a default custom template, select it automatically
        const defaultCustom = custom.find(t => t.is_default);
        if (defaultCustom) {
          setSelectedTemplateId(defaultCustom.id);
        } else {
          setSelectedTemplateId('__builtin__');
        }
      } catch (e) {
        setOptions(DEFAULT_DOC_OPTIONS[docType] || {});
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, docType]);

  // Determine which template to use
  const selectedCustomTemplate = customTemplates.find(t => t.id === selectedTemplateId);

  const html = record
    ? (selectedCustomTemplate
        ? buildCustomTemplateHTML({ template: selectedCustomTemplate, record, branding, language })
        : buildPrintHTML({ docType, record, options: { ...options, paperSize }, branding, language }))
    : '';

  useEffect(() => { setIframeReady(false); }, [html]);

  // Sync paperSize from custom template when switching
  useEffect(() => {
    if (selectedCustomTemplate) {
      const w = selectedCustomTemplate.paper_width;
      setPaperSize(w === 210 ? 'A4' : w === 58 ? '58mm' : '80mm');
    }
  }, [selectedCustomTemplate]);

  const handlePrint = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow || !iframeReady) return;
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      // ignore print errors (user cancel)
    }
    try {
      await apiClient.post('/printing/log', {
        document_type: docType,
        document_id: documentId || record?.id || '',
        printer_type: paperSize === 'A4' ? 'a4' : 'thermal',
        copies: 1,
      });
    } catch (e) {
      // logging is best-effort
    }
  }, [docType, documentId, record, paperSize, iframeReady]);

  const title = ar ? DOC_LABELS[docType]?.ar : DOC_LABELS[docType]?.fr;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {ar ? 'معاينة الطباعة' : "Aperçu d'impression"}{title ? ` — ${title}` : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 flex-wrap">
          {/* Template selector if custom templates exist */}
          {customTemplates.length > 0 && (
            <div className="flex items-center gap-2 me-3">
              <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedTemplateId('__builtin__')}
                  className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                    selectedTemplateId === '__builtin__' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                  }`}
                >
                  {ar ? 'افتراضي' : 'Défaut'}
                </button>
                {customTemplates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(t.id)}
                    className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                      selectedTemplateId === t.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {ar ? t.name_ar : t.name_fr}
                  </button>
                ))}
              </div>
              <div className="w-px h-4 bg-border" />
            </div>
          )}

          {/* Paper size — only shown for built-in template */}
          {!selectedCustomTemplate && (
            <>
              <span className="text-sm text-muted-foreground">{ar ? 'حجم الورق:' : 'Taille du papier:'}</span>
              {PAPER_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPaperSize(size)}
                  className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                    paperSize === size ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                  }`}
                >
                  {size}
                </button>
              ))}
            </>
          )}

          {selectedCustomTemplate && (
            <span className="text-xs text-muted-foreground">
              {ar ? 'قالب مخصص' : 'Modèle personnalisé'} · {selectedCustomTemplate.paper_width === 210 ? 'A4' : `${selectedCustomTemplate.paper_width}mm`}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto bg-gray-100 p-4 flex justify-center" style={{ minHeight: '300px' }}>
          {loading ? (
            <div className="flex items-center justify-center text-muted-foreground">
              {ar ? 'جاري التحميل...' : 'Chargement...'}
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              title="print-preview"
              srcDoc={html}
              onLoad={() => setIframeReady(true)}
              className="bg-white shadow-lg border-0"
              style={{
                width: paperSize === 'A4' ? '210mm' : paperSize,
                minHeight: paperSize === 'A4' ? '297mm' : '420px',
                maxWidth: '100%',
              }}
            />
          )}
        </div>

        <div className="flex gap-2 p-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 gap-2">
            <X className="h-4 w-4" />
            {ar ? 'إغلاق' : 'Fermer'}
          </Button>
          <Button onClick={handlePrint} disabled={loading || !record} className="flex-1 gap-2">
            <Printer className="h-4 w-4" />
            {ar ? 'طباعة' : 'Imprimer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
