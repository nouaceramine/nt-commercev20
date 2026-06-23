import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Package, 
  Users, 
  DollarSign, 
  Download,
  ShoppingBag,
  ShoppingCart,
  Wallet,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  Receipt,
  Calendar,
  Target
} from 'lucide-react';

export default function ReportsPage() {
  const { t, language } = useLanguage();
  const [salesData, setSalesData] = useState([]);
  const [purchasesData, setPurchasesData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [topCustomers, setTopCustomers] = useState([]);
  const [profitData, setProfitData] = useState(null);
  const [period, setPeriod] = useState('30');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Extended data
  const [allSales, setAllSales] = useState([]);
  const [allPurchases, setAllPurchases] = useState([]);
  const [cashBoxes, setCashBoxes] = useState([]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [salesRes, productsRes, customersRes, profitRes, allSalesRes, allPurchasesRes, cashRes] = await Promise.all([
        apiClient.get(`/reports/sales-chart?days=${period}`),
        apiClient.get(`/reports/top-products?limit=10`),
        apiClient.get(`/reports/top-customers?limit=10`),
        apiClient.get(`/reports/profit?days=${period}`),
        apiClient.get(`/sales`),
        apiClient.get(`/purchases`),
        apiClient.get(`/cash-boxes`)
      ]);
      setSalesData(salesRes.data);
      setTopProducts(productsRes.data);
      setTopCustomers(customersRes.data);
      setProfitData(profitRes.data);
      setAllSales(allSalesRes.data);
      setAllPurchases(allPurchasesRes.data);
      setCashBoxes(cashRes.data);

      // Calculate purchases data by date
      const purchasesByDate = {};
      allPurchasesRes.data.forEach(p => {
        const date = new Date(p.created_at).toISOString().split('T')[0];
        if (!purchasesByDate[date]) {
          purchasesByDate[date] = { date, total: 0, count: 0 };
        }
        purchasesByDate[date].total += p.total;
        purchasesByDate[date].count += 1;
      });
      setPurchasesData(Object.values(purchasesByDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-parseInt(period)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchReports(); }, [period]);

  const handleBackup = async () => {
    try {
      window.open(`/backup/create`, '_blank');
    } catch (e) { console.error(e); }
  };

  const handleExportProducts = () => {
    window.open(`/products/export/excel`, '_blank');
  };

  // Calculate totals
  const totalSales = allSales.reduce((sum, s) => sum + s.total, 0);
  const totalPurchases = allPurchases.reduce((sum, p) => sum + p.total, 0);
  const netProfit = totalSales - totalPurchases;
  const profitPercentage = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : 0;
  
  const totalCashBalance = cashBoxes.reduce((sum, box) => sum + (box.balance || 0), 0);
  
  // Sales vs Purchases comparison
  const salesCount = allSales.length;
  const purchasesCount = allPurchases.length;
  
  // Debts
  const customerDebts = allSales.filter(s => s.remaining > 0).reduce((sum, s) => sum + s.remaining, 0);
  const supplierDebts = allPurchases.filter(p => p.remaining > 0).reduce((sum, p) => sum + p.remaining, 0);

  const maxSales = Math.max(...salesData.map(d => d.total), 1);
  const maxPurchases = Math.max(...purchasesData.map(d => d.total), 1);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'fr-FR', {
      month: 'short',
      day: 'numeric'
    }).format(date);
  };

  if (loading) return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="reports-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t.reports}</h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'تحليل الأداء المالي والمبيعات' : 'Analyse des performances financières et des ventes'}
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t.last7Days}</SelectItem>
                <SelectItem value="30">{t.last30Days}</SelectItem>
                <SelectItem value="90">{language === 'ar' ? 'آخر 3 أشهر' : '3 derniers mois'}</SelectItem>
                <SelectItem value="365">{language === 'ar' ? 'السنة' : 'Cette année'}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExportProducts} className="gap-2">
              <Download className="h-4 w-4" />{t.exportExcel}
            </Button>
          </div>
        </div>

        {/* Main KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Net Profit */}
          <Card className={netProfit >= 0 ? 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200' : 'bg-gradient-to-br from-red-50 to-red-100 border-red-200'}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">
                    {language === 'ar' ? 'صافي الربح' : 'Bénéfice net'}
                  </p>
                  <p className={`text-3xl font-bold mt-1 ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {netProfit.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t.currency}</p>
                </div>
                <div className={`p-4 rounded-2xl ${netProfit >= 0 ? 'bg-emerald-200/50' : 'bg-red-200/50'}`}>
                  {netProfit >= 0 ? (
                    <TrendingUp className="h-8 w-8 text-emerald-600" />
                  ) : (
                    <TrendingDown className="h-8 w-8 text-red-600" />
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1 text-sm">
                {netProfit >= 0 ? (
                  <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-red-600" />
                )}
                <span className={netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {profitPercentage}%
                </span>
                <span className="text-muted-foreground">
                  {language === 'ar' ? 'هامش الربح' : 'marge'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Total Sales */}
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">
                    {language === 'ar' ? 'إجمالي المبيعات' : 'Total ventes'}
                  </p>
                  <p className="text-3xl font-bold mt-1 text-blue-700">{totalSales.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{t.currency}</p>
                </div>
                <div className="p-4 rounded-2xl bg-blue-200/50">
                  <ShoppingCart className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                <span className="font-semibold text-blue-600">{salesCount}</span> {language === 'ar' ? 'عملية بيع' : 'ventes'}
              </div>
            </CardContent>
          </Card>

          {/* Total Purchases */}
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">
                    {language === 'ar' ? 'إجمالي المشتريات' : 'Total achats'}
                  </p>
                  <p className="text-3xl font-bold mt-1 text-orange-700">{totalPurchases.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{t.currency}</p>
                </div>
                <div className="p-4 rounded-2xl bg-orange-200/50">
                  <ShoppingBag className="h-8 w-8 text-orange-600" />
                </div>
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                <span className="font-semibold text-orange-600">{purchasesCount}</span> {language === 'ar' ? 'عملية شراء' : 'achats'}
              </div>
            </CardContent>
          </Card>

          {/* Cash Balance */}
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">
                    {language === 'ar' ? 'رصيد الصناديق' : 'Solde caisses'}
                  </p>
                  <p className="text-3xl font-bold mt-1 text-purple-700">{totalCashBalance.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{t.currency}</p>
                </div>
                <div className="p-4 rounded-2xl bg-purple-200/50">
                  <Wallet className="h-8 w-8 text-purple-600" />
                </div>
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                <span className="font-semibold text-purple-600">{cashBoxes.length}</span> {language === 'ar' ? 'صندوق' : 'caisses'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Debts Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-amber-200 bg-amber-50/30">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100">
                  <ArrowUpRight className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'مستحقات من الزبائن' : 'Créances clients'}</p>
                  <p className="text-xl font-bold text-amber-700">{customerDebts.toFixed(2)} {t.currency}</p>
                </div>
              </div>
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                {allSales.filter(s => s.remaining > 0).length} {language === 'ar' ? 'فاتورة' : 'factures'}
              </Badge>
            </CardContent>
          </Card>

          <Card className="border-red-200 bg-red-50/30">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100">
                  <ArrowDownRight className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'ديون للموردين' : 'Dettes fournisseurs'}</p>
                  <p className="text-xl font-bold text-red-700">{supplierDebts.toFixed(2)} {t.currency}</p>
                </div>
              </div>
              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">
                {allPurchases.filter(p => p.remaining > 0).length} {language === 'ar' ? 'فاتورة' : 'factures'}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for detailed reports */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="overview" className="gap-2">
              <PieChart className="h-4 w-4" />
              {language === 'ar' ? 'نظرة عامة' : 'Aperçu'}
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              {language === 'ar' ? 'المبيعات' : 'Ventes'}
            </TabsTrigger>
            <TabsTrigger value="purchases" className="gap-2">
              <ShoppingBag className="h-4 w-4" />
              {language === 'ar' ? 'المشتريات' : 'Achats'}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Sales vs Purchases Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  {language === 'ar' ? 'المبيعات مقابل المشتريات' : 'Ventes vs Achats'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar' ? 'مقارنة يومية' : 'Comparaison quotidienne'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {salesData.map((day, idx) => {
                    const purchaseDay = purchasesData.find(p => p.date === day.date);
                    const dayProfit = day.total - (purchaseDay?.total || 0);
                    return (
                      <div key={idx} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium w-24">{formatDate(day.date)}</span>
                          <div className="flex items-center gap-4">
                            <span className="text-blue-600">{day.total?.toFixed(0)} {t.currency}</span>
                            <span className="text-orange-600">-{purchaseDay?.total?.toFixed(0) || 0} {t.currency}</span>
                            <span className={`font-semibold ${dayProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              = {dayProfit.toFixed(0)} {t.currency}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 h-6">
                          <div 
                            className="bg-blue-500 rounded-s-lg transition-all"
                            style={{ width: `${(day.total / Math.max(maxSales, maxPurchases)) * 50}%` }}
                          />
                          <div 
                            className="bg-orange-500 rounded-e-lg transition-all"
                            style={{ width: `${((purchaseDay?.total || 0) / Math.max(maxSales, maxPurchases)) * 50}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-center gap-6 mt-6 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-500" />
                    <span className="text-sm">{language === 'ar' ? 'المبيعات' : 'Ventes'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-orange-500" />
                    <span className="text-sm">{language === 'ar' ? 'المشتريات' : 'Achats'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top Products */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {t.topProducts}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {topProducts.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">{t.noProducts}</p>
                  ) : (
                    <div className="space-y-3">
                      {topProducts.slice(0, 5).map((product, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">{idx + 1}</span>
                            <span className="font-medium">{product.product_name}</span>
                          </div>
                          <div className="text-end">
                            <p className="font-bold">{product.total_revenue?.toFixed(2)} {t.currency}</p>
                            <p className="text-xs text-muted-foreground">{product.total_quantity} {t.quantity}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Customers */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {t.topCustomers}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {topCustomers.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">{t.noCustomers}</p>
                  ) : (
                    <div className="space-y-3">
                      {topCustomers.slice(0, 5).map((customer, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">{idx + 1}</span>
                            <span className="font-medium">{customer.name}</span>
                          </div>
                          <div className="text-end">
                            <p className="font-bold">{customer.total_purchases?.toFixed(2)} {t.currency}</p>
                            {customer.balance > 0 && <p className="text-xs text-amber-600">{t.balance}: {customer.balance?.toFixed(2)}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Sales Tab */}
          <TabsContent value="sales" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  {language === 'ar' ? 'سجل المبيعات' : 'Historique des ventes'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'الفاتورة' : 'Facture'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الزبون' : 'Client'}</TableHead>
                        <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الإجمالي' : 'Total'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allSales.slice(0, 20).map(sale => (
                        <TableRow key={sale.id}>
                          <TableCell className="font-medium">{sale.invoice_number}</TableCell>
                          <TableCell>{sale.customer_name || (language === 'ar' ? 'عميل نقدي' : 'Client comptant')}</TableCell>
                          <TableCell>{formatDate(sale.created_at)}</TableCell>
                          <TableCell className="font-semibold">{sale.total?.toFixed(2)} {t.currency}</TableCell>
                          <TableCell>
                            <Badge className={
                              sale.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                              sale.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }>
                              {sale.status === 'paid' ? t.paid : sale.status === 'partial' ? t.partial : t.unpaid}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Purchases Tab */}
          <TabsContent value="purchases" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  {language === 'ar' ? 'سجل المشتريات' : 'Historique des achats'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'الفاتورة' : 'Facture'}</TableHead>
                        <TableHead>{language === 'ar' ? 'المورد' : 'Fournisseur'}</TableHead>
                        <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الإجمالي' : 'Total'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allPurchases.slice(0, 20).map(purchase => (
                        <TableRow key={purchase.id}>
                          <TableCell className="font-medium">{purchase.invoice_number}</TableCell>
                          <TableCell>{purchase.supplier_name}</TableCell>
                          <TableCell>{formatDate(purchase.created_at)}</TableCell>
                          <TableCell className="font-semibold">{purchase.total?.toFixed(2)} {t.currency}</TableCell>
                          <TableCell>
                            <Badge className={
                              purchase.status === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                              purchase.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }>
                              {purchase.status === 'paid' ? t.paid : purchase.status === 'partial' ? t.partial : t.unpaid}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Backup Button */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{language === 'ar' ? 'نسخ احتياطي' : 'Sauvegarde'}</p>
              <p className="text-sm text-muted-foreground">
                {language === 'ar' ? 'تحميل نسخة احتياطية من جميع البيانات' : 'Télécharger une sauvegarde de toutes les données'}
              </p>
            </div>
            <Button variant="outline" onClick={handleBackup} className="gap-2">
              <Download className="h-4 w-4" />
              {t.backup}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
