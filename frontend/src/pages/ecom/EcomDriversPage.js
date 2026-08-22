// Drivers management (p252 UI for p247 backend) — create drivers, copy their
// token link (/driver/{token}), toggle active, rotate token, delete when idle.
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Truck, Plus, RefreshCcw, Copy, Trash2, KeyRound, Phone } from 'lucide-react';
import { toast } from 'sonner';

const driverLink = (token) => `${window.location.origin}/driver/${token}`;

export default function EcomDriversPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/ecom/drivers');
      setItems(r.data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر تحميل السائقين');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) { toast.error('اسم السائق مطلوب'); return; }
    setSaving(true);
    try {
      await apiClient.post('/ecom/drivers', { name: form.name.trim(), phone: form.phone.trim() });
      toast.success('أُنشئ السائق');
      setShowCreate(false);
      setForm({ name: '', phone: '' });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإنشاء');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d) => {
    try {
      await apiClient.put(`/ecom/drivers/${d.id}`, { active: !d.active });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل التحديث');
    }
  };

  const rotateToken = async (d) => {
    try {
      const r = await apiClient.put(`/ecom/drivers/${d.id}`, { rotate_token: true });
      toast.success('رُوّتب الرابط — الرابط القديم بطل');
      await navigator.clipboard.writeText(driverLink(r.data.driver.token)).catch(() => {});
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل تدوير الرابط');
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`حذف السائق «${d.name}»؟`)) return;
    try {
      await apiClient.delete(`/ecom/drivers/${d.id}`);
      toast.success('حُذف السائق');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحذف');
    }
  };

  const copyLink = async (d) => {
    try {
      await navigator.clipboard.writeText(driverLink(d.token));
      toast.success('نُسخ رابط السائق');
    } catch {
      window.prompt('رابط السائق:', driverLink(d.token));
    }
  };

  return (
    <div className="p-4 md:p-6 pt-2 md:pt-2 space-y-4" dir="rtl" data-testid="drivers-page">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="w-4 h-4" /> السائقون — تسليم الطلبات عبر رابط الهاتف
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="drivers-refresh-btn">
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" className="gap-1" onClick={() => setShowCreate(true)} data-testid="driver-create-btn">
              <Plus className="w-4 h-4" /> سائق جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            كل سائق يملك رابطاً خاصاً يفتحه على هاتفه — بدون حساب — ليرى مشاويره ويؤكد التسليم بالمسح.
          </p>
          {items.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="drivers-empty">لا سائقين بعد</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>مشاوير مفتوحة</TableHead>
                  <TableHead>سُلّم (الكل)</TableHead>
                  <TableHead>مفعّل</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(d => (
                  <TableRow key={d.id} data-testid={`driver-row-${d.id}`}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell dir="ltr">
                      {d.phone ? (
                        <a href={`tel:${d.phone}`} className="flex items-center gap-1 text-sm">
                          <Phone className="w-3 h-3" /> {d.phone}
                        </a>
                      ) : '—'}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{d.open_runs || 0}</Badge></TableCell>
                    <TableCell><Badge className="bg-green-100 text-green-700">{d.delivered_total || 0}</Badge></TableCell>
                    <TableCell>
                      <Switch checked={!!d.active} onCheckedChange={() => toggleActive(d)} data-testid={`driver-active-${d.id}`} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => copyLink(d)} data-testid={`driver-copy-${d.id}`}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => rotateToken(d)} title="تدوير الرابط" data-testid={`driver-rotate-${d.id}`}>
                          <KeyRound className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => remove(d)} data-testid={`driver-delete-${d.id}`}>
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
        <DialogContent dir="rtl" data-testid="driver-create-dialog">
          <DialogHeader>
            <DialogTitle>سائق جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الاسم</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="driver-name-input" />
            </div>
            <div>
              <Label>الهاتف (اختياري)</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} dir="ltr" data-testid="driver-phone-input" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={saving} data-testid="driver-save-btn">
              {saving ? 'جارٍ الحفظ…' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
