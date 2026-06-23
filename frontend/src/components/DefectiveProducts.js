import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { formatShortDate } from '../utils/globalDateFormatter';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  AlertTriangle,
  Package,
  Plus,
  Truck,
  Trash2,
  Wrench,
  Tag,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  FileText,
  Filter,
  RotateCcw
} from 'lucide-react';

const REASONS = {
  manufacturing: { ar: 'عيب تصنيع', fr: 'Défaut de fabrication' },
  shipping: { ar: 'تلف أثناء الشحن', fr: 'Dommage lors de l\'expédition' },
  storage: { ar: 'تلف أثناء التخزين', fr: 'Dommage de stockage' },
  expired: { ar: 'منتهي الصلاحية', fr: 'Expiré' },
  other: { ar: 'أخرى', fr: 'Autre' }
};

const ACTIONS = {
  pending: { ar: 'قيد الانتظار', fr: 'En attente', icon: Clock, color: 'bg-gray-500' },
  return_to_supplier: { ar: 'إرجاع للمورد', fr: 'Retour fournisseur', icon: Truck, color: 'bg-blue-500' },
  dispose: { ar: 'إتلاف', fr: 'Éliminer', icon: Trash2, color: 'bg-red-500' },
  repair: { ar: 'إصلاح', fr: 'Réparer', icon: Wrench, color: 'bg-orange-500' },
  discount_sale: { ar: 'بيع بتخفيض', fr: 'Vente remisée', icon: Tag, color: 'bg-green-500' }
};

const STATUSES = {
  pending: { ar: 'معلق', fr: 'En attente', color: 'bg-yellow-500' },
  in_progress: { ar: 'قيد التنفيذ', fr: 'En cours', color: 'bg-blue-500' },
  completed: { ar: 'مكتمل', fr: 'Terminé', color: 'bg-green-500' },
  cancelled: { ar: 'ملغي', fr: 'Annulé', color: 'bg-gray-500' }
};

