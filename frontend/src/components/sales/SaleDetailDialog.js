import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { toast } from 'sonner';
import {
  FileText, Edit2, Check, X, User, Calendar,
  CreditCard, RotateCcw, Banknote, Hash, Trash2,
} from 'lucide-react';
import PrintDocumentDialog from '../print/PrintDocumentDialog';

export default function SaleDetailDialog({
  saleId, open, onOpenChange,
  language, formatCurrency,
  customers = [],
  onUpdated, onReturn,
}) {
  const { isAdmin } = useAuth();
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPrintDoc, setShowPrintDoc] = useState(false);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [editNotes, setEditNotes] = useState('');
  const [editCustomerId, setEditCustomerId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentCashBox, setPaymentCashBox] = useState('');

  const ar = language === 'ar';

  useEffect(() => {
    if (open && saleId) {
      setEditMode(false);
      setPaymentAmount('');
      fetchSale();
      fetchCashBoxes();
    }
  }, [open, saleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSale = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/sales/${saleId}`);
      setSale(res.data);
      setEditNotes(res.data.notes || '');
      setEditCustomerId(res.data.customer_id || '');
    } catch {
      toast.error(ar ? 'خطأ في جلب البيانات' : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const fetchCashBoxes = async () => {
    try {
      const res = await apiClient.get('/cash-boxes');
      const boxes = res.data || [];
      setCashBoxes(boxes);
      if (boxes.length === 1) setPaymentCashBox(boxes[0].id);
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        notes: editNotes,
        customer_id: editCustomerId || null,
      };
      const amt = parseFloat(paymentAmount);
      if (!isNaN(amt) && amt > 0) {
        data.payment_amount = amt;
        if (paymentCashBox) data.cash_box_id = paymentCashBox;
      }
      const res = await apiClient.put(`/sales/${saleId}`, data);
      setSale(res.data);
      setEditMode(false);
      setPaymentAmount('');
      toast.success(ar ? 'تم التحديث بنجاح' : 'Mis à jour avec succès');
      onUpdated?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'خطأ في التحديث' : 'Erreur'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteReason.trim()) { toast.error(ar ? 'يجب إدخال سبب الحذف' : 'La raison est obligatoire'); return; }
    setDeleting(true);
    try {
      await apiClient.delete(`/sales/${saleId}`, { data: { reason: deleteReason } });
      toast.success(ar ? 'تم حذف المبيعة' : 'Vente supprimée');
      setShowDeleteDialog(false);
      onOpenChange(false);
      onUpdated?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? 'خطأ في الحذف' : 'Erreur de suppression'));
    } finally {
      setDeleting(false);
    }
  };

  const cancelEdit = () => {
    setEditMode(false);
    setPaymentAmount('');
    if (sale) {
      setEditNotes(sale.notes || '');
      setEditCustomerId(sale.customer_id || '');
    }
  };

  const fmt = (n) => (typeof formatCurrency === 'function' ? formatCurrency(n) : (n || 0).toFixed(2));

  const paymentMethodLabel = (method, type) => {
    const m = { cash: ar ? 'نقدي' : 'Espèces', bank: ar ? 'بنك' : 'Virement', wallet: ar ? 'محفظة' : 'Portefeuille', mixed: ar ? 'مختلط' : 'Mixte' };
    const p = { cash: ar ? 'دفع كامل' : 'Paiement complet', credit: ar ? 'آجل' : 'Crédit', partial: ar ? 'جزئي' : 'Partiel', installment: ar ? 'أقساط' : 'Versements', mixed: ar ? 'مختلط' : 'Mixte' };
    return `${m[method] || method} · ${p[type] || type}`;
  };

  const statusBadge = (s) => {
    if (!s) return null;
    if (s.status === 'returned') return <Badge variant="destructive">{ar ? 'مُرجَع' : 'Retourné'}</Badge>;
    const ps = s.payment_status || s.status;
    if (ps === 'paid') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">{ar ? 'مدفوع' : 'Payé'}</Badge>;
    if (ps === 'partial') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">{ar ? 'جزئي' : 'Partiel'}</Badge>;
    if (ps === 'unpaid' || (s.remaining > 0 && !s.paid_amount)) return <Badge className="bg-red-100 text-red-700">{ar ? 'غير مدفوع' : 'Impayé'}</Badge>;
    return <Badge variant="outline">{ps}</Badge>;
  };

  const canRecordPayment = sale && (sale.remaining > 0.01) && sale.status !== 'returned';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          dir={ar ? 'rtl' : 'ltr'}
        >
          <DialogHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Hash className="h-4 w-4" />
                {sale?.invoice_number || (ar ? 'تفاصيل البيع' : 'Détails de la vente')}
                {sale?.code && (
                  <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                    {sale.code}
                  </span>
                )}
              </DialogTitle>
              {sale && statusBadge(sale)}
            </div>
          </DialogHeader>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {ar ? 'جاري التحميل...' : 'Chargement...'}
            </div>
          ) : sale ? (
            <div className="space-y-4 text-sm">

              {/* ── Header metadata ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>{new Date(sale.created_at).toLocaleString(ar ? 'ar-DZ' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5 shrink-0" />
                  <span>{paymentMethodLabel(sale.payment_method, sale.payment_type)}</span>
                </div>
              </div>

              {/* ── Customer ── */}
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">{ar ? 'الزبون' : 'Client'}</p>
                  {editMode ? (
                    <Select
                      value={editCustomerId || 'walk-in'}
                      onValueChange={v => setEditCustomerId(v === 'walk-in' ? '' : v)}
                    >
                      <SelectTrigger className="h-7 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="walk-in">{ar ? 'زبون عابر' : 'Client passant'}</SelectItem>
                        {customers.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium">
                      {sale.customer_name || (ar ? 'زبون عابر' : 'Client passant')}
                    </p>
                  )}
                </div>
              </div>

              {/* ── Items table ── */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                  {ar ? 'الأصناف' : 'Articles'} ({sale.items?.length || 0})
                </p>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs">
                      <tr>
                        <th className="p-2 text-start font-medium">{ar ? 'المنتج' : 'Produit'}</th>
                        <th className="p-2 text-center font-medium">{ar ? 'الكمية' : 'Qté'}</th>
                        <th className="p-2 text-center font-medium">{ar ? 'السعر' : 'Prix'}</th>
                        <th className="p-2 text-center font-medium">{ar ? 'خصم' : 'Remise'}</th>
                        <th className="p-2 text-end font-medium">{ar ? 'الإجمالي' : 'Total'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(sale.items || []).map((item, i) => (
                        <>
                          <tr key={i} className="border-t hover:bg-muted/20 transition-colors">
                            <td className="p-2">
                              <p className="font-medium">{item.product_name}</p>
                              {item.barcode && (
                                <p className="text-xs text-muted-foreground font-mono">{item.barcode}</p>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                                {item.quantity}
                              </span>
                            </td>
                            <td className="p-2 text-center text-muted-foreground">{fmt(item.unit_price)}</td>
                            <td className="p-2 text-center">
                              {item.discount > 0
                                ? <span className="text-amber-600">- {fmt(item.discount)}</span>
                                : <span className="text-muted-foreground/40">—</span>
                              }
                            </td>
                            <td className="p-2 text-end font-semibold">{fmt(item.total)} DA</td>
                          </tr>
                          {item.note && (
                            <tr key={`${i}-note`}>
                              <td colSpan={5} className="px-3 pb-1.5 text-xs text-muted-foreground italic">
                                💬 {item.note}
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Totals ── */}
              <div className="p-3 bg-muted/30 rounded-lg space-y-1.5">
                <div className="flex justify-between text-muted-foreground">
                  <span>{ar ? 'المجموع الفرعي' : 'Sous-total'}</span>
                  <span>{fmt(sale.subtotal)} DA</span>
                </div>
                {sale.discount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>{ar ? 'الخصم' : 'Remise'}</span>
                    <span>- {fmt(sale.discount)} DA</span>
                  </div>
                )}
                {sale.delivery?.enabled && sale.delivery?.fee > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>{ar ? 'التوصيل' : 'Livraison'} ({sale.delivery.wilaya_name})</span>
                    <span>+ {fmt(sale.delivery.fee)} DA</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base border-t pt-1.5">
                  <span>{ar ? 'الإجمالي' : 'Total'}</span>
                  <span className="text-primary">{fmt(sale.total)} DA</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>{ar ? 'المدفوع' : 'Payé'}</span>
                  <span>{fmt(sale.paid_amount)} DA</span>
                </div>
                {(sale.remaining > 0.01) && (
                  <div className="flex justify-between text-destructive font-semibold">
                    <span>{ar ? 'المتبقي' : 'Restant'}</span>
                    <span>{fmt(sale.remaining)} DA</span>
                  </div>
                )}
              </div>

              {/* ── Mixed payment details ── */}
              {sale.payment_details && (
                <div className="p-3 border rounded-lg">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    {ar ? 'تفاصيل الدفع المختلط' : 'Détail paiement mixte'}
                  </p>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                      <span>{ar ? 'نقدي:' : 'Cash:'} {fmt(sale.payment_details.cash)} DA</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-blue-600" />
                      <span>{ar ? 'بنك:' : 'Virement:'} {fmt(sale.payment_details.bank)} DA</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Installment plan ── */}
              {sale.installment_plan && (
                <div className="p-3 border rounded-lg">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    {ar ? 'خطة الأقساط' : 'Plan de versements'}
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <span>{ar ? 'مقدم:' : 'Acompte:'} <b>{fmt(sale.installment_plan.down_payment)} DA</b></span>
                    <span>{ar ? 'عدد:' : 'Nb:'} <b>{sale.installment_plan.installments_count}</b></span>
                    <span>{ar ? 'فائدة:' : 'Intérêt:'} <b>{sale.installment_plan.interest_rate}%</b></span>
                    <span>{ar ? 'الفترة:' : 'Fréq:'} <b>{sale.installment_plan.frequency}</b></span>
                  </div>
                </div>
              )}

              {/* ── Notes ── */}
              <div>
                <Label className="text-xs text-muted-foreground">
                  {ar ? 'ملاحظات' : 'Notes'}
                </Label>
                {editMode ? (
                  <Textarea
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder={ar ? 'ملاحظات...' : 'Notes...'}
                    className="mt-1 text-sm resize-none"
                    rows={2}
                  />
                ) : (
                  <p className="mt-0.5 text-muted-foreground">
                    {sale.notes || <span className="opacity-50 italic">{ar ? 'لا توجد ملاحظات' : 'Aucune note'}</span>}
                  </p>
                )}
              </div>

              {/* ── Record additional payment ── */}
              {editMode && canRecordPayment && (
                <div className="p-3 border-2 border-primary/20 bg-primary/5 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-primary">
                    {ar ? 'تسجيل دفعة إضافية' : 'Enregistrer un paiement supplémentaire'}
                    <span className="text-muted-foreground font-normal ms-1">
                      ({ar ? 'متبقي:' : 'Restant:'} {fmt(sale.remaining)} DA)
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      placeholder={ar ? 'المبلغ المدفوع...' : 'Montant payé...'}
                      max={sale.remaining}
                      min={0}
                      className="h-8 text-sm flex-1"
                    />
                    {cashBoxes.length > 1 && (
                      <Select value={paymentCashBox} onValueChange={setPaymentCashBox}>
                        <SelectTrigger className="h-8 w-36 text-sm">
                          <SelectValue placeholder={ar ? 'الصندوق' : 'Caisse'} />
                        </SelectTrigger>
                        <SelectContent>
                          {cashBoxes.map(b => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              )}

              {/* ── Actions ── */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowPrintDoc(true)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {ar ? 'طباعة / معاينة' : 'Imprimer / Aperçu'}
                </Button>

                {sale.status !== 'returned' && (
                  editMode ? (
                    <>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={saving}
                        className="gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {ar ? 'حفظ التعديلات' : 'Enregistrer'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={cancelEdit}
                        className="gap-1.5"
                      >
                        <X className="h-3.5 w-3.5" />
                        {ar ? 'إلغاء' : 'Annuler'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditMode(true)}
                      className="gap-1.5"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      {ar ? 'تعديل' : 'Modifier'}
                    </Button>
                  )
                )}

                <div className="ms-auto flex gap-2">
                  {sale.status !== 'returned' && onReturn && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50"
                      onClick={() => { onOpenChange(false); onReturn(sale); }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {ar ? 'إرجاع' : 'Retourner'}
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => { setDeleteReason(''); setShowDeleteDialog(true); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {ar ? 'حذف' : 'Supprimer'}
                    </Button>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {ar ? 'لم يتم العثور على البيع' : 'Vente introuvable'}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PrintDocumentDialog
        open={showPrintDoc}
        onOpenChange={setShowPrintDoc}
        docType="sale"
        documentId={saleId}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent dir={ar ? 'rtl' : 'ltr'}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              {ar ? 'حذف المبيعة نهائياً' : 'Supprimer définitivement'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ar
                ? 'سيتم حذف المبيعة وإرجاع المخزون وإلغاء المعاملات المالية. لا يمكن التراجع عن هذا الإجراء.'
                : 'La vente sera supprimée, le stock restauré et les transactions annulées. Cette action est irréversible.'
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-2">
            <Label className="text-sm font-medium">
              {ar ? 'سبب الحذف (إلزامي)' : 'Raison de la suppression (obligatoire)'}
            </Label>
            <Textarea
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              placeholder={ar ? 'اكتب سبب الحذف...' : 'Saisir la raison...'}
              className="mt-1.5 text-sm resize-none"
              rows={2}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {ar ? 'إلغاء' : 'Annuler'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || !deleteReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (ar ? 'جاري الحذف...' : 'Suppression...') : (ar ? 'حذف نهائي' : 'Supprimer')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
