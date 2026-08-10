import React, { useEffect, useState } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { Plus, Upload, Truck, Smartphone, Gift, Wifi, CreditCard } from 'lucide-react';

const TYPE_META = {
  MOBILE_TOPUP: { icon: Smartphone, label: 'رصيد هاتف', color: 'text-blue-600' },
  GIFT_CARD: { icon: Gift, label: 'بطاقة هدية', color: 'text-pink-600' },
  INTERNET_BUNDLE: { icon: Wifi, label: 'باقة إنترنت', color: 'text-purple-600' },
  SUBSCRIPTION: { icon: CreditCard, label: 'اشتراك', color: 'text-amber-600' },
};
const DELIVERY = { INSTANT_CODE: 'كود فوري', QR_CODE: 'QR', DIRECT_TOPUP: 'شحن مباشر', SMS_DELIVERY: 'SMS' };
const CODE_BASED = ['INSTANT_CODE', 'QR_CODE'];
const STATUS = {
  PENDING: { label: 'معلّق', color: 'bg-amber-100 text-amber-700' },
  COMPLETED: { label: 'مكتمل', color: 'bg-green-100 text-green-700' },
  FAILED: { label: 'فاشل', color: 'bg-red-100 text-red-700' },
};
const EMPTY_FORM = { name: '', description: '', type: 'MOBILE_TOPUP', provider: '', price: '', cost_price: '', delivery_method: 'INSTANT_CODE' };

