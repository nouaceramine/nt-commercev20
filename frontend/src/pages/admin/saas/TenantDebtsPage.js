import { useEffect, useState } from 'react';
import apiClient from '../../../lib/apiClient';
import { Layout } from '../../../components/Layout';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../../components/ui/dialog';
import { Receipt, RefreshCw, Bell, FileText, Banknote } from 'lucide-react';
import { toast } from 'sonner';
import { formatShortDate } from '../../../utils/globalDateFormatter';
import { SaasPageHeader } from './SaasPageHeader';
import { EntityCode } from '../components/EntityCode';

export default function TenantDebtsPage() {
  const [debts, setDebts] = useState([]);
  const [summary, setSummary] = useState({ total_tenants_with_debt: 0, total_debt: 0, overdue_subscriptions: 0 });
  const [loading, setLoading] = useState(false);
  const [remindingId, setRemindingId] = useState(null);

  // Settle Debt dialog state
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleTenant, setSettleTenant] = useState(null);
  const [settleAmount, setSettleAmount] = useState(0);
  const [settleNote, setSettleNote] = useState('');
  const [settleBusy, setSettleBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/saas/tenant-debts');
      setDebts(res.data?.items || []);
      setSummary(res.data?.summary || { total_tenants_with_debt: 0, total_debt: 0, overdue_subscriptions: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تحميل ديون التجار');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const remind = async (tenantId) => {
    setRemindingId(tenantId);
    try {
      const res = await apiClient.post(`/saas/tenant-debts/${tenantId}/remind`, { channel: 'email' });
      if (res.data?.delivered) {
        toast.success('تم إرسال التذكير بنجاح');
      } else {
        toast.success(`تم تسجيل التذكير${res.data?.delivery_error ? ` (لم يُرسَل: ${res.data.delivery_error})` : ''}`);
      }
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل إرسال التذكير');
    } finally {
      setRemindingId(null);
    }
  };

  const downloadPdf = async (tenant) => {
    try {
      const res = await apiClient.get(`/saas/tenant-debts/${tenant.tenant_id}/statement.pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement_${(tenant.tenant_name || tenant.tenant_id).replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('فشل تنزيل كشف الحساب');
    }
  };

  const openSettle = (tenant) => {
    setSettleTenant(tenant);
    setSettleAmount(tenant.credit_debt || 0);
    setSettleNote('');
    setSettleOpen(true);
  };

  const confirmSettle = async () => {
    if (!settleTenant) return;
    const amount = parseFloat(settleAmount);
    if (!amount || amount <= 0) { toast.error('المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (amount > (settleTenant.credit_debt || 0)) {
      toast.error(`المبلغ يفوق الدين المسجَّل (${(settleTenant.credit_debt || 0).toLocaleString('ar-DZ')} دج)`);
      return;
    }
    setSettleBusy(true);
    try {
      const res = await apiClient.post('/wallet/settle-credit', {
        entity_id: settleTenant.tenant_id,
        amount,
        description: settleNote || `تسديد دين — ${settleTenant.tenant_name || settleTenant.tenant_id}`,
      });
      toast.success(`تم التسديد. الدين المتبقّي: ${Number(res.data?.credit_debt_remaining || 0).toLocaleString('ar-DZ')} دج`);
      setSettleOpen(false);
      setSettleTenant(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تسديد الدين');
    } finally {
      setSettleBusy(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="saas-tenant-debts-page">
        <SaasPageHeader
          titleAr="ديون التجار للمنصّة"
          subtitleAr="جميع التجار الذين لديهم رصيد دين (Credit) متبقّ. أرسل تذكير بضغطة واحدة أو نزّل كشف حساب PDF."
          icon={Receipt}
          extra={
            <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="refresh-tenant-debts-btn">
              <RefreshCw className={`h-4 w-4 me-1 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
          }
        />

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card data-testid="tenant-debts-summary-count"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">عدد التجار المدينين</p>
            <p className="text-3xl font-bold mt-1">{summary.total_tenants_with_debt ?? 0}</p>
          </CardContent></Card>
          <Card data-testid="tenant-debts-summary-total"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">إجمالي الديون (دج)</p>
            <p className="text-3xl font-bold mt-1 text-red-600">{(summary.total_debt || 0).toLocaleString('ar-DZ')}</p>
          </CardContent></Card>
          <Card data-testid="tenant-debts-summary-overdue"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">اشتراكات متأخرة</p>
            <p className="text-3xl font-bold mt-1 text-amber-600">{summary.overdue_subscriptions ?? 0}</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
            ) : debts.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground" data-testid="tenant-debts-empty">
                🎉 لا يوجد أي تاجر مدين للمنصّة حالياً.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-start">المعرّف</th>
                      <th className="px-3 py-2 text-start">التاجر</th>
                      <th className="px-3 py-2 text-start">البريد الإلكتروني</th>
                      <th className="px-3 py-2 text-start">الرصيد</th>
                      <th className="px-3 py-2 text-start">الدين (دج)</th>
                      <th className="px-3 py-2 text-start">آخر تذكير</th>
                      <th className="px-3 py-2 text-start">عدد التذكيرات</th>
                      <th className="px-3 py-2 text-start">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody data-testid="tenant-debts-table">
                    {debts.map((t) => (
                      <tr key={t.tenant_id} className="border-t border-border hover:bg-muted/30" data-testid={`tenant-debt-row-${t.tenant_id}`}>
                        <td className="px-3 py-2">
                          <EntityCode uuid={t.tenant_id} type="tenant" testId={`tenant-code-${t.tenant_id}`} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{t.tenant_name}</div>
                          {t.subscription_overdue && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-2 py-0.5 text-xs mt-1">
                              ⚠️ اشتراك منتهي
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t.tenant_email}</td>
                        <td className="px-3 py-2 text-xs">{(t.wallet_balance || 0).toLocaleString('ar-DZ')}</td>
                        <td className="px-3 py-2 font-semibold text-red-600">{(t.credit_debt || 0).toLocaleString('ar-DZ')}</td>
                        <td className="px-3 py-2 text-xs">{t.last_reminder_at ? formatShortDate(t.last_reminder_at) : '—'}</td>
                        <td className="px-3 py-2 text-center">{t.reminders_sent || 0}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => openSettle(t)}
                              data-testid={`settle-debt-${t.tenant_id}-btn`}
                            >
                              <Banknote className="h-3 w-3 me-1" />
                              تسديد الدين
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => remind(t.tenant_id)}
                              disabled={remindingId === t.tenant_id}
                              data-testid={`remind-tenant-${t.tenant_id}-btn`}
                            >
                              {remindingId === t.tenant_id ? <RefreshCw className="h-3 w-3 me-1 animate-spin" /> : <Bell className="h-3 w-3 me-1" />}
                              تذكير
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadPdf(t)}
                              data-testid={`download-statement-${t.tenant_id}-btn`}
                            >
                              <FileText className="h-3 w-3 me-1" />
                              PDF
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Settle Debt Dialog */}
        <Dialog open={settleOpen} onOpenChange={(o) => { setSettleOpen(o); if (!o) setSettleTenant(null); }}>
          <DialogContent className="max-w-md" data-testid="settle-debt-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-emerald-600" />
                تسديد دين التاجر
              </DialogTitle>
              <DialogDescription>
                {settleTenant ? (
                  <>
                    التاجر: <span className="font-semibold">{settleTenant.tenant_name}</span>
                    {' · '}
                    الدين الحالي:{' '}
                    <span className="font-semibold text-red-600">
                      {(settleTenant.credit_debt || 0).toLocaleString('ar-DZ')} دج
                    </span>
                  </>
                ) : 'حدّد المبلغ المُسدَّد نقداً من التاجر.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">المبلغ المُسدَّد (دج)</Label>
                <Input
                  type="number"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(parseFloat(e.target.value) || 0)}
                  data-testid="settle-debt-amount-input"
                />
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setSettleAmount(settleTenant?.credit_debt || 0)}
                    data-testid="settle-debt-full-btn"
                  >
                    تسديد كامل الدين
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => setSettleAmount(Math.round((settleTenant?.credit_debt || 0) / 2))}
                  >
                    النصف
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ملاحظة (اختياري)</Label>
                <Textarea
                  rows={2}
                  placeholder="مرجع إيصال، طريقة التسليم، إلخ"
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                  data-testid="settle-debt-note-input"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                سيُسجَّل هذا كمعاملة <strong>credit_settlement</strong> ويُخصم من رصيد دين التاجر تلقائياً.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSettleOpen(false)} data-testid="settle-debt-cancel-btn">إلغاء</Button>
              <Button
                onClick={confirmSettle}
                disabled={settleBusy || !settleAmount || settleAmount <= 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                data-testid="settle-debt-confirm-btn"
              >
                {settleBusy && <RefreshCw className="h-4 w-4 animate-spin" />}
                تأكيد التسديد
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
