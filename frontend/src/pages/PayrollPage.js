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
import { Wallet, Loader2, PlayCircle, XCircle, Eye, Banknote } from 'lucide-react';

// M6: payroll (قسائم الرواتب) — monthly payslips: base + commission − advances, pay from a box.
const STATUS_META = {
  draft:     { ar: 'مسودة',  fr: 'Brouillon', cls: 'bg-blue-100 text-blue-700' },
  paid:      { ar: 'مدفوعة', fr: 'Payée',     cls: 'bg-green-100 text-green-700' },
  cancelled: { ar: 'ملغاة',  fr: 'Annulée',   cls: 'bg-gray-200 text-gray-700' },
};

const PayrollPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const cur = isAr ? 'دج' : 'DA';
  const nowMonth = new Date().toISOString().slice(0, 7);

  const [month, setMonth] = useState(nowMonth);
  const [items, setItems] = useState([]);
  const [totalNet, setTotalNet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [payTarget, setPayTarget] = useState(null);
  const [payBox, setPayBox] = useState('cash');
  const [cashBoxes, setCashBoxes] = useState([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/payroll/payslips', { params: { month } });
      setItems(r.data.items || []);
      setTotalNet(r.data.total_net || 0);
    } catch (_e) {
      toast.error(isAr ? 'فشل تحميل القسائم' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [month, isAr]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    apiClient.get('/cash-boxes').then(r => {
      const d = Array.isArray(r.data) ? r.data : (r.data.items || []);
      setCashBoxes(d.filter(b => b.type !== 'ecom'));
    }).catch(() => {});
  }, []);

  const generate = async () => {
    setSaving(true);
    try {
      const r = await apiClient.post('/payroll/generate', { month });
      toast.success(isAr
        ? `أُنشئت ${r.data.created} قسيمة${r.data.skipped_existing?.length ? ` (تخطّى ${r.data.skipped_existing.length} موجودة)` : ''}`
        : `${r.data.created} fiches créées`);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الإنشاء' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const pay = async () => {
    if (!payTarget) return;
    setSaving(true);
    try {
      const r = await apiClient.post(`/payroll/payslips/${payTarget.id}/pay`, { box: payBox });
      toast.success(isAr ? `دُفع صافي ${r.data.net_paid.toLocaleString()} ${cur}` : 'Payée');
      setPayTarget(null);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الدفع' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (p) => {
    try {
      await apiClient.post(`/payroll/payslips/${p.id}/cancel`);
      toast.success(isAr ? 'أُلغيت القسيمة' : 'Annulée');
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الإلغاء' : 'Échec'));
    }
  };

  const openDetail = async (p) => {
    try {
      const r = await apiClient.get(`/payroll/payslips/${p.id}`);
      setDetail(r.data);
    } catch (_e) {
      toast.error(isAr ? 'فشل' : 'Échec');
    }
  };

  return (
    <Layout>
      <div className="space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" />
            {isAr ? 'قسائم الرواتب' : 'Fiches de paie'}
          </h1>
          <div className="flex items-center gap-2">
            <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
            <Button onClick={generate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <PlayCircle className="h-4 w-4 me-1" />}
              {isAr ? 'توليد قسائم الشهر' : 'Générer le mois'}
            </Button>
          </div>
        </div>

        <Card><CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold text-green-700">{totalNet.toLocaleString()} {cur}</div>
          <div className="text-sm text-muted-foreground">{isAr ? 'إجمالي الصافي غير الملغى لهذا الشهر' : 'Total net du mois (hors annulées)'}</div>
        </CardContent></Card>

        <Card>
          <CardHeader><CardTitle>{isAr ? `قسائم ${month}` : `Fiches ${month}`} ({items.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                {isAr ? 'لا قسائم لهذا الشهر — اضغط «توليد قسائم الشهر»' : 'Aucune fiche — cliquez « Générer »'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-2 text-start">{isAr ? 'الكود' : 'Code'}</th>
                    <th className="p-2 text-start">{isAr ? 'الموظف' : 'Employé'}</th>
                    <th className="p-2">{isAr ? 'الأساسي' : 'Base'}</th>
                    <th className="p-2">{isAr ? 'العمولة' : 'Commission'}</th>
                    <th className="p-2">{isAr ? 'السلف' : 'Avances'}</th>
                    <th className="p-2">{isAr ? 'الصافي' : 'Net'}</th>
                    <th className="p-2">{isAr ? 'الحالة' : 'Statut'}</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(p => {
                    const sm = STATUS_META[p.status] || STATUS_META.draft;
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="p-2 font-mono">{p.code}</td>
                        <td className="p-2">{p.employee_name}<div className="text-xs text-muted-foreground">{p.position}</div></td>
                        <td className="p-2 text-center">{(p.base_salary || 0).toLocaleString()}</td>
                        <td className="p-2 text-center text-blue-700">{(p.commission || 0).toLocaleString()}</td>
                        <td className="p-2 text-center text-orange-700">{(p.advances || 0).toLocaleString()}</td>
                        <td className="p-2 text-center font-bold">{(p.net_salary || 0).toLocaleString()}</td>
                        <td className="p-2 text-center"><Badge className={sm.cls}>{isAr ? sm.ar : sm.fr}</Badge></td>
                        <td className="p-2 text-center whitespace-nowrap">
                          <Button size="icon" variant="ghost" onClick={() => openDetail(p)}><Eye className="h-4 w-4" /></Button>
                          {p.status === 'draft' && (
                            <>
                              <Button size="icon" variant="ghost" title={isAr ? 'دفع' : 'Payer'} onClick={() => { setPayTarget(p); setPayBox('cash'); }}>
                                <Banknote className="h-4 w-4 text-green-700" />
                              </Button>
                              <Button size="icon" variant="ghost" title={isAr ? 'إلغاء' : 'Annuler'} onClick={() => cancel(p)}>
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

        {/* detail dialog */}
        <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{detail?.code} — {detail?.employee_name}</DialogTitle></DialogHeader>
            {detail && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>{isAr ? 'الأساسي' : 'Base'}</span><b>{detail.base_salary?.toLocaleString()} {cur}</b></div>
                <div className="flex justify-between"><span>{isAr ? `العمولة (${detail.commission_rate}% من مبيعات ${detail.total_sales?.toLocaleString()})` : 'Commission'}</span><b>{detail.commission?.toLocaleString()} {cur}</b></div>
                <div className="flex justify-between"><span>{isAr ? 'السلف المخصومة' : 'Avances déduites'}</span><b className="text-orange-700">− {detail.advances?.toLocaleString()} {cur}</b></div>
                <div className="flex justify-between border-t pt-2"><span>{isAr ? 'الصافي' : 'Net'}</span><b className="text-green-700">{detail.net_salary?.toLocaleString()} {cur}</b></div>
                <div className="flex justify-between text-muted-foreground"><span>{isAr ? 'حضور / غياب' : 'Présence / absence'}</span><span>{detail.attendance_days} / {detail.absence_days}</span></div>
                {detail.status === 'paid' && (
                  <div className="flex justify-between text-muted-foreground"><span>{isAr ? 'دُفعت من' : 'Payée depuis'}</span><span>{detail.box} — {(detail.paid_at || '').slice(0, 10)}</span></div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* pay dialog */}
        <Dialog open={!!payTarget} onOpenChange={() => setPayTarget(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'دفع قسيمة' : 'Payer la fiche'} {payTarget?.code}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm">{isAr ? 'الصافي المستحق:' : 'Net à payer:'} <b className="text-green-700">{payTarget?.net_salary?.toLocaleString()} {cur}</b></p>
              <div>
                <Label>{isAr ? 'صندوق الدفع' : 'Caisse de paiement'}</Label>
                <Select value={payBox} onValueChange={setPayBox}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cashBoxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name} ({(b.balance || 0).toLocaleString()})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={pay} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {isAr ? 'تأكيد الدفع' : 'Confirmer le paiement'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default PayrollPage;
