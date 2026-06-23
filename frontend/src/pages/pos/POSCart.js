import { useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import {
  ShoppingCart, Plus, Minus, User, UserPlus, Warehouse,
  X, Check, Trash2, Banknote, CreditCard, AlertCircle, CalendarDays,
  Wallet, Percent, MessageSquare, PauseCircle, PlayCircle, Clock,
  ArrowDownUp, ChevronDown, ChevronUp, Shuffle,
} from 'lucide-react';

export default function POSCart({
  cart, customers, selectedCustomer, setSelectedCustomer,
  customerDebt, selectedWarehouse, setSelectedWarehouse,
  warehouses, priceType, setPriceType,
  setShowNewCustomerDialog,
  updateCartItemQuantity, updateCartItemPrice, updateCartItemDiscount,
  updateCartItemNote,
  removeFromCart, clearCart,
  subtotal, total, discount, setDiscount,
  discountMode, setDiscountMode,
  loading, hasOpenSession, completeSale,
  language, formatCurrency, t, isRTL,
  paymentType, setPaymentType,
  paymentMethod, setPaymentMethod,
  paidAmount, setPaidAmount,
  onInstallmentClick,
  installmentPlan,
  parkedCarts, parkCart, resumeParkedCart, deleteParkedCart,
  mixedCash, setMixedCash, mixedBank, setMixedBank,
}) {
  const [noteItemId, setNoteItemId] = useState(null);
  const [showParkedDialog, setShowParkedDialog] = useState(false);

  const paymentTypes = [
    { key: 'cash',        label: language === 'ar' ? 'نقدي'   : 'Espèces',    icon: Banknote },
    { key: 'partial',     label: language === 'ar' ? 'جزئي'   : 'Partiel',    icon: Wallet },
    { key: 'bank',        label: language === 'ar' ? 'بنك'    : 'Virement',   icon: CreditCard },
    { key: 'mixed',       label: language === 'ar' ? 'مختلط'  : 'Mixte',      icon: Shuffle },
    { key: 'credit',      label: language === 'ar' ? 'آجل'    : 'Crédit',     icon: AlertCircle },
    { key: 'installment', label: language === 'ar' ? 'أقساط'  : 'Versements', icon: CalendarDays },
  ];

  const change = (paymentType === 'cash' && paidAmount > 0 && paidAmount > total)
    ? paidAmount - total : 0;

  const discountDisplayValue = discountMode === 'percent'
    ? (subtotal > 0 ? +((discount / subtotal) * 100).toFixed(2) : 0)
    : discount;

  const handleDiscountChange = (val) => {
    const num = parseFloat(val) || 0;
    if (discountMode === 'percent') {
      setDiscount(+(subtotal * num / 100).toFixed(2));
    } else {
      setDiscount(num);
    }
  };

  return (
    <div className="col-span-1 md:col-span-8 flex flex-col min-h-0" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Card className="flex-1 flex flex-col overflow-hidden">

        {/* ── Customer & Warehouse ── */}
        <div className="p-2 border-b flex flex-wrap items-center gap-2">
          <Select value={selectedCustomer || 'walk-in'} onValueChange={(v) => setSelectedCustomer(v === 'walk-in' ? null : v)}>
            <SelectTrigger className="w-40 h-8 text-sm" data-testid="customer-select">
              <User className="h-3.5 w-3.5 me-1.5 opacity-50" />
              <SelectValue placeholder={t.selectCustomer} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="walk-in">{t.walkInCustomer}</SelectItem>
              {customers.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => setShowNewCustomerDialog(true)} className="h-8 gap-1 text-xs" data-testid="add-customer-btn">
            <UserPlus className="h-3.5 w-3.5" />
          </Button>

          {warehouses.length > 0 && (
            <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
              <SelectTrigger className="w-32 h-8 text-sm" data-testid="warehouse-select">
                <Warehouse className="h-3.5 w-3.5 me-1.5 opacity-50" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={priceType} onValueChange={setPriceType}>
            <SelectTrigger className="w-24 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="retail">{language === 'ar' ? 'تجزئة' : 'Detail'}</SelectItem>
              <SelectItem value="wholesale">{language === 'ar' ? 'جملة' : 'Gros'}</SelectItem>
            </SelectContent>
          </Select>

          {selectedCustomer && customerDebt > 0 && (
            <Badge variant="destructive" className="text-xs">
              {language === 'ar' ? 'دين:' : 'Dette:'} {formatCurrency(customerDebt)}
            </Badge>
          )}

          {/* Parked carts indicator */}
          {parkedCarts?.length > 0 && (
            <button
              onClick={() => setShowParkedDialog(true)}
              className="ms-auto flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 hover:bg-amber-100 transition-colors"
            >
              <Clock className="h-3 w-3" />
              {parkedCarts.length} {language === 'ar' ? 'سلة محفوظة' : 'en attente'}
            </button>
          )}
        </div>

        {/* ── Products Table (Desktop) ── */}
        <div className="flex-1 overflow-auto">
          <Table className="hidden sm:table">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-20 text-xs">{language === 'ar' ? 'الكود' : 'Code'}</TableHead>
                <TableHead className="text-xs">{language === 'ar' ? 'المنتج' : 'Article'}</TableHead>
                <TableHead className="w-24 text-center text-xs">{language === 'ar' ? 'الكمية' : 'Qte'}</TableHead>
                <TableHead className="w-24 text-center text-xs">{language === 'ar' ? 'السعر' : 'Prix'}</TableHead>
                <TableHead className="w-16 text-center text-xs">%</TableHead>
                <TableHead className="w-24 text-center text-xs">{language === 'ar' ? 'المبلغ' : 'Total'}</TableHead>
                <TableHead className="w-14"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cart.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{language === 'ar' ? 'أضف منتجات للسلة' : 'Ajoutez des articles'}</p>
                  </TableCell>
                </TableRow>
              ) : (
                cart.map((item, index) => (
                  <>
                    <TableRow
                      key={item.cart_item_id || item.product_id}
                      className={`${index % 2 === 0 ? 'bg-muted/20' : ''} ${item.is_return ? 'bg-red-50 dark:bg-red-950/20' : ''}`}
                    >
                      <TableCell className="font-mono text-xs py-1">{item.article_code || item.barcode || '---'}</TableCell>
                      <TableCell className="font-medium text-sm py-1">
                        {item.product_name}
                        {item.serial_number && <span className="block text-[10px] text-muted-foreground font-mono">SN: {item.serial_number}</span>}
                      </TableCell>
                      <TableCell className="text-center py-1">
                        <div className="flex items-center justify-center gap-0.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateCartItemQuantity(item.cart_item_id, item.quantity - 1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateCartItemQuantity(item.cart_item_id, parseInt(e.target.value) || 0)}
                            className="w-12 h-6 text-center text-sm p-0"
                          />
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateCartItemQuantity(item.cart_item_id, item.quantity + 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center py-1">
                        <Input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => !item.is_fixed_price && updateCartItemPrice(item.cart_item_id, e.target.value)}
                          readOnly={!!item.is_fixed_price}
                          className={`w-20 h-6 text-center text-sm p-0 ${item.is_fixed_price ? 'bg-muted cursor-not-allowed' : ''}`}
                          title={item.is_fixed_price ? (language === 'ar' ? 'سعر ثابت - لا يمكن تعديله' : 'Prix fixe - non modifiable') : ''}
                        />
                      </TableCell>
                      <TableCell className="text-center py-1">
                        <Input
                          type="number" min="0" max="100"
                          value={item.discount_percent || ''}
                          onChange={(e) => updateCartItemDiscount(item.cart_item_id, e.target.value)}
                          className="w-12 h-6 text-center text-sm p-0"
                        />
                      </TableCell>
                      <TableCell className="text-center font-semibold text-sm py-1">{formatCurrency(item.total)}</TableCell>
                      <TableCell className="py-1">
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost" size="icon"
                            className={`h-6 w-6 ${item.note ? 'text-primary' : 'text-muted-foreground'}`}
                            onClick={() => setNoteItemId(noteItemId === item.cart_item_id ? null : item.cart_item_id)}
                            title={language === 'ar' ? 'ملاحظة' : 'Note'}
                          >
                            <MessageSquare className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => removeFromCart(item.cart_item_id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Inline note row */}
                    {noteItemId === item.cart_item_id && (
                      <TableRow key={`${item.cart_item_id}-note`} className="bg-primary/5">
                        <TableCell colSpan={7} className="py-1 px-2">
                          <Input
                            autoFocus
                            placeholder={language === 'ar' ? 'ملاحظة على هذا المنتج...' : 'Note pour cet article...'}
                            value={item.note || ''}
                            onChange={e => updateCartItemNote(item.cart_item_id, e.target.value)}
                            className="h-7 text-xs"
                            onKeyDown={e => e.key === 'Escape' && setNoteItemId(null)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              )}
            </TableBody>
          </Table>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-2 p-2">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{language === 'ar' ? 'أضف منتجات' : 'Ajoutez des articles'}</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.cart_item_id || item.product_id} className={`p-3 rounded-lg border ${item.is_return ? 'bg-red-50 border-red-200' : 'bg-muted/20'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">{item.article_code || item.barcode}</p>
                      {item.serial_number && <p className="text-[10px] font-mono text-muted-foreground">SN: {item.serial_number}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => removeFromCart(item.cart_item_id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartItemQuantity(item.cart_item_id, item.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                      <Input type="number" value={item.quantity} onChange={(e) => updateCartItemQuantity(item.cart_item_id, parseInt(e.target.value) || 1)} className="w-12 h-7 text-center text-sm" />
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateCartItemQuantity(item.cart_item_id, item.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                    </div>
                    <div className="text-end">
                      <p className="text-xs text-muted-foreground">{formatCurrency(item.unit_price)} x {item.quantity}</p>
                      <p className="font-bold text-sm">{formatCurrency(item.total)}</p>
                    </div>
                  </div>
                  {/* Mobile note */}
                  <Input
                    placeholder={language === 'ar' ? 'ملاحظة...' : 'Note...'}
                    value={item.note || ''}
                    onChange={e => updateCartItemNote(item.cart_item_id, e.target.value)}
                    className="mt-2 h-7 text-xs"
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Payment Type Selector ── */}
        <div className="border-t px-2 pt-2 space-y-1.5">
          <div className="flex gap-1">
            {paymentTypes.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => {
                  setPaymentType(key);
                  if (key === 'installment') onInstallmentClick?.();
                }}
                className={`flex-1 min-w-[48px] flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-lg border text-[11px] font-medium transition-all ${
                  paymentType === key
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-primary'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Cash amount input + change */}
          {(paymentType === 'cash' || paymentType === 'partial') && (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground shrink-0 w-20">
                    {language === 'ar' ? 'مبلغ مُقدَّم:' : 'Remis par client:'}
                  </span>
                  <Input
                    type="number"
                    value={paidAmount || ''}
                    onChange={e => setPaidAmount(parseFloat(e.target.value) || 0)}
                    placeholder={paymentType === 'partial'
                      ? (language === 'ar' ? 'المبلغ المدفوع...' : 'Montant payé...')
                      : (language === 'ar' ? 'اختياري...' : 'Optionnel...')}
                    className="h-6 text-sm text-center flex-1"
                    min={0}
                  />
                </div>
              </div>
              {change > 0 && (
                <div className="shrink-0 flex items-center gap-1 bg-emerald-100 border border-emerald-300 text-emerald-700 rounded-md px-2 py-1">
                  <ArrowDownUp className="h-3 w-3" />
                  <span className="text-[11px] font-bold">{language === 'ar' ? 'الباقي:' : 'Monnaie:'} {change.toLocaleString()} DA</span>
                </div>
              )}
              {paymentType === 'partial' && paidAmount > 0 && paidAmount < total && (
                <div className="shrink-0 text-[10px] text-amber-600">
                  {language === 'ar' ? `دين: ${(total - paidAmount).toLocaleString()} DA` : `Reste: ${(total - paidAmount).toLocaleString()} DA`}
                </div>
              )}
            </div>
          )}

          {/* Mixed payment inputs */}
          {paymentType === 'mixed' && (
            <div className="flex flex-col gap-1.5 p-2 bg-muted/30 rounded-lg border">
              <div className="flex items-center gap-2">
                <Banknote className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="text-[10px] text-muted-foreground shrink-0 w-16">{language === 'ar' ? 'نقدي:' : 'Espèces:'}</span>
                <Input type="number" value={mixedCash || ''} onChange={e => setMixedCash?.(parseFloat(e.target.value) || 0)} placeholder="0" className="h-6 text-sm text-center flex-1" min={0} />
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="text-[10px] text-muted-foreground shrink-0 w-16">{language === 'ar' ? 'بنك/شيك:' : 'Virement:'}</span>
                <Input type="number" value={mixedBank || ''} onChange={e => setMixedBank?.(parseFloat(e.target.value) || 0)} placeholder="0" className="h-6 text-sm text-center flex-1" min={0} />
              </div>
              {((mixedCash || 0) + (mixedBank || 0)) > 0 && (() => {
                const paid = (mixedCash || 0) + (mixedBank || 0);
                const diff = paid - total;
                const ok = Math.abs(diff) < 0.01;
                return (
                  <div className={`text-[10px] text-center px-2 py-0.5 rounded-md font-medium ${ok ? 'bg-emerald-100 text-emerald-700' : diff > 0 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {language === 'ar'
                      ? `المجموع: ${paid.toLocaleString()} DA ${ok ? '✓' : diff > 0 ? `| باقي: ${diff.toLocaleString()} DA` : `| ناقص: ${(-diff).toLocaleString()} DA`}`
                      : `Total: ${paid.toLocaleString()} DA ${ok ? '✓' : diff > 0 ? `| Rendu: ${diff.toLocaleString()} DA` : `| Manque: ${(-diff).toLocaleString()} DA`}`
                    }
                  </div>
                );
              })()}
            </div>
          )}

          {/* Installment summary */}
          {paymentType === 'installment' && installmentPlan && (
            <div
              className="flex items-center gap-2 text-[10px] bg-primary/5 border border-primary/20 rounded-md px-2 py-1 cursor-pointer hover:bg-primary/10"
              onClick={() => onInstallmentClick?.()}
            >
              <CalendarDays className="h-3 w-3 text-primary shrink-0" />
              <span className="text-primary font-medium">
                {language === 'ar'
                  ? `مقدم: ${installmentPlan.down_payment?.toLocaleString()} | ${installmentPlan.installments_count} أقساط | فائدة: ${installmentPlan.interest_rate}%`
                  : `Acompte: ${installmentPlan.down_payment?.toLocaleString()} | ${installmentPlan.installments_count} versements | ${installmentPlan.interest_rate}%`}
              </span>
            </div>
          )}
        </div>

        {/* ── Totals & Actions ── */}
        <div className="border-t p-2 pt-1.5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
            {/* Totals */}
            <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto justify-center sm:justify-start">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">{language === 'ar' ? 'الفرعي' : 'Sous-total'}</p>
                <p className="text-sm font-bold">{formatCurrency(subtotal)}</p>
              </div>
              {/* Discount with DA/% toggle */}
              <div className="text-center">
                <div className="flex items-center gap-0.5 mb-0.5 justify-center">
                  <p className="text-[10px] text-muted-foreground">{language === 'ar' ? 'خصم' : 'Remise'}</p>
                  <button
                    onClick={() => setDiscountMode?.(discountMode === 'amount' ? 'percent' : 'amount')}
                    className={`text-[9px] px-1 rounded border transition-colors ${
                      discountMode === 'percent'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'text-muted-foreground border-border hover:border-primary/40'
                    }`}
                    title={discountMode === 'percent' ? 'DA' : '%'}
                  >
                    {discountMode === 'percent' ? '%' : 'DA'}
                  </button>
                </div>
                <div className="flex items-center gap-0.5">
                  <Input
                    type="number"
                    value={discountDisplayValue || ''}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    className="w-14 sm:w-16 h-6 text-center text-sm"
                    min={0}
                    max={discountMode === 'percent' ? 100 : subtotal}
                  />
                  {discountMode === 'percent' && (
                    <span className="text-[10px] text-muted-foreground">%</span>
                  )}
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">{language === 'ar' ? 'الإجمالي' : 'Total'}</p>
                <p className="text-base sm:text-lg font-bold text-primary">{formatCurrency(total)}</p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              {/* Park cart */}
              <Button
                variant="outline"
                onClick={parkCart}
                disabled={cart.length === 0}
                className="h-9 px-2 gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                title={language === 'ar' ? 'حفظ السلة مؤقتاً' : 'Mettre en attente'}
              >
                <PauseCircle className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">{language === 'ar' ? 'حفظ' : 'Attente'}</span>
              </Button>
              <Button
                variant="outline"
                onClick={clearCart}
                className="h-9 px-3 gap-1 flex-1 sm:flex-none"
                data-testid="annuler-btn"
              >
                <X className="h-4 w-4" />
                {language === 'ar' ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button
                onClick={completeSale}
                disabled={loading || cart.length === 0 || !hasOpenSession}
                className="h-9 px-4 gap-1 flex-1 sm:flex-none"
                data-testid="vente-btn"
              >
                <Check className="h-4 w-4" />
                {language === 'ar' ? 'تأكيد' : 'Valider'}
                <Badge variant="secondary" className="text-[10px] ms-1 hidden sm:inline">F10</Badge>
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Parked Carts Dialog ── */}
      <Dialog open={showParkedDialog} onOpenChange={setShowParkedDialog}>
        <DialogContent dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              {language === 'ar' ? 'السلات المحفوظة' : 'Paniers en attente'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {parkedCarts?.map(p => {
              const cust = customers?.find(c => c.id === p.customerId);
              const itemCount = p.cart?.reduce((s, i) => s + (i.quantity || 0), 0) || 0;
              const cartTotal = p.cart?.reduce((s, i) => s + (i.total || 0), 0) - (p.discount || 0);
              const timeLabel = new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{cust?.name || (language === 'ar' ? 'زبون عام' : 'Client général')}</p>
                    <p className="text-xs text-muted-foreground">
                      {itemCount} {language === 'ar' ? 'صنف' : 'articles'} — {cartTotal?.toLocaleString()} DA — {timeLabel}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" className="h-8 gap-1" onClick={() => { resumeParkedCart(p.id); setShowParkedDialog(false); }}>
                      <PlayCircle className="h-3.5 w-3.5" />
                      {language === 'ar' ? 'استئناف' : 'Reprendre'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => deleteParkedCart(p.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
