import { errText } from '../../../lib/errorText';
import { useEffect, useState, useCallback } from 'react';
import apiClient from '../../../lib/apiClient';
import { Layout } from '../../../components/Layout';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { Fingerprint, RefreshCw, Users, AlertTriangle, CheckCircle2, Database } from 'lucide-react';
import { toast } from 'sonner';
import { SaasPageHeader } from './SaasPageHeader';

const COLL_AR = {
  wallets: 'المحافظ', wallet_requests: 'طلبات المحافظ', saas_agents: 'الوكلاء',
  saas_payments: 'مدفوعات المنصة', supplier_payments: 'مدفوعات الموردين',
  saas_tenants: 'المشتركين', cash_boxes: 'الصناديق', users: 'المستخدمون',
  sales: 'المبيعات', purchases: 'المشتريات', expenses: 'المصاريف',
  quotations: 'عروض الأسعار', returns: 'المرتجعات', recharges: 'عمليات الشحن',
  stock_movements: 'حركات المخزون', daily_sessions: 'الجلسات اليومية',
  ecom_orders: 'طلبات المتجر', transfers: 'التحويلات',
};
const collAr = (c) => COLL_AR[c] || c;

const Pct = ({ v }) => (
  <span className={`font-mono font-semibold ${v >= 99 ? 'text-green-600' : v >= 90 ? 'text-amber-600' : 'text-red-600'}`}>
    {v}%
  </span>
);

