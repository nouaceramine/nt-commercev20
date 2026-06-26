import { Truck } from 'lucide-react';
import { Layout } from '../../../components/Layout';
import { SaasPageHeader } from './SaasPageHeader';
import { AgentsDashboard } from '../components/AgentsDashboard';

/**
 * AgentsPage — thin route-bound wrapper around the AgentsDashboard. The
 * dashboard is already a self-contained component; this file simply gives
 * /saas-admin/agents the standard SaaS chrome (per-tab title + back-to-
 * monitoring CTA) so it matches the other extracted sub-routes.
 */
export default function AgentsPage() {
  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="saas-agents-page">
        <SaasPageHeader
          titleAr="الوكلاء"
          subtitleAr="إدارة الوكلاء الموزّعين وعمولاتهم"
          icon={Truck}
        />
        <AgentsDashboard />
      </div>
    </Layout>
  );
}
