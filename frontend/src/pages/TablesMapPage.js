// p310: خريطة الطاولات البصرية — حالة حية لكل طاولة مع طلبها النشط
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { errText } from '../lib/errorText';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { UtensilsCrossed, Plus, Trash2, Clock, RefreshCw, QrCode, Copy } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { startRealtime, onEvent, stopRealtime } from '../lib/realtime';

const elapsedMin = (iso) => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
};

export default function TablesMapPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { user } = useAuth();
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selTable, setSelTable] = useState(null);
  const [tName, setTName] = useState('');
  const [tSeats, setTSeats] = useState('4');
  const [tZone, setTZone] = useState('');
  const [, setTick] = useState(0);

  const fetchAll = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([
        apiClient.get('/restaurant/tables'),
        apiClient.get('/restaurant/kitchen-orders'),
      ]);
      setTables(t.data || []);
      setOrders((o.data || []).filter(x => x.status !== 'served' && x.status !== 'cancelled'));
    } catch (e) { /* جلب دوري صامت */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    startRealtime();
    const un1 = onEvent('kitchen_order.created', fetchAll);
    const un2 = onEvent('kitchen_order.updated', fetchAll);
    const poll = setInterval(fetchAll, 15000);
    const tick = setInterval(() => setTick(x => x + 1), 30000);
    return () => { un1 && un1(); un2 && un2(); clearInterval(poll); clearInterval(tick); stopRealtime(); };
  }, [fetchAll]);

  const addTable = async () => {
    if (!tName.trim()) { toast.error(isAr ? 'اسم الطاولة مطلوب' : 'Nom requis'); return; }
    try {
      await apiClient.post('/restaurant/tables', { name: tName.trim(), seats: parseInt(tSeats) || 4, zone: tZone.trim() || null });
      toast.success(isAr ? 'أُضيفت الطاولة' : 'Table ajoutee');
      setTName(''); setTSeats('4'); setTZone('');
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const deleteTable = async (t) => {
    try {
      await apiClient.delete(`/restaurant/tables/${t.id}`);
      toast.success(isAr ? 'حُذفت الطاولة' : 'Table supprimee');
      setSelTable(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const checkout = async (t) => {
    try {
      await apiClient.post(`/restaurant/tables/${t.id}/checkout`, {});
      toast.success(isAr ? 'حُرّرت الطاولة' : 'Table liberee');
      setSelTable(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const activeOrder = (t) => orders.find(o => o.id === t.active_order_id);
  const zones = [...new Set(tables.map(t => t.zone).filter(Boolean))];
  const zoneOf = (z) => tables.filter(t => (t.zone || '') === z);
  const groups = zones.length ? [...zones.map(z => ({ z, list: zoneOf(z) })), { z: '', list: zoneOf('') }].filter(g => g.list.length)
    : [{ z: '', list: tables }];

  return (
    <Layout>
      <div className="p-4 space-y-4" dir="rtl" data-testid="tables-map-page">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="h-7 w-7" /> {isAr ? 'خريطة الطاولات' : 'Plan des tables'}
          </h1>
          <Button variant="outline" size="sm" onClick={fetchAll} data-testid="tables-refresh">
            <RefreshCw className="h-4 w-4 ml-1" /> {isAr ? 'تحديث' : 'Rafraichir'}
          </Button>
        </div>

        <Card>
          <CardContent className="p-3 flex flex-wrap gap-2 items-center">
            <Input value={tName} onChange={e => setTName(e.target.value)} placeholder={isAr ? 'اسم الطاولة (T1)' : 'Nom'} className="w-40" data-testid="table-add-name" />
            <Input value={tSeats} onChange={e => setTSeats(e.target.value)} type="number" min="1" className="w-20" dir="ltr" title={isAr ? 'المقاعد' : 'Places'} data-testid="table-add-seats" />
            <Input value={tZone} onChange={e => setTZone(e.target.value)} placeholder={isAr ? 'المنطقة (اختياري)' : 'Zone'} className="w-32" data-testid="table-add-zone" />
            <Button onClick={addTable} data-testid="table-add-btn"><Plus className="h-4 w-4 ml-1" />{isAr ? 'إضافة طاولة' : 'Ajouter'}</Button>
          </CardContent>
        </Card>

        {loading ? <p className="text-muted-foreground">{isAr ? 'جارٍ التحميل...' : 'Chargement...'}</p> : (
          groups.map(g => (
            <div key={g.z || '_'} className="space-y-2">
              {g.z ? <h2 className="font-semibold text-sm text-muted-foreground">{g.z}</h2> : null}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {g.list.map(t => {
                  const occ = !!t.active_order_id;
                  const ord = activeOrder(t);
                  const mins = ord ? elapsedMin(ord.created_at) : 0;
                  const late = occ && mins >= 15;
                  return (
                    <Card key={t.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${occ ? (late ? 'border-destructive bg-destructive/5' : 'border-amber-500 bg-amber-50/50') : 'border-emerald-500/50'}`}
                      data-testid={`table-card-${t.id}`}
                      onClick={() => setSelTable(t)}>
                      <CardContent className="p-3 text-center space-y-1">
                        <div className="font-bold text-lg">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.seats} {isAr ? 'مقاعد' : 'places'}</div>
                        <Badge variant={occ ? (late ? 'destructive' : 'secondary') : 'default'}
                          className={occ ? '' : 'bg-emerald-600'}>
                          {occ ? (isAr ? 'مشغولة' : 'Occupee') : (isAr ? 'فارغة' : 'Libre')}
                        </Badge>
                        {ord && (
                          <div className={`text-xs flex items-center justify-center gap-1 ${late ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                            <Clock className="h-3 w-3" /> {mins} {isAr ? 'د' : 'min'}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {!loading && tables.length === 0 && (
          <p className="text-center text-muted-foreground py-10">{isAr ? 'لا طاولات بعد — أضف أول طاولة أعلاه' : 'Aucune table'}</p>
        )}

        <Dialog open={!!selTable} onOpenChange={(o) => { if (!o) setSelTable(null); }}>
          <DialogContent className="max-w-sm" data-testid="table-dialog">
            <DialogHeader><DialogTitle>{selTable?.name}</DialogTitle></DialogHeader>
            {selTable && (() => {
              const ord = activeOrder(selTable);
              return (
                <div className="space-y-3">
                  {ord ? (
                    <>
                      <div className="text-sm">
                        <span className="font-semibold">{ord.code}</span>
                        <span className="text-muted-foreground"> — {ord.waiter_name || '-'}</span>
                      </div>
                      <ul className="text-sm space-y-1 border rounded p-2 max-h-48 overflow-y-auto">
                        {(ord.items || []).map((it, i) => (
                          <li key={i} className="flex justify-between gap-2">
                            <span>{it.product_name}{it.note ? <span className="text-xs text-amber-700"> ({it.note})</span> : null}</span>
                            <span className="font-mono">×{it.quantity}</span>
                          </li>
                        ))}
                      </ul>
                      <Button className="w-full min-h-[44px]" onClick={() => checkout(selTable)} data-testid="table-checkout-btn">
                        {isAr ? 'إنهاء وتحرير الطاولة' : 'Cloturer et liberer'}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{isAr ? 'الطاولة فارغة — أنشئ طلبًا من نقطة البيع' : 'Table libre — commande via le POS'}</p>
                  )}
                  {/* p311: رمز QR للطلب من الطاولة */}
                  <div className="border rounded p-3 flex flex-col items-center gap-2" data-testid={`table-qr-${selTable.id}`}>
                    <QRCodeCanvas value={`${window.location.origin}/r/${user?.tenant_id}/${selTable.id}`} size={140} />  {/* p325: رمز مطبوع دائم — المسح ينشئ رابط طلب مؤقتًا */}
                    <p className="text-[11px] text-muted-foreground text-center break-all" dir="ltr">{`${window.location.origin}/r/${user?.tenant_id}/${selTable.id}`}</p>
                    <Button variant="outline" size="sm" className="w-full"
                      data-testid={`table-qr-copy-${selTable.id}`}
                      onClick={() => { try { navigator.clipboard.writeText(`${window.location.origin}/r/${user?.tenant_id}/${selTable.id}`); toast.success(isAr ? 'نُسخ الرابط' : 'Lien copie'); } catch (e) {} }}>
                      <Copy className="h-4 w-4 ml-1" />{isAr ? 'نسخ رابط الطلب' : 'Copier le lien'}
                    </Button>
                    {/* p325: الرمز المطبوع دائم — روابط الطلب المؤقتة تموت عند تحرير الطاولة */}
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 text-center">
                      {isAr ? 'هذا الرمز دائم — اطبعه مرة واحدة. كل مسح ينشئ رابط طلب مؤقتًا يموت تلقائيًا بعد الدفع، فلا يمكن لزبون قديم الطلب من بيته' : 'QR permanent — lien de commande temporaire'}
                    </p>
                    <Button variant="outline" size="sm" className="w-full"
                      data-testid={`table-qr-rotate-${selTable.id}`}
                      onClick={async () => {
                        try {
                          await apiClient.post(`/restaurant/tables/${selTable.id}/rotate-qr`);
                          toast.success(isAr ? 'جُدّد الرابط — الرابط السابق مات فورًا' : 'Lien renouvele');
                          setSelTable(null);
                          fetchAll();
                        } catch (e) { toast.error(isAr ? 'فشل التجديد' : 'Echec'); }
                      }}>
                      <RefreshCw className="h-4 w-4 ml-1" />{isAr ? 'تجديد الرابط الآن' : 'Renouveler le lien'}
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full text-destructive" onClick={() => deleteTable(selTable)} data-testid={`table-delete-${selTable.id}`}>
                    <Trash2 className="h-4 w-4 ml-1" />{isAr ? 'حذف الطاولة' : 'Supprimer'}
                  </Button>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
