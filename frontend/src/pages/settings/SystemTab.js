import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Settings, AlertTriangle, Trash2, Save, RefreshCw, ImageIcon, Database, Download, Upload, HardDrive, GripVertical, ChevronRight } from 'lucide-react';

export default function SystemTab() {
  const { t, language } = useLanguage();

  const [systemStats, setSystemStats] = useState(null);
  const [systemSettings, setSystemSettings] = useState({ cash_difference_threshold: 1000, low_stock_threshold: 10, currency_symbol: 'دج', business_name: 'NT' });
  const [savingSystemSettings, setSavingSystemSettings] = useState(false);

  const [brandingSettings, setBrandingSettings] = useState({ logo_url: '', business_name: 'NT', background_image_url: '', tagline_ar: '', tagline_fr: '' });
  const [savingBranding, setSavingBranding] = useState(false);

  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetting, setResetting] = useState(false);

  const [showSelectiveDeleteDialog, setShowSelectiveDeleteDialog] = useState(false);
  const [selectedDataTypes, setSelectedDataTypes] = useState([]);
  const [selectiveDeleteCode, setSelectiveDeleteCode] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [backupLoading, setBackupLoading] = useState(false);
  const [backupList, setBackupList] = useState([]);

  useEffect(() => { fetchData(); fetchBackupList(); }, []);

  const fetchData = async () => {
    try {
      const [statsRes, sysSettingsRes, brandingRes] = await Promise.all([
        apiClient.get(`/system/stats`).catch(() => ({ data: null })),
        apiClient.get(`/system/settings`).catch(() => ({ data: null })),
        apiClient.get(`/branding/settings`).catch(() => ({ data: null })),
      ]);
      if (statsRes.data) setSystemStats(statsRes.data);
      if (sysSettingsRes.data) setSystemSettings(sysSettingsRes.data);
      if (brandingRes.data) setBrandingSettings(brandingRes.data);
    } catch (error) { console.error('Error fetching system data:', error); }
  };

  const fetchBackupList = async () => {
    try {
      
      const response = await apiClient.get(`/backup/list`);
      setBackupList(response.data);
    } catch (error) { console.error('Error fetching backup list:', error); }
  };

  const saveSystemSettings = async () => {
    setSavingSystemSettings(true);
    try {
      
      await apiClient.put(`/system/settings`, systemSettings);
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات بنجاح' : 'Paramètres enregistrés');
    } catch (error) { toast.error(t.error); }
    finally { setSavingSystemSettings(false); }
  };

  const saveBrandingSettings = async () => {
    setSavingBranding(true);
    try {
      
      await apiClient.put(`/branding/settings`, brandingSettings);
      toast.success(language === 'ar' ? 'تم حفظ إعدادات صفحة الدخول' : 'Paramètres de connexion enregistrés');
    } catch (error) { toast.error(t.error); }
    finally { setSavingBranding(false); }
  };

  const handleFactoryReset = async () => {
    if (resetCode !== 'RESET-ALL-DATA') { toast.error(language === 'ar' ? 'كود التأكيد غير صحيح' : 'Invalid confirmation code'); return; }
    setResetting(true);
    try {
      
      await apiClient.post(`/system/factory-reset`, null, { params: { confirm_code: resetCode } });
      toast.success(t.factoryResetSuccess);
      setShowResetDialog(false); setResetCode('');
    } catch (error) { toast.error(error.response?.data?.detail || t.error); }
    finally { setResetting(false); }
  };

  const handleDownloadBackup = async () => {
    setBackupLoading(true);
    try {
      
      const response = await apiClient.get(`/backup/create`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a'); link.href = url;
      link.setAttribute('download', `backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
      toast.success(language === 'ar' ? 'تم تحميل النسخة الاحتياطية' : 'Backup downloaded');
    } catch (error) { toast.error(language === 'ar' ? 'فشل في تحميل النسخة' : 'Failed to download backup'); }
    finally { setBackupLoading(false); }
  };

  const handleSaveBackupToServer = async () => {
    setBackupLoading(true);
    try {
      
      await apiClient.post(`/backup/save-to-server`, {});
      toast.success(language === 'ar' ? 'تم حفظ النسخة على السيرفر' : 'Backup saved to server');
      fetchBackupList();
    } catch (error) { toast.error(language === 'ar' ? 'فشل في حفظ النسخة' : 'Failed to save backup'); }
    finally { setBackupLoading(false); }
  };

  const handleRestoreBackup = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد؟ سيتم استبدال كل البيانات الحالية!' : 'Are you sure? All current data will be replaced!')) { e.target.value = ''; return; }
    setBackupLoading(true);
    try {
      
      const formData = new FormData(); formData.append('file', file);
      await apiClient.post(`/backup/restore`, formData, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } });
      toast.success(language === 'ar' ? 'تم استعادة البيانات بنجاح' : 'Data restored successfully');
      window.location.reload();
    } catch (error) { toast.error(language === 'ar' ? 'فشل في استعادة البيانات' : 'Failed to restore data'); }
    finally { setBackupLoading(false); e.target.value = ''; }
  };

  const dataTypeOptions = [
    { value: 'sales', label: language === 'ar' ? 'المبيعات' : 'Sales' },
    { value: 'purchases', label: language === 'ar' ? 'المشتريات' : 'Purchases' },
    { value: 'customers', label: language === 'ar' ? 'الزبائن' : 'Customers' },
    { value: 'suppliers', label: language === 'ar' ? 'الموردين' : 'Suppliers' },
    { value: 'products', label: language === 'ar' ? 'المنتجات' : 'Products' },
    { value: 'employees', label: language === 'ar' ? 'الموظفين' : 'Employees' },
    { value: 'debts', label: language === 'ar' ? 'الديون' : 'Debts' },
    { value: 'expenses', label: language === 'ar' ? 'المصاريف' : 'Expenses' },
    { value: 'repairs', label: language === 'ar' ? 'الإصلاحات' : 'Repairs' },
    { value: 'daily_sessions', label: language === 'ar' ? 'الحصص اليومية' : 'Daily Sessions' },
    { value: 'notifications', label: language === 'ar' ? 'الإشعارات' : 'Notifications' },
  ];

  const handleSelectiveDelete = async () => {
    if (selectedDataTypes.length === 0) { toast.error(language === 'ar' ? 'اختر نوع بيانات واحد على الأقل' : 'Select at least one data type'); return; }
    if (selectiveDeleteCode !== 'DELETE-SELECTED') { toast.error(language === 'ar' ? 'رمز التأكيد غير صحيح' : 'Invalid confirmation code'); return; }
    setDeleting(true);
    try {
      
      await apiClient.post(`/system/selective-delete`, { data_types: selectedDataTypes, confirm_code: selectiveDeleteCode });
      toast.success(language === 'ar' ? 'تم حذف البيانات المحددة' : 'Selected data deleted');
      setShowSelectiveDeleteDialog(false); setSelectedDataTypes([]); setSelectiveDeleteCode('');
    } catch (error) { toast.error(error.response?.data?.detail || t.error); }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-6">
      {/* System Stats */}
      {systemStats && (
        <Card>
          <CardHeader><CardTitle>{language === 'ar' ? 'إحصائيات النظام' : 'System Statistics'}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { val: systemStats.products, label: language === 'ar' ? 'منتج' : 'Products' },
                { val: systemStats.customers, label: language === 'ar' ? 'زبون' : 'Customers' },
                { val: systemStats.sales, label: language === 'ar' ? 'مبيعات' : 'Sales' },
                { val: systemStats.users, label: language === 'ar' ? 'مستخدم' : 'Users' },
              ].map(s => (
                <div key={s.label} className="p-4 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">{s.val}</p>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />{language === 'ar' ? 'إعدادات عامة' : 'Paramètres généraux'}</CardTitle>
          <CardDescription>{language === 'ar' ? 'تخصيص إعدادات النظام والتنبيهات' : 'Personnaliser les paramètres du système et les alertes'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 border rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors">
            <a href="/settings/sidebar" className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10"><GripVertical className="h-5 w-5 text-primary" /></div>
                <div>
                  <p className="font-medium">{language === 'ar' ? 'ترتيب القائمة الجانبية' : 'Organiser le menu latéral'}</p>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'اسحب وأفلت لتغيير ترتيب العناصر' : 'Glisser-déposer pour réorganiser'}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{language === 'ar' ? 'حد تنبيه العجز/الفائض' : "Seuil d'alerte écart caisse"}</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={systemSettings.cash_difference_threshold} onChange={(e) => setSystemSettings(prev => ({ ...prev, cash_difference_threshold: parseFloat(e.target.value) || 0 }))} className="w-32" />
                <span className="text-muted-foreground">{systemSettings.currency_symbol}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" />{language === 'ar' ? 'حد المخزون المنخفض' : 'Seuil de stock bas'}</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={systemSettings.low_stock_threshold} onChange={(e) => setSystemSettings(prev => ({ ...prev, low_stock_threshold: parseInt(e.target.value) || 0 }))} className="w-32" />
                <span className="text-muted-foreground">{language === 'ar' ? 'وحدة' : 'unités'}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'اسم المتجر' : 'Nom du magasin'}</Label>
              <Input value={systemSettings.business_name} onChange={(e) => setSystemSettings(prev => ({ ...prev, business_name: e.target.value }))} placeholder="NT" />
            </div>
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'رمز العملة' : 'Symbole de devise'}</Label>
              <Input value={systemSettings.currency_symbol} onChange={(e) => setSystemSettings(prev => ({ ...prev, currency_symbol: e.target.value }))} placeholder="دج" className="w-24" />
            </div>
          </div>
          <Button onClick={saveSystemSettings} disabled={savingSystemSettings} className="gap-2" data-testid="save-system-settings-btn">
            {savingSystemSettings ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {language === 'ar' ? 'حفظ الإعدادات' : 'Enregistrer'}
          </Button>
        </CardContent>
      </Card>

      {/* Login Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" />{language === 'ar' ? 'تخصيص صفحة الدخول' : 'Personnalisation de la page de connexion'}</CardTitle>
          <CardDescription>{language === 'ar' ? 'تغيير الشعار والاسم والصورة في صفحة تسجيل الدخول' : "Modifier le logo, le nom et l'image sur la page de connexion"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2"><Label>{language === 'ar' ? 'اسم النظام/المتجر' : 'Nom du système/magasin'}</Label><Input value={brandingSettings.business_name} onChange={(e) => setBrandingSettings(prev => ({ ...prev, business_name: e.target.value }))} placeholder="NT" /></div>
            <div className="space-y-2"><Label>{language === 'ar' ? 'رابط الشعار (Logo URL)' : 'URL du logo'}</Label><Input value={brandingSettings.logo_url} onChange={(e) => setBrandingSettings(prev => ({ ...prev, logo_url: e.target.value }))} placeholder="https://example.com/logo.png" dir="ltr" /></div>
          </div>
          <div className="space-y-2"><Label>{language === 'ar' ? 'رابط صورة الخلفية' : "URL de l'image de fond"}</Label><Input value={brandingSettings.background_image_url} onChange={(e) => setBrandingSettings(prev => ({ ...prev, background_image_url: e.target.value }))} placeholder="https://example.com/background.jpg" dir="ltr" /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2"><Label>{language === 'ar' ? 'الشعار النصي (عربي)' : 'Slogan (arabe)'}</Label><Input value={brandingSettings.tagline_ar} onChange={(e) => setBrandingSettings(prev => ({ ...prev, tagline_ar: e.target.value }))} /></div>
            <div className="space-y-2"><Label>{language === 'ar' ? 'الشعار النصي (فرنسي)' : 'Slogan (français)'}</Label><Input value={brandingSettings.tagline_fr} onChange={(e) => setBrandingSettings(prev => ({ ...prev, tagline_fr: e.target.value }))} dir="ltr" /></div>
          </div>
          <Button onClick={saveBrandingSettings} disabled={savingBranding} className="gap-2" data-testid="save-branding-btn">
            {savingBranding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {language === 'ar' ? 'حفظ إعدادات صفحة الدخول' : 'Enregistrer'}
          </Button>
        </CardContent>
      </Card>

      {/* Factory Reset */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-5 w-5" />{t.factoryReset}</CardTitle>
          <CardDescription>{language === 'ar' ? 'احذر! سيتم حذف جميع البيانات نهائياً ولا يمكن استرجاعها' : 'Warning! All data will be permanently deleted and cannot be recovered'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => setShowResetDialog(true)} className="gap-2" data-testid="factory-reset-btn"><RefreshCw className="h-4 w-4" />{t.factoryReset}</Button>
            <Button variant="outline" className="gap-2 border-amber-500 text-amber-600 hover:bg-amber-50" onClick={() => setShowSelectiveDeleteDialog(true)} data-testid="selective-delete-btn"><Trash2 className="h-4 w-4" />{language === 'ar' ? 'حذف انتقائي' : 'Suppression sélective'}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Backup & Restore */}
      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-600"><Database className="h-5 w-5" />{language === 'ar' ? 'النسخ الاحتياطي واستعادة البيانات' : 'Backup & Restore'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={handleDownloadBackup} disabled={backupLoading} data-testid="download-backup-btn">
              {backupLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {language === 'ar' ? 'تحميل نسخة احتياطية' : 'Download Backup'}
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleSaveBackupToServer} disabled={backupLoading}>
              {backupLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
              {language === 'ar' ? 'حفظ على السيرفر' : 'Save to Server'}
            </Button>
            <label className="cursor-pointer">
              <input type="file" accept=".json" className="hidden" onChange={handleRestoreBackup} disabled={backupLoading} />
              <Button variant="outline" className="gap-2 pointer-events-none" disabled={backupLoading}><Upload className="h-4 w-4" />{language === 'ar' ? 'استعادة من ملف' : 'Restore from File'}</Button>
            </label>
          </div>
          {backupList.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <h4 className="font-medium mb-2">{language === 'ar' ? 'النسخ الاحتياطية المحفوظة' : 'Saved Backups'}</h4>
              <div className="space-y-2 max-h-40 overflow-auto">
                {backupList.map((backup) => (
                  <div key={backup.id} className="flex items-center justify-between p-2 bg-muted rounded-lg text-sm">
                    <span>{backup.filename}</span>
                    <span className="text-muted-foreground">{new Date(backup.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Factory Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle className="h-5 w-5" />{t.factoryReset}</DialogTitle>
            <DialogDescription>{t.factoryResetConfirm}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200">
              <p className="font-medium text-red-700 dark:text-red-400 mb-2">{t.dataWillBeDeleted}</p>
              <ul className="text-sm text-red-600 dark:text-red-300 space-y-1 list-disc list-inside">
                <li>{language === 'ar' ? 'جميع المنتجات' : 'All products'}</li>
                <li>{language === 'ar' ? 'جميع الزبائن والموردين' : 'All customers and suppliers'}</li>
                <li>{language === 'ar' ? 'جميع المبيعات والمشتريات' : 'All sales and purchases'}</li>
                <li>{language === 'ar' ? 'جميع الموظفين' : 'All employees'}</li>
                <li>{language === 'ar' ? 'سيتم الاحتفاظ بحساب المدير فقط' : 'Only admin account will be kept'}</li>
              </ul>
            </div>
            <div>
              <Label>{t.factoryResetCode}</Label>
              <Input value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="RESET-ALL-DATA" className="font-mono" />
              <p className="text-xs text-muted-foreground mt-1">{language === 'ar' ? 'اكتب' : 'Type'}: <code className="bg-muted px-1 rounded">RESET-ALL-DATA</code></p>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowResetDialog(false)} className="flex-1">{t.cancel}</Button>
              <Button variant="destructive" onClick={handleFactoryReset} disabled={resetting || resetCode !== 'RESET-ALL-DATA'} className="flex-1 gap-2"><Trash2 className="h-4 w-4" />{resetting ? t.loading : t.factoryReset}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Selective Delete Dialog */}
      <Dialog open={showSelectiveDeleteDialog} onOpenChange={setShowSelectiveDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600"><Trash2 className="h-5 w-5" />{language === 'ar' ? 'حذف انتقائي للبيانات' : 'Selective Data Deletion'}</DialogTitle>
            <DialogDescription>{language === 'ar' ? 'اختر أنواع البيانات التي تريد حذفها' : 'Select the data types you want to delete'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto p-1">
              {dataTypeOptions.map((option) => (
                <label key={option.value} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${selectedDataTypes.includes(option.value) ? 'bg-amber-50 border-amber-500 dark:bg-amber-900/20' : 'hover:bg-muted'}`}>
                  <Checkbox checked={selectedDataTypes.includes(option.value)} onCheckedChange={(checked) => {
                    if (checked) setSelectedDataTypes(prev => [...prev, option.value]);
                    else setSelectedDataTypes(prev => prev.filter(v => v !== option.value));
                  }} />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
            <div>
              <Label>{language === 'ar' ? 'رمز التأكيد' : 'Confirmation Code'}</Label>
              <Input value={selectiveDeleteCode} onChange={(e) => setSelectiveDeleteCode(e.target.value)} placeholder="DELETE-SELECTED" className="font-mono" />
              <p className="text-xs text-muted-foreground mt-1">{language === 'ar' ? 'اكتب' : 'Type'}: <code className="bg-muted px-1 rounded">DELETE-SELECTED</code></p>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => { setShowSelectiveDeleteDialog(false); setSelectedDataTypes([]); setSelectiveDeleteCode(''); }} className="flex-1">{t.cancel}</Button>
              <Button variant="destructive" onClick={handleSelectiveDelete} disabled={deleting || selectedDataTypes.length === 0 || selectiveDeleteCode !== 'DELETE-SELECTED'} className="flex-1 gap-2"><Trash2 className="h-4 w-4" />{deleting ? t.loading : (language === 'ar' ? 'حذف المحدد' : 'Delete Selected')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
