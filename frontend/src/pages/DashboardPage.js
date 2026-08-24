import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { startRealtime, onEvent } from '../lib/realtime';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useDateFormat } from '../contexts/DateFormatContext';
import { Layout } from '../components/Layout';
import { LoadingState } from '../components/LoadingState';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { SmartNotifications } from '../components/SmartNotifications';
import { SmartDashboardContent } from './SmartDashboardPage'; // p160: unified dashboard
import { DashboardCustomizer, useDashboardWidgets } from '../components/DashboardCustomizer';
import { 
  Package, 
  Users, 
  AlertTriangle, 
  ArrowRight, 
  ArrowLeft, 
  Plus,
  ShoppingCart,
  Truck,
  Banknote,
  TrendingUp,
  Calendar,
  CalendarDays,
  Receipt,
  Minus,
  Equal,
  Settings,
  Wallet,
  CreditCard,
  DollarSign
} from 'lucide-react';

export default function DashboardPage() {
  const { t, isRTL, language } = useLanguage();
  const { isAdmin } = useAuth();
  const { formatCurrency, formatNumber, formatDate } = useDateFormat();
  const { widgets, setWidgets, isWidgetVisible, getWidgetOrder } = useDashboardWidgets();
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [stats, setStats] = useState({
    total_products: 0, total_customers: 0, total_suppliers: 0,
    low_stock_count: 0, today_sales_total: 0, today_sales_count: 0,
    total_cash: 0, cash_boxes: [], currency: 'دج'
  });
  const [salesStats, setSalesStats] = useState({
    today: { total: 0, count: 0 },
    month: { total: 0, count: 0 },
    year: { total: 0, count: 0 }
  });
  const [profitStats, setProfitStats] = useState({
    monthly_revenue: 0,
    monthly_expenses: 0,
    monthly_profit: 0,
    monthly_purchase_cost: 0
  });
  const [recentProducts, setRecentProducts] = useState([]);
  const [todayProfit, setTodayProfit] = useState(0);
  const [recurringCost, setRecurringCost] = useState({ daily: 0, monthly: 0 });
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletDebt, setWalletDebt] = useState(0);
  const [walletOverdue, setWalletOverdue] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productsRes, stockRes, statsRes, salesStatsRes, profitRes, walletRes, dailyRes, recCostRes] = await Promise.all([  // p285: realigned — p273 inserted stock-summary without shifting names (every var was off by one)
          apiClient.get(`/products/paginated?page=1&page_size=6`),  // p273: was full /products (7k+ docs)
          apiClient.get(`/stats/stock-summary`).catch(() => ({ data: {} })),  // p273
          apiClient.get(`/stats`).catch(() => ({ data: {} })),
          apiClient.get(`/dashboard/sales-stats`).catch(() => ({ data: null })),
          apiClient.get(`/dashboard/profit-stats`).catch(() => ({ data: null })),
          apiClient.get(`/wallet`).catch(() => ({ data: null })),
          apiClient.get(`/reports/daily-full`).catch(() => ({ data: null })),
          apiClient.get(`/expenses/estimated-cost`).catch(() => ({ data: null }))
        ]);
        
        setRecentProducts((productsRes.data.items || productsRes.data || []).slice(0, 6));  // p273

        if (walletRes.data) {
          setWalletBalance(walletRes.data.balance || 0);
          // total_platform_debt includes subscription_due + platform purchase debts
          setWalletDebt(walletRes.data.total_platform_debt ?? walletRes.data.subscription_due ?? 0);
          setWalletOverdue(!!walletRes.data.subscription_overdue);
        }
        
        if (statsRes.data && Object.keys(statsRes.data).length > 0) {  // p273: {} from catch was truthy — fallback was dead code
          setStats(statsRes.data);
        } else {
          setStats(prev => ({
            ...prev,
            total_products: stockRes.data.total ?? productsRes.data.total ?? 0,
            low_stock_count: stockRes.data.low_stock_count ?? 0
          }));
        }
        
        // p285: never trust the wire shape — a malformed payload here used to
        // blank the whole dashboard (TypeError: today of undefined)
        if (salesStatsRes.data && salesStatsRes.data.today && salesStatsRes.data.month && salesStatsRes.data.year) {
          setSalesStats(salesStatsRes.data);
        } else if (salesStatsRes.data) {
          console.error('p285: unexpected sales-stats shape', salesStatsRes.data);
        }
        
        if (profitRes.data) {
          setProfitStats(profitRes.data);
        }

        // p167: estimated daily/monthly share of recurring costs (display-only)
        if (recCostRes.data) {
          setRecurringCost({
            daily: recCostRes.data.daily_cost || 0,
            monthly: recCostRes.data.monthly_cost || 0
          });
        }

        // فوائد اليوم: sum of every section's profit in the daily full report
        if (dailyRes.data) {
          const d = dailyRes.data;
          setTodayProfit(
            (d.pos?.profit || 0) + (d.recharge?.profit || 0) +
            (d.digital?.subs_profit || 0) + (d.sim_activations?.profit || 0) +
            (d.cards?.profit || 0)
          );
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // p194: تحديث فوري للوحة التحكم عند أحداث البيع/الشراء/المصاريف (SSE)
    startRealtime();
    const _un1 = onEvent('sale.completed', fetchData);
    const _un2 = onEvent('sale.refunded', fetchData);
    const _un3 = onEvent('sale.deleted', fetchData);
    const _un4 = onEvent('purchase.recorded', fetchData);
    const _un5 = onEvent('expense.created', fetchData);
    const _un6 = onEvent('expense.deleted', fetchData);
    const _un7 = onEvent('customer.payment_received', fetchData);  // p195
    const _un8 = onEvent('supplier.payment_made', fetchData);  // p195
    return () => { _un1(); _un2(); _un3(); _un4(); _un5(); _un6(); _un7(); _un8(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  const customerBalance = stats.customer_balance_total || 0;
  const customerBalanceCount = stats.customer_balance_count || 0;
  const customerDebt = stats.customer_debt_total || 0;
  const customerDebtCount = stats.customers_with_debt || 0;
  const totalPlatformDebt = (walletDebt || 0); // Already includes subscription_due; backend may extend

  const statsCards = [
    // ── Top row: Customer wallet snapshot (per user request) ──
    { title: language === 'ar' ? 'رصيد ديون الزبائن' : 'Solde dettes clients', value: `${customerDebt.toFixed(2)} ${t.currency}`, subValue: language === 'ar' ? `${customerDebtCount} زبون مدين` : `${customerDebtCount} clients endettés`, icon: Wallet, color: customerDebt > 0 ? 'text-red-600' : 'text-slate-600', bgColor: customerDebt > 0 ? 'bg-red-100' : 'bg-slate-100', link: '/customer-debts' },
    { title: language === 'ar' ? 'ديون الزبائن اليوم' : "Dettes clients aujourd'hui", value: `${(stats.customer_debt_today || 0).toFixed(2)} ${t.currency}`, subValue: language === 'ar' ? `${stats.customer_debt_today_count || 0} عملية دين اليوم` : `${stats.customer_debt_today_count || 0} dettes aujourd'hui`, icon: CreditCard, color: (stats.customer_debt_today || 0) > 0 ? 'text-amber-600' : 'text-slate-600', bgColor: (stats.customer_debt_today || 0) > 0 ? 'bg-amber-100' : 'bg-slate-100', link: '/customer-debts', testId: 'cust-debt-today-card' },
    { title: language === 'ar' ? 'ديون الموردين اليوم' : "Dettes fournisseurs aujourd'hui", value: `${(stats.supplier_debt_today || 0).toFixed(2)} ${t.currency}`, subValue: language === 'ar' ? `الإجمالي الكلي: ${(stats.supplier_debt_total || 0).toFixed(0)} ${t.currency}` : `Total global: ${(stats.supplier_debt_total || 0).toFixed(0)} ${t.currency}`, icon: Truck, color: (stats.supplier_debt_today || 0) > 0 ? 'text-orange-600' : 'text-slate-600', bgColor: (stats.supplier_debt_today || 0) > 0 ? 'bg-orange-100' : 'bg-slate-100', link: '/suppliers', testId: 'supp-debt-today-card' },
    // ── Standard stats ──
    { title: t.todaySales, value: `${stats.today_sales_total?.toFixed(2) || 0} ${t.currency}`, subValue: `${stats.today_sales_count || 0} ${t.sales}`, icon: TrendingUp, color: 'text-emerald-600', bgColor: 'bg-emerald-100', link: '/sales' },
    { title: language === 'ar' ? 'فوائد اليوم' : "Profits du jour", value: `${todayProfit.toFixed(2)} ${t.currency}`, subValue: language === 'ar' ? 'كل الأقسام (مبيعات + خدمات)' : 'Toutes sections', icon: DollarSign, color: todayProfit > 0 ? 'text-green-600' : 'text-slate-600', bgColor: todayProfit > 0 ? 'bg-green-100' : 'bg-slate-100', link: '/daily-report', testId: 'today-profit-card' },
    { title: language === 'ar' ? 'صافي الفوائد اليوم' : "Bénéfice net du jour", value: `${(todayProfit - recurringCost.daily).toFixed(2)} ${t.currency}`, subValue: language === 'ar' ? `بعد خصم التكاليف اليومية المقدرة (${recurringCost.daily.toFixed(0)})` : `Après coûts journaliers estimés (${recurringCost.daily.toFixed(0)})`, icon: DollarSign, color: (todayProfit - recurringCost.daily) > 0 ? 'text-emerald-600' : 'text-slate-600', bgColor: (todayProfit - recurringCost.daily) > 0 ? 'bg-emerald-100' : 'bg-slate-100', link: '/daily-report', testId: 'net-today-profit-card' },
    { title: language === 'ar' ? 'صافي فوائد الشهر' : 'Bénéfice net du mois', value: `${((profitStats.monthly_profit || 0) - recurringCost.monthly).toFixed(2)} ${t.currency}`, subValue: language === 'ar' ? `بعد خصم التكاليف الشهرية المقدرة (${recurringCost.monthly.toFixed(0)})` : `Après coûts mensuels estimés (${recurringCost.monthly.toFixed(0)})`, icon: TrendingUp, color: ((profitStats.monthly_profit || 0) - recurringCost.monthly) > 0 ? 'text-emerald-600' : 'text-slate-600', bgColor: ((profitStats.monthly_profit || 0) - recurringCost.monthly) > 0 ? 'bg-emerald-100' : 'bg-slate-100', link: '/reports', testId: 'net-month-profit-card' },
    { title: language === 'ar' ? 'رأس المال' : 'Capital', value: `${(stats.capital ?? stats.total_cash)?.toFixed(2) || 0} ${t.currency}`, icon: Banknote, color: 'text-blue-600', bgColor: 'bg-blue-100', link: '/cash', testId: 'capital-card' },
    { title: language === 'ar' ? 'رصيد المحفظة' : 'Solde portefeuille', value: `${walletBalance?.toFixed(2) || 0} ${t.currency}`, subValue: language === 'ar' ? 'متوفر لشحن الجوال' : 'Disponible recharge', icon: Wallet, color: 'text-teal-600', bgColor: 'bg-teal-100', link: '/recharge' },
    { title: language === 'ar' ? 'رصيد محفظة المستخدم' : 'Solde portefeuille utilisateur', value: `${walletBalance?.toFixed(2) || 0} ${t.currency}`, subValue: language === 'ar' ? 'محفظة المنصة' : 'Portefeuille plateforme', icon: Wallet, color: 'text-indigo-600', bgColor: 'bg-indigo-100', link: '/wallet-management' },
    { title: language === 'ar' ? 'ديون محفظة المستخدم' : 'Dettes portefeuille utilisateur', value: `${totalPlatformDebt.toFixed(2)} ${t.currency}`, subValue: walletOverdue ? (language === 'ar' ? 'اشتراك متأخر + مشتريات' : 'Abonnement échu + achats') : (totalPlatformDebt > 0 ? (language === 'ar' ? 'مشتريات غير مدفوعة' : 'Achats impayés') : (language === 'ar' ? 'لا توجد ديون' : 'Aucune dette')), icon: CreditCard, color: (walletOverdue || totalPlatformDebt > 0) ? 'text-red-600' : 'text-slate-600', bgColor: (walletOverdue || totalPlatformDebt > 0) ? 'bg-red-100' : 'bg-slate-100', link: '/wallet-management' },
    { title: t.totalProducts, value: stats.total_products, icon: Package, color: 'text-primary', bgColor: 'bg-primary/10', link: '/products' },
    { title: t.lowStock, value: stats.low_stock_count, icon: AlertTriangle, color: 'text-amber-600', bgColor: 'bg-amber-100', link: '/products?filter=low-stock' },
    { title: t.totalCustomers, value: stats.total_customers, icon: Users, color: 'text-purple-600', bgColor: 'bg-purple-100', link: '/customers' },
    { title: t.totalSuppliers, value: stats.total_suppliers, icon: Truck, color: 'text-orange-600', bgColor: 'bg-orange-100', link: '/suppliers' }
  ];

  if (loading) {
    return <Layout><LoadingState minHeight="60vh" /></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-8 animate-fade-in" data-testid="dashboard-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t.dashboard}</h1>
            <p className="text-muted-foreground mt-1">{t.quickStats}</p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setShowCustomizer(true)}
              data-testid="customize-dashboard-btn"
            >
              <Settings className="h-5 w-5" />
            </Button>
            <Link to="/pos">
              <Button className="gap-2" data-testid="go-to-pos-btn">
                <ShoppingCart className="h-5 w-5" />
                {t.pos}
              </Button>
            </Link>
            <Link to="/products/add">
              <Button variant="outline" className="gap-2" data-testid="add-product-btn">
                <Plus className="h-5 w-5" />
                  {t.addProduct}
                </Button>
              </Link>
          </div>
        </div>

        {/* Stats Cards */}
        {isWidgetVisible('stats') && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {statsCards.map((stat, index) => (
            <Link key={`stat-${index}-${stat.link}`} to={stat.link}>
              <Card className="stats-card cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all duration-200" data-testid={`stat-card-${index}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground truncate">{stat.title}</p>
                      <p className="text-base font-bold mt-1 truncate">{stat.value}</p>
                      {stat.subValue && <p className="text-[11px] text-muted-foreground truncate">{stat.subValue}</p>}
                    </div>
                    <div className={`p-2 rounded-lg shrink-0 ${stat.bgColor}`}>
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        )}

        {/* Sales Summary - Today/Month/Year */}
        {isWidgetVisible('stats') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              {language === 'ar' ? 'ملخص المبيعات' : 'Résumé des ventes'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Today */}
                <div className="p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Calendar className="h-5 w-5 text-emerald-600" />
                    <span className="font-medium text-emerald-700">
                      {language === 'ar' ? 'اليوم' : 'Aujourd\'hui'}
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-emerald-700">
                    {(salesStats.today?.total ?? 0).toFixed(2)}
                  </p>
                  <p className="text-sm text-emerald-600">{t.currency}</p>
                  <Badge className="mt-2 bg-emerald-500">
                    {salesStats.today?.count ?? 0} {language === 'ar' ? 'عملية' : 'ventes'}
                  </Badge>
                  {salesStats.store?.today?.count > 0 && (
                    <p className="text-xs text-emerald-600 mt-1" data-testid="store-share-today">
                      {language === 'ar'
                        ? `منها المتجر: ${(salesStats.store?.today?.total ?? 0).toFixed(2)} ${t.currency} (${(salesStats.store?.today?.count ?? 0)})`
                        : `dont boutique : ${(salesStats.store?.today?.total ?? 0).toFixed(2)} ${t.currency} (${(salesStats.store?.today?.count ?? 0)})`}
                    </p>
                  )}
                </div>

                {/* This Month */}
                <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <CalendarDays className="h-5 w-5 text-blue-600" />
                    <span className="font-medium text-blue-700">
                      {language === 'ar' ? 'هذا الشهر' : 'Ce mois'}
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-blue-700">
                    {(salesStats.month?.total ?? 0).toFixed(2)}
                  </p>
                  <p className="text-sm text-blue-600">{t.currency}</p>
                  <Badge className="mt-2 bg-blue-500">
                    {salesStats.month?.count ?? 0} {language === 'ar' ? 'عملية' : 'ventes'}
                  </Badge>
                  {salesStats.store?.month?.count > 0 && (
                    <p className="text-xs text-blue-600 mt-1" data-testid="store-share-month">
                      {language === 'ar'
                        ? `منها المتجر: ${(salesStats.store?.month?.total ?? 0).toFixed(2)} ${t.currency} (${(salesStats.store?.month?.count ?? 0)})`
                        : `dont boutique : ${(salesStats.store?.month?.total ?? 0).toFixed(2)} ${t.currency} (${(salesStats.store?.month?.count ?? 0)})`}
                    </p>
                  )}
                </div>

                {/* This Year */}
                <div className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                    <span className="font-medium text-purple-700">
                      {language === 'ar' ? 'هذه السنة' : 'Cette année'}
                    </span>
                  </div>
                  <p className="text-3xl font-bold text-purple-700">
                    {(salesStats.year?.total ?? 0).toFixed(2)}
                  </p>
                  <p className="text-sm text-purple-600">{t.currency}</p>
                  <Badge className="mt-2 bg-purple-500">
                    {salesStats.year?.count ?? 0} {language === 'ar' ? 'عملية' : 'ventes'}
                  </Badge>
                  {salesStats.store?.year?.count > 0 && (
                    <p className="text-xs text-purple-600 mt-1" data-testid="store-share-year">
                      {language === 'ar'
                        ? `منها المتجر: ${(salesStats.store?.year?.total ?? 0).toFixed(2)} ${t.currency} (${(salesStats.store?.year?.count ?? 0)})`
                        : `dont boutique : ${(salesStats.store?.year?.total ?? 0).toFixed(2)} ${t.currency} (${(salesStats.store?.year?.count ?? 0)})`}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly Profit Calculation (Revenue - Purchase Cost - Expenses) */}
        {isWidgetVisible('profit') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-green-600" />
              {language === 'ar' ? 'الفوائد الشهرية (المبيعات - تكلفة الشراء - التكاليف)' : 'Bénéfice mensuel (Ventes - Coût d\'achat - Dépenses)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Monthly Revenue */}
              <div className="p-4 bg-emerald-50 rounded-xl text-center border border-emerald-200">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">
                    {language === 'ar' ? 'المبيعات الشهرية' : 'Ventes mensuelles'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-700">
                  {(profitStats.monthly_revenue || salesStats.month?.total || 0).toFixed(2)}
                </p>
                <p className="text-xs text-emerald-600">{t.currency}</p>
              </div>

              {/* Monthly Purchase Cost */}
              <div className="p-4 bg-blue-50 rounded-xl text-center border border-blue-200">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Minus className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700">
                    {language === 'ar' ? 'تكلفة الشراء' : 'Coût d\'achat'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-blue-700">
                  {(profitStats.monthly_purchase_cost || 0).toFixed(2)}
                </p>
                <p className="text-xs text-blue-600">{t.currency}</p>
              </div>

              {/* Monthly Expenses */}
              <div className="p-4 bg-red-50 rounded-xl text-center border border-red-200">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Receipt className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-red-700">
                    {language === 'ar' ? 'التكاليف الشهرية' : 'Dépenses mensuelles'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-red-700">
                  {(profitStats.monthly_expenses || 0).toFixed(2)}
                </p>
                <p className="text-xs text-red-600">{t.currency}</p>
              </div>

              {/* Net Profit */}
              <div className={`p-4 rounded-xl text-center border ${
                (profitStats.monthly_profit || 0) >= 0 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Equal className="h-4 w-4" />
                  <span className={`text-sm font-medium ${
                    (profitStats.monthly_profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {language === 'ar' ? 'صافي الربح' : 'Bénéfice net'}
                  </span>
                </div>
                <p className={`text-2xl font-bold ${
                  (profitStats.monthly_profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'
                }`}>
                  {(profitStats.monthly_profit || 0).toFixed(2)}
                </p>
                <p className={`text-xs ${
                  (profitStats.monthly_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>{t.currency}</p>
              </div>
            </div>

            {/* Profit Formula Explanation */}
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground text-center">
                {language === 'ar' 
                  ? `صافي الربح = المبيعات (${(profitStats.monthly_revenue || salesStats.month?.total || 0).toFixed(2)}) - تكلفة الشراء (${(profitStats.monthly_purchase_cost || 0).toFixed(2)}) - التكاليف (${(profitStats.monthly_expenses || 0).toFixed(2)}) = ${(profitStats.monthly_profit || 0).toFixed(2)} ${t.currency}`
                  : `Bénéfice net = Ventes (${(profitStats.monthly_revenue || salesStats.month?.total || 0).toFixed(2)}) - Coût d'achat (${(profitStats.monthly_purchase_cost || 0).toFixed(2)}) - Dépenses (${(profitStats.monthly_expenses || 0).toFixed(2)}) = ${(profitStats.monthly_profit || 0).toFixed(2)} ${t.currency}`
                }
              </p>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Cash Boxes */}
        {isWidgetVisible('cashBoxes') && stats.cash_boxes?.length > 0 && (
          <Card>
            <CardHeader className="pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-xl">{t.cashManagement}</CardTitle>
              {isAdmin && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={async () => {
                    if (window.confirm('هل تريد إعادة تعيين جميع الصناديق إلى صفر؟')) {
                      try {
                        await apiClient.post(`/cash-boxes/reset-all`, {});
                        toast.success('تم إعادة تعيين الصناديق');
                        window.location.reload();
                      } catch (err) {
                        toast.error('فشل في إعادة التعيين');
                      }
                    }
                  }}
                  data-testid="reset-cash-boxes-btn"
                >
                  إعادة تعيين
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {stats.cash_boxes.map(box => (
                  <div key={box.id} className={`p-4 rounded-xl border ${box.balance < 0 ? 'bg-red-50 border-red-200' : 'bg-muted/50'}`}>
                    <p className="text-sm text-muted-foreground">{language === 'fr' ? (box.name_fr || box.name) : box.name}</p>
                    <p className={`text-xl font-bold mt-1 ${box.balance < 0 ? 'text-red-600' : ''}`}>
                      {box.balance?.toFixed(2)} {t.currency}
                      {box.balance < 0 && <span className="text-xs mr-1">⚠️</span>}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Smart Notifications */}
        {isWidgetVisible('notifications') && <SmartNotifications />}

        {/* Recent Products */}
        {isWidgetVisible('recentProducts') && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-xl">{t.recentProducts}</CardTitle>
            <Link to="/products">
              <Button variant="ghost" className="gap-2" data-testid="view-all-products-btn">
                {t.products}
                <Arrow className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {recentProducts.length === 0 ? (
              <div className="empty-state py-12">
                <Package className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">{t.noProducts}</h3>
                <p className="text-muted-foreground mt-1">{t.noProductsSubtitle}</p>
                {isAdmin && (
                  <Link to="/products/add" className="mt-4">
                    <Button className="gap-2"><Plus className="h-5 w-5" />{t.addProduct}</Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentProducts.map((product) => (
                  <Link key={product.id} to={`/products/${product.id}`} className="block" data-testid={`product-card-${product.id}`}>
                    <div className="product-card border rounded-xl overflow-hidden bg-card">
                      <div className="product-image-container h-40">
                        <img
                          src={product.image_url || 'https://images.unsplash.com/photo-1634403665443-81dc4d75843a?crop=entropy&cs=srgb&fm=jpg&q=85'}
                          alt={language === 'ar' ? product.name_ar : product.name_en}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold truncate">
                          {language === 'ar' ? product.name_ar : product.name_en}
                        </h3>
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-primary font-bold">
                            {product.retail_price?.toFixed(2)} {t.currency}
                          </p>
                          <Badge variant={product.quantity > 0 ? 'secondary' : 'destructive'}>
                            {product.quantity}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* p160: Smart (AI) dashboard merged into this single page */}
        <SmartDashboardContent />

        {/* Dashboard Customizer Dialog */}
        <DashboardCustomizer 
          isOpen={showCustomizer} 
          onClose={() => setShowCustomizer(false)}
          onSave={setWidgets}
        />
      </div>
    </Layout>
  );
}
