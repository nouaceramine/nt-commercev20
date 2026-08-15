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
import { Link } from 'react-router-dom';
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

  return (
    <>
      <div className="space-y-6" data-testid="ecom-shipping-tab">
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
                <Link to="/integrations/yalidine">
                  <Button variant="outline" size="sm" className="gap-1"><Settings className="h-4 w-4" />{ar ? 'الإعدادات' : 'Paramètres'}</Button>
                </Link>
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
    </>
  );
}
