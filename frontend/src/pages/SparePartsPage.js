import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  AlertTriangle,
  Smartphone,
  DollarSign,
  Boxes,
  Filter
} from 'lucide-react';

// Spare part categories
const PART_CATEGORIES = [
  { id: 'screen', label: { ar: 'شاشات', fr: 'Écrans' } },
  { id: 'battery', label: { ar: 'بطاريات', fr: 'Batteries' } },
  { id: 'charging_port', label: { ar: 'منافذ شحن', fr: 'Ports de charge' } },
  { id: 'camera', label: { ar: 'كاميرات', fr: 'Caméras' } },
  { id: 'speaker', label: { ar: 'سماعات', fr: 'Haut-parleurs' } },
  { id: 'microphone', label: { ar: 'ميكروفونات', fr: 'Microphones' } },
  { id: 'buttons', label: { ar: 'أزرار', fr: 'Boutons' } },
  { id: 'housing', label: { ar: 'أغطية', fr: 'Coques' } },
  { id: 'connector', label: { ar: 'موصلات', fr: 'Connecteurs' } },
  { id: 'ic_chip', label: { ar: 'شرائح IC', fr: 'Puces IC' } },
  { id: 'other', label: { ar: 'أخرى', fr: 'Autres' } },
];

// Phone brands for compatibility
const PHONE_BRANDS = [
  'Apple', 'Samsung', 'Huawei', 'Xiaomi', 'Oppo', 'Vivo', 'Realme',
  'OnePlus', 'Google', 'Sony', 'LG', 'Nokia', 'Motorola', 'Universal'
];

// Sample spare parts data
const SAMPLE_PARTS = [
  {
    id: '1',
    name: 'شاشة Samsung Galaxy S23',
    name_fr: 'Écran Samsung Galaxy S23',
    category: 'screen',
    brand: 'Samsung',
    compatible_models: ['Galaxy S23', 'Galaxy S23+'],
    purchase_price: 8000,
    sell_price: 12000,
    quantity: 5,
    low_stock_threshold: 2,
    supplier: 'موزع سامسونج',
  },
  {
    id: '2',
    name: 'بطارية iPhone 14 Pro',
    name_fr: 'Batterie iPhone 14 Pro',
    category: 'battery',
    brand: 'Apple',
    compatible_models: ['iPhone 14 Pro', 'iPhone 14 Pro Max'],
    purchase_price: 3500,
    sell_price: 6000,
    quantity: 8,
    low_stock_threshold: 3,
    supplier: 'موزع أبل',
  },
  {
    id: '3',
    name: 'منفذ شحن Type-C عام',
    name_fr: 'Port de charge Type-C universel',
    category: 'charging_port',
    brand: 'Universal',
    compatible_models: [],
    purchase_price: 200,
    sell_price: 500,
    quantity: 25,
    low_stock_threshold: 10,
    supplier: 'مورد عام',
  },
  {
    id: '4',
    name: 'كاميرا خلفية Xiaomi Redmi Note 12',
    name_fr: 'Caméra arrière Xiaomi Redmi Note 12',
    category: 'camera',
    brand: 'Xiaomi',
    compatible_models: ['Redmi Note 12', 'Redmi Note 12 Pro'],
    purchase_price: 2500,
    sell_price: 4500,
    quantity: 3,
    low_stock_threshold: 2,
    supplier: 'موزع شاومي',
  },
  {
    id: '5',
    name: 'شاشة iPhone 13',
    name_fr: 'Écran iPhone 13',
    category: 'screen',
    brand: 'Apple',
    compatible_models: ['iPhone 13', 'iPhone 13 Mini'],
    purchase_price: 12000,
    sell_price: 18000,
    quantity: 2,
    low_stock_threshold: 2,
    supplier: 'موزع أبل',
  },
];

