// p293 — إدارة عمال المتجر الإلكتروني: إضافة/تعديل/إيقاف + عمولات (ثابت + نسبة) وتصفيتها
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Users, UserPlus, Phone, Pencil, Trash2, Banknote, RefreshCw } from 'lucide-react';

const EMPTY_FORM = { name: '', phone: '', pin: '', commission_fixed: 0, commission_percent: 0 };

export default function EcomWorkersPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // worker being edited
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [commFor, setCommFor] = useState(null);   // worker for commissions dialog
  const [commData, setCommData] = useState(null);
  const [commBusy, setCommBusy] = useState(false);
  const [payBox, setPayBox] = useState('cash');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/ecom-workers');
      setWorkers(res.data.workers || []);
    } catch { toast.error(ar ? 'فشل تحميل العمال' : 'Échec du chargement'); }
    finally { setLoading(false); }
  }, [ar]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setShowForm(true); };
  const openEdit = (w) => {
    setEditing(w);
    setForm({ name: w.name, phone: w.phone, pin: '', commission_fixed: w.commission_fixed || 0, commission_percent: w.commission_percent || 0 });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim() || (!editing && (!form.phone.trim() || !form.pin.trim()))) {
      toast.error(ar ? 'أكمل الاسم والهاتف ورمز الدخول' : 'Complétez les champs');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const payload = { name: form.name, commission_fixed: Number(form.commission_fixed) || 0, commission_percent: Number(form.commission_percent) || 0 };
        if (form.phone.trim() && form.phone.trim() !== editing.phone) payload.phone = form.phone.trim();
        if (form.pin.trim()) payload.pin = form.pin.trim();
        await apiClient.put(`/ecom-workers/${editing.id}`, payload);
        toast.success(ar ? 'حُدّث العامل' : 'Employé mis à jour');
      } else {
        await apiClient.post('/ecom-workers', { ...form, commission_fixed: Number(form.commission_fixed) || 0, commission_percent: Number(form.commission_percent) || 0 });
        toast.success(ar ? 'أُضيف العامل — يدخل من صفحة دخول العمال' : 'Employé ajouté');
      }
      setShowForm(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || (ar ? 'فشل الحفظ' : 'Échec')); }
    finally { setSaving(false); }
  };

  const toggleActive = async (w) => {
    try {
      await apiClient.put(`/ecom-workers/${w.id}`, { active: !w.active });
      toast.success(w.active ? (ar ? 'أُوقف العامل' : 'Désactivé') : (ar ? 'أُعيد تفعيل العامل' : 'Réactivé'));
      load();
    } catch { toast.error(ar ? 'فشل التحديث' : 'Échec'); }
  };

  const removeWorker = async (w) => {
    if (!window.confirm(ar ? `حذف العامل «${w.name}» نهائياً؟ الطلبات المنفّذة تحتفظ باسمه.` : `Supprimer ${w.name} ?`)) return;
    try {
      await apiClient.delete(`/ecom-workers/${w.id}`);
      toast.success(ar ? 'حُذف العامل' : 'Supprimé');
      load();
    } catch { toast.error(ar ? 'فشل الحذف' : 'Échec'); }
  };

  const openCommissions = async (w) => {
    setCommFor(w); setCommData(null); setCommBusy(true);
    try {
      const res = await apiClient.get(`/ecom-workers/${w.id}/commissions`);
      setCommData(res.data);
    } catch { toast.error(ar ? 'فشل تحميل العمولات' : 'Échec'); }
    finally { setCommBusy(false); }
  };

  const settle = async () => {
    if (!commFor) return;
    setCommBusy(true);
    try {
      const res = await apiClient.post(`/ecom-workers/${commFor.id}/commissions/settle`, { payment_method: payBox });
      toast.success(ar ? `صُفّيت العمولة: ${Number(res.data.settlement.total).toLocaleString()} دج (مصروف ${res.data.expense_code})` : 'Commission réglée');
      openCommissions(commFor);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || (ar ? 'فشلت التصفية' : 'Échec')); setCommBusy(false); }
  };

  return (
    <div className="space-y-4" dir="rtl" data-testid="ecom-workers-page">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            {ar ? 'عمال المتجر الإلكتروني' : 'Employés e-commerce'}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} data-testid="workers-refresh"><RefreshCw className="w-4 h-4" /></Button>
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={openAdd} data-testid="add-worker-btn">
              <UserPlus className="w-4 h-4" /> {ar ? 'إضافة عامل' : 'Ajouter'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            {ar
              ? 'العامل يدخل برقم هاتفه ورمز PIN من صفحة دخول العمال (/worker/login) فيرى صندوق الطلبات فقط — يتصل بالزبائن ويؤكد الطلبات، وتُحسب عمولته على الطلبات المُسلَّمة. كل طلب يعرض من نفّذه في لوحة التحكم.'
              : "L'employé se connecte par téléphone + PIN et ne voit que la boîte de commandes."}
          </p>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">{ar ? 'جارٍ التحميل…' : 'Chargement…'}</div>
          ) : workers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground" data-testid="workers-empty">
              {ar ? 'لا عمال بعد — أضف أول عامل لفريق التأكيد' : 'Aucun employé'}
            </div>
          ) : (
            <div className="space-y-2">
              {workers.map((w) => (
                <div key={w.id} className={`border rounded-lg p-3 flex flex-wrap items-center gap-3 ${w.active ? '' : 'opacity-60'}`} data-testid={`worker-row-${w.id}`}>
                  <div className="flex-1 min-w-[160px]">
                    <div className="font-semibold flex items-center gap-2">
                      {w.name}
                      {!w.active && <Badge className="bg-red-100 text-red-700">{ar ? 'موقوف' : 'Inactif'}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" /><span dir="ltr">{w.phone}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {ar ? 'العمولة:' : 'Commission:'} {Number(w.commission_fixed || 0).toLocaleString()} {ar ? 'دج ثابتة' : 'DA'} + {w.commission_percent || 0}%
                    </div>
                  </div>
                  <div className="flex gap-3 text-center" data-testid={`worker-stats-${w.id}`}>
                    <div><div className="font-bold text-emerald-700">{w.stats?.confirmed ?? 0}</div><div className="text-[10px] text-muted-foreground">{ar ? 'مؤكَّدة' : 'Confirmées'}</div></div>
                    <div><div className="font-bold text-blue-700">{w.stats?.shipped ?? 0}</div><div className="text-[10px] text-muted-foreground">{ar ? 'مشحونة' : 'Expédiées'}</div></div>
                    <div><div className="font-bold text-purple-700">{w.stats?.delivered ?? 0}</div><div className="text-[10px] text-muted-foreground">{ar ? 'مُسلَّمة' : 'Livrées'}</div></div>
                    <div><div className="font-bold text-amber-700">{Number(w.stats?.commission_due || 0).toLocaleString()}</div><div className="text-[10px] text-muted-foreground">{ar ? 'عمولة مستحقة (دج)' : 'Commission due'}</div></div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openCommissions(w)} data-testid={`worker-comm-${w.id}`}>
                      <Banknote className="w-4 h-4 text-amber-600" /> {ar ? 'العمولات' : 'Commissions'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(w)} data-testid={`worker-edit-${w.id}`}><Pencil className="w-4 h-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(w)} data-testid={`worker-toggle-${w.id}`}>
                      {w.active ? (ar ? 'إيقاف' : 'Stop') : (ar ? 'تفعيل' : 'Activer')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeWorker(w)} data-testid={`worker-del-${w.id}`}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* نموذج إضافة/تعديل عامل */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl" data-testid="worker-form-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? (ar ? 'تعديل العامل' : 'Modifier') : (ar ? 'إضافة عامل جديد' : 'Nouvel employé')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{ar ? 'الاسم' : 'Nom'}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="worker-name-input" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'الهاتف (للدخول)' : 'Téléphone'}</Label>
              <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0550 00 00 00" data-testid="worker-phone-input" />
            </div>
            <div className="space-y-1">
              <Label>{editing ? (ar ? 'رمز PIN جديد (اتركه فارغاً للإبقاء)' : 'Nouveau PIN (vide = inchangé)') : (ar ? 'رمز الدخول PIN (4-8 أرقام)' : 'PIN (4-8 chiffres)')}</Label>
              <Input dir="ltr" type="password" inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} data-testid="worker-pin-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{ar ? 'عمولة ثابتة / طلب مُسلَّم (دج)' : 'Fixe / livrée (DA)'}</Label>
                <Input type="number" min="0" value={form.commission_fixed} onChange={(e) => setForm({ ...form, commission_fixed: e.target.value })} data-testid="worker-fixed-input" />
              </div>
              <div className="space-y-1">
                <Label>{ar ? 'نسبة من قيمة الطلب (%)' : 'Pourcentage (%)'}</Label>
                <Input type="number" min="0" max="100" step="0.5" value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: e.target.value })} data-testid="worker-percent-input" />
              </div>
            </div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={save} disabled={saving} data-testid="worker-save-btn">
              {saving ? (ar ? 'جارٍ الحفظ…' : 'Enregistrement…') : (ar ? 'حفظ' : 'Enregistrer')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* حوار العمولات */}
      <Dialog open={!!commFor} onOpenChange={() => setCommFor(null)}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="worker-comm-dialog">
          <DialogHeader>
            <DialogTitle>{ar ? `عمولات — ${commFor?.name || ''}` : `Commissions — ${commFor?.name || ''}`}</DialogTitle>
          </DialogHeader>
          {commBusy && !commData ? (
            <div className="text-center py-8 text-muted-foreground">{ar ? 'جارٍ التحميل…' : 'Chargement…'}</div>
          ) : commData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="border rounded-lg p-2"><div className="font-bold text-lg" data-testid="comm-count">{commData.unsettled.count}</div><div className="text-[11px] text-muted-foreground">{ar ? 'طلبات مُسلَّمة غير مصفّاة' : 'Livrées non réglées'}</div></div>
                <div className="border rounded-lg p-2"><div className="font-bold text-lg">{Number(commData.unsettled.fixed_total).toLocaleString()}</div><div className="text-[11px] text-muted-foreground">{ar ? 'ثابت (دج)' : 'Fixe (DA)'}</div></div>
                <div className="border rounded-lg p-2"><div className="font-bold text-lg">{Number(commData.unsettled.percent_total).toLocaleString()}</div><div className="text-[11px] text-muted-foreground">{ar ? 'نسبة (دج)' : 'Part %'}</div></div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
                <div className="font-bold text-amber-800" data-testid="comm-total">
                  {ar ? 'الإجمالي المستحق:' : 'Total dû:'} {Number(commData.unsettled.total).toLocaleString()} {ar ? 'دج' : 'DA'}
                </div>
                {commData.unsettled.count > 0 && (
                  <div className="flex items-center gap-2">
                    <Select value={payBox} onValueChange={setPayBox}>
                      <SelectTrigger className="w-32 h-8" data-testid="comm-box-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">{ar ? 'الصندوق النقدي' : 'Caisse'}</SelectItem>
                        <SelectItem value="safe">{ar ? 'الخزنة' : 'Coffre'}</SelectItem>
                        <SelectItem value="bank">{ar ? 'البنك' : 'Banque'}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={settle} disabled={commBusy} data-testid="comm-settle-btn">
                      {ar ? 'تصفية ودفع' : 'Régler'}
                    </Button>
                  </div>
                )}
              </div>
              {commData.unsettled.orders.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40"><tr>
                      <th className="p-2 text-right">{ar ? 'الطلب' : 'Cmd'}</th>
                      <th className="p-2 text-right">{ar ? 'الزبون' : 'Client'}</th>
                      <th className="p-2 text-right">{ar ? 'قيمة الطلب' : 'Total'}</th>
                      <th className="p-2 text-right">{ar ? 'ثابت' : 'Fixe'}</th>
                      <th className="p-2 text-right">{ar ? 'نسبة' : '%'}</th>
                      <th className="p-2 text-right">{ar ? 'العمولة' : 'Comm.'}</th>
                    </tr></thead>
                    <tbody>
                      {commData.unsettled.orders.map((o, i) => (
                        <tr key={o.order_id} className="border-t" data-testid={`comm-row-${i}`}>
                          <td className="p-2 font-mono">{o.order_code}</td>
                          <td className="p-2">{o.customer || '—'}</td>
                          <td className="p-2">{Number(o.order_total).toLocaleString()}</td>
                          <td className="p-2">{Number(o.fixed).toLocaleString()}</td>
                          <td className="p-2">{Number(o.percent).toLocaleString()}</td>
                          <td className="p-2 font-semibold text-amber-700">{Number(o.commission).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {commData.settlements.length > 0 && (
                <div>
                  <div className="font-semibold text-sm mb-2">{ar ? 'سجل التصفيات' : 'Historique des règlements'}</div>
                  <div className="space-y-1">
                    {commData.settlements.map((s) => (
                      <div key={s.id} className="border rounded-lg p-2 text-xs flex justify-between" data-testid={`settlement-${s.id}`}>
                        <span>{new Date(s.created_at).toLocaleDateString('ar-DZ')} — {s.orders_count} {ar ? 'طلباً' : 'cmds'}</span>
                        <span className="font-semibold">{Number(s.total).toLocaleString()} {ar ? 'دج' : 'DA'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
