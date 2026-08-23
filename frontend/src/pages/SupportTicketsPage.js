// Tenant support tickets (p254 UI for p246 backend) — create tickets, threaded
// conversation with the platform team, reply reopens resolved, close.
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LifeBuoy, Plus, RefreshCcw, Send, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useMediaQuery } from '../hooks/useMediaQuery';

const CATEGORY_AR = { technical: 'تقني', billing: 'فوترة', feature: 'اقتراح ميزة', other: 'أخرى' };
const STATUS_AR = { open: 'مفتوحة', in_progress: 'قيد المعالجة', resolved: 'محلولة', closed: 'مغلقة' };
const PRIORITY_AR = { low: 'منخفضة', normal: 'عادية', high: 'عالية' };

const emptyForm = { subject: '', message: '', category: 'technical', priority: 'normal' };

export default function SupportTicketsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(null); // ticket with messages
  const isTabletUp = useMediaQuery('(min-width: 768px)'); // p278
  const [reply, setReply] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/support/tickets');
      setItems(r.data.items || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر تحميل التذاكر');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.subject.trim() || !form.message.trim()) { toast.error('الموضوع والرسالة مطلوبان'); return; }
    setSaving(true);
    try {
      await apiClient.post('/support/tickets', form);
      toast.success('أُنشئت التذكرة');
      setShowCreate(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإنشاء');
    } finally {
      setSaving(false);
    }
  };

  const openTicket = async (t) => {
    try {
      const r = await apiClient.get(`/support/tickets/${t.id}`);
      setActive(r.data.ticket);
      setReply('');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر فتح التذكرة');
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    setSaving(true);
    try {
      await apiClient.post(`/support/tickets/${active.id}/reply`, { message: reply.trim() });
      setReply('');
      openTicket(active);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإرسال');
    } finally {
      setSaving(false);
    }
  };

  const closeTicket = async () => {
    try {
      await apiClient.post(`/support/tickets/${active.id}/close`);
      toast.success('أُغلقت التذكرة');
      setActive(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإغلاق');
    }
  };

  return (
    <Layout>
      <div className={`p-4 md:p-6 space-y-4 ${active && isTabletUp ? 'md:grid md:grid-cols-2 md:gap-4 md:space-y-0' : ''}`} dir="rtl" data-testid="support-tickets-page">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <LifeBuoy className="w-4 h-4" /> تذاكر الدعم الفني
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="tickets-refresh-btn">
                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" className="gap-1" onClick={() => setShowCreate(true)} data-testid="ticket-create-btn">
                <Plus className="w-4 h-4" /> تذكرة جديدة
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground text-center py-8" data-testid="tickets-empty">
                لا تذاكر — افتح تذكرة وسيرد عليك فريق المنصة هنا.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الرمز</TableHead>
                    <TableHead>الموضوع</TableHead>
                    <TableHead>التصنيف</TableHead>
                    <TableHead>الأولوية</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>آخر تحديث</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(t => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openTicket(t)} data-testid={`ticket-row-${t.id}`}>
                      <TableCell className="font-mono text-xs" dir="ltr">{t.code}</TableCell>
                      <TableCell className="font-medium">
                        {t.subject}
                        {t.tenant_unread && <Badge className="mr-2 bg-red-100 text-red-700">رد جديد</Badge>}
                      </TableCell>
                      <TableCell><Badge variant="secondary">{CATEGORY_AR[t.category] || t.category}</Badge></TableCell>
                      <TableCell>{PRIORITY_AR[t.priority] || t.priority}</TableCell>
                      <TableCell><Badge variant="outline">{STATUS_AR[t.status] || t.status}</Badge></TableCell>
                      <TableCell className="text-xs" dir="ltr">{(t.updated_at || '').replace('T', ' ').slice(0, 16)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* p278: tablet+ master-detail — لوح التفاصيل بجانب القائمة */}
        {active && isTabletUp && (
          <Card data-testid="ticket-detail-pane" className="h-fit md:sticky md:top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                <span>{active.subject} <span className="font-mono text-xs text-muted-foreground" dir="ltr">{active.code}</span></span>
                <div className="flex gap-2">
                  {active.status !== 'closed' && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={closeTicket} data-testid="ticket-close-btn-pane">
                      <XCircle className="w-3.5 h-3.5" /> إغلاق
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setActive(null)} data-testid="ticket-pane-close"><X className="w-4 h-4" /></Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 max-h-[50vh] overflow-y-auto border rounded p-3 bg-muted/20" data-testid="ticket-messages-pane">
                {(active.messages || []).map(m => (
                  <div key={m.id} className={`flex ${m.sender === 'tenant' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${m.sender === 'tenant' ? 'bg-white border' : 'bg-primary/10'}`}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{m.sender === 'platform' ? 'فريق المنصة' : (m.name || 'أنت')}</p>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">{(m.at || '').replace('T', ' ').slice(0, 16)}</p>
                    </div>
                  </div>
                ))}
              </div>
              {active.status !== 'closed' ? (
                <div className="flex gap-2">
                  <Input value={reply} onChange={e => setReply(e.target.value)} placeholder="اكتب رداً…"
                    onKeyDown={e => e.key === 'Enter' && sendReply()} data-testid="ticket-reply-input-pane" />
                  <Button onClick={sendReply} disabled={saving || !reply.trim()} data-testid="ticket-reply-btn-pane">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center">التذكرة مغلقة</p>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent dir="rtl" data-testid="ticket-create-dialog">
            <DialogHeader><DialogTitle>تذكرة دعم جديدة</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>الموضوع</Label>
                <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} data-testid="ticket-subject-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>التصنيف</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger data-testid="ticket-category-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_AR).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الأولوية</Label>
                  <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                    <SelectTrigger data-testid="ticket-priority-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_AR).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>وصف المشكلة</Label>
                <Textarea rows={4} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} data-testid="ticket-message-input" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={create} disabled={saving} data-testid="ticket-save-btn">{saving ? 'جارٍ الإرسال…' : 'إرسال'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!active && !isTabletUp} onOpenChange={(o) => !o && setActive(null)}>
          <DialogContent dir="rtl" className="max-w-xl" data-testid="ticket-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>{active?.subject} <span className="font-mono text-xs text-muted-foreground" dir="ltr">{active?.code}</span></span>
                {active?.status !== 'closed' && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={closeTicket} data-testid="ticket-close-btn">
                    <XCircle className="w-3.5 h-3.5" /> إغلاق
                  </Button>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto border rounded p-3 bg-muted/20" data-testid="ticket-messages">
              {(active?.messages || []).map(m => (
                <div key={m.id} className={`flex ${m.sender === 'tenant' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${m.sender === 'tenant' ? 'bg-white border' : 'bg-primary/10'}`}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{m.sender === 'platform' ? 'فريق المنصة' : (m.name || 'أنت')}</p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">{(m.at || '').replace('T', ' ').slice(0, 16)}</p>
                  </div>
                </div>
              ))}
            </div>
            {active?.status !== 'closed' ? (
              <div className="flex gap-2">
                <Input value={reply} onChange={e => setReply(e.target.value)} placeholder="اكتب رداً…"
                  onKeyDown={e => e.key === 'Enter' && sendReply()} data-testid="ticket-reply-input" />
                <Button onClick={sendReply} disabled={saving || !reply.trim()} data-testid="ticket-reply-btn">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center">التذكرة مغلقة</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
