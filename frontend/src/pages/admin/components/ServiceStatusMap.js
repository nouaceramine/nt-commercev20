import { useEffect, useState } from 'react';
import { Card, CardContent } from '../../../components/ui/card';
import apiClient from '../../../lib/apiClient';
import { Server, Database, Zap, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';

const STATUS_META = {
  ok: { color: 'emerald', Icon: CheckCircle2, labelAr: 'يعمل', labelFr: 'En ligne' },
  down: { color: 'red', Icon: XCircle, labelAr: 'متوقّف', labelFr: 'Hors ligne' },
  disabled: { color: 'slate', Icon: MinusCircle, labelAr: 'معطّل', labelFr: 'Désactivé' },
};

const ICON_BY_KEY = { backend: Server, mongodb: Database, redis: Zap };

const ORDER = ['backend', 'mongodb', 'redis'];

export const ServiceStatusMap = () => {
  const [services, setServices] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await apiClient.get('/saas/platform-stats');
        if (!mounted) return;
        setServices(res.data?.services || {});
        setUpdatedAt(new Date());
      } catch { /* silent */ }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  if (!services) return null;

  return (
    <Card data-testid="service-status-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              حالة الخدمات
            </h3>
            <p className="text-xs text-muted-foreground">
              تحديث تلقائي كل 30 ثانية
              {updatedAt ? ` · آخر تحديث ${updatedAt.toLocaleTimeString('ar-DZ')}` : ''}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {ORDER.map((key) => {
            const svc = services[key];
            if (!svc) return null;
            const meta = STATUS_META[svc.status] || STATUS_META.disabled;
            const Icon = ICON_BY_KEY[key] || Server;
            const StatusIcon = meta.Icon;
            return (
              <div
                key={key}
                className={`rounded-lg border border-border p-3 bg-card flex items-center gap-3`}
                data-testid={`service-${key}`}
              >
                <div className={`h-10 w-10 rounded-full bg-${meta.color}-100 dark:bg-${meta.color}-900/30 flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 text-${meta.color}-600 dark:text-${meta.color}-400`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{svc.label || key}</p>
                  <p className={`text-xs text-${meta.color}-600 dark:text-${meta.color}-400 flex items-center gap-1 mt-0.5`}>
                    <StatusIcon className="h-3 w-3" />
                    {meta.labelAr}
                  </p>
                  {svc.error && (
                    <p className="text-[10px] text-muted-foreground mt-1 truncate" title={svc.error}>
                      {svc.error}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default ServiceStatusMap;
