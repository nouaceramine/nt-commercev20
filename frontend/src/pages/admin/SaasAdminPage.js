import { errText } from '../../lib/errorText';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { toast } from 'sonner';
import {
  Plus, Edit, Trash2, Check, X, Clock, RefreshCw, Banknote,
  Receipt, Activity, Smartphone, Tv, Building,
} from 'lucide-react';
import { DatabaseManager } from '../../components/DatabaseManager';
import { SystemAlertsSection } from './components/SystemAlertsSection';
import { MonitoringSection } from './components/MonitoringSection';
import { FinanceReportsSection } from './components/FinanceReportsSection';
import { MonitoringDashboard } from './components/MonitoringDashboard';
import { AIAssistant } from '../../components/AIAssistant';
import { Bot } from 'lucide-react';
import { formatShortDate, convertToWesternNumerals } from '../../utils/globalDateFormatter';

// Map sidebar/url slugs ↔ internal Tabs `value` keys
const SLUG_TO_TAB = {
  'subscribers': 'tenants',
  'agents': 'agents',
  'plans': 'plans',
  'payments': 'payments',
  'platform-catalog': 'platform-catalog',
  'recharge-mgmt': 'recharge-mgmt',
  'finance': 'finance',
  'databases': 'databases',
  'alerts': 'alerts',
  'withdrawals': 'withdrawals',
  'ai-assistant': 'ai-assistant',
  'impersonation-logs': 'impersonation-logs',
  'default-pos-shortcuts': 'default-pos-shortcuts',
  'tenant-debts': 'tenant-debts',
  'audit-timeline': 'audit-timeline',
};

const TAB_HEADERS = {
  'tenants': { titleAr: 'المشتركين', subtitleAr: 'إدارة جميع المستأجرين، اشتراكاتهم، ومحافظهم' },
  'agents': { titleAr: 'الوكلاء', subtitleAr: 'إدارة الوكلاء الموزّعين وعمولاتهم' },
  'plans': { titleAr: 'الخطط', subtitleAr: 'إنشاء وتعديل خطط الاشتراك' },
  'payments': { titleAr: 'المدفوعات', subtitleAr: 'سجل جميع المدفوعات والتجديدات' },
  'platform-catalog': { titleAr: 'كتالوج IPTV', subtitleAr: 'إدارة كتالوج خدمات IPTV على المنصّة' },
  'recharge-mgmt': { titleAr: 'إدارة شحن الجوال', subtitleAr: 'إعدادات الشحن والمعاملات' },
  'finance': { titleAr: 'التقارير المالية', subtitleAr: 'تقارير الإيرادات والمصاريف المالية' },
  'databases': { titleAr: 'قواعد البيانات', subtitleAr: 'إدارة قواعد بيانات المستأجرين' },
  'alerts': { titleAr: 'سجل الأخطاء والتنبيهات', subtitleAr: 'تنبيهات النظام والأخطاء النشطة' },
  'withdrawals': { titleAr: 'طلبات السحب', subtitleAr: 'مراجعة طلبات السحب من الوكلاء' },
  'ai-assistant': { titleAr: 'المساعد الذكي', subtitleAr: 'مساعد إداري بالذكاء الاصطناعي' },
  'impersonation-logs': { titleAr: 'سجل الانتحال', subtitleAr: 'سجل جميع جلسات انتحال شخصية المستأجرين' },
  'default-pos-shortcuts': { titleAr: 'اختصارات POS الافتراضية', subtitleAr: 'تخصيص اختصارات الكاشير الافتراضية لكافة المستأجرين' },
  'tenant-debts': { titleAr: 'ديون التجار للمنصّة', subtitleAr: 'إدارة الديون المستحقّة من التجار والتذكيرات' },
  'audit-timeline': { titleAr: 'سجل التدقيق الموحّد', subtitleAr: 'خط زمني واحد يجمع كل عمليات التدقيق' },
};

