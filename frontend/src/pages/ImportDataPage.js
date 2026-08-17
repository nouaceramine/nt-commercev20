import { useState, useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import {
  Upload, FileSpreadsheet, Sparkles, CheckCircle2, AlertTriangle,
  ArrowRight, ArrowLeft, Database, Loader2, Download,
} from 'lucide-react';

// p151: Smart import wizard — reads files from other accounting software,
// maps columns with AI, previews, then submits to the existing import API.

const STEPS = ['collection', 'file', 'mapping', 'preview'];

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };
  const first = lines[0];
  const delim = ['\t', ';', '|', ','].reduce((best, d) =>
    (first.split(d).length > first.split(best).length ? d : best), ',');
  const split = (line) => {
    const out = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === delim && !inQ) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(first);
  const rows = lines.slice(1).map(split).filter(r => r.some(v => v !== ''));
  return { headers, rows };
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ImportDataPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';

  const [step, setStep] = useState(0);
  const [collections, setCollections] = useState([]);
  const [collection, setCollection] = useState(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [targetFields, setTargetFields] = useState([]);
  const [aiUsed, setAiUsed] = useState(false);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [importMode, setImportMode] = useState('append');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [parsingFile, setParsingFile] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    apiClient.get('/data/collections')
      .then(res => setCollections(res.data || []))
      .catch(() => toast.error(ar ? 'فشل تحميل الأقسام' : 'Échec du chargement'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFile = async (file) => {
    if (!file) return;
    setParsingFile(true);
    setFileName(file.name);
    try {
      const lower = file.name.toLowerCase();
      let parsed = { headers: [], rows: [] };
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
        const clean = aoa.filter(r => Array.isArray(r) && r.some(v => String(v).trim() !== ''));
        parsed = { headers: (clean[0] || []).map(h => String(h).trim()), rows: clean.slice(1) };
      } else {
        const text = await file.text();
        parsed = parseCsvText(text);
      }
      if (!parsed.headers.length || !parsed.rows.length) {
        toast.error(ar ? 'الملف فارغ أو بدون أعمدة' : 'Fichier vide ou sans colonnes');
        setParsingFile(false);
        return;
      }
      setHeaders(parsed.headers);
      setRows(parsed.rows.slice(0, 5000));
      await runMapping(parsed.headers, parsed.rows.slice(0, 3));
      setStep(2);
    } catch (e) {
      console.error(e);
      toast.error(ar ? 'تعذّر قراءة الملف — جرّب CSV أو Excel' : 'Lecture impossible — essayez CSV ou Excel');
    } finally {
      setParsingFile(false);
    }
  };

  const runMapping = async (hdrs, sampleRows) => {
    setMappingLoading(true);
    try {
      const res = await apiClient.post('/ai/map-columns', {
        collection: collection.key,
        headers: hdrs,
        sample_rows: sampleRows,
      });
      setMapping(res.data.mapping || {});
      setTargetFields(res.data.fields || collection.fields || []);
      setAiUsed(!!res.data.ai_used);
      if ((res.data.unmatched || []).length) {
        toast.warning(ar
          ? `${res.data.unmatched.length} عمود لم يُطابق تلقائياً — حدّده يدوياً`
          : `${res.data.unmatched.length} colonnes non mappées — à définir`);
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(detail || (ar ? 'فشل التحليل الذكي' : 'Échec du mapping IA'));
      setTargetFields(collection.fields || []);
    } finally {
      setMappingLoading(false);
    }
  };

  const transformed = () => {
    const active = targetFields.filter(f => headers.some(h => mapping[h] === f));
    const idx = {};
    headers.forEach((h, i) => { if (mapping[h]) idx[i] = mapping[h]; });
    const body = rows.map(r => {
      const rec = {};
      Object.entries(idx).forEach(([i, f]) => { rec[f] = r[Number(i)] ?? ''; });
      return rec;
    });
    return { active, body };
  };

  const handleImport = async () => {
    const { active, body } = transformed();
    if (!active.length) {
      toast.error(ar ? 'طابق عموداً واحداً على الأقل' : 'Mappez au moins une colonne');
      return;
    }
    setImporting(true);
    try {
      const csv = [active.join(','), ...body.map(rec => active.map(f => csvEscape(rec[f])).join(','))].join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const fd = new FormData();
      fd.append('file', blob, 'smart_import.csv');
      const res = await apiClient.post(`/data/import/${collection.key}?mode=${importMode}`, fd);
      setResult(res.data);
      toast.success(ar ? `تم استيراد ${res.data.records_imported} سجل` : `${res.data.records_imported} enregistrements importés`);
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : (ar ? 'فشل الاستيراد' : "Échec de l'import"));
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep(0); setCollection(null); setFileName(''); setHeaders([]); setRows([]);
    setMapping({}); setResult(null); setAiUsed(false);
  };

  const { active, body } = (headers.length && targetFields.length) ? transformed() : { active: [], body: [] };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="import-wizard-page" dir={ar ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-purple-500" />
              {ar ? 'الاستيراد الذكي' : 'Import intelligent'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {ar
                ? 'استورد بياناتك من أي برنامج محاسبة — الذكاء الاصطناعي يطابق الأعمدة تلقائياً'
                : "Importez vos données depuis n'importe quel logiciel — l'IA mappe les colonnes"}
            </p>
          </div>
          {step > 0 && !result && (
            <Button variant="outline" onClick={reset} data-testid="iw-reset-btn">
              {ar ? 'بدء من جديد' : 'Recommencer'}
            </Button>
          )}
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 flex-wrap">
          {[
            ar ? 'القسم' : 'Section',
            ar ? 'الملف' : 'Fichier',
            ar ? 'مطابقة الأعمدة' : 'Mapping',
            ar ? 'معاينة واستيراد' : 'Aperçu & import',
          ].map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <Badge variant={i === step ? 'default' : i < step ? 'secondary' : 'outline'} className="text-sm">
                {i + 1}. {label}
              </Badge>
              {i < 3 && <ArrowRight className={`h-4 w-4 text-muted-foreground ${ar ? 'rotate-180' : ''}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: collection */}
        {step === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="iw-step-collections">
            {collections.map(c => (
              <Card
                key={c.key}
                className="cursor-pointer hover:border-purple-400 transition-colors"
                onClick={() => { setCollection(c); setStep(1); }}
                data-testid={`iw-collection-${c.key}`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4 text-purple-500" />
                    {ar ? c.label_ar : c.label_fr}
                  </CardTitle>
                  <CardDescription>{c.count} {ar ? 'سجل حالي' : 'enregistrements'}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        {/* Step 2: file */}
        {step === 1 && collection && (
          <Card data-testid="iw-step-file">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                {ar ? `رفع ملف — ${collection.label_ar}` : `Fichier — ${collection.label_fr}`}
              </CardTitle>
              <CardDescription>
                {ar ? 'CSV أو Excel من أي برنامج (PC Compta, Sage, Excel...) — الأولوية لصف العناوين في أول سطر'
                     : 'CSV ou Excel depuis tout logiciel — la première ligne doit contenir les en-têtes'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
                data-testid="iw-file-input"
              />
              <div
                className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-purple-400 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {parsingFile ? (
                  <Loader2 className="h-10 w-10 mx-auto animate-spin text-purple-500" />
                ) : (
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                )}
                <p className="mt-3 font-medium">{fileName || (ar ? 'اضغط لاختيار الملف' : 'Cliquez pour choisir')}</p>
                <p className="text-sm text-muted-foreground">.csv .txt .xlsx .xls</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  <ArrowLeft className={`h-4 w-4 me-1 ${ar ? 'rotate-180' : ''}`} /> {ar ? 'رجوع' : 'Retour'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    apiClient.get(`/data/template/${collection.key}`, { responseType: 'blob' })
                      .then(res => {
                        const url = window.URL.createObjectURL(new Blob([res.data]));
                        const a = document.createElement('a');
                        a.href = url; a.download = `${collection.key}_template.csv`; a.click();
                      })
                      .catch(() => toast.error(ar ? 'لا يوجد قالب' : 'Pas de modèle'));
                  }}
                >
                  <Download className="h-4 w-4 me-1" /> {ar ? 'تحميل قالب فارغ' : 'Modèle vide'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: mapping */}
        {step === 2 && (
          <Card data-testid="iw-step-mapping">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
                {ar ? 'مطابقة الأعمدة' : 'Mapping des colonnes'}
                {aiUsed && <Badge variant="secondary">{ar ? 'بالذكاء الاصطناعي' : 'par IA'}</Badge>}
              </CardTitle>
              <CardDescription>
                {ar ? `${rows.length} صف في الملف — راجع المطابقة وعدّلها عند الحاجة`
                     : `${rows.length} lignes — vérifiez le mapping`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mappingLoading ? (
                <div className="flex items-center gap-2 justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                  <span>{ar ? 'الذكاء الاصطناعي يحلل الأعمدة...' : "L'IA analyse les colonnes..."}</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="iw-map-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{ar ? 'عمود الملف' : 'Colonne source'}</TableHead>
                        <TableHead>{ar ? 'مثال' : 'Exemple'}</TableHead>
                        <TableHead>{ar ? 'الحقل المقابل' : 'Champ cible'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {headers.map((h, i) => (
                        <TableRow key={i} className={mapping[h] ? '' : 'bg-amber-500/5'}>
                          <TableCell className="font-medium">{h}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {String(rows[0]?.[i] ?? '').slice(0, 30)}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={mapping[h] || '__ignore__'}
                              onValueChange={(v) => setMapping(prev => ({ ...prev, [h]: v === '__ignore__' ? '' : v }))}
                            >
                              <SelectTrigger className="w-48" data-testid={`iw-map-select-${i}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__ignore__">{ar ? '— تجاهل —' : '— ignorer —'}</SelectItem>
                                {targetFields.map(f => (
                                  <SelectItem key={f} value={f}>{f}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className={`h-4 w-4 me-1 ${ar ? 'rotate-180' : ''}`} /> {ar ? 'رجوع' : 'Retour'}
                </Button>
                <Button onClick={() => setStep(3)} disabled={mappingLoading} data-testid="iw-to-preview-btn">
                  {ar ? 'معاينة' : 'Aperçu'} <ArrowRight className={`h-4 w-4 ms-1 ${ar ? 'rotate-180' : ''}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: preview + import */}
        {step === 3 && (
          <Card data-testid="iw-step-preview">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                {ar ? 'معاينة واستيراد' : 'Aperçu et import'}
              </CardTitle>
              <CardDescription>
                {ar ? `${body.length} سجل جاهز — ${active.length} حقل: ${active.join(', ')}`
                     : `${body.length} enregistrements — ${active.length} champs`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!result ? (
                <>
                  {active.length === 0 && (
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      {ar ? 'لا توجد أعمدة مطابقة — ارجع لخطوة المطابقة' : 'Aucune colonne mappée'}
                    </div>
                  )}
                  <div className="overflow-x-auto max-h-72 overflow-y-auto border rounded-lg">
                    <Table data-testid="iw-preview-table">
                      <TableHeader>
                        <TableRow>
                          {active.map(f => <TableHead key={f}>{f}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {body.slice(0, 8).map((rec, i) => (
                          <TableRow key={i}>
                            {active.map(f => (
                              <TableCell key={f} className="text-sm">{String(rec[f] ?? '').slice(0, 25)}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {body.length > 8 && (
                    <p className="text-sm text-muted-foreground">
                      {ar ? `+ ${body.length - 8} صف آخر...` : `+ ${body.length - 8} autres lignes...`}
                    </p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Select value={importMode} onValueChange={setImportMode}>
                      <SelectTrigger className="w-56" data-testid="iw-mode-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="append">{ar ? 'إضافة للموجود' : 'Ajouter'}</SelectItem>
                        <SelectItem value="replace">{ar ? 'استبدال الكل' : 'Tout remplacer'}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" onClick={() => setStep(2)}>
                      <ArrowLeft className={`h-4 w-4 me-1 ${ar ? 'rotate-180' : ''}`} /> {ar ? 'رجوع' : 'Retour'}
                    </Button>
                    <Button onClick={handleImport} disabled={importing || !active.length} data-testid="iw-submit-btn">
                      {importing && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
                      {ar ? `استيراد ${body.length} سجل` : `Importer ${body.length} lignes`}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 space-y-4" data-testid="iw-result">
                  <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500" />
                  <p className="text-xl font-bold">
                    {ar ? `تم استيراد ${result.records_imported} سجل بنجاح` : `${result.records_imported} enregistrements importés`}
                  </p>
                  {result.skipped_duplicates > 0 && (
                    <p className="text-muted-foreground">
                      {ar ? `تُخطّي ${result.skipped_duplicates} مكرر` : `${result.skipped_duplicates} doublons ignorés`}
                    </p>
                  )}
                  <Button onClick={reset} data-testid="iw-again-btn">
                    {ar ? 'استيراد جديد' : 'Nouvel import'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
