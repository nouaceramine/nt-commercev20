import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useDateFormat } from '../contexts/DateFormatContext';
import { Layout } from '../components/Layout';
import SaleDetailDialog from '../components/sales/SaleDetailDialog';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import PrintButton from '../components/print/PrintButton';
import { toast } from 'sonner';
import { 
  Receipt, 
  Printer,
  RotateCcw,
  Eye,
  FileText
} from 'lucide-react';
import { ExportPrintButtons } from '../components/ExportPrintButtons';
import { Pagination } from '../components/Pagination';
import { ResponsiveTable } from '../components/ResponsiveTable';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

export default function SalesHistoryPage() {
  const { t, language } = useLanguage();
  const { formatDate, formatDateTime, formatCurrency } = useDateFormat();
  
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [showSaleDetail, setShowSaleDetail] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState(null);
  const [customers, setCustomers] = useState([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(parseInt(localStorage.getItem('salesPerPage')) || 20);
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const handleItemsPerPageChange = (newValue) => {
    setItemsPerPage(newValue);
    setCurrentPage(1);
    localStorage.setItem('salesPerPage', newValue.toString());
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchSales = async () => {
    try {
      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('page_size', itemsPerPage.toString());
      
      const response = await apiClient.get(`/sales/paginated?${params.toString()}`);
      setSales(response.data.items);
      setTotalItems(response.data.total);
    } catch (error) {
      console.error('Error fetching sales:', error);
      // Fallback to non-paginated endpoint
      try {
        const response = await apiClient.get(`/sales`);
        setSales(response.data);
        setTotalItems(response.data.length);
      } catch (e) {
        console.error('Fallback also failed:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [currentPage, itemsPerPage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    apiClient.get('/customers').then(r => setCustomers(r.data || [])).catch(() => {});
  }, []);

  const handleReturn = async () => {
    try {
      await apiClient.post(`/sales/${selectedSale.id}/return`);
      toast.success(t.saleReturned);
      setReturnDialogOpen(false);
      fetchSales();
    } catch (error) {
      toast.error(t.somethingWentWrong);
    }
  };

  // formatDate is now imported from useDateFormat context

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-emerald-100 text-emerald-700">{t.paid}</Badge>;
      case 'partial':
        return <Badge className="bg-amber-100 text-amber-700">{t.partial}</Badge>;
      case 'unpaid':
        return <Badge className="bg-red-100 text-red-700">{t.unpaid}</Badge>;
      case 'returned':
        return <Badge variant="outline">{t.returned}</Badge>;
      default:
        return null;
    }
  };

  if (loading) {
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
      <div className="space-y-6 animate-fade-in" data-testid="sales-history-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t.sales}</h1>
            <p className="text-muted-foreground mt-1">{sales.length} {t.sales}</p>
          </div>
          <div className="flex gap-2 items-center">
            <ExportPrintButtons
              data={sales.map(s => ({
                invoice: s.invoice_number || '-',
                customer: s.customer_name || (language === 'ar' ? 'زبون مجهول' : 'Client anonyme'),
                total: s.total?.toFixed(2) || '0',
                paid: s.paid_amount?.toFixed(2) || '0',
                remaining: s.remaining?.toFixed(2) || '0',
                payment: s.payment_method === 'cash' ? (language === 'ar' ? 'نقدي' : 'Espèces') : 
                         s.payment_method === 'bank' ? (language === 'ar' ? 'بنكي' : 'Banque') : 
                         (language === 'ar' ? 'محفظة' : 'Portefeuille'),
                date: formatDate(s.created_at)
              }))}
              columns={[
                { key: 'invoice', label: language === 'ar' ? 'رقم الفاتورة' : 'N° Facture' },
                { key: 'customer', label: language === 'ar' ? 'الزبون' : 'Client' },
                { key: 'total', label: language === 'ar' ? 'الإجمالي' : 'Total' },
                { key: 'paid', label: language === 'ar' ? 'المدفوع' : 'Payé' },
                { key: 'remaining', label: language === 'ar' ? 'الباقي' : 'Restant' },
                { key: 'payment', label: language === 'ar' ? 'طريقة الدفع' : 'Paiement' },
                { key: 'date', label: language === 'ar' ? 'التاريخ' : 'Date' }
              ]}
              filename={`sales_${new Date().toISOString().split('T')[0]}`}
              title={language === 'ar' ? 'سجل المبيعات' : 'Historique des Ventes'}
              language={language}
            />
            <Link to="/pos">
              <Button className="gap-2" data-testid="new-sale-btn">
                {t.newSale}
              </Button>
            </Link>
          </div>
        </div>

        {/* Sales List */}
        <Card>
          <CardContent className="p-0">
            {sales.length === 0 ? (
              <div className="empty-state py-16">
                <Receipt className="h-20 w-20 text-muted-foreground mb-4" />
                <h3 className="text-xl font-medium">{t.noProducts}</h3>
              </div>
            ) : (
              <ResponsiveTable
                rows={sales}
                keyFn={(sale) => sale.id}
                columns={[
                  { header: t.invoiceNumber, className: 'font-medium', render: (sale) => (<>
                    {sale.invoice_number}
                    {sale.source === 'webstore' && (
                      <Badge className="mr-1 bg-indigo-100 text-indigo-700" data-testid="webstore-badge">{language === 'ar' ? 'متجر' : 'Boutique'}</Badge>
                    )}
                  </>) },
                  { header: <span style={{color:'var(--muted-foreground)', fontSize:'0.8rem'}}>{language === 'ar' ? 'الرمز' : 'Code'}</span>, render: (sale) => (
                    <span style={{fontFamily:'monospace',fontSize:'0.75rem',background:'var(--primary-foreground)',color:'var(--primary)',border:'1px solid var(--border)',borderRadius:'4px',padding:'1px 6px'}}>{sale.code || '—'}</span>
                  ) },
                  { header: t.customerName, render: (sale) => sale.customer_name },
                  { header: t.total, className: 'font-semibold', render: (sale) => <>{sale.total.toFixed(2)} {t.currency}</> },
                  { header: t.paidAmount, render: (sale) => <>{sale.paid_amount.toFixed(2)} {t.currency}</> },
                  { header: t.remaining, render: (sale) => (
                    <span className={sale.remaining > 0 ? 'text-amber-600' : ''}>{sale.remaining.toFixed(2)} {t.currency}</span>
                  ) },
                  { header: t.paymentMethod, render: (sale) => (
                    <Badge variant="outline">
                      {sale.payment_method === 'cash' ? t.cash : sale.payment_method === 'bank' ? t.bank : t.wallet}
                    </Badge>
                  ) },
                  { header: t.createdAt, className: 'text-muted-foreground text-sm', render: (sale) => formatDate(sale.created_at) },
                  { header: t.actions, cardFull: true, render: (sale) => (<>
                    <div className="flex gap-1 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-primary border-primary/30 hover:bg-primary/10"
                        onClick={() => { setSelectedSaleId(sale.id); setShowSaleDetail(true); }}
                        title={language === 'ar' ? 'معاينة وتعديل' : 'Aperçu & modifier'}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {language === 'ar' ? 'عرض' : 'Voir'}
                      </Button>
                      <PrintButton docType="sale" record={sale} size="sm" />
                      {sale.status !== 'returned' && sale.source !== 'webstore' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => { setSelectedSale(sale); setReturnDialogOpen(true); }}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {getStatusBadge(sale.status)}
                  </>) },
                ]}
              />
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalItems > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
            className="mt-6"
          />
        )}

        {/* Return Dialog */}
        <AlertDialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.returnSale}</AlertDialogTitle>
              <AlertDialogDescription>
                {t.deleteConfirm}
                <br />
                <span className="font-medium">{selectedSale?.invoice_number}</span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={handleReturn} className="bg-destructive text-destructive-foreground">
                {t.returnSale}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Sale Detail / Edit Dialog */}
        <SaleDetailDialog
          saleId={selectedSaleId}
          open={showSaleDetail}
          onOpenChange={setShowSaleDetail}
          language={language}
          formatCurrency={formatCurrency}
          customers={customers}
          onUpdated={fetchSales}
          onReturn={(sale) => { setSelectedSale(sale); setReturnDialogOpen(true); }}
        />
      </div>
    </Layout>
  );
}
