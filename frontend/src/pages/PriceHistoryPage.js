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
  History, Search, TrendingUp, TrendingDown, Minus, ArrowUpDown,
  Package, Calendar, User, FileText
} from 'lucide-react';

export default function PriceHistoryPage() {
  const { t, language, isRTL } = useLanguage();
  
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [stats, setStats] = useState({
    total: 0,
    increases: 0,
    decreases: 0,
    avgChange: 0
  });

  useEffect(() => {
    fetchHistory();
  }, [filterType]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = filterType !== 'all' ? `?price_type=${filterType}&limit=100` : '?limit=100';
      const response = await apiClient.get(`/price-history${params}`);
      setHistory(response.data);
      
      // Calculate stats
      const increases = response.data.filter(h => h.change_percent > 0).length;
      const decreases = response.data.filter(h => h.change_percent < 0).length;
      const avgChange = response.data.length > 0 
        ? response.data.reduce((sum, h) => sum + h.change_percent, 0) / response.data.length 
        : 0;
      
      setStats({
        total: response.data.length,
        increases,
        decreases,
        avgChange: avgChange.toFixed(1)
      });
    } catch (error) {
      console.error('Error fetching price history:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredHistory = history.filter(h => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return h.product_name.toLowerCase().includes(query);
  });

  const getPriceTypeLabel = (type) => {
    const labels = {
      purchase_price: language === 'ar' ? 'سعر الشراء' : 'Prix achat',
      wholesale_price: language === 'ar' ? 'سعر الجملة' : 'Prix gros',
      retail_price: language === 'ar' ? 'سعر التجزئة' : 'Prix détail'
    };
    return labels[type] || type;
  };

  const getSourceLabel = (source) => {
    const labels = {
      manual: language === 'ar' ? 'يدوي' : 'Manuel',
      purchase: language === 'ar' ? 'شراء' : 'Achat',
      import: language === 'ar' ? 'استيراد' : 'Import'
    };
    return labels[source] || source;
  };

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '0';
    return parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ');
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

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="price-history-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <History className="h-8 w-8 text-primary" />
              {language === 'ar' ? 'سجل تغييرات الأسعار' : 'Historique des prix'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'تتبع جميع تغييرات أسعار المنتجات' : 'Suivre toutes les modifications de prix'}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي التغييرات' : 'Total changements'}</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <ArrowUpDown className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'زيادات' : 'Augmentations'}</p>
                  <p className="text-2xl font-bold text-green-600">{stats.increases}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'انخفاضات' : 'Diminutions'}</p>
                  <p className="text-2xl font-bold text-red-600">{stats.decreases}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                  <TrendingDown className="h-6 w-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'متوسط التغيير' : 'Changement moyen'}</p>
                  <p className={`text-2xl font-bold ${parseFloat(stats.avgChange) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stats.avgChange}%
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <History className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
                <Input
                  type="text"
                  placeholder={language === 'ar' ? 'بحث بالمنتج...' : 'Rechercher par produit...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`h-11 ${isRTL ? 'pr-10' : 'pl-10'}`}
                  data-testid="search-input"
                />
              </div>
              
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={language === 'ar' ? 'نوع السعر' : 'Type de prix'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'الكل' : 'Tous'}</SelectItem>
                  <SelectItem value="purchase_price">{language === 'ar' ? 'سعر الشراء' : 'Prix achat'}</SelectItem>
                  <SelectItem value="wholesale_price">{language === 'ar' ? 'سعر الجملة' : 'Prix gros'}</SelectItem>
                  <SelectItem value="retail_price">{language === 'ar' ? 'سعر التجزئة' : 'Prix détail'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* History Table */}
        {loading ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="spinner" />
          </div>
        ) : filteredHistory.length === 0 ? (
          <Card>
            <CardContent className="p-16 text-center">
              <History className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium">{language === 'ar' ? 'لا يوجد سجل تغييرات' : 'Aucun historique'}</h3>
              <p className="text-muted-foreground mt-1">
                {language === 'ar' ? 'سيظهر هنا سجل تغييرات الأسعار' : 'L\'historique des prix apparaîtra ici'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ar' ? 'المنتج' : 'Produit'}</TableHead>
                    <TableHead>{language === 'ar' ? 'نوع السعر' : 'Type'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'السعر القديم' : 'Ancien prix'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'السعر الجديد' : 'Nouveau prix'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'التغيير' : 'Changement'}</TableHead>
                    <TableHead>{language === 'ar' ? 'المصدر' : 'Source'}</TableHead>
                    <TableHead>{language === 'ar' ? 'المستخدم' : 'Utilisateur'}</TableHead>
                    <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((item) => (
                    <TableRow key={item.id} data-testid={`history-row-${item.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{item.product_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {getPriceTypeLabel(item.price_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {formatCurrency(item.old_price)} {t.currency}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {formatCurrency(item.new_price)} {t.currency}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {item.change_percent > 0 ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : item.change_percent < 0 ? (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          ) : (
                            <Minus className="h-4 w-4 text-gray-400" />
                          )}
                          <span className={`font-medium ${
                            item.change_percent > 0 ? 'text-green-600' : 
                            item.change_percent < 0 ? 'text-red-600' : 'text-gray-400'
                          }`}>
                            {item.change_percent > 0 ? '+' : ''}{item.change_percent}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {getSourceLabel(item.source)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <User className="h-3 w-3" />
                          {item.changed_by_name || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDate(item.created_at)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
