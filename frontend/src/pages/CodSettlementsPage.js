import _React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { HandCoins, Plus, Loader2, XCircle, Eye } from 'lucide-react';

// M4: COD settlement batches (مصالحة الدفع عند الاستلام) — courier payout reconciliation.
const STATUS_META = {
  open:                  { ar: 'مفتوحة',          fr: 'Ouverte',        cls: 'bg-blue-100 text-blue-700' },
  settled:               { ar: 'مسوّاة',           fr: 'Réglée',         cls: 'bg-green-100 text-green-700' },
  settled_with_variance: { ar: 'مسوّاة بفرق',      fr: 'Réglée (écart)', cls: 'bg-orange-100 text-orange-700' },
  cancelled:             { ar: 'ملغاة',            fr: 'Annulée',        cls: 'bg-gray-200 text-gray-700' },
};

const CodSettlementsPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const cur = isAr ? 'دج' : 'DA';

  const [items, setItems] = useState([]);
  const [openExpected, setOpenExpected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [courier, setCourier] = useState('');
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [receiveForm, setReceiveForm] = useState({ received_amount: '', target_box: 'cash' });
  const [detail, setDetail] = useState(null);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/cod-settlements');
      setItems(r.data.items || []);
      setOpenExpected(r.data.open_expected || 0);
    } catch (_e) {
      toast.error(isAr ? 'فشل تحميل الدفعات' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    apiClient.get('/cash-boxes').then(r => {
      const d = Array.isArray(r.data) ? r.data : (r.data.items || []);
      setCashBoxes(d.filter(b => b.type !== 'ecom'));
    }).catch(() => {});
  }, []);

  const create = async () => {
    setSaving(true);
    try {
      const r = await apiClient.post('/cod-settlements', { courier, notes: '' });
      toast.success(isAr ? `دفعة ${r.data.code}: ${r.data.orders_count} طلباً، متوقع ${r.data.expected_amount.toLocaleString()}` : 'Lot créé');
      setCreateOpen(false);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الإنشاء' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const receive = async () => {
    if (!receiveTarget) return;
    setSaving(true);
    try {
      const r = await apiClient.post(`/cod-settlements/${receiveTarget.id}/receive`, {
        received_amount: parseFloat(receiveForm.received_amount) || 0,
        target_box: receiveForm.target_box,
      });
      const v = r.data.variance || 0;
      toast.success(isAr
        ? (Math.abs(v) < 0.01 ? 'تمت التسوية بدون فرق' : `تمت التسوية بفرق ${v.toLocaleString()} ${cur}`)
        : 'Réglé');
      setReceiveTarget(null);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل التحصيل' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (b) => {
    try {
      await apiClient.post(`/cod-settlements/${b.id}/cancel`);
      toast.success(isAr ? 'أُلغيت الدفعة وأُطلقت الطلبات' : 'Lot annulé');
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الإلغاء' : 'Échec'));
    }
  };

  const openDetail = async (b) => {
    try {
      const r = await apiClient.get(`/cod-settlements/${b.id}`);
      setDetail(r.data);
    } catch (_e) {
      toast.error(isAr ? 'فشل جلب التفاصيل' : 'Échec');
    }
  };

  const badge = (st) => {
    const m = STATUS_META[st] || STATUS_META.open;
    return <Badge className={m.cls}>{isAr ? m.ar : m.fr}</Badge>;
  };

  return (
    <Layout>
      <div className="p-4 space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HandCoins className="h-6 w-6" /> {isAr ? 'مصالحة COD' : 'Règlements COD'}
          </h1>
          <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 me-1" />{isAr ? 'دفعة تسوية جديدة' : 'Nouveau lot'}</Button>
        </div>

        <Card>
          <CardContent className="p-3 text-center">
            <div className="text-lg font-bold text-orange-700">{openExpected.toLocaleString()} {cur}</div>
            <div className="text-xs text-muted-foreground">{isAr ? 'مستحقات مفتوحة لدى الناقلين' : 'En attente chez les transporteurs'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{isAr ? 'دفعات التسوية' : 'Lots'} ({items.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">{isAr ? 'لا توجد دفعات بعد' : 'Aucun lot'}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="p-2 text-start">{isAr ? 'الكود' : 'Code'}</th>
                      <th className="p-2 text-start">{isAr ? 'الناقل' : 'Transporteur'}</th>
                      <th className="p-2 text-start">{isAr ? 'الطلبات' : 'Cmd'}</th>
                      <th className="p-2 text-start">{isAr ? 'المتوقع' : 'Attendu'}</th>
                      <th className="p-2 text-start">{isAr ? 'المستلم' : 'Reçu'}</th>
                      <th className="p-2 text-start">{isAr ? 'الفرق' : 'Écart'}</th>
                      <th className="p-2 text-start">{isAr ? 'الحالة' : 'Statut'}</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(b => (
                      <tr key={b.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-mono">{b.code}</td>
                        <td className="p-2">{b.courier}</td>
                        <td className="p-2">{b.orders_count}</td>
                        <td className="p-2">{(b.expected_amount || 0).toLocaleString()}</td>
                        <td className="p-2">{b.received_amount != null ? b.received_amount.toLocaleString() : '—'}</td>
                        <td className={`p-2 font-semibold ${b.variance ? (b.variance < 0 ? 'text-red-600' : 'text-green-700') : ''}`}>
                          {b.variance != null ? b.variance.toLocaleString() : '—'}
                        </td>
                        <td className="p-2">{badge(b.status)}</td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => openDetail(b)}><Eye className="h-3 w-3" /></Button>
                            {b.status === 'open' && (
                              <>
                                <Button size="sm" onClick={() => { setReceiveTarget(b); setReceiveForm({ received_amount: String(b.expected_amount), target_box: 'cash' }); }}>
                                  {isAr ? 'تحصيل' : 'Encaisser'}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => cancel(b)}><XCircle className="h-3 w-3" /></Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* create dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'دفعة تسوية جديدة' : 'Nouveau lot de règlement'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{isAr ? 'الناقل (فارغ = يدوي)' : 'Transporteur (vide = manuel)'}</Label>
                <Input value={courier} onChange={e => setCourier(e.target.value)} placeholder="yalidine / zr ..." />
              </div>
              <div className="text-xs text-muted-foreground">
                {isAr
                  ? 'تجمع كل الطلبات المسلَّمة غير المحصَّلة لهذا الناقل في دفعة واحدة بالمبلغ المتوقع (الإجمالي − رسوم الشحن)'
                  : 'Regroupe les commandes livrées non encaissées'}
              </div>
              <Button className="w-full" onClick={create} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {isAr ? 'إنشاء الدفعة' : 'Créer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* receive dialog */}
        <Dialog open={!!receiveTarget} onOpenChange={(o) => !o && setReceiveTarget(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? `تحصيل ${receiveTarget?.code || ''}` : 'Encaisser'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="text-sm">{isAr ? 'المتوقع' : 'Attendu'}: <b>{(receiveTarget?.expected_amount || 0).toLocaleString()} {cur}</b></div>
              <div>
                <Label>{isAr ? 'المبلغ المستلم فعلياً' : 'Montant reçu'}</Label>
                <Input type="number" min="0" value={receiveForm.received_amount}
                  onChange={e => setReceiveForm(f => ({ ...f, received_amount: e.target.value }))} />
              </div>
              <div>
                <Label>{isAr ? 'التحصيل في صندوق' : 'Caisse'}</Label>
                <Select value={receiveForm.target_box} onValueChange={v => setReceiveForm(f => ({ ...f, target_box: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cashBoxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar || b.name_fr || b.name || b.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={receive} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {isAr ? 'تأكيد التحصيل' : 'Confirmer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* detail dialog */}
        <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'} className="max-w-2xl">
            <DialogHeader><DialogTitle>{isAr ? `الدفعة ${detail?.batch?.code || ''}` : 'Détail'}</DialogTitle></DialogHeader>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-1 text-start">{isAr ? 'الطلب' : 'Cmd'}</th>
                    <th className="p-1 text-start">{isAr ? 'الزبون' : 'Client'}</th>
                    <th className="p-1 text-start">{isAr ? 'التتبع' : 'Suivi'}</th>
                    <th className="p-1 text-start">{isAr ? 'الإجمالي' : 'Total'}</th>
                    <th className="p-1 text-start">{isAr ? 'الشحن' : 'Livr.'}</th>
                    <th className="p-1 text-start">{isAr ? 'الصافي' : 'Net'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.orders || []).map(o => (
                    <tr key={o.id} className="border-b">
                      <td className="p-1 font-mono text-xs">{o.order_code}</td>
                      <td className="p-1">{o.customer_name}</td>
                      <td className="p-1 font-mono text-xs">{o.tracking_number || '—'}</td>
                      <td className="p-1">{(o.total || 0).toLocaleString()}</td>
                      <td className="p-1">{(o.shipping_fee || 0).toLocaleString()}</td>
                      <td className="p-1 font-semibold">{((o.total || 0) - (o.shipping_fee || 0)).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default CodSettlementsPage;
