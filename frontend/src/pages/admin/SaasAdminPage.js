import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
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
  Users, Building, CreditCard, TrendingUp, Package, 
  Settings, Plus, Edit, Trash2, Check, X, Clock,
  AlertTriangle, DollarSign, Search, MoreHorizontal,
  Star, Eye, EyeOff, Ban, RefreshCw, Calendar, Store, Truck, ShoppingBag,
  Banknote, Wallet, PiggyBank, Receipt, Calculator, FileText, ArrowUpRight, ArrowDownRight,
  Database, Activity, BarChart3, ShoppingCart, UserCheck, LogIn, Bell, UserCog, Copy,
  AlertCircle, Bug, Shield, Zap, Server, Wrench, CheckCircle, XCircle, Download, Play, Pause,
  Wifi, WifiOff, Sliders, Boxes, Tv, ShoppingBag as ShoppingBagIcon, Smartphone, ShieldCheck, LayoutDashboard
} from 'lucide-react';
import { DatabaseManager } from '../../components/DatabaseManager';
import { AgentsDashboard } from './components/AgentsDashboard';
import { SystemAlertsSection } from './components/SystemAlertsSection';
import { MonitoringSection } from './components/MonitoringSection';
import { FinanceReportsSection } from './components/FinanceReportsSection';
import PlatformCapacityCard from './components/PlatformCapacityCard';
import { MonitoringDashboard } from './components/MonitoringDashboard';
import { EntityCode } from './components/EntityCode';
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
  const [stats, setStats] = useState({});
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialogs
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editingTenant, setEditingTenant] = useState(null);
  const [selectedTenantForExtend, setSelectedTenantForExtend] = useState(null);
  
  // Forms
  const [planForm, setPlanForm] = useState({
    name: '', name_ar: '', description: '', description_ar: '',
    price_monthly: 0, price_6months: 0, price_yearly: 0,
    features: {}, limits: {}, is_active: true, is_popular: false, sort_order: 0,
    commission_rate: 10
  });
  
  const [tenantForm, setTenantForm] = useState({
    name: '', email: '', phone: '', company_name: '', password: '',
    plan_id: '', subscription_type: 'monthly', business_type: 'retailer', role: 'admin'
  });

  const [showPassword, setShowPassword] = useState(false);

  const [extendForm, setExtendForm] = useState({
    amount: 0, payment_method: 'manual', subscription_type: 'monthly', notes: '', transaction_id: ''
  });

  // Agents State
  const [agents, setAgents] = useState([]);
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [agentTransactionsDialogOpen, setAgentTransactionsDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agentTransactions, setAgentTransactions] = useState([]);
  const [addPaymentDialogOpen, setAddPaymentDialogOpen] = useState(false);

  // Withdrawal requests state
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawalsBusy, setWithdrawalsBusy] = useState(false);
  const [rejectWithdrawalDialogOpen, setRejectWithdrawalDialogOpen] = useState(false);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  
  // Impersonation State
  const [impersonateDialogOpen, setImpersonateDialogOpen] = useState(false);
  const [impersonateTenant, setImpersonateTenant] = useState(null);
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [impersonationLogs, setImpersonationLogs] = useState([]);
  const [impersonationLogsLoading, setImpersonationLogsLoading] = useState(false);
  const [impersonationActiveCount, setImpersonationActiveCount] = useState(0);
  // Default POS shortcuts
  const [defaultShortcuts, setDefaultShortcuts] = useState([]);
  const [defaultShortcutsMeta, setDefaultShortcutsMeta] = useState({ updated_at: null, updated_by: null });
  const [defaultShortcutsLoading, setDefaultShortcutsLoading] = useState(false);
  const [defaultShortcutsSaving, setDefaultShortcutsSaving] = useState(false);
  // Tenant Debts dashboard
  const [tenantDebts, setTenantDebts] = useState([]);
  const [tenantDebtsSummary, setTenantDebtsSummary] = useState({ total_tenants_with_debt: 0, total_debt: 0, overdue_subscriptions: 0 });
  const [tenantDebtsLoading, setTenantDebtsLoading] = useState(false);
  const [remindingTenantId, setRemindingTenantId] = useState(null);
  // Settle Debt dialog state
  const [settleDebtDialogOpen, setSettleDebtDialogOpen] = useState(false);
  const [settleDebtTenant, setSettleDebtTenant] = useState(null);
  const [settleDebtAmount, setSettleDebtAmount] = useState(0);
  const [settleDebtNote, setSettleDebtNote] = useState('');
  const [settleDebtBusy, setSettleDebtBusy] = useState(false);
  // Audit Timeline
  const [auditEvents, setAuditEvents] = useState([]);
  const [auditSummary, setAuditSummary] = useState({ total: 0, by_type: {} });
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState({ type: '', tenant_id: '', since: '', until: '' });

  // Bridge Mode State
  const [bridgeDialogOpen, setBridgeDialogOpen] = useState(false);
  const [walletChargeDialogOpen, setWalletChargeDialogOpen] = useState(false);
  const [walletChargeTenant, setWalletChargeTenant] = useState(null);
  const [walletChargeForm, setWalletChargeForm] = useState({ amount: '', notes: '', payment_method: 'cash' });
  const [walletChargeLoading, setWalletChargeLoading] = useState(false);
  const [walletInfo, setWalletInfo] = useState(null);
  const [walletInfoLoading, setWalletInfoLoading] = useState(false);

  // Recharge Config State
  const [rechargeOperators, setRechargeOperators] = useState([]);
  const [rechargeOperatorsLoading, setRechargeOperatorsLoading] = useState(false);
  const [rechargeEditDialogOpen, setRechargeEditDialogOpen] = useState(false);
  const [rechargeEditOperator, setRechargeEditOperator] = useState(null);
  const [rechargeEditForm, setRechargeEditForm] = useState({ commission: '', amounts: '' });
  const [rechargeEditSaving, setRechargeEditSaving] = useState(false);
  const [rechargeTxns, setRechargeTxns] = useState([]);
  const [rechargeTxnsLoading, setRechargeTxnsLoading] = useState(false);
  const [rechargeTxnsMeta, setRechargeTxnsMeta] = useState({ total_count: 0, total_amount: 0 });

  // Platform Catalog State
  const CATALOG_EMPTY = { name: '', category: 'iptv', server_name: '', supplier_name: '', duration_months: '', cost_price: '', sell_price: '', description: '', active: true };
  const [platformCatalog, setPlatformCatalog] = useState([]);
  const [platformCatalogLoading, setPlatformCatalogLoading] = useState(false);
  const [platformCatalogDialogOpen, setPlatformCatalogDialogOpen] = useState(false);
  const [platformCatalogEditing, setPlatformCatalogEditing] = useState(null);
  const [platformCatalogForm, setPlatformCatalogForm] = useState(CATALOG_EMPTY);
  const [platformCatalogSaving, setPlatformCatalogSaving] = useState(false);
  const [bridgeTenant, setBridgeTenant] = useState(null);
  const [bridgeForm, setBridgeForm] = useState({ recharge_mode: 'owner_bridge', self_bridge_url: '', self_bridge_api_key: '' });
  const [bridgeSaving, setBridgeSaving] = useState(false);
  const [bridgeTesting, setBridgeTesting] = useState(false);
  const [bridgeTestResult, setBridgeTestResult] = useState(null);

  // Feature Flags State
  const [featureFlagsDialogOpen, setFeatureFlagsDialogOpen] = useState(false);
  const [selectedTenantForFlags, setSelectedTenantForFlags] = useState(null);
  const [tenantFeatureFlags, setTenantFeatureFlags] = useState({});
  const [savingFlags, setSavingFlags] = useState(false);
  
  const [agentForm, setAgentForm] = useState({
    name: '', email: '', password: '', phone: '', company_name: '', address: '',
    commission_percent: 10, commission_fixed: 0, credit_limit: 100000, notes: ''
  });
  
  const [paymentForm, setPaymentForm] = useState({
    amount: 0, transaction_type: 'payment', description: '', notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load tab-specific data when URL-driven activeTab changes (was previously
  // wired to TabsTrigger onClick — now the trigger is hidden so we use effect).
  useEffect(() => {
    if (!activeTab) return;
    if (activeTab === 'platform-catalog') loadPlatformCatalog();
    else if (activeTab === 'recharge-mgmt') { loadRechargeConfig(); loadRechargeTxns(); }
    else if (activeTab === 'impersonation-logs') loadImpersonationLogs();
    else if (activeTab === 'default-pos-shortcuts') loadDefaultShortcuts();
    else if (activeTab === 'tenant-debts') loadTenantDebts();
    else if (activeTab === 'audit-timeline') loadAuditTimeline();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [statsRes, tenantsRes, plansRes, paymentsRes, agentsRes, withdrawalsRes] = await Promise.allSettled([
        apiClient.get(`/saas/stats`, { headers }),
        apiClient.get(`/saas/tenants`, { headers }),
        apiClient.get(`/saas/plans?include_inactive=true`, { headers }),
        apiClient.get(`/saas/payments`, { headers }),
        apiClient.get(`/saas/agents`, { headers }),
        apiClient.get(`/saas/agent-withdrawals`, { headers }),
      ]);
      
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data);
      if (tenantsRes.status === 'fulfilled') setTenants(tenantsRes.value.data);
      if (plansRes.status === 'fulfilled') setPlans(plansRes.value.data);
      if (paymentsRes.status === 'fulfilled') setPayments(paymentsRes.value.data);
      if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value.data);
      if (withdrawalsRes.status === 'fulfilled') setWithdrawals(withdrawalsRes.value.data || []);
      
      const failed = [statsRes, tenantsRes, plansRes, paymentsRes, agentsRes].filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        console.error('Some requests failed:', failed.map(f => f.reason?.message));
        toast.error('بعض البيانات لم تحمل بشكل كامل');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('خطأ في تحميل البيانات');
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
      toast.error(error.response?.data?.detail || 'فشل تنفيذ العملية');
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
      toast.error(error.response?.data?.detail || 'فشل تنفيذ العملية');
    } finally { setWithdrawalsBusy(false); }
  };

  // Plan Functions
  const openPlanDialog = (plan = null) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanForm({
        name: plan.name, name_ar: plan.name_ar,
        description: plan.description, description_ar: plan.description_ar,
        price_monthly: plan.price_monthly, price_6months: plan.price_6months, price_yearly: plan.price_yearly,
        features: plan.features || {}, limits: plan.limits || {},
        is_active: plan.is_active, is_popular: plan.is_popular, sort_order: plan.sort_order,
        commission_rate: plan.commission_rate ?? 10
      });
    } else {
      setEditingPlan(null);
      setPlanForm({
        name: '', name_ar: '', description: '', description_ar: '',
        price_monthly: 0, price_6months: 0, price_yearly: 0,
        features: { pos: true, reports: true, ai_tips: false, multi_warehouse: false },
        limits: { max_products: 100, max_users: 3, max_sales_per_month: 500 },
        is_active: true, is_popular: false, sort_order: plans.length,
        commission_rate: 10
      });
    }
    setPlanDialogOpen(true);
  };

  const savePlan = async () => {
    try {
      const token = localStorage.getItem('token');
      if (editingPlan) {
        await apiClient.put(`/saas/plans/${editingPlan.id}`, planForm);
        toast.success('تم تحديث الخطة بنجاح');
      } else {
        await apiClient.post(`/saas/plans`, planForm);
        toast.success('تم إنشاء الخطة بنجاح');
      }
      setPlanDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ');
    }
  };

  const deletePlan = async (planId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الخطة؟')) return;
    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/saas/plans/${planId}`);
      toast.success('تم حذف الخطة');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ');
    }
  };

  // Agent Functions
  const openAgentDialog = (agent = null) => {
    if (agent) {
      setEditingAgent(agent);
      setAgentForm({
        name: agent.name, email: agent.email, password: '', phone: agent.phone,
        company_name: agent.company_name || '', address: agent.address || '',
        commission_percent: agent.commission_percent || 10,
        commission_fixed: agent.commission_fixed || 0,
        credit_limit: agent.credit_limit || 100000,
        notes: agent.notes || ''
      });
    } else {
      setEditingAgent(null);
      setAgentForm({
        name: '', email: '', password: '', phone: '', company_name: '', address: '',
        commission_percent: 10, commission_fixed: 0, credit_limit: 100000, notes: ''
      });
    }
    setAgentDialogOpen(true);
  };

  const saveAgent = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      if (editingAgent) {
        const updateData = { ...agentForm };
        if (!updateData.password) delete updateData.password;
        await apiClient.put(`/saas/agents/${editingAgent.id}`, updateData, { headers });
        toast.success('تم تحديث الوكيل بنجاح');
      } else {
        await apiClient.post(`/saas/agents`, agentForm, { headers });
        toast.success('تم إنشاء الوكيل بنجاح');
      }
      setAgentDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ');
    }
  };

  const deleteAgent = async (agentId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الوكيل؟')) return;
    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/saas/agents/${agentId}`);
      toast.success('تم حذف الوكيل');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ');
    }
  };

  const openAgentTransactions = async (agent) => {
    setSelectedAgent(agent);
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/saas/agents/${agent.id}/transactions`);
      setAgentTransactions(response.data);
      setAgentTransactionsDialogOpen(true);
    } catch (error) {
      toast.error('خطأ في تحميل المعاملات');
    }
  };

  const openAddPayment = (agent) => {
    setSelectedAgent(agent);
    setPaymentForm({ amount: 0, transaction_type: 'payment', description: 'دفعة نقدية', notes: '' });
    setAddPaymentDialogOpen(true);
  };

  const saveAgentPayment = async () => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/saas/agents/${selectedAgent.id}/transactions`, paymentForm);
      toast.success('تم تسجيل الدفعة بنجاح');
      setAddPaymentDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ');
    }
  };

  // Tenant Functions
  const openBridgeDialog = (tenant) => {
    setBridgeTenant(tenant);
    setBridgeForm({
      recharge_mode: tenant.recharge_mode || 'owner_bridge',
      self_bridge_url: tenant.self_bridge_url || '',
      self_bridge_api_key: tenant.self_bridge_api_key || '',
    });
    setBridgeTestResult(null);
    setBridgeDialogOpen(true);
  };

  const saveBridgeMode = async () => {
    if (!bridgeTenant) return;
    setBridgeSaving(true);
    try {
      await apiClient.put(`/saas/tenants/${bridgeTenant.id}/recharge-mode`, bridgeForm);
      toast.success('تم تحديث وضع الجسر');
      setBridgeDialogOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطأ في الحفظ');
    } finally {
      setBridgeSaving(false);
    }
  };

  const testBridgeFromAdmin = async () => {
    if (!bridgeTenant) return;
    setBridgeTesting(true);
    setBridgeTestResult(null);
    try {
      const res = await apiClient.post(`/saas/tenants/${bridgeTenant.id}/test-bridge`, {
        self_bridge_url: bridgeForm.self_bridge_url,
        self_bridge_api_key: bridgeForm.self_bridge_api_key,
      });
      setBridgeTestResult(res.data);
      if (res.data.ok) toast.success('الجسر متصل ويعمل');
      else toast.error('الجسر غير متاح');
    } catch (err) {
      setBridgeTestResult({ ok: false, error: err.response?.data?.detail || err.message });
    } finally {
      setBridgeTesting(false);
    }
  };

  const openImpersonateDialog = (tenant) => {
    setImpersonateTenant(tenant);
    setImpersonateDialogOpen(true);
  };

  const handleImpersonate = async () => {
    if (!impersonateTenant) return;
    setImpersonateLoading(true);
    try {
      const originalToken = localStorage.getItem('token');
      const originalUser = localStorage.getItem('user');
      const res = await apiClient.post(`/saas/impersonate/${impersonateTenant.id}`, {});
      const data = res.data;
      // Preserve original super-admin session so user can return + still access platform pages
      if (originalToken) localStorage.setItem('super_admin_token', originalToken);
      if (originalUser) localStorage.setItem('super_admin_user', originalUser);
      // Store new token and user data
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('user_type', 'tenant');
      localStorage.setItem('is_impersonating', '1');
      if (data.impersonation_session_id) {
        localStorage.setItem('impersonation_session_id', data.impersonation_session_id);
      }
      // Redirect to dashboard
      window.location.href = '/';
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل الدخول لحساب المشترك');
      setImpersonateLoading(false);
    }
  };

  const loadImpersonationLogs = async () => {
    setImpersonationLogsLoading(true);
    try {
      const res = await apiClient.get('/saas/impersonation-logs?limit=200');
      setImpersonationLogs(res.data?.items || []);
      setImpersonationActiveCount(res.data?.total_active || 0);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تحميل سجل الانتحال');
    } finally {
      setImpersonationLogsLoading(false);
    }
  };

  const loadAuditTimeline = async (filters = auditFilters) => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '300');
      if (filters.type) params.append('event_type', filters.type);
      if (filters.tenant_id) params.append('tenant_id', filters.tenant_id);
      if (filters.since) params.append('since', filters.since);
      if (filters.until) params.append('until', filters.until);
      const res = await apiClient.get(`/saas/audit-timeline?${params.toString()}`);
      setAuditEvents(res.data?.events || []);
      setAuditSummary(res.data?.summary || { total: 0, by_type: {} });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تحميل سجل التدقيق');
    } finally {
      setAuditLoading(false);
    }
  };

  const loadTenantDebts = async () => {
    setTenantDebtsLoading(true);
    try {
      const res = await apiClient.get('/saas/tenant-debts');
      setTenantDebts(res.data?.items || []);
      setTenantDebtsSummary(res.data?.summary || { total_tenants_with_debt: 0, total_debt: 0, overdue_subscriptions: 0 });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تحميل ديون التجار');
    } finally {
      setTenantDebtsLoading(false);
    }
  };

  const remindTenant = async (tenantId) => {
    setRemindingTenantId(tenantId);
    try {
      const res = await apiClient.post(`/saas/tenant-debts/${tenantId}/remind`, { channel: 'email' });
      if (res.data?.delivered) {
        toast.success('تم إرسال التذكير بنجاح');
      } else {
        toast.success(`تم تسجيل التذكير${res.data?.delivery_error ? ` (لم يُرسَل: ${res.data.delivery_error})` : ''}`);
      }
      await loadTenantDebts();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل إرسال التذكير');
    } finally {
      setRemindingTenantId(null);
    }
  };

  const downloadStatementPdf = async (tenant) => {
    try {
      const res = await apiClient.get(`/saas/tenant-debts/${tenant.tenant_id}/statement.pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement_${(tenant.tenant_name || tenant.tenant_id).replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('فشل تنزيل كشف الحساب');
    }
  };

  // ── Settle Debt ──
  const openSettleDebtDialog = (tenant) => {
    setSettleDebtTenant(tenant);
    setSettleDebtAmount(tenant.credit_debt || 0);
    setSettleDebtNote('');
    setSettleDebtDialogOpen(true);
  };

  const confirmSettleDebt = async () => {
    if (!settleDebtTenant) return;
    const amount = parseFloat(settleDebtAmount);
    if (!amount || amount <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر');
      return;
    }
    if (amount > (settleDebtTenant.credit_debt || 0)) {
      toast.error(`المبلغ يفوق الدين المسجَّل (${(settleDebtTenant.credit_debt || 0).toLocaleString('ar-DZ')} دج)`);
      return;
    }
    setSettleDebtBusy(true);
    try {
      const res = await apiClient.post('/wallet/settle-credit', {
        entity_id: settleDebtTenant.tenant_id,
        amount,
        description: settleDebtNote || `تسديد دين — ${settleDebtTenant.tenant_name || settleDebtTenant.tenant_id}`,
      });
      toast.success(`تم التسديد. الدين المتبقّي: ${Number(res.data?.credit_debt_remaining || 0).toLocaleString('ar-DZ')} دج`);
      setSettleDebtDialogOpen(false);
      setSettleDebtTenant(null);
      await loadTenantDebts();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تسديد الدين');
    } finally {
      setSettleDebtBusy(false);
    }
  };

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
      toast.error(e.response?.data?.detail || 'فشل تحميل اختصارات POS الافتراضية');
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
      toast.error(e.response?.data?.detail || 'فشل الحفظ');
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
      toast.error(err.response?.data?.detail || 'حدث خطأ');
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
      toast.error(err.response?.data?.detail || 'حدث خطأ');
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
      toast.error(err.response?.data?.detail || 'حدث خطأ أثناء الحفظ');
    } finally {
      setRechargeEditSaving(false);
    }
  };

  const openWalletChargeDialog = async (tenant) => {
    setWalletChargeTenant(tenant);
    setWalletChargeForm({ amount: '', notes: '' });
    setWalletInfo(null);
    setWalletChargeDialogOpen(true);
    setWalletInfoLoading(true);
    try {
      const res = await apiClient.get(`/saas/tenants/${tenant.id}/wallet`);
      setWalletInfo(res.data);
    } catch (e) {
      setWalletInfo(null);
    } finally {
      setWalletInfoLoading(false);
    }
  };

  const handleWalletCharge = async () => {
    if (!walletChargeTenant) return;
    const amount = parseFloat(walletChargeForm.amount);
    if (!amount || amount <= 0) {
      toast.error('أدخل مبلغاً صحيحاً أكبر من صفر');
      return;
    }
    setWalletChargeLoading(true);
    try {
      // Use the central /wallet/add-funds endpoint which supports payment_method
      const res = await apiClient.post('/wallet/add-funds', {
        entity_id: walletChargeTenant.id,
        amount,
        payment_method: walletChargeForm.payment_method,
        description: walletChargeForm.notes || (walletChargeForm.payment_method === 'cash' ? 'شحن نقدي من المدير العام' : 'شحن بالدين من المدير العام'),
      });
      const methodLabel = walletChargeForm.payment_method === 'cash' ? 'نقداً' : 'بالدين';
      toast.success(`تم شحن المحفظة ${methodLabel} — الرصيد الجديد: ${res.data.new_balance?.toLocaleString('ar-DZ')} دج`);
      setWalletChargeDialogOpen(false);
      setWalletChargeForm({ amount: '', notes: '', payment_method: 'cash' });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'حدث خطأ أثناء شحن المحفظة');
    } finally {
      setWalletChargeLoading(false);
    }
  };

  const openTenantDialog = (tenant = null) => {
    if (tenant) {
      setEditingTenant(tenant);
      setTenantForm({
        name: tenant.name, email: tenant.email, phone: tenant.phone,
        company_name: tenant.company_name, password: '',
        plan_id: tenant.plan_id, subscription_type: tenant.subscription_type,
        business_type: tenant.business_type || 'retailer', role: tenant.role || 'admin'
      });
    } else {
      setEditingTenant(null);
      setTenantForm({
        name: '', email: '', phone: '', company_name: '', password: '',
        plan_id: plans[0]?.id || '', subscription_type: 'monthly',
        business_type: 'retailer', role: 'admin'
      });
    }
    setTenantDialogOpen(true);
  };

  const saveTenant = async () => {
    try {
      const token = localStorage.getItem('token');
      if (editingTenant) {
        const updateData = { ...tenantForm };
        delete updateData.password;
        await apiClient.put(`/saas/tenants/${editingTenant.id}`, updateData);
        toast.success('تم تحديث المشترك');
      } else {
        await apiClient.post(`/saas/tenants`, tenantForm);
        toast.success('تم إنشاء المشترك');
      }
      setTenantDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ');
    }
  };

  const toggleTenantStatus = async (tenantId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await apiClient.post(`/saas/tenants/${tenantId}/toggle-status`, {});
      toast.success(res.data.is_active ? 'تم تفعيل المشترك' : 'تم تعطيل المشترك');
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  const deleteTenant = async (tenantId) => {
    if (!window.confirm('هل أنت متأكد؟ سيتم حذف جميع بيانات هذا المشترك نهائياً!')) return;
    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/saas/tenants/${tenantId}`);
      toast.success('تم حذف المشترك');
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  // Feature Flags Functions
  const ALL_FEATURES = [
    { key: 'pos', labelAr: 'نقطة البيع (POS)' },
    { key: 'inventory', labelAr: 'المخزون والمنتجات' },
    { key: 'customers', labelAr: 'الزبائن' },
    { key: 'recharge', labelAr: 'شحن رصيد الجوال' },
    { key: 'iptv', labelAr: 'الخدمات الرقمية (IPTV)' },
    { key: 'maintenance', labelAr: 'الصيانة' },
    { key: 'wallet', labelAr: 'المحفظة المالية' },
    { key: 'commission', labelAr: 'العمولات' },
    { key: 'reports', labelAr: 'التقارير' },
    { key: 'backup', labelAr: 'النسخ الاحتياطي' },
    { key: 'ai_bots', labelAr: 'الروبوتات الذكية (AI)' },
    { key: 'barcode', labelAr: 'الباركود' },
    { key: 'thermal_print', labelAr: 'الطباعة الحرارية' },
    { key: 'credit_sales', labelAr: 'البيع بالدين' },
    { key: 'loyalty_points', labelAr: 'نقاط الولاء' },
  ];

  const openFeatureFlagsDialog = async (tenant) => {
    setSelectedTenantForFlags(tenant);
    setFeatureFlagsDialogOpen(true);
    try {
      const res = await apiClient.get(`/saas/tenants/${tenant.id}/features`);
      // Use server-resolved values (plan defaults merged with per-tenant overrides)
      const resolved = res.data?.resolved || {};
      const initial = {};
      ALL_FEATURES.forEach(f => {
        initial[f.key] = resolved[f.key] !== undefined ? Boolean(resolved[f.key]) : true;
      });
      setTenantFeatureFlags(initial);
    } catch {
      // Fallback: optimistic defaults until server responds
      const initial = {};
      ALL_FEATURES.forEach(f => { initial[f.key] = true; });
      setTenantFeatureFlags(initial);
    }
  };

  const saveFeatureFlags = async () => {
    if (!selectedTenantForFlags) return;
    setSavingFlags(true);
    try {
      await apiClient.put(`/saas/tenants/${selectedTenantForFlags.id}/features`, tenantFeatureFlags);
      toast.success('تم حفظ إعدادات الميزات');
      setFeatureFlagsDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ في الحفظ');
    } finally {
      setSavingFlags(false);
    }
  };

  const openExtendDialog = (tenant) => {
    setSelectedTenantForExtend(tenant);
    const plan = plans.find(p => p.id === tenant.plan_id);
    setExtendForm({
      amount: plan?.price_monthly || 0,
      payment_method: 'manual',
      subscription_type: 'monthly',
      notes: '',
      transaction_id: ''
    });
    setExtendDialogOpen(true);
  };

  const extendSubscription = async () => {
    try {
      await apiClient.post(`/saas/tenants/${selectedTenantForExtend.id}/extend-subscription`, {
        tenant_id: selectedTenantForExtend.id,
        ...extendForm
      });
      toast.success('تم تمديد الاشتراك بنجاح');
      setExtendDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  const isExpiringSoon = (endDate) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = (end - now) / (1000 * 60 * 60 * 24);
    return diff <= 7 && diff > 0;
  };

  const isExpired = (endDate) => {
    return new Date(endDate) < new Date();
  };

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.company_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              {/* Horizontal TabsList hidden — navigation now via right sidebar. */}
              <TabsList className="hidden">
                <TabsTrigger value="tenants" />
                <TabsTrigger value="agents" />
                <TabsTrigger value="plans" />
                <TabsTrigger value="payments" />
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
                <TabsTrigger value="tenant-debts" />
                <TabsTrigger value="audit-timeline" />
              </TabsList>

              {/* ── Tab content sections ── */}

          {/* Tenants Tab */}
          <TabsContent value="tenants" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="relative w-64">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9"
                />
              </div>
              <Button onClick={() => openTenantDialog()}>
                <Plus className="h-4 w-4 me-2" />
                إضافة مشترك
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المعرّف</TableHead>
                      <TableHead>المشترك</TableHead>
                      <TableHead>الوكيل</TableHead>
                      <TableHead>التصنيف</TableHead>
                      <TableHead>الخطة</TableHead>
                      <TableHead className="text-center">الإحصائيات</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-center">انتهاء الاشتراك</TableHead>
                      <TableHead className="text-center">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTenants.map(tenant => (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <EntityCode uuid={tenant.id} type="tenant" testId={`tenant-code-${tenant.id}`} />
                        </TableCell>
                        <TableCell>
                          <div 
                            className="cursor-pointer hover:text-primary transition-colors"
                            onClick={() => openImpersonateDialog(tenant)}
                            data-testid={`tenant-name-${tenant.id}`}
                            title="اضغط للدخول لحساب المشترك"
                          >
                            <p className="font-medium hover:underline">{tenant.name}</p>
                            <p className="text-sm text-muted-foreground">{tenant.email}</p>
                            {tenant.company_name && (
                              <p className="text-xs text-muted-foreground">{tenant.company_name}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {tenant.agent_name ? (
                            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                              <UserCog className="h-3 w-3 me-1" />{tenant.agent_name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            tenant.business_type === 'wholesaler' ? 'bg-green-50 text-green-700 border-green-200' :
                            tenant.business_type === 'distributor' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                            'bg-blue-50 text-blue-700 border-blue-200'
                          }>
                            {tenant.business_type === 'wholesaler' ? (
                              <><ShoppingBag className="h-3 w-3 me-1" />تاجر جملة</>
                            ) : tenant.business_type === 'distributor' ? (
                              <><Truck className="h-3 w-3 me-1" />موزع</>
                            ) : (
                              <><Store className="h-3 w-3 me-1" />تاجر تجزئة</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{tenant.plan_name}</Badge>
                          {tenant.is_trial && (
                            <Badge variant="secondary" className="mr-1">تجريبي</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-3 text-sm">
                            <span title="المنتجات">📦 {tenant.stats?.products || 0}</span>
                            <span title="المستخدمين">👥 {tenant.stats?.users || 0}</span>
                            <span title="المبيعات">🛒 {tenant.stats?.sales || 0}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {tenant.is_active ? (
                            <Badge className="bg-green-100 text-green-700">نشط</Badge>
                          ) : (
                            <Badge variant="destructive">معطل</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className={`text-sm ${
                            isExpired(tenant.subscription_ends_at) ? 'text-red-600' :
                            isExpiringSoon(tenant.subscription_ends_at) ? 'text-amber-600' : ''
                          }`}>
                            {formatShortDate(tenant.subscription_ends_at)}
                            {isExpired(tenant.subscription_ends_at) && (
                              <Badge variant="destructive" className="mr-1 text-xs">منتهي</Badge>
                            )}
                            {isExpiringSoon(tenant.subscription_ends_at) && (
                              <Badge variant="outline" className="mr-1 text-xs text-amber-600">قريباً</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openWalletChargeDialog(tenant)} title="شحن المحفظة" data-testid={`wallet-charge-open-${tenant.id}`}>
                              <Wallet className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openExtendDialog(tenant)} title="تمديد">
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openTenantDialog(tenant)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => openBridgeDialog(tenant)}
                              title="وضع جسر الشحن"
                              data-testid={`bridge-btn-${tenant.id}`}
                            >
                              {tenant.recharge_mode === 'self_bridge'
                                ? <Wifi className="h-4 w-4 text-blue-500" />
                                : <Server className="h-4 w-4 text-muted-foreground" />
                              }
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openFeatureFlagsDialog(tenant)} title="إعدادات الميزات" data-testid={`feature-flags-btn-${tenant.id}`}>
                              <Sliders className="h-4 w-4 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => toggleTenantStatus(tenant.id)}>
                              {tenant.is_active ? <Ban className="h-4 w-4 text-amber-500" /> : <Check className="h-4 w-4 text-green-500" />}
                            </Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteTenant(tenant.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Agents Tab - Enhanced Dashboard */}
          <TabsContent value="agents" className="space-y-4">
            <AgentsDashboard />
          </TabsContent>

          {/* Plans Tab */}
          <TabsContent value="plans" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => openPlanDialog()}>
                <Plus className="h-4 w-4 me-2" />
                إضافة خطة
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map(plan => (
                <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        {plan.name_ar}
                        {plan.is_popular && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                      </CardTitle>
                      <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                        {plan.is_active ? 'نشط' : 'معطل'}
                      </Badge>
                    </div>
                    <CardDescription>{plan.description_ar}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span>شهري:</span>
                        <span className="font-semibold">{(plan.monthly_price || plan.price_monthly || 0).toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>6 أشهر:</span>
                        <span className="font-semibold">{(plan.six_month_price || plan.price_6months || 0).toLocaleString()} دج</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>سنوي:</span>
                        <span className="font-semibold">{(plan.yearly_price || plan.price_yearly || 0).toLocaleString()} دج</span>
                      </div>
                      <div className="border-t pt-3 mt-3">
                        <p className="text-xs text-muted-foreground mb-2">الحدود:</p>
                        <div className="flex flex-wrap gap-2">
                          {plan.limits?.max_products && (
                            <Badge variant="outline" className="text-xs">{plan.limits.max_products} منتج</Badge>
                          )}
                          {plan.limits?.max_users && (
                            <Badge variant="outline" className="text-xs">{plan.limits.max_users} مستخدم</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openPlanDialog(plan)}>
                        <Edit className="h-4 w-4 me-1" />
                        تعديل
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive" onClick={() => deletePlan(plan.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>سجل المدفوعات</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المشترك</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>نوع الاشتراك</TableHead>
                      <TableHead>طريقة الدفع</TableHead>
                      <TableHead>الفترة</TableHead>
                      <TableHead>التاريخ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map(payment => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">{payment.tenant_name}</TableCell>
                        <TableCell>{(payment.amount || 0).toLocaleString()} دج</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {payment.subscription_type === 'monthly' ? 'شهري' :
                             payment.subscription_type === '6months' ? '6 أشهر' : 'سنوي'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {payment.payment_method === 'manual' ? 'يدوي' :
                           payment.payment_method === 'stripe' ? 'Stripe' : payment.payment_method}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatShortDate(payment.period_start)} - {formatShortDate(payment.period_end)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatShortDate(payment.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

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
          {/* Tenant Debts Dashboard Tab */}
          <TabsContent value="tenant-debts" className="space-y-4" data-testid="tenant-debts-content">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">ديون التجار للمنصّة</h3>
                <p className="text-sm text-muted-foreground">
                  جميع التجار الذين لديهم رصيد دين (Credit) متبقّ. أرسل تذكير بضغطة واحدة أو نزّل كشف حساب PDF.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadTenantDebts} disabled={tenantDebtsLoading} data-testid="refresh-tenant-debts-btn">
                <RefreshCw className={`h-4 w-4 me-1 ${tenantDebtsLoading ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card data-testid="tenant-debts-summary-count"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">عدد التجار المدينين</p>
                <p className="text-3xl font-bold mt-1">{tenantDebtsSummary.total_tenants_with_debt ?? 0}</p>
              </CardContent></Card>
              <Card data-testid="tenant-debts-summary-total"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">إجمالي الديون (دج)</p>
                <p className="text-3xl font-bold mt-1 text-red-600">{(tenantDebtsSummary.total_debt || 0).toLocaleString('ar-DZ')}</p>
              </CardContent></Card>
              <Card data-testid="tenant-debts-summary-overdue"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">اشتراكات متأخرة</p>
                <p className="text-3xl font-bold mt-1 text-amber-600">{tenantDebtsSummary.overdue_subscriptions ?? 0}</p>
              </CardContent></Card>
            </div>

            <Card>
              <CardContent className="p-0">
                {tenantDebtsLoading ? (
                  <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
                ) : tenantDebts.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground" data-testid="tenant-debts-empty">
                    🎉 لا يوجد أي تاجر مدين للمنصّة حالياً.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-start">المعرّف</th>
                          <th className="px-3 py-2 text-start">التاجر</th>
                          <th className="px-3 py-2 text-start">البريد الإلكتروني</th>
                          <th className="px-3 py-2 text-start">الرصيد</th>
                          <th className="px-3 py-2 text-start">الدين (دج)</th>
                          <th className="px-3 py-2 text-start">آخر تذكير</th>
                          <th className="px-3 py-2 text-start">عدد التذكيرات</th>
                          <th className="px-3 py-2 text-start">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody data-testid="tenant-debts-table">
                        {tenantDebts.map((t) => (
                          <tr key={t.tenant_id} className="border-t border-border hover:bg-muted/30" data-testid={`tenant-debt-row-${t.tenant_id}`}>
                            <td className="px-3 py-2">
                              <EntityCode uuid={t.tenant_id} type="tenant" testId={`debt-tenant-code-${t.tenant_id}`} />
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{t.tenant_name}</div>
                              {t.subscription_overdue && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-2 py-0.5 text-xs mt-1">
                                  ⚠️ اشتراك منتهي
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{t.tenant_email}</td>
                            <td className="px-3 py-2 text-xs">{(t.wallet_balance || 0).toLocaleString('ar-DZ')}</td>
                            <td className="px-3 py-2 font-semibold text-red-600">{(t.credit_debt || 0).toLocaleString('ar-DZ')}</td>
                            <td className="px-3 py-2 text-xs">{t.last_reminder_at ? formatShortDate(t.last_reminder_at) : '—'}</td>
                            <td className="px-3 py-2 text-center">{t.reminders_sent || 0}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => openSettleDebtDialog(t)}
                                  data-testid={`settle-debt-${t.tenant_id}-btn`}
                                >
                                  <Banknote className="h-3 w-3 me-1" />
                                  تسديد الدين
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => remindTenant(t.tenant_id)}
                                  disabled={remindingTenantId === t.tenant_id}
                                  data-testid={`remind-tenant-${t.tenant_id}-btn`}
                                >
                                  {remindingTenantId === t.tenant_id ? (
                                    <RefreshCw className="h-3 w-3 me-1 animate-spin" />
                                  ) : (
                                    <Bell className="h-3 w-3 me-1" />
                                  )}
                                  تذكير
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => downloadStatementPdf(t)}
                                  data-testid={`download-statement-${t.tenant_id}-btn`}
                                >
                                  <FileText className="h-3 w-3 me-1" />
                                  PDF
                                </Button>
                              </div>
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
          {/* Audit Timeline Tab */}
          <TabsContent value="audit-timeline" className="space-y-4" data-testid="audit-timeline-content">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">سجل التدقيق الموحّد</h3>
                <p className="text-sm text-muted-foreground">
                  خط زمني واحد يجمع: عمليات الانتحال + تذكيرات الديون + شحن المحافظ. مفيد للتدقيق والامتثال (SOC2/GDPR).
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => loadAuditTimeline()} disabled={auditLoading} data-testid="refresh-audit-btn">
                <RefreshCw className={`h-4 w-4 me-1 ${auditLoading ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>

            {/* Filters */}
            <Card data-testid="audit-filters-card">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">نوع الحدث</Label>
                    <select
                      value={auditFilters.type}
                      onChange={(e) => setAuditFilters({ ...auditFilters, type: e.target.value })}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      data-testid="audit-filter-type"
                    >
                      <option value="">الكل ({auditSummary.total})</option>
                      <option value="impersonation">الانتحال ({auditSummary.by_type?.impersonation || 0})</option>
                      <option value="reminder">التذكيرات ({auditSummary.by_type?.reminder || 0})</option>
                      <option value="wallet_topup">شحن المحفظة ({auditSummary.by_type?.wallet_topup || 0})</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">معرّف المستأجر (اختياري)</Label>
                    <Input
                      placeholder="tenant_id..."
                      value={auditFilters.tenant_id}
                      onChange={(e) => setAuditFilters({ ...auditFilters, tenant_id: e.target.value })}
                      data-testid="audit-filter-tenant"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">من تاريخ</Label>
                    <Input
                      type="date"
                      value={auditFilters.since}
                      onChange={(e) => setAuditFilters({ ...auditFilters, since: e.target.value })}
                      data-testid="audit-filter-since"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">إلى تاريخ</Label>
                    <Input
                      type="date"
                      value={auditFilters.until}
                      onChange={(e) => setAuditFilters({ ...auditFilters, until: e.target.value })}
                      data-testid="audit-filter-until"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => loadAuditTimeline()} data-testid="audit-apply-btn">تطبيق الفلاتر</Button>
                  <Button size="sm" variant="outline" onClick={() => { const cleared = { type:'', tenant_id:'', since:'', until:'' }; setAuditFilters(cleared); loadAuditTimeline(cleared); }} data-testid="audit-clear-btn">مسح</Button>
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardContent className="p-0">
                {auditLoading ? (
                  <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
                ) : auditEvents.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground" data-testid="audit-empty">لا توجد أحداث.</div>
                ) : (
                  <div className="divide-y divide-border" data-testid="audit-events-list">
                    {auditEvents.map((ev) => {
                      const sevColor = ev.severity === 'critical' ? 'red' : ev.severity === 'warning' ? 'amber' : 'emerald';
                      const typeLabel = ev.type === 'impersonation' ? '🔁 انتحال' : ev.type === 'reminder' ? '🔔 تذكير' : ev.type === 'wallet_topup' ? '💳 شحن محفظة' : ev.type;
                      return (
                        <div key={ev.id} className="p-3 hover:bg-muted/30 flex items-start gap-3" data-testid={`audit-event-${ev.id}`}>
                          <div className={`mt-1 w-2 h-2 rounded-full bg-${sevColor}-500 shrink-0`}></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-medium">{typeLabel}</span>
                              {ev.tenant_name && <span className="text-muted-foreground">·</span>}
                              {ev.tenant_name && <span className="text-foreground">{ev.tenant_name}</span>}
                              {ev.admin_email && <span className="text-muted-foreground">·</span>}
                              {ev.admin_email && <span className="text-xs text-muted-foreground font-mono">{ev.admin_email}</span>}
                            </div>
                            <p className="text-sm text-foreground mt-1">{ev.summary}</p>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>🕐 {ev.timestamp ? formatShortDate(ev.timestamp) : '—'}</span>
                              {ev.ip && <span>🌐 {ev.ip}</span>}
                              {ev.details?.amount && <span>💰 {Number(ev.details.amount).toLocaleString('ar-DZ')} دج</span>}
                              {ev.details?.duration_seconds != null && (
                                <span>⏱️ {ev.details.duration_seconds < 60 ? `${ev.details.duration_seconds} ث` : `${Math.round(ev.details.duration_seconds/60)} د`}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
          </>
        )}

        {/* Settle Debt Dialog */}
        <Dialog open={settleDebtDialogOpen} onOpenChange={(open) => { setSettleDebtDialogOpen(open); if (!open) setSettleDebtTenant(null); }}>
          <DialogContent className="max-w-md" data-testid="settle-debt-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-emerald-600" />
                تسديد دين التاجر
              </DialogTitle>
              <DialogDescription>
                {settleDebtTenant ? (
                  <>
                    التاجر: <span className="font-semibold">{settleDebtTenant.tenant_name}</span>
                    {' · '}
                    الدين الحالي:{' '}
                    <span className="font-semibold text-red-600">
                      {(settleDebtTenant.credit_debt || 0).toLocaleString('ar-DZ')} دج
                    </span>
                  </>
                ) : 'حدّد المبلغ المُسدَّد نقداً من التاجر.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">المبلغ المُسدَّد (دج)</Label>
                <Input
                  type="number"
                  value={settleDebtAmount}
                  onChange={(e) => setSettleDebtAmount(parseFloat(e.target.value) || 0)}
                  data-testid="settle-debt-amount-input"
                />
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setSettleDebtAmount(settleDebtTenant?.credit_debt || 0)}
                    data-testid="settle-debt-full-btn"
                  >
                    تسديد كامل الدين
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => setSettleDebtAmount(Math.round((settleDebtTenant?.credit_debt || 0) / 2))}
                  >
                    النصف
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ملاحظة (اختياري)</Label>
                <Textarea
                  rows={2}
                  placeholder="مرجع إيصال، طريقة التسليم، إلخ"
                  value={settleDebtNote}
                  onChange={(e) => setSettleDebtNote(e.target.value)}
                  data-testid="settle-debt-note-input"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                سيُسجَّل هذا كمعاملة <strong>credit_settlement</strong> ويُخصم من رصيد دين التاجر تلقائياً.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSettleDebtDialogOpen(false)} data-testid="settle-debt-cancel-btn">إلغاء</Button>
              <Button
                onClick={confirmSettleDebt}
                disabled={settleDebtBusy || !settleDebtAmount || settleDebtAmount <= 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                data-testid="settle-debt-confirm-btn"
              >
                {settleDebtBusy && <RefreshCw className="h-4 w-4 animate-spin" />}
                تأكيد التسديد
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

        {/* Plan Dialog */}
        <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPlan ? 'تعديل الخطة' : 'إضافة خطة جديدة'}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>الاسم (إنجليزي)</Label>
                <Input value={planForm.name} onChange={e => setPlanForm({...planForm, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>الاسم (عربي)</Label>
                <Input value={planForm.name_ar} onChange={e => setPlanForm({...planForm, name_ar: e.target.value})} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>الوصف (عربي)</Label>
                <Textarea value={planForm.description_ar} onChange={e => setPlanForm({...planForm, description_ar: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>السعر الشهري (دج)</Label>
                <Input type="number" value={planForm.price_monthly} onChange={e => setPlanForm({...planForm, price_monthly: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="space-y-2">
                <Label>سعر 6 أشهر (دج)</Label>
                <Input type="number" value={planForm.price_6months} onChange={e => setPlanForm({...planForm, price_6months: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="space-y-2">
                <Label>السعر السنوي (دج)</Label>
                <Input type="number" value={planForm.price_yearly} onChange={e => setPlanForm({...planForm, price_yearly: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="space-y-2">
                <Label>ترتيب العرض</Label>
                <Input type="number" value={planForm.sort_order} onChange={e => setPlanForm({...planForm, sort_order: parseInt(e.target.value) || 0})} />
              </div>
              <div className="space-y-2">
                <Label>نسبة عمولة الوكيل (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={planForm.commission_rate}
                  onChange={e => setPlanForm({...planForm, commission_rate: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-2">
                <Label>حد المنتجات</Label>
                <Input type="number" value={planForm.limits?.max_products || 0} onChange={e => setPlanForm({...planForm, limits: {...planForm.limits, max_products: parseInt(e.target.value) || 0}})} />
              </div>
              <div className="space-y-2">
                <Label>حد المستخدمين</Label>
                <Input type="number" value={planForm.limits?.max_users || 0} onChange={e => setPlanForm({...planForm, limits: {...planForm.limits, max_users: parseInt(e.target.value) || 0}})} />
              </div>
              <div className="flex items-center gap-4 col-span-2">
                <div className="flex items-center gap-2">
                  <Switch checked={planForm.is_active} onCheckedChange={v => setPlanForm({...planForm, is_active: v})} />
                  <Label>نشط</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={planForm.is_popular} onCheckedChange={v => setPlanForm({...planForm, is_popular: v})} />
                  <Label>الأكثر شعبية</Label>
                </div>
              </div>
              <div className="col-span-2">
                <Label className="mb-2 block">الميزات</Label>
                <div className="grid grid-cols-2 gap-2">
                  {['pos', 'reports', 'ai_tips', 'multi_warehouse', 'smart_reports', 'employee_alerts'].map(f => (
                    <div key={f} className="flex items-center gap-2">
                      <Switch 
                        checked={planForm.features?.[f] || false} 
                        onCheckedChange={v => setPlanForm({...planForm, features: {...planForm.features, [f]: v}})} 
                      />
                      <Label className="text-sm">
                        {f === 'pos' ? 'نقطة البيع' :
                         f === 'reports' ? 'التقارير' :
                         f === 'ai_tips' ? 'نصائح AI' :
                         f === 'multi_warehouse' ? 'تعدد المخازن' :
                         f === 'smart_reports' ? 'تقارير ذكية' :
                         f === 'employee_alerts' ? 'تنبيهات الموظفين' : f}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPlanDialogOpen(false)}>إلغاء</Button>
              <Button onClick={savePlan}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Tenant Dialog - Compact */}
        <Dialog open={tenantDialogOpen} onOpenChange={setTenantDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-lg">{editingTenant ? 'تعديل المشترك' : 'إضافة مشترك جديد'}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">الاسم</Label>
                <Input className="h-8 text-sm" value={tenantForm.name} onChange={e => setTenantForm({...tenantForm, name: e.target.value})} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">البريد الإلكتروني</Label>
                <Input className="h-8 text-sm" type="email" value={tenantForm.email} onChange={e => setTenantForm({...tenantForm, email: e.target.value})} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الهاتف</Label>
                <Input className="h-8 text-sm" value={tenantForm.phone} onChange={e => setTenantForm({...tenantForm, phone: e.target.value})} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">اسم الشركة</Label>
                <Input className="h-8 text-sm" value={tenantForm.company_name} onChange={e => setTenantForm({...tenantForm, company_name: e.target.value})} />
              </div>
              {!editingTenant && (
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">كلمة المرور</Label>
                  <div className="relative">
                    <Input 
                      className="h-8 text-sm pe-8"
                      type={showPassword ? 'text' : 'password'} 
                      value={tenantForm.password} 
                      onChange={e => setTenantForm({...tenantForm, password: e.target.value})}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">التصنيف</Label>
                <Select value={tenantForm.business_type} onValueChange={v => setTenantForm({...tenantForm, business_type: v})}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retailer">تاجر تجزئة</SelectItem>
                    <SelectItem value="wholesaler">تاجر جملة</SelectItem>
                    <SelectItem value="distributor">موزع</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الصلاحية</Label>
                <Select value={tenantForm.role} onValueChange={v => setTenantForm({...tenantForm, role: v})}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">مدير (صلاحيات كاملة)</SelectItem>
                    <SelectItem value="manager">مشرف (عمليات يومية)</SelectItem>
                    <SelectItem value="sales_supervisor">مشرف مبيعات</SelectItem>
                    <SelectItem value="seller">بائع</SelectItem>
                    <SelectItem value="inventory_manager">مدير مخزون</SelectItem>
                    <SelectItem value="accountant">محاسب</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الخطة</Label>
                <Select value={tenantForm.plan_id} onValueChange={v => setTenantForm({...tenantForm, plan_id: v})}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع الاشتراك</Label>
                <Select value={tenantForm.subscription_type} onValueChange={v => setTenantForm({...tenantForm, subscription_type: v})}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري</SelectItem>
                    <SelectItem value="6months">6 أشهر</SelectItem>
                    <SelectItem value="yearly">سنوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setTenantDialogOpen(false)}>إلغاء</Button>
              <Button size="sm" onClick={saveTenant}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Extend Subscription Dialog */}
        <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تمديد الاشتراك</DialogTitle>
              <DialogDescription>{selectedTenantForExtend?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>نوع الاشتراك</Label>
                <Select value={extendForm.subscription_type} onValueChange={v => {
                  const plan = plans.find(p => p.id === selectedTenantForExtend?.plan_id);
                  const price = v === 'monthly' ? plan?.price_monthly : v === '6months' ? plan?.price_6months : plan?.price_yearly;
                  setExtendForm({...extendForm, subscription_type: v, amount: price || 0});
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري</SelectItem>
                    <SelectItem value="6months">6 أشهر</SelectItem>
                    <SelectItem value="yearly">سنوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المبلغ (دج)</Label>
                <Input type="number" value={extendForm.amount} onChange={e => setExtendForm({...extendForm, amount: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select value={extendForm.payment_method} onValueChange={v => setExtendForm({...extendForm, payment_method: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">يدوي (نقدي/تحويل)</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>رقم المعاملة (اختياري)</Label>
                <Input value={extendForm.transaction_id} onChange={e => setExtendForm({...extendForm, transaction_id: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea value={extendForm.notes} onChange={e => setExtendForm({...extendForm, notes: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExtendDialogOpen(false)}>إلغاء</Button>
              <Button onClick={extendSubscription}>تمديد الاشتراك</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Agent Dialog */}
        <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingAgent ? 'تعديل الوكيل' : 'إضافة وكيل جديد'}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">الاسم *</Label>
                <Input className="h-8 text-sm" value={agentForm.name} onChange={e => setAgentForm({...agentForm, name: e.target.value})} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">البريد الإلكتروني *</Label>
                <Input className="h-8 text-sm" type="email" value={agentForm.email} onChange={e => setAgentForm({...agentForm, email: e.target.value})} disabled={!!editingAgent} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الهاتف</Label>
                <Input className="h-8 text-sm" value={agentForm.phone} onChange={e => setAgentForm({...agentForm, phone: e.target.value})} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">اسم الشركة</Label>
                <Input className="h-8 text-sm" value={agentForm.company_name} onChange={e => setAgentForm({...agentForm, company_name: e.target.value})} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">العنوان</Label>
                <Input className="h-8 text-sm" value={agentForm.address} onChange={e => setAgentForm({...agentForm, address: e.target.value})} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">كلمة المرور {editingAgent ? '(اتركها فارغة للإبقاء)' : '*'}</Label>
                <Input className="h-8 text-sm" type="password" value={agentForm.password} onChange={e => setAgentForm({...agentForm, password: e.target.value})} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نسبة العمولة (%)</Label>
                <Input className="h-8 text-sm" type="number" value={agentForm.commission_percent} onChange={e => setAgentForm({...agentForm, commission_percent: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">عمولة ثابتة (دج)</Label>
                <Input className="h-8 text-sm" type="number" value={agentForm.commission_fixed} onChange={e => setAgentForm({...agentForm, commission_fixed: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">حد الدين (دج)</Label>
                <Input className="h-8 text-sm" type="number" value={agentForm.credit_limit} onChange={e => setAgentForm({...agentForm, credit_limit: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">ملاحظات</Label>
                <Textarea className="text-sm" rows={2} value={agentForm.notes} onChange={e => setAgentForm({...agentForm, notes: e.target.value})} />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setAgentDialogOpen(false)}>إلغاء</Button>
              <Button size="sm" onClick={saveAgent}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Agent Transactions Dialog */}
        <Dialog open={agentTransactionsDialogOpen} onOpenChange={setAgentTransactionsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>معاملات الوكيل: {selectedAgent?.name}</DialogTitle>
              <DialogDescription>
                الرصيد الحالي: <span className={`font-bold ${selectedAgent?.current_balance < 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {selectedAgent?.current_balance?.toLocaleString()} دج
                </span>
              </DialogDescription>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الوصف</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>الرصيد بعد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentTransactions.map(tx => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">{formatShortDate(tx.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={tx.transaction_type === 'payment' ? 'default' : tx.transaction_type === 'commission' ? 'secondary' : 'outline'}>
                        {tx.transaction_type === 'payment' ? 'دفعة' : tx.transaction_type === 'commission' ? 'عمولة' : tx.transaction_type === 'subscription_sale' ? 'بيع' : tx.transaction_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{tx.description}</TableCell>
                    <TableCell className={`font-medium ${tx.transaction_type === 'subscription_sale' ? 'text-red-500' : 'text-green-500'}`}>
                      {tx.transaction_type === 'subscription_sale' ? '-' : '+'}{tx.amount?.toLocaleString()} دج
                    </TableCell>
                    <TableCell className="font-medium">{tx.balance_after?.toLocaleString()} دج</TableCell>
                  </TableRow>
                ))}
                {agentTransactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد معاملات</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DialogContent>
        </Dialog>

        {/* Add Payment Dialog */}
        <Dialog open={addPaymentDialogOpen} onOpenChange={setAddPaymentDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة دفعة للوكيل</DialogTitle>
              <DialogDescription>{selectedAgent?.name} - الرصيد الحالي: {selectedAgent?.current_balance?.toLocaleString()} دج</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>نوع المعاملة</Label>
                <Select value={paymentForm.transaction_type} onValueChange={v => setPaymentForm({...paymentForm, transaction_type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payment">دفعة نقدية (إضافة للرصيد)</SelectItem>
                    <SelectItem value="refund">استرداد (خصم من الرصيد)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المبلغ (دج)</Label>
                <Input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Input value={paymentForm.description} onChange={e => setPaymentForm({...paymentForm, description: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddPaymentDialogOpen(false)}>إلغاء</Button>
              <Button onClick={saveAgentPayment}>تسجيل الدفعة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bridge Mode Dialog */}
        <Dialog open={bridgeDialogOpen} onOpenChange={setBridgeDialogOpen}>
          <DialogContent className="max-w-lg" data-testid="bridge-mode-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                وضع جسر الشحن — {bridgeTenant?.name}
              </DialogTitle>
              <DialogDescription>
                اختر وضع توجيه عمليات الشحن لهذا المشترك
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-3">
              {/* Mode selector */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">وضع الجسر</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBridgeForm(f => ({ ...f, recharge_mode: 'owner_bridge' }))}
                    className={`p-3 rounded-lg border-2 text-right transition-all ${
                      bridgeForm.recharge_mode === 'owner_bridge'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Server className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium text-sm">جسر المالك</span>
                    </div>
                    <p className="text-xs text-muted-foreground">يستخدم شرائح SIM الخاصة بالمنصة</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBridgeForm(f => ({ ...f, recharge_mode: 'self_bridge' }))}
                    className={`p-3 rounded-lg border-2 text-right transition-all ${
                      bridgeForm.recharge_mode === 'self_bridge'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Wifi className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="font-medium text-sm">جسر المشترك</span>
                    </div>
                    <p className="text-xs text-muted-foreground">يستخدم شرائح SIM الخاصة بالمشترك</p>
                  </button>
                </div>
              </div>

              {/* Self-bridge fields — shown only for self_bridge mode */}
              {bridgeForm.recharge_mode === 'self_bridge' && (
                <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground">إعدادات الجسر الذاتي</p>
                  <div className="space-y-1">
                    <Label className="text-xs">رابط الجسر (Bridge URL)</Label>
                    <Input
                      dir="ltr"
                      placeholder="http://192.168.1.10:5050"
                      value={bridgeForm.self_bridge_url}
                      onChange={e => setBridgeForm(f => ({ ...f, self_bridge_url: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">المفتاح السري (Bridge Secret)</Label>
                    <Input
                      dir="ltr"
                      type="password"
                      placeholder="..."
                      value={bridgeForm.self_bridge_api_key}
                      onChange={e => setBridgeForm(f => ({ ...f, self_bridge_api_key: e.target.value }))}
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 w-full"
                    onClick={testBridgeFromAdmin}
                    disabled={bridgeTesting || !bridgeForm.self_bridge_url}
                  >
                    {bridgeTesting
                      ? <RefreshCw className="h-4 w-4 animate-spin" />
                      : <Wifi className="h-4 w-4" />
                    }
                    اختبار الاتصال
                  </Button>

                  {bridgeTestResult !== null && (
                    <div className={`flex items-center gap-2 p-2 rounded text-xs ${
                      bridgeTestResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}>
                      {bridgeTestResult.ok
                        ? <Wifi className="h-4 w-4 shrink-0" />
                        : <WifiOff className="h-4 w-4 shrink-0" />
                      }
                      <span>
                        {bridgeTestResult.ok
                          ? 'الجسر متصل ✓'
                          : (bridgeTestResult.error || 'تعذّر الاتصال')
                        }
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setBridgeDialogOpen(false)}>إلغاء</Button>
              <Button onClick={saveBridgeMode} disabled={bridgeSaving} className="gap-2">
                {bridgeSaving && <RefreshCw className="h-4 w-4 animate-spin" />}
                حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Impersonate Tenant Dialog */}
        <Dialog open={impersonateDialogOpen} onOpenChange={setImpersonateDialogOpen}>
          <DialogContent className="max-w-md" data-testid="impersonate-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5 text-primary" />
                الدخول لحساب المشترك
              </DialogTitle>
              <DialogDescription>
                سيتم تسجيل دخولك كمشرف في حساب هذا المشترك
              </DialogDescription>
            </DialogHeader>
            {impersonateTenant && (
              <div className="space-y-4 py-2">
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">الاسم:</span>
                    <span className="font-medium">{impersonateTenant.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">الشركة:</span>
                    <span className="font-medium">{impersonateTenant.company_name || '—'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">البريد:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium font-mono text-sm">{impersonateTenant.email}</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => {
                        navigator.clipboard.writeText(impersonateTenant.email);
                        toast.success('تم نسخ البريد');
                      }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">الحالة:</span>
                    <Badge className={impersonateTenant.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                      {impersonateTenant.is_active ? 'نشط' : 'معطل'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">الخطة:</span>
                    <Badge variant="outline">{impersonateTenant.plan_name || '—'}</Badge>
                  </div>
                  {impersonateTenant.agent_name && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">الوكيل:</span>
                      <span className="font-medium">{impersonateTenant.agent_name}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setImpersonateDialogOpen(false)}>إلغاء</Button>
              <Button onClick={handleImpersonate} disabled={impersonateLoading || !impersonateTenant?.is_active} data-testid="impersonate-login-btn">
                {impersonateLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin ml-2" />
                ) : (
                  <LogIn className="h-4 w-4 ml-2" />
                )}
                {impersonateLoading ? 'جاري الدخول...' : 'دخول للحساب'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Feature Flags Dialog */}
        <Dialog open={featureFlagsDialogOpen} onOpenChange={setFeatureFlagsDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="feature-flags-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sliders className="h-5 w-5 text-primary" />
                إعدادات الميزات
              </DialogTitle>
              <DialogDescription>
                {selectedTenantForFlags?.name} — {selectedTenantForFlags?.company_name}
                <br />
                <span className="text-xs">الميزات المعطلة تُخفى من القائمة الجانبية وتُحجب عند الطلب.</span>
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-2 py-2">
              {ALL_FEATURES.map(feature => {
                const isEnabled = tenantFeatureFlags[feature.key] !== false;
                return (
                  <div
                    key={feature.key}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${
                      isEnabled ? 'bg-green-50 border-green-200' : 'bg-muted/40 border-muted'
                    }`}
                  >
                    <span className={`text-sm font-medium ${isEnabled ? 'text-green-800' : 'text-muted-foreground'}`}>
                      {feature.labelAr}
                    </span>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) =>
                        setTenantFeatureFlags(prev => ({ ...prev, [feature.key]: checked }))
                      }
                      data-testid={`flag-toggle-${feature.key}`}
                    />
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setFeatureFlagsDialogOpen(false)}>إلغاء</Button>
              <Button onClick={saveFeatureFlags} disabled={savingFlags} data-testid="save-feature-flags-btn">
                {savingFlags ? <RefreshCw className="h-4 w-4 animate-spin me-2" /> : <Check className="h-4 w-4 me-2" />}
                حفظ الميزات
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

        {/* Wallet Charge Dialog */}
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

        <Dialog open={walletChargeDialogOpen} onOpenChange={setWalletChargeDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-green-600" />
                شحن محفظة المستأجر
              </DialogTitle>
              <DialogDescription>{walletChargeTenant?.name} — {walletChargeTenant?.email}</DialogDescription>
            </DialogHeader>

            {walletInfoLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin me-2" />
                جاري تحميل بيانات المحفظة...
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {walletInfo && (
                  <div className="rounded-lg bg-muted/50 border p-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">الرصيد الحالي</span>
                      <span className="font-bold text-lg text-green-700">
                        {walletInfo.wallet?.balance?.toLocaleString('ar-DZ') ?? '0'} دج
                      </span>
                    </div>
                    {walletInfo.transactions?.length > 0 && (
                      <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                        <p className="text-xs text-muted-foreground font-medium mb-1">آخر المعاملات</p>
                        {walletInfo.transactions.map(txn => (
                          <div key={txn.id} className="flex justify-between text-xs py-1 border-b last:border-0">
                            <span className="text-muted-foreground truncate max-w-[55%]">{txn.description}</span>
                            <span className={txn.transaction_type === 'credit' ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                              {txn.transaction_type === 'credit' ? '+' : '-'}{txn.amount?.toLocaleString('ar-DZ')} دج
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>المبلغ (دج) *</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="مثال: 5000"
                    value={walletChargeForm.amount}
                    onChange={e => setWalletChargeForm({ ...walletChargeForm, amount: e.target.value })}
                    data-testid="wallet-charge-amount-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>طريقة الدفع *</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWalletChargeForm({ ...walletChargeForm, payment_method: 'cash' })}
                      className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-sm transition ${walletChargeForm.payment_method === 'cash' ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'border-border hover:bg-muted/50'}`}
                      data-testid="wallet-charge-method-cash"
                    >
                      <Banknote className={`h-5 w-5 ${walletChargeForm.payment_method === 'cash' ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                      <span className="font-medium">نقداً (Cash)</span>
                      <span className="text-xs text-muted-foreground">دفع فوري كامل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWalletChargeForm({ ...walletChargeForm, payment_method: 'credit' })}
                      className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-sm transition ${walletChargeForm.payment_method === 'credit' ? 'border-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'border-border hover:bg-muted/50'}`}
                      data-testid="wallet-charge-method-credit"
                    >
                      <CreditCard className={`h-5 w-5 ${walletChargeForm.payment_method === 'credit' ? 'text-amber-600' : 'text-muted-foreground'}`} />
                      <span className="font-medium">بالدين (Credit)</span>
                      <span className="text-xs text-muted-foreground">يُحصّل لاحقاً</span>
                    </button>
                  </div>
                  {walletChargeForm.payment_method === 'credit' && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                      ⚠️ سيُسجّل هذا المبلغ كدين على التاجر — يجب تحصيله لاحقاً عبر &quot;تسديد الدين&quot;.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>ملاحظات (اختياري)</Label>
                  <Textarea
                    placeholder="سبب الشحن..."
                    value={walletChargeForm.notes}
                    onChange={e => setWalletChargeForm({ ...walletChargeForm, notes: e.target.value })}
                    rows={2}
                    data-testid="wallet-charge-notes-input"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setWalletChargeDialogOpen(false)}>إلغاء</Button>
              <Button
                onClick={handleWalletCharge}
                disabled={walletChargeLoading || !walletChargeForm.amount}
                className="bg-green-600 hover:bg-green-700"
                data-testid="wallet-charge-submit-btn"
              >
                {walletChargeLoading
                  ? <><RefreshCw className="h-4 w-4 animate-spin me-2" />جاري الشحن...</>
                  : <><Wallet className="h-4 w-4 me-2" />شحن المحفظة</>
                }
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}
