// p281: تسجيل الشاشة عبر Screen2ipcam — دليل الإعداد + سجل أجهزة الكاشير ↔ قنوات DVR.
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { ResponsiveTable } from '../components/ResponsiveTable';
import { Cctv, Plus, Pencil, Trash2, Download, Copy, RefreshCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const emptyForm = { device_name: '', pc_ip: '', rtsp_port: 8554, stream_name: 'screen', dvr_channel: '', dvr_ip: '', notes: '' };

export default function ScreenRecordingPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [devices, setDevices] = useState([]);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, i] = await Promise.all([
        apiClient.get('/screen-recording/devices'),
        apiClient.get('/screen-recording/setup-info'),
      ]);
      setDevices(d.data.items || []);
      setInfo(i.data);
    } catch (e) {
      toast.error(ar ? 'فشل التحميل' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [ar]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (d) => {
    setEditing(d);
    setForm({
      device_name: d.device_name, pc_ip: d.pc_ip || '', rtsp_port: d.rtsp_port || 8554,
      stream_name: d.stream_name || 'screen', dvr_channel: d.dvr_channel ?? '', dvr_ip: d.dvr_ip || '', notes: d.notes || '',
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.device_name.trim()) { toast.error(ar ? 'اسم الجهاز مطلوب' : 'Nom requis'); return; }
    setSaving(true);
    try {
      const body = { ...form, dvr_channel: form.dvr_channel === '' ? null : parseInt(form.dvr_channel) || null, rtsp_port: parseInt(form.rtsp_port) || 8554 };
      if (editing) await apiClient.put(`/screen-recording/devices/${editing.id}`, body);
      else await apiClient.post('/screen-recording/devices', body);
      toast.success(ar ? 'حُفظ' : 'Enregistré');
      setShowForm(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'فشل الحفظ' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d) => {
    if (!window.confirm(ar ? `حذف الجهاز «${d.device_name}»؟` : `Supprimer «${d.device_name}» ?`)) return;
    try {
      await apiClient.delete(`/screen-recording/devices/${d.id}`);
      toast.success(ar ? 'حُذف' : 'Supprimé');
      load();
    } catch (e) {
      toast.error(ar ? 'فشل الحذف' : 'Échec');
    }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    toast.success(ar ? 'نُسخ' : 'Copié');
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4" dir="rtl" data-testid="screen-recording-page">
        {/* Guide */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cctv className="w-5 h-5 text-primary" />
              {ar ? 'تسجيل شاشة الكاشير في جهاز التسجيل (DVR/NVR)' : 'Enregistrer l\'écran caisse sur le DVR/NVR'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4" data-testid="sr-guide">
            <p className="text-sm text-muted-foreground">
              {ar
                ? 'برنامج Screen2ipcam يحوّل شاشة جهاز الكاشير إلى كاميرا IP قياسية (ONVIF/RTSP) فيسجّلها جهاز التسجيل بجانب كاميرات المراقبة. البث يبقى محلياً داخل شبكة المحل ولا يمر عبر الإنترنت.'
                : 'Screen2ipcam transforme l\'écran du PC caisse en caméra IP standard (ONVIF/RTSP) enregistrée par le DVR/NVR. Le flux reste local.'}
            </p>
            {info && (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-amber-900">{ar ? 'المتطلبات' : 'Prérequis'}</div>
                    <ul className="list-disc pr-4 text-amber-800 space-y-0.5 mt-1">
                      {info.requirements.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                </div>
                <ol className="space-y-2">
                  {info.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                      <span className="pt-0.5">{s}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap items-center gap-2">
                  {info.download_sources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" className="gap-1" data-testid={`sr-download-${s.url.includes('sourceforge') ? 'sourceforge' : 'store'}`}>
                        <Download className="w-4 h-4" /> {s.label}
                      </Button>
                    </a>
                  ))}
                  <Badge variant="secondary" className="text-xs">{info.license_note}</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Devices */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Cctv className="w-4 h-4" /> {ar ? 'أجهزة الكاشير المسجَّلة' : 'Postes enregistrés'}
              {devices.length > 0 && <Badge className="bg-primary/10 text-primary">{devices.length}</Badge>}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="sr-refresh-btn">
                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" className="gap-1" onClick={openCreate} data-testid="sr-add-btn">
                <Plus className="w-4 h-4" /> {ar ? 'جهاز جديد' : 'Nouveau'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {devices.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground text-center py-8" data-testid="sr-empty">
                {ar ? 'لا أجهزة بعد — سجّل جهاز الكاشير الأول واربطه بقناة في جهاز التسجيل.' : 'Aucun poste — enregistrez le premier.'}
              </p>
            ) : (
              <ResponsiveTable
                rows={devices}
                keyFn={(d) => d.id}
                emptyText="—"
                columns={[
                  { header: ar ? 'الجهاز' : 'Poste', render: (d) => <span className="font-medium">{d.device_name}</span> },
                  { header: 'IP', render: (d) => <span dir="ltr" className="font-mono text-xs">{d.pc_ip || '—'}</span> },
                  { header: 'RTSP', render: (d) => (
                    <span className="flex items-center gap-1">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded" dir="ltr">{d.rtsp_url}</code>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); copy(d.rtsp_url); }} data-testid={`sr-copy-${d.id}`}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </span>
                  ) },
                  { header: ar ? 'قناة DVR' : 'Canal DVR', render: (d) => d.dvr_channel ? <Badge variant="outline">{ar ? 'قناة' : 'Canal'} {d.dvr_channel}</Badge> : '—' },
                  { header: ar ? 'ملاحظات' : 'Notes', render: (d) => <span className="text-xs text-muted-foreground">{d.notes || '—'}</span>, cardHidden: true },
                  { header: '', cardFull: true, render: (d) => (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="gap-1" onClick={(e) => { e.stopPropagation(); openEdit(d); }} data-testid={`sr-edit-${d.id}`}>
                        <Pencil className="w-3.5 h-3.5" /> {ar ? 'تعديل' : 'Modifier'}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={(e) => { e.stopPropagation(); remove(d); }} data-testid={`sr-delete-${d.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ) },
                ]}
              />
            )}
          </CardContent>
        </Card>

        {/* Add/Edit dialog */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent dir="rtl" data-testid="sr-device-dialog">
            <DialogHeader>
              <DialogTitle>{editing ? (ar ? 'تعديل جهاز' : 'Modifier') : (ar ? 'جهاز كاشير جديد' : 'Nouveau poste')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{ar ? 'اسم الجهاز (مثال: كاشير 1)' : 'Nom du poste'}</Label>
                <Input value={form.device_name} onChange={e => setForm({ ...form, device_name: e.target.value })} data-testid="sr-form-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>IP الجهاز</Label>
                  <Input dir="ltr" value={form.pc_ip} onChange={e => setForm({ ...form, pc_ip: e.target.value })} placeholder="192.168.1.50" data-testid="sr-form-ip" />
                </div>
                <div>
                  <Label>{ar ? 'منفذ RTSP' : 'Port RTSP'}</Label>
                  <Input dir="ltr" type="number" inputMode="numeric" value={form.rtsp_port} onChange={e => setForm({ ...form, rtsp_port: e.target.value })} data-testid="sr-form-port" />
                </div>
                <div>
                  <Label>{ar ? 'اسم البث' : 'Nom du flux'}</Label>
                  <Input dir="ltr" value={form.stream_name} onChange={e => setForm({ ...form, stream_name: e.target.value })} data-testid="sr-form-stream" />
                </div>
                <div>
                  <Label>{ar ? 'رقم القناة في جهاز التسجيل' : 'Canal DVR'}</Label>
                  <Input dir="ltr" type="number" inputMode="numeric" value={form.dvr_channel} onChange={e => setForm({ ...form, dvr_channel: e.target.value })} placeholder="9" data-testid="sr-form-channel" />
                </div>
              </div>
              <div>
                <Label>{ar ? 'IP جهاز التسجيل (اختياري)' : 'IP du DVR (optionnel)'}</Label>
                <Input dir="ltr" value={form.dvr_ip} onChange={e => setForm({ ...form, dvr_ip: e.target.value })} placeholder="192.168.1.10" data-testid="sr-form-dvr-ip" />
              </div>
              <div>
                <Label>{ar ? 'ملاحظات' : 'Notes'}</Label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} data-testid="sr-form-notes" />
              </div>
              {form.pc_ip && (
                <div className="bg-muted/40 rounded-lg p-2 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{ar ? 'رابط البث الذي تضيفه في جهاز التسجيل:' : 'URL du flux à ajouter au DVR :'}</span>
                  <code dir="ltr" className="font-mono">rtsp://{form.pc_ip}:{form.rtsp_port || 8554}/{form.stream_name || 'screen'}</code>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={save} disabled={saving} data-testid="sr-save-btn">
                {saving ? (ar ? 'جارٍ الحفظ…' : 'Enregistrement…') : (ar ? 'حفظ' : 'Enregistrer')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
