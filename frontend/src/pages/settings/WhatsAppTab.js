import { useState } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { toast } from 'sonner';
import { MessageCircle, RefreshCw, Save } from 'lucide-react';

export default function WhatsAppTab({ initialSettings }) {
  const { language } = useLanguage();
  const [settings, setSettings] = useState(initialSettings || {
    enabled: false, phone_number_id: '', access_token: '', business_account_id: ''
  });
  const [saving, setSaving] = useState(false);

  const saveSettings = async () => {
    setSaving(true);
    try {
      
      await apiClient.put(`/whatsapp/settings`, settings);
      toast.success(language === 'ar' ? 'تم حفظ إعدادات WhatsApp' : 'Paramètres WhatsApp enregistrés');
    } catch (error) { toast.error(error.response?.data?.detail || 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-green-600" />
          {language === 'ar' ? 'إعدادات WhatsApp Business' : 'Paramètres WhatsApp Business'}
        </CardTitle>
        <CardDescription>
          {language === 'ar' ? 'قم بربط حسابك في WhatsApp Business لإرسال إشعارات تلقائية للعملاء' : 'Connectez votre compte WhatsApp Business pour envoyer des notifications automatiques'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${settings.enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
              <MessageCircle className={`h-5 w-5 ${settings.enabled ? 'text-green-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <p className="font-medium">{language === 'ar' ? 'تفعيل إشعارات WhatsApp' : 'Activer les notifications WhatsApp'}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إرسال إشعارات تلقائية عند تغيير حالة الصيانة' : 'Envoyer des notifications automatiques lors du changement de statut'}</p>
            </div>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enabled: checked }))} data-testid="toggle-whatsapp" />
        </div>

        {settings.enabled && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Phone Number ID</Label>
                <Input placeholder="123456789012345" value={settings.phone_number_id} onChange={(e) => setSettings(prev => ({ ...prev, phone_number_id: e.target.value }))} />
                <p className="text-xs text-muted-foreground">{language === 'ar' ? 'تجده في Meta Business Suite' : 'Trouvable dans Meta Business Suite'}</p>
              </div>
              <div className="space-y-2">
                <Label>Business Account ID</Label>
                <Input placeholder="123456789012345" value={settings.business_account_id} onChange={(e) => setSettings(prev => ({ ...prev, business_account_id: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Access Token</Label>
              <Input type="password" placeholder="EAAxxxxxxx..." value={settings.access_token} onChange={(e) => setSettings(prev => ({ ...prev, access_token: e.target.value }))} />
              <p className="text-xs text-muted-foreground">{language === 'ar' ? 'احصل على Access Token من Meta for Developers > WhatsApp > API Setup' : 'Obtenez le Access Token depuis Meta for Developers > WhatsApp > API Setup'}</p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">{language === 'ar' ? 'خطوات الإعداد:' : 'Étapes de configuration:'}</h4>
              <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                <li>{language === 'ar' ? 'انتقل إلى developers.facebook.com' : 'Allez sur developers.facebook.com'}</li>
                <li>{language === 'ar' ? 'أنشئ تطبيق Business جديد' : 'Créez une nouvelle application Business'}</li>
                <li>{language === 'ar' ? 'أضف WhatsApp product' : 'Ajoutez le produit WhatsApp'}</li>
                <li>{language === 'ar' ? 'انسخ Phone Number ID و Access Token' : 'Copiez le Phone Number ID et Access Token'}</li>
              </ol>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={saveSettings} disabled={saving} data-testid="save-whatsapp-btn">
            {saving ? <RefreshCw className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
            {language === 'ar' ? 'حفظ الإعدادات' : 'Enregistrer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
