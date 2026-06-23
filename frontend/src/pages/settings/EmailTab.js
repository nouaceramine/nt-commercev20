import { useState } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { toast } from 'sonner';
import { Mail, Send, RefreshCw, Save } from 'lucide-react';

export default function EmailTab({ initialSettings }) {
  const { language } = useLanguage();
  const [settings, setSettings] = useState(initialSettings || {
    enabled: false, resend_api_key: '', sender_email: 'onboarding@resend.dev', sender_name: 'NT POS System'
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const saveSettings = async () => {
    setSaving(true);
    try {
      
      await apiClient.put(`/email/settings`, settings);
      toast.success(language === 'ar' ? 'تم حفظ إعدادات البريد الإلكتروني' : 'Paramètres email enregistrés');
    } catch (error) { toast.error(language === 'ar' ? 'خطأ' : 'Error'); }
    finally { setSaving(false); }
  };

  const testEmail = async () => {
    setTesting(true);
    try {
      
      const response = await apiClient.post(`/email/test`, {});
      toast.success(response.data.message || (language === 'ar' ? 'تم إرسال البريد الاختباري' : 'Email test envoyé'));
    } catch (error) { toast.error(error.response?.data?.detail || 'Error'); }
    finally { setTesting(false); }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-blue-600" />{language === 'ar' ? 'إعدادات البريد الإلكتروني' : 'Paramètres Email'}</CardTitle>
          <CardDescription>{language === 'ar' ? 'إعداد البريد الإلكتروني لإرسال التقارير والإشعارات' : "Configurer l'email pour l'envoi de rapports et notifications"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${settings.enabled ? 'bg-blue-100' : 'bg-gray-100'}`}>
                <Mail className={`h-5 w-5 ${settings.enabled ? 'text-blue-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="font-medium">{language === 'ar' ? 'تفعيل البريد الإلكتروني' : "Activer l'email"}</p>
                <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إرسال تقارير الحصص والإشعارات بالبريد' : 'Envoyer les rapports et notifications par email'}</p>
              </div>
            </div>
            <Switch checked={settings.enabled} onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enabled: checked }))} data-testid="toggle-email" />
          </div>

          {settings.enabled && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'مفتاح Resend API' : 'Clé API Resend'}</Label>
                <Input type="password" placeholder="re_xxxxxxxx..." value={settings.resend_api_key} onChange={(e) => setSettings(prev => ({ ...prev, resend_api_key: e.target.value }))} dir="ltr" />
                <p className="text-xs text-muted-foreground">{language === 'ar' ? 'احصل على مفتاح API من resend.com/api-keys' : 'Obtenez votre clé API sur resend.com/api-keys'}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'بريد المرسل' : 'Email expéditeur'}</Label>
                  <Input type="email" placeholder="noreply@yourdomain.com" value={settings.sender_email} onChange={(e) => setSettings(prev => ({ ...prev, sender_email: e.target.value }))} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'اسم المرسل' : 'Nom expéditeur'}</Label>
                  <Input placeholder="NT POS System" value={settings.sender_name} onChange={(e) => setSettings(prev => ({ ...prev, sender_name: e.target.value }))} />
                </div>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">{language === 'ar' ? 'خطوات الإعداد:' : 'Étapes de configuration:'}</h4>
                <ol className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                  <li>{language === 'ar' ? 'أنشئ حساب على resend.com' : 'Créez un compte sur resend.com'}</li>
                  <li>{language === 'ar' ? 'انتقل إلى API Keys وأنشئ مفتاح جديد' : 'Allez sur API Keys et créez une nouvelle clé'}</li>
                  <li>{language === 'ar' ? 'انسخ المفتاح والصقه هنا' : 'Copiez la clé et collez-la ici'}</li>
                  <li>{language === 'ar' ? 'أضف نطاقك (Domain) للحصول على بريد مخصص' : 'Ajoutez votre domaine pour un email personnalisé'}</li>
                </ol>
              </div>
            </div>
          )}

          <div className="flex gap-3 justify-end">
            {settings.enabled && settings.resend_api_key && (
              <Button variant="outline" onClick={testEmail} disabled={testing} data-testid="test-email-btn">
                {testing ? <RefreshCw className="h-4 w-4 me-2 animate-spin" /> : <Send className="h-4 w-4 me-2" />}
                {language === 'ar' ? 'إرسال اختباري' : 'Test email'}
              </Button>
            )}
            <Button onClick={saveSettings} disabled={saving} data-testid="save-email-btn">
              {saving ? <RefreshCw className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
              {language === 'ar' ? 'حفظ الإعدادات' : 'Enregistrer'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email Usage Guide */}
      <Card>
        <CardHeader><CardTitle className="text-lg">{language === 'ar' ? 'استخدامات البريد الإلكتروني' : "Utilisations de l'email"}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium flex items-center gap-2 mb-2">{language === 'ar' ? 'تقارير الحصص' : 'Rapports de session'}</h4>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إرسال تقرير مفصل عند إغلاق كل حصة يومية يتضمن المبيعات والديون والفروقات' : 'Envoyer un rapport détaillé à la clôture de chaque session avec ventes, dettes et écarts'}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium flex items-center gap-2 mb-2">{language === 'ar' ? 'تنبيهات المصروفات' : 'Alertes dépenses'}</h4>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'تنبيهات تلقائية قبل مواعيد دفع المصروفات المتكررة مثل الإيجار' : 'Alertes automatiques avant les échéances des dépenses récurrentes'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
