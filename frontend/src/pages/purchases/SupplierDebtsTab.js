import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { DollarSign, Truck, Banknote, History, Users } from 'lucide-react';

export function SupplierDebtsTab({ supplierDebts, openPayDebtDialog, t, language }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {language === 'ar' ? 'حسابات الموردين' : 'Comptes fournisseurs'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {supplierDebts.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
            <p className="text-emerald-600 font-medium">
              {language === 'ar' ? 'لا توجد ديون للموردين' : 'Aucune dette fournisseur'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {supplierDebts.map(debt => (
              <div key={debt.supplier_id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-red-100">
                      <Truck className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold">{debt.supplier_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {debt.purchases.length} {language === 'ar' ? 'فاتورة غير مسددة' : 'factures impayées'}
                      </p>
                    </div>
                  </div>
                  <div className="text-end">
                    <p className="text-2xl font-bold text-red-600">{debt.total_debt.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{t.currency}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => openPayDebtDialog(debt)} className="gap-1">
                    <Banknote className="h-4 w-4" />
                    {language === 'ar' ? 'تسديد الدين' : 'Payer'}
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1">
                    <History className="h-4 w-4" />
                    {language === 'ar' ? 'السجل' : 'Historique'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
