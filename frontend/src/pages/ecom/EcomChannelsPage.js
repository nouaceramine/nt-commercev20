import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Link2, Plus, RefreshCcw, Zap, Trash2, ArrowRight, AlertTriangle, CheckCircle2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { CHANNELS } from './ecomConstants';

const SUPPORTED_CHANNELS = ['shopify', 'facebook', 'instagram', 'tiktok', 'whatsapp', 'telegram', 'viber', 'yalidine', 'zr', 'maystro'];

// Per-channel credential field schemas — only used to render the right inputs in the dialog.
const CREDENTIAL_SCHEMA = {
  shopify:   [
    ['shop_domain', 'متجر Shopify (مثال: store.myshopify.com)'],
    ['admin_api_key', 'Admin API Access Token'],
    ['webhook_secret', 'Webhook Secret (لتحقق HMAC)'],
  ],
  facebook:  [['page_id', 'معرّف صفحة Facebook'], ['access_token', 'Page Access Token']],
  instagram: [['account_id', 'معرّف حساب Instagram Business'], ['access_token', 'Access Token']],
  tiktok:    [['shop_id', 'TikTok Shop ID'], ['access_token', 'Access Token']],
  whatsapp:  [['phone_number_id', 'Phone Number ID'], ['access_token', 'WhatsApp Cloud API Token']],
  telegram:  [['bot_token', 'Telegram Bot Token']],
  viber:     [['bot_token', 'Viber Bot Auth Token']],
  yalidine:  [['api_id', 'Yalidine API ID'], ['api_token', 'Yalidine API Token']],
  zr:        [['token', 'ZR Express API Token'], ['client_key', 'Client Key']],
  maystro:   [['api_key', 'Maystro API Key']],
};

