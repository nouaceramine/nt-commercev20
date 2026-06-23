/**
 * InventoryDialogs - Extracted dialogs from InventoryCountPage
 * Includes: Start Session, Finish Session, Excel Import
 */
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../../components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import {
  ClipboardList, Check, X, CheckCircle2, Play, Save,
  Upload, Download, FileUp, RotateCcw, TableIcon,
} from 'lucide-react';

export default function InventoryDialogs({
  // Start Dialog
  showStartDialog, setShowStartDialog, sessionName, setSessionName,
  selectedFamily, setSelectedFamily, families, inventoryCode,
  startNewSession,
  // Finish Dialog
  showFinishDialog, setShowFinishDialog, countedProducts,
  differences, finishSession,
  // Import Dialog
  showImportDialog, setShowImportDialog, resetImport,
  importStep, setImportStep, importFileName, importData,
  importMapping, setImportMapping, excelColumns,
  fileInputRef, handleFileUpload, downloadTemplate,
  generateImportPreview, importPreview, applyImportData,
  // Common
  language,
}) {
  return (
    <>
      {/* Start Session Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {language === 'ar' ? 'بدء جرد جديد' : 'Démarrer un inventaire'}
              {inventoryCode && (
                <span className="font-mono text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded ms-2">{inventoryCode}</span>
              )}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar' ? 'أدخل اسم الجرد واختر العائلة (اختياري)' : 'Entrez un nom et sélectionnez une famille (optionnel)'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>{language === 'ar' ? 'اسم الجرد' : 'Nom de l\'inventaire'}</Label>
              <Input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder={language === 'ar' ? 'مثال: جرد شهر فبراير' : 'Ex: Inventaire février'}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{language === 'ar' ? 'تصفية حسب العائلة' : 'Filtrer par famille'}</Label>
              <Select value={selectedFamily} onValueChange={setSelectedFamily}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'جميع المنتجات' : 'Tous les produits'}</SelectItem>
                  {families.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {language === 'ar' ? f.name_ar : f.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={startNewSession} className="w-full gap-2" size="lg">
              <Play className="h-5 w-5" />
              {language === 'ar' ? 'بدء الجرد' : 'Démarrer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Finish Session Dialog */}
      <Dialog open={showFinishDialog} onOpenChange={setShowFinishDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              {language === 'ar' ? 'إنهاء الجرد' : 'Terminer l\'inventaire'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg text-center">
                <p className="text-3xl font-bold text-blue-600">{countedProducts}</p>
                <p className="text-sm text-blue-600">{language === 'ar' ? 'منتج تم جرده' : 'Produits comptés'}</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg text-center">
                <p className="text-3xl font-bold text-amber-600">{differences.length}</p>
                <p className="text-sm text-amber-600">{language === 'ar' ? 'فروقات' : 'Différences'}</p>
              </div>
            </div>
            {differences.length > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700">
                  {language === 'ar'
                    ? 'يوجد فروقات في الكميات. هل تريد تحديث المخزون؟'
                    : 'Il y a des différences. Voulez-vous mettre à jour le stock?'}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => finishSession(false)} className="flex-1">
                <Save className="h-4 w-4 me-2" />
                {language === 'ar' ? 'حفظ فقط' : 'Enregistrer'}
              </Button>
              <Button onClick={() => finishSession(true)} className="flex-1 bg-green-600 hover:bg-green-700">
                <Check className="h-4 w-4 me-2" />
                {language === 'ar' ? 'تحديث المخزون' : 'Mettre à jour'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Excel Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(open) => { if (!open) resetImport(); setShowImportDialog(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-green-600" />
              {language === 'ar' ? 'استيراد الجرد من Excel' : 'Importer l\'inventaire depuis Excel'}
            </DialogTitle>
            <DialogDescription>
              {importStep === 1 && (language === 'ar' ? 'الخطوة 1: تحميل الملف' : 'Étape 1: Charger le fichier')}
              {importStep === 2 && (language === 'ar' ? 'الخطوة 2: تحديد الأعمدة' : 'Étape 2: Mapper les colonnes')}
              {importStep === 3 && (language === 'ar' ? 'الخطوة 3: معاينة وتطبيق' : 'Étape 3: Aperçu et appliquer')}
            </DialogDescription>
          </DialogHeader>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 py-4">
            {[1, 2, 3].map(step => (
              <div key={step} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${
                  importStep >= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {step === 1 && <FileUp className="h-5 w-5" />}
                  {step === 2 && <TableIcon className="h-5 w-5" />}
                  {step === 3 && <Check className="h-5 w-5" />}
                </div>
                {step < 3 && <div className={`w-16 h-1 mx-2 ${importStep > step ? 'bg-primary' : 'bg-muted'}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Upload */}
          {importStep === 1 && (
            <div className="space-y-6">
              <div
                className="border-2 border-dashed border-primary/30 rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-16 w-16 mx-auto mb-4 text-primary/50" />
                <p className="text-lg font-medium mb-2">{language === 'ar' ? 'انقر لتحميل ملف Excel' : 'Cliquez pour charger un fichier Excel'}</p>
                <p className="text-sm text-muted-foreground">{language === 'ar' ? 'أو اسحب الملف هنا (xlsx, xls)' : 'Ou glissez le fichier ici (xlsx, xls)'}</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
              </div>
              <div className="flex justify-center">
                <Button variant="outline" onClick={downloadTemplate} className="gap-2"><Download className="h-4 w-4" />{language === 'ar' ? 'تحميل قالب Excel' : 'Télécharger le modèle'}</Button>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2">{language === 'ar' ? 'تنسيق الملف المطلوب:' : 'Format de fichier requis:'}</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• {language === 'ar' ? 'عمود الباركود (إجباري)' : 'Colonne code-barres (obligatoire)'}</li>
                  <li>• {language === 'ar' ? 'عمود الكمية (إجباري)' : 'Colonne quantité (obligatoire)'}</li>
                  <li>• {language === 'ar' ? 'عمود الاسم (اختياري)' : 'Colonne nom (optionnel)'}</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 2: Mapping */}
          {importStep === 2 && (
            <div className="space-y-6">
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-medium">{importFileName}</p>
                <p className="text-sm text-muted-foreground">{importData.length} {language === 'ar' ? 'صف' : 'lignes'}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-red-600">* {language === 'ar' ? 'عمود الباركود' : 'Colonne code-barres'}</Label>
                  <Select value={importMapping.barcode} onValueChange={(v) => setImportMapping(m => ({ ...m, barcode: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder={language === 'ar' ? 'اختر العمود' : 'Sélectionner'} /></SelectTrigger>
                    <SelectContent>{excelColumns.map(col => (<SelectItem key={col.index} value={col.index.toString()}>{col.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-red-600">* {language === 'ar' ? 'عمود الكمية' : 'Colonne quantité'}</Label>
                  <Select value={importMapping.quantity} onValueChange={(v) => setImportMapping(m => ({ ...m, quantity: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder={language === 'ar' ? 'اختر العمود' : 'Sélectionner'} /></SelectTrigger>
                    <SelectContent>{excelColumns.map(col => (<SelectItem key={col.index} value={col.index.toString()}>{col.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{language === 'ar' ? 'عمود الاسم (اختياري)' : 'Colonne nom (optionnel)'}</Label>
                  <Select value={importMapping.name} onValueChange={(v) => setImportMapping(m => ({ ...m, name: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder={language === 'ar' ? 'اختر العمود' : 'Sélectionner'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{language === 'ar' ? 'بدون' : 'Aucun'}</SelectItem>
                      {excelColumns.map(col => (<SelectItem key={col.index} value={col.index.toString()}>{col.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="mb-2 block">{language === 'ar' ? 'معاينة البيانات (أول 5 صفوف)' : 'Aperçu des données (5 premières lignes)'}</Label>
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader><TableRow>{excelColumns.map(col => (<TableHead key={col.index} className={importMapping.barcode === col.index.toString() ? 'bg-blue-100' : importMapping.quantity === col.index.toString() ? 'bg-green-100' : importMapping.name === col.index.toString() ? 'bg-amber-100' : ''}>{col.name}</TableHead>))}</TableRow></TableHeader>
                    <TableBody>{importData.slice(0, 5).map((row, idx) => (<TableRow key={idx}>{excelColumns.map(col => (<TableCell key={col.index} className={importMapping.barcode === col.index.toString() ? 'bg-blue-50' : importMapping.quantity === col.index.toString() ? 'bg-green-50' : importMapping.name === col.index.toString() ? 'bg-amber-50' : ''}>{row[col.index] ?? ''}</TableCell>))}</TableRow>))}</TableBody>
                  </Table>
                </div>
              </div>
              <div className="flex gap-2 justify-between">
                <Button variant="outline" onClick={resetImport}><RotateCcw className="h-4 w-4 me-2" />{language === 'ar' ? 'إعادة' : 'Recommencer'}</Button>
                <Button onClick={generateImportPreview} disabled={!importMapping.barcode || !importMapping.quantity}>{language === 'ar' ? 'معاينة التغييرات' : 'Aperçu des changements'}</Button>
              </div>
            </div>
          )}

          {/* Step 3: Preview & Apply */}
          {importStep === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 rounded-lg text-center"><p className="text-2xl font-bold text-green-600">{importPreview.filter(p => p.status === 'matched').length}</p><p className="text-sm text-green-600">{language === 'ar' ? 'متطابق' : 'Trouvés'}</p></div>
                <div className="p-4 bg-red-50 rounded-lg text-center"><p className="text-2xl font-bold text-red-600">{importPreview.filter(p => p.status === 'not_found').length}</p><p className="text-sm text-red-600">{language === 'ar' ? 'غير موجود' : 'Non trouvés'}</p></div>
                <div className="p-4 bg-amber-50 rounded-lg text-center"><p className="text-2xl font-bold text-amber-600">{importPreview.filter(p => p.status === 'matched' && p.diff !== 0).length}</p><p className="text-sm text-amber-600">{language === 'ar' ? 'فروقات' : 'Différences'}</p></div>
              </div>
              <div className="max-h-80 overflow-y-auto border rounded-lg">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الباركود' : 'Code-barres'}</TableHead>
                      <TableHead>{language === 'ar' ? 'المنتج' : 'Produit'}</TableHead>
                      <TableHead className="text-center">{language === 'ar' ? 'الحالي' : 'Actuel'}</TableHead>
                      <TableHead className="text-center">{language === 'ar' ? 'الجديد' : 'Nouveau'}</TableHead>
                      <TableHead className="text-center">{language === 'ar' ? 'الفرق' : 'Diff'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.map((item, idx) => (
                      <TableRow key={idx} className={item.status === 'not_found' ? 'bg-red-50' : item.diff !== 0 ? 'bg-amber-50' : ''}>
                        <TableCell>
                          {item.status === 'matched' ? (
                            <Badge className="bg-green-100 text-green-700"><Check className="h-3 w-3 me-1" />{language === 'ar' ? 'متطابق' : 'OK'}</Badge>
                          ) : (
                            <Badge variant="destructive"><X className="h-3 w-3 me-1" />{language === 'ar' ? 'غير موجود' : 'Non trouvé'}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">{item.barcode}</TableCell>
                        <TableCell>{item.productName || item.excelName || '-'}</TableCell>
                        <TableCell className="text-center">{item.currentQty ?? '-'}</TableCell>
                        <TableCell className="text-center font-bold">{item.newQty}</TableCell>
                        <TableCell className="text-center">
                          {item.diff !== null && (
                            <Badge className={item.diff === 0 ? 'bg-green-100 text-green-700' : item.diff > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}>
                              {item.diff === 0 ? '=' : item.diff > 0 ? `+${item.diff}` : item.diff}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex gap-2 justify-between">
                <Button variant="outline" onClick={() => setImportStep(2)}>{language === 'ar' ? 'رجوع' : 'Retour'}</Button>
                <Button onClick={applyImportData} className="bg-green-600 hover:bg-green-700" disabled={importPreview.filter(p => p.status === 'matched').length === 0}>
                  <Check className="h-4 w-4 me-2" />{language === 'ar' ? 'تطبيق البيانات' : 'Appliquer les données'} ({importPreview.filter(p => p.status === 'matched').length})
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
