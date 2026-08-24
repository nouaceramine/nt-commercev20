// /ecom-hub/shipping — الشحن: حالة Yalidine + تتبع الطرود + روابط الإعداد
import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Truck, Search, Settings, CheckCircle, AlertCircle, Zap, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';

// p255: generic courier sync (p248 backend) — one card for all registered
// couriers: config status + one-click status sync through the real pipeline.
function CourierSyncCard({ ar }) {
  const [adapters, setAdapters] = useState([]);
  const [busy, setBusy] = useState('');
  const [lastResult, setLastResult] = useState(null);

  const loadAdapters = async () => {
    try {
      const r = await apiClient.get('/ecom/shipping/courier-adapters');
      setAdapters(r.data.items || []);
    } catch { /* card stays empty */ }
  };
  useEffect(() => { loadAdapters(); }, []);

  const sync = async (code) => {
    setBusy(code); setLastResult(null);
    try {
      const r = await apiClient.post(`/ecom/shipping/sync/${code}`);
      setLastResult({ courier: code, ...r.data });
      toast.success(ar ? 'تمت المزامنة' : 'Synchronisé');
    } catch (e) {
      toast.error(e?.response?.data?.detail || (ar ? 'فشلت المزامنة' : 'Échec'));
    } finally {
      setBusy('');
    }
  };

  return (
    <Card data-testid="courier-sync-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          {ar ? 'مزامنة حالات الناقلين' : 'Synchronisation des transporteurs'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {ar
            ? 'تسحب المزامنة أحدث حالة لكل طرد مشحون وتُمرّرها عبر خط المعالجة الحقيقي: التسليم يحصّل COD والإرجاع يُقيَّد تلقائياً.'
            : 'La sync pousse chaque colis dans le pipeline réel : livré encaisse le COD, retourné est comptabilisé.'}
        </p>
        <div className="space-y-2">
          {adapters.map(a => (
            <div key={a.courier} className="flex items-center justify-between border rounded px-3 py-2" data-testid={`sync-row-${a.courier}`}>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{a.label_ar}</span>
                <Badge variant={a.sync_ready ? 'default' : 'secondary'} className={a.sync_ready ? 'bg-green-100 text-green-700' : ''}>
                  {a.sync_ready ? (ar ? 'جاهز' : 'Prêt') : (a.configured ? (ar ? 'يحتاج mock أو مفاتيح' : 'clés manquantes') : (ar ? 'غير مهيأ' : 'Non configuré'))}
                </Badge>
                {a.has_status_map && <Badge variant="outline">{ar ? 'خريطة حالات مخصصة' : 'status map'}</Badge>}
              </div>
              <Button size="sm" variant="outline" onClick={() => sync(a.courier)} disabled={!!busy || !a.sync_ready} data-testid={`sync-btn-${a.courier}`}>
                {busy === a.courier ? '...' : (ar ? 'مزامنة الآن' : 'Sync')}
              </Button>
            </div>
          ))}
          {adapters.length === 0 && <p className="text-xs text-muted-foreground">{ar ? 'جارٍ التحميل…' : 'Chargement…'}</p>}
        </div>
        {lastResult && (
          <div className="text-xs bg-muted rounded p-2" dir="ltr" data-testid="sync-last-result">
            <b>{lastResult.courier}</b>: delivered={lastResult.delivered ?? 0} returned={lastResult.returned ?? 0} unchanged={lastResult.unchanged ?? 0} errors={(lastResult.errors || []).length}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
  const [forecast, setForecast] = useState([]);            // p103
  const [recCourier, setRecCourier] = useState('');        // p103
  const [recText, setRecText] = useState('');              // p103
  const [recResult, setRecResult] = useState(null);        // p103
  const [recLoading, setRecLoading] = useState(false);     // p103

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

  // p145: one-tap return via scanned tracking/order code
  const [qrReturn, setQrReturn] = useState('');
  const [qrBusy, setQrBusy] = useState(false);
  const submitQrReturn = async () => {
    if (!qrReturn.trim()) return;
    setQrBusy(true);
    try {
      const r = await apiClient.post('/smart/return-by-tracking', { tracking: qrReturn.trim() });
      if (r.data?.already_returned) {
        toast.info(ar ? `الطلب ${r.data.order_code} مُستردّ مسبقاً` : 'Deja retourne');
      } else {
        toast.success(r.data?.message_ar || (ar ? 'تم الاسترجاع' : 'Retour effectue'));
      }
      setQrReturn('');
      apiClient.get('/integrations/yalidine/parcels').then(r2 => {
        const d2 = r2.data;
        setParcels(Array.isArray(d2) ? d2 : (d2?.parcels || d2?.items || []));
      }).catch(() => {});
    } catch (e) {
      toast.error(e?.response?.data?.detail || (ar ? 'فشل الاسترجاع' : 'Echec retour'));
    } finally {
      setQrBusy(false);
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
    try {  // p103: cash-flow forecast
      const fc = await apiClient.get('/ecom/shipping/cash-forecast');
      setForecast(fc.data?.forecast || []);
    } catch (e) { /* silent */ }
  };

  const fcOf = (c) => forecast.find(x => x.courier === c);  // p103

  const runReconcile = async () => {  // p103
    setRecLoading(true); setRecResult(null);
    try {
      const r = await apiClient.post('/ecom/shipping/reconcile', { courier: recCourier, tracking_numbers: recText });
      setRecResult(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || (ar ? 'فشلت المطابقة' : 'Échec'));
    } finally { setRecLoading(false); }
  };

  useEffect(() => { fetchSettlements(); }, []);  // p90

  // p94: courier API connections (moved here from /ecom-hub/channels)
  const COURIER_SCHEMA = {
    yalidine: { ar: 'يالدين', fr: 'Yalidine', fields: [['api_id', 'API ID'], ['api_token', 'API Token']] },
    zr:       { ar: 'ZR Express', fr: 'ZR Express', fields: [['token', 'API Token'], ['client_key', 'Client Key']] },
    maystro:  { ar: 'مايسترو (Maystro)', fr: 'Maystro Delivery', fields: [['api_key', 'API Key']] },
    // p256: full registry — generic_http fields (base_url + api_token activate sync)
    abex: { ar: 'أبيكس إكسبريس', fr: 'Abex Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    med_express: { ar: 'ميد إكسبريس', fr: 'Med Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    msm_go: { ar: 'إم إس إم غو', fr: 'MSM Go', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    rex: { ar: 'ريكس للتوصيل', fr: 'Rex Livraison', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    rb_livraison: { ar: 'آر بي للتوصيل', fr: 'RB Livraison', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    speed_delivery: { ar: 'سبيد ديليفري', fr: 'Speed Delivery', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    areex: { ar: 'أريكس', fr: 'Areex', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    prest: { ar: 'برست', fr: 'Prest', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    rocket: { ar: 'روكيت ديليفري', fr: 'Rocket Delivery', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    world_express: { ar: 'وورلد إكسبريس', fr: 'World Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    ba_consult: { ar: 'بي أي كونسالت', fr: 'BA Consult', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    packers: { ar: 'باكرز', fr: 'Packers', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    hr48: { ar: '48 ساعة للتوصيل', fr: '48Hr Livraison', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    mono_hub: { ar: 'مونو هاب', fr: 'Mono Hub', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    golivri: { ar: 'غوليفري', fr: 'GOLIVRI', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    salva: { ar: 'سالفا ديليفري', fr: 'Salva Delivery', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    distazero: { ar: 'ديستازيرو', fr: 'Distazero', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    fret_direct: { ar: 'فري دايركت', fr: 'FRET.Direct', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    zimou: { ar: 'زيمو إكسبريس', fr: 'Zimou Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    zinyatec: { ar: 'زيناتيك', fr: 'Zinyatec', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    tsl: { ar: 'تي إس إل إكسبريس', fr: 'TSL Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    negmar: { ar: 'نقمار إكسبريس', fr: 'Negmar Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    ultra: { ar: 'ألترا إكسبريس', fr: 'Ultra Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    om_courrier: { ar: 'أو إم كورييه', fr: 'OM Courrier Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    allo_livraison: { ar: 'ألو ليفريزون', fr: 'Allo Livraison', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    assil: { ar: 'أسيل ديليفري', fr: 'Assil Delivery', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    expedia_chrono: { ar: 'إكسبيديا كرونو', fr: 'Expedia Chrono', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    hhd: { ar: 'إتش إتش دي إكسبريس', fr: 'HHD Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    imir: { ar: 'إيمير لوجيستيكس', fr: 'Imir Logistics', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    navex: { ar: 'نافيكس ديليفري', fr: 'Navex Delivery', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    swift: { ar: 'سويفت إكسبريس', fr: 'Swift Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    univer: { ar: 'يونيفير ديليفري', fr: 'Univer Delivery', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    colireli: { ar: 'كوليريلي', fr: 'ColiReli', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    fz_delivery: { ar: 'إف زد ديليفري', fr: 'FZ Delivery', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    delivro: { ar: 'ديليفرو ميل', fr: 'Delivro Mail', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    pdex: { ar: 'بي دي إكس', fr: 'PDEX', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    rm_express: { ar: 'آر إم إكسبريس', fr: 'RM Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    one_delivery: { ar: 'ون ديليفري', fr: 'One Delivery', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    on_time: { ar: 'أون تايم إكسبريس', fr: 'On Time Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    amana_speed: { ar: 'أمانة سبيد', fr: 'Amana Speed Service', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    rj360: { ar: 'آر جي 360 إكسبريس', fr: 'RJ360 Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    rs_express: { ar: 'آر إس إكسبريس', fr: 'RS Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    vitrans: { ar: 'فيترانس إكسبريس', fr: 'Vitrans Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    jo_express: { ar: 'جو إكسبريس', fr: 'JO Express Time', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    lynx: { ar: 'لينكس إكسبريس', fr: 'Lynx Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    jaguar: { ar: 'جاكوار إكسبريس', fr: 'Jaguar Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    sbl: { ar: 'إس بي إل إكسبريس', fr: 'SBL Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    samex: { ar: 'ساميكس إكسبريس', fr: 'Samex Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    chrono_rex: { ar: 'كرونو ريكس', fr: 'Chrono Rex', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    ovred: { ar: 'أوفريد', fr: 'OVRED', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    aranex: { ar: 'أرانيكس إكسبريس', fr: 'Aranex Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    gs_ecommerce: { ar: 'جي إس إكسبريس', fr: 'GS Ecommerce Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    khotwa: { ar: 'خطوة إكسبريس', fr: 'Khotwa Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    royaume: { ar: 'رويوم ديليفري', fr: 'Royaume Delivery', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    ruta: { ar: 'روتا إكسبريس', fr: 'Ruta Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    dvd_delivery: { ar: 'دي في دي ديليفري', fr: 'DVD Delivery', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    colex: { ar: 'كوليكس إكسبريس', fr: 'Colex Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    easy_speed: { ar: 'إيزي آند سبيد', fr: 'Easy & Speed', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    nord_ouest: { ar: 'نورد ويست إكسبريس', fr: 'Nord Ouest Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    worlexpress: { ar: 'وورل إكسبريس', fr: 'Worl Express', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
    sogex: { ar: 'سوجيكس', fr: 'Sogex', fields: [['api_token', 'API Token'], ['base_url', 'Base URL (رابط API)']] },
  };
  const [courierIntg, setCourierIntg] = useState({});    // channel -> integration
  const [courierDlg, setCourierDlg] = useState(null);    // channel being edited
  const [courierForm, setCourierForm] = useState({ credentials: {}, return_fee: '', is_active: true });
  const [savingCourier, setSavingCourier] = useState(false);

  // p284: instant webhook (courier -> system) info dialog
  const [webhookDlg, setWebhookDlg] = useState(null);   // channel being shown
  const [webhookInfo, setWebhookInfo] = useState(null); // fetched info payload
  const [webhookBusy, setWebhookBusy] = useState(false);

  const openWebhook = async (ch) => {
    setWebhookDlg(ch);
    setWebhookInfo(null);
    setWebhookBusy(true);
    try {
      const r = await apiClient.get(`/ecom/shipping/webhook-info/${ch}`);
      setWebhookInfo(r.data);
    } catch (e) {
      toast.error(ar ? 'فشل جلب معلومات الإشعار اللحظي' : 'Erreur webhook');
      setWebhookDlg(null);
    } finally { setWebhookBusy(false); }
  };

  const rotateWebhook = async () => {
    if (!webhookDlg) return;
    if (!window.confirm(ar ? 'توليد رابط جديد؟ الرابط القديم سيتوقف فوراً.' : 'Régénérer le lien ?')) return;
    setWebhookBusy(true);
    try {
      const r = await apiClient.post(`/ecom/shipping/webhook-rotate/${webhookDlg}`);
      setWebhookInfo(prev => ({ ...prev, webhook_url: r.data.webhook_url }));
      toast.success(ar ? 'وُلّد رابط جديد — حدّثه في لوحة شركة الشحن' : 'Nouveau lien genere');
    } catch (e) {
      toast.error(ar ? 'فشل توليد الرابط' : 'Echec');
    } finally { setWebhookBusy(false); }
  };

  const copyWebhook = (url) => {
    navigator.clipboard?.writeText(url);
    toast.success(ar ? 'نُسخ الرابط' : 'Copie');
  };

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
                  {fcOf(s.courier) && (
                    <p className="text-xs text-muted-foreground mt-2" data-testid={`forecast-line-${s.courier}`}>
                      {ar
                        ? `🚚 في الطريق: ${fcOf(s.courier).in_transit_count} طرد (${Number(fcOf(s.courier).in_transit).toLocaleString()} دج) · معدل التسليم ${fcOf(s.courier).delivery_rate !== null ? Math.round(fcOf(s.courier).delivery_rate * 100) + '%' : '—'} · متوقع تحصيله: ${fcOf(s.courier).expected !== null ? Number(fcOf(s.courier).expected).toLocaleString() + ' دج' : '—'}`
                        : `En route: ${fcOf(s.courier).in_transit_count} (${Number(fcOf(s.courier).in_transit).toLocaleString()} DZD) · attendu: ${fcOf(s.courier).expected !== null ? Number(fcOf(s.courier).expected).toLocaleString() + ' DZD' : '—'}`}
                    </p>
                  )}
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
        {/* p103: statement reconciliation */}
        <Card data-testid="reconcile-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              {ar ? '📄 مطابقة كشف شركة الشحن' : 'Rapprochement du relevé'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {ar ? 'الصق أرقام التتبع من كشف دفع شركة الشحن — يكشف النظام أي طرد مسلّم لم يُدفع لك.' : 'Collez les numéros de suivi du relevé du transporteur.'}
            </p>
            <div className="flex gap-1 flex-wrap">
              <Button size="sm" variant={recCourier === '' ? 'default' : 'outline'} onClick={() => setRecCourier('')} data-testid="rec-courier-all">{ar ? 'الكل' : 'Tous'}</Button>
              {settlements.filter(s => s.courier !== 'manual').map(s => (
                <Button key={s.courier} size="sm" variant={recCourier === s.courier ? 'default' : 'outline'} onClick={() => setRecCourier(s.courier)} data-testid={`rec-courier-${s.courier}`}>{s.name}</Button>
              ))}
            </div>
            <Textarea rows={4} dir="ltr" value={recText} onChange={e => setRecText(e.target.value)} placeholder={'YDN-123456\nYDN-123457'} data-testid="reconcile-input" />
            <div>
              <Button size="sm" onClick={runReconcile} disabled={recLoading || !recText.trim()} data-testid="reconcile-btn">
                {recLoading ? '...' : (ar ? 'طابِق الآن' : 'Comparer')}
              </Button>
            </div>
            {recResult && (
              <div className="border rounded-lg p-3 space-y-2 text-sm" data-testid="reconcile-result">
                <p data-testid="reconcile-summary">
                  {ar
                    ? `الكشف: ${recResult.statement_count} · مسلّم في النظام: ${recResult.system_delivered} · متطابق: ${recResult.matched}`
                    : `Relevé: ${recResult.statement_count} · Système: ${recResult.system_delivered} · Match: ${recResult.matched}`}
                </p>
                {recResult.gap_amount > 0 && (
                  <p className="font-semibold text-red-600" data-testid="reconcile-gap">
                    {ar ? `⚠️ فجوة: ${Number(recResult.gap_amount).toLocaleString()} دج مسلّمة ولم تُدفع لك` : `Écart: ${Number(recResult.gap_amount).toLocaleString()} DZD`}
                  </p>
                )}
                {recResult.missing_in_statement.length > 0 && (
                  <div data-testid="reconcile-missing">
                    <p className="font-medium text-red-700">{ar ? 'مسلّم في النظام وغير موجود في الكشف:' : 'Livrés absents du relevé:'}</p>
                    {recResult.missing_in_statement.map(m => (
                      <p key={m.tracking} className="text-xs" dir="ltr" data-testid={`reconcile-missing-${m.tracking}`}>
                        {m.tracking} · {m.order_code} · {Number(m.amount).toLocaleString()} {ar ? 'دج' : 'DZD'}
                      </p>
                    ))}
                  </div>
                )}
                {recResult.unknown_in_statement.length > 0 && (
                  <div data-testid="reconcile-unknown">
                    <p className="font-medium text-amber-700">{ar ? 'في الكشف وغير معروف في النظام:' : 'Inconnus dans le système:'}</p>
                    <p className="text-xs" dir="ltr">{recResult.unknown_in_statement.join(' · ')}</p>
                  </div>
                )}
                {recResult.missing_in_statement.length === 0 && recResult.unknown_in_statement.length === 0 && (
                  <p className="text-emerald-700 font-medium" data-testid="reconcile-perfect">{ar ? '✅ مطابقة تامة — لا فروقات' : '✅ Aucun écart'}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
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
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openWebhook(ch)} data-testid={`courier-webhook-${ch}`} title={ar ? 'الإشعارات اللحظية (Webhook)' : 'Webhook'}>
                      <Zap className="h-4 w-4" />{ar ? 'لحظي' : 'Webhook'}
                    </Button>
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

              {/* p145: QR-scan return — scan/enter tracking or order code → refund + restock */}
              <div>
                <p className="font-medium mb-2">{ar ? '↩️ استرجاع بمسح البوليصة (QR)' : 'Retour par scan QR'}</p>
                <div className="flex gap-2">
                  <Input value={qrReturn} onChange={e => setQrReturn(e.target.value)} placeholder={ar ? 'رقم التتبع أو رقم الطلب...' : 'N° suivi ou commande...'} dir="ltr" data-testid="qr-return-input" />
                  <Button onClick={submitQrReturn} variant="outline" disabled={qrBusy} data-testid="qr-return-btn">{qrBusy ? '...' : (ar ? 'استرجاع' : 'Retour')}</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{ar ? 'امسح QR على البوليصة — يُعلَّم الطلب «مُستردّ» وتُعاد الكمية للمخزون فوراً.' : 'Scannez le QR du bordereau — commande remboursée et stock réapprovisionné.'}</p>
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

        <CourierSyncCard ar={ar} />
      </div>

      {/* p284: instant webhook dialog */}
      <Dialog open={!!webhookDlg} onOpenChange={(v) => { if (!v) { setWebhookDlg(null); setWebhookInfo(null); } }}>
        <DialogContent className="max-w-md" dir={ar ? 'rtl' : 'ltr'} data-testid="webhook-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              {webhookDlg ? (ar ? `الإشعارات اللحظية — ${COURIER_SCHEMA[webhookDlg]?.ar || webhookDlg}` : `Webhook — ${webhookDlg}`) : ''}
            </DialogTitle>
          </DialogHeader>
          {webhookBusy && !webhookInfo && <p className="text-sm text-muted-foreground py-4 text-center">{ar ? 'جارٍ التحميل...' : '...'}</p>}
          {webhookInfo && !webhookInfo.supported && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900" data-testid="webhook-unsupported">
              {webhookInfo.note}
            </div>
          )}
          {webhookInfo && webhookInfo.supported && (
            <div className="space-y-3" data-testid="webhook-supported">
              <p className="text-sm text-muted-foreground">
                {ar
                  ? 'فعّل هذا الرابط في لوحة شركة الشحن لتصلك تحديثات حالة الطرود لحظياً (تسليم/إرجاع) بدل انتظار المزامنة الدورية:'
                  : 'Collez ce lien dans le portail du transporteur pour des mises a jour instantanees :'}
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly dir="ltr" value={webhookInfo.webhook_url} className="text-xs font-mono" data-testid="webhook-url-input" onFocus={(e) => e.target.select()} />
                <Button size="icon" variant="outline" onClick={() => copyWebhook(webhookInfo.webhook_url)} data-testid="webhook-copy-btn">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-sm text-sky-900" data-testid="webhook-instructions">
                {webhookInfo.instructions}
              </div>
              <p className="text-xs text-muted-foreground">
                {ar ? `الأحداث المستلمة حتى الآن: ${webhookInfo.events_received || 0}` : `Evenements: ${webhookInfo.events_received || 0}`}
                {webhookInfo.last_event_at ? (ar ? ` — آخر حدث: ${new Date(webhookInfo.last_event_at).toLocaleString('ar-DZ')}` : '') : ''}
              </p>
              <p className="text-xs text-amber-700">{webhookInfo.security_note}</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            {webhookInfo?.supported && (
              <Button variant="outline" onClick={rotateWebhook} disabled={webhookBusy} data-testid="webhook-rotate-btn">
                {ar ? 'توليد رابط جديد' : 'Regenerer'}
              </Button>
            )}
            <Button variant="outline" onClick={() => { setWebhookDlg(null); setWebhookInfo(null); }}>{ar ? 'إغلاق' : 'Fermer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {/* p288: مفاتيح الناقلين المغطاة بالمركز تُدار من مركز التكاملات */}
              {['yalidine', 'guepex', 'zr', 'maystro', 'ecotrack', 'noest'].includes(courierDlg) ? (
                <div className="rounded-md border border-dashed p-3 text-sm bg-muted/30" data-testid="courier-hub-note">
                  🔑 {ar ? 'مفاتيح هذه الشركة تُدار من' : 'Clés gérées depuis'}{' '}
                  <a href="/integrations" className="text-emerald-700 underline font-medium" data-testid="courier-hub-link">
                    {ar ? 'مركز التكاملات' : "le Centre d'intégrations"}
                  </a>
                  {ar ? ' — أدخلها هناك واضغط «حفظ واختبار» فتُفعَّل تلقائياً. هنا تعدّل فقط سعر الإرجاع والتفعيل.' : ''}
                </div>
              ) : (
                COURIER_SCHEMA[courierDlg].fields.map(([k, label]) => (
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
                ))
              )}
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
