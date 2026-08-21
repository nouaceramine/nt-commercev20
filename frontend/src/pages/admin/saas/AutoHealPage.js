/**
 * AutoHeal Page — Super-Admin (p54)
 * لوحة الإصلاح الذاتي: نقاط صحة النظام، النتائج المكتشفة، الموافقات، سجل المسحات، المشاكل المعروفة.
 */
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../lib/apiClient';
import { Layout } from '../../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../components/ui/table';
import { toast } from 'sonner';
import {
  Activity, RefreshCw, Play, CheckCircle, XCircle, Clock,
  AlertTriangle, ShieldCheck, Bug, Zap, FileText, Wrench
} from 'lucide-react';

const SEV = {
  Critical: { label: 'حرج', cls: 'bg-red-100 text-red-800' },
  High: { label: 'عالي', cls: 'bg-orange-100 text-orange-800' },
  Medium: { label: 'متوسط', cls: 'bg-amber-100 text-amber-800' },
  Low: { label: 'منخفض', cls: 'bg-slate-100 text-slate-700' },
};

const STATUS = {
  active: { label: 'نشط', cls: 'bg-red-50 text-red-700' },
  awaiting_approval: { label: 'بانتظار الموافقة', cls: 'bg-amber-50 text-amber-700' },
  resolved: { label: 'تم الحل', cls: 'bg-emerald-50 text-emerald-700' },
  dismissed: { label: 'متجاهَل', cls: 'bg-slate-50 text-slate-500' },
};

const URGENCY = {
  immediate: 'فوري',
  'within-1h': 'خلال ساعة',
  'within-24h': 'خلال 24 ساعة',
};

function scoreColor(score) {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-red-600';
}