export default function EcomChannelsPage() {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ channel: 'shopify', name: '', credentials: {}, is_active: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/ecom/integrations');
      setIntegrations(res.data.items || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل تحميل القنوات');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openCreate = (channel) => {
    setEditing(null);
    setForm({ channel, name: CHANNELS[channel]?.labelAr || channel, credentials: {}, is_active: true });
    setOpen(true);
  };

  const openEdit = (integration) => {
    setEditing(integration);
    setForm({
      channel: integration.channel,
      name: integration.name,
      credentials: {},   // empty inputs — leave blank to keep existing
      is_active: integration.is_active,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) { toast.error('اسم التكامل مطلوب'); return; }
    setSaving(true);
    try {
      if (editing) {
        const payload = { name: form.name, is_active: form.is_active };
        // Only send credentials fields the user actually typed.
        const cleanCreds = Object.fromEntries(
          Object.entries(form.credentials).filter(([, v]) => v && String(v).trim())
        );
        if (Object.keys(cleanCreds).length > 0) payload.credentials = cleanCreds;
        await apiClient.put(`/ecom/integrations/${editing.id}`, payload);
        toast.success('تم تحديث التكامل');
      } else {
        await apiClient.post('/ecom/integrations', form);
        toast.success('تم ربط القناة بنجاح');
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (id) => {
    try {
      const res = await apiClient.post(`/ecom/integrations/${id}/test`);
      toast.success(res.data.message || 'الاتصال يعمل');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل الاختبار');
    }
  };

  const remove = async (integration) => {
    if (!window.confirm(`هل تريد حذف تكامل "${integration.name}"؟`)) return;
    try {
      await apiClient.delete(`/ecom/integrations/${integration.id}`);
      toast.success('تم الحذف');
      load();
    } catch (err) {
      toast.error('فشل الحذف');
    }
  };

  const schema = CREDENTIAL_SCHEMA[form.channel] || [];

  return (
    <Layout>
      <div className="space-y-6 p-4 md:p-6" dir="rtl" data-testid="ecom-channels-page">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link to="/ecom-hub" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> العودة لصندوق الطلبات
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold mt-1 flex items-center gap-2">
              <Link2 className="w-7 h-7 text-emerald-600" />
              قنوات البيع
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              اربط متاجرك ووسائل التواصل لمزامنة الطلبات تلقائياً.
            </p>
          </div>
          <Button variant="outline" onClick={load}>
            <RefreshCcw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
        </div>

        {/* Mock-mode banner */}
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-2 text-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-amber-900">جميع القنوات في وضع المحاكاة (P1)</div>
            <div className="text-amber-800">
              يمكنك حفظ بيانات الربط الآن، ولكن المزامنة الفعلية مع Webhooks ستُفعَّل في المرحلة P2. مفاتيحك مخزَّنة بأمان ومُعدَّة للاستخدام.
            </div>
          </div>
        </div>

        {/* Available channels grid */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">قنوات متاحة للربط</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SUPPORTED_CHANNELS.map(key => {
                const meta = CHANNELS[key];
                const connectedCount = integrations.filter(i => i.channel === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => openCreate(key)}
                    className={`p-4 rounded-lg border-2 ${meta.color} hover:scale-105 transition-transform text-center space-y-1`}
                    data-testid={`connect-channel-${key}`}
                  >
                    <div className="text-3xl">{meta.icon}</div>
                    <div className="font-semibold">{meta.labelAr}</div>
                    {connectedCount > 0 ? (
                      <Badge className="bg-emerald-200 text-emerald-900 text-xs">
                        <CheckCircle2 className="w-3 h-3 ml-1" /> {connectedCount} مرتبط
                      </Badge>
                    ) : (
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Plus className="w-3 h-3" /> ربط
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Connected integrations list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">التكاملات المُعدَّة ({integrations.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">جارٍ التحميل...</div>
            ) : integrations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                لا توجد قنوات مرتبطة بعد. اختر قناة من الأعلى لبدء الربط.
              </div>
            ) : (
              <div className="space-y-2">
                {integrations.map(i => {
                  const meta = CHANNELS[i.channel] || CHANNELS.manual;
                  return (
                    <div key={i.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/20">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{meta.icon}</span>
                        <div>
                          <div className="font-semibold">{i.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {meta.labelAr} • {i.mode === 'mock' ? '🧪 محاكاة' : '✅ فعّال'}
                            {i.last_sync_at && ` • آخر مزامنة: ${new Date(i.last_sync_at).toLocaleString('ar-DZ')}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={i.is_active ? 'default' : 'outline'}>
                          {i.is_active ? 'مُفعَّل' : 'مُوقَف'}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => testConnection(i.id)} data-testid={`test-integration-${i.id}`}>
                          <Zap className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(i)}>
                          تعديل
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(i)} data-testid={`delete-integration-${i.id}`}>
                          <Trash2 className="w-4 h-4 text-rose-500" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {CHANNELS[form.channel]?.icon} {editing ? 'تعديل' : 'ربط'} {CHANNELS[form.channel]?.labelAr}
            </DialogTitle>
            <DialogDescription>
              المفاتيح تُخزَّن مشفَّرة. اتركها فارغة عند التعديل للحفاظ على القيم الحالية.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Shopify webhook URL — shown when editing an existing Shopify integration */}
            {editing && form.channel === 'shopify' && user?.tenant_id && (
              <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 space-y-1">
                <div className="text-xs font-semibold text-emerald-900">🪝 رابط الـ Webhook (انسخه إلى Shopify Admin → Notifications → Webhooks)</div>
                {(() => {
                  const url = `${process.env.REACT_APP_BACKEND_URL}/api/ecom/webhooks/shopify/${user.tenant_id}/${editing.id}/orders`;
                  return (
                    <div className="flex items-center gap-1">
                      <code className="flex-1 text-[10px] bg-white border rounded px-2 py-1 break-all" data-testid="shopify-webhook-url">{url}</code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { navigator.clipboard.writeText(url); toast.success('تم النسخ'); }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })()}
                <div className="text-[10px] text-emerald-800">الموضوع: <code>orders/create</code> • التنسيق: JSON • تأكد من إدخال نفس Webhook Secret في الحقل أدناه.</div>
              </div>
            )}

            {!editing && (
              <div>
                <Label>القناة</Label>
                <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v, credentials: {}, name: CHANNELS[v]?.labelAr || v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CHANNELS.map(k => (
                      <SelectItem key={k} value={k}>{CHANNELS[k].icon} {CHANNELS[k].labelAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>الاسم المعروض</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="integration-name-input" />
            </div>

            {schema.map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  type="password"
                  placeholder={editing ? '••••••••  (اترك فارغاً للإبقاء)' : ''}
                  value={form.credentials[key] || ''}
                  onChange={e => setForm({ ...form, credentials: { ...form.credentials, [key]: e.target.value } })}
                  data-testid={`integration-cred-${key}`}
                />
              </div>
            ))}

            <div className="flex items-center justify-between p-2 rounded border">
              <Label className="cursor-pointer">مُفعَّل</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                data-testid="integration-active-switch"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={saving} data-testid="integration-save-btn">
              {saving ? 'جارٍ الحفظ...' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
