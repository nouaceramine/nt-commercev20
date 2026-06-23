import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useDateFormat } from '../contexts/DateFormatContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Receipt,
  PieChart,
  BarChart3,
  Brain,
  Sparkles,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPie,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function SmartDashboardPage() {
  const { t, isRTL, language } = useLanguage();
  const { user } = useAuth();
  const { formatCurrency, formatNumber, formatDate, formatPercent } = useDateFormat();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Dashboard data states
  const [financialHealth, setFinancialHealth] = useState(null);
  const [insights, setInsights] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [dailySummary, setDailySummary] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [expenseData, setExpenseData] = useState([]);
  
  const fetchDashboardData = useCallback(async () => {
    try {
      const [healthRes, insightsRes, summaryRes, forecastRes] = await Promise.all([
        apiClient.get(`/ai/financial-health`).catch(() => ({ data: null })),
        apiClient.get(`/ai/insights`).catch(() => ({ data: { insights: [], alerts: [] } })),
        apiClient.get(`/ai/daily-summary`).catch(() => ({ data: null })),
        apiClient.get(`/ai/forecast/revenue?periods=6`).catch(() => ({ data: null }))
      ]);
      
      setFinancialHealth(healthRes.data);
      setInsights(insightsRes.data?.insights || []);
      setAlerts(insightsRes.data?.alerts || []);
      setDailySummary(summaryRes.data);
      setForecast(forecastRes.data);
      
      // Process revenue data for chart
      if (forecastRes.data?.historical_data) {
        setRevenueData(forecastRes.data.historical_data.map(d => ({
          name: d.period,
          revenue: d.revenue || d.value || 0
        })));
      }
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);
  
  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };
  
  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };
  
  const getScoreBgColor = (score) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-muted-foreground">{language === 'ar' ? 'جاري تحميل لوحة التحكم الذكية...' : 'Chargement du tableau de bord intelligent...'}</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="smart-dashboard">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Brain className="h-8 w-8 text-primary" />
              {language === 'ar' ? 'لوحة التحكم الذكية' : 'Tableau de Bord Intelligent'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'تحليلات مالية متقدمة مدعومة بالذكاء الاصطناعي' : 'Analyses financières avancées alimentées par l\'IA'}
            </p>
          </div>
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            className="gap-2"
            disabled={refreshing}
            data-testid="refresh-dashboard-btn"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {language === 'ar' ? 'تحديث' : 'Actualiser'}
          </Button>
        </div>

        {/* Financial Health Score */}
        {financialHealth && (
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20" data-testid="financial-health-card">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="relative">
                    <div className={`w-24 h-24 rounded-full ${getScoreBgColor(financialHealth.overall_score)} flex items-center justify-center`}>
                      <span className="text-3xl font-bold text-white">{Math.round(financialHealth.overall_score)}</span>
                    </div>
                    <Sparkles className="absolute -top-1 -right-1 h-6 w-6 text-yellow-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">{language === 'ar' ? 'مؤشر الصحة المالية' : 'Indice de Santé Financière'}</h3>
                    <p className="text-muted-foreground">
                      {financialHealth.overall_score >= 80 
                        ? (language === 'ar' ? 'ممتاز - وضعك المالي قوي' : 'Excellent - Votre situation financière est solide')
                        : financialHealth.overall_score >= 60
                        ? (language === 'ar' ? 'جيد - مع بعض نقاط التحسين' : 'Bon - Avec quelques points à améliorer')
                        : (language === 'ar' ? 'يحتاج انتباه - راجع التوصيات' : 'Attention requise - Consultez les recommandations')
                      }
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {financialHealth.health_indicators?.map((indicator, index) => (
                    <div key={`stat-${stat.label || index}`} className="text-center">
                      <div className={`text-2xl font-bold ${
                        indicator.status === 'good' ? 'text-emerald-500' : 
                        indicator.status === 'warning' ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {typeof indicator.value === 'number' ? indicator.value.toFixed(1) : indicator.value}
                      </div>
                      <div className="text-sm text-muted-foreground">{indicator.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card data-testid="stat-revenue">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إيرادات الشهر' : 'Revenus du mois'}</p>
                  <p className="text-2xl font-bold">{formatCurrency(financialHealth?.monthly_revenue)}</p>
                </div>
                <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="stat-expenses">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'مصروفات الشهر' : 'Dépenses du mois'}</p>
                  <p className="text-2xl font-bold">{formatCurrency(financialHealth?.monthly_expenses)}</p>
                </div>
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                  <TrendingDown className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="stat-profit">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'صافي الربح' : 'Bénéfice net'}</p>
                  <p className={`text-2xl font-bold ${(financialHealth?.net_income || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(financialHealth?.net_income)}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${(financialHealth?.net_income || 0) >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  <DollarSign className={`h-6 w-6 ${(financialHealth?.net_income || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="stat-cash">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'الرصيد النقدي' : 'Solde de caisse'}</p>
                  <p className="text-2xl font-bold">{formatCurrency(financialHealth?.cash_balance)}</p>
                </div>
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <Wallet className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              {financialHealth?.cash_runway_days && (
                <p className="text-xs text-muted-foreground mt-2">
                  {language === 'ar' ? `يكفي لـ ${financialHealth.cash_runway_days} يوم` : `Suffisant pour ${financialHealth.cash_runway_days} jours`}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Chart */}
          <Card data-testid="revenue-chart">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {language === 'ar' ? 'تطور الإيرادات' : 'Évolution des Revenus'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip 
                      formatter={(value) => [formatCurrency(value), language === 'ar' ? 'الإيرادات' : 'Revenus']}
                      contentStyle={{ direction: isRTL ? 'rtl' : 'ltr' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill="url(#colorRevenue)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  {language === 'ar' ? 'لا توجد بيانات كافية' : 'Données insuffisantes'}
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Insights */}
          <Card data-testid="ai-insights">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-500" />
                {language === 'ar' ? 'رؤى الذكاء الاصطناعي' : 'Insights IA'}
              </CardTitle>
              <CardDescription>
                {language === 'ar' ? 'تحليلات وتوصيات ذكية' : 'Analyses et recommandations intelligentes'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.length > 0 ? (
                insights.slice(0, 5).map((insight, index) => (
                  <div 
                    key={`insight-${insight.id || index}`} 
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className={`p-2 rounded-full ${
                      insight.priority === 'high' || insight.priority === 'critical' 
                        ? 'bg-red-100 dark:bg-red-900/30' 
                        : insight.priority === 'medium'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30'
                        : 'bg-blue-100 dark:bg-blue-900/30'
                    }`}>
                      {insight.insight_type === 'revenue_trend' ? <TrendingUp className="h-4 w-4" /> :
                       insight.insight_type === 'expense_alert' ? <AlertTriangle className="h-4 w-4" /> :
                       insight.insight_type === 'cash_flow_risk' ? <Wallet className="h-4 w-4" /> :
                       <Sparkles className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{language === 'ar' ? insight.title_ar : insight.title}</p>
                      <p className="text-xs text-muted-foreground">{language === 'ar' ? insight.description_ar : insight.description}</p>
                    </div>
                    <Badge variant={
                      insight.priority === 'high' || insight.priority === 'critical' ? 'destructive' :
                      insight.priority === 'medium' ? 'warning' : 'secondary'
                    }>
                      {insight.priority}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Brain className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{language === 'ar' ? 'سيتم إنشاء الرؤى قريباً' : 'Les insights seront générés bientôt'}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <Card className="border-red-200 dark:border-red-800" data-testid="alerts-section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                {language === 'ar' ? 'تنبيهات تحتاج انتباهك' : 'Alertes nécessitant votre attention'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alerts.slice(0, 5).map((alert, index) => (
                  <div 
                    key={`alert-${alert.id || index}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20"
                  >
                    <div className="flex items-center gap-3">
                      <XCircle className="h-5 w-5 text-red-500" />
                      <div>
                        <p className="font-medium">{alert.title}</p>
                        <p className="text-sm text-muted-foreground">{alert.description}</p>
                      </div>
                    </div>
                    <Badge variant="destructive">{alert.severity}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Daily Summary */}
        {dailySummary && (
          <Card data-testid="daily-summary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                {language === 'ar' ? 'ملخص اليوم' : 'Résumé du Jour'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(dailySummary.revenue)}</p>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'الإيرادات' : 'Revenus'}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(dailySummary.expenses)}</p>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'المصروفات' : 'Dépenses'}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(dailySummary.net_income)}</p>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'صافي الدخل' : 'Revenu Net'}</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                  <p className="text-2xl font-bold text-purple-600">{dailySummary.transactions_count || 0}</p>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'المعاملات' : 'Transactions'}</p>
                </div>
              </div>
              
              {dailySummary.highlights?.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2">{language === 'ar' ? 'أبرز النقاط' : 'Points Clés'}</h4>
                  <ul className="space-y-2">
                    {dailySummary.highlights.map((highlight, index) => (
                      <li key={`rec-${index}`} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Forecast Section */}
        {forecast && (
          <Card data-testid="forecast-section">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {language === 'ar' ? 'التنبؤات المالية' : 'Prévisions Financières'}
                <Badge variant={forecast.trend === 'up' ? 'default' : forecast.trend === 'down' ? 'destructive' : 'secondary'}>
                  {forecast.trend === 'up' ? (language === 'ar' ? 'صاعد' : 'Hausse') :
                   forecast.trend === 'down' ? (language === 'ar' ? 'هابط' : 'Baisse') :
                   (language === 'ar' ? 'مستقر' : 'Stable')}
                </Badge>
              </CardTitle>
              <CardDescription>
                {language === 'ar' ? `مستوى الثقة: ${(forecast.confidence * 100).toFixed(0)}%` : `Niveau de confiance: ${(forecast.confidence * 100).toFixed(0)}%`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {forecast.insights?.length > 0 && (
                <div className="space-y-2">
                  {forecast.insights.map((insight, index) => (
                    <div key={`action-${index}`} className="flex items-start gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-yellow-500 mt-0.5" />
                      <span>{insight}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
