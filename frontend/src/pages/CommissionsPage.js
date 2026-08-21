import React, { useState, useEffect, useCallback } from 'react';
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
import { Percent, Plus, Trash2, Loader2, Banknote, Users } from 'lucide-react';

// p221: commission engine UI — rules, ledger, per-beneficiary report, payouts.
const CommissionsPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const cur = isAr ? 'دج' : 'DA';

  const [rules, setRules] = useState([]);
  const [report, setReport] = useState([]);
  const [records, setRecords] = useState([]);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payBox, setPayBox] = useState('cash');
  const [form, setForm] = useState({
    name: '', beneficiary: '', scope: 'all', family_id: '', channel: 'pos',
    rate_type: 'percent', value: '', min_amount: '0',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const [rulesRes, reportRes, recRes, boxesRes, famRes] = await Promise.all([
        apiClient.get('/commissions/rules'),
        apiClient.get('/commissions/report'),
        apiClient.get(`/commissions${q}`),
        apiClient.get('/cash-boxes'),
        apiClient.get('/product-families'),
      ]);
      setRules(rulesRes.data);
      setReport(reportRes.data.items || []);
      setRecords(recRes.data.items || []);
      setCashBoxes(Array.isArray(boxesRes.data) ? boxesRes.data : (boxesRes.data?.boxes || []));
      setFamilies(famRes.data || []);
    } catch {
      toast.error(isAr ? 'فشل تحميل العمولات' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, isAr]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const scopeLabel = (r) => {
    if (r.scope === 'family') {
      const f = families.find(fam => fam.id === r.family_id);
      return `${isAr ? 'عائلة' : 'Famille'}: ${f ? (isAr ? f.name_ar : (f.name_en || f.name_ar)) : '—'}`;
    }
    if (r.scope === 'channel') return `${isAr ? 'قناة' : 'Canal'}: ${r.channel}`;
    return isAr ? 'كل المبيعات' : 'Toutes ventes';
  };

  const handleSaveRule = async () => {
    if (!form.name.trim() || !form.beneficiary.trim() || !form.value) {
      toast.error(isAr ? 'أكمل الاسم والمستفيد والقيمة' : 'Nom, bénéficiaire et valeur requis');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/commissions/rules', {
        name: form.name.trim(),
        beneficiary: form.beneficiary.trim(),
        scope: form.scope,
        family_id: form.scope === 'family' ? form.family_id : null,
        channel: form.scope === 'channel' ? form.channel : null,
        rate_type: form.rate_type,
        value: parseFloat(form.value),
        min_amount: parseFloat(form.min_amount) || 0,
      });
      toast.success(isAr ? 'تمت إضافة القاعدة' : 'Règle ajoutée');
      setDialogOpen(false);
      setForm({ name: '', beneficiary: '', scope: 'all', family_id: '', channel: 'pos', rate_type: 'percent', value: '', min_amount: '0' });
      loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || (isAr ? 'فشل الحفظ' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (rule) => {
    try {
      await apiClient.delete(`/commissions/rules/${rule.id}`);
      toast.success(isAr ? 'حُذفت القاعدة' : 'Règle supprimée');
      loadAll();
    } catch {
      toast.error(isAr ? 'فشل الحذف' : 'Échec suppression');
    }
  };

  const handleToggleRule = async (rule) => {
    try {
      await apiClient.put(`/commissions/rules/${rule.id}`, { ...rule, active: !rule.active });
      loadAll();
    } catch {
      toast.error(isAr ? 'فشل التحديث' : 'Échec mise à jour');
    }
  };

  const handlePayout = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/commissions/${payTarget.id}/payout`, { payment_method: payBox });
      toast.success(isAr ? 'دُفعت العمولة وسُجّلت في الصندوق' : 'Commission payée');
      setPayTarget(null);
      loadAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || (isAr ? 'فشل الدفع' : 'Échec paiement'));
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (st) => {
    if (st === 'paid') return <Badge className="bg-emerald-100 text-emerald-700">{isAr ? 'مدفوعة' : 'Payée'}</Badge>;
    if (st === 'cancelled') return <Badge className="bg-slate-100 text-slate-500">{isAr ? 'ملغاة' : 'Annulée'}</Badge>;
    return <Badge className="bg-amber-100 text-amber-700">{isAr ? 'معلقة' : 'En attente'}</Badge>;
  };

  return (
    <Layout>
      <div className="space-y-4 animate-fade-in" data-testid="commissions-page">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Percent className="h-6 w-6 text-primary" />
              {isAr ? 'العمولات' : 'Commissions'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAr ? 'قواعد عمولة تلقائية على كل عملية بيع + مستحقات ودفع' : 'Règles automatiques sur chaque vente + paiements'}
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-1" data-testid="add-rule-btn">
            <Plus className="h-4 w-4" />{isAr ? 'قاعدة جديدة' : 'Nouvelle règle'}
          </Button>
        </div>

        {/* Per-beneficiary report */}
        {report.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {report.map(r => (
              <Card key={r.beneficiary} data-testid={`report-${r.beneficiary}`}>
                <CardContent className="p-3">
                  <p className="text-sm font-medium flex items-center gap-1"><Users className="h-3.5 w-3.5 text-muted-foreground" />{r.beneficiary}</p>
                  <p className="text-lg font-bold text-amber-600">{r.pending.toLocaleString(isAr ? 'ar-DZ' : 'fr-FR')} {cur} <span className="text-xs font-normal">{isAr ? 'معلقة' : 'en attente'}</span></p>
                  <p className="text-xs text-muted-foreground">{isAr ? 'مدفوعة' : 'payées'}: {r.paid.toLocaleString(isAr ? 'ar-DZ' : 'fr-FR')} {cur} — {r.count} {isAr ? 'عملية' : 'ops'}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Rules */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{isAr ? 'قواعد العمولة' : 'Règles de commission'}</CardTitle></CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">{isAr ? 'لا قواعد بعد — أضف أول قاعدة عمولة' : 'Aucune règle'}</p>
            ) : (
              <div className="space-y-2">
                {rules.map(r => (
                  <div key={r.id} className="flex items-center gap-3 border rounded-lg p-3" data-testid={`rule-${r.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{r.name} — <span className="text-muted-foreground">{r.beneficiary}</span></p>
                      <p className="text-xs text-muted-foreground">
                        {scopeLabel(r)} • {r.rate_type === 'percent' ? `${r.value}%` : `${r.value} ${cur}`}
                        {r.min_amount > 0 ? ` • ${isAr ? 'حد أدنى' : 'min'} ${r.min_amount} ${cur}` : ''}
                      </p>
                    </div>
                    <Badge className={r.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                      {r.active ? (isAr ? 'نشطة' : 'Active') : (isAr ? 'موقوفة' : 'Inactive')}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => handleToggleRule(r)} data-testid={`rule-toggle-${r.id}`}>
                      {r.active ? (isAr ? 'إيقاف' : 'Stop') : (isAr ? 'تفعيل' : 'Activer')}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteRule(r)} data-testid={`rule-delete-${r.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ledger */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{isAr ? 'سجل العمولات' : 'Journal des commissions'}</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-32 text-xs" data-testid="status-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? 'الكل' : 'Tout'}</SelectItem>
                  <SelectItem value="pending">{isAr ? 'معلقة' : 'En attente'}</SelectItem>
                  <SelectItem value="paid">{isAr ? 'مدفوعة' : 'Payées'}</SelectItem>
                  <SelectItem value="cancelled">{isAr ? 'ملغاة' : 'Annulées'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></p>
            ) : records.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">{isAr ? 'لا عمولات — تُسجَّل تلقائياً عند كل بيع مطابق' : 'Aucune commission'}</p>
            ) : (
              <div className="space-y-1.5">
                {records.map(c => (
                  <div key={c.id} className="flex items-center gap-3 border rounded-lg p-2.5" data-testid={`commission-${c.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{c.beneficiary} — {isAr ? 'فاتورة' : 'facture'} {c.invoice_number || c.sale_id}</p>
                      <p className="text-xs text-muted-foreground">{(c.created_at || '').slice(0, 16).replace('T', ' ')} • {isAr ? 'بيع' : 'vente'} {Number(c.sale_total).toLocaleString(isAr ? 'ar-DZ' : 'fr-FR')} {cur}</p>
                    </div>
                    <span className="font-semibold text-sm whitespace-nowrap">{Number(c.amount).toLocaleString(isAr ? 'ar-DZ' : 'fr-FR')} {cur}</span>
                    {statusBadge(c.status)}
                    {c.status === 'pending' && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => { setPayTarget(c); setPayBox('cash'); }} data-testid={`payout-${c.id}`}>
                        <Banknote className="h-3.5 w-3.5" />{isAr ? 'دفع' : 'Payer'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add rule dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{isAr ? 'قاعدة عمولة جديدة' : 'Nouvelle règle'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{isAr ? 'اسم القاعدة' : 'Nom'}</Label>
                  <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} data-testid="rule-name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{isAr ? 'المستفيد' : 'Bénéficiaire'}</Label>
                  <Input value={form.beneficiary} onChange={e => setForm(p => ({ ...p, beneficiary: e.target.value }))} placeholder={isAr ? 'اسم الموظف/الوسيط' : 'Employé/intermédiaire'} data-testid="rule-beneficiary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{isAr ? 'النطاق' : 'Portée'}</Label>
                  <Select value={form.scope} onValueChange={v => setForm(p => ({ ...p, scope: v }))}>
                    <SelectTrigger data-testid="rule-scope"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? 'كل المبيعات' : 'Toutes ventes'}</SelectItem>
                      <SelectItem value="family">{isAr ? 'عائلة منتجات' : 'Famille produits'}</SelectItem>
                      <SelectItem value="channel">{isAr ? 'قناة بيع' : 'Canal'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.scope === 'family' && (
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? 'العائلة' : 'Famille'}</Label>
                    <Select value={form.family_id} onValueChange={v => setForm(p => ({ ...p, family_id: v }))}>
                      <SelectTrigger data-testid="rule-family"><SelectValue placeholder={isAr ? 'اختر' : 'Choisir'} /></SelectTrigger>
                      <SelectContent>
                        {families.map(f => <SelectItem key={f.id} value={f.id}>{isAr ? f.name_ar : (f.name_en || f.name_ar)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.scope === 'channel' && (
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? 'القناة' : 'Canal'}</Label>
                    <Select value={form.channel} onValueChange={v => setForm(p => ({ ...p, channel: v }))}>
                      <SelectTrigger data-testid="rule-channel"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pos">{isAr ? 'نقطة البيع' : 'POS'}</SelectItem>
                        <SelectItem value="online">{isAr ? 'المتجر الإلكتروني' : 'En ligne'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{isAr ? 'النوع' : 'Type'}</Label>
                  <Select value={form.rate_type} onValueChange={v => setForm(p => ({ ...p, rate_type: v }))}>
                    <SelectTrigger data-testid="rule-rate-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">{isAr ? 'نسبة %' : '%'}</SelectItem>
                      <SelectItem value="fixed">{isAr ? 'مبلغ ثابت' : 'Fixe'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{isAr ? 'القيمة' : 'Valeur'}</Label>
                  <Input type="number" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} data-testid="rule-value" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{isAr ? 'حد أدنى للفاتورة' : 'Min facture'}</Label>
                  <Input type="number" value={form.min_amount} onChange={e => setForm(p => ({ ...p, min_amount: e.target.value }))} data-testid="rule-min" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">{isAr ? 'إلغاء' : 'Annuler'}</Button>
                <Button onClick={handleSaveRule} disabled={saving} className="flex-1" data-testid="rule-save-btn">
                  {saving ? (isAr ? 'جاري الحفظ...' : 'Enregistrement...') : (isAr ? 'حفظ' : 'Enregistrer')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Payout dialog */}
        <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
          <DialogContent className="max-w-xs">
            <DialogHeader><DialogTitle>{isAr ? 'دفع العمولة' : 'Payer la commission'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm">{payTarget?.beneficiary} — <b>{Number(payTarget?.amount || 0).toLocaleString(isAr ? 'ar-DZ' : 'fr-FR')} {cur}</b></p>
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'من صندوق' : 'Caisse'}</Label>
                <Select value={payBox} onValueChange={setPayBox}>
                  <SelectTrigger data-testid="payout-box"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cashBoxes.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name} — {Number(b.balance || 0).toLocaleString(isAr ? 'ar-DZ' : 'fr-FR')} {cur}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handlePayout} disabled={saving} className="w-full" data-testid="payout-confirm">
                {saving ? (isAr ? 'جاري الدفع...' : 'Paiement...') : (isAr ? 'تأكيد الدفع' : 'Confirmer')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default CommissionsPage;
