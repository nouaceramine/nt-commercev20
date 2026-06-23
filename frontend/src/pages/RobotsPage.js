import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import apiClient from '../lib/apiClient';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Bot, Play, Square, RotateCcw, Activity, Package, Receipt, FileText,
  AlertTriangle, CheckCircle2, Clock, Zap, TrendingUp, ShieldAlert,
  RefreshCw, Users, Tag, Wrench, BarChart3, Shield, History, Timer,
  Wifi, WifiOff, Settings,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ROBOT_CONFIG = {
  inventory:        { icon: Package,     color: 'text-blue-500',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    gradient: 'from-blue-600 to-cyan-500' },
  debt:             { icon: Receipt,     color: 'text-amber-500',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   gradient: 'from-amber-500 to-orange-500' },
  report:           { icon: FileText,    color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', gradient: 'from-emerald-500 to-teal-500' },
  customer:         { icon: Users,       color: 'text-violet-500',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  gradient: 'from-violet-500 to-purple-500' },
  pricing:          { icon: Tag,         color: 'text-rose-500',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    gradient: 'from-rose-500 to-pink-500' },
  maintenance:      { icon: Wrench,      color: 'text-slate-500',   bg: 'bg-slate-500/10',   border: 'border-slate-500/20',   gradient: 'from-slate-500 to-gray-500' },
  profit:           { icon: TrendingUp,  color: 'text-green-500',   bg: 'bg-green-500/10',   border: 'border-green-500/20',   gradient: 'from-green-500 to-lime-500' },
  repair:           { icon: Wrench,      color: 'text-orange-500',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  gradient: 'from-orange-500 to-yellow-500' },
  prediction:       { icon: Zap,         color: 'text-cyan-500',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',    gradient: 'from-cyan-500 to-sky-500' },
  notification_bot: { icon: ShieldAlert, color: 'text-indigo-500',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  gradient: 'from-indigo-500 to-blue-500' },
  supplier:         { icon: Activity,    color: 'text-teal-500',    bg: 'bg-teal-500/10',    border: 'border-teal-500/20',    gradient: 'from-teal-500 to-green-500' },
  recharge_recovery:{ icon: RotateCcw,   color: 'text-yellow-500',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20',  gradient: 'from-yellow-500 to-amber-500' },
  commission:       { icon: BarChart3,   color: 'text-purple-500',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  gradient: 'from-purple-500 to-violet-500' },
  data_integrity:   { icon: Shield,      color: 'text-red-500',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     gradient: 'from-red-500 to-rose-500' },
};

const STAT_LABELS = {
  checks: 'الفحوصات', alerts_sent: 'التنبيهات', recommendations: 'التوصيات',
  predictions: 'التوقعات', reminders_sent: 'التذكيرات', overdue_found: 'ديون متأخرة',
  sms_sent: 'SMS', reports_generated: 'التقارير', segments_updated: 'شرائح',
  inactive_found: 'غير نشط', vip_found: 'VIP', slow_movers: 'بطيء البيع',
  margin_alerts: 'تنبيه هامش', records_cleaned: 'سجلات محذوفة',
  indexes_created: 'فهارس', health_checks: 'فحص صحة', tenant_dbs_checked: 'قواعد مستأجرين',
  sales_fixed: 'مبيعات مصلحة', negative_qty_fixed: 'كميات سالبة', duplicate_barcodes: 'باركود مكرر',
  sessions_closed: 'جلسات مغلقة', orphaned_records: 'سجلات يتيمة',
};

const STAT_ICONS = {
  checks: Activity, alerts_sent: AlertTriangle, recommendations: TrendingUp,
  predictions: Zap, reminders_sent: ShieldAlert, overdue_found: AlertTriangle,
  sms_sent: Zap, reports_generated: FileText, segments_updated: Users,
  inactive_found: AlertTriangle, vip_found: CheckCircle2, slow_movers: AlertTriangle,
  margin_alerts: AlertTriangle, records_cleaned: Activity,
  indexes_created: Zap, health_checks: CheckCircle2, tenant_dbs_checked: CheckCircle2,
  sales_fixed: Shield, negative_qty_fixed: Shield, duplicate_barcodes: AlertTriangle,
  sessions_closed: Clock, orphaned_records: AlertTriangle,
};

function fmtDuration(seconds) {
  if (!seconds) return '---';
  if (seconds < 3600) return `${Math.round(seconds / 60)} دقيقة`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ساعة`;
  return `${Math.round(seconds / 86400)} يوم`;
}

function StatBox({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
      <div className="p-1.5 rounded-md bg-primary/10">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

function IntervalDialog({ name, robot, open, onClose, onSave }) {
  const [seconds, setSeconds] = useState(robot?.check_interval || 3600);
  const presets = [
    { label: '30 دقيقة', val: 1800 },
    { label: 'ساعة', val: 3600 },
    { label: '6 ساعات', val: 21600 },
    { label: '12 ساعة', val: 43200 },
    { label: 'يوم', val: 86400 },
  ];
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" /> فترة تشغيل: {robot?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex flex-wrap gap-2">
            {presets.map(p => (
              <Button key={p.val} size="sm" variant={seconds === p.val ? 'default' : 'outline'}
                onClick={() => setSeconds(p.val)}>
                {p.label}
              </Button>
            ))}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">أو أدخل بالثواني</Label>
            <Input type="number" min={60} value={seconds}
              onChange={e => setSeconds(parseInt(e.target.value) || 60)}
              className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">= {fmtDuration(seconds)}</p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>إلغاء</Button>
            <Button size="sm" onClick={() => onSave(name, seconds)}>حفظ</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ name, robot, open, onClose, history }) {
  const myHistory = (history || []).filter(r => r.robot === name);
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> سجل تشغيل: {robot?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto space-y-2 pt-2">
          {myHistory.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد سجلات بعد</p>
          ) : myHistory.map((run, i) => (
            <div key={i} className="border rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs text-muted-foreground">
                  {new Date(run.started_at).toLocaleString('ar-DZ')}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{run.triggered_by}</Badge>
                  <span className="text-xs text-muted-foreground">{run.duration_ms}ms</span>
                </div>
              </div>
              {run.stats && Object.keys(run.stats).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(run.stats).map(([k, v]) => (
                    <span key={k} className="text-xs bg-muted px-2 py-0.5 rounded">
                      {STAT_LABELS[k] || k}: <strong>{v}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RobotCard({ name, robot, config, onRestart, onRun, onInterval, onHistory, loading }) {
  const Icon = config.icon;
  const isRunning = robot.is_running;
  const taskAlive = robot.task_alive !== false;
  const lastRun = robot.last_run
    ? new Date(robot.last_run).toLocaleString('ar-DZ', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '---';
  const stats = robot.stats || {};

  const statusColor = !isRunning ? 'bg-red-500/10 text-red-500 border-red-500/20'
    : !taskAlive ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
    : 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';

  const statusLabel = !isRunning ? 'متوقف' : !taskAlive ? 'تعطّل' : 'يعمل';

  return (
    <Card className={`relative overflow-hidden border ${config.border} transition-all duration-300 hover:shadow-lg`}
      data-testid={`robot-card-${name}`}>
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${config.gradient}`} />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${config.bg}`}>
              <Icon className={`h-5 w-5 ${config.color}`} />
            </div>
            <div>
              <CardTitle className="text-base">{robot.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {lastRun}
              </p>
              {robot.check_interval && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Timer className="h-3 w-3" /> كل {fmtDuration(robot.check_interval)}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className={`text-xs ${statusColor}`}
              data-testid={`robot-status-${name}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1.5 ${
                isRunning && taskAlive ? 'bg-emerald-500 animate-pulse' : isRunning ? 'bg-amber-500 animate-pulse' : 'bg-red-400'
              }`} />
              {statusLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.keys(stats).length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(stats).map(([key, val]) => (
              <StatBox key={key}
                label={STAT_LABELS[key] || key}
                value={val}
                icon={STAT_ICONS[key] || Activity}
              />
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="text-xs h-8"
            onClick={() => onRun(name)} disabled={loading}
            data-testid={`robot-run-${name}`}>
            <Play className="h-3.5 w-3.5 mr-1" /> تشغيل
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8"
            onClick={() => onRestart(name)} disabled={loading}
            data-testid={`robot-restart-${name}`}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> إعادة
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-8"
            onClick={() => onInterval(name)}>
            <Settings className="h-3.5 w-3.5 mr-1" /> الفترة
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-8"
            onClick={() => onHistory(name)}>
            <History className="h-3.5 w-3.5 mr-1" /> السجل
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RobotsPage() {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [intervalDialog, setIntervalDialog] = useState(null);
  const [historyDialog, setHistoryDialog] = useState(null);
  const navigate = useNavigate();

  const fetchStatus = useCallback(async () => {
    try {
      const [{ data: s }, { data: h }] = await Promise.all([
        apiClient.get('/robots/status'),
        apiClient.get('/robots/history?limit=50'),
      ]);
      setStatus(s);
      setHistory(h.runs || []);
    } catch (err) {
      console.error('Failed to fetch robot status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  const handleRun = async (name) => {
    setActionLoading(true);
    try {
      const { data } = await apiClient.post(`/robots/run/${name}`);
      toast.success(data.message);
      await fetchStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'فشل تشغيل الروبوت');
    } finally { setActionLoading(false); }
  };

  const handleRestart = async (name) => {
    setActionLoading(true);
    try {
      const { data } = await apiClient.post(`/robots/restart/${name}`);
      toast.success(data.message);
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'فشل إعادة تشغيل الروبوت');
    } finally { setActionLoading(false); }
  };

  const handleStopAll = async () => {
    setActionLoading(true);
    try {
      await apiClient.post('/robots/stop-all');
      toast.success('تم إيقاف جميع الروبوتات');
      await fetchStatus();
    } catch (err) {
      toast.error('فشل إيقاف الروبوتات');
    } finally { setActionLoading(false); }
  };

  const handleStartAll = async () => {
    setActionLoading(true);
    try {
      await apiClient.post('/robots/start-all');
      toast.success('تم تشغيل جميع الروبوتات');
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      toast.error('فشل تشغيل الروبوتات');
    } finally { setActionLoading(false); }
  };

  const handleSaveInterval = async (name, seconds) => {
    try {
      const { data } = await apiClient.post(`/robots/interval/${name}`, { interval_seconds: seconds });
      toast.success(data.message);
      setIntervalDialog(null);
      await fetchStatus();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'فشل تحديث الفترة');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]" data-testid="robots-loading">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      </Layout>
    );
  }

  const robots = status?.robots || {};
  const isSystemRunning = status?.is_running;
  const watchdogActive = status?.watchdog_active;
  const runningCount = Object.values(robots).filter(r => r.is_running).length;
  const aliveCount = Object.values(robots).filter(r => r.task_alive !== false && r.is_running).length;
  const totalChecks = Object.values(robots).reduce((s, r) => s + (r.stats?.checks || 0), 0);
  const startedAt = status?.started_at
    ? new Date(status.started_at).toLocaleString('ar-DZ', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '---';

  return (
    <Layout>
      <div className="space-y-6 p-1" data-testid="robots-dashboard">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              لوحة تحكم الروبوتات
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              مراقبة وإدارة الروبوتات الذكية — {Object.keys(robots).length} روبوت
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => navigate('/auto-reports')}
              data-testid="go-to-reports-btn">
              <BarChart3 className="h-3.5 w-3.5 mr-1" /> التقارير
            </Button>
            <Button size="sm" variant="ghost"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs ${autoRefresh ? 'text-emerald-600' : 'text-muted-foreground'}`}
              data-testid="toggle-auto-refresh">
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${autoRefresh ? 'animate-spin' : ''}`}
                style={autoRefresh ? { animationDuration: '3s' } : {}} />
              {autoRefresh ? 'تحديث تلقائي' : 'تحديث يدوي'}
            </Button>
            <Button size="sm" variant="outline" onClick={fetchStatus} disabled={actionLoading}
              data-testid="refresh-status">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> تحديث
            </Button>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="border-primary/20" data-testid="overview-status">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${isSystemRunning ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                {isSystemRunning ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertTriangle className="h-5 w-5 text-red-500" />}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">حالة النظام</p>
                <p className={`font-bold ${isSystemRunning ? 'text-emerald-600' : 'text-red-500'}`}>
                  {isSystemRunning ? 'يعمل' : 'متوقف'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="overview-watchdog">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${watchdogActive ? 'bg-blue-500/10' : 'bg-red-500/10'}`}>
                {watchdogActive ? <Wifi className="h-5 w-5 text-blue-500" /> : <WifiOff className="h-5 w-5 text-red-500" />}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المراقب التلقائي</p>
                <p className={`font-bold text-sm ${watchdogActive ? 'text-blue-600' : 'text-red-500'}`}>
                  {watchdogActive ? 'نشط' : 'غير نشط'}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="overview-active">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10">
                <Bot className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">نشطة / حية</p>
                <p className="font-bold">{aliveCount} / {Object.keys(robots).length}</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="overview-checks">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10">
                <Activity className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الفحوصات</p>
                <p className="font-bold">{totalChecks}</p>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="overview-started">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">بدأ في</p>
                <p className="font-bold text-xs">{startedAt}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Global Controls */}
        <div className="flex gap-2">
          {isSystemRunning ? (
            <Button variant="destructive" size="sm" onClick={handleStopAll}
              disabled={actionLoading} data-testid="stop-all-btn">
              <Square className="h-3.5 w-3.5 mr-1" /> إيقاف جميع الروبوتات
            </Button>
          ) : (
            <Button size="sm" onClick={handleStartAll} disabled={actionLoading}
              className="bg-emerald-600 hover:bg-emerald-700" data-testid="start-all-btn">
              <Play className="h-3.5 w-3.5 mr-1" /> تشغيل جميع الروبوتات
            </Button>
          )}
        </div>

        {/* Robot Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(robots).map(([name, robot]) => (
            <RobotCard
              key={name}
              name={name}
              robot={robot}
              config={ROBOT_CONFIG[name] || ROBOT_CONFIG.inventory}
              onRestart={handleRestart}
              onRun={handleRun}
              onInterval={(n) => setIntervalDialog(n)}
              onHistory={(n) => setHistoryDialog(n)}
              loading={actionLoading}
            />
          ))}
        </div>

        {/* Recent runs summary */}
        {history.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> آخر عمليات التشغيل
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 max-h-60 overflow-auto">
                {history.slice(0, 15).map((run, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border-b pb-1.5 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs py-0 px-1.5">
                        {ROBOT_CONFIG[run.robot]
                          ? (() => { const Ic = ROBOT_CONFIG[run.robot].icon; return <Ic className="h-3 w-3" />; })()
                          : null}
                        {run.robot_name || run.robot}
                      </Badge>
                      <span className="text-muted-foreground">{run.triggered_by}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{run.duration_ms}ms</span>
                      <span>{new Date(run.started_at).toLocaleString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Interval Dialog */}
      {intervalDialog && (
        <IntervalDialog
          name={intervalDialog}
          robot={robots[intervalDialog]}
          open={!!intervalDialog}
          onClose={() => setIntervalDialog(null)}
          onSave={handleSaveInterval}
        />
      )}

      {/* History Dialog */}
      {historyDialog && (
        <HistoryDialog
          name={historyDialog}
          robot={robots[historyDialog]}
          open={!!historyDialog}
          onClose={() => setHistoryDialog(null)}
          history={history}
        />
      )}
    </Layout>
  );
}
