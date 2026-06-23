import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Wifi, WifiOff, Sliders, Boxes, Tv, ShoppingBag as ShoppingBagIcon, Smartphone
} from 'lucide-react';
import { DatabaseManager } from '../../components/DatabaseManager';
import { AgentsDashboard } from './components/AgentsDashboard';
import { SystemAlertsSection } from './components/SystemAlertsSection';
import { MonitoringSection } from './components/MonitoringSection';
import { FinanceReportsSection } from './components/FinanceReportsSection';
import { AIAssistant } from '../../components/AIAssistant';
import { Bot } from 'lucide-react';
import { formatShortDate, convertToWesternNumerals } from '../../utils/globalDateFormatter';

export default function SaasAdminPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  
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

  // Bridge Mode State
  const [bridgeDialogOpen, setBridgeDialogOpen] = useState(false);
  const [walletChargeDialogOpen, setWalletChargeDialogOpen] = useState(false);
  const [walletChargeTenant, setWalletChargeTenant] = useState(null);
  const [walletChargeForm, setWalletChargeForm] = useState({ amount: '', notes: '' });
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
      const token = localStorage.getItem('token');
      const res = await apiClient.post(`/saas/impersonate/${impersonateTenant.id}`, {});
      const data = res.data;
      // Store new token and user data
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('user_type', 'tenant');
      // Redirect to dashboard
      window.location.href = '/';
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل الدخول لحساب المشترك');
      setImpersonateLoading(false);
    }
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
      const res = await apiClient.post(`/saas/tenants/${walletChargeTenant.id}/wallet/credit`, {
        amount,
        notes: walletChargeForm.notes || 'شحن من المدير العام',
      });
      toast.success(`تم شحن المحفظة بنجاح — الرصيد الجديد: ${res.data.new_balance?.toLocaleString('ar-DZ')} دج`);
      setWalletChargeDialogOpen(false);
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Building className="h-8 w-8 text-primary" />
              لوحة تحكم NT Commerce
            </h1>
            <p className="text-muted-foreground mt-1">إدارة المشتركين والخطط والاشتراكات</p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/robots')}
            className="gap-2"
            data-testid="go-to-robots-btn"
          >
            <Bot className="h-4 w-4" />
            الروبوتات الذكية
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/auto-reports')}
            className="gap-2"
            data-testid="go-to-reports-btn"
          >
            <BarChart3 className="h-4 w-4" />
            التقارير التلقائية
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي المشتركين</p>
                  <p className="text-2xl font-bold">{stats.total_tenants}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">نشط</p>
                  <p className="text-2xl font-bold text-green-600">{stats.active_tenants}</p>
                </div>
                <Check className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">تجريبي</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.trial_tenants}</p>
                </div>
                <Clock className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">ينتهي قريباً</p>
                  <p className="text-2xl font-bold text-amber-600">{stats.expiring_soon}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">إيراد الشهر</p>
                  <p className="text-2xl font-bold">{stats.monthly_revenue?.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي الإيراد</p>
                  <p className="text-2xl font-bold">{stats.total_revenue?.toLocaleString()}</p>
                </div>
                <DollarSign className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="tenants" className="space-y-6">
          <TabsList>
            <TabsTrigger value="tenants" className="gap-2">
              <Users className="h-4 w-4" />
              المشتركين
            </TabsTrigger>
            <TabsTrigger value="agents" className="gap-2">
              <Truck className="h-4 w-4" />
              الوكلاء
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2">
              <Package className="h-4 w-4" />
              الخطط
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-2">
              <CreditCard className="h-4 w-4" />
              المدفوعات
            </TabsTrigger>
            <TabsTrigger value="platform-catalog" className="gap-2" onClick={loadPlatformCatalog}>
              <Boxes className="h-4 w-4" />
              كتالوج IPTV
            </TabsTrigger>
            <TabsTrigger value="recharge-mgmt" className="gap-2" onClick={() => { loadRechargeConfig(); loadRechargeTxns(); }}>
              <Smartphone className="h-4 w-4" />
              شحن الجوال
            </TabsTrigger>
            <TabsTrigger value="finance" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              التقارير المالية
            </TabsTrigger>
            <TabsTrigger value="databases" className="gap-2">
              <Database className="h-4 w-4" />
              قواعد البيانات
            </TabsTrigger>
            <TabsTrigger value="monitoring" className="gap-2" data-testid="monitoring-tab">
              <Activity className="h-4 w-4" />
              المراقبة
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-2" data-testid="alerts-tab">
              <Bug className="h-4 w-4" />
              الأخطاء
            </TabsTrigger>
            <TabsTrigger value="withdrawals" className="gap-2" data-testid="withdrawals-tab">
              <Banknote className="h-4 w-4" />
              طلبات السحب
              {withdrawals.filter(w => w.status === 'pending_approval').length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {withdrawals.filter(w => w.status === 'pending_approval').length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ai-assistant" className="gap-2" data-testid="ai-assistant-tab">
              <Bot className="h-4 w-4" />
              المساعد الذكي
            </TabsTrigger>
          </TabsList>

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
                            <Button variant="ghost" size="sm" onClick={() => openWalletChargeDialog(tenant)} title="شحن المحفظة">
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
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold">
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
        </Tabs>

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
                  />
                </div>
                <div className="space-y-2">
                  <Label>ملاحظات (اختياري)</Label>
                  <Textarea
                    placeholder="سبب الشحن..."
                    value={walletChargeForm.notes}
                    onChange={e => setWalletChargeForm({ ...walletChargeForm, notes: e.target.value })}
                    rows={2}
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
