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
import { Building2, Plus, Loader2, CalendarClock, LogOut } from 'lucide-react';

// M3: fixed assets (الأصول الثابتة) — register, depreciation runs, disposal.
const FixedAssetsPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const cur = isAr ? 'دج' : 'DA';

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [depOpen, setDepOpen] = useState(false);
  const [depPeriod, setDepPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [disposeTarget, setDisposeTarget] = useState(null);
  const [disposeForm, setDisposeForm] = useState({ sale_amount: 0, payment_method: 'cash' });
  const [saving, setSaving] = useState(false);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [form, setForm] = useState({
    name: '', category: 'equipment', purchase_date: new Date().toISOString().slice(0, 10),
    cost: '', salvage_value: 0, useful_life_months: 12, payment_method: 'cash', notes: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/fixed-assets');
      setItems(r.data.items || []);
      setSummary(r.data.summary || null);
    } catch (_e) {
      toast.error(isAr ? 'فشل تحميل الأصول' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    apiClient.get('/cash-boxes').then(r => {
      const d = r.data;
      setCashBoxes(Array.isArray(d) ? d : (d.items || []));
    }).catch(() => {});
  }, []);

  const create = async () => {
    if (!form.name.trim() || !(parseFloat(form.cost) > 0)) {
      toast.error(isAr ? 'أدخل الاسم والتكلفة' : 'Nom et coût requis');
      return;
    }
    setSaving(true);
    try {
      await apiClient.post('/fixed-assets', {
        ...form,
        cost: parseFloat(form.cost),
        salvage_value: parseFloat(form.salvage_value) || 0,
        useful_life_months: parseInt(form.useful_life_months, 10) || 12,
      });
      toast.success(isAr ? 'سُجّل الأصل مع قيد الشراء' : 'Immobilisation créée');
      setCreateOpen(false);
      setForm({ name: '', category: 'equipment', purchase_date: new Date().toISOString().slice(0, 10), cost: '', salvage_value: 0, useful_life_months: 12, payment_method: 'cash', notes: '' });
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل التسجيل' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const runDep = async () => {
    setSaving(true);
    try {
      const r = await apiClient.post('/fixed-assets/run-depreciation', { period: depPeriod });
      toast.success(isAr
        ? `إهلاك ${depPeriod}: نُشر ${r.data.posted}، موجود مسبقاً ${r.data.skipped_existing}`
        : `Amortissement ${depPeriod}: ${r.data.posted} posté(s)`);
      setDepOpen(false);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الإهلاك' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const doDispose = async () => {
    if (!disposeTarget) return;
    setSaving(true);
    try {
      const r = await apiClient.post(`/fixed-assets/${disposeTarget.id}/dispose`, {
        sale_amount: parseFloat(disposeForm.sale_amount) || 0,
        payment_method: disposeForm.payment_method,
      });
      const gl = r.data.gain_loss || 0;
      toast.success(isAr
        ? `أُخرج الأصل — ${gl >= 0 ? `ربح ${gl.toLocaleString()}` : `خسارة ${(-gl).toLocaleString()}`}`
        : 'Sortie enregistrée');
      setDisposeTarget(null);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الإخراج' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const monthly = (a) => a.monthly_depreciation || 0;
  const progress = (a) => a.cost > 0 ? Math.min(100, Math.round((a.accumulated || 0) / Math.max(1, a.cost - (a.salvage_value || 0)) * 100)) : 0;

  return (
    <Layout>
      <div className="p-4 space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> {isAr ? 'الأصول الثابتة' : 'Immobilisations'}
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDepOpen(true)}>
              <CalendarClock className="h-4 w-4 me-1" />{isAr ? 'تشغيل إهلاك شهري' : 'Amortissement'}
            </Button>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 me-1" />{isAr ? 'أصل جديد' : 'Nouvel actif'}</Button>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card><CardContent className="p-3 text-center">
              <div className="text-lg font-bold">{(summary.total_cost || 0).toLocaleString()} {cur}</div>
              <div className="text-xs text-muted-foreground">{isAr ? 'إجمالي التكلفة' : 'Coût total'}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-lg font-bold">{(summary.total_accumulated || 0).toLocaleString()} {cur}</div>
              <div className="text-xs text-muted-foreground">{isAr ? 'مجمع الإهلاك' : 'Amort. cumulé'}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-lg font-bold text-green-700">{(summary.net_book_value || 0).toLocaleString()} {cur}</div>
              <div className="text-xs text-muted-foreground">{isAr ? 'القيمة الدفترية الصافية' : 'VNC'}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-lg font-bold">{summary.active_count}</div>
              <div className="text-xs text-muted-foreground">{isAr ? 'أصول نشطة' : 'Actifs'}</div>
            </CardContent></Card>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>{isAr ? 'سجل الأصول' : 'Registre'} ({items.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">{isAr ? 'لا توجد أصول مسجلة بعد' : 'Aucun actif'}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="p-2 text-start">{isAr ? 'الأصل' : 'Actif'}</th>
                      <th className="p-2 text-start">{isAr ? 'التكلفة' : 'Coût'}</th>
                      <th className="p-2 text-start">{isAr ? 'إهلاك شهري' : 'Mensuel'}</th>
                      <th className="p-2 text-start">{isAr ? 'المجمع' : 'Cumul'}</th>
                      <th className="p-2 text-start">{isAr ? 'القيمة الدفترية' : 'VNC'}</th>
                      <th className="p-2 text-start">{isAr ? 'الحالة' : 'Statut'}</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(a => (
                      <tr key={a.id} className="border-b hover:bg-muted/50">
                        <td className="p-2">
                          <div className="font-semibold">{a.name}</div>
                          <div className="text-xs text-muted-foreground">{a.purchase_date} · {a.useful_life_months} {isAr ? 'شهراً' : 'mois'}</div>
                        </td>
                        <td className="p-2">{(a.cost || 0).toLocaleString()}</td>
                        <td className="p-2">{monthly(a).toLocaleString()}</td>
                        <td className="p-2">
                          <div>{(a.accumulated || 0).toLocaleString()}</div>
                          <div className="w-20 h-1.5 bg-muted rounded"><div className="h-1.5 bg-blue-500 rounded" style={{ width: `${progress(a)}%` }} /></div>
                        </td>
                        <td className="p-2 font-semibold">{(a.book_value || 0).toLocaleString()} {cur}</td>
                        <td className="p-2">
                          {a.status === 'active'
                            ? <Badge className="bg-green-100 text-green-700">{isAr ? 'نشط' : 'Actif'}</Badge>
                            : <Badge className="bg-gray-200 text-gray-700">{isAr ? 'مُخرَج' : 'Sorti'}</Badge>}
                        </td>
                        <td className="p-2">
                          {a.status === 'active' && (
                            <Button size="sm" variant="outline" onClick={() => { setDisposeTarget(a); setDisposeForm({ sale_amount: 0, payment_method: 'cash' }); }}>
                              <LogOut className="h-3 w-3 me-1" />{isAr ? 'إخراج' : 'Sortir'}
                            </Button>
                          )}
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
          <DialogContent dir={isAr ? 'rtl' : 'ltr'} className="max-w-xl">
            <DialogHeader><DialogTitle>{isAr ? 'تسجيل أصل ثابت' : 'Nouvel actif'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>{isAr ? 'اسم الأصل' : 'Nom'}</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <Label>{isAr ? 'تاريخ الشراء' : "Date d'achat"}</Label>
                  <Input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
                </div>
                <div>
                  <Label>{isAr ? 'التكلفة' : 'Coût'}</Label>
                  <Input type="number" min="1" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
                </div>
                <div>
                  <Label>{isAr ? 'القيمة التخريدية' : 'Valeur résiduelle'}</Label>
                  <Input type="number" min="0" value={form.salvage_value} onChange={e => setForm(f => ({ ...f, salvage_value: e.target.value }))} />
                </div>
                <div>
                  <Label>{isAr ? 'العمر الإنتاجي (شهر)' : 'Durée (mois)'}</Label>
                  <Input type="number" min="1" max="600" value={form.useful_life_months} onChange={e => setForm(f => ({ ...f, useful_life_months: e.target.value }))} />
                </div>
                <div>
                  <Label>{isAr ? 'الدفع من' : 'Payé depuis'}</Label>
                  <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {cashBoxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar || b.name_fr || b.name || b.id}</SelectItem>)}
                      <SelectItem value="credit">{isAr ? 'على الحساب (مورد)' : 'À crédit'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>{isAr ? 'ملاحظات' : 'Notes'}</Label>
                  <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {isAr ? 'يُنشأ قيد شراء تلقائياً: مدين 340 أصول ثابتة / دائن الصندوق المختار' : 'Écriture automatique: Dt 340 / Ct caisse'}
              </div>
              <Button className="w-full" onClick={create} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {isAr ? 'تسجيل' : 'Enregistrer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* depreciation dialog */}
        <Dialog open={depOpen} onOpenChange={setDepOpen}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'تشغيل الإهلاك الشهري' : 'Amortissement mensuel'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{isAr ? 'الفترة (YYYY-MM)' : 'Période'}</Label>
                <Input type="month" value={depPeriod} onChange={e => setDepPeriod(e.target.value)} />
              </div>
              <div className="text-xs text-muted-foreground">
                {isAr ? 'قيد لكل أصل نشط: مدين 615 مصروف الإهلاك / دائن 345 مجمع الإهلاك — آمن التكرار (لن يتكرر لنفس الشهر)' : 'Écriture par actif — idempotent par période'}
              </div>
              <Button className="w-full" onClick={runDep} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {isAr ? 'تشغيل' : 'Exécuter'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* dispose dialog */}
        <Dialog open={!!disposeTarget} onOpenChange={(o) => !o && setDisposeTarget(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? `إخراج: ${disposeTarget?.name || ''}` : 'Sortie'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="text-sm">{isAr ? 'القيمة الدفترية' : 'VNC'}: <b>{(disposeTarget?.book_value || 0).toLocaleString()} {cur}</b></div>
              <div>
                <Label>{isAr ? 'ثمن البيع (0 = شطب)' : 'Prix de vente (0 = mise au rebut)'}</Label>
                <Input type="number" min="0" value={disposeForm.sale_amount} onChange={e => setDisposeForm(f => ({ ...f, sale_amount: e.target.value }))} />
              </div>
              <div>
                <Label>{isAr ? 'التحصيل في' : 'Encaissé dans'}</Label>
                <Select value={disposeForm.payment_method} onValueChange={v => setDisposeForm(f => ({ ...f, payment_method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cashBoxes.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar || b.name_fr || b.name || b.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" variant="destructive" onClick={doDispose} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {isAr ? 'تأكيد الإخراج' : 'Confirmer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default FixedAssetsPage;
