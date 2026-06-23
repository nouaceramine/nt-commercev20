import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { useDateFormat } from '../contexts/DateFormatContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, Banknote, TrendingUp, TrendingDown, Package,
  Receipt, AlertTriangle, Calendar, RefreshCw, Equal, ArrowRight, ArrowLeft,
  CreditCard, Wallet,
} from 'lucide-react';

export default function DailyReportPage() {
  const { language, isRTL } = useLanguage();
  const { formatCurrency } = useDateFormat();
  const ar = language === 'ar';

  const [loading, setLoading] = useState(true);
  const [salesStats, setSalesStats] = useState({ today: { total: 0, count: 0 }, month: { total: 0, count: 0 } });
  const [profitStats, setProfitStats] = useState({ monthly_revenue: 0, monthly_expenses: 0, monthly_profit: 0 });
  const [cashBoxes, setCashBoxes] = useState([]);
  const [stats, setStats] = useState({ low_stock_count: 0, total_products: 0, total_customers: 0 });
  const [todayExpenses, setTodayExpenses] = useState(0);
  const [todaySales, setTodaySales] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const [salesRes, profitRes, cashRes, statsRes, expRes, salesListRes] = await Promise.allSettled([
        apiClient.get('/dashboard/sales-stats'),
        apiClient.get('/dashboard/profit-stats'),
        apiClient.get('/cash-boxes'),
        apiClient.get('/stats'),
        apiClient.get(`/expenses?start_date=${today}&end_date=${today}`),
        apiClient.get(`/sales?date=${today}&limit=10`),
      ]);

      if (salesRes.status === 'fulfilled' && salesRes.value.data) setSalesStats(salesRes.value.data);
      if (profitRes.status === 'fulfilled' && profitRes.value.data) setProfitStats(profitRes.value.data);
      if (cashRes.status === 'fulfilled') setCashBoxes(cashRes.value.data || []);
      if (statsRes.status === 'fulfilled' && statsRes.value.data) setStats(statsRes.value.data);
      if (expRes.status === 'fulfilled') {
        const expenses = expRes.value.data || [];
        setTodayExpenses(expenses.reduce((sum, e) => sum + (e.amount || 0), 0));
      }
      if (salesListRes.status === 'fulfilled') setTodaySales(salesListRes.value.data || []);
      setLastUpdated(new Date());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date();
  const todayStr = today.toLocaleDateString(ar ? 'ar-DZ' : 'fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const totalCash = cashBoxes.reduce((sum, b) => sum + (b.balance || 0), 0);
  const todayRevenue = salesStats.today?.total || 0;
  const todayProfit = todayRevenue - todayExpenses;
  const monthProfit = profitStats.monthly_profit || 0;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  const Arrow = () => ar ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" dir={ar ? 'rtl' : 'ltr'}>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Calendar className="h-7 w-7 text-primary" />
              </div>
              {ar ? 'التقرير اليومي' : 'Rapport Journalier'}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">{todayStr}</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchAll} className="gap-2 self-start sm:self-auto">
            <RefreshCw className="h-4 w-4" />
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                {lastUpdated.toLocaleTimeString(ar ? 'ar-DZ' : 'fr-FR', { timeStyle: 'short' })}
              </span>
            )}
          </Button>
        </div>

        {/* ── Today's Sales KPIs ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {ar ? 'مبيعات اليوم' : "Ventes d'aujourd'hui"}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: ar ? 'إجمالي المبيعات' : 'Total des ventes',
                value: `${formatCurrency(todayRevenue)} DA`,
                icon: ShoppingCart, color: 'emerald',
                sub: `${salesStats.today?.count || 0} ${ar ? 'عملية' : 'opérations'}`,
              },
              {
                label: ar ? 'المبلغ المحصّل' : 'Montant encaissé',
                value: `${formatCurrency(
                  todaySales.reduce((s, x) => s + (x.paid_amount || 0), 0)
                )} DA`,
                icon: Banknote, color: 'blue',
                sub: ar ? 'نقداً + بنك' : 'Cash + Virement',
              },
              {
                label: ar ? 'ديون اليوم' : "Créances du jour",
                value: `${formatCurrency(
                  todaySales.reduce((s, x) => s + (x.remaining || 0), 0)
                )} DA`,
                icon: CreditCard, color: 'amber',
                sub: `${todaySales.filter(x => x.remaining > 0).length} ${ar ? 'زبون' : 'clients'}`,
              },
              {
                label: ar ? 'مصاريف اليوم' : "Dépenses du jour",
                value: `${formatCurrency(todayExpenses)} DA`,
                icon: TrendingDown, color: 'red',
                sub: ar ? 'إجمالي المصاريف' : 'Total dépenses',
              },
            ].map(({ label, value, icon: Icon, color, sub }) => (
              <Card key={label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className={`p-2 rounded-lg bg-${color}-100 dark:bg-${color}-950/30 w-fit mb-2`}>
                    <Icon className={`h-4 w-4 text-${color}-600`} />
                  </div>
                  <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                  <p className={`text-xl font-bold text-${color}-600`}>{value}</p>
                  {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ── Profit ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Today profit */}
          <Card className={`border-0 shadow-sm border-l-4 ${todayProfit >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Equal className={`h-4 w-4 ${todayProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                <span className="text-xs text-muted-foreground font-medium">
                  {ar ? 'صافي ربح اليوم' : "Bénéfice net d'aujourd'hui"}
                </span>
              </div>
              <p className={`text-2xl font-bold ${todayProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {todayProfit >= 0 ? '+' : ''}{formatCurrency(todayProfit)} DA
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {ar ? 'مبيعات - مصاريف' : 'Ventes - Dépenses'}
              </p>
            </CardContent>
          </Card>

          {/* Month sales */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-muted-foreground font-medium">
                  {ar ? 'مبيعات الشهر' : 'Ventes du mois'}
                </span>
              </div>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(salesStats.month?.total || 0)} DA
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {salesStats.month?.count || 0} {ar ? 'عملية' : 'opérations'}
              </p>
            </CardContent>
          </Card>

          {/* Month profit */}
          <Card className={`border-0 shadow-sm border-l-4 ${monthProfit >= 0 ? 'border-l-purple-500' : 'border-l-red-500'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-4 w-4 text-purple-600" />
                <span className="text-xs text-muted-foreground font-medium">
                  {ar ? 'ربح الشهر' : 'Bénéfice mensuel'}
                </span>
              </div>
              <p className={`text-2xl font-bold ${monthProfit >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                {monthProfit >= 0 ? '+' : ''}{formatCurrency(monthProfit)} DA
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {ar ? 'بعد المصاريف والمشتريات' : 'Après dépenses et achats'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Cash boxes ── */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Banknote className="h-4 w-4 text-primary" />
                {ar ? 'الصناديق النقدية' : 'Caisses enregistreuses'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cashBoxes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{ar ? 'لا توجد صناديق' : 'Aucune caisse'}</p>
              ) : (
                <>
                  {cashBoxes.map(box => (
                    <div key={box.id} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                      <span className="text-sm font-medium">{box.name}</span>
                      <span className={`font-bold text-sm ${(box.balance || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatCurrency(box.balance || 0)} DA
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 border-t font-semibold">
                    <span className="text-sm">{ar ? 'الإجمالي' : 'Total'}</span>
                    <span className="text-primary">{formatCurrency(totalCash)} DA</span>
                  </div>
                </>
              )}
              <Link to="/cash">
                <Button variant="ghost" size="sm" className="w-full mt-1 gap-1 text-muted-foreground">
                  {ar ? 'إدارة الصناديق' : 'Gérer les caisses'} <Arrow />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* ── Today's Sales List ── */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                {ar ? 'آخر مبيعات اليوم' : "Dernières ventes d'aujourd'hui"}
                <Badge variant="secondary" className="ms-auto">{todaySales.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todaySales.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {ar ? 'لا توجد مبيعات اليوم بعد' : "Pas encore de ventes aujourd'hui"}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {todaySales.map(sale => (
                    <div key={sale.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 transition-colors text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{sale.invoice_number}</span>
                      <span className="flex-1 truncate text-muted-foreground">
                        {sale.customer_name || (ar ? 'عابر' : 'Client')}
                      </span>
                      <span className="font-semibold text-primary">{sale.total?.toFixed(2)} DA</span>
                      {sale.remaining > 0.01 && (
                        <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1">
                          {ar ? 'دين' : 'Crédit'}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <Link to="/sales">
                <Button variant="ghost" size="sm" className="w-full mt-2 gap-1 text-muted-foreground">
                  {ar ? 'كل المبيعات' : 'Toutes les ventes'} <Arrow />
                </Button>
              </Link>
            </CardContent>
          </Card>

        </div>

        {/* ── Quick links ── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {ar ? 'وصول سريع' : 'Accès rapide'}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { to: '/pos', icon: ShoppingCart, label: ar ? 'نقطة البيع' : 'Point de Vente', color: 'primary' },
              { to: '/expenses', icon: TrendingDown, label: ar ? 'المصاريف' : 'Dépenses', color: 'red' },
              { to: '/customer-debts', icon: CreditCard, label: ar ? 'ديون الزبائن' : 'Dettes clients', color: 'amber' },
              { to: '/products?stock_filter=low', icon: Package, label: ar ? 'مخزون منخفض' : 'Stock bas', color: 'orange',
                badge: stats.low_stock_count || 0 },
            ].map(({ to, icon: Icon, label, color, badge }) => (
              <Link key={to} to={to}>
                <Card className="border-0 shadow-sm hover:shadow-md transition-all hover:scale-105 cursor-pointer h-full">
                  <CardContent className="p-4 flex flex-col items-center gap-2 text-center">
                    <div className={`p-2.5 rounded-xl bg-${color === 'primary' ? 'primary' : color}-100 dark:bg-${color}-950/30 relative`}>
                      <Icon className={`h-5 w-5 ${color === 'primary' ? 'text-primary-foreground' : `text-${color}-600`}`}
                        style={color === 'primary' ? { color: 'hsl(var(--primary-foreground))' } : {}} />
                      {badge > 0 && (
                        <span className="absolute -top-1 -end-1 h-4 w-4 text-[10px] bg-red-500 text-white rounded-full flex items-center justify-center font-bold">
                          {badge}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Stock alert ── */}
        {stats.low_stock_count > 0 && (
          <Card className="border-0 shadow-sm border-l-4 border-l-orange-500 bg-orange-50 dark:bg-orange-950/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="font-semibold text-orange-700 dark:text-orange-400">
                    {ar
                      ? `${stats.low_stock_count} منتج تحت الحد الأدنى للمخزون`
                      : `${stats.low_stock_count} produits sous le seuil minimum`
                    }
                  </p>
                  <p className="text-xs text-orange-600/80 dark:text-orange-400/60">
                    {ar ? 'يجب إعادة التزود قريباً' : 'Réapprovisionnement nécessaire'}
                  </p>
                </div>
              </div>
              <Link to="/products?stock_filter=low">
                <Button size="sm" variant="outline" className="gap-1 border-orange-300 text-orange-700 hover:bg-orange-100">
                  {ar ? 'عرض' : 'Voir'} <Arrow />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

      </div>
    </Layout>
  );
}
