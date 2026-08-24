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
    } catch (error) { toast.error(errText(error) ||  'Error'); }
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
                <Mail className={`h-5 w-5 ${settings.enabled ? 'text-blue-600' : 'text-muted-foreground'}`} />
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
              {/* p288: مفتاح Resend يُدار من مركز التكاملات فقط */}
              <div className="rounded-md border border-dashed p-3 text-sm" data-testid="email-hub-note">
                {settings.resend_api_key
                  ? (language === 'ar' ? `✅ المفتاح محفوظ (${settings.resend_api_key})` : `✅ Clé enregistrée (${settings.resend_api_key})`)
                  : (language === 'ar' ? 'لم يُدخل مفتاح Resend بعد.' : 'Aucune clé Resend saisie.')}
                {' '}
                {language === 'ar' ? 'المفتاح يُدار من' : 'La clé est gérée depuis'}{' '}
                <a href="/integrations" className="text-emerald-700 underline font-medium" data-testid="email-hub-link">
                  {language === 'ar' ? 'مركز التكاملات' : 'le Centre d’intégrations'}
                </a>
                {language === 'ar' ? ' — مع شرح خطوة بخطوة وفحص تلقائي للمفتاح.' : ' — avec guide et test automatique.'}
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
