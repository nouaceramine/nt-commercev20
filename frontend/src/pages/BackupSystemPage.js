import { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Separator } from '../components/ui/separator';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import {
  Database, Download, Calendar, Shield, Clock, HardDrive,
  Plus, Trash2, RefreshCw, Upload, AlertTriangle, CheckCircle2,
  Globe, Lock, RotateCcw, Server, Activity, ChevronDown, ChevronRight,
  FileArchive, Info
} from 'lucide-react';

const TYPE_CONFIG = {
  full:                 { label_ar: 'نسخة كاملة',       label_fr: 'Sauvegarde complète',  color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  global:               { label_ar: 'شامل (كل المستأجرين)', label_fr: 'Global (tous)',      color: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  pre_restore_snapshot: { label_ar: 'لقطة قبل الاستعادة', label_fr: 'Snapshot pré-restore', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  restore:              { label_ar: 'استعادة منجزة',     label_fr: 'Restauration',          color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
};

const NUM_BADGE = {
  BKP: 'bg-blue-500/20 text-blue-300',
  GLB: 'bg-violet-500/20 text-violet-300',
  PRE: 'bg-amber-500/20 text-amber-300',
  RST: 'bg-emerald-500/20 text-emerald-300',
};

export default function BackupSystemPage() {
  const { language } = useLanguage();
  const { user, isSuperAdmin } = useAuth();
  const isAr = language === 'ar';

  const [backups, setBackups]         = useState([]);
  const [schedules, setSchedules]     = useState([]);
  const [stats, setStats]             = useState({});
  const [loading, setLoading]         = useState(true);
  const [creating, setCreating]       = useState(false);
  const [globalBacking, setGlobalBacking] = useState(false);
  const [showSchedule, setShowSchedule]   = useState(false);
  const [showRestore, setShowRestore]     = useState(null); // backup object
  const [restoring, setRestoring]         = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [showAll, setShowAll]             = useState(false);
  const [scheduleForm, setScheduleForm]   = useState({
    frequency: 'daily', time: '02:00', format: 'json.gz', keep_last: 7
  });

  const fileInputRef = useRef(null);

  const fetchData = async () => {
    try {
      const [bRes, sRes, stRes] = await Promise.all([
        apiClient.get('/backup/list'),
        apiClient.get('/backup/schedules/list'),
        apiClient.get('/backup/stats/summary'),
      ]);
      setBackups(bRes.data || []);
      setSchedules(sRes.data || []);
      setStats(stRes.data || {});
    } catch (e) {
      console.error('Backup fetch error:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(isAr ? 'ar-DZ' : 'fr-FR');
  };

  const numBadgeColor = (num = '') => {
    const prefix = num.slice(0, 3);
    return NUM_BADGE[prefix] || 'bg-gray-500/20 text-gray-300';
  };

  // ── Create tenant backup ──
  const createBackup = async () => {
    setCreating(true);
    try {
      const res = await apiClient.post('/backup/create', { backup_type: 'full', format: 'json.gz' });
      toast.success(isAr
        ? `✅ تم إنشاء النسخة الاحتياطية (${res.data.records_count?.toLocaleString()} سجل)`
        : `✅ Backup créé (${res.data.records_count?.toLocaleString()} records)`
      );
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || (isAr ? 'خطأ في إنشاء النسخة' : 'Erreur backup'));
    }
    setCreating(false);
  };

  // ── Create global backup (super admin) ──
  const createGlobalBackup = async () => {
    setGlobalBacking(true);
    try {
      const res = await apiClient.post('/backup/global');
      toast.success(isAr
        ? `✅ النسخة الشاملة تمت (${res.data.records_count?.toLocaleString()} سجل — ${res.data.tables_count} قاعدة بيانات)`
        : `✅ Backup global créé (${res.data.records_count?.toLocaleString()} records — ${res.data.tables_count} BDs)`
      );
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error global backup');
    }
    setGlobalBacking(false);
  };

  // ── Download ──
  const downloadBackup = async (backup) => {
    if (!backup.file_exists) {
      toast.error(isAr ? 'الملف غير موجود على القرص' : 'Fichier introuvable sur le disque');
      return;
    }
    try {
      const res = await apiClient.get(`/backup/${backup.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = backup.file_name || `backup_${backup.backup_number}.json.gz`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(isAr ? 'خطأ في تحميل الملف' : 'Erreur téléchargement');
    }
  };

  // ── Restore from stored backup ──
  const doRestore = async () => {
    if (!showRestore) return;
    setRestoring(true);
    try {
      const res = await apiClient.post(`/backup/${showRestore.id}/restore`);
      const d = res.data;
      toast.success(isAr
        ? `✅ ${d.message} — ${d.restored_records?.toLocaleString()} سجل • نسخة الأمان: ${d.pre_restore_backup}`
        : `✅ ${d.message} — ${d.restored_records?.toLocaleString()} records • Snapshot: ${d.pre_restore_backup}`
      );
      if (!d.integrity_ok) {
        toast.warning(isAr
          ? `⚠️ تحقق التكامل: متوقع ${d.expected_records} — فعلي ${d.actual_records}`
          : `⚠️ Intégrité: attendu ${d.expected_records} — réel ${d.actual_records}`
        );
      }
      setShowRestore(null);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || (isAr ? 'فشلت الاستعادة' : 'Échec restauration'));
    }
    setRestoring(false);
  };

  // ── Restore from file upload ──
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm(isAr
      ? `هل أنت متأكد من استعادة البيانات من الملف "${file.name}"؟ سيتم حفظ نسخة احتياطية تلقائية قبل الاستعادة.`
      : `Restaurer depuis "${file.name}" ? Un snapshot automatique sera créé avant.`
    )) {
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post('/backup/restore-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const d = res.data;
      toast.success(isAr
        ? `✅ تم الاستعادة من الملف (${d.restored_records?.toLocaleString()} سجل) • نسخة الأمان: ${d.pre_restore_backup}`
        : `✅ Restauré depuis fichier (${d.restored_records?.toLocaleString()} records) • Snapshot: ${d.pre_restore_backup}`
      );
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || (isAr ? 'خطأ في قراءة الملف' : 'Erreur lecture fichier'));
    }
    setUploading(false);
    e.target.value = '';
  };

  // ── Delete ──
  const deleteBackup = async (id) => {
    if (!window.confirm(isAr ? 'حذف هذه النسخة الاحتياطية من القاعدة والقرص؟' : 'Supprimer ce backup du disque et de la base ?')) return;
    try {
      await apiClient.delete(`/backup/${id}`);
      toast.success(isAr ? 'تم الحذف' : 'Supprimé');
      fetchData();
    } catch (e) {
      toast.error('Error');
    }
  };

  const createSchedule = async () => {
    try {
      await apiClient.post('/backup/schedules', scheduleForm);
      toast.success(isAr ? 'تم إنشاء الجدول التلقائي' : 'Planification créée');
      setShowSchedule(false);
      fetchData();
    } catch (e) {
      toast.error('Error');
    }
  };

  const syncSchemaVersion = async () => {
    try {
      await apiClient.post('/backup/schema-version/sync');
      toast.success(isAr ? `تم تحديث إصدار المخطط إلى ${stats.system_version}` : `Schéma mis à jour → ${stats.system_version}`);
      fetchData();
    } catch (e) {
      toast.error('Error');
    }
  };

  const visibleBackups = showAll ? backups : backups.slice(0, 10);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="backup-system-page">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold">{isAr ? 'النسخ الاحتياطي والاسترداد' : 'Sauvegardes & Restauration'}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isAr ? 'حماية البيانات أثناء التحديثات والترقيات' : 'Protection des données lors des mises à jour'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSchedule(true)} className="gap-2">
              <Calendar className="w-4 h-4" />
              {isAr ? 'جدول تلقائي' : 'Planifier'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-2">
              <Upload className="w-4 h-4" />
              {uploading ? (isAr ? 'جاري الاستعادة...' : 'Restauration...') : (isAr ? 'استعادة من ملف' : 'Restaurer fichier')}
            </Button>
            <input ref={fileInputRef} type="file" accept=".json,.json.gz,.gz" className="hidden" onChange={handleFileUpload} />
            {isSuperAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={createGlobalBackup}
                disabled={globalBacking}
                className="gap-2 border-violet-500/50 text-violet-400 hover:bg-violet-500/10"
                data-testid="global-backup-btn"
              >
                <Globe className="w-4 h-4" />
                {globalBacking ? (isAr ? 'جاري...' : 'En cours...') : (isAr ? 'نسخ شامل (كل المستأجرين)' : 'Backup global')}
              </Button>
            )}
            <Button onClick={createBackup} disabled={creating} className="gap-2" data-testid="create-backup-btn">
              <Database className="w-4 h-4" />
              {creating ? (isAr ? 'جاري...' : 'En cours...') : (isAr ? 'نسخ احتياطي الآن' : 'Sauvegarder')}
            </Button>
          </div>
        </div>

        {/* Schema Version Alert */}
        {stats.needs_migration && (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-amber-300 text-sm">
                {isAr
                  ? `إصدار قاعدة البيانات (${stats.schema_version}) أقل من إصدار النظام (${stats.system_version}). يُنصح بمزامنة المخطط بعد أخذ نسخة احتياطية.`
                  : `Version DB (${stats.schema_version}) < version système (${stats.system_version}). Synchronisez après backup.`}
              </span>
              {isSuperAdmin && (
                <Button size="sm" variant="outline" onClick={syncSchemaVersion} className="ms-3 shrink-0 border-amber-500/50 text-amber-400">
                  {isAr ? 'مزامنة الإصدار' : 'Synchroniser'}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: isAr ? 'إجمالي النسخ' : 'Total backups',   value: stats.total_backups || 0,           icon: Database,   color: 'text-blue-400',   bg: 'bg-blue-500/10' },
            { label: isAr ? 'حجم القرص'   : 'Taille disque',     value: formatSize(stats.disk_size_bytes),  icon: HardDrive,  color: 'text-purple-400', bg: 'bg-purple-500/10' },
            { label: isAr ? 'إجمالي السجلات' : 'Total records',  value: (stats.total_records || 0).toLocaleString(), icon: Shield, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: isAr ? 'إصدار المخطط' : 'Version schéma',  value: stats.schema_version || '—',        icon: Activity,   color: stats.needs_migration ? 'text-amber-400' : 'text-green-400', bg: stats.needs_migration ? 'bg-amber-500/10' : 'bg-green-500/10' },
          ].map((s, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.bg}`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                  <p className="text-lg font-bold truncate">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* How it works */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">{isAr ? 'كيف يعمل النظام عند الترقية:' : 'Processus de mise à jour sécurisé :'}</p>
                <ol className={`${isAr ? 'list-decimal list-inside' : 'list-decimal ms-4'} space-y-0.5`}>
                  <li>{isAr ? 'اضغط "نسخ احتياطي الآن" (أو "نسخ شامل" للـ Super Admin)' : 'Cliquez "Sauvegarder" (ou "Backup global" pour Super Admin)'}</li>
                  <li>{isAr ? 'حمّل الملف .json.gz للحفاظ عليه خارجياً' : 'Téléchargez le .json.gz pour le conserver hors ligne'}</li>
                  <li>{isAr ? 'قم بتحديث النظام' : 'Effectuez la mise à jour système'}</li>
                  <li>{isAr ? 'إذا حدث خطأ: استعد من نسخة موجودة أو ارفع ملف احتياطي' : 'En cas d\'erreur : restaurez depuis une sauvegarde existante ou uploadez un fichier'}</li>
                  <li>{isAr ? 'النظام يُنشئ تلقائياً لقطة أمان (PRE-) قبل أي استعادة' : 'Le système crée automatiquement un snapshot (PRE-) avant toute restauration'}</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Backups List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">{isAr ? 'النسخ الاحتياطية' : 'Sauvegardes'}</h2>
            <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1 text-muted-foreground">
              <RefreshCw className="h-3 w-3" />
              {isAr ? 'تحديث' : 'Rafraîchir'}
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">{isAr ? 'جاري التحميل...' : 'Chargement...'}</div>
          ) : backups.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>{isAr ? 'لا توجد نسخ احتياطية بعد' : 'Aucune sauvegarde encore'}</p>
                <p className="text-xs mt-1">{isAr ? 'اضغط "نسخ احتياطي الآن" للبدء' : 'Cliquez "Sauvegarder" pour commencer'}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {visibleBackups.map(b => {
                const typeConf = TYPE_CONFIG[b.backup_type] || TYPE_CONFIG.full;
                const isGlobal = b.entity_type === 'global';
                const isPreRestore = b.backup_type === 'pre_restore_snapshot';
                const isRestoreLog = b.backup_type === 'restore';
                const canRestore = !isGlobal && !isPreRestore && !isRestoreLog && b.file_exists;

                return (
                  <Card key={b.id} className={`transition-colors ${isGlobal ? 'border-violet-500/30' : isPreRestore ? 'border-amber-500/20' : ''}`} data-testid={`backup-${b.id}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">

                        {/* Icon + Info */}
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`p-2 rounded-lg mt-0.5 shrink-0 ${isGlobal ? 'bg-violet-500/10' : isPreRestore ? 'bg-amber-500/10' : isRestoreLog ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
                            {isGlobal ? <Globe className="w-5 h-5 text-violet-400" /> :
                             isPreRestore ? <Lock className="w-5 h-5 text-amber-400" /> :
                             isRestoreLog ? <RotateCcw className="w-5 h-5 text-emerald-400" /> :
                             <FileArchive className="w-5 h-5 text-blue-400" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`font-mono text-sm font-semibold px-1.5 py-0.5 rounded ${numBadgeColor(b.backup_number)}`}>
                                {b.backup_number}
                              </span>
                              <Badge variant="outline" className={`text-xs ${typeConf.color}`}>
                                {isAr ? typeConf.label_ar : typeConf.label_fr}
                              </Badge>
                              {b.schema_version && (
                                <span className="text-xs text-muted-foreground">v{b.schema_version}</span>
                              )}
                              {!b.file_exists && !isRestoreLog && (
                                <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/30">
                                  <AlertTriangle className="h-2.5 w-2.5 me-1" />
                                  {isAr ? 'الملف محذوف' : 'Fichier absent'}
                                </Badge>
                              )}
                              {b.file_exists && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" title={isAr ? 'الملف موجود على القرص' : 'Fichier présent sur le disque'} />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {b.entity_name && <span className="me-2 font-medium">{b.entity_name}</span>}
                              {b.tables_count || 0} {isAr ? 'جدول' : 'tables'} •{' '}
                              {(b.records_count || 0).toLocaleString()} {isAr ? 'سجل' : 'records'} •{' '}
                              {formatSize(b.file_size)}
                            </p>
                            <p className="text-xs text-muted-foreground">{formatDate(b.created_at)}</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 shrink-0">
                          {b.file_exists && !isRestoreLog && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 h-8"
                              onClick={() => downloadBackup(b)}
                              data-testid={`download-backup-${b.id}`}
                            >
                              <Download className="w-3 h-3" />
                              {isAr ? 'تحميل' : 'Télécharger'}
                            </Button>
                          )}
                          {canRestore && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 h-8 border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                              onClick={() => setShowRestore(b)}
                              data-testid={`restore-backup-${b.id}`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              {isAr ? 'استعادة' : 'Restaurer'}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={() => deleteBackup(b.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {backups.length > 10 && (
                <Button
                  variant="ghost"
                  className="w-full gap-2 text-muted-foreground"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {showAll
                    ? (isAr ? 'إخفاء' : 'Réduire')
                    : (isAr ? `عرض ${backups.length - 10} نسخة إضافية` : `Voir ${backups.length - 10} de plus`)}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Schedules */}
        {schedules.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">{isAr ? 'الجداول التلقائية' : 'Planifications'}</h2>
            <div className="space-y-2">
              {schedules.map(s => (
                <Card key={s.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-amber-400" />
                      <div>
                        <span className="font-medium text-sm">{s.frequency}</span>
                        <span className="text-muted-foreground text-sm ms-2">{s.time}</span>
                        {s.keep_last && <span className="text-xs text-muted-foreground ms-2">({isAr ? `آخر ${s.keep_last}` : `garder ${s.keep_last}`})</span>}
                      </div>
                    </div>
                    <Badge variant="outline" className={s.is_active ? 'text-emerald-500 border-emerald-500/30' : 'text-muted-foreground'}>
                      {s.is_active ? (isAr ? 'نشط' : 'Actif') : (isAr ? 'متوقف' : 'Inactif')}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── Restore Confirmation Dialog ── */}
        <Dialog open={!!showRestore} onOpenChange={() => setShowRestore(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="h-5 w-5" />
                {isAr ? 'تأكيد الاستعادة' : 'Confirmer la restauration'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <Alert className="border-amber-500/40 bg-amber-500/10">
                <AlertDescription className="text-sm">
                  {isAr
                    ? 'سيتم استبدال جميع بيانات قاعدة البيانات الحالية ببيانات هذه النسخة الاحتياطية. النظام سيحفظ نسخة أمان تلقائية قبل الاستعادة.'
                    : 'Toutes les données actuelles seront remplacées par celles de cette sauvegarde. Un snapshot automatique sera créé avant la restauration.'}
                </AlertDescription>
              </Alert>

              {showRestore && (
                <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{isAr ? 'رقم النسخة:' : 'N° sauvegarde:'}</span>
                    <span className="font-mono font-medium">{showRestore.backup_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{isAr ? 'التاريخ:' : 'Date:'}</span>
                    <span>{formatDate(showRestore.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{isAr ? 'السجلات:' : 'Records:'}</span>
                    <span className="font-medium">{(showRestore.records_count || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{isAr ? 'إصدار المخطط:' : 'Version schéma:'}</span>
                    <span>v{showRestore.schema_version || '?'}</span>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-muted-foreground flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <span>
                  {isAr
                    ? 'سيتم إنشاء نسخة احتياطية تلقائية برمز PRE- قبل الاستعادة. إذا فشلت الاستعادة سيتم التراجع تلقائياً.'
                    : 'Un snapshot PRE- sera créé automatiquement. En cas d\'échec, le système effectue un rollback automatique.'}
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowRestore(null)}>
                {isAr ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button
                onClick={doRestore}
                disabled={restoring}
                className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <RotateCcw className="h-4 w-4" />
                {restoring ? (isAr ? 'جاري الاستعادة...' : 'Restauration...') : (isAr ? 'تأكيد الاستعادة' : 'Confirmer')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Schedule Dialog ── */}
        <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{isAr ? 'جدول نسخ احتياطي تلقائي' : 'Planifier sauvegarde'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">{isAr ? 'التكرار' : 'Fréquence'}</Label>
                <Select value={scheduleForm.frequency} onValueChange={v => setScheduleForm({...scheduleForm, frequency: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{isAr ? 'يومي' : 'Quotidien'}</SelectItem>
                    <SelectItem value="weekly">{isAr ? 'أسبوعي' : 'Hebdomadaire'}</SelectItem>
                    <SelectItem value="monthly">{isAr ? 'شهري' : 'Mensuel'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{isAr ? 'الوقت' : 'Heure'}</Label>
                <Input type="time" value={scheduleForm.time} onChange={e => setScheduleForm({...scheduleForm, time: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{isAr ? 'الاحتفاظ بآخر (نسخة)' : 'Garder les derniers (N)'}</Label>
                <Input type="number" min="1" max="30" value={scheduleForm.keep_last} onChange={e => setScheduleForm({...scheduleForm, keep_last: parseInt(e.target.value) || 7})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSchedule(false)}>{isAr ? 'إلغاء' : 'Annuler'}</Button>
              <Button onClick={createSchedule} data-testid="submit-schedule-btn">{isAr ? 'حفظ الجدول' : 'Enregistrer'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </Layout>
  );
}