export default function SparePartsPage() {
  const { language } = useLanguage();
  const [parts, setParts] = useState([]);
  const [filteredParts, setFilteredParts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, lowStock: 0, totalValue: 0 });

  const [formData, setFormData] = useState({
    name: '',
    name_ar: '',
    category: '',
    compatible_brands: [],
    compatible_models: '',
    buy_price: '',
    sell_price: '',
    quantity: '',
    min_stock: '5',
    supplier: '',
    notes: '',
  });

  // Fetch spare parts from API
  const fetchParts = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/spare-parts`);
      const data = response.data || [];
      // Map API fields to frontend fields
      const mappedData = data.map(p => ({
        ...p,
        name_fr: p.name_ar || p.name,
        brand: p.compatible_brands?.[0] || 'Universal',
        compatible_models: Array.isArray(p.compatible_models) ? p.compatible_models : 
          (p.compatible_models ? p.compatible_models.split(',').map(m => m.trim()) : []),
        purchase_price: p.buy_price || 0,
        sell_price: p.sell_price || 0,
        low_stock_threshold: p.min_stock || 5,
      }));
      setParts(mappedData);
    } catch (error) {
      console.error('Error fetching spare parts:', error);
      toast.error(language === 'ar' ? 'فشل في تحميل البيانات' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  };

  // Fetch stats from API
  const fetchStats = async () => {
    try {
      const response = await apiClient.get(`/spare-parts/stats`);
      const data = response.data;
      setStats({
        total: data.total || 0,
        lowStock: data.low_stock || 0,
        totalValue: data.total_sell_value || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchParts();
    fetchStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    filterParts();
  }, [searchQuery, categoryFilter, brandFilter, parts]);

  const filterParts = () => {
    let filtered = [...parts];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.name_fr?.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query) ||
        p.compatible_models.some(m => m.toLowerCase().includes(query))
      );
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }

    if (brandFilter !== 'all') {
      filtered = filtered.filter(p => p.brand === brandFilter);
    }

    setFilteredParts(filtered);
  };

  const getCategoryLabel = (categoryId) => {
    const category = PART_CATEGORIES.find(c => c.id === categoryId);
    return category ? (language === 'ar' ? category.label.ar : category.label.fr) : categoryId;
  };

  const getLowStockParts = () => parts.filter(p => p.quantity <= p.low_stock_threshold);

  const getTotalValue = () => parts.reduce((sum, p) => sum + (p.purchase_price * p.quantity), 0);

  const handleOpenAdd = () => {
    setEditingPart(null);
    setFormData({
      name: '',
      name_ar: '',
      category: '',
      compatible_brands: [],
      compatible_models: '',
      buy_price: '',
      sell_price: '',
      quantity: '',
      min_stock: '5',
      supplier: '',
      notes: '',
    });
    setShowAddDialog(true);
  };

  const handleOpenEdit = (part) => {
    setEditingPart(part);
    setFormData({
      name: part.name,
      name_ar: part.name_ar || part.name_fr || '',
      category: part.category,
      compatible_brands: part.compatible_brands || [part.brand],
      compatible_models: Array.isArray(part.compatible_models) ? part.compatible_models.join(', ') : part.compatible_models || '',
      buy_price: (part.buy_price || part.purchase_price || '').toString(),
      sell_price: (part.sell_price || '').toString(),
      quantity: (part.quantity || '').toString(),
      min_stock: (part.min_stock || part.low_stock_threshold || '5').toString(),
      supplier: part.supplier || '',
      notes: part.notes || '',
    });
    setShowAddDialog(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.category) {
      toast.error(language === 'ar' ? 'يرجى ملء الحقول المطلوبة' : 'Veuillez remplir les champs requis');
      return;
    }

    const partData = {
      name: formData.name,
      name_ar: formData.name_ar || formData.name,
      category: formData.category,
      compatible_brands: formData.compatible_brands || [],
      compatible_models: formData.compatible_models,
      buy_price: parseFloat(formData.buy_price) || 0,
      sell_price: parseFloat(formData.sell_price) || 0,
      quantity: parseInt(formData.quantity) || 0,
      min_stock: parseInt(formData.min_stock) || 5,
      supplier: formData.supplier || '',
      notes: formData.notes || '',
    };

    try {
      if (editingPart) {
        await apiClient.put(`/spare-parts/${editingPart.id}`, partData);
        toast.success(language === 'ar' ? 'تم تحديث القطعة' : 'Pièce mise à jour');
      } else {
        await apiClient.post(`/spare-parts`, partData);
        toast.success(language === 'ar' ? 'تمت إضافة القطعة' : 'Pièce ajoutée');
      }

      // Refresh data
      await fetchParts();
      await fetchStats();
      setShowAddDialog(false);
    } catch (error) {
      console.error('Error saving spare part:', error);
      toast.error(language === 'ar' ? 'فشل في حفظ القطعة' : 'Échec de l\'enregistrement');
    }
  };

  const handleDelete = async (partId) => {
    try {
      await apiClient.delete(`/spare-parts/${partId}`);
      await fetchParts();
      await fetchStats();
      toast.success(language === 'ar' ? 'تم حذف القطعة' : 'Pièce supprimée');
    } catch (error) {
      console.error('Error deleting spare part:', error);
      toast.error(language === 'ar' ? 'فشل في حذف القطعة' : 'Échec de la suppression');
    }
  };

  const lowStockParts = getLowStockParts();

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="spare-parts-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Package className="h-8 w-8 text-purple-500" />
              </div>
              {language === 'ar' ? 'قطع الغيار' : 'Pièces de rechange'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'إدارة مخزون قطع الغيار' : 'Gérer le stock de pièces de rechange'}
            </p>
          </div>
          <Button onClick={handleOpenAdd}>
            <Plus className="h-4 w-4 me-2" />
            {language === 'ar' ? 'إضافة قطعة' : 'Ajouter une pièce'}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary">{parts.length}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي القطع' : 'Total pièces'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-emerald-500">{getTotalValue().toLocaleString()} دج</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'قيمة المخزون' : 'Valeur du stock'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-500">{lowStockParts.length}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'مخزون منخفض' : 'Stock faible'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-blue-500">{PART_CATEGORIES.length}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'فئات' : 'Catégories'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Alert */}
        {lowStockParts.length > 0 && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                {language === 'ar' ? 'تنبيه: مخزون منخفض' : 'Alerte: Stock faible'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {lowStockParts.map(part => (
                  <Badge key={part.id} variant="outline" className="bg-white dark:bg-background">
                    {part.name} ({part.quantity})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={language === 'ar' ? 'بحث بالاسم أو الموديل...' : 'Rechercher par nom ou modèle...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pe-10"
                  />
                </div>
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={language === 'ar' ? 'الفئة' : 'Catégorie'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'جميع الفئات' : 'Toutes catégories'}</SelectItem>
                  {PART_CATEGORIES.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {language === 'ar' ? cat.label.ar : cat.label.fr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder={language === 'ar' ? 'الماركة' : 'Marque'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'جميع الماركات' : 'Toutes marques'}</SelectItem>
                  {PHONE_BRANDS.map(brand => (
                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Parts Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'القطعة' : 'Pièce'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الفئة' : 'Catégorie'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الماركة' : 'Marque'}</TableHead>
                  <TableHead>{language === 'ar' ? 'سعر الشراء' : 'Prix achat'}</TableHead>
                  <TableHead>{language === 'ar' ? 'سعر البيع' : 'Prix vente'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الكمية' : 'Quantité'}</TableHead>
                  <TableHead>{language === 'ar' ? 'إجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>{language === 'ar' ? 'لا توجد قطع غيار' : 'Aucune pièce de rechange'}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredParts.map(part => (
                    <TableRow key={part.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{language === 'ar' ? part.name : part.name_fr || part.name}</p>
                          {part.compatible_models.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {part.compatible_models.slice(0, 2).join(', ')}
                              {part.compatible_models.length > 2 && '...'}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getCategoryLabel(part.category)}</Badge>
                      </TableCell>
                      <TableCell>{part.brand}</TableCell>
                      <TableCell>{part.purchase_price.toLocaleString()} دج</TableCell>
                      <TableCell className="font-bold text-emerald-600">{part.sell_price.toLocaleString()} دج</TableCell>
                      <TableCell>
                        <Badge variant={part.quantity <= part.low_stock_threshold ? 'destructive' : 'secondary'}>
                          {part.quantity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(part)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDelete(part.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add/Edit Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {editingPart
                  ? (language === 'ar' ? 'تعديل قطعة' : 'Modifier la pièce')
                  : (language === 'ar' ? 'إضافة قطعة جديدة' : 'Ajouter une pièce')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'الاسم (عربي)' : 'Nom (arabe)'} *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'الاسم (فرنسي)' : 'Nom (français)'}</Label>
                  <Input
                    value={formData.name_fr}
                    onChange={(e) => setFormData(prev => ({ ...prev, name_fr: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'الفئة' : 'Catégorie'} *</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder={language === 'ar' ? 'اختر...' : 'Choisir...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {PART_CATEGORIES.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {language === 'ar' ? cat.label.ar : cat.label.fr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'الماركة' : 'Marque'} *</Label>
                  <Select value={formData.brand} onValueChange={(value) => setFormData(prev => ({ ...prev, brand: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder={language === 'ar' ? 'اختر...' : 'Choisir...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {PHONE_BRANDS.map(brand => (
                        <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{language === 'ar' ? 'الموديلات المتوافقة' : 'Modèles compatibles'}</Label>
                <Input
                  value={formData.compatible_models}
                  onChange={(e) => setFormData(prev => ({ ...prev, compatible_models: e.target.value }))}
                  placeholder={language === 'ar' ? 'iPhone 14, iPhone 14 Pro...' : 'iPhone 14, iPhone 14 Pro...'}
                />
                <p className="text-xs text-muted-foreground">
                  {language === 'ar' ? 'افصل الموديلات بفاصلة' : 'Séparez les modèles par des virgules'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'سعر الشراء' : 'Prix d\'achat'}</Label>
                  <Input
                    type="number"
                    value={formData.purchase_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, purchase_price: e.target.value }))}
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'سعر البيع' : 'Prix de vente'}</Label>
                  <Input
                    type="number"
                    value={formData.sell_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, sell_price: e.target.value }))}
                    min="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'الكمية' : 'Quantité'}</Label>
                  <Input
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'حد التنبيه' : 'Seuil d\'alerte'}</Label>
                  <Input
                    type="number"
                    value={formData.low_stock_threshold}
                    onChange={(e) => setFormData(prev => ({ ...prev, low_stock_threshold: e.target.value }))}
                    min="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{language === 'ar' ? 'المورد' : 'Fournisseur'}</Label>
                <Input
                  value={formData.supplier}
                  onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                {language === 'ar' ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button onClick={handleSave}>
                {editingPart
                  ? (language === 'ar' ? 'تحديث' : 'Mettre à jour')
                  : (language === 'ar' ? 'إضافة' : 'Ajouter')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
