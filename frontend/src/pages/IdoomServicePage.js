import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import {
  Wifi, Send, Loader2, CheckCircle2, XCircle,
  BarChart2, Upload, Package, RefreshCw, Copy,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../utils/globalDateFormatter';

const DENOMINATIONS = [500, 1000, 1500, 2000, 2500, 5000];

const TABS = ['sell', 'inventory', 'upload'];
const TAB_LABELS = {
  sell:      { ar: 'بيع كود', fr: 'Vendre un code' },
  inventory: { ar: 'المخزون', fr: 'Inventaire' },
  upload:    { ar: 'رفع أكواد', fr: 'Importer des codes' },
};

export default function IdoomServicePage() {
  const { language } = useLanguage();
  const { isAdmin } = useAuth();
  const ar = language === 'ar';

  const [tab, setTab] = useState('sell');

  // --- Sell tab state ---
  const [selectedDenom, setSelectedDenom] = useState(null);
  const [payMethod, setPayMethod] = useState('cash');
  const [selling, setSelling] = useState(false);
  const [lastCode, setLastCode] = useState(null);

  // --- Inventory tab state ---
  const [stats, setStats] = useState(null);
  const [codes, setCodes] = useState([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('available');
  const [denomFilter, setDenomFilter] = useState('all');

  // --- Upload tab state ---
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await apiClient.get('/idoom/codes/stats');
      setStats(res.data);
    } catch {
      // handled
    }
  }, [isAdmin]);

  const loadCodes = useCallback(async () => {
    if (!isAdmin) return;
    setCodesLoading(true);
    try {
      const params = { status: statusFilter, limit: 50 };
      if (denomFilter && denomFilter !== 'all') params.denomination = parseFloat(denomFilter);
      const res = await apiClient.get('/idoom/codes', { params });
      setCodes(res.data?.items || []);
    } catch {
      // handled
    } finally {
      setCodesLoading(false);
    }
  }, [isAdmin, statusFilter, denomFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { if (tab === 'inventory') loadCodes(); }, [tab, loadCodes]);

  const sellCode = async () => {
    if (!selectedDenom) {
      toast.error(ar ? 'اختر القيمة أولاً' : 'Choisissez une valeur');
      return;
    }
    setSelling(true);
    setLastCode(null);
    try {
      const res = await apiClient.post('/idoom/codes/sell', {
        denomination: selectedDenom,
        payment_method: payMethod,
      });
      setLastCode(res.data);
      toast.success(ar ? `تم بيع الكود بنجاح` : 'Code vendu avec succès');
      setSelectedDenom(null);
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'لا توجد أكواد متاحة' : 'Aucun code disponible'));
    } finally {
      setSelling(false);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code);
    toast.success(ar ? 'تم نسخ الكود' : 'Code copié');
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error(ar ? 'اختر ملف CSV' : 'Choisissez un fichier CSV');
      return;
    }
    setUploading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      const res = await apiClient.post('/idoom/codes/bulk', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadResult(res.data);
      toast.success(
        ar
          ? `تم إدخال ${res.data.inserted} كود`
          : `${res.data.inserted} code(s) importé(s)`
      );
      setUploadFile(null);
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل الرفع' : 'Échec import'));
    } finally {
      setUploading(false);
    }
  };

  const fmtDate = (s) => s ? new Date(s).toLocaleString(ar ? 'ar-DZ' : 'fr-DZ') : '—';

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wifi className="h-7 w-7 text-emerald-600" />
              {ar ? 'أيدوم — بيع أكواد الإنترنت' : 'Idoom — Vente de codes Internet'}
            </h1>
            <p className="text-muted-foreground text-sm">
              {ar ? 'بيع أكواد Idoom ADSL/4G من المخزون' : 'Vendre des codes Idoom ADSL/4G depuis l\'inventaire'}
            </p>
          </div>
          <Link to="/services">
            <Button variant="outline" size="sm">{ar ? '← الخدمات' : '← Services'}</Button>
          </Link>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3 flex items-center gap-3">
                <Package className="h-7 w-7 text-blue-500 opacity-80" />
                <div>
                  <div className="text-xs text-muted-foreground">{ar ? 'إجمالي متاح' : 'Total disponible'}</div>
                  <div className="text-xl font-bold">{stats.total_available}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-3">
                <CheckCircle2 className="h-7 w-7 text-green-600 opacity-80" />
                <div>
                  <div className="text-xs text-muted-foreground">{ar ? 'إجمالي مباع' : 'Total vendus'}</div>
                  <div className="text-xl font-bold">{stats.total_sold}</div>
                </div>
              </CardContent>
            </Card>
            {stats.by_denomination?.slice(0, 2).map((d) => (
              <Card key={d.denomination}>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">{formatCurrency(d.denomination)}</div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-sm text-blue-600 font-semibold">{ar ? 'متاح:' : 'Dispo:'} {d.available || 0}</span>
                    <span className="text-sm text-green-600 font-semibold">{ar ? 'مباع:' : 'Vendu:'} {d.sold || 0}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {TABS.filter((t) => isAdmin || t === 'sell').map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {ar ? TAB_LABELS[key].ar : TAB_LABELS[key].fr}
            </button>
          ))}
        </div>

        {/* ===================== TAB: SELL ===================== */}
        {tab === 'sell' && (
          <div className="max-w-lg space-y-5">
            {/* Denomination selection */}
            <div>
              <Label className="mb-2 block">{ar ? 'اختر قيمة الكود *' : 'Choisir la valeur *'}</Label>
              <div className="grid grid-cols-3 gap-2">
                {DENOMINATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDenom(d)}
                    className={`py-3 rounded-lg border-2 text-center transition-all font-semibold ${
                      selectedDenom === d
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted hover:border-primary/50'
                    }`}
                  >
                    <div className="text-lg">{d.toLocaleString()}</div>
                    <div className="text-xs opacity-70">دج</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>{ar ? 'طريقة الدفع' : 'Paiement'}</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{ar ? 'نقداً' : 'Espèces'}</SelectItem>
                  <SelectItem value="bank">{ar ? 'بنك' : 'Banque'}</SelectItem>
                  <SelectItem value="wallet">{ar ? 'محفظة' : 'Portefeuille'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={sellCode}
              disabled={selling || !selectedDenom}
              className="w-full h-12 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-base"
            >
              {selling ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> {ar ? 'جاري البيع...' : 'Vente...'}</>
              ) : (
                <><Send className="h-5 w-5" /> {ar ? 'بيع الكود' : 'Vendre le code'}</>
              )}
            </Button>

            {/* Last sold code */}
            {lastCode && (
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-green-700 font-medium mb-1 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      {ar ? 'تم بيع الكود بنجاح!' : 'Code vendu avec succès !'}
                    </p>
                    <p className="text-xs text-muted-foreground mb-1">
                      {ar ? 'القيمة:' : 'Valeur:'} <strong>{lastCode.denomination?.toLocaleString()} دج</strong>
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <code className="text-xl font-mono font-bold tracking-widest bg-white dark:bg-black/30 px-3 py-1 rounded border">
                        {lastCode.code}
                      </code>
                      <button onClick={() => copyCode(lastCode.code)} className="text-green-700 hover:text-green-900">
                        <Copy className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== TAB: INVENTORY ===================== */}
        {tab === 'inventory' && isAdmin && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">{ar ? 'متاح' : 'Disponible'}</SelectItem>
                  <SelectItem value="sold">{ar ? 'مباع' : 'Vendu'}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={denomFilter} onValueChange={setDenomFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder={ar ? 'كل القيم' : 'Toutes valeurs'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{ar ? 'كل القيم' : 'Toutes'}</SelectItem>
                  {DENOMINATIONS.map((d) => <SelectItem key={d} value={String(d)}>{d.toLocaleString()} دج</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadCodes} className="gap-1">
                <RefreshCw className="h-4 w-4" /> {ar ? 'تحديث' : 'Actualiser'}
              </Button>
            </div>

            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{ar ? 'الكود' : 'Code'}</TableHead>
                      <TableHead>{ar ? 'القيمة' : 'Valeur'}</TableHead>
                      <TableHead>{ar ? 'الحالة' : 'Statut'}</TableHead>
                      <TableHead>{ar ? 'تاريخ الإضافة' : 'Ajouté le'}</TableHead>
                      <TableHead>{ar ? 'تاريخ البيع' : 'Vendu le'}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {codesLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : codes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          <XCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                          {ar ? 'لا توجد أكواد' : 'Aucun code'}
                        </TableCell>
                      </TableRow>
                    ) : codes.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono font-bold">{c.code}</TableCell>
                        <TableCell>{c.denomination?.toLocaleString()} دج</TableCell>
                        <TableCell>
                          <Badge variant={c.status === 'available' ? 'default' : 'secondary'}>
                            {c.status === 'available' ? (ar ? 'متاح' : 'Disponible') : (ar ? 'مباع' : 'Vendu')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(c.created_at)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(c.sold_at)}</TableCell>
                        <TableCell>
                          {c.status === 'available' && (
                            <button onClick={() => copyCode(c.code)} className="text-muted-foreground hover:text-foreground">
                              <Copy className="h-4 w-4" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ===================== TAB: UPLOAD ===================== */}
        {tab === 'upload' && isAdmin && (
          <div className="max-w-lg space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  {ar ? 'رفع أكواد بصيغة CSV' : 'Importer des codes CSV'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded bg-muted text-sm">
                  <p className="font-medium mb-1">{ar ? 'تنسيق الملف المطلوب:' : 'Format requis :'}</p>
                  <code className="text-xs block" dir="ltr">code,denomination</code>
                  <code className="text-xs block" dir="ltr">ABC123XYZ,500</code>
                  <code className="text-xs block" dir="ltr">DEF456QRS,1000</code>
                </div>

                <div className="space-y-2">
                  <Label>{ar ? 'اختر ملف CSV' : 'Sélectionner fichier CSV'}</Label>
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={(e) => { setUploadFile(e.target.files[0]); setUploadResult(null); }}
                  />
                  {uploadFile && (
                    <p className="text-xs text-muted-foreground">{uploadFile.name} — {Math.round(uploadFile.size / 1024)} KB</p>
                  )}
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={uploading || !uploadFile}
                  className="w-full gap-2"
                >
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {ar ? 'جاري الرفع...' : 'Import en cours...'}</>
                  ) : (
                    <><Upload className="h-4 w-4" /> {ar ? 'رفع الأكواد' : 'Importer les codes'}</>
                  )}
                </Button>

                {uploadResult && (
                  <div className="p-4 rounded-lg border space-y-2">
                    <p className="font-semibold text-sm">{ar ? 'نتيجة الرفع:' : 'Résultat :'}</p>
                    <div className="flex gap-4 text-sm">
                      <span className="text-green-600">✓ {ar ? 'تم إضافة' : 'Ajoutés :'} <strong>{uploadResult.inserted}</strong></span>
                      <span className="text-amber-600">≡ {ar ? 'مكررات' : 'Doublons :'} <strong>{uploadResult.duplicates}</strong></span>
                    </div>
                    {uploadResult.errors?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-medium text-red-600">{ar ? 'أخطاء:' : 'Erreurs :'}</p>
                        {uploadResult.errors.slice(0, 5).map((e, i) => (
                          <p key={i} className="text-xs text-red-500">{e}</p>
                        ))}
                        {uploadResult.errors.length > 5 && (
                          <p className="text-xs text-muted-foreground">…+{uploadResult.errors.length - 5}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stats by denomination */}
            {stats?.by_denomination?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart2 className="h-4 w-4" />
                    {ar ? 'إحصائيات المخزون' : 'Stats inventaire'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.by_denomination.map((d) => (
                      <div key={d.denomination} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{d.denomination?.toLocaleString()} دج</span>
                        <div className="flex gap-4">
                          <span className="text-blue-600">{ar ? 'متاح:' : 'Dispo:'} {d.available || 0}</span>
                          <span className="text-green-600">{ar ? 'مباع:' : 'Vendu:'} {d.sold || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
