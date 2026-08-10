// /ecom-hub/store — إعدادات المتجر الإلكتروني (تفعيل/اسم/شعار/ألوان)
import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { EcomHubTabs } from '../../components/ecom/EcomHubTabs';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { Save, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const DEFAULTS = {
  enabled: false, store_name: '', store_slug: '', description: '', logo_url: '',
  primary_color: '#3b82f6', contact_phone: '', cod_enabled: true,
  delivery_enabled: true, delivery_fee: 0,
};

export default function EcomStoreTab() {
  const { language } = useLanguage();
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const ar = language === 'ar';

  useEffect(() => {
    apiClient.get('/store/settings')
      .then(r => setSettings({ ...DEFAULTS, ...(r.data || {}) }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put('/store/settings', settings);
      toast.success(ar ? 'تم حفظ إعدادات المتجر' : 'Paramètres enregistrés');
    } catch {
      toast.error(ar ? 'فشل الحفظ' : 'Échec');
    } finally { setSaving(false); }
  };

  const set = (k, v) => setSettings(s => ({ ...s, [k]: v }));

  return (
    <Layout>
      <div className="space-y-6" data-testid="ecom-store-tab">
        <EcomHubTabs />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{ar ? 'إعدادات المتجر الإلكتروني' : 'Paramètres de la boutique'}</span>
              <div className="flex items-center gap-3">
                {settings.store_slug && (
                  <a href={`/shop/${settings.store_slug}`} target="_blank" rel="noreferrer"
                     className="text-sm text-blue-600 flex items-center gap-1">
                    <ExternalLink className="h-4 w-4" /> {ar ? 'معاينة المتجر' : 'Aperçu'}
                  </a>
                )}
                <Link to="/store" className="text-sm text-blue-600">{ar ? 'إدارة المنتجات والطلبات' : 'Gérer produits/commandes'}</Link>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border rounded-lg p-4">
              <div>
                <p className="font-medium">{ar ? 'تفعيل المتجر' : 'Activer la boutique'}</p>
                <p className="text-sm text-muted-foreground">{ar ? 'يصبح متجرك متاحاً على الرابط العام /shop/' : 'Votre boutique devient publique sur /shop/'}</p>
              </div>
              <Switch checked={settings.enabled} onCheckedChange={v => set('enabled', v)} data-testid="store-enabled-switch" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>{ar ? 'اسم المتجر' : 'Nom'}</Label><Input value={settings.store_name} onChange={e => set('store_name', e.target.value)} className="mt-1" /></div>
              <div><Label>{ar ? 'الرابط (slug)' : 'Slug'}</Label><Input value={settings.store_slug} onChange={e => set('store_slug', e.target.value)} className="mt-1" dir="ltr" placeholder="my-shop" /></div>
              <div><Label>{ar ? 'رابط الشعار' : 'Logo URL'}</Label><Input value={settings.logo_url} onChange={e => set('logo_url', e.target.value)} className="mt-1" dir="ltr" /></div>
              <div><Label>{ar ? 'اللون الرئيسي' : 'Couleur'}</Label><Input type="color" value={settings.primary_color} onChange={e => set('primary_color', e.target.value)} className="mt-1 h-10" /></div>
              <div><Label>{ar ? 'هاتف التواصل' : 'Téléphone'}</Label><Input value={settings.contact_phone} onChange={e => set('contact_phone', e.target.value)} className="mt-1" dir="ltr" /></div>
              <div><Label>{ar ? 'رسوم التوصيل (دج)' : 'Frais livraison'}</Label><Input type="number" value={settings.delivery_fee} onChange={e => set('delivery_fee', parseFloat(e.target.value) || 0)} className="mt-1" /></div>
            </div>
            <div><Label>{ar ? 'الوصف' : 'Description'}</Label><Textarea value={settings.description} onChange={e => set('description', e.target.value)} className="mt-1" rows={2} /></div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2"><Switch checked={settings.cod_enabled} onCheckedChange={v => set('cod_enabled', v)} />{ar ? 'الدفع عند الاستلام (COD)' : 'COD'}</label>
              <label className="flex items-center gap-2"><Switch checked={settings.delivery_enabled} onCheckedChange={v => set('delivery_enabled', v)} />{ar ? 'التوصيل متاح' : 'Livraison'}</label>
            </div>
            <Button onClick={save} disabled={saving || loading} className="gap-2" data-testid="save-store-settings">
              <Save className="h-4 w-4" />{ar ? 'حفظ' : 'Enregistrer'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
