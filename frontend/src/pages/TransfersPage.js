import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  ArrowUpRight, ArrowDownLeft, ArrowLeftRight, ChevronLeft, ChevronRight,
  RefreshCw, Search, Filter, Wallet,
} from 'lucide-react';

const REF_TYPE_LABELS = {
  topup_sale:        'بيع رصيد',
  topup_request:     'شحن رصيد',
  withdraw_request:  'سحب رصيد',
  withdraw_return:   'استرجاع سحب',
  admin_deposit:     'إيداع إداري',
  admin_withdrawal:  'سحب إداري',
  subscription_payment: 'دفع اشتراك',
  service_purchase:  'شراء خدمة',
  recharge:          'شحن',
  topup_sale_refund: 'استرجاع بيع',
  topup_request_refund: 'استرجاع شحن',
};

const REF_TYPE_OPTIONS = [
  { value: '', label: 'كل الأنواع' },
  { value: 'topup_sale', label: 'بيع رصيد' },
  { value: 'topup_request', label: 'شحن رصيد' },
  { value: 'withdraw_request', label: 'سحب رصيد' },
  { value: 'withdraw_return', label: 'استرجاع سحب' },
  { value: 'admin_deposit', label: 'إيداع إداري' },
  { value: 'admin_withdrawal', label: 'سحب إداري' },
];

const PAGE_SIZE = 20;

function refLabel(ref_type) {
  return REF_TYPE_LABELS[ref_type] || ref_type || '—';
}

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('ar-DZ'); } catch { return iso; }
}

