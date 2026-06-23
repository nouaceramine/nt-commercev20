import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { formatShortDate } from '../utils/globalDateFormatter';
import {
  MessageSquare, Settings, Send, Phone, Check, X,
  Clock, ArrowUpRight, ArrowDownRight, Activity, Wifi, WifiOff
} from 'lucide-react';

export default function WhatsAppPage() {
  const { t, language } = useLanguage();
  const [config, setConfig] = useState(null);
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({ incoming: 0, outgoing: 0, total: 0, is_active: false });
  const [loading, setLoading] = useState(true);
  const [configDialog, setConfigDialog] = useState(false);
  const [sendDialog, setSendDialog] = useState(false);
  const [configForm, setConfigForm] = useState({
    phone_number_id: '', access_token: '', verify_token: '',
    is_active: false, auto_reply: true,
    allowed_commands: ['expense', 'invoice', 'balance', 'report', 'sales']
  });
  const [sendForm, setSendForm] = useState({ to: '', message: '' });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [configRes, messagesRes, statsRes] = await Promise.all([
        apiClient.get(`/whatsapp/config`, { headers }),
        apiClient.get(`/whatsapp/messages?limit=50`, { headers }),
        apiClient.get(`/whatsapp/stats`, { headers }),
      ]);
      setConfig(configRes.data);
      setMessages(messagesRes.data);
      setStats(statsRes.data);
      setConfigForm(prev => ({ ...prev, ...configRes.data }));
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/whatsapp/config`, configForm);
      toast.success('تم حفظ الإعدادات');
      setConfigDialog(false);
      fetchData();
    } catch (error) {
      toast.error('خطأ في حفظ الإعدادات');
    }
  };

  const sendMessage = async () => {
    try {
      await apiClient.post(`/whatsapp/send`, sendForm);
      toast.success('تم إرسال الرسالة');
      setSendDialog(false);
      setSendForm({ to: '', message: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'خطأ في الإرسال');
    }
  };

  if (loading) return <Layout><div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-green-500 border-t-transparent rounded-full" /></div></Layout>;

  return (
    <Layout>
      <div className="space-y-6" data-testid="whatsapp-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="h-7 w-7 text-green-500" />
              WhatsApp Business
            </h1>
            <p className="text-muted-foreground mt-1">إدارة التكامل مع WhatsApp Business API</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfigDialog(true)} data-testid="whatsapp-config-btn">
              <Settings className="h-4 w-4 ml-2" /> الإعدادات
            </Button>
            <Button onClick={() => setSendDialog(true)} className="bg-green-600 hover:bg-green-700" data-testid="whatsapp-send-btn">
              <Send className="h-4 w-4 ml-2" /> إرسال رسالة
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">الحالة</p>
                  <div className="flex items-center gap-2 mt-1">
                    {stats.is_active ? (
                      <><Wifi className="h-5 w-5 text-green-500" /><span className="font-bold text-green-600">متصل</span></>
                    ) : (
                      <><WifiOff className="h-5 w-5 text-red-500" /><span className="font-bold text-red-600">غير متصل</span></>
                    )}
                  </div>
                </div>
                <Activity className="h-8 w-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">الرسائل الواردة</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.incoming}</p>
                </div>
                <ArrowDownRight className="h-8 w-8 text-blue-500/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">الرسائل الصادرة</p>
                  <p className="text-2xl font-bold text-green-600">{stats.outgoing}</p>
                </div>
                <ArrowUpRight className="h-8 w-8 text-green-500/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي الرسائل</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Commands Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الأوامر المدعومة</CardTitle>
            <CardDescription>الأوامر التي يمكن إرسالها عبر WhatsApp</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {[
                { cmd: 'مصروف', desc: 'تسجيل مصروف جديد', example: 'مصروف 5000 إيجار المحل' },
                { cmd: 'فاتورة', desc: 'إنشاء فاتورة', example: 'فاتورة أحمد 15000' },
                { cmd: 'رصيد', desc: 'استعلام عن الرصيد', example: 'رصيد' },
                { cmd: 'تقرير', desc: 'طلب تقرير يومي', example: 'تقرير اليوم' },
                { cmd: 'مبيعات', desc: 'ملخص المبيعات', example: 'مبيعات اليوم' },
              ].map((item, i) => (
                <div key={`item-${i}`} className="p-3 rounded-lg border bg-muted/30">
                  <Badge className="bg-green-100 text-green-700 mb-2">{item.cmd}</Badge>
                  <p className="text-sm font-medium">{item.desc}</p>
                  <p className="text-xs text-muted-foreground mt-1">مثال: {item.example}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Messages Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">سجل الرسائل</CardTitle>
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>لا توجد رسائل بعد</p>
                <p className="text-sm mt-1">قم بتفعيل WhatsApp وابدأ بإرسال واستقبال الرسائل</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاتجاه</TableHead>
                    <TableHead>الرقم</TableHead>
                    <TableHead>الرسالة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((msg) => (
                    <TableRow key={msg.id}>
                      <TableCell>
                        {msg.direction === 'incoming' ? (
                          <Badge variant="outline" className="text-blue-600"><ArrowDownRight className="h-3 w-3 ml-1" />وارد</Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-600"><ArrowUpRight className="h-3 w-3 ml-1" />صادر</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{msg.from || msg.to}</TableCell>
                      <TableCell className="max-w-xs truncate">{msg.message}</TableCell>
                      <TableCell><Badge variant="secondary">{msg.status}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatShortDate(msg.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Config Dialog */}
        <Dialog open={configDialog} onOpenChange={setConfigDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>إعدادات WhatsApp Business</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Phone Number ID</Label>
                <Input value={configForm.phone_number_id} onChange={e => setConfigForm(p => ({...p, phone_number_id: e.target.value}))} placeholder="أدخل Phone Number ID من Meta" />
              </div>
              <div>
                <Label>Access Token</Label>
                <Input type="password" value={configForm.access_token} onChange={e => setConfigForm(p => ({...p, access_token: e.target.value}))} placeholder="أدخل Access Token" />
              </div>
              <div>
                <Label>Verify Token</Label>
                <Input value={configForm.verify_token} onChange={e => setConfigForm(p => ({...p, verify_token: e.target.value}))} placeholder="رمز التحقق للـ Webhook" />
              </div>
              <div className="flex items-center justify-between">
                <Label>تفعيل WhatsApp</Label>
                <Switch checked={configForm.is_active} onCheckedChange={v => setConfigForm(p => ({...p, is_active: v}))} />
              </div>
              <div className="flex items-center justify-between">
                <Label>الرد التلقائي</Label>
                <Switch checked={configForm.auto_reply} onCheckedChange={v => setConfigForm(p => ({...p, auto_reply: v}))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfigDialog(false)}>إلغاء</Button>
              <Button onClick={saveConfig} className="bg-green-600 hover:bg-green-700">حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send Dialog */}
        <Dialog open={sendDialog} onOpenChange={setSendDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إرسال رسالة WhatsApp</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>رقم الهاتف</Label>
                <Input value={sendForm.to} onChange={e => setSendForm(p => ({...p, to: e.target.value}))} placeholder="+213XXXXXXXX" dir="ltr" />
              </div>
              <div>
                <Label>الرسالة</Label>
                <Textarea value={sendForm.message} onChange={e => setSendForm(p => ({...p, message: e.target.value}))} rows={4} placeholder="اكتب رسالتك هنا..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendDialog(false)}>إلغاء</Button>
              <Button onClick={sendMessage} className="bg-green-600 hover:bg-green-700">
                <Send className="h-4 w-4 ml-2" /> إرسال
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
