/**
 * BrandingSettingsCard - Login page branding configuration
 * Extracted from SystemTab.js (Refactoring: Extract Component)
 */
import { ImageIcon, Save, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';

export default function BrandingSettingsCard({ settings, onChange, onSave, saving, language }) {
  const ar = language === 'ar';
  const update = (patch) => onChange(prev => ({ ...prev, ...patch }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          {ar ? 'تخصيص صفحة الدخول' : 'Personnalisation de la page de connexion'}
        </CardTitle>
        <CardDescription>
          {ar ? 'تغيير الشعار والاسم والصورة في صفحة تسجيل الدخول' : "Modifier le logo, le nom et l'image sur la page de connexion"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>{ar ? 'اسم النظام/المتجر' : 'Nom du système/magasin'}</Label>
            <Input value={settings.business_name} onChange={(e) => update({ business_name: e.target.value })} placeholder="NT" />
          </div>
          <div className="space-y-2">
            <Label>{ar ? 'رابط الشعار (Logo URL)' : 'URL du logo'}</Label>
            <Input value={settings.logo_url} onChange={(e) => update({ logo_url: e.target.value })} placeholder="https://example.com/logo.png" dir="ltr" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{ar ? 'رابط صورة الخلفية' : "URL de l'image de fond"}</Label>
          <Input value={settings.background_image_url} onChange={(e) => update({ background_image_url: e.target.value })} placeholder="https://example.com/background.jpg" dir="ltr" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>{ar ? 'الشعار النصي (عربي)' : 'Slogan (arabe)'}</Label>
            <Input value={settings.tagline_ar} onChange={(e) => update({ tagline_ar: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{ar ? 'الشعار النصي (فرنسي)' : 'Slogan (français)'}</Label>
            <Input value={settings.tagline_fr} onChange={(e) => update({ tagline_fr: e.target.value })} dir="ltr" />
          </div>
        </div>
        <Button onClick={onSave} disabled={saving} className="gap-2" data-testid="save-branding-btn">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {ar ? 'حفظ إعدادات صفحة الدخول' : 'Enregistrer'}
        </Button>
      </CardContent>
    </Card>
  );
}
