import { errText } from '../../lib/errorText';
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
    } catch (error) { toast.error(errText(error) ||  'Error'); }
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
              <MessageCircle className={`h-5 w-5 ${settings.enabled ? 'text-green-600' : 'text-muted-foreground'}`} />
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
            {/* p288: مفاتيح واتساب تُدار من مركز التكاملات فقط */}
            <div className="rounded-md border border-dashed p-3 text-sm" data-testid="wa-hub-note">
              {language === 'ar'
                ? '🔑 مفاتيح WhatsApp (Phone Number ID و Access Token) تُدار من'
                : '🔑 Les clés WhatsApp sont gérées depuis'}{' '}
              <a href="/integrations" className="text-emerald-700 underline font-medium" data-testid="wa-hub-link">
                {language === 'ar' ? 'مركز التكاملات' : 'le Centre d’intégrations'}
              </a>
              {language === 'ar'
                ? ' — أدخلها هناك واضغط «حفظ واختبار» فتُفعَّل الخدمة تلقائياً، مع شرح خطوة بخطوة لجلب المفاتيح من Meta.'
                : ' — avec guide pas-à-pas et activation automatique après test réussi.'}
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
