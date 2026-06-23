import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Warehouse, 
  Plus, 
  ArrowRightLeft, 
  Package,
  MapPin,
  Edit2,
  Trash2,
  Check,
  Building2,
  Boxes,
  TrendingUp,
  Search,
  Grid3X3,
  List
} from 'lucide-react';

export default function WarehousesPage() {
  const { t, language } = useLanguage();
  
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('warehouses');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('warehousesViewMode') || 'grid');
  
  // Dialogs
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  
  // Form states
  const [newWarehouse, setNewWarehouse] = useState({ name: '', address: '', phone: '', manager: '', notes: '', is_main: false });
  const [transfer, setTransfer] = useState({
    from_warehouse: '',
    to_warehouse: '',
    product_id: '',
    quantity: 1
  });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [warehousesRes, productsRes, transfersRes] = await Promise.all([
        apiClient.get(`/warehouses`, { headers }).catch(() => ({ data: [] })),
        apiClient.get(`/products`, { headers }),
        apiClient.get(`/stock-transfers`, { headers }).catch(() => ({ data: [] }))
      ]);
      
      // If no warehouses, create default main warehouse
      if (warehousesRes.data.length === 0) {
        const defaultWarehouse = {
          id: 'main',
          name: language === 'ar' ? 'المخزن الرئيسي' : 'Entrepôt principal',
          address: '',
          is_main: true
        };
        setWarehouses([defaultWarehouse]);
      } else {
        setWarehouses(warehousesRes.data);
      }
      
      setProducts(productsRes.data);
      setTransfers(transfersRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWarehouse = async () => {
    if (!newWarehouse.name.trim()) {
      toast.error(language === 'ar' ? 'يرجى إدخال اسم المخزن' : 'Veuillez entrer le nom de l\'entrepôt');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/warehouses`, newWarehouse);
      toast.success(language === 'ar' ? 'تم إضافة المخزن' : 'Entrepôt ajouté');
      setShowAddWarehouse(false);
      setNewWarehouse({ name: '', address: '', phone: '', manager: '', notes: '', is_main: false });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  const handleUpdateWarehouse = async () => {
    if (!editingWarehouse?.name.trim()) return;

    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/warehouses/${editingWarehouse.id}`, editingWarehouse);
      toast.success(language === 'ar' ? 'تم تحديث المخزن' : 'Entrepôt mis à jour');
      setEditingWarehouse(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  const handleDeleteWarehouse = async (id) => {
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذا المخزن؟' : 'Êtes-vous sûr de supprimer cet entrepôt?')) return;

    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/warehouses/${id}`);
      toast.success(language === 'ar' ? 'تم حذف المخزن' : 'Entrepôt supprimé');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  const handleTransfer = async () => {
    if (!transfer.from_warehouse || !transfer.to_warehouse || !transfer.product_id || transfer.quantity < 1) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول' : 'Veuillez remplir tous les champs');
      return;
    }

    if (transfer.from_warehouse === transfer.to_warehouse) {
      toast.error(language === 'ar' ? 'لا يمكن التحويل لنفس المخزن' : 'Impossible de transférer vers le même entrepôt');
      return;
    }

    try {
      await apiClient.post(`/stock-transfers`, transfer);
      toast.success(language === 'ar' ? 'تم تحويل المخزون بنجاح' : 'Stock transféré avec succès');
      setShowTransfer(false);
      setTransfer({ from_warehouse: '', to_warehouse: '', product_id: '', quantity: 1 });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  const filteredProducts = products.filter(p => {
    const query = searchQuery.toLowerCase();
    return (
      p.name_ar?.toLowerCase().includes(query) ||
      p.name_en?.toLowerCase().includes(query) ||
      p.barcode?.toLowerCase().includes(query)
    );
  });

  const mainWarehouse = warehouses.find(w => w.is_main);
  const secondaryWarehouses = warehouses.filter(w => !w.is_main);

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const setViewModeAndSave = (mode) => {
    setViewMode(mode);
    localStorage.setItem('warehousesViewMode', mode);
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="warehouses-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {language === 'ar' ? 'إدارة المخازن' : 'Gestion des entrepôts'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'إدارة المخازن وتحويل المخزون بينها' : 'Gérer les entrepôts et transférer le stock'}
            </p>
          </div>
          <div className="flex gap-2">
            {/* View Mode Toggle */}
            <div className="flex border rounded-lg">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => setViewModeAndSave('grid')}
                className="rounded-e-none"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => setViewModeAndSave('list')}
                className="rounded-s-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => setShowTransfer(true)} variant="outline" className="gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              {language === 'ar' ? 'تحويل مخزون' : 'Transférer'}
            </Button>
            <Button onClick={() => setShowAddWarehouse(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              {language === 'ar' ? 'إضافة مخزن' : 'Ajouter'}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'عدد المخازن' : 'Nombre d\'entrepôts'}</p>
                  <p className="text-3xl font-bold mt-1">{warehouses.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
                  <Warehouse className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي المنتجات' : 'Total produits'}</p>
                  <p className="text-3xl font-bold mt-1">{products.reduce((sum, p) => sum + (p.quantity || 0), 0)}</p>
                </div>
                <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600">
                  <Boxes className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'عمليات التحويل' : 'Transferts'}</p>
                  <p className="text-3xl font-bold mt-1">{transfers.length}</p>
                </div>
                <div className="p-3 rounded-xl bg-purple-100 text-purple-600">
                  <ArrowRightLeft className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="warehouses" className="gap-2">
              <Warehouse className="h-4 w-4" />
              {language === 'ar' ? 'المخازن' : 'Entrepôts'}
            </TabsTrigger>
            <TabsTrigger value="transfers" className="gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              {language === 'ar' ? 'سجل التحويلات' : 'Historique'}
            </TabsTrigger>
          </TabsList>

          {/* Warehouses Tab */}
          <TabsContent value="warehouses" className="space-y-4">
            {/* Main Warehouse */}
            {mainWarehouse && (
              <Card className="border-primary/50 bg-primary/5">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/20">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {mainWarehouse.name}
                          <Badge className="bg-primary">{language === 'ar' ? 'رئيسي' : 'Principal'}</Badge>
                          {mainWarehouse.code && (
                            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                              {mainWarehouse.code}
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription>{mainWarehouse.address || (language === 'ar' ? 'بدون عنوان' : 'Sans adresse')}</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setEditingWarehouse(mainWarehouse)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            )}

            {/* Secondary Warehouses */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {secondaryWarehouses.map(warehouse => (
                <Card key={warehouse.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <Warehouse className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            {warehouse.name}
                            {warehouse.code && (
                              <span className="font-mono text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                                {warehouse.code}
                              </span>
                            )}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {warehouse.address || (language === 'ar' ? 'بدون عنوان' : 'Sans adresse')}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditingWarehouse(warehouse)}>
                        <Edit2 className="h-4 w-4 me-1" />
                        {t.edit}
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-500" onClick={() => handleDeleteWarehouse(warehouse.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Add New Warehouse Card */}
              <Card 
                className="border-dashed cursor-pointer hover:bg-muted/50 transition-colors flex items-center justify-center min-h-[150px]"
                onClick={() => setShowAddWarehouse(true)}
              >
                <div className="text-center text-muted-foreground">
                  <Plus className="h-8 w-8 mx-auto mb-2" />
                  <p>{language === 'ar' ? 'إضافة مخزن جديد' : 'Ajouter un entrepôt'}</p>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Transfers Tab */}
          <TabsContent value="transfers">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'سجل تحويلات المخزون' : 'Historique des transferts'}</CardTitle>
              </CardHeader>
              <CardContent>
                {transfers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ArrowRightLeft className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{language === 'ar' ? 'لا توجد تحويلات' : 'Aucun transfert'}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'المنتج' : 'Produit'}</TableHead>
                        <TableHead>{language === 'ar' ? 'من' : 'De'}</TableHead>
                        <TableHead>{language === 'ar' ? 'إلى' : 'Vers'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الكمية' : 'Quantité'}</TableHead>
                        <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map(transfer => (
                        <TableRow key={transfer.id}>
                          <TableCell className="font-medium">{transfer.product_name}</TableCell>
                          <TableCell>{transfer.from_warehouse_name}</TableCell>
                          <TableCell>{transfer.to_warehouse_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{transfer.quantity}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(transfer.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Warehouse Dialog */}
        <Dialog open={showAddWarehouse} onOpenChange={setShowAddWarehouse}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Warehouse className="h-5 w-5" />
                {language === 'ar' ? 'إضافة مخزن جديد' : 'Ajouter un entrepôt'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>{language === 'ar' ? 'اسم المخزن *' : 'Nom de l\'entrepôt *'}</Label>
                <Input
                  value={newWarehouse.name}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, name: e.target.value })}
                  placeholder={language === 'ar' ? 'مثال: مخزن الفرع الثاني' : 'Ex: Entrepôt succursale 2'}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{language === 'ar' ? 'رقم الهاتف' : 'Téléphone'}</Label>
                  <Input
                    value={newWarehouse.phone || ''}
                    onChange={(e) => setNewWarehouse({ ...newWarehouse, phone: e.target.value })}
                    placeholder={language === 'ar' ? 'رقم الهاتف' : 'Téléphone'}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{language === 'ar' ? 'مسؤول المخزن' : 'Responsable'}</Label>
                  <Input
                    value={newWarehouse.manager || ''}
                    onChange={(e) => setNewWarehouse({ ...newWarehouse, manager: e.target.value })}
                    placeholder={language === 'ar' ? 'اسم المسؤول' : 'Nom du responsable'}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label>{language === 'ar' ? 'العنوان' : 'Adresse'}</Label>
                <Input
                  value={newWarehouse.address}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, address: e.target.value })}
                  placeholder={language === 'ar' ? 'العنوان (اختياري)' : 'Adresse (optionnel)'}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{language === 'ar' ? 'ملاحظات' : 'Notes'}</Label>
                <Input
                  value={newWarehouse.notes || ''}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, notes: e.target.value })}
                  placeholder={language === 'ar' ? 'ملاحظات إضافية' : 'Notes supplémentaires'}
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={newWarehouse.is_main}
                  onCheckedChange={(checked) => setNewWarehouse({ ...newWarehouse, is_main: checked })}
                />
                <Label className="cursor-pointer">{language === 'ar' ? 'مخزن رئيسي' : 'Entrepôt principal'}</Label>
              </div>
              <Button onClick={handleAddWarehouse} className="w-full">
                {language === 'ar' ? 'إضافة المخزن' : 'Ajouter l\'entrepôt'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Warehouse Dialog */}
        <Dialog open={!!editingWarehouse} onOpenChange={() => setEditingWarehouse(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit2 className="h-5 w-5" />
                {language === 'ar' ? 'تعديل المخزن' : 'Modifier l\'entrepôt'}
              </DialogTitle>
            </DialogHeader>
            {editingWarehouse && (
              <div className="space-y-4 mt-4">
                <div>
                  <Label>{language === 'ar' ? 'اسم المخزن' : 'Nom de l\'entrepôt'}</Label>
                  <Input
                    value={editingWarehouse.name}
                    onChange={(e) => setEditingWarehouse({ ...editingWarehouse, name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{language === 'ar' ? 'العنوان' : 'Adresse'}</Label>
                  <Input
                    value={editingWarehouse.address || ''}
                    onChange={(e) => setEditingWarehouse({ ...editingWarehouse, address: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <Button onClick={handleUpdateWarehouse} className="w-full">
                  {language === 'ar' ? 'حفظ التغييرات' : 'Enregistrer'}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Transfer Dialog */}
        <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                {language === 'ar' ? 'تحويل مخزون' : 'Transférer du stock'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {/* Product Selection */}
              <div>
                <Label>{language === 'ar' ? 'المنتج' : 'Produit'}</Label>
                <div className="relative mt-1">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={language === 'ar' ? 'ابحث عن منتج...' : 'Rechercher un produit...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="ps-9"
                  />
                </div>
                {searchQuery && (
                  <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg">
                    {filteredProducts.slice(0, 10).map(product => (
                      <div
                        key={product.id}
                        onClick={() => {
                          setTransfer({ ...transfer, product_id: product.id });
                          setSearchQuery(language === 'ar' ? product.name_ar : product.name_en);
                        }}
                        className="p-2 hover:bg-muted cursor-pointer flex justify-between"
                      >
                        <span>{language === 'ar' ? product.name_ar : product.name_en}</span>
                        <Badge variant="outline">{product.quantity}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* From Warehouse */}
              <div>
                <Label>{language === 'ar' ? 'من مخزن' : 'De l\'entrepôt'}</Label>
                <Select value={transfer.from_warehouse} onValueChange={(v) => setTransfer({ ...transfer, from_warehouse: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={language === 'ar' ? 'اختر المخزن' : 'Sélectionner'} />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* To Warehouse */}
              <div>
                <Label>{language === 'ar' ? 'إلى مخزن' : 'Vers l\'entrepôt'}</Label>
                <Select value={transfer.to_warehouse} onValueChange={(v) => setTransfer({ ...transfer, to_warehouse: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={language === 'ar' ? 'اختر المخزن' : 'Sélectionner'} />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.filter(w => w.id !== transfer.from_warehouse).map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity */}
              <div>
                <Label>{language === 'ar' ? 'الكمية' : 'Quantité'}</Label>
                <Input
                  type="number"
                  min="1"
                  value={transfer.quantity}
                  onChange={(e) => setTransfer({ ...transfer, quantity: parseInt(e.target.value) || 1 })}
                  className="mt-1"
                />
              </div>

              <Button onClick={handleTransfer} className="w-full gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                {language === 'ar' ? 'تأكيد التحويل' : 'Confirmer le transfert'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
