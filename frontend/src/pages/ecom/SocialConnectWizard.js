/**
 * Social Connect Wizard (p274) — guided 3-step connection for Meta channels
 * (WhatsApp Cloud API / Facebook Page / Messenger / Instagram Business).
 *
 * Steps: ١) تعليمات + رابط الويب هوك  ٢) بيانات الاعتماد  ٣) اختبار الاتصال الحقيقي.
 * Same design system as the rest of ecom-hub (Dialog/Card/Button/Badge).
 */
import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Copy, CheckCircle2, XCircle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const STEP_LABELS = ['التعليمات', 'البيانات', 'الاختبار'];

export default function SocialConnectWizard({ channel, channelMeta, open, onClose, onDone }) {
  const [step, setStep] = useState(1);
  const [info, setInfo] = useState(null);
  const [name, setName] = useState('');
  const [creds, setCreds] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);   // {ok, message, error}

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setResult(null);
    setCreds({});
    setName(channelMeta?.labelAr || channel);
    apiClient.get('/ecom/social-setup-info')
      .then(r => setInfo((r.data?.channels || {})[channel] || null))
      .catch(() => setInfo(null));
  }, [open, channel, channelMeta]);

  const fields = info?.fields || [];

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('تم النسخ');
  };

  const saveAndTest = async () => {
    const missing = fields.filter(([k]) => !(creds[k] || '').trim());
    if (!name.trim()) { toast.error('أدخل اسماً للتكامل'); return; }
    if (missing.length > 0) { toast.error('أكمل كل الحقول المطلوبة'); return; }
    setBusy(true);
    setResult(null);
    try {
      const createRes = await apiClient.post('/ecom/integrations', {
        channel, name: name.trim(), credentials: creds, is_active: true,
      });
      const id = createRes.data?.id;
      const testRes = await apiClient.post(`/ecom/integrations/${id}/test`);
      setResult(testRes.data || { ok: false, message: 'لا توجد استجابة' });
      setStep(3);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل الحفظ أو الاختبار');
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    onDone?.();
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent dir="rtl" className="max-w-lg" data-testid="social-wizard">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {channelMeta?.icon} معالج ربط {channelMeta?.labelAr || channel}
          </DialogTitle>
          <DialogDescription>
            ثلاث خطوات: اقرأ التعليمات، أدخل البيانات، ثم اختبر الاتصال الحقيقي مع Meta.
          </DialogDescription>
        </DialogHeader>

        {/* steps indicator */}
        <div className="flex items-center gap-2 py-1" data-testid="wizard-steps">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <div key={n} className="flex items-center gap-1">
                <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold ${
                  active ? 'bg-emerald-600 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`} data-testid={`wizard-step-${n}`}>{n}</span>
                <span className={`text-xs ${active ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
                {n < 3 && <span className="text-slate-300 mx-1">←</span>}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: instructions ── */}
        {step === 1 && (
          <div className="space-y-3 py-2" data-testid="wizard-panel-1">
            <ol className="list-decimal pr-5 space-y-2 text-sm">
              {(info?.steps_ar || []).map((s, i) => <li key={i}>{s}</li>)}
              {!info && <li className="text-muted-foreground">جارٍ تحميل التعليمات…</li>}
            </ol>
            {info?.webhook_url && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                <div className="text-xs font-semibold text-blue-900">🪝 رابط الـ Webhook للمنصة (يُلصق في تطبيق Meta)</div>
                <div className="flex items-center gap-1">
                  <code className="flex-1 text-[10px] bg-white border rounded px-2 py-1 break-all" dir="ltr" data-testid="wizard-webhook-url">{info.webhook_url}</code>
                  <Button size="sm" variant="outline" onClick={() => copy(info.webhook_url)} data-testid="wizard-copy-webhook">
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} data-testid="wizard-next-1">
                التالي: إدخال البيانات <ArrowLeft className="w-4 h-4 mr-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: credentials ── */}
        {step === 2 && (
          <div className="space-y-3 py-2" data-testid="wizard-panel-2">
            <div>
              <Label>الاسم المعروض</Label>
              <Input value={name} onChange={e => setName(e.target.value)} data-testid="wizard-name-input" />
            </div>
            {fields.map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  type="password"
                  value={creds[key] || ''}
                  onChange={e => setCreds({ ...creds, [key]: e.target.value })}
                  data-testid={`wizard-cred-${key}`}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground">🔒 تُخزَّن المفاتيح مشفّرة (AES-256-GCM) ولا تظهر بعد الحفظ.</p>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="wizard-back-2">
                <ArrowRight className="w-4 h-4 ml-1" /> رجوع
              </Button>
              <Button onClick={saveAndTest} disabled={busy} data-testid="wizard-save-test">
                {busy ? <><Loader2 className="w-4 h-4 animate-spin ml-1" /> جارٍ الحفظ والاختبار…</> : 'حفظ واختبار الاتصال'}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: test result ── */}
        {step === 3 && (
          <div className="space-y-3 py-2" data-testid="wizard-panel-3">
            {result ? (
              <div className={`border rounded-lg p-4 flex items-start gap-3 ${
                result.ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
              }`} data-testid="wizard-test-result">
                {result.ok
                  ? <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                  : <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />}
                <div className="space-y-1">
                  <div className={`font-semibold ${result.ok ? 'text-emerald-900' : 'text-red-900'}`}>{result.message}</div>
                  {!result.ok && result.error && <div className="text-xs text-red-700 font-mono" dir="ltr">{result.error}</div>}
                  {result.ok
                    ? <div className="text-xs text-emerald-800">القناة مرتبطة وتظهر الآن في قائمة «قنواتك المرتبطة». رسائل العملاء ستصل إلى الوارد الاجتماعي.</div>
                    : <div className="text-xs text-red-800">القناة حُفظت لكن الاختبار فشل — راجع البيانات وعدّلها. يمكنك إعادة الاختبار لاحقاً من زر «اختبار» بجانب القناة.</div>}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">لا توجد نتيجة اختبار.</div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="wizard-back-3">
                <ArrowRight className="w-4 h-4 ml-1" /> تعديل البيانات
              </Button>
              <Button onClick={finish} data-testid="wizard-finish">
                إنهاء <Badge className="bg-emerald-100 text-emerald-800 mr-1">✓</Badge>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
