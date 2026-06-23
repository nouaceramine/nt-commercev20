/**
 * AgentDashboardPage - Enhanced Agent Portal
 * Features: Performance Charts, Subscriber Management, Transaction History, Notifications
 */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
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
import { toast } from 'sonner';
import { 
  Truck, Users, DollarSign, TrendingUp, Plus, LogOut, 
  Wallet, CreditCard, Clock, CheckCircle, AlertTriangle,
  Building, Phone, Mail, Calendar, FileText, Eye, EyeOff,
  Bell, BarChart3, Target, Star, RefreshCw, Search,
  ArrowUpRight, ArrowDownRight, Activity, PiggyBank, Percent,
  Banknote, Send, XCircle, TimerIcon, ChevronDown, ChevronRight
} from 'lucide-react';

// Performance Badge Component
const PerformanceBadge = ({ level }) => {
  if (level === 'excellent') return <Badge className="bg-green-500"><Star className="h-3 w-3 mr-1" /> ممتاز</Badge>;
  if (level === 'good') return <Badge className="bg-blue-500"><TrendingUp className="h-3 w-3 mr-1" /> جيد</Badge>;
  if (level === 'average') return <Badge className="bg-amber-500"><Target className="h-3 w-3 mr-1" /> متوسط</Badge>;
  return <Badge className="bg-gray-500">جديد</Badge>;
};

