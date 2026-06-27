/**
 * SubscribersPage — extracted from the legacy SaasAdminPage. Contains the
 * tenants list + the 6 most-used tenant dialogs:
 *
 *  • Tenant Form Dialog (create / edit)
 *  • Extend Subscription Dialog
 *  • Wallet Charge Dialog (cash / credit)
 *  • Feature Flags Dialog
 *  • Impersonate Confirmation Dialog
 *  • Bridge Mode Dialog (recharge bridge)
 *
 * Each handler fetches/refreshes its own data. The page is self-contained —
 * no shared state with SaasAdminPage.
 */
import { useEffect, useMemo, useState } from 'react';
import apiClient from '../../../lib/apiClient';
import { toast } from 'sonner';
import { Layout } from '../../../components/Layout';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Badge } from '../../../components/ui/badge';
import { Textarea } from '../../../components/ui/textarea';
import { Switch } from '../../../components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../../components/ui/select';
import {
  Users, Plus, Edit, Trash2, RefreshCw, Eye, EyeOff, Ban, Check,
  ShoppingBag, Truck, Store, Wallet, Sliders, LogIn, Copy,
  Banknote, CreditCard, Wifi, Server, UserCog, Search,
} from 'lucide-react';
import { formatShortDate } from '../../../utils/globalDateFormatter';
import { SaasPageHeader } from './SaasPageHeader';
import { EntityCode } from '../components/EntityCode';

const ALL_FEATURES = [
  { key: 'pos',             labelAr: 'نقطة البيع (POS)' },
  { key: 'inventory',       labelAr: 'المخزون والمنتجات' },
  { key: 'customers',       labelAr: 'الزبائن' },
  { key: 'recharge',        labelAr: 'شحن رصيد الجوال' },
  { key: 'iptv',            labelAr: 'الخدمات الرقمية (IPTV)' },
  { key: 'maintenance',     labelAr: 'الصيانة' },
  { key: 'wallet',          labelAr: 'المحفظة المالية' },
  { key: 'commission',      labelAr: 'العمولات' },
  { key: 'reports',         labelAr: 'التقارير' },
  { key: 'backup',          labelAr: 'النسخ الاحتياطي' },
  { key: 'ai_bots',         labelAr: 'الروبوتات الذكية (AI)' },
  { key: 'barcode',         labelAr: 'الباركود' },
  { key: 'thermal_print',   labelAr: 'الطباعة الحرارية' },
  { key: 'credit_sales',    labelAr: 'البيع بالدين' },
  { key: 'loyalty_points',  labelAr: 'نقاط الولاء' },
  { key: 'ecommerce_hub',   labelAr: '🛍️ مركز التجارة الإلكترونية الموحّد', optIn: true },
];

const isExpiringSoon = (endDate) => {
  if (!endDate) return false;
  const d = (new Date(endDate) - new Date()) / 86400000;
  return d <= 7 && d > 0;
};
const isExpired = (endDate) => !!endDate && new Date(endDate) < new Date();

