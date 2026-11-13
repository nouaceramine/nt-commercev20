import _React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { ShieldCheck, Upload, Loader2, XCircle, FileText, Clock, CheckCircle2 } from 'lucide-react';

// M12: tenant KYC — identity verification submission + status tracking.
const STATUS_META = {
  none:     { ar: 'لم يُقدَّم',   fr: 'Non soumis',   cls: 'bg-gray-100 text-gray-700' },
  pending:  { ar: 'قيد المراجعة', fr: 'En cours',     cls: 'bg-blue-100 text-blue-700' },
  approved: { ar: 'موثَّق',       fr: 'Vérifié',      cls: 'bg-green-100 text-green-700' },
  rejected: { ar: 'مرفوض',        fr: 'Rejeté',       cls: 'bg-red-100 text-red-700' },
};
const DOC_TYPES = [
  { v: 'id_card',    ar: 'بطاقة التعريف',       fr: "Carte d'identité" },
  { v: 'rc_extract', ar: 'مستخرج السجل التجاري', fr: 'Extrait RC' },
  { v: 'nif_doc',    ar: 'وثيقة NIF',            fr: 'Document NIF' },
  { v: 'photo_shop', ar: 'صورة المحل',           fr: 'Photo du local' },
  { v: 'other',      ar: 'أخرى',                 fr: 'Autre' },
];
const MAX_DOCS = 3;

const KycPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('none');
  const [submission, setSubmission] = useState(null);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState({ business_name: '', activity: '', rc_number: '', nif: '', phone: '', address: '', wilaya: '' });
  const [docs, setDocs] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([apiClient.get('/kyc/status'), apiClient.get('/kyc/history')]);
      setStatus(s.data.status || 'none');
      setSubmission(s.data.submission || null);
      setHistory(h.data.items || []);
    } catch (_e) {
      toast.error(isAr ? 'فشل تحميل حالة التوثيق' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [isAr]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const addFiles = async (fileList, docType) => {
    const files = Array.from(fileList || []).slice(0, MAX_DOCS - docs.length);
    for (const f of files) {
      if (f.size > 2_500_000) {
        toast.error(isAr ? `الملف ${f.name} أكبر من 2.5MB` : `${f.name} > 2.5MB`);
        continue;
      }
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1] || '');
        r.onerror = rej;
        r.readAsDataURL(f);
      });
      setDocs(d => [...d, { doc_type: docType, filename: f.name, data_b64: b64 }]);
    }
  };

  const submit = async () => {
    if (!form.business_name.trim() || !form.phone.trim() || docs.length === 0) {
      toast.error(isAr ? 'اسم النشاط والهاتف ووثيقة واحدة على الأقل مطلوبة' : 'Nom, téléphone et 1 document requis');
      return;
    }
    setSaving(true);
    try {
      const r = await apiClient.post('/kyc/submit', { ...form, documents: docs });
      toast.success(isAr ? `أُرسل الطلب ${r.data.code}` : `Demande envoyée ${r.data.code}`);
      setDocs([]);
      setForm({ business_name: '', activity: '', rc_number: '', nif: '', phone: '', address: '', wilaya: '' });
      await loadAll();
    } catch (e) {
      const code = e?.response?.status;
      if (code === 409) toast.error(isAr ? 'لديك طلب قيد المراجعة أصلاً' : 'Une demande est déjà en cours');
      else toast.error(isAr ? 'فشل إرسال الطلب' : "Échec de l'envoi");
    } finally {
      setSaving(false);
    }
  };

  const meta = STATUS_META[status] || STATUS_META.none;
  const canSubmit = status === 'none' || status === 'rejected';

  return (
    <Layout>
      <div dir={isAr ? 'rtl' : 'ltr'} className="max-w-2xl mx-auto space-y-4" data-testid="kyc-page">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {isAr ? 'توثيق الهوية التجارية' : "Vérification d'identité (KYC)"}
              <Badge className={meta.cls} data-testid="kyc-status-badge">{isAr ? meta.ar : meta.fr}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                {status === 'pending' && submission && (
                  <div className="flex items-start gap-2 text-sm bg-blue-50 border border-blue-200 rounded-md p-3" data-testid="kyc-pending-note">
                    <Clock className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
                    <span>{isAr ? `طلبك ${submission.code} قيد المراجعة من إدارة المنصة.` : `Votre demande ${submission.code} est en cours d'examen.`}</span>
                  </div>
                )}
                {status === 'approved' && (
                  <div className="flex items-start gap-2 text-sm bg-green-50 border border-green-200 rounded-md p-3" data-testid="kyc-approved-note">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                    <span>{isAr ? 'حسابك موثَّق. شكراً لك.' : 'Votre compte est vérifié. Merci.'}</span>
                  </div>
                )}
                {status === 'rejected' && submission?.review_note && (
                  <div className="flex items-start gap-2 text-sm bg-red-50 border border-red-200 rounded-md p-3" data-testid="kyc-rejected-note">
                    <XCircle className="h-4 w-4 mt-0.5 text-red-600 shrink-0" />
                    <span>{isAr ? `سبب الرفض: ${submission.review_note}` : `Motif du rejet : ${submission.review_note}`}</span>
                  </div>
                )}

                {canSubmit && (
                  <div className="space-y-3" data-testid="kyc-form">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><Label>{isAr ? 'اسم النشاط التجاري *' : 'Nom commercial *'}</Label><Input value={form.business_name} onChange={set('business_name')} data-testid="kyc-business-name" /></div>
                      <div><Label>{isAr ? 'الهاتف *' : 'Téléphone *'}</Label><Input value={form.phone} onChange={set('phone')} data-testid="kyc-phone" /></div>
                      <div><Label>{isAr ? 'النشاط' : 'Activité'}</Label><Input value={form.activity} onChange={set('activity')} /></div>
                      <div><Label>{isAr ? 'رقم السجل التجاري' : 'N° RC'}</Label><Input value={form.rc_number} onChange={set('rc_number')} /></div>
                      <div><Label>NIF</Label><Input value={form.nif} onChange={set('nif')} /></div>
                      <div><Label>{isAr ? 'الولاية' : 'Wilaya'}</Label><Input value={form.wilaya} onChange={set('wilaya')} /></div>
                    </div>
                    <div><Label>{isAr ? 'العنوان' : 'Adresse'}</Label><Input value={form.address} onChange={set('address')} /></div>

                    <div className="border rounded-md p-3 space-y-2">
                      <div className="text-sm font-medium">{isAr ? `الوثائق (${docs.length}/${MAX_DOCS})` : `Documents (${docs.length}/${MAX_DOCS})`}</div>
                      {docs.map((d, i) => (
                        <div key={i} className="flex items-center justify-between text-xs border rounded px-2 py-1">
                          <span className="flex items-center gap-1 truncate"><FileText className="h-3 w-3" />{d.filename}</span>
                          <Button variant="ghost" size="sm" onClick={() => setDocs(dd => dd.filter((_, j) => j !== i))}><XCircle className="h-3 w-3" /></Button>
                        </div>
                      ))}
                      {docs.length < MAX_DOCS && (
                        <div className="flex items-center gap-2">
                          <Select defaultValue="id_card" onValueChange={(v) => { const inp = document.getElementById('kyc-file-input'); if (inp) inp.dataset.docType = v; }}>
                            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DOC_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{isAr ? t.ar : t.fr}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Label htmlFor="kyc-file-input" className="cursor-pointer inline-flex items-center gap-1 text-sm border rounded-md px-3 py-1.5 hover:bg-accent" data-testid="kyc-upload-btn">
                            <Upload className="h-4 w-4" />{isAr ? 'إرفاق' : 'Joindre'}
                          </Label>
                          <input id="kyc-file-input" type="file" accept="image/*,.pdf" multiple className="hidden"
                            onChange={(e) => { addFiles(e.target.files, e.target.dataset.docType || 'id_card'); e.target.value = ''; }} />
                        </div>
                      )}
                    </div>

                    <Button className="w-full" onClick={submit} disabled={saving} data-testid="kyc-submit-btn">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      <span className="mr-1">{isAr ? 'إرسال طلب التوثيق' : 'Envoyer la demande'}</span>
                    </Button>
                  </div>
                )}

                {history.length > 0 && (
                  <div className="pt-2" data-testid="kyc-history">
                    <div className="text-sm font-medium mb-1">{isAr ? 'السجل' : 'Historique'}</div>
                    <ul className="space-y-1">
                      {history.map(h => (
                        <li key={h.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                          <span>{h.code} — {(h.submitted_at || '').slice(0, 10)}</span>
                          <Badge className={(STATUS_META[h.status] || STATUS_META.none).cls}>{isAr ? (STATUS_META[h.status] || STATUS_META.none).ar : (STATUS_META[h.status] || STATUS_META.none).fr}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default KycPage;
