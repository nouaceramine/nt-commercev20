/**
 * HealthAlertsCard — Lists recent Health Score alerts for the super-admin
 * with resolve buttons. Auto-displays when there are open alerts.
 */
import { useEffect, useState } from 'react';
import apiClient from '../../../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

export default function HealthAlertsCard() {
  const [data, setData] = useState({ items: [], open_count: 0 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/saas/health-alerts?limit=20');
      setData(res.data);
    } catch {
      setData({ items: [], open_count: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resolve = async (alertId) => {
    try {
      await apiClient.post(`/saas/health-alerts/${alertId}/resolve`);
      toast.success('تم تأشير التنبيه كمحلول');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل تحديث الحالة');
    }
  };

  if (loading) {
    return (
      <Card data-testid="health-alerts-loading">
        <CardContent className="p-4 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> جارٍ تحميل التنبيهات...
        </CardContent>
      </Card>
    );
  }

  // No alerts: render small all-clear strip
  if (data.items.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/50" data-testid="health-alerts-all-clear">
        <CardContent className="p-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span className="text-emerald-800">لا توجد تنبيهات على صحة المنصة — كل المؤشرات سليمة.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={data.open_count > 0 ? 'border-amber-300' : ''} data-testid="health-alerts-card">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600" />
          تنبيهات صحة المنصة
          {data.open_count > 0 && (
            <Badge className="bg-amber-100 text-amber-800">{data.open_count} مفتوحة</Badge>
          )}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load}>تحديث</Button>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {data.items.map((a) => {
            const id = a._id || a.id || a.created_at;
            const isCritical = a.severity === 'critical';
            const open = !a.resolved_at;
            return (
              <li
                key={id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  isCritical
                    ? 'border-rose-200 bg-rose-50/50'
                    : 'border-amber-200 bg-amber-50/50'
                } ${!open ? 'opacity-60' : ''}`}
                data-testid={`health-alert-${a.severity}`}
              >
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${isCritical ? 'text-rose-600' : 'text-amber-600'}`} />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={isCritical ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}>
                      {isCritical ? 'حرج' : 'تحذير'}
                    </Badge>
                    <span className="font-semibold">درجة {a.score}/100</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.created_at).toLocaleString('ar-DZ')}
                    </span>
                    {!open && (
                      <Badge variant="outline" className="text-xs">محلول</Badge>
                    )}
                  </div>
                  {a.headline && <div className="text-sm">{a.headline}</div>}
                  {(a.risks || []).length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      مخاطر: {a.risks.slice(0, 2).join(' • ')}
                    </div>
                  )}
                </div>
                {open && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resolve(id)}
                    data-testid={`resolve-alert-btn`}
                  >
                    <CheckCircle2 className="w-3 h-3 ml-1" />
                    أُقِرّ
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
