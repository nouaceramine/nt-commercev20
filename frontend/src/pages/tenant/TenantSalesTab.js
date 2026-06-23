import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { Plus } from 'lucide-react';

export function TenantSalesTab({ sales, goToMainApp, formatCurrency }) {
  return (
    <div className="space-y-4" data-testid="tenant-sales-tab">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">سجل المبيعات ({sales.length})</h3>
        <Button onClick={goToMainApp}>
          <Plus className="h-4 w-4 me-2" />
          بيع جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الفاتورة</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>طريقة الدفع</TableHead>
                <TableHead>التاريخ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.slice(0, 20).map(sale => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium">#{sale.invoice_number || sale.id?.slice(-6)}</TableCell>
                  <TableCell>{sale.customer_name || 'عميل نقدي'}</TableCell>
                  <TableCell className="font-bold text-green-600">{formatCurrency(sale.total)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{sale.payment_method || 'نقدي'}</Badge>
                  </TableCell>
                  <TableCell>{new Date(sale.created_at).toLocaleDateString('ar-DZ')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {sales.length === 0 && (
            <p className="text-center text-muted-foreground py-8">لا توجد مبيعات</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
