import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Package, AlertTriangle, Users, 
  DollarSign, ShoppingCart, Bell, Calendar,
  RefreshCw, Settings
} from 'lucide-react';
import { StatCard } from './StatCard';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function AdvancedDashboard() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState([]);
  const [profitData, setProfitData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({
    todaySales: 0,
    weekSales: 0,
    monthSales: 0,
    totalProducts: 0,
    lowStockCount: 0,
    pendingDebts: 0,
    activeCustomers: 0
  });

  useEffect(() => {
    fetchDashboardData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [salesRes, alertsRes, statsRes] = await Promise.all([
        apiClient.get(`/dashboard/sales-chart`).catch(() => ({ data: [] })),
        apiClient.get(`/dashboard/alerts`).catch(() => ({ data: [] })),
        apiClient.get(`/dashboard/advanced-stats`).catch(() => ({ data: {} }))
      ]);

      // Generate mock data if API doesn't return data
      if (salesRes.data.length === 0) {
        const mockSales = generateMockSalesData();
        setSalesData(mockSales);
        setProfitData(mockSales.map(d => ({ ...d, profit: d.sales * 0.25 - d.expenses })));
      } else {
        setSalesData(salesRes.data);
      }

      setCategoryData([
        { name: language === 'ar' ? 'شاشات' : 'Écrans', value: 35 },
        { name: language === 'ar' ? 'بطاريات' : 'Batteries', value: 25 },
        { name: language === 'ar' ? 'شواحن' : 'Chargeurs', value: 20 },
        { name: language === 'ar' ? 'أكسسوارات' : 'Accessoires', value: 15 },
        { name: language === 'ar' ? 'أخرى' : 'Autres', value: 5 }
      ]);

      setAlerts(alertsRes.data.length > 0 ? alertsRes.data : generateMockAlerts());
      setStats(statsRes.data || generateMockStats());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Use mock data on error
      setSalesData(generateMockSalesData());
      setAlerts(generateMockAlerts());
      setStats(generateMockStats());
    } finally {
      setLoading(false);
    }
  };

  const generateMockSalesData = () => {
    const days = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const arDays = ['سبت', 'أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع'];
    return days.map((day, i) => ({
      name: language === 'ar' ? arDays[i] : day,
      sales: Math.floor(Math.random() * 50000) + 10000,
      orders: Math.floor(Math.random() * 30) + 5,
      expenses: Math.floor(Math.random() * 5000) + 1000
    }));
  };

  const generateMockAlerts = () => [
    { id: 1, type: 'low_stock', message: language === 'ar' ? '5 منتجات منخفضة المخزون' : '5 produits en stock faible', priority: 'high' },
    { id: 2, type: 'debt', message: language === 'ar' ? '3 ديون متأخرة' : '3 dettes en retard', priority: 'medium' },
    { id: 3, type: 'expiry', message: language === 'ar' ? 'منتجان قرب انتهاء الصلاحية' : '2 produits proches de l\'expiration', priority: 'low' }
  ];

  const generateMockStats = () => ({
    todaySales: 15000,
    weekSales: 85000,
    monthSales: 350000,
    totalProducts: 150,
    lowStockCount: 5,
    pendingDebts: 25000,
    activeCustomers: 45
  });

  const formatCurrency = (value) => {
    return value?.toLocaleString('en-US') + ' ' + (language === 'ar' ? 'دج' : 'DA');
  };

  const trendLabel = language === 'ar' ? 'من الأسبوع الماضي' : 'vs semaine dernière';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{language === 'ar' ? 'لوحة التحكم المتقدمة' : 'Tableau de bord avancé'}</h2>
          <p className="text-muted-foreground">{language === 'ar' ? 'نظرة شاملة على أداء المتجر' : 'Vue d\'ensemble des performances'}</p>
        </div>
        <Button variant="outline" onClick={fetchDashboardData} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          {language === 'ar' ? 'تحديث' : 'Actualiser'}
        </Button>
      </div>

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-600" />
              {language === 'ar' ? 'التنبيهات' : 'Alertes'}
              <Badge variant="secondary">{alerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map(alert => (
                <div key={alert.id} className={`flex items-center gap-3 p-2 rounded-lg ${
                  alert.priority === 'high' ? 'bg-red-100' : 
                  alert.priority === 'medium' ? 'bg-amber-100' : 'bg-blue-100'
                }`}>
                  <AlertTriangle className={`h-4 w-4 ${
                    alert.priority === 'high' ? 'text-red-600' : 
                    alert.priority === 'medium' ? 'text-amber-600' : 'text-blue-600'
                  }`} />
                  <span className="text-sm">{alert.message}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          variant="boxed"
          trendLabel={trendLabel}
          title={language === 'ar' ? 'مبيعات اليوم' : 'Ventes aujourd\'hui'}
          value={formatCurrency(stats.todaySales)}
          icon={DollarSign}
          trend={12}
          color="bg-emerald-500"
        />
        <StatCard 
          variant="boxed"
          trendLabel={trendLabel}
          title={language === 'ar' ? 'مبيعات الأسبوع' : 'Ventes semaine'}
          value={formatCurrency(stats.weekSales)}
          icon={TrendingUp}
          trend={8}
          color="bg-blue-500"
        />
        <StatCard 
          variant="boxed"
          trendLabel={trendLabel}
          title={language === 'ar' ? 'المنتجات' : 'Produits'}
          value={stats.totalProducts}
          icon={Package}
          color="bg-purple-500"
          subtext={`${stats.lowStockCount} ${language === 'ar' ? 'منخفض المخزون' : 'stock faible'}`}
        />
        <StatCard 
          variant="boxed"
          trendLabel={trendLabel}
          title={language === 'ar' ? 'الديون المعلقة' : 'Dettes en attente'}
          value={formatCurrency(stats.pendingDebts)}
          icon={Users}
          color="bg-amber-500"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              {language === 'ar' ? 'المبيعات اليومية' : 'Ventes quotidiennes'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={salesData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  formatter={(value) => [formatCurrency(value), language === 'ar' ? 'المبيعات' : 'Ventes']}
                />
                <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-purple-600" />
              {language === 'ar' ? 'توزيع المبيعات حسب الفئة' : 'Répartition par catégorie'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value}%`, language === 'ar' ? 'النسبة' : 'Pourcentage']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Orders & Profit Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            {language === 'ar' ? 'الطلبات والأرباح' : 'Commandes et bénéfices'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
              <YAxis yAxisId="left" stroke="#6b7280" fontSize={12} />
              <YAxis yAxisId="right" orientation="right" stroke="#6b7280" fontSize={12} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="orders" fill="#3b82f6" name={language === 'ar' ? 'الطلبات' : 'Commandes'} radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="sales" fill="#22c55e" name={language === 'ar' ? 'المبيعات' : 'Ventes'} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdvancedDashboard;
