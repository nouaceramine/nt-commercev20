/**
 * DocumentPrintSettingsCard - Per-document-type print configuration
 * Extracted from PrinterTab.js (Refactoring: Extract Component)
 */
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Save, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { PRINT_DOC_TYPES, DOC_LABELS, DEFAULT_DOC_OPTIONS } from '../../lib/printDocuments';

const TOGGLES = [
  ['showLogo', 'الشعار', 'Logo'],
  ['showHeader', 'الترويسة', 'En-tête'],
  ['showFooter', 'التذييل', 'Pied de page'],
  ['showColumns', 'تفاصيل البنود', 'Détails'],
];

export default function DocumentPrintSettingsCard({
  settings, onUpdate, onSave, saving, language,
}) {
  const navigate = useNavigate();
  const ar = language === 'ar';
  const docPrint = settings.document_print || {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-teal-600" />
          {ar ? 'إعدادات طباعة المستندات' : 'Impression des documents'}
        </CardTitle>
        <CardDescription>
          {ar ? 'تخصيص قوالب الطباعة لكل قسم (الزبائن، المنتجات، المشتريات، المبيعات، المصاريف)' : 'Personnaliser les modèles par section (clients, produits, achats, ventes, dépenses)'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {PRINT_DOC_TYPES.map(dt => {
          const cfg = { ...DEFAULT_DOC_OPTIONS[dt], ...(docPrint[dt] || {}) };
          return (
            <div key={dt} className="border rounded-lg p-4 space-y-3" data-testid={`doc-print-${dt}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="font-semibold">{ar ? DOC_LABELS[dt].ar : DOC_LABELS[dt].fr}</div>
                <Button variant="outline" size="sm" className="gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-xs"
                  onClick={() => navigate(`/settings/printing/template-editor?docType=${dt}`)}>
                  <Plus className="h-3 w-3" />
                  {ar ? 'قالب مخصص' : 'Modèle custom'}
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">{ar ? 'حجم الورق:' : 'Papier:'}</span>
                {['58mm', '80mm', 'A4'].map(sz => (
                  <button key={sz} type="button" onClick={() => onUpdate(dt, { paperSize: sz })}
                    className={`px-3 py-1 rounded-md text-sm border transition-colors ${cfg.paperSize === sz ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>
                    {sz}
                  </button>
                ))}
                <span className="text-sm text-muted-foreground ms-2">{ar ? 'اللون:' : 'Couleur:'}</span>
                <input type="color" value={cfg.accentColor || '#0f766e'} onChange={(e) => onUpdate(dt, { accentColor: e.target.value })}
                  className="h-8 w-10 rounded border cursor-pointer" title={ar ? 'لون التمييز' : 'Couleur'} />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {TOGGLES.map(([k, la, lf]) => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Switch checked={cfg[k] !== false} onCheckedChange={(c) => onUpdate(dt, { [k]: c })} />
                    {ar ? la : lf}
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        <Button onClick={onSave} disabled={saving} className="gap-2" data-testid="save-doc-print-btn">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {ar ? 'حفظ إعدادات المستندات' : 'Enregistrer les documents'}
        </Button>
      </CardContent>
    </Card>
  );
}
