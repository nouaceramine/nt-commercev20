import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Truck, Package, X, CheckCircle2, MapPin, Phone, User, Hash, Calendar, Printer } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../lib/apiClient';
import { CHANNELS, ORDER_STATUSES, NEXT_STATUSES, SHIPPING_PROVIDERS } from './ecomConstants';
import { printEcomOrderInvoice } from '../../lib/ecomOrderInvoice';

export function EcomOrderDetailDialog({ open, onOpenChange, order, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [shippingProvider, setShippingProvider] = useState('yalidine');
  const [storeName, setStoreName] = useState('متجر إلكتروني');
  const [fin, setFin] = useState(null);  // p59: accounting ledger row
  const [refundFee, setRefundFee] = useState('');    // p71: per-order return fee
  const [refundOpen, setRefundOpen] = useState(false);
  const [packCost, setPackCost] = useState('');      // p71: packaging cost

  // Fetch tenant store name once when the dialog first opens
  useEffect(() => {
    if (!open) return;
    apiClient.get('/settings/tenant-branding')
      .then(res => {
        const data = res?.data?.value || res?.data || {};
        const name = data.store_name || data.name || data.company_name;
        if (name) setStoreName(name);
      })
      .catch(() => {/* keep default */});
  }, [open]);

  // p59: fetch the order's accounting breakdown (exists after confirmation)
  useEffect(() => {
    setFin(null);
    setRefundOpen(false); setRefundFee('');
    setPackCost(order?.packaging_cost != null ? String(order.packaging_cost) : '');
    if (!open || !order?.id) return;
    apiClient.get(`/ecom/orders/${order.id}/financials`)
      .then(res => setFin(res.data))
      .catch(() => setFin(null));
  }, [open, order?.id]);

  if (!order) return null;

  const channelMeta = CHANNELS[order.channel] || CHANNELS.manual;
  const statusMeta = ORDER_STATUSES[order.status] || ORDER_STATUSES.new;
  const nextOptions = NEXT_STATUSES[order.status] || [];

  const savePackaging = async () => {
    setBusy(true);
    try {
      await apiClient.put(`/ecom/orders/${order.id}`, { packaging_cost: parseFloat(packCost) || 0 });
      toast.success('تم حفظ تكلفة التغليف');
      onUpdated?.();
    } catch { toast.error('فشل حفظ تكلفة التغليف'); }
    finally { setBusy(false); }
  };

  const transition = async (toStatus) => {
    setBusy(true);
    try {
      const body = { status: toStatus };
      if (toStatus === 'refunded' && refundFee !== '') body.return_fee = parseFloat(refundFee) || 0;
      const res = await apiClient.put(`/ecom/orders/${order.id}/status`, body);
      setRefundOpen(false); setRefundFee('');
      toast.success(`تم تحديث الحالة إلى: ${ORDER_STATUSES[toStatus].labelAr}`);

      // ── Inventory feedback ──
      const inv = res?.data?.inventory;
      if (inv) {
        if (inv.deducted?.length > 0) {
          const lines = inv.deducted.map(d => `• ${d.name}: -${d.qty} → المتبقي ${d.stock_after}`).join('\n');
          toast.success(`📦 خُصِم من المخزون:\n${lines}`, { duration: 6000 });
        }
        if (inv.restored?.length > 0) {
          const total = inv.restored.reduce((s, r) => s + r.qty, 0);
          toast.success(`📦 أُعيد للمخزون: ${total} وحدة عبر ${inv.restored.length} منتج`, { duration: 4000 });
        }
        (inv.warnings || []).forEach(w => toast.warning(w, { duration: 8000 }));
      }
      onUpdated?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل تحديث الحالة');
    } finally {
      setBusy(false);
    }
  };

  const createShippingLabel = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post('/ecom/shipping/labels', {
        order_id: order.id,
        provider: shippingProvider,
      });
      toast.success(`تم إنشاء بطاقة شحن — رقم التتبع: ${res.data.tracking_number}`);
      onUpdated?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل إنشاء بطاقة الشحن');
    } finally {
      setBusy(false);
    }
  };

  const deleteOrder = async () => {
    if (!window.confirm(`هل تريد حذف الطلب ${order.order_code} نهائياً؟`)) return;
    setBusy(true);
    try {
      await apiClient.delete(`/ecom/orders/${order.id}`);
      toast.success('تم حذف الطلب');
      onOpenChange(false);
      onUpdated?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل الحذف');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <span className="text-xl">{channelMeta.icon}</span>
            <span className="font-mono text-lg">{order.order_code}</span>
            <Badge className={statusMeta.color}>{statusMeta.labelAr}</Badge>
            <Badge className={channelMeta.color}>{channelMeta.labelAr}</Badge>
            {order.inventory_deducted && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200" data-testid="inventory-deducted-badge">
                📦 مخصوم من المخزون
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            <Calendar className="inline w-3 h-3 ml-1" />
            {new Date(order.created_at).toLocaleString('ar-DZ')}
          </DialogDescription>
        </DialogHeader>

        {/* Customer */}
        <div className="bg-muted/30 p-3 rounded-lg space-y-1 border">
          <div className="font-semibold flex items-center gap-2"><User className="w-4 h-4" /> {order.customer?.name || '—'}</div>
          {order.customer?.phone && <div className="text-sm text-muted-foreground flex items-center gap-2"><Phone className="w-3 h-3" /> {order.customer.phone}</div>}
          {(order.customer?.address || order.customer?.city || order.customer?.wilaya) && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <MapPin className="w-3 h-3" />
              {[order.customer.address, order.customer.city, order.customer.wilaya].filter(Boolean).join('، ')}
            </div>
          )}
        </div>

        {/* Items */}
        <div>
          {order.cod_risk && (
            <div className={`p-3 rounded-lg border text-sm ${
              order.cod_risk.risk_score >= 61 ? 'bg-red-50 border-red-200' :
              order.cod_risk.risk_score >= 31 ? 'bg-amber-50 border-amber-200' :
              'bg-green-50 border-green-200'
            }`}>
              <div className="font-semibold mb-1">
                تقييم مخاطر الدفع عند الاستلام: {order.cod_risk.risk_score}/100 — {order.cod_risk.action_ar}
              </div>
              {order.cod_risk.reasons?.length > 0 && (
                <ul className="list-disc pr-5 text-xs text-muted-foreground space-y-0.5">
                  {order.cod_risk.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="text-xs font-semibold text-muted-foreground mb-2">المنتجات ({order.items?.length || 0})</div>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-right p-2">المنتج</th>
                <th className="text-right p-2">SKU</th>
                <th className="text-right p-2">الكمية</th>
                <th className="text-right p-2">السعر</th>
                <th className="text-right p-2">المجموع</th>
              </tr>
            </thead>
            <tbody>
              {(order.items || []).map((it, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{it.name}</td>
                  <td className="p-2 text-muted-foreground">{it.sku || '—'}</td>
                  <td className="p-2">{it.qty}</td>
                  <td className="p-2">{Number(it.price).toLocaleString()} دج</td>
                  <td className="p-2 font-semibold">{Number(it.total).toLocaleString()} دج</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-3 space-y-1 flex-col text-sm">
            <div>المجموع الفرعي: <span className="font-semibold">{Number(order.subtotal).toLocaleString()} دج</span></div>
            <div>الشحن: <span className="font-semibold">{Number(order.shipping_fee).toLocaleString()} دج</span></div>
            <div className="flex items-center gap-2 mt-1" data-testid="packaging-cost-row">
              <span>التغليف:</span>
              {['new', 'confirmed', 'packed'].includes(order.status) ? (
                <>
                  <input type="number" min="0" className="border rounded px-2 py-0.5 w-24 text-sm" value={packCost} onChange={e => setPackCost(e.target.value)} data-testid="packaging-cost-input" />
                  <span>دج</span>
                  <Button size="sm" variant="outline" disabled={busy} onClick={savePackaging} data-testid="packaging-cost-save">حفظ</Button>
                </>
              ) : (
                <span className="font-semibold">{Number(order.packaging_cost || 0).toLocaleString()} دج</span>
              )}
            </div>
            <div className="text-lg font-bold text-emerald-700">الإجمالي: {Number(order.total).toLocaleString()} دج</div>
          </div>

          {/* p59: accounting breakdown — profit on confirm/delivery, losses on return */}
          {fin && (
            <div className="border rounded-lg p-3 mt-3 text-sm space-y-1 bg-slate-50" data-testid="order-financials">
              <div className="font-semibold mb-1">💰 القيد المحاسبي</div>
              <div className="flex justify-between"><span>الإيراد</span><span>{Number(fin.revenue).toLocaleString()} دج</span></div>
              <div className="flex justify-between"><span>تكلفة البضاعة</span><span>-{Number(fin.cogs).toLocaleString()} دج</span></div>
              <div className="flex justify-between"><span>الشحن</span><span>-{Number(fin.shipping_fee).toLocaleString()} دج</span></div>
              {Number(fin.packaging_cost || 0) > 0 && <div className="flex justify-between"><span>التغليف</span><span>-{Number(fin.packaging_cost).toLocaleString()} دج</span></div>}
              {fin.status === 'returned' ? (
                <>
                  <div className="flex justify-between text-red-700"><span>سعر الإرجاع ({order.courier || 'الناقل'})</span><span>-{Number(fin.return_fee).toLocaleString()} دج</span></div>
                  <div className="flex justify-between font-bold text-red-700 border-t pt-1"><span>الخسارة الإجمالية (شحن + إرجاع)</span><span>{Number(fin.losses).toLocaleString()} دج</span></div>
                </>
              ) : (
                <div className="flex justify-between font-bold text-emerald-700 border-t pt-1">
                  <span>{fin.status === 'realized' ? 'الفائدة المحققة' : 'الفائدة المتوقعة'}</span>
                  <span>{Number(fin.status === 'realized' ? fin.realized_profit : fin.expected_profit).toLocaleString()} دج</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tracking */}
        {order.tracking_number && (
          <div className="bg-cyan-50 border border-cyan-200 p-3 rounded-lg flex items-center gap-3">
            <Truck className="w-5 h-5 text-cyan-700" />
            <div className="text-sm">
              <div className="font-semibold text-cyan-900">رقم التتبع: <span className="font-mono">{order.tracking_number}</span></div>
              <div className="text-xs text-cyan-700">المُرسِل: {SHIPPING_PROVIDERS[order.courier]?.labelAr || order.courier}</div>
            </div>
          </div>
        )}

        {/* Status transitions */}
        {nextOptions.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">تغيير الحالة</div>
            <div className="flex flex-wrap gap-2">
              {nextOptions.map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === 'cancelled' || s === 'refunded' ? 'destructive' : 'default'}
                  disabled={busy}
                  onClick={() => s === 'refunded' ? setRefundOpen(true) : transition(s)}
                  data-testid={`order-transition-${s}`}
                >
                  <CheckCircle2 className="w-3 h-3 ml-1" />
                  {ORDER_STATUSES[s].labelAr}
                </Button>
              ))}
              {refundOpen && (
                <div className="flex flex-wrap items-center gap-2 border border-red-200 bg-red-50 rounded-lg p-2 mt-2" data-testid="refund-fee-panel">
                  <span className="text-sm text-red-800">حق الاسترداد لشركة الشحن (دج):</span>
                  <input type="number" min="0" className="border rounded px-2 py-1 w-28 text-sm bg-white" value={refundFee} onChange={e => setRefundFee(e.target.value)} placeholder="0" data-testid="refund-fee-input" />
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => transition('refunded')} data-testid="refund-confirm-btn">تأكيد الاسترداد</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRefundOpen(false)}>إلغاء</Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Shipping label creation */}
        {!order.shipping_label_id && ['confirmed', 'packed'].includes(order.status) && (
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg space-y-2">
            <div className="font-semibold text-amber-900 flex items-center gap-2"><Package className="w-4 h-4" /> إنشاء بطاقة شحن</div>
            <div className="flex items-center gap-2">
              <Select value={shippingProvider} onValueChange={setShippingProvider}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SHIPPING_PROVIDERS).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{m.labelAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={createShippingLabel} disabled={busy} data-testid="create-shipping-label-btn">
                <Truck className="w-4 h-4 ml-1" />
                إنشاء بطاقة + شحن
              </Button>
            </div>
            <p className="text-xs text-amber-800">
              ⚠️ المرحلة الحالية (P1) تعمل بمحاكاة فقط — التكامل الفعلي مع يالدين/ZR/Maystro يأتي في P2.
            </p>
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div className="text-sm">
            <div className="text-xs font-semibold text-muted-foreground mb-1">ملاحظات</div>
            <div className="p-2 bg-muted/30 rounded border whitespace-pre-wrap">{order.notes}</div>
          </div>
        )}

        {/* Status history */}
        {order.status_history && order.status_history.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-muted-foreground">تاريخ الحالة ({order.status_history.length})</summary>
            <ul className="mt-2 space-y-1 ps-4">
              {order.status_history.map((h, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Hash className="w-3 h-3 text-muted-foreground" />
                  <Badge variant="outline" className={ORDER_STATUSES[h.status]?.color}>{ORDER_STATUSES[h.status]?.labelAr || h.status}</Badge>
                  <span className="text-muted-foreground">{new Date(h.at).toLocaleString('ar-DZ')}</span>
                  {h.note && <span className="text-muted-foreground">— {h.note}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex justify-between pt-2 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              const res = printEcomOrderInvoice({ storeName, order });
              if (!res.ok && res.reason === 'popup_blocked') {
                toast.error('يرجى السماح بالنوافذ المنبثقة لطباعة الفاتورة');
              }
            }} data-testid="order-print-invoice-btn">
              <Printer className="w-4 h-4 ml-1" />
              طباعة / PDF
            </Button>
            {['cancelled', 'refunded'].includes(order.status) && (
              <Button variant="destructive" onClick={deleteOrder} disabled={busy} data-testid="order-delete-btn">
                <X className="w-4 h-4 ml-1" /> حذف نهائي
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
