/**
 * Email Settings Page — Super-Admin
 *
 * Configure email provider (Resend / SendGrid / **Brevo**) + sender at runtime.
 * Brevo is recommended for Algeria / MENA (Resend blocks sign-ups from those regions).
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Mail, Save, Send, ArrowRight, AlertTriangle, ExternalLink, Globe } from 'lucide-react';
import { toast } from 'sonner';

const PROVIDER_LABELS = {
  auto:     { label: 'تلقائي (الأفضلية لـ Brevo)', color: 'bg-slate-100 text-slate-800' },
  resend:   { label: 'Resend',   color: 'bg-emerald-100 text-emerald-800' },
  sendgrid: { label: 'SendGrid', color: 'bg-blue-100 text-blue-800' },
  brevo:    { label: 'Brevo',    color: 'bg-cyan-100 text-cyan-800' },
  mock:     { label: 'محاكاة (لا يُرسل فعلياً)', color: 'bg-gray-100 text-gray-700' },
};

export default function EmailSettingsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState({
    resend_api_key: '',
    sendgrid_api_key: '',
    brevo_api_key: '',
    sender_email: '',
    provider_preference: 'auto',
  });
  const [testTo, setTestTo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/saas/email-settings');
      setSettings(res.data);
      setForm({
        resend_api_key: '',
        sendgrid_api_key: '',
        brevo_api_key: '',
        sender_email: res.data.sender_email || '',
        provider_preference: res.data.provider_preference || 'auto',
      });
    } catch {
      toast.error('فشل تحميل إعدادات البريد');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      if (form.resend_api_key.trim())   payload.resend_api_key   = form.resend_api_key.trim();
      if (form.sendgrid_api_key.trim()) payload.sendgrid_api_key = form.sendgrid_api_key.trim();
      if (form.brevo_api_key.trim())    payload.brevo_api_key    = form.brevo_api_key.trim();
      if (form.sender_email.trim())     payload.sender_email     = form.sender_email.trim();
      // Always send preference so user can switch providers without re-entering keys.
      payload.provider_preference = form.provider_preference;

      const res = await apiClient.put('/saas/email-settings', payload);
      const activeLabel = PROVIDER_LABELS[res.data.provider]?.label || res.data.provider;
      toast.success(`تم الحفظ — المزوِّد الفعلي: ${activeLabel}`);
      setForm(f => ({ ...f, resend_api_key: '', sendgrid_api_key: '', brevo_api_key: '' }));
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
        toast.success(`✅ ${res.data.message} (المزود: ${PROVIDER_LABELS[res.data.provider]?.label || res.data.provider})`);
      } else {
        toast.error(`❌ ${res.data.message}`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل الإرسال');
    } finally {
      setTesting(false);
    }
  };

  const providerBadge = PROVIDER_LABELS[settings.provider] || PROVIDER_LABELS.mock;

  return (
    <Layout>
      <div className="space-y-6 p-4 md:p-6 max-w-3xl mx-auto" dir="rtl" data-testid="email-settings-page">
        <div>
          <button onClick={() => navigate('/saas-admin')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowRight className="w-3 h-3" /> العودة للوحة المراقبة
          </button>
          <h1 className="text-2xl md:text-3xl font-bold mt-1 flex items-center gap-2">
            <Mail className="w-7 h-7 text-blue-600" />
            إعدادات البريد الإلكتروني
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            اختر مزوِّد البريد المناسب لمنطقتك. <strong>Brevo</strong> موصى به للجزائر والشرق الأوسط.
          </p>
        </div>

        {/* ── Status card ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">الحالة الحالية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">المزوِّد الفعلي:</span>
              <Badge className={providerBadge.color} data-testid="active-provider-badge">
                {providerBadge.label}{settings.provider === 'mock' ? ' ⚠️' : ' ✅'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">المُفضَّل (Preference):</span>
              <span className="text-sm font-mono">{settings.provider_preference || 'auto'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">عنوان المُرسِل (Sender):</span>
              <span className="text-sm font-mono">{settings.sender_email || '—'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
              <div className="text-xs">
                <div className="text-muted-foreground">Resend</div>
                <div className={settings.has_resend_key ? 'font-semibold text-emerald-700' : 'text-rose-600'}>
                  {settings.has_resend_key ? settings.resend_api_key_masked : 'غير مُعَدّ'}
                </div>
              </div>
              <div className="text-xs">
                <div className="text-muted-foreground">SendGrid</div>
                <div className={settings.has_sendgrid_key ? 'font-semibold text-emerald-700' : 'text-rose-600'}>
                  {settings.has_sendgrid_key ? settings.sendgrid_api_key_masked : 'غير مُعَدّ'}
                </div>
              </div>
              <div className="text-xs">
                <div className="text-muted-foreground">Brevo 🇩🇿</div>
                <div className={settings.has_brevo_key ? 'font-semibold text-emerald-700' : 'text-rose-600'}>
                  {settings.has_brevo_key ? settings.brevo_api_key_masked : 'غير مُعَدّ'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Provider picker + keys ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">المزوِّد المُفضَّل</CardTitle>
            <CardDescription>اختر مزوِّداً صريحاً أو اترك &quot;تلقائي&quot; واترك النظام يختار الأفضل المتاح.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={form.provider_preference} onValueChange={(v) => setForm({ ...form, provider_preference: v })}>
              <SelectTrigger data-testid="provider-preference-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">تلقائي (Brevo أولاً للجزائر)</SelectItem>
                <SelectItem value="brevo">Brevo 🇩🇿 (موصى به للجزائر)</SelectItem>
                <SelectItem value="resend">Resend</SelectItem>
                <SelectItem value="sendgrid">SendGrid</SelectItem>
                <SelectItem value="mock">محاكاة (للاختبار فقط)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">تحديث المفاتيح</CardTitle>
            <CardDescription>اترك الحقل فارغاً للإبقاء على القيمة الحالية. المفاتيح مُخفاة في الاستجابات.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Brevo first — recommended for Algeria */}
            <div className="p-3 rounded-lg border-2 border-cyan-200 bg-cyan-50/50">
              <Label htmlFor="brevo">
                <Globe className="w-4 h-4 inline-block ml-1 text-cyan-600" />
                Brevo API Key
                <Badge className="bg-cyan-100 text-cyan-800 text-[10px] mr-2">موصى به 🇩🇿</Badge>
                <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener noreferrer" className="mr-2 text-xs text-cyan-700 hover:underline inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> احصل على المفتاح
                </a>
              </Label>
              <Input
                id="brevo"
                type="password"
                placeholder={settings.has_brevo_key ? '••••••••  (اترك فارغاً للإبقاء)' : 'xkeysib-xxxxxxxxxxxxxxxx'}
                value={form.brevo_api_key}
                onChange={(e) => setForm({ ...form, brevo_api_key: e.target.value })}
                data-testid="brevo-api-key-input"
              />
              <p className="text-[11px] text-cyan-800 mt-1">
                ✓ Brevo يقبل التسجيل من الجزائر والشرق الأوسط ✓ 300 إيميل/يوم مجاناً ✓ سهل التحقق من النطاق
              </p>
            </div>

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
              <p className="text-[11px] text-amber-700 mt-1">⚠️ Resend يحجب التسجيل من بعض الدول (منها الجزائر).</p>
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
                ⚠️ يجب أن يكون النطاق مُتحقَّقاً منه عند المزوِّد المُختار، وإلا تُرفض الرسائل.
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

        {/* ── Test send ─────────────────────────────────────────────────── */}
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

        {/* ── Help card ─────────────────────────────────────────────────── */}
        <Card className="border-cyan-200 bg-cyan-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-cyan-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-cyan-900 space-y-1">
              <div className="font-semibold">دليل سريع للجزائر</div>
              <ol className="space-y-1 list-decimal ps-4">
                <li>سجِّل حساباً مجانياً على <a href="https://brevo.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">brevo.com</a> — يقبل التسجيل من الجزائر.</li>
                <li>من Settings → SMTP &amp; API → Generate a new API key، انسخه (يبدأ بـ <code className="bg-white px-1 rounded">xkeysib-</code>).</li>
                <li>الصق المفتاح في حقل Brevo أعلاه، اختر <strong>Brevo</strong> من قائمة المزوِّد المُفضَّل، اضغط حفظ.</li>
                <li>للإرسال من نطاقك الخاص: Settings → Senders → أضف نطاقك وتحقَّق منه عبر DNS records.</li>
                <li>اضغط <strong>إرسال اختبار</strong> أعلاه — إذا وصلت الرسالة فالنظام جاهز ✅</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
