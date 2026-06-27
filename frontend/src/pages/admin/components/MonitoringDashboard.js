import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../lib/apiClient';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import {
  Users, Building, CreditCard, TrendingUp, Package,
  Clock, AlertTriangle, DollarSign, Truck, Bot, BarChart3,
  Database, Activity, Bell, ShieldCheck, Banknote, Boxes,
  Smartphone, Receipt, LayoutDashboard, Bug, FileText, Server
} from 'lucide-react';
import PlatformCapacityCard from './PlatformCapacityCard';
import { ServiceStatusMap } from './ServiceStatusMap';
import AIInsightsCard from './AIInsightsCard';
import HealthAlertsCard from './HealthAlertsCard';

const QUICK_LINKS = [
  { to: '/saas-admin/subscribers',       Icon: Users,         labelAr: 'المشتركين' },
  { to: '/saas-admin/agents',            Icon: Truck,         labelAr: 'الوكلاء' },
  { to: '/saas-admin/plans',             Icon: Package,       labelAr: 'الخطط' },
  { to: '/saas-admin/payments',          Icon: CreditCard,    labelAr: 'المدفوعات' },
  { to: '/saas-admin/platform-catalog',  Icon: Boxes,         labelAr: 'كتالوج IPTV' },
  { to: '/saas-admin/recharge-mgmt',     Icon: Smartphone,    labelAr: 'شحن الجوال' },
  { to: '/saas-admin/finance',           Icon: TrendingUp,    labelAr: 'التقارير المالية' },
  { to: '/saas-admin/databases',         Icon: Database,      labelAr: 'قواعد البيانات' },
  { to: '/saas-admin/alerts',            Icon: Bug,           labelAr: 'الأخطاء' },
  { to: '/saas-admin/withdrawals',       Icon: Banknote,      labelAr: 'طلبات السحب' },
  { to: '/saas-admin/ai-assistant',      Icon: Bot,           labelAr: 'المساعد الذكي' },
  { to: '/saas-admin/impersonation-logs',Icon: ShieldCheck,   labelAr: 'سجل الانتحال' },
  { to: '/saas-admin/default-pos-shortcuts', Icon: LayoutDashboard, labelAr: 'اختصارات POS' },
  { to: '/saas-admin/tenant-debts',      Icon: Receipt,       labelAr: 'ديون التجار' },
  { to: '/saas-admin/audit-timeline',    Icon: Activity,      labelAr: 'سجل التدقيق' },
];

export const MonitoringDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({});

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await apiClient.get('/saas/stats');
        if (mounted) setStats(res.data || {});
      } catch { /* silent */ }
    };
    load();
    const id = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return (
    <div className="space-y-6" data-testid="monitoring-dashboard">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Server className="h-8 w-8 text-primary" />
            لوحة المراقبة
          </h1>
          <p className="text-muted-foreground mt-1">
            نظرة شاملة على المنصّة: السعة، الموارد، حالة الخدمات، والمقاييس الأساسية.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => navigate('/robots')}
            className="gap-2"
            data-testid="go-to-robots-btn"
          >
            <Bot className="h-4 w-4" />
            الروبوتات الذكية
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/auto-reports')}
            className="gap-2"
            data-testid="go-to-reports-btn"
          >
            <BarChart3 className="h-4 w-4" />
            التقارير التلقائية
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/saas-admin/system-logs')}
            className="gap-2"
            data-testid="go-to-system-logs-btn"
          >
            <AlertTriangle className="h-4 w-4" />
            سجل الأخطاء
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/saas-admin/supplier')}
            className="gap-2"
            data-testid="go-to-supplier-btn"
          >
            <Package className="h-4 w-4" />
            المنصة كمورد
          </Button>
        </div>
      </div>

      {/* Basic Stats — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card data-testid="stat-total-tenants"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المشتركين</p>
              <p className="text-2xl font-bold">{stats.total_tenants || 0}</p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </CardContent></Card>
        <Card data-testid="stat-active-tenants"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">نشط</p>
              <p className="text-2xl font-bold text-green-600">{stats.active_tenants || 0}</p>
            </div>
            <Activity className="h-8 w-8 text-green-500" />
          </div>
        </CardContent></Card>
        <Card data-testid="stat-trial-tenants"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">تجريبي</p>
              <p className="text-2xl font-bold text-blue-600">{stats.trial_tenants || 0}</p>
            </div>
            <Clock className="h-8 w-8 text-blue-500" />
          </div>
        </CardContent></Card>
        <Card data-testid="stat-expiring-soon"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">ينتهي قريباً</p>
              <p className="text-2xl font-bold text-amber-600">{stats.expiring_soon || 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-amber-500" />
          </div>
        </CardContent></Card>
        <Card data-testid="stat-monthly-revenue"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">إيراد الشهر</p>
              <p className="text-2xl font-bold">{(stats.monthly_revenue || 0).toLocaleString()}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-500" />
          </div>
        </CardContent></Card>
        <Card data-testid="stat-total-revenue"><CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الإيراد</p>
              <p className="text-2xl font-bold">{(stats.total_revenue || 0).toLocaleString()}</p>
            </div>
            <DollarSign className="h-8 w-8 text-primary" />
          </div>
        </CardContent></Card>
      </div>

      {/* AI-Powered Platform Insights (iter 18.2) */}
      <AIInsightsCard />

      {/* Health Score Alerts (iter 18.4) */}
      <HealthAlertsCard />

      {/* Platform Capacity */}
      <PlatformCapacityCard />

      {/* Service Status Map */}
      <ServiceStatusMap />

      {/* Quick Links */}
      <Card data-testid="quick-links-card">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-primary" />
              روابط سريعة
            </h3>
            <p className="text-xs text-muted-foreground">جميع الأقسام متاحة أيضاً من القائمة الجانبية</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {QUICK_LINKS.map(({ to, Icon, labelAr }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                className="group flex items-center gap-2 rounded-lg border border-border bg-card hover:bg-muted/40 p-3 text-start transition-colors"
                data-testid={`quick-link-${to.replace('/saas-admin/', '')}`}
              >
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-medium truncate">{labelAr}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MonitoringDashboard;
