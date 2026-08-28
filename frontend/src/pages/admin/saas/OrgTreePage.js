import { useEffect, useState, useCallback } from 'react';
import apiClient from '../../../lib/apiClient';
import { errText } from '../../../lib/errorText';
import { Layout } from '../../../components/Layout';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Network, RefreshCw, Crown, Truck, Store, ChevronDown, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import { SaasPageHeader } from './SaasPageHeader';

/**
 * p345: شجرة الوحدات — سوبر أدمن ← وكلاء ← مشتركين.
 * كل مشترك تظهر بواباته الفعلية (خطة/تخصيص/افتراضي) مع تبديل مباشر للسوبر أدمن.
 */

const SOURCE_LABEL = { plan: 'خطة', override: 'تخصيص', default: 'افتراضي' };
const SOURCE_STYLE = {
  plan: 'bg-blue-50 text-blue-700',
  override: 'bg-purple-50 text-purple-700',
  default: 'bg-gray-100 text-gray-500',
};

const GateChip = ({ gate, info, optIn, onToggle, saving }) => {
  const on = info?.value;
  return (
    <button
      onClick={() => onToggle(gate, !on)}
      disabled={saving}
      title={`${gate} — ${SOURCE_LABEL[info?.source] || ''}${optIn ? ' — اختيارية' : ''}`}
      className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
        on
          ? optIn
            ? 'bg-amber-50 border-amber-300 text-amber-800'
            : 'bg-green-50 border-green-300 text-green-800'
          : 'bg-muted/40 border-muted text-muted-foreground'
      }`}
      data-testid={`gate-chip-${gate}`}
    >
      {gate}
      <span className={`ms-1 px-1 rounded text-[9px] ${SOURCE_STYLE[info?.source] || ''}`}>
        {SOURCE_LABEL[info?.source] || '؟'}
      </span>
    </button>
  );
};

const TenantNode = ({ tenant, gates, optIns, onToggle, saving }) => {
  const [open, setOpen] = useState(false);
  const onCount = Object.values(tenant.gates || {}).filter(g => g.value).length;
  return (
    <div className="border rounded-lg" data-testid={`tree-tenant-${tenant.short_id || tenant.id}`}>
      <button
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40 rounded-lg"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Store className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{tenant.company_name || tenant.name}</span>
          <span className="text-[10px] text-muted-foreground font-mono">{tenant.short_id}</span>
          {!tenant.is_active && <span className="text-[10px] px-1 rounded bg-red-100 text-red-700">معطل</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground">{onCount}/{gates.length} وحدة</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 flex flex-wrap gap-1.5 border-t" data-testid={`tree-gates-${tenant.short_id || tenant.id}`}>
          {gates.map(g => (
            <GateChip
              key={g.gate}
              gate={g.gate}
              info={tenant.gates?.[g.gate]}
              optIn={optIns.includes(g.gate)}
              onToggle={(gate, val) => onToggle(tenant, gate, val)}
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const OrgTreePage = () => {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchTree = useCallback(async () => {
    try {
      const res = await apiClient.get('/saas/org-tree');
      setTree(res.data);
    } catch (e) {
      toast.error(errText(e) || 'فشل تحميل الشجرة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  const toggleGate = async (tenant, gate, value) => {
    setSaving(true);
    try {
      const res = await apiClient.get(`/saas/tenants/${tenant.id}/features`);
      const overrides = { ...(res.data?.features_override || {}), [gate]: value };
      await apiClient.put(`/saas/tenants/${tenant.id}/features`, overrides);
      toast.success(`${gate}: ${value ? 'مفعّلة' : 'معطّلة'} — ${tenant.company_name || tenant.name}`);
      await fetchTree();
    } catch (e) {
      toast.error(errText(e) || 'فشل التبديل');
    } finally {
      setSaving(false);
    }
  };

  const agents = tree?.agents || [];
  const tenants = tree?.tenants || [];
  const gates = tree?.gates || [];
  const optIns = tree?.opt_in_gates || [];
  const agentIds = new Set(agents.map(a => a.id));
  const byAgent = {};
  const unassigned = [];
  tenants.forEach(t => {
    if (t.agent_id && agentIds.has(t.agent_id)) {
      (byAgent[t.agent_id] = byAgent[t.agent_id] || []).push(t);
    } else {
      unassigned.push(t);
    }
  });
  const roots = agents.filter(a => !a.parent_agent_id || !agentIds.has(a.parent_agent_id));
  const childrenOf = id => agents.filter(a => a.parent_agent_id === id);

  const AgentNode = ({ agent, depth }) => (
    <div className={depth > 0 ? 'ms-6 border-s-2 border-primary/20 ps-3' : ''} data-testid={`tree-agent-${agent.agent_code || agent.id}`}>
      <Card className="border-primary/30">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Truck className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">{agent.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground">{agent.agent_code}</span>
            <span className="text-[10px] px-1.5 rounded bg-blue-50 text-blue-700">مستوى {agent.level ?? '—'}</span>
            <span className="text-[11px] text-muted-foreground">{agent.tenant_count} مشترك</span>
            {agent.permissions?.can_toggle_features && (
              <span className="text-[10px] px-1.5 rounded bg-green-50 text-green-700">مفوَّض بالميزات</span>
            )}
            {!agent.is_active && <span className="text-[10px] px-1 rounded bg-red-100 text-red-700">معطل</span>}
          </div>
        </CardContent>
      </Card>
      <div className="mt-2 space-y-2 ms-4">
        {(byAgent[agent.id] || []).map(t => (
          <TenantNode key={t.id} tenant={t} gates={gates} optIns={optIns} onToggle={toggleGate} saving={saving} />
        ))}
      </div>
      {childrenOf(agent.id).map(sub => (
        <div key={sub.id} className="mt-3">
          <AgentNode agent={sub} depth={depth + 1} />
        </div>
      ))}
    </div>
  );

  return (
    <Layout>
      <div className="space-y-5" data-testid="org-tree-page">
        <SaasPageHeader
          titleAr="شجرة الوحدات"
          subtitleAr="سوبر أدمن ← وكلاء ← مشتركين — البوابات الفعلية لكل مشترك مع تبديل مباشر"
          icon={Network}
          extra={
            <Button variant="outline" onClick={() => { setLoading(true); fetchTree(); }} className="gap-2" data-testid="org-tree-refresh">
              <RefreshCw className="h-4 w-4" /> تحديث
            </Button>
          }
        />

        {/* super admin root */}
        <Card className="border-primary bg-primary/5" data-testid="tree-root">
          <CardContent className="p-3 flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <span className="font-bold">سوبر أدمن</span>
            <span className="text-xs text-muted-foreground">
              {agents.length} وكيل · {tenants.length} مشترك · {gates.length} بوابة
            </span>
          </CardContent>
        </Card>

        {loading && <div className="text-center text-muted-foreground py-8">جاري التحميل…</div>}

        <div className="space-y-4">
          {roots.map(a => <AgentNode key={a.id} agent={a} depth={0} />)}
        </div>

        {unassigned.length > 0 && (
          <div data-testid="tree-unassigned">
            <h2 className="text-sm font-bold text-muted-foreground mb-2 border-b pb-1">
              مشتركون بدون وكيل ({unassigned.length})
            </h2>
            <div className="space-y-2">
              {unassigned.map(t => (
                <TenantNode key={t.id} tenant={t} gates={gates} optIns={optIns} onToggle={toggleGate} saving={saving} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default OrgTreePage;
