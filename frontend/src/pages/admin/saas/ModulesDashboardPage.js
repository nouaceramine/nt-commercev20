import { useEffect, useState, useCallback } from 'react';
import apiClient from '../../../lib/apiClient';
import { errText } from '../../../lib/errorText';
import { Layout } from '../../../components/Layout';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Cpu, RefreshCw, Play, Shield, ShieldAlert, CircleDot } from 'lucide-react';
import { toast } from 'sonner';
import { SaasPageHeader } from './SaasPageHeader';

/**
 * p346: اللوحة الأم للوحدات — كل وحدة مسجلة في سجل الوحدات المركزي مع روبوتها
 * الحي: الحالة، معدل الأخطاء، قاطع الدائرة، آخر خطأ، والفحص الفوري.
 */

const STATUS_STYLE = {
  ok:       { dot: 'bg-green-500',  text: 'سليمة',    ring: 'border-green-200' },
  error:    { dot: 'bg-red-500',    text: 'خطأ',      ring: 'border-red-300 bg-red-50/50' },
  degraded: { dot: 'bg-amber-500',  text: 'متدهورة',  ring: 'border-amber-300 bg-amber-50/50' },
  failing:  { dot: 'bg-red-500 animate-pulse', text: 'فاشلة', ring: 'border-red-400 bg-red-50' },
  pending:  { dot: 'bg-gray-400',   text: 'بانتظار أول فحص', ring: 'border-muted' },
};

export const ModulesDashboardPage = () => {
  const [modules, setModules] = useState(null);
  const [robots, setRobots] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [unifications, setUnifications] = useState(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [m, r, c, u] = await Promise.all([
        apiClient.get('/saas/modules'),
        apiClient.get('/saas/modules/robots'),
        apiClient.get('/saas/modules/coverage'),
        apiClient.get('/saas/modules/unifications'),
      ]);
      setModules(m.data);
      setRobots(r.data);
      setCoverage(c.data);
      setUnifications(u.data);
    } catch (e) {
      toast.error(errText(e) || 'فشل تحميل اللوحة الأم');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await apiClient.post('/saas/modules/robots/run');
      const { checked, failing } = res.data;
      if (failing === 0) toast.success(`فحص ${checked} وحدة — كلها سليمة`);
      else toast.error(`فحص ${checked} وحدة — ${failing} فاشلة`);
      await fetchAll();
    } catch (e) {
      toast.error(errText(e) || 'فشل الفحص');
    } finally {
      setRunning(false);
    }
  };

  const robotsMap = {};
  (robots?.robots || []).forEach(r => { robotsMap[r.key] = r; });

  const byCategory = {};
  (modules?.components || []).forEach(c => {
    (byCategory[c.category_ar || c.category] = byCategory[c.category_ar || c.category] || []).push(c);
  });

  return (
    <Layout>
      <div className="space-y-6" data-testid="modules-dashboard-page">
        <SaasPageHeader
          titleAr="اللوحة الأم للوحدات"
          subtitleAr="كل وحدة في المنصة مع روبوتها الحي — الحالة والأخطاء والبوابات"
          icon={Cpu}
          extra={
            <Button onClick={runNow} disabled={running} className="gap-2" data-testid="robots-run-now">
              {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              فحص فوري
            </Button>
          }
        />

        {/* stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">الوحدات</div>
            <div className="text-2xl font-bold" data-testid="stat-total">{modules?.total ?? '—'}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">بوابات قابلة للتفعيل</div>
            <div className="text-2xl font-bold" data-testid="stat-gated">{modules?.gated ?? '—'}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">تغطية API</div>
            <div className="text-2xl font-bold text-green-600" data-testid="stat-coverage">
              {coverage ? `${coverage.coverage_pct}%` : '—'}
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">وحدات فاشلة الآن</div>
            <div className={`text-2xl font-bold ${robots?.failing ? 'text-red-600' : 'text-green-600'}`} data-testid="stat-failing">
              {robots?.failing ?? '—'}
            </div>
          </CardContent></Card>
        </div>

        {loading && <div className="text-center text-muted-foreground py-8">جاري التحميل…</div>}

        {/* modules grouped by category */}
        {Object.entries(byCategory).map(([cat, comps]) => (
          <div key={cat} data-testid={`modules-cat-${cat}`}>
            <h2 className="text-sm font-bold text-muted-foreground mb-2 border-b pb-1">{cat}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {comps.map(c => {
                const rb = robotsMap[c.key] || {};
                const st = rb.status === 'failing' ? 'failing' : c.status;
                const style = STATUS_STYLE[st] || STATUS_STYLE.pending;
                return (
                  <Card key={c.key} className={`border ${style.ring}`} data-testid={`module-card-${c.key}`}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                          <span className="font-semibold text-sm">{c.name_ar}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">{c.key}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span className="px-1.5 py-0.5 rounded bg-muted">{style.text}</span>
                        {c.gate ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 flex items-center gap-1">
                            <Shield className="h-3 w-3" />{c.gate}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">دائمة</span>
                        )}
                        {c.aliases?.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
                            دمج: {c.aliases.length}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground flex gap-3">
                        <span>طلبات: {c.metrics?.requests ?? 0}</span>
                        <span>أخطاء: {c.metrics?.errors ?? 0}</span>
                        <span>معدل: {c.metrics?.error_rate ?? 0}%</span>
                        {rb.total_checks !== undefined && <span>فحوصات: {rb.total_checks}</span>}
                      </div>
                      {(c.last_error || rb.last_error) && (
                        <div className="text-[11px] text-red-600 bg-red-50 rounded p-2 flex items-start gap-1" data-testid={`module-error-${c.key}`}>
                          <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="break-all">{(rb.last_error || c.last_error?.detail || '').slice(0, 140)}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        {/* unifications */}
        {unifications?.unified?.length > 0 && (
          <div data-testid="unifications-section">
            <h2 className="text-sm font-bold text-muted-foreground mb-2 border-b pb-1 flex items-center gap-2">
              <CircleDot className="h-4 w-4" /> الوحدات الموحّدة (إزالة التكرار)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {unifications.unified.map(u => (
                <Card key={u.key}><CardContent className="p-4">
                  <div className="font-semibold text-sm mb-1">{u.name_ar} <span className="font-mono text-[10px] text-muted-foreground">({u.key})</span></div>
                  <div className="text-xs text-muted-foreground">
                    وحّدت: {u.aliases.join(' + ')}
                  </div>
                </CardContent></Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ModulesDashboardPage;