export default function TransfersPage() {
  const { language } = useLanguage();
  const { isSuperAdmin, isAgent } = useAuth();
  const navigate = useNavigate();

  const [transfers, setTransfers] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [refType, setRefType] = useState('');

  // Summary stats from visible page
  const totalOut = transfers.reduce((s, t) => {
    const myId = null; // computed per row
    return s + (t.transaction_direction === 'out' ? t.amount : 0);
  }, 0);

  const fetchTransfers = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, page_size: PAGE_SIZE });
      if (fromDate) params.set('from_date', fromDate);
      if (toDate) params.set('to_date', toDate);
      if (refType) params.set('ref_type', refType);
      if (search && isSuperAdmin) params.set('entity_id', search);

      const endpoint = isAgent
        ? `/saas/agent/wallet/transfers?${params}`
        : `/wallet/transfers?${params}`;

      const res = await apiClient.get(endpoint);
      const data = res.data;
      setTransfers(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
      setPage(pg);
    } catch (e) {
      console.error('Failed to load transfers', e);
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, refType, search, isSuperAdmin, isAgent]);

  useEffect(() => { fetchTransfers(1); }, []); // eslint-disable-line

  const applyFilters = () => fetchTransfers(1);
  const clearFilters = () => {
    setSearch(''); setFromDate(''); setToDate(''); setRefType('');
    setTimeout(() => fetchTransfers(1), 50);
  };

  // Summary: total sold (outgoing from platform_main or agent) vs received
  const totalSold = transfers.filter(t => t.from_entity_id === 'platform_main' || (isAgent && t.from_entity_type === 'agent')).reduce((s, t) => s + (t.amount || 0), 0);
  const totalReceived = transfers.filter(t => t.to_entity_id === 'platform_main' || (isAgent && t.to_entity_type === 'agent')).reduce((s, t) => s + (t.amount || 0), 0);

  return (
    <Layout>
      <div className="space-y-6 p-4 md:p-6 animate-fade-in" data-testid="transfers-page">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ArrowLeftRight className="h-6 w-6 text-primary" />
              سجل التحويلات
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isSuperAdmin ? 'السجل الكامل لكل مبيعات الرصيد في السلسلة' : 'تحويلات محفظتك ومستأجريك'}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => fetchTransfers(page)}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ArrowLeftRight className="h-8 w-8 text-primary opacity-70" />
              <div>
                <p className="text-xs text-muted-foreground">عدد التحويلات</p>
                <p className="text-2xl font-bold">{total.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ArrowUpRight className="h-8 w-8 text-red-500 opacity-70" />
              <div>
                <p className="text-xs text-muted-foreground">الرصيد المُباع (الصفحة الحالية)</p>
                <p className="text-2xl font-bold text-red-500">{totalSold.toLocaleString()} <span className="text-sm">دج</span></p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ArrowDownLeft className="h-8 w-8 text-emerald-500 opacity-70" />
              <div>
                <p className="text-xs text-muted-foreground">الرصيد المُسترجع (الصفحة الحالية)</p>
                <p className="text-2xl font-bold text-emerald-500">{totalReceived.toLocaleString()} <span className="text-sm">دج</span></p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              الفلاتر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {isSuperAdmin && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">بحث بمعرّف الكيان</label>
                  <div className="relative">
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="ID المستأجر أو الموزّع..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pr-8 text-sm"
                      data-testid="transfers-search"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">من تاريخ</label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={e => setFromDate(e.target.value)}
                  className="text-sm"
                  data-testid="transfers-from-date"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">إلى تاريخ</label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={e => setToDate(e.target.value)}
                  className="text-sm"
                  data-testid="transfers-to-date"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">نوع العملية</label>
                <Select value={refType} onValueChange={setRefType}>
                  <SelectTrigger className="text-sm" data-testid="transfers-ref-type">
                    <SelectValue placeholder="كل الأنواع" />
                  </SelectTrigger>
                  <SelectContent>
                    {REF_TYPE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
                <Button size="sm" onClick={applyFilters} data-testid="transfers-apply-filter">تطبيق الفلتر</Button>
                <Button size="sm" variant="outline" onClick={clearFilters}>مسح الفلاتر</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" />
                جاري التحميل...
              </div>
            ) : transfers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <Wallet className="h-12 w-12 opacity-30" />
                <p>لا توجد تحويلات مطابقة</p>
                {(fromDate || toDate || refType || search) && (
                  <Button size="sm" variant="outline" onClick={clearFilters}>مسح الفلاتر</Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم التحويل</TableHead>
                      <TableHead className="text-right">البائع (من)</TableHead>
                      <TableHead className="text-right">المشتري (إلى)</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">النوع</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers.map(t => (
                      <TableRow key={t.id} data-testid={`transfer-row-${t.id}`}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {t.transfer_number || t.id?.slice(0, 8) || '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <ArrowUpRight className="h-3.5 w-3.5 text-red-400 shrink-0" />
                            <div>
                              <p className="text-sm font-medium leading-tight">
                                {t.from_name || t.from_entity_id || '—'}
                              </p>
                              <p className="text-xs text-muted-foreground leading-tight">
                                {t.from_entity_type === 'admin' ? 'صاحب النظام' : t.from_entity_type === 'agent' ? 'موزّع' : 'مستأجر'}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            <div>
                              <p className="text-sm font-medium leading-tight">
                                {t.to_name || t.to_entity_id || '—'}
                              </p>
                              <p className="text-xs text-muted-foreground leading-tight">
                                {t.to_entity_type === 'admin' ? 'صاحب النظام' : t.to_entity_type === 'agent' ? 'موزّع' : 'مستأجر'}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-base">
                          {(t.amount || 0).toLocaleString()} <span className="text-xs text-muted-foreground font-normal">دج</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs whitespace-nowrap">
                            {refLabel(t.reference_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(t.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              صفحة {page} من {totalPages} — إجمالي {total.toLocaleString()} تحويل
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="outline"
                onClick={() => fetchTransfers(page - 1)}
                disabled={page <= 1 || loading}
                data-testid="transfers-prev"
              >
                <ChevronRight className="h-4 w-4" />
                السابق
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => fetchTransfers(page + 1)}
                disabled={page >= totalPages || loading}
                data-testid="transfers-next"
              >
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
