// p287: مركز التكاملات — إدارة كل المفاتيح والويب هوكات من مكان واحد
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  KeyRound, Search, Plug, RefreshCw, Unplug, Copy, Eye, EyeOff,
  CheckCircle2, XCircle, ExternalLink, Webhook, BookOpen, Link2,
} from 'lucide-react';

const STATUS = {
  active:      { ar: 'مفعّل',            cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  needs_fix:   { ar: 'خطأ في المفتاح',    cls: 'bg-red-100 text-red-700 border-red-300' },
  inactive:    { ar: 'موقوف',            cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  empty:       { ar: 'غير مهيأ',         cls: 'bg-secondary text-secondary-foreground' },
  link:        { ar: 'صفحة مخصصة',       cls: 'bg-blue-100 text-blue-700 border-blue-300' },
};

function statusOf(item) {
  const s = item.status || {};
  if (item.link) return 'link';
  if (s.active) return 'active';
  if (s.configured && s.last_test && !s.last_test.ok) return 'needs_fix';
  if (s.configured) return 'inactive';
  return 'empty';
}

export default function IntegrationsHubPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);      // dialog integration id
  const [fields, setFields] = useState({});         // form values
  const [showSecrets, setShowSecrets] = useState({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);       // {ok, message}

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/integrations-hub/catalog');
      setItems(res.data?.items || []);
    } catch (e) {
      toast.error(ar ? 'فشل تحميل التكاملات' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [ar]);

  useEffect(() => { load(); }, [load]);

  const openDialog = (item) => {
    setOpenId(item.id);
    setFields({});
    setResult(null);
    setShowSecrets({});
  };

  const current = items.find(i => i.id === openId);

  const doConnect = async () => {
    if (!current) return;
    setBusy(true); setResult(null);
    try {
      const res = await apiClient.post(`/integrations-hub/${current.id}/connect`, { fields });
      setResult(res.data);
      if (res.data?.ok) toast.success(res.data.message); else toast.error(res.data.message);
      await load();
    } catch (e) {
      const msg = e.response?.data?.detail || (ar ? 'فشل الحفظ' : 'Échec');
      setResult({ ok: false, message: msg });
      toast.error(msg);
    } finally { setBusy(false); }
  };

  const doTest = async (id) => {
    setBusy(true);
    try {
      const res = await apiClient.post(`/integrations-hub/${id}/test`);
      if (res.data?.ok) toast.success(res.data.message); else toast.error(res.data.message);
      if (id === openId) setResult(res.data);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الفحص' : 'Échec du test'));
    } finally { setBusy(false); }
  };

  const doDisconnect = async (id) => {
    if (!window.confirm(ar ? 'إيقاف هذا التكامل؟ (تبقى المفاتيح محفوظة ومشفّرة)' : 'Désactiver ?')) return;
    try {
      await apiClient.post(`/integrations-hub/${id}/disconnect`);
      toast.success(ar ? 'أُوقف التكامل' : 'Désactivé');
      await load();
    } catch (e) {
      toast.error(ar ? 'فشل الإيقاف' : 'Échec');
    }
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast.success(ar ? 'نُسخ' : 'Copié'); }
    catch { toast.error(ar ? 'تعذّر النسخ' : 'Échec'); }
  };

  const filtered = items.filter(i =>
    !query || i.name_ar.includes(query) || i.id.includes(query.toLowerCase()) ||
    (i.desc_ar || '').includes(query));
  const categories = [...new Set(filtered.map(i => i.category))];
  const catLabel = (c) => filtered.find(i => i.category === c)?.category_label || c;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64"><div className="spinner" /></div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="integrations-hub-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <KeyRound className="h-8 w-8 text-primary" />
              </div>
              {ar ? 'مركز التكاملات' : 'Centre d\'intégrations'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {ar
                ? 'كل مفاتيح API والويب هوكات في مكان واحد — أدخل المفتاح، اختبر، وتُفعَّل الخدمة تلقائياً'
                : 'Toutes les clés API et webhooks au même endroit'}
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={ar ? 'بحث عن تكامل...' : 'Rechercher...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pe-10"
              data-testid="hub-search"
            />
          </div>
        </div>

        {/* Categories */}
        {categories.map(cat => (
          <div key={cat} className="space-y-3">
            <h2 className="text-lg font-semibold text-muted-foreground">{catLabel(cat)}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.filter(i => i.category === cat).map(item => {
                const st = statusOf(item);
                const meta = STATUS[st];
                return (
                  <Card key={item.id} className="hover:shadow-md transition-shadow" data-testid={`int-card-${item.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0"
                               style={{ backgroundColor: `${item.color}1a` }}>
                            {item.icon}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{item.name_ar}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{item.desc_ar}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={`${meta.cls} shrink-0`} data-testid={`int-status-${item.id}`}>
                          {st === 'active' && <CheckCircle2 className="h-3 w-3 me-1" />}
                          {st === 'needs_fix' && <XCircle className="h-3 w-3 me-1" />}
                          {ar ? meta.ar : st}
                        </Badge>
                      </div>

                      {/* masked creds summary */}
                      {Object.values(item.status?.masked || {}).some(Boolean) && (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(item.status.masked).filter(([, v]) => v).map(([k, v]) => (
                            <span key={k} className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{k}: {v}</span>
                          ))}
                        </div>
                      )}

                      {/* webhook */}
                      {item.webhook?.supported && item.webhook?.url && (
                        <div className="flex items-center gap-1 bg-muted/60 rounded-lg p-2">
                          <Webhook className="h-4 w-4 text-muted-foreground shrink-0" />
                          <code className="text-xs flex-1 truncate" dir="ltr" data-testid={`webhook-url-${item.id}`}>
                            {item.webhook.url}
                          </code>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copy(item.webhook.url)}
                                  data-testid={`webhook-copy-${item.id}`}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}

                      {/* actions */}
                      <div className="flex items-center gap-2 pt-1">
                        {item.link ? (
                          <Button variant="outline" size="sm" className="gap-1" asChild>
                            <a href={item.link.path} data-testid={`int-open-${item.id}`}>
                              <Link2 className="h-4 w-4" />
                              {ar ? item.link.label_ar : 'Ouvrir'}
                            </a>
                          </Button>
                        ) : (
                          <Button size="sm" className="gap-1" onClick={() => openDialog(item)}
                                  data-testid={`int-manage-${item.id}`}>
                            <Plug className="h-4 w-4" />
                            {item.status?.configured ? (ar ? 'إدارة' : 'Gérer') : (ar ? 'ربط' : 'Connecter')}
                          </Button>
                        )}
                        {!item.link && item.status?.configured && item.testable && (
                          <Button variant="outline" size="sm" disabled={busy} onClick={() => doTest(item.id)}
                                  data-testid={`int-test-${item.id}`}>
                            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                        {!item.link && item.status?.active && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => doDisconnect(item.id)}
                                  data-testid={`int-disconnect-${item.id}`}>
                            <Unplug className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}

        {/* Connect / Manage dialog */}
        <Dialog open={!!current} onOpenChange={(o) => !o && setOpenId(null)}>
          <DialogContent className="max-w-lg" data-testid={current ? `int-dialog-${current.id}` : undefined}>
            {current && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="text-xl">{current.icon}</span>
                    {current.name_ar}
                  </DialogTitle>
                  <DialogDescription>{current.desc_ar}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
                  {/* guide */}
                  {current.guide?.steps_ar?.length > 0 && (
                    <div className="rounded-lg border bg-muted/40 p-3 space-y-2" data-testid="int-guide">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        {ar ? 'كيف أجلب المفتاح؟' : 'Comment obtenir la clé ?'}
                      </p>
                      <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                        {current.guide.steps_ar.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                      {current.guide.url && (
                        <a href={current.guide.url} target="_blank" rel="noreferrer"
                           className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                          <ExternalLink className="h-3.5 w-3.5" />
                          {current.guide.url_label || current.guide.url}
                        </a>
                      )}
                    </div>
                  )}

                  {/* fields */}
                  {current.fields.map(f => (
                    <div key={f.key} className="space-y-1.5">
                      <Label>{f.label_ar}{f.required === false ? '' : ' *'}</Label>
                      <div className="relative">
                        <Input
                          type={f.secret && !showSecrets[f.key] ? 'password' : 'text'}
                          dir="ltr"
                          value={fields[f.key] ?? ''}
                          placeholder={current.status?.masked?.[f.key] || ''}
                          onChange={(e) => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                          data-testid={`int-field-${f.key}`}
                        />
                        {f.secret && (
                          <Button type="button" variant="ghost" size="icon"
                                  className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                  onClick={() => setShowSecrets(prev => ({ ...prev, [f.key]: !prev[f.key] }))}>
                            {showSecrets[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* result */}
                  {result && (
                    <div className={`rounded-lg border p-3 text-sm ${result.ok
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/30 dark:text-red-300'}`}
                         data-testid={`int-result-${current.id}`}>
                      {result.message}
                    </div>
                  )}

                  {/* webhook block */}
                  {current.webhook?.supported && current.webhook?.url && (
                    <div className="rounded-lg border p-3 space-y-2" data-testid={`int-webhook-${current.id}`}>
                      <p className="text-sm font-semibold flex items-center gap-2">
                        <Webhook className="h-4 w-4" />
                        {ar ? 'التحديث اللحظي (Webhook)' : 'Webhook'}
                      </p>
                      <div className="flex items-center gap-1">
                        <Input readOnly dir="ltr" value={current.webhook.url} className="text-xs font-mono" />
                        <Button variant="outline" size="icon" onClick={() => copy(current.webhook.url)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      {current.webhook.instructions && (
                        <p className="text-xs text-muted-foreground">{current.webhook.instructions}</p>
                      )}
                      {typeof current.webhook.events_received === 'number' && (
                        <p className="text-xs text-muted-foreground">
                          {ar ? `الأحداث المستلمة: ${current.webhook.events_received}` : `Événements: ${current.webhook.events_received}`}
                        </p>
                      )}
                    </div>
                  )}
                  {current.webhook && !current.webhook.supported && (
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2">
                      {current.webhook.instructions}
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpenId(null)}>
                    {ar ? 'إغلاق' : 'Fermer'}
                  </Button>
                  {current.fields.length > 0 && (
                    <Button onClick={doConnect} disabled={busy} className="gap-2"
                            data-testid={`int-save-${current.id}`}>
                      <Plug className="h-4 w-4" />
                      {busy ? (ar ? 'جارٍ الحفظ والفحص...' : 'Connexion...') : (ar ? 'حفظ واختبار' : 'Enregistrer et tester')}
                    </Button>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
