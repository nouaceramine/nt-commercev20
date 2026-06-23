import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import apiClient from '../../lib/apiClient';
import SaleDetailDialog from '../../components/sales/SaleDetailDialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { toast } from 'sonner';
import {
  Search, Plus, UserPlus, Printer, FileText, Play, StopCircle, Banknote, BarChart3, CreditCard, TrendingUp,
  PackagePlus, X, FolderTree,
} from 'lucide-react';


export default function POSDialogs({
  // Products Dialog
  showProductsDialog, setShowProductsDialog,
  searchQuery, setSearchQuery,
  selectedFamily, setSelectedFamily,
  families, filteredProducts, addToCart,
  language, formatCurrency, priceType,
  // Customers Dialog
  showCustomersDialog, setShowCustomersDialog,
  customers, setSelectedCustomer,
  setShowNewCustomerDialog,
  // Note Dialog
  showNoteDialog, setShowNoteDialog,
  saleNote, setSaleNote,
  // Cash Dialog
  showCashDialog, setShowCashDialog,
  cashOperation, setCashOperation,
  handleCashOperation,
  // History Dialog
  showHistoryDialog, setShowHistoryDialog,
  salesHistory, historyLoading,
  // Shortcut Dialog
  showShortcutDialog, setShowShortcutDialog,
  shortcutProductId, setShortcutProductId,
  shortcutColor, setShortcutColor,
  products, SHORTCUT_COLORS,
  editingShortcutIndex, productShortcuts,
  saveShortcuts, saveShortcut,
  // New Customer Dialog
  showNewCustomerDialog,
  newCustomerData, setNewCustomerData,
  savingCustomer, setSavingCustomer,
  fetchCustomers,
  // Print Dialog
  showPrintDialog, setShowPrintDialog,
  lastSaleId, lastSaleInvoice,
  receiptSettings, printThermalReceipt, onPrintA4,
  // Session Dialogs
  showSessionDialog, setShowSessionDialog,
  openingCash, setOpeningCash,
  cashBoxBalance, handleOpenSession,
  showCloseSessionDialog, setShowCloseSessionDialog,
  currentSession, sessionStats,
  closingCash, setClosingCash,
  closingNotes, setClosingNotes,
  handleCloseSession,
  showSessionDetailsDialog, setShowSessionDetailsDialog,
  t,
  // New tasks
  showCustomProductDialog, setShowCustomProductDialog,
  customProduct, setCustomProduct,
  addCustomProductToCart,
  showPosReportsDialog, setShowPosReportsDialog,
  customerFamilyFilter, customerFamilies = [],
}) {
  const [selectedHistorySaleId, setSelectedHistorySaleId] = useState(null);
  const [showSaleDetail, setShowSaleDetail] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [activeCustFamily, setActiveCustFamily] = useState(null);

  return (
    <>
      {/* Products Dialog */}
      <Dialog open={showProductsDialog} onOpenChange={setShowProductsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{language === 'ar' ? 'اختر منتج' : 'Choisir un produit'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
                <Input placeholder={language === 'ar' ? 'بحث بالاسم أو الباركود...' : 'Rechercher par nom ou code-barres...'} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="ps-9" />
              </div>
              <Select value={selectedFamily} onValueChange={setSelectedFamily}>
                <SelectTrigger className="w-40"><SelectValue placeholder={language === 'ar' ? 'العائلة' : 'Famille'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'الكل' : 'Tous'}</SelectItem>
                  {families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-96 overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ar' ? 'المنتج' : 'Produit'}</TableHead>
                    <TableHead className="w-24 text-center">{language === 'ar' ? 'السعر' : 'Prix'}</TableHead>
                    <TableHead className="w-20 text-center">{language === 'ar' ? 'المخزون' : 'Stock'}</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.slice(0, 50).map(product => (
                    <TableRow key={product.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { addToCart(product); setShowProductsDialog(false); }}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{language === 'ar' ? product.name_ar : product.name_en}</p>
                          <p className="text-xs text-muted-foreground">{product.barcode || product.article_code}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{formatCurrency(priceType === 'wholesale' ? product.wholesale_price : product.retail_price)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={product.quantity > 10 ? 'default' : product.quantity > 0 ? 'secondary' : 'destructive'}>{product.quantity}</Badge>
                      </TableCell>
                      <TableCell><Button size="sm" variant="ghost" className="h-8"><Plus className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customers Dialog */}
      <Dialog open={showCustomersDialog} onOpenChange={(v) => { setShowCustomersDialog(v); if (!v) { setCustomerSearch(''); setActiveCustFamily(null); } }}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {customerFamilyFilter ? <FolderTree className="h-4 w-4 text-primary" /> : null}
              {customerFamilyFilter
                ? (language === 'ar' ? 'زبائن حسب العائلة' : 'Clients par famille')
                : (language === 'ar' ? 'اختر زبون' : 'Choisir un client')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
              <input
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder={language === 'ar' ? 'بحث بالاسم أو الهاتف...' : 'Rechercher par nom ou tél...'}
                className="w-full ps-9 pe-3 py-2 text-sm border rounded-md bg-background outline-none focus:ring-1 focus:ring-primary"
              />
              {customerSearch && (
                <button onClick={() => setCustomerSearch('')} className="absolute top-1/2 -translate-y-1/2 end-2">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            {/* Family filter chips (shown when opened from customer-families task) */}
            {customerFamilyFilter && customerFamilies.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setActiveCustFamily(null)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${activeCustFamily === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}
                >
                  {language === 'ar' ? 'الكل' : 'Tout'}
                </button>
                {customerFamilies.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setActiveCustFamily(activeCustFamily === f.id ? null : f.id)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors max-w-[90px] truncate ${activeCustFamily === f.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}
                    title={f.name}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            )}
            {/* List */}
            <div className="max-h-72 overflow-y-auto border rounded-lg">
              {customers
                .filter(c => {
                  const q = customerSearch.toLowerCase();
                  const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q);
                  const matchFamily = !activeCustFamily || c.family_id === activeCustFamily;
                  return matchSearch && matchFamily;
                })
                .map(customer => (
                  <div key={customer.id} className="p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 flex items-center justify-between gap-2" onClick={() => { setSelectedCustomer(customer.id); setShowCustomersDialog(false); setCustomerSearch(''); setActiveCustFamily(null); }}>
                    <div>
                      <p className="font-medium text-sm">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">{customer.phone}</p>
                    </div>
                    {customer.family_name && (
                      <span className="text-[10px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5 shrink-0">{customer.family_name}</span>
                    )}
                  </div>
                ))}
              {customers.filter(c => {
                const q = customerSearch.toLowerCase();
                return (!q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q)) && (!activeCustFamily || c.family_id === activeCustFamily);
              }).length === 0 && (
                <div className="p-6 text-center text-muted-foreground text-sm">{language === 'ar' ? 'لا توجد نتائج' : 'Aucun résultat'}</div>
              )}
            </div>
            <Button variant="outline" className="w-full gap-2" onClick={() => { setShowCustomersDialog(false); setShowNewCustomerDialog(true); }}>
              <UserPlus className="h-4 w-4" />{language === 'ar' ? 'إضافة زبون جديد' : 'Nouveau client'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{language === 'ar' ? 'إضافة ملاحظة' : 'Ajouter une note'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Textarea value={saleNote} onChange={(e) => setSaleNote(e.target.value)} placeholder={language === 'ar' ? 'اكتب ملاحظة للفاتورة...' : 'Ecrivez une note pour la facture...'} rows={4} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowNoteDialog(false)} className="flex-1">{language === 'ar' ? 'إلغاء' : 'Annuler'}</Button>
              <Button onClick={() => { toast.success(language === 'ar' ? 'تم حفظ الملاحظة' : 'Note enregistree'); setShowNoteDialog(false); }} className="flex-1">{language === 'ar' ? 'حفظ' : 'Enregistrer'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cash Operation Dialog */}
      <Dialog open={showCashDialog} onOpenChange={setShowCashDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{cashOperation.type === 'deposit' ? (language === 'ar' ? 'إيداع في الصندوق' : 'Depot en caisse') : (language === 'ar' ? 'سحب من الصندوق' : 'Retrait de caisse')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>{language === 'ar' ? 'المبلغ' : 'Montant'}</Label><Input type="number" value={cashOperation.amount || ''} onChange={(e) => setCashOperation(prev => ({ ...prev, amount: parseFloat(e.target.value) || 0 }))} placeholder="0.00" /></div>
            <div><Label>{language === 'ar' ? 'ملاحظة' : 'Note'}</Label><Input value={cashOperation.note} onChange={(e) => setCashOperation(prev => ({ ...prev, note: e.target.value }))} placeholder={language === 'ar' ? 'سبب العملية...' : "Raison de l'operation..."} /></div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCashDialog(false)} className="flex-1">{language === 'ar' ? 'إلغاء' : 'Annuler'}</Button>
              <Button onClick={handleCashOperation} className="flex-1">{language === 'ar' ? 'تأكيد' : 'Confirmer'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sales History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader><DialogTitle>{language === 'ar' ? 'سجل المبيعات' : 'Historique des ventes'}</DialogTitle></DialogHeader>
          <div className="max-h-96 overflow-y-auto border rounded-lg">
            {historyLoading ? (
              <div className="p-8 text-center text-muted-foreground">{language === 'ar' ? 'جاري التحميل...' : 'Chargement...'}</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{language === 'ar' ? 'الرقم' : 'N°'}</TableHead>
                  <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الزبون' : 'Client'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'المبلغ' : 'Montant'}</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {salesHistory.map(sale => (
                    <TableRow
                      key={sale.id}
                      className="cursor-pointer hover:bg-primary/5 transition-colors"
                      onClick={() => { setSelectedHistorySaleId(sale.id); setShowSaleDetail(true); }}
                    >
                      <TableCell className="font-mono text-xs">{sale.invoice_number || sale.code}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{new Date(sale.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>{sale.customer_name || (language === 'ar' ? 'زبون عابر' : 'Client passant')}</TableCell>
                      <TableCell className="text-center font-semibold">{formatCurrency(sale.total)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-primary hover:bg-primary/10"
                          onClick={e => { e.stopPropagation(); setSelectedHistorySaleId(sale.id); setShowSaleDetail(true); }}
                        >
                          {language === 'ar' ? 'عرض' : 'Voir'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Shortcut Edit Dialog */}
      <Dialog open={showShortcutDialog} onOpenChange={setShowShortcutDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{language === 'ar' ? 'تعديل الاختصار' : 'Modifier le raccourci'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{language === 'ar' ? 'اختر المنتج' : 'Choisir le produit'}</Label>
              <Select value={shortcutProductId} onValueChange={setShortcutProductId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={language === 'ar' ? 'اختر منتج...' : 'Selectionner...'} /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{language === 'ar' ? p.name_ar : p.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{language === 'ar' ? 'اختر اللون' : 'Choisir la couleur'}</Label>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {SHORTCUT_COLORS.map((color) => (
                  <button key={color} type="button" onClick={() => setShortcutColor(color)} style={{ backgroundColor: color }}
                    className={`h-8 w-full rounded ${shortcutColor === color ? 'ring-2 ring-primary ring-offset-2' : ''}`} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => {
                if (editingShortcutIndex !== null) {
                  const newShortcuts = [...productShortcuts];
                  newShortcuts[editingShortcutIndex] = { productId: null, color: '#e5e7eb' };
                  saveShortcuts(newShortcuts);
                }
                setShowShortcutDialog(false);
              }} className="flex-1">{language === 'ar' ? 'مسح' : 'Effacer'}</Button>
              <Button onClick={saveShortcut} disabled={!shortcutProductId} className="flex-1">{language === 'ar' ? 'حفظ' : 'Enregistrer'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Customer Dialog */}
      <Dialog open={showNewCustomerDialog} onOpenChange={setShowNewCustomerDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />{language === 'ar' ? 'اضافة زبون جديد' : 'Ajouter un client'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>{language === 'ar' ? 'الاسم *' : 'Nom *'}</Label><Input value={newCustomerData.name} onChange={(e) => setNewCustomerData(prev => ({ ...prev, name: e.target.value }))} placeholder={language === 'ar' ? 'اسم الزبون' : 'Nom du client'} /></div>
            <div><Label>{language === 'ar' ? 'الهاتف' : 'Telephone'}</Label><Input value={newCustomerData.phone} onChange={(e) => setNewCustomerData(prev => ({ ...prev, phone: e.target.value }))} placeholder="0555 123 456" /></div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowNewCustomerDialog(false)} className="flex-1">{language === 'ar' ? 'الغاء' : 'Annuler'}</Button>
              <Button onClick={async () => {
                if (!newCustomerData.name) { toast.error(language === 'ar' ? 'يرجى ادخال الاسم' : 'Veuillez entrer le nom'); return; }
                setSavingCustomer(true);
                try {
                  
                  const response = await apiClient.post(`/customers`, newCustomerData);
                  toast.success(language === 'ar' ? 'تمت الاضافة' : 'Client ajoute');
                  setNewCustomerData({ name: '', phone: '', email: '', address: '', family_id: '' });
                  fetchCustomers();
                  setSelectedCustomer(response.data.id);
                  setShowNewCustomerDialog(false);
                } catch (error) { toast.error(error.response?.data?.detail || 'Error'); }
                finally { setSavingCustomer(false); }
              }} disabled={savingCustomer} className="flex-1">
                {savingCustomer ? '...' : (language === 'ar' ? 'حفظ' : 'Enregistrer')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Receipt Dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />{language === 'ar' ? 'طباعة الوصل' : 'Imprimer le recu'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-center text-muted-foreground">{language === 'ar' ? 'تمت عملية البيع بنجاح' : 'Vente effectuee avec succes'}</p>
            {lastSaleInvoice && <p className="text-center font-mono text-lg">{lastSaleInvoice}</p>}
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setShowPrintDialog(false)} className="flex-1">{language === 'ar' ? 'اغلاق' : 'Fermer'}</Button>
              <Button variant="outline" onClick={() => { if (lastSaleId && onPrintA4) { onPrintA4(lastSaleId); } setShowPrintDialog(false); }} className="flex-1 gap-2 border-blue-300 text-blue-700 hover:bg-blue-50">
                <FileText className="h-4 w-4" />{language === 'ar' ? 'A4' : 'A4'}
              </Button>
              <Button onClick={() => { if (lastSaleId) { printThermalReceipt(lastSaleId, receiptSettings?.thermal_printer_size || '80mm'); } setShowPrintDialog(false); }} className="flex-1 gap-2">
                <Printer className="h-4 w-4" />{language === 'ar' ? 'حراري' : 'Thermique'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Open Session Dialog */}
      <Dialog open={showSessionDialog} onOpenChange={setShowSessionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Play className="h-5 w-5 text-emerald-600" />{language === 'ar' ? 'فتح حصة جديدة' : 'Ouvrir une nouvelle session'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">{language === 'ar' ? 'رصيد الصندوق الحالي' : 'Solde actuel de la caisse'}</p>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(cashBoxBalance)} {t.currency}</p>
            </div>
            <div>
              <Label>{language === 'ar' ? 'رصيد الافتتاح' : "Solde d'ouverture"}</Label>
              <div className="relative mt-1">
                <Banknote className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input type="number" value={openingCash} onChange={(e) => setOpeningCash(parseFloat(e.target.value) || 0)} className="ps-10 text-lg" placeholder="0.00" data-testid="pos-opening-cash" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowSessionDialog(false)} className="flex-1">{language === 'ar' ? 'إلغاء' : 'Annuler'}</Button>
              <Button onClick={handleOpenSession} className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="confirm-open-session"><Play className="h-4 w-4" />{language === 'ar' ? 'فتح الحصة' : 'Ouvrir'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Session Dialog */}
      <Dialog open={showCloseSessionDialog} onOpenChange={setShowCloseSessionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><StopCircle className="h-5 w-5 text-red-600" />{language === 'ar' ? 'غلق الحصة' : 'Fermer la session'}</DialogTitle></DialogHeader>
          {currentSession && sessionStats && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between"><span>{language === 'ar' ? 'رصيد الافتتاح' : 'Ouverture'}</span><span className="font-semibold">{formatCurrency(currentSession.opening_cash || 0)} {t.currency}</span></div>
                <div className="flex justify-between text-emerald-600"><span>{language === 'ar' ? '+ المبيعات النقدية' : '+ Ventes espèces'}</span><span className="font-semibold">{formatCurrency(sessionStats.cashSales)} {t.currency}</span></div>
                <div className="flex justify-between text-amber-600"><span>{language === 'ar' ? 'البيع بالدين' : 'Ventes crédit'}</span><span className="font-semibold">{formatCurrency(sessionStats.creditSales)} {t.currency}</span></div>
                <div className="flex justify-between pt-2 border-t font-bold"><span>{language === 'ar' ? 'المتوقع في الصندوق' : 'Attendu'}</span><span>{formatCurrency((currentSession.opening_cash || 0) + sessionStats.cashSales)} {t.currency}</span></div>
              </div>
              <div><Label>{language === 'ar' ? 'المبلغ الفعلي في الصندوق' : 'Montant réel en caisse'}</Label><Input type="number" value={closingCash} onChange={(e) => setClosingCash(parseFloat(e.target.value) || 0)} className="mt-1 text-lg" data-testid="pos-closing-cash" /></div>
              {(() => {
                const expected = (currentSession.opening_cash || 0) + sessionStats.cashSales;
                const diff = closingCash - expected;
                if (Math.abs(diff) > 0.01) {
                  return (
                    <div className={`p-3 rounded-lg ${diff > 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                      <p className="font-semibold">{language === 'ar' ? 'الفرق' : 'Différence'}: {diff > 0 ? '+' : ''}{formatCurrency(diff)} {t.currency}</p>
                      <p className="text-sm">{diff > 0 ? (language === 'ar' ? 'فائض في الصندوق' : 'Excédent') : (language === 'ar' ? 'عجز في الصندوق' : 'Déficit')}</p>
                    </div>
                  );
                }
                return null;
              })()}
              <div><Label>{language === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (optionnel)'}</Label><Input value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} placeholder={language === 'ar' ? 'ملاحظات...' : 'Notes...'} className="mt-1" /></div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowCloseSessionDialog(false)} className="flex-1">{language === 'ar' ? 'إلغاء' : 'Annuler'}</Button>
                <Button onClick={handleCloseSession} variant="destructive" className="flex-1 gap-2" data-testid="confirm-close-session"><StopCircle className="h-4 w-4" />{language === 'ar' ? 'تأكيد الغلق' : 'Confirmer'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Session Details Dialog */}
      <Dialog open={showSessionDetailsDialog} onOpenChange={setShowSessionDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />{language === 'ar' ? 'تفاصيل الحصة الحالية' : 'Détails de la session'}</DialogTitle></DialogHeader>
          {currentSession && sessionStats && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                <div><p className="text-xs text-muted-foreground">{language === 'ar' ? 'كود الحصة' : 'Code session'}</p><p className="font-mono font-bold text-lg">{currentSession.code || '#---'}</p></div>
                <div className="text-end"><p className="text-xs text-muted-foreground">{language === 'ar' ? 'وقت الفتح' : 'Ouverture'}</p><p className="font-semibold">{new Date(currentSession.opened_at).toLocaleTimeString(language === 'ar' ? 'ar-DZ' : 'fr-FR')}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: language === 'ar' ? 'رصيد الافتتاح' : 'Ouverture', val: currentSession.opening_cash || 0, color: 'blue' },
                  { label: language === 'ar' ? 'المبيعات النقدية' : 'Ventes espèces', val: sessionStats.cashSales, color: 'emerald' },
                  { label: language === 'ar' ? 'البيع بالدين' : 'Ventes crédit', val: sessionStats.creditSales, color: 'amber' },
                  { label: language === 'ar' ? 'إجمالي المبيعات' : 'Total ventes', val: sessionStats.totalSales, color: 'purple' },
                ].map(s => (
                  <div key={s.label} className={`p-3 bg-${s.color}-50 dark:bg-${s.color}-950/30 rounded-lg text-center`}>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-xl font-bold text-${s.color}-600`}>{formatCurrency(s.val)}</p>
                    <p className="text-xs text-muted-foreground">{t.currency}</p>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-primary/5 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{language === 'ar' ? 'المتوقع في الصندوق' : 'Attendu en caisse'}</span>
                  <span className="text-xl font-bold text-primary">{formatCurrency((currentSession.opening_cash || 0) + sessionStats.cashSales)} {t.currency}</span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 p-3 bg-muted/50 rounded-lg">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <span className="text-muted-foreground">{language === 'ar' ? 'عدد المبيعات:' : 'Nombre de ventes:'}</span>
                <Badge variant="secondary" className="text-lg px-3">{sessionStats.salesCount}</Badge>
              </div>
              <Button variant="outline" onClick={() => setShowSessionDetailsDialog(false)} className="w-full">{language === 'ar' ? 'إغلاق' : 'Fermer'}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sale Detail / Edit Dialog */}
      <SaleDetailDialog
        saleId={selectedHistorySaleId}
        open={showSaleDetail}
        onOpenChange={setShowSaleDetail}
        language={language}
        formatCurrency={formatCurrency}
        customers={customers}
        onUpdated={() => {}}
      />

      {/* ── Custom Product Dialog ── */}
      <Dialog open={showCustomProductDialog} onOpenChange={setShowCustomProductDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-primary" />
              {language === 'ar' ? 'منتج مخصص' : 'Produit libre'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm">{language === 'ar' ? 'اسم المنتج *' : 'Nom du produit *'}</Label>
              <input
                autoFocus
                value={customProduct?.name || ''}
                onChange={e => setCustomProduct(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addCustomProductToCart(); }}
                placeholder={language === 'ar' ? 'مثال: خدمة تركيب...' : 'Ex: Frais de montage...'}
                className="mt-1 w-full px-3 py-2 text-sm border rounded-md bg-background outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">{language === 'ar' ? 'السعر (DA) *' : 'Prix (DA) *'}</Label>
                <input
                  type="number"
                  min="0"
                  value={customProduct?.price || ''}
                  onChange={e => setCustomProduct(p => ({ ...p, price: e.target.value }))}
                  placeholder="0.00"
                  className="mt-1 w-full px-3 py-2 text-sm border rounded-md bg-background outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <Label className="text-sm">{language === 'ar' ? 'الكمية' : 'Qté'}</Label>
                <input
                  type="number"
                  min="1"
                  value={customProduct?.qty || 1}
                  onChange={e => setCustomProduct(p => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
                  className="mt-1 w-full px-3 py-2 text-sm border rounded-md bg-background outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            {customProduct?.price > 0 && customProduct?.qty > 0 && (
              <div className="p-3 bg-primary/5 rounded-lg flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{language === 'ar' ? 'الإجمالي' : 'Total'}</span>
                <span className="font-bold text-primary">{formatCurrency((parseFloat(customProduct.price) || 0) * (parseInt(customProduct.qty) || 1))} DA</span>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCustomProductDialog(false)}
                className="flex-1 px-3 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
              >
                {language === 'ar' ? 'إلغاء' : 'Annuler'}
              </button>
              <button
                onClick={addCustomProductToCart}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
              >
                {language === 'ar' ? 'إضافة للسلة' : 'Ajouter au panier'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── POS Reports Dialog (inline, no navigation) ── */}
      <Dialog open={showPosReportsDialog} onOpenChange={setShowPosReportsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              {language === 'ar' ? 'تقارير الحصة الحالية' : 'Rapports de la session'}
            </DialogTitle>
          </DialogHeader>
          {sessionStats && currentSession ? (
            <div className="space-y-4 py-2">
              {/* Session info */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg text-sm">
                <span className="text-muted-foreground">{language === 'ar' ? 'الحصة' : 'Session'}</span>
                <div className="text-end">
                  <p className="font-mono font-bold">{currentSession.code || '—'}</p>
                  <p className="text-xs text-muted-foreground">{new Date(currentSession.opened_at).toLocaleTimeString(language === 'ar' ? 'ar-DZ' : 'fr-FR')}</p>
                </div>
              </div>
              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: language === 'ar' ? 'المبيعات النقدية' : 'Ventes espèces',   val: sessionStats.cashSales,   color: 'emerald' },
                  { label: language === 'ar' ? 'البيع بالدين'     : 'Ventes crédit',    val: sessionStats.creditSales, color: 'amber'   },
                  { label: language === 'ar' ? 'إجمالي المبيعات'  : 'Total ventes',    val: sessionStats.totalSales,  color: 'blue'    },
                  { label: language === 'ar' ? 'عدد الفواتير'     : 'Nb de ventes',    val: null, count: sessionStats.salesCount, color: 'purple' },
                ].map(s => (
                  <div key={s.label} className={`p-3 bg-${s.color}-50 dark:bg-${s.color}-950/30 rounded-lg text-center`}>
                    <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                    <p className={`text-lg font-bold text-${s.color}-600`}>
                      {s.count !== undefined ? s.count : `${formatCurrency(s.val)} DA`}
                    </p>
                  </div>
                ))}
              </div>
              {/* Expected in cash */}
              <div className="p-3 bg-primary/5 rounded-lg flex justify-between items-center">
                <span className="text-sm font-medium">{language === 'ar' ? 'المتوقع في الصندوق' : 'Attendu en caisse'}</span>
                <span className="font-bold text-primary text-lg">{formatCurrency((currentSession.opening_cash || 0) + sessionStats.cashSales)} DA</span>
              </div>
              <button
                onClick={() => setShowPosReportsDialog(false)}
                className="w-full px-3 py-2 text-sm border rounded-md hover:bg-muted transition-colors"
              >
                {language === 'ar' ? 'إغلاق' : 'Fermer'}
              </button>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {language === 'ar' ? 'لا توجد حصة مفتوحة' : 'Aucune session ouverte'}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
