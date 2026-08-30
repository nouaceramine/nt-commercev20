import { errText } from '../lib/errorText';
import { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  Upload, Database, Loader2, CheckCircle2, AlertTriangle, XCircle,
  RefreshCw, History, Undo2, FileUp, Link2, Radio, Copy, Download, Trash2,
} from 'lucide-react';

// p349: Legacy migration wizard — upload an rlynx/BDV10 (.dblx/Access) database
// file; the server converts it (mdbtools) and imports products, customers,
// suppliers, sales (with FIFO debt allocation), purchases, sessions and
// inventory counts, then verifies everything against the source.

const STEP_LABELS = {
  queued: { ar: 'في الانتظار', fr: 'En attente' },
  export: { ar: 'قراءة قاعدة البيانات القديمة', fr: 'Lecture de la base legacy' },
  purge: { ar: 'تنظيف استيراد سابق', fr: 'Purge ancien import' },
  masters: { ar: 'استيراد المنتجات والزبائن والموردين', fr: 'Import données de base' },
  transactions: { ar: 'استيراد المبيعات والمشتريات والديون', fr: 'Import transactions' },
  verify: { ar: 'التحقق والمطابقة', fr: 'Vérification' },
  done: { ar: 'اكتمل', fr: 'Terminé' },
};

