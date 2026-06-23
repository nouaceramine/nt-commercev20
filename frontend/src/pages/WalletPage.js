import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { Wallet, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, DollarSign, TrendingUp, AlertTriangle, CreditCard, RefreshCw, CheckCircle2, XCircle, Settings, Package, ShoppingCart, Plus, Pencil, Trash2 } from 'lucide-react';

export default function WalletPage() {
  const { language } = useLanguage();
  const { isSuperAdmin } = useAuth();
  const isAr = language === 'ar';
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState({});
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [showReqDialog, setShowReqDialog] = useState(false);
  const [reqType, setReqType] = useState('topup');
  const [reqAmount, setReqAmount] = useState('');
  const [reqNote, setReqNote] = useState('');

  const [showSettings, setShowSettings] = useState(false);
  const [threshold, setThreshold] = useState('');

  const [services, setServices] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [svcForm, setSvcForm] = useState({ name_ar: '', name_fr: '', description: '', price: '', is_active: true });

  const fetchData = async () => {
    try {
      const [wRes, tRes, rRes] = await Promise.all([
        apiClient.get('/wallet'),
        apiClient.get('/wallet/transactions'),
        apiClient.get(isSuperAdmin ? '/wallet/requests?status=pending' : '/wallet/requests').catch(() => ({ data: [] })),
      ]);
      setWallet(wRes.data);
      setThreshold(String(wRes.data?.low_balance_threshold ?? ''));
      setTransactions(tRes.data);
      setRequests(rRes.data || []);
      try {
        const sRes = await apiClient.get('/wallet/stats');
        setStats(sRes.data);
      } catch {}
      try {
        const [svcRes, pRes] = await Promise.all([
          apiClient.get('/wallet/services'),
          apiClient.get('/wallet/services/purchases').catch(() => ({ data: [] })),
        ]);
        setServices(svcRes.data || []);
        setPurchases(pRes.data || []);
      } catch {}
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitRequest = async () => {
    const amount = parseFloat(reqAmount);
    if (!amount || amount <= 0) { toast.error(isAr ? 'أدخل مبلغاً صحيحاً' : 'Enter a valid amount'); return; }
    setBusy(true);
    try {
      if (isSuperAdmin && reqType === 'topup') {
        await apiClient.post('/wallet/add-funds', { entity_id: wallet?.entity_id, amount, description: reqNote || (isAr ? 'شحن المحفظة الرئيسية' : 'Main wallet funding') });
        toast.success(isAr ? 'تم شحن المحفظة الرئيسية' : 'Main wallet funded');
      } else {
        await apiClient.post('/wallet/requests', { request_type: reqType, amount, note: reqNote });
        toast.success(isAr ? 'تم إرسال الطلب، بانتظار موافقة المدير' : 'Request sent, awaiting approval');
      }
      setShowReqDialog(false); setReqAmount(''); setReqNote('');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || (isAr ? 'فشل إرسال الطلب' : 'Request failed'));
    } finally { setBusy(false); }
  };

  const handleApprove = async (id) => {
    setBusy(true);
    try {
      await apiClient.post(`/wallet/requests/${id}/approve`);
      toast.success(isAr ? 'تمت الموافقة' : 'Approved');
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || (isAr ? 'فشل' : 'Failed')); }
    finally { setBusy(false); }
  };

  const handleReject = async (id) => {
    setBusy(true);
    try {
      await apiClient.post(`/wallet/requests/${id}/reject`, {});
      toast.success(isAr ? 'تم الرفض' : 'Rejected');
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || (isAr ? 'فشل' : 'Failed')); }
    finally { setBusy(false); }
  };

  const paySubscription = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post('/wallet/pay-subscription');
      toast.success(`${isAr ? 'تم دفع الاشتراك' : 'Subscription paid'} (${res.data.amount?.toLocaleString()} DA)`);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || (isAr ? 'فشل الدفع' : 'Payment failed')); }
    finally { setBusy(false); }
  };

  const toggleAutoPay = async () => {
    setBusy(true);
    try {
      const res = await apiClient.put('/wallet/auto-pay', { enabled: !wallet?.auto_pay_subscription });
      setWallet(w => ({ ...w, auto_pay_subscription: res.data.auto_pay_subscription }));
      toast.success(isAr ? 'تم التحديث' : 'Updated');
    } catch (e) { toast.error(isAr ? 'فشل' : 'Failed'); }
    finally { setBusy(false); }
  };

  const saveThreshold = async () => {
    setBusy(true);
    try {
      await apiClient.put('/wallet/settings', { low_balance_threshold: parseFloat(threshold) || 0 });
      toast.success(isAr ? 'تم حفظ الإعدادات' : 'Settings saved');
      setShowSettings(false);
      fetchData();
    } catch (e) { toast.error(isAr ? 'فشل' : 'Failed'); }
    finally { setBusy(false); }
  };

  const buyService = async (svc) => {
    setBusy(true);
    try {
      const res = await apiClient.post(`/wallet/services/${svc.id}/purchase`);
      toast.success(`${isAr ? 'تم شراء الخدمة' : 'Service purchased'} — ${isAr ? 'الرصيد' : 'Balance'}: ${(res.data.new_balance ?? 0).toLocaleString()} DA`);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || (isAr ? 'فشل الشراء' : 'Purchase failed')); }
    finally { setBusy(false); }
  };

  const openNewService = () => {
    setEditingService(null);
    setSvcForm({ name_ar: '', name_fr: '', description: '', price: '', is_active: true });
    setShowServiceDialog(true);
  };

  const openEditService = (svc) => {
    setEditingService(svc);
    setSvcForm({ name_ar: svc.name_ar || '', name_fr: svc.name_fr || '', description: svc.description || '', price: String(svc.price ?? ''), is_active: svc.is_active !== false });
    setShowServiceDialog(true);
  };

  const saveService = async () => {
    const price = parseFloat(svcForm.price);
    if (!svcForm.name_ar.trim()) { toast.error(isAr ? 'أدخل اسم الخدمة' : 'Enter service name'); return; }
    if (!price || price <= 0) { toast.error(isAr ? 'أدخل سعراً صحيحاً' : 'Enter a valid price'); return; }
    setBusy(true);
    try {
      const payload = { ...svcForm, price };
      if (editingService) await apiClient.put(`/wallet/services/${editingService.id}`, payload);
      else await apiClient.post('/wallet/services', payload);
      toast.success(isAr ? 'تم الحفظ' : 'Saved');
      setShowServiceDialog(false);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || (isAr ? 'فشل الحفظ' : 'Save failed')); }
    finally { setBusy(false); }
  };

  const deleteService = async (svc) => {
    if (!window.confirm(isAr ? `حذف الخدمة "${svc.name_ar}"؟` : `Delete service "${svc.name_ar}"?`)) return;
    setBusy(true);
    try {
      await apiClient.delete(`/wallet/services/${svc.id}`);
      toast.success(isAr ? 'تم الحذف' : 'Deleted');
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || (isAr ? 'فشل الحذف' : 'Delete failed')); }
    finally { setBusy(false); }
  };

  const toggleServiceActive = async (svc) => {
    setBusy(true);
    try {
      await apiClient.put(`/wallet/services/${svc.id}`, { is_active: !(svc.is_active !== false) });
      fetchData();
    } catch (e) { toast.error(isAr ? 'فشل' : 'Failed'); }
    finally { setBusy(false); }
  };

  const txnIcon = (type) => type === 'credit' ? ArrowDownLeft : ArrowUpRight;
  const txnColor = (type) => type === 'credit' ? 'text-emerald-400' : 'text-red-400';
  const statusBadge = (s) => {
    const map = {
      pending: { v: 'secondary', t: isAr ? 'قيد الانتظار' : 'Pending' },
      approved: { v: 'default', t: isAr ? 'تمت الموافقة' : 'Approved' },
      rejected: { v: 'destructive', t: isAr ? 'مرفوض' : 'Rejected' },
    };
    const it = map[s] || map.pending;
    return <Badge variant={it.v}>{it.t}</Badge>;
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="wallet-page">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">{isAr ? 'المحفظة' : 'Portefeuille'}</h1>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowSettings(true)} data-testid="wallet-settings-btn">
            <Settings className="h-4 w-4" />{isAr ? 'إعدادات' : 'Settings'}
          </Button>
        </div>

        {/* Low balance alert */}
        {wallet?.low_balance && (
          <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 flex items-center gap-2 text-amber-300" data-testid="low-balance-alert">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm">{isAr ? `الرصيد منخفض (أقل من ${(wallet.low_balance_threshold || 0).toLocaleString()} دج). يُنصح بشحن المحفظة.` : `Low balance (below ${(wallet.low_balance_threshold || 0).toLocaleString()} DA). Consider topping up.`}</span>
          </div>
        )}

        {/* Wallet Balance */}
        {wallet && (
          <Card className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-blue-500/30">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Wallet className="w-12 h-12 text-blue-400" />
                  <div>
                    <p className="text-sm text-gray-300">{isAr ? 'الرصيد الحالي' : 'Solde actuel'}</p>
                    <p className="text-4xl font-bold text-white">{(wallet.balance || 0).toLocaleString()} <span className="text-lg text-gray-400">{wallet.currency || 'DZD'}</span></p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setReqType('topup'); setShowReqDialog(true); }} data-testid="topup-btn">
                    <ArrowDownLeft className="h-4 w-4" />{isSuperAdmin ? (isAr ? 'شحن المحفظة الرئيسية' : 'Fund main wallet') : (isAr ? 'شحن المحفظة' : 'Top up')}
                  </Button>
                  {!isSuperAdmin && (
                    <Button variant="outline" className="gap-2" onClick={() => { setReqType('withdraw'); setShowReqDialog(true); }} data-testid="withdraw-btn">
                      <ArrowUpRight className="h-4 w-4" />{isAr ? 'سحب رصيد' : 'Withdraw'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Subscription auto-pay (tenants) */}
              {!isSuperAdmin && (
                <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <CreditCard className="h-4 w-4 text-blue-400" />
                    {isAr ? 'دفع اشتراك المنصة من رصيد المحفظة' : 'Pay platform subscription from wallet'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="gap-2" onClick={paySubscription} disabled={busy} data-testid="pay-subscription-btn">
                      <CreditCard className="h-4 w-4" />{isAr ? 'دفع الاشتراك الآن' : 'Pay now'}
                    </Button>
                    <Button size="sm" variant={wallet.auto_pay_subscription ? 'default' : 'outline'} className="gap-2" onClick={toggleAutoPay} disabled={busy} data-testid="autopay-toggle">
                      {wallet.auto_pay_subscription ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {isAr ? 'الدفع التلقائي' : 'Auto-pay'}: {wallet.auto_pay_subscription ? (isAr ? 'مُفعّل' : 'On') : (isAr ? 'معطّل' : 'Off')}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats (Super Admin) */}
        {stats.total_wallets > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: isAr ? 'إجمالي المحافظ' : 'Total wallets', value: stats.total_wallets, icon: Wallet, color: 'text-blue-400' },
              { label: isAr ? 'الرصيد الكلي' : 'Solde total', value: `${(stats.total_balance || 0).toLocaleString()} DA`, icon: DollarSign, color: 'text-emerald-400' },
              { label: isAr ? 'المعاملات' : 'Transactions', value: stats.total_transactions || 0, icon: TrendingUp, color: 'text-purple-400' },
              { label: isAr ? 'التحويلات' : 'Transferts', value: stats.total_transfers || 0, icon: ArrowLeftRight, color: 'text-amber-400' },
            ].map((s, i) => (
              <Card key={`item-${i}`} className="bg-gray-800/50 border-gray-700"><CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`w-8 h-8 ${s.color}`} />
                <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-white">{s.value}</p></div>
              </CardContent></Card>
            ))}
          </div>
        )}

        {/* Requests: approval queue (super admin) or my requests (tenant) */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isSuperAdmin ? (isAr ? 'طلبات الشحن/السحب المعلّقة' : 'Pending top-up/withdraw requests') : (isAr ? 'طلباتي' : 'My requests')}
          </h2>
          <div className="space-y-2">
            {requests.length === 0 ? (
              <p className="text-gray-400 text-center py-6">{isAr ? 'لا توجد طلبات' : 'No requests'}</p>
            ) : requests.map(r => (
              <Card key={r.id} className="bg-gray-800/50 border-gray-700" data-testid={`req-${r.id}`}>
                <CardContent className="p-3 flex flex-wrap justify-between items-center gap-3">
                  <div className="flex items-center gap-3">
                    {r.request_type === 'topup' ? <ArrowDownLeft className="w-5 h-5 text-emerald-400" /> : <ArrowUpRight className="w-5 h-5 text-red-400" />}
                    <div>
                      <p className="text-white text-sm font-medium">
                        {r.request_type === 'topup' ? (isAr ? 'شحن' : 'Top-up') : (isAr ? 'سحب' : 'Withdraw')} — {r.amount?.toLocaleString()} DA
                        {isSuperAdmin && r.entity_name ? ` • ${r.entity_name}` : ''}
                      </p>
                      <p className="text-xs text-gray-500">{r.note || ''} {new Date(r.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(r.status)}
                    {isSuperAdmin && r.status === 'pending' && (
                      <>
                        <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(r.id)} disabled={busy} data-testid={`approve-${r.id}`}>
                          <CheckCircle2 className="h-4 w-4" />{isAr ? 'موافقة' : 'Approve'}
                        </Button>
                        <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleReject(r.id)} disabled={busy} data-testid={`reject-${r.id}`}>
                          <XCircle className="h-4 w-4" />{isAr ? 'رفض' : 'Reject'}
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Services Catalog */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-400" />
              {isAr ? 'الخدمات المدفوعة' : 'Services payants'}
            </h2>
            {isSuperAdmin && (
              <Button size="sm" className="gap-2" onClick={openNewService} data-testid="add-service-btn">
                <Plus className="h-4 w-4" />{isAr ? 'إضافة خدمة' : 'Add service'}
              </Button>
            )}
          </div>
          {services.length === 0 ? (
            <p className="text-gray-400 text-center py-6">{isAr ? 'لا توجد خدمات متاحة حالياً' : 'No services available'}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map(svc => (
                <Card key={svc.id} className="bg-gray-800/50 border-gray-700" data-testid={`service-${svc.id}`}>
                  <CardContent className="p-4 flex flex-col h-full">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-white font-medium">{svc.name_ar}</p>
                        {svc.name_fr && <p className="text-xs text-gray-500">{svc.name_fr}</p>}
                      </div>
                      {isSuperAdmin && (svc.is_active === false
                        ? <Badge variant="secondary">{isAr ? 'معطّلة' : 'Off'}</Badge>
                        : <Badge variant="default">{isAr ? 'مفعّلة' : 'On'}</Badge>)}
                    </div>
                    {svc.description && <p className="text-sm text-gray-400 mt-1 flex-1">{svc.description}</p>}
                    <p className="text-2xl font-bold text-emerald-400 mt-3">{(svc.price || 0).toLocaleString()} <span className="text-sm text-gray-400">{svc.currency || 'DZD'}</span></p>
                    {isSuperAdmin ? (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" className="gap-1 flex-1" onClick={() => openEditService(svc)} data-testid={`edit-service-${svc.id}`}>
                          <Pencil className="h-3.5 w-3.5" />{isAr ? 'تعديل' : 'Edit'}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => toggleServiceActive(svc)} disabled={busy}>
                          {svc.is_active === false ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="destructive" className="gap-1" onClick={() => deleteService(svc)} disabled={busy} data-testid={`delete-service-${svc.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button className="gap-2 mt-3 bg-blue-600 hover:bg-blue-700" onClick={() => buyService(svc)} disabled={busy} data-testid={`buy-service-${svc.id}`}>
                        <ShoppingCart className="h-4 w-4" />{isAr ? 'شراء من الرصيد' : 'Buy with balance'}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Service purchase history (tenant) */}
        {!isSuperAdmin && purchases.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">{isAr ? 'خدماتي المشتراة' : 'Mes services achetés'}</h2>
            <div className="space-y-2">
              {purchases.map(p => (
                <Card key={p.id} className="bg-gray-800/50 border-gray-700" data-testid={`purchase-${p.id}`}>
                  <CardContent className="p-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-blue-400" />
                      <div>
                        <p className="text-white text-sm">{p.service_name}</p>
                        <p className="text-xs text-gray-500">{new Date(p.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <span className="font-bold text-red-400">-{(p.amount || 0).toLocaleString()} {p.currency || 'DA'}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Transfers ledger shortcut (super-admin) */}
        {isSuperAdmin && (
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{isAr ? 'سجل مبيعات الرصيد' : 'Balance Sales Ledger'}</h2>
            <a href="/services/transfers">
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeftRight className="h-4 w-4" />
                {isAr ? 'عرض كل التحويلات' : 'View All Transfers'}
              </Button>
            </a>
          </div>
        )}

        {/* Transactions */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">{isAr ? 'سجل المعاملات' : 'Historique'}</h2>
          <div className="space-y-2">
            {loading ? <p className="text-gray-400 text-center py-8">{isAr ? 'جاري التحميل...' : 'Chargement...'}</p> :
             transactions.length === 0 ? <p className="text-gray-400 text-center py-8">{isAr ? 'لا توجد معاملات' : 'Aucune transaction'}</p> :
             transactions.map(t => {
               const Icon = txnIcon(t.transaction_type);
               return (
                <Card key={t.id} className="bg-gray-800/50 border-gray-700" data-testid={`txn-${t.id}`}>
                  <CardContent className="p-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 ${txnColor(t.transaction_type)}`} />
                      <div>
                        <p className="text-white text-sm">{t.description || t.reference_type}</p>
                        <p className="text-xs text-gray-500">{new Date(t.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <span className={`font-bold ${txnColor(t.transaction_type)}`}>
                      {t.transaction_type === 'credit' ? '+' : '-'}{t.amount?.toLocaleString()} DA
                    </span>
                  </CardContent>
                </Card>
               );
             })}
          </div>
        </div>

        {/* Request Dialog */}
        <Dialog open={showReqDialog} onOpenChange={setShowReqDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{isSuperAdmin && reqType === 'topup' ? (isAr ? 'شحن المحفظة الرئيسية' : 'Fund main wallet') : reqType === 'topup' ? (isAr ? 'طلب شحن رصيد' : 'Top-up request') : (isAr ? 'طلب سحب رصيد' : 'Withdraw request')}</DialogTitle>
              <DialogDescription>{isSuperAdmin && reqType === 'topup' ? (isAr ? 'سيتم إضافة الرصيد مباشرةً إلى المحفظة الرئيسية لبيعه للموزّعين والمستأجرين.' : 'Balance will be added directly to the main wallet to sell to distributors and tenants.') : (isAr ? 'سيتم إرسال الطلب إلى المدير العام للموافقة عليه.' : 'The request will be sent to the platform admin for approval.')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">{isAr ? 'المبلغ (دج)' : 'Amount (DA)'}</label>
                <input type="number" min="0" value={reqAmount} onChange={e => setReqAmount(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white" data-testid="req-amount" />
              </div>
              <div>
                <label className="text-sm font-medium">{isAr ? 'ملاحظة (اختياري)' : 'Note (optional)'}</label>
                <input type="text" value={reqNote} onChange={e => setReqNote(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowReqDialog(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
                <Button className="flex-1 gap-2" onClick={submitRequest} disabled={busy} data-testid="submit-request-btn">
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{isAr ? 'إرسال الطلب' : 'Send request'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Service create/edit Dialog (super admin) */}
        <Dialog open={showServiceDialog} onOpenChange={setShowServiceDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingService ? (isAr ? 'تعديل خدمة' : 'Edit service') : (isAr ? 'إضافة خدمة' : 'Add service')}</DialogTitle>
              <DialogDescription>{isAr ? 'يدفع المستخدمون ثمن هذه الخدمة من رصيد محفظتهم.' : 'Users pay for this service from their wallet balance.'}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">{isAr ? 'اسم الخدمة (عربي)' : 'Service name (Arabic)'}</label>
                <input type="text" value={svcForm.name_ar} onChange={e => setSvcForm(f => ({ ...f, name_ar: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white" data-testid="svc-name-ar" />
              </div>
              <div>
                <label className="text-sm font-medium">{isAr ? 'الاسم (فرنسي - اختياري)' : 'Name (French - optional)'}</label>
                <input type="text" value={svcForm.name_fr} onChange={e => setSvcForm(f => ({ ...f, name_fr: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-sm font-medium">{isAr ? 'الوصف (اختياري)' : 'Description (optional)'}</label>
                <input type="text" value={svcForm.description} onChange={e => setSvcForm(f => ({ ...f, description: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-sm font-medium">{isAr ? 'السعر (دج)' : 'Price (DA)'}</label>
                <input type="number" min="0" value={svcForm.price} onChange={e => setSvcForm(f => ({ ...f, price: e.target.value }))} className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white" data-testid="svc-price" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={svcForm.is_active} onChange={e => setSvcForm(f => ({ ...f, is_active: e.target.checked }))} />
                {isAr ? 'متاحة للمستخدمين' : 'Available to users'}
              </label>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowServiceDialog(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
                <Button className="flex-1 gap-2" onClick={saveService} disabled={busy} data-testid="save-service-btn">
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{isAr ? 'حفظ' : 'Save'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{isAr ? 'إعدادات المحفظة' : 'Wallet settings'}</DialogTitle>
              <DialogDescription>{isAr ? 'حدّد الحد الأدنى للرصيد لتلقّي تنبيه عند انخفاضه.' : 'Set the low-balance threshold for alerts.'}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-sm font-medium">{isAr ? 'حد التنبيه عند انخفاض الرصيد (دج)' : 'Low-balance alert threshold (DA)'}</label>
                <input type="number" min="0" value={threshold} onChange={e => setThreshold(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white" data-testid="threshold-input" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowSettings(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
                <Button className="flex-1 gap-2" onClick={saveThreshold} disabled={busy} data-testid="save-settings-btn">
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{isAr ? 'حفظ' : 'Save'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
