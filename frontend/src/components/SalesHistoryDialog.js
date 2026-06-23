import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { 
  History, Calendar, Search, User, Clock, ShoppingCart, 
  Receipt, Eye, Printer, X, ChevronLeft, ChevronRight,
  DollarSign
} from 'lucide-react';

export default function SalesHistoryDialog({ open, onClose }) {
  const { t, language, isRTL } = useLanguage();
  
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState([]);
  const [filteredSales, setFilteredSales] = useState([]);
  const [dateFilter, setDateFilter] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (open) {
      fetchSales();
    }
  }, [open, dateFilter, customStartDate, customEndDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Filter by search
    if (!searchQuery) {
      setFilteredSales(sales);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredSales(sales.filter(s => 
        s.id?.toLowerCase().includes(query) ||
        s.customer_name?.toLowerCase().includes(query)
      ));
    }
  }, [searchQuery, sales]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSales = async () => {
    setLoading(true);
    try {
      
      // Calculate date range
      let startDate, endDate;
      const now = new Date();
      
      switch (dateFilter) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString();
          endDate = new Date().toISOString();
          break;
        case 'week':
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          startDate = weekAgo.toISOString();
          endDate = new Date().toISOString();
          break;
        case 'month':
          const monthAgo = new Date(now);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          startDate = monthAgo.toISOString();
          endDate = new Date().toISOString();
          break;
        case 'custom':
          if (customStartDate && customEndDate) {
            startDate = new Date(customStartDate).toISOString();
            endDate = new Date(customEndDate + 'T23:59:59').toISOString();
          }
          break;
        default:
          startDate = new Date(now.setHours(0, 0, 0, 0)).toISOString();
          endDate = new Date().toISOString();
      }

      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const response = await apiClient.get(`/sales?${params.toString()}`);
      
      setSales(response.data);
      setFilteredSales(response.data);
    } catch (error) {
      console.error('Error fetching sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const getPaymentBadge = (paymentType) => {
    switch (paymentType) {
      case 'cash': return <Badge className="bg-green-100 text-green-700">{language === 'ar' ? 'نقدي' : 'Espèces'}</Badge>;
      case 'credit': return <Badge className="bg-amber-100 text-amber-700">{language === 'ar' ? 'دين' : 'Crédit'}</Badge>;
      case 'partial': return <Badge className="bg-blue-100 text-blue-700">{language === 'ar' ? 'جزئي' : 'Partiel'}</Badge>;
      default: return <Badge variant="outline">{paymentType}</Badge>;
    }
  };

  const getTotalStats = () => {
    const total = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
    const count = filteredSales.length;
    const cash = filteredSales.filter(s => s.payment_type === 'cash').reduce((sum, s) => sum + (s.total || 0), 0);
    const credit = filteredSales.filter(s => s.payment_type === 'credit' || s.payment_type === 'partial').reduce((sum, s) => sum + (s.remaining || s.total || 0), 0);
    return { total, count, cash, credit };
  };

  const stats = getTotalStats();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {language === 'ar' ? 'سجل المبيعات' : 'Historique des ventes'}
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 pb-4 border-b">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 me-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{language === 'ar' ? 'اليوم' : 'Aujourd\'hui'}</SelectItem>
              <SelectItem value="week">{language === 'ar' ? 'هذا الأسبوع' : 'Cette semaine'}</SelectItem>
              <SelectItem value="month">{language === 'ar' ? 'هذا الشهر' : 'Ce mois'}</SelectItem>
              <SelectItem value="custom">{language === 'ar' ? 'مخصص' : 'Personnalisé'}</SelectItem>
            </SelectContent>
          </Select>

          {dateFilter === 'custom' && (
            <>
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-[140px]"
              />
              <span className="text-muted-foreground">-</span>
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-[140px]"
              />
            </>
          )}

          <div className="relative flex-1 min-w-[200px]">
            <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input
              placeholder={language === 'ar' ? 'بحث...' : 'Rechercher...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={isRTL ? 'pr-9' : 'pl-9'}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 py-3">
          <div className="text-center p-2 bg-blue-50 rounded-lg">
            <p className="text-xs text-muted-foreground">{language === 'ar' ? 'عدد المبيعات' : 'Nb ventes'}</p>
            <p className="text-lg font-bold text-blue-600">{stats.count}</p>
          </div>
          <div className="text-center p-2 bg-green-50 rounded-lg">
            <p className="text-xs text-muted-foreground">{language === 'ar' ? 'الإجمالي' : 'Total'}</p>
            <p className="text-lg font-bold text-green-600">{stats.total.toFixed(0)} {t.currency}</p>
          </div>
          <div className="text-center p-2 bg-emerald-50 rounded-lg">
            <p className="text-xs text-muted-foreground">{language === 'ar' ? 'نقدي' : 'Espèces'}</p>
            <p className="text-lg font-bold text-emerald-600">{stats.cash.toFixed(0)} {t.currency}</p>
          </div>
          <div className="text-center p-2 bg-amber-50 rounded-lg">
            <p className="text-xs text-muted-foreground">{language === 'ar' ? 'دين' : 'Crédit'}</p>
            <p className="text-lg font-bold text-amber-600">{stats.credit.toFixed(0)} {t.currency}</p>
          </div>
        </div>

        {/* Sales List */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{language === 'ar' ? 'لا توجد مبيعات' : 'Aucune vente'}</p>
            </div>
          ) : (
            filteredSales.map((sale) => (
              <Card 
                key={sale.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedSale(sale)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm text-muted-foreground">#{sale.id?.slice(-8)}</span>
                        {getPaymentBadge(sale.payment_type)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(sale.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {sale.customer_name || (language === 'ar' ? 'زبون عابر' : 'Client passant')}
                        </span>
                        <span className="flex items-center gap-1">
                          <ShoppingCart className="h-3 w-3" />
                          {sale.items?.length || 0} {language === 'ar' ? 'منتج' : 'articles'}
                        </span>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-xl font-bold">{sale.total?.toFixed(2)} {t.currency}</p>
                      {sale.payment_type !== 'cash' && sale.remaining > 0 && (
                        <p className="text-xs text-amber-600">{language === 'ar' ? 'متبقي:' : 'Reste:'} {sale.remaining?.toFixed(2)} {t.currency}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="ms-2">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Sale Detail Dialog */}
        {selectedSale && (
          <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  {language === 'ar' ? 'تفاصيل الفاتورة' : 'Détails facture'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Header */}
                <div className="flex justify-between items-start border-b pb-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'رقم الفاتورة' : 'N° Facture'}</p>
                    <p className="font-mono font-semibold">#{selectedSale.id?.slice(-8)}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'التاريخ' : 'Date'}</p>
                    <p className="font-medium">{formatDate(selectedSale.created_at)}</p>
                  </div>
                </div>

                {/* Customer */}
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{language === 'ar' ? 'العميل:' : 'Client:'}</span>
                  <span className="font-medium">{selectedSale.customer_name || (language === 'ar' ? 'زبون عابر' : 'Client passant')}</span>
                </div>

                {/* Items */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">{language === 'ar' ? 'المنتجات:' : 'Articles:'}</p>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {selectedSale.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm">
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">{item.quantity} × {item.unit_price?.toFixed(2)} {t.currency}</p>
                        </div>
                        <p className="font-medium">{item.total?.toFixed(2)} {t.currency}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{language === 'ar' ? 'المجموع الفرعي' : 'Sous-total'}</span>
                    <span>{selectedSale.subtotal?.toFixed(2)} {t.currency}</span>
                  </div>
                  {selectedSale.discount > 0 && (
                    <div className="flex justify-between text-sm text-red-600">
                      <span>{language === 'ar' ? 'الخصم' : 'Remise'}</span>
                      <span>-{selectedSale.discount?.toFixed(2)} {t.currency}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold">
                    <span>{language === 'ar' ? 'الإجمالي' : 'Total'}</span>
                    <span>{selectedSale.total?.toFixed(2)} {t.currency}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{language === 'ar' ? 'المدفوع' : 'Payé'}</span>
                    <span className="text-green-600">{selectedSale.paid_amount?.toFixed(2)} {t.currency}</span>
                  </div>
                  {selectedSale.remaining > 0 && (
                    <div className="flex justify-between text-sm text-amber-600">
                      <span>{language === 'ar' ? 'المتبقي' : 'Reste'}</span>
                      <span>{selectedSale.remaining?.toFixed(2)} {t.currency}</span>
                    </div>
                  )}
                </div>

                {/* Payment Badge */}
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  {getPaymentBadge(selectedSale.payment_type)}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
