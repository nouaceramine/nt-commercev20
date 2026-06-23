import { Card, CardContent } from '../../components/ui/card';
import { ShoppingBag, TrendingUp, TrendingDown, Users } from 'lucide-react';

export function PurchaseStats({ totalPurchases, totalPaid, totalRemaining, supplierDebtsCount, t, language }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="purchase-stats">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي المشتريات' : 'Total achats'}</p>
              <p className="text-2xl font-bold mt-1">{totalPurchases.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t.currency}</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
              <ShoppingBag className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'المدفوع' : 'Payé'}</p>
              <p className="text-2xl font-bold mt-1 text-emerald-600">{totalPaid.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t.currency}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={totalRemaining > 0 ? 'border-red-200 bg-red-50/30' : ''}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'ديون الموردين' : 'Dettes fournisseurs'}</p>
              <p className="text-2xl font-bold mt-1 text-red-600">{totalRemaining.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t.currency}</p>
            </div>
            <div className="p-3 rounded-xl bg-red-100 text-red-600">
              <TrendingDown className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'موردين بديون' : 'Fournisseurs débiteurs'}</p>
              <p className="text-2xl font-bold mt-1">{supplierDebtsCount}</p>
              <p className="text-xs text-muted-foreground">{language === 'ar' ? 'مورد' : 'fournisseurs'}</p>
            </div>
            <div className="p-3 rounded-xl bg-purple-100 text-purple-600">
              <Users className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
