import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { CalendarClock, Search, AlertTriangle, XCircle, Clock, TrendingDown, Percent } from 'lucide-react';

export default function ExpiryReportPage() {
  const { t, language } = useLanguage();

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ expired: 0, critical: 0, warning: 0, upcoming: 0, total_stock_value: 0 });
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('60');
  const [searchQuery, setSearchQuery] = useState('');
  const [discountRow, setDiscountRow] = useState(null);
  const [discountPercent, setDiscountPercent] = useState('20');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetchReport();
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/products/expiring-report?days=${days}`);
      setRows(response.data.rows || []);
      setSummary(response.data.summary || {});
    } catch (error) {
      console.error('Error fetching expiry report:', error);
      toast.error(language === 'ar' ? 'خطأ في جلب التقرير' : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const applyDiscount = async () => {
    if (!discountRow) return;
    const pct = parseFloat(discountPercent) || 0;
    if (pct <= 0 || pct >= 100) {
      toast.error(language === 'ar' ? 'نسبة الخصم يجب أن تكون بين 1 و 99' : 'Remise entre 1 et 99');
      return;
    }
    const newPrice = Math.round(discountRow.retail_price * (1 - pct / 100) * 100) / 100;
    setApplying(true);
    try {
      // products PUT writes a price_history row automatically (audited discount)
      await apiClient.put(`/products/${discountRow.product_id}`, { retail_price: newPrice });
      toast.success(language === 'ar'
        ? `تم تطبيق خصم ${pct}% — السعر الجديد: ${newPrice.toFixed(2)}`
        : `Remise ${pct}% appliquée — nouveau prix: ${newPrice.toFixed(2)}`);
      setDiscountRow(null);
      fetchReport();
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل تطبيق الخصم' : 'Échec de la remise');
    } finally {
      setApplying(false);
    }
  };

  const statusBadge = (row) => {
    if (row.status === 'expired') {
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><XCircle className="h-3 w-3 me-1" />{language === 'ar' ? `منتهية منذ ${-row.remaining_days} يوم` : `Expiré depuis ${-row.remaining_days} j`}</Badge>;
    }
    if (row.status === 'critical') {
      return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"><AlertTriangle className="h-3 w-3 me-1" />{language === 'ar' ? `${row.remaining_days} يوم — حرج` : `${row.remaining_days} j — critique`}</Badge>;
    }
    if (row.status === 'warning') {
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><Clock className="h-3 w-3 me-1" />{language === 'ar' ? `${row.remaining_days} يوم` : `${row.remaining_days} j`}</Badge>;
    }
    return <Badge variant="outline">{language === 'ar' ? `${row.remaining_days} يوم` : `${row.remaining_days} j`}</Badge>;
  };

  const filteredRows = rows.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (r.product_name || '').toLowerCase().includes(q) || (r.barcode || '').toLowerCase().includes(q) || (r.lot_number || '').toLowerCase().includes(q);
  });

  const summaryCards = [
    { key: 'expired', label: language === 'ar' ? 'منتهية' : 'Expirés', value: summary.expired || 0, color: 'text-red-600', bg: 'bg-red-100', icon: XCircle, testId: 'expiry-expired-card' },
    { key: 'critical', label: language === 'ar' ? 'حرجة (≤7 أيام)' : 'Critiques (≤7 j)', value: summary.critical || 0, color: 'text-orange-600', bg: 'bg-orange-100', icon: AlertTriangle, testId: 'expiry-critical-card' },
    { key: 'warning', label: language === 'ar' ? 'تحذير (≤30 يوم)' : 'Alerte (≤30 j)', value: summary.warning || 0, color: 'text-amber-600', bg: 'bg-amber-100', icon: Clock, testId: 'expiry-warning-card' },
    { key: 'value', label: language === 'ar' ? 'قيمة المخزون المهدد' : 'Valeur stock menacé', value: `${(summary.total_stock_value || 0).toFixed(2)} ${t.currency}`, color: 'text-slate-600', bg: 'bg-slate-100', icon: TrendingDown, testId: 'expiry-value-card' },
  ];

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4" data-testid="expiry-report-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <CalendarClock className="h-6 w-6 text-primary" />
              {language === 'ar' ? 'انتهاء صلاحية المنتجات' : 'Expiration des produits'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {language === 'ar' ? 'الدُفعات القريبة من الانتهاء — تُسجَّل تلقائياً من فواتير الشراء' : 'Lots proches de l\'expiration — enregistrés depuis les achats'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-36 h-9" data-testid="expiry-days-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">{language === 'ar' ? 'خلال 30 يوم' : '30 jours'}</SelectItem>
                <SelectItem value="60">{language === 'ar' ? 'خلال 60 يوم' : '60 jours'}</SelectItem>
                <SelectItem value="90">{language === 'ar' ? 'خلال 90 يوم' : '90 jours'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {summaryCards.map(card => (
            <Card key={card.key} data-testid={card.testId}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{card.label}</p>
                  <p className="text-base font-bold mt-0.5">{card.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'ar' ? 'بحث باسم المنتج أو الباركود أو الدفعة...' : 'Rechercher produit, code-barres, lot...'}
            className="ps-9"
            data-testid="expiry-search"
          />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'المنتج' : 'Produit'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الدُفعة' : 'Lot'}</TableHead>
                  <TableHead>{language === 'ar' ? 'تاريخ الانتهاء' : 'Expiration'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'الكمية' : 'Qté'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'سعر البيع' : 'Prix vente'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'قيمة المخزون' : 'Valeur'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'إجراء' : 'Action'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{language === 'ar' ? 'جارٍ التحميل...' : 'Chargement...'}</TableCell></TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{language === 'ar' ? 'لا توجد دفعات قريبة من الانتهاء — سجّل تاريخ الانتهاء عند الشراء' : 'Aucun lot proche de l\'expiration'}</TableCell></TableRow>
                ) : (
                  filteredRows.map(row => (
                    <TableRow key={row.lot_id} data-testid={`expiry-row-${row.lot_id}`}>
                      <TableCell className="font-medium">{row.product_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.lot_number || '—'}</TableCell>
                      <TableCell className="text-xs">{row.expiry_date}</TableCell>
                      <TableCell>{statusBadge(row)}</TableCell>
                      <TableCell className="text-center">{row.lot_quantity}</TableCell>
                      <TableCell className="text-center">{row.retail_price.toFixed(2)} {t.currency}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{row.stock_value.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => { setDiscountRow(row); setDiscountPercent('20'); }}
                          data-testid={`discount-btn-${row.lot_id}`}
                        >
                          <Percent className="h-3 w-3" />
                          {language === 'ar' ? 'تصريف بخصم' : 'Liquidation'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Discount dialog */}
        <Dialog open={!!discountRow} onOpenChange={(open) => !open && setDiscountRow(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{language === 'ar' ? 'تصريف بخصم' : 'Liquidation par remise'}</DialogTitle>
            </DialogHeader>
            {discountRow && (
              <div className="space-y-4">
                <div className="text-sm">
                  <p className="font-medium">{discountRow.product_name}</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    {language === 'ar' ? 'السعر الحالي:' : 'Prix actuel:'} {discountRow.retail_price.toFixed(2)} {t.currency}
                    {' — '}
                    {language === 'ar' ? 'الكمية:' : 'Qté:'} {discountRow.lot_quantity}
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs">{language === 'ar' ? 'نسبة الخصم %' : 'Remise %'}</label>
                  <Input
                    type="number"
                    min="1"
                    max="99"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    data-testid="discount-percent-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === 'ar' ? 'السعر الجديد:' : 'Nouveau prix:'}{' '}
                    <span className="font-bold text-primary">
                      {(discountRow.retail_price * (1 - (parseFloat(discountPercent) || 0) / 100)).toFixed(2)} {t.currency}
                    </span>
                  </p>
                </div>
                <Button onClick={applyDiscount} disabled={applying} className="w-full" data-testid="discount-apply-btn">
                  {applying ? (language === 'ar' ? 'جارٍ التطبيق...' : 'Application...') : (language === 'ar' ? 'تطبيق الخصم' : 'Appliquer')}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
