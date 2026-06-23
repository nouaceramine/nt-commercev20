import { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import {
  Smartphone, Copy, TrendingUp, Clock, Wallet, CheckCircle,
  Wifi, Activity, RefreshCw, Shield, Eye, EyeOff, AlertCircle,
  Loader2, CheckCircle2, XCircle, Hourglass, CreditCard,
} from 'lucide-react';

const OPERATOR_STYLES = {
  mobilis: { color: 'bg-green-500', ring: 'ring-green-500', name: 'موبيليس', nameEn: 'Mobilis' },
  djezzy: { color: 'bg-red-500', ring: 'ring-red-500', name: 'جازي', nameEn: 'Djezzy' },
  ooredoo: { color: 'bg-orange-500', ring: 'ring-orange-500', name: 'أوريدو', nameEn: 'Ooredoo' },
  idoom: { color: 'bg-blue-500', ring: 'ring-blue-500', name: 'إيدوم', nameEn: 'Idoom' },
};

const STATUS_BADGE = {
  pending:   { label: 'في الانتظار', labelFr: 'En attente', variant: 'secondary', icon: Hourglass, cls: 'text-amber-600 bg-amber-50 border-amber-200' },
  completed: { label: 'مكتمل', labelFr: 'Complété', variant: 'default', icon: CheckCircle2, cls: 'text-green-600 bg-green-50 border-green-200' },
  success:   { label: 'مكتمل', labelFr: 'Complété', variant: 'default', icon: CheckCircle2, cls: 'text-green-600 bg-green-50 border-green-200' },
  failed:    { label: 'فاشل', labelFr: 'Échoué', variant: 'destructive', icon: XCircle, cls: 'text-red-600 bg-red-50 border-red-200' },
};

const TABS = ['pos', 'bridge', 'history'];

export default function RechargePage() {
  const { t, language } = useLanguage();
  const { isAdmin } = useAuth();
  const ar = language === 'ar';

  const [tab, setTab] = useState('pos');
  const [config, setConfig] = useState({});
  const [recharges, setRecharges] = useState([]);
  const [stats, setStats] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);

  const [form, setForm] = useState({
    operator: '', phone_number: '', amount: '', recharge_type: 'credit',
    customer_id: '', payment_method: 'cash', notes: '',
  });

  const [lastRecharge, setLastRecharge] = useState(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef(null);

  // Bridge state
  const [bridgeInfo, setBridgeInfo] = useState(null);
  const [pendingTasks, setPendingTasks] = useState([]);
  const [simSlots, setSimSlots] = useState([]);
  const [bridgeSecret, setBridgeSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [savingSecret, setSavingSecret] = useState(false);
  const [bridgeLoading, setBridgeLoading] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const bridgeRefreshRef = useRef(null);
  const balCheckRef      = useRef(null);
  const prevSlotsRef     = useRef({});

  const fetchData = useCallback(async () => {
    try {
      const [cfgRes, rechRes, stRes, custRes, walletRes] = await Promise.all([
        apiClient.get('/recharge/config'),
        apiClient.get('/recharge'),
        apiClient.get('/recharge/stats').catch(() => ({ data: null })),
        apiClient.get('/customers').catch(() => ({ data: [] })),
        apiClient.get('/wallet').catch(() => ({ data: null })),
      ]);
      setConfig(cfgRes.data || {});
      setRecharges(rechRes.data || []);
      setStats(stRes.data);
      const c = custRes.data;
      setCustomers(Array.isArray(c) ? c : (c?.items || []));
      if (walletRes.data) setWalletBalance(walletRes.data.balance ?? 0);
    } catch (err) {
      toast.error(ar ? 'خطأ في تحميل البيانات' : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [ar]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll recharge status after submit
  const startPolling = useCallback((rechargeId) => {
    setPolling(true);
    let attempts = 0;
    const MAX = 20;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await apiClient.get(`/recharges/${rechargeId}/status`);
        const { status, result_message } = res.data;
        if (status !== 'pending') {
          clearInterval(pollRef.current);
          setPolling(false);
          setLastRecharge((prev) => prev ? { ...prev, status, result_message } : prev);
          if (status === 'completed' || status === 'success') toast.success(ar ? 'تم إرسال الشحن بنجاح ✓' : 'Recharge envoyée ✓');
          else toast.error(result_message || (ar ? 'فشل الشحن' : 'Échec'));
          fetchData();
        }
      } catch {
        // ignore poll errors
      }
      if (attempts >= MAX) {
        clearInterval(pollRef.current);
        setPolling(false);
        fetchData();
      }
    }, 3000);
  }, [ar, fetchData]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.operator || !form.phone_number || !form.amount) {
      toast.error(ar ? 'يرجى ملء جميع الحقول المطلوبة' : 'Veuillez remplir les champs obligatoires');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post('/recharge', {
        ...form,
        amount: parseFloat(form.amount),
        customer_id: form.customer_id || null,
      });
      const data = res.data;
      setLastRecharge(data);
      toast.success(ar ? 'تم إنشاء طلب الشحن — في انتظار الجسر' : 'Demande créée — en attente du bridge');
      setForm({ operator: '', phone_number: '', amount: '', recharge_type: 'credit', customer_id: '', payment_method: 'cash', notes: '' });
      fetchData();
      startPolling(data.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'خطأ في الشحن' : 'Erreur'));
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = (txt) => { navigator.clipboard?.writeText(txt); toast.success(ar ? 'تم النسخ' : 'Copié'); };

  // Bridge tab — silent refresh (no loading spinner on interval ticks)
  // Lightweight ping — works for all tenant users (not admin-only).
  // Keeps bridgeInfo populated while on the POS tab so the offline banner shows.
  const pingBridgeStatus = useCallback(async () => {
    try {
      const res = await apiClient.get('/recharge/bridge/ping');
      setBridgeInfo((prev) => ({ ...(prev || {}), ...res.data }));
    } catch {
      // silent — no banner if ping fails (network issue, not bridge issue)
    }
  }, []);

  const refreshBridgeStatus = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [infoRes, slotsRes, tasksRes] = await Promise.all([
        apiClient.get('/recharge/bridge/last-seen'),
        apiClient.get('/sim/slots'),
        apiClient.get('/recharge'),
      ]);
      setBridgeInfo(infoRes.data);
      setSimSlots(slotsRes.data || []);
      setPendingTasks((tasksRes.data || []).filter((r) => r.status === 'pending').slice(0, 20));
    } catch {
      // handled silently
    }
  }, [isAdmin]);

  const loadBridge = useCallback(async () => {
    if (!isAdmin) return;
    setBridgeLoading(true);
    try {
      const [infoRes, secRes, slotsRes, tasksRes] = await Promise.all([
        apiClient.get('/recharge/bridge/last-seen'),
        apiClient.get('/recharge/bridge/secret'),
        apiClient.get('/sim/slots'),
        apiClient.get('/recharge'),
      ]);
      setBridgeInfo(infoRes.data);
      setBridgeSecret(secRes.data?.secret || '');
      setSecretInput(secRes.data?.secret || '');
      setSimSlots(slotsRes.data || []);
      setPendingTasks((tasksRes.data || []).filter((r) => r.status === 'pending').slice(0, 20));
    } catch {
      // handled
    } finally {
      setBridgeLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (tab === 'bridge') {
      loadBridge();
      bridgeRefreshRef.current = setInterval(refreshBridgeStatus, 10000);
    } else if (tab === 'pos') {
      // Ping bridge status for all users (including non-admins) so the offline
      // warning banner is visible in POS regardless of role.
      pingBridgeStatus();
      bridgeRefreshRef.current = setInterval(pingBridgeStatus, 10000);
    } else {
      clearInterval(bridgeRefreshRef.current);
    }
    return () => clearInterval(bridgeRefreshRef.current);
  }, [tab, loadBridge, refreshBridgeStatus, pingBridgeStatus]);

  // On-demand SIM balance refresh — POST flag then poll slots until last_updated changes
  const triggerBalanceCheck = useCallback(async () => {
    if (checkingBalance) return;
    setCheckingBalance(true);

    // Snapshot current last_updated values so we can detect changes
    prevSlotsRef.current = {};
    simSlots.forEach((s) => { prevSlotsRef.current[s.slot_id] = s.last_updated; });

    try {
      await apiClient.post('/recharge/bridge/check-balances');
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل إرسال الطلب' : 'Échec de la requête'));
      setCheckingBalance(false);
      return;
    }

    // Poll /sim/slots every 2s for up to 30s until a slot's last_updated changes
    const TIMEOUT_MS = 30_000;
    const start = Date.now();
    clearInterval(balCheckRef.current);
    balCheckRef.current = setInterval(async () => {
      if (Date.now() - start > TIMEOUT_MS) {
        clearInterval(balCheckRef.current);
        setCheckingBalance(false);
        toast.warning(ar
          ? '⏱ لم يتوصّل الجسر بعد — ربما غير متصل أو لا توجد مودمات مُعرَّفة'
          : '⏱ Le bridge n\'a pas répondu — vérifiez la connexion');
        return;
      }
      try {
        const res = await apiClient.get('/sim/slots');
        const updated = (res.data || []);
        const changed = updated.some(
          (s) => s.last_updated && s.last_updated !== prevSlotsRef.current[s.slot_id]
        );
        if (changed) {
          clearInterval(balCheckRef.current);
          setSimSlots(updated);
          setCheckingBalance(false);
          toast.success(ar ? '✅ تم تحديث أرصدة الشرائح' : '✅ Soldes mis à jour');
        }
      } catch {
        // silent — keep polling
      }
    }, 2000);
  }, [checkingBalance, simSlots, ar]);

  const saveSecret = async () => {
    setSavingSecret(true);
    try {
      await apiClient.put('/recharge/bridge/secret', { secret: secretInput });
      setBridgeSecret(secretInput);
      toast.success(ar ? 'تم حفظ الـ secret' : 'Secret sauvegardé');
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل الحفظ' : 'Échec'));
    } finally {
      setSavingSecret(false);
    }
  };

  const bridgeOnline = bridgeInfo?.last_seen
    ? (Date.now() - new Date(bridgeInfo.last_seen).getTime()) < 60 * 1000
    : false;

  const selectedOperator = config[form.operator];

  const fmtDate = (s) => s ? new Date(s).toLocaleString(ar ? 'ar-DZ' : 'fr-DZ') : '—';

  // --- TAB LABELS ---
  const tabLabels = {
    pos:     { ar: 'نقطة شحن', fr: 'Point de vente' },
    bridge:  { ar: 'الجسر', fr: 'Bridge' },
    history: { ar: 'السجل', fr: 'Historique' },
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Smartphone className="h-7 w-7 text-primary" />
              {ar ? 'شحن رصيد الجوال' : 'Recharge mobile'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {ar ? 'تعبئة رصيد الهاتف المحمول عبر الجسر المحلي' : 'Recharge via bridge local'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {ar ? 'تحديث' : 'Actualiser'}
          </Button>
        </div>

        {/* Wallet Balance Banner */}
        {walletBalance !== null && (
          <Card className={`border-2 ${walletBalance <= 0 ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : 'border-teal-300 bg-teal-50 dark:bg-teal-950/20'}`}>
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${walletBalance <= 0 ? 'bg-red-100' : 'bg-teal-100'}`}>
                  <Wallet className={`h-6 w-6 ${walletBalance <= 0 ? 'text-red-600' : 'text-teal-600'}`} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium">{ar ? 'رصيد المحفظة المتاح للشحن' : 'Solde disponible pour recharge'}</div>
                  <div className={`text-2xl font-bold ${walletBalance <= 0 ? 'text-red-600' : 'text-teal-700'}`}>
                    {walletBalance.toLocaleString('ar-DZ')} دج
                  </div>
                </div>
              </div>
              {walletBalance <= 0 && (
                <div className="flex items-center gap-1 text-red-600 text-sm font-medium">
                  <AlertCircle className="h-4 w-4" />
                  {ar ? 'الرصيد غير كافٍ' : 'Solde insuffisant'}
                </div>
              )}
              {walletBalance > 0 && walletBalance < 500 && (
                <div className="flex items-center gap-1 text-amber-600 text-sm font-medium">
                  <AlertCircle className="h-4 w-4" />
                  {ar ? 'رصيد منخفض' : 'Solde faible'}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: ar ? 'اليوم' : "Aujourd'hui", value: stats.today?.count ?? 0, icon: Clock, cls: 'text-blue-600' },
              { label: ar ? 'إجمالي اليوم' : 'Total jour', value: `${(stats.today?.total_amount ?? 0).toLocaleString()} دج`, icon: Wallet, cls: 'text-green-600' },
              { label: ar ? 'أرباح اليوم' : 'Profits', value: `${(stats.today?.total_profit ?? 0).toLocaleString()} دج`, icon: TrendingUp, cls: 'text-emerald-600' },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                    <div className="text-lg font-bold">{c.value}</div>
                  </div>
                  <c.icon className={`h-7 w-7 ${c.cls} opacity-70`} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {TABS.filter((t) => t !== 'bridge' || isAdmin).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {ar ? tabLabels[key].ar : tabLabels[key].fr}
            </button>
          ))}
        </div>

        {/* ===================== TAB: POS ===================== */}
        {tab === 'pos' && !loading && (
          <>
            {/* Bridge offline warning banner */}
            {bridgeInfo !== null && !bridgeOnline && (
              <div className="flex items-center gap-3 px-4 py-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-500" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {ar ? 'الجسر غير متصل' : 'Bridge hors ligne'}
                  </p>
                  <p className="text-xs mt-0.5 text-amber-700">
                    {ar
                      ? 'لن تُنفَّذ عمليات الشحن تلقائياً حتى يعود الجسر إلى الاتصال. يمكنك إرسال الطلب وسيُنفَّذ فور عودة الاتصال.'
                      : 'Les rechargements ne seront pas exécutés automatiquement tant que le bridge est hors ligne. Vous pouvez soumettre la demande — elle sera traitée dès le retour du bridge.'}
                  </p>
                </div>
              </div>
            )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Smartphone className="h-5 w-5" />
                  {ar ? 'طلب شحن جديد' : 'Nouveau rechargement'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label className="mb-1 block">{ar ? 'المشغّل *' : 'Opérateur *'}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(config).map(([key, op]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, operator: key, amount: '' }))}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            form.operator === key
                              ? 'border-primary bg-primary/10'
                              : 'border-muted hover:border-primary/40'
                          }`}
                        >
                          <div className={`w-3 h-3 rounded-full ${OPERATOR_STYLES[key]?.color || 'bg-gray-400'} mx-auto mb-1`} />
                          <p className="text-xs font-medium leading-tight">
                            {ar ? op.name : op.name_en}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label>{ar ? 'رقم الهاتف *' : 'Numéro *'}</Label>
                    <Input
                      type="tel"
                      dir="ltr"
                      value={form.phone_number}
                      onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                      placeholder="0X XX XX XX XX"
                      className="mt-1 tracking-wider"
                    />
                  </div>

                  <div>
                    <Label>{ar ? 'نوع الشحن' : 'Type'}</Label>
                    <Select value={form.recharge_type} onValueChange={(v) => setForm((f) => ({ ...f, recharge_type: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credit">{ar ? 'رصيد' : 'Crédit'}</SelectItem>
                        <SelectItem value="internet">{ar ? 'إنترنت' : 'Internet'}</SelectItem>
                        {form.operator === 'djezzy' && <SelectItem value="flexy">Flexy</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedOperator && (
                    <div>
                      <Label>{ar ? 'المبلغ *' : 'Montant *'}</Label>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        {selectedOperator.amounts?.map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, amount: amt.toString() }))}
                            className={`py-2 rounded-lg border text-sm transition-all ${
                              form.amount === amt.toString()
                                ? 'border-primary bg-primary text-primary-foreground font-bold'
                                : 'border-muted hover:border-primary/50'
                            }`}
                          >
                            {amt.toLocaleString()}
                          </button>
                        ))}
                      </div>
                      <Input
                        type="number"
                        value={form.amount}
                        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                        placeholder={ar ? 'مبلغ آخر' : 'Autre montant'}
                        className="mt-2"
                      />
                    </div>
                  )}

                  <div>
                    <Label>{ar ? 'الزبون' : 'Client'}</Label>
                    <Select
                      value={form.customer_id || '__none'}
                      onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v === '__none' ? '' : v }))}
                    >
                      <SelectTrigger className="mt-1"><SelectValue placeholder={ar ? 'زبون نقدي' : 'Client cash'} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">{ar ? 'زبون نقدي' : 'Cash'}</SelectItem>
                        {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>{ar ? 'طريقة الدفع' : 'Paiement'}</Label>
                    <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">{ar ? 'نقداً' : 'Espèces'}</SelectItem>
                        <SelectItem value="bank">{ar ? 'بنك' : 'Banque'}</SelectItem>
                        <SelectItem value="wallet">{ar ? 'محفظة' : 'Portefeuille'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button type="submit" className="w-full gap-2" disabled={submitting || polling}>
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'جاري الإرسال...' : 'Envoi...'}</>
                    ) : polling ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'في انتظار الجسر...' : 'Attente bridge...'}</>
                    ) : (
                      <><Smartphone className="h-4 w-4" /> {ar ? 'إرسال الشحن' : 'Envoyer la recharge'}</>
                    )}
                  </Button>
                </form>

                {/* Last recharge status */}
                {lastRecharge && (
                  <div className={`mt-4 p-4 rounded-lg border ${
                    ['completed','success'].includes(lastRecharge.status) ? 'bg-green-50 border-green-200 dark:bg-green-900/20' :
                    lastRecharge.status === 'failed' ? 'bg-red-50 border-red-200 dark:bg-red-900/20' :
                    'bg-amber-50 border-amber-200 dark:bg-amber-900/20'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {ar ? 'آخر عملية شحن' : 'Dernière recharge'}
                        </p>
                        <div className="flex items-center gap-2">
                          {polling && <Loader2 className="h-4 w-4 animate-spin text-amber-600" />}
                          <span className={`text-sm font-semibold ${
                            ['completed','success'].includes(lastRecharge.status) ? 'text-green-700' :
                            lastRecharge.status === 'failed' ? 'text-red-700' : 'text-amber-700'
                          }`}>
                            {['completed','success'].includes(lastRecharge.status) ? (ar ? '✓ أُرسل بنجاح' : '✓ Envoyé') :
                             lastRecharge.status === 'failed' ? (ar ? '✗ فشل الإرسال' : '✗ Échec') :
                             (ar ? '⏳ في انتظار الجسر...' : '⏳ En attente...')}
                          </span>
                        </div>
                        {lastRecharge.ussd_code && (
                          <div className="mt-1 flex items-center gap-2">
                            <code className="text-sm font-mono">{lastRecharge.ussd_code}</code>
                            <button onClick={() => copyText(lastRecharge.ussd_code)} className="text-muted-foreground hover:text-foreground">
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {lastRecharge.result_message && (
                          <p className="text-xs text-muted-foreground mt-1">{lastRecharge.result_message}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick history */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">{ar ? 'آخر 10 عمليات' : '10 dernières opérations'}</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{ar ? 'المشغّل' : 'Op.'}</TableHead>
                      <TableHead>{ar ? 'الهاتف' : 'Tel'}</TableHead>
                      <TableHead>{ar ? 'المبلغ' : 'Montant'}</TableHead>
                      <TableHead>{ar ? 'الحالة' : 'Statut'}</TableHead>
                      <TableHead>USSD</TableHead>
                      <TableHead>{ar ? 'الربح' : 'Profit'}</TableHead>
                      <TableHead>{ar ? 'التاريخ' : 'Date'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recharges.slice(0, 10).map((r) => {
                      const s = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                      const Icon = s.icon;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <div className={`w-2 h-2 rounded-full ${OPERATOR_STYLES[r.operator]?.color || 'bg-gray-400'}`} />
                              <span className="text-sm">{ar ? OPERATOR_STYLES[r.operator]?.name : OPERATOR_STYLES[r.operator]?.nameEn}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{r.phone_number}</TableCell>
                          <TableCell className="font-medium">{r.amount?.toLocaleString()} دج</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${s.cls}`}>
                              <Icon className="h-3 w-3" />
                              {ar ? s.label : s.labelFr}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <code className="text-xs bg-muted px-1 rounded">{r.ussd_code}</code>
                              <button onClick={() => copyText(r.ussd_code)} className="text-muted-foreground hover:text-foreground">
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell className="text-green-600 text-sm">+{r.profit?.toLocaleString() || 0} دج</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{fmtDate(r.created_at)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {recharges.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          <Wifi className="h-10 w-10 mx-auto mb-2 opacity-30" />
                          {ar ? 'لا توجد عمليات بعد' : 'Aucune opération'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          </>
        )}

        {/* ===================== TAB: BRIDGE ===================== */}
        {tab === 'bridge' && isAdmin && (
          <div className="space-y-4">
            {bridgeLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Status Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card className="md:col-span-1">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${bridgeOnline ? 'bg-green-100' : 'bg-red-100'}`}>
                          <Activity className={`h-6 w-6 ${bridgeOnline ? 'text-green-600' : 'text-red-500'}`} />
                        </div>
                        <div>
                          <p className="font-semibold">
                            {bridgeOnline ? (ar ? 'الجسر متصل' : 'Bridge en ligne') : (ar ? 'الجسر غير متصل' : 'Bridge hors ligne')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {bridgeInfo?.last_seen
                              ? `${ar ? 'آخر نبضة:' : 'Dernier signal:'} ${fmtDate(bridgeInfo.last_seen)}`
                              : (ar ? 'لم يتصل بعد' : 'Jamais connecté')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="md:col-span-1">
                    <CardContent className="p-5 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                        <Hourglass className="h-6 w-6 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-semibold">{bridgeInfo?.pending_tasks ?? 0}</p>
                        <p className="text-xs text-muted-foreground">{ar ? 'مهام في الانتظار' : 'Tâches en attente'}</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="md:col-span-1">
                    <CardContent className="p-5 flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <Shield className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{ar ? 'حالة الـ Secret' : 'Statut secret'}</p>
                        <Badge variant={bridgeSecret ? 'default' : 'secondary'}>
                          {bridgeSecret ? (ar ? 'مُعيَّن' : 'Défini') : (ar ? 'غير مُعيَّن' : 'Non défini')}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* SIM Slot Balances */}
                {simSlots.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-primary" />
                        {ar ? 'أرصدة شرائح SIM' : 'Soldes des cartes SIM'}
                        <span className="text-xs text-muted-foreground font-normal">
                          {ar ? 'يُحدَّث تلقائياً كل 10 ثوانٍ' : 'Mise à jour auto toutes les 10s'}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="ms-auto h-7 px-2 text-xs gap-1"
                          onClick={triggerBalanceCheck}
                          disabled={checkingBalance || !bridgeOnline}
                          title={!bridgeOnline ? (ar ? 'الجسر غير متصل' : 'Bridge hors ligne') : ''}
                        >
                          {checkingBalance
                            ? <><Loader2 className="h-3 w-3 animate-spin" />{ar ? 'جاري التحديث…' : 'Actualisation…'}</>
                            : <><RefreshCw className="h-3 w-3" />{ar ? 'تحديث الأرصدة' : 'Actualiser'}</>
                          }
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {simSlots.map((slot) => (
                          <div
                            key={slot.slot_id}
                            className="flex items-center gap-3 p-4 rounded-lg border bg-muted/30"
                          >
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <CreditCard className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{slot.operator}</p>
                              {slot.phone && (
                                <p className="text-xs text-muted-foreground font-mono">{slot.phone}</p>
                              )}
                              <p className="text-lg font-bold text-green-600 leading-tight">
                                {slot.balance?.toLocaleString() ?? 0}
                                <span className="text-xs font-normal text-muted-foreground ms-1">دج</span>
                              </p>
                              {slot.last_updated && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {fmtDate(slot.last_updated)}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Secret Management */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      {ar ? 'إدارة Bridge Secret' : 'Gestion du bridge secret'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {ar
                        ? 'يستخدمه برنامج الجسر المحلي للمصادقة عند الاتصال بهذا الخادم. يجب أن يكون 16 حرفاً على الأقل.'
                        : 'Utilisé par le bridge local pour s\'authentifier. Minimum 16 caractères.'}
                    </p>
                    <div className="flex gap-2 max-w-md">
                      <div className="relative flex-1">
                        <Input
                          type={showSecret ? 'text' : 'password'}
                          value={secretInput}
                          onChange={(e) => setSecretInput(e.target.value)}
                          placeholder={ar ? 'أدخل الـ secret الجديد' : 'Nouveau secret...'}
                          dir="ltr"
                          className="pe-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret((x) => !x)}
                          className="absolute inset-y-0 end-2 flex items-center text-muted-foreground"
                        >
                          {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button onClick={saveSecret} disabled={savingSecret || secretInput === bridgeSecret || secretInput.length < 16} className="gap-2">
                        {savingSecret ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {ar ? 'حفظ' : 'Sauvegarder'}
                      </Button>
                    </div>
                    {secretInput.length > 0 && secretInput.length < 16 && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {ar ? `يحتاج ${16 - secretInput.length} حرف إضافي` : `${16 - secretInput.length} caractères manquants`}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Pending Tasks */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Hourglass className="h-5 w-5 text-amber-600" />
                      {ar ? 'العمليات المعلّقة (في انتظار الجسر)' : 'Opérations en attente'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{ar ? 'الكود' : 'Code'}</TableHead>
                          <TableHead>{ar ? 'المشغّل' : 'Op.'}</TableHead>
                          <TableHead>{ar ? 'الهاتف' : 'Tel'}</TableHead>
                          <TableHead>{ar ? 'المبلغ' : 'Montant'}</TableHead>
                          <TableHead>USSD</TableHead>
                          <TableHead>{ar ? 'التاريخ' : 'Date'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingTasks.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500 opacity-60" />
                              {ar ? 'لا توجد عمليات معلّقة' : 'Aucune opération en attente'}
                            </TableCell>
                          </TableRow>
                        ) : (
                          pendingTasks.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs">{r.code}</TableCell>
                              <TableCell className="text-sm">{ar ? OPERATOR_STYLES[r.operator]?.name : OPERATOR_STYLES[r.operator]?.nameEn}</TableCell>
                              <TableCell className="font-mono text-sm">{r.phone_number}</TableCell>
                              <TableCell className="font-medium">{r.amount?.toLocaleString()} دج</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <code className="text-xs bg-muted px-1 rounded">{r.ussd_code}</code>
                                  <button onClick={() => copyText(r.ussd_code)} className="text-muted-foreground hover:text-foreground">
                                    <Copy className="h-3 w-3" />
                                  </button>
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs">{fmtDate(r.created_at)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ===================== TAB: HISTORY ===================== */}
        {tab === 'history' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{ar ? 'سجل جميع عمليات الشحن' : 'Historique complet'}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? 'الكود' : 'Code'}</TableHead>
                    <TableHead>{ar ? 'المشغّل' : 'Op.'}</TableHead>
                    <TableHead>{ar ? 'الهاتف' : 'Tel'}</TableHead>
                    <TableHead>{ar ? 'المبلغ' : 'Montant'}</TableHead>
                    <TableHead>{ar ? 'النوع' : 'Type'}</TableHead>
                    <TableHead>{ar ? 'الحالة' : 'Statut'}</TableHead>
                    <TableHead>USSD</TableHead>
                    <TableHead>{ar ? 'الربح' : 'Profit'}</TableHead>
                    <TableHead>{ar ? 'التاريخ' : 'Date'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recharges.map((r) => {
                    const s = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                    const Icon = s.icon;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${OPERATOR_STYLES[r.operator]?.color || 'bg-gray-400'}`} />
                            <span className="text-sm">{ar ? OPERATOR_STYLES[r.operator]?.name : OPERATOR_STYLES[r.operator]?.nameEn}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{r.phone_number}</TableCell>
                        <TableCell className="font-medium">{r.amount?.toLocaleString()} دج</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {r.recharge_type === 'credit' ? (ar ? 'رصيد' : 'Crédit') :
                             r.recharge_type === 'internet' ? 'Internet' : 'Flexy'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${s.cls}`}>
                            <Icon className="h-3 w-3" />
                            {ar ? s.label : s.labelFr}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <code className="text-xs bg-muted px-1 rounded">{r.ussd_code}</code>
                            <button onClick={() => copyText(r.ussd_code)} className="text-muted-foreground hover:text-foreground">
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-green-600 text-sm">+{r.profit?.toLocaleString() || 0} دج</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{fmtDate(r.created_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {recharges.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        <Wifi className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        {ar ? 'لا توجد عمليات بعد' : 'Aucune opération'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </Layout>
  );
}
