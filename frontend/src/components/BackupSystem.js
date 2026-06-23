import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { 
  Download, Upload, Database, FileJson, FileSpreadsheet,
  CheckCircle, AlertCircle, Clock, HardDrive, RefreshCw, Settings
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { toast } from 'sonner';

export function BackupSystem() {
  const { language } = useLanguage();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [lastBackup, setLastBackup] = useState(() => {
    return localStorage.getItem('lastBackupDate') || null;
  });
  
  // Auto-backup settings
  const [autoBackupSettings, setAutoBackupSettings] = useState({
    enabled: false,
    frequency: 'daily',
    time: '02:00',
    keep_count: 10
  });
  
  useEffect(() => {
    fetchAutoBackupSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  const fetchAutoBackupSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/backup/auto-settings`);
      setAutoBackupSettings(response.data);
    } catch (error) {
      console.error('Error fetching auto-backup settings:', error);
    }
  };
  
  const saveAutoBackupSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/backup/auto-settings`, autoBackupSettings);
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات' : 'Paramètres enregistrés');
      setShowSettingsDialog(false);
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل حفظ الإعدادات' : 'Échec de l\'enregistrement');
    }
  };
  
  const runAutoBackup = async () => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/backup/run-auto`, {});
      toast.success(language === 'ar' ? 'تم إنشاء نسخة احتياطية' : 'Sauvegarde créée');
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل النسخ الاحتياطي' : 'Échec de la sauvegarde');
    }
  };

  const exportData = async (format = 'json') => {
    setExporting(true);
    setProgress(0);
    
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Fetch all data
      setProgress(10);
      const [products, customers, suppliers, sales, purchases, expenses] = await Promise.all([
        apiClient.get(`/products`, { headers }).catch(() => ({ data: [] })),
        apiClient.get(`/customers`, { headers }).catch(() => ({ data: [] })),
        apiClient.get(`/suppliers`, { headers }).catch(() => ({ data: [] })),
        apiClient.get(`/sales`, { headers }).catch(() => ({ data: [] })),
        apiClient.get(`/purchases`, { headers }).catch(() => ({ data: [] })),
        apiClient.get(`/expenses`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      setProgress(50);

      const backupData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: {
          products: products.data,
          customers: customers.data,
          suppliers: suppliers.data,
          sales: sales.data,
          purchases: purchases.data,
          expenses: expenses.data
        },
        stats: {
          productsCount: products.data.length,
          customersCount: customers.data.length,
          suppliersCount: suppliers.data.length,
          salesCount: sales.data.length,
          purchasesCount: purchases.data.length,
          expensesCount: expenses.data.length
        }
      };

      setProgress(75);

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (format === 'excel') {
        // Export as multiple CSV files in a single download
        let csvContent = '';
        
        // Products CSV
        csvContent += 'PRODUCTS\n';
        csvContent += 'ID,Name,Code,Price,Stock\n';
        products.data.forEach(p => {
          csvContent += `${p.id},"${p.name_ar || p.name_en}",${p.article_code || ''},${p.retail_price || 0},${p.quantity || 0}\n`;
        });
        
        csvContent += '\nCUSTOMERS\n';
        csvContent += 'ID,Name,Phone,Balance\n';
        customers.data.forEach(c => {
          csvContent += `${c.id},"${c.name}",${c.phone || ''},${c.balance || 0}\n`;
        });

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }

      setProgress(100);
      const now = new Date().toISOString();
      localStorage.setItem('lastBackupDate', now);
      setLastBackup(now);
      toast.success(language === 'ar' ? 'تم تصدير البيانات بنجاح' : 'Données exportées avec succès');
    } catch (error) {
      console.error('Export error:', error);
      toast.error(language === 'ar' ? 'فشل التصدير' : 'Échec de l\'export');
    } finally {
      setExporting(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/json') {
        toast.error(language === 'ar' ? 'يرجى اختيار ملف JSON' : 'Veuillez sélectionner un fichier JSON');
        return;
      }
      setImportFile(file);
      setShowImportDialog(true);
    }
  };

  const importData = async () => {
    if (!importFile) return;

    setImporting(true);
    setProgress(0);

    try {
      const text = await importFile.text();
      const data = JSON.parse(text);

      if (!data.version || !data.data) {
        throw new Error('Invalid backup file format');
      }

      setProgress(25);

      // Import products
      if (data.data.products?.length > 0) {
        for (const product of data.data.products) {
          try {
            await apiClient.post(`/products`, {
              name_ar: product.name_ar,
              name_en: product.name_en,
              purchase_price: product.purchase_price,
              retail_price: product.retail_price,
              quantity: product.quantity,
              barcode: product.barcode
            });
          } catch (e) {
          }
        }
      }

      setProgress(50);

      // Import customers
      if (data.data.customers?.length > 0) {
        for (const customer of data.data.customers) {
          try {
            await apiClient.post(`/customers`, {
              name: customer.name,
              phone: customer.phone,
              email: customer.email
            });
          } catch (e) {
          }
        }
      }

      setProgress(75);

      // Import suppliers
      if (data.data.suppliers?.length > 0) {
        for (const supplier of data.data.suppliers) {
          try {
            await apiClient.post(`/suppliers`, {
              name: supplier.name,
              phone: supplier.phone,
              email: supplier.email
            });
          } catch (e) {
          }
        }
      }

      setProgress(100);
      toast.success(language === 'ar' ? 'تم استيراد البيانات بنجاح' : 'Données importées avec succès');
      setShowImportDialog(false);
      setImportFile(null);
    } catch (error) {
      console.error('Import error:', error);
      toast.error(language === 'ar' ? 'فشل الاستيراد - تأكد من صيغة الملف' : 'Échec de l\'import - vérifiez le format');
    } finally {
      setImporting(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            {language === 'ar' ? 'النسخ الاحتياطي' : 'Sauvegarde'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Last Backup Info */}
          <div className="p-3 rounded-lg bg-muted flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {language === 'ar' ? 'آخر نسخة:' : 'Dernière sauvegarde:'} {formatDate(lastBackup)}
              </span>
            </div>
            {lastBackup && <CheckCircle className="h-4 w-4 text-green-500" />}
          </div>

          {/* Progress Bar */}
          {(exporting || importing) && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {exporting ? (language === 'ar' ? 'جاري التصدير...' : 'Export en cours...') : (language === 'ar' ? 'جاري الاستيراد...' : 'Import en cours...')} {progress}%
              </p>
            </div>
          )}

          {/* Export Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button 
              onClick={() => exportData('json')} 
              disabled={exporting || importing}
              className="gap-2"
            >
              <FileJson className="h-4 w-4" />
              {language === 'ar' ? 'تصدير JSON' : 'Export JSON'}
            </Button>
            <Button 
              onClick={() => exportData('excel')} 
              disabled={exporting || importing}
              variant="outline"
              className="gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {language === 'ar' ? 'تصدير CSV' : 'Export CSV'}
            </Button>
          </div>

          {/* Import Button */}
          <div className="relative">
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={exporting || importing}
            />
            <Button 
              variant="secondary" 
              className="w-full gap-2"
              disabled={exporting || importing}
            >
              <Upload className="h-4 w-4" />
              {language === 'ar' ? 'استيراد من ملف JSON' : 'Importer depuis JSON'}
            </Button>
          </div>

          {/* Info */}
          <p className="text-xs text-muted-foreground text-center">
            {language === 'ar' 
              ? 'النسخة الاحتياطية تشمل: المنتجات، العملاء، الموردين، المبيعات، المشتريات، المصاريف'
              : 'La sauvegarde inclut: produits, clients, fournisseurs, ventes, achats, dépenses'}
          </p>
        </CardContent>
      </Card>

      {/* Auto-Backup Settings Card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {language === 'ar' ? 'النسخ الاحتياطي التلقائي' : 'Sauvegarde automatique'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{language === 'ar' ? 'تفعيل النسخ التلقائي' : 'Activer la sauvegarde auto'}</p>
              <p className="text-sm text-muted-foreground">
                {autoBackupSettings.enabled 
                  ? (language === 'ar' ? `كل ${autoBackupSettings.frequency === 'daily' ? 'يوم' : autoBackupSettings.frequency === 'weekly' ? 'أسبوع' : 'شهر'} الساعة ${autoBackupSettings.time}` : `Chaque ${autoBackupSettings.frequency} à ${autoBackupSettings.time}`)
                  : (language === 'ar' ? 'غير مفعل' : 'Désactivé')}
              </p>
            </div>
            <Badge variant={autoBackupSettings.enabled ? "default" : "secondary"}>
              {autoBackupSettings.enabled ? (language === 'ar' ? 'مفعل' : 'Activé') : (language === 'ar' ? 'معطل' : 'Désactivé')}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSettingsDialog(true)} className="flex-1 gap-2">
              <Settings className="h-4 w-4" />
              {language === 'ar' ? 'إعدادات' : 'Paramètres'}
            </Button>
            <Button onClick={runAutoBackup} className="flex-1 gap-2">
              <Database className="h-4 w-4" />
              {language === 'ar' ? 'نسخ الآن' : 'Sauvegarder'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Import Confirmation Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              {language === 'ar' ? 'تأكيد الاستيراد' : 'Confirmer l\'import'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar' 
                ? 'سيتم إضافة البيانات من الملف. البيانات الموجودة لن تُحذف.'
                : 'Les données du fichier seront ajoutées. Les données existantes ne seront pas supprimées.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {importFile && (
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm font-medium">{importFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(importFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowImportDialog(false)} className="flex-1">
                {language === 'ar' ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button onClick={importData} disabled={importing} className="flex-1 gap-2">
                {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {language === 'ar' ? 'استيراد' : 'Importer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auto-Backup Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {language === 'ar' ? 'إعدادات النسخ التلقائي' : 'Paramètres de sauvegarde auto'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            <div className="flex items-center justify-between">
              <Label>{language === 'ar' ? 'تفعيل النسخ التلقائي' : 'Activer la sauvegarde auto'}</Label>
              <Switch
                checked={autoBackupSettings.enabled}
                onCheckedChange={(checked) => setAutoBackupSettings({...autoBackupSettings, enabled: checked})}
              />
            </div>
            
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'التكرار' : 'Fréquence'}</Label>
              <Select 
                value={autoBackupSettings.frequency}
                onValueChange={(v) => setAutoBackupSettings({...autoBackupSettings, frequency: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{language === 'ar' ? 'يومي' : 'Quotidien'}</SelectItem>
                  <SelectItem value="weekly">{language === 'ar' ? 'أسبوعي' : 'Hebdomadaire'}</SelectItem>
                  <SelectItem value="monthly">{language === 'ar' ? 'شهري' : 'Mensuel'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'وقت النسخ' : 'Heure de sauvegarde'}</Label>
              <Select 
                value={autoBackupSettings.time}
                onValueChange={(v) => setAutoBackupSettings({...autoBackupSettings, time: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="00:00">00:00</SelectItem>
                  <SelectItem value="02:00">02:00</SelectItem>
                  <SelectItem value="04:00">04:00</SelectItem>
                  <SelectItem value="06:00">06:00</SelectItem>
                  <SelectItem value="12:00">12:00</SelectItem>
                  <SelectItem value="18:00">18:00</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'عدد النسخ المحفوظة' : 'Nombre de sauvegardes à conserver'}</Label>
              <Select 
                value={autoBackupSettings.keep_count.toString()}
                onValueChange={(v) => setAutoBackupSettings({...autoBackupSettings, keep_count: parseInt(v)})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button onClick={saveAutoBackupSettings} className="w-full gap-2">
              <CheckCircle className="h-4 w-4" />
              {language === 'ar' ? 'حفظ الإعدادات' : 'Enregistrer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default BackupSystem;
