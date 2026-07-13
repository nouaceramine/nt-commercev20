/**
 * TemplateToolbar - Top toolbar for template editing
 * Extracted from TemplateEditorPage.js (Refactoring: Extract Component)
 */
import { ArrowRight, Palette, RefreshCw, Save } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import { DOC_LABELS } from '../../lib/printDocuments';
import { PAPER_OPTIONS } from '../../lib/templateConstants';

export default function TemplateToolbar({
  nameAr, setNameAr, nameFr, setNameFr,
  docType, setDocType, paperWidth, setPaperWidth,
  accentColor, setAccentColor,
  blocksCount, saving, onSave, onNavigateBack,
  language,
}) {
  const ar = language === 'ar';

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-background flex-shrink-0 flex-wrap">
      <Button variant="ghost" size="sm" className="gap-1 h-8" onClick={onNavigateBack}>
        <ArrowRight className={`h-4 w-4 ${ar ? '' : 'rotate-180'}`} />
        {ar ? 'رجوع' : 'Retour'}
      </Button>
      <div className="w-px h-5 bg-border" />

      <Input value={nameAr} onChange={e => setNameAr(e.target.value)}
        placeholder={ar ? 'اسم القالب (عربي)' : 'Nom (arabe)'}
        className="h-8 w-32 text-sm" />
      <Input value={nameFr} onChange={e => setNameFr(e.target.value)}
        placeholder={ar ? 'الاسم (فرنسي)' : 'Nom (français)'}
        className="h-8 w-32 text-sm" />

      <Select value={docType} onValueChange={v => { setDocType(v); }}>
        <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(DOC_LABELS).map(([k, v]) => (
            <SelectItem key={k} value={k} className="text-sm">{ar ? v.ar : v.fr}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={String(paperWidth)} onValueChange={v => setPaperWidth(Number(v))}>
        <SelectTrigger className="h-8 w-40 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PAPER_OPTIONS.map(o => (
            <SelectItem key={o.value} value={String(o.value)} className="text-sm">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
          className="h-8 w-10 rounded border cursor-pointer" title={ar ? 'لون التمييز' : 'Couleur accent'} />
      </div>

      <div className="ms-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {blocksCount} {ar ? 'كتلة' : 'blocs'}
        </span>
        <Button size="sm" className="gap-1 h-8" onClick={onSave} disabled={saving}>
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {ar ? 'حفظ' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
