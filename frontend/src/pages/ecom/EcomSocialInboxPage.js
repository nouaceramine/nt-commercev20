// Unified social inbox (p253 UI for p249 backend) — messenger/instagram/whatsapp
// sources with token webhook URLs, threaded conversations with unread badges,
// mock outbound replies, one-click convert-to-order.
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { MessageSquare, Plus, RefreshCcw, Copy, Trash2, Send, ShoppingBag, X, XCircle, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { useMediaQuery } from '../../hooks/useMediaQuery';

const CHANNEL_AR = { messenger: 'ماسنجر', instagram: 'إنستغرام', whatsapp: 'واتساب' };
const STATUS_AR = { open: 'مفتوحة', converted: 'مُحوَّلة', closed: 'مغلقة' };

const emptyConvert = { customer_name: '', phone: '', address: '', city: '', wilaya: '', product: '', qty: 1, price: '', shipping_fee: '' };

export default function EcomSocialInboxPage() {
  const [sources, setSources] = useState([]);
  const [convs, setConvs] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState({ status: '', channel: '' });
  const [active, setActive] = useState(null); // {conversation, messages}
  const isTabletUp = useMediaQuery('(min-width: 768px)'); // p278
  const [reply, setReply] = useState('');
  const [showSource, setShowSource] = useState(false);
  const [srcForm, setSrcForm] = useState({ channel: 'messenger', name: '' });
  const [showConvert, setShowConvert] = useState(false);
  const [convForm, setConvForm] = useState(emptyConvert);
  const [saving, setSaving] = useState(false);

  const loadSources = useCallback(async () => {
    try {
      const r = await apiClient.get('/ecom/social/sources');
      setSources(r.data.items || []);
    } catch { /* surfaced on main load */ }
  }, []);

  const loadConvs = useCallback(async () => {
    try {
      const params = {};
      if (filter.status) params.status = filter.status;
      if (filter.channel) params.channel = filter.channel;
      const r = await apiClient.get('/ecom/social/conversations', { params });
      setConvs(r.data.items || []);
      setUnreadCount(r.data.unread_conversations || 0);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر تحميل الوارد');
    }
  }, [filter]);

  useEffect(() => { loadSources(); }, [loadSources]);
  useEffect(() => { loadConvs(); }, [loadConvs]);

  const openConv = async (c) => {
    try {
      const r = await apiClient.get(`/ecom/social/conversations/${c.id}`);
      setActive(r.data);
      setReply('');
      loadConvs();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'تعذر فتح المحادثة');
    }
  };

  const createSource = async () => {
    setSaving(true);
    try {
      await apiClient.post('/ecom/social/sources', srcForm);
      toast.success('أُنشئ المصدر');
      setShowSource(false);
      setSrcForm({ channel: 'messenger', name: '' });
      loadSources();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإنشاء');
    } finally {
      setSaving(false);
    }
  };

  const deleteSource = async (s) => {
    if (!window.confirm(`حذف مصدر «${s.name || s.channel}»؟ يبطل ويب هوكه.`)) return;
    try {
      await apiClient.delete(`/ecom/social/sources/${s.id}`);
      toast.success('حُذف المصدر');
      loadSources();
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

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    setSaving(true);
    try {
      await apiClient.post(`/ecom/social/conversations/${active.conversation.id}/reply`, { text: reply.trim() });
      setReply('');
      openConv(active.conversation);
      toast.success('أُرسل الرد (وضع محاكاة — الإرسال الحقيقي يتطلب اعتماديات Meta)');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإرسال');
    } finally {
      setSaving(false);
    }
  };

  const convert = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/ecom/social/conversations/${active.conversation.id}/convert`, {
        ...convForm,
        qty: parseInt(convForm.qty) || 1,
        price: parseFloat(convForm.price) || 0,
        shipping_fee: parseFloat(convForm.shipping_fee) || 0,
      });
      toast.success('حُوِّلت المحادثة إلى طلب');
      setShowConvert(false);
      setConvForm(emptyConvert);
      openConv(active.conversation);
      loadConvs();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل التحويل');
    } finally {
      setSaving(false);
    }
  };

  const closeConv = async () => {
    try {
      await apiClient.post(`/ecom/social/conversations/${active.conversation.id}/close`);
      toast.success('أُغلقت المحادثة');
      setActive(null);
      loadConvs();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'فشل الإغلاق');
    }
  };

  return (
    <div className="p-4 md:p-6 pt-2 md:pt-2 space-y-4" dir="rtl" data-testid="social-inbox-page">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> مصادر الرسائل الاجتماعية
          </CardTitle>
          <Button size="sm" className="gap-1" onClick={() => setShowSource(true)} data-testid="source-create-btn">
            <Plus className="w-4 h-4" /> مصدر جديد
          </Button>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="sources-empty">
              لا مصادر بعد — أنشئ مصدراً لكل صفحة/حساب لتحصل على رابط ويب هوك تضعه في إعدادات Meta أو واتساب.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>القناة</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>رابط الويب هوك</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map(s => (
                  <TableRow key={s.id} data-testid={`source-row-${s.id}`}>
                    <TableCell><Badge variant="secondary">{CHANNEL_AR[s.channel] || s.channel}</Badge></TableCell>
                    <TableCell>{s.name || '—'}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => copyWebhook(s)} data-testid={`source-copy-${s.id}`}>
                        <Copy className="w-3.5 h-3.5" /> نسخ الرابط
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => deleteSource(s)} data-testid={`source-delete-${s.id}`}>
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

      {/* p278: tablet+ master-detail — قائمة المحادثات + لوح المحادثة جنباً إلى جنب */}
      <div className={active && isTabletUp ? 'md:grid md:grid-cols-2 md:gap-4' : ''}>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="w-4 h-4" /> صندوق الوارد
            {unreadCount > 0 && <Badge className="bg-red-100 text-red-700">{unreadCount} غير مقروءة</Badge>}
          </CardTitle>
          <div className="flex gap-2 items-center">
            <Select value={filter.channel} onValueChange={v => setFilter({ ...filter, channel: v === 'all' ? '' : v })}>
              <SelectTrigger className="w-28 h-8 text-xs" data-testid="inbox-channel-filter"><SelectValue placeholder="القناة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل القنوات</SelectItem>
                <SelectItem value="messenger">ماسنجر</SelectItem>
                <SelectItem value="instagram">إنستغرام</SelectItem>
                <SelectItem value="whatsapp">واتساب</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filter.status} onValueChange={v => setFilter({ ...filter, status: v === 'all' ? '' : v })}>
              <SelectTrigger className="w-28 h-8 text-xs" data-testid="inbox-status-filter"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="open">مفتوحة</SelectItem>
                <SelectItem value="converted">مُحوَّلة</SelectItem>
                <SelectItem value="closed">مغلقة</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadConvs} data-testid="inbox-refresh-btn">
              <RefreshCcw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {convs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="inbox-empty">لا محادثات</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الزبون</TableHead>
                  <TableHead>القناة</TableHead>
                  <TableHead>آخر رسالة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الطلب</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {convs.map(c => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openConv(c)} data-testid={`conv-row-${c.id}`}>
                    <TableCell className="font-medium">
                      {c.customer_name || c.external_user_id}
                      {c.unread > 0 && <Badge className="mr-2 bg-red-100 text-red-700">{c.unread}</Badge>}
                      {c.phone && <div className="text-xs text-muted-foreground" dir="ltr">{c.phone}</div>}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{CHANNEL_AR[c.channel] || c.channel}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-64 truncate">{c.last_message || '—'}</TableCell>
                    <TableCell><Badge variant="outline">{STATUS_AR[c.status] || c.status}</Badge></TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">{c.order_code || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* p278: لوح المحادثة (تابلت+) — الجوال يبقى على الحوار */}
      {active && isTabletUp && (
        <Card data-testid="conversation-pane" className="h-fit md:sticky md:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
              <span>{active.conversation?.customer_name || active.conversation?.external_user_id} — {CHANNEL_AR[active.conversation?.channel]}</span>
              <div className="flex gap-2">
                {active.conversation && !active.conversation.order_id && active.conversation.status !== 'closed' && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => {
                    setConvForm({
                      ...emptyConvert,
                      customer_name: active.conversation.customer_name || '',
                      phone: active.conversation.phone || '',
                    });
                    setShowConvert(true);
                  }} data-testid="conv-convert-btn-pane">
                    <ShoppingBag className="w-3.5 h-3.5" /> تحويل لطلب
                  </Button>
                )}
                {active.conversation?.status !== 'closed' && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={closeConv} data-testid="conv-close-btn-pane">
                    <XCircle className="w-3.5 h-3.5" /> إغلاق
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setActive(null)} data-testid="conv-pane-close"><X className="w-4 h-4" /></Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 max-h-[50vh] overflow-y-auto border rounded p-3 bg-muted/20" data-testid="conversation-messages-pane">
              {(active.messages || []).map(m => (
                <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`rounded-lg px-3 py-2 max-w-[80%] text-sm ${m.direction === 'out' ? 'bg-primary/10' : 'bg-white border'}`}>
                    <p>{m.text}</p>
                    <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">{(m.at || '').replace('T', ' ').slice(0, 16)}</p>
                  </div>
                </div>
              ))}
              {active.messages?.length === 0 && <p className="text-xs text-muted-foreground text-center">لا رسائل</p>}
            </div>
            {active.conversation?.order_id && (
              <p className="text-xs text-green-700">✓ حُوِّلت إلى الطلب <span className="font-mono" dir="ltr">{active.conversation.order_code}</span></p>
            )}
            {active.conversation?.status !== 'closed' && (
              <div className="flex gap-2">
                <Input value={reply} onChange={e => setReply(e.target.value)} placeholder="اكتب رداً…"
                  onKeyDown={e => e.key === 'Enter' && sendReply()} data-testid="reply-input-pane" />
                <Button onClick={sendReply} disabled={saving || !reply.trim()} data-testid="reply-send-btn-pane">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </div>

      {/* thread dialog */}
      <Dialog open={!!active && !isTabletUp} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent dir="rtl" className="max-w-xl" data-testid="conversation-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{active?.conversation?.customer_name || active?.conversation?.external_user_id} — {CHANNEL_AR[active?.conversation?.channel]}</span>
              <div className="flex gap-2">
                {active?.conversation && !active.conversation.order_id && active.conversation.status !== 'closed' && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => {
                    setConvForm({
                      ...emptyConvert,
                      customer_name: active.conversation.customer_name || '',
                      phone: active.conversation.phone || '',
                    });
                    setShowConvert(true);
                  }} data-testid="conv-convert-btn">
                    <ShoppingBag className="w-3.5 h-3.5" /> تحويل لطلب
                  </Button>
                )}
                {active?.conversation?.status !== 'closed' && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={closeConv} data-testid="conv-close-btn">
                    <XCircle className="w-3.5 h-3.5" /> إغلاق
                  </Button>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto border rounded p-3 bg-muted/20" data-testid="conversation-messages">
            {(active?.messages || []).map(m => (
              <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-start' : 'justify-end'}`}>
                <div className={`rounded-lg px-3 py-2 max-w-[80%] text-sm ${m.direction === 'out' ? 'bg-primary/10' : 'bg-white border'}`}>
                  <p>{m.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">{(m.at || '').replace('T', ' ').slice(0, 16)}</p>
                </div>
              </div>
            ))}
            {active?.messages?.length === 0 && <p className="text-xs text-muted-foreground text-center">لا رسائل</p>}
          </div>
          {active?.conversation?.order_id && (
            <p className="text-xs text-green-700">✓ حُوِّلت إلى الطلب <span className="font-mono" dir="ltr">{active.conversation.order_code}</span></p>
          )}
          {active?.conversation?.status !== 'closed' && (
            <div className="flex gap-2">
              <Input value={reply} onChange={e => setReply(e.target.value)} placeholder="اكتب رداً…"
                onKeyDown={e => e.key === 'Enter' && sendReply()} data-testid="reply-input" />
              <Button onClick={sendReply} disabled={saving || !reply.trim()} data-testid="reply-send-btn">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* create source */}
      <Dialog open={showSource} onOpenChange={setShowSource}>
        <DialogContent dir="rtl" data-testid="source-create-dialog">
          <DialogHeader><DialogTitle>مصدر رسائل جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>القناة</Label>
              <Select value={srcForm.channel} onValueChange={v => setSrcForm({ ...srcForm, channel: v })}>
                <SelectTrigger data-testid="source-channel-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="messenger">ماسنجر</SelectItem>
                  <SelectItem value="instagram">إنستغرام</SelectItem>
                  <SelectItem value="whatsapp">واتساب</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>اسم الصفحة/الحساب (اختياري)</Label>
              <Input value={srcForm.name} onChange={e => setSrcForm({ ...srcForm, name: e.target.value })} data-testid="source-name-input" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={createSource} disabled={saving} data-testid="source-save-btn">{saving ? 'جارٍ الحفظ…' : 'إنشاء'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* convert to order */}
      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent dir="rtl" data-testid="convert-dialog">
          <DialogHeader><DialogTitle>تحويل المحادثة إلى طلب</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>اسم الزبون</Label>
                <Input value={convForm.customer_name} onChange={e => setConvForm({ ...convForm, customer_name: e.target.value })} data-testid="convert-name-input" />
              </div>
              <div>
                <Label>الهاتف</Label>
                <Input value={convForm.phone} onChange={e => setConvForm({ ...convForm, phone: e.target.value })} dir="ltr" data-testid="convert-phone-input" />
              </div>
            </div>
            <div>
              <Label>المنتج</Label>
              <Input value={convForm.product} onChange={e => setConvForm({ ...convForm, product: e.target.value })} data-testid="convert-product-input" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>الكمية</Label>
                <Input type="number" min="1" value={convForm.qty} onChange={e => setConvForm({ ...convForm, qty: e.target.value })} dir="ltr" />
              </div>
              <div>
                <Label>السعر (دج)</Label>
                <Input type="number" min="0" value={convForm.price} onChange={e => setConvForm({ ...convForm, price: e.target.value })} dir="ltr" data-testid="convert-price-input" />
              </div>
              <div>
                <Label>الشحن (دج)</Label>
                <Input type="number" min="0" value={convForm.shipping_fee} onChange={e => setConvForm({ ...convForm, shipping_fee: e.target.value })} dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الولاية</Label>
                <Input value={convForm.wilaya} onChange={e => setConvForm({ ...convForm, wilaya: e.target.value })} />
              </div>
              <div>
                <Label>البلدية / العنوان</Label>
                <Input value={convForm.address} onChange={e => setConvForm({ ...convForm, address: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={convert} disabled={saving} data-testid="convert-save-btn">{saving ? 'جارٍ التحويل…' : 'إنشاء الطلب'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
