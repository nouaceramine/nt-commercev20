/**
 * E-Commerce Analytics Page (P5)
 * - Revenue per channel + time-series chart
 * - Conversion funnel
 * - Top products
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import apiClient from '../../lib/apiClient';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { BarChart3, TrendingUp, Trophy, Activity, ArrowRight, RefreshCcw, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';  // p290
import { toast } from 'sonner';
import { CHANNELS } from './ecomConstants';
import { EcomCopilotChat } from './EcomCopilotChat';
import { downloadCsv, todayStamp } from '../../lib/csvExport';

const CHANNEL_HEX = {
  pos: '#10b981', shopify: '#96bf48', facebook: '#1877f2', instagram: '#e4405f',
  tiktok: '#1f2937', whatsapp: '#25d366', telegram: '#0088cc', viber: '#665cac',
  manual: '#6b7280',
};

export default function EcomAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [revenue, setRevenue] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [digital, setDigital] = useState(null);
  const [profit, setProfit] = useState(null);  // p71
  const [wilayaRisk, setWilayaRisk] = useState([]);  // p92
  const [campaignRoas, setCampaignRoas] = useState([]);  // p102
  const [productPnl, setProductPnl] = useState([]);  // p105
  const [pnlWinners, setPnlWinners] = useState([]);      // p290
  const [pnlLosers, setPnlLosers] = useState([]);        // p290
  const [pnlAdTotal, setPnlAdTotal] = useState(0);       // p290
  const [pnlAdAttributed, setPnlAdAttributed] = useState(0);  // p290
  const [historyFor, setHistoryFor] = useState(null);    // p290: {key, product}
  const [historyData, setHistoryData] = useState(null);  // p290
  const [historyBusy, setHistoryBusy] = useState(false); // p290
  const [pricing, setPricing] = useState([]);  // p106

  // p290: سجل المنتج — كل الطلبات والتكاليف على منتج واحد
  const openHistory = async (r) => {
    const key = r.product_id || r.product;
    setHistoryFor({ key, product: r.product });
    setHistoryData(null);
    setHistoryBusy(true);
    try {
      const res = await apiClient.get('/ecom/analytics/product-history', { params: { key, days } });
      setHistoryData(res.data);
    } catch {
      toast.error('تعذّر جلب سجل المنتج');
      setHistoryFor(null);
    } finally { setHistoryBusy(false); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [rev, fun, top, dig, pro, wr, ro, pnl, pr] = await Promise.all([
        apiClient.get(`/ecom/analytics/revenue?days=${days}`),
        apiClient.get(`/ecom/analytics/funnel?days=${days}`),
        apiClient.get(`/ecom/analytics/top-products?days=${days}&limit=10`),
        apiClient.get('/digital/stats').catch(() => ({ data: null })),
        apiClient.get(`/ecom/analytics/profitability?days=${days}`).catch(() => ({ data: null })),
        apiClient.get(`/ecom/analytics/wilaya-risk?days=${days}`).catch(() => ({ data: null })),
        apiClient.get(`/ecom/analytics/campaign-roas?days=${days}`).catch(() => ({ data: null })),
        apiClient.get(`/ecom/analytics/product-pnl?days=${days}`).catch(() => ({ data: null })),
        apiClient.get(`/ecom/analytics/pricing-suggestions?days=${days}`).catch(() => ({ data: null })),
      ]);
      setDigital(dig.data);
      setProfit(pro.data);
      setWilayaRisk(wr?.data?.wilayas || []);
      setCampaignRoas(ro?.data?.rows || []);
      setProductPnl(pnl?.data?.rows || []);
      setPnlWinners(pnl?.data?.winners || []);          // p290
      setPnlLosers(pnl?.data?.losers || []);            // p290
      setPnlAdTotal(pnl?.data?.ad_spend_total || 0);    // p290
      setPnlAdAttributed(pnl?.data?.ad_attributed || 0); // p290
      setPricing(pr?.data?.rows || []);
      setRevenue(rev.data);
      setFunnel(fun.data);
      setTopProducts(top.data?.items || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل تحميل التحليلات');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [days]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Time-series rows for the line chart: [{day, shopify, facebook, ...}, ...]
  const timeSeriesRows = revenue
    ? (revenue.labels || []).map(day => {
        const row = { day };
        Object.entries(revenue.series || {}).forEach(([ch, byDay]) => {
          row[ch] = byDay[day]?.revenue || 0;
        });
        return row;
      })
    : [];
  const activeChannels = Object.keys(revenue?.series || {});

  // ── CSV exports ──
  const exportRevenueCsv = () => {
    if (!revenue) return;
    const headers = ['اليوم', ...activeChannels.map(ch => CHANNELS[ch]?.labelAr || ch), 'المجموع اليومي'];
    const rows = timeSeriesRows.map(r => {
      const channelVals = activeChannels.map(ch => r[ch] || 0);
      const dailyTotal = channelVals.reduce((s, v) => s + v, 0);
      return [r.day, ...channelVals, dailyTotal];
    });
    downloadCsv(`ecom-revenue-${days}d-${todayStamp()}.csv`, headers, rows);
    toast.success('تمَّ تصدير الإيرادات إلى CSV');
  };

  const exportFunnelCsv = () => {
    if (!funnel) return;
    const stages = funnel.stages || [];
    const headers = ['المرحلة', 'العدد', 'نسبة التحويل %'];
    const rows = stages.map(s => [s.label_ar || s.key, s.count || 0, (s.pct ?? 0).toFixed(1)]);
    downloadCsv(`ecom-funnel-${days}d-${todayStamp()}.csv`, headers, rows);
    toast.success('تمَّ تصدير القمع إلى CSV');
  };

  const exportTopProductsCsv = () => {
    if (!topProducts.length) return;
    const headers = ['الترتيب', 'المنتج', 'SKU', 'الكمية المباعة', 'عدد الطلبات', 'الإيراد (دج)'];
    const rows = topProducts.map((p, i) => [
      i + 1,
      p.name || '—',
      (p.skus || []).join(' / ') || '—',
      p.qty || 0,
      p.orders || 0,
      p.revenue || 0,
    ]);
    downloadCsv(`ecom-top-products-${days}d-${todayStamp()}.csv`, headers, rows);
    toast.success('تمَّ تصدير أفضل المنتجات إلى CSV');
  };

  const exportAllCsv = () => {
    exportRevenueCsv();
    setTimeout(exportFunnelCsv, 300);
    setTimeout(exportTopProductsCsv, 600);
  };

  return (
    <>
      <div className="space-y-6 p-4 md:p-6" dir="rtl" data-testid="ecom-analytics-page">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <Link to="/ecom-hub" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> العودة لصندوق الطلبات
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold mt-1 flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-violet-600" />
              تحليلات التجارة الإلكترونية
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              إيرادات حسب القناة، قمع التحويل، وأفضل المنتجات.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v, 10))}>
              <SelectTrigger className="w-36" data-testid="analytics-period-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">آخر 7 أيام</SelectItem>
                <SelectItem value="30">آخر 30 يوم</SelectItem>
                <SelectItem value="90">آخر 90 يوم</SelectItem>
                <SelectItem value="365">آخر سنة</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={load} disabled={loading} data-testid="analytics-refresh-btn">
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" onClick={exportAllCsv} disabled={loading || !revenue} data-testid="analytics-export-csv-btn" title="تصدير الإيرادات + القمع + أفضل المنتجات إلى ملفات CSV">
              <Download className="w-4 h-4 ml-1" />
              تصدير CSV
            </Button>
          </div>
        </div>

        {/* KPI banner */}
        {revenue && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-emerald-200"><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">إجمالي الإيرادات</div>
              <div className="text-2xl font-bold text-emerald-700">{revenue.grand_total_revenue.toLocaleString()} دج</div>
              <div className="text-xs text-emerald-600">{revenue.days} يوم</div>
            </CardContent></Card>
            <Card className="border-blue-200"><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">إجمالي الطلبات</div>
              <div className="text-2xl font-bold text-blue-700">{revenue.grand_total_orders.toLocaleString()}</div>
            </CardContent></Card>
            <Card className="border-violet-200"><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">قنوات فعّالة</div>
              <div className="text-2xl font-bold text-violet-700">{revenue.channels.length}</div>
            </CardContent></Card>
            <Card className="border-amber-200"><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">متوسط قيمة الطلب</div>
              <div className="text-2xl font-bold text-amber-700">
                {revenue.grand_total_orders > 0 ? Math.round(revenue.grand_total_revenue / revenue.grand_total_orders).toLocaleString() : 0} دج
              </div>
            </CardContent></Card>
          </div>
        )}

        {/* p71: true COD profitability */}
          {profit && (
            <Card className="border-emerald-300" data-testid="profitability-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">💰 الربحية الحقيقية (COD) — آخر {days} يوم</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="border rounded-lg p-3"><div className="text-muted-foreground text-xs">صافي الربح الحقيقي</div><div className={`text-lg font-bold ${profit.net_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`} data-testid="net-profit-value">{Number(profit.net_profit).toLocaleString()} دج</div></div>
                  <div className="border rounded-lg p-3"><div className="text-muted-foreground text-xs">الفائدة المحققة (مُسلَّم)</div><div className="text-lg font-bold text-emerald-700">{Number(profit.realized_profit).toLocaleString()} دج</div></div>
                  <div className="border rounded-lg p-3"><div className="text-muted-foreground text-xs">خسائر الإرجاع (شحن+تغليف+استرداد)</div><div className="text-lg font-bold text-red-700">-{Number(profit.return_losses).toLocaleString()} دج</div></div>
                  <div className="border rounded-lg p-3"><div className="text-muted-foreground text-xs">مصاريف الإعلانات الممولة</div><div className="text-lg font-bold text-amber-700">-{Number(profit.ad_spend).toLocaleString()} دج</div></div>
                  <div className="border rounded-lg p-3"><div className="text-muted-foreground text-xs">نسبة التأكيد</div><div className="text-lg font-bold">{profit.confirmation_rate}%</div></div>
                  <div className="border rounded-lg p-3"><div className="text-muted-foreground text-xs">نسبة التسليم</div><div className="text-lg font-bold">{profit.delivery_rate}%</div></div>
                  <div className="border rounded-lg p-3"><div className="text-muted-foreground text-xs">نسبة الإرجاع</div><div className="text-lg font-bold">{profit.return_rate}%</div></div>
                  <div className="border rounded-lg p-3"><div className="text-muted-foreground text-xs">ROAS الحقيقي / ROI على الإعلان</div><div className="text-lg font-bold">{profit.true_roas != null ? `${profit.true_roas}× / ${profit.roi_on_ads}%` : '—'}</div></div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">صافي الربح = فوائد الطلبات المُسلَّمة − خسائر المُستردَّة − مصاريف الإعلانات. سجّل مصاريف الإعلانات من تبويب الإعلانات، وتكلفة التغليف وحق الاسترداد من صفحة الطلب.</p>
              </CardContent>
            </Card>
          )}

                {/* p78: UTM campaign breakdown */}
        {profit && (profit.utm_sources || []).length > 0 && (
          <Card className="border-sky-200" data-testid="utm-sources-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">📣 الأداء حسب مصدر الحملة (UTM) — آخر {days} يوم</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="text-right p-2">المصدر</th>
                      <th className="p-2">الطلبات</th>
                      <th className="p-2">سُلّمت</th>
                      <th className="p-2">مُرجعة</th>
                      <th className="p-2">الإيراد المُسلَّم</th>
                      <th className="p-2">الربح المحقق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profit.utm_sources.map(s => (
                      <tr key={s.source} className="border-t" data-testid={`utm-row-${s.source}`}>
                        <td className="p-2 font-medium">{s.source === 'direct' ? 'مباشر / بدون حملة' : s.source}</td>
                        <td className="p-2 text-center">{s.orders}</td>
                        <td className="p-2 text-center text-emerald-700">{s.delivered}</td>
                        <td className="p-2 text-center text-red-600">{s.refunded}</td>
                        <td className="p-2 text-center">{Number(s.revenue).toLocaleString()} دج</td>
                        <td className={`p-2 text-center font-semibold ${s.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{Number(s.profit).toLocaleString()} دج</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

{/* p92: wilaya risk map */}
          {wilayaRisk.length > 0 && (
            <Card data-testid="wilaya-risk-card">
              <CardHeader>
                <CardTitle>🗺️ خريطة مخاطر الولايات — معدل الإرجاع حسب الولاية</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-right">الولاية</th>
                        <th className="p-2 text-center">الطلبات</th>
                        <th className="p-2 text-center">مُسلَّم</th>
                        <th className="p-2 text-center">مرتجع</th>
                        <th className="p-2 text-center">نسبة الإرجاع</th>
                        <th className="p-2 text-center">الخطر</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wilayaRisk.map(w => (
                        <tr key={w.wilaya} className="border-t" data-testid="wilaya-risk-row">
                          <td className="p-2 font-medium">{w.wilaya}</td>
                          <td className="p-2 text-center">{w.orders}</td>
                          <td className="p-2 text-center text-emerald-700">{w.delivered}</td>
                          <td className="p-2 text-center text-red-700">{w.refunded}</td>
                          <td className="p-2 text-center font-semibold">{w.return_rate}%</td>
                          <td className="p-2 text-center">
                            <Badge className={
                              w.risk === 'high' ? 'bg-red-100 text-red-700' :
                              w.risk === 'medium' ? 'bg-amber-100 text-amber-700' :
                              w.risk === 'low' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
                            }>
                              {w.risk === 'high' ? 'مرتفع' : w.risk === 'medium' ? 'متوسط' : w.risk === 'low' ? 'منخفض' : 'بيانات قليلة'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  الولايات ذات الإرجاع المرتفع: فعّل التأكيد الهاتفي المسبق أو قلّل الإعلانات الموجهة إليها.
                </p>
              </CardContent>
            </Card>
          )}

          {/* p102: true ROAS per traffic source */}
          {campaignRoas.length > 0 && (
            <Card data-testid="campaign-roas-card">
              <CardHeader>
                <CardTitle>📣 ROAS الحقيقي لكل مصدر إعلاني — بناءً على المُسلَّم فعلاً فقط</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-right">المصدر</th>
                        <th className="p-2 text-center">الطلبات</th>
                        <th className="p-2 text-center">مُسلَّم</th>
                        <th className="p-2 text-center">إرجاع %</th>
                        <th className="p-2 text-center">إيراد مُسلَّم</th>
                        <th className="p-2 text-center">إنفاق إعلاني</th>
                        <th className="p-2 text-center">ROAS</th>
                        <th className="p-2 text-center">صافي الربح</th>
                        <th className="p-2 text-center">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignRoas.map(r => (
                        <tr key={r.source} className="border-t" data-testid={`roas-row-${r.source}`}>
                          <td className="p-2 font-medium">{r.source}</td>
                          <td className="p-2 text-center">{r.orders}</td>
                          <td className="p-2 text-center text-emerald-700">{r.delivered}</td>
                          <td className="p-2 text-center text-red-700">{r.return_rate != null ? `${r.return_rate}%` : '—'}</td>
                          <td className="p-2 text-center">{Number(r.revenue).toLocaleString()} دج</td>
                          <td className="p-2 text-center">{r.spend > 0 ? `${Number(r.spend).toLocaleString()} دج` : '—'}</td>
                          <td className="p-2 text-center font-semibold">{r.roas != null ? r.roas : '—'}</td>
                          <td className={`p-2 text-center font-semibold ${r.net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{Number(r.net).toLocaleString()} دج</td>
                          <td className="p-2 text-center">
                            {r.bleeding
                              ? <Badge className="bg-red-100 text-red-700" data-testid={`roas-bleeding-${r.source}`}>🔥 نازف — أوقفه</Badge>
                              : <Badge className="bg-emerald-100 text-emerald-700">سليم</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  الإيراد والربح يُحسبان من الطلبات المُسلَّمة فعلاً فقط. الإنفاق يُلتقط من المصاريف التي يذكر عنوانها اسم المصدر (مثال: «إعلان ممول — facebook»). نازف = إرجاع ≥40% مع ≥5 طلبات، أو ربح سالب مع إنفاق.
                </p>
              </CardContent>
            </Card>
          )}

          {/* p105+p290: true per-product P&L — مُسلَّم/مُرجَع + تغليف + إعلان مباشر + رابح/خاسر + سجل المنتج */}
          {productPnl.length > 0 && (
            <Card data-testid="product-pnl-card">
              <CardHeader>
                <CardTitle>💰 الربح الحقيقي لكل منتج — بعد التكلفة والتغليف والشحن والإرجاع والإعلان</CardTitle>
              </CardHeader>
              <CardContent>
                {/* p290: مقارنة الرابح/الخاسر */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-900/10 p-3" data-testid="pnl-winners-card">
                    <div className="font-semibold text-emerald-800 dark:text-emerald-300 mb-2">🏆 المنتجات الرابحة</div>
                    {pnlWinners.length === 0 ? <div className="text-xs text-muted-foreground">لا منتجات رابحة في الفترة</div> : (
                      <div className="space-y-1">
                        {pnlWinners.map((w, i) => (
                          <div key={i} className="flex items-center justify-between text-sm" data-testid={`pnl-winner-${i}`}>
                            <span className="truncate">{i + 1}. {w.product}</span>
                            <span className="font-bold text-emerald-700 whitespace-nowrap">+{Number(w.net).toLocaleString()} دج</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50/40 dark:bg-red-900/10 p-3" data-testid="pnl-losers-card">
                    <div className="font-semibold text-red-800 dark:text-red-300 mb-2">📉 المنتجات الخاسرة</div>
                    {pnlLosers.length === 0 ? <div className="text-xs text-muted-foreground">لا منتجات خاسرة في الفترة 🎉</div> : (
                      <div className="space-y-1">
                        {pnlLosers.map((l, i) => (
                          <div key={i} className="flex items-center justify-between text-sm" data-testid={`pnl-loser-${i}`}>
                            <span className="truncate">{l.product}</span>
                            <span className="font-bold text-red-700 whitespace-nowrap">{Number(l.net).toLocaleString()} دج</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {pnlAdTotal > 0 && (
                  <p className="text-xs text-muted-foreground mb-2" data-testid="pnl-ad-note">
                    الإعلانات: {Number(pnlAdTotal).toLocaleString()} دج إجمالاً — منها {Number(pnlAdAttributed).toLocaleString()} دج مربوطة مباشرة بمنتجات (من تبويب الإعلانات) والباقي موزَّع نسبياً حسب الإيراد.
                  </p>
                )}
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-right">المنتج</th>
                        <th className="p-2 text-center">مُسلَّم</th>
                        <th className="p-2 text-center">مُرجَع</th>
                        <th className="p-2 text-center">إرجاع %</th>
                        <th className="p-2 text-center">الإيراد</th>
                        <th className="p-2 text-center">التكلفة</th>
                        <th className="p-2 text-center">تغليف</th>
                        <th className="p-2 text-center">شحن+إرجاع</th>
                        <th className="p-2 text-center">إعلان</th>
                        <th className="p-2 text-center">صافي الربح</th>
                        <th className="p-2 text-center">الهامش</th>
                        <th className="p-2 text-center">السجل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productPnl.map((r, idx) => (
                        <tr key={idx} className="border-t" data-testid={`pnl-row-${idx}`}>
                          <td className="p-2 font-medium">{r.product}</td>
                          <td className="p-2 text-center text-emerald-700" data-testid={`pnl-delivered-${idx}`}>{r.delivered}</td>
                          <td className={`p-2 text-center ${r.returned > 0 ? 'text-red-700' : ''}`} data-testid={`pnl-returned-${idx}`}>{r.returned}</td>
                          <td className={`p-2 text-center ${r.return_rate >= 30 ? 'text-red-700 font-semibold' : ''}`}>{r.return_rate != null ? `${r.return_rate}%` : '—'}</td>
                          <td className="p-2 text-center">{Number(r.revenue).toLocaleString()}</td>
                          <td className="p-2 text-center text-muted-foreground">{Number(r.cogs).toLocaleString()}</td>
                          <td className="p-2 text-center text-muted-foreground">{r.packaging > 0 ? Number(r.packaging).toLocaleString() : '—'}</td>
                          <td className="p-2 text-center text-muted-foreground">{Number(r.shipping + r.return_cost).toLocaleString()}</td>
                          <td className="p-2 text-center text-muted-foreground" title={r.ad_direct > 0 ? `منها ${Number(r.ad_direct).toLocaleString()} دج مربوطة مباشرة` : ''}>{r.ad_spend > 0 ? Number(r.ad_spend).toLocaleString() : '—'}</td>
                          <td className={`p-2 text-center font-bold ${r.net < 0 ? 'text-red-700' : 'text-emerald-700'}`} data-testid={`pnl-net-${idx}`}>{Number(r.net).toLocaleString()} دج</td>
                          <td className={`p-2 text-center ${r.margin != null && r.margin < 10 ? 'text-red-700' : ''}`}>{r.margin != null ? `${r.margin}%` : '—'}</td>
                          <td className="p-2 text-center">
                            <Button size="sm" variant="ghost" data-testid={`pnl-history-${idx}`}
                              onClick={() => openHistory(r)}>
                              السجل
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  الإيراد من الطلبات المُسلَّمة فعلاً فقط. التكلفة = سعر شراء المنتج × الكمية. التغليف ورسوم الإرجاع لدى الناقل تُحسب بحصة المنتج من الطلب. الإعلان المربوط بمنتج من تبويب الإعلانات يُنسب له مباشرة وغير المربوط يُوزَّع نسبياً. المنتج بالهامش السالب يأكل أرباح الباقين — أوقف إعلانه أو ارفع سعره.
                </p>
              </CardContent>
            </Card>
          )}

{/* p106: smart pricing suggestions */}
          {pricing.length > 0 && (
            <Card data-testid="pricing-card">
              <CardHeader>
                <CardTitle>🏷️ التسعير الذكي — السعر المقترح بناءً على الكلفة الحقيقية للمُسلَّم</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-right">المنتج</th>
                        <th className="p-2 text-center">السعر الحالي</th>
                        <th className="p-2 text-center">معدل التسليم</th>
                        <th className="p-2 text-center">الكلفة الحقيقية</th>
                        <th className="p-2 text-center">السعر المقترح</th>
                        <th className="p-2 text-center">القرار</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricing.map(r => (
                        <tr key={r.product_id} className="border-t" data-testid={`pricing-row-${r.product_id}`}>
                          <td className="p-2 font-medium">{r.product}</td>
                          <td className="p-2 text-center">{Number(r.current_price).toLocaleString()} دج</td>
                          <td className={`p-2 text-center ${r.delivery_rate < 70 ? 'text-red-700 font-semibold' : ''}`}>{r.delivery_rate}%</td>
                          <td className="p-2 text-center text-muted-foreground">{Number(r.real_cost).toLocaleString()} دج</td>
                          <td className="p-2 text-center font-bold text-indigo-700" data-testid={`pricing-suggested-${r.product_id}`}>{Number(r.suggested_price).toLocaleString()} دج</td>
                          <td className="p-2 text-center">
                            {r.verdict === 'losing' && <Badge className="bg-red-100 text-red-700">🔴 خاسر — ارفع فوراً</Badge>}
                            {r.verdict === 'raise' && <Badge className="bg-amber-100 text-amber-700">🟡 ارفع نحو المقترح</Badge>}
                            {r.verdict === 'ok' && <Badge className="bg-emerald-100 text-emerald-700">🟢 سليم</Badge>}
                            {r.verdict === 'no_price' && <Badge variant="outline">لا سعر مسجّل</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  الكلفة الحقيقية = سعر الشراء + (متوسط الشحن ÷ معدل التسليم) + حصة الإعلان لكل قطعة — كل قطعة مُسلَّمة تحمل شحن المرتجعات. المقترح = الكلفة × 1.30 مقرَّباً لأقرب 50 دج. يحتاج ≥3 طلبات مشحونة للمنتج.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Digital services profit */}
        {digital && digital.completed_orders > 0 && (
          <Card className="border-indigo-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">أرباح الخدمات الرقمية</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><div className="text-xs text-muted-foreground">طلبات مكتملة</div><div className="text-xl font-bold">{digital.completed_orders}</div></div>
                <div><div className="text-xs text-muted-foreground">الإيرادات</div><div className="text-xl font-bold text-blue-700">{digital.revenue.toLocaleString()} دج</div></div>
                <div><div className="text-xs text-muted-foreground">التكلفة</div><div className="text-xl font-bold">{digital.cost.toLocaleString()} دج</div></div>
                <div><div className="text-xs text-muted-foreground">صافي الربح</div><div className="text-xl font-bold text-emerald-700">{digital.profit.toLocaleString()} دج</div></div>
              </div>
              {digital.by_product?.length > 0 && (
                <div className="mt-3 space-y-1">
                  {digital.by_product.slice(0, 5).map(bp => (
                    <div key={bp.product} className="flex justify-between text-sm border-b pb-1">
                      <span>{bp.product} ({bp.orders})</span>
                      <span className="font-semibold text-emerald-700">+{bp.profit.toLocaleString()} دج</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* AI Co-pilot (iter 18.4) */}
        <EcomCopilotChat days={days} />

        {/* Revenue time series */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-600" /> إيرادات يومية حسب القناة</CardTitle>
          </CardHeader>
          <CardContent>
            {timeSeriesRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">لا توجد بيانات في هذه الفترة</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeriesRows} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend />
                  {activeChannels.map(ch => (
                    <Line key={ch} type="monotone" dataKey={ch} stroke={CHANNEL_HEX[ch] || '#6b7280'} strokeWidth={2} dot={false} name={CHANNELS[ch]?.labelAr || ch} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Per-channel breakdown bar */}
        {revenue && revenue.channels.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">توزيع الإيرادات حسب القناة</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revenue.channels} layout="vertical" margin={{ left: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="channel" fontSize={11} width={80}
                    tickFormatter={(ch) => CHANNELS[ch]?.labelAr || ch} />
                  <Tooltip formatter={(v, name) => name === 'total_revenue' ? [`${Number(v).toLocaleString()} دج`, 'الإيراد'] : v} />
                  <Bar dataKey="total_revenue" name="الإيراد">
                    {revenue.channels.map(c => (
                      <Cell key={c.channel} fill={CHANNEL_HEX[c.channel] || '#6b7280'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Funnel */}
        {funnel && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-blue-600" /> قمع التحويل</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {funnel.stages.map((s, idx) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="w-32 text-sm text-end">{s.label_ar}</span>
                    <div className="flex-1 h-7 bg-muted rounded-md overflow-hidden relative">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${Math.max(8, s.pct)}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white drop-shadow">
                        {s.count} ({s.pct}%)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="bg-emerald-50 border border-emerald-200 p-2 rounded">
                  <span className="text-emerald-800 font-semibold">نسبة التحويل من Lead → طلب:</span>{' '}
                  <span className="text-emerald-700">{funnel.extras.lead_to_order_pct}%</span>
                </div>
                <div className="bg-rose-50 border border-rose-200 p-2 rounded">
                  <span className="text-rose-800 font-semibold">نسبة الإلغاء/الاسترداد:</span>{' '}
                  <span className="text-rose-700">{funnel.extras.cancel_pct}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Products */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> أفضل المنتجات</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">لا توجد بيانات</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="text-right p-2">#</th>
                    <th className="text-right p-2">المنتج</th>
                    <th className="text-right p-2">الكمية</th>
                    <th className="text-right p-2">عدد الطلبات</th>
                    <th className="text-right p-2">الإيراد</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={p.name + i} className="border-t hover:bg-muted/20">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-medium">{p.name}{p.skus?.length > 0 && <span className="text-xs text-muted-foreground"> ({p.skus.slice(0, 2).join(', ')})</span>}</td>
                      <td className="p-2">{p.qty}</td>
                      <td className="p-2">{p.orders}</td>
                      <td className="p-2 font-semibold text-emerald-700">{p.revenue.toLocaleString()} دج</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* p290: سجل المنتج — الطلبات والتكاليف والإعلانات على منتج واحد */}
      <Dialog open={!!historyFor} onOpenChange={(v) => !v && setHistoryFor(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl" data-testid="pnl-history-dialog">
          <DialogHeader>
            <DialogTitle>📜 سجل المنتج — {historyFor?.product}</DialogTitle>
          </DialogHeader>
          {historyBusy && <div className="text-sm text-muted-foreground py-6 text-center">جارٍ التحميل…</div>}
          {historyData && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
                <div className="border rounded-md p-2" data-testid="hist-t-delivered"><div className="text-[10px] text-muted-foreground">مُسلَّم</div><div className="font-bold text-emerald-700">{historyData.totals.delivered}</div></div>
                <div className="border rounded-md p-2" data-testid="hist-t-returned"><div className="text-[10px] text-muted-foreground">مُرجَع</div><div className="font-bold text-red-700">{historyData.totals.returned}</div></div>
                <div className="border rounded-md p-2"><div className="text-[10px] text-muted-foreground">الإيراد</div><div className="font-bold">{Number(historyData.totals.revenue).toLocaleString()}</div></div>
                <div className="border rounded-md p-2"><div className="text-[10px] text-muted-foreground">التكلفة</div><div className="font-bold text-muted-foreground">{Number(historyData.totals.cogs).toLocaleString()}</div></div>
                <div className="border rounded-md p-2"><div className="text-[10px] text-muted-foreground">تغليف+شحن</div><div className="font-bold text-muted-foreground">{Number(historyData.totals.packaging + historyData.totals.shipping).toLocaleString()}</div></div>
                <div className="border rounded-md p-2"><div className="text-[10px] text-muted-foreground">خسائر إرجاع</div><div className="font-bold text-red-700">{Number(historyData.totals.return_cost).toLocaleString()}</div></div>
              </div>
              {historyData.ad_total > 0 && (
                <div className="border rounded-md p-2 text-sm" data-testid="hist-ads">
                  📢 إعلانات مربوطة بهذا المنتج: <b>{Number(historyData.ad_total).toLocaleString()} دج</b>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {historyData.ad_expenses.slice(0, 8).map((a2, i) => (
                      <div key={i} className="flex justify-between"><span>{a2.date} — {a2.title}</span><span>{Number(a2.amount).toLocaleString()} دج</span></div>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="p-2 text-right">الطلب</th>
                      <th className="p-2 text-center">التاريخ</th>
                      <th className="p-2 text-center">الحالة</th>
                      <th className="p-2 text-center">الزبون</th>
                      <th className="p-2 text-center">كمية</th>
                      <th className="p-2 text-center">إيراد</th>
                      <th className="p-2 text-center">تكلفة</th>
                      <th className="p-2 text-center">تغليف+شحن</th>
                      <th className="p-2 text-center">خسارة إرجاع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyData.history.map((h, i) => (
                      <tr key={i} className="border-t" data-testid={`hist-row-${i}`}>
                        <td className="p-2 font-mono text-xs">{h.order_code}</td>
                        <td className="p-2 text-center text-xs">{h.date}</td>
                        <td className="p-2 text-center">
                          <Badge className={h.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' : (h.status === 'refunded' || h.status === 'returned') ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>
                            {h.status === 'delivered' ? 'مُسلَّم' : (h.status === 'refunded' || h.status === 'returned') ? 'مُرجَع' : 'قيد المعالجة'}
                          </Badge>
                        </td>
                        <td className="p-2 text-center text-xs">{h.customer || '—'}</td>
                        <td className="p-2 text-center">{h.qty}</td>
                        <td className="p-2 text-center">{h.status === 'delivered' ? Number(h.item_revenue).toLocaleString() : '—'}</td>
                        <td className="p-2 text-center text-muted-foreground">{h.cogs > 0 ? Number(h.cogs).toLocaleString() : '—'}</td>
                        <td className="p-2 text-center text-muted-foreground">{(h.shipping + h.packaging) > 0 ? Number(h.shipping + h.packaging).toLocaleString() : '—'}</td>
                        <td className="p-2 text-center text-red-700">{h.return_cost > 0 ? Number(h.return_cost).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                    {historyData.history.length === 0 && (
                      <tr><td colSpan={9} className="p-4 text-center text-muted-foreground text-sm">لا طلبات لهذا المنتج في الفترة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
