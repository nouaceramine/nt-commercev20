/**
 * PurchaseDialogs - All dialog components extracted from PurchasesPage
 * Includes: New Purchase, Pay Debt, New Supplier, Edit Prices, Edit Purchase, View Purchase, Delete Confirm
 */
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import {
  ShoppingBag, Search, Plus, Minus, Trash2, Package, Truck,
  CreditCard, Banknote, Wallet, TrendingUp, TrendingDown, Calculator,
  DollarSign, AlertCircle, PlusCircle, Save, Edit, Image, Check,
  RefreshCw, Percent, Tag, Eye,
} from 'lucide-react';

export default function PurchaseDialogs({
  // New Purchase Dialog
  showNewPurchaseDialog, setShowNewPurchaseDialog, purchaseCode,
  searchQuery, setSearchQuery, searchInputRef, filteredProducts,
  addToCart, suppliers, selectedSupplier, setSelectedSupplier,
  setShowNewSupplierDialog, supplierPreviousDebt,
  cart, updatePrice, updateQuantity, removeFromCart, openEditPricesDialog,
  subtotal, paymentType, setPaymentType, paidAmount, setPaidAmount,
  paymentMethod, setPaymentMethod, notes, setNotes,
  loading, completePurchase,
  // Pay Debt Dialog
  showPayDebtDialog, setShowPayDebtDialog, selectedDebt,
  debtPaymentAmount, setDebtPaymentAmount, paySupplierDebt,
  // New Supplier Dialog
  showNewSupplierDialog, newSupplierData, setNewSupplierData,
  addingSupplier, handleAddSupplier,
  // Edit Prices Dialog
  showEditPricesDialog, setShowEditPricesDialog, editingProduct,
  editPricesData, setEditPricesData, handlePurchasePriceChange,
  handleMarginChange, handleImageUpload, imageInputRef,
  uploadingImage, saveEditedPrices,
  // Edit Purchase Dialog
  showEditPurchaseDialog, setShowEditPurchaseDialog, editingPurchase,
  editPaidAmount, setEditPaidAmount, editNotes, setEditNotes,
  handleUpdatePurchase,
  // View Purchase Dialog
  showViewPurchaseDialog, setShowViewPurchaseDialog, viewingPurchase,
  // Delete Confirm
  showDeleteConfirm, setShowDeleteConfirm, purchaseToDelete,
  deletingPurchase, handleDeletePurchase,
  // Common
  language, isRTL, t, formatDate, getStatusBadge,
}) {
  return (
    <>
      {/* ===== New Purchase Dialog ===== */}
      <Dialog open={showNewPurchaseDialog} onOpenChange={setShowNewPurchaseDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                {t.newPurchase}
              </div>
              {purchaseCode && (
                <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{purchaseCode}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            {/* Products Selection */}
            <div className="space-y-4">
              <div className="relative">
                <Search className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder={language === 'ar' ? 'البحث بالاسم أو الباركود أو كود المنتج...' : 'Rechercher par nom, code-barres ou code article...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredProducts.length > 0) {
                        addToCart(filteredProducts[0]);
                        setSearchQuery('');
                      }
                    }
                  }}
                  className={`h-11 ${isRTL ? 'pr-10' : 'pl-10'}`}
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
                {filteredProducts.slice(0, 20).map(product => (
                  <div key={product.id} onClick={() => addToCart(product)} className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <p className="font-medium text-sm line-clamp-1">{language === 'ar' ? product.name_ar : product.name_en}</p>
                    {product.article_code && <p className="text-xs font-mono text-blue-600">{product.article_code}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{(product.purchase_price || product.price || 0).toFixed(2)} {t.currency}</p>
                    <p className="text-xs text-muted-foreground">{t.quantity}: {product.quantity}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Cart & Payment */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>{t.selectSupplier}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowNewSupplierDialog(true)} className="gap-1 h-7">
                    <Plus className="h-3 w-3" />{language === 'ar' ? 'مورد جديد' : 'Nouveau'}
                  </Button>
                </div>
                <Select value={selectedSupplier || ''} onValueChange={setSelectedSupplier}>
                  <SelectTrigger><Truck className="h-4 w-4 me-2" /><SelectValue placeholder={t.selectSupplier} /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}</SelectContent>
                </Select>
                {selectedSupplier && supplierPreviousDebt > 0 && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {language === 'ar' ? `دين سابق: ${supplierPreviousDebt.toFixed(2)} ${t.currency}` : `Dette précédente: ${supplierPreviousDebt.toFixed(2)} ${t.currency}`}
                  </p>
                )}
              </div>
              <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                {cart.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">{t.emptyCart}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-8"></TableHead>
                        <TableHead>{language === 'ar' ? 'المنتج' : 'Produit'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'سعر الشراء' : 'Prix achat'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'الكمية' : 'Qté'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'المجموع' : 'Total'}</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cart.map(item => (
                        <TableRow key={item.product_id} className={item.updatePrices ? 'bg-green-50' : ''}>
                          <TableCell className="p-2">
                            {item.productImage ? (<img src={item.productImage} alt="" className="w-10 h-10 rounded object-cover" />) : (
                              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center"><Package className="h-5 w-5 text-muted-foreground" /></div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{item.product_name}</p>
                              {item.updatePrices && (<Badge variant="outline" className="text-xs bg-green-100 text-green-700"><RefreshCw className="h-3 w-3 me-1" />{language === 'ar' ? 'سيتم التحديث' : 'Sera mis à jour'}</Badge>)}
                              {item.originalPurchasePrice !== item.unit_price && (<p className="text-xs text-amber-600 mt-1">{language === 'ar' ? 'السعر القديم:' : 'Ancien:'} {item.originalPurchasePrice.toFixed(2)}</p>)}
                            </div>
                          </TableCell>
                          <TableCell className="p-2">
                            <div className="flex items-center gap-1 justify-center">
                              <Input type="number" value={item.unit_price} onChange={(e) => updatePrice(item.product_id, parseFloat(e.target.value) || 0)} className="w-24 h-8 text-center" />
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:bg-blue-50" onClick={() => openEditPricesDialog(item)}><Edit className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                          <TableCell className="p-2">
                            <div className="flex items-center gap-1 justify-center">
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.product_id, -1)}><Minus className="h-3 w-3" /></Button>
                              <span className="w-10 text-center font-medium">{item.quantity}</span>
                              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.product_id, 1)}><Plus className="h-3 w-3" /></Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-semibold">{item.total.toFixed(2)}</TableCell>
                          <TableCell className="p-2"><Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeFromCart(item.product_id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              <div className="p-4 bg-muted/30 rounded-lg space-y-4">
                <div className="flex justify-between text-lg font-bold"><span>{t.total}</span><span>{subtotal.toFixed(2)} {t.currency}</span></div>
                <div>
                  <Label>{language === 'ar' ? 'نوع الدفع' : 'Type de paiement'}</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <Button type="button" variant={paymentType === 'cash' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentType('cash')} className="flex-col h-16 gap-1"><Banknote className="h-5 w-5" /><span className="text-xs">{language === 'ar' ? 'نقداً' : 'Comptant'}</span></Button>
                    <Button type="button" variant={paymentType === 'credit' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentType('credit')} className="flex-col h-16 gap-1 border-red-200"><CreditCard className="h-5 w-5" /><span className="text-xs">{language === 'ar' ? 'دين' : 'Crédit'}</span></Button>
                    <Button type="button" variant={paymentType === 'partial' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentType('partial')} className="flex-col h-16 gap-1 border-amber-200"><Calculator className="h-5 w-5" /><span className="text-xs">{language === 'ar' ? 'جزئي' : 'Partiel'}</span></Button>
                  </div>
                </div>
                {paymentType === 'partial' && (<div><Label>{t.paidAmount}</Label><Input type="number" value={paidAmount} onChange={(e) => setPaidAmount(Math.min(parseFloat(e.target.value) || 0, subtotal))} className="mt-1" max={subtotal} /></div>)}
                {paymentType !== 'cash' && (<div className="flex justify-between text-red-600 font-semibold p-2 bg-red-50 rounded"><span>{language === 'ar' ? 'سيُسجل كدين' : 'Sera enregistré comme dette'}</span><span>{(subtotal - paidAmount).toFixed(2)} {t.currency}</span></div>)}
                {(paymentType === 'cash' || paymentType === 'partial') && (
                  <div><Label>{t.paymentMethod}</Label>
                    <div className="flex gap-2 mt-2">
                      <Button type="button" variant={paymentMethod === 'cash' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('cash')} className="flex-1"><Banknote className="h-4 w-4 me-1" />{t.cash}</Button>
                      <Button type="button" variant={paymentMethod === 'bank' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('bank')} className="flex-1"><CreditCard className="h-4 w-4 me-1" />{t.bank}</Button>
                      <Button type="button" variant={paymentMethod === 'wallet' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('wallet')} className="flex-1"><Wallet className="h-4 w-4 me-1" /></Button>
                    </div>
                  </div>
                )}
                <div><Label>{t.notes}</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={language === 'ar' ? 'ملاحظات...' : 'Notes...'} className="mt-1" rows={2} /></div>
              </div>
              <Button onClick={completePurchase} disabled={loading || cart.length === 0 || !selectedSupplier} className={`w-full h-12 text-lg ${paymentType === 'credit' ? 'bg-red-600 hover:bg-red-700' : ''}`}>
                {loading ? t.loading : (paymentType === 'credit' ? (language === 'ar' ? 'تسجيل شراء بالدين' : 'Enregistrer achat à crédit') : t.completeSale)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Pay Debt Dialog ===== */}
      <Dialog open={showPayDebtDialog} onOpenChange={setShowPayDebtDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />{language === 'ar' ? 'تسديد دين المورد' : 'Payer dette fournisseur'}</DialogTitle></DialogHeader>
          {selectedDebt && (
            <div className="space-y-4 mt-4">
              <div className="p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3 mb-3"><Truck className="h-6 w-6 text-muted-foreground" /><div><p className="font-semibold">{selectedDebt.supplier_name}</p><p className="text-sm text-muted-foreground">{selectedDebt.purchases.length} {language === 'ar' ? 'فاتورة' : 'factures'}</p></div></div>
                <div className="flex justify-between text-lg"><span>{language === 'ar' ? 'إجمالي الدين' : 'Total dette'}</span><span className="font-bold text-red-600">{selectedDebt.total_debt.toFixed(2)} {t.currency}</span></div>
              </div>
              <div><Label>{language === 'ar' ? 'المبلغ المدفوع' : 'Montant à payer'}</Label><Input type="number" value={debtPaymentAmount} onChange={(e) => setDebtPaymentAmount(Math.min(parseFloat(e.target.value) || 0, selectedDebt.total_debt))} className="mt-1" max={selectedDebt.total_debt} /></div>
              <div><Label>{t.paymentMethod}</Label>
                <div className="flex gap-2 mt-2">
                  <Button type="button" variant={paymentMethod === 'cash' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('cash')} className="flex-1"><Banknote className="h-4 w-4 me-1" />{t.cash}</Button>
                  <Button type="button" variant={paymentMethod === 'bank' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('bank')} className="flex-1"><CreditCard className="h-4 w-4 me-1" />{t.bank}</Button>
                </div>
              </div>
              {debtPaymentAmount < selectedDebt.total_debt && (<div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">{language === 'ar' ? 'سيتبقى' : 'Restera'}: {(selectedDebt.total_debt - debtPaymentAmount).toFixed(2)} {t.currency}</div>)}
              <Button onClick={paySupplierDebt} disabled={loading || debtPaymentAmount <= 0} className="w-full">{loading ? t.loading : (language === 'ar' ? 'تأكيد الدفع' : 'Confirmer le paiement')}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== New Supplier Dialog ===== */}
      <Dialog open={showNewSupplierDialog} onOpenChange={setShowNewSupplierDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{language === 'ar' ? 'إضافة مورد جديد' : 'Ajouter un fournisseur'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>{language === 'ar' ? 'اسم المورد *' : 'Nom du fournisseur *'}</Label><Input value={newSupplierData.name} onChange={(e) => setNewSupplierData(prev => ({ ...prev, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>{language === 'ar' ? 'رقم الهاتف' : 'Téléphone'}</Label><Input value={newSupplierData.phone} onChange={(e) => setNewSupplierData(prev => ({ ...prev, phone: e.target.value }))} placeholder="0555 123 456" /></div>
            <div className="space-y-2"><Label>{language === 'ar' ? 'البريد الإلكتروني' : 'Email'}</Label><Input type="email" value={newSupplierData.email} onChange={(e) => setNewSupplierData(prev => ({ ...prev, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label>{language === 'ar' ? 'العنوان' : 'Adresse'}</Label><Input value={newSupplierData.address} onChange={(e) => setNewSupplierData(prev => ({ ...prev, address: e.target.value }))} /></div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowNewSupplierDialog(false); setNewSupplierData({ name: '', phone: '', email: '', address: '' }); }}>{language === 'ar' ? 'إلغاء' : 'Annuler'}</Button>
              <Button variant="outline" onClick={() => handleAddSupplier(true)} disabled={addingSupplier || !newSupplierData.name.trim()} className="gap-2"><PlusCircle className="h-4 w-4" />{language === 'ar' ? 'حفظ وإنشاء جديد' : 'Enregistrer et créer nouveau'}</Button>
              <Button onClick={() => handleAddSupplier(false)} disabled={addingSupplier || !newSupplierData.name.trim()} className="gap-2"><Save className="h-4 w-4" />{addingSupplier ? '...' : (language === 'ar' ? 'حفظ' : 'Enregistrer')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Edit Prices Dialog ===== */}
      <Dialog open={showEditPricesDialog} onOpenChange={setShowEditPricesDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-blue-600" />{language === 'ar' ? 'تعديل أسعار المنتج' : 'Modifier les prix du produit'}</DialogTitle></DialogHeader>
          {editingProduct && (
            <div className="space-y-6 mt-4">
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="relative">
                  {editPricesData.imagePreview ? (<img src={editPricesData.imagePreview} alt="" className="w-20 h-20 rounded-lg object-cover" />) : (<div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center"><Package className="h-8 w-8 text-muted-foreground" /></div>)}
                  <Button type="button" variant="secondary" size="icon" className="absolute -bottom-2 -end-2 h-8 w-8 rounded-full shadow-lg" onClick={() => imageInputRef.current?.click()}><Image className="h-4 w-4" /></Button>
                  <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </div>
                <div className="flex-1"><h3 className="font-semibold text-lg">{editingProduct.product_name}</h3><p className="text-sm text-muted-foreground">{language === 'ar' ? 'سعر الشراء القديم:' : 'Ancien prix:'} {editingProduct.originalPurchasePrice?.toFixed(2)} {t.currency}</p></div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-green-600" />{language === 'ar' ? 'سعر الشراء الجديد' : 'Nouveau prix d\'achat'}</Label>
                <Input type="number" value={editPricesData.newPurchasePrice} onChange={(e) => handlePurchasePriceChange(parseFloat(e.target.value) || 0)} className="text-lg h-12" />
                {editingProduct.originalPurchasePrice !== editPricesData.newPurchasePrice && editingProduct.originalPurchasePrice > 0 && (
                  <Badge className={editPricesData.newPurchasePrice > editingProduct.originalPurchasePrice ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>
                    {editPricesData.newPurchasePrice > editingProduct.originalPurchasePrice ? <TrendingUp className="h-3 w-3 me-1" /> : <TrendingDown className="h-3 w-3 me-1" />}
                    {((editPricesData.newPurchasePrice - editingProduct.originalPurchasePrice) / editingProduct.originalPurchasePrice * 100).toFixed(1)}%
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label className="flex items-center gap-2"><Percent className="h-4 w-4 text-amber-600" />{language === 'ar' ? 'هامش الربح' : 'Marge'}</Label><Badge variant="outline" className="text-lg px-3">{editPricesData.margin}%</Badge></div>
                <div className="flex gap-2">{[10, 20, 30, 40, 50].map(m => (<Button key={m} type="button" variant={editPricesData.margin === m ? 'default' : 'outline'} size="sm" onClick={() => handleMarginChange(m)} className="flex-1">{m}%</Button>))}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{language === 'ar' ? 'سعر الجملة' : 'Prix de gros'}</Label><Input type="number" value={editPricesData.wholesalePrice} onChange={(e) => setEditPricesData(prev => ({ ...prev, wholesalePrice: parseFloat(e.target.value) || 0 }))} className="bg-blue-50 border-blue-200" /><p className="text-xs text-muted-foreground">{language === 'ar' ? 'القديم:' : 'Ancien:'} {editingProduct.wholesalePrice?.toFixed(2)}</p></div>
                <div className="space-y-2"><Label>{language === 'ar' ? 'سعر التجزئة' : 'Prix de détail'}</Label><Input type="number" value={editPricesData.retailPrice} onChange={(e) => setEditPricesData(prev => ({ ...prev, retailPrice: parseFloat(e.target.value) || 0 }))} className="bg-green-50 border-green-200" /><p className="text-xs text-muted-foreground">{language === 'ar' ? 'القديم:' : 'Ancien:'} {editingProduct.retailPrice?.toFixed(2)}</p></div>
              </div>
              <div className="flex items-center space-x-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <Checkbox id="updateProductPrices" checked={editPricesData.updateProductPrices} onCheckedChange={(checked) => setEditPricesData(prev => ({ ...prev, updateProductPrices: checked }))} />
                <Label htmlFor="updateProductPrices" className="cursor-pointer flex-1"><span className="font-medium text-amber-800">{language === 'ar' ? 'تحديث أسعار المنتج في النظام' : 'Mettre à jour les prix'}</span><p className="text-xs text-amber-600 mt-1">{language === 'ar' ? 'سيتم حفظ الأسعار الجديدة' : 'Les nouveaux prix seront enregistrés'}</p></Label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowEditPricesDialog(false)} className="flex-1">{language === 'ar' ? 'إلغاء' : 'Annuler'}</Button>
                <Button onClick={saveEditedPrices} disabled={uploadingImage} className="flex-1 gap-2">{uploadingImage ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{language === 'ar' ? 'حفظ التغييرات' : 'Enregistrer'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Edit Purchase Dialog ===== */}
      <Dialog open={showEditPurchaseDialog} onOpenChange={setShowEditPurchaseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit className="h-5 w-5 text-amber-600" />{language === 'ar' ? 'تعديل المشتريات' : 'Modifier l\'achat'}</DialogTitle></DialogHeader>
          {editingPurchase && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">{language === 'ar' ? 'رقم الفاتورة:' : 'N° Facture:'}</span><span className="font-medium">{editingPurchase.invoice_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{language === 'ar' ? 'المورد:' : 'Fournisseur:'}</span><span className="font-medium">{editingPurchase.supplier_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{language === 'ar' ? 'الإجمالي:' : 'Total:'}</span><span className="font-bold text-lg">{editingPurchase.total.toFixed(2)} {t.currency}</span></div>
              </div>
              <div className="space-y-2"><Label>{language === 'ar' ? 'المبلغ المدفوع' : 'Montant payé'}</Label><Input type="number" value={editPaidAmount} onChange={(e) => setEditPaidAmount(Math.min(parseFloat(e.target.value) || 0, editingPurchase.total))} max={editingPurchase.total} className="text-lg" />{editPaidAmount < editingPurchase.total && (<p className="text-sm text-red-500">{language === 'ar' ? 'المتبقي:' : 'Restant:'} {(editingPurchase.total - editPaidAmount).toFixed(2)} {t.currency}</p>)}</div>
              <div className="space-y-2"><Label>{language === 'ar' ? 'ملاحظات' : 'Notes'}</Label><Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} /></div>
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowEditPurchaseDialog(false)} className="flex-1">{language === 'ar' ? 'إلغاء' : 'Annuler'}</Button>
                <Button onClick={handleUpdatePurchase} disabled={loading} className="flex-1 gap-2">{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{language === 'ar' ? 'حفظ التغييرات' : 'Enregistrer'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== View Purchase Details Dialog ===== */}
      <Dialog open={showViewPurchaseDialog} onOpenChange={setShowViewPurchaseDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-blue-600" />{language === 'ar' ? 'تفاصيل المشتريات' : 'Détails de l\'achat'}</DialogTitle></DialogHeader>
          {viewingPurchase && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div><p className="text-sm text-muted-foreground">{language === 'ar' ? 'رقم الفاتورة' : 'N° Facture'}</p><p className="font-medium">{viewingPurchase.invoice_number}</p></div>
                <div><p className="text-sm text-muted-foreground">{language === 'ar' ? 'المورد' : 'Fournisseur'}</p><p className="font-medium">{viewingPurchase.supplier_name}</p></div>
                <div><p className="text-sm text-muted-foreground">{language === 'ar' ? 'التاريخ' : 'Date'}</p><p className="font-medium">{formatDate(viewingPurchase.created_at)}</p></div>
                <div><p className="text-sm text-muted-foreground">{language === 'ar' ? 'الحالة' : 'Statut'}</p>{getStatusBadge(viewingPurchase.status)}</div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50"><TableHead>{language === 'ar' ? 'المنتج' : 'Produit'}</TableHead><TableHead className="text-center">{language === 'ar' ? 'الكمية' : 'Qté'}</TableHead><TableHead className="text-center">{language === 'ar' ? 'السعر' : 'Prix'}</TableHead><TableHead className="text-center">{language === 'ar' ? 'المجموع' : 'Total'}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {viewingPurchase.items?.map((item, index) => (
                      <TableRow key={`vi-${item.product_id || index}`}><TableCell className="font-medium">{item.product_name}</TableCell><TableCell className="text-center">{item.quantity}</TableCell><TableCell className="text-center">{item.unit_price?.toFixed(2)} {t.currency}</TableCell><TableCell className="text-center font-semibold">{item.total?.toFixed(2)} {t.currency}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                <div className="flex justify-between text-lg"><span>{language === 'ar' ? 'الإجمالي:' : 'Total:'}</span><span className="font-bold">{viewingPurchase.total.toFixed(2)} {t.currency}</span></div>
                <div className="flex justify-between text-emerald-600"><span>{language === 'ar' ? 'المدفوع:' : 'Payé:'}</span><span className="font-semibold">{viewingPurchase.paid_amount.toFixed(2)} {t.currency}</span></div>
                {viewingPurchase.remaining > 0 && (<div className="flex justify-between text-red-600"><span>{language === 'ar' ? 'المتبقي:' : 'Restant:'}</span><span className="font-semibold">{viewingPurchase.remaining.toFixed(2)} {t.currency}</span></div>)}
              </div>
              {viewingPurchase.notes && (<div className="p-3 bg-amber-50 border border-amber-200 rounded-lg"><p className="text-sm text-amber-800">{viewingPurchase.notes}</p></div>)}
              <Button variant="outline" onClick={() => setShowViewPurchaseDialog(false)} className="w-full">{language === 'ar' ? 'إغلاق' : 'Fermer'}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Delete Confirmation ===== */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="h-5 w-5" />{language === 'ar' ? 'تأكيد الحذف' : 'Confirmer la suppression'}</AlertDialogTitle>
            <AlertDialogDescription>{language === 'ar' ? `هل أنت متأكد من حذف فاتورة الشراء رقم ${purchaseToDelete?.invoice_number}؟` : `Supprimer l'achat N° ${purchaseToDelete?.invoice_number}?`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'ar' ? 'إلغاء' : 'Annuler'}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePurchase} disabled={deletingPurchase} className="bg-red-600 hover:bg-red-700">
              {deletingPurchase ? <RefreshCw className="h-4 w-4 animate-spin me-2" /> : <Trash2 className="h-4 w-4 me-2" />}{language === 'ar' ? 'حذف' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
