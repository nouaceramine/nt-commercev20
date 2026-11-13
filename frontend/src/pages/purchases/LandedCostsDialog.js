import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../lib/apiClient';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import { Plus, Trash2, Ship, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// D3: تكاليف الشحن/الجمركة موزعة على أصناف الفاتورة للوصول لتكلفة الوحدة الحقيقية
export default function LandedCostsDialog({ purchase, onClose, onChanged, language, t }) {
  const isAr = language === 'ar';
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [landed, setLanded] = useState(null);
  const [extras, setExtras] = useState([{ label: '', amount: '' }]);
  const [method, setMethod] = useState('value');
  const [applyToCost, setApplyToCost] = useState(false);

  const load = useCallback(async () => {
    if (!purchase) return;
    setLoading(true);
    try {
      const r = await apiClient.get(`/purchases/${purchase.id}/landed`);
      const l = r.data?.landed;
      setLanded(l);
      if (l) {
        setExtras(l.extras.map(e => ({ label: e.label, amount: String(e.amount) })));
        setMethod(l.method || 'value');
        setApplyToCost(false);
      }
    } catch { toast.error(isAr ? 'تعذر التحميل' : 'Erreur'); }
    setLoading(false);
  }, [purchase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (purchase) { setLanded(null); setExtras([{ label: '', amount: '' }]); setMethod('value'); setApplyToCost(false); load(); } }, [purchase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!purchase) return null;

  const setEx = (i, k, v) => setExtras(prev => prev.map((e, j) => j === i ? { ...e, [k]: v } : e));
  const addEx = () => extras.length < 10 && setExtras(prev => [...prev, { label: '', amount: '' }]);
  const rmEx = (i) => setExtras(prev => prev.filter((_, j) => j !== i));

  const save = async () => {
    const cleaned = extras.map(e => ({ label: (e.label || '').trim(), amount: parseFloat(e.amount) || 0 })).filter(e => e.label);
    if (cleaned.length === 0) { toast.error(isAr ? 'أضف تكلفة واحدة على الأقل' : 'Ajoutez un cout'); return; }
    setBusy(true);
    try {
      await apiClient.put(`/purchases/${purchase.id}/landed`, { extras: cleaned, method, apply_to_cost: applyToCost });
      toast.success(isAr ? 'حُسبت التكاليف الحقيقية' : 'Couts calcules');
      await load();
      onChanged && onChanged();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : (isAr ? 'تعذر الحفظ' : 'Erreur'));
    }
    setBusy(false);
  };

  const revert = async () => {
    setBusy(true);
    try {
      const r = await apiClient.delete(`/purchases/${purchase.id}/landed`);
      toast.success(isAr ? `أُزيلت التكاليف${r.data?.reverted ? ' ورُجّعت أسعار التكلفة' : ''}` : 'Supprime');
      setLanded(null); setExtras([{ label: '', amount: '' }]);
      onChanged && onChanged();
    } catch { toast.error(isAr ? 'تعذر الحذف' : 'Erreur'); }
    setBusy(false);
  };

  const totalExtra = extras.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const alloc = landed?.allocation;

  return (
    <Dialog open={!!purchase} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="landed-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Ship className="h-5 w-5" />
            {isAr ? 'التكاليف الإضافية (شحن/جمركة)' : 'Couts additionnels'} — {purchase.invoice_number}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{isAr ? 'بنود التكلفة' : 'Lignes de cout'}</span>
                {(!landed || !landed.applied) && (
                  <Button type="button" size="sm" variant="outline" onClick={addEx} disabled={extras.length >= 10} data-testid="landed-add-extra">
                    <Plus className="h-3 w-3" /> {isAr ? 'بند' : 'Ligne'}
                  </Button>
                )}
              </div>
              {extras.map((e, i) => (
                <div key={i} className="flex gap-2">
                  <input className="flex-1 h-9 rounded-md border bg-background px-2" placeholder={isAr ? 'شحن، جمركة، تخليص...' : 'Fret, douane...'}
                    value={e.label} onChange={(ev) => setEx(i, 'label', ev.target.value)}
                    disabled={landed?.applied} data-testid={`landed-label-${i}`} />
                  <input dir="ltr" type="number" min="0" className="w-32 h-9 rounded-md border bg-background px-2" placeholder="0.00"
                    value={e.amount} onChange={(ev) => setEx(i, 'amount', ev.target.value)}
                    disabled={landed?.applied} data-testid={`landed-amount-${i}`} />
                  {(!landed || !landed.applied) && extras.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => rmEx(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-4 flex-wrap pt-1">
                <label className="flex items-center gap-2">
                  <span>{isAr ? 'التوزيع' : 'Repartition'}</span>
                  <select className="h-9 rounded-md border bg-background px-2" value={method} onChange={(e) => setMethod(e.target.value)}
                    disabled={landed?.applied} data-testid="landed-method">
                    <option value="value">{isAr ? 'حسب القيمة' : 'Par valeur'}</option>
                    <option value="quantity">{isAr ? 'حسب الكمية' : 'Par quantite'}</option>
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={applyToCost} onChange={(e) => setApplyToCost(e.target.checked)}
                    disabled={landed?.applied} data-testid="landed-apply" />
                  {isAr ? 'اعتمد تكلفة الوحدة الحقيقية كسعر تكلفة للمنتج' : 'Appliquer comme cout produit'}
                </label>
              </div>
              <div className="text-xs text-muted-foreground">
                {isAr ? `إجمالي التكاليف: ${totalExtra.toFixed(2)} ${t.currency}` : `Total: ${totalExtra.toFixed(2)}`}
              </div>
            </div>

            {alloc && (
              <div className="space-y-2" data-testid="landed-allocation">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{isAr ? 'التوزيع المحسوب' : 'Repartition calculee'}</span>
                  {landed.applied
                    ? <Badge className="bg-emerald-100 text-emerald-700" data-testid="landed-applied-badge">{isAr ? 'مُطبَّقة على الأسعار' : 'Applique'}</Badge>
                    : <Badge variant="outline">{isAr ? 'محسوبة فقط' : 'Calcule'}</Badge>}
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-start">{isAr ? 'الصنف' : 'Article'}</th>
                        <th className="p-2">{isAr ? 'الكمية' : 'Qte'}</th>
                        <th className="p-2">{isAr ? 'سعر الوحدة' : 'PU'}</th>
                        <th className="p-2">{isAr ? 'الحصة' : 'Part'}</th>
                        <th className="p-2">{isAr ? 'التكلفة الحقيقية' : 'Cout reel'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alloc.lines.map((ln, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{ln.product_name}</td>
                          <td className="p-2 text-center" dir="ltr">{ln.quantity}</td>
                          <td className="p-2 text-center" dir="ltr">{ln.unit_price.toFixed(2)}</td>
                          <td className="p-2 text-center" dir="ltr">{ln.allocated.toFixed(2)}</td>
                          <td className="p-2 text-center font-semibold text-emerald-700" dir="ltr">{ln.landed_unit_cost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t">
                      <tr>
                        <td className="p-2 font-medium" colSpan={3}>{isAr ? 'الإجمالي' : 'Total'}</td>
                        <td className="p-2 text-center font-semibold" dir="ltr">{alloc.total_extra.toFixed(2)}</td>
                        <td className="p-2 text-center font-semibold" dir="ltr">{alloc.grand_total.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2 border-t">
              <div>
                {landed && (
                  <Button type="button" variant="outline" size="sm" onClick={revert} disabled={busy} data-testid="landed-revert">
                    {isAr ? 'تراجع وحذف' : 'Annuler'}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose}>{t.cancel || (isAr ? 'إلغاء' : 'Fermer')}</Button>
                {(!landed || !landed.applied) && (
                  <Button type="button" size="sm" onClick={save} disabled={busy} data-testid="landed-save">
                    {busy ? (isAr ? 'جارٍ الحساب...' : 'Calcul...') : (isAr ? 'احسب التكاليف' : 'Calculer')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
