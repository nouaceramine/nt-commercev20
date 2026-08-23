import { errText } from '../../../lib/errorText';
import { useCallback, useEffect, useState } from 'react';
import apiClient from '../../../lib/apiClient';
import { Layout } from '../../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Database, Search, Loader2, ChevronRight, ChevronLeft, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { formatShortDate } from '../../../utils/globalDateFormatter';
import { SaasPageHeader } from './SaasPageHeader';

const PAGE_SIZE = 50;
const fmt = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n ?? 0);

export default function DataBrowserPage() {
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [tab, setTab] = useState('products');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ total: 0, items: [] });
  const [searchRes, setSearchRes] = useState(null);
  const [accessLog, setAccessLog] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/saas/tenants');
        const list = Array.isArray(res.data) ? res.data : (res.data?.tenants || []);
        setTenants(list);
      } catch (e) { toast.error(errText(e)); }
    })();
  }, []);

  const loadList = useCallback(async (tId, tb, pg, query) => {
    if (!tId) return;
    setLoading(true);
    try {
      const res = await apiClient.get(
        `/saas/data-browser/${tId}/${tb}?skip=${pg * PAGE_SIZE}&limit=${PAGE_SIZE}&q=${encodeURIComponent(query || '')}`
      );
      setData({ total: res.data.total || 0, items: res.data.items || [] });
    } catch (e) { toast.error(errText(e)); } finally { setLoading(false); }
  }, []);

  const loadAccessLog = useCallback(async () => {
    try {
      const res = await apiClient.get('/saas/data-browser/access-log?limit=100');
      setAccessLog(res.data.items || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (tab === 'access') { loadAccessLog(); return; }
    setPage(0);
    loadList(tenantId, tab, 0, q);
  }, [tenantId, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = async () => {
    if (!tenantId || q.trim().length < 2) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/saas/data-browser/${tenantId}/search?q=${encodeURIComponent(q.trim())}`);
      setSearchRes(res.data);
    } catch (e) { toast.error(errText(e)); } finally { setLoading(false); }
  };

  const tenant = tenants.find(t => t.id === tenantId);
  const pages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="data-browser-page">
        <SaasPageHeader
          titleAr="متصفح بيانات المشتركين"
          subtitleAr="اطلاع للقراءة فقط على منتجات وأسعار ومبيعات أي مشترك — كل عملية تُسجَّل"
          icon={Database}
        />

        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-3 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <ShieldAlert className="h-4 w-4" />
            وضع القراءة فقط — لا يمكن تعديل أي بيانات من هنا، وكل عملية اطلاع تُدوَّن في سجل الوصول.
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <div className="w-72">
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger data-testid="db-tenant-select"><SelectValue placeholder="اختر المشترك…" /></SelectTrigger>
              <SelectContent>
                {tenants.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.short_id ? `[${t.short_id}] ` : ''}{t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <Input data-testid="db-search-input" placeholder="ابحث داخل بيانات المشترك (اسم/كود/باركود/هاتف)…"
                   value={q} onChange={e => setQ(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') runSearch(); }} />
            <Button onClick={runSearch} disabled={!tenantId || loading} className="gap-2" data-testid="db-search-btn">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} بحث
            </Button>
          </div>
        </div>

        {searchRes && (
          <Card data-testid="db-search-results">
            <CardHeader>
              <CardTitle className="text-base">نتائج البحث «{searchRes.q}» في {tenant?.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {searchRes.products?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">منتجات ({searchRes.products.length})</p>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>الكود</TableHead><TableHead>الاسم</TableHead>
                      <TableHead>سعر الشراء</TableHead><TableHead>سعر البيع</TableHead><TableHead>المخزون</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {searchRes.products.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.article_code || p.barcode || '—'}</TableCell>
                          <TableCell>{p.name_ar || p.name_en}</TableCell>
                          <TableCell>{fmt(p.purchase_price)} دج</TableCell>
                          <TableCell className="text-emerald-600">{fmt(p.retail_price)} دج</TableCell>
                          <TableCell>{p.quantity ?? 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {searchRes.sales?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">مبيعات ({searchRes.sales.length})</p>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>الفاتورة</TableHead><TableHead>العميل</TableHead>
                      <TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead><TableHead>التاريخ</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {searchRes.sales.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.invoice_number || s.code}</TableCell>
                          <TableCell>{s.customer_name || '—'}</TableCell>
                          <TableCell>{fmt(s.total)} دج</TableCell>
                          <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                          <TableCell className="text-xs">{formatShortDate(s.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {searchRes.customers?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">عملاء ({searchRes.customers.length})</p>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>الكود</TableHead><TableHead>الاسم</TableHead><TableHead>الهاتف</TableHead><TableHead>الرصيد</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {searchRes.customers.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-xs">{c.code || '—'}</TableCell>
                          <TableCell>{c.name}</TableCell>
                          <TableCell dir="ltr">{c.phone || '—'}</TableCell>
                          <TableCell>{fmt(c.balance)} دج</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {searchRes.suppliers?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">موردون ({searchRes.suppliers.length})</p>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>الكود</TableHead><TableHead>الاسم</TableHead><TableHead>الهاتف</TableHead><TableHead>الرصيد</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {searchRes.suppliers.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.code || '—'}</TableCell>
                          <TableCell>{s.name}</TableCell>
                          <TableCell dir="ltr">{s.phone || '—'}</TableCell>
                          <TableCell>{fmt(s.balance)} دج</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!searchRes.products?.length && !searchRes.sales?.length && !searchRes.customers?.length && !searchRes.suppliers?.length && (
                <p className="text-sm text-muted-foreground">لا نتائج مطابقة.</p>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSearchRes(null)}>إغلاق النتائج</Button>
            </CardContent>
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="products" data-testid="db-tab-products">📦 المنتجات</TabsTrigger>
            <TabsTrigger value="sales" data-testid="db-tab-sales">🧾 المبيعات</TabsTrigger>
            <TabsTrigger value="customers" data-testid="db-tab-customers">👥 العملاء</TabsTrigger>
            <TabsTrigger value="access" data-testid="db-tab-access">🛡️ سجل الوصول</TabsTrigger>
          </TabsList>

          <TabsContent value="access" className="mt-3">
            <Card>
              <CardHeader><CardTitle className="text-base">من اطّلع على ماذا</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>المشرف</TableHead><TableHead>المشترك</TableHead>
                    <TableHead>الإجراء</TableHead><TableHead>الاستعلام</TableHead><TableHead>التاريخ</TableHead>
                  </TableRow></TableHeader>
                  <TableBody data-testid="db-access-table">
                    {accessLog.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.admin_email || r.admin_id}</TableCell>
                        <TableCell>{r.tenant_short_id ? `[${r.tenant_short_id}] ` : ''}{r.tenant_name}</TableCell>
                        <TableCell><Badge variant="outline">{r.action}</Badge></TableCell>
                        <TableCell className="text-xs">{r.query || '—'}</TableCell>
                        <TableCell className="text-xs">{formatShortDate(r.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {['products', 'sales', 'customers'].map(tb => (
            <TabsContent key={tb} value={tb} className="mt-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {tb === 'products' ? 'المنتجات' : tb === 'sales' ? 'المبيعات' : 'العملاء'}
                    {tenant ? ` — ${tenant.name}` : ''} ({data.total})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!tenantId ? (
                    <p className="p-8 text-center text-muted-foreground">اختر مشتركاً أولاً.</p>
                  ) : loading ? (
                    <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
                  ) : data.items.length === 0 ? (
                    <p className="p-8 text-center text-muted-foreground">لا بيانات.</p>
                  ) : (
                    <>
                      {tb === 'products' && (
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead>الكود</TableHead><TableHead>الباركود</TableHead><TableHead>الاسم</TableHead>
                            <TableHead>سعر الشراء</TableHead><TableHead>سعر البيع</TableHead>
                            <TableHead>سعر الجملة</TableHead><TableHead>المخزون</TableHead>
                          </TableRow></TableHeader>
                          <TableBody data-testid="db-products-table">
                            {data.items.map(p => (
                              <TableRow key={p.id}>
                                <TableCell className="font-mono text-xs">{p.article_code || '—'}</TableCell>
                                <TableCell className="font-mono text-xs">{p.barcode || '—'}</TableCell>
                                <TableCell>{p.name_ar || p.name_en}</TableCell>
                                <TableCell>{fmt(p.purchase_price)} دج</TableCell>
                                <TableCell className="text-emerald-600">{fmt(p.retail_price)} دج</TableCell>
                                <TableCell>{fmt(p.wholesale_price ?? p.super_wholesale_price)} دج</TableCell>
                                <TableCell>{p.quantity ?? 0}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                      {tb === 'sales' && (
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead>الفاتورة</TableHead><TableHead>العميل</TableHead><TableHead>الإجمالي</TableHead>
                            <TableHead>المدفوع</TableHead><TableHead>الطريقة</TableHead><TableHead>التاريخ</TableHead>
                          </TableRow></TableHeader>
                          <TableBody data-testid="db-sales-table">
                            {data.items.map(s => (
                              <TableRow key={s.id}>
                                <TableCell className="font-mono text-xs">{s.invoice_number || s.code}</TableCell>
                                <TableCell>{s.customer_name || '—'}</TableCell>
                                <TableCell>{fmt(s.total)} دج</TableCell>
                                <TableCell>{fmt(s.paid_amount)} دج</TableCell>
                                <TableCell><Badge variant="outline">{s.payment_method || '—'}</Badge></TableCell>
                                <TableCell className="text-xs">{formatShortDate(s.created_at)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                      {tb === 'customers' && (
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead>الكود</TableHead><TableHead>الاسم</TableHead>
                            <TableHead>الهاتف</TableHead><TableHead>الرصيد</TableHead><TableHead>إجمالي المشتريات</TableHead>
                          </TableRow></TableHeader>
                          <TableBody data-testid="db-customers-table">
                            {data.items.map(c => (
                              <TableRow key={c.id}>
                                <TableCell className="font-mono text-xs">{c.code || '—'}</TableCell>
                                <TableCell>{c.name}</TableCell>
                                <TableCell dir="ltr">{c.phone || '—'}</TableCell>
                                <TableCell>{fmt(c.balance)} دج</TableCell>
                                <TableCell>{fmt(c.total_purchases)} دج</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                      <div className="flex items-center justify-between p-3 border-t">
                        <Button variant="outline" size="sm" disabled={page === 0}
                                onClick={() => { setPage(page - 1); loadList(tenantId, tab, page - 1, q); }}
                                data-testid="db-prev" className="gap-1">
                          <ChevronRight className="h-4 w-4" /> السابق
                        </Button>
                        <span className="text-sm text-muted-foreground">صفحة {page + 1} / {pages}</span>
                        <Button variant="outline" size="sm" disabled={page + 1 >= pages}
                                onClick={() => { setPage(page + 1); loadList(tenantId, tab, page + 1, q); }}
                                data-testid="db-next" className="gap-1">
                          التالي <ChevronLeft className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </Layout>
  );
}
