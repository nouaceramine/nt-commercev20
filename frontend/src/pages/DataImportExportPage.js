import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { Download, Upload, FileSpreadsheet, FileText, RefreshCw, History, AlertTriangle, CheckCircle2, Database } from 'lucide-react';

export default function DataImportExportPage() {
  const { language } = useLanguage();
  const { isSuperAdmin } = useAuth();
  const [collections, setCollections] = useState([]);
  const [importHistory, setImportHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);
  const [importing, setImporting] = useState(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [importMode, setImportMode] = useState('append');
  const [importFile, setImportFile] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('');

  const tenantParam = (sep = '?') => (isSuperAdmin && selectedTenant ? `${sep}tenant_id=${selectedTenant}` : '');

  useEffect(() => {
    if (isSuperAdmin) {
      apiClient.get('/saas/tenants').then(res => setTenants(res.data || [])).catch(() => {});
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    fetchData();
  }, [selectedTenant, isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    if (isSuperAdmin && !selectedTenant) {
      setCollections([]);
      setImportHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [collectionsRes, historyRes] = await Promise.all([
        apiClient.get(`/data/collections${tenantParam()}`),
        apiClient.get(`/data/import-history${tenantParam()}`).catch(() => ({ data: [] })),
      ]);
      setCollections(collectionsRes.data);
      setImportHistory(historyRes.data);
    } catch (error) {
      toast.error(language === 'ar' ? 'خطأ في التحميل' : 'Loading error');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (collectionKey, format) => {
    setExporting(`${collectionKey}_${format}`);
    try {
      const response = await apiClient.get(`/data/export/${collectionKey}?format=${format}${tenantParam('&')}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const ext = format === 'csv' ? 'csv' : 'xlsx';
      link.setAttribute('download', `${collectionKey}_${new Date().toISOString().split('T')[0]}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(language === 'ar' ? 'تم التصدير بنجاح' : 'Export successful');
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل التصدير' : 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleDownloadTemplate = async (collectionKey, format) => {
    try {
      const response = await apiClient.get(`/data/template/${collectionKey}?format=${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${collectionKey}_template.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(language === 'ar' ? 'خطأ' : 'Error');
    }
  };

  const handleImport = async () => {
    if (!importFile || !selectedCollection) return;
    setImporting(selectedCollection);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const response = await apiClient.post(
        `/data/import/${selectedCollection}?mode=${importMode}${tenantParam('&')}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      toast.success(`${language === 'ar' ? 'تم استيراد' : 'Imported'} ${response.data.records_imported} ${language === 'ar' ? 'سجل' : 'records'}`);
      setShowImportDialog(false);
      setImportFile(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'فشل الاستيراد' : 'Import failed'));
    } finally {
      setImporting(null);
    }
  };

  if (loading) return <Layout><div className="flex items-center justify-center h-64"><div className="spinner" /></div></Layout>;

  return (
    <Layout>
      <div className="space-y-6" data-testid="data-import-export-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="h-6 w-6" />
              {language === 'ar' ? 'استيراد وتصدير البيانات' : 'Data Import & Export'}
            </h1>
            <p className="text-muted-foreground">{language === 'ar' ? 'تصدير واستيراد بيانات النظام بصيغة CSV أو Excel' : 'Export and import system data in CSV or Excel format'}</p>
          </div>
          <Button onClick={() => setShowImportDialog(true)} className="gap-2" data-testid="import-data-btn" disabled={isSuperAdmin && !selectedTenant}>
            <Upload className="h-4 w-4" />
            {language === 'ar' ? 'استيراد بيانات' : 'Import Data'}
          </Button>
        </div>

        {/* Tenant selector (super admin) */}
        {isSuperAdmin && (
          <Card>
            <CardContent className="pt-4">
              <label className="text-sm font-medium">{language === 'ar' ? 'اختر المتجر' : 'Select Store'}</label>
              <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                <SelectTrigger className="mt-1 max-w-md" data-testid="tenant-select"><SelectValue placeholder={language === 'ar' ? 'اختر متجراً لعرض بياناته...' : 'Select a store...'} /></SelectTrigger>
                <SelectContent>
                  {tenants.map(t => (
                    <SelectItem key={t.id} value={t.id}>{(t.company_name || t.name)} — {t.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedTenant && (
                <p className="text-xs text-muted-foreground mt-2">{language === 'ar' ? 'اختر متجراً أولاً لعرض بياناته واستيرادها/تصديرها.' : 'Select a store first to view and import/export its data.'}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Collections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {collections.map(col => (
            <Card key={col.key} data-testid={`collection-card-${col.key}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{language === 'ar' ? col.label_ar : col.label_fr}</CardTitle>
                <CardDescription>
                  <Badge variant="secondary">{col.count} {language === 'ar' ? 'سجل' : 'records'}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => handleExport(col.key, 'csv')}
                    disabled={exporting === `${col.key}_csv` || col.count === 0} data-testid={`export-csv-${col.key}`}>
                    {exporting === `${col.key}_csv` ? <RefreshCw className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                    CSV
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => handleExport(col.key, 'xlsx')}
                    disabled={exporting === `${col.key}_xlsx` || col.count === 0} data-testid={`export-xlsx-${col.key}`}>
                    {exporting === `${col.key}_xlsx` ? <RefreshCw className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />}
                    Excel
                  </Button>
                </div>
                <Button size="sm" variant="ghost" className="w-full mt-2 gap-1 text-xs" onClick={() => handleDownloadTemplate(col.key, 'xlsx')}>
                  <Download className="h-3 w-3" />
                  {language === 'ar' ? 'تحميل القالب' : 'Download Template'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Import History */}
        {importHistory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />{language === 'ar' ? 'سجل الاستيراد' : 'Import History'}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ar' ? 'المجموعة' : 'Collection'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الملف' : 'File'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'الوضع' : 'Mode'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'السجلات' : 'Records'}</TableHead>
                    <TableHead>{language === 'ar' ? 'المستخدم' : 'User'}</TableHead>
                    <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importHistory.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.collection}</TableCell>
                      <TableCell className="text-sm">{log.filename}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={log.mode === 'replace' ? 'destructive' : 'default'}>{log.mode === 'replace' ? (language === 'ar' ? 'استبدال' : 'Replace') : (language === 'ar' ? 'إضافة' : 'Append')}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-semibold">{log.records_count}</TableCell>
                      <TableCell>{log.user_name}</TableCell>
                      <TableCell>{new Date(log.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Import Dialog */}
        <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />{language === 'ar' ? 'استيراد بيانات' : 'Import Data'}</DialogTitle>
              <DialogDescription>{language === 'ar' ? 'استيراد بيانات من ملف CSV أو Excel' : 'Import data from CSV or Excel file'}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">{language === 'ar' ? 'اختر المجموعة' : 'Select Collection'}</label>
                <Select value={selectedCollection} onValueChange={setSelectedCollection}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder={language === 'ar' ? 'اختر...' : 'Select...'} /></SelectTrigger>
                  <SelectContent>
                    {collections.map(col => (
                      <SelectItem key={col.key} value={col.key}>{language === 'ar' ? col.label_ar : col.label_fr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">{language === 'ar' ? 'وضع الاستيراد' : 'Import Mode'}</label>
                <Select value={importMode} onValueChange={setImportMode}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="append">
                      <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600" />{language === 'ar' ? 'إضافة (الاحتفاظ بالبيانات الحالية)' : 'Append (keep existing data)'}</div>
                    </SelectItem>
                    <SelectItem value="replace">
                      <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" />{language === 'ar' ? 'استبدال (حذف البيانات الحالية)' : 'Replace (delete existing data)'}</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {importMode === 'replace' && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200">
                  <p className="text-sm text-red-700 dark:text-red-400 font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{language === 'ar' ? 'تحذير: سيتم حذف جميع البيانات الحالية واستبدالها!' : 'Warning: All existing data will be deleted and replaced!'}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">{language === 'ar' ? 'اختر الملف' : 'Select File'}</label>
                <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setImportFile(e.target.files[0])} className="mt-1 block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90" data-testid="import-file-input" />
                <p className="text-xs text-muted-foreground mt-1">{language === 'ar' ? 'الصيغ المدعومة: CSV, Excel (.xlsx)' : 'Supported formats: CSV, Excel (.xlsx)'}</p>
              </div>

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => { setShowImportDialog(false); setImportFile(null); }} className="flex-1">{language === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
                <Button onClick={handleImport} disabled={!importFile || !selectedCollection || !!importing} className="flex-1 gap-2" data-testid="confirm-import-btn">
                  {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {language === 'ar' ? 'استيراد' : 'Import'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
