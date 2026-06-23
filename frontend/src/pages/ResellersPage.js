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
import { formatCurrency, formatDateTime } from '../utils/globalDateFormatter';
import { toast } from 'sonner';
import { Users, Plus, Edit, Trash2, Save, Wallet, ArrowDownCircle, ArrowUpCircle, History } from 'lucide-react';

const EMPTY = { name: '', phone: '', email: '', notes: '', active: true };

export default function ResellersPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';

  const [resellers, setResellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [balanceTarget, setBalanceTarget] = useState(null);
  const [balanceForm, setBalanceForm] = useState({ type: 'credit', amount: '', reason: '' });
  const [txnTarget, setTxnTarget] = useState(null);
  const [txns, setTxns] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/digital-panel/resellers');
      setResellers(r.data || []);
    } catch (err) {
      // interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (r) => {
    setEditing(r);
    setForm({ name: r.name, phone: r.phone || '', email: r.email || '', notes: r.notes || '', active: r.active !== false });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error(ar ? 'اسم الموزّع مطلوب' : 'Nom requis'); return; }
    setSaving(true);
    try {
      if (editing) {
        await apiClient.put(`/digital-panel/resellers/${editing.id}`, form);
        toast.success(ar ? 'تم التحديث' : 'Mis à jour');
      } else {
        await apiClient.post('/digital-panel/resellers', form);
        toast.success(ar ? 'تمت الإضافة' : 'Ajouté');
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
      await apiClient.delete(`/digital-panel/resellers/${deleteTarget.id}`);
      toast.success(ar ? 'تم الحذف' : 'Supprimé');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل الحذف' : 'Échec'));
    }
  };

  const openBalance = (r, type) => {
    setBalanceTarget(r);
    setBalanceForm({ type, amount: '', reason: '' });
  };

  const submitBalance = async () => {
    const amount = parseFloat(balanceForm.amount);
    if (!amount || amount <= 0) { toast.error(ar ? 'أدخل مبلغاً صالحاً' : 'Montant invalide'); return; }
    try {
      await apiClient.post(`/digital-panel/resellers/${balanceTarget.id}/balance`, {
        type: balanceForm.type, amount, reason: balanceForm.reason,
      });
      toast.success(ar ? 'تم تعديل الرصيد' : 'Solde mis à jour');
      setBalanceTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل العملية' : 'Échec'));
    }
  };

  const openTxns = async (r) => {
    setTxnTarget(r);
    setTxns([]);
    try {
      const res = await apiClient.get(`/digital-panel/resellers/${r.id}/transactions`);
      setTxns(res.data || []);
    } catch (err) {
      // interceptor
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" />
            {ar ? 'الموزّعون' : 'Revendeurs'}
          </h1>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            {ar ? 'موزّع جديد' : 'Nouveau revendeur'}
          </Button>
        </div>

        {loading ? (
          <LoadingState />
        ) : resellers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={ar ? 'لا يوجد موزّعون' : 'Aucun revendeur'}
            description={ar ? 'أضف موزّعاً وامنحه رصيداً للبيع' : 'Ajoutez un revendeur'}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {resellers.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{r.name}</div>
                      {r.phone && <div className="text-xs text-muted-foreground" dir="ltr">{r.phone}</div>}
                    </div>
                    <Badge variant={r.active !== false ? 'default' : 'secondary'}>
                      {r.active !== false ? (ar ? 'نشط' : 'Actif') : (ar ? 'موقوف' : 'Inactif')}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 bg-muted/40 rounded-md p-2">
                    <Wallet className="h-5 w-5 text-cyan-600" />
                    <div>
                      <div className="text-xs text-muted-foreground">{ar ? 'الرصيد' : 'Solde'}</div>
                      <div className="font-bold">{formatCurrency(r.balance)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button variant="outline" size="sm" className="gap-1 text-green-600" onClick={() => openBalance(r, 'credit')}>
                      <ArrowUpCircle className="h-4 w-4" /> {ar ? 'شحن' : 'Créditer'}
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1 text-amber-600" onClick={() => openBalance(r, 'debit')}>
                      <ArrowDownCircle className="h-4 w-4" /> {ar ? 'سحب' : 'Débiter'}
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => openTxns(r)}>
                      <History className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => openEdit(r)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1 text-red-600" onClick={() => setDeleteTarget(r)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? (ar ? 'تعديل موزّع' : 'Modifier') : (ar ? 'موزّع جديد' : 'Nouveau revendeur')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{ar ? 'الاسم' : 'Nom'}</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'الهاتف' : 'Téléphone'}</Label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'البريد' : 'Email'}</Label>
              <Input value={form.email} onChange={(e) => set('email', e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{ar ? 'إلغاء' : 'Annuler'}</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? '...' : (ar ? 'حفظ' : 'Enregistrer')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Balance adjust */}
      <Dialog open={!!balanceTarget} onOpenChange={(o) => !o && setBalanceTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {balanceForm.type === 'credit' ? (ar ? 'شحن رصيد' : 'Créditer') : (ar ? 'سحب رصيد' : 'Débiter')}
              {balanceTarget ? ` — ${balanceTarget.name}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{ar ? 'المبلغ' : 'Montant'}</Label>
              <Input type="number" value={balanceForm.amount}
                onChange={(e) => setBalanceForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'السبب' : 'Motif'}</Label>
              <Input value={balanceForm.reason}
                onChange={(e) => setBalanceForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setBalanceTarget(null)}>{ar ? 'إلغاء' : 'Annuler'}</Button>
            <Button onClick={submitBalance}>{ar ? 'تأكيد' : 'Confirmer'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transactions */}
      <Dialog open={!!txnTarget} onOpenChange={(o) => !o && setTxnTarget(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{ar ? 'سجل الحركات' : 'Historique'}{txnTarget ? ` — ${txnTarget.name}` : ''}</DialogTitle>
          </DialogHeader>
          {txns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{ar ? 'لا توجد حركات' : 'Aucune transaction'}</p>
          ) : (
            <div className="divide-y">
              {txns.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className={tx.type === 'credit' ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>
                      {tx.type === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </div>
                    <div className="text-xs text-muted-foreground">{tx.reason}</div>
                  </div>
                  <div className="text-end text-xs text-muted-foreground">
                    <div>{formatDateTime(tx.created_at)}</div>
                    <div>{ar ? 'الرصيد' : 'Solde'}: {formatCurrency(tx.balance_after)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ar ? 'حذف الموزّع؟' : 'Supprimer ?'}</AlertDialogTitle>
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