// Alert Component
const AlertCard = ({ alert }) => {
  const colors = {
    critical: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  const icons = {
    critical: <AlertTriangle className="h-4 w-4 text-red-500" />,
    warning: <Bell className="h-4 w-4 text-amber-500" />,
    info: <Activity className="h-4 w-4 text-blue-500" />,
  };
  
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${colors[alert.severity] || colors.info}`}>
      {icons[alert.severity]}
      <span className="text-sm font-medium">{alert.message}</span>
      {alert.days_left !== undefined && alert.days_left > 0 && (
        <Badge variant="outline" className="mr-auto text-xs">{alert.days_left} يوم</Badge>
      )}
    </div>
  );
};

export default function AgentDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [plans, setPlans] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [addTenantDialogOpen, setAddTenantDialogOpen] = useState(false);
  const [viewTransactionsDialogOpen, setViewTransactionsDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantDetailsDialogOpen, setTenantDetailsDialogOpen] = useState(false);

  const [agentWallet, setAgentWallet] = useState(null);
  const [walletRequests, setWalletRequests] = useState({ my_requests: [], to_approve: [] });
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote, setTopupNote] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);

  // Commission state
  const [commissionSummary, setCommissionSummary] = useState(null);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawBankDetails, setWithdrawBankDetails] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [myWithdrawals, setMyWithdrawals] = useState([]);
  const [commissionHistory, setCommissionHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedTenants, setExpandedTenants] = useState(new Set());
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('all');
  const [historyTenantSearch, setHistoryTenantSearch] = useState('');
  
  const [tenantForm, setTenantForm] = useState({
    name: '', email: '', password: '', phone: '', company_name: '',
    plan_id: '', subscription_type: 'monthly', business_type: 'retailer', notes: ''
  });

  const agentData = JSON.parse(localStorage.getItem('agentData') || '{}');
  const permissions = agentData.permissions || {};

  useEffect(() => {
    const token = localStorage.getItem('agentToken');
    if (!token) {
      navigate('/portal');
      return;
    }
    fetchDashboard();
    fetchPlans();
    fetchWallet();
    fetchCommissions();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('agentToken')}`
  });

  const fetchDashboard = async () => {
    try {
      // Use new self-service endpoints
      const [meRes, statsRes, tenantsRes] = await Promise.allSettled([
        apiClient.get(`/saas/agent/me`, { headers: getHeaders() }),
        apiClient.get(`/saas/agent/my-stats`, { headers: getHeaders() }),
        apiClient.get(`/saas/agent/my-tenants`, { headers: getHeaders() }),
      ]);

      const agentInfo = meRes.status === 'fulfilled' ? meRes.value.data : agentData;
      const stats = statsRes.status === 'fulfilled' ? statsRes.value.data : {};
      const tenantsList = tenantsRes.status === 'fulfilled' ? tenantsRes.value.data : [];

      setDashboard({
        agent: agentInfo,
        stats: {
          total_tenants: stats.total_tenants || tenantsList.length,
          active_tenants: stats.active_tenants || tenantsList.filter(t => t.is_active).length,
          total_commissions: stats.total_commissions || agentInfo.total_earnings || 0,
          pending_earnings: stats.pending_earnings || agentInfo.pending_earnings || 0,
        },
        tenants: tenantsList,
        recent_transactions: [],
        alerts: [],
      });
      setTenants(tenantsList);

      // Update local agentData with latest permissions
      if (agentInfo.permissions) {
        localStorage.setItem('agentData', JSON.stringify(agentInfo));
      }
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem('agentToken');
        localStorage.removeItem('agentData');
        navigate('/portal');
      }
      toast.error('خطأ في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      const response = await apiClient.get(`/saas/plans`, { headers: getHeaders() });
      setPlans(response.data.filter(p => p.is_active));
    } catch (error) {
      console.error('Error fetching plans:', error);
    }
  };

  const fetchWallet = async () => {
    try {
      const [wRes, rRes] = await Promise.allSettled([
        apiClient.get(`/saas/agent/wallet`, { headers: getHeaders() }),
        apiClient.get(`/saas/agent/wallet/requests`, { headers: getHeaders() }),
      ]);
      if (wRes.status === 'fulfilled') setAgentWallet(wRes.value.data);
      if (rRes.status === 'fulfilled') {
        setWalletRequests({
          my_requests: rRes.value.data.my_requests || [],
          to_approve: rRes.value.data.to_approve || [],
        });
      }
    } catch (error) {
      console.error('Error fetching wallet:', error);
    }
  };

  const fetchCommissions = async () => {
    try {
      const [summaryRes, withdrawalsRes] = await Promise.allSettled([
        apiClient.get(`/saas/agent/commissions/summary`, { headers: getHeaders() }),
        apiClient.get(`/saas/agent/commissions/withdrawals`, { headers: getHeaders() }),
      ]);
      if (summaryRes.status === 'fulfilled') setCommissionSummary(summaryRes.value.data);
      if (withdrawalsRes.status === 'fulfilled') setMyWithdrawals(withdrawalsRes.value.data || []);
    } catch (error) {
      console.error('Error fetching commissions:', error);
    }
  };

  const fetchCommissionHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await apiClient.get(`/saas/agent/commissions/history?limit=200`, { headers: getHeaders() });
      setCommissionHistory(res.data || []);
    } catch (error) {
      console.error('Error fetching commission history:', error);
      setCommissionHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && commissionHistory === null) fetchCommissionHistory();
  };

  const submitWithdrawRequest = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) { toast.error('أدخل مبلغاً صحيحاً'); return; }
    setWithdrawBusy(true);
    try {
      await apiClient.post(
        `/saas/agent/commissions/withdraw-request`,
        { amount, bank_details: withdrawBankDetails, note: withdrawNote },
        { headers: getHeaders() }
      );
      toast.success('تم إرسال طلب السحب، بانتظار موافقة المشرف');
      setWithdrawDialogOpen(false);
      setWithdrawAmount(''); setWithdrawBankDetails(''); setWithdrawNote('');
      fetchCommissions();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إرسال الطلب');
    } finally { setWithdrawBusy(false); }
  };

  const submitTopup = async () => {
    const amount = parseFloat(topupAmount);
    if (!amount || amount <= 0) { toast.error('أدخل مبلغاً صحيحاً'); return; }
    setWalletBusy(true);
    try {
      await apiClient.post(`/saas/agent/wallet/request`, { amount, note: topupNote }, { headers: getHeaders() });
      toast.success('تم إرسال طلب الشحن، بانتظار الموافقة');
      setTopupDialogOpen(false); setTopupAmount(''); setTopupNote('');
      fetchWallet();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إرسال الطلب');
    } finally { setWalletBusy(false); }
  };

  const approveWalletRequest = async (id) => {
    setWalletBusy(true);
    try {
      await apiClient.post(`/saas/agent/wallet/requests/${id}/approve`, {}, { headers: getHeaders() });
      toast.success('تمت الموافقة على الطلب');
      fetchWallet();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تنفيذ العملية');
    } finally { setWalletBusy(false); }
  };

  const rejectWalletRequest = async (id) => {
    setWalletBusy(true);
    try {
      await apiClient.post(`/saas/agent/wallet/requests/${id}/reject`, {}, { headers: getHeaders() });
      toast.success('تم رفض الطلب');
      fetchWallet();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل تنفيذ العملية');
    } finally { setWalletBusy(false); }
  };

  const fetchAllTenants = async () => {
    try {
      const response = await apiClient.get(`/saas/agent/my-tenants`, { headers: getHeaders() });
      setTenants(response.data);
    } catch (error) {
      toast.error('خطأ في تحميل المشتركين');
    }
  };

  const fetchAllTransactions = async () => {
    try {
      const agentId = agentData.id;
      const response = await apiClient.get(`/saas/agents/${agentId}/transactions`, { headers: getHeaders() });
      setTransactions(response.data);
      setViewTransactionsDialogOpen(true);
    } catch (error) {
      toast.error('خطأ في تحميل المعاملات');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('agentToken');
    localStorage.removeItem('agentData');
    navigate('/portal');
    toast.success('تم تسجيل الخروج');
  };

  const openAddTenant = () => {
    setTenantForm({
      name: '', email: '', password: '', phone: '', company_name: '',
      plan_id: plans[0]?.id || '', subscription_type: 'monthly', business_type: 'retailer', notes: ''
    });
    setAddTenantDialogOpen(true);
  };

  const saveTenant = async () => {
    try {
      await apiClient.post(`/saas/agent/create-tenant`, tenantForm, { headers: getHeaders() });
      toast.success('تم إضافة المشترك بنجاح');
      setAddTenantDialogOpen(false);
      fetchDashboard();
      fetchAllTenants();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ');
    }
  };

  const getPlanPrice = (planId, subType) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return 0;
    if (subType === 'monthly') return plan.price_monthly;
    if (subType === '6months') return plan.price_6months;
    return plan.price_yearly;
  };

  const openTenantDetails = (tenant) => {
    setSelectedTenant(tenant);
    setTenantDetailsDialogOpen(true);
  };

  // Filtered tenants based on search
  const filteredTenants = useMemo(() => {
    if (!searchQuery) return tenants;
    const query = searchQuery.toLowerCase();
    return tenants.filter(t => 
      t.name?.toLowerCase().includes(query) ||
      t.email?.toLowerCase().includes(query) ||
      t.company_name?.toLowerCase().includes(query)
    );
  }, [tenants, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate alerts for expiring subscriptions
  const alerts = useMemo(() => {
    const result = [];
    const now = new Date();
    
    tenants.forEach(tenant => {
      if (tenant.subscription_ends_at) {
        const endDate = new Date(tenant.subscription_ends_at);
        const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
        
        if (daysLeft < 0) {
          result.push({
            severity: 'critical',
            message: `اشتراك ${tenant.name} منتهي منذ ${Math.abs(daysLeft)} يوم`,
            tenant_id: tenant.id
          });
        } else if (daysLeft <= 7) {
          result.push({
            severity: 'warning',
            message: `اشتراك ${tenant.name} ينتهي قريباً`,
            days_left: daysLeft,
            tenant_id: tenant.id
          });
        } else if (daysLeft <= 30) {
          result.push({
            severity: 'info',
            message: `تذكير: اشتراك ${tenant.name} ينتهي خلال شهر`,
            days_left: daysLeft,
            tenant_id: tenant.id
          });
        }
      }
    });
    
    return result.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [tenants]);

  // Calculate performance level
  const getPerformanceLevel = () => {
    const agent = dashboard?.agent || agentData;
    const tenantCount = dashboard?.stats?.total_tenants || 0;
    
    if (tenantCount >= 10 && agent.current_balance >= 0) return 'excellent';
    if (tenantCount >= 5) return 'good';
    if (tenantCount >= 1) return 'average';
    return 'new';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const agent = dashboard?.agent || agentData;
  const stats = dashboard?.stats || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/30">
              <Truck className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">NT Commerce</h1>
              <p className="text-xs text-muted-foreground">بوابة الوكلاء</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {alerts.length > 0 && (
              <Button variant="ghost" size="sm" className="relative" onClick={() => setActiveTab('alerts')}>
                <Bell className="h-5 w-5" />
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {alerts.length}
                </span>
              </Button>
            )}
            <div className="text-left hidden md:block">
              <p className="font-medium text-sm">{agent.name}</p>
              <div className="flex items-center gap-1">
                <Badge variant={agent.agent_type === 'reseller' ? 'default' : 'secondary'} className="text-[10px] h-4">
                  {agent.agent_type === 'reseller' ? 'موزع' : 'مساعد'}
                </Badge>
                {agent.region && <span className="text-xs text-muted-foreground">{agent.region}</span>}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">خروج</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Welcome & Balance Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Welcome Card */}
          <Card className="lg:col-span-2 bg-gradient-to-br from-primary via-blue-600 to-indigo-700 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-32 translate-x-32"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-24 -translate-x-24"></div>
            <CardContent className="p-6 relative z-10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-blue-100 mb-1">مرحباً بك</p>
                  <h2 className="text-3xl font-bold mb-2">{agent.name}</h2>
                  <div className="flex items-center gap-2">
                    <PerformanceBadge level={getPerformanceLevel()} />
                    <span className="text-blue-100 text-sm">{agent.company_name || 'وكيل معتمد'}</span>
                  </div>
                </div>
                <div className="h-20 w-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <Truck className="h-10 w-10" />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-white/20">
                <div>
                  <p className="text-blue-100 text-xs mb-1">نسبة العمولة</p>
                  <div className="flex items-center gap-1">
                    <Percent className="h-4 w-4 opacity-80" />
                    <p className="text-2xl font-bold">{agent.commission_percent}%</p>
                  </div>
                </div>
                <div>
                  <p className="text-blue-100 text-xs mb-1">عمولة ثابتة</p>
                  <p className="text-2xl font-bold">{(agent.commission_fixed || 0).toLocaleString()}</p>
                  <p className="text-xs text-blue-200">دج / مشترك</p>
                </div>
                <div>
                  <p className="text-blue-100 text-xs mb-1">إجمالي العمولات</p>
                  <p className="text-2xl font-bold text-emerald-300">{(agent.total_earnings || 0).toLocaleString()}</p>
                  <p className="text-xs text-blue-200">دج</p>
                  {commissionSummary && (
                    <p className="text-xs text-emerald-200 mt-0.5">
                      {((commissionSummary.counts?.pending ?? 0) + (commissionSummary.counts?.available ?? 0) + (commissionSummary.counts?.withdrawn ?? 0))} سجل
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Balance Card */}
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full -translate-y-16 translate-x-16"></div>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                الرصيد المالي
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="space-y-4">
                <div className="text-center p-6 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 border">
                  <p className="text-sm text-muted-foreground mb-2">الرصيد الحالي</p>
                  <p className={`text-4xl font-bold ${(agent.current_balance || 0) < 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {(agent.current_balance || 0).toLocaleString()} <span className="text-lg">دج</span>
                  </p>
                  {(agent.current_balance || 0) < 0 && (
                    <Badge variant="destructive" className="mt-3">
                      <AlertTriangle className="h-3 w-3 me-1" />
                      دين
                    </Badge>
                  )}
                  {(agent.current_balance || 0) >= 0 && (
                    <Badge variant="default" className="mt-3 bg-green-500">
                      <CheckCircle className="h-3 w-3 me-1" />
                      رصيد إيجابي
                    </Badge>
                  )}
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between p-2 rounded-lg bg-muted/50">
                    <span className="text-muted-foreground">حد الدين المسموح</span>
                    <span className="font-medium">{agent.credit_limit?.toLocaleString()} دج</span>
                  </div>
                  <div className="flex justify-between p-2 rounded-lg bg-muted/50">
                    <span className="text-muted-foreground">المتبقي من الحد</span>
                    <span className={`font-medium ${((agent.credit_limit || 0) + (agent.current_balance || 0)) < (agent.credit_limit || 0) * 0.2 ? 'text-red-500' : 'text-green-600'}`}>
                      {((agent.credit_limit || 0) + (agent.current_balance || 0)).toLocaleString()} دج
                    </span>
                  </div>
                </div>
                
                <Button variant="outline" className="w-full gap-2" onClick={fetchAllTransactions}>
                  <FileText className="h-4 w-4" />
                  عرض كل المعاملات
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Commission Balances Card */}
        <Card className="border-emerald-200" data-testid="commission-summary-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-600" />
              عمولاتي
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={fetchCommissions}>
                <RefreshCw className="h-3 w-3" />
                تحديث
              </Button>
              <Button
                size="sm"
                variant={showHistory ? 'secondary' : 'outline'}
                className="gap-1 text-xs"
                onClick={toggleHistory}
                data-testid="commission-history-toggle"
              >
                <BarChart3 className="h-3 w-3" />
                تفصيل بالمشترك
              </Button>
              {commissionSummary && (commissionSummary.available - commissionSummary.reserved) > 0 && (
                <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setWithdrawDialogOpen(true)} data-testid="withdraw-btn">
                  <Send className="h-4 w-4" />
                  طلب سحب
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-center">
                <Clock className="h-5 w-5 text-amber-600 mx-auto mb-1" />
                <p className="text-xs text-amber-700 mb-1">قيد الانتظار (7 أيام)</p>
                <p className="text-2xl font-bold text-amber-700">{(commissionSummary?.pending || 0).toLocaleString()}</p>
                <p className="text-xs text-amber-600">دج</p>
                {commissionSummary && (
                  <p className="text-xs text-amber-500 mt-1">{commissionSummary.counts?.pending ?? 0} سجل</p>
                )}
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                <CheckCircle className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
                <p className="text-xs text-emerald-700 mb-1">متاح للسحب</p>
                <p className="text-2xl font-bold text-emerald-700">
                  {((commissionSummary?.available || 0) - (commissionSummary?.reserved || 0)).toLocaleString()}
                </p>
                <p className="text-xs text-emerald-600">دج</p>
                {commissionSummary && (
                  <p className="text-xs text-emerald-500 mt-1">{commissionSummary.counts?.available ?? 0} سجل</p>
                )}
                {(commissionSummary?.reserved || 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">({(commissionSummary.reserved).toLocaleString()} محجوز)</p>
                )}
              </div>
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-center">
                <Banknote className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                <p className="text-xs text-blue-700 mb-1">تم الصرف</p>
                <p className="text-2xl font-bold text-blue-700">{(commissionSummary?.withdrawn || 0).toLocaleString()}</p>
                <p className="text-xs text-blue-600">دج</p>
                {commissionSummary && (
                  <p className="text-xs text-blue-500 mt-1">{commissionSummary.counts?.withdrawn ?? 0} سجل</p>
                )}
              </div>
            </div>

            {/* Pending commissions with countdown */}
            {commissionSummary?.pending_records?.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  عمولات في فترة الحجب (7 أيام)
                </p>
                <div className="space-y-2">
                  {commissionSummary.pending_records.map(rec => {
                    const daysLeft = Math.max(0, Math.ceil((new Date(rec.chargeback_until) - new Date()) / (1000 * 60 * 60 * 24)));
                    return (
                      <div key={rec.id} className="flex items-center justify-between p-2 rounded-lg bg-amber-50/60 border border-amber-100 text-sm">
                        <span className="font-medium">{rec.tenant_name}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-amber-700">{rec.amount?.toLocaleString()} دج</span>
                          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                            {daysLeft} يوم متبقي
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* My withdrawal requests */}
            {myWithdrawals.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">طلبات السحب</p>
                <div className="space-y-2">
                  {myWithdrawals.slice(0, 5).map(wr => (
                    <div key={wr.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/30 text-sm">
                      <span className="font-medium">{wr.amount?.toLocaleString()} دج</span>
                      <div className="flex items-center gap-2">
                        {wr.reject_reason && <span className="text-xs text-muted-foreground">{wr.reject_reason}</span>}
                        <Badge variant={wr.status === 'approved' ? 'default' : wr.status === 'rejected' ? 'destructive' : 'secondary'}
                          className={wr.status === 'approved' ? 'bg-green-500' : ''}>
                          {wr.status === 'approved' ? 'تمت الموافقة' : wr.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-tenant commission breakdown */}
            {showHistory && (
              <div data-testid="commission-history-panel">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-emerald-600" />
                    تفصيل العمولات بالمشترك
                  </p>
                  <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-muted-foreground" onClick={fetchCommissionHistory} disabled={historyLoading}>
                    <RefreshCw className={`h-3 w-3 ${historyLoading ? 'animate-spin' : ''}`} />
                    تحديث
                  </Button>
                </div>

                {/* Running-total summary strip */}
                {!historyLoading && commissionHistory !== null && commissionHistory.length > 0 && (() => {
                  const totals = commissionHistory.reduce(
                    (acc, rec) => {
                      if (rec.status === 'pending')   { acc.pending   += rec.amount || 0; acc.pendingCount++; }
                      if (rec.status === 'available') { acc.available += rec.amount || 0; acc.availableCount++; }
                      if (rec.status === 'withdrawn') { acc.withdrawn += rec.amount || 0; acc.withdrawnCount++; }
                      return acc;
                    },
                    { pending: 0, available: 0, withdrawn: 0, pendingCount: 0, availableCount: 0, withdrawnCount: 0 }
                  );
                  const handleTileClick = (status) => {
                    setHistoryStatusFilter(prev => prev === status ? 'all' : status);
                  };
                  return (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div
                        onClick={() => handleTileClick('pending')}
                        className={`flex flex-col items-center gap-0.5 rounded-lg border bg-amber-50 py-2 px-1 cursor-pointer transition-all select-none
                          ${historyStatusFilter === 'pending'
                            ? 'border-amber-500 ring-2 ring-amber-400 shadow-sm'
                            : 'border-amber-200 hover:border-amber-400 hover:shadow-sm'}`}
                      >
                        <span className="text-[10px] text-amber-700 font-medium">قيد الانتظار</span>
                        <span className="text-sm font-bold text-amber-800 tabular-nums">{totals.pending.toLocaleString()} دج</span>
                        <span className="text-[10px] text-amber-600 tabular-nums">{totals.pendingCount} سجل</span>
                      </div>
                      <div
                        onClick={() => handleTileClick('available')}
                        className={`flex flex-col items-center gap-0.5 rounded-lg border bg-emerald-50 py-2 px-1 cursor-pointer transition-all select-none
                          ${historyStatusFilter === 'available'
                            ? 'border-emerald-500 ring-2 ring-emerald-400 shadow-sm'
                            : 'border-emerald-200 hover:border-emerald-400 hover:shadow-sm'}`}
                      >
                        <span className="text-[10px] text-emerald-700 font-medium">متاح للسحب</span>
                        <span className="text-sm font-bold text-emerald-800 tabular-nums">{totals.available.toLocaleString()} دج</span>
                        <span className="text-[10px] text-emerald-600 tabular-nums">{totals.availableCount} سجل</span>
                      </div>
                      <div
                        onClick={() => handleTileClick('withdrawn')}
                        className={`flex flex-col items-center gap-0.5 rounded-lg border bg-blue-50 py-2 px-1 cursor-pointer transition-all select-none
                          ${historyStatusFilter === 'withdrawn'
                            ? 'border-blue-500 ring-2 ring-blue-400 shadow-sm'
                            : 'border-blue-200 hover:border-blue-400 hover:shadow-sm'}`}
                      >
                        <span className="text-[10px] text-blue-700 font-medium">تم الصرف</span>
                        <span className="text-sm font-bold text-blue-800 tabular-nums">{totals.withdrawn.toLocaleString()} دج</span>
                        <span className="text-[10px] text-blue-600 tabular-nums">{totals.withdrawnCount} سجل</span>
                      </div>
                    </div>
                  );
                })()}

                {historyLoading && (
                  <p className="text-center text-sm text-muted-foreground py-4">جاري تحميل التفصيل...</p>
                )}

                {/* Filter bar */}
                {!historyLoading && commissionHistory !== null && commissionHistory.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3 p-3 rounded-lg bg-muted/30 border">
                    {/* Tenant name search */}
                    <div className="relative flex-1 min-w-[140px]">
                      <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="بحث بالمشترك..."
                        value={historyTenantSearch}
                        onChange={e => setHistoryTenantSearch(e.target.value)}
                        className="h-8 text-xs pr-7"
                      />
                    </div>

                    {/* Status filter */}
                    <Select key={historyStatusFilter} value={historyStatusFilter} onValueChange={setHistoryStatusFilter}>
                      <SelectTrigger className="h-8 text-xs w-[140px]">
                        <SelectValue placeholder="الحالة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل الحالات</SelectItem>
                        <SelectItem value="pending">قيد الانتظار</SelectItem>
                        <SelectItem value="available">متاح</SelectItem>
                        <SelectItem value="withdrawn">تم الصرف</SelectItem>
                        <SelectItem value="reversed">ملغى</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Date from */}
                    <Input
                      type="date"
                      value={historyDateFrom}
                      onChange={e => setHistoryDateFrom(e.target.value)}
                      className="h-8 text-xs w-[130px]"
                      title="من تاريخ"
                    />

                    {/* Date to */}
                    <Input
                      type="date"
                      value={historyDateTo}
                      onChange={e => setHistoryDateTo(e.target.value)}
                      className="h-8 text-xs w-[130px]"
                      title="إلى تاريخ"
                    />

                    {/* Clear filters */}
                    {(historyTenantSearch || historyStatusFilter !== 'all' || historyDateFrom || historyDateTo) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs px-2 text-muted-foreground"
                        onClick={() => {
                          setHistoryTenantSearch('');
                          setHistoryStatusFilter('all');
                          setHistoryDateFrom('');
                          setHistoryDateTo('');
                        }}
                      >
                        <XCircle className="h-3.5 w-3.5 ml-1" />
                        مسح الفلاتر
                      </Button>
                    )}
                  </div>
                )}

                {!historyLoading && commissionHistory !== null && (() => {
                  if (commissionHistory.length === 0) {
                    return <p className="text-center text-sm text-muted-foreground py-4">لا توجد عمولات مسجّلة بعد</p>;
                  }

                  const statusMeta = {
                    pending:   { label: 'قيد الانتظار', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
                    available: { label: 'متاح',         cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
                    withdrawn: { label: 'تم الصرف',     cls: 'bg-blue-100 text-blue-800 border-blue-300' },
                    reversed:  { label: 'ملغى',         cls: 'bg-red-100 text-red-700 border-red-300' },
                  };

                  // Apply client-side filters
                  const fromDate = historyDateFrom ? new Date(historyDateFrom) : null;
                  const toDate   = historyDateTo   ? new Date(historyDateTo + 'T23:59:59') : null;
                  const filteredHistory = commissionHistory.filter(rec => {
                    if (historyStatusFilter !== 'all' && rec.status !== historyStatusFilter) return false;
                    if (fromDate && rec.created_at && new Date(rec.created_at) < fromDate) return false;
                    if (toDate   && rec.created_at && new Date(rec.created_at) > toDate)   return false;
                    return true;
                  });

                  // Group records by tenant
                  const tenantGroups = filteredHistory.reduce((acc, rec) => {
                    const tid = rec.tenant_id || rec.tenant_name || 'unknown';
                    if (!acc[tid]) {
                      acc[tid] = {
                        tenant_id: tid,
                        tenant_name: rec.tenant_name || '—',
                        records: [],
                        totals: { pending: 0, available: 0, withdrawn: 0, reversed: 0 },
                      };
                    }
                    acc[tid].records.push(rec);
                    acc[tid].totals[rec.status] = (acc[tid].totals[rec.status] || 0) + (rec.amount || 0);
                    return acc;
                  }, {});
                  // Apply tenant name search filter on groups
                  const searchLower = historyTenantSearch.trim().toLowerCase();
                  const groups = Object.values(tenantGroups).filter(g =>
                    !searchLower || g.tenant_name.toLowerCase().includes(searchLower)
                  );

                  if (groups.length === 0) {
                    return <p className="text-center text-sm text-muted-foreground py-4">لا توجد نتائج تطابق المرشّحات المحددة</p>;
                  }

                  const toggleTenant = (tid) => {
                    setExpandedTenants(prev => {
                      const next = new Set(prev);
                      next.has(tid) ? next.delete(tid) : next.add(tid);
                      return next;
                    });
                  };

                  return (
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead className="text-right font-medium text-xs py-2 w-6"></TableHead>
                            <TableHead className="text-right font-medium text-xs py-2">المشترك</TableHead>
                            <TableHead className="text-center font-medium text-xs py-2">قيد الانتظار</TableHead>
                            <TableHead className="text-center font-medium text-xs py-2">متاح</TableHead>
                            <TableHead className="text-center font-medium text-xs py-2">تم الصرف</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groups.map(group => {
                            const isExpanded = expandedTenants.has(group.tenant_id);
                            return (
                              <>
                                {/* Tenant summary row */}
                                <TableRow
                                  key={`grp-${group.tenant_id}`}
                                  className="text-sm cursor-pointer hover:bg-muted/30 select-none"
                                  onClick={() => toggleTenant(group.tenant_id)}
                                >
                                  <TableCell className="py-2 pr-3 pl-0">
                                    {isExpanded
                                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <span className="font-medium">{group.tenant_name}</span>
                                    <span className="text-[10px] text-muted-foreground mr-2">
                                      ({group.records.length} سجل)
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-center py-2">
                                    {group.totals.pending > 0
                                      ? <span className="text-xs font-medium text-amber-700">{group.totals.pending.toLocaleString()} دج</span>
                                      : <span className="text-muted-foreground/40 text-xs">—</span>}
                                  </TableCell>
                                  <TableCell className="text-center py-2">
                                    {group.totals.available > 0
                                      ? <span className="text-xs font-medium text-emerald-700">{group.totals.available.toLocaleString()} دج</span>
                                      : <span className="text-muted-foreground/40 text-xs">—</span>}
                                  </TableCell>
                                  <TableCell className="text-center py-2">
                                    {group.totals.withdrawn > 0
                                      ? <span className="text-xs font-medium text-blue-700">{group.totals.withdrawn.toLocaleString()} دج</span>
                                      : <span className="text-muted-foreground/40 text-xs">—</span>}
                                  </TableCell>
                                </TableRow>

                                {/* Expanded detail rows */}
                                {isExpanded && group.records.map(rec => {
                                  const daysLeft = rec.status === 'pending' && rec.chargeback_until
                                    ? Math.max(0, Math.ceil((new Date(rec.chargeback_until) - new Date()) / (1000 * 60 * 60 * 24)))
                                    : null;
                                  const meta = statusMeta[rec.status] || statusMeta.available;
                                  const planLabel = rec.plan_name || '';
                                  const dateLabel = rec.created_at
                                    ? new Date(rec.created_at).toLocaleDateString('ar-DZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                    : '';
                                  return (
                                    <TableRow key={`det-${rec.id}`} className="bg-muted/10 text-xs border-t border-dashed border-muted">
                                      <TableCell className="py-1.5"></TableCell>
                                      <TableCell className="py-1.5 pr-6" colSpan={1}>
                                        <div className="flex flex-col gap-0.5">
                                          {planLabel && <span className="text-muted-foreground">{planLabel}</span>}
                                          {dateLabel && <span className="text-[10px] text-muted-foreground/70">{dateLabel}</span>}
                                          {daysLeft !== null && (
                                            <span className="text-[10px] text-amber-600 flex items-center gap-1">
                                              <TimerIcon className="h-3 w-3" />
                                              {daysLeft} يوم متبقٍ للتأكيد
                                            </span>
                                          )}
                                          {rec.note && <span className="text-[10px] text-muted-foreground italic">{rec.note}</span>}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-center py-1.5" colSpan={2}>
                                        <span className="font-semibold">{(rec.amount || 0).toLocaleString()} دج</span>
                                      </TableCell>
                                      <TableCell className="text-center py-1.5">
                                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${meta.cls}`}>
                                          {meta.label}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })()}
              </div>
            )}

            {!commissionSummary && (
              <p className="text-center text-sm text-muted-foreground py-4">جاري تحميل بيانات العمولات...</p>
            )}
          </CardContent>
        </Card>

        {/* Distributor Wallet (buy & resell balance) */}
        <Card className="border-primary/20" data-testid="agent-wallet-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              محفظة الرصيد
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => navigate('/services/transfers')} data-testid="agent-transfers-link">
                سجل التحويلات
              </Button>
              <Button size="sm" className="gap-2" onClick={() => setTopupDialogOpen(true)} data-testid="agent-topup-btn">
                <Plus className="h-4 w-4" />
                شراء رصيد
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-gradient-to-br from-primary/10 to-blue-500/10 border">
              <div>
                <p className="text-sm text-muted-foreground mb-1">الرصيد المتوفر للبيع</p>
                <p className="text-3xl font-bold">
                  {(agentWallet?.balance || 0).toLocaleString()} <span className="text-base text-muted-foreground">دج</span>
                </p>
              </div>
              {agentWallet?.low_balance && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  رصيد منخفض
                </Badge>
              )}
            </div>

            {/* Pending requests routed to this distributor */}
            <div>
              <p className="text-sm font-medium mb-2">طلبات الشحن من مستأجريك ({walletRequests.to_approve.length})</p>
              {walletRequests.to_approve.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">لا توجد طلبات بانتظار الموافقة</p>
              ) : (
                <div className="space-y-2">
                  {walletRequests.to_approve.map(r => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30" data-testid={`agent-req-${r.id}`}>
                      <div>
                        <p className="text-sm font-medium">
                          {r.entity_name || r.entity_id} — {r.amount?.toLocaleString()} دج
                        </p>
                        <p className="text-xs text-muted-foreground">{r.note || ''} {new Date(r.created_at).toLocaleString('ar-DZ')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => approveWalletRequest(r.id)} disabled={walletBusy} data-testid={`agent-approve-${r.id}`}>
                          <CheckCircle className="h-4 w-4" />
                          بيع وشحن
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => rejectWalletRequest(r.id)} disabled={walletBusy} data-testid={`agent-reject-${r.id}`}>
                          رفض
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* My own top-up requests */}
            {walletRequests.my_requests.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">طلباتي لشراء الرصيد</p>
                <div className="space-y-2">
                  {walletRequests.my_requests.slice(0, 5).map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/30 text-sm">
                      <span>{r.amount?.toLocaleString()} دج</span>
                      <Badge variant={r.status === 'approved' ? 'default' : r.status === 'rejected' ? 'destructive' : 'secondary'}>
                        {r.status === 'approved' ? 'تمت الموافقة' : r.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                <Bell className="h-5 w-5 text-amber-500" />
                التنبيهات ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {alerts.slice(0, 3).map((alert, i) => (
                  <AlertCard key={alert.id || `alert-${i}`} alert={alert} />
                ))}
                {alerts.length > 3 && (
                  <Button variant="ghost" size="sm" className="text-amber-700">
                    عرض كل التنبيهات ({alerts.length - 3} أخرى)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="group hover:shadow-lg transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">إجمالي المشتركين</p>
                  <p className="text-3xl font-bold">{stats.total_tenants || 0}</p>
                </div>
                <div className="h-14 w-14 rounded-xl bg-blue-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Users className="h-7 w-7 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="group hover:shadow-lg transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">نشط</p>
                  <p className="text-3xl font-bold text-green-600">{stats.active_tenants || 0}</p>
                </div>
                <div className="h-14 w-14 rounded-xl bg-green-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <CheckCircle className="h-7 w-7 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="group hover:shadow-lg transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">تجريبي</p>
                  <p className="text-3xl font-bold text-amber-600">{stats.trial_tenants || 0}</p>
                </div>
                <div className="h-14 w-14 rounded-xl bg-amber-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Clock className="h-7 w-7 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="group hover:shadow-lg transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">قيمة الاشتراكات</p>
                  <p className="text-2xl font-bold text-purple-600">{(stats.total_subscription_value || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">دج</p>
                </div>
                <div className="h-14 w-14 rounded-xl bg-purple-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <PiggyBank className="h-7 w-7 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tenants Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-xl">المشتركين</CardTitle>
              <CardDescription>قائمة المشتركين التابعين لك</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="بحث..." 
                  className="pr-10 w-48"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="tenant-search-input"
                />
              </div>
              <Button variant="outline" size="icon" onClick={fetchAllTenants}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={openAddTenant} className="gap-2" data-testid="add-tenant-btn" disabled={!permissions.can_create_tenants}>
                <Plus className="h-4 w-4" />
                إضافة مشترك
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>المشترك</TableHead>
                  <TableHead>البريد / الهاتف</TableHead>
                  <TableHead>الخطة</TableHead>
                  <TableHead>نوع الاشتراك</TableHead>
                  <TableHead>انتهاء الاشتراك</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-center">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map(tenant => {
                  const endDate = tenant.subscription_ends_at ? new Date(tenant.subscription_ends_at) : null;
                  const daysLeft = endDate ? Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
                  
                  return (
                    <TableRow key={tenant.id} className="hover:bg-muted/30" data-testid={`tenant-row-${tenant.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center font-bold text-white ${
                            tenant.is_active ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-gray-400 to-gray-600'
                          }`}>
                            {tenant.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium">{tenant.name}</p>
                            <p className="text-xs text-muted-foreground">{tenant.company_name}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm space-y-1">
                          <p className="flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground" /> {tenant.email}</p>
                          <p className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" /> {tenant.phone || '—'}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{tenant.plan_name || 'غير محدد'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {tenant.subscription_type === 'monthly' ? 'شهري' : tenant.subscription_type === '6months' ? '6 أشهر' : 'سنوي'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className={`text-sm ${daysLeft !== null && daysLeft <= 7 ? 'text-red-500 font-medium' : ''}`}>
                            {endDate ? endDate.toLocaleDateString('ar-DZ') : '—'}
                          </span>
                          {daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
                            <Badge variant="destructive" className="text-xs">{daysLeft} يوم</Badge>
                          )}
                          {daysLeft !== null && daysLeft <= 0 && (
                            <Badge variant="destructive" className="text-xs">منتهي</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={tenant.is_active ? "default" : "secondary"} className={tenant.is_active ? 'bg-green-500' : ''}>
                          {tenant.is_active ? (
                            <><CheckCircle className="h-3 w-3 mr-1" /> نشط</>
                          ) : (
                            <><Clock className="h-3 w-3 mr-1" /> معطل</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" onClick={() => openTenantDetails(tenant)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredTenants.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                      <p className="text-muted-foreground">
                        {searchQuery ? 'لا يوجد مشتركين مطابقين للبحث' : 'لا يوجد مشتركين حالياً - أضف أول مشترك!'}
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>آخر المعاملات</CardTitle>
              <CardDescription>سجل آخر 5 معاملات</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchAllTransactions}>
              عرض الكل
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>التاريخ</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الوصف</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>الرصيد بعد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.slice(0, 5).map(tx => (
                  <TableRow key={tx.id} className="hover:bg-muted/30">
                    <TableCell className="text-sm">
                      {new Date(tx.created_at).toLocaleDateString('ar-DZ')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        tx.transaction_type === 'payment' ? 'default' : 
                        tx.transaction_type === 'commission' ? 'secondary' : 'outline'
                      } className={tx.transaction_type === 'payment' ? 'bg-green-500' : tx.transaction_type === 'commission' ? 'bg-blue-500' : ''}>
                        {tx.transaction_type === 'payment' ? 'دفعة' : tx.transaction_type === 'commission' ? 'عمولة' : 'بيع اشتراك'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{tx.description}</TableCell>
                    <TableCell>
                      <span className={`font-semibold flex items-center gap-1 ${tx.transaction_type === 'subscription_sale' ? 'text-red-500' : 'text-green-500'}`}>
                        {tx.transaction_type === 'subscription_sale' ? (
                          <><ArrowDownRight className="h-4 w-4" /> -{tx.amount?.toLocaleString()}</>
                        ) : (
                          <><ArrowUpRight className="h-4 w-4" /> +{tx.amount?.toLocaleString()}</>
                        )} دج
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{tx.balance_after?.toLocaleString()} دج</TableCell>
                  </TableRow>
                ))}
                {transactions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      لا توجد معاملات
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      {/* Add Tenant Dialog */}
      <Dialog open={addTenantDialogOpen} onOpenChange={setAddTenantDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>إضافة مشترك جديد</DialogTitle>
            <DialogDescription>سيتم خصم قيمة الاشتراك من رصيدك</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">الاسم *</Label>
              <Input className="h-9" value={tenantForm.name} onChange={e => setTenantForm({...tenantForm, name: e.target.value})} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">البريد الإلكتروني *</Label>
              <Input className="h-9" type="email" value={tenantForm.email} onChange={e => setTenantForm({...tenantForm, email: e.target.value})} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الهاتف</Label>
              <Input className="h-9" value={tenantForm.phone} onChange={e => setTenantForm({...tenantForm, phone: e.target.value})} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">اسم الشركة</Label>
              <Input className="h-9" value={tenantForm.company_name} onChange={e => setTenantForm({...tenantForm, company_name: e.target.value})} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">كلمة المرور *</Label>
              <Input className="h-9" type="password" value={tenantForm.password} onChange={e => setTenantForm({...tenantForm, password: e.target.value})} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">نوع النشاط</Label>
              <Select value={tenantForm.business_type} onValueChange={v => setTenantForm({...tenantForm, business_type: v})}>
                <SelectTrigger className="h-9">
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
              <Label className="text-xs">الخطة *</Label>
              <Select value={tenantForm.plan_id} onValueChange={v => setTenantForm({...tenantForm, plan_id: v})}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="اختر خطة" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map(plan => (
                    <SelectItem key={plan.id} value={plan.id}>{plan.name_ar || plan.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">نوع الاشتراك</Label>
              <Select value={tenantForm.subscription_type} onValueChange={v => setTenantForm({...tenantForm, subscription_type: v})}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">شهري</SelectItem>
                  <SelectItem value="6months">6 أشهر</SelectItem>
                  <SelectItem value="yearly">سنوي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea rows={2} value={tenantForm.notes} onChange={e => setTenantForm({...tenantForm, notes: e.target.value})} />
            </div>
          </div>
          
          {/* Price Summary */}
          <div className="bg-gradient-to-r from-primary/10 to-blue-500/10 p-4 rounded-lg">
            <div className="flex justify-between mb-2">
              <span className="text-sm">قيمة الاشتراك:</span>
              <span className="font-bold text-lg">{getPlanPrice(tenantForm.plan_id, tenantForm.subscription_type).toLocaleString()} دج</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>رصيدك الحالي:</span>
              <span className={(agent.current_balance || 0) < 0 ? 'text-red-500' : 'text-green-600'}>{(agent.current_balance || 0).toLocaleString()} دج</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground border-t mt-2 pt-2">
              <span>الرصيد بعد الخصم:</span>
              <span className={(agent.current_balance || 0) - getPlanPrice(tenantForm.plan_id, tenantForm.subscription_type) < 0 ? 'text-red-500' : 'text-green-600'}>
                {((agent.current_balance || 0) - getPlanPrice(tenantForm.plan_id, tenantForm.subscription_type)).toLocaleString()} دج
              </span>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTenantDialogOpen(false)}>إلغاء</Button>
            <Button onClick={saveTenant}>إضافة المشترك</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdrawal Request Dialog */}
      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-emerald-600" />
              طلب سحب عمولة
            </DialogTitle>
            <DialogDescription>
              الرصيد المتاح للسحب: <span className="font-bold text-emerald-600">
                {((commissionSummary?.available || 0) - (commissionSummary?.reserved || 0)).toLocaleString()} دج
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">المبلغ المطلوب (دج) *</Label>
              <Input
                type="number"
                min="1"
                max={(commissionSummary?.available || 0) - (commissionSummary?.reserved || 0)}
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                data-testid="withdraw-amount-input"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">بيانات الحساب البنكي / طريقة الاستلام *</Label>
              <Textarea
                rows={3}
                placeholder="رقم الحساب البنكي، اسم البنك، أو أي معلومات للتحويل..."
                value={withdrawBankDetails}
                onChange={e => setWithdrawBankDetails(e.target.value)}
                data-testid="withdraw-bank-details"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ملاحظة (اختياري)</Label>
              <Input value={withdrawNote} onChange={e => setWithdrawNote(e.target.value)} />
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              سيتم مراجعة الطلب من قبل المشرف والموافقة عليه يدوياً. لا يتم تنفيذ التحويل تلقائياً.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={submitWithdrawRequest}
              disabled={withdrawBusy}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
              data-testid="withdraw-submit-btn"
            >
              {withdrawBusy && <RefreshCw className="h-4 w-4 animate-spin" />}
              إرسال الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Buy Balance (Top-up) Dialog */}
      <Dialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>شراء رصيد</DialogTitle>
            <DialogDescription>سيتم إرسال الطلب إلى الجهة الأعلى (الموزّع الأب أو صاحب النظام) للموافقة عليه.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">المبلغ (دج) *</Label>
              <Input type="number" min="0" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} data-testid="agent-topup-amount" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ملاحظة (اختياري)</Label>
              <Input value={topupNote} onChange={e => setTopupNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTopupDialogOpen(false)}>إلغاء</Button>
            <Button onClick={submitTopup} disabled={walletBusy} data-testid="agent-topup-submit">إرسال الطلب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tenant Details Dialog */}
      <Dialog open={tenantDetailsDialogOpen} onOpenChange={setTenantDetailsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>تفاصيل المشترك</DialogTitle>
          </DialogHeader>
          {selectedTenant && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className={`h-14 w-14 rounded-lg flex items-center justify-center font-bold text-xl text-white ${
                  selectedTenant.is_active ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-gray-400 to-gray-600'
                }`}>
                  {selectedTenant.name?.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{selectedTenant.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedTenant.company_name || 'بدون شركة'}</p>
                  <Badge variant={selectedTenant.is_active ? "default" : "secondary"} className={`mt-1 ${selectedTenant.is_active ? 'bg-green-500' : ''}`}>
                    {selectedTenant.is_active ? 'نشط' : 'معطل'}
                  </Badge>
                </div>
              </div>
              
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedTenant.email}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedTenant.phone || '—'}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span>الخطة: {selectedTenant.plan_name || 'غير محددة'}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>ينتهي: {selectedTenant.subscription_ends_at ? new Date(selectedTenant.subscription_ends_at).toLocaleDateString('ar-DZ') : '—'}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTenantDetailsDialogOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* All Transactions Dialog */}
      <Dialog open={viewTransactionsDialogOpen} onOpenChange={setViewTransactionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>جميع المعاملات</DialogTitle>
            <DialogDescription>
              الرصيد الحالي: <span className={`font-bold ${agent.current_balance < 0 ? 'text-red-500' : 'text-green-500'}`}>
                {agent.current_balance?.toLocaleString()} دج
              </span>
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>الرصيد بعد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map(tx => (
                <TableRow key={tx.id} className="hover:bg-muted/30">
                  <TableCell className="text-sm">{new Date(tx.created_at).toLocaleDateString('ar-DZ')}</TableCell>
                  <TableCell>
                    <Badge variant={
                      tx.transaction_type === 'payment' ? 'default' : 
                      tx.transaction_type === 'commission' ? 'secondary' : 'outline'
                    } className={tx.transaction_type === 'payment' ? 'bg-green-500' : tx.transaction_type === 'commission' ? 'bg-blue-500' : ''}>
                      {tx.transaction_type === 'payment' ? 'دفعة' : tx.transaction_type === 'commission' ? 'عمولة' : 'بيع اشتراك'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{tx.description}</TableCell>
                  <TableCell>
                    <span className={`font-semibold flex items-center gap-1 ${tx.transaction_type === 'subscription_sale' ? 'text-red-500' : 'text-green-500'}`}>
                      {tx.transaction_type === 'subscription_sale' ? (
                        <><ArrowDownRight className="h-4 w-4" /> -{tx.amount?.toLocaleString()}</>
                      ) : (
                        <><ArrowUpRight className="h-4 w-4" /> +{tx.amount?.toLocaleString()}</>
                      )} دج
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{tx.balance_after?.toLocaleString()} دج</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
