import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../lib/apiClient';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Plus, Search, RefreshCcw, Inbox, ShoppingBag, TrendingUp, Wallet, Eye, Link2, AlertCircle, BookOpen, Bell, BellOff, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CHANNELS, ORDER_STATUSES } from './ecomConstants';
import { EcomManualOrderDialog } from './EcomManualOrderDialog';
import { EcomOrderDetailDialog } from './EcomOrderDetailDialog';
import { useEcomOrderNotifications, requestNotificationPermission, playNewOrderChime } from '../../hooks/useEcomOrderNotifications';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

export default function EcomHubPage() {
  const [orders, setOrders] = useState([]);
  const [callQueue, setCallQueue] = useState([]);  // p108
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  // p139: sound works regardless of desktop-notification permission — default ON
  const [notifEnabled, setNotifEnabled] = useState(
    typeof window === 'undefined' ? true : localStorage.getItem('ecom_notif_enabled') !== '0',
  );
  // p140: KPI drill-down dialog
  const [kpiDrill, setKpiDrill] = useState(null); // 'today' | 'week' | 'all' | 'new'
  const [kpiOrders, setKpiOrders] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(false);

  // Auto-poll for new orders + fire desktop notification when count increases.
  useEcomOrderNotifications(notifEnabled);

  // ── Onboarding tour: redirect to guide on first visit only ──
  useEffect(() => {
    const seen = localStorage.getItem('ecom_guide_seen');
    if (!seen) {
      localStorage.setItem('ecom_guide_seen', '1');
      // Defer to avoid double-render; small grace period so the page doesn't flicker.
      const t = setTimeout(() => {
        toast.info('مرحباً! إليك دليل البداية السريعة لمركز التجارة الإلكترونية.', { duration: 4000 });
        window.location.href = '/ecom-hub/guide';
      }, 600);
      return () => clearTimeout(t);
    }
  }, []);

  const toggleNotifications = async () => {
    if (notifEnabled) {
      setNotifEnabled(false);
      localStorage.setItem('ecom_notif_enabled', '0');
      toast.info('تم إيقاف تنبيهات الطلبات الجديدة');
      return;
    }
    setNotifEnabled(true);
    localStorage.setItem('ecom_notif_enabled', '1');
    playNewOrderChime();  // p139: confirm sound works immediately
    const { granted, reason } = await requestNotificationPermission();
    if (granted) {
      toast.success('✅ سيتم تنبيهك صوتياً وعلى سطح المكتب عند وصول طلب جديد');
    } else if (reason === 'denied') {
      toast.success('✅ التنبيه الصوتي مُفعَّل — تنبيه سطح المكتب مرفوض من المتصفح');
    } else {
      toast.success('✅ التنبيه الصوتي مُفعَّل');
    }
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (activeStatus !== 'all') params.append('status', activeStatus);
      if (channelFilter !== 'all') params.append('channel', channelFilter);
      if (search.trim()) params.append('search', search.trim());

      const [ordersRes, summaryRes, integrationsRes, cqRes] = await Promise.all([
        apiClient.get(`/ecom/orders?${params.toString()}`),
        apiClient.get('/ecom/orders/summary'),
        apiClient.get('/ecom/integrations'),
        apiClient.get('/ecom/call-queue').catch(() => ({ data: null })),  // p108
      ]);
      setCallQueue(cqRes?.data?.queue || []);  // p108
      setOrders(ordersRes.data.items || []);
      setTotal(ordersRes.data.total || 0);
      setSummary(summaryRes.data);
      setIntegrations(integrationsRes.data.items || []);
    } catch (err) {
      if (err?.response?.status === 403) {
        toast.error('مركز التجارة الإلكترونية غير مُفعّل لهذا الحساب');
      } else {
        toast.error('فشل تحميل البيانات');
      }
    } finally {
      setLoading(false);
    }
  }, [activeStatus, channelFilter, search]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const quickCallResult = async (orderId, result) => {  // p108
    try {
      await apiClient.post(`/ecom/orders/${orderId}/call-attempt`, { result });
      toast.success(result === 'confirmed' ? 'تم تأكيد الطلب ✓' : result === 'cancelled_by_phone' ? 'أُلغي الطلب' : 'سُجّلت المحاولة');
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'فشل تسجيل المحاولة');
    }
  };

  const quickSetDeliveryType = async (orderId, dt) => {  // p138
    try {
      await apiClient.put(`/ecom/orders/${orderId}`, { delivery_type: dt });
      toast.success(dt === 'office' ? '🏢 التوصيل: مكتب (stopdesk)' : '🏠 التوصيل: باب المنزل');
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'فشل تحديث نوع التوصيل');
    }
  };

  // p140: KPI drill-down — load the orders behind a stat card
  const KPI_DRILLS = {
    today: { title: 'طلبات اليوم', params: () => ({ since: new Date(new Date().setHours(0, 0, 0, 0)).toISOString() }) },
    week:  { title: 'طلبات آخر 7 أيام', params: () => ({ since: new Date(Date.now() - 7 * 864e5).toISOString() }) },
    all:   { title: 'إجمالي الطلبات', params: () => ({}) },
    new:   { title: 'طلبات جديدة — بانتظار التأكيد', params: () => ({ status: 'new' }) },
  };

  const openKpiDrill = async (key) => {
    setKpiDrill(key);
    setKpiLoading(true);
    setKpiOrders([]);
    try {
      const p = new URLSearchParams({ limit: '100' });
      const extra = KPI_DRILLS[key].params();
      Object.entries(extra).forEach(([k, v]) => p.append(k, v));
      const res = await apiClient.get(`/ecom/orders?${p.toString()}`);
      setKpiOrders(res.data.items || []);
    } catch {
      toast.error('فشل تحميل الطلبات');
    } finally {
      setKpiLoading(false);
    }
  };

  const refreshOrder = async () => {
    if (!selectedOrder) return;
    try {
      const res = await apiClient.get(`/ecom/orders/${selectedOrder.id}`);
      setSelectedOrder(res.data);
    } catch (e) {
      /* silent — list refresh below will surface failures */
    }
    loadAll();
  };

  return (
    <>
      <div className="space-y-6 p-4 md:p-6" dir="rtl" data-testid="ecom-hub-page">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <Inbox className="w-7 h-7 text-emerald-600" />
              صندوق الطلبات الموحَّد
              <Badge className="bg-amber-200 text-amber-900 text-xs">BETA</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              جميع طلباتك من Shopify و Facebook و Instagram و WhatsApp و TikTok في مكان واحد.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={loadAll} disabled={loading} data-testid="ecom-refresh-btn">
              <RefreshCcw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} />
              تحديث
            </Button>
            <Button
              variant={notifEnabled ? 'default' : 'outline'}
              onClick={toggleNotifications}
              data-testid="ecom-notifications-toggle"
              title={notifEnabled ? 'تنبيهات سطح المكتب مُفعَّلة' : 'تفعيل تنبيهات سطح المكتب'}
            >
              {notifEnabled ? <Bell className="w-4 h-4 ml-1" /> : <BellOff className="w-4 h-4 ml-1" />}
              {notifEnabled ? 'التنبيهات مُفعَّلة' : 'تفعيل التنبيهات'}
            </Button>
            <Link to="/ecom-hub/analytics">
              <Button variant="outline" data-testid="ecom-analytics-link">
                <BarChart3 className="w-4 h-4 ml-1" />
                التحليلات
              </Button>
            </Link>
            <Link to="/ecom-hub/guide">
              <Button variant="outline" data-testid="ecom-guide-link">
                <BookOpen className="w-4 h-4 ml-1" />
                دليل الاستخدام
              </Button>
            </Link>
            <Link to="/ecom-hub/channels">
              <Button variant="outline" data-testid="ecom-channels-link">
                <Link2 className="w-4 h-4 ml-1" />
                إدارة القنوات ({integrations.length})
              </Button>
            </Link>
            <Button onClick={() => setManualOpen(true)} data-testid="ecom-new-order-btn">
              <Plus className="w-4 h-4 ml-1" />
              طلب يدوي
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-emerald-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => openKpiDrill('today')} data-testid="kpi-today-card">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">طلبات اليوم</div>
                <div className="text-2xl font-bold text-emerald-700">{summary.today.count}</div>
                <div className="text-xs text-emerald-600">{summary.today.revenue.toLocaleString()} دج</div>
              </CardContent>
            </Card>
            <Card className="border-blue-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => openKpiDrill('week')} data-testid="kpi-week-card">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">آخر 7 أيام</div>
                <div className="text-2xl font-bold text-blue-700">{summary.last_7_days.count}</div>
                <div className="text-xs text-blue-600">{summary.last_7_days.revenue.toLocaleString()} دج</div>
              </CardContent>
            </Card>
            <Card className="border-violet-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => openKpiDrill('all')} data-testid="kpi-all-card">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">إجمالي الطلبات</div>
                <div className="text-2xl font-bold text-violet-700">{summary.total_all_time}</div>
                <div className="text-xs text-muted-foreground">منذ التأسيس</div>
              </CardContent>
            </Card>
            <Card className="border-amber-200 cursor-pointer hover:shadow-md transition-shadow" onClick={() => openKpiDrill('new')} data-testid="kpi-new-card">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">طلبات جديدة</div>
                <div className="text-2xl font-bold text-amber-700">{summary.by_status?.new || 0}</div>
                <div className="text-xs text-amber-600">بانتظار التأكيد</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* p108: call center queue */}
        {callQueue.length > 0 && (
          <Card data-testid="call-queue-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">📞 مركز الاتصال — قائمة التأكيد ({callQueue.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {callQueue.slice(0, 10).map(q => (
                <div key={q.id} className={`border rounded-lg p-2 text-sm flex items-center justify-between gap-2 flex-wrap ${q.urgent ? 'border-red-300 bg-red-50/40' : ''}`} data-testid={`callq-row-${q.order_code}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{q.order_code}</span>
                      <span>{q.customer_name}</span>
                      <a href={`tel:${q.phone}`} className="text-emerald-700 underline font-semibold" dir="ltr">{q.phone}</a>
                      {q.urgent && <Badge className="bg-red-100 text-red-700">عاجل</Badge>}
                      {q.trust === 'risk' && <Badge className="bg-red-100 text-red-700">🔴 مُرجِع</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[q.wilaya, q.city, q.address].filter(Boolean).join(' · ') || '—'} · {Number(q.total).toLocaleString()} دج · منذ {q.age_hours} س · محاولات: {q.attempts}{q.last_result ? ` (آخرها: ${q.last_result})` : ''}{q.reasons.length > 0 ? ` · ${q.reasons.join('، ')}` : ''}
                    </div>
                    {/* p138: نوع التوصيل — مكتب أم باب المنزل */}
                    <div className="flex items-center gap-1 mt-1">
                      <Button
                        size="sm" variant={(q.delivery_type || 'home') === 'home' ? 'default' : 'outline'}
                        className="h-6 text-[11px] px-2"
                        onClick={() => quickSetDeliveryType(q.id, 'home')}
                        data-testid={`callq-dt-home-${q.order_code}`}
                      >🏠 باب المنزل</Button>
                      <Button
                        size="sm" variant={q.delivery_type === 'office' ? 'default' : 'outline'}
                        className="h-6 text-[11px] px-2"
                        onClick={() => quickSetDeliveryType(q.id, 'office')}
                        data-testid={`callq-dt-office-${q.order_code}`}
                      >🏢 مكتب</Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <a href={`https://wa.me/${String(q.phone || '').replace(/\D/g, '').replace(/^0+/, '213')}`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="callq-wa-btn">💬</Button>
                    </a>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => quickCallResult(q.id, 'no_answer')} data-testid="callq-noanswer-btn">لم يردّ</Button>
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => quickCallResult(q.id, 'confirmed')} data-testid="callq-confirm-btn">✓ تأكيد</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-700" onClick={() => quickCallResult(q.id, 'cancelled_by_phone')} data-testid="callq-cancel-btn">✕ إلغاء</Button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">مرتَّبة حسب الأولوية: الأقدم والأعلى قيمة والأخطر أولاً. «تأكيد/إلغاء» تمرّ عبر آلة الحالات تلقائياً (القيود والمخزون).</p>
            </CardContent>
          </Card>
        )}

        {/* Per-channel breakdown */}
        {summary && Object.keys(summary.by_channel || {}).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4" /> توزيع الطلبات حسب القناة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary.by_channel).map(([ch, stats]) => {
                  const meta = CHANNELS[ch] || CHANNELS.manual;
                  return (
                    <button
                      key={ch}
                      onClick={() => setChannelFilter(ch)}
                      className={`px-3 py-2 rounded-lg border ${meta.color} hover:scale-105 transition-transform text-right`}
                      data-testid={`channel-stat-${ch}`}
                    >
                      <div className="text-xs font-semibold flex items-center gap-1">
                        <span>{meta.icon}</span> {meta.labelAr}
                      </div>
                      <div className="text-base font-bold">{stats.count} طلب</div>
                      <div className="text-xs">{stats.revenue.toLocaleString()} دج</div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <Tabs value={activeStatus} onValueChange={setActiveStatus}>
              <TabsList className="flex flex-wrap h-auto bg-muted/40">
                <TabsTrigger value="all" data-testid="status-tab-all">الكل ({summary?.total_all_time || 0})</TabsTrigger>
                {Object.entries(ORDER_STATUSES).map(([key, meta]) => (
                  <TabsTrigger key={key} value={key} data-testid={`status-tab-${key}`}>
                    <span className={`w-2 h-2 rounded-full ${meta.dot} ml-2`} />
                    {meta.labelAr} ({summary?.by_status?.[key] || 0})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث برقم الطلب أو اسم الزبون أو الهاتف..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="ps-3 pe-9"
                  data-testid="ecom-search-input"
                />
              </div>
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger className="w-48" data-testid="ecom-channel-filter"><SelectValue placeholder="جميع القنوات" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع القنوات</SelectItem>
                  {Object.entries(CHANNELS).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{m.icon} {m.labelAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Orders table */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">الطلبات ({total})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <ShoppingBag className="w-12 h-12 mx-auto text-muted-foreground/50" />
                <div className="text-muted-foreground">لا توجد طلبات بعد</div>
                <Button onClick={() => setManualOpen(true)} variant="outline" size="sm">
                  <Plus className="w-4 h-4 ml-1" /> أنشئ طلباً أولاً
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-right p-2">رقم الطلب</th>
                      <th className="text-right p-2">القناة</th>
                      <th className="text-right p-2">الزبون</th>
                      <th className="text-right p-2">المنتجات</th>
                      <th className="text-right p-2">الإجمالي</th>
                      <th className="text-right p-2">الحالة</th>
                      <th className="text-right p-2">التاريخ</th>
                      <th className="text-right p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const chMeta = CHANNELS[o.channel] || CHANNELS.manual;
                      const stMeta = ORDER_STATUSES[o.status] || ORDER_STATUSES.new;
                      return (
                        <tr key={o.id} className="border-t hover:bg-muted/20 transition-colors">
                          <td className="p-2 font-mono text-xs">{o.order_code}</td>
                          <td className="p-2">
                            <Badge className={chMeta.color}>{chMeta.icon} {chMeta.labelAr}</Badge>
                          </td>
                          <td className="p-2">
                            <div className="font-medium">{o.customer?.name || '—'}</div>
                            {o.customer?.phone && <div className="text-xs text-muted-foreground">{o.customer.phone}</div>}
                            {(o.customer?.wilaya || o.customer?.city) && (
                              <div className="text-xs text-muted-foreground">
                                {[o.customer?.wilaya, o.customer?.city].filter(Boolean).join(' · ')}
                                {o.delivery_type === 'office' ? ' · 🏢' : o.delivery_type === 'home' ? ' · 🏠' : ''}
                              </div>
                            )}
                            {o.blacklist?.flagged && (
                              <Badge className="bg-red-100 text-red-700 mt-1" data-testid="blacklist-badge">
                                ⚠ {o.blacklist.manual ? 'محظور' : `مُرجِع ×${o.blacklist.returned_count}`}
                              </Badge>
                            )}
                          </td>
                          <td className="p-2 text-center">{o.items?.length || 0}</td>
                          <td className="p-2 font-semibold">{Number(o.total).toLocaleString()} دج</td>
                          <td className="p-2">
                            <Badge className={stMeta.color}>
                              <span className={`w-1.5 h-1.5 rounded-full ${stMeta.dot} ml-1`} />
                              {stMeta.labelAr}
                            </Badge>
                            {o.cod_risk && (
                              <div className="mt-1">
                                <Badge className={
                                  o.cod_risk.risk_score >= 61 ? 'bg-red-100 text-red-700' :
                                  o.cod_risk.risk_score >= 31 ? 'bg-amber-100 text-amber-700' :
                                  'bg-green-100 text-green-700'
                                }>
                                  مخاطر {o.cod_risk.risk_score} — {o.cod_risk.action_ar}
                                </Badge>
                              </div>
                            )}
                          </td>
                          <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(o.created_at).toLocaleDateString('ar-DZ')}
                          </td>
                          <td className="p-2">
                            <Button size="sm" variant="ghost" onClick={() => setSelectedOrder(o)} data-testid={`view-order-${o.id}`}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* P1 banner */}
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-2 text-sm">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-amber-900">المرحلة 1 (P1) — وضع المحاكاة</div>
            <div className="text-amber-800">
              التكاملات الحقيقية مع Shopify و Yalidine و WhatsApp ستتوفر في المراحل P2-P4. حالياً يمكنك:
              إنشاء طلبات يدوية، إدارة القنوات (إعدادات وهمية)، طباعة بطاقات شحن (مزودين وهميين).
            </div>
          </div>
        </div>
      </div>

      <EcomManualOrderDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onCreated={() => loadAll()}
        integrations={integrations}
      />
      <EcomOrderDetailDialog
        open={!!selectedOrder}
        onOpenChange={(v) => !v && setSelectedOrder(null)}
        order={selectedOrder}
        onUpdated={refreshOrder}
      />

      {/* p140: KPI drill-down — orders behind each stat card */}
      <Dialog open={!!kpiDrill} onOpenChange={(v) => !v && setKpiDrill(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl" data-testid="kpi-drill-dialog">
          <DialogHeader>
            <DialogTitle>{kpiDrill ? KPI_DRILLS[kpiDrill].title : ''}</DialogTitle>
          </DialogHeader>
          {kpiLoading ? (
            <div className="text-center py-10 text-muted-foreground">جارٍ التحميل...</div>
          ) : kpiOrders.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">لا توجد طلبات مطابقة</div>
          ) : (
            <div className="space-y-2">
              {kpiOrders.map((o) => {
                const stMeta = ORDER_STATUSES[o.status] || ORDER_STATUSES.new;
                const chMeta = CHANNELS[o.channel] || CHANNELS.manual;
                return (
                  <button
                    key={o.id}
                    className="w-full text-right border rounded-lg p-3 hover:bg-muted/30 transition-colors"
                    onClick={() => { setKpiDrill(null); setSelectedOrder(o); }}
                    data-testid={`kpi-drill-order-${o.order_code}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs">{o.order_code}</span>
                        <span className="font-medium">{o.customer?.name || '—'}</span>
                        <span className="text-xs text-muted-foreground" dir="ltr">{o.customer?.phone}</span>
                      </div>
                      <Badge className={stMeta.color}>{stMeta.labelAr}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {chMeta.icon} {chMeta.labelAr} · {[o.customer?.wilaya, o.customer?.city, o.customer?.address].filter(Boolean).join(' · ') || '—'} · {Number(o.total).toLocaleString()} دج · {new Date(o.created_at).toLocaleDateString('ar-DZ')}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