export function DefectiveProducts() {
  const { language } = useLanguage();
  const [defectiveProducts, setDefectiveProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [reasonFilter, setReasonFilter] = useState('all');
  
  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedDefective, setSelectedDefective] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    product_id: '',
    quantity: 1,
    reason: 'manufacturing',
    notes: '',
    supplier_id: '',
    action: 'pending'
  });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchData();
  }, [statusFilter, reasonFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (reasonFilter !== 'all') params.append('reason', reasonFilter);
      
      const [defectiveRes, statsRes, productsRes, suppliersRes] = await Promise.all([
        apiClient.get(`/defective-products?${params}`, { headers }),
        apiClient.get(`/defective-products/stats`, { headers }),
        apiClient.get(`/products`, { headers }),
        apiClient.get(`/suppliers`, { headers })
      ]);
      
      setDefectiveProducts(defectiveRes.data);
      setStats(statsRes.data);
      setProducts(productsRes.data);
      setSuppliers(suppliersRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(language === 'ar' ? 'خطأ في جلب البيانات' : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.product_id || formData.quantity < 1) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول المطلوبة' : 'Veuillez remplir tous les champs');
      return;
    }
    
    setSaving(true);
    try {
      await apiClient.post(`/defective-products`, formData, { headers });
      toast.success(language === 'ar' ? 'تم تسجيل المنتج المعطل بنجاح' : 'Produit défectueux enregistré');
      setShowAddDialog(false);
      setFormData({
        product_id: '',
        quantity: 1,
        reason: 'manufacturing',
        notes: '',
        supplier_id: '',
        action: 'pending'
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'حدث خطأ' : 'Une erreur est survenue'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await apiClient.put(`/defective-products/${id}`, { status: newStatus }, { headers });
      toast.success(language === 'ar' ? 'تم تحديث الحالة' : 'Statut mis à jour');
      fetchData();
    } catch (error) {
      toast.error(language === 'ar' ? 'خطأ في التحديث' : 'Erreur de mise à jour');
    }
  };

  const handleDelete = async (id, restoreStock = false) => {
    try {
      await apiClient.delete(`/defective-products/${id}?restore_stock=${restoreStock}`, { headers });
      toast.success(language === 'ar' 
        ? (restoreStock ? 'تم الحذف واستعادة المخزون' : 'تم الحذف')
        : (restoreStock ? 'Supprimé et stock restauré' : 'Supprimé'));
      setShowDetailsDialog(false);
      fetchData();
    } catch (error) {
      toast.error(language === 'ar' ? 'خطأ في الحذف' : 'Erreur de suppression');
    }
  };

  const getProductName = (product) => {
    return language === 'ar' ? (product.name_ar || product.name_en) : (product.name_en || product.name_ar);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500" />
            <p className="text-2xl font-bold">{stats?.total || 0}</p>
            <p className="text-sm text-muted-foreground">
              {language === 'ar' ? 'إجمالي المعطلة' : 'Total défectueux'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
            <p className="text-2xl font-bold">{stats?.pending || 0}</p>
            <p className="text-sm text-muted-foreground">
              {language === 'ar' ? 'معلق' : 'En attente'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <RefreshCw className="h-8 w-8 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{stats?.in_progress || 0}</p>
            <p className="text-sm text-muted-foreground">
              {language === 'ar' ? 'قيد التنفيذ' : 'En cours'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold">{stats?.completed || 0}</p>
            <p className="text-sm text-muted-foreground">
              {language === 'ar' ? 'مكتمل' : 'Terminé'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <Package className="h-8 w-8 mx-auto mb-2 text-purple-500" />
            <p className="text-2xl font-bold">{stats?.total_quantity || 0}</p>
            <p className="text-sm text-muted-foreground">
              {language === 'ar' ? 'إجمالي الكمية' : 'Quantité totale'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Summary */}
      {stats?.total_cost > 0 && (
        <Card className="bg-red-50 dark:bg-red-950 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {language === 'ar' ? 'إجمالي تكلفة الخسائر' : 'Coût total des pertes'}
                </p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {(stats?.total_cost || 0).toFixed(2)} {language === 'ar' ? 'دج' : 'DA'}
                </p>
              </div>
              <AlertTriangle className="h-12 w-12 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {language === 'ar' ? 'تسجيل منتج معطل' : 'Enregistrer défectueux'}
          </Button>
          <Button variant="outline" onClick={fetchData} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {language === 'ar' ? 'تحديث' : 'Actualiser'}
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{language === 'ar' ? 'كل الحالات' : 'Tous les statuts'}</SelectItem>
              {Object.entries(STATUSES).map(([key, val]) => (
                <SelectItem key={key} value={key}>{val[language === 'ar' ? 'ar' : 'fr']}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={reasonFilter} onValueChange={setReasonFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{language === 'ar' ? 'كل الأسباب' : 'Toutes les raisons'}</SelectItem>
              {Object.entries(REASONS).map(([key, val]) => (
                <SelectItem key={key} value={key}>{val[language === 'ar' ? 'ar' : 'fr']}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{language === 'ar' ? 'المنتج' : 'Produit'}</TableHead>
                <TableHead>{language === 'ar' ? 'الكمية' : 'Quantité'}</TableHead>
                <TableHead>{language === 'ar' ? 'السبب' : 'Raison'}</TableHead>
                <TableHead>{language === 'ar' ? 'الإجراء' : 'Action'}</TableHead>
                <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                <TableHead>{language === 'ar' ? 'المورد' : 'Fournisseur'}</TableHead>
                <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : defectiveProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    {language === 'ar' ? 'لا توجد منتجات معطلة' : 'Aucun produit défectueux'}
                  </TableCell>
                </TableRow>
              ) : (
                defectiveProducts.map((item) => {
                  const ActionIcon = ACTIONS[item.action]?.icon || Clock;
                  return (
                    <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50" onClick={() => {
                      setSelectedDefective(item);
                      setShowDetailsDialog(true);
                    }}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">{item.product_code}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.quantity}</Badge>
                      </TableCell>
                      <TableCell>
                        {REASONS[item.reason]?.[language === 'ar' ? 'ar' : 'fr'] || item.reason}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${ACTIONS[item.action]?.color || 'bg-gray-500'} text-white gap-1`}>
                          <ActionIcon className="h-3 w-3" />
                          {ACTIONS[item.action]?.[language === 'ar' ? 'ar' : 'fr'] || item.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${STATUSES[item.status]?.color || 'bg-gray-500'} text-white`}>
                          {STATUSES[item.status]?.[language === 'ar' ? 'ar' : 'fr'] || item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.supplier_name || '-'}</TableCell>
                      <TableCell>
                        {formatShortDate(item.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {language === 'ar' ? 'تسجيل منتج معطل' : 'Enregistrer un produit défectueux'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>{language === 'ar' ? 'المنتج' : 'Produit'} *</Label>
              <Select value={formData.product_id} onValueChange={(v) => setFormData({...formData, product_id: v})}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'ar' ? 'اختر منتج' : 'Sélectionner'} />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {getProductName(p)} ({p.quantity} {language === 'ar' ? 'متوفر' : 'dispo'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>{language === 'ar' ? 'الكمية المعطلة' : 'Quantité défectueuse'} *</Label>
              <Input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 1})}
              />
            </div>
            
            <div>
              <Label>{language === 'ar' ? 'سبب العطل' : 'Raison du défaut'} *</Label>
              <Select value={formData.reason} onValueChange={(v) => setFormData({...formData, reason: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REASONS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val[language === 'ar' ? 'ar' : 'fr']}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>{language === 'ar' ? 'الإجراء المطلوب' : 'Action requise'}</Label>
              <Select value={formData.action} onValueChange={(v) => setFormData({...formData, action: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIONS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val[language === 'ar' ? 'ar' : 'fr']}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {formData.action === 'return_to_supplier' && (
              <div>
                <Label>{language === 'ar' ? 'المورد' : 'Fournisseur'}</Label>
                <Select value={formData.supplier_id} onValueChange={(v) => setFormData({...formData, supplier_id: v})}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'ar' ? 'اختر المورد' : 'Sélectionner'} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div>
              <Label>{language === 'ar' ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder={language === 'ar' ? 'أضف ملاحظات إضافية...' : 'Ajouter des notes...'}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {language === 'ar' ? 'إلغاء' : 'Annuler'}
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : (language === 'ar' ? 'حفظ' : 'Enregistrer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {language === 'ar' ? 'تفاصيل المنتج المعطل' : 'Détails du produit défectueux'}
            </DialogTitle>
          </DialogHeader>
          
          {selectedDefective && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'المنتج' : 'Produit'}</p>
                  <p className="font-medium">{selectedDefective.product_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'الكود' : 'Code'}</p>
                  <p className="font-medium">{selectedDefective.product_code}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'الكمية' : 'Quantité'}</p>
                  <p className="font-medium">{selectedDefective.quantity}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'التكلفة' : 'Coût'}</p>
                  <p className="font-medium text-red-600">
                    {(selectedDefective.total_cost || 0).toFixed(2)} {language === 'ar' ? 'دج' : 'DA'}
                  </p>
                </div>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-2">{language === 'ar' ? 'تحديث الحالة' : 'Mettre à jour le statut'}</p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(STATUSES).map(([key, val]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={selectedDefective.status === key ? 'default' : 'outline'}
                      onClick={() => handleUpdateStatus(selectedDefective.id, key)}
                    >
                      {val[language === 'ar' ? 'ar' : 'fr']}
                    </Button>
                  ))}
                </div>
              </div>
              
              {selectedDefective.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'ملاحظات' : 'Notes'}</p>
                  <p className="bg-muted p-2 rounded">{selectedDefective.notes}</p>
                </div>
              )}
              
              {selectedDefective.return_request_id && (
                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                  <p className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    {language === 'ar' ? 'تم إنشاء طلب إرجاع للمورد' : 'Demande de retour créée'}
                  </p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => handleDelete(selectedDefective?.id, false)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {language === 'ar' ? 'حذف' : 'Supprimer'}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleDelete(selectedDefective?.id, true)}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              {language === 'ar' ? 'حذف واستعادة المخزون' : 'Supprimer et restaurer stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DefectiveProducts;
