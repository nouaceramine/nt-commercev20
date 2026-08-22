// Super-admin support tickets console (p254 UI for p246 backend) — all tenant
// tickets, unread triage, reply (moves open→in_progress), status/priority edit.
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../lib/apiClient';
import { Layout } from '../../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { LifeBuoy, RefreshCcw, Send } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_AR = { technical: 'تقني', billing: 'فوترة', feature: 'اقتراح ميزة', other: 'أخرى' };
const STATUS_AR = { open: 'مفتوحة', in_progress: 'قيد المعالجة', resolved: 'محلولة', closed: 'مغلقة' };
const PRIORITY_AR = { low: 'منخفضة', normal: 'عادية', high: 'عالية' };

export default function SaasSupportPage() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const r = await apiClient.get('/admin/support/tickets', { params });
      setItems(r.data.items || []);
      setUnread(r.data.platform_unread_count || 0);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر تحميل التذاكر');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openTicket = async (t) => {
    try {
      const r = await apiClient.get(`/admin/support/tickets/${t.id}`);
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
      await apiClient.post(`/admin/support/tickets/${active.id}/reply`, { message: reply.trim() });
      setReply('');
      openTicket(active);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإرسال');
    } finally {
      setSaving(false);
    }
  };

  const update = async (patch) => {
    try {
      await apiClient.put(`/admin/support/tickets/${active.id}`, patch);
      openTicket(active);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل التحديث');
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4" dir="rtl" data-testid="saas-support-page">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <LifeBuoy className="w-4 h-4" /> تذاكر دعم المشتركين
              {unread > 0 && <Badge className="bg-red-100 text-red-700" data-testid="support-unread-badge">{unread} بلا رد</Badge>}
            </CardTitle>
            <div className="flex gap-2 items-center">
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-32 h-8 text-xs" data-testid="support-status-filter"><SelectValue placeholder="الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {Object.entries(STATUS_AR).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="support-refresh-btn">
                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground text-center py-8" data-testid="support-empty">لا تذاكر</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الرمز</TableHead>
                    <TableHead>المشترك</TableHead>
                    <TableHead>الموضوع</TableHead>
                    <TableHead>التصنيف</TableHead>
                    <TableHead>الأولوية</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>آخر تحديث</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(t => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openTicket(t)} data-testid={`support-row-${t.id}`}>
                      <TableCell className="font-mono text-xs" dir="ltr">{t.code}</TableCell>
                      <TableCell>{t.tenant_name || t.tenant_id}</TableCell>
                      <TableCell className="font-medium">
                        {t.subject}
                        {t.platform_unread && <Badge className="mr-2 bg-red-100 text-red-700">جديد</Badge>}
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

        <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
          <DialogContent dir="rtl" className="max-w-xl" data-testid="support-ticket-dialog">
            <DialogHeader>
              <DialogTitle>
                {active?.subject} <span className="font-mono text-xs text-muted-foreground" dir="ltr">{active?.code}</span>
                <span className="text-xs text-muted-foreground"> — {active?.tenant_name}</span>
              </DialogTitle>
            </DialogHeader>
            {active && (
              <div className="flex gap-3 items-center text-sm">
                <span className="text-xs text-muted-foreground">الحالة:</span>
                <Select value={active.status} onValueChange={v => update({ status: v })}>
                  <SelectTrigger className="w-36 h-8 text-xs" data-testid="support-status-set"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_AR).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">الأولوية:</span>
                <Select value={active.priority} onValueChange={v => update({ priority: v })}>
                  <SelectTrigger className="w-28 h-8 text-xs" data-testid="support-priority-set"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_AR).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2 max-h-[45vh] overflow-y-auto border rounded p-3 bg-muted/20" data-testid="support-ticket-messages">
              {(active?.messages || []).map(m => (
                <div key={m.id} className={`flex ${m.sender === 'platform' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${m.sender === 'platform' ? 'bg-white border' : 'bg-primary/10'}`}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{m.sender === 'platform' ? (m.name || 'الدعم الفني') : `${m.name || ''} (${active?.tenant_name})`}</p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">{(m.at || '').replace('T', ' ').slice(0, 16)}</p>
                  </div>
                </div>
              ))}
            </div>
            {active?.status !== 'closed' ? (
              <div className="flex gap-2">
                <Input value={reply} onChange={e => setReply(e.target.value)} placeholder="رد على المشترك…"
                  onKeyDown={e => e.key === 'Enter' && sendReply()} data-testid="support-reply-input" />
                <Button onClick={sendReply} disabled={saving || !reply.trim()} data-testid="support-reply-btn">
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
