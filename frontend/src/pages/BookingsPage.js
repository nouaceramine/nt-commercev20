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
import { CalendarCheck, Plus, Loader2, Trash2, CheckCircle2, XCircle, Ban, RefreshCw } from 'lucide-react';

// M7: generalized bookings (الحجوزات العامة) — any resource, clash-safe, with deposits.
const STATUS_META = {
  booked:    { ar: 'محجوز',       fr: 'Réservé',   cls: 'bg-blue-100 text-blue-700' },
  confirmed: { ar: 'مؤكد',        fr: 'Confirmé',  cls: 'bg-green-100 text-green-700' },
  completed: { ar: 'مكتمل',       fr: 'Terminé',   cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { ar: 'ملغى',        fr: 'Annulé',    cls: 'bg-gray-200 text-gray-700' },
  no_show:   { ar: 'لم يحضر',     fr: 'Absent',    cls: 'bg-red-100 text-red-700' },
};
const TYPE_META = {
  room: { ar: 'غرفة', fr: 'Salle' }, equipment: { ar: 'معدّات', fr: 'Équipement' },
  vehicle: { ar: 'مركبة', fr: 'Véhicule' }, staff: { ar: 'موظف', fr: 'Employé' },
  hall: { ar: 'قاعة', fr: 'Hall' }, other: { ar: 'أخرى', fr: 'Autre' },
};

const BookingsPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const cur = isAr ? 'دج' : 'DA';

  const [resources, setResources] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [filterResource, setFilterResource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cashBoxes, setCashBoxes] = useState([]);

  const [resOpen, setResOpen] = useState(false);
  const [resForm, setResForm] = useState({ name: '', type: 'other', capacity: 1, notes: '' });
  const [bkOpen, setBkOpen] = useState(false);
  const [bkForm, setBkForm] = useState({
    resource_id: '', customer_name: '', customer_phone: '',
    start: '', end: '', deposit: 0, deposit_box: 'cash', notes: '',
  });
  const [cancelTarget, setCancelTarget] = useState(null);
  const [refundBox, setRefundBox] = useState('cash');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterResource) params.resource_id = filterResource;
      if (filterStatus) params.status = filterStatus;
      const [r, b] = await Promise.all([
        apiClient.get('/bookings/resources'),
        apiClient.get('/bookings', { params }),
      ]);
      setResources(r.data.items || []);
      setBookings(b.data.items || []);
    } catch (_e) {
      toast.error(isAr ? 'فشل التحميل' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [filterResource, filterStatus, isAr]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    apiClient.get('/cash-boxes').then(r => {
      const d = Array.isArray(r.data) ? r.data : (r.data.items || []);
      setCashBoxes(d.filter(b => b.type !== 'ecom'));
    }).catch(() => {});
  }, []);

  const createResource = async () => {
    setSaving(true);
    try {
      await apiClient.post('/bookings/resources', resForm);
      toast.success(isAr ? 'أُضيف المورد' : 'Ressource ajoutée');
      setResOpen(false);
      setResForm({ name: '', type: 'other', capacity: 1, notes: '' });
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل' : 'Échec'));
    } finally { setSaving(false); }
  };

  const deleteResource = async (r) => {
    try {
      await apiClient.delete(`/bookings/resources/${r.id}`);
      toast.success(isAr ? 'حُذف المورد' : 'Supprimée');
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الحذف' : 'Échec'));
    }
  };

  const createBooking = async () => {
    setSaving(true);
    try {
      const payload = {
        ...bkForm,
        start: bkForm.start ? new Date(bkForm.start).toISOString() : '',
        end: bkForm.end ? new Date(bkForm.end).toISOString() : '',
        deposit: Number(bkForm.deposit) || 0,
      };
      const r = await apiClient.post('/bookings', payload);
      toast.success(isAr ? `حجز ${r.data.code} — ${r.data.customer_name}` : `Réservation ${r.data.code}`);
      setBkOpen(false);
      setBkForm({ resource_id: '', customer_name: '', customer_phone: '', start: '', end: '', deposit: 0, deposit_box: 'cash', notes: '' });
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الحجز' : 'Échec'));
    } finally { setSaving(false); }
  };

  const setStatus = async (b, status, extra = {}) => {
    try {
      await apiClient.put(`/bookings/${b.id}/status`, { status, ...extra });
      toast.success(isAr ? `أصبح «${STATUS_META[status].ar}»` : 'Statut mis à jour');
      setCancelTarget(null);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل' : 'Échec'));
    }
  };

  const fmt = (iso) => {
    try { return new Date(iso).toLocaleString(isAr ? 'ar-DZ' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' }); }
    catch (_e) { return iso; }
  };

  return (
    <Layout>
      <div className="space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarCheck className="h-6 w-6" />
            {isAr ? 'الحجوزات العامة' : 'Réservations'}
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setResOpen(true)}>
              <Plus className="h-4 w-4 me-1" />{isAr ? 'مورد جديد' : 'Ressource'}
            </Button>
            <Button onClick={() => setBkOpen(true)}>
              <Plus className="h-4 w-4 me-1" />{isAr ? 'حجز جديد' : 'Nouvelle réservation'}
            </Button>
            <Button variant="outline" onClick={loadAll} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* resources strip */}
        <div className="flex flex-wrap gap-2">
          <Badge
            className={`cursor-pointer px-3 py-2 ${!filterResource ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
            onClick={() => setFilterResource('')}>
            {isAr ? 'كل الموارد' : 'Toutes'} ({resources.length})
          </Badge>
          {resources.map(r => (
            <Badge key={r.id}
              className={`cursor-pointer px-3 py-2 ${filterResource === r.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              onClick={() => setFilterResource(filterResource === r.id ? '' : r.id)}>
              {r.name} · {TYPE_META[r.type]?.[isAr ? 'ar' : 'fr'] || r.type}
            </Badge>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{isAr ? 'الحجوزات' : 'Réservations'} ({bookings.length})</CardTitle>
            <Select value={filterStatus || 'all'} onValueChange={v => setFilterStatus(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? 'كل الحالات' : 'Tous statuts'}</SelectItem>
                {Object.keys(STATUS_META).map(s => (
                  <SelectItem key={s} value={s}>{isAr ? STATUS_META[s].ar : STATUS_META[s].fr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
            ) : bookings.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">{isAr ? 'لا حجوزات' : 'Aucune réservation'}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-2 text-start">{isAr ? 'الكود' : 'Code'}</th>
                    <th className="p-2 text-start">{isAr ? 'المورد' : 'Ressource'}</th>
                    <th className="p-2 text-start">{isAr ? 'الزبون' : 'Client'}</th>
                    <th className="p-2 text-start">{isAr ? 'الفترة' : 'Période'}</th>
                    <th className="p-2">{isAr ? 'العربون' : 'Acompte'}</th>
                    <th className="p-2">{isAr ? 'الحالة' : 'Statut'}</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => {
                    const sm = STATUS_META[b.status] || STATUS_META.booked;
                    return (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="p-2 font-mono">{b.code}</td>
                        <td className="p-2">{b.resource_name}</td>
                        <td className="p-2">{b.customer_name}<div className="text-xs text-muted-foreground">{b.customer_phone}</div></td>
                        <td className="p-2 text-xs">{fmt(b.start)}<br />→ {fmt(b.end)}</td>
                        <td className="p-2 text-center">
                          {b.deposit > 0 ? (
                            <span>{b.deposit.toLocaleString()} {cur}
                              {b.deposit_refunded && <div className="text-xs text-red-600">{isAr ? 'مسترد' : 'Remboursé'}</div>}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="p-2 text-center"><Badge className={sm.cls}>{isAr ? sm.ar : sm.fr}</Badge></td>
                        <td className="p-2 text-center whitespace-nowrap">
                          {b.status === 'booked' && (
                            <Button size="icon" variant="ghost" title={isAr ? 'تأكيد' : 'Confirmer'} onClick={() => setStatus(b, 'confirmed')}>
                              <CheckCircle2 className="h-4 w-4 text-green-700" />
                            </Button>
                          )}
                          {b.status === 'confirmed' && (
                            <Button size="icon" variant="ghost" title={isAr ? 'إتمام' : 'Terminer'} onClick={() => setStatus(b, 'completed')}>
                              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                            </Button>
                          )}
                          {(b.status === 'booked' || b.status === 'confirmed') && (
                            <>
                              <Button size="icon" variant="ghost" title={isAr ? 'لم يحضر' : 'Absent'} onClick={() => setStatus(b, 'no_show')}>
                                <Ban className="h-4 w-4 text-orange-600" />
                              </Button>
                              <Button size="icon" variant="ghost" title={isAr ? 'إلغاء' : 'Annuler'} onClick={() => { setCancelTarget(b); setRefundBox(b.deposit_box || 'cash'); }}>
                                <XCircle className="h-4 w-4 text-red-600" />
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* resource management */}
        <Card>
          <CardHeader><CardTitle>{isAr ? 'الموارد' : 'Ressources'} ({resources.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {resources.map(r => (
              <div key={r.id} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">{TYPE_META[r.type]?.[isAr ? 'ar' : 'fr']} · {r.capacity}</span>
                <Button size="icon" variant="ghost" onClick={() => deleteResource(r)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ))}
            {resources.length === 0 && <span className="text-muted-foreground text-sm">{isAr ? 'أضف أول مورد (قاعة، معدّات، مركبة...)' : 'Ajoutez une première ressource'}</span>}
          </CardContent>
        </Card>

        {/* new resource dialog */}
        <Dialog open={resOpen} onOpenChange={setResOpen}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'مورد جديد' : 'Nouvelle ressource'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{isAr ? 'الاسم' : 'Nom'}</Label>
                <Input value={resForm.name} onChange={e => setResForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>{isAr ? 'النوع' : 'Type'}</Label>
                <Select value={resForm.type} onValueChange={v => setResForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(TYPE_META).map(t => <SelectItem key={t} value={t}>{isAr ? TYPE_META[t].ar : TYPE_META[t].fr}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>{isAr ? 'السعة' : 'Capacité'}</Label>
                <Input type="number" min="1" value={resForm.capacity} onChange={e => setResForm(f => ({ ...f, capacity: Number(e.target.value) }))} /></div>
              <Button className="w-full" onClick={createResource} disabled={saving || !resForm.name.trim()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}{isAr ? 'إضافة' : 'Ajouter'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* new booking dialog */}
        <Dialog open={bkOpen} onOpenChange={setBkOpen}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'حجز جديد' : 'Nouvelle réservation'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{isAr ? 'المورد' : 'Ressource'}</Label>
                <Select value={bkForm.resource_id} onValueChange={v => setBkForm(f => ({ ...f, resource_id: v }))}>
                  <SelectTrigger><SelectValue placeholder={isAr ? 'اختر...' : 'Choisir...'} /></SelectTrigger>
                  <SelectContent>
                    {resources.filter(r => r.active !== false).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{isAr ? 'اسم الزبون' : 'Client'}</Label>
                  <Input value={bkForm.customer_name} onChange={e => setBkForm(f => ({ ...f, customer_name: e.target.value }))} /></div>
                <div><Label>{isAr ? 'الهاتف' : 'Téléphone'}</Label>
                  <Input value={bkForm.customer_phone} onChange={e => setBkForm(f => ({ ...f, customer_phone: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{isAr ? 'من' : 'Début'}</Label>
                  <Input type="datetime-local" value={bkForm.start} onChange={e => setBkForm(f => ({ ...f, start: e.target.value }))} /></div>
                <div><Label>{isAr ? 'إلى' : 'Fin'}</Label>
                  <Input type="datetime-local" value={bkForm.end} onChange={e => setBkForm(f => ({ ...f, end: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{isAr ? 'العربون (اختياري)' : 'Acompte (optionnel)'}</Label>
                  <Input type="number" min="0" value={bkForm.deposit} onChange={e => setBkForm(f => ({ ...f, deposit: e.target.value }))} /></div>
                {Number(bkForm.deposit) > 0 && (
                  <div><Label>{isAr ? 'صندوق العربون' : 'Caisse'}</Label>
                    <Select value={bkForm.deposit_box} onValueChange={v => setBkForm(f => ({ ...f, deposit_box: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {cashBoxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select></div>
                )}
              </div>
              <Button className="w-full" onClick={createBooking}
                disabled={saving || !bkForm.resource_id || !bkForm.customer_name.trim() || !bkForm.start || !bkForm.end}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}{isAr ? 'تأكيد الحجز' : 'Confirmer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* cancel dialog (deposit refund guard) */}
        <Dialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'إلغاء الحجز' : 'Annuler'} {cancelTarget?.code}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {cancelTarget?.deposit_paid && !cancelTarget?.deposit_refunded ? (
                <>
                  <p className="text-sm">{isAr ? `لهذا الحجز عربون مدفوع: ${cancelTarget.deposit.toLocaleString()} ${cur}. سيُسترد تلقائياً من:` : 'Acompte payé — remboursement depuis:'}</p>
                  <Select value={refundBox} onValueChange={setRefundBox}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {cashBoxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button variant="destructive" className="w-full"
                    onClick={() => setStatus(cancelTarget, 'cancelled', { refund_deposit: true, refund_box: refundBox })}>
                    {isAr ? 'إلغاء + استرداد العربون' : 'Annuler + rembourser'}
                  </Button>
                </>
              ) : (
                <Button variant="destructive" className="w-full" onClick={() => setStatus(cancelTarget, 'cancelled')}>
                  {isAr ? 'تأكيد الإلغاء' : "Confirmer l'annulation"}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default BookingsPage;
