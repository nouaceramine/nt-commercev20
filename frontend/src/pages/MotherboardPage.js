import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  Cpu, CircuitBoard, RefreshCw, CheckCircle2, AlertTriangle, FileText,
  Database, Activity, XCircle, Zap, BarChart3, Bot, History, ShieldOff,
  Clock, TrendingUp, Server, Users, ToggleLeft,
  ShoppingCart, ShoppingBag, Warehouse, Smartphone, CreditCard, Wrench,
  Sparkles, MessageCircle, Bell, CalendarDays, Landmark, Receipt, Award,
  Printer, Store, BrainCircuit, Package2,
} from 'lucide-react';

const FEAT_ICON_MAP = {
  ShoppingCart, ShoppingBag, Warehouse, Users, Smartphone, Zap, CreditCard,
  Wrench, Package2, Bot, FileText, Database, Sparkles, BrainCircuit,
  MessageCircle, Bell, BarChart3, CalendarDays, Landmark, Receipt, Award,
  Printer, Store, ToggleLeft,
};

const CATEGORY_ORDER = ['core','services','automation','ai','communication','reporting','finance','ui'];
const CATEGORY_LABELS_FR = { core:'Modules de base', services:'Services', automation:'Automatisation', ai:'IA', communication:'Communication', reporting:'Rapports', finance:'Finance', ui:'Interface & Outils' };
const CATEGORY_LABELS_AR = { core:'الوحدات الأساسية', services:'الخدمات', automation:'الأتمتة', ai:'الذكاء الاصطناعي', communication:'التواصل', reporting:'التقارير', finance:'الماليات', ui:'الواجهة والأدوات' };

const MotherboardPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [overview, setOverview] = useState(null);
  const [modules, setModules] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [robotsData, setRobotsData] = useState(null);
  const [tenantHealth, setTenantHealth] = useState(null);
  const [features, setFeatures] = useState([]);
  const [togglingKey, setTogglingKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [logModule, setLogModule] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [historyModule, setHistoryModule] = useState(null);
  const [activeTab, setActiveTab] = useState('modules');

  const fetchData = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        apiClient.get('/diagnostics'),
        apiClient.get('/diagnostics/modules'),
        apiClient.get('/diagnostics/metrics'),
        apiClient.get('/diagnostics/robots'),
        apiClient.get('/diagnostics/tenant-health'),
        apiClient.get('/platform/features'),
      ]);
      if (results[0].status === 'fulfilled') setOverview(results[0].value.data);
      if (results[1].status === 'fulfilled') setModules(results[1].value.data.modules || []);
      if (results[2].status === 'fulfilled') setMetrics(results[2].value.data.metrics || {});
      if (results[3].status === 'fulfilled') setRobotsData(results[3].value.data);
      if (results[4].status === 'fulfilled') setTenantHealth(results[4].value.data);
      if (results[5].status === 'fulfilled') setFeatures(results[5].value.data.features || []);
    } catch (e) {
      toast.error(isAr ? 'تعذّر جلب حالة المكوّنات' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  const toggleFeature = async (key) => {
    setTogglingKey(key);
    try {
      const res = await apiClient.post(`/platform/features/${key}/toggle`);
      setFeatures(prev => prev.map(f => f.key === key ? { ...f, enabled: res.data.enabled } : f));
      toast.success(
        res.data.enabled
          ? (isAr ? `✅ تم تفعيل الميزة` : `✅ Fonctionnalité activée`)
          : (isAr ? `🔴 تم إيقاف الميزة` : `🔴 Fonctionnalité désactivée`)
      );
    } catch {
      toast.error(isAr ? 'فشل تغيير حالة الميزة' : 'Échec du changement');
    } finally {
      setTogglingKey(null);
    }
  };

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 15000);
    return () => clearInterval(t);
  }, [fetchData]);

  const openLogs = async (mod) => {
    setLogModule(mod);
    setLogLoading(true);
    setLogLines([]);
    try {
      const res = await apiClient.get(`/diagnostics/logs/${mod.key}?lines=200`);
      setLogLines(res.data.lines || []);
    } catch (e) {
      toast.error(isAr ? 'تعذّر جلب اللوغ' : 'Échec du chargement du journal');
    } finally {
      setLogLoading(false);
    }
  };

  const clearError = async (mod) => {
    try {
      await apiClient.post(`/diagnostics/modules/${mod.key}/clear-error`);
      toast.success(isAr ? 'تم مسح الخطأ وإعادة تعيين الدائرة' : 'Erreur effacée');
      fetchData();
    } catch (e) {
      toast.error(isAr ? 'تعذّر مسح الخطأ' : 'Échec');
    }
  };

  const resetCircuit = async (mod) => {
    try {
      await apiClient.post(`/diagnostics/modules/${mod.key}/reset-circuit`);
      toast.success('تم إعادة تعيين قاطع الدائرة');
      fetchData();
    } catch (e) {
      toast.error('فشل إعادة التعيين');
    }
  };

  const erroredCount = modules.filter(m => m.status === 'error').length;
  const degradedCount = modules.filter(m => m.status === 'degraded').length;
  const okCount = modules.length - erroredCount - degradedCount;

  const enabledFeatCount = features.filter(f => f.enabled).length;

  const tabs = [
    { id: 'modules',  label: isAr ? 'المكوّنات'  : 'Composants',       icon: Cpu },
    { id: 'metrics',  label: isAr ? 'المقاييس'   : 'Métriques',        icon: BarChart3 },
    { id: 'robots',   label: isAr ? 'الروبوتات'  : 'Robots',           icon: Bot },
    { id: 'tenants',  label: isAr ? 'المستأجرون' : 'Locataires',       icon: Users },
    { id: 'features', label: isAr ? 'الميزات'    : 'Fonctionnalités',  icon: ToggleLeft,
      badge: features.length ? `${enabledFeatCount}/${features.length}` : null },
  ];

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CircuitBoard className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">
                {isAr ? 'اللوحة الأم — مراقبة المكوّنات' : 'Carte mère — Surveillance'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? 'تشخيص ذاتي — كل مكوّن مستقل بلوغ وإحصائيات خاصة'
                  : 'Auto-diagnostic — composants indépendants avec métriques'}
              </p>
            </div>
          </div>
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 me-2" />
            {isAr ? 'تحديث' : 'Actualiser'}
          </Button>
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Activity className="h-4 w-4" />
              {isAr ? 'الحالة العامة' : 'État global'}
            </div>
            <div className="mt-2 text-xl font-bold">
              {overview?.status === 'ok'
                ? <span className="text-green-600">{isAr ? 'سليم' : 'OK'}</span>
                : <span className="text-amber-600">{isAr ? 'يحتاج انتباه' : 'Dégradé'}</span>}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Database className="h-4 w-4" />
              {isAr ? 'قاعدة البيانات' : 'Base de données'}
            </div>
            <div className="mt-2 text-xl font-bold">
              {overview?.database === 'ok'
                ? <span className="text-green-600">{isAr ? 'متصلة' : 'Connectée'}</span>
                : <span className="text-red-600">{isAr ? 'منقطعة' : 'Erreur'}</span>}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <CheckCircle2 className="h-4 w-4" />
              {isAr ? 'مكوّنات سليمة' : 'OK'}
            </div>
            <div className="mt-2 text-xl font-bold text-green-600">{okCount}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <AlertTriangle className="h-4 w-4" />
              {isAr ? 'أخطاء / منهكة' : 'Erreurs / Dégradés'}
            </div>
            <div className={`mt-2 text-xl font-bold ${(erroredCount + degradedCount) ? 'text-red-600' : 'text-muted-foreground'}`}>
              {erroredCount + degradedCount}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Clock className="h-4 w-4" />
              {isAr ? 'وقت التشغيل' : 'Uptime'}
            </div>
            <div className="mt-2 text-xl font-bold">
              {overview?.uptime_seconds
                ? `${Math.round(overview.uptime_seconds / 3600)}h`
                : '---'}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b pb-0 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.badge && (
                  <span className="ms-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-mono">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab: Components */}
        {activeTab === 'modules' && (
          loading ? (
            <div className="text-center py-12 text-muted-foreground">
              {isAr ? 'جارٍ التحميل...' : 'Chargement...'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {modules.map((mod) => {
                const isDegraded = mod.status === 'degraded';
                const hasError = mod.status === 'error';
                const borderCls = isDegraded
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
                  : hasError
                  ? 'border-red-400 bg-red-50 dark:bg-red-950/30'
                  : 'bg-card hover:border-primary/40';
                const m = metrics[mod.key] || {};

                return (
                  <div key={mod.key} className={`rounded-xl border p-4 transition-colors ${borderCls}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Cpu className={`h-5 w-5 flex-shrink-0 ${hasError ? 'text-red-500' : isDegraded ? 'text-amber-500' : 'text-primary'}`} />
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{isAr ? mod.name_ar : mod.name_fr}</div>
                          <div className="text-xs text-muted-foreground font-mono">{mod.key}</div>
                        </div>
                      </div>
                      {isDegraded ? (
                        <Badge className="bg-amber-500 hover:bg-amber-500 flex-shrink-0 text-white">
                          <ShieldOff className="h-3 w-3 me-1" /> منهك
                        </Badge>
                      ) : hasError ? (
                        <Badge variant="destructive" className="flex-shrink-0">
                          <XCircle className="h-3 w-3 me-1" /> {isAr ? 'خطأ' : 'Erreur'}
                        </Badge>
                      ) : (
                        <Badge className="bg-green-600 hover:bg-green-600 flex-shrink-0">
                          <CheckCircle2 className="h-3 w-3 me-1" /> {isAr ? 'سليم' : 'OK'}
                        </Badge>
                      )}
                    </div>

                    {/* Metrics mini row */}
                    {m.requests > 0 && (
                      <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                        <span><strong>{m.requests}</strong> طلب</span>
                        <span><strong>{m.avg_ms}ms</strong> متوسط</span>
                        {m.error_rate > 0 && <span className="text-red-500"><strong>{m.error_rate}%</strong> أخطاء</span>}
                      </div>
                    )}

                    {/* Circuit breaker */}
                    {mod.circuit?.open && (
                      <div className="mt-2 text-xs bg-amber-100 dark:bg-amber-900/30 rounded p-2 border border-amber-300 dark:border-amber-700">
                        <span className="text-amber-700 dark:text-amber-400 font-medium">
                          ⚡ قاطع الدائرة مفتوح — {mod.circuit.errors_in_window} أخطاء في ساعة
                        </span>
                      </div>
                    )}

                    {/* Last error */}
                    {(hasError || isDegraded) && mod.last_error && (
                      <div className="mt-2 text-xs bg-background/60 rounded-lg p-2 border border-red-200 dark:border-red-800">
                        <div className="font-mono text-red-600 break-words">
                          #{mod.last_error.error_id} — {mod.last_error.message?.slice(0, 80)}
                        </div>
                        <div className="text-muted-foreground mt-0.5 break-all">
                          {mod.last_error.method} {mod.last_error.path}
                        </div>
                        {mod.error_count > 1 && (
                          <div className="text-amber-600 mt-0.5 font-medium">
                            + {mod.error_count - 1} أخطاء أخرى
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between gap-1">
                      <span className="text-xs text-muted-foreground">
                        {mod.log_size_kb} KB
                      </span>
                      <div className="flex gap-1 flex-wrap justify-end">
                        {(hasError || isDegraded) && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                            onClick={() => clearError(mod)}>
                            {isAr ? 'مسح' : 'Effacer'}
                          </Button>
                        )}
                        {mod.circuit?.open && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-amber-600"
                            onClick={() => resetCircuit(mod)}>
                            إعادة الدائرة
                          </Button>
                        )}
                        {mod.error_count > 1 && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                            onClick={() => setHistoryModule(mod)}>
                            <History className="h-3 w-3 me-1" />
                            {isAr ? 'التاريخ' : 'Historique'}
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                          onClick={() => openLogs(mod)}>
                          <FileText className="h-3 w-3 me-1" />
                          {isAr ? 'لوغ' : 'Journal'}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Tab: Metrics */}
        {activeTab === 'metrics' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isAr ? 'مقاييس الطلبات في الذاكرة لكل مكوّن (تُصفَّر عند إعادة تشغيل الخادم)' : 'Métriques en mémoire par composant'}
            </p>
            {Object.keys(metrics).length === 0 ? (
              <div className="text-center text-muted-foreground py-12">لا توجد طلبات مسجّلة بعد</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(metrics)
                  .filter(([, m]) => m.requests > 0)
                  .sort(([, a], [, b]) => b.requests - a.requests)
                  .map(([key, m]) => {
                    const mod = modules.find(c => c.key === key);
                    return (
                      <Card key={key} className="border-primary/10">
                        <CardContent className="p-4">
                          <div className="font-semibold text-sm mb-2">
                            {mod ? (isAr ? mod.name_ar : mod.name_fr) : key}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                              <span className="text-muted-foreground">طلبات:</span>
                              <strong>{m.requests}</strong>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-purple-500" />
                              <span className="text-muted-foreground">متوسط:</span>
                              <strong>{m.avg_ms}ms</strong>
                            </div>
                            <div className="flex items-center gap-1">
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                              <span className="text-muted-foreground">أخطاء:</span>
                              <strong className={m.errors > 0 ? 'text-red-600' : ''}>{m.errors}</strong>
                            </div>
                            <div className="flex items-center gap-1">
                              <Activity className="h-3.5 w-3.5 text-amber-500" />
                              <span className="text-muted-foreground">معدل خطأ:</span>
                              <strong className={m.error_rate > 5 ? 'text-red-600' : ''}>{m.error_rate}%</strong>
                            </div>
                          </div>
                          {m.last_at && (
                            <div className="text-xs text-muted-foreground mt-2">
                              آخر طلب: {new Date(m.last_at).toLocaleTimeString('ar-DZ')}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Tab: Robots */}
        {activeTab === 'robots' && (
          <div className="space-y-4">
            {!robotsData ? (
              <div className="text-center text-muted-foreground py-12">لا توجد بيانات روبوتات</div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">الحالة</p>
                    <p className={`font-bold ${robotsData.is_running ? 'text-emerald-600' : 'text-red-500'}`}>
                      {robotsData.is_running ? 'تعمل' : 'متوقفة'}
                    </p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">المراقب</p>
                    <p className={`font-bold ${robotsData.watchdog_active ? 'text-blue-600' : 'text-red-500'}`}>
                      {robotsData.watchdog_active ? 'نشط' : 'غير نشط'}
                    </p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">حية / إجمالي</p>
                    <p className="font-bold">
                      {Object.values(robotsData.robots || {}).filter(r => r.task_alive !== false && r.is_running).length}
                      {' / '}
                      {Object.keys(robotsData.robots || {}).length}
                    </p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">آخر تشغيل سجّله</p>
                    <p className="font-bold text-xs">
                      {robotsData.recent_runs?.[0]?.started_at
                        ? new Date(robotsData.recent_runs[0].started_at).toLocaleTimeString('ar-DZ')
                        : '---'}
                    </p>
                  </CardContent></Card>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(robotsData.robots || {}).map(([name, r]) => (
                    <div key={name} className={`rounded-xl border p-4 ${!r.task_alive ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'bg-card'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-sm">{r.name}</span>
                        <Badge variant={r.is_running && r.task_alive !== false ? 'default' : 'destructive'} className="text-xs">
                          {r.is_running && r.task_alive !== false ? 'حي' : 'متعطّل'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>آخر تشغيل: {r.last_run ? new Date(r.last_run).toLocaleTimeString('ar-DZ') : '---'}</p>
                        <p>الفترة: كل {r.check_interval ? Math.round(r.check_interval / 60) : '?'} دقيقة</p>
                        <p>الفحوصات: {r.stats?.checks || 0}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {robotsData.recent_runs?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">آخر عمليات التشغيل</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1.5 max-h-48 overflow-auto">
                        {robotsData.recent_runs.map((run, i) => (
                          <div key={i} className="flex items-center justify-between text-xs border-b pb-1 last:border-0">
                            <div className="flex gap-2">
                              <span className="font-medium">{run.robot_name || run.robot}</span>
                              <Badge variant="outline" className="text-xs py-0 px-1">{run.triggered_by}</Badge>
                            </div>
                            <div className="text-muted-foreground flex gap-2">
                              <span>{run.duration_ms}ms</span>
                              <span>{new Date(run.started_at).toLocaleTimeString('ar-DZ')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab: Tenant Health */}
        {activeTab === 'tenants' && (
          <div className="space-y-4">
            {!tenantHealth || tenantHealth.message ? (
              <div className="text-center text-muted-foreground py-12">
                {tenantHealth?.message || 'لم يُجرَ فحص المستأجرين بعد — شغّل روبوت الصيانة'}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Server className="h-3.5 w-3.5" /> مستأجرون سليمون</p>
                    <p className="font-bold text-emerald-600 text-xl">{tenantHealth.healthy_count}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> مستأجرون بمشاكل</p>
                    <p className={`font-bold text-xl ${tenantHealth.unhealthy_count > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {tenantHealth.unhealthy_count}
                    </p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> آخر فحص</p>
                    <p className="font-bold text-xs">
                      {tenantHealth.checked_at ? new Date(tenantHealth.checked_at).toLocaleString('ar-DZ') : '---'}
                    </p>
                  </CardContent></Card>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(tenantHealth.tenants || []).map(t => (
                    <Card key={t.tenant_id} className="border-primary/10">
                      <CardContent className="p-4">
                        <div className="font-semibold text-sm mb-2 truncate">{t.name}</div>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span className="text-muted-foreground">منتجات:</span><strong>{t.products}</strong>
                          <span className="text-muted-foreground">مبيعات:</span><strong>{t.sales}</strong>
                          <span className="text-muted-foreground">عملاء:</span><strong>{t.customers}</strong>
                          <span className="text-muted-foreground">مبيعات 7أيام:</span>
                          <strong className={t.sales_last_7d === 0 ? 'text-amber-600' : 'text-emerald-600'}>
                            {t.sales_last_7d}
                          </strong>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {/* Tab: Feature Flags */}
        {activeTab === 'features' && (
          <div className="space-y-5">
            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{isAr ? 'ميزات مفعّلة' : 'Activées'}</p>
                <p className="font-bold text-emerald-600 text-xl">{enabledFeatCount}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-red-500" />{isAr ? 'ميزات موقوفة' : 'Désactivées'}</p>
                <p className={`font-bold text-xl ${features.length - enabledFeatCount > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {features.length - enabledFeatCount}
                </p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><ToggleLeft className="h-3.5 w-3.5" />{isAr ? 'الإجمالي' : 'Total'}</p>
                <p className="font-bold text-xl">{features.length}</p>
              </CardContent></Card>
            </div>

            {features.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {isAr ? 'جارٍ التحميل...' : 'Chargement...'}
              </div>
            ) : (
              CATEGORY_ORDER.map(cat => {
                const catFeats = features.filter(f => f.category === cat);
                if (!catFeats.length) return null;
                const catLabel = isAr ? CATEGORY_LABELS_AR[cat] : CATEGORY_LABELS_FR[cat];
                return (
                  <div key={cat}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                      <span className="h-px flex-1 bg-border" />
                      {catLabel}
                      <span className="h-px flex-1 bg-border" />
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {catFeats.map(feat => {
                        const FeatIcon = FEAT_ICON_MAP[feat.icon] || ToggleLeft;
                        const isToggling = togglingKey === feat.key;
                        return (
                          <div
                            key={feat.key}
                            className={`rounded-xl border p-4 flex items-start gap-3 transition-all ${
                              feat.enabled
                                ? 'bg-card border-border'
                                : 'bg-muted/30 border-dashed opacity-70'
                            }`}
                          >
                            <div className={`rounded-lg p-2 flex-shrink-0 ${feat.enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                              <FeatIcon className={`h-4 w-4 ${feat.enabled ? 'text-primary' : 'text-muted-foreground'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-sm font-semibold truncate ${!feat.enabled ? 'text-muted-foreground' : ''}`}>
                                  {isAr ? feat.name_ar : feat.name_fr}
                                </span>
                                <Switch
                                  checked={!!feat.enabled}
                                  onCheckedChange={() => !isToggling && toggleFeature(feat.key)}
                                  disabled={isToggling}
                                  className="flex-shrink-0 scale-90"
                                />
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                                {isAr ? feat.desc_ar : feat.desc_fr}
                              </p>
                              <div className="mt-1.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                                  feat.enabled
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                                    : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {feat.key}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Log viewer dialog */}
      <Dialog open={!!logModule} onOpenChange={o => !o && setLogModule(null)}>
        <DialogContent className="max-w-3xl" dir={isAr ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {logModule && (isAr ? logModule.name_ar : logModule.name_fr)} — logs/{logModule?.key}.log
            </DialogTitle>
          </DialogHeader>
          <div className="bg-zinc-950 text-zinc-100 rounded-lg p-3 max-h-[60vh] overflow-auto font-mono text-xs leading-relaxed" dir="ltr">
            {logLoading ? (
              <div className="text-zinc-400">Loading...</div>
            ) : logLines.length === 0 ? (
              <div className="text-zinc-500">{isAr ? '— لا توجد سجلات بعد —' : '— No logs yet —'}</div>
            ) : (
              logLines.map((line, i) => (
                <div key={i} className={`whitespace-pre-wrap break-all ${
                  line.includes('ERROR') ? 'text-red-400' : line.includes('WARNING') ? 'text-amber-300' : ''
                }`}>
                  {line}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Error history dialog */}
      <Dialog open={!!historyModule} onOpenChange={o => !o && setHistoryModule(null)}>
        <DialogContent className="max-w-2xl" dir={isAr ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {isAr ? 'سجل الأخطاء: ' : 'Historique: '}
              {historyModule && (isAr ? historyModule.name_ar : historyModule.name_fr)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-auto pt-2">
            {(historyModule?.error_history || []).map((err, i) => (
              <div key={i} className="border rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-red-600">#{err.error_id}</span>
                  <span className="text-muted-foreground">{err.time ? new Date(err.time).toLocaleString('ar-DZ') : ''}</span>
                </div>
                <div className="text-red-700 dark:text-red-400 break-words">{err.message}</div>
                <div className="text-muted-foreground mt-1">{err.method} {err.path}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default MotherboardPage;
