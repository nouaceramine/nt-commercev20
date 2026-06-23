import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import {
  BarChart3,
  TrendingUp,
  Users,
  Package,
  Calendar,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  ShoppingCart,
  Target,
  Award
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

export default function AdvancedAnalyticsPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [salesChart, setSalesChart] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [employeePerformance, setEmployeePerformance] = useState([]);
  const [predictions, setPredictions] = useState(null);
  const [restockSuggestions, setRestockSuggestions] = useState([]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const [salesRes, productsRes, customersRes, employeesRes, predictionsRes, restockRes] = await Promise.all([
        apiClient.get(`/analytics/sales-chart?period=${period}`),
        apiClient.get(`/analytics/top-products?limit=10`),
        apiClient.get(`/analytics/top-customers?limit=10`),
        apiClient.get(`/analytics/employee-performance`),
        apiClient.get(`/analytics/sales-prediction`),
        apiClient.get(`/analytics/restock-suggestions`)
      ]);
      
      // Handle nested response structures - API returns {data: [...]} or {products: [...]} etc
      const salesData = salesRes.data?.data || salesRes.data || [];
      const productsData = productsRes.data?.products || productsRes.data || [];
      const customersData = customersRes.data?.customers || customersRes.data || [];
      const employeesData = employeesRes.data?.employees || employeesRes.data || [];
      const restockData = restockRes.data?.suggestions || restockRes.data || [];
      
      // Handle predictions - API returns {prediction, trend, confidence}
      const predictionsData = {
        next_week_sales: predictionsRes.data?.prediction || predictionsRes.data?.next_week_sales || 0,
        expected_sales_count: predictionsRes.data?.expected_sales_count || 0,
        expected_avg_order: predictionsRes.data?.expected_avg_order || 0,
        trend: predictionsRes.data?.trend || 'neutral',
        trend_percentage: predictionsRes.data?.trend_percentage || predictionsRes.data?.confidence || 0
      };
      
      setSalesChart(Array.isArray(salesData) ? salesData : []);
      setTopProducts(Array.isArray(productsData) ? productsData : []);
      setTopCustomers(Array.isArray(customersData) ? customersData : []);
      setEmployeePerformance(Array.isArray(employeesData) ? employeesData : []);
      setPredictions(predictionsData);
      setRestockSuggestions(Array.isArray(restockData) ? restockData : []);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error(language === 'ar' ? 'خطأ في جلب البيانات' : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatCurrency = (value) => `${value?.toFixed(2) || 0} ${language === 'ar' ? 'دج' : 'DA'}`;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="advanced-analytics-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-primary" />
              {language === 'ar' ? 'الإحصائيات المتقدمة' : 'Analyses avancées'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'تحليل شامل لأداء المتجر' : 'Analyse complète des performances'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchAnalytics}>
              <RefreshCw className="h-4 w-4 me-2" />
              {language === 'ar' ? 'تحديث' : 'Actualiser'}
            </Button>
          </div>
        </div>

        {/* Period Selection */}
        <div className="flex gap-2">
          {['week', 'month', 'year'].map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p === 'week' && (language === 'ar' ? 'أسبوع' : 'Semaine')}
              {p === 'month' && (language === 'ar' ? 'شهر' : 'Mois')}
              {p === 'year' && (language === 'ar' ? 'سنة' : 'Année')}
            </Button>
          ))}
        </div>

        {/* Predictions Card */}
        {predictions && (
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                {language === 'ar' ? 'التوقعات' : 'Prédictions'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-card rounded-xl">
                  <p className="text-sm text-muted-foreground mb-2">
                    {language === 'ar' ? 'المبيعات المتوقعة (الأسبوع القادم)' : 'Ventes prévues (semaine)'}
                  </p>
                  <p className="text-3xl font-bold text-primary">{formatCurrency(predictions.next_week_sales)}</p>
                  <div className="flex items-center justify-center gap-1 mt-2 text-sm">
                    {predictions.trend === 'up' ? (
                      <>
                        <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                        <span className="text-emerald-500">+{predictions.trend_percentage}%</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                        <span className="text-red-500">{predictions.trend_percentage}%</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-center p-4 bg-card rounded-xl">
                  <p className="text-sm text-muted-foreground mb-2">
                    {language === 'ar' ? 'عدد المبيعات المتوقع' : 'Nombre de ventes prévu'}
                  </p>
                  <p className="text-3xl font-bold text-blue-600">{predictions.expected_sales_count}</p>
                </div>
                <div className="text-center p-4 bg-card rounded-xl">
                  <p className="text-sm text-muted-foreground mb-2">
                    {language === 'ar' ? 'متوسط قيمة الطلب المتوقع' : 'Panier moyen prévu'}
                  </p>
                  <p className="text-3xl font-bold text-purple-600">{formatCurrency(predictions.expected_avg_order)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="sales">
          <TabsList className="grid grid-cols-4 w-full max-w-md">
            <TabsTrigger value="sales">{language === 'ar' ? 'المبيعات' : 'Ventes'}</TabsTrigger>
            <TabsTrigger value="products">{language === 'ar' ? 'المنتجات' : 'Produits'}</TabsTrigger>
            <TabsTrigger value="customers">{language === 'ar' ? 'العملاء' : 'Clients'}</TabsTrigger>
            <TabsTrigger value="employees">{language === 'ar' ? 'الموظفين' : 'Employés'}</TabsTrigger>
          </TabsList>

          {/* Sales Tab */}
          <TabsContent value="sales" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                  {language === 'ar' ? 'تطور المبيعات' : 'Évolution des ventes'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesChart}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        formatter={(value) => [formatCurrency(value), language === 'ar' ? 'المبيعات' : 'Ventes']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="total" 
                        stroke="#10b981" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorSales)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-amber-600" />
                    {language === 'ar' ? 'أفضل المنتجات مبيعاً' : 'Meilleurs produits'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topProducts} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" className="text-xs" />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          width={120} 
                          className="text-xs"
                          tick={{ fontSize: 11 }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar dataKey="total_sold" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-red-600" />
                    {language === 'ar' ? 'منتجات تحتاج إعادة طلب' : 'Produits à réapprovisionner'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {restockSuggestions.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        {language === 'ar' ? 'لا توجد منتجات تحتاج إعادة طلب' : 'Aucun produit à réapprovisionner'}
                      </p>
                    ) : (
                      restockSuggestions.map((product, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {language === 'ar' ? 'المتبقي' : 'Stock'}: {product.quantity}
                            </p>
                          </div>
                          <Badge variant={product.quantity === 0 ? 'destructive' : 'secondary'}>
                            {product.quantity === 0 
                              ? (language === 'ar' ? 'نفد' : 'Épuisé')
                              : (language === 'ar' ? 'منخفض' : 'Faible')}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-purple-600" />
                  {language === 'ar' ? 'أفضل العملاء' : 'Meilleurs clients'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={topCustomers}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                          dataKey="total_purchases"
                          nameKey="name"
                        >
                          {topCustomers.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                          formatter={(value) => formatCurrency(value)}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {topCustomers.map((customer, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                          />
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            <p className="text-sm text-muted-foreground">{customer.phone}</p>
                          </div>
                        </div>
                        <p className="font-bold text-primary">{formatCurrency(customer.total_purchases)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Employees Tab */}
          <TabsContent value="employees" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-blue-600" />
                  {language === 'ar' ? 'أداء الموظفين' : 'Performance des employés'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={employeePerformance}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        formatter={(value, name) => [
                          name === 'total_sales' ? formatCurrency(value) : value,
                          name === 'total_sales' 
                            ? (language === 'ar' ? 'المبيعات' : 'Ventes')
                            : (language === 'ar' ? 'عدد العمليات' : 'Transactions')
                        ]}
                      />
                      <Bar dataKey="total_sales" fill="#3b82f6" radius={[4, 4, 0, 0]} name="total_sales" />
                      <Bar dataKey="sales_count" fill="#10b981" radius={[4, 4, 0, 0]} name="sales_count" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
