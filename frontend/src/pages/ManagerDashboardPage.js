import _React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  RefreshCw, TrendingUp, Wallet, PackageX, CreditCard, ListTodo,
  AlertTriangle, ArrowLeft, ShoppingCart, Package, BarChart3, HandCoins, Truck, Store,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

// M11: Manager PWA dashboard (لوحة المدير) — mobile-first KPI cockpit.
// Read-only aggregation over existing endpoints; safe to poll.
const ManagerDashboardPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const cur = isAr ? 'دج' : 'DA';

  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [sales, setSales] = useState(null);
  const [profit, setProfit] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [debts, setDebts] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [chart, setChart] = useState([]);

  const fmt = (n) => `${(Number(n) || 0).toLocaleString(isAr ? 'ar-DZ' : 'fr-DZ', { maximumFractionDigits: 0 })} ${cur}`;

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [s, p, a, d, t, c] = await Promise.allSettled([
        apiClient.get('/dashboard/sales-stats'),
        apiClient.get('/dashboard/profit-stats'),
        apiClient.get('/dashboard/alerts'),
        apiClient.get('/debts/summary'),
        apiClient.get('/tasks/stats/summary'),
        apiClient.get('/dashboard/sales-chart'),
      ]);
      if (s.status === 'fulfilled') setSales(s.value.data);
      if (p.status === 'fulfilled') setProfit(p.value.data);
      if (a.status === 'fulfilled') setAlerts(Array.isArray(a.value.data) ? a.value.data : []);
      if (d.status === 'fulfilled') setDebts(d.value.data);
      if (t.status === 'fulfilled') setTasks(t.value.data);
      if (c.status === 'fulfilled') setChart(Array.isArray(c.value.data) ? c.value.data : []);
      setRefreshedAt(new Date());
    } catch (_e) {
      toast.error(isAr ? 'فشل تحميل المؤشرات' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    const iv = setInterval(() => loadAll(true), 60000);
    return () => clearInterval(iv);
  }, [loadAll]);

  const lowStockCount = alerts.filter(a => a.type === 'low_stock').length;
  const kpis = [
    { id: 'today',   label: isAr ? 'مبيعات اليوم' : "Ventes du jour",   value: fmt(sales?.today?.total),   sub: isAr ? `${sales?.today?.count || 0} عملية` : `${sales?.today?.count || 0} ventes`, icon: TrendingUp, tone: 'text-green-600' },
    { id: 'month',   label: isAr ? 'مبيعات الشهر' : 'Ventes du mois',   value: fmt(sales?.month?.total),   sub: isAr ? `${sales?.month?.count || 0} عملية` : `${sales?.month?.count || 0} ventes`, icon: Store, tone: 'text-blue-600' },
    { id: 'profit',  label: isAr ? 'ربح الشهر' : 'Profit du mois',     value: fmt(profit?.monthly_profit), sub: isAr ? `مصاريف ${fmt(profit?.monthly_expenses)}` : `Dép. ${fmt(profit?.monthly_expenses)}`, icon: Wallet, tone: (profit?.monthly_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600' },
    { id: 'debts',   label: isAr ? 'ديون معلقة' : 'Dettes en cours',   value: fmt(debts?.total_outstanding), sub: isAr ? `${debts?.customers_with_debt || 0} زبون` : `${debts?.customers_with_debt || 0} clients`, icon: CreditCard, tone: 'text-orange-600' },
    { id: 'stock',   label: isAr ? 'مخزون منخفض' : 'Stock faible',     value: String(lowStockCount),       sub: isAr ? 'منتج تحت الحد' : 'produits sous le seuil', icon: PackageX, tone: lowStockCount > 0 ? 'text-red-600' : 'text-gray-500' },
    { id: 'tasks',   label: isAr ? 'مهام معلقة' : 'Tâches en attente', value: String(tasks?.pending || 0), sub: isAr ? `${tasks?.in_progress || 0} قيد التنفيذ` : `${tasks?.in_progress || 0} en cours`, icon: ListTodo, tone: 'text-violet-600' },
  ];

  const quickLinks = [
    { to: '/pos',             icon: ShoppingCart, ar: 'نقطة البيع',   fr: 'Caisse' },
    { to: '/sales',           icon: BarChart3,    ar: 'المبيعات',     fr: 'Ventes' },
    { to: '/products',        icon: Package,      ar: 'المنتجات',     fr: 'Produits' },
    { to: '/cod-settlements', icon: HandCoins,    ar: 'مصالحة COD',   fr: 'Règlements COD' },
    { to: '/van-sales',       icon: Truck,        ar: 'البيع المتجول', fr: 'Vente mobile' },
    { to: '/reports',         icon: BarChart3,    ar: 'التقارير',     fr: 'Rapports' },
  ];

  return (
    <Layout>
      <div dir={isAr ? 'rtl' : 'ltr'} className="max-w-3xl mx-auto space-y-4" data-testid="manager-dashboard">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">{isAr ? 'لوحة المدير' : 'Tableau manager'}</h1>
            <p className="text-xs text-muted-foreground" data-testid="manager-refreshed-at">
              {refreshedAt ? (isAr ? `آخر تحديث ${refreshedAt.toLocaleTimeString('ar-DZ')}` : `Màj ${refreshedAt.toLocaleTimeString('fr-FR')}`) : '…'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadAll()} disabled={loading} data-testid="manager-refresh-btn">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="mr-1">{isAr ? 'تحديث' : 'Actualiser'}</span>
          </Button>
        </div>

        {/* KPI grid — 2 cols on mobile, 3 on desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3" data-testid="manager-kpi-grid">
          {kpis.map(k => (
            <Card key={k.id} data-testid={`manager-kpi-${k.id}`}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                  <k.icon className={`h-4 w-4 ${k.tone}`} />
                </div>
                <div className={`text-lg sm:text-xl font-bold mt-1 ${k.tone}`}>{k.value}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Weekly chart */}
        <Card data-testid="manager-chart-card">
          <CardContent className="p-3 sm:p-4">
            <div className="text-sm font-semibold mb-2">{isAr ? 'مبيعات الأسبوع' : 'Ventes de la semaine'}</div>
            <div className="h-40" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} width={40} />
                  <Tooltip formatter={(v) => [fmt(v), isAr ? 'المبيعات' : 'Ventes']} />
                  <Bar dataKey="sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card data-testid="manager-alerts-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-semibold">{isAr ? 'تنبيهات' : 'Alertes'}</span>
              <Badge variant="secondary" data-testid="manager-alerts-count">{alerts.length}</Badge>
            </div>
            {alerts.length === 0 ? (
              <p className="text-xs text-muted-foreground">{isAr ? 'لا تنبيهات حالياً' : 'Aucune alerte'}</p>
            ) : (
              <ul className="space-y-1.5" data-testid="manager-alerts-list">
                {alerts.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-xs border rounded-md px-2 py-1.5">
                    <span className="truncate">{a.message}</span>
                    <Badge variant={a.priority === 'high' ? 'destructive' : 'secondary'} className="shrink-0">
                      {a.priority === 'high' ? (isAr ? 'عاجل' : 'Urgent') : (isAr ? 'عادي' : 'Normal')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Quick actions — big touch targets */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2" data-testid="manager-quick-links">
          {quickLinks.map(q => (
            <Link key={q.to} to={q.to} data-testid={`manager-link-${q.to.slice(1)}`}>
              <Card className="hover:bg-accent transition-colors">
                <CardContent className="p-3 flex flex-col items-center gap-1.5">
                  <q.icon className="h-5 w-5 text-primary" />
                  <span className="text-[11px] text-center leading-tight">{isAr ? q.ar : q.fr}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="flex justify-center pb-2">
          <Link to="/" className="text-xs text-muted-foreground flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" />{isAr ? 'العودة للوحة الكاملة' : 'Tableau complet'}
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default ManagerDashboardPage;
