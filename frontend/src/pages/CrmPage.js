import _React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import {
  Users, Building2, GitMerge, Megaphone, Inbox, Trophy, Plus, Loader2,
  Phone, Star, Send, StickyNote, RefreshCw, Eye,
} from 'lucide-react';

// M13: Real-estate / marketing CRM hub — clients, units, matching, campaigns,
// omnichannel inbox, marketer performance.
const CLIENT_STATUS = {
  new: { ar: 'جديد', fr: 'Nouveau', cls: 'bg-gray-100 text-gray-700' },
  contacted: { ar: 'تم الاتصال', fr: 'Contacté', cls: 'bg-blue-100 text-blue-700' },
  interested: { ar: 'مهتم', fr: 'Intéressé', cls: 'bg-cyan-100 text-cyan-700' },
  viewing: { ar: 'معاينة', fr: 'Visite', cls: 'bg-violet-100 text-violet-700' },
  negotiation: { ar: 'تفاوض', fr: 'Négociation', cls: 'bg-orange-100 text-orange-700' },
  won: { ar: 'ناجح', fr: 'Gagné', cls: 'bg-green-100 text-green-700' },
  lost: { ar: 'ضائع', fr: 'Perdu', cls: 'bg-red-100 text-red-700' },
};
const UNIT_TYPES = { apartment: 'شقة', villa: 'فيلا', land: 'أرض', office: 'مكتب', shop: 'محل', studio: 'ستوديو', other: 'أخرى' };
const UNIT_STATUS = { available: { ar: 'متاحة', cls: 'bg-green-100 text-green-700' }, reserved: { ar: 'محجوزة', cls: 'bg-orange-100 text-orange-700' }, sold: { ar: 'مباعة', cls: 'bg-gray-200 text-gray-700' } };
const CHANNELS = { whatsapp: 'واتساب', messenger: 'ماسنجر', instagram: 'إنستغرام', telegram: 'تيليغرام', tiktok: 'تيك توك', x: 'X' };
const DECISIONS = { continue: { ar: 'استمرار', cls: 'bg-green-100 text-green-700' }, stop: { ar: 'إيقاف', cls: 'bg-red-100 text-red-700' }, review: { ar: 'مراجعة', cls: 'bg-yellow-100 text-yellow-700' } };

const CrmPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const cur = isAr ? 'دج' : 'DA';
  const fmt = (n) => (Number(n) || 0).toLocaleString(isAr ? 'ar-DZ' : 'fr-DZ', { maximumFractionDigits: 0 });

  const [tab, setTab] = useState('clients');
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [board, setBoard] = useState([]);
  const [report, setReport] = useState(null);
  const [savedReports, setSavedReports] = useState([]);
  const [commDlg, setCommDlg] = useState(false);
  const [commForm, setCommForm] = useState({ month: new Date().toISOString().slice(0, 7), rate: '' });

  // dialogs
  const [clientDlg, setClientDlg] = useState(false);
  const [clientForm, setClientForm] = useState({ name: '', phones: '', budget_min: '', budget_max: '', wilaya: '', unit_type_pref: '', notes: '' });
  const [unitDlg, setUnitDlg] = useState(false);
  const [unitForm, setUnitForm] = useState({ project_id: '', unit_type: 'apartment', area_m2: '', price: '', wilaya: '', address: '' });
  const [projectDlg, setProjectDlg] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', wilaya: '', developer: '' });
  const [campaignDlg, setCampaignDlg] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: '', platform: 'meta', spend: '', leads_count: '' });
  const [convDlg, setConvDlg] = useState(false);
  const [convForm, setConvForm] = useState({ channel: 'whatsapp', client_phone: '', client_name: '' });
  const [detail, setDetail] = useState(null); // client detail
  const [thread, setThread] = useState(null); // conversation detail
  const [msgText, setMsgText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [followForm, setFollowForm] = useState({ date: '', kind: 'call', note: '' });
  const [saving, setSaving] = useState(false);

  const safe = (p) => p.catch(() => ({ data: null }));
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [c, p, u, cp, cv, pf] = await Promise.all([
      safe(apiClient.get('/crm/clients')), safe(apiClient.get('/crm/projects')),
      safe(apiClient.get('/crm/units')), safe(apiClient.get('/crm/campaigns')),
      safe(apiClient.get('/crm/inbox')), safe(apiClient.get('/crm/performance')),
    ]);
    if (c.data) setClients(c.data.items || []);
    if (p.data) setProjects(p.data.items || []);
    if (u.data) setUnits(u.data.items || []);
    if (cp.data) setCampaigns(cp.data.items || []);
    if (cv.data) setConversations(cv.data.items || []);
    if (pf.data) setBoard(pf.data.items || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadReport = async () => {
    const r = await safe(apiClient.get('/crm/matching-report'));
    if (r.data) setReport(r.data);
    const s = await safe(apiClient.get('/crm/reports'));
    if (s.data) setSavedReports(s.data.items || []);
  };

  const applyCommissions = async () => {
    if (!Number(commForm.rate)) return;
    await doSubmit(async () => {
      const r = await apiClient.post('/crm/performance/apply-commissions', {
        month: commForm.month, rate_per_conversion: Number(commForm.rate),
      });
      toast.success(isAr ? `طُبّقت ${r.data.applied.length} عمولة` : `${r.data.applied.length} commissions appliquées`);
      setCommDlg(false);
    }, isAr ? 'طُبّقت العمولات' : 'Commissions appliquées');
  };

  const openClient = async (c) => {
    const r = await safe(apiClient.get(`/crm/clients/${c.id}`));
    if (r.data) setDetail(r.data);
  };

  const openThread = async (cv) => {
    const r = await safe(apiClient.get(`/crm/inbox/conversations/${cv.id}`));
    if (r.data) setThread(r.data);
  };

  const doSubmit = async (fn, okMsg) => {
    setSaving(true);
    try {
      await fn();
      toast.success(okMsg);
      await loadAll();
      return true;
    } catch (e) {
      toast.error(e?.response?.data?.detail?.errors?.join(', ') || (isAr ? 'فشل الحفظ' : 'Échec'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submitClient = () => doSubmit(async () => {
    await apiClient.post('/crm/clients', {
      ...clientForm,
      phones: clientForm.phones.split(',').map(s => s.trim()).filter(Boolean),
      budget_min: clientForm.budget_min ? Number(clientForm.budget_min) : null,
      budget_max: clientForm.budget_max ? Number(clientForm.budget_max) : null,
      unit_type_pref: clientForm.unit_type_pref || null,
    });
    setClientDlg(false);
    setClientForm({ name: '', phones: '', budget_min: '', budget_max: '', wilaya: '', unit_type_pref: '', notes: '' });
  }, isAr ? 'أُضيف العميل' : 'Client ajouté');

  const submitProject = () => doSubmit(async () => {
    await apiClient.post('/crm/projects', projectForm);
    setProjectDlg(false);
    setProjectForm({ name: '', wilaya: '', developer: '' });
  }, isAr ? 'أُضيف المشروع' : 'Projet ajouté');

  const submitUnit = () => doSubmit(async () => {
    await apiClient.post('/crm/units', {
      ...unitForm,
      project_id: unitForm.project_id || null,
      area_m2: unitForm.area_m2 ? Number(unitForm.area_m2) : null,
      price: Number(unitForm.price || 0),
    });
    setUnitDlg(false);
    setUnitForm({ project_id: '', unit_type: 'apartment', area_m2: '', price: '', wilaya: '', address: '' });
  }, isAr ? 'أُضيفت الوحدة' : 'Unité ajoutée');

  const submitCampaign = () => doSubmit(async () => {
    await apiClient.post('/crm/campaigns', {
      ...campaignForm,
      spend: Number(campaignForm.spend || 0),
      leads_count: Number(campaignForm.leads_count || 0),
    });
    setCampaignDlg(false);
    setCampaignForm({ name: '', platform: 'meta', spend: '', leads_count: '' });
  }, isAr ? 'أُضيفت الحملة' : 'Campagne ajoutée');

  const submitConversation = () => doSubmit(async () => {
    await apiClient.post('/crm/inbox/conversations', convForm);
    setConvDlg(false);
    setConvForm({ channel: 'whatsapp', client_phone: '', client_name: '' });
  }, isAr ? 'فُتحت المحادثة' : 'Conversation créée');

  const sendMessage = async () => {
    if (!msgText.trim() || !thread) return;
    await doSubmit(async () => {
      await apiClient.post(`/crm/inbox/conversations/${thread.id}/messages`, { text: msgText, direction: 'out' });
      setMsgText('');
      const r = await apiClient.get(`/crm/inbox/conversations/${thread.id}`);
      setThread(r.data);
    }, isAr ? 'أُرسلت' : 'Envoyé');
  };

  const addNote = async () => {
    if (!noteText.trim() || !thread) return;
    await doSubmit(async () => {
      await apiClient.post(`/crm/inbox/conversations/${thread.id}/notes`, { text: noteText });
      setNoteText('');
      const r = await apiClient.get(`/crm/inbox/conversations/${thread.id}`);
      setThread(r.data);
    }, isAr ? 'أُضيفت الملاحظة' : 'Note ajoutée');
  };

  const addFollowUp = async () => {
    if (!followForm.date || !detail) return;
    await doSubmit(async () => {
      await apiClient.post(`/crm/clients/${detail.id}/followups`, { ...followForm, date: new Date(followForm.date).toISOString() });
      setFollowForm({ date: '', kind: 'call', note: '' });
      const r = await apiClient.get(`/crm/clients/${detail.id}`);
      setDetail(r.data);
    }, isAr ? 'أُضيفت المتابعة' : 'Suivi ajouté');
  };

  const setClientStatus = async (cid, status) => {
    await doSubmit(async () => { await apiClient.put(`/crm/clients/${cid}`, { status }); }, isAr ? 'حُدّثت الحالة' : 'Statut maj');
    if (detail?.id === cid) openClient({ id: cid });
  };

  const setDecision = async (cid, decision) => {
    await doSubmit(async () => { await apiClient.put(`/crm/campaigns/${cid}`, { decision }); }, isAr ? 'سُجّل القرار' : 'Décision enregistrée');
  };

  return (
    <Layout>
      <div dir={isAr ? 'rtl' : 'ltr'} className="space-y-4" data-testid="crm-page">
        <div className="flex items-center justify-between">
          <h1 className="text-lg sm:text-2xl font-bold">{isAr ? 'إدارة العملاء العقارية' : 'CRM immobilier'}</h1>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading} data-testid="crm-refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="clients" data-testid="crm-tab-clients"><Users className="h-4 w-4 ml-1" />{isAr ? 'العملاء' : 'Clients'}</TabsTrigger>
            <TabsTrigger value="units" data-testid="crm-tab-units"><Building2 className="h-4 w-4 ml-1" />{isAr ? 'المشاريع والوحدات' : 'Projets & unités'}</TabsTrigger>
            <TabsTrigger value="matching" data-testid="crm-tab-matching" onClick={loadReport}><GitMerge className="h-4 w-4 ml-1" />{isAr ? 'المطابقة' : 'Matching'}</TabsTrigger>
            <TabsTrigger value="campaigns" data-testid="crm-tab-campaigns"><Megaphone className="h-4 w-4 ml-1" />{isAr ? 'الحملات' : 'Campagnes'}</TabsTrigger>
            <TabsTrigger value="inbox" data-testid="crm-tab-inbox"><Inbox className="h-4 w-4 ml-1" />{isAr ? 'الرسائل' : 'Inbox'}</TabsTrigger>
            <TabsTrigger value="performance" data-testid="crm-tab-performance"><Trophy className="h-4 w-4 ml-1" />{isAr ? 'الأداء' : 'Performance'}</TabsTrigger>
          </TabsList>

          {/* ── Clients ── */}
          <TabsContent value="clients">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{isAr ? `العملاء (${clients.length})` : `Clients (${clients.length})`}</CardTitle>
                <Button size="sm" onClick={() => setClientDlg(true)} data-testid="crm-add-client"><Plus className="h-4 w-4 ml-1" />{isAr ? 'عميل' : 'Client'}</Button>
              </CardHeader>
              <CardContent>
                {clients.length === 0 ? <p className="text-sm text-muted-foreground">{isAr ? 'لا عملاء بعد' : 'Aucun client'}</p> : (
                  <div className="space-y-2" data-testid="crm-clients-list">
                    {clients.map(c => (
                      <div key={c.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                        <div className="min-w-0">
                          <button className="font-medium text-sm hover:underline" onClick={() => openClient(c)} data-testid={`crm-client-${c.code}`}>{c.name}</button>
                          <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                            <span>{c.code}</span>
                            {(c.phones || []).map(p => <span key={p} className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{p}</span>)}
                            {c.budget_max ? <span>{fmt(c.budget_max)} {cur}</span> : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={(CLIENT_STATUS[c.status] || CLIENT_STATUS.new).cls}>{isAr ? (CLIENT_STATUS[c.status] || CLIENT_STATUS.new).ar : c.status}</Badge>
                          <Select value={c.status} onValueChange={(v) => setClientStatus(c.id, v)}>
                            <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(CLIENT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{isAr ? v.ar : k}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Projects & Units ── */}
          <TabsContent value="units">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{isAr ? 'المشاريع' : 'Projets'}</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setProjectDlg(true)} data-testid="crm-add-project"><Plus className="h-4 w-4" /></Button>
                </CardHeader>
                <CardContent className="space-y-2" data-testid="crm-projects-list">
                  {projects.map(p => (
                    <div key={p.id} className="border rounded-md p-2 text-sm">
                      <div className="font-medium">{p.name} <span className="text-xs text-muted-foreground">{p.code}</span></div>
                      <div className="text-xs text-muted-foreground">{p.wilaya} — {isAr ? `${p.available_count}/${p.units_count} متاحة` : `${p.available_count}/${p.units_count} dispo`}</div>
                    </div>
                  ))}
                  {projects.length === 0 && <p className="text-sm text-muted-foreground">{isAr ? 'لا مشاريع' : 'Aucun projet'}</p>}
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">{isAr ? `الوحدات (${units.length})` : `Unités (${units.length})`}</CardTitle>
                  <Button size="sm" onClick={() => setUnitDlg(true)} data-testid="crm-add-unit"><Plus className="h-4 w-4 ml-1" />{isAr ? 'وحدة' : 'Unité'}</Button>
                </CardHeader>
                <CardContent className="space-y-2" data-testid="crm-units-list">
                  {units.map(u => (
                    <div key={u.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium">{u.code}</span> — {UNIT_TYPES[u.unit_type] || u.unit_type}
                        {u.area_m2 ? ` · ${u.area_m2}م²` : ''} · {u.wilaya}
                        <div className="text-xs text-muted-foreground">{fmt(u.price)} {cur}{u.payment_plan?.months ? ` · ${u.payment_plan.months} ${isAr ? 'شهر' : 'mois'}` : ''}</div>
                      </div>
                      <Badge className={(UNIT_STATUS[u.status] || UNIT_STATUS.available).cls}>{isAr ? (UNIT_STATUS[u.status] || UNIT_STATUS.available).ar : u.status}</Badge>
                    </div>
                  ))}
                  {units.length === 0 && <p className="text-sm text-muted-foreground">{isAr ? 'لا وحدات' : 'Aucune unité'}</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Matching ── */}
          <TabsContent value="matching">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{isAr ? 'تقرير المطابقة التلقائي' : 'Rapport de matching'}</CardTitle>
                <Button size="sm" variant="outline" onClick={loadReport} data-testid="crm-run-matching"><RefreshCw className="h-4 w-4 ml-1" />{isAr ? 'توليد' : 'Générer'}</Button>
              </CardHeader>
              <CardContent>
                {!report ? <p className="text-sm text-muted-foreground">{isAr ? 'اضغط توليد' : 'Cliquez Générer'}</p> : (
                  <div className="grid gap-4 md:grid-cols-2" data-testid="crm-matching-report">
                    <div>
                      <div className="text-sm font-semibold mb-2">{isAr ? `أفضل عميل لكل وحدة (${report.unit_matches.length})` : `Meilleur client par unité (${report.unit_matches.length})`}</div>
                      {report.unit_matches.map((m, i) => (
                        <div key={i} className="flex justify-between border rounded px-2 py-1.5 text-xs mb-1">
                          <span>{m.unit_code} ← {m.client_name}</span>
                          <Badge variant="secondary">{m.score}</Badge>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="text-sm font-semibold mb-2">{isAr ? `أفضل وحدة لكل عميل (${report.client_matches.length})` : `Meilleure unité par client (${report.client_matches.length})`}</div>
                      {report.client_matches.map((m, i) => (
                        <div key={i} className="flex justify-between border rounded px-2 py-1.5 text-xs mb-1">
                          <span>{m.client_name} ← {m.unit_code}</span>
                          <Badge variant="secondary">{m.score}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {savedReports.length > 0 && (
                  <div className="mt-4 pt-3 border-t" data-testid="crm-saved-reports">
                    <div className="text-sm font-semibold mb-2">{isAr ? 'التقارير المحفوظة (تلقائية أسبوعية/شهرية)' : 'Rapports sauvegardés (auto)'}</div>
                    {savedReports.map(r => (
                      <div key={r.id} className="flex justify-between border rounded px-2 py-1.5 text-xs mb-1">
                        <span>{r.period_key} — {isAr ? (r.period === 'weekly' ? 'أسبوعي' : 'شهري') : r.period} · {r.trigger === 'auto' ? (isAr ? 'تلقائي' : 'auto') : (isAr ? 'يدوي' : 'manuel')}</span>
                        <span className="text-muted-foreground">{(r.generated_at || '').slice(0, 16).replace('T', ' ')} · {r.unit_matches.length + r.client_matches.length} {isAr ? 'مطابقة' : 'matches'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="campaigns">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{isAr ? 'الحملات الإعلانية' : 'Campagnes'}</CardTitle>
                <Button size="sm" onClick={() => setCampaignDlg(true)} data-testid="crm-add-campaign"><Plus className="h-4 w-4 ml-1" />{isAr ? 'حملة' : 'Campagne'}</Button>
              </CardHeader>
              <CardContent className="space-y-2" data-testid="crm-campaigns-list">
                {campaigns.map(c => (
                  <div key={c.id} className="border rounded-md p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.name} <span className="text-xs text-muted-foreground">{c.code} · {c.platform}</span></span>
                      <Select value={c.decision} onValueChange={(v) => setDecision(c.id, v)}>
                        <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(DECISIONS).map(([k, v]) => <SelectItem key={k} value={k}>{isAr ? v.ar : k}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 text-xs">
                      <div>{isAr ? 'الصرف' : 'Dépense'}: <b>{fmt(c.spend)}</b></div>
                      <div>{isAr ? 'العملاء المحتملون' : 'Leads'}: <b>{c.leads_count}</b></div>
                      <div>{isAr ? 'محادثات' : 'Convs'}: <b>{c.conversations_count}</b></div>
                      <div>{isAr ? 'تحويلات' : 'Conversions'}: <b>{c.conversions}</b></div>
                      <div>{isAr ? 'كلفة/عميل' : 'CPL'}: <b>{c.metrics.cost_per_lead != null ? fmt(c.metrics.cost_per_lead) : '—'}</b></div>
                    </div>
                  </div>
                ))}
                {campaigns.length === 0 && <p className="text-sm text-muted-foreground">{isAr ? 'لا حملات' : 'Aucune campagne'}</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Inbox ── */}
          <TabsContent value="inbox">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{isAr ? 'صندوق الرسائل الموحّد' : 'Inbox omnicanal'}</CardTitle>
                <Button size="sm" onClick={() => setConvDlg(true)} data-testid="crm-add-conversation"><Plus className="h-4 w-4 ml-1" />{isAr ? 'محادثة' : 'Conversation'}</Button>
              </CardHeader>
              <CardContent className="space-y-2" data-testid="crm-inbox-list">
                {conversations.map(cv => (
                  <button key={cv.id} className="w-full text-right border rounded-md px-3 py-2 hover:bg-accent" onClick={() => openThread(cv)} data-testid={`crm-conv-${cv.code}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{cv.client_name || cv.client_phone || cv.code}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline">{CHANNELS[cv.channel] || cv.channel}</Badge>
                        <Badge variant={cv.status === 'converted' ? 'default' : 'secondary'}>{cv.status}</Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{(cv.last_message_at || '').slice(0, 16).replace('T', ' ')}</div>
                  </button>
                ))}
                {conversations.length === 0 && <p className="text-sm text-muted-foreground">{isAr ? 'لا محادثات' : 'Aucune conversation'}</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Performance ── */}
          <TabsContent value="performance">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{isAr ? 'ترتيب المسوقين' : 'Classement marketers'}</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setCommDlg(true)} data-testid="crm-apply-commissions">{isAr ? 'تطبيق العمولات' : 'Appliquer commissions'}</Button>
              </CardHeader>
              <CardContent className="space-y-2" data-testid="crm-performance-list">
                {board.map(b => (
                  <div key={b.employee_id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                    <span><Badge variant="outline" className="ml-2">#{b.rank}</Badge>{b.name}</span>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>{isAr ? 'محادثات' : 'Convs'} {b.conversations}</span>
                      <span>{isAr ? 'تحويلات' : 'Conv.'} {b.conversions}</span>
                      <span>{isAr ? 'مهام' : 'Tâches'} {b.tasks_done}</span>
                      <span>{isAr ? 'معاينات' : 'Visites'} {b.viewings}</span>
                      <span>{isAr ? 'نشاط' : 'Act.'} {Math.round(b.minutes_active / 60)}h</span>
                    </div>
                    <Badge>{b.score}</Badge>
                  </div>
                ))}
                {board.length === 0 && <p className="text-sm text-muted-foreground">{isAr ? 'لا موظفون' : 'Aucun employé'}</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Dialogs ── */}
        <Dialog open={clientDlg} onOpenChange={setClientDlg}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'عميل جديد' : 'Nouveau client'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{isAr ? 'الاسم *' : 'Nom *'}</Label><Input value={clientForm.name} onChange={e => setClientForm(f => ({ ...f, name: e.target.value }))} data-testid="crm-client-name" /></div>
              <div><Label>{isAr ? 'الهواتف (مفصولة بفاصلة)' : 'Téléphones (virgule)'}</Label><Input value={clientForm.phones} onChange={e => setClientForm(f => ({ ...f, phones: e.target.value }))} placeholder="0555..., 0666..." /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{isAr ? 'ميزانية من' : 'Budget min'}</Label><Input type="number" value={clientForm.budget_min} onChange={e => setClientForm(f => ({ ...f, budget_min: e.target.value }))} /></div>
                <div><Label>{isAr ? 'إلى' : 'max'}</Label><Input type="number" value={clientForm.budget_max} onChange={e => setClientForm(f => ({ ...f, budget_max: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{isAr ? 'الولاية' : 'Wilaya'}</Label><Input value={clientForm.wilaya} onChange={e => setClientForm(f => ({ ...f, wilaya: e.target.value }))} /></div>
                <div><Label>{isAr ? 'نوع الوحدة' : 'Type'}</Label>
                  <Select value={clientForm.unit_type_pref} onValueChange={v => setClientForm(f => ({ ...f, unit_type_pref: v }))}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{Object.entries(UNIT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{isAr ? v : k}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>{isAr ? 'ملاحظات' : 'Notes'}</Label><Textarea value={clientForm.notes} onChange={e => setClientForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <Button className="w-full" onClick={submitClient} disabled={saving || !clientForm.name.trim()} data-testid="crm-client-submit">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isAr ? 'حفظ' : 'Enregistrer')}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={projectDlg} onOpenChange={setProjectDlg}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'مشروع جديد' : 'Nouveau projet'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{isAr ? 'الاسم *' : 'Nom *'}</Label><Input value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} data-testid="crm-project-name" /></div>
              <div><Label>{isAr ? 'الولاية' : 'Wilaya'}</Label><Input value={projectForm.wilaya} onChange={e => setProjectForm(f => ({ ...f, wilaya: e.target.value }))} /></div>
              <div><Label>{isAr ? 'المطور' : 'Promoteur'}</Label><Input value={projectForm.developer} onChange={e => setProjectForm(f => ({ ...f, developer: e.target.value }))} /></div>
              <Button className="w-full" onClick={submitProject} disabled={saving || !projectForm.name.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isAr ? 'حفظ' : 'Enregistrer')}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={unitDlg} onOpenChange={setUnitDlg}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'وحدة جديدة' : 'Nouvelle unité'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{isAr ? 'المشروع' : 'Projet'}</Label>
                <Select value={unitForm.project_id} onValueChange={v => setUnitForm(f => ({ ...f, project_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{isAr ? 'النوع' : 'Type'}</Label>
                  <Select value={unitForm.unit_type} onValueChange={v => setUnitForm(f => ({ ...f, unit_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(UNIT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{isAr ? v : k}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>{isAr ? 'المساحة م²' : 'Surface m²'}</Label><Input type="number" value={unitForm.area_m2} onChange={e => setUnitForm(f => ({ ...f, area_m2: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{isAr ? 'السعر *' : 'Prix *'}</Label><Input type="number" value={unitForm.price} onChange={e => setUnitForm(f => ({ ...f, price: e.target.value }))} data-testid="crm-unit-price" /></div>
                <div><Label>{isAr ? 'الولاية' : 'Wilaya'}</Label><Input value={unitForm.wilaya} onChange={e => setUnitForm(f => ({ ...f, wilaya: e.target.value }))} /></div>
              </div>
              <div><Label>{isAr ? 'العنوان' : 'Adresse'}</Label><Input value={unitForm.address} onChange={e => setUnitForm(f => ({ ...f, address: e.target.value }))} /></div>
              <Button className="w-full" onClick={submitUnit} disabled={saving || !Number(unitForm.price)} data-testid="crm-unit-submit">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isAr ? 'حفظ' : 'Enregistrer')}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={campaignDlg} onOpenChange={setCampaignDlg}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'حملة جديدة' : 'Nouvelle campagne'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{isAr ? 'الاسم *' : 'Nom *'}</Label><Input value={campaignForm.name} onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))} data-testid="crm-campaign-name" /></div>
              <div><Label>{isAr ? 'المنصة' : 'Plateforme'}</Label>
                <Select value={campaignForm.platform} onValueChange={v => setCampaignForm(f => ({ ...f, platform: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['meta', 'tiktok', 'google', 'snapchat', 'other'].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{isAr ? 'الصرف' : 'Dépense'}</Label><Input type="number" value={campaignForm.spend} onChange={e => setCampaignForm(f => ({ ...f, spend: e.target.value }))} /></div>
                <div><Label>{isAr ? 'العملاء المحتملون' : 'Leads'}</Label><Input type="number" value={campaignForm.leads_count} onChange={e => setCampaignForm(f => ({ ...f, leads_count: e.target.value }))} /></div>
              </div>
              <Button className="w-full" onClick={submitCampaign} disabled={saving || !campaignForm.name.trim()} data-testid="crm-campaign-submit">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isAr ? 'حفظ' : 'Enregistrer')}</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={convDlg} onOpenChange={setConvDlg}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'محادثة جديدة' : 'Nouvelle conversation'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{isAr ? 'القناة' : 'Canal'}</Label>
                <Select value={convForm.channel} onValueChange={v => setConvForm(f => ({ ...f, channel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CHANNELS).map(([k, v]) => <SelectItem key={k} value={k}>{isAr ? v : k}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{isAr ? 'هاتف العميل' : 'Téléphone'}</Label><Input value={convForm.client_phone} onChange={e => setConvForm(f => ({ ...f, client_phone: e.target.value }))} placeholder="0555..." data-testid="crm-conv-phone" /></div>
              <div><Label>{isAr ? 'اسم العميل' : 'Nom'}</Label><Input value={convForm.client_name} onChange={e => setConvForm(f => ({ ...f, client_name: e.target.value }))} /></div>
              <Button className="w-full" onClick={submitConversation} disabled={saving} data-testid="crm-conv-submit">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isAr ? 'فتح' : 'Ouvrir')}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Apply commissions dialog (M13c) */}
        <Dialog open={commDlg} onOpenChange={setCommDlg}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'تطبيق عمولات التحويلات على الرواتب' : 'Appliquer les commissions'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{isAr ? 'الشهر' : 'Mois'}</Label><Input type="month" value={commForm.month} onChange={e => setCommForm(f => ({ ...f, month: e.target.value }))} data-testid="crm-comm-month" /></div>
              <div><Label>{isAr ? 'قيمة العمولة لكل تحويل (دج)' : 'Commission par conversion (DA)'}</Label><Input type="number" value={commForm.rate} onChange={e => setCommForm(f => ({ ...f, rate: e.target.value }))} data-testid="crm-comm-rate" /></div>
              <p className="text-xs text-muted-foreground">{isAr ? 'تُضاف العمولة تلقائياً لقسيمة راتب الشهر المختار (محادثات محوَّلة × القيمة).' : 'Ajoutée à la fiche de paie du mois (conversions × taux).'}</p>
              <Button className="w-full" onClick={applyCommissions} disabled={saving || !Number(commForm.rate)} data-testid="crm-comm-submit">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (isAr ? 'تطبيق' : 'Appliquer')}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Client detail dialog */}
        <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'} className="max-w-lg">
            <DialogHeader><DialogTitle>{detail?.name} <span className="text-xs text-muted-foreground">{detail?.code}</span></DialogTitle></DialogHeader>
            {detail && (
              <div className="space-y-3 text-sm" data-testid="crm-client-detail">
                <div className="text-xs text-muted-foreground">{(detail.phones || []).join(' · ')} {detail.wilaya && `· ${detail.wilaya}`} {detail.budget_max && `· ${fmt(detail.budget_max)} ${cur}`}</div>
                <div>
                  <div className="font-semibold text-xs mb-1">{isAr ? 'المتابعات' : 'Suivis'} ({detail.followups?.length || 0})</div>
                  {(detail.followups || []).map(f => (
                    <div key={f.id} className="flex justify-between border rounded px-2 py-1 text-xs mb-1">
                      <span>{f.kind}: {f.note}</span><span className={f.done ? 'text-green-600' : ''}>{(f.date || '').slice(0, 10)}{f.done ? ' ✓' : ''}</span>
                    </div>
                  ))}
                  <div className="flex gap-1 mt-1">
                    <Input type="datetime-local" className="h-8 text-xs" value={followForm.date} onChange={e => setFollowForm(f => ({ ...f, date: e.target.value }))} data-testid="crm-followup-date" />
                    <Input placeholder={isAr ? 'ملاحظة' : 'Note'} className="h-8 text-xs" value={followForm.note} onChange={e => setFollowForm(f => ({ ...f, note: e.target.value }))} />
                    <Button size="sm" className="h-8" onClick={addFollowUp} data-testid="crm-followup-add"><Plus className="h-3 w-3" /></Button>
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-xs mb-1">{isAr ? 'المعاينات' : 'Visites'} ({detail.viewings?.length || 0})</div>
                  {(detail.viewings || []).map(v => (
                    <div key={v.id} className="flex justify-between border rounded px-2 py-1 text-xs mb-1">
                      <span>{v.unit_code} — {v.feedback}</span><span>{(v.date || '').slice(0, 10)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Conversation thread dialog */}
        <Dialog open={!!thread} onOpenChange={() => setThread(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'} className="max-w-lg">
            <DialogHeader><DialogTitle>{thread?.client_name || thread?.code} <Badge variant="outline">{CHANNELS[thread?.channel]}</Badge></DialogTitle></DialogHeader>
            {thread && (
              <div className="space-y-3" data-testid="crm-thread">
                <div className="max-h-60 overflow-y-auto space-y-1.5 border rounded-md p-2 bg-muted/30">
                  {(thread.messages || []).map(m => (
                    <div key={m.id} className={`text-xs rounded-md px-2 py-1.5 max-w-[80%] ${m.direction === 'out' ? 'bg-primary text-primary-foreground mr-auto' : 'bg-white border'}`}>
                      {m.text}
                      <div className="text-[10px] opacity-60 mt-0.5">{(m.at || '').slice(11, 16)}</div>
                    </div>
                  ))}
                  {(thread.messages || []).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">{isAr ? 'لا رسائل' : 'Aucun message'}</p>}
                </div>
                <div className="flex gap-1">
                  <Input value={msgText} onChange={e => setMsgText(e.target.value)} placeholder={isAr ? 'رد...' : 'Répondre...'} onKeyDown={e => e.key === 'Enter' && sendMessage()} data-testid="crm-msg-input" />
                  <Button size="sm" onClick={sendMessage} data-testid="crm-msg-send"><Send className="h-4 w-4" /></Button>
                </div>
                <div>
                  <div className="font-semibold text-xs mb-1 flex items-center gap-1"><StickyNote className="h-3 w-3" />{isAr ? 'ملاحظات داخلية' : 'Notes internes'} ({thread.internal_notes?.length || 0})</div>
                  {(thread.internal_notes || []).map(n => <div key={n.id} className="text-xs bg-yellow-50 border border-yellow-200 rounded px-2 py-1 mb-1">{n.text}</div>)}
                  <div className="flex gap-1">
                    <Input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder={isAr ? 'ملاحظة داخلية...' : 'Note...'} className="h-8 text-xs" data-testid="crm-note-input" />
                    <Button size="sm" variant="outline" className="h-8" onClick={addNote}><Plus className="h-3 w-3" /></Button>
                  </div>
                </div>
                {thread.evaluation && (
                  <div className="flex items-center gap-1 text-xs">
                    <Star className="h-3 w-3 text-yellow-500" />{thread.evaluation.rating}/5 — {thread.evaluation.note}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Eye className="h-3 w-3 text-muted-foreground" />
                  <Select value={thread.status} onValueChange={async (v) => { await apiClient.put(`/crm/inbox/conversations/${thread.id}`, { status: v }); setThread({ ...thread, status: v }); loadAll(); }}>
                    <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{['open', 'pending', 'resolved', 'converted', 'closed'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default CrmPage;
