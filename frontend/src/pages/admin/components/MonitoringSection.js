import { useState, useEffect } from 'react';
import apiClient from '../../../lib/apiClient';
import { formatDateTime } from '../../../utils/globalDateFormatter';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
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
import { toast } from 'sonner';
import { 
  Users, Package, AlertTriangle, DollarSign,
  RefreshCw, Bell, Activity, ShoppingCart, UserCheck
} from 'lucide-react';

export const MonitoringSection = () => {
  const [monitoringData, setMonitoringData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('products_count');

  useEffect(() => { fetchMonitoring(); }, []);

  const fetchMonitoring = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/saas/monitoring`);
      setMonitoringData(res.data);
    } catch (err) {
      toast.error('فشل تحميل بيانات المراقبة');
    }
    setLoading(false);
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  if (!monitoringData) return null;

  const { tenants, summary, alerts = [] } = monitoringData;
  const sorted = [...tenants].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));

  const formatDate = (d) => {
    if (!d) return '—';
    try { return formatDateTime(d); }
    catch { return '—'; }
  };

  const severityStyles = {
    critical: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  const severityIcon = {
    critical: <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />,
    warning: <Bell className="h-4 w-4 text-amber-500 shrink-0" />,
    info: <Activity className="h-4 w-4 text-blue-500 shrink-0" />,
  };

  return (
    <div className="space-y-6">
      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="space-y-2" data-testid="monitoring-alerts">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Bell className="h-4 w-4" /> التنبيهات ({alerts.length})
          </h3>
          <div className="grid gap-2">
            {alerts.map((alert, i) => (
              <div key={alert.message || `alert-${i}`} className={`flex items-center gap-3 p-3 rounded-lg border ${severityStyles[alert.severity] || severityStyles.info}`}>
                {severityIcon[alert.severity]}
                <span className="text-sm font-medium">{alert.message}</span>
                {alert.days_left !== undefined && alert.days_left > 0 && (
                  <Badge variant="outline" className="mr-auto text-xs">{alert.days_left} يوم</Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="p-4 text-center">
          <Users className="h-5 w-5 mx-auto mb-1 text-blue-500" />
          <p className="text-2xl font-bold">{summary.total_tenants}</p>
          <p className="text-xs text-muted-foreground">إجمالي المشتركين</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <UserCheck className="h-5 w-5 mx-auto mb-1 text-green-500" />
          <p className="text-2xl font-bold text-green-600">{summary.active_tenants}</p>
          <p className="text-xs text-muted-foreground">نشط</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Package className="h-5 w-5 mx-auto mb-1 text-purple-500" />
          <p className="text-2xl font-bold">{summary.total_products}</p>
          <p className="text-xs text-muted-foreground">إجمالي المنتجات</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Users className="h-5 w-5 mx-auto mb-1 text-indigo-500" />
          <p className="text-2xl font-bold">{summary.total_customers}</p>
          <p className="text-xs text-muted-foreground">إجمالي العملاء</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <ShoppingCart className="h-5 w-5 mx-auto mb-1 text-amber-500" />
          <p className="text-2xl font-bold">{summary.total_sales}</p>
          <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <DollarSign className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
          <p className="text-2xl font-bold">{(summary.total_revenue || 0).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">إجمالي الإيراد (دج)</p>
        </CardContent></Card>
      </div>

      {/* Sort & Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">ترتيب حسب:</span>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="products_count">المنتجات</SelectItem>
              <SelectItem value="customers_count">العملاء</SelectItem>
              <SelectItem value="sales_count">المبيعات</SelectItem>
              <SelectItem value="total_revenue">الإيراد</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={fetchMonitoring}>
          <RefreshCw className="h-4 w-4 ml-1" /> تحديث
        </Button>
      </div>

      {/* Tenant Details Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">المشترك</TableHead>
              <TableHead className="text-center">الحالة</TableHead>
              <TableHead className="text-center">المنتجات</TableHead>
              <TableHead className="text-center">العملاء</TableHead>
              <TableHead className="text-center">المبيعات</TableHead>
              <TableHead className="text-center">الإيراد (دج)</TableHead>
              <TableHead className="text-center">المستخدمين</TableHead>
              <TableHead className="text-center">آخر نشاط</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(t => (
              <TableRow key={t.tenant_id} data-testid={`monitoring-row-${t.tenant_id}`}>
                <TableCell className="text-right">
                  <div>
                    <p className="font-medium">{t.tenant_name}</p>
                    <p className="text-xs text-muted-foreground">{t.email}</p>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={t.is_active ? "default" : "destructive"} className={t.is_active ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}>
                    {t.is_active ? 'نشط' : 'معطل'}
                  </Badge>
                </TableCell>
                <TableCell className="text-center font-medium">{t.products_count}</TableCell>
                <TableCell className="text-center font-medium">{t.customers_count}</TableCell>
                <TableCell className="text-center font-medium">{t.sales_count}</TableCell>
                <TableCell className="text-center font-medium">{(t.total_revenue || 0).toLocaleString()}</TableCell>
                <TableCell className="text-center">{t.users_count}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{formatDate(t.last_activity)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
