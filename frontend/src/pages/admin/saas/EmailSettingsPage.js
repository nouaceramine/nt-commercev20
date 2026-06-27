/**
 * Email Settings Page — Super-Admin
 * Configure RESEND_API_KEY / SENDGRID_API_KEY / SENDER_EMAIL at runtime, no redeploy.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../lib/apiClient';
import { Layout } from '../../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Mail, Save, Send, ArrowRight, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export default function EmailSettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState({ resend_api_key: '', sendgrid_api_key: '', sender_email: '' });
  const [testTo, setTestTo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/saas/email-settings');
      setSettings(res.data);
      setForm({ resend_api_key: '', sendgrid_api_key: '', sender_email: res.data.sender_email || '' });
    } catch (err) {
      toast.error('فشل تحميل إعدادات البريد');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      // Only send non-empty fields to avoid wiping existing keys.
      const payload = {};
      if (form.resend_api_key.trim()) payload.resend_api_key = form.resend_api_key.trim();
      if (form.sendgrid_api_key.trim()) payload.sendgrid_api_key = form.sendgrid_api_key.trim();
      if (form.sender_email.trim()) payload.sender_email = form.sender_email.trim();
      if (Object.keys(payload).length === 0) {
        toast.info('لم يتم تعديل أي حقل');
        return;
      }
      const res = await apiClient.put('/saas/email-settings', payload);
      toast.success(`تم الحفظ — المزود الحالي: ${res.data.provider}`);
      setForm({ resend_api_key: '', sendgrid_api_key: '', sender_email: res.data.provider === 'mock' ? '' : form.sender_email });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testTo.trim() || !testTo.includes('@')) {
      toast.error('أدخل بريداً صالحاً');
      return;
    }
    setTesting(true);
    try {
      const res = await apiClient.post('/saas/email-settings/test', { to: testTo.trim() });
      if (res.data.ok) {
        toast.success(`✅ ${res.data.message} (المزود: ${res.data.provider})`);
      } else {
        toast.error(`❌ ${res.data.message}`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل الإرسال');
    } finally {
      setTesting(false);
    }
  };

  const providerBadge = {
    resend:   { color: 'bg-emerald-100 text-emerald-800', label: '✅ Resend (مُفعَّل)' },
    sendgrid: { color: 'bg-blue-100 text-blue-800',       label: '✅ SendGrid (مُفعَّل)' },
    mock:     { color: 'bg-gray-100 text-gray-700',       label: '⚠️ وضع المحاكاة (لا يُرسل فعلياً)' },
  }[settings.provider] || { color: 'bg-gray-100', label: '—' };

  return (
    <Layout>
      <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto" dir="rtl" data-testid="email-settings-page">
        {/* Header */}
        <div>
          <button onClick={() => navigate('/saas-admin')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowRight className="w-3 h-3" /> العودة للوحة المراقبة
          </button>
          <h1 className="text-2xl md:text-3xl font-bold mt-1 flex items-center gap-2">
            <Mail className="w-7 h-7 text-blue-600" />
            إعدادات البريد الإلكتروني
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            مفاتيح Resend / SendGrid لإرسال تذكيرات الديون والإشعارات للمستأجرين.
          </p>
        </div>

        {/* Current status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">الحالة الحالية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">المزود الفعلي:</span>
              <Badge className={providerBadge.color}>{providerBadge.label}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">عنوان المُرسِل (Sender):</span>
              <span className="text-sm font-mono">{settings.sender_email || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Resend API Key:</span>
              <span className="text-sm font-mono">{settings.has_resend_key ? settings.resend_api_key_masked : <span className="text-muted-foreground">غير مُعَدّ</span>}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">SendGrid API Key:</span>
              <span className="text-sm font-mono">{settings.has_sendgrid_key ? settings.sendgrid_api_key_masked : <span className="text-muted-foreground">غير مُعَدّ</span>}</span>
            </div>
          </CardContent>
        </Card>

        {/* Edit form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">تحديث المفاتيح</CardTitle>
            <CardDescription>
              اترك الحقل فارغاً للإبقاء على القيمة الحالية. المفاتيح تُخزَّن مُشفَّرة في قاعدة البيانات وتُخفى في الاستجابات.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="resend">
                Resend API Key
                <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="mr-2 text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> احصل على المفتاح
                </a>
              </Label>
              <Input
                id="resend"
                type="password"
                placeholder={settings.has_resend_key ? '••••••••  (اترك فارغاً للإبقاء)' : 're_xxxxxxxxxxxxxxxx'}
                value={form.resend_api_key}
                onChange={(e) => setForm({ ...form, resend_api_key: e.target.value })}
                data-testid="resend-api-key-input"
              />
            </div>
            <div>
              <Label htmlFor="sendgrid">
                SendGrid API Key
                <a href="https://app.sendgrid.com/settings/api_keys" target="_blank" rel="noopener noreferrer" className="mr-2 text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> احصل على المفتاح
                </a>
              </Label>
              <Input
                id="sendgrid"
                type="password"
                placeholder={settings.has_sendgrid_key ? '••••••••  (اترك فارغاً للإبقاء)' : 'SG.xxxxxxxxxxxxxx'}
                value={form.sendgrid_api_key}
                onChange={(e) => setForm({ ...form, sendgrid_api_key: e.target.value })}
                data-testid="sendgrid-api-key-input"
              />
            </div>
            <div>
              <Label htmlFor="sender">عنوان المُرسِل (Sender Email)</Label>
              <Input
                id="sender"
                type="email"
                placeholder="noreply@yourdomain.com"
                value={form.sender_email}
                onChange={(e) => setForm({ ...form, sender_email: e.target.value })}
                data-testid="sender-email-input"
              />
              <p className="text-xs text-muted-foreground mt-1">
                ⚠️ يجب أن يكون النطاق مُتحقَّقاً منه في Resend / SendGrid وإلا تُرفض الرسائل.
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={save} disabled={saving} data-testid="email-save-btn">
                <Save className="w-4 h-4 ml-1" />
                {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Send test */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Send className="w-4 h-4" /> اختبار الإرسال</CardTitle>
            <CardDescription>أرسل رسالة تجريبية الآن للتأكد أن الإعدادات تعمل قبل تفعيلها للمستأجرين.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="test-to">بريد الاختبار</Label>
                <Input
                  id="test-to"
                  type="email"
                  placeholder="you@example.com"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  data-testid="test-email-to-input"
                />
              </div>
              <Button onClick={sendTest} disabled={testing} data-testid="send-test-email-btn">
                <Send className="w-4 h-4 ml-1" />
                {testing ? 'جارٍ الإرسال...' : 'إرسال'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Help */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 space-y-1">
              <div className="font-semibold">ملاحظات مهمة</div>
              <ul className="space-y-1 list-disc ps-4">
                <li>إذا تركت الحقول فارغة، النظام يبقى في وضع المحاكاة (لا إرسال فعلي).</li>
                <li>Resend يُفضَّل لأنه أحدث وأسهل في التحقق من النطاقات.</li>
                <li>إذا أعددت كليهما، Resend يحظى بالأولوية.</li>
                <li>القيم تُحفظ في قاعدة البيانات وتُحدَّث فوراً (خلال 60 ثانية كحد أقصى).</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