export default function AutoHealPage() {
  const [health, setHealth] = useState(null);
  const [findings, setFindings] = useState([]);
  const [scans, setScans] = useState([]);
  const [knownIssues, setKnownIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [morningReport, setMorningReport] = useState(null);  // p225
  const [errorClasses, setErrorClasses] = useState(null);    // p225
  const [generatingReport, setGeneratingReport] = useState(false);  // p225

  const fetchAll = useCallback(async () => {
    try {
      const [h, f, s, k, mr, ec] = await Promise.all([
        apiClient.get('/saas/autoheal/health'),
        apiClient.get('/saas/autoheal/findings', { params: { limit: 100 } }),
        apiClient.get('/saas/autoheal/scans', { params: { limit: 10 } }),
        apiClient.get('/saas/autoheal/known-issues'),
        apiClient.get('/saas/autoheal/morning-report').catch(() => ({ data: null })),  // p225
        apiClient.get('/saas/autoheal/error-classes').catch(() => ({ data: null })),   // p225
      ]);
      setHealth(h.data);
      setFindings(f.data.items || []);
      setScans(s.data.items || []);
      setKnownIssues(k.data.items || []);
      setMorningReport(mr.data);       // p225
      setErrorClasses(ec.data);        // p225
    } catch (err) {
      console.error('autoheal fetch failed:', err);
      toast.error('تعذر تحميل بيانات الإصلاح الذاتي');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await apiClient.post('/saas/autoheal/scan');
      toast.success(`اكتمل المسح — نقاط الصحة: ${res.data.health_score}`);
      await fetchAll();
    } catch (err) {
      toast.error('فشل تشغيل المسح');
    } finally {
      setScanning(false);
    }
  };

  const approve = async (id) => {
    setBusyId(id);
    try {
      const res = await apiClient.post(`/saas/autoheal/findings/${id}/approve`);
      toast.success(res.data.message || 'تم تنفيذ الإصلاح');
      await fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل تنفيذ الإصلاح');
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (id) => {
    setBusyId(id);
    try {
      await apiClient.post(`/saas/autoheal/findings/${id}/dismiss`);
      toast.success('تم تجاهل النتيجة');
      await fetchAll();
    } catch (err) {
      toast.error('فشل التجاهل');
    } finally {
      setBusyId(null);
    }
  };

  const generateMorningReport = async () => {  // p225
    setGeneratingReport(true);
    try {
      const res = await apiClient.post('/saas/autoheal/morning-report/generate');
      setMorningReport(res.data);
      toast.success('تم توليد التقرير الصباحي');
    } catch (err) {
      toast.error('فشل توليد التقرير');
    } finally {
      setGeneratingReport(false);
    }
  };

  const score = health ? health.health_score : null;

  return (
    <Layout>
      <div className="space-y-6" data-testid="autoheal-page">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
              الإصلاح الذاتي — AutoHeal
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              مسح تلقائي كل 5 دقائق عبر مستويات المنصة — إصلاح آمن فوري، والباقي بموافقتك
            </p>
          </div>
          <Button onClick={runScan} disabled={scanning} className="gap-2" data-testid="autoheal-run-scan">
            {scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            تشغيل مسح الآن
          </Button>
        </div>

        {/* Health summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="pt-6 text-center">
              <p className="text-xs text-muted-foreground mb-1">نقاط صحة النظام</p>
              <p className={`text-4xl font-bold ${score !== null ? scoreColor(score) : ''}`} data-testid="autoheal-health-score">
                {score !== null ? score : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">/ 100</p>
            </CardContent>
          </Card>
          {Object.entries(SEV).map(([key, meta]) => (
            <Card key={key}>
              <CardContent className="pt-6 text-center">
                <p className="text-xs text-muted-foreground mb-1">{meta.label}</p>
                <p className="text-2xl font-bold" data-testid={`autoheal-count-${key}`}>
                  {health ? health.active_counts[key] ?? 0 : '—'}
                </p>
                <Badge className={`mt-1 ${meta.cls}`}>{meta.label}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {health?.last_scan && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            آخر مسح: {health.last_scan.id} — {new Date(health.last_scan.started_at).toLocaleString('ar-DZ')}
            {health.awaiting_approval > 0 && (
              <span className="text-amber-700 font-medium"> — {health.awaiting_approval} بانتظار موافقتك</span>
            )}
          </p>
        )}

        {/* Findings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5" />
              النتائج المكتشفة
            </CardTitle>
            <CardDescription>أخطاء وتنبيهات حية — درجات 4-6 تحتاج موافقتك قبل التنفيذ</CardDescription>
          </CardHeader>
          <CardContent>
            {findings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
                {loading ? 'جاري التحميل...' : 'لا نتائج — النظام سليم'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="autoheal-findings-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>الخطورة</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الوصف</TableHead>
                      <TableHead>السبب الجذري</TableHead>
                      <TableHead>الإجراء المطلوب</TableHead>
                      <TableHead>تكرار</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {findings.map((f) => (
                      <TableRow key={f.id} data-testid={`autoheal-finding-${f.id}`}>
                        <TableCell>
                          <Badge className={SEV[f.severity]?.cls || ''}>{SEV[f.severity]?.label || f.severity}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS[f.status]?.cls || ''}>
                            {STATUS[f.status]?.label || f.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <p className="text-sm font-medium">{f.title_ar}</p>
                          <p className="text-xs text-muted-foreground">{f.module} — {f.level}</p>
                        </TableCell>
                        <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                          {f.root_cause_ar}
                        </TableCell>
                        <TableCell className="max-w-[220px] text-xs">
                          {f.manual_action_details_ar}
                          {f.manual_action_urgency && (
                            <span className="block text-muted-foreground mt-0.5">
                              الاستعجال: {URGENCY[f.manual_action_urgency] || f.manual_action_urgency}
                            </span>
                          )}
                          {f.remediation_result && (
                            <span className="block text-emerald-700 mt-0.5">{f.remediation_result}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{f.occurrences}×</TableCell>
                        <TableCell>
                          {(f.status === 'awaiting_approval' || f.status === 'active') && (
                            <div className="flex gap-1">
                              {f.remediation_key && (
                                <Button
                                  size="sm" variant="default" className="h-7 text-xs gap-1"
                                  disabled={busyId === f.id}
                                  onClick={() => approve(f.id)}
                                  data-testid={`autoheal-approve-${f.id}`}
                                >
                                  <Zap className="h-3 w-3" />
                                  موافقة على الإصلاح
                                </Button>
                              )}
                              <Button
                                size="sm" variant="ghost" className="h-7 text-xs"
                                disabled={busyId === f.id}
                                onClick={() => dismiss(f.id)}
                                data-testid={`autoheal-dismiss-${f.id}`}
                              >
                                تجاهل
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scan history + Known issues */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" />
                سجل المسحات
              </CardTitle>
            </CardHeader>
            <CardContent>
              {scans.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">لا مسحات بعد</p>
              ) : (
                <Table data-testid="autoheal-scans-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>المسح</TableHead>
                      <TableHead>النوع</TableHead>
                      <TableHead>النقاط</TableHead>
                      <TableHead>المدة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scans.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs" dir="ltr">{new Date(s.started_at).toLocaleString('ar-DZ')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {s.scan_type === 'scheduled' ? 'مجدول' : 'يدوي'}
                          </Badge>
                        </TableCell>
                        <TableCell className={`font-bold ${scoreColor(s.health_score)}`}>{s.health_score}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.duration_ms}ms</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4" />
                المشاكل المعروفة (أنماط متكررة)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {knownIssues.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">لا أنماط متكررة — ممتاز</p>
              ) : (
                <div className="space-y-2" data-testid="autoheal-known-issues">
                  {knownIssues.map((k) => (
                    <div key={k.signature} className="rounded-lg border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Badge className={SEV[k.severity]?.cls || ''}>{SEV[k.severity]?.label || k.severity}</Badge>
                        <p className="text-sm font-medium flex-1">{k.title_ar}</p>
                        <span className="text-xs text-muted-foreground">{k.occurrences}×</span>
                      </div>
                      {k.prevention_rule_ar && (
                        <p className="text-xs text-muted-foreground mt-1">{k.prevention_rule_ar}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* p225: Morning report */}
        <Card data-testid="autoheal-morning-report">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                التقرير الصباحي — ماذا حدث خلال 24 ساعة
              </CardTitle>
              <Button size="sm" variant="outline" onClick={generateMorningReport}
                      disabled={generatingReport} className="gap-2" data-testid="morning-report-generate">
                {generatingReport ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                توليد الآن
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!morningReport ? (
              <p className="text-sm text-muted-foreground py-4 text-center" data-testid="morning-report-empty">
                لا تقرير بعد — يُولَّد تلقائياً كل صباح بعد السادسة
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">المسحات</p>
                    <p className="text-xl font-bold" data-testid="mr-scans">{morningReport.scans?.count ?? 0}</p>
                    <p className="text-xs text-muted-foreground">أدنى نقاط: {morningReport.scans?.min_score ?? '—'}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">نتائج جديدة</p>
                    <p className="text-xl font-bold" data-testid="mr-new">{morningReport.findings?.new ?? 0}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">أُصلحت تلقائياً</p>
                    <p className="text-xl font-bold text-emerald-600" data-testid="mr-fixed">{morningReport.findings?.auto_fixed ?? 0}</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">تحتاج تدخلك</p>
                    <p className="text-xl font-bold text-amber-600" data-testid="mr-needs">{morningReport.needs_owner?.length ?? 0}</p>
                  </div>
                </div>
                {morningReport.needs_owner?.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="mr-needs-list">
                    <p className="text-sm font-medium mb-2">بانتظار موافقتك:</p>
                    {morningReport.needs_owner.map((n) => (
                      <p key={n.id} className="text-sm">• {n.title} <span className="text-xs text-muted-foreground">({n.occurrences}×)</span></p>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">تاريخ التقرير: {morningReport.date} — وُلّد {(morningReport.generated_at || '').slice(11, 16)} UTC</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* p225: Error classification */}
        <Card data-testid="autoheal-error-classes">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4" />
              تصنيف الأخطاء (المستوى 1)
            </CardTitle>
            <CardDescription>كل خطأ في سجل النظام يُصنَّف تلقائياً ويُربط بدليل معالجة (runbook)</CardDescription>
          </CardHeader>
          <CardContent>
            {!errorClasses ? (
              <p className="text-sm text-muted-foreground py-4 text-center">لا بيانات</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2" data-testid="error-classes-chips">
                  {Object.entries(errorClasses.by_category || {}).map(([cat, n]) => (
                    <Badge key={cat} variant="secondary" className="gap-1" data-testid={`errcat-${cat}`}>
                      {cat}: {n}
                    </Badge>
                  ))}
                  {(errorClasses.unclassified ?? 0) > 0 && (
                    <Badge variant="outline">{errorClasses.unclassified} غير مصنّف</Badge>
                  )}
                </div>
                {errorClasses.items?.length > 0 && (
                  <div className="space-y-1">
                    {errorClasses.items.slice(0, 5).map((i) => (
                      <div key={i.signature} className="flex items-center gap-2 text-sm border-b pb-1">
                        <Badge variant="outline">{i.category}</Badge>
                        <span className="flex-1 truncate text-xs">{i.sample}</span>
                        <span className="text-xs text-muted-foreground">{i.count}×</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
