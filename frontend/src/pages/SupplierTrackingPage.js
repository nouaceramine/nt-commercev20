import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { Truck, Package, Plus, Star, DollarSign, Clock, ShoppingCart } from 'lucide-react';

export default function SupplierTrackingPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [tab, setTab] = useState('goods');
  const [goods, setGoods] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddGoods, setShowAddGoods] = useState(false);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [goodsForm, setGoodsForm] = useState({ supplier_id: '', product_id: '', purchase_price: 0, quality_rating: 5, is_preferred: false });
  const [orderForm, setOrderForm] = useState({ supplier_id: '', items: [], notes: '' });
  const [orderItem, setOrderItem] = useState({ product_name: '', quantity: 1, unit_price: 0 });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const [gRes, oRes, sRes] = await Promise.all([
        apiClient.get(`/supplier-tracking/goods`, { headers }),
        apiClient.get(`/supplier-tracking/orders`, { headers }),
        apiClient.get(`/supplier-tracking/stats`, { headers }),
      ]);
      setGoods(gRes.data);
      setOrders(oRes.data);
      setStats(sRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const addGoods = async () => {
    try {
      await apiClient.post(`/supplier-tracking/goods`, goodsForm, { headers });
      toast.success(isAr ? 'تم الإضافة' : 'Ajouté');
      setShowAddGoods(false);
      fetchData();
    } catch (e) { toast.error('Error'); }
  };

  const addOrderItem = () => {
    if (!orderItem.product_name) return;
    setOrderForm(prev => ({ ...prev, items: [...prev.items, { ...orderItem }] }));
    setOrderItem({ product_name: '', quantity: 1, unit_price: 0 });
  };

  const createOrder = async () => {
    try {
      await apiClient.post(`/supplier-tracking/orders`, orderForm, { headers });
      toast.success(isAr ? 'تم إنشاء الطلب' : 'Commande créée');
      setShowCreateOrder(false);
      setOrderForm({ supplier_id: '', items: [], notes: '' });
      fetchData();
    } catch (e) { toast.error('Error'); }
  };

  const statusColor = (s) => ({ pending: 'bg-amber-500/10 text-amber-400', shipped: 'bg-blue-500/10 text-blue-400', delivered: 'bg-emerald-500/10 text-emerald-400', cancelled: 'bg-red-500/10 text-red-400' }[s] || 'bg-gray-500/10 text-gray-400');

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="supplier-tracking-page">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="text-2xl font-bold text-white">{isAr ? 'تتبع الموردين' : 'Suivi Fournisseurs'}</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAddGoods(true)} className="gap-2 border-gray-600" data-testid="add-goods-btn"><Package className="w-4 h-4" />{isAr ? 'ربط منتج' : 'Lier produit'}</Button>
            <Button onClick={() => setShowCreateOrder(true)} className="gap-2" data-testid="create-order-btn"><ShoppingCart className="w-4 h-4" />{isAr ? 'طلب جديد' : 'Nouvelle commande'}</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: isAr ? 'منتجات مربوطة' : 'Produits liés', value: stats.total_goods || 0, icon: Package, color: 'text-blue-400' },
            { label: isAr ? 'إجمالي الطلبات' : 'Total commandes', value: stats.total_orders || 0, icon: ShoppingCart, color: 'text-purple-400' },
            { label: isAr ? 'طلبات معلقة' : 'En attente', value: stats.pending_orders || 0, icon: Clock, color: 'text-amber-400' },
            { label: isAr ? 'موردين مفضلين' : 'Préférés', value: stats.preferred_suppliers || 0, icon: Star, color: 'text-yellow-400' },
          ].map((s, i) => (
            <Card key={`item-${i}`} className="bg-gray-800/50 border-gray-700"><CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-8 h-8 ${s.color}`} />
              <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-white">{s.value}</p></div>
            </CardContent></Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-700 pb-2">
          <Button variant={tab === 'goods' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('goods')} data-testid="tab-goods">{isAr ? 'المنتجات' : 'Produits'}</Button>
          <Button variant={tab === 'orders' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('orders')} data-testid="tab-orders">{isAr ? 'الطلبات' : 'Commandes'}</Button>
        </div>

        {/* Content */}
        {tab === 'goods' && (
          <div className="space-y-3">
            {loading ? <p className="text-gray-400 text-center py-8">{isAr ? 'جاري التحميل...' : 'Chargement...'}</p> :
             goods.length === 0 ? <p className="text-gray-400 text-center py-8">{isAr ? 'لا توجد منتجات مربوطة' : 'Aucun produit lié'}</p> :
             goods.map(g => (
              <Card key={g.id} className="bg-gray-800/50 border-gray-700"><CardContent className="p-3 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-blue-400" />
                  <div><p className="text-white text-sm">{g.product_id}</p><p className="text-xs text-gray-400">{isAr ? 'مورد' : 'Fournisseur'}: {g.supplier_id} | {g.purchase_price?.toLocaleString()} DA</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-yellow-400"><Star className="w-3 h-3 fill-current" /><span className="text-xs">{g.quality_rating}</span></div>
                  {g.is_preferred && <Badge className="bg-yellow-500/10 text-yellow-400 text-xs">{isAr ? 'مفضل' : 'Préféré'}</Badge>}
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}

        {tab === 'orders' && (
          <div className="space-y-3">
            {orders.length === 0 ? <p className="text-gray-400 text-center py-8">{isAr ? 'لا توجد طلبات' : 'Aucune commande'}</p> :
             orders.map(o => (
              <Card key={o.id} className="bg-gray-800/50 border-gray-700" data-testid={`order-${o.id}`}><CardContent className="p-4 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-2"><span className="text-white font-medium">{o.order_number}</span><Badge className={statusColor(o.status)}>{o.status}</Badge></div>
                  <p className="text-sm text-gray-400">{o.items?.length || 0} {isAr ? 'منتج' : 'produits'} | {(o.total_amount || 0).toLocaleString()} DA</p>
                  <p className="text-xs text-gray-500">{new Date(o.created_at).toLocaleString()}</p>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}

        {/* Add Goods Dialog */}
        <Dialog open={showAddGoods} onOpenChange={setShowAddGoods}>
          <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
            <DialogHeader><DialogTitle>{isAr ? 'ربط منتج بمورد' : 'Lier produit'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder={isAr ? 'معرف المورد' : 'ID Fournisseur'} value={goodsForm.supplier_id} onChange={e => setGoodsForm({...goodsForm, supplier_id: e.target.value})} className="bg-gray-800 border-gray-700" />
              <Input placeholder={isAr ? 'معرف المنتج' : 'ID Produit'} value={goodsForm.product_id} onChange={e => setGoodsForm({...goodsForm, product_id: e.target.value})} className="bg-gray-800 border-gray-700" />
              <Input type="number" placeholder={isAr ? 'سعر الشراء' : 'Prix d\'achat'} value={goodsForm.purchase_price} onChange={e => setGoodsForm({...goodsForm, purchase_price: parseFloat(e.target.value) || 0})} className="bg-gray-800 border-gray-700" />
              <Button onClick={addGoods} className="w-full">{isAr ? 'حفظ' : 'Enregistrer'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Order Dialog */}
        <Dialog open={showCreateOrder} onOpenChange={setShowCreateOrder}>
          <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
            <DialogHeader><DialogTitle>{isAr ? 'طلب جديد' : 'Nouvelle commande'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder={isAr ? 'معرف المورد' : 'ID Fournisseur'} value={orderForm.supplier_id} onChange={e => setOrderForm({...orderForm, supplier_id: e.target.value})} className="bg-gray-800 border-gray-700" />
              <div className="border border-gray-700 rounded p-3 space-y-2">
                <p className="text-xs text-gray-400">{isAr ? 'المنتجات' : 'Produits'} ({orderForm.items.length})</p>
                <div className="flex gap-2">
                  <Input placeholder={isAr ? 'اسم المنتج' : 'Produit'} value={orderItem.product_name} onChange={e => setOrderItem({...orderItem, product_name: e.target.value})} className="bg-gray-800 border-gray-700 text-sm" />
                  <Input type="number" placeholder={isAr ? 'كمية' : 'Qté'} value={orderItem.quantity} onChange={e => setOrderItem({...orderItem, quantity: parseInt(e.target.value) || 1})} className="bg-gray-800 border-gray-700 w-20 text-sm" />
                  <Button size="sm" onClick={addOrderItem}><Plus className="w-3 h-3" /></Button>
                </div>
                {orderForm.items.map((it, i) => <p key={`order-item-${it.product_name}-${i}`} className="text-xs text-gray-300">{it.product_name} x{it.quantity}</p>)}
              </div>
              <Button onClick={createOrder} className="w-full">{isAr ? 'إنشاء الطلب' : 'Créer commande'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
