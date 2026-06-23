import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useDateFormat } from '../contexts/DateFormatContext';
import { Layout } from '../components/Layout';
import { LoadingState } from '../components/LoadingState';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { SmartNotifications } from '../components/SmartNotifications';
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
  Wallet
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
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productsRes, statsRes, salesStatsRes, profitRes, walletRes] = await Promise.all([
          apiClient.get(`/products`),
          apiClient.get(`/stats`).catch(() => ({ data: {} })),
          apiClient.get(`/dashboard/sales-stats`).catch(() => ({ data: null })),
          apiClient.get(`/dashboard/profit-stats`).catch(() => ({ data: null })),
          apiClient.get(`/wallet`).catch(() => ({ data: null }))
        ]);
        
        setRecentProducts(productsRes.data.slice(0, 6));

        if (walletRes.data) {
          setWalletBalance(walletRes.data.balance || 0);
        }
        
        if (statsRes.data) {
          setStats(statsRes.data);
        } else {
          setStats(prev => ({
            ...prev,
            total_products: productsRes.data.length,
            low_stock_count: productsRes.data.filter(p => p.quantity < (p.low_stock_threshold || 10)).length
          }));
        }
        
        if (salesStatsRes.data) {
          setSalesStats(salesStatsRes.data);
        }
        
        if (profitRes.data) {
          setProfitStats(profitRes.data);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  const statsCards = [
    { title: t.todaySales, value: `${stats.today_sales_total?.toFixed(2) || 0} ${t.currency}`, subValue: `${stats.today_sales_count || 0} ${t.sales}`, icon: TrendingUp, color: 'text-emerald-600', bgColor: 'bg-emerald-100', link: '/sales' },
    { title: t.totalCash, value: `${stats.total_cash?.toFixed(2) || 0} ${t.currency}`, icon: Banknote, color: 'text-blue-600', bgColor: 'bg-blue-100', link: '/cash' },
    { title: language === 'ar' ? 'رصيد المحفظة' : 'Solde portefeuille', value: `${walletBalance?.toFixed(2) || 0} ${t.currency}`, subValue: language === 'ar' ? 'متوفر لشحن الجوال' : 'Disponible recharge', icon: Wallet, color: 'text-teal-600', bgColor: 'bg-teal-100', link: '/recharge' },
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {statsCards.map((stat, index) => (
            <Link key={stat.link} to={stat.link}>
              <Card className="stats-card cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200" data-testid={`stat-card-${index}`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                      <p className="text-2xl font-bold mt-2">{stat.value}</p>
                      {stat.subValue && <p className="text-sm text-muted-foreground">{stat.subValue}</p>}
                    </div>
                    <div className={`p-4 rounded-xl ${stat.bgColor}`}>
                      <stat.icon className={`h-6 w-6 ${stat.color}`} />
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
                    {salesStats.today.total.toFixed(2)}
                  </p>
                  <p className="text-sm text-emerald-600">{t.currency}</p>
                  <Badge className="mt-2 bg-emerald-500">
                    {salesStats.today.count} {language === 'ar' ? 'عملية' : 'ventes'}
                  </Badge>
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
                    {salesStats.month.total.toFixed(2)}
                  </p>
                  <p className="text-sm text-blue-600">{t.currency}</p>
                  <Badge className="mt-2 bg-blue-500">
                    {salesStats.month.count} {language === 'ar' ? 'عملية' : 'ventes'}
                  </Badge>
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
                    {salesStats.year.total.toFixed(2)}
                  </p>
                  <p className="text-sm text-purple-600">{t.currency}</p>
                  <Badge className="mt-2 bg-purple-500">
                    {salesStats.year.count} {language === 'ar' ? 'عملية' : 'ventes'}
                  </Badge>
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
                  {(profitStats.monthly_revenue || salesStats.month.total || 0).toFixed(2)}
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
                  ? `صافي الربح = المبيعات (${(profitStats.monthly_revenue || salesStats.month.total || 0).toFixed(2)}) - تكلفة الشراء (${(profitStats.monthly_purchase_cost || 0).toFixed(2)}) - التكاليف (${(profitStats.monthly_expenses || 0).toFixed(2)}) = ${(profitStats.monthly_profit || 0).toFixed(2)} ${t.currency}`
                  : `Bénéfice net = Ventes (${(profitStats.monthly_revenue || salesStats.month.total || 0).toFixed(2)}) - Coût d'achat (${(profitStats.monthly_purchase_cost || 0).toFixed(2)}) - Dépenses (${(profitStats.monthly_expenses || 0).toFixed(2)}) = ${(profitStats.monthly_profit || 0).toFixed(2)} ${t.currency}`
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
