import { useEffect, useState } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import apiClient from '../../../lib/apiClient';
import { Database, Server, MemoryStick, HardDrive, Cpu, AlertTriangle } from 'lucide-react';

const fmtBytes = (n) => {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
};

const PlatformCapacityCard = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await apiClient.get('/saas/platform-stats');
        if (mounted) setStats(res.data);
      } catch { /* silent */ }
    };
    load();
    const id = setInterval(load, 30000); // refresh every 30s
    return () => { mounted = false; clearInterval(id); };
  }, []);

  if (!stats) return null;
  const t = stats.tenants || {};
  const r = stats.resources || {};
  const mem = r.memory || {};
  const disk = r.disk || {};
  const sev = t.severity || 'ok';
  const sevColor = sev === 'critical' ? 'red' : sev === 'warning' ? 'amber' : 'emerald';

  return (
    <Card className="border-2" data-testid="platform-capacity-card">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              قدرة المنصّة
            </h3>
            <p className="text-xs text-muted-foreground">تحديث تلقائي كل 30 ثانية</p>
          </div>
          {sev !== 'ok' && (
            <div className={`inline-flex items-center gap-2 rounded-md bg-${sevColor}-100 dark:bg-${sevColor}-900/30 text-${sevColor}-800 dark:text-${sevColor}-200 px-3 py-1 text-sm`}>
              <AlertTriangle className="h-4 w-4" />
              {sev === 'critical' ? 'سعة المستأجرين تجاوزت 95%' : 'سعة المستأجرين تجاوزت 80%'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Tenant count */}
          <div className="rounded-lg border border-border p-3 bg-card" data-testid="capacity-tenants">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">المستأجرون</span>
              <Database className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold mt-1">
              {t.total ?? 0}
              {t.max != null && <span className="text-sm text-muted-foreground font-normal"> / {t.max}</span>}
            </p>
            {t.capacity_percent != null ? (
              <div className="mt-2">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full bg-${sevColor}-500 transition-all`}
                    style={{ width: `${Math.min(100, t.capacity_percent)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t.capacity_percent}% من السعة</p>
              </div>
            ) : (
              <p className="text-xs text-emerald-600 mt-2">♾️ غير محدود</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{t.active} نشط · {t.inactive} غير نشط</p>
          </div>

          {/* DB count */}
          <div className="rounded-lg border border-border p-3 bg-card" data-testid="capacity-databases">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">قواعد البيانات</span>
              <HardDrive className="h-4 w-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold mt-1">{stats.databases?.count ?? '—'}</p>
            <p className="text-xs text-muted-foreground mt-2">MongoDB databases</p>
          </div>

          {/* Memory */}
          <div className="rounded-lg border border-border p-3 bg-card" data-testid="capacity-memory">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">الذاكرة</span>
              <MemoryStick className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold mt-1">{mem.percent ?? '—'}%</p>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden mt-2">
              <div
                className={`h-full transition-all ${mem.percent >= 90 ? 'bg-red-500' : mem.percent >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${mem.percent ?? 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{fmtBytes(mem.used)} / {fmtBytes(mem.total)}</p>
          </div>

          {/* CPU + Disk */}
          <div className="rounded-lg border border-border p-3 bg-card" data-testid="capacity-cpu-disk">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">المعالج + القرص</span>
              <Cpu className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold mt-1">{r.cpu_percent != null ? `${r.cpu_percent}%` : '—'}</p>
            <p className="text-xs text-muted-foreground mt-2">المعالج</p>
            <p className="text-xs text-muted-foreground mt-1">القرص: {disk.percent != null ? `${disk.percent}%` : '—'} ({fmtBytes(disk.used)} / {fmtBytes(disk.total)})</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PlatformCapacityCard;
