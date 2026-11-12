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
import { FileText, Plus, Trash2, Loader2, Send, Check, X, ArrowRightLeft, Search } from 'lucide-react';

// M1: quotations (عروض الأسعار) — draft -> sent -> accepted -> convert to sale.
const STATUS_META = {
  draft:     { ar: 'مسودة',   fr: 'Brouillon', cls: 'bg-gray-200 text-gray-700' },
  sent:      { ar: 'مُرسل',    fr: 'Envoyé',    cls: 'bg-blue-100 text-blue-700' },
  accepted:  { ar: 'مقبول',   fr: 'Accepté',   cls: 'bg-green-100 text-green-700' },
  rejected:  { ar: 'مرفوض',   fr: 'Refusé',    cls: 'bg-red-100 text-red-700' },
  expired:   { ar: 'منتهي',   fr: 'Expiré',    cls: 'bg-orange-100 text-orange-700' },
  converted: { ar: 'محوَّل',  fr: 'Converti',  cls: 'bg-purple-100 text-purple-700' },
};

const emptyLine = () => ({ product_id: '', name: '', quantity: 1, price: 0, discount: 0 });

const QuotationsPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const cur = isAr ? 'دج' : 'DA';

  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertForm, setConvertForm] = useState({ payment_type: 'cash', payment_method: 'cash', paid_amount: '' });
  const [customers, setCustomers] = useState([]);
  const [productQuery, setProductQuery] = useState('');
  const [productHits, setProductHits] = useState([]);
  const [form, setForm] = useState({ customer_id: '', customer_name: '', discount: 0, validity_days: 15, notes: '', lines: [emptyLine()] });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter !== 'all' ? `?status=${statusFilter}` : '?';
      const s = search ? `${q}&search=${encodeURIComponent(search)}` : q;
      const [listRes, statsRes] = await Promise.all([
        apiClient.get(`/quotations${s}`),
        apiClient.get('/quotations/stats'),
      ]);
      setItems(listRes.data.items || []);
      setStats(statsRes.data);
    } catch (_e) {
      toast.error(isAr ? 'فشل تحميل عروض الأسعار' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, isAr]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    apiClient.get('/customers').then(r => setCustomers(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!productQuery) { setProductHits([]); return; }
    const t = setTimeout(() => {
      apiClient.get(`/products?search=${encodeURIComponent(productQuery)}&limit=8`)
        .then(r => setProductHits(Array.isArray(r.data) ? r.data : (r.data.items || [])))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [productQuery]);

  const lineTotal = (l) => Math.max(0, (parseFloat(l.quantity) || 0) * (parseFloat(l.price) || 0) - (parseFloat(l.discount) || 0));
  const formSubtotal = form.lines.reduce((a, l) => a + lineTotal(l), 0);
  const formTotal = Math.max(0, formSubtotal - (parseFloat(form.discount) || 0));

  const openCreate = () => {
    setEditId(null);
    setForm({ customer_id: '', customer_name: '', discount: 0, validity_days: 15, notes: '', lines: [emptyLine()] });
    setDialogOpen(true);
  };

  const openEdit = (q) => {
    setEditId(q.id);
    setForm({
      customer_id: q.customer_id || '', customer_name: q.customer_name || '',
      discount: q.discount || 0, validity_days: q.validity_days || 15, notes: q.notes || '',
      lines: (q.items || []).map(l => ({ product_id: l.product_id, name: l.name, quantity: l.quantity, price: l.price, discount: l.discount || 0 })),
    });
    setDialogOpen(true);
  };

  const setLine = (i, patch) => setForm(f => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const save = async () => {
    const lines = form.lines.filter(l => l.product_id && (parseFloat(l.quantity) || 0) > 0);
    if (!lines.length) { toast.error(isAr ? 'أضف صنفاً واحداً على الأقل' : 'Ajoutez au moins un article'); return; }
    setSaving(true);
    try {
      const payload = {
        customer_id: form.customer_id || null,
        customer_name: form.customer_name,
        items: lines.map(l => ({ product_id: l.product_id, quantity: parseFloat(l.quantity), price: parseFloat(l.price) || 0, discount: parseFloat(l.discount) || 0 })),
        discount: parseFloat(form.discount) || 0,
        validity_days: parseInt(form.validity_days, 10) || 15,
        notes: form.notes,
      };
      if (editId) {
        await apiClient.put(`/quotations/${editId}`, payload);
        toast.success(isAr ? 'تم تحديث العرض' : 'Devis mis à jour');
      } else {
        await apiClient.post('/quotations', payload);
        toast.success(isAr ? 'تم إنشاء العرض' : 'Devis créé');
      }
      setDialogOpen(false);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الحفظ' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (q, status) => {
    try {
      await apiClient.post(`/quotations/${q.id}/status`, { status });
      toast.success(isAr ? 'تم تحديث الحالة' : 'Statut mis à jour');
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل تحديث الحالة' : 'Échec'));
    }
  };

  const doConvert = async () => {
    if (!convertTarget) return;
    setSaving(true);
    try {
      const payload = { payment_type: convertForm.payment_type, payment_method: convertForm.payment_method };
      if (convertForm.payment_type === 'partial' && convertForm.paid_amount !== '') {
        payload.paid_amount = parseFloat(convertForm.paid_amount) || 0;
      }
      const r = await apiClient.post(`/quotations/${convertTarget.id}/convert`, payload);
      toast.success(isAr ? `تم التحويل إلى فاتورة ${r.data?.sale?.invoice_number || ''}` : 'Converti en facture');
      setConvertTarget(null);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل التحويل' : 'Échec conversion'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (q) => {
    try {
      await apiClient.delete(`/quotations/${q.id}`);
      toast.success(isAr ? 'تم الحذف' : 'Supprimé');
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الحذف' : 'Échec'));
    }
  };

  const statusBadge = (st) => {
    const m = STATUS_META[st] || STATUS_META.draft;
    return <Badge className={m.cls}>{isAr ? m.ar : m.fr}</Badge>;
  };

  return (
    <Layout>
      <div className="p-4 space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> {isAr ? 'عروض الأسعار' : 'Devis'}
          </h1>
          <Button onClick={openCreate}><Plus className="h-4 w-4 me-1" />{isAr ? 'عرض جديد' : 'Nouveau devis'}</Button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {Object.keys(STATUS_META).map(st => (
              <Card key={st} className="cursor-pointer" onClick={() => setStatusFilter(st)}>
                <CardContent className="p-3 text-center">
                  <div className="text-lg font-bold">{stats.by_status?.[st]?.count || 0}</div>
                  <div className="text-xs text-muted-foreground">{isAr ? STATUS_META[st].ar : STATUS_META[st].fr}</div>
                  <div className="text-xs">{(stats.by_status?.[st]?.amount || 0).toLocaleString()} {cur}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-4 w-4 absolute top-3 start-2 text-muted-foreground" />
            <Input className="ps-8 w-64" placeholder={isAr ? 'بحث برقم العرض أو الزبون' : 'N° ou client'}
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? 'كل الحالات' : 'Tous'}</SelectItem>
              {Object.keys(STATUS_META).map(st => (
                <SelectItem key={st} value={st}>{isAr ? STATUS_META[st].ar : STATUS_META[st].fr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader><CardTitle>{isAr ? 'العروض' : 'Devis'} ({items.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">{isAr ? 'لا توجد عروض أسعار بعد' : 'Aucun devis'}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="p-2 text-start">{isAr ? 'الرقم' : 'N°'}</th>
                      <th className="p-2 text-start">{isAr ? 'الزبون' : 'Client'}</th>
                      <th className="p-2 text-start">{isAr ? 'الإجمالي' : 'Total'}</th>
                      <th className="p-2 text-start">{isAr ? 'صالح حتى' : 'Valide jusqu\'au'}</th>
                      <th className="p-2 text-start">{isAr ? 'الحالة' : 'Statut'}</th>
                      <th className="p-2 text-start">{isAr ? 'إجراءات' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(q => (
                      <tr key={q.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-mono">{q.number}</td>
                        <td className="p-2">{q.customer_name}</td>
                        <td className="p-2 font-semibold">{(q.total || 0).toLocaleString()} {cur}</td>
                        <td className="p-2 text-xs">{(q.valid_until || '').slice(0, 10)}</td>
                        <td className="p-2">{statusBadge(q.status)}</td>
                        <td className="p-2">
                          <div className="flex gap-1 flex-wrap">
                            {q.status === 'draft' && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => openEdit(q)}>{isAr ? 'تعديل' : 'Modifier'}</Button>
                                <Button size="sm" variant="outline" onClick={() => setStatus(q, 'sent')}><Send className="h-3 w-3" /></Button>
                              </>
                            )}
                            {q.status === 'sent' && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => setStatus(q, 'accepted')}><Check className="h-3 w-3" /></Button>
                                <Button size="sm" variant="outline" onClick={() => setStatus(q, 'rejected')}><X className="h-3 w-3" /></Button>
                              </>
                            )}
                            {(q.status === 'rejected' || q.status === 'expired') && (
                              <Button size="sm" variant="outline" onClick={() => setStatus(q, 'draft')}>{isAr ? 'إعادة فتح' : 'Rouvrir'}</Button>
                            )}
                            {['draft', 'sent', 'accepted'].includes(q.status) && (
                              <Button size="sm" onClick={() => { setConvertTarget(q); setConvertForm({ payment_type: 'cash', payment_method: 'cash', paid_amount: '' }); }}>
                                <ArrowRightLeft className="h-3 w-3 me-1" />{isAr ? 'تحويل' : 'Convertir'}
                              </Button>
                            )}
                            {['draft', 'rejected', 'expired'].includes(q.status) && (
                              <Button size="sm" variant="destructive" onClick={() => remove(q)}><Trash2 className="h-3 w-3" /></Button>
                            )}
                            {q.status === 'converted' && q.converted_sale_id && (
                              <span className="text-xs text-muted-foreground">{isAr ? 'فاتورة مرتبطة' : 'Facture liée'}</span>
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

        {/* Create / edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{editId ? (isAr ? 'تعديل العرض' : 'Modifier le devis') : (isAr ? 'عرض سعر جديد' : 'Nouveau devis')}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{isAr ? 'الزبون' : 'Client'}</Label>
                  <Select value={form.customer_id || '__walkin__'} onValueChange={v => setForm(f => ({ ...f, customer_id: v === '__walkin__' ? '' : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__walkin__">{isAr ? 'زبون عابر' : 'Client de passage'}</SelectItem>
                      {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{isAr ? 'اسم الزبون (اختياري)' : 'Nom client (optionnel)'}</Label>
                  <Input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
                </div>
                <div>
                  <Label>{isAr ? 'صالح لمدة (أيام)' : 'Validité (jours)'}</Label>
                  <Input type="number" min="1" value={form.validity_days} onChange={e => setForm(f => ({ ...f, validity_days: e.target.value }))} />
                </div>
                <div>
                  <Label>{isAr ? 'خصم على الإجمالي' : 'Remise globale'}</Label>
                  <Input type="number" min="0" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} />
                </div>
              </div>

              <div>
                <Label>{isAr ? 'الأصناف' : 'Articles'}</Label>
                <div className="relative mb-2">
                  <Input placeholder={isAr ? 'ابحث عن منتج لإضافته' : 'Rechercher un produit'}
                    value={productQuery} onChange={e => setProductQuery(e.target.value)} />
                  {productHits.length > 0 && (
                    <div className="absolute z-10 bg-popover border rounded w-full max-h-48 overflow-y-auto shadow">
                      {productHits.map(p => (
                        <button key={p.id} type="button" className="w-full text-start p-2 hover:bg-muted text-sm"
                          onClick={() => {
                            setForm(f => ({ ...f, lines: [...f.lines.filter(l => l.product_id), { product_id: p.id, name: p.name_ar || p.name_en || p.name, quantity: 1, price: p.retail_price || 0, discount: 0 }] }));
                            setProductQuery(''); setProductHits([]);
                          }}>
                          {(p.name_ar || p.name_en || p.name)} — {(p.retail_price || 0).toLocaleString()} {cur}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {form.lines.filter(l => l.product_id).length > 0 && (
                  <table className="w-full text-sm border rounded">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="p-1 text-start">{isAr ? 'المنتج' : 'Produit'}</th>
                        <th className="p-1">{isAr ? 'الكمية' : 'Qté'}</th>
                        <th className="p-1">{isAr ? 'السعر' : 'Prix'}</th>
                        <th className="p-1">{isAr ? 'خصم' : 'Remise'}</th>
                        <th className="p-1">{isAr ? 'المجموع' : 'Total'}</th>
                        <th className="p-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.lines.map((l, i) => l.product_id ? (
                        <tr key={i} className="border-b">
                          <td className="p-1">{l.name}</td>
                          <td className="p-1 w-20"><Input type="number" min="0" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} /></td>
                          <td className="p-1 w-24"><Input type="number" min="0" value={l.price} onChange={e => setLine(i, { price: e.target.value })} /></td>
                          <td className="p-1 w-20"><Input type="number" min="0" value={l.discount} onChange={e => setLine(i, { discount: e.target.value })} /></td>
                          <td className="p-1 font-semibold">{lineTotal(l).toLocaleString()}</td>
                          <td className="p-1">
                            <Button size="sm" variant="ghost" onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}><Trash2 className="h-3 w-3" /></Button>
                          </td>
                        </tr>
                      ) : null)}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <Label>{isAr ? 'ملاحظات' : 'Notes'}</Label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="flex justify-between items-center border-t pt-3">
                <div className="text-sm">
                  {isAr ? 'المجموع الفرعي' : 'Sous-total'}: <b>{formSubtotal.toLocaleString()}</b> {cur}
                  {' — '}{isAr ? 'الإجمالي' : 'Total'}: <b className="text-lg">{formTotal.toLocaleString()}</b> {cur}
                </div>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                  {isAr ? 'حفظ' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Convert dialog */}
        <Dialog open={!!convertTarget} onOpenChange={(o) => !o && setConvertTarget(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? `تحويل ${convertTarget?.number || ''} إلى فاتورة` : 'Convertir en facture'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="text-sm">{isAr ? 'الإجمالي' : 'Total'}: <b>{(convertTarget?.total || 0).toLocaleString()} {cur}</b></div>
              <div>
                <Label>{isAr ? 'نوع الدفع' : 'Type de paiement'}</Label>
                <Select value={convertForm.payment_type} onValueChange={v => setConvertForm(f => ({ ...f, payment_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{isAr ? 'نقدي (كامل)' : 'Espèces'}</SelectItem>
                    <SelectItem value="credit">{isAr ? 'آجل (دين)' : 'Crédit'}</SelectItem>
                    <SelectItem value="partial">{isAr ? 'جزئي' : 'Partiel'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {convertForm.payment_type === 'partial' && (
                <div>
                  <Label>{isAr ? 'المبلغ المدفوع' : 'Montant payé'}</Label>
                  <Input type="number" min="0" value={convertForm.paid_amount} onChange={e => setConvertForm(f => ({ ...f, paid_amount: e.target.value }))} />
                </div>
              )}
              <Button className="w-full" onClick={doConvert} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {isAr ? 'تأكيد التحويل' : 'Confirmer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default QuotationsPage;
