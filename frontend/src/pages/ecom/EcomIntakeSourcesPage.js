// Intake sources (p255 UI for p251 backend) — token-secured webhooks that turn
// YouCan / LightFunnels / Google Sheets / custom payloads into ecom orders.
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Webhook, Plus, RefreshCcw, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_AR = { youcan: 'YouCan', lightfunnels: 'LightFunnels', sheets: 'Google Sheets', custom: 'مخصص' };

export default function EcomIntakeSourcesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', source_type: 'youcan', mappingText: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/ecom/intake-sources');
      setItems(r.data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر تحميل المصادر');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) { toast.error('اسم المصدر مطلوب'); return; }
    let mapping = null;
    if (form.mappingText.trim()) {
      try {
        mapping = JSON.parse(form.mappingText.trim());
      } catch {
        toast.error('خريطة JSON غير صالحة');
        return;
      }
    }
    setSaving(true);
    try {
      await apiClient.post('/ecom/intake-sources', {
        name: form.name.trim(),
        source_type: form.source_type,
        ...(mapping ? { mapping } : {}),
      });
      toast.success('أُنشئ المصدر');
      setShowCreate(false);
      setForm({ name: '', source_type: 'youcan', mappingText: '' });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإنشاء');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s) => {
    try {
      await apiClient.put(`/ecom/intake-sources/${s.id}`, { active: !s.active });
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل التحديث');
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`حذف مصدر «${s.name}»؟ يبطل رابطه فوراً.`)) return;
    try {
      await apiClient.delete(`/ecom/intake-sources/${s.id}`);
      toast.success('حُذف المصدر');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الحذف');
    }
  };

  const copyWebhook = async (s) => {
    const url = `${window.location.origin}${s.webhook_url}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('نُسخ رابط الويب هوك');
    } catch {
      window.prompt('رابط الويب هوك:', url);
    }
  };

  return (
    <div className="p-4 md:p-6 pt-2 md:pt-2 space-y-4" dir="rtl" data-testid="intake-sources-page">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook className="w-4 h-4" /> مصادر استقبال الطلبات (Webhooks)
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="intake-refresh-btn">
              <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" className="gap-1" onClick={() => setShowCreate(true)} data-testid="intake-create-btn">
              <Plus className="w-4 h-4" /> مصدر جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            كل مصدر له رابط خاص تضعه في إعدادات YouCan أو LightFunnels أو أي نظام — كل طلب وارد يدخل
            بنفس خط المعالجة (كشف مكرر، تقييم مخاطر COD، سمعة الزبون) ويُرفض المكرر تلقائياً.
          </p>
          {items.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="intake-empty">لا مصادر بعد</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الويب هوك</TableHead>
                  <TableHead>وارد</TableHead>
                  <TableHead>أُنشئ</TableHead>
                  <TableHead>مكرر</TableHead>
                  <TableHead>مرفوض</TableHead>
                  <TableHead>مفعّل</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(s => (
                  <TableRow key={s.id} data-testid={`intake-row-${s.id}`}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell><Badge variant="secondary">{TYPE_AR[s.source_type] || s.source_type}</Badge></TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => copyWebhook(s)} data-testid={`intake-copy-${s.id}`}>
                        <Copy className="w-3.5 h-3.5" /> نسخ
                      </Button>
                    </TableCell>
                    <TableCell>{s.stats?.received || 0}</TableCell>
                    <TableCell><Badge className="bg-green-100 text-green-700">{s.stats?.created || 0}</Badge></TableCell>
                    <TableCell><Badge className="bg-amber-100 text-amber-700">{s.stats?.duplicates || 0}</Badge></TableCell>
                    <TableCell><Badge className="bg-red-100 text-red-700">{s.stats?.rejected || 0}</Badge></TableCell>
                    <TableCell>
                      <Switch checked={!!s.active} onCheckedChange={() => toggleActive(s)} data-testid={`intake-active-${s.id}`} />
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => remove(s)} data-testid={`intake-delete-${s.id}`}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl" data-testid="intake-create-dialog">
          <DialogHeader><DialogTitle>مصدر استقبال جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>اسم المصدر</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: متجر YouCan الرئيسي" data-testid="intake-name-input" />
            </div>
            <div>
              <Label>النوع</Label>
              <Select value={form.source_type} onValueChange={v => setForm({ ...form, source_type: v })}>
                <SelectTrigger data-testid="intake-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_AR).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.source_type === 'custom' && (
              <div>
                <Label>خريطة الحقول (JSON) — إلزامية للمخصص، مثال: {`{"name": "customer.full_name", "phone": "customer.phone|customer.mobile"}`}</Label>
                <Textarea rows={4} value={form.mappingText} onChange={e => setForm({ ...form, mappingText: e.target.value })} dir="ltr" className="font-mono text-xs" data-testid="intake-mapping-input" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={saving} data-testid="intake-save-btn">{saving ? 'جارٍ الحفظ…' : 'إنشاء'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
