import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { formatCurrency, formatShortDate } from '../utils/globalDateFormatter';
import { toast } from 'sonner';
import { Tv, Plus, Search, Edit, Trash2, Save, Copy } from 'lucide-react';

const EMPTY = {
  category: 'iptv', service_id: '', service_name: '', customer_id: '', customer_name: '',
  duration_months: '1', line_type: 'm3u', m3u_url: '', username: '', password: '',
  activation_code: '', server_name: '', supplier_name: '', cost: '', price: '',
  start_date: new Date().toISOString().slice(0, 10), reseller_id: '', reseller_name: '',
  payment_method: 'cash', notes: '',
};

const STATUS_STYLE = {
  active: 'bg-green-100 text-green-700 border-green-300',
  expiring: 'bg-amber-100 text-amber-700 border-amber-300',
  expired: 'bg-red-100 text-red-700 border-red-300',
};

export default function IptvSubscriptionsPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';

  const [subs, setSubs] = useState([]);
  const [services, setServices] = useState([]);
  const [resellers, setResellers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sv, r, c] = await Promise.all([
        apiClient.get('/digital-panel/subscriptions'),
        apiClient.get('/digital-panel/services'),
        apiClient.get('/digital-panel/resellers'),
        apiClient.get('/customers').catch(() => ({ data: [] })),
      ]);
      setSubs(s.data || []);
      setServices(sv.data || []);
      setResellers(r.data || []);
      setCustomers(Array.isArray(c.data) ? c.data : (c.data?.items || []));
    } catch (err) {
      // interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      ...EMPTY, ...s,
      duration_months: String(s.duration_months || '1'),
      cost: s.cost ?? '', price: s.price ?? '',
      start_date: (s.start_date || '').slice(0, 10) || EMPTY.start_date,
    });
    setDialogOpen(true);
  };

  const onServiceChange = (id) => {
    const svc = services.find((x) => x.id === id);
    if (!svc) { set('service_id', ''); set('service_name', ''); return; }
    setForm((f) => ({
      ...f,
      service_id: svc.id,
      service_name: svc.name,
      category: svc.category || f.category,
      server_name: svc.server_name || f.server_name,
      supplier_name: svc.supplier_name || f.supplier_name,
      duration_months: svc.duration_months ? String(svc.duration_months) : f.duration_months,
      cost: f.cost === '' && svc.default_cost ? svc.default_cost : f.cost,
      price: f.price === '' && svc.default_price ? svc.default_price : f.price,
    }));
  };

  const onCustomerChange = (id) => {
    if (id === '__none') { set('customer_id', ''); set('customer_name', ''); return; }
    const cust = customers.find((x) => x.id === id);
    setForm((f) => ({ ...f, customer_id: id, customer_name: cust ? cust.name : f.customer_name }));
  };

  const profit = (parseFloat(form.price) || 0) - (parseFloat(form.cost) || 0);

  const save = async () => {
    if (!form.customer_name && !form.customer_id) {
      toast.error(ar ? 'أدخل اسم الزبون' : 'Entrez le nom du client');
      return;
    }
    setSaving(true);
    try {
      const reseller = resellers.find((r) => r.id === form.reseller_id);
      const payload = {
        ...form,
        duration_months: parseInt(form.duration_months) || 1,
        cost: parseFloat(form.cost) || 0,
        price: parseFloat(form.price) || 0,
        reseller_name: reseller ? reseller.name : '',
      };
      if (editing) {
        await apiClient.put(`/digital-panel/subscriptions/${editing.id}`, payload);
        toast.success(ar ? 'تم تحديث الاشتراك' : 'Abonnement mis à jour');
      } else {
        await apiClient.post('/digital-panel/subscriptions', payload);
        toast.success(ar ? 'تم إنشاء الاشتراك' : 'Abonnement créé');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل الحفظ' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/digital-panel/subscriptions/${deleteTarget.id}`);
      toast.success(ar ? 'تم الحذف' : 'Supprimé');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل الحذف' : 'Échec'));
    }
  };

  const copyLine = (s) => {
    const parts = [];
    if (s.m3u_url) parts.push(s.m3u_url);
    if (s.username) parts.push(`${s.username} / ${s.password}`);
    if (s.activation_code) parts.push(s.activation_code);
    navigator.clipboard?.writeText(parts.join('\n'));
    toast.success(ar ? 'تم نسخ بيانات الخط' : 'Données copiées');
  };

  const filtered = subs.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [s.customer_name, s.service_name, s.server_name, s.username, s.activation_code]
      .some((v) => (v || '').toLowerCase().includes(q));
  });

  const statusLabel = (st) => ({
    active: ar ? 'نشط' : 'Actif',
    expiring: ar ? 'قرب الانتهاء' : 'Bientôt',
    expired: ar ? 'منتهي' : 'Expiré',
  }[st] || st);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tv className="h-7 w-7 text-primary" />
            {ar ? 'اشتراكات IPTV والخدمات الرقمية' : 'Abonnements IPTV'}
          </h1>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            {ar ? 'اشتراك جديد' : 'Nouvel abonnement'}
          </Button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="ps-9"
              placeholder={ar ? 'بحث بالزبون أو الخدمة أو الخط...' : 'Rechercher...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{ar ? 'كل الحالات' : 'Tous'}</SelectItem>
              <SelectItem value="active">{ar ? 'نشط' : 'Actif'}</SelectItem>
              <SelectItem value="expiring">{ar ? 'قرب الانتهاء' : 'Bientôt'}</SelectItem>
              <SelectItem value="expired">{ar ? 'منتهي' : 'Expiré'}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Tv}
            title={ar ? 'لا توجد اشتراكات' : 'Aucun abonnement'}
            description={ar ? 'ابدأ بإضافة اشتراك جديد' : 'Ajoutez un abonnement'}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <Card key={s.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{s.customer_name || '-'}</div>
                      <div className="text-xs text-muted-foreground">{s.service_name || s.category}</div>
                    </div>
                    <Badge variant="outline" className={STATUS_STYLE[s.status] || ''}>
                      {statusLabel(s.status)}
                    </Badge>
                  </div>
                  <div className="text-sm space-y-1">
                    {s.server_name && <div className="text-muted-foreground">{ar ? 'السيرفر' : 'Serveur'}: {s.server_name}</div>}
                    <div className="text-muted-foreground">
                      {ar ? 'المدة' : 'Durée'}: {s.duration_months} {ar ? 'شهر' : 'mois'}
                    </div>
                    <div className="text-muted-foreground">
                      {formatShortDate(s.start_date)} ← {formatShortDate(s.end_date)}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="font-medium">{formatCurrency(s.price)}</span>
                      <span className="text-xs text-emerald-600">
                        {ar ? 'ربح' : 'Profit'}: {formatCurrency(s.profit)}
                      </span>
                    </div>
                    {s.reseller_name && (
                      <div className="text-xs text-purple-600">{ar ? 'الموزّع' : 'Revendeur'}: {s.reseller_name}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 pt-2 border-t">
                    {(s.m3u_url || s.username || s.activation_code) && (
                      <Button variant="ghost" size="sm" className="gap-1" onClick={() => copyLine(s)}>
                        <Copy className="h-4 w-4" /> {ar ? 'نسخ الخط' : 'Copier'}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => openEdit(s)}>
                      <Edit className="h-4 w-4" /> {ar ? 'تعديل' : 'Modifier'}
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1 text-red-600" onClick={() => setDeleteTarget(s)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? (ar ? 'تعديل اشتراك' : 'Modifier') : (ar ? 'اشتراك جديد' : 'Nouvel abonnement')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{ar ? 'الفئة' : 'Catégorie'}</Label>
              <Select value={form.category} onValueChange={(v) => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="iptv">IPTV</SelectItem>
                  <SelectItem value="recharge">{ar ? 'شحن رصيد' : 'Recharge'}</SelectItem>
                  <SelectItem value="other">{ar ? 'أخرى' : 'Autre'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'الخدمة (كتالوج)' : 'Service (catalogue)'}</Label>
              <Select value={form.service_id || '__none'} onValueChange={(v) => onServiceChange(v === '__none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder={ar ? 'اختياري' : 'Optionnel'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{ar ? 'بدون' : 'Aucun'}</SelectItem>
                  {services.map((sv) => <SelectItem key={sv.id} value={sv.id}>{sv.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>{ar ? 'الزبون' : 'Client'}</Label>
              {customers.length > 0 ? (
                <Select value={form.customer_id || '__none'} onValueChange={onCustomerChange}>
                  <SelectTrigger><SelectValue placeholder={ar ? 'اختر زبون' : 'Choisir'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{ar ? 'يدوي (بالأسفل)' : 'Manuel'}</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'اسم الزبون' : 'Nom client'}</Label>
              <Input value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>{ar ? 'السيرفر/الباقة' : 'Serveur/Pack'}</Label>
              <Input value={form.server_name} onChange={(e) => set('server_name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'المورّد' : 'Fournisseur'}</Label>
              <Input value={form.supplier_name} onChange={(e) => set('supplier_name', e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>{ar ? 'مدة الاشتراك' : 'Durée'}</Label>
              <Select value={form.duration_months} onValueChange={(v) => set('duration_months', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['1', '3', '6', '12'].map((m) => (
                    <SelectItem key={m} value={m}>{m} {ar ? 'شهر' : 'mois'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'تاريخ البداية' : 'Date début'}</Label>
              <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </div>

            <div className="space-y-1 col-span-2">
              <Label>{ar ? 'نوع بيانات الخط' : 'Type de ligne'}</Label>
              <Select value={form.line_type} onValueChange={(v) => set('line_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="m3u">M3U</SelectItem>
                  <SelectItem value="userpass">{ar ? 'يوزر + باسوورد' : 'User + Pass'}</SelectItem>
                  <SelectItem value="code">{ar ? 'كود تفعيل' : 'Code activation'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.line_type === 'm3u' && (
              <div className="space-y-1 col-span-2">
                <Label>M3U URL</Label>
                <Input value={form.m3u_url} onChange={(e) => set('m3u_url', e.target.value)} dir="ltr" />
              </div>
            )}
            {form.line_type === 'userpass' && (
              <>
                <div className="space-y-1">
                  <Label>{ar ? 'اسم المستخدم' : 'Utilisateur'}</Label>
                  <Input value={form.username} onChange={(e) => set('username', e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? 'كلمة المرور' : 'Mot de passe'}</Label>
                  <Input value={form.password} onChange={(e) => set('password', e.target.value)} dir="ltr" />
                </div>
              </>
            )}
            {form.line_type === 'code' && (
              <div className="space-y-1 col-span-2">
                <Label>{ar ? 'كود التفعيل' : 'Code activation'}</Label>
                <Input value={form.activation_code} onChange={(e) => set('activation_code', e.target.value)} dir="ltr" />
              </div>
            )}

            <div className="space-y-1">
              <Label>{ar ? 'تكلفة الشراء' : "Coût d'achat"}</Label>
              <Input type="number" value={form.cost} onChange={(e) => set('cost', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'سعر البيع' : 'Prix de vente'}</Label>
              <Input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} />
            </div>

            <div className="col-span-2 text-sm text-emerald-600">
              {ar ? 'الربح المتوقع' : 'Profit estimé'}: {formatCurrency(profit)}
            </div>

            <div className="space-y-1">
              <Label>{ar ? 'الموزّع' : 'Revendeur'}</Label>
              <Select value={form.reseller_id || '__none'} onValueChange={(v) => set('reseller_id', v === '__none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder={ar ? 'اختياري' : 'Optionnel'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{ar ? 'بدون موزّع' : 'Aucun'}</SelectItem>
                  {resellers.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name} ({formatCurrency(r.balance)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'طريقة الدفع' : 'Paiement'}</Label>
              <Select value={form.payment_method} onValueChange={(v) => set('payment_method', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{ar ? 'نقدي' : 'Espèces'}</SelectItem>
                  <SelectItem value="reseller">{ar ? 'رصيد الموزّع' : 'Solde revendeur'}</SelectItem>
                  <SelectItem value="debt">{ar ? 'دين' : 'Crédit'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 col-span-2">
              <Label>{ar ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{ar ? 'إلغاء' : 'Annuler'}</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? (ar ? 'جاري الحفظ...' : '...') : (ar ? 'حفظ' : 'Enregistrer')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ar ? 'حذف الاشتراك؟' : 'Supprimer ?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {ar ? 'لا يمكن التراجع عن هذا الإجراء.' : 'Action irréversible.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ar ? 'إلغاء' : 'Annuler'}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-600 hover:bg-red-700">
              {ar ? 'حذف' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
