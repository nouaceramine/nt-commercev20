import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Activity, Building } from 'lucide-react';

/**
 * Common per-page header used by every SaaS sub-route (Subscribers, Plans,
 * Payments, TenantDebts, AuditTimeline …). Provides the title/subtitle and
 * the "back to monitoring" CTA so each tab page has identical chrome.
 */
export const SaasPageHeader = ({ titleAr, subtitleAr, icon: Icon = Building, extra = null }) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Icon className="h-7 w-7 text-primary" />
          {titleAr}
        </h1>
        {subtitleAr ? (
          <p className="text-muted-foreground mt-1 text-sm">{subtitleAr}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {extra}
        <Button
          variant="outline"
          onClick={() => navigate('/saas-admin')}
          className="gap-2"
          data-testid="back-to-monitoring-btn"
        >
          <Activity className="h-4 w-4" />
          العودة للمراقبة
        </Button>
      </div>
    </div>
  );
};

export default SaasPageHeader;