export default function LegacyMigrationPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [jobs, setJobs] = useState([]);
  const [activeJob, setActiveJob] = useState(null);
  const [reportJob, setReportJob] = useState(null);
  const [file, setFile] = useState(null);
  const [force, setForce] = useState(false);
  const [needForce, setNeedForce] = useState('');
  const [uploading, setUploading] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState(null);
  const [rollingBack, setRollingBack] = useState(false);
  // p350: live mirror
  const [agents, setAgents] = useState([]);
  const [counters, setCounters] = useState({});
  const [newToken, setNewToken] = useState('');
  const [genLabel, setGenLabel] = useState('');
  const [generating, setGenerating] = useState(false);
  const fileRef = useRef(null);
  const pollRef = useRef(null);

  const loadMirror = useCallback(async () => {
    try {
      const res = await apiClient.get('/migration/live/status');
      setAgents(res.data.agents || []);
      setCounters(res.data.counters || {});
    } catch (e) { /* silent */ }
  }, []);

  const generateToken = async () => {
    setGenerating(true);
    try {
      const res = await apiClient.post('/migration/live/tokens', { label: genLabel });
      setNewToken(res.data.token);
      setGenLabel('');
      toast.success(ar ? 'أُنشئ رمز المزامنة — انسخه الآن (لن يظهر مرة أخرى)' : 'Token créé — copiez-le maintenant');
      loadMirror();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setGenerating(false);
    }
  };

  const revokeToken = async (id) => {
    try {
      await apiClient.delete(`/migration/live/tokens/${id}`);
      toast.success(ar ? 'أُوقف الوكيل' : 'Agent révoqué');
      loadMirror();
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const downloadAgent = async () => {
    try {
      const res = await apiClient.get('/migration/live/agent/download', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nt_sync_agent.py';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errText(e));
    }
  };

  const downloadConfig = () => {
    if (!newToken) return;
    const cfg = {
      server: window.location.origin,
      token: newToken,
      db_path: 'C:\\rlynx\\BDV10.dblx',
      interval_sec: 30,
    };
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nt_sync_agent.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadJobs = useCallback(async () => {
    try {
      const res = await apiClient.get('/migration/legacy/jobs');
      const list = res.data.jobs || [];
      setJobs(list);
      const running = list.find(j => j.status === 'queued' || j.status === 'running');
      setActiveJob(running || null);
      if (!running && !reportJob) {
        const finished = list.find(j => j.status === 'done' || j.status === 'failed');
        if (finished) {
          const full = await apiClient.get(`/migration/legacy/jobs/${finished.id}`);
          setReportJob(full.data.job);
        }
      }
    } catch (e) { /* silent on poll */ }
  }, [reportJob]);

  useEffect(() => {
    loadJobs();
    loadMirror();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (activeJob) {
      pollRef.current = setInterval(async () => {
        try {
          const res = await apiClient.get(`/migration/legacy/jobs/${activeJob.id}`);
          const j = res.data.job;
          if (j.status === 'done' || j.status === 'failed') {
            clearInterval(pollRef.current);
            setActiveJob(null);
            setReportJob(j);
            setJobs(prev => [j, ...prev.filter(x => x.id !== j.id)]);
            if (j.status === 'done') {
              toast.success(ar ? 'اكتمل الاستيراد' : 'Import terminé');
            } else {
              toast.error(j.error || (ar ? 'فشل الاستيراد' : 'Échec import'));
            }
          } else {
            setActiveJob(j);
          }
        } catch (e) { /* keep polling */ }
      }, 3000);
      return () => clearInterval(pollRef.current);
    }
  }, [activeJob?.id]); // eslint-disable-line

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setNeedForce('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post(`/migration/legacy/jobs?force=${force}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000,
      });
      toast.success(ar ? 'بدأ الاستيراد — تابع التقدم' : 'Import démarré');
      setFile(null);
      setForce(false);
      if (fileRef.current) fileRef.current.value = '';
      const j = res.data.job;
      setActiveJob(j);
      setReportJob(null);
      loadJobs();
    } catch (e) {
      const msg = errText(e);
      if (e?.response?.status === 409 && msg.includes('force')) {
        setNeedForce(msg);
      } else {
        toast.error(msg);
      }
    } finally {
      setUploading(false);
    }
  };

  const doRollback = async () => {
    if (!rollbackTarget) return;
    setRollingBack(true);
    try {
      const res = await apiClient.post(`/migration/legacy/jobs/${rollbackTarget.id}/rollback`);
      toast.success(ar ? 'تم التراجع عن كل البيانات المستوردة' : 'Rollback effectué');
      setRollbackTarget(null);
      setReportJob(null);
      loadJobs();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setRollingBack(false);
    }
  };

  const pct = activeJob && activeJob.total > 0
    ? Math.round((activeJob.done / activeJob.total) * 100) : null;

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6" data-testid="legacy-migration-page">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              {ar ? 'الترحيل من نظام قديم (rlynx / PC Compta / Sage…)' : 'Migration depuis un système legacy'}
            </CardTitle>
            <CardDescription>
              {ar
                ? 'ارفع ملف قاعدة بيانات نظامك القديم — rlynx (.dblx) مباشرة، أو bundle.zip من وكيل SQL Server (PC Compta / Sage / Ciel) — وسيستورد النظام منتجاتك وزبائنك ومورديك ومبيعاتك وديونك كاملة مع تقرير مطابقة — دون المساس بأي بيانات حالية.'
                : 'Téléversez la base de votre ancien système (.dblx rlynx ou bundle.zip SQL Server): produits, clients, fournisseurs, ventes et dettes importés avec rapport de vérification.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileRef.current?.click()}
              data-testid="legacy-upload-dropzone"
            >
              <input
                ref={fileRef} type="file" accept=".dblx,.mdb,.accdb,.zip" className="hidden"
                onChange={e => { setFile(e.target.files[0] || null); setNeedForce(''); }}
              />
              <FileUp className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
              {file ? (
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  {ar ? 'اضغط لاختيار ملف قاعدة البيانات (.dblx / .mdb / .accdb) أو حزمة bundle.zip من وكيل SQL Server (--dump)' : 'Choisir le fichier (.dblx / .mdb / .accdb) ou bundle.zip (--dump)'}
                </p>
              )}
            </div>

            {needForce && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm">{needForce}</p>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />
                    {ar ? 'أفهم — تابع الاستيراد بجانب بياناتي الحالية' : 'Je comprends — continuer'}
                  </label>
                </div>
              </div>
            )}

            <Button
              onClick={upload}
              disabled={!file || uploading || !!activeJob}
              className="w-full"
              data-testid="legacy-upload-btn"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Upload className="h-4 w-4 me-2" />}
              {ar ? 'رفع وبدء الاستيراد' : 'Téléverser et importer'}
            </Button>
          </CardContent>
        </Card>

        {activeJob && (
          <Card data-testid="legacy-active-job">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                {ar ? 'الاستيراد جارٍ...' : 'Import en cours...'}
              </CardTitle>
              <CardDescription>{activeJob.file_name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>{activeJob.step_label || STEP_LABELS[activeJob.step]?.[ar ? 'ar' : 'fr']}</span>
                {pct !== null && <span className="font-mono">{pct}%</span>}
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: pct !== null ? `${pct}%` : '100%', opacity: pct !== null ? 1 : 0.4 }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {ar ? 'قد تستغرق القواعد الكبيرة عدة دقائق — يمكنك مغادرة الصفحة والعودة لاحقاً.'
                     : 'Les grandes bases peuvent prendre plusieurs minutes.'}
              </p>
            </CardContent>
          </Card>
        )}

        {reportJob && reportJob.status === 'done' && reportJob.report && (
          <Card data-testid="legacy-report">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {reportJob.report.all_ok
                  ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                  : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                {ar ? 'تقرير المطابقة' : 'Rapport de vérification'}
                <Badge variant={reportJob.report.all_ok ? 'default' : 'destructive'}>
                  {reportJob.report.all_ok
                    ? (ar ? 'مطابقة تامة' : 'Conforme')
                    : (ar ? 'فروقات موجودة' : 'Écarts détectés')}
                </Badge>
              </CardTitle>
              <CardDescription>{reportJob.file_name} — {new Date(reportJob.finished_at).toLocaleString(ar ? 'ar-DZ' : 'fr-FR')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? 'البند' : 'Élément'}</TableHead>
                    <TableHead>{ar ? 'المصدر' : 'Source'}</TableHead>
                    <TableHead>{ar ? 'المستورد' : 'Importé'}</TableHead>
                    <TableHead>{ar ? 'الحالة' : 'État'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(reportJob.report.checks || []).map((c, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{c.check}</TableCell>
                      <TableCell className="font-mono">{typeof c.source === 'number' ? c.source.toLocaleString() : c.source}</TableCell>
                      <TableCell className="font-mono">{typeof c.imported === 'number' ? c.imported.toLocaleString() : c.imported}</TableCell>
                      <TableCell>
                        {c.ok
                          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                          : <XCircle className="h-4 w-4 text-red-600" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {reportJob.report.balance_mismatches_fixed > 0 && (
                <p className="text-sm text-muted-foreground">
                  {ar ? `أرصدة صُحّحت لتطابق النظام القديم: ${reportJob.report.balance_mismatches_fixed}`
                      : `Soldes corrigés: ${reportJob.report.balance_mismatches_fixed}`}
                </p>
              )}
              <Button
                variant="outline"
                onClick={() => setRollbackTarget(reportJob)}
                data-testid="legacy-rollback-btn"
              >
                <Undo2 className="h-4 w-4 me-2" />
                {ar ? 'التراجع عن هذا الاستيراد' : 'Annuler cet import'}
              </Button>
            </CardContent>
          </Card>
        )}

        {reportJob && reportJob.status === 'failed' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <XCircle className="h-5 w-5" />
                {ar ? 'فشل الاستيراد' : 'Échec de l\'import'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{reportJob.error}</p>
            </CardContent>
          </Card>
        )}

        {/* p350: live mirror card */}
        <Card data-testid="live-mirror-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              {ar ? 'المرآة الحية — اعمل على القديم وشاهد هنا' : 'Miroir temps réel'}
            </CardTitle>
            <CardDescription>
              {ar
                ? 'برنامج صغير يُثبَّت على جهازك، يراقب قاعدة rlynx ويرسل كل عملية جديدة لحظياً إلى هنا — اتجاه واحد فقط، نظامك القديم لا يُمس إطلاقاً.'
                : 'Un petit agent Windows envoie chaque nouvelle opération ici en temps réel (sens unique).'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                placeholder={ar ? 'وصف الجهاز (مثال: كاسير 1)' : 'Nom du poste'}
                value={genLabel}
                onChange={e => setGenLabel(e.target.value)}
                data-testid="mirror-label-input"
              />
              <Button onClick={generateToken} disabled={generating} data-testid="mirror-generate-btn">
                {generating ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Radio className="h-4 w-4 me-2" />}
                {ar ? 'توليد رمز مزامنة' : 'Générer un token'}
              </Button>
            </div>

            {newToken && (
              <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 p-3 space-y-2" data-testid="mirror-token-box">
                <p className="text-sm font-medium">{ar ? 'رمزك (يظهر مرة واحدة فقط):' : 'Votre token (affiché une seule fois):'}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs break-all rounded bg-background p-2 border font-mono" dir="ltr">{newToken}</code>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(newToken); toast.success(ar ? 'نُسخ' : 'Copié'); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={downloadAgent} data-testid="mirror-download-agent">
                    <Download className="h-4 w-4 me-1" />
                    {ar ? 'تحميل الوكيل nt_sync_agent.py' : 'Télécharger l\'agent'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={downloadConfig} data-testid="mirror-download-config">
                    <Download className="h-4 w-4 me-1" />
                    {ar ? 'تحميل ملف الإعداد (برمزك)' : 'Télécharger la config'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {ar
                    ? 'على جهازك: ثبّت Python ثم pip install pyodbc، ضع الملفين معاً في مجلد، عدّل db_path في ملف الإعداد لمسار BDV10.dblx، شغّل أولاً python nt_sync_agent.py --baseline ثم python nt_sync_agent.py'
                    : 'Sur votre PC: installez Python + pyodbc, placez les deux fichiers ensemble, ajustez db_path, puis lancez --baseline une fois.'}
                </p>
              </div>
            )}

            {agents.length > 0 && (
              <div className="space-y-2">
                {agents.map(a => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{a.label || (ar ? 'وكيل' : 'Agent')} <span className="font-mono text-xs text-muted-foreground">…{a.token_hint}</span></p>
                      <p className="text-xs text-muted-foreground">
                        {a.last_seen_at
                          ? (ar ? `آخر اتصال: ${new Date(a.last_seen_at).toLocaleString('ar-DZ')}` : `Vu: ${new Date(a.last_seen_at).toLocaleString('fr-FR')}`)
                          : (ar ? 'لم يتصل بعد' : 'Jamais connecté')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={a.last_seen_at ? 'default' : 'secondary'}>
                        {a.last_seen_at ? (ar ? 'نشط' : 'Actif') : (ar ? 'بانتظار' : 'En attente')}
                      </Badge>
                      <Button size="sm" variant="ghost" onClick={() => revokeToken(a.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {Object.keys(counters).length > 0 && (
              <p className="text-sm text-muted-foreground" data-testid="mirror-counters">
                {ar ? 'مزامَن حتى الآن: ' : 'Synchronisé: '}
                {[
                  counters.receipts ? `${counters.receipts} ${ar ? 'بيعاً' : 'ventes'}` : '',
                  counters.items ? `${counters.items} ${ar ? 'صنفاً' : 'articles'}` : '',
                  counters.customers ? `${counters.customers} ${ar ? 'زبوناً' : 'clients'}` : '',
                  counters.purchases ? `${counters.purchases} ${ar ? 'شراءً' : 'achats'}` : '',
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </CardContent>
        </Card>

        {jobs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" />
                {ar ? 'عمليات سابقة' : 'Historique'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {jobs.map(j => (
                  <div key={j.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{j.file_name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString(ar ? 'ar-DZ' : 'fr-FR')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        j.status === 'done' ? 'default' :
                        j.status === 'failed' ? 'destructive' :
                        j.status === 'rolled_back' ? 'secondary' : 'outline'
                      }>
                        {j.status === 'done' ? (ar ? 'مكتمل' : 'Terminé') :
                         j.status === 'failed' ? (ar ? 'فشل' : 'Échec') :
                         j.status === 'rolled_back' ? (ar ? 'متراجع عنه' : 'Annulé') :
                         (ar ? 'جارٍ' : 'En cours')}
                      </Badge>
                      {j.status === 'done' && (
                        <Button size="sm" variant="ghost" onClick={async () => {
                          const full = await apiClient.get(`/migration/legacy/jobs/${j.id}`);
                          setReportJob(full.data.job);
                        }}>
                          <RefreshCw className="h-3 w-3 me-1" />
                          {ar ? 'التقرير' : 'Rapport'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={!!rollbackTarget} onOpenChange={() => setRollbackTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{ar ? 'تأكيد التراجع' : 'Confirmer l\'annulation'}</DialogTitle>
              <DialogDescription>
                {ar
                  ? 'سيتم حذف كل البيانات التي استوردتها هذه العملية (المنتجات والزبائن والموردون والمبيعات والمشتريات الموسومة بالنظام القديم). بياناتك الأخرى لا تُمس.'
                  : 'Toutes les données importées par cette opération seront supprimées.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRollbackTarget(null)}>
                {ar ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button variant="destructive" onClick={doRollback} disabled={rollingBack}>
                {rollingBack && <Loader2 className="h-4 w-4 animate-spin me-2" />}
                {ar ? 'نعم، تراجع' : 'Oui, annuler'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
