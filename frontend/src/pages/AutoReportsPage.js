import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { toast } from 'sonner';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  FileText,
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Users,
  RefreshCw,
  Download,
  BarChart3,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// p213: bilingual labels (ar/fr) — page previously ignored the language
const TYPE_MAP = {
  daily: { ar: 'يومي', fr: 'Quotidien', color: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  weekly: { ar: 'أسبوعي', fr: 'Hebdomadaire', color: 'bg-purple-500/15 text-purple-600 border-purple-500/30' },
  monthly: { ar: 'شهري', fr: 'Mensuel', color: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
};

function ReportCard({ report, isAr }) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = TYPE_MAP[report.type] || TYPE_MAP.daily;
  const stats = report.stats || {};
  const locale = isAr ? 'ar-DZ' : 'fr-FR';
  const da = isAr ? 'دج' : 'DA';
  const num = (n) => (Number(n) || 0).toLocaleString(locale);

  const title =
    report.type === 'daily'
      ? (isAr ? `التقرير اليومي - ${report.date || ''}` : `Rapport quotidien — ${report.date || ''}`)
      : report.type === 'weekly'
        ? (isAr ? `التقرير الأسبوعي - ${report.start_date || ''} إلى ${report.end_date || ''}` : `Rapport hebdomadaire — ${report.start_date || ''} → ${report.end_date || ''}`)
        : (isAr ? `التقرير الشهري - ${report.month || ''}` : `Rapport mensuel — ${report.month || ''}`);

  return (
    <Card className="border transition-all hover:shadow-md" data-testid={`report-card-${report.id}`}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/5">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{title}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                <Clock className="h-3 w-3 inline mr-1" />
                {new Date(report.created_at).toLocaleString(locale)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${typeInfo.color}`}>{isAr ? typeInfo.ar : typeInfo.fr}</Badge>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>
      {/* Summary row always visible */}
      <CardContent className="pt-0 pb-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          <MiniStat icon={DollarSign} label={isAr ? 'المبيعات' : 'Ventes'} value={`${num(stats.sales_total)} ${da}`} color="text-emerald-600" />
          <MiniStat icon={TrendingUp} label={isAr ? 'الربح' : 'Profit'} value={`${num(stats.net_profit)} ${da}`} color={stats.net_profit >= 0 ? 'text-emerald-600' : 'text-red-500'} />
          <MiniStat icon={Package} label={isAr ? 'عدد المبيعات' : 'Nb ventes'} value={stats.sales_count || 0} color="text-blue-600" />
          <MiniStat icon={TrendingDown} label={isAr ? 'المصروفات' : 'Dépenses'} value={`${num(stats.expenses_total)} ${da}`} color="text-red-500" />
        </div>
      </CardContent>
      {/* Expanded details */}
      {expanded && (
        <CardContent className="pt-0 border-t">
          <div className="mt-3 space-y-3">
            {/* Top Products */}
            {report.top_products && report.top_products.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Package className="h-3 w-3" /> {isAr ? 'أفضل المنتجات' : 'Top produits'}
                </h4>
                <div className="space-y-1">
                  {report.top_products.map((p, i) => (
                    <div key={`item-${i}`} className="flex justify-between text-xs p-1.5 rounded bg-muted/30">
                      <span>{p.name || (isAr ? 'منتج' : 'Produit')}</span>
                      <span className="font-mono text-muted-foreground">{num(p.revenue || p.total)} {da}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Top Customers */}
            {report.top_customers && report.top_customers.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Users className="h-3 w-3" /> {isAr ? 'أفضل العملاء' : 'Meilleurs clients'}
                </h4>
                <div className="space-y-1">
                  {report.top_customers.map((c, i) => (
                    <div key={`item-${i}`} className="flex justify-between text-xs p-1.5 rounded bg-muted/30">
                      <span>{c.name || (isAr ? 'عميل' : 'Client')}</span>
                      <span className="font-mono text-muted-foreground">{num(c.total)} {da} ({c.count} {isAr ? 'طلب' : 'cmd'})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Employee performance */}
            {report.employee_performance && report.employee_performance.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                  <Users className="h-3 w-3" /> {isAr ? 'أداء الموظفين' : 'Performance employés'}
                </h4>
                <div className="space-y-1">
                  {report.employee_performance.slice(0, 5).map((e, i) => (
                    <div key={`item-${i}`} className="flex justify-between text-xs p-1.5 rounded bg-muted/30">
                      <span>{e.employee_name || (isAr ? 'موظف' : 'Employé')}</span>
                      <span className="font-mono text-muted-foreground">{num(e.total_sales)} {da} ({e.sales_count} {isAr ? 'بيع' : 'ventes'})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Debts (monthly) */}
            {report.debts && (
              <div className="p-2 rounded bg-amber-500/5 border border-amber-500/10">
                <p className="text-xs font-semibold text-amber-700">
                  {isAr
                    ? `الديون المستحقة: ${num(report.debts.total)} دج (${report.debts.count || 0} دين)`
                    : `Dettes dues : ${num(report.debts.total)} DA (${report.debts.count || 0} dettes)`}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function MiniStat({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <div>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-bold">{value}</p>
      </div>
    </div>
  );
}

export default function AutoReportsPage() {
  const { language } = useLanguage();  // p213
  const isAr = language === 'ar';
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [generating, setGenerating] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const params = filter !== 'all' ? `?report_type=${filter}` : '';
      const { data } = await apiClient.get(`/auto-reports${params}`);
      setReports(data);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleGenerate = async (type) => {
    setGenerating(true);
    try {
      await apiClient.post(`/robots/run/report`);
      toast.success(isAr ? 'تم إنشاء التقرير بنجاح' : 'Rapport généré avec succès');
      setTimeout(fetchReports, 2000);
    } catch (err) {
      toast.error(isAr ? 'فشل إنشاء التقرير' : 'Échec de la génération');
    } finally {
      setGenerating(false);
    }
  };

  // Compute totals from reports
  const totalSales = reports.reduce((s, r) => s + (r.stats?.sales_total || 0), 0);
  const totalProfit = reports.reduce((s, r) => s + (r.stats?.net_profit || 0), 0);
  const totalCount = reports.length;
  const da = isAr ? 'دج' : 'DA';

  // p213: Layout wraps EVERY render state — the sidebar must never disappear
  return (
    <Layout>
      {loading ? (
        <div className="flex items-center justify-center min-h-[60vh]" data-testid="reports-loading">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6 p-1" data-testid="auto-reports-page">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-primary" />
                {isAr ? 'التقارير التلقائية' : 'Rapports automatiques'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isAr ? 'تقارير مُولدة تلقائياً بواسطة روبوت التقارير' : 'Rapports générés automatiquement par le robot'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={fetchReports} data-testid="refresh-reports">
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> {isAr ? 'تحديث' : 'Actualiser'}
              </Button>
              <Button size="sm" onClick={handleGenerate} disabled={generating} data-testid="generate-report-btn">
                <FileText className="h-3.5 w-3.5 mr-1" /> {generating ? (isAr ? 'جاري الإنشاء...' : 'Génération...') : (isAr ? 'إنشاء تقرير' : 'Générer un rapport')}
              </Button>
            </div>
          </div>

          {/* Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card data-testid="total-reports">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10"><FileText className="h-5 w-5 text-blue-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{isAr ? 'إجمالي التقارير' : 'Total rapports'}</p>
                  <p className="font-bold text-lg">{totalCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="total-sales-sum">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10"><DollarSign className="h-5 w-5 text-emerald-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{isAr ? 'إجمالي المبيعات' : 'Ventes totales'}</p>
                  <p className="font-bold text-lg">{totalSales.toLocaleString(isAr ? 'ar-DZ' : 'fr-FR')} {da}</p>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="total-profit-sum">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10"><TrendingUp className="h-5 w-5 text-purple-500" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{isAr ? 'إجمالي الأرباح' : 'Profit total'}</p>
                  <p className="font-bold text-lg">{totalProfit.toLocaleString(isAr ? 'ar-DZ' : 'fr-FR')} {da}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2" data-testid="report-filters">
            {[
              { key: 'all', ar: 'الكل', fr: 'Tous' },
              { key: 'daily', ar: 'يومي', fr: 'Quotidien' },
              { key: 'weekly', ar: 'أسبوعي', fr: 'Hebdo' },
              { key: 'monthly', ar: 'شهري', fr: 'Mensuel' },
            ].map(f => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? 'default' : 'outline'}
                onClick={() => setFilter(f.key)}
                className="text-xs"
                data-testid={`filter-${f.key}`}
              >
                {isAr ? f.ar : f.fr}
              </Button>
            ))}
          </div>

          {/* Reports List */}
          {reports.length === 0 ? (
            <Card className="border-dashed" data-testid="no-reports">
              <CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">{isAr ? 'لا توجد تقارير بعد' : 'Aucun rapport pour le moment'}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isAr ? 'سيتم إنشاء التقارير تلقائياً أو يمكنك إنشاء واحد يدوياً' : 'Les rapports sont générés automatiquement, ou créez-en un manuellement'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3" data-testid="reports-list">
              {reports.map((report) => (
                <ReportCard key={report.id} report={report} isAr={isAr} />
              ))}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
