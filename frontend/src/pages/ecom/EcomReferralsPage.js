// Referrals management (p252 UI for p245 backend) — referral codes with
// fixed/percent rewards, per-code stats, rewards ledger, and payout.
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Users, Plus, RefreshCcw, Copy, Trash2, Wallet, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';

const REWARD_STATUS_AR = { due: 'مستحقة', paid: 'مدفوعة', cancelled: 'ملغاة' };

const emptyForm = { name: '', phone: '', code: '', reward_type: 'fixed', reward_value: '', notes: '' };

export default function EcomReferralsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [ledger, setLedger] = useState(null); // {referral, rewards, payouts}

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/ecom/referrals');
      setItems(r.data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر تحميل الإحالات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) { toast.error('اسم المُحيل مطلوب'); return; }
    setSaving(true);
    try {
      await apiClient.post('/ecom/referrals', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        code: form.code.trim(),
        reward_type: form.reward_type,
        reward_value: parseFloat(form.reward_value) || 0,
        notes: form.notes.trim(),
      });
      toast.success('أُنشئت الإحالة');
      setShowCreate(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإنشاء');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (r) => {
    try {
      await apiClient.put(`/ecom/referrals/${r.id}`, { active: !r.active });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل التحديث');
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`حذف الإحالة «${r.name}»؟`)) return;
    try {
      await apiClient.delete(`/ecom/referrals/${r.id}`);
      toast.success('حُذفت الإحالة');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحذف');
    }
  };

  const copyCode = async (r) => {
    try {
      await navigator.clipboard.writeText(r.code);
      toast.success('نُسخ الرمز');
    } catch {
      window.prompt('رمز الإحالة:', r.code);
    }
  };

  const openLedger = async (r) => {
    try {
      const res = await apiClient.get(`/ecom/referrals/${r.id}/rewards`);
      setLedger({ referral: r, rewards: res.data.rewards || [], payouts: res.data.payouts || [] });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر تحميل السجل');
    }
  };

  const payout = async (r) => {
    try {
      const res = await apiClient.post(`/ecom/referrals/${r.id}/payout`);
      toast.success(`دُفعت ${res.data.payout.amount} دج`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الدفع');
    }
  };

  const fmt = (n) => `${Number(n || 0).toLocaleString('fr-DZ')} دج`;

  return (
    <div className="p-4 md:p-6 pt-2 md:pt-2 space-y-4" dir="rtl" data-testid="referrals-page">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" /> الإحالات — مكافآت على الطلبات المُسلَّمة
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="referrals-refresh-btn">
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" className="gap-1" onClick={() => setShowCreate(true)} data-testid="referral-create-btn">
              <Plus className="w-4 h-4" /> إحالة جديدة
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            يُدخل الزبون رمز الإحالة عند الطلب؛ عند التسليم تُحسب المكافأة تلقائياً، وتُلغى إذا أُلغي الطلب.
          </p>
          {items.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="referrals-empty">لا إحالات بعد</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الرمز</TableHead>
                  <TableHead>المُحيل</TableHead>
                  <TableHead>المكافأة</TableHead>
                  <TableHead>طلبات</TableHead>
                  <TableHead>مُسلَّمة</TableHead>
                  <TableHead>مستحقة</TableHead>
                  <TableHead>مدفوعة</TableHead>
                  <TableHead>مفعّلة</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(r => (
                  <TableRow key={r.id} data-testid={`referral-row-${r.id}`}>
                    <TableCell>
                      <button className="font-mono text-sm flex items-center gap-1" onClick={() => copyCode(r)} dir="ltr">
                        {r.code} <Copy className="w-3 h-3" />
                      </button>
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.name}
                      {r.phone && <div className="text-xs text-muted-foreground" dir="ltr">{r.phone}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {r.reward_type === 'percent' ? `${r.reward_value}%` : fmt(r.reward_value)}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.orders_count || 0}</TableCell>
                    <TableCell>{r.delivered_count || 0}</TableCell>
                    <TableCell><Badge className="bg-amber-100 text-amber-700">{fmt(r.reward_due)}</Badge></TableCell>
                    <TableCell><Badge className="bg-green-100 text-green-700">{fmt(r.reward_paid)}</Badge></TableCell>
                    <TableCell>
                      <Switch checked={!!r.active} onCheckedChange={() => toggleActive(r)} data-testid={`referral-active-${r.id}`} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => openLedger(r)} title="سجل المكافآت" data-testid={`referral-ledger-${r.id}`}>
                          <ListOrdered className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => payout(r)} disabled={!(r.reward_due > 0)} title="دفع المستحق" data-testid={`referral-payout-${r.id}`}>
                          <Wallet className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => remove(r)} data-testid={`referral-delete-${r.id}`}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl" data-testid="referral-create-dialog">
          <DialogHeader>
            <DialogTitle>إحالة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم المُحيل</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="referral-name-input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الهاتف (اختياري)</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} dir="ltr" />
              </div>
              <div>
                <Label>الرمز (يُولَّد تلقائياً إن تُرك فارغاً)</Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} dir="ltr" data-testid="referral-code-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>نوع المكافأة</Label>
                <Select value={form.reward_type} onValueChange={v => setForm({ ...form, reward_type: v })}>
                  <SelectTrigger data-testid="referral-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">مبلغ ثابت (دج)</SelectItem>
                    <SelectItem value="percent">نسبة من الطلب (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>القيمة</Label>
                <Input type="number" min="0" value={form.reward_value} onChange={e => setForm({ ...form, reward_value: e.target.value })} dir="ltr" data-testid="referral-value-input" />
              </div>
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={saving} data-testid="referral-save-btn">
              {saving ? 'جارٍ الحفظ…' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ledger} onOpenChange={(o) => !o && setLedger(null)}>
        <DialogContent dir="rtl" className="max-w-2xl" data-testid="referral-ledger-dialog">
          <DialogHeader>
            <DialogTitle>سجل مكافآت {ledger?.referral?.name} ({ledger?.referral?.code})</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <h4 className="text-sm font-medium mb-2">المكافآت</h4>
              {ledger?.rewards?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الطلب</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>التاريخ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.rewards.map(w => (
                      <TableRow key={w.id}>
                        <TableCell className="font-mono text-xs" dir="ltr">{w.order_code || w.order_id}</TableCell>
                        <TableCell>{fmt(w.amount)}</TableCell>
                        <TableCell><Badge variant="secondary">{REWARD_STATUS_AR[w.status] || w.status}</Badge></TableCell>
                        <TableCell className="text-xs" dir="ltr">{(w.created_at || '').slice(0, 10)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="text-xs text-muted-foreground">لا مكافآت بعد</p>}
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">الدفعات</h4>
              {ledger?.payouts?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>عدد المكافآت</TableHead>
                      <TableHead>التاريخ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.payouts.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>{fmt(p.amount)}</TableCell>
                        <TableCell>{(p.reward_ids || []).length}</TableCell>
                        <TableCell className="text-xs" dir="ltr">{(p.created_at || '').slice(0, 10)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="text-xs text-muted-foreground">لا دفعات بعد</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
