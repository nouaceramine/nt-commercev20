import { useState, useEffect } from 'react';
import apiClient from '../../../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { 
  Building, CreditCard, TrendingUp, Clock,
  DollarSign, Calendar, Banknote, Wallet, PiggyBank,
  FileText, ArrowUpRight, ArrowDownRight, Calculator
} from 'lucide-react';

export const FinanceReportsSection = ({ tenants, payments }) => {
  const [financeData, setFinanceData] = useState({
    total_revenue: 0,
    monthly_revenue: 0,
    yearly_revenue: 0,
    pending_payments: 0,
    net_profit: 0,
    expenses: 0,
    payment_methods: {
      cash: { count: 0, amount: 0 },
      ccp: { count: 0, amount: 0 },
      bank_transfer: { count: 0, amount: 0 },
      stripe: { count: 0, amount: 0 }
    },
    monthly_breakdown: []
  });
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('all');

  useEffect(() => {
    fetchFinanceData();
  }, [dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFinanceData = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/saas/finance-reports?range=${dateRange}`);
      setFinanceData(response.data);
    } catch (error) {
      console.error('Error fetching finance data:', error);
      calculateFromLocalData();
    } finally {
      setLoading(false);
    }
  };

  const calculateFromLocalData = () => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    let total = 0, monthly = 0, yearly = 0;
    const methods = {
      cash: { count: 0, amount: 0 },
      ccp: { count: 0, amount: 0 },
      bank_transfer: { count: 0, amount: 0 },
      stripe: { count: 0, amount: 0 },
      manual: { count: 0, amount: 0 }
    };

    payments.forEach(p => {
      total += p.amount;
      const pDate = new Date(p.created_at);
      if (pDate.getMonth() === thisMonth && pDate.getFullYear() === thisYear) {
        monthly += p.amount;
      }
      if (pDate.getFullYear() === thisYear) {
        yearly += p.amount;
      }
      const method = p.payment_method || 'manual';
      if (methods[method]) {
        methods[method].count++;
        methods[method].amount += p.amount;
      }
    });

    const expenses = total * 0.3;
    const net_profit = total - expenses;

    setFinanceData({
      total_revenue: total,
      monthly_revenue: monthly,
      yearly_revenue: yearly,
      pending_payments: 0,
      net_profit: net_profit,
      expenses: expenses,
      payment_methods: methods,
      monthly_breakdown: []
    });
  };

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          التقارير المالية الشاملة
        </h2>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الوقت</SelectItem>
            <SelectItem value="today">اليوم</SelectItem>
            <SelectItem value="week">هذا الأسبوع</SelectItem>
            <SelectItem value="month">هذا الشهر</SelectItem>
            <SelectItem value="year">هذه السنة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">إجمالي الإيرادات</p>
                <p className="text-xl font-bold">{financeData.total_revenue?.toLocaleString()} دج</p>
              </div>
              <DollarSign className="h-8 w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">إيراد الشهر</p>
                <p className="text-xl font-bold">{financeData.monthly_revenue?.toLocaleString()} دج</p>
              </div>
              <TrendingUp className="h-8 w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">إيراد السنة</p>
                <p className="text-xl font-bold">{financeData.yearly_revenue?.toLocaleString()} دج</p>
              </div>
              <Calendar className="h-8 w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">المصاريف</p>
                <p className="text-xl font-bold">{financeData.expenses?.toLocaleString()} دج</p>
              </div>
              <ArrowDownRight className="h-8 w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">صافي الربح</p>
                <p className="text-xl font-bold">{financeData.net_profit?.toLocaleString()} دج</p>
              </div>
              <PiggyBank className="h-8 w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">مدفوعات معلقة</p>
                <p className="text-xl font-bold">{financeData.pending_payments?.toLocaleString()} دج</p>
              </div>
              <Clock className="h-8 w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Methods Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            طرق الدفع
          </CardTitle>
          <CardDescription>توزيع المدفوعات حسب طريقة الدفع</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                  <Banknote className="h-5 w-5 text-green-600" />
                </div>
                <span className="font-medium">نقدي (CCP)</span>
              </div>
              <p className="text-2xl font-bold">{financeData.payment_methods?.ccp?.amount?.toLocaleString() || 0} دج</p>
              <p className="text-sm text-muted-foreground">{financeData.payment_methods?.ccp?.count || 0} عملية</p>
            </div>
            <div className="p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                  <Building className="h-5 w-5 text-blue-600" />
                </div>
                <span className="font-medium">تحويل بنكي</span>
              </div>
              <p className="text-2xl font-bold">{financeData.payment_methods?.bank_transfer?.amount?.toLocaleString() || 0} دج</p>
              <p className="text-sm text-muted-foreground">{financeData.payment_methods?.bank_transfer?.count || 0} عملية</p>
            </div>
            <div className="p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                  <CreditCard className="h-5 w-5 text-purple-600" />
                </div>
                <span className="font-medium">Stripe</span>
              </div>
              <p className="text-2xl font-bold">{financeData.payment_methods?.stripe?.amount?.toLocaleString() || 0} دج</p>
              <p className="text-sm text-muted-foreground">{financeData.payment_methods?.stripe?.count || 0} عملية</p>
            </div>
            <div className="p-4 rounded-xl border bg-muted/30">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900">
                  <Wallet className="h-5 w-5 text-amber-600" />
                </div>
                <span className="font-medium">نقدي / يدوي</span>
              </div>
              <p className="text-2xl font-bold">{(financeData.payment_methods?.cash?.amount || 0) + (financeData.payment_methods?.manual?.amount || 0)} دج</p>
              <p className="text-sm text-muted-foreground">{(financeData.payment_methods?.cash?.count || 0) + (financeData.payment_methods?.manual?.count || 0)} عملية</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profit Calculation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5" />
            حساب الأرباح الصافية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-green-50 dark:bg-green-950/30">
              <div className="flex items-center gap-3">
                <ArrowUpRight className="h-6 w-6 text-green-500" />
                <span className="font-medium">إجمالي الإيرادات</span>
              </div>
              <span className="text-xl font-bold text-green-600">+{financeData.total_revenue?.toLocaleString()} دج</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-red-50 dark:bg-red-950/30">
              <div className="flex items-center gap-3">
                <ArrowDownRight className="h-6 w-6 text-red-500" />
                <span className="font-medium">إجمالي المصاريف (تقديري 30%)</span>
              </div>
              <span className="text-xl font-bold text-red-600">-{financeData.expenses?.toLocaleString()} دج</span>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10">
                <div className="flex items-center gap-3">
                  <PiggyBank className="h-6 w-6 text-primary" />
                  <span className="font-bold text-lg">صافي الربح</span>
                </div>
                <span className="text-2xl font-bold text-primary">{financeData.net_profit?.toLocaleString()} دج</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              * المصاريف تقديرية، يمكنك إدخال المصاريف الفعلية للحصول على نتائج أدق
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tenants Revenue Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            تفاصيل الإيرادات حسب المشترك
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المشترك</TableHead>
                <TableHead>الخطة</TableHead>
                <TableHead>طريقة الدفع</TableHead>
                <TableHead>إجمالي المدفوعات</TableHead>
                <TableHead>آخر دفعة</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.slice(0, 10).map(tenant => {
                const tenantPayments = payments.filter(p => p.tenant_id === tenant.id);
                const totalPaid = tenantPayments.reduce((sum, p) => sum + p.amount, 0);
                const lastPayment = tenantPayments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                
                return (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{tenant.company_name || tenant.name}</p>
                        <p className="text-sm text-muted-foreground">{tenant.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{tenant.plan_name || 'غير محدد'}</Badge>
                    </TableCell>
                    <TableCell>
                      {lastPayment?.payment_method === 'ccp' && 'CCP'}
                      {lastPayment?.payment_method === 'bank_transfer' && 'تحويل بنكي'}
                      {lastPayment?.payment_method === 'stripe' && 'Stripe'}
                      {lastPayment?.payment_method === 'manual' && 'يدوي'}
                      {!lastPayment && '-'}
                    </TableCell>
                    <TableCell className="font-semibold">{totalPaid.toLocaleString()} دج</TableCell>
                    <TableCell className="text-sm">
                      {lastPayment ? new Date(lastPayment.created_at).toLocaleDateString('ar-SA') : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tenant.status === 'active' ? 'default' : 'secondary'}>
                        {tenant.status === 'active' ? 'نشط' : tenant.status === 'trial' ? 'تجريبي' : 'معلق'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
