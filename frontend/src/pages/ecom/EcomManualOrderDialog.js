import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Plus, Trash2, ShoppingBag, Package } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../lib/apiClient';
import { CHANNELS } from './ecomConstants';
import { WILAYAS, getCommunes } from '../../data/algeriaGeo';

const EMPTY_ITEM = { name: '', sku: '', qty: 1, price: 0 };

export function EcomManualOrderDialog({ open, onOpenChange, onCreated, integrations = [] }) {
  const [channel, setChannel] = useState('manual');
  const [integrationId, setIntegrationId] = useState('');
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '', city: '', wilaya: '' });
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [shippingFee, setShippingFee] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setChannel('manual');
    setIntegrationId('');
    setCustomer({ name: '', phone: '', address: '', city: '', wilaya: '' });
    setItems([{ ...EMPTY_ITEM }]);
    setShippingFee(0);
    setNotes('');
  };

  const subtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.price || 0), 0);
  const total = subtotal + Number(shippingFee || 0);

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const submit = async () => {
    if (!customer.name.trim()) {
      toast.error('اسم الزبون مطلوب');
      return;
    }
    const validItems = items.filter(it => it.name.trim() && Number(it.qty) > 0);
    if (validItems.length === 0) {
      toast.error('أضف منتج واحد على الأقل');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        channel,
        integration_id: integrationId || null,
        customer,
        items: validItems.map(it => ({
          name: it.name.trim(),
          sku: it.sku.trim(),
          qty: Number(it.qty),
          price: Number(it.price),
        })),
        shipping_fee: Number(shippingFee || 0),
        notes: notes.trim(),
      };
      const res = await apiClient.post('/ecom/orders', payload);
      toast.success(`تم إنشاء الطلب ${res.data.order_code}`);
      onCreated?.(res.data);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'فشل إنشاء الطلب');
    } finally {
      setSaving(false);
    }
  };

  // Filter integrations by selected channel
  const matchingIntegrations = integrations.filter(i => i.channel === channel && i.is_active);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            إنشاء طلب يدوي
          </DialogTitle>
          <DialogDescription>
            أدخل طلباً يدوياً من أي قناة بيع. سيظهر فوراً في صندوق الطلبات الموحَّد.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Channel + integration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>القناة</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger data-testid="manual-order-channel-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CHANNELS).filter(([k]) => k !== 'pos').map(([key, meta]) => (
                    <SelectItem key={key} value={key}>{meta.icon} {meta.labelAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {matchingIntegrations.length > 0 && (
              <div>
                <Label>التكامل المرتبط (اختياري)</Label>
                <Select value={integrationId || 'none'} onValueChange={(v) => setIntegrationId(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— بدون —</SelectItem>
                    {matchingIntegrations.map(i => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Customer */}
          <div className="bg-muted/30 p-3 rounded-lg space-y-2 border">
            <div className="text-xs font-semibold text-muted-foreground">معلومات الزبون</div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="الاسم الكامل *" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} data-testid="manual-order-customer-name" />
              <Input placeholder="رقم الهاتف" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} data-testid="manual-order-customer-phone" />
              <Input placeholder="الولاية" value={customer.wilaya} onChange={e => setCustomer({ ...customer, wilaya: e.target.value })} />
              <Input placeholder="البلدية" value={customer.city} onChange={e => setCustomer({ ...customer, city: e.target.value })} />
            </div>
            <Input placeholder="العنوان التفصيلي" value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} />
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-muted-foreground">المنتجات</div>
              <Button type="button" size="sm" variant="outline" onClick={() => setItems([...items, { ...EMPTY_ITEM }])} data-testid="manual-order-add-item">
                <Plus className="w-4 h-4 ml-1" /> إضافة منتج
              </Button>
            </div>
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-5" placeholder="اسم المنتج" value={it.name} onChange={e => updateItem(idx, 'name', e.target.value)} data-testid={`manual-order-item-name-${idx}`} />
                <Input className="col-span-2" placeholder="SKU" value={it.sku} onChange={e => updateItem(idx, 'sku', e.target.value)} />
                <Input className="col-span-2" type="number" min="1" placeholder="الكمية" value={it.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} data-testid={`manual-order-item-qty-${idx}`} />
                <Input className="col-span-2" type="number" min="0" placeholder="السعر" value={it.price} onChange={e => updateItem(idx, 'price', e.target.value)} data-testid={`manual-order-item-price-${idx}`} />
                <Button type="button" size="icon" variant="ghost" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== idx))} className="col-span-1">
                  <Trash2 className="w-4 h-4 text-rose-500" />
                </Button>
              </div>
            ))}
          </div>

          {/* Totals + notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>رسوم الشحن</Label>
              <Input type="number" min="0" value={shippingFee} onChange={e => setShippingFee(e.target.value)} />
            </div>
            <div className="flex flex-col justify-end text-right">
              <div className="text-xs text-muted-foreground">المجموع الفرعي: <span className="font-semibold">{subtotal.toLocaleString()} دج</span></div>
              <div className="text-base font-bold text-emerald-700">الإجمالي: {total.toLocaleString()} دج</div>
            </div>
          </div>

          <div>
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات داخلية..." rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} data-testid="manual-order-submit-btn">
            {saving ? 'جارٍ الحفظ...' : 'إنشاء الطلب'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
