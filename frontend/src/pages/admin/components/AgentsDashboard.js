/**
 * AgentsDashboard - Enhanced Agents Management Component
 * Features: Charts, Advanced Filtering, Performance Reports, Commission System, Notifications
 */
import { useState, useEffect, useMemo } from 'react';
import apiClient from '../../../lib/apiClient';
import { formatShortDate } from '../../../utils/globalDateFormatter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Textarea } from '../../../components/ui/textarea';
import { Switch } from '../../../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { toast } from 'sonner';
import { 
  Users, Plus, Edit, Trash2, Search, 
  DollarSign, FileText, TrendingUp, TrendingDown,
  Award, Bell, BarChart3, PieChart, Wallet,
  Phone, Mail, Building, MapPin, Percent,
  ArrowUpRight, ArrowDownRight, RefreshCw,
  Eye, EyeOff, Filter, Download, Star,
  AlertTriangle, CheckCircle, Clock, Target, Shield, UserCog
} from 'lucide-react';
import { AgentPermissionsDialog } from './AgentPermissionsDialog';
import { AgentTenantsDialog } from './AgentTenantsDialog';

// Mini chart component for sparklines
const MiniChart = ({ data, color = 'blue', height = 40 }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  return (
    <svg viewBox={`0 0 ${data.length * 10} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={`var(--${color}-500)`} stopOpacity="0.3" />
          <stop offset="100%" stopColor={`var(--${color}-500)`} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`M 0 ${height} ${data.map((v, i) => `L ${i * 10} ${height - ((v - min) / range) * (height - 5)}`).join(' ')} L ${(data.length - 1) * 10} ${height} Z`}
        fill={`url(#gradient-${color})`}
      />
      <path
        d={data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * 10} ${height - ((v - min) / range) * (height - 5)}`).join(' ')}
        fill="none"
        stroke={`var(--${color}-500, #3b82f6)`}
        strokeWidth="2"
        className={`text-${color}-500`}
      />
    </svg>
  );
};

// Performance Badge Component
const PerformanceBadge = ({ score }) => {
  if (score >= 80) return <Badge className="bg-green-500 hover:bg-green-600"><Star className="h-3 w-3 mr-1" /> ممتاز</Badge>;
  if (score >= 60) return <Badge className="bg-blue-500 hover:bg-blue-600"><TrendingUp className="h-3 w-3 mr-1" /> جيد</Badge>;
  if (score >= 40) return <Badge className="bg-amber-500 hover:bg-amber-600"><Target className="h-3 w-3 mr-1" /> متوسط</Badge>;
  return <Badge className="bg-red-500 hover:bg-red-600"><TrendingDown className="h-3 w-3 mr-1" /> ضعيف</Badge>;
};

export const AgentsDashboard = () => {
  // State
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('tenants_count');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Dialog States
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [transactionsDialogOpen, setTransactionsDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [tenantsDialogOpen, setTenantsDialogOpen] = useState(false);
  
  const [editingAgent, setEditingAgent] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agentTransactions, setAgentTransactions] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  
  // Forms
  const [agentForm, setAgentForm] = useState({
    name: '', email: '', password: '', phone: '', company_name: '', address: '',
    agent_type: 'assistant', region: '',
    commission_percent: 10, commission_fixed: 0, credit_limit: 100000, notes: ''
  });
  
  const [paymentForm, setPaymentForm] = useState({
    amount: 0, transaction_type: 'payment', description: '', notes: ''
  });
  
  const [notificationForm, setNotificationForm] = useState({
    title: '', message: '', type: 'info'
  });

  // Fetch Data
  useEffect(() => { fetchAgents(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/saas/agents`);
      
      // Enhance agents data with computed stats
      const enhancedAgents = response.data.map(agent => ({
        ...agent,
        // Calculate performance score
        performance_score: calculatePerformanceScore(agent),
        // Mock monthly data for charts (in production, fetch from API)
        monthly_tenants: generateMockChartData(agent.tenants_count),
        monthly_revenue: generateMockChartData(agent.total_earnings || 0),
      }));
      
      setAgents(enhancedAgents);
    } catch (err) {
      toast.error('فشل تحميل بيانات الوكلاء');
    }
    setLoading(false);
  };

  // Calculate performance score
  const calculatePerformanceScore = (agent) => {
    let score = 0;
    // Tenants count contributes 40%
    score += Math.min((agent.tenants_count || 0) * 10, 40);
    // Positive balance contributes 30%
    if (agent.current_balance >= 0) score += 30;
    else score += Math.max(0, 30 - Math.abs(agent.current_balance) / 1000);
    // Active status contributes 20%
    if (agent.is_active) score += 20;
    // Total earnings contributes 10%
    score += Math.min((agent.total_earnings || 0) / 10000, 10);
    return Math.round(score);
  };

  // Generate mock chart data
  const generateMockChartData = (base) => {
    return Array(7).fill(0).map((_, i) => Math.max(0, base * (0.5 + Math.random() * 0.8)));
  };

  // Filter and Sort Agents
  const filteredAgents = useMemo(() => {
    let result = [...agents];
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a => 
        a.name?.toLowerCase().includes(query) ||
        a.email?.toLowerCase().includes(query) ||
        a.company_name?.toLowerCase().includes(query) ||
        a.phone?.includes(query)
      );
    }
    
    // Status filter
    if (filterStatus !== 'all') {
      if (filterStatus === 'active') result = result.filter(a => a.is_active);
      else if (filterStatus === 'inactive') result = result.filter(a => !a.is_active);
      else if (filterStatus === 'debt') result = result.filter(a => a.current_balance < 0);
      else if (filterStatus === 'top') result = result.filter(a => a.tenants_count >= 5);
    }
    
    // Sort
    result.sort((a, b) => {
      let aVal = a[sortBy] || 0;
      let bVal = b[sortBy] || 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
    
    return result;
  }, [agents, searchQuery, filterStatus, sortBy, sortOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stats
  const stats = useMemo(() => {
    const totalAgents = agents.length;
    const activeAgents = agents.filter(a => a.is_active).length;
    const totalTenants = agents.reduce((sum, a) => sum + (a.tenants_count || 0), 0);
    const totalEarnings = agents.reduce((sum, a) => sum + (a.total_earnings || 0), 0);
    const totalDebt = agents.reduce((sum, a) => sum + (a.current_balance < 0 ? Math.abs(a.current_balance) : 0), 0);
    const totalCredit = agents.reduce((sum, a) => sum + (a.current_balance > 0 ? a.current_balance : 0), 0);
    const avgPerformance = agents.length ? Math.round(agents.reduce((sum, a) => sum + (a.performance_score || 0), 0) / agents.length) : 0;
    const topAgent = [...agents].sort((a, b) => (b.tenants_count || 0) - (a.tenants_count || 0))[0];
    
    return { totalAgents, activeAgents, totalTenants, totalEarnings, totalDebt, totalCredit, avgPerformance, topAgent };
  }, [agents]); // eslint-disable-line react-hooks/exhaustive-deps

  // Agent CRUD
  const openAgentDialog = (agent = null) => {
    if (agent) {
      setEditingAgent(agent);
      setAgentForm({
        name: agent.name, email: agent.email, password: '', phone: agent.phone,
        company_name: agent.company_name || '', address: agent.address || '',
        agent_type: agent.agent_type || 'assistant', region: agent.region || '',
        commission_percent: agent.commission_percent || agent.commission_rate || 10,
        commission_fixed: agent.commission_fixed || 0,
        credit_limit: agent.credit_limit || 100000,
        notes: agent.notes || ''
      });
    } else {
      setEditingAgent(null);
      setAgentForm({
        name: '', email: '', password: '', phone: '', company_name: '', address: '',
        agent_type: 'assistant', region: '',
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
      fetchAgents();
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
      fetchAgents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ');
    }
  };

  // Transactions
  const openTransactionsDialog = async (agent) => {
    setSelectedAgent(agent);
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/saas/agents/${agent.id}/transactions`);
      setAgentTransactions(response.data);
      setTransactionsDialogOpen(true);
    } catch (error) {
      toast.error('خطأ في تحميل المعاملات');
    }
  };

  // Payment
  const openPaymentDialog = (agent) => {
    setSelectedAgent(agent);
    setPaymentForm({ amount: 0, transaction_type: 'payment', description: 'دفعة نقدية', notes: '' });
    setPaymentDialogOpen(true);
  };

  const savePayment = async () => {
    try {
      await apiClient.post(`/saas/agents/${selectedAgent.id}/transactions`, paymentForm);
      toast.success('تم تسجيل الدفعة بنجاح');
      setPaymentDialogOpen(false);
      fetchAgents();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ');
    }
  };

  // View Details
  const openDetailsDialog = (agent) => {
    setSelectedAgent(agent);
    setDetailsDialogOpen(true);
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview with Charts */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card className="col-span-2 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">إجمالي الوكلاء</p>
                <p className="text-3xl font-bold">{stats.totalAgents}</p>
                <p className="text-xs opacity-80 mt-1">{stats.activeAgents} نشط</p>
              </div>
              <Users className="h-10 w-10 opacity-80" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-2 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">إجمالي المشتركين</p>
                <p className="text-3xl font-bold">{stats.totalTenants}</p>
                <p className="text-xs opacity-80 mt-1">عبر كل الوكلاء</p>
              </div>
              <Building className="h-10 w-10 opacity-80" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-2 bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">إجمالي العمولات</p>
                <p className="text-2xl font-bold">{stats.totalEarnings.toLocaleString()}</p>
                <p className="text-xs opacity-80 mt-1">دج</p>
              </div>
              <DollarSign className="h-10 w-10 opacity-80" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-2 bg-gradient-to-br from-red-500 to-red-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-80">إجمالي الدين</p>
                <p className="text-2xl font-bold">{stats.totalDebt.toLocaleString()}</p>
                <p className="text-xs opacity-80 mt-1">دج</p>
              </div>
              <TrendingDown className="h-10 w-10 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Overview */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              متوسط الأداء
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-4xl font-bold text-primary">{stats.avgPerformance}%</div>
              <div className="flex-1">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${stats.avgPerformance >= 70 ? 'bg-green-500' : stats.avgPerformance >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${stats.avgPerformance}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              أفضل وكيل
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topAgent ? (
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold">
                  {stats.topAgent.name?.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold">{stats.topAgent.name}</p>
                  <p className="text-sm text-muted-foreground">{stats.topAgent.tenants_count} مشترك</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">لا يوجد</p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-500" />
              صافي الرصيد
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              <span className={stats.totalCredit - stats.totalDebt >= 0 ? 'text-green-600' : 'text-red-600'}>
                {(stats.totalCredit - stats.totalDebt).toLocaleString()}
              </span>
              <span className="text-sm font-normal text-muted-foreground mr-1">دج</span>
            </div>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="text-green-600">+{stats.totalCredit.toLocaleString()}</span>
              <span className="text-red-600">-{stats.totalDebt.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 w-full md:max-w-sm">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم، البريد، الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
                data-testid="agent-search-input"
              />
            </div>
            
            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32" data-testid="agent-filter-status">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="inactive">معطل</SelectItem>
                  <SelectItem value="debt">عليهم ديون</SelectItem>
                  <SelectItem value="top">الأفضل أداءً</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-36" data-testid="agent-sort-by">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="ترتيب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenants_count">عدد المشتركين</SelectItem>
                  <SelectItem value="total_earnings">إجمالي العمولات</SelectItem>
                  <SelectItem value="current_balance">الرصيد</SelectItem>
                  <SelectItem value="performance_score">الأداء</SelectItem>
                  <SelectItem value="created_at">تاريخ الإنشاء</SelectItem>
                </SelectContent>
              </Select>
              
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              >
                {sortOrder === 'desc' ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </Button>
              
              <Button variant="outline" size="icon" onClick={fetchAgents}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Add Agent Button */}
            <Button onClick={() => openAgentDialog()} data-testid="add-agent-btn">
              <Plus className="h-4 w-4 me-2" />
              إضافة وكيل
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Agents Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>الوكيل</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>التواصل</TableHead>
                <TableHead className="text-center">المشتركين</TableHead>
                <TableHead className="text-center">العمولة</TableHead>
                <TableHead className="text-center">الأداء</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAgents.map(agent => (
                <TableRow key={agent.id} className="hover:bg-muted/30" data-testid={`agent-row-${agent.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-white ${
                        agent.performance_score >= 70 ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' :
                        agent.performance_score >= 50 ? 'bg-gradient-to-br from-blue-400 to-blue-600' :
                        'bg-gradient-to-br from-gray-400 to-gray-600'
                      }`}>
                        {agent.name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.region || agent.company_name || '—'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={agent.agent_type === 'reseller' ? 'default' : 'secondary'} className="text-xs">
                      {agent.agent_type === 'reseller' ? 'موزع' : 'مساعد'}
                    </Badge>
                    {agent.assigned_tenant_ids?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">{agent.assigned_tenant_ids.length} مُعيّن</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm space-y-1">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <span className="text-xs">{agent.email}</span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span className="text-xs">{agent.phone}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Badge variant="secondary" className="text-lg px-3">{agent.tenants_count || 0}</Badge>
                      <div className="w-20">
                        <MiniChart data={agent.monthly_tenants} color="blue" height={20} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="text-sm">
                      <div className="flex items-center justify-center gap-1">
                        <Percent className="h-3 w-3 text-muted-foreground" />
                        <span className="font-semibold">{agent.commission_percent}%</span>
                      </div>
                      {agent.commission_fixed > 0 && (
                        <p className="text-xs text-muted-foreground">+{agent.commission_fixed.toLocaleString()} دج</p>
                      )}
                      <p className="text-xs text-emerald-600 font-medium mt-1">
                        إجمالي: {(agent.total_earnings || 0).toLocaleString()} دج
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      <PerformanceBadge score={agent.performance_score} />
                      <span className="text-xs text-muted-foreground">{agent.performance_score}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={agent.is_active ? "default" : "secondary"}>
                      {agent.is_active ? (
                        <><CheckCircle className="h-3 w-3 mr-1" /> نشط</>
                      ) : (
                        <><Clock className="h-3 w-3 mr-1" /> معطل</>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <Button variant="ghost" size="sm" onClick={() => openDetailsDialog(agent)} title="عرض التفاصيل">
                        <Eye className="h-4 w-4 text-blue-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedAgent(agent); setPermissionsDialogOpen(true); }} title="الصلاحيات" data-testid={`perms-btn-${agent.id}`}>
                        <Shield className="h-4 w-4 text-purple-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedAgent(agent); setTenantsDialogOpen(true); }} title="تعيين مستأجرين" data-testid={`assign-btn-${agent.id}`}>
                        <UserCog className="h-4 w-4 text-cyan-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openPaymentDialog(agent)} title="إضافة دفعة">
                        <DollarSign className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openTransactionsDialog(agent)} title="المعاملات">
                        <FileText className="h-4 w-4 text-purple-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openAgentDialog(agent)} title="تعديل">
                        <Edit className="h-4 w-4 text-amber-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteAgent(agent.id)} title="حذف">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredAgents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>لا يوجد وكلاء {searchQuery && 'مطابقين للبحث'}</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Agent Dialog */}
      <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAgent ? 'تعديل وكيل' : 'إضافة وكيل جديد'}</DialogTitle>
            <DialogDescription>
              {editingAgent ? 'تعديل بيانات الوكيل' : 'أدخل بيانات الوكيل الجديد'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الاسم *</Label>
                <Input value={agentForm.name} onChange={e => setAgentForm({...agentForm, name: e.target.value})} data-testid="agent-name-input" />
              </div>
              <div className="space-y-2">
                <Label>البريد الإلكتروني *</Label>
                <Input type="email" value={agentForm.email} onChange={e => setAgentForm({...agentForm, email: e.target.value})} data-testid="agent-email-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>كلمة المرور {!editingAgent && '*'}</Label>
                <div className="relative">
                  <Input 
                    type={showPassword ? 'text' : 'password'}
                    value={agentForm.password} 
                    onChange={e => setAgentForm({...agentForm, password: e.target.value})}
                    placeholder={editingAgent ? 'اتركه فارغاً للإبقاء على القديمة' : ''}
                    data-testid="agent-password-input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute left-0 top-0 h-full"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>رقم الهاتف *</Label>
                <Input value={agentForm.phone} onChange={e => setAgentForm({...agentForm, phone: e.target.value})} data-testid="agent-phone-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>نوع الوكيل *</Label>
                <Select value={agentForm.agent_type} onValueChange={v => setAgentForm({...agentForm, agent_type: v})}>
                  <SelectTrigger data-testid="agent-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assistant">مساعد (يدير مستأجرين محددين)</SelectItem>
                    <SelectItem value="reseller">موزع (يبيع اشتراكات)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المنطقة</Label>
                <Input value={agentForm.region} onChange={e => setAgentForm({...agentForm, region: e.target.value})} placeholder="مثال: الجزائر العاصمة" data-testid="agent-region-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم الشركة</Label>
                <Input value={agentForm.company_name} onChange={e => setAgentForm({...agentForm, company_name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>العنوان</Label>
                <Input value={agentForm.address} onChange={e => setAgentForm({...agentForm, address: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>نسبة العمولة %</Label>
                <Input type="number" value={agentForm.commission_percent} onChange={e => setAgentForm({...agentForm, commission_percent: parseFloat(e.target.value)})} />
              </div>
              <div className="space-y-2">
                <Label>عمولة ثابتة (دج)</Label>
                <Input type="number" value={agentForm.commission_fixed} onChange={e => setAgentForm({...agentForm, commission_fixed: parseFloat(e.target.value)})} />
              </div>
              <div className="space-y-2">
                <Label>حد الدين (دج)</Label>
                <Input type="number" value={agentForm.credit_limit} onChange={e => setAgentForm({...agentForm, credit_limit: parseFloat(e.target.value)})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea value={agentForm.notes} onChange={e => setAgentForm({...agentForm, notes: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgentDialogOpen(false)}>إلغاء</Button>
            <Button onClick={saveAgent}>{editingAgent ? 'تحديث' : 'إنشاء'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تفاصيل الوكيل</DialogTitle>
          </DialogHeader>
          {selectedAgent && (
            <div className="space-y-6">
              {/* Profile Header */}
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className={`h-16 w-16 rounded-full flex items-center justify-center font-bold text-2xl text-white ${
                  selectedAgent.performance_score >= 70 ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' :
                  selectedAgent.performance_score >= 50 ? 'bg-gradient-to-br from-blue-400 to-blue-600' :
                  'bg-gradient-to-br from-gray-400 to-gray-600'
                }`}>
                  {selectedAgent.name?.charAt(0)}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold">{selectedAgent.name}</h3>
                  <p className="text-muted-foreground">{selectedAgent.company_name || 'بدون شركة'}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <PerformanceBadge score={selectedAgent.performance_score} />
                    <Badge variant={selectedAgent.is_active ? 'default' : 'secondary'}>
                      {selectedAgent.is_active ? 'نشط' : 'معطل'}
                    </Badge>
                  </div>
                </div>
              </div>
              
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 border rounded-lg text-center">
                  <Building className="h-5 w-5 mx-auto mb-2 text-blue-500" />
                  <p className="text-2xl font-bold">{selectedAgent.tenants_count || 0}</p>
                  <p className="text-xs text-muted-foreground">مشترك</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <DollarSign className="h-5 w-5 mx-auto mb-2 text-emerald-500" />
                  <p className="text-2xl font-bold">{(selectedAgent.total_earnings || 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">إجمالي العمولات</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <Wallet className="h-5 w-5 mx-auto mb-2 text-purple-500" />
                  <p className={`text-2xl font-bold ${selectedAgent.current_balance < 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {selectedAgent.current_balance?.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">الرصيد الحالي</p>
                </div>
                <div className="p-4 border rounded-lg text-center">
                  <Target className="h-5 w-5 mx-auto mb-2 text-amber-500" />
                  <p className="text-2xl font-bold">{selectedAgent.performance_score}%</p>
                  <p className="text-xs text-muted-foreground">الأداء</p>
                </div>
              </div>
              
              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedAgent.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedAgent.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedAgent.address || '—'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-muted-foreground" />
                  <span>عمولة: {selectedAgent.commission_percent}% + {selectedAgent.commission_fixed} دج</span>
                </div>
              </div>
              
              {selectedAgent.notes && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-sm text-muted-foreground">{selectedAgent.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>إغلاق</Button>
            <Button onClick={() => { setDetailsDialogOpen(false); openAgentDialog(selectedAgent); }}>
              <Edit className="h-4 w-4 mr-2" /> تعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transactions Dialog */}
      <Dialog open={transactionsDialogOpen} onOpenChange={setTransactionsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>معاملات {selectedAgent?.name}</DialogTitle>
            <DialogDescription>سجل كل المعاملات المالية</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>النوع</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>الرصيد بعدها</TableHead>
                <TableHead>التاريخ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentTransactions.map((tx, i) => (
                <TableRow key={tx.id || tx._id || `tx-${i}`}>
                  <TableCell>
                    <Badge variant={tx.transaction_type === 'payment' ? 'default' : tx.transaction_type === 'commission' ? 'secondary' : 'outline'}>
                      {tx.transaction_type === 'payment' ? 'دفعة' : tx.transaction_type === 'commission' ? 'عمولة' : tx.transaction_type}
                    </Badge>
                  </TableCell>
                  <TableCell className={tx.amount > 0 ? 'text-green-600' : 'text-red-600'}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount?.toLocaleString()} دج
                  </TableCell>
                  <TableCell className="text-sm">{tx.description}</TableCell>
                  <TableCell className="font-medium">{tx.balance_after?.toLocaleString()} دج</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatShortDate(tx.created_at)}
                  </TableCell>
                </TableRow>
              ))}
              {agentTransactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    لا توجد معاملات
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionsDialogOpen(false)}>إغلاق</Button>
            <Button onClick={() => { setTransactionsDialogOpen(false); openPaymentDialog(selectedAgent); }}>
              <Plus className="h-4 w-4 mr-2" /> إضافة دفعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة دفعة لـ {selectedAgent?.name}</DialogTitle>
            <DialogDescription>الرصيد الحالي: {selectedAgent?.current_balance?.toLocaleString()} دج</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>نوع المعاملة</Label>
              <Select value={paymentForm.transaction_type} onValueChange={v => setPaymentForm({...paymentForm, transaction_type: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment">دفعة (إيداع)</SelectItem>
                  <SelectItem value="commission">عمولة</SelectItem>
                  <SelectItem value="refund">استرداد</SelectItem>
                  <SelectItem value="deduction">خصم</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المبلغ (دج)</Label>
              <Input type="number" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: parseFloat(e.target.value)})} />
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
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>إلغاء</Button>
            <Button onClick={savePayment}>تسجيل الدفعة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <AgentPermissionsDialog
        open={permissionsDialogOpen}
        onOpenChange={setPermissionsDialogOpen}
        agent={selectedAgent}
        onSaved={fetchAgents}
      />

      {/* Tenants Assignment Dialog */}
      <AgentTenantsDialog
        open={tenantsDialogOpen}
        onOpenChange={setTenantsDialogOpen}
        agent={selectedAgent}
        onSaved={fetchAgents}
      />
    </div>
  );
};

export default AgentsDashboard;
