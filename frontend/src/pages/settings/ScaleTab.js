/**
 * ScaleTab — p165: weight-scale barcode configuration.
 *
 * How it works (label scales): the scale prints an EAN-13 barcode after
 * weighing, structured as:  PP LLLLL WWWWW C
 *   PP    = prefix (default 21)
 *   LLLLL = product PLU code (plu_digits)
 *   WWWWW = weight in grams (weight_digits)
 *   C     = check digit
 * POS reads the scanned barcode, extracts the PLU (matched against the
 * product's scale_plu field) and adds the item with quantity = weight in kg.
 */
import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Scale, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function ScaleTab() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState({ enabled: false, prefix: '21', plu_digits: 5, weight_digits: 5, weight_decimals: 3 });

  useEffect(() => {
    apiClient.get('/pos/scale-config')
      .then(r => setCfg({ enabled: false, prefix: '21', plu_digits: 5, weight_digits: 5, weight_decimals: 3, ...r.data }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put('/pos/scale-config', cfg);
      toast.success(ar ? 'تم حفظ إعدادات الميزان' : 'Configuration balance enregistrée');
    } catch (e) {
      toast.error(ar ? 'فشل الحفظ' : 'Échec');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-32 flex items-center justify-center"><div className="spinner" /></div>;

  return (
    <Card data-testid="scale-tab">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-blue-600" />
          {ar ? 'الميزان الإلكتروني (باركود وزني)' : 'Balance électronique (code-barres poids)'}
        </CardTitle>
        <CardDescription>
          {ar
            ? 'للموازين التي تطبع ملصق باركود بعد الوزن: فعّل القراءة وبرمج ميزانك على نفس البادئة. لا حاجة لأي وصلة بين الميزان والحاسوب — الملصق المطبوع يُمسح في نقطة البيع.'
            : 'Pour les balances à étiquettes : activez la lecture et programmez le même préfixe. Aucun câble requis — l’étiquette est scannée en caisse.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div>
            <Label className="text-sm font-medium">{ar ? 'تفعيل قراءة باركود الميزان' : 'Activer la lecture balance'}</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {ar ? 'عند مسح باركود يبدأ بالبادئة، يُستخرج المنتج والوزن تلقائياً' : 'Un code-barres commençant par le préfixe est décodé automatiquement'}
            </p>
          </div>
          <Switch checked={!!cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} data-testid="scale-enabled-switch" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label>{ar ? 'البادئة' : 'Préfixe'}</Label>
            <Input dir="ltr" value={cfg.prefix} maxLength={2} onChange={(e) => setCfg({ ...cfg, prefix: e.target.value.replace(/\D/g, '') })} className="mt-1 text-center" data-testid="scale-prefix" />
          </div>
          <div>
            <Label>{ar ? 'خانات الكود (PLU)' : 'Chiffres PLU'}</Label>
            <Input dir="ltr" type="number" min="3" max="6" value={cfg.plu_digits} onChange={(e) => setCfg({ ...cfg, plu_digits: parseInt(e.target.value) || 5 })} className="mt-1 text-center" />
          </div>
          <div>
            <Label>{ar ? 'خانات الوزن' : 'Chiffres poids'}</Label>
            <Input dir="ltr" type="number" min="4" max="6" value={cfg.weight_digits} onChange={(e) => setCfg({ ...cfg, weight_digits: parseInt(e.target.value) || 5 })} className="mt-1 text-center" />
          </div>
          <div>
            <Label>{ar ? 'الفواصل العشرية للوزن' : 'Décimales poids'}</Label>
            <Input dir="ltr" type="number" min="0" max="4" value={cfg.weight_decimals} onChange={(e) => setCfg({ ...cfg, weight_decimals: parseInt(e.target.value) ?? 3 })} className="mt-1 text-center" />
          </div>
        </div>

        <div className="p-3 rounded-lg bg-muted/50 text-sm" dir="ltr">
          <span className="font-mono font-bold">{cfg.prefix || '21'}</span>
          <span className="font-mono text-blue-600">{'L'.repeat(cfg.plu_digits || 5)}</span>
          <span className="font-mono text-emerald-600">{'W'.repeat(cfg.weight_digits || 5)}</span>
          <span className="font-mono text-muted-foreground">C</span>
          <span className="text-muted-foreground ms-2" dir={ar ? 'rtl' : 'ltr'}>
            {ar ? 'مثال: 2110025007503 → الكود 10025، الوزن 0.750 كغ' : 'Ex: 2110025007503 → PLU 10025, poids 0.750 kg'}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          {ar
            ? 'لا تنسَ: لكل منتج يُباع بالوزن، فعّل «يُباع بالوزن» وأدخل كود PLU في صفحة المنتج (تبويب البيع).'
            : 'Pour chaque produit au poids : activez « Vendu au poids » et saisissez le PLU dans la fiche produit.'}
        </p>

        <Button onClick={save} disabled={saving} className="gap-2" data-testid="scale-save-btn">
          <Save className="h-4 w-4" />
          {ar ? 'حفظ' : 'Enregistrer'}
        </Button>
      </CardContent>
    </Card>
  );
}
