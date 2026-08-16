/**
 * CustomTemplatesTable - Custom template CRUD table
 * Extracted from PrinterTab.js (Refactoring: Extract Component)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutTemplate, Plus, Pencil, Copy, Star, Trash2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { TemplateService } from '../../services/TemplateService';
import { MODERN_TEMPLATE_PRESETS } from '../../lib/modernTemplatePresets';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';

const DOC_LABELS_MAP = {
  sale: { ar: 'بيع', fr: 'Vente' },
  purchase: { ar: 'شراء', fr: 'Achat' },
  customer: { ar: 'زبون', fr: 'Client' },
  product: { ar: 'منتج', fr: 'Produit' },
  expense: { ar: 'مصروف', fr: 'Dépense' },
  receipt: { ar: 'إيصال', fr: 'Reçu' },
  repair: { ar: 'صيانة', fr: 'Réparation' },
};

export default function CustomTemplatesTable({
  templates, loading, language,
  onDelete, onDuplicate, onSetDefault, onImported,
}) {
  const navigate = useNavigate();
  const ar = language === 'ar';
  const [importing, setImporting] = useState(false);

  // p122: import ready-made modern templates (with QR) in one click
  const importModernPresets = async () => {
    if (importing) return;
    setImporting(true);
    let added = 0;
    try {
      for (const preset of MODERN_TEMPLATE_PRESETS) {
        const exists = (templates || []).some(t => t.type === preset.type && t.name_ar === preset.name_ar);
        if (exists) continue;
        const blocks = preset.buildBlocks().map(bl => ({ ...bl, id: Math.random().toString(36).slice(2) }));
        await TemplateService.saveTemplate({
          name_ar: preset.name_ar, name_fr: preset.name_fr,
          docType: preset.type, paperWidth: preset.paperWidth,
          accentColor: preset.accentColor, blocks,
        });
        added += 1;
      }
      if (added > 0) {
        toast.success(ar ? `تمت إضافة ${added} قوالب عصرية مع QR` : `${added} modèles modernes ajoutés`);
      } else {
        toast.info(ar ? 'القوالب العصرية مضافة مسبقاً' : 'Modèles modernes déjà présents');
      }
      if (onImported) onImported();
    } catch (e) {
      toast.error(ar ? 'فشل استيراد القوالب' : 'Échec de l\'import');
    } finally {
      setImporting(false);
    }
  };

  const docLabel = (type) => {
    const lbl = DOC_LABELS_MAP[type];
    return ar ? (lbl?.ar || type) : (lbl?.fr || type);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-indigo-600" />
              {ar ? 'القوالب المخصصة' : 'Modèles personnalisés'}
            </CardTitle>
            <CardDescription className="mt-1">
              {ar ? 'أنشئ قوالب طباعة خاصة بك باستخدام المحرر المرئي' : 'Créez vos propres modèles avec l\'éditeur visuel'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" disabled={importing} onClick={importModernPresets} data-testid="import-modern-templates-btn">
              {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-500" />}
              {ar ? 'قوالب عصرية جاهزة' : 'Modèles modernes'}
            </Button>
            <Button className="gap-2" onClick={() => navigate('/settings/printing/template-editor')} data-testid="new-template-btn">
              <Plus className="h-4 w-4" />
              {ar ? 'قالب جديد' : 'Nouveau modèle'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <RefreshCw className="h-4 w-4 animate-spin me-2" />
            {ar ? 'جاري التحميل…' : 'Chargement…'}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
            <LayoutTemplate className="h-12 w-12 opacity-25" />
            <p className="text-sm text-center">
              {ar ? 'لا توجد قوالب مخصصة بعد. انقر على "قالب جديد" لإنشاء أول قالب.' : 'Aucun modèle personnalisé. Cliquez sur "Nouveau modèle" pour créer le premier.'}
            </p>
            <Button variant="outline" className="gap-2 mt-1" onClick={() => navigate('/settings/printing/template-editor')}>
              <Plus className="h-4 w-4" />
              {ar ? 'إنشاء قالب' : 'Créer un modèle'}
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? 'الاسم' : 'Nom'}</TableHead>
                  <TableHead className="text-center">{ar ? 'نوع المستند' : 'Type doc'}</TableHead>
                  <TableHead className="text-center">{ar ? 'حجم الورق' : 'Papier'}</TableHead>
                  <TableHead className="text-center">{ar ? 'الكتل' : 'Blocs'}</TableHead>
                  <TableHead className="text-center">{ar ? 'الإجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map(tmpl => (
                  <TableRow key={tmpl.id} className={tmpl.is_default ? 'bg-primary/5' : ''}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{ar ? tmpl.name_ar : tmpl.name_fr}</span>
                        {tmpl.is_default && (
                          <Badge variant="outline" className="text-xs text-primary border-primary">
                            {ar ? 'افتراضي' : 'Défaut'}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="px-2 py-1 bg-muted rounded text-xs">{docLabel(tmpl.type)}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="px-2 py-1 bg-muted rounded text-xs font-mono">
                        {tmpl.paper_width === 210 ? 'A4' : `${tmpl.paper_width}mm`}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm text-muted-foreground">{(tmpl.blocks || []).length}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          title={ar ? 'تعديل' : 'Modifier'}
                          onClick={() => navigate(`/settings/printing/template-editor/${tmpl.id}`)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          title={ar ? 'نسخ' : 'Dupliquer'}
                          onClick={() => onDuplicate(tmpl.id)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {!tmpl.is_default && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500"
                            title={ar ? 'تعيين افتراضي' : 'Définir par défaut'}
                            onClick={() => onSetDefault(tmpl)}>
                            <Star className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          title={ar ? 'حذف' : 'Supprimer'}
                          onClick={() => onDelete(tmpl.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
