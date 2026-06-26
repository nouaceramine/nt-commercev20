import { useEffect, useState } from 'react';
import apiClient from '../../../lib/apiClient';
import { Layout } from '../../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../components/ui/table';
import { CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { formatShortDate } from '../../../utils/globalDateFormatter';
import { SaasPageHeader } from './SaasPageHeader';

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/saas/payments');
        setPayments(res.data || []);
      } catch (e) {
        toast.error(e.response?.data?.detail || 'فشل تحميل المدفوعات');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="saas-payments-page">
        <SaasPageHeader
          titleAr="المدفوعات"
          subtitleAr="سجل جميع المدفوعات والتجديدات"
          icon={CreditCard}
        />
        <Card>
          <CardHeader>
            <CardTitle>سجل المدفوعات</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
            ) : payments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground" data-testid="payments-empty">
                لا توجد مدفوعات بعد.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المشترك</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>نوع الاشتراك</TableHead>
                    <TableHead>طريقة الدفع</TableHead>
                    <TableHead>الفترة</TableHead>
                    <TableHead>التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody data-testid="payments-table">
                  {payments.map(payment => (
                    <TableRow key={payment.id} data-testid={`payment-row-${payment.id}`}>
                      <TableCell className="font-medium">{payment.tenant_name}</TableCell>
                      <TableCell>{(payment.amount || 0).toLocaleString()} دج</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {payment.subscription_type === 'monthly' ? 'شهري' :
                           payment.subscription_type === '6months' ? '6 أشهر' : 'سنوي'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {payment.payment_method === 'manual' ? 'يدوي' :
                         payment.payment_method === 'stripe' ? 'Stripe' : payment.payment_method}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatShortDate(payment.period_start)} - {formatShortDate(payment.period_end)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatShortDate(payment.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