export default function IdAuditPage() {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);

  const [tenants, setTenants] = useState([]);
  const [selTenant, setSelTenant] = useState('');
  const [attr, setAttr] = useState(null);
  const [attrLoading, setAttrLoading] = useState(false);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/saas/id-audit');
      setAudit(res.data || null);
    } catch (e) {
      toast.error(errText(e) || 'فشل تحميل تدقيق الأكواد');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAttr = useCallback(async (tid) => {
    if (!tid) { setAttr(null); return; }
    setAttrLoading(true);
    try {
      const res = await apiClient.get(`/saas/id-audit/user-attribution?tenant_id=${encodeURIComponent(tid)}`);
      setAttr(res.data || null);
    } catch (e) {
      toast.error(errText(e) || 'فشل تحميل نسب العمليات');
      setAttr(null);
    } finally {
      setAttrLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAudit();
    (async () => {
      try {
        const res = await apiClient.get('/saas/tenants');
        setTenants(res.data || []);
      } catch { /* silent */ }
    })();
  }, [loadAudit]);

  const summary = audit?.summary || { total_missing: 0, total_duplicate_codes: 0 };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="saas-id-audit-page">
        <SaasPageHeader
          titleAr="تدقيق الهويات والعمليات"
          subtitleAr="تغطية الأكواد العامة، كشف التكرارات، ونسبة كل عملية لمستخدمها — ليعرف صاحب المنصة من قام بأي عملية دون تطابق المعرفات."
          icon={Fingerprint}
          extra={
            <Button variant="outline" size="sm" onClick={loadAudit} disabled={loading} data-testid="refresh-id-audit-btn">
              <RefreshCw className={`h-4 w-4 me-1 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
          }
        />

        {/* ── Code coverage summary ─────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card data-testid="card-missing-codes">
            <CardContent className="p-4 flex items-center gap-3">
              {summary.total_missing === 0
                ? <CheckCircle2 className="h-8 w-8 text-green-600" />
                : <AlertTriangle className="h-8 w-8 text-amber-600" />}
              <div>
                <div className="text-2xl font-bold font-mono">{summary.total_missing}</div>
                <div className="text-xs text-muted-foreground">سجلات بلا كود عام (كل المنصة)</div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-dup-codes">
            <CardContent className="p-4 flex items-center gap-3">
              {summary.total_duplicate_codes === 0
                ? <CheckCircle2 className="h-8 w-8 text-green-600" />
                : <AlertTriangle className="h-8 w-8 text-red-600" />}
              <div>
                <div className="text-2xl font-bold font-mono">{summary.total_duplicate_codes}</div>
                <div className="text-xs text-muted-foreground">أكواد مكررة (يجب أن تبقى 0)</div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-tenants-audited">
            <CardContent className="p-4 flex items-center gap-3">
              <Database className="h-8 w-8 text-primary" />
              <div>
                <div className="text-2xl font-bold font-mono">{audit?.tenants?.length ?? '—'}</div>
                <div className="text-xs text-muted-foreground">قواعد بيانات مستأجرين مفحوصة</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Main DB collections ───────────────────────────────── */}
        <Card data-testid="main-collections-card">
          <CardContent className="p-4">
            <h2 className="font-semibold mb-3">قاعدة المنصة الرئيسية</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-start py-2">المجموعة</th>
                    <th className="text-start py-2">الإجمالي</th>
                    <th className="text-start py-2">لها كود</th>
                    <th className="text-start py-2">ناقصة</th>
                    <th className="text-start py-2">تكرارات</th>
                  </tr>
                </thead>
                <tbody>
                  {audit && Object.entries(audit.main || {}).map(([coll, r]) => (
                    <tr key={coll} className="border-b last:border-0" data-testid={`main-row-${coll}`}>
                      <td className="py-2">{collAr(coll)}</td>
                      <td className="py-2 font-mono">{r.total}</td>
                      <td className="py-2 font-mono text-green-700">{r.coded}</td>
                      <td className={`py-2 font-mono ${r.missing ? 'text-amber-600 font-semibold' : ''}`}>{r.missing}</td>
                      <td className={`py-2 font-mono ${r.duplicate_codes ? 'text-red-600 font-semibold' : ''}`}>{r.duplicate_codes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Per-tenant code coverage ──────────────────────────── */}
        <Card data-testid="tenant-collections-card">
          <CardContent className="p-4">
            <h2 className="font-semibold mb-3">قواعد المستأجرين</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-start py-2">المتجر</th>
                    <th className="text-start py-2">المعرّف</th>
                    {(audit?.tenants?.[0] ? Object.keys(audit.tenants[0].collections) : []).map((c) => (
                      <th key={c} className="text-start py-2">{collAr(c)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(audit?.tenants || []).map((t) => (
                    <tr key={t.tenant_id} className="border-b last:border-0" data-testid={`tenant-row-${t.short_id || t.tenant_id}`}>
                      <td className="py-2 max-w-[180px] truncate">{t.name || '—'}</td>
                      <td className="py-2 font-mono text-xs">{t.short_id || t.tenant_id.slice(0, 8)}</td>
                      {Object.entries(t.collections).map(([c, r]) => (
                        <td key={c} className="py-2">
                          {r.duplicate_codes > 0
                            ? <span className="text-red-600 font-semibold font-mono">تكرار×{r.duplicate_codes}</span>
                            : r.missing > 0
                              ? <span className="text-amber-600 font-mono">ناقص {r.missing}/{r.total}</span>
                              : <span className="text-green-700 font-mono">{r.total} ✓</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── User attribution ──────────────────────────────────── */}
        <Card data-testid="attribution-card">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <h2 className="font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  نسب العمليات للمستخدمين
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  لكل مستأجر: كم عملية نُفّذت، وكم منها يحمل هوية مستخدم، وأي مستخدم نفّذ ماذا. المعرّفات المجهولة = عمليات تشير لمستخدم غير موجود.
                </p>
              </div>
              <div className="w-full sm:w-80">
                <Label className="text-xs">المتجر</Label>
                <select
                  value={selTenant}
                  onChange={(e) => { setSelTenant(e.target.value); loadAttr(e.target.value); }}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="attr-tenant-select"
                >
                  <option value="">— اختر متجراً —</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name || t.short_id || t.id}</option>
                  ))}
                </select>
              </div>
            </div>

            {attrLoading && <div className="text-sm text-muted-foreground py-6 text-center">جارٍ الحساب…</div>}

            {attr && !attrLoading && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-xl font-bold font-mono">{attr.summary.total_ops}</div>
                    <div className="text-[11px] text-muted-foreground">إجمالي العمليات</div>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-xl font-bold"><Pct v={attr.summary.coverage_pct} /></div>
                    <div className="text-[11px] text-muted-foreground">نسبة التغطية</div>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-xl font-bold font-mono text-amber-600">{attr.summary.missing_ops}</div>
                    <div className="text-[11px] text-muted-foreground">عمليات بلا هوية</div>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <div className="text-xl font-bold font-mono">{attr.summary.active_users}</div>
                    <div className="text-[11px] text-muted-foreground">مستخدمون نشطون</div>
                  </div>
                  <div className="rounded-md border p-3 text-center">
                    <div className={`text-xl font-bold font-mono ${attr.summary.unknown_creator_ids ? 'text-red-600' : ''}`}>
                      {attr.summary.unknown_creator_ids}
                    </div>
                    <div className="text-[11px] text-muted-foreground">معرّفات مجهولة</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <h3 className="text-sm font-semibold mb-2">حسب المستخدم</h3>
                  <table className="w-full text-sm" data-testid="attr-users-table">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-start py-2">المستخدم</th>
                        <th className="text-start py-2">الدور</th>
                        <th className="text-start py-2">العمليات</th>
                        <th className="text-start py-2">التفصيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attr.users.map((u) => (
                        <tr key={u.user_id} className="border-b last:border-0">
                          <td className="py-2">
                            <div className="font-medium">{u.name || '—'}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{u.email || u.user_id}</div>
                          </td>
                          <td className="py-2 text-xs">{u.role || '—'}</td>
                          <td className="py-2 font-mono font-semibold">{u.total_ops}</td>
                          <td className="py-2 text-xs text-muted-foreground">
                            {Object.entries(u.by_collection).map(([c, n]) => `${collAr(c)}: ${n}`).join(' · ')}
                          </td>
                        </tr>
                      ))}
                      {attr.users.length === 0 && (
                        <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">لا توجد عمليات منسوبة لمستخدمين</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {attr.unknown_creators.length > 0 && (
                  <div className="overflow-x-auto rounded-md border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-3" data-testid="attr-unknown-block">
                    <h3 className="text-sm font-semibold mb-2 text-red-700 dark:text-red-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      معرّفات مجهولة — عمليات تشير لمستخدمين غير موجودين
                    </h3>
                    <table className="w-full text-sm">
                      <tbody>
                        {attr.unknown_creators.map((u) => (
                          <tr key={u.user_id} className="border-b last:border-0 border-red-100">
                            <td className="py-1.5 font-mono text-xs">{u.user_id}</td>
                            <td className="py-1.5 font-mono">{u.total_ops} عملية</td>
                            <td className="py-1.5 text-xs text-muted-foreground">
                              {Object.entries(u.by_collection).map(([c, n]) => `${collAr(c)}: ${n}`).join(' · ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <h3 className="text-sm font-semibold mb-2">حسب نوع العملية</h3>
                  <table className="w-full text-sm" data-testid="attr-collections-table">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-start py-2">المجموعة</th>
                        <th className="text-start py-2">الإجمالي</th>
                        <th className="text-start py-2">منسوبة</th>
                        <th className="text-start py-2">بلا هوية</th>
                        <th className="text-start py-2">التغطية</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attr.collections.map((c) => (
                        <tr key={c.collection} className="border-b last:border-0">
                          <td className="py-2">{collAr(c.collection)}</td>
                          <td className="py-2 font-mono">{c.total}</td>
                          <td className="py-2 font-mono text-green-700">{c.attributed}</td>
                          <td className={`py-2 font-mono ${c.missing ? 'text-amber-600' : ''}`}>{c.missing}</td>
                          <td className="py-2"><Pct v={c.coverage_pct} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
