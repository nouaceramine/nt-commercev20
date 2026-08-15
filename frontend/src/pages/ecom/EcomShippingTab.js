// /ecom-hub/shipping — الشحن: حالة Yalidine + تتبع الطرود + روابط الإعداد
import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Truck, Search, Settings, CheckCircle, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';

export default function EcomShippingTab() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [status, setStatus] = useState(null);
  const [parcels, setParcels] = useState([]);
  const [tracking, setTracking] = useState('');
  const [trackResult, setTrackResult] = useState(null);
  const [rates, setRates] = useState([]);
  const [ratesDefault, setRatesDefault] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [syncing, setSyncing] = useState(false);   // p74
  const [pulling, setPulling] = useState(false);
  const [bulkDate, setBulkDate] = useState(() => new Date().toISOString().slice(0, 10));  // p85
  const [bulkLoading, setBulkLoading] = useState(false);           // p85   // p76
  const [senderWilaya, setSenderWilaya] = useState('16');
  const [pullMsg, setPullMsg] = useState('');

  const pullYalidineRates = async () => {
    setPulling(true); setPullMsg('');
    try {
      const r = await apiClient.post('/ecom/shipping/yalidine/pull-rates', { from_wilaya_id: parseInt(senderWilaya) || 16 });
      setPullMsg(r.data.message || '');
      toast.success(r.data.message);
      fetchRates?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (ar ? 'فشل سحب الأسعار' : 'Échec'));
    } finally { setPulling(false); }
  };
  const [syncResult, setSyncResult] = useState(null);
  const [settlements, setSettlements] = useState([]);      // p90
  const [settleTargets, setSettleTargets] = useState([]);  // p90
  const [settleRow, setSettleRow] = useState(null);        // p90 expanded courier
  const [settleAmount, setSettleAmount] = useState('');    // p90
  const [settleTarget, setSettleTarget] = useState('');    // p90
  const [settling, setSettling] = useState(false);         // p90

  const syncYalidine = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const r = await apiClient.post('/ecom/shipping/sync-yalidine');
      setSyncResult(r.data);
      toast.success(ar ? `تمت المزامنة: ${r.data.delivered} مُسلَّم، ${r.data.returned} مُسترد` : 'Synchronisé');
    } catch (e) {
      toast.error(e?.response?.data?.detail || (ar ? 'فشلت المزامنة' : 'Échec'));
    } finally { setSyncing(false); }
  };

  const fetchRates = () => {
    apiClient.get('/store/delivery-rates').then(r => {
      setRates(r.data?.rates || []);
      setRatesDefault(!!r.data?.is_default);
    }).catch(() => {});
  };

  const saveRates = async () => {
    setSavingRates(true);
    try {
      await apiClient.put('/store/delivery-rates', { rates });
      setRatesDefault(false);
      toast.success(ar ? 'تم حفظ أسعار التوصيل' : 'Tarifs enregistrés');
    } catch {
      toast.error(ar ? 'فشل الحفظ' : 'Échec');
    } finally { setSavingRates(false); }
  };

  const setRate = (wid, field, val) => {
    setRates(rates.map(r => r.wilaya_id === wid ? { ...r, [field]: val === '' ? 0 : Number(val) } : r));
  };

  const applyToAll = (field, val) => {
    const n = val === '' ? 0 : Number(val);
    setRates(rates.map(r => ({ ...r, [field]: n })));
  };

  useEffect(() => {
    fetchRates();
    apiClient.get('/integrations/yalidine/status').then(r => setStatus(r.data)).catch(() => {});
    apiClient.get('/integrations/yalidine/parcels').then(r => {
      const d = r.data;
      setParcels(Array.isArray(d) ? d : (d?.parcels || d?.items || []));
    }).catch(() => {});
  }, []);

  const track = async () => {
    if (!tracking.trim()) return;
    try {
      const r = await apiClient.get(`/integrations/yalidine/parcels/${tracking.trim()}`);
      setTrackResult(r.data);
    } catch {
      toast.error(ar ? 'لم يتم العثور على الطرد' : 'Colis introuvable');
      setTrackResult(null);
    }
  };

  // p85: bulk label print — opens a print window with today's (or chosen day's) labels
  const bulkPrint = async () => {
    setBulkLoading(true);
    try {
      const r = await apiClient.get(`/ecom/shipping/labels-bulk?date=${bulkDate}`);
      const labels = r.data?.labels || [];
      const w = window.open('', '_blank');
      if (!w) { toast.error(ar ? 'اسمح بالنوافذ المنبثقة' : 'Autorisez les popups'); return; }
      const rows = labels.map(l => `<tr>
        <td style="padding:8px;border:1px solid #ddd;font-family:monospace">${l.tracking_number || '—'}</td>
        <td style="padding:8px;border:1px solid #ddd">${l.provider || ''}</td>
        <td style="padding:8px;border:1px solid #ddd">${l.real ? `<a href="${l.label_url}" target="_blank">فتح البوليصة ⬇</a>` : '<span style="color:#999">تجريبية — بلا ملف</span>'}</td>
      </tr>`).join('');
      w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>بوليصات ${bulkDate}</title></head>
        <body style="font-family:sans-serif;padding:20px">
        <h2>🖨 بوليصات الشحن — ${bulkDate} (${labels.length})</h2>
        ${labels.length === 0 ? '<p>لا بوليصات في هذا اليوم.</p>' : `
        <p style="color:#666;font-size:13px">اضغط «فتح الكل» ثم اطبع من كل تبويب (Ctrl+P). إن حجب المتصفح النوافذ، اسمح بها لهذا الموقع.</p>
        <button onclick="document.querySelectorAll('a[data-pdf]').forEach((a,i)=>setTimeout(()=>window.open(a.href,'_blank'),i*400))" style="padding:8px 16px;font-size:14px;cursor:pointer">⬇ فتح الكل (${labels.filter(l=>l.real).length})</button>
        <table style="border-collapse:collapse;margin-top:12px;width:100%">
          <tr style="background:#f5f5f5"><th style="padding:8px;border:1px solid #ddd">التتبع</th><th style="padding:8px;border:1px solid #ddd">الناقل</th><th style="padding:8px;border:1px solid #ddd">البوليصة</th></tr>
          ${rows}
        </table>`}
        </body></html>`);
      // mark real links for the open-all button
      w.document.querySelectorAll('a').forEach(a => a.setAttribute('data-pdf', '1'));
      w.document.close();
    } catch (e) {
      toast.error(ar ? 'فشل جلب البوليصات' : 'Erreur étiquettes');
    } finally { setBulkLoading(false); }
  };

  const fetchSettlements = async () => {  // p90
    try {
      const res = await apiClient.get('/ecom/shipping/settlements');
      setSettlements(res.data?.settlements || []);
      setSettleTargets(res.data?.targets || []);
    } catch (e) { /* silent */ }
  };

  useEffect(() => { fetchSettlements(); }, []);  // p90

  // p94: courier API connections (moved here from /ecom-hub/channels)
  const COURIER_SCHEMA = {
    yalidine: { ar: 'يالدين', fr: 'Yalidine', fields: [['api_id', 'API ID'], ['api_token', 'API Token']] },
    zr:       { ar: 'ZR Express', fr: 'ZR Express', fields: [['token', 'API Token'], ['client_key', 'Client Key']] },
    maystro:  { ar: 'مايسترو (Maystro)', fr: 'Maystro Delivery', fields: [['api_key', 'API Key']] },
  };
  const [courierIntg, setCourierIntg] = useState({});    // channel -> integration
  const [courierDlg, setCourierDlg] = useState(null);    // channel being edited
  const [courierForm, setCourierForm] = useState({ credentials: {}, return_fee: '', is_active: true });
  const [savingCourier, setSavingCourier] = useState(false);

  const fetchCouriers = async () => {
    try {
      const r = await apiClient.get('/ecom/integrations');
      const map = {};
      (r.data?.items || []).forEach(i => { if (i.kind === 'shipping' && !map[i.channel]) map[i.channel] = i; });
      setCourierIntg(map);
    } catch (e) { /* silent */ }
  };
  useEffect(() => { fetchCouriers(); }, []);  // p94

  const openCourier = (ch) => {
    const ex = courierIntg[ch];
    setCourierForm({ credentials: {}, return_fee: ex ? String(ex.return_fee ?? '') : '', is_active: ex ? !!ex.is_active : true });
    setCourierDlg(ch);
  };

  const saveCourier = async () => {
    const ch = courierDlg;
    const meta = COURIER_SCHEMA[ch];
    if (!meta) return;
    const creds = {};
    meta.fields.forEach(([k]) => { const v = (courierForm.credentials[k] || '').trim(); if (v) creds[k] = v; });
    const ex = courierIntg[ch];
    setSavingCourier(true);
    try {
      const payload = { name: meta.ar, credentials: creds, is_active: courierForm.is_active, return_fee: parseFloat(courierForm.return_fee) || 0 };
      if (ex) await apiClient.put(`/ecom/integrations/${ex.id}`, payload);
      else await apiClient.post('/ecom/integrations', { channel: ch, ...payload });
      toast.success(ar ? 'تم حفظ الإعدادات' : 'Enregistré');
      setCourierDlg(null);
      fetchCouriers();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (ar ? 'فشل الحفظ' : 'Échec'));
    } finally { setSavingCourier(false); }
  };

  const openSettle = (s) => {  // p90
    setSettleRow(s.box_id);
    setSettleAmount(String(s.balance));
    setSettleTarget(settleTargets[0]?.id || '');
  };

  const confirmSettle = async (s) => {  // p90
    const amount = parseFloat(settleAmount) || 0;
    if (amount <= 0 || !settleTarget) { toast.error(ar ? 'أدخل مبلغاً وصندوقاً وجيهَين' : 'Montant invalide'); return; }
    if (amount > s.balance) { toast.error(ar ? 'المبلغ أكبر من المستحق' : 'Montant > solde'); return; }
    setSettling(true);
    try {
      await apiClient.post('/cash-boxes/transfer', { from_box: s.box_id, to_box: settleTarget, amount });
      toast.success(ar ? 'تمت التسوية والتحويل بنجاح' : 'Transfert effectué');
      setSettleRow(null);
      fetchSettlements();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (ar ? 'فشل التحويل' : 'Erreur'));
    } finally { setSettling(false); }
  };

  return (
    <>
      <div className="space-y-6" data-testid="ecom-shipping-tab">
        {/* p90: courier payout settlement */}
        {settlements.length > 0 && (
          <Card data-testid="settlements-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                {ar ? 'تسوية مستحقات شركات الشحن' : 'Règlement des transporteurs'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {settlements.map(s => (
                <div key={s.box_id} className="border rounded-lg p-3" data-testid={`settle-row-${s.courier}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="font-semibold">{s.name}</span>
                      <span className="text-xs text-muted-foreground mr-2">
                        {ar ? `${s.delivered_count} طرد مسلّم · ${s.returned_count} مرتجع` : `${s.delivered_count} livrés · ${s.returned_count} retours`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={s.balance > 0 ? 'bg-indigo-100 text-indigo-700' : ''} data-testid={`settle-balance-${s.courier}`}>
                        {Number(s.balance).toLocaleString()} {ar ? 'دج' : 'DZD'}
                      </Badge>
                      {s.balance > 0 && (
                        <Button size="sm" variant="outline" data-testid={`settle-btn-${s.courier}`} onClick={() => settleRow === s.box_id ? setSettleRow(null) : openSettle(s)}>
                          {ar ? 'تم الصرف' : 'Encaissé'}
                        </Button>
                      )}
                    </div>
                  </div>
                  {settleRow === s.box_id && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap" data-testid="settle-form">
                      <Input type="number" className="w-32" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} data-testid="settle-amount-input" dir="ltr" />
                      <div className="flex gap-1 flex-wrap">
                        {settleTargets.map(t => (
                          <Button key={t.id} size="sm" variant={settleTarget === t.id ? 'default' : 'outline'} onClick={() => setSettleTarget(t.id)} data-testid={`settle-target-${t.id}`}>
                            {t.name}
                          </Button>
                        ))}
                      </div>
                      <Button size="sm" disabled={settling} onClick={() => confirmSettle(s)} data-testid="settle-confirm-btn">
                        {settling ? (ar ? '...' : '...') : (ar ? 'تأكيد التحويل' : 'Confirmer')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {ar ? 'رصيد كل شركة = ما تدين لك به الآن. عند صرف المستحقات اضغط «تم الصرف» لتحويله إلى الصندوق — وقارن الكشف مع الرصيد لتكشف أي نقص.' : ''}
              </p>
            </CardContent>
          </Card>
        )}
        {/* p94: courier API connections */}
        <Card data-testid="couriers-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {ar ? 'ربط شركات الشحن' : 'Connexion des transporteurs'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(COURIER_SCHEMA).map(ch => {
              const meta = COURIER_SCHEMA[ch];
              const ex = courierIntg[ch];
              return (
                <div key={ch} className="flex items-center justify-between border rounded-lg p-3 flex-wrap gap-2" data-testid={`courier-row-${ch}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚚</span>
                    <div>
                      <div className="font-semibold">{ar ? meta.ar : meta.fr}</div>
                      <div className="text-xs text-muted-foreground">
                        {ex ? (ex.mode === 'live' ? (ar ? '✅ مفاتيح محفوظة' : '✅ Configuré') : (ar ? '🧪 بدون مفاتيح (محاكاة)' : '🧪 Simulation')) : (ar ? 'غير مربوط بعد' : 'Non connecté')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ex && (
                      <Badge variant={ex.is_active ? 'default' : 'outline'}>
                        {ex.is_active ? (ar ? 'مُفعَّل' : 'Actif') : (ar ? 'مُوقَف' : 'Inactif')}
                      </Badge>
                    )}
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openCourier(ch)} data-testid={`courier-settings-${ch}`}>
                      <Settings className="h-4 w-4" />{ar ? 'الإعدادات' : 'Paramètres'}
                    </Button>
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              {ar ? 'أدخل مفاتيح API لكل شركة شحن من هنا. «سعر الإرجاع» يُسجَّل تلقائياً كخسارة عند استرجاع الطرود.' : 'Clés API des transporteurs — les frais de retour sont comptabilisés automatiquement.'}
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-5 w-5" />{ar ? 'تكامل Yalidine' : 'Intégration Yalidine'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between border rounded-lg p-4">
                <div className="flex items-center gap-2">
                  {status?.configured ? <CheckCircle className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-yellow-500" />}
                  <div>
                    <p className="font-medium">{status?.configured ? (ar ? 'مُعدّ وجاهز' : 'Configuré') : (ar ? 'غير مُعدّ' : 'Non configuré')}</p>
                    <p className="text-sm text-muted-foreground">
                      {status?.enabled ? (ar ? 'مفعّل' : 'Activé') : (ar ? 'معطّل' : 'Désactivé')} — {ar ? 'ولاية الإرسال' : 'Wilaya'}: {status?.default_sender_wilaya || '16'}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => openCourier('yalidine')} data-testid="yalidine-settings-btn"><Settings className="h-4 w-4" />{ar ? 'الإعدادات' : 'Paramètres'}</Button>
              </div>

              <div className="border rounded-lg p-3 bg-cyan-50/50" data-testid="yalidine-sync-block">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-sm">{ar ? 'مزامنة الحالات من يالدين' : 'Sync statuts Yalidine'}</p>
                  <Button onClick={syncYalidine} disabled={syncing} size="sm" data-testid="yalidine-sync-btn">
                    {syncing ? (ar ? 'جارٍ...' : '...') : (ar ? 'تحديث الطلبات المشحونة' : 'Synchroniser')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{ar ? 'يجلب حالة كل طرد مشحون: المُسلَّم يصبح "تم التسليم" والمرفوض "مُستردّ" تلقائياً مع القيود المحاسبية.' : 'Met à jour les colis expédiés automatiquement.'}</p>
                <p className="text-xs text-emerald-700 mt-1" data-testid="yalidine-autosync-note">{ar ? '⚡ مزامنة تلقائية كل ساعتين — مع إشعار عند كل تسليم أو إرجاع.' : 'Sync automatique toutes les 2h.'}</p>
                {syncResult && (
                  <p className="text-xs mt-2 font-medium" data-testid="yalidine-sync-result">
                    {ar ? `فُحص ${syncResult.checked} — مُسلَّم: ${syncResult.delivered} — مُسترد: ${syncResult.returned} — بلا تغيير: ${syncResult.unchanged}` : JSON.stringify(syncResult)}
                    {syncResult.errors?.length > 0 ? ` — ${ar ? 'أخطاء' : 'erreurs'}: ${syncResult.errors.length}` : ''}
                  </p>
                )}
              </div>

              <div>
                <p className="font-medium mb-2">{ar ? 'تتبع طرد' : 'Suivi colis'}</p>
                <div className="flex gap-2">
                  <Input value={tracking} onChange={e => setTracking(e.target.value)} placeholder={ar ? 'رقم التتبع...' : 'N° de suivi...'} dir="ltr" />
                  <Button onClick={track} size="icon" data-testid="track-btn"><Search className="h-4 w-4" /></Button>
                </div>
                {trackResult && (
                  <pre className="mt-3 text-xs bg-muted rounded-lg p-3 overflow-auto max-h-48" dir="ltr">{JSON.stringify(trackResult, null, 2)}</pre>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>{ar ? 'آخر الطرود' : 'Derniers colis'}</CardTitle>
                <div className="flex items-center gap-2" data-testid="bulk-print-row">
                  <Input type="date" className="w-36 h-8 text-xs" value={bulkDate} onChange={e => setBulkDate(e.target.value)} data-testid="bulk-print-date" />
                  <Button size="sm" variant="outline" onClick={bulkPrint} disabled={bulkLoading} data-testid="bulk-print-btn">
                    {bulkLoading ? '...' : (ar ? '🖨 طباعة جماعية' : 'Imprimer tout')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {parcels.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">{ar ? 'لا توجد طرود بعد' : 'Aucun colis'}</p>
              ) : (
                <div className="space-y-2">
                  {parcels.slice(0, 10).map(p => (
                    <div key={p.id || p.tracking_id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
                      <div>
                        <p className="font-medium">{p.customer_name || '—'}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{p.tracking_id || '—'}</p>
                      </div>
                      <Badge variant="secondary">{p.status || 'created'}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* p69: delivery rates per wilaya */}
        <Card data-testid="delivery-rates-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {ar ? 'أسعار التوصيل حسب الولاية' : 'Tarifs de livraison par wilaya'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ratesDefault && (
              <>
              <div className="flex flex-wrap items-center gap-2 mb-3 border rounded-lg p-2 bg-orange-50/50" data-testid="yalidine-pull-row">
              <span className="text-sm">{ar ? 'ولاية الإرسال:' : 'Wilaya d\'envoi:'}</span>
              <Input className="w-20 h-8" value={senderWilaya} onChange={e => setSenderWilaya(e.target.value)} data-testid="sender-wilaya-input" />
              <Button size="sm" variant="outline" onClick={pullYalidineRates} disabled={pulling} data-testid="pull-yalidine-rates-btn">
                {pulling ? (ar ? 'جارٍ السحب...' : '...') : (ar ? '🚚 سحب أسعار يالدين الحقيقية' : 'Importer tarifs Yalidine')}
              </Button>
              {pullMsg && <span className="text-xs text-emerald-700" data-testid="pull-rates-msg">{pullMsg}</span>}
            </div>
            <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2" data-testid="rates-default-note">
                {ar ? 'هذه أسعار افتراضية تقريبية — عدّلها حسب شركة الشحن ثم اضغط حفظ' : 'Tarifs approximatifs par défaut — modifiez puis enregistrez'}
              </p>
              </>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">{ar ? 'تعبئة الكل:' : 'Appliquer à tous:'}</span>
              <Input type="number" min="0" placeholder={ar ? 'سعر المنزل' : 'Domicile'} className="w-28 h-8" onChange={e => e.target.value !== '' && applyToAll('home_price', e.target.value)} data-testid="bulk-home-price" />
              <Input type="number" min="0" placeholder={ar ? 'سعر المكتب' : 'Bureau'} className="w-28 h-8" onChange={e => e.target.value !== '' && applyToAll('office_price', e.target.value)} data-testid="bulk-office-price" />
              <Button onClick={saveRates} disabled={savingRates} className="mr-auto" data-testid="save-rates-btn">
                {savingRates ? (ar ? 'جاري الحفظ...' : 'Enregistrement...') : (ar ? 'حفظ الأسعار' : 'Enregistrer')}
              </Button>
            </div>
            <div className="border rounded-lg overflow-auto max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-right">{ar ? 'الولاية' : 'Wilaya'}</th>
                    <th className="p-2">{ar ? '🏠 للمنزل (دج)' : '🏠 Domicile'}</th>
                    <th className="p-2">{ar ? '🏢 للمكتب (دج)' : '🏢 Bureau'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map(r => (
                    <tr key={r.wilaya_id} className="border-t">
                      <td className="p-2">{r.wilaya_id} - {r.wilaya_name}</td>
                      <td className="p-2"><Input type="number" min="0" value={r.home_price} onChange={e => setRate(r.wilaya_id, 'home_price', e.target.value)} className="h-8 w-24 mx-auto" data-testid={`rate-home-${r.wilaya_id}`} /></td>
                      <td className="p-2"><Input type="number" min="0" value={r.office_price} onChange={e => setRate(r.wilaya_id, 'office_price', e.target.value)} className="h-8 w-24 mx-auto" data-testid={`rate-office-${r.wilaya_id}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* p94: courier settings dialog */}
      <Dialog open={!!courierDlg} onOpenChange={(v) => { if (!v) setCourierDlg(null); }}>
        <DialogContent className="max-w-md" dir={ar ? 'rtl' : 'ltr'} data-testid="courier-dialog">
          <DialogHeader>
            <DialogTitle>
              {courierDlg ? (ar ? `إعدادات ${COURIER_SCHEMA[courierDlg].ar}` : `${COURIER_SCHEMA[courierDlg].fr}`) : ''}
            </DialogTitle>
          </DialogHeader>
          {courierDlg && (
            <div className="space-y-3 py-2">
              {COURIER_SCHEMA[courierDlg].fields.map(([k, label]) => (
                <div key={k}>
                  <Label>{label}</Label>
                  <Input
                    type="password"
                    dir="ltr"
                    placeholder={courierIntg[courierDlg] ? '••••••••  (اترك فارغاً للإبقاء)' : ''}
                    value={courierForm.credentials[k] || ''}
                    onChange={e => setCourierForm({ ...courierForm, credentials: { ...courierForm.credentials, [k]: e.target.value } })}
                    data-testid={`courier-cred-${k}`}
                  />
                </div>
              ))}
              <div>
                <Label>{ar ? 'سعر الإرجاع (دج)' : 'Frais de retour (DZD)'}</Label>
                <Input
                  type="number" min="0" dir="ltr" placeholder="400"
                  value={courierForm.return_fee}
                  onChange={e => setCourierForm({ ...courierForm, return_fee: e.target.value })}
                  data-testid="courier-return-fee"
                />
                <p className="text-xs text-muted-foreground mt-1">{ar ? 'تُسجَّل كخسارة عند استرجاع الطلبات المشحونة عبر هذه الشركة' : ''}</p>
              </div>
              <div className="flex items-center justify-between p-2 rounded border">
                <Label className="cursor-pointer">{ar ? 'مُفعَّل' : 'Actif'}</Label>
                <Switch
                  checked={courierForm.is_active}
                  onCheckedChange={(v) => setCourierForm({ ...courierForm, is_active: v })}
                  data-testid="courier-active-switch"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCourierDlg(null)}>{ar ? 'إلغاء' : 'Annuler'}</Button>
            <Button onClick={saveCourier} disabled={savingCourier} data-testid="courier-save-btn">
              {savingCourier ? (ar ? 'جارٍ الحفظ...' : '...') : (ar ? 'حفظ' : 'Enregistrer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
