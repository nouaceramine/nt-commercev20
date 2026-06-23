import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { toast } from 'sonner';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Shield, Upload, Trash2, Save } from 'lucide-react';

export default function BrandingTab() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.get('/settings/tenant-branding');
        setName(res.data?.name || '');
        setLogoUrl(res.data?.logo_url || '');
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(ar ? 'الرجاء اختيار ملف صورة' : 'Veuillez choisir une image');
      return;
    }
    if (file.size > 512 * 1024) {
      toast.error(ar ? 'حجم الصورة يجب أن يكون أقل من 512 كيلوبايت' : 'Image < 512 Ko requise');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post('/settings/tenant-branding', { name, logo_url: logoUrl });
      window.dispatchEvent(new Event('branding-updated'));
      toast.success(ar ? 'تم حفظ العلامة التجارية' : 'Image de marque enregistrée');
    } catch (e) {
      toast.error(ar ? 'فشل الحفظ' : 'Échec de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-32"><div className="spinner" /></div>;
  }

  return (
    <Card data-testid="branding-tab">
      <CardHeader>
        <CardTitle>{ar ? 'الشعار والاسم' : 'Logo et nom'}</CardTitle>
        <CardDescription>
          {ar
            ? 'خصّص شعار واسم متجرك الظاهر في أعلى القائمة الجانبية.'
            : 'Personnalisez le logo et le nom affichés en haut du menu.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="h-16 w-16 rounded-lg object-cover border" />
          ) : (
            <div className="h-16 w-16 rounded-lg border flex items-center justify-center bg-muted">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border cursor-pointer hover:bg-muted transition-colors w-fit">
              <Upload className="h-4 w-4" />
              {ar ? 'رفع شعار' : 'Téléverser un logo'}
              <input type="file" accept="image/*" className="hidden" onChange={handleFile} data-testid="branding-logo-input" />
            </label>
            {logoUrl && (
              <button
                type="button"
                onClick={() => setLogoUrl('')}
                className="inline-flex items-center gap-1 text-xs text-destructive hover:underline w-fit"
              >
                <Trash2 className="h-3 w-3" />
                {ar ? 'إزالة الشعار' : 'Supprimer le logo'}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-name">{ar ? 'اسم المتجر' : 'Nom du magasin'}</Label>
          <Input
            id="brand-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={ar ? 'مثال: متجري' : 'Ex: Mon magasin'}
            data-testid="branding-name-input"
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-2" data-testid="branding-save-btn">
          <Save className="h-4 w-4" />
          {saving ? (ar ? 'جارٍ الحفظ...' : 'Enregistrement...') : (ar ? 'حفظ' : 'Enregistrer')}
        </Button>
      </CardContent>
    </Card>
  );
}