const DigitalAdminPage = () => {
  const { isRTL } = useLanguage();
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [productDialog, setProductDialog] = useState(false);
  const [csvDialog, setCsvDialog] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [csvText, setCsvText] = useState('');
  const [editing, setEditing] = useState(null);

  const [stats, setStats] = useState(null);
  const loadStats = async () => { const r = await apiClient.get('/digital/stats'); setStats(r.data); };
  const loadProducts = async () => { const r = await apiClient.get('/digital/products/all'); setProducts(r.data || []); };
  const loadOrders = async () => {
    const params = statusFilter !== 'all' ? { status: statusFilter } : {};
    const r = await apiClient.get('/digital/orders', { params });
    setOrders(r.data || []);
  };
  useEffect(() => { loadProducts().catch(() => {}); loadStats().catch(() => {}); }, []);
  useEffect(() => { loadOrders().catch(() => {}); }, [statusFilter]);

  const saveProduct = async () => {
    try {
      const body = { ...form, price: Number(form.price) || 0, cost_price: Number(form.cost_price) || 0 };
      if (editing) { await apiClient.put(`/digital/products/${editing.id}`, body); toast.success('تم التحديث'); }
      else { await apiClient.post('/digital/products', body); toast.success('تم إنشاء المنتج'); }
      setProductDialog(false); setEditing(null); setForm(EMPTY_FORM);
      loadProducts();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل الحفظ'); }
  };

  const uploadCsv = async () => {
    if (!csvText.trim()) return;
    try {
      const r = await apiClient.post(`/digital/products/${csvDialog.id}/codes/csv`, { csv: csvText });
      toast.success(`تم إضافة ${r.data.inserted} كود${r.data.skipped ? ` (${r.data.skipped} مكرر)` : ''}`);
      setCsvDialog(null); setCsvText(''); loadProducts();
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل الرفع'); }
  };

  const deliverManual = async (orderId) => {
    try {
      const r = await apiClient.post(`/digital/orders/${orderId}/deliver`);
      toast.success(r.data.message || 'تم التسليم'); loadOrders(); loadStats().catch(() => {});
    } catch (e) { toast.error(e.response?.data?.detail || 'فشل'); }
  };

  const toggleActive = async (p) => {
    await apiClient.put(`/digital/products/${p.id}`, { is_active: !p.is_active });
    loadProducts();
  };

  return (
    <Layout>
      <div className="p-6 space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
        <h1 className="text-3xl font-bold">إدارة الخدمات الرقمية</h1>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.completed_orders}</p>
              <p className="text-xs text-muted-foreground">طلبات مكتملة ({stats.pending_orders} معلّق)</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.revenue?.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">الإيرادات (دج)</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold">{stats.cost?.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">التكلفة (دج)</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{stats.profit?.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">صافي الربح (دج)</p>
            </Card>
          </div>
        )}

        <Tabs defaultValue="products" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="products">المنتجات</TabsTrigger>
            <TabsTrigger value="orders">الطلبات</TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="mt-6 space-y-4">
            <Button onClick={() => { setEditing(null); setForm(EMPTY_FORM); setProductDialog(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> إضافة منتج
            </Button>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-muted-foreground">
                  <th className="p-3 text-right">المنتج</th>
                  <th className="p-3 text-right">النوع</th>
                  <th className="p-3 text-right">المزوّد</th>
                  <th className="p-3 text-right">السعر</th>
                  <th className="p-3 text-right">التسليم</th>
                  <th className="p-3 text-right">المخزون</th>
                  <th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">إجراءات</th>
                </tr></thead>
                <tbody>
                  {products.map(p => {
                    const Meta = TYPE_META[p.type] || TYPE_META.GIFT_CARD;
                    return (
                      <tr key={p.id} className="border-b hover:bg-muted/50">
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3"><span className={`flex items-center gap-1 ${Meta.color}`}><Meta.icon className="w-4 h-4" />{Meta.label}</span></td>
                        <td className="p-3">{p.provider}</td>
                        <td className="p-3">{p.price?.toLocaleString()} دج</td>
                        <td className="p-3">{DELIVERY[p.delivery_method]}</td>
                        <td className="p-3">
                          {CODE_BASED.includes(p.delivery_method) ? (
                            <Badge className={p.stock === 0 ? 'bg-red-100 text-red-700' : p.stock < 5 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}>
                              {p.stock}
                            </Badge>
                          ) : '—'}
                        </td>
                        <td className="p-3">
                          <Badge className={p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                            {p.is_active ? 'نشط' : 'معطّل'}
                          </Badge>
                        </td>
                        <td className="p-3 space-x-2 space-x-reverse">
                          {CODE_BASED.includes(p.delivery_method) && (
                            <Button size="sm" variant="outline" onClick={() => setCsvDialog(p)}><Upload className="w-3 h-3 ml-1" />أكواد</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => { setEditing(p); setForm({ name: p.name, description: p.description || '', type: p.type, provider: p.provider || '', price: p.price, cost_price: p.cost_price || '', delivery_method: p.delivery_method }); setProductDialog(true); }}>تعديل</Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(p)}>{p.is_active ? 'تعطيل' : 'تفعيل'}</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="mt-6 space-y-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الطلبات</SelectItem>
                <SelectItem value="PENDING">معلّق</SelectItem>
                <SelectItem value="COMPLETED">مكتمل</SelectItem>
                <SelectItem value="FAILED">فاشل</SelectItem>
              </SelectContent>
            </Select>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-muted-foreground">
                  <th className="p-3 text-right">رقم الطلب</th>
                  <th className="p-3 text-right">الزبون</th>
                  <th className="p-3 text-right">المنتج</th>
                  <th className="p-3 text-right">الهاتف</th>
                  <th className="p-3 text-right">الدفع</th>
                  <th className="p-3 text-right">المبلغ</th>
                  <th className="p-3 text-right">الحالة</th>
                  <th className="p-3 text-right">التاريخ</th>
                  <th className="p-3 text-right">إجراء</th>
                </tr></thead>
                <tbody>
                  {orders.map(o => {
                    const S = STATUS[o.status] || STATUS.PENDING;
                    return (
                      <tr key={o.id} className="border-b hover:bg-muted/50">
                        <td className="p-3 font-mono">{o.order_number}</td>
                        <td className="p-3">{o.user_name}</td>
                        <td className="p-3">{o.product_name}</td>
                        <td className="p-3 font-mono" dir="ltr">{o.target_phone}</td>
                        <td className="p-3">{o.payment_method === 'wallet' ? 'محفظة' : (o.payment_method || '').toUpperCase()}</td>
                        <td className="p-3">{o.amount?.toLocaleString()} دج</td>
                        <td className="p-3"><Badge className={S.color}>{S.label}</Badge></td>
                        <td className="p-3 text-muted-foreground">{o.created_at?.slice(0, 10)}</td>
                        <td className="p-3">
                          {o.status === 'PENDING' && (
                            <Button size="sm" variant="outline" onClick={() => deliverManual(o.id)}>
                              <Truck className="w-3 h-3 ml-1" /> تسليم
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add / Edit product */}
        <Dialog open={productDialog} onOpenChange={setProductDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? 'تعديل المنتج' : 'إضافة منتج رقمي'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>الاسم</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>الوصف</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>النوع</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>المزوّد</Label>
                  <Select value={form.provider} onValueChange={v => setForm({ ...form, provider: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mobilis">موبيليس</SelectItem>
                      <SelectItem value="djezzy">جيزي</SelectItem>
                      <SelectItem value="ooredoo">أوريدو</SelectItem>
                      <SelectItem value="flexy">فليكسي</SelectItem>
                      <SelectItem value="other">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>سعر البيع (دج)</Label><Input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
                <div><Label>سعر التكلفة (دج)</Label><Input type="number" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} /></div>
              </div>
              {form.delivery_method === 'DIRECT_TOPUP' && (
                <p className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
                  الشحن المباشر يُعالج يدوياً حالياً من تبويب الطلبات — الربط الآلي بواجهات موبيليس/جيزي/أوريدو قيد التطوير.
                </p>
              )}
              <div><Label>نوع التسليم</Label>
                <Select value={form.delivery_method} onValueChange={v => setForm({ ...form, delivery_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DELIVERY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={saveProduct}>{editing ? 'حفظ التعديلات' : 'إنشاء المنتج'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* CSV upload */}
        <Dialog open={!!csvDialog} onOpenChange={() => setCsvDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>رفع أكواد — {csvDialog?.name}</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">الصيغة: <code dir="ltr">code,serial,expiryDate</code> في كل سطر (serial و expiry اختياريان)</p>
            <textarea
              className="w-full h-40 border rounded-md p-2 text-sm font-mono"
              dir="ltr"
              placeholder={'DJ-AAAA-1111,S001\nDJ-AAAA-2222,S002'}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
            />
            <Button className="w-full" onClick={uploadCsv}>رفع الأكواد</Button>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default DigitalAdminPage;
