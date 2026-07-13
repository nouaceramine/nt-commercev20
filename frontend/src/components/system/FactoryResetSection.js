/**
 * FactoryResetSection - Factory reset and selective delete with dialogs
 * Extracted from SystemTab.js (Refactoring: Extract Component)
 */
import { AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../../components/ui/dialog';

const DATA_TYPE_OPTIONS = [
  { value: 'sales', ar: 'المبيعات', fr: 'Sales' },
  { value: 'purchases', ar: 'المشتريات', fr: 'Purchases' },
  { value: 'customers', ar: 'الزبائن', fr: 'Customers' },
  { value: 'suppliers', ar: 'الموردين', fr: 'Suppliers' },
  { value: 'products', ar: 'المنتجات', fr: 'Products' },
  { value: 'employees', ar: 'الموظفين', fr: 'Employees' },
  { value: 'debts', ar: 'الديون', fr: 'Debts' },
  { value: 'expenses', ar: 'المصاريف', fr: 'Expenses' },
  { value: 'repairs', ar: 'الإصلاحات', fr: 'Repairs' },
  { value: 'daily_sessions', ar: 'الحصص اليومية', fr: 'Daily Sessions' },
  { value: 'notifications', ar: 'الإشعارات', fr: 'Notifications' },
];

export default function FactoryResetSection({
  language, t,
  showResetDialog, setShowResetDialog,
  resetCode, setResetCode,
  resetting, onFactoryReset,
  showSelectiveDialog, setShowSelectiveDialog,
  selectedDataTypes, setSelectedDataTypes,
  selectiveCode, setSelectiveCode,
  deleting, onSelectiveDelete,
}) {
  const ar = language === 'ar';

  return (
    <>
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            {t.factoryReset}
          </CardTitle>
          <CardDescription>
            {ar ? 'احذر! سيتم حذف جميع البيانات نهائياً ولا يمكن استرجاعها' : 'Warning! All data will be permanently deleted and cannot be recovered'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => setShowResetDialog(true)} className="gap-2" data-testid="factory-reset-btn">
              <RefreshCw className="h-4 w-4" />{t.factoryReset}
            </Button>
            <Button variant="outline" className="gap-2 border-amber-500 text-amber-600 hover:bg-amber-50"
              onClick={() => setShowSelectiveDialog(true)} data-testid="selective-delete-btn">
              <Trash2 className="h-4 w-4" />{ar ? 'حذف انتقائي' : 'Suppression sélective'}
            </Button>
          </div>
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
                <li>{ar ? 'جميع المنتجات' : 'All products'}</li>
                <li>{ar ? 'جميع الزبائن والموردين' : 'All customers and suppliers'}</li>
                <li>{ar ? 'جميع المبيعات والمشتريات' : 'All sales and purchases'}</li>
                <li>{ar ? 'جميع الموظفين' : 'All employees'}</li>
                <li>{ar ? 'سيتم الاحتفاظ بحساب المدير فقط' : 'Only admin account will be kept'}</li>
              </ul>
            </div>
            <div>
              <Label>{t.factoryResetCode}</Label>
              <Input value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="RESET-ALL-DATA" className="font-mono" />
              <p className="text-xs text-muted-foreground mt-1">{ar ? 'اكتب' : 'Type'}: <code className="bg-muted px-1 rounded">RESET-ALL-DATA</code></p>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowResetDialog(false)} className="flex-1">{t.cancel}</Button>
              <Button variant="destructive" onClick={onFactoryReset} disabled={resetting || resetCode !== 'RESET-ALL-DATA'} className="flex-1 gap-2">
                <Trash2 className="h-4 w-4" />{resetting ? t.loading : t.factoryReset}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Selective Delete Dialog */}
      <Dialog open={showSelectiveDialog} onOpenChange={setShowSelectiveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Trash2 className="h-5 w-5" />{ar ? 'حذف انتقائي للبيانات' : 'Selective Data Deletion'}
            </DialogTitle>
            <DialogDescription>{ar ? 'اختر أنواع البيانات التي تريد حذفها' : 'Select the data types you want to delete'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto p-1">
              {DATA_TYPE_OPTIONS.map(opt => (
                <label key={opt.value} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${selectedDataTypes.includes(opt.value) ? 'bg-amber-50 border-amber-500 dark:bg-amber-900/20' : 'hover:bg-muted'}`}>
                  <Checkbox checked={selectedDataTypes.includes(opt.value)} onCheckedChange={(checked) => {
                    setSelectedDataTypes(prev => checked ? [...prev, opt.value] : prev.filter(v => v !== opt.value));
                  }} />
                  <span className="text-sm">{ar ? opt.ar : opt.fr}</span>
                </label>
              ))}
            </div>
            <div>
              <Label>{ar ? 'رمز التأكيد' : 'Confirmation Code'}</Label>
              <Input value={selectiveCode} onChange={(e) => setSelectiveCode(e.target.value)} placeholder="DELETE-SELECTED" className="font-mono" />
              <p className="text-xs text-muted-foreground mt-1">{ar ? 'اكتب' : 'Type'}: <code className="bg-muted px-1 rounded">DELETE-SELECTED</code></p>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => { setShowSelectiveDialog(false); setSelectedDataTypes([]); setSelectiveCode(''); }} className="flex-1">{t.cancel}</Button>
              <Button variant="destructive" onClick={onSelectiveDelete} disabled={deleting || selectedDataTypes.length === 0 || selectiveCode !== 'DELETE-SELECTED'} className="flex-1 gap-2">
                <Trash2 className="h-4 w-4" />{deleting ? t.loading : (ar ? 'حذف المحدد' : 'Delete Selected')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
