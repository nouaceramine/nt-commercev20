/**
 * EcomOrderProcessDialog (p289) — معالجة الطلب: يدوي أو تلقائي.
 *
 * يدوي: كل معلومات الزبون بأزرار نسخ + اختيار شركة الشحن + تعليم «مسجَّل في الشركة / غير مسجَّل».
 * تلقائي: اختيار شركة من الشركات المربوطة فقط ← إرسال الطلب ← إنشاء البوليصة تلقائياً
 *         ← عرض رقم التتبع وزر طباعة البوليصة.
 */
import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Copy, Truck, Hand, Zap, Printer, Loader2, CheckCircle2 } from 'lucide-react';

function CopyRow({ label, value, testid }) {
  if (!value && value !== 0) return null;
  const copy = () => {
    navigator.clipboard.writeText(String(value));
    toast.success(`نُسخ: ${label}`);
  };
  return (
    <div className="flex items-center justify-between gap-2 border rounded-md px-2 py-1.5 bg-muted/20" data-testid={testid}>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="text-sm font-medium truncate" dir="auto">{String(value)}</div>
      </div>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 flex-shrink-0" onClick={copy} data-testid={`${testid}-copy`}>
        <Copy className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export function EcomOrderProcessDialog({ order, open, onOpenChange, couriers, onDone }) {
  const [mode, setMode] = useState(null);           // null | 'manual' | 'auto'
  const [courier, setCourier] = useState('');
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(null);          // نتيجة الإرسال التلقائي
  const [autoMsg, setAutoMsg] = useState('');

  useEffect(() => {
    if (open) {
      setMode(null);
      setCourier(order?.fulfillment?.courier || '');
      setLabel(null);
      setAutoMsg('');
      setBusy(false);
    }
  }, [open, order]);

  if (!order) return null;
  const c = order.customer || {};
  const itemsText = (order.items || []).map(i => `${i.name || i.product_name || ''}×${i.quantity}`).join('، ');

  const doDispatch = async () => {
    if (!courier) { toast.error('اختر شركة الشحن'); return; }
    setBusy(true);
    try {
      const res = await apiClient.post(`/ecom/orders/${order.id}/dispatch`, { courier });
      setLabel(res.data?.label || null);
      setAutoMsg(res.data?.message || '');
      toast.success('تم الإرسال');
      onDone?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل الإرسال');
    } finally { setBusy(false); }
  };

  const doManual = async (registered) => {
    if (!courier) { toast.error('اختر شركة الشحن'); return; }
    setBusy(true);
    try {
      const res = await apiClient.post(`/ecom/orders/${order.id}/manual-registration`, { courier, registered });
      toast.success(res.data?.message || 'تم الحفظ');
      onDone?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل الحفظ');
    } finally { setBusy(false); }
  };

  const f = order.fulfillment;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl" data-testid="process-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" /> معالجة الطلب {order.order_code}
          </DialogTitle>
        </DialogHeader>

        {/* الوضع الحالي */}
        {f && (
          <div className="text-xs border rounded-md p-2 bg-muted/30" data-testid="process-current">
            المعالجة الحالية: {f.mode === 'auto' ? '⚡ تلقائية' : '✋ يدوية'} عبر {f.courier}
            {f.mode === 'manual' && (f.registered_with_courier ? ' — ✅ مسجَّل في الشركة' : ' — ⏳ غير مسجَّل بعد')}
          </div>
        )}

        {/* الخطوة 1: اختيار طريقة المعالجة */}
        {!mode && (
          <div className="grid grid-cols-2 gap-3 py-2" data-testid="process-mode-choice">
            <button
              className="border-2 rounded-xl p-4 text-center hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors"
              onClick={() => setMode('manual')}
              data-testid="process-mode-manual"
            >
              <Hand className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
              <div className="font-semibold">يدوي</div>
              <div className="text-xs text-muted-foreground mt-1">انسخ بيانات الزبون وسجّلها بنفسك في تطبيق شركة الشحن</div>
            </button>
            <button
              className="border-2 rounded-xl p-4 text-center hover:border-blue-500 hover:bg-blue-50/40 transition-colors"
              onClick={() => setMode('auto')}
              data-testid="process-mode-auto"
            >
              <Zap className="w-8 h-8 mx-auto mb-2 text-blue-600" />
              <div className="font-semibold">تلقائي</div>
              <div className="text-xs text-muted-foreground mt-1">إرسال الطلب لشركة الشحن وإنشاء البوليصة تلقائياً</div>
            </button>
          </div>
        )}

        {/* اختيار شركة الشحن — الشركات المربوطة فقط */}
        {mode && !label && (
          <div className="space-y-2">
            <label className="text-sm font-medium">شركة الشحن (المربوطة بالنظام فقط)</label>
            {couriers.length === 0 ? (
              <div className="border border-dashed rounded-md p-3 text-sm text-muted-foreground" data-testid="process-no-couriers">
                لا توجد شركة شحن مربوطة بعد —{' '}
                <a href="/integrations" className="text-emerald-700 underline">اربطها من مركز التكاملات</a>
              </div>
            ) : (
              <Select value={courier} onValueChange={setCourier}>
                <SelectTrigger data-testid="process-courier-select"><SelectValue placeholder="اختر شركة الشحن…" /></SelectTrigger>
                <SelectContent>
                  {couriers.map(c2 => (
                    <SelectItem key={c2.channel} value={c2.channel} data-testid={`process-courier-${c2.channel}`}>
                      {c2.icon} {c2.name} {mode === 'auto' ? (c2.supports_auto ? '⚡ إرسال حقيقي' : '(تسجيل + تتبع)') : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* ── يدوي: كل معلومات الزبون مع النسخ ── */}
        {mode === 'manual' && (
          <div className="space-y-2" data-testid="process-manual-panel">
            <div className="grid grid-cols-2 gap-2">
              <CopyRow label="اسم الزبون" value={c.name} testid="copy-name" />
              <CopyRow label="الهاتف" value={c.phone} testid="copy-phone" />
              <CopyRow label="هاتف إضافي" value={c.phone2} testid="copy-phone2" />
              <CopyRow label="الولاية" value={c.wilaya} testid="copy-wilaya" />
              <CopyRow label="البلدية/المدينة" value={c.city} testid="copy-city" />
              <CopyRow label="العنوان" value={c.address} testid="copy-address" />
              <CopyRow label="المبلغ (دج)" value={order.total} testid="copy-total" />
              <CopyRow label="نوع التوصيل" value={order.delivery_type === 'office' ? 'مكتب (Stop Desk)' : 'باب المنزل'} testid="copy-dtype" />
            </div>
            <CopyRow label="المنتجات" value={itemsText} testid="copy-items" />
            {order.notes && <CopyRow label="ملاحظات" value={order.notes} testid="copy-notes" />}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button onClick={() => doManual(true)} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700" data-testid="process-registered-btn">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 ml-1" />}
                مسجَّل في الشركة
              </Button>
              <Button onClick={() => doManual(false)} disabled={busy} variant="outline" data-testid="process-not-registered-btn">
                غير مسجَّل بعد
              </Button>
            </div>
          </div>
        )}

        {/* ── تلقائي: تأكيد الإرسال ── */}
        {mode === 'auto' && !label && (
          <div className="space-y-3" data-testid="process-auto-panel">
            <p className="text-xs text-muted-foreground">
              عند التأكيد يُرسَل طلب الزبون تلقائياً إلى شركة الشحن المحددة وتُنشأ بوليصة الشحن مع رقم التتبع.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMode(null)} data-testid="process-back">رجوع</Button>
              <Button onClick={doDispatch} disabled={busy || !courier} className="flex-1" data-testid="process-confirm-auto">
                {busy ? <><Loader2 className="w-4 h-4 animate-spin ml-1" /> جارٍ الإرسال…</> : '⚡ تأكيد الإرسال التلقائي'}
              </Button>
            </div>
          </div>
        )}

        {/* ── نتيجة الإرسال التلقائي: البوليصة ── */}
        {label && (
          <div className="space-y-3 border rounded-lg p-3 bg-emerald-50/40" data-testid="process-label-result">
            <div className="flex items-center gap-2 text-emerald-800 font-semibold">
              <CheckCircle2 className="w-5 h-5" /> {autoMsg}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <CopyRow label="رقم التتبع" value={label.tracking_number} testid="copy-tracking" />
              <CopyRow label="شركة الشحن" value={label.provider} testid="copy-provider" />
            </div>
            <div className="flex gap-2">
              {label.label_url && !label.label_url.startsWith('mock://') ? (
                <a href={label.label_url} target="_blank" rel="noreferrer" className="flex-1">
                  <Button className="w-full gap-1" data-testid="process-print-label">
                    <Printer className="w-4 h-4" /> طباعة بوليصة الشحن
                  </Button>
                </a>
              ) : (
                <Button variant="outline" className="flex-1 gap-1" onClick={() => window.print()} data-testid="process-print-label">
                  <Printer className="w-4 h-4" /> طباعة
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="process-close">إغلاق</Button>
            </div>
          </div>
        )}

        {mode === 'manual' && (
          <div className="flex justify-start pt-1">
            <Button variant="ghost" size="sm" onClick={() => setMode(null)} data-testid="process-back-manual">→ تغيير طريقة المعالجة</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