export default function SaasAdminPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Derive activeTab from URL path. Base `/saas-admin` → monitoring (no inner tab)
  const slug = useMemo(() => {
    const m = location.pathname.match(/^\/saas-admin\/([^/]+)/);
    return m ? m[1] : '';
  }, [location.pathname]);
  const activeTab = SLUG_TO_TAB[slug] || '';
  const showMonitoringOnly = !activeTab; // base /saas-admin

  const [loading, setLoading] = useState(true);

  // Lightweight collections still needed by the Finance + Databases tabs
  // (those tabs are still served by this legacy page — extracting them is a
  // future cleanup task).
  const [tenants, setTenants] = useState([]);
  const [payments, setPayments] = useState([]);
  const [agents, setAgents] = useState([]);

  // ── Withdrawal requests (legacy /saas-admin/withdrawals tab)
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawalsBusy, setWithdrawalsBusy] = useState(false);
  const [rejectWithdrawalDialogOpen, setRejectWithdrawalDialogOpen] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // ── Impersonation logs (/saas-admin/impersonation-logs)
  const [impersonationLogs, setImpersonationLogs] = useState([]);
  const [impersonationLogsLoading, setImpersonationLogsLoading] = useState(false);
  const [impersonationActiveCount, setImpersonationActiveCount] = useState(0);

  // ── Default POS shortcuts (/saas-admin/default-pos-shortcuts)
  const [defaultShortcuts, setDefaultShortcuts] = useState([]);
  const [defaultShortcutsMeta, setDefaultShortcutsMeta] = useState({ updated_at: null, updated_by: null });
  const [defaultShortcutsLoading, setDefaultShortcutsLoading] = useState(false);
  const [defaultShortcutsSaving, setDefaultShortcutsSaving] = useState(false);

  // ── Recharge config (/saas-admin/recharge-mgmt)
  const [rechargeOperators, setRechargeOperators] = useState([]);
  const [rechargeOperatorsLoading, setRechargeOperatorsLoading] = useState(false);
  const [rechargeEditDialogOpen, setRechargeEditDialogOpen] = useState(false);
  const [rechargeEditOperator, setRechargeEditOperator] = useState(null);
  const [rechargeEditForm, setRechargeEditForm] = useState({ commission: '', amounts: '' });
  const [rechargeEditSaving, setRechargeEditSaving] = useState(false);
  const [rechargeTxns, setRechargeTxns] = useState([]);
  const [rechargeTxnsLoading, setRechargeTxnsLoading] = useState(false);
  const [rechargeTxnsMeta, setRechargeTxnsMeta] = useState({ total_count: 0, total_amount: 0 });

  // ── Platform catalog (/saas-admin/platform-catalog)
  const CATALOG_EMPTY = { name: '', category: 'iptv', server_name: '', supplier_name: '', duration_months: '', cost_price: '', sell_price: '', description: '', active: true };
  const [platformCatalog, setPlatformCatalog] = useState([]);
  const [platformCatalogLoading, setPlatformCatalogLoading] = useState(false);
  const [platformCatalogDialogOpen, setPlatformCatalogDialogOpen] = useState(false);
  const [platformCatalogEditing, setPlatformCatalogEditing] = useState(null);
  const [platformCatalogForm, setPlatformCatalogForm] = useState(CATALOG_EMPTY);
  const [platformCatalogSaving, setPlatformCatalogSaving] = useState(false);
  useEffect(() => {
    fetchData();
  }, []);

  // Load tab-specific data when URL-driven activeTab changes (was previously
  // wired to TabsTrigger onClick — now the trigger is hidden so we use effect).
  // Only the still-served tabs need loaders here; tenant-debts/audit-timeline
  // were extracted to their own pages so their branches are removed.
  useEffect(() => {
    if (!activeTab) return;
    if (activeTab === 'platform-catalog') loadPlatformCatalog();
    else if (activeTab === 'recharge-mgmt') { loadRechargeConfig(); loadRechargeTxns(); }
    else if (activeTab === 'impersonation-logs') loadImpersonationLogs();
    else if (activeTab === 'default-pos-shortcuts') loadDefaultShortcuts();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      const res = await apiClient.get('/saas/agent-withdrawals');
      setWithdrawals(res.data || []);
    } catch (error) {
      console.error('Error fetching withdrawals:', error);
      toast.error('خطأ في تحميل طلبات السحب');
    } finally {
      setLoading(false);
    }
  };

  const fetchWithdrawals = async () => {
    try {
      const res = await apiClient.get(`/saas/agent-withdrawals`);
      setWithdrawals(res.data || []);
    } catch (error) {
      toast.error('خطأ في تحميل طلبات السحب');
    }
  };

  const approveWithdrawal = async (id) => {
    setWithdrawalsBusy(true);
    try {
      await apiClient.post(`/saas/agent-withdrawals/${id}/approve`, {});
      toast.success('تمت الموافقة على طلب السحب');
      fetchWithdrawals();
    } catch (error) {
      toast.error(errText(error) ||  'فشل تنفيذ العملية');
    } finally { setWithdrawalsBusy(false); }
  };

  const openRejectWithdrawal = (wr) => {
    setSelectedWithdrawal(wr);
    setRejectReason('');
    setRejectWithdrawalDialogOpen(true);
  };

  const confirmRejectWithdrawal = async () => {
    if (!selectedWithdrawal) return;
    setWithdrawalsBusy(true);
    try {
      await apiClient.post(`/saas/agent-withdrawals/${selectedWithdrawal.id}/reject`, { reason: rejectReason });
      toast.success('تم رفض طلب السحب');
      setRejectWithdrawalDialogOpen(false);
      fetchWithdrawals();
    } catch (error) {
      toast.error(errText(error) ||  'فشل تنفيذ العملية');
    } finally { setWithdrawalsBusy(false); }
  };

  // Plan Functions
  // Agent Functions
  // Tenant Functions


  const loadImpersonationLogs = async () => {
    setImpersonationLogsLoading(true);
    try {
      const res = await apiClient.get('/saas/impersonation-logs?limit=200');
      setImpersonationLogs(res.data?.items || []);
      setImpersonationActiveCount(res.data?.total_active || 0);
    } catch (e) {
      toast.error(errText(e) ||  'فشل تحميل سجل الانتحال');
    } finally {
      setImpersonationLogsLoading(false);
    }
  };


  // ── Settle Debt ──

  const loadDefaultShortcuts = async () => {
    setDefaultShortcutsLoading(true);
    try {
      const res = await apiClient.get('/saas/default-pos-shortcuts');
      const items = res.data?.shortcuts || [];
      // Always render at least 8 slots so super-admin can fill them in
      const padded = [...items];
      while (padded.length < 8) padded.push({ productId: null, color: '#94a3b8', label: '' });
      setDefaultShortcuts(padded);
      setDefaultShortcutsMeta({ updated_at: res.data?.updated_at, updated_by: res.data?.updated_by });
    } catch (e) {
      toast.error(errText(e) ||  'فشل تحميل اختصارات POS الافتراضية');
    } finally {
      setDefaultShortcutsLoading(false);
    }
  };

  const saveDefaultShortcuts = async () => {
    setDefaultShortcutsSaving(true);
    try {
      // Save only the slots that have a non-empty label OR productId (drop empty slots)
      const cleaned = defaultShortcuts.filter(s => (s.label && s.label.trim()) || s.productId);
      await apiClient.put('/saas/default-pos-shortcuts', { shortcuts: cleaned });
      toast.success(`تم حفظ ${cleaned.length} اختصار افتراضي`);
      await loadDefaultShortcuts();
    } catch (e) {
      toast.error(errText(e) ||  'فشل الحفظ');
    } finally {
      setDefaultShortcutsSaving(false);
    }
  };

  const updateShortcutSlot = (index, field, value) => {
    setDefaultShortcuts(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addShortcutSlot = () => {
    setDefaultShortcuts(prev => [...prev, { productId: null, color: '#94a3b8', label: '' }]);
  };

  const removeShortcutSlot = (index) => {
    setDefaultShortcuts(prev => prev.filter((_, i) => i !== index));
  };

  const loadPlatformCatalog = async () => {
    setPlatformCatalogLoading(true);
    try {
      const res = await apiClient.get('/saas/platform-catalog');
      setPlatformCatalog(res.data || []);
    } catch (e) {
      toast.error('فشل تحميل الكتالوج');
    } finally {
      setPlatformCatalogLoading(false);
    }
  };

  const openPlatformCatalogCreate = () => {
    setPlatformCatalogEditing(null);
    setPlatformCatalogForm(CATALOG_EMPTY);
    setPlatformCatalogDialogOpen(true);
  };

  const openPlatformCatalogEdit = (item) => {
    setPlatformCatalogEditing(item);
    setPlatformCatalogForm({
      name: item.name || '', category: item.category || 'iptv',
      server_name: item.server_name || '', supplier_name: item.supplier_name || '',
      duration_months: item.duration_months ? String(item.duration_months) : '',
      cost_price: item.cost_price ?? '', sell_price: item.sell_price ?? '',
      description: item.description || '', active: item.active !== false,
    });
    setPlatformCatalogDialogOpen(true);
  };

  const savePlatformCatalogItem = async () => {
    if (!platformCatalogForm.name.trim()) { toast.error('اسم الباقة مطلوب'); return; }
    setPlatformCatalogSaving(true);
    try {
      const payload = {
        ...platformCatalogForm,
        duration_months: platformCatalogForm.duration_months ? parseInt(platformCatalogForm.duration_months) : null,
        cost_price: parseFloat(platformCatalogForm.cost_price) || 0,
        sell_price: parseFloat(platformCatalogForm.sell_price) || 0,
      };
      if (platformCatalogEditing) {
        await apiClient.put(`/saas/platform-catalog/${platformCatalogEditing.id}`, payload);
        toast.success('تم تحديث الباقة');
      } else {
        await apiClient.post('/saas/platform-catalog', payload);
        toast.success('تمت إضافة الباقة');
      }
      setPlatformCatalogDialogOpen(false);
      loadPlatformCatalog();
    } catch (err) {
      toast.error(errText(err) ||  'حدث خطأ');
    } finally {
      setPlatformCatalogSaving(false);
    }
  };

  const deletePlatformCatalogItem = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الباقة؟')) return;
    try {
      await apiClient.delete(`/saas/platform-catalog/${id}`);
      toast.success('تم حذف الباقة');
      loadPlatformCatalog();
    } catch (err) {
      toast.error(errText(err) ||  'حدث خطأ');
    }
  };

  const loadRechargeConfig = async () => {
    setRechargeOperatorsLoading(true);
    try {
      const res = await apiClient.get('/saas/recharge-config');
      setRechargeOperators(res.data || []);
    } catch (e) {
      toast.error('فشل تحميل إعدادات شركات الاتصال');
    } finally {
      setRechargeOperatorsLoading(false);
    }
  };

  const loadRechargeTxns = async () => {
    setRechargeTxnsLoading(true);
    try {
      const res = await apiClient.get('/saas/recharge-transactions?limit=100');
      setRechargeTxns(res.data?.transactions || []);
      setRechargeTxnsMeta({ total_count: res.data?.total_count || 0, total_amount: res.data?.total_amount || 0 });
    } catch (e) {
      toast.error('فشل تحميل سجل العمليات');
    } finally {
      setRechargeTxnsLoading(false);
    }
  };

  const openRechargeEditDialog = (op) => {
    setRechargeEditOperator(op);
    setRechargeEditForm({
      commission: String(op.commission ?? ''),
      amounts: (op.amounts || []).join(', '),
    });
    setRechargeEditDialogOpen(true);
  };

  const saveRechargeConfig = async () => {
    if (!rechargeEditOperator) return;
    setRechargeEditSaving(true);
    try {
      const amountsArr = rechargeEditForm.amounts
        .split(/[,،\s]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter(n => n > 0);
      await apiClient.put(`/saas/recharge-config/${rechargeEditOperator.operator}`, {
        commission: parseFloat(rechargeEditForm.commission) || 0,
        amounts: amountsArr,
      });
      toast.success('تم حفظ إعدادات ' + rechargeEditOperator.name);
      setRechargeEditDialogOpen(false);
      loadRechargeConfig();
    } catch (err) {
      toast.error(errText(err) ||  'حدث خطأ أثناء الحفظ');
    } finally {
      setRechargeEditSaving(false);
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
      <div className="space-y-6 animate-fade-in" data-testid="saas-admin-page">
        {showMonitoringOnly ? (
          <MonitoringDashboard />
        ) : (
          <>
            {/* Per-tab header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                  <Building className="h-7 w-7 text-primary" />
                  {TAB_HEADERS[activeTab]?.titleAr || 'لوحة SaaS'}
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  {TAB_HEADERS[activeTab]?.subtitleAr || ''}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => navigate('/saas-admin')}
                className="gap-2"
                data-testid="back-to-monitoring-btn"
              >
                <Activity className="h-4 w-4" />
                العودة للمراقبة
              </Button>
            </div>

            <Tabs value={activeTab} className="space-y-6">
              {/* Horizontal TabsList hidden — navigation now via right sidebar.
                  Only tabs still served by this legacy page are listed here:
                  Tenants/Plans/Payments/Tenant-Debts/Audit-Timeline/Agents
                  have been extracted to /pages/admin/saas/*.js                */}
              <TabsList className="hidden">
                <TabsTrigger value="platform-catalog" />
                <TabsTrigger value="recharge-mgmt" />
                <TabsTrigger value="finance" />
                <TabsTrigger value="databases" />
                <TabsTrigger value="monitoring" />
                <TabsTrigger value="alerts" />
                <TabsTrigger value="withdrawals" />
                <TabsTrigger value="ai-assistant" />
                <TabsTrigger value="impersonation-logs" />
                <TabsTrigger value="default-pos-shortcuts" />
              </TabsList>

              {/* ── Tab content sections ── */}


          {/* Platform IPTV Catalog Tab */}
          <TabsContent value="platform-catalog" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Tv className="h-5 w-5 text-blue-600" />
                  كتالوج IPTV للمنصة
                </h3>
                <p className="text-sm text-muted-foreground">
                  الباقات التي يمكن للمستأجرين شراؤها منك وإعادة بيعها لزبائنهم
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={loadPlatformCatalog}>
                  <RefreshCw className="h-4 w-4 me-1" /> تحديث
                </Button>
                <Button size="sm" onClick={openPlatformCatalogCreate} className="gap-2">
                  <Plus className="h-4 w-4" /> إضافة باقة
                </Button>
              </div>
            </div>

            {platformCatalogLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin me-2" /> جاري التحميل...
              </div>
            ) : platformCatalog.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <Tv className="h-12 w-12 opacity-30" />
                <p className="text-sm">لا توجد باقات بعد — أضف أول باقة IPTV للمستأجرين</p>
                <Button size="sm" onClick={openPlatformCatalogCreate} className="gap-2">
                  <Plus className="h-4 w-4" /> إضافة باقة
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {platformCatalog.map(item => (
                  <Card key={item.id} className={!item.active ? 'opacity-60' : ''}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold">{item.name}</div>
                          {item.server_name && <div className="text-xs text-muted-foreground">{item.server_name}</div>}
                          {item.supplier_name && <div className="text-xs text-muted-foreground">{item.supplier_name}</div>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className="text-xs">
                            {item.category === 'iptv' ? 'IPTV' : item.category === 'recharge' ? 'شحن رصيد' : 'أخرى'}
                          </Badge>
                          {!item.active && <Badge variant="secondary" className="text-xs">معطّل</Badge>}
                        </div>
                      </div>
                      {item.duration_months && (
                        <div className="text-xs text-muted-foreground">المدة: {item.duration_months} شهر</div>
                      )}
                      <div className="flex items-center justify-between pt-1 border-t text-sm">
                        <span className="text-muted-foreground">سعر التكلفة: <strong className="text-foreground">{(item.cost_price || 0).toLocaleString('ar-DZ')} دج</strong></span>
                        <span className="text-muted-foreground">سعر البيع: <strong className="text-green-700">{(item.sell_price || 0).toLocaleString('ar-DZ')} دج</strong></span>
                      </div>
                      {item.description && <div className="text-xs text-muted-foreground border-t pt-2">{item.description}</div>}
                      <div className="flex gap-1 pt-1 border-t">
                        <Button variant="ghost" size="sm" className="gap-1 flex-1" onClick={() => openPlatformCatalogEdit(item)}>
                          <Edit className="h-3.5 w-3.5" /> تعديل
                        </Button>
                        <Button variant="ghost" size="sm" className="gap-1 text-red-600" onClick={() => deletePlatformCatalogItem(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Recharge Management Tab */}
          <TabsContent value="recharge-mgmt" className="space-y-6">
            {/* Operator Cards */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-green-600" />
                    إعدادات شركات الاتصال
                  </h3>
                  <p className="text-sm text-muted-foreground">نسب العمولة والمبالغ المتاحة لكل شركة اتصال</p>
                </div>
                <Button variant="outline" size="sm" onClick={loadRechargeConfig} disabled={rechargeOperatorsLoading}>
                  <RefreshCw className={`h-4 w-4 me-1 ${rechargeOperatorsLoading ? 'animate-spin' : ''}`} /> تحديث
                </Button>
              </div>
              {rechargeOperatorsLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin me-2" /> جاري التحميل...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {rechargeOperators.map(op => (
                    <Card key={op.operator}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-base">{op.name}</span>
                          <Badge variant="outline" className="text-xs">{op.name_en}</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">العمولة</span>
                            <span className="font-semibold text-green-700">{op.commission}%</span>
                          </div>
                          <div className="text-muted-foreground text-xs">
                            المبالغ: {(op.amounts || []).join(' - ')} دج
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => openRechargeEditDialog(op)}>
                          <Edit className="h-3.5 w-3.5" /> تعديل الإعدادات
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Transactions Monitor */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-blue-600" />
                    سجل عمليات الشحن
                  </h3>
                  <div className="flex gap-4 mt-1 text-sm text-muted-foreground">
                    <span>الإجمالي: <strong className="text-foreground">{rechargeTxnsMeta.total_count}</strong> عملية</span>
                    <span>المبلغ: <strong className="text-foreground">{rechargeTxnsMeta.total_amount.toLocaleString('ar-DZ')} دج</strong></span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={loadRechargeTxns} disabled={rechargeTxnsLoading}>
                  <RefreshCw className={`h-4 w-4 me-1 ${rechargeTxnsLoading ? 'animate-spin' : ''}`} /> تحديث
                </Button>
              </div>
              {rechargeTxnsLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin me-2" /> جاري التحميل...
                </div>
              ) : rechargeTxns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
                  <Smartphone className="h-10 w-10 opacity-30" />
                  <p className="text-sm">لا توجد عمليات شحن بعد</p>
                </div>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">المستأجر</TableHead>
                        <TableHead className="text-right">الوصف</TableHead>
                        <TableHead className="text-right">المبلغ</TableHead>
                        <TableHead className="text-right">النوع</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rechargeTxns.map((txn, idx) => (
                        <TableRow key={txn.id || idx}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {txn.created_at ? new Date(txn.created_at).toLocaleString('ar-DZ') : '—'}
                          </TableCell>
                          <TableCell className="text-xs">{txn.entity_id || '—'}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{txn.description || '—'}</TableCell>
                          <TableCell className="text-sm font-semibold text-red-600">
                            -{(txn.amount || 0).toLocaleString('ar-DZ')} دج
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">شحن جوال</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Finance Reports Tab */}
          <TabsContent value="finance" className="space-y-6">
            <FinanceReportsSection tenants={tenants} payments={payments} />
          </TabsContent>

          {/* Databases Tab */}
          <TabsContent value="databases" className="space-y-6">
            <DatabaseManager tenants={tenants} agents={agents} />
          </TabsContent>

          <TabsContent value="monitoring" className="space-y-6" data-testid="monitoring-content">
            <MonitoringSection />
          </TabsContent>

          {/* System Alerts Tab */}
          <TabsContent value="alerts" className="space-y-6" data-testid="alerts-content">
            <SystemAlertsSection />
          </TabsContent>

          {/* Withdrawals Tab */}
          <TabsContent value="withdrawals" className="space-y-4" data-testid="withdrawals-content">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-emerald-600" />
                  طلبات سحب العمولات
                </h3>
                <p className="text-sm text-muted-foreground">
                  {withdrawals.filter(w => w.status === 'pending_approval').length} طلب بانتظار الموافقة
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={fetchWithdrawals}>
                <RefreshCw className="h-4 w-4" />
                تحديث
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الوكيل</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>بيانات الاستلام</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead className="text-center">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals.map(wr => (
                      <TableRow key={wr.id} data-testid={`withdrawal-row-${wr.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-foreground text-sm font-bold">
                              {wr.agent_name?.charAt(0) || '؟'}
                            </div>
                            <span className="font-medium">{wr.agent_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-lg">{(wr.amount || 0).toLocaleString()} دج</span>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-muted-foreground max-w-[200px] truncate" title={wr.bank_details}>
                            {wr.bank_details || '—'}
                          </p>
                          {wr.note && <p className="text-xs text-muted-foreground">{wr.note}</p>}
                        </TableCell>
                        <TableCell>
                          {wr.status === 'pending_approval' && (
                            <Badge className="bg-amber-500 gap-1">
                              <Clock className="h-3 w-3" />
                              بانتظار الموافقة
                            </Badge>
                          )}
                          {wr.status === 'approved' && (
                            <Badge className="bg-green-500 gap-1">
                              <Check className="h-3 w-3" />
                              تمت الموافقة
                            </Badge>
                          )}
                          {wr.status === 'rejected' && (
                            <div>
                              <Badge variant="destructive" className="gap-1">
                                <X className="h-3 w-3" />
                                مرفوض
                              </Badge>
                              {wr.reject_reason && (
                                <p className="text-xs text-muted-foreground mt-1">{wr.reject_reason}</p>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatShortDate(wr.created_at)}
                          {wr.resolved_at && (
                            <p className="text-xs">تمت المعالجة: {formatShortDate(wr.resolved_at)}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {wr.status === 'pending_approval' && (
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 gap-1"
                                onClick={() => approveWithdrawal(wr.id)}
                                disabled={withdrawalsBusy}
                                data-testid={`approve-withdrawal-${wr.id}`}
                              >
                                <Check className="h-4 w-4" />
                                موافقة
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="gap-1"
                                onClick={() => openRejectWithdrawal(wr)}
                                disabled={withdrawalsBusy}
                                data-testid={`reject-withdrawal-${wr.id}`}
                              >
                                <X className="h-4 w-4" />
                                رفض
                              </Button>
                            </div>
                          )}
                          {wr.status !== 'pending_approval' && (
                            <span className="text-xs text-muted-foreground">{wr.resolved_by || '—'}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {withdrawals.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12">
                          <Banknote className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                          <p className="text-muted-foreground">لا توجد طلبات سحب حالياً</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Assistant Tab */}
          <TabsContent value="ai-assistant" className="space-y-6" data-testid="ai-assistant-content">
            <AIAssistant />
          </TabsContent>

          {/* Impersonation Audit Log Tab */}
          <TabsContent value="impersonation-logs" className="space-y-4" data-testid="impersonation-logs-content">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">سجل عمليات الانتحال</h3>
                <p className="text-sm text-muted-foreground">سجل كامل لكل مرّة دخل فيها السوبر-أدمن إلى حساب مشترك — للتدقيق والمساءلة (Compliance).</p>
              </div>
              <div className="flex items-center gap-3">
                {impersonationActiveCount > 0 && (
                  <span className="rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-3 py-1 text-sm" data-testid="impersonation-active-count">
                    🟡 {impersonationActiveCount} جلسة نشطة
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={loadImpersonationLogs} data-testid="refresh-impersonation-logs-btn">
                  <RefreshCw className={`h-4 w-4 me-2 ${impersonationLogsLoading ? 'animate-spin' : ''}`} />
                  تحديث
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                {impersonationLogsLoading ? (
                  <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
                ) : impersonationLogs.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground" data-testid="impersonation-logs-empty">لا توجد عمليات انتحال مسجّلة بعد.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-start">السوبر-أدمن</th>
                          <th className="px-3 py-2 text-start">المشترك المُنتحَل</th>
                          <th className="px-3 py-2 text-start">IP</th>
                          <th className="px-3 py-2 text-start">بدأ</th>
                          <th className="px-3 py-2 text-start">انتهى</th>
                          <th className="px-3 py-2 text-start">المدّة</th>
                          <th className="px-3 py-2 text-start">الحالة</th>
                        </tr>
                      </thead>
                      <tbody data-testid="impersonation-logs-table">
                        {impersonationLogs.map((log) => (
                          <tr key={log.id} className="border-t border-border hover:bg-muted/30">
                            <td className="px-3 py-2 font-mono text-xs">{log.admin_email || log.admin_name || log.admin_id}</td>
                            <td className="px-3 py-2">{log.tenant_name} <span className="text-xs text-muted-foreground">({log.tenant_email})</span></td>
                            <td className="px-3 py-2 font-mono text-xs">{log.ip}</td>
                            <td className="px-3 py-2 text-xs">{formatShortDate(log.started_at)}</td>
                            <td className="px-3 py-2 text-xs">{log.stopped_at ? formatShortDate(log.stopped_at) : '—'}</td>
                            <td className="px-3 py-2 text-xs">
                              {log.duration_seconds != null
                                ? (log.duration_seconds < 60
                                    ? `${log.duration_seconds} ث`
                                    : log.duration_seconds < 3600
                                      ? `${Math.round(log.duration_seconds / 60)} د`
                                      : `${(log.duration_seconds / 3600).toFixed(1)} س`)
                                : '—'}
                            </td>
                            <td className="px-3 py-2">
                              {log.status === 'active' ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-2 py-0.5 text-xs">🟡 جاري</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 text-xs">✓ مُنتهى</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* Default POS Shortcuts Tab */}
          <TabsContent value="default-pos-shortcuts" className="space-y-4" data-testid="default-pos-shortcuts-content">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">اختصارات POS الافتراضية</h3>
                <p className="text-sm text-muted-foreground">
                  حدّد شبكة اختصارات افتراضية للمستأجرين الجدد. أي كاشير لم يُخصّص اختصاراته بعد سيرى هذه الشبكة عند فتح شاشة البيع.
                </p>
                {defaultShortcutsMeta.updated_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    آخر تحديث: {formatShortDate(defaultShortcutsMeta.updated_at)} — بواسطة {defaultShortcutsMeta.updated_by || '—'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={addShortcutSlot} data-testid="add-shortcut-slot-btn">
                  <Plus className="h-4 w-4 me-1" />
                  إضافة خانة
                </Button>
                <Button variant="outline" size="sm" onClick={loadDefaultShortcuts} disabled={defaultShortcutsLoading} data-testid="refresh-default-shortcuts-btn">
                  <RefreshCw className={`h-4 w-4 me-1 ${defaultShortcutsLoading ? 'animate-spin' : ''}`} />
                  تحديث
                </Button>
                <Button onClick={saveDefaultShortcuts} disabled={defaultShortcutsSaving || defaultShortcutsLoading} data-testid="save-default-shortcuts-btn">
                  {defaultShortcutsSaving ? 'جارٍ الحفظ…' : 'حفظ'}
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-6">
                {defaultShortcutsLoading ? (
                  <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" data-testid="default-shortcuts-grid">
                    {defaultShortcuts.map((slot, idx) => (
                      <div key={`slot-${idx}`} className="rounded-lg border border-border p-3 space-y-2 bg-card" data-testid={`shortcut-slot-${idx}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">خانة #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeShortcutSlot(idx)}
                            className="text-xs text-red-600 hover:underline"
                            data-testid={`remove-slot-${idx}-btn`}
                          >
                            حذف
                          </button>
                        </div>
                        <Input
                          value={slot.label || ''}
                          onChange={(e) => updateShortcutSlot(idx, 'label', e.target.value)}
                          placeholder="اسم المنتج"
                          data-testid={`shortcut-label-${idx}`}
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">اللون</span>
                          <input
                            type="color"
                            value={slot.color || '#94a3b8'}
                            onChange={(e) => updateShortcutSlot(idx, 'color', e.target.value)}
                            className="h-8 w-12 rounded cursor-pointer"
                            data-testid={`shortcut-color-${idx}`}
                          />
                          <div
                            className="flex-1 h-8 rounded text-center text-white text-xs flex items-center justify-center font-medium"
                            style={{ backgroundColor: slot.color || '#94a3b8' }}
                          >
                            {slot.label || '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
          </>
        )}

        {/* Reject Withdrawal Dialog */}
        <Dialog open={rejectWithdrawalDialogOpen} onOpenChange={setRejectWithdrawalDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <X className="h-5 w-5 text-destructive" />
                رفض طلب السحب
              </DialogTitle>
              <DialogDescription>
                الوكيل: {selectedWithdrawal?.agent_name} — {selectedWithdrawal?.amount?.toLocaleString()} دج
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">سبب الرفض (اختياري)</Label>
                <Textarea
                  rows={3}
                  placeholder="أدخل سبب الرفض ليتمكن الوكيل من رؤيته..."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectWithdrawalDialogOpen(false)}>إلغاء</Button>
              <Button variant="destructive" onClick={confirmRejectWithdrawal} disabled={withdrawalsBusy} className="gap-2">
                {withdrawalsBusy && <RefreshCw className="h-4 w-4 animate-spin" />}
                تأكيد الرفض
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Platform Catalog Dialog */}
        <Dialog open={platformCatalogDialogOpen} onOpenChange={setPlatformCatalogDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Tv className="h-5 w-5 text-blue-600" />
                {platformCatalogEditing ? 'تعديل الباقة' : 'إضافة باقة جديدة'}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="space-y-1 col-span-2">
                <Label>اسم الباقة *</Label>
                <Input value={platformCatalogForm.name} onChange={e => setPlatformCatalogForm(f => ({...f, name: e.target.value}))} placeholder="مثال: باقة IPTV شهرية" />
              </div>
              <div className="space-y-1">
                <Label>الفئة</Label>
                <Select value={platformCatalogForm.category} onValueChange={v => setPlatformCatalogForm(f => ({...f, category: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="iptv">IPTV</SelectItem>
                    <SelectItem value="recharge">شحن رصيد</SelectItem>
                    <SelectItem value="other">أخرى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>المدة (شهر)</Label>
                <Input type="number" min="1" placeholder="اختياري" value={platformCatalogForm.duration_months} onChange={e => setPlatformCatalogForm(f => ({...f, duration_months: e.target.value}))} />
              </div>
              <div className="space-y-1">
                <Label>السيرفر / الباقة</Label>
                <Input placeholder="اسم السيرفر" value={platformCatalogForm.server_name} onChange={e => setPlatformCatalogForm(f => ({...f, server_name: e.target.value}))} />
              </div>
              <div className="space-y-1">
                <Label>المورّد</Label>
                <Input placeholder="اسم المورّد" value={platformCatalogForm.supplier_name} onChange={e => setPlatformCatalogForm(f => ({...f, supplier_name: e.target.value}))} />
              </div>
              <div className="space-y-1">
                <Label>سعر التكلفة للمستأجر (دج)</Label>
                <Input type="number" min="0" placeholder="ما يدفعه المستأجر" value={platformCatalogForm.cost_price} onChange={e => setPlatformCatalogForm(f => ({...f, cost_price: e.target.value}))} />
              </div>
              <div className="space-y-1">
                <Label>سعر البيع المقترح (دج)</Label>
                <Input type="number" min="0" placeholder="السعر للزبون النهائي" value={platformCatalogForm.sell_price} onChange={e => setPlatformCatalogForm(f => ({...f, sell_price: e.target.value}))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>وصف (اختياري)</Label>
                <Textarea rows={2} placeholder="وصف الباقة..." value={platformCatalogForm.description} onChange={e => setPlatformCatalogForm(f => ({...f, description: e.target.value}))} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch checked={platformCatalogForm.active} onCheckedChange={v => setPlatformCatalogForm(f => ({...f, active: v}))} />
                <Label>الباقة متاحة للمستأجرين</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPlatformCatalogDialogOpen(false)}>إلغاء</Button>
              <Button onClick={savePlatformCatalogItem} disabled={platformCatalogSaving} className="gap-2">
                {platformCatalogSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                حفظ الباقة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Recharge Operator Edit Dialog */}
        <Dialog open={rechargeEditDialogOpen} onOpenChange={setRechargeEditDialogOpen}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-green-600" />
                تعديل: {rechargeEditOperator?.name}
              </DialogTitle>
              <DialogDescription>
                يؤثر على نسبة العمولة ومبالغ الشحن المتاحة لجميع المستأجرين
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>نسبة العمولة (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  placeholder="مثال: 3"
                  value={rechargeEditForm.commission}
                  onChange={e => setRechargeEditForm({ ...rechargeEditForm, commission: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  العمولة التي تحصل عليها لكل عملية شحن — التكلفة = المبلغ − العمولة
                </p>
              </div>
              <div className="space-y-2">
                <Label>المبالغ المتاحة (دج)</Label>
                <Input
                  placeholder="100, 200, 500, 1000, 2000, 5000"
                  value={rechargeEditForm.amounts}
                  onChange={e => setRechargeEditForm({ ...rechargeEditForm, amounts: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  أدخل المبالغ مفصولةً بفاصلة
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRechargeEditDialogOpen(false)}>إلغاء</Button>
              <Button
                onClick={saveRechargeConfig}
                disabled={rechargeEditSaving}
                className="bg-green-600 hover:bg-green-700"
              >
                {rechargeEditSaving
                  ? <><RefreshCw className="h-4 w-4 animate-spin me-2" />جاري الحفظ...</>
                  : <><Check className="h-4 w-4 me-2" />حفظ الإعدادات</>
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}