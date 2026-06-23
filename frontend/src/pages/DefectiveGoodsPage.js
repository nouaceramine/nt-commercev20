import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { AlertTriangle, Plus, Search, Eye, RotateCcw, Trash2, ClipboardCheck, PackageX } from 'lucide-react';

export default function DefectiveGoodsPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [form, setForm] = useState({ product_name: '', defect_type: 'manufacturing', defect_severity: 'medium', description: '', quantity: 1, unit_cost: 0 });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const [itemsRes, statsRes, catsRes] = await Promise.all([
        apiClient.get(`/defective/goods`, { headers, params: { status: filterStatus === 'all' ? undefined : filterStatus, search: search || undefined } }),
        apiClient.get(`/defective/stats`, { headers }),
        apiClient.get(`/defective/categories`, { headers }),
      ]);
      setItems(itemsRes.data);
      setStats(statsRes.data);
      setCategories(catsRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filterStatus, search]);

  const createItem = async () => {
    try {
      await apiClient.post(`/defective/goods`, form, { headers });
      toast.success(isAr ? 'تم تسجيل المنتج المعيب' : 'Produit défectueux enregistré');
      setShowCreate(false);
      setForm({ product_name: '', defect_type: 'manufacturing', defect_severity: 'medium', description: '', quantity: 1, unit_cost: 0 });
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const createInspection = async (itemId, confirmed) => {
    try {
      await apiClient.post(`/defective/inspections`, { defective_goods_id: itemId, confirmed_defective: confirmed, recommended_action: confirmed ? 'return_to_supplier' : 'return_to_stock' }, { headers });
      toast.success(isAr ? 'تم الفحص' : 'Inspection terminée');
      fetchData();
    } catch (e) { toast.error('Error'); }
  };

  const severityColor = (s) => ({ high: 'bg-red-500/10 text-red-400 border-red-500/30', medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30', low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' }[s] || 'bg-gray-500/10 text-gray-400');
  const statusColor = (s) => ({ pending_inspection: 'bg-amber-500/10 text-amber-400', confirmed_defective: 'bg-red-500/10 text-red-400', not_defective: 'bg-emerald-500/10 text-emerald-400' }[s] || 'bg-gray-500/10 text-gray-400');
  const statusLabel = (s) => ({ pending_inspection: isAr ? 'بانتظار الفحص' : 'En attente', confirmed_defective: isAr ? 'معيب مؤكد' : 'Confirmé défectueux', not_defective: isAr ? 'غير معيب' : 'Non défectueux' }[s] || s);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="defective-goods-page">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{isAr ? 'البضائع المعيبة' : 'Produits Défectueux'}</h1>
            <p className="text-sm text-gray-400 mt-1">{isAr ? 'إدارة ومتابعة المنتجات المعيبة' : 'Gestion des produits défectueux'}</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2" data-testid="add-defective-btn"><Plus className="w-4 h-4" />{isAr ? 'تسجيل منتج معيب' : 'Signaler défaut'}</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: isAr ? 'الإجمالي' : 'Total', value: stats.total_defective || 0, icon: PackageX, color: 'text-blue-400' },
            { label: isAr ? 'بانتظار الفحص' : 'En attente', value: stats.pending_inspection || 0, icon: AlertTriangle, color: 'text-amber-400' },
            { label: isAr ? 'مؤكد معيب' : 'Confirmés', value: stats.confirmed_defective || 0, icon: AlertTriangle, color: 'text-red-400' },
            { label: isAr ? 'التكلفة الإجمالية' : 'Coût total', value: `${(stats.total_cost || 0).toLocaleString()} DA`, icon: PackageX, color: 'text-emerald-400' },
          ].map((s, i) => (
            <Card key={`item-${i}`} className="bg-gray-800/50 border-gray-700"><CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-8 h-8 ${s.color}`} />
              <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-white">{s.value}</p></div>
            </CardContent></Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><Input placeholder={isAr ? 'بحث...' : 'Rechercher...'} value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-gray-800 border-gray-700 text-white" data-testid="defective-search" /></div>
          <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-48 bg-gray-800 border-gray-700 text-white" data-testid="defective-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{isAr ? 'الكل' : 'Tous'}</SelectItem><SelectItem value="pending_inspection">{isAr ? 'بانتظار الفحص' : 'En attente'}</SelectItem><SelectItem value="confirmed_defective">{isAr ? 'مؤكد' : 'Confirmé'}</SelectItem><SelectItem value="not_defective">{isAr ? 'غير معيب' : 'Non défectueux'}</SelectItem></SelectContent>
          </Select>
        </div>

        {/* Items List */}
        <div className="space-y-3">
          {loading ? <p className="text-gray-400 text-center py-8">{isAr ? 'جاري التحميل...' : 'Chargement...'}</p> :
           items.length === 0 ? <p className="text-gray-400 text-center py-8">{isAr ? 'لا توجد بيانات' : 'Aucune donnée'}</p> :
           items.map(item => (
            <Card key={item.id} className="bg-gray-800/50 border-gray-700 hover:border-gray-600 transition-colors" data-testid={`defective-item-${item.id}`}>
              <CardContent className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-500">{item.defective_number}</span>
                    <Badge className={severityColor(item.defect_severity)}>{item.defect_severity}</Badge>
                    <Badge className={statusColor(item.status)}>{statusLabel(item.status)}</Badge>
                  </div>
                  <h3 className="text-white font-medium mt-1">{item.product_name}</h3>
                  <p className="text-sm text-gray-400">{isAr ? 'الكمية' : 'Qté'}: {item.quantity} | {isAr ? 'التكلفة' : 'Coût'}: {(item.total_cost || 0).toLocaleString()} DA</p>
                </div>
                <div className="flex gap-2">
                  {item.status === 'pending_inspection' && (
                    <>
                      <Button size="sm" variant="outline" className="gap-1 text-emerald-400 border-emerald-500/30" onClick={() => createInspection(item.id, true)} data-testid={`inspect-confirm-${item.id}`}><ClipboardCheck className="w-3 h-3" />{isAr ? 'معيب' : 'Défectueux'}</Button>
                      <Button size="sm" variant="outline" className="gap-1 text-blue-400 border-blue-500/30" onClick={() => createInspection(item.id, false)} data-testid={`inspect-ok-${item.id}`}><RotateCcw className="w-3 h-3" />{isAr ? 'سليم' : 'OK'}</Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
            <DialogHeader><DialogTitle>{isAr ? 'تسجيل منتج معيب' : 'Signaler un défaut'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder={isAr ? 'اسم المنتج' : 'Nom du produit'} value={form.product_name} onChange={e => setForm({...form, product_name: e.target.value})} className="bg-gray-800 border-gray-700" data-testid="defective-product-name" />
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.defect_severity} onValueChange={v => setForm({...form, defect_severity: v})}><SelectTrigger className="bg-gray-800 border-gray-700"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="high">{isAr ? 'عالية' : 'Haute'}</SelectItem><SelectItem value="medium">{isAr ? 'متوسطة' : 'Moyenne'}</SelectItem><SelectItem value="low">{isAr ? 'منخفضة' : 'Basse'}</SelectItem></SelectContent>
                </Select>
                <Input type="number" placeholder={isAr ? 'الكمية' : 'Quantité'} value={form.quantity} onChange={e => setForm({...form, quantity: parseInt(e.target.value) || 0})} className="bg-gray-800 border-gray-700" />
              </div>
              <Input type="number" placeholder={isAr ? 'سعر الوحدة' : 'Prix unitaire'} value={form.unit_cost} onChange={e => setForm({...form, unit_cost: parseFloat(e.target.value) || 0})} className="bg-gray-800 border-gray-700" />
              <Input placeholder={isAr ? 'الوصف' : 'Description'} value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="bg-gray-800 border-gray-700" />
              <Button onClick={createItem} className="w-full" data-testid="submit-defective-btn">{isAr ? 'تسجيل' : 'Enregistrer'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
