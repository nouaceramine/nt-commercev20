/**
 * ReceiptSettingsCard - Receipt configuration (auto-print, templates, footer)
 * Extracted from PrinterTab.js (Refactoring: Extract Component)
 */
import { Printer, Eye, Save, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';

export default function ReceiptSettingsCard({
  settings, onChange, onSave, saving, language,
}) {
  const ar = language === 'ar';
  const activeTemplate = settings.templates?.find(t => t.id === settings.default_template_id);

  const update = (patch) => onChange(prev => ({ ...prev, ...patch }));
  const updateTemplate = (idx, field, value) => {
    const newTemplates = [...settings.templates];
    newTemplates[idx] = { ...newTemplates[idx], [field]: value };
    update({ templates: newTemplates });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-purple-600" />
          {ar ? 'إعدادات الإيصال' : 'Paramètres du reçu'}
        </CardTitle>
        <CardDescription>{ar ? 'تخصيص شكل الإيصال وخيارات الطباعة بعد البيع' : "Personnaliser le format du reçu et les options d'impression après vente"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auto print */}
        <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-100"><Printer className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="font-medium text-green-800">{ar ? 'طباعة تلقائية بعد البيع' : 'Impression auto après vente'}</p>
              <p className="text-sm text-green-600">{ar ? 'طباعة الإيصال مباشرة بدون سؤال' : 'Imprimer le reçu directement sans confirmation'}</p>
            </div>
          </div>
          <Switch checked={settings.auto_print} onCheckedChange={(v) => update({ auto_print: v })} />
        </div>

        {/* Show dialog */}
        <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-100"><Eye className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="font-medium text-blue-800">{ar ? 'عرض حوار الطباعة' : "Afficher dialogue d'impression"}</p>
              <p className="text-sm text-blue-600">{ar ? 'إظهار خيار طباعة/تخطي بعد كل بيع' : "Afficher l'option imprimer/passer après chaque vente"}</p>
            </div>
          </div>
          <Switch checked={settings.show_print_dialog} onCheckedChange={(v) => update({ show_print_dialog: v })} disabled={settings.auto_print} />
        </div>

        {/* Thermal printer size */}
        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-full bg-purple-100"><Printer className="h-5 w-5 text-purple-600" /></div>
            <div>
              <p className="font-medium text-purple-800">{ar ? 'حجم الطابعة الحرارية' : 'Taille imprimante thermique'}</p>
              <p className="text-sm text-purple-600">{ar ? 'اختر حجم ورق الطابعة الحرارية الخاصة بك' : 'Sélectionnez la taille du papier de votre imprimante thermique'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            {['58mm', '80mm'].map(size => (
              <button key={size} type="button" onClick={() => update({ thermal_printer_size: size })}
                className={`p-4 rounded-lg border-2 transition-all ${settings.thermal_printer_size === size ? 'border-purple-500 bg-purple-100' : 'border-gray-200 hover:border-purple-300'}`}>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${settings.thermal_printer_size === size ? 'text-purple-700' : 'text-gray-700'}`}>{size}</div>
                  <p className="text-sm text-muted-foreground mt-1">{ar ? (size === '58mm' ? 'طابعة صغيرة' : 'طابعة قياسية') : (size === '58mm' ? 'Petite imprimante' : 'Imprimante standard')}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Default template */}
        <div>
          <Label>{ar ? 'قالب الإيصال الافتراضي' : 'Modèle de reçu par défaut'}</Label>
          <Select value={settings.default_template_id} onValueChange={(v) => update({ default_template_id: v })}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              {settings.templates?.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex items-center gap-2">
                    <span>{ar ? t.name_ar : t.name}</span>
                    <span className="text-xs text-muted-foreground">({t.width})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Templates table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? 'القالب' : 'Modèle'}</TableHead>
                <TableHead className="text-center">{ar ? 'الحجم' : 'Taille'}</TableHead>
                <TableHead className="text-center">{ar ? 'الشعار' : 'Logo'}</TableHead>
                <TableHead className="text-center">{ar ? 'الترويسة' : 'En-tête'}</TableHead>
                <TableHead className="text-center">{ar ? 'التذييل' : 'Pied'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.templates?.map((t, idx) => (
                <TableRow key={t.id} className={t.id === settings.default_template_id ? 'bg-primary/5' : ''}>
                  <TableCell className="font-medium">
                    {ar ? t.name_ar : t.name}
                    {t.id === settings.default_template_id && <span className="ms-2 text-xs text-primary">{ar ? '(افتراضي)' : '(défaut)'}</span>}
                  </TableCell>
                  <TableCell className="text-center"><span className="px-2 py-1 bg-muted rounded text-xs font-mono">{t.width}</span></TableCell>
                  {['show_logo', 'show_header', 'show_footer'].map(field => (
                    <TableCell key={field} className="text-center">
                      <Switch checked={t[field]} onCheckedChange={(c) => updateTemplate(idx, field, c)} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Footer text */}
        <div>
          <Label>{ar ? 'نص التذييل (يظهر في أسفل الإيصال)' : 'Texte de pied (affiché en bas du reçu)'}</Label>
          <Input
            value={activeTemplate?.footer_text || ''}
            onChange={(e) => {
              const newTemplates = settings.templates.map(t =>
                t.id === settings.default_template_id ? { ...t, footer_text: e.target.value } : t
              );
              update({ templates: newTemplates });
            }}
            placeholder={ar ? 'شكراً لزيارتكم' : 'Merci pour votre visite'}
            className="mt-2"
          />
        </div>

        <Button onClick={onSave} disabled={saving} className="gap-2" data-testid="save-receipt-btn">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {ar ? 'حفظ إعدادات الإيصال' : 'Enregistrer paramètres reçu'}
        </Button>
      </CardContent>
    </Card>
  );
}
