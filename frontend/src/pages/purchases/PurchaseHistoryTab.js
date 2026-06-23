import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { ShoppingBag, Eye, Pencil, Trash2, FileText } from 'lucide-react';
import PrintButton from '../../components/print/PrintButton';

export function PurchaseHistoryTab({ purchases, formatDate, getStatusBadge, viewPurchaseDetails, openEditPurchaseDialog, confirmDeletePurchase, t, language }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {language === 'ar' ? 'سجل المشتريات' : 'Historique des achats'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {purchases.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingBag className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">{language === 'ar' ? 'لا توجد مشتريات' : 'Aucun achat'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'رقم الفاتورة' : 'N° Facture'}</TableHead>
                  <TableHead className="w-[100px]">{language === 'ar' ? 'الرمز' : 'Code'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المورد' : 'Fournisseur'}</TableHead>
                  <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الإجمالي' : 'Total'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المدفوع' : 'Payé'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المتبقي' : 'Restant'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map(purchase => (
                  <TableRow key={purchase.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{purchase.invoice_number}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {purchase.code || '—'}
                      </span>
                    </TableCell>
                    <TableCell>{purchase.supplier_name}</TableCell>
                    <TableCell>{formatDate(purchase.created_at)}</TableCell>
                    <TableCell className="font-semibold">{purchase.total.toFixed(2)} {t.currency}</TableCell>
                    <TableCell className="text-emerald-600">{purchase.paid_amount.toFixed(2)} {t.currency}</TableCell>
                    <TableCell className={purchase.remaining > 0 ? 'text-red-600 font-semibold' : ''}>
                      {purchase.remaining.toFixed(2)} {t.currency}
                    </TableCell>
                    <TableCell>{getStatusBadge(purchase.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <PrintButton docType="purchase" record={purchase} className="h-8 w-8" />
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50"
                          onClick={() => viewPurchaseDetails(purchase)}
                          title={language === 'ar' ? 'عرض' : 'Voir'}
                          data-testid={`view-purchase-${purchase.id}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:bg-amber-50"
                          onClick={() => openEditPurchaseDialog(purchase)}
                          title={language === 'ar' ? 'تعديل' : 'Modifier'}
                          data-testid={`edit-purchase-${purchase.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50"
                          onClick={() => confirmDeletePurchase(purchase)}
                          title={language === 'ar' ? 'حذف' : 'Supprimer'}
                          data-testid={`delete-purchase-${purchase.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
