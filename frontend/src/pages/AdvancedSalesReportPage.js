import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Package, 
  Clock,
  Calendar,
  DollarSign,
  CreditCard,
  Banknote,
  Wallet,
  Download,
  Filter,
  RefreshCw,
  Eye,
  AlertTriangle,
  RotateCcw,
  User,
  ShoppingCart
} from 'lucide-react';

export default function AdvancedSalesReportPage() {
  const { language } = useLanguage();
  const { isAdmin } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState('all');
  
  // Data
  const [reportData, setReportData] = useState(null);
  const [peakHoursData, setPeakHoursData] = useState(null);
  const [returnsData, setReturnsData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [permissions, setPermissions] = useState({});

  useEffect(() => {
    fetchInitialData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchInitialData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [empRes, custRes, permRes] = await Promise.all([
        apiClient.get(`/employees`, { headers }),
        apiClient.get(`/customers`, { headers }),
        isAdmin ? apiClient.get(`/settings/sales-permissions`, { headers }).catch(() => ({ data: {} })) : Promise.resolve({ data: {} })
      ]);
      
      setEmployees(empRes.data || []);
      setCustomers(custRes.data || []);
      setPermissions(permRes.data || {});
      
      await fetchReport();
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (selectedEmployee !== 'all') params.append('employee_id', selectedEmployee);
      if (selectedCustomer !== 'all') params.append('customer_id', selectedCustomer);
      if (selectedPayment !== 'all') params.append('payment_method', selectedPayment);
      
      const [reportRes, peakRes, returnsRes] = await Promise.all([
        apiClient.get(`/sales/advanced-report?${params}`, { headers }),
        apiClient.get(`/sales/peak-hours`, { headers }),
        apiClient.get(`/sales/returns-report?${params}`, { headers })
      ]);
      
      setReportData(reportRes.data);
      setPeakHoursData(peakRes.data);
      setReturnsData(returnsRes.data);
    } catch (error) {
      console.error('Error fetching report:', error);
      toast.error(language === 'ar' ? 'خطأ في جلب التقرير' : 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ar-DZ').format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getPaymentMethodLabel = (method) => {
    const labels = {
      cash: language === 'ar' ? 'نقدي' : 'Cash',
      bank: language === 'ar' ? 'تحويل' : 'Virement',
      wallet: language === 'ar' ? 'محفظة' : 'Portefeuille'
    };
    return labels[method] || method;
  };

  const getPaymentMethodIcon = (method) => {
    switch (method) {
      case 'cash': return <Banknote className="h-4 w-4" />;
      case 'bank': return <CreditCard className="h-4 w-4" />;
      case 'wallet': return <Wallet className="h-4 w-4" />;
      default: return <DollarSign className="h-4 w-4" />;
    }
  };

  if (loading && !reportData) {
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
      <div className="space-y-6" data-testid="advanced-sales-report">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-primary" />
              {language === 'ar' ? 'تقارير المبيعات المتقدمة' : 'Rapports Avancés des Ventes'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'تتبع وتحليل شامل للمبيعات' : 'Suivi et analyse complète des ventes'}
            </p>
          </div>
          <Button onClick={fetchReport} disabled={loading}>
            <RefreshCw className={`h-4 w-4 me-2 ${loading ? 'animate-spin' : ''}`} />
            {language === 'ar' ? 'تحديث' : 'Actualiser'}
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              {language === 'ar' ? 'تصفية' : 'Filtres'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <Label>{language === 'ar' ? 'من تاريخ' : 'Du'}</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>{language === 'ar' ? 'إلى تاريخ' : 'Au'}</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div>
                <Label>{language === 'ar' ? 'الموظف' : 'Employé'}</Label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'ar' ? 'الكل' : 'Tous'}</SelectItem>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{language === 'ar' ? 'الزبون' : 'Client'}</Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'ar' ? 'الكل' : 'Tous'}</SelectItem>
                    {customers.map(cust => (
                      <SelectItem key={cust.id} value={cust.id}>{cust.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{language === 'ar' ? 'طريقة الدفع' : 'Mode paiement'}</Label>
                <Select value={selectedPayment} onValueChange={setSelectedPayment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'ar' ? 'الكل' : 'Tous'}</SelectItem>
                    <SelectItem value="cash">{language === 'ar' ? 'نقدي' : 'Cash'}</SelectItem>
                    <SelectItem value="bank">{language === 'ar' ? 'تحويل' : 'Virement'}</SelectItem>
                    <SelectItem value="wallet">{language === 'ar' ? 'محفظة' : 'Portefeuille'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4">
              <Button onClick={fetchReport}>
                <Filter className="h-4 w-4 me-2" />
                {language === 'ar' ? 'تطبيق الفلتر' : 'Appliquer'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">
              <TrendingUp className="h-4 w-4 me-2" />
              {language === 'ar' ? 'نظرة عامة' : 'Aperçu'}
            </TabsTrigger>
            <TabsTrigger value="employees">
              <Users className="h-4 w-4 me-2" />
              {language === 'ar' ? 'الموظفين' : 'Employés'}
            </TabsTrigger>
            <TabsTrigger value="products">
              <Package className="h-4 w-4 me-2" />
              {language === 'ar' ? 'المنتجات' : 'Produits'}
            </TabsTrigger>
            <TabsTrigger value="peak-hours">
              <Clock className="h-4 w-4 me-2" />
              {language === 'ar' ? 'ساعات الذروة' : 'Heures de pointe'}
            </TabsTrigger>
            <TabsTrigger value="returns">
              <RotateCcw className="h-4 w-4 me-2" />
              {language === 'ar' ? 'المرتجعات' : 'Retours'}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'إجمالي المبيعات' : 'Total Ventes'}
                      </p>
                      <p className="text-2xl font-bold">{reportData?.statistics?.total_sales || 0}</p>
                    </div>
                    <ShoppingCart className="h-8 w-8 text-blue-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenus'}
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(reportData?.statistics?.total_amount)} دج
                      </p>
                    </div>
                    <DollarSign className="h-8 w-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'صافي الربح' : 'Bénéfice Net'}
                      </p>
                      <p className="text-2xl font-bold text-emerald-600">
                        {formatCurrency(reportData?.statistics?.total_profit)} دج
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-emerald-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'الديون المتبقية' : 'Créances'}
                      </p>
                      <p className="text-2xl font-bold text-amber-600">
                        {formatCurrency(reportData?.statistics?.total_remaining)} دج
                      </p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-amber-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Payment Methods */}
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'حسب طريقة الدفع' : 'Par mode de paiement'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(reportData?.by_payment_method || {}).map(([method, data]) => (
                    <div key={method} className="p-4 bg-muted rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getPaymentMethodIcon(method)}
                        <div>
                          <p className="font-medium">{getPaymentMethodLabel(method)}</p>
                          <p className="text-sm text-muted-foreground">{data.count} {language === 'ar' ? 'عملية' : 'ventes'}</p>
                        </div>
                      </div>
                      <p className="font-bold text-green-600">{formatCurrency(data.total)} دج</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Sales */}
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'آخر المبيعات' : 'Dernières ventes'}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الموظف' : 'Employé'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الزبون' : 'Client'}</TableHead>
                      <TableHead>{language === 'ar' ? 'طريقة الدفع' : 'Paiement'}</TableHead>
                      <TableHead>{language === 'ar' ? 'المجموع' : 'Total'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData?.sales || []).slice(0, 10).map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="text-sm">{formatDate(sale.created_at)}</TableCell>
                        <TableCell>{sale.employee_name || '-'}</TableCell>
                        <TableCell>{sale.customer_name || (language === 'ar' ? 'زبون عابر' : 'Client passant')}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getPaymentMethodIcon(sale.payment_method)}
                            {getPaymentMethodLabel(sale.payment_method)}
                          </div>
                        </TableCell>
                        <TableCell className="font-bold">{formatCurrency(sale.total)} دج</TableCell>
                        <TableCell>
                          {sale.status === 'paid' ? (
                            <Badge className="bg-green-100 text-green-700">{language === 'ar' ? 'مدفوع' : 'Payé'}</Badge>
                          ) : sale.status === 'partial' ? (
                            <Badge className="bg-amber-100 text-amber-700">{language === 'ar' ? 'جزئي' : 'Partiel'}</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700">{language === 'ar' ? 'غير مدفوع' : 'Impayé'}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Employees Tab */}
          <TabsContent value="employees" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'مبيعات الموظفين' : 'Ventes par employé'}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'ar' ? 'الموظف' : 'Employé'}</TableHead>
                      <TableHead>{language === 'ar' ? 'عدد المبيعات' : 'Nombre'}</TableHead>
                      <TableHead>{language === 'ar' ? 'إجمالي المبيعات' : 'Total'}</TableHead>
                      <TableHead>{language === 'ar' ? 'المتوسط' : 'Moyenne'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData?.by_employee || []).map((emp, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {emp.name}
                          </div>
                        </TableCell>
                        <TableCell>{emp.count}</TableCell>
                        <TableCell className="font-bold text-green-600">{formatCurrency(emp.total)} دج</TableCell>
                        <TableCell>{formatCurrency(emp.total / emp.count)} دج</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'المنتجات الأكثر مبيعاً' : 'Produits les plus vendus'}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>{language === 'ar' ? 'المنتج' : 'Produit'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الكمية المباعة' : 'Quantité'}</TableHead>
                      <TableHead>{language === 'ar' ? 'إجمالي الإيرادات' : 'Revenus'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reportData?.top_products || []).map((product, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge variant="outline">{idx + 1}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            {product.name}
                          </div>
                        </TableCell>
                        <TableCell>{product.quantity}</TableCell>
                        <TableCell className="font-bold text-green-600">{formatCurrency(product.total)} دج</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Peak Hours Tab */}
          <TabsContent value="peak-hours" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>{language === 'ar' ? 'المبيعات حسب الساعة' : 'Ventes par heure'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(peakHoursData?.by_hour || {}).map(([hour, data]) => (
                      <div key={hour} className="flex items-center gap-2">
                        <span className="w-12 text-sm font-mono">{hour}:00</span>
                        <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                          <div 
                            className="bg-primary h-full transition-all"
                            style={{ width: `${Math.min(100, (data.count / Math.max(...Object.values(peakHoursData?.by_hour || {}).map(d => d.count || 1))) * 100)}%` }}
                          />
                        </div>
                        <span className="w-20 text-sm text-end">{data.count} ({formatCurrency(data.total)})</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{language === 'ar' ? 'المبيعات حسب اليوم' : 'Ventes par jour'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(peakHoursData?.by_day || []).map((day, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="font-medium">{language === 'ar' ? day.name_ar : day.name_en}</span>
                        <div className="text-end">
                          <p className="font-bold">{formatCurrency(day.total)} دج</p>
                          <p className="text-sm text-muted-foreground">{day.count} {language === 'ar' ? 'عملية' : 'ventes'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Returns Tab */}
          <TabsContent value="returns" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'إجمالي المرتجعات' : 'Total Retours'}
                      </p>
                      <p className="text-2xl font-bold">{returnsData?.statistics?.total_returns || 0}</p>
                    </div>
                    <RotateCcw className="h-8 w-8 text-red-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'قيمة المرتجعات' : 'Valeur Retours'}
                      </p>
                      <p className="text-2xl font-bold text-red-600">
                        {formatCurrency(returnsData?.statistics?.total_amount)} دج
                      </p>
                    </div>
                    <DollarSign className="h-8 w-8 text-red-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'سجل المرتجعات' : 'Historique des retours'}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الزبون' : 'Client'}</TableHead>
                      <TableHead>{language === 'ar' ? 'السبب' : 'Raison'}</TableHead>
                      <TableHead>{language === 'ar' ? 'المبلغ' : 'Montant'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(returnsData?.returns || []).map((ret) => (
                      <TableRow key={ret.id}>
                        <TableCell>{formatDate(ret.returned_at || ret.created_at)}</TableCell>
                        <TableCell>{ret.customer_name || '-'}</TableCell>
                        <TableCell>{ret.return_reason || (language === 'ar' ? 'غير محدد' : 'Non spécifié')}</TableCell>
                        <TableCell className="font-bold text-red-600">{formatCurrency(ret.total)} دج</TableCell>
                      </TableRow>
                    ))}
                    {(!returnsData?.returns || returnsData.returns.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          {language === 'ar' ? 'لا توجد مرتجعات' : 'Aucun retour'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