export default function SubscribersPage() {
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // — Tenant form dialog (create / edit)
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [tenantForm, setTenantForm] = useState({
    name: '', email: '', phone: '', company_name: '', password: '',
    plan_id: '', subscription_type: 'monthly', business_type: 'retailer', role: 'admin',
  });

  // — Extend dialog
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [selectedTenantForExtend, setSelectedTenantForExtend] = useState(null);
  const [extendForm, setExtendForm] = useState({
    amount: 0, payment_method: 'manual', subscription_type: 'monthly', notes: '', transaction_id: '',
  });

  // — Impersonate dialog
  const [impersonateDialogOpen, setImpersonateDialogOpen] = useState(false);
  const [impersonateTenant, setImpersonateTenant] = useState(null);
  const [impersonateLoading, setImpersonateLoading] = useState(false);

  // — Wallet charge dialog
  const [walletChargeDialogOpen, setWalletChargeDialogOpen] = useState(false);
  const [walletChargeTenant, setWalletChargeTenant] = useState(null);
  const [walletChargeForm, setWalletChargeForm] = useState({ amount: '', notes: '', payment_method: 'cash' });
  const [walletChargeLoading, setWalletChargeLoading] = useState(false);
  const [walletInfo, setWalletInfo] = useState(null);
  const [walletInfoLoading, setWalletInfoLoading] = useState(false);

  // — Feature flags dialog
  const [featureFlagsDialogOpen, setFeatureFlagsDialogOpen] = useState(false);
  const [selectedTenantForFlags, setSelectedTenantForFlags] = useState(null);
  const [tenantFeatureFlags, setTenantFeatureFlags] = useState({});
  const [savingFlags, setSavingFlags] = useState(false);

  // — Bridge dialog
  const [bridgeDialogOpen, setBridgeDialogOpen] = useState(false);
  const [bridgeTenant, setBridgeTenant] = useState(null);
  const [bridgeForm, setBridgeForm] = useState({ recharge_mode: 'owner_bridge', self_bridge_url: '', self_bridge_api_key: '' });
  const [bridgeSaving, setBridgeSaving] = useState(false);

  // ─────────────────── Data loading ───────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.allSettled([
        apiClient.get('/saas/tenants'),
        apiClient.get('/saas/plans?include_inactive=true'),
      ]);
      if (t.status === 'fulfilled') setTenants(t.value.data || []);
      if (p.status === 'fulfilled') setPlans(p.value.data || []);
    } catch (e) {
      toast.error('فشل تحميل بيانات المشتركين');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredTenants = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return tenants.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.company_name?.toLowerCase().includes(q)
    );
  }, [tenants, searchQuery]);

  // ─────────────────── Tenant CRUD ───────────────────
  const openTenantDialog = (tenant = null) => {
    if (tenant) {
      setEditingTenant(tenant);
      setTenantForm({
        name: tenant.name, email: tenant.email, phone: tenant.phone,
        company_name: tenant.company_name, password: '',
        plan_id: tenant.plan_id, subscription_type: tenant.subscription_type,
        business_type: tenant.business_type || 'retailer', role: tenant.role || 'admin',
      });
    } else {
      setEditingTenant(null);
      setTenantForm({
        name: '', email: '', phone: '', company_name: '', password: '',
        plan_id: plans[0]?.id || '', subscription_type: 'monthly',
        business_type: 'retailer', role: 'admin',
      });
    }
    setTenantDialogOpen(true);
  };

  const saveTenant = async () => {
    try {
      if (editingTenant) {
        const updateData = { ...tenantForm };
        delete updateData.password;
        await apiClient.put(`/saas/tenants/${editingTenant.id}`, updateData);
        toast.success('تم تحديث المشترك');
      } else {
        await apiClient.post('/saas/tenants', tenantForm);
        toast.success('تم إنشاء المشترك');
      }
      setTenantDialogOpen(false);
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ');
    }
  };

  const toggleTenantStatus = async (tenantId) => {
    try {
      const res = await apiClient.post(`/saas/tenants/${tenantId}/toggle-status`, {});
      toast.success(res.data.is_active ? 'تم تفعيل المشترك' : 'تم تعطيل المشترك');
      await fetchData();
    } catch {
      toast.error('حدث خطأ');
    }
  };

  const deleteTenant = async (tenantId) => {
    if (!window.confirm('هل أنت متأكد؟ سيتم حذف جميع بيانات هذا المشترك نهائياً!')) return;
    try {
      await apiClient.delete(`/saas/tenants/${tenantId}`);
      toast.success('تم حذف المشترك');
      await fetchData();
    } catch {
      toast.error('حدث خطأ');
    }
  };

  // ─────────────────── Extend Subscription ───────────────────
  const openExtendDialog = (tenant) => {
    setSelectedTenantForExtend(tenant);
    const plan = plans.find(p => p.id === tenant.plan_id);
    setExtendForm({
      amount: plan?.price_monthly || 0,
      payment_method: 'manual',
      subscription_type: 'monthly',
      notes: '',
      transaction_id: '',
    });
    setExtendDialogOpen(true);
  };

  const extendSubscription = async () => {
    try {
      await apiClient.post(`/saas/tenants/${selectedTenantForExtend.id}/extend-subscription`, {
        tenant_id: selectedTenantForExtend.id,
        ...extendForm,
      });
      toast.success('تم تمديد الاشتراك بنجاح');
      setExtendDialogOpen(false);
      await fetchData();
    } catch {
      toast.error('حدث خطأ');
    }
  };

  // ─────────────────── Impersonate ───────────────────
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
      if (originalToken) localStorage.setItem('super_admin_token', originalToken);
      if (originalUser) localStorage.setItem('super_admin_user', originalUser);
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('user_type', 'tenant');
      localStorage.setItem('is_impersonating', '1');
      if (data.impersonation_session_id) {
        localStorage.setItem('impersonation_session_id', data.impersonation_session_id);
      }
      window.location.href = '/';
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل الدخول لحساب المشترك');
      setImpersonateLoading(false);
    }
  };

  // ─────────────────── Wallet Charge ───────────────────
  const openWalletChargeDialog = async (tenant) => {
    setWalletChargeTenant(tenant);
    setWalletChargeForm({ amount: '', notes: '', payment_method: 'cash' });
    setWalletInfo(null);
    setWalletChargeDialogOpen(true);
    setWalletInfoLoading(true);
    try {
      const res = await apiClient.get(`/saas/tenants/${tenant.id}/wallet`);
      setWalletInfo(res.data);
    } catch {
      setWalletInfo(null);
    } finally {
      setWalletInfoLoading(false);
    }
  };

  const handleWalletCharge = async () => {
    if (!walletChargeTenant) return;
    const amount = parseFloat(walletChargeForm.amount);
    if (!amount || amount <= 0) { toast.error('أدخل مبلغاً صحيحاً أكبر من صفر'); return; }
    setWalletChargeLoading(true);
    try {
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

  // ─────────────────── Feature Flags ───────────────────
  const openFeatureFlagsDialog = async (tenant) => {
    setSelectedTenantForFlags(tenant);
    setFeatureFlagsDialogOpen(true);
    try {
      const res = await apiClient.get(`/saas/tenants/${tenant.id}/features`);
      const resolved = res.data?.resolved || {};
      const init = {};
      ALL_FEATURES.forEach(f => {
        // Opt-in features (e.g. ecommerce_hub) default to false; others default to true.
        const fallback = f.optIn ? false : true;
        init[f.key] = resolved[f.key] !== undefined ? Boolean(resolved[f.key]) : fallback;
      });
      setTenantFeatureFlags(init);
    } catch {
      const init = {};
      ALL_FEATURES.forEach(f => { init[f.key] = f.optIn ? false : true; });
      setTenantFeatureFlags(init);
    }
  };

  const saveFeatureFlags = async () => {
    if (!selectedTenantForFlags) return;
    setSavingFlags(true);
    try {
      await apiClient.put(`/saas/tenants/${selectedTenantForFlags.id}/features`, tenantFeatureFlags);
      toast.success('تم حفظ إعدادات الميزات');
      setFeatureFlagsDialogOpen(false);
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ في الحفظ');
    } finally {
      setSavingFlags(false);
    }
  };

  // ─────────────────── Bridge ───────────────────
  const openBridgeDialog = (tenant) => {
    setBridgeTenant(tenant);
    setBridgeForm({
      recharge_mode: tenant.recharge_mode || 'owner_bridge',
      self_bridge_url: tenant.self_bridge_url || '',
      self_bridge_api_key: tenant.self_bridge_api_key || '',
    });
    setBridgeDialogOpen(true);
  };

  const saveBridgeMode = async () => {
    if (!bridgeTenant) return;
    setBridgeSaving(true);
    try {
      await apiClient.put(`/saas/tenants/${bridgeTenant.id}/recharge-mode`, bridgeForm);
      toast.success('تم تحديث وضع الجسر');
      setBridgeDialogOpen(false);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطأ في الحفظ');
    } finally {
      setBridgeSaving(false);
    }
  };

  // ─────────────────── Render ───────────────────
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
      <div className="space-y-6 animate-fade-in" data-testid="saas-subscribers-page">
        <SaasPageHeader
          titleAr="المشتركين"
          subtitleAr="إدارة جميع المستأجرين، اشتراكاتهم، ومحافظهم"
          icon={Users}
          extra={
            <Button onClick={() => openTenantDialog()} data-testid="add-tenant-btn">
              <Plus className="h-4 w-4 me-2" />
              إضافة مشترك
            </Button>
          }
        />

        <Card>
          <CardContent className="p-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث بالاسم، البريد، أو الشركة…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
                data-testid="tenants-search-input"
              />
            </div>
          </CardContent>
        </Card>

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
              <TableBody data-testid="tenants-table">
                {filteredTenants.map(tenant => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <EntityCode uuid={tenant.id} type="tenant" testId={`tenant-code-${tenant.id}`} />
                    </TableCell>
                    <TableCell>
                      <div
                        className="cursor-pointer hover:text-primary transition-colors"
                        onClick={() => openImpersonateDialog(tenant)}
                        title="اضغط للدخول لحساب المشترك"
                        data-testid={`tenant-name-${tenant.id}`}
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
                      {tenant.is_trial && <Badge variant="secondary" className="mr-1">تجريبي</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-3 text-sm">
                        <span title="المنتجات">📦 {tenant.stats?.products || 0}</span>
                        <span title="المستخدمين">👥 {tenant.stats?.users || 0}</span>
                        <span title="المبيعات">🛒 {tenant.stats?.sales || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {tenant.is_active
                        ? <Badge className="bg-green-100 text-green-700">نشط</Badge>
                        : <Badge variant="destructive">معطل</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className={`text-sm ${isExpired(tenant.subscription_ends_at) ? 'text-red-600' : isExpiringSoon(tenant.subscription_ends_at) ? 'text-amber-600' : ''}`}>
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
                        <Button variant="ghost" size="sm" onClick={() => openExtendDialog(tenant)} title="تمديد" data-testid={`extend-open-${tenant.id}`}>
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openTenantDialog(tenant)} title="تعديل">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openBridgeDialog(tenant)} title="وضع جسر الشحن" data-testid={`bridge-btn-${tenant.id}`}>
                          {tenant.recharge_mode === 'self_bridge'
                            ? <Wifi className="h-4 w-4 text-blue-500" />
                            : <Server className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openFeatureFlagsDialog(tenant)} title="إعدادات الميزات" data-testid={`feature-flags-btn-${tenant.id}`}>
                          <Sliders className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleTenantStatus(tenant.id)} title={tenant.is_active ? 'تعطيل' : 'تفعيل'}>
                          {tenant.is_active ? <Ban className="h-4 w-4 text-amber-500" /> : <Check className="h-4 w-4 text-green-500" />}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteTenant(tenant.id)} title="حذف">
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

        {/* ── Tenant Form Dialog ── */}
        <Dialog open={tenantDialogOpen} onOpenChange={setTenantDialogOpen}>
          <DialogContent className="max-w-md" data-testid="tenant-form-dialog">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-lg">{editingTenant ? 'تعديل المشترك' : 'إضافة مشترك جديد'}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">الاسم</Label>
                <Input className="h-8 text-sm" value={tenantForm.name} onChange={e => setTenantForm({ ...tenantForm, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">البريد الإلكتروني</Label>
                <Input className="h-8 text-sm" type="email" value={tenantForm.email} onChange={e => setTenantForm({ ...tenantForm, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الهاتف</Label>
                <Input className="h-8 text-sm" value={tenantForm.phone} onChange={e => setTenantForm({ ...tenantForm, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">اسم الشركة</Label>
                <Input className="h-8 text-sm" value={tenantForm.company_name} onChange={e => setTenantForm({ ...tenantForm, company_name: e.target.value })} />
              </div>
              {!editingTenant && (
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">كلمة المرور</Label>
                  <div className="relative">
                    <Input className="h-8 text-sm pe-8" type={showPassword ? 'text' : 'password'} value={tenantForm.password} onChange={e => setTenantForm({ ...tenantForm, password: e.target.value })} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">التصنيف</Label>
                <Select value={tenantForm.business_type} onValueChange={v => setTenantForm({ ...tenantForm, business_type: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retailer">تاجر تجزئة</SelectItem>
                    <SelectItem value="wholesaler">تاجر جملة</SelectItem>
                    <SelectItem value="distributor">موزع</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الصلاحية</Label>
                <Select value={tenantForm.role} onValueChange={v => setTenantForm({ ...tenantForm, role: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
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
                <Select value={tenantForm.plan_id} onValueChange={v => setTenantForm({ ...tenantForm, plan_id: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع الاشتراك</Label>
                <Select value={tenantForm.subscription_type} onValueChange={v => setTenantForm({ ...tenantForm, subscription_type: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
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
              <Button size="sm" onClick={saveTenant} data-testid="save-tenant-btn">حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Extend Subscription Dialog ── */}
        <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
          <DialogContent data-testid="extend-dialog">
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
                  setExtendForm({ ...extendForm, subscription_type: v, amount: price || 0 });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري</SelectItem>
                    <SelectItem value="6months">6 أشهر</SelectItem>
                    <SelectItem value="yearly">سنوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المبلغ (دج)</Label>
                <Input type="number" value={extendForm.amount} onChange={e => setExtendForm({ ...extendForm, amount: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select value={extendForm.payment_method} onValueChange={v => setExtendForm({ ...extendForm, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">يدوي (نقدي/تحويل)</SelectItem>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>رقم المعاملة (اختياري)</Label>
                <Input value={extendForm.transaction_id} onChange={e => setExtendForm({ ...extendForm, transaction_id: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea value={extendForm.notes} onChange={e => setExtendForm({ ...extendForm, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExtendDialogOpen(false)}>إلغاء</Button>
              <Button onClick={extendSubscription} data-testid="extend-subscription-btn">تمديد الاشتراك</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Impersonate Dialog ── */}
        <Dialog open={impersonateDialogOpen} onOpenChange={setImpersonateDialogOpen}>
          <DialogContent className="max-w-md" data-testid="impersonate-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5 text-primary" />
                الدخول لحساب المشترك
              </DialogTitle>
              <DialogDescription>سيتم تسجيل دخولك كمشرف في حساب هذا المشترك</DialogDescription>
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
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setImpersonateDialogOpen(false)}>إلغاء</Button>
              <Button onClick={handleImpersonate} disabled={impersonateLoading || !impersonateTenant?.is_active} data-testid="impersonate-login-btn">
                {impersonateLoading ? <RefreshCw className="h-4 w-4 animate-spin ml-2" /> : <LogIn className="h-4 w-4 ml-2" />}
                {impersonateLoading ? 'جاري الدخول...' : 'دخول للحساب'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Wallet Charge Dialog ── */}
        <Dialog open={walletChargeDialogOpen} onOpenChange={setWalletChargeDialogOpen}>
          <DialogContent className="max-w-md" data-testid="wallet-charge-dialog">
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
                  </div>
                )}
                <div className="space-y-2">
                  <Label>المبلغ (دج) *</Label>
                  <Input type="number" min="1" placeholder="مثال: 5000" value={walletChargeForm.amount} onChange={e => setWalletChargeForm({ ...walletChargeForm, amount: e.target.value })} data-testid="wallet-charge-amount-input" />
                </div>
                <div className="space-y-2">
                  <Label>طريقة الدفع *</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setWalletChargeForm({ ...walletChargeForm, payment_method: 'cash' })} className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-sm transition ${walletChargeForm.payment_method === 'cash' ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'border-border hover:bg-muted/50'}`} data-testid="wallet-charge-method-cash">
                      <Banknote className={`h-5 w-5 ${walletChargeForm.payment_method === 'cash' ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                      <span className="font-medium">نقداً (Cash)</span>
                    </button>
                    <button type="button" onClick={() => setWalletChargeForm({ ...walletChargeForm, payment_method: 'credit' })} className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-sm transition ${walletChargeForm.payment_method === 'credit' ? 'border-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'border-border hover:bg-muted/50'}`} data-testid="wallet-charge-method-credit">
                      <CreditCard className={`h-5 w-5 ${walletChargeForm.payment_method === 'credit' ? 'text-amber-600' : 'text-muted-foreground'}`} />
                      <span className="font-medium">بالدين (Credit)</span>
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
                  <Textarea placeholder="سبب الشحن..." value={walletChargeForm.notes} onChange={e => setWalletChargeForm({ ...walletChargeForm, notes: e.target.value })} rows={2} data-testid="wallet-charge-notes-input" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setWalletChargeDialogOpen(false)}>إلغاء</Button>
              <Button onClick={handleWalletCharge} disabled={walletChargeLoading || !walletChargeForm.amount} className="bg-green-600 hover:bg-green-700" data-testid="wallet-charge-submit-btn">
                {walletChargeLoading
                  ? <><RefreshCw className="h-4 w-4 animate-spin me-2" />جاري الشحن...</>
                  : <><Wallet className="h-4 w-4 me-2" />شحن المحفظة</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Feature Flags Dialog ── */}
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
                  <div key={feature.key} className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-colors ${isEnabled ? (feature.optIn ? 'bg-amber-50 border-amber-300' : 'bg-green-50 border-green-200') : 'bg-muted/40 border-muted'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isEnabled ? (feature.optIn ? 'text-amber-800' : 'text-green-800') : 'text-muted-foreground'}`}>
                        {feature.labelAr}
                      </span>
                      {feature.optIn && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-semibold">
                          BETA
                        </span>
                      )}
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) => setTenantFeatureFlags(prev => ({ ...prev, [feature.key]: checked }))}
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

        {/* ── Bridge Dialog (simplified) ── */}
        <Dialog open={bridgeDialogOpen} onOpenChange={setBridgeDialogOpen}>
          <DialogContent className="max-w-md" data-testid="bridge-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                وضع جسر الشحن
              </DialogTitle>
              <DialogDescription>{bridgeTenant?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>الوضع</Label>
                <Select value={bridgeForm.recharge_mode} onValueChange={v => setBridgeForm({ ...bridgeForm, recharge_mode: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner_bridge">جسر المالك (مشترك)</SelectItem>
                    <SelectItem value="self_bridge">جسر خاص بالمشترك</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {bridgeForm.recharge_mode === 'self_bridge' && (
                <>
                  <div className="space-y-2">
                    <Label>رابط الـ Bridge</Label>
                    <Input value={bridgeForm.self_bridge_url} onChange={e => setBridgeForm({ ...bridgeForm, self_bridge_url: e.target.value })} placeholder="https://..." />
                  </div>
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input type="password" value={bridgeForm.self_bridge_api_key} onChange={e => setBridgeForm({ ...bridgeForm, self_bridge_api_key: e.target.value })} />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBridgeDialogOpen(false)}>إلغاء</Button>
              <Button onClick={saveBridgeMode} disabled={bridgeSaving} className="gap-2" data-testid="save-bridge-btn">
                {bridgeSaving && <RefreshCw className="h-4 w-4 animate-spin" />}
                حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
