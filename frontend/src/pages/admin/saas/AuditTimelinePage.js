import { errText } from '../../../lib/errorText';
import { useEffect, useState, useCallback } from 'react';
import apiClient from '../../../lib/apiClient';
import { Layout } from '../../../components/Layout';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Activity, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatShortDate } from '../../../utils/globalDateFormatter';
import { SaasPageHeader } from './SaasPageHeader';

export default function AuditTimelinePage() {
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState({ total: 0, by_type: {} });
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ type: '', tenant_id: '', since: '', until: '' });

  const load = useCallback(async (f = filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '300');
      if (f.type) params.append('event_type', f.type);
      if (f.tenant_id) params.append('tenant_id', f.tenant_id);
      if (f.since) params.append('since', f.since);
      if (f.until) params.append('until', f.until);
      const res = await apiClient.get(`/saas/audit-timeline?${params.toString()}`);
      setEvents(res.data?.events || []);
      setSummary(res.data?.summary || { total: 0, by_type: {} });
    } catch (e) {
      toast.error(errText(e) ||  'فشل تحميل سجل التدقيق');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="saas-audit-timeline-page">
        <SaasPageHeader
          titleAr="سجل التدقيق الموحّد"
          subtitleAr="خط زمني يجمع: عمليات الانتحال + تذكيرات الديون + شحن المحافظ — مفيد للتدقيق والامتثال (SOC2/GDPR)."
          icon={Activity}
          extra={
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} data-testid="refresh-audit-btn">
              <RefreshCw className={`h-4 w-4 me-1 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
          }
        />

        {/* Filters */}
        <Card data-testid="audit-filters-card">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">نوع الحدث</Label>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  data-testid="audit-filter-type"
                >
                  <option value="">الكل ({summary.total})</option>
                  <option value="impersonation">الانتحال ({summary.by_type?.impersonation || 0})</option>
                  <option value="reminder">التذكيرات ({summary.by_type?.reminder || 0})</option>
                  <option value="wallet_topup">شحن المحفظة ({summary.by_type?.wallet_topup || 0})</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">معرّف المستأجر (اختياري)</Label>
                <Input
                  placeholder="tenant_id..."
                  value={filters.tenant_id}
                  onChange={(e) => setFilters({ ...filters, tenant_id: e.target.value })}
                  data-testid="audit-filter-tenant"
                />
              </div>
              <div>
                <Label className="text-xs">من تاريخ</Label>
                <Input
                  type="date"
                  value={filters.since}
                  onChange={(e) => setFilters({ ...filters, since: e.target.value })}
                  data-testid="audit-filter-since"
                />
              </div>
              <div>
                <Label className="text-xs">إلى تاريخ</Label>
                <Input
                  type="date"
                  value={filters.until}
                  onChange={(e) => setFilters({ ...filters, until: e.target.value })}
                  data-testid="audit-filter-until"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={() => load(filters)} data-testid="audit-apply-btn">تطبيق الفلاتر</Button>
              <Button size="sm" variant="outline" onClick={() => {
                const cleared = { type: '', tenant_id: '', since: '', until: '' };
                setFilters(cleared);
                load(cleared);
              }} data-testid="audit-clear-btn">
                مسح
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
            ) : events.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground" data-testid="audit-empty">لا توجد أحداث.</div>
            ) : (
              <div className="divide-y divide-border" data-testid="audit-events-list">
                {events.map((ev) => {
                  const sevColor = ev.severity === 'critical' ? 'red' : ev.severity === 'warning' ? 'amber' : 'emerald';
                  const typeLabel =
                    ev.type === 'impersonation' ? '🔁 انتحال' :
                    ev.type === 'reminder' ? '🔔 تذكير' :
                    ev.type === 'wallet_topup' ? '💳 شحن محفظة' : ev.type;
                  return (
                    <div key={ev.id} className="p-3 hover:bg-muted/30 flex items-start gap-3" data-testid={`audit-event-${ev.id}`}>
                      <div className={`mt-1 w-2 h-2 rounded-full bg-${sevColor}-500 shrink-0`}></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{typeLabel}</span>
                          {ev.tenant_name && <span className="text-muted-foreground">·</span>}
                          {ev.tenant_name && <span className="text-foreground">{ev.tenant_name}</span>}
                          {ev.admin_email && <span className="text-muted-foreground">·</span>}
                          {ev.admin_email && <span className="text-xs text-muted-foreground font-mono">{ev.admin_email}</span>}
                        </div>
                        <p className="text-sm text-foreground mt-1">{ev.summary}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>🕐 {ev.timestamp ? formatShortDate(ev.timestamp) : '—'}</span>
                          {ev.ip && <span>🌐 {ev.ip}</span>}
                          {ev.details?.amount && <span>💰 {Number(ev.details.amount).toLocaleString('ar-DZ')} دج</span>}
                          {ev.details?.duration_seconds != null && (
                            <span>⏱️ {ev.details.duration_seconds < 60 ? `${ev.details.duration_seconds} ث` : `${Math.round(ev.details.duration_seconds / 60)} د`}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
