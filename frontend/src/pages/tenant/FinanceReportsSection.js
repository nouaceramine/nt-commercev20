import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { 
  TrendingUp, CreditCard, DollarSign, Calendar, 
  ShoppingBag, Banknote, Wallet, Receipt, Calculator 
} from 'lucide-react';

export function FinanceReportsSection({ sales, expenses }) {
  const [financeData, setFinanceData] = useState({
    total_revenue: 0,
    monthly_revenue: 0,
    yearly_revenue: 0,
    total_expenses: 0,
    net_profit: 0,
    payment_methods: {
      cash: { count: 0, amount: 0 },
      card: { count: 0, amount: 0 },
      credit: { count: 0, amount: 0 }
    }
  });
  const [dateRange, setDateRange] = useState('all');

  useEffect(() => {
    calculateFromLocalData();
  }, [sales, expenses, dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const calculateFromLocalData = () => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    let total = 0, monthly = 0, yearly = 0;
    const methods = {
      cash: { count: 0, amount: 0 },
      card: { count: 0, amount: 0 },
      credit: { count: 0, amount: 0 }
    };

    (sales || []).forEach(sale => {
      const saleDate = new Date(sale.created_at);
      const amount = sale.total || 0;
      total += amount;
      
      if (saleDate.getFullYear() === thisYear) {
        yearly += amount;
        if (saleDate.getMonth() === thisMonth) {
          monthly += amount;
        }
      }

      const method = sale.payment_method || 'cash';
      if (methods[method]) {
        methods[method].count++;
        methods[method].amount += amount;
      }
    });

    const totalExpenses = (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);

    setFinanceData({
      total_revenue: total,
      monthly_revenue: monthly,
      yearly_revenue: yearly,
      total_expenses: totalExpenses,
      net_profit: total - totalExpenses,
      payment_methods: methods
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ar-DZ').format(amount || 0) + ' دج';
  };

  return (
    <div className="space-y-6" data-testid="finance-reports-section">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          التقارير المالية الشاملة
        </h3>
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">إجمالي الإيرادات</p>
                <p className="text-xl font-bold">{formatCurrency(financeData.total_revenue)}</p>
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
                <p className="text-xl font-bold">{formatCurrency(financeData.monthly_revenue)}</p>
              </div>
              <Calendar className="h-8 w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">إيراد السنة</p>
                <p className="text-xl font-bold">{formatCurrency(financeData.yearly_revenue)}</p>
              </div>
              <TrendingUp className="h-8 w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">إجمالي المصاريف</p>
                <p className="text-xl font-bold">{formatCurrency(financeData.total_expenses)}</p>
              </div>
              <Receipt className="h-8 w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">صافي الربح</p>
                <p className="text-xl font-bold">{formatCurrency(financeData.net_profit)}</p>
              </div>
              <Calculator className="h-8 w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">عدد المبيعات</p>
                <p className="text-xl font-bold">{sales?.length || 0}</p>
              </div>
              <ShoppingBag className="h-8 w-8 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            توزيع المبيعات حسب طريقة الدفع
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Banknote className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">نقدي</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(financeData.payment_methods.cash.amount)}</p>
                  <p className="text-xs text-muted-foreground">{financeData.payment_methods.cash.count} عملية</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">بطاقة</p>
                  <p className="text-lg font-bold text-blue-600">{formatCurrency(financeData.payment_methods.card.amount)}</p>
                  <p className="text-xs text-muted-foreground">{financeData.payment_methods.card.count} عملية</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">آجل</p>
                  <p className="text-lg font-bold text-orange-600">{formatCurrency(financeData.payment_methods.credit.amount)}</p>
                  <p className="text-xs text-muted-foreground">{financeData.payment_methods.credit.count} عملية</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
