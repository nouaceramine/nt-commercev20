/**
 * SystemSettingsCard - General system settings form
 * Extracted from SystemTab.js (Refactoring: Extract Component)
 */
import { Settings, AlertTriangle, GripVertical, ChevronRight, Save, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';

export default function SystemSettingsCard({ settings, onChange, onSave, saving, language }) {
  const ar = language === 'ar';
  const update = (patch) => onChange(prev => ({ ...prev, ...patch }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {ar ? 'إعدادات عامة' : 'Paramètres généraux'}
        </CardTitle>
        <CardDescription>{ar ? 'تخصيص إعدادات النظام والتنبيهات' : 'Personnaliser les paramètres du système et les alertes'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-4 border rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors">
          <a href="/settings/sidebar" className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10"><GripVertical className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="font-medium">{ar ? 'ترتيب القائمة الجانبية' : 'Organiser le menu latéral'}</p>
                <p className="text-sm text-muted-foreground">{ar ? 'اسحب وأفلت لتغيير ترتيب العناصر' : 'Glisser-déposer pour réorganiser'}</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{ar ? 'حد تنبيه العجز/الفائض' : "Seuil d'alerte écart caisse"}</Label>
            <div className="flex items-center gap-2">
              <Input type="number" value={settings.cash_difference_threshold} onChange={(e) => update({ cash_difference_threshold: parseFloat(e.target.value) || 0 })} className="w-32" />
              <span className="text-muted-foreground">{settings.currency_symbol}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" />{ar ? 'حد المخزون المنخفض' : 'Seuil de stock bas'}</Label>
            <div className="flex items-center gap-2">
              <Input type="number" value={settings.low_stock_threshold} onChange={(e) => update({ low_stock_threshold: parseInt(e.target.value) || 0 })} className="w-32" />
              <span className="text-muted-foreground">{ar ? 'وحدة' : 'unités'}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
          <div className="space-y-2">
            <Label>{ar ? 'اسم المتجر' : 'Nom du magasin'}</Label>
            <Input value={settings.business_name} onChange={(e) => update({ business_name: e.target.value })} placeholder="NT" />
          </div>
          <div className="space-y-2">
            <Label>{ar ? 'رمز العملة' : 'Symbole de devise'}</Label>
            <Input value={settings.currency_symbol} onChange={(e) => update({ currency_symbol: e.target.value })} placeholder="دج" className="w-24" />
          </div>
        </div>
        <Button onClick={onSave} disabled={saving} className="gap-2" data-testid="save-system-settings-btn">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {ar ? 'حفظ الإعدادات' : 'Enregistrer'}
        </Button>
      </CardContent>
    </Card>
  );
}
