import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Plus, Trash2, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../lib/apiClient';
import { CHANNELS } from './ecomConstants';
import { WILAYAS, getCommunes } from '../../data/algeriaGeo';
import { ProductSearchDropdown } from '../../components/ProductSearchDropdown';

const EMPTY_ITEM = { name: '', sku: '', qty: 1, price: 0, product_id: null };

export function EcomManualOrderDialog({ open, onOpenChange, onCreated, integrations = [] }) {
  const [channel, setChannel] = useState('manual');
  const [integrationId, setIntegrationId] = useState('');
  const [customer, setCustomer] = useState({ name: '', phone: '', address: '', city: '', wilaya: '', wilaya_code: '' });
  const [phoneTrust, setPhoneTrust] = useState(null);  // p100: network reputation of the entered phone

  const checkPhoneTrust = async () => {  // p100
    const ph = (customer.phone || '').trim();
    if (ph.length < 9) { setPhoneTrust(null); return; }
    try {
      const r = await apiClient.get(`/ecom/customer-lookup?phone=${encodeURIComponent(ph)}`);
      setPhoneTrust(r.data || null);
    } catch { /* silent */ }
  };
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [shippingFee, setShippingFee] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // Fetch POS products once when dialog opens
  useEffect(() => {
    if (!open || products.length > 0) return;
    setProductsLoading(true);
    apiClient.get('/products')
      .then(res => setProducts(Array.isArray(res.data) ? res.data : []))
      .catch(() => {/* silent — manual entry still works */})
      .finally(() => setProductsLoading(false));
  }, [open, products.length]);

  const communes = useMemo(() => getCommunes(customer.wilaya_code), [customer.wilaya_code]);

  const reset = () => {
    setChannel('manual');
    setIntegrationId('');
    setCustomer({ name: '', phone: '', address: '', city: '', wilaya: '', wilaya_code: '' });
    setPhoneTrust(null);
    setItems([{ ...EMPTY_ITEM }]);
    setShippingFee(0);
    setNotes('');
  };

  const subtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.price || 0), 0);
  const total = subtotal + Number(shippingFee || 0);

  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  // Map a POS product → manual order item shape
  const productToItem = (product) => ({
    name: product.name_ar || product.name_en || product.name || '',
    sku: product.barcode || product.article_code || '',
    qty: 1,
    price: Number(product.retail_price ?? product.price ?? 0),
    product_id: product.id,
  });

  // Insert a product into the items list (replace FIRST empty row, else append)
  const addProductFromInventory = (product) => {
    const newItem = productToItem(product);
    setItems(prev => {
      const firstEmptyIdx = prev.findIndex(it =>
        !it.name?.trim() && !it.sku?.trim() && !it.product_id
      );
      if (firstEmptyIdx !== -1) {
        return prev.map((it, i) => (i === firstEmptyIdx ? newItem : it));
      }
      return [...prev, newItem];
    });
    toast.success(`✓ ${newItem.name}`);
  };

  const onWilayaChange = (code) => {
    const w = WILAYAS.find(x => x.code === code);
    setCustomer(prev => ({ ...prev, wilaya_code: code, wilaya: w?.name_ar || '', city: '' }));
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
        customer: {
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          city: customer.city,
          wilaya: customer.wilaya,
        },
        items: validItems.map(it => ({
          name: it.name.trim(),
          sku: it.sku.trim(),
          qty: Number(it.qty),
          price: Number(it.price),
          product_id: it.product_id || null,
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
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
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
                  {Object.entries(CHANNELS).filter(([k, meta]) => k !== 'pos' && meta.kind !== 'shipping').map(([key, meta]) => (
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
              <Input placeholder="رقم الهاتف" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} onBlur={checkPhoneTrust} data-testid="manual-order-customer-phone" />
              {phoneTrust?.trust === 'risk' && <p className="text-xs text-red-700 font-semibold col-span-full" data-testid="manual-phone-trust">🔴 هذا الرقم مُرجِع متسلسل: أرجع {phoneTrust.returned} من {phoneTrust.outcomes} طلبات عبر {phoneTrust.tenants} متجر — أكّد هاتفياً قبل أي شحن!</p>}
              {phoneTrust?.trust === 'warn' && <p className="text-xs text-amber-700 col-span-full" data-testid="manual-phone-trust">🟡 سجل مختلط عبر الشبكة: أرجع {phoneTrust.returned} من {phoneTrust.outcomes}</p>}
              {phoneTrust?.trust === 'good' && <p className="text-xs text-emerald-700 col-span-full" data-testid="manual-phone-trust">🟢 زبون موثوق عبر الشبكة — استلم {phoneTrust.delivered} من {phoneTrust.outcomes}</p>}

              {/* Wilaya dropdown */}
              <div>
                <Select value={customer.wilaya_code || undefined} onValueChange={onWilayaChange}>
                  <SelectTrigger data-testid="manual-order-wilaya-select">
                    <SelectValue placeholder="اختر الولاية" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {WILAYAS.map(w => (
                      <SelectItem key={w.code} value={w.code}>{w.code} — {w.name_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Commune dropdown — depends on wilaya */}
              <div>
                <Select
                  value={customer.city || undefined}
                  onValueChange={(v) => setCustomer({ ...customer, city: v })}
                  disabled={!customer.wilaya_code}
                >
                  <SelectTrigger data-testid="manual-order-commune-select">
                    <SelectValue placeholder={customer.wilaya_code ? 'اختر البلدية' : 'اختر الولاية أولاً'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {communes.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Input placeholder="العنوان التفصيلي" value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} />
          </div>

          {/* Product search from POS inventory */}
          <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                🔎 بحث المنتج من المخزون
              </div>
              <span className="text-xs text-muted-foreground">
                {productsLoading ? 'جارٍ التحميل...' : `${products.length} منتج متاح`}
              </span>
            </div>
            <ProductSearchDropdown
              products={products}
              language="ar"
              isRTL={true}
              placeholder="ابحث بالاسم، الباركود، أو كود المنتج..."
              onSelect={addProductFromInventory}
              priceType="retail"
              formatCurrency={(v) => Number(v || 0).toFixed(0)}
              currency="دج"
              showStock={true}
              showPrice={true}
            />
            <p className="text-[11px] text-muted-foreground">
              اختر منتجاً ليُضاف تلقائياً إلى قائمة الطلب بسعره وكوده. يمكنك تعديل أي حقل بعد الإضافة.
            </p>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-muted-foreground">المنتجات في الطلب</div>
              <Button type="button" size="sm" variant="outline" onClick={() => setItems([...items, { ...EMPTY_ITEM }])} data-testid="manual-order-add-item">
                <Plus className="w-4 h-4 ml-1" /> إضافة سطر يدوي
              </Button>
            </div>
            {!items.some(it => it.product_id) && items.some(it => it.name?.trim()) && (
              <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1.5">
                ⚠️ لا يوجد منتج مرتبط بالمخزون — لن يتم خصم المخزون تلقائياً عند تأكيد الطلب. اربطه من البحث أعلاه إن أردت التتبُّع.
              </div>
            )}
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5 flex flex-col">
                  <Input
                    placeholder="اسم المنتج"
                    value={it.name}
                    onChange={e => updateItem(idx, 'name', e.target.value)}
                    data-testid={`manual-order-item-name-${idx}`}
                  />
                  {it.product_id && (
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">✓ مرتبط بمنتج المخزون</span>
                  )}
                </div>
                <Input className="col-span-2" placeholder="SKU" value={it.sku} onChange={e => updateItem(idx, 'sku', e.target.value)} />
                <Input className="col-span-2" type="number" inputMode="numeric" min="1" placeholder="الكمية" value={it.qty} onChange={e => updateItem(idx, 'qty', e.target.value)} data-testid={`manual-order-item-qty-${idx}`} />
                <Input className="col-span-2" type="number" inputMode="decimal" min="0" placeholder="السعر" value={it.price} onChange={e => updateItem(idx, 'price', e.target.value)} data-testid={`manual-order-item-price-${idx}`} />
                <Button type="button" size="icon" variant="ghost" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== idx))} className="col-span-1" data-testid={`manual-order-remove-item-${idx}`}>
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
