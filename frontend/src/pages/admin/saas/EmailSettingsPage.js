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
import { Mail, Save, Send, ArrowRight, AlertTriangle, ExternalLink, Globe, MessageSquare } from 'lucide-react';
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
  const [alertInfo, setAlertInfo] = useState({});   // p153: telegram alerts
  const [alertForm, setAlertForm] = useState({ telegram_bot_token: '', telegram_chat_id: '' });
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertTesting, setAlertTesting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/saas/email-settings');
      apiClient.get('/saas/alert-settings')
        .then(r => {
          setAlertInfo(r.data || {});
          setAlertForm(f => ({ ...f, telegram_chat_id: (r.data || {}).chat_id || '' }));
        })
        .catch(() => {});
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

  // p153: telegram alert handlers
  const saveAlert = async () => {
    setAlertSaving(true);
    try {
      const payload = { telegram_chat_id: alertForm.telegram_chat_id.trim() };
      if (alertForm.telegram_bot_token.trim()) payload.telegram_bot_token = alertForm.telegram_bot_token.trim();
      await apiClient.put('/saas/alert-settings', payload);
      const r = await apiClient.get('/saas/alert-settings');
      setAlertInfo(r.data || {});
      setAlertForm(f => ({ ...f, telegram_bot_token: '' }));
      toast.success('حُفظت إعدادات التنبيهات');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل الحفظ');
    } finally {
      setAlertSaving(false);
    }
  };

  const testAlert = async () => {
    setAlertTesting(true);
    try {
      const r = await apiClient.post('/saas/alert-settings/test');
      if (r.data?.ok) toast.success(r.data.message);
      else toast.error(r.data?.message || 'فشل الإرسال');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل الإرسال');
    } finally {
      setAlertTesting(false);
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
            مزوِّد واحد يكفي — أضِف مفتاح أي مزوِّد وسيستعمله النظام تلقائياً على كامل المنصة.  <strong>Brevo</strong> موصى به للجزائر والشرق الأوسط.
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
            {(settings.has_resend_key || settings.has_sendgrid_key || settings.has_brevo_key) && (
              <div className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg p-2 mt-2" data-testid="one-provider-enough-note">
                ✅ مزوِّد واحد يكفي — سيُستعمل المفتاح المتوفر على كافة النظام، والحقول الفارغة اختيارية.
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
              <div className="text-xs">
                <div className="text-muted-foreground">Resend</div>
                <div className={settings.has_resend_key ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}>
                  {settings.has_resend_key ? settings.resend_api_key_masked : 'غير مُعَدّ (اختياري)'}
                </div>
              </div>
              <div className="text-xs">
                <div className="text-muted-foreground">SendGrid</div>
                <div className={settings.has_sendgrid_key ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}>
                  {settings.has_sendgrid_key ? settings.sendgrid_api_key_masked : 'غير مُعَدّ (اختياري)'}
                </div>
              </div>
              <div className="text-xs">
                <div className="text-muted-foreground">Brevo 🇩🇿</div>
                <div className={settings.has_brevo_key ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}>
                  {settings.has_brevo_key ? settings.brevo_api_key_masked : 'غير مُعَدّ (اختياري)'}
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
                <SelectItem value="auto">تلقائي (أول مفتاح متوفر: Brevo ← Resend ← SendGrid)</SelectItem>
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

        {/* ── p153: Telegram platform alerts ────────────────────────────── */}
        <Card data-testid="telegram-alerts-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-sky-600" /> تنبيهات Telegram للمنصة
            </CardTitle>
            <CardDescription>
              تنبيهات النسخ الاحتياطي ومراقبة الصحة والنشر تصل إلى Telegram فوراً. أنشئ بوتاً عبر
              <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline mx-1">@BotFather</a>
              واحصل على Chat ID عبر
              <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="underline mx-1">@userinfobot</a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>الحالة:</span>
              <Badge className={alertInfo.has_token ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'} data-testid="telegram-status-badge">
                {alertInfo.has_token ? `مُعَدّ ✅ (${alertInfo.token_masked})` : 'غير مُعَدّ ⚠️'}
              </Badge>
            </div>
            <div>
              <Label htmlFor="tg-token">Bot Token</Label>
              <Input
                id="tg-token"
                dir="ltr"
                placeholder="123456:ABC-DEF..."
                value={alertForm.telegram_bot_token}
                onChange={(e) => setAlertForm({ ...alertForm, telegram_bot_token: e.target.value })}
                data-testid="telegram-token-input"
              />
              <p className="text-xs text-muted-foreground mt-1">اتركه فارغاً للإبقاء على الحالي.</p>
            </div>
            <div>
              <Label htmlFor="tg-chat">Chat ID</Label>
              <Input
                id="tg-chat"
                dir="ltr"
                placeholder="123456789"
                value={alertForm.telegram_chat_id}
                onChange={(e) => setAlertForm({ ...alertForm, telegram_chat_id: e.target.value })}
                data-testid="telegram-chatid-input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={testAlert} disabled={alertTesting || !alertInfo.has_token} data-testid="telegram-test-btn">
                <Send className="w-4 h-4 ml-1" />
                {alertTesting ? 'جارٍ الإرسال...' : 'اختبار'}
              </Button>
              <Button onClick={saveAlert} disabled={alertSaving} data-testid="telegram-save-btn">
                <Save className="w-4 h-4 ml-1" />
                {alertSaving ? 'جارٍ الحفظ...' : 'حفظ'}
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
