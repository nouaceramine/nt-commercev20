import { errText } from '../lib/errorText';
import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { Shield, Ban, Key, Activity, Users, AlertTriangle, Plus, Trash2, Eye, EyeOff } from 'lucide-react';

export default function SecurityDashboardPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState({});
  const [blockedIPs, setBlockedIPs] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBlockIP, setShowBlockIP] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [ipForm, setIpForm] = useState({ ip_address: '', reason: '', duration_hours: 24 });
  const [keyForm, setKeyForm] = useState({ key_name: '', permissions: ['read'] });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const [statsRes, ipsRes, keysRes, sessRes] = await Promise.all([
        apiClient.get(`/security/logs/stats`, { headers }),
        apiClient.get(`/security/blocked-ips`, { headers }),
        apiClient.get(`/security/api-keys`, { headers }),
        apiClient.get(`/security/sessions`, { headers }),
      ]);
      setStats(statsRes.data);
      setBlockedIPs(ipsRes.data);
      setApiKeys(keysRes.data);
      setSessions(sessRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const blockIP = async () => {
    try {
      await apiClient.post(`/security/blocked-ips`, ipForm, { headers });
      toast.success(isAr ? 'تم حظر IP' : 'IP bloqué');
      setShowBlockIP(false);
      setIpForm({ ip_address: '', reason: '', duration_hours: 24 });
      fetchData();
    } catch (e) { toast.error(errText(e) ||  'Error'); }
  };

  const unblockIP = async (id) => {
    try {
      await apiClient.delete(`/security/blocked-ips/${id}`, { headers });
      toast.success(isAr ? 'تم رفع الحظر' : 'IP débloqué');
      fetchData();
    } catch (e) { toast.error('Error'); }
  };

  const createAPIKey = async () => {
    try {
      const res = await apiClient.post(`/security/api-keys`, keyForm, { headers });
      toast.success(isAr ? 'تم إنشاء المفتاح' : 'Clé créée');
      setShowCreateKey(false);
      fetchData();
    } catch (e) { toast.error('Error'); }
  };

  const deleteAPIKey = async (id) => {
    try {
      await apiClient.delete(`/security/api-keys/${id}`, { headers });
      toast.success(isAr ? 'تم الحذف' : 'Supprimé');
      fetchData();
    } catch (e) { toast.error('Error'); }
  };

  const tabs = [
    { id: 'overview', label: isAr ? 'نظرة عامة' : 'Vue d\'ensemble', icon: Shield },
    { id: 'blocked', label: isAr ? 'IP محظورة' : 'IPs bloquées', icon: Ban },
    { id: 'keys', label: isAr ? 'مفاتيح API' : 'Clés API', icon: Key },
    { id: 'sessions', label: isAr ? 'الجلسات' : 'Sessions', icon: Users },
  ];

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="security-dashboard-page">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{isAr ? 'لوحة الأمان' : 'Sécurité'}</h1>
            <p className="text-sm text-muted-foreground mt-1">{isAr ? 'مراقبة وإدارة أمان النظام' : 'Surveillance et gestion de la sécurité'}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: isAr ? 'أحداث أمنية' : 'Événements', value: stats.total_events || 0, icon: Activity, color: 'text-blue-400' },
            { label: isAr ? 'حرجة' : 'Critiques', value: stats.critical || 0, icon: AlertTriangle, color: 'text-red-400' },
            { label: isAr ? 'IP محظورة' : 'IPs bloquées', value: stats.blocked_ips || 0, icon: Ban, color: 'text-amber-400' },
            { label: isAr ? 'محاولات فاشلة' : 'Échecs login', value: stats.failed_logins_total || 0, icon: Shield, color: 'text-purple-400' },
          ].map((s, i) => (
            <Card key={`item-${i}`} className="bg-card border-border"><CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-8 h-8 ${s.color}`} />
              <div><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-xl font-bold text-foreground">{s.value}</p></div>
            </CardContent></Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-2">
          {tabs.map(t => (
            <Button key={t.id} variant={tab === t.id ? 'default' : 'ghost'} size="sm" onClick={() => setTab(t.id)} className="gap-2" data-testid={`security-tab-${t.id}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </Button>
          ))}
        </div>

        {/* Blocked IPs Tab */}
        {tab === 'blocked' && (
          <div className="space-y-4">
            <div className="flex justify-end"><Button onClick={() => setShowBlockIP(true)} className="gap-2" data-testid="block-ip-btn"><Ban className="w-4 h-4" />{isAr ? 'حظر IP' : 'Bloquer IP'}</Button></div>
            <div className="space-y-2">
              {blockedIPs.length === 0 ? <p className="text-muted-foreground text-center py-8">{isAr ? 'لا توجد عناوين محظورة' : 'Aucune IP bloquée'}</p> :
               blockedIPs.map(ip => (
                <Card key={ip.id} className="bg-card border-border"><CardContent className="p-3 flex justify-between items-center">
                  <div><span className="text-foreground font-mono">{ip.ip_address}</span><p className="text-sm text-muted-foreground">{ip.reason}</p><p className="text-xs text-muted-foreground">{new Date(ip.blocked_at).toLocaleString()}</p></div>
                  <Button size="sm" variant="ghost" className="text-red-400" onClick={() => unblockIP(ip.id)} data-testid={`unblock-${ip.id}`}><Trash2 className="w-4 h-4" /></Button>
                </CardContent></Card>
              ))}
            </div>
          </div>
        )}

        {/* API Keys Tab */}
        {tab === 'keys' && (
          <div className="space-y-4">
            <div className="flex justify-end"><Button onClick={() => setShowCreateKey(true)} className="gap-2" data-testid="create-key-btn"><Plus className="w-4 h-4" />{isAr ? 'إنشاء مفتاح' : 'Créer clé'}</Button></div>
            <div className="space-y-2">
              {apiKeys.length === 0 ? <p className="text-muted-foreground text-center py-8">{isAr ? 'لا توجد مفاتيح' : 'Aucune clé'}</p> :
               apiKeys.map(k => (
                <Card key={k.id} className="bg-card border-border"><CardContent className="p-3 flex justify-between items-center">
                  <div className="flex items-center gap-3"><Key className="w-5 h-5 text-amber-400" /><div><span className="text-foreground">{k.key_name}</span><p className="text-sm text-muted-foreground font-mono">{k.api_key}</p></div></div>
                  <div className="flex items-center gap-2">
                    <Badge className={k.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}>{k.is_active ? (isAr ? 'نشط' : 'Actif') : (isAr ? 'معطل' : 'Inactif')}</Badge>
                    <Button size="sm" variant="ghost" className="text-red-400" onClick={() => deleteAPIKey(k.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          </div>
        )}

        {/* Sessions Tab */}
        {tab === 'sessions' && (
          <div className="space-y-2">
            {sessions.length === 0 ? <p className="text-muted-foreground text-center py-8">{isAr ? 'لا توجد جلسات نشطة' : 'Aucune session active'}</p> :
             sessions.map(s => (
              <Card key={s.id} className="bg-card border-border"><CardContent className="p-3 flex justify-between items-center">
                <div><span className="text-foreground">{s.user_id?.substring(0,8)}...</span><p className="text-sm text-muted-foreground">{s.ip_address} | {s.user_type}</p></div>
                <Badge className="bg-emerald-500/10 text-emerald-400">{isAr ? 'نشطة' : 'Active'}</Badge>
              </CardContent></Card>
            ))}
          </div>
        )}

        {/* Overview Tab */}
        {tab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-card border-border"><CardContent className="p-6">
              <h3 className="text-foreground font-semibold mb-4">{isAr ? 'ملخص الأمان' : 'Résumé sécurité'}</h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">{isAr ? 'حماية Brute-force' : 'Protection Brute-force'}</span><Badge className="bg-emerald-500/10 text-emerald-400">{isAr ? 'مفعل' : 'Activé'}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{isAr ? 'المصادقة الثنائية' : '2FA'}</span><Badge className="bg-emerald-500/10 text-emerald-400">{isAr ? 'مفعل' : 'Activé'}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{isAr ? 'تقييد المعدل' : 'Rate Limiting'}</span><Badge className="bg-emerald-500/10 text-emerald-400">120/min</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">JWT</span><Badge className="bg-emerald-500/10 text-emerald-400">HS256</Badge></div>
              </div>
            </CardContent></Card>
            <Card className="bg-card border-border"><CardContent className="p-6">
              <h3 className="text-foreground font-semibold mb-4">{isAr ? 'إحصائيات سريعة' : 'Stats rapides'}</h3>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">{isAr ? 'مفاتيح API نشطة' : 'Clés API actives'}</span><span className="text-foreground font-bold">{apiKeys.filter(k => k.is_active).length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{isAr ? 'IP محظورة' : 'IPs bloquées'}</span><span className="text-foreground font-bold">{blockedIPs.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{isAr ? 'جلسات نشطة' : 'Sessions actives'}</span><span className="text-foreground font-bold">{sessions.length}</span></div>
              </div>
            </CardContent></Card>
          </div>
        )}

        {/* Block IP Dialog */}
        <Dialog open={showBlockIP} onOpenChange={setShowBlockIP}>
          <DialogContent className="bg-background border-border text-foreground max-w-md">
            <DialogHeader><DialogTitle>{isAr ? 'حظر عنوان IP' : 'Bloquer IP'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder="IP Address" value={ipForm.ip_address} onChange={e => setIpForm({...ipForm, ip_address: e.target.value})} className="bg-card border-border" data-testid="block-ip-input" />
              <Input placeholder={isAr ? 'السبب' : 'Raison'} value={ipForm.reason} onChange={e => setIpForm({...ipForm, reason: e.target.value})} className="bg-card border-border" />
              <Input type="number" placeholder={isAr ? 'المدة (ساعات)' : 'Durée (heures)'} value={ipForm.duration_hours} onChange={e => setIpForm({...ipForm, duration_hours: parseInt(e.target.value) || 24})} className="bg-card border-border" />
              <Button onClick={blockIP} className="w-full" data-testid="submit-block-ip">{isAr ? 'حظر' : 'Bloquer'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Key Dialog */}
        <Dialog open={showCreateKey} onOpenChange={setShowCreateKey}>
          <DialogContent className="bg-background border-border text-foreground max-w-md">
            <DialogHeader><DialogTitle>{isAr ? 'إنشاء مفتاح API' : 'Créer clé API'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder={isAr ? 'اسم المفتاح' : 'Nom de la clé'} value={keyForm.key_name} onChange={e => setKeyForm({...keyForm, key_name: e.target.value})} className="bg-card border-border" data-testid="key-name-input" />
              <Button onClick={createAPIKey} className="w-full" data-testid="submit-create-key">{isAr ? 'إنشاء' : 'Créer'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
