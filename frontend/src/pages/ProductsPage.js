import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import PrintButton from '../components/print/PrintButton';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { ExportPrintButtons } from '../components/ExportPrintButtons';
import { Pagination } from '../components/Pagination';
import { LazyImage } from '../components/LazyImage';
import { ProductAutocomplete } from '../components/ProductAutocomplete';
import { DefectiveProducts } from '../components/DefectiveProducts';
import { toast } from 'sonner';
import { 
  Package, 
  Plus, 
  Search,
  X,
  Filter,
  Grid3X3,
  List,
  LayoutGrid,
  ArrowUpDown,
  SortAsc,
  SortDesc,
  FileSpreadsheet,
  Zap,
  Trash2,
  CheckSquare,
  Square,
  AlertTriangle
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';

export default function ProductsPage() {
  const { t, isRTL, language } = useLanguage();
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [modelFilter, setModelFilter] = useState(searchParams.get('model') || '');
  const [viewMode, setViewMode] = useState(localStorage.getItem('productsViewMode') || 'grid'); // grid, list, compact
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [useQuickSearch, setUseQuickSearch] = useState(localStorage.getItem('useQuickSearch') === 'true');
  const [activeTab, setActiveTab] = useState('products'); // products, defective
  
  // Selection state for bulk delete
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(parseInt(localStorage.getItem('productsPerPage')) || 20);
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Toggle selection mode
  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    if (selectMode) {
      setSelectedProducts(new Set());
    }
  };

  // Toggle single product selection
  const toggleProductSelection = (productId) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  // Select all products on current page
  const selectAllProducts = () => {
    const newSelected = new Set(selectedProducts);
    sortedProducts.forEach(p => newSelected.add(p.id));
    setSelectedProducts(newSelected);
  };

  // Deselect all products
  const deselectAllProducts = () => {
    setSelectedProducts(new Set());
  };

  // Delete selected products
  const handleBulkDelete = async () => {
    if (selectedProducts.size === 0) return;
    
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Delete products one by one
      const deletePromises = Array.from(selectedProducts).map(id =>
        apiClient.delete(`/products/${id}`, { headers }).catch(err => ({ error: true, id }))
      );
      
      const results = await Promise.all(deletePromises);
      const failures = results.filter(r => r.error);
      
      if (failures.length === 0) {
        toast.success(language === 'ar' 
          ? `تم حذف ${selectedProducts.size} منتج بنجاح` 
          : `${selectedProducts.size} produits supprimés`);
      } else {
        toast.warning(language === 'ar' 
          ? `تم حذف ${selectedProducts.size - failures.length} منتج، فشل حذف ${failures.length}` 
          : `${selectedProducts.size - failures.length} supprimés, ${failures.length} échoués`);
      }
      
      setSelectedProducts(new Set());
      setSelectMode(false);
      setShowDeleteDialog(false);
      fetchProducts();
    } catch (error) {
      toast.error(language === 'ar' ? 'حدث خطأ أثناء الحذف' : 'Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  const changeViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('productsViewMode', mode);
  };

  const toggleQuickSearch = () => {
    const newValue = !useQuickSearch;
    setUseQuickSearch(newValue);
    localStorage.setItem('useQuickSearch', newValue.toString());
  };

  const handleQuickSelect = (product) => {
    navigate(`/products/${product.id}`);
  };

  const handleItemsPerPageChange = (newValue) => {
    setItemsPerPage(newValue);
    setCurrentPage(1);
    localStorage.setItem('productsPerPage', newValue.toString());
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sort products
  const sortedProducts = [...products].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        const nameA = language === 'ar' ? (a.name_ar || a.name_en) : (a.name_en || a.name_ar);
        const nameB = language === 'ar' ? (b.name_ar || b.name_en) : (b.name_en || b.name_ar);
        comparison = nameA.localeCompare(nameB);
        break;
      case 'price':
        comparison = (a.retail_price || 0) - (b.retail_price || 0);
        break;
      case 'stock':
        comparison = (a.quantity || 0) - (b.quantity || 0);
        break;
      case 'purchase_price':
        comparison = (a.purchase_price || 0) - (b.purchase_price || 0);
        break;
      default:
        comparison = 0;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (modelFilter) params.set('model', modelFilter);
      params.set('page', currentPage.toString());
      params.set('page_size', itemsPerPage.toString());
      
      const response = await apiClient.get(`/products/paginated?${params.toString()}`);
      setProducts(response.data.items);
      setTotalItems(response.data.total);
    } catch (error) {
      console.error('Error fetching products:', error);
      // Fallback to non-paginated endpoint
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.set('search', searchQuery);
        if (modelFilter) params.set('model', modelFilter);
        const response = await apiClient.get(`/products?${params.toString()}`);
        setProducts(response.data);
        setTotalItems(response.data.length);
      } catch (e) {
        console.error('Fallback also failed:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [searchQuery, modelFilter, currentPage, itemsPerPage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (modelFilter) params.set('model', modelFilter);
    setSearchParams(params);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setModelFilter('');
    setCurrentPage(1);
    setSearchParams({});
  };

  const getStockBadge = (quantity) => {
    if (quantity === 0) {
      return <Badge variant="destructive">{t.outOfStock}</Badge>;
    } else if (quantity < 10) {
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">{t.lowStockWarning}</Badge>;
    }
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{t.inStock}</Badge>;
  };

  // Quick export to Excel function
  const quickExportToExcel = () => {
    const headers = [
      language === 'ar' ? 'الكود' : 'Code',
      language === 'ar' ? 'المنتج' : 'Produit',
      language === 'ar' ? 'العائلة' : 'Famille',
      language === 'ar' ? 'المخزون' : 'Stock',
      language === 'ar' ? 'سعر البيع' : 'Prix vente',
      language === 'ar' ? 'سعر الشراء' : 'Prix achat'
    ];
    
    let tableHtml = `<table><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    products.forEach(p => {
      tableHtml += `<tr>
        <td>${p.article_code || '-'}</td>
        <td>${language === 'ar' ? p.name_ar : p.name_en}</td>
        <td>${p.family_name || '-'}</td>
        <td>${p.quantity}</td>
        <td>${p.retail_price?.toFixed(2) || '0.00'}</td>
        <td>${p.purchase_price?.toFixed(2) || '0.00'}</td>
      </tr>`;
    });
    tableHtml += '</table>';
    
    const blob = new Blob([`<html><head><meta charset="UTF-8"></head><body>${tableHtml}</body></html>`], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_${new Date().toISOString().split('T')[0]}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="products-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t.products}</h1>
            <p className="text-muted-foreground mt-1">
              {totalItems} {t.products.toLowerCase()}
              {selectMode && selectedProducts.size > 0 && (
                <span className="ms-2 text-primary font-medium">
                  ({selectedProducts.size} {language === 'ar' ? 'محدد' : 'sélectionnés'})
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {activeTab === 'products' && (
              <>
                {/* Bulk Selection Mode Toggle */}
                <Button 
                  variant={selectMode ? "default" : "outline"} 
                  onClick={toggleSelectMode} 
                  className="gap-2"
                  data-testid="bulk-select-btn"
                >
                  {selectMode ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  <span className="hidden sm:inline">{language === 'ar' ? 'تحديد متعدد' : 'Sélection multiple'}</span>
                </Button>
                
                {/* Bulk Actions */}
                {selectMode && selectedProducts.size > 0 && (
                  <>
                    <Button 
                      variant="destructive" 
                      onClick={() => setShowDeleteDialog(true)}
                      className="gap-2"
                      data-testid="bulk-delete-btn"
                    >
                      <Trash2 className="h-4 w-4" />
                      {language === 'ar' ? `حذف (${selectedProducts.size})` : `Supprimer (${selectedProducts.size})`}
                    </Button>
                    <Button variant="ghost" onClick={deselectAllProducts} size="sm">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
                
                {selectMode && (
                  <Button variant="outline" onClick={selectAllProducts} size="sm">
                    {language === 'ar' ? 'تحديد الكل' : 'Tout sélectionner'}
                  </Button>
                )}
                
                {/* Quick Excel Export Button */}
                <Button variant="outline" onClick={quickExportToExcel} className="gap-2" data-testid="quick-export-excel-btn">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  <span className="hidden sm:inline">Excel</span>
                </Button>
                <Link to="/products/add">
                  <Button className="gap-2" data-testid="add-product-btn">
                    <Plus className="h-5 w-5" />
                    {t.addProduct}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="products" className="gap-2" data-testid="products-tab">
              <Package className="h-4 w-4" />
              {language === 'ar' ? 'المنتجات' : 'Produits'}
            </TabsTrigger>
            <TabsTrigger value="defective" className="gap-2" data-testid="defective-tab">
              <AlertTriangle className="h-4 w-4" />
              {language === 'ar' ? 'المعطلة' : 'Défectueux'}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="defective" className="mt-6">
            <DefectiveProducts />
          </TabsContent>
          
          <TabsContent value="products" className="mt-6 space-y-6">
            {/* Bulk Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {language === 'ar' ? 'تأكيد الحذف' : 'Confirmer la suppression'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {language === 'ar' 
                      ? `هل أنت متأكد من حذف ${selectedProducts.size} منتج؟ لا يمكن التراجع عن هذا الإجراء.`
                      : `Êtes-vous sûr de supprimer ${selectedProducts.size} produits? Cette action est irréversible.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>
                    {language === 'ar' ? 'إلغاء' : 'Annuler'}
                  </AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleBulkDelete}
                    disabled={deleting}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {deleting 
                  ? (language === 'ar' ? 'جارٍ الحذف...' : 'Suppression...') 
                  : (language === 'ar' ? 'حذف' : 'Supprimer')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Search & Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {language === 'ar' ? 'طريقة العرض:' : 'Affichage:'}
                </span>
                <div className="flex border rounded-lg">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => changeViewMode('grid')}
                    className="rounded-r-none"
                    data-testid="view-grid-btn"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => changeViewMode('list')}
                    className="rounded-none border-x"
                    data-testid="view-list-btn"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'compact' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => changeViewMode('compact')}
                    className="rounded-l-none"
                    data-testid="view-compact-btn"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* Export & Print */}
                <ExportPrintButtons
                  data={products.map(p => ({
                    article_code: p.article_code || '-',
                    name: language === 'ar' ? p.name_ar : p.name_en,
                    family: p.family_name || '-',
                    stock: p.quantity,
                    price: p.retail_price?.toFixed(2) || '0.00',
                    purchase_price: p.purchase_price?.toFixed(2) || '0.00'
                  }))}
                  columns={[
                    { key: 'article_code', label: language === 'ar' ? 'الكود' : 'Code' },
                    { key: 'name', label: language === 'ar' ? 'المنتج' : 'Produit' },
                    { key: 'family', label: language === 'ar' ? 'العائلة' : 'Famille' },
                    { key: 'stock', label: language === 'ar' ? 'المخزون' : 'Stock' },
                    { key: 'price', label: language === 'ar' ? 'السعر' : 'Prix' },
                    { key: 'purchase_price', label: language === 'ar' ? 'سعر الشراء' : 'Prix achat' }
                  ]}
                  filename="products"
                  title={language === 'ar' ? 'قائمة المنتجات' : 'Liste des produits'}
                  language={language}
                />
              </div>
              
              {/* Sort Controls */}
              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[150px]">
                    <ArrowUpDown className="h-4 w-4 me-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">{language === 'ar' ? 'الاسم' : 'Nom'}</SelectItem>
                    <SelectItem value="price">{language === 'ar' ? 'السعر' : 'Prix'}</SelectItem>
                    <SelectItem value="stock">{language === 'ar' ? 'المخزون' : 'Stock'}</SelectItem>
                    <SelectItem value="purchase_price">{language === 'ar' ? 'سعر الشراء' : 'Prix achat'}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  title={sortOrder === 'asc' ? 'تصاعدي' : 'تنازلي'}
                >
                  {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
              {useQuickSearch ? (
                <ProductAutocomplete
                  onSelect={handleQuickSelect}
                  placeholder={t.searchPlaceholder}
                  className="flex-1"
                  clearOnSelect={false}
                />
              ) : (
                <div className="relative flex-1">
                  <Search className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
                  <Input
                    type="text"
                    placeholder={t.searchPlaceholder}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`h-11 ${isRTL ? 'pr-10' : 'pl-10'}`}
                    data-testid="product-search-input"
                  />
                </div>
              )}
              <Button
                type="button"
                variant={useQuickSearch ? "default" : "outline"}
                size="icon"
                onClick={toggleQuickSearch}
                title={language === 'ar' ? 'بحث فوري' : 'Recherche rapide'}
                className="h-11 w-11"
              >
                <Zap className={`h-5 w-5 ${useQuickSearch ? 'text-yellow-300' : ''}`} />
              </Button>
              <div className="relative flex-1 sm:max-w-xs">
                <Filter className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
                <Input
                  type="text"
                  placeholder={t.filterByModel}
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  className={`h-11 ${isRTL ? 'pr-10' : 'pl-10'}`}
                  data-testid="model-filter-input"
                />
              </div>
              {(searchQuery || modelFilter) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearFilters}
                  className="gap-2"
                  data-testid="clear-filters-btn"
                >
                  <X className="h-4 w-4" />
                  {t.clearFilters}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Products Grid */}
        {loading ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="spinner" />
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="empty-state py-16">
            <Package className="h-20 w-20 text-muted-foreground mb-4" />
            <h3 className="text-xl font-medium">{t.noProducts}</h3>
            <p className="text-muted-foreground mt-2">{t.noProductsSubtitle}</p>
            {isAdmin && (
              <Link to="/products/add" className="mt-6">
                <Button className="gap-2">
                  <Plus className="h-5 w-5" />
                  {t.addProduct}
                </Button>
              </Link>
            )}
          </div>
        ) : viewMode === 'list' ? (
          /* List View - Table style with all info */
          <div className="border rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className={`grid gap-2 p-3 bg-muted/50 text-xs font-medium border-b ${selectMode ? 'grid-cols-8' : 'grid-cols-7'}`}>
              {selectMode && <div className="w-8"></div>}
              <div>{language === 'ar' ? 'كود المنتج' : 'Code Article'}</div>
              <div>{language === 'ar' ? 'اسم المنتج' : 'Nom d\'article'}</div>
              <div>{language === 'ar' ? 'العائلة' : 'Famille'}</div>
              <div className="text-center">{language === 'ar' ? 'المخزون' : 'Stock'}</div>
              <div className="text-center">{language === 'ar' ? 'السعر' : 'Prix'}</div>
              <div className="text-center">{language === 'ar' ? 'آخر شراء' : 'Dernier Achat'}</div>
              <div className="text-center">{language === 'ar' ? 'طباعة' : 'Imprimer'}</div>
            </div>
            {/* Table Body */}
            <div className="divide-y">
              {sortedProducts.map((product) => (
                <div
                  key={product.id}
                  className={`block hover:bg-muted/30 transition-colors ${selectedProducts.has(product.id) ? 'bg-primary/5' : ''}`}
                  data-testid={`product-item-${product.id}`}
                >
                  <div className={`grid gap-2 p-3 items-center text-sm ${selectMode ? 'grid-cols-8' : 'grid-cols-7'}`}>
                    {/* Selection Checkbox */}
                    {selectMode && (
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={selectedProducts.has(product.id)}
                          onCheckedChange={() => toggleProductSelection(product.id)}
                          data-testid={`select-product-${product.id}`}
                        />
                      </div>
                    )}
                    {/* Code Article */}
                    <Link to={`/products/${product.id}`} className="font-mono text-xs text-blue-600 font-medium hover:underline">
                      {product.article_code || '-'}
                    </Link>
                    {/* Nom d'article */}
                    <Link to={`/products/${product.id}`} className="flex items-center gap-2">
                      <img
                        src={product.image_url || 'https://images.unsplash.com/photo-1634403665443-81dc4d75843a?crop=entropy&cs=srgb&fm=jpg&q=85'}
                        alt=""
                        className="w-8 h-8 object-cover rounded"
                      />
                      <span className="truncate font-medium">
                        {language === 'ar' ? product.name_ar : product.name_en}
                      </span>
                    </Link>
                    {/* Famille */}
                    <div className="text-muted-foreground text-xs">
                      {product.family_name || '-'}
                    </div>
                    {/* Stock */}
                    <div className="text-center">
                      {getStockBadge(product.quantity)}
                    </div>
                    {/* Prix */}
                    <div className="text-center font-bold">
                      {product.retail_price?.toFixed(2)} <span className="text-xs font-normal">{t.currency}</span>
                    </div>
                    {/* Dernier Achat */}
                    <div className="text-center text-xs text-muted-foreground">
                      {product.last_purchase_date 
                        ? new Date(product.last_purchase_date).toLocaleDateString(language === 'ar' ? 'ar-DZ' : 'fr-FR')
                        : '-'}
                    </div>
                    {/* Print */}
                    <div className="flex justify-center">
                      <PrintButton docType="product" record={product} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : viewMode === 'compact' ? (
          /* Compact View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {sortedProducts.map((product) => (
              <div
                key={product.id}
                className={`relative block ${selectedProducts.has(product.id) ? 'ring-2 ring-primary' : ''}`}
                data-testid={`product-item-${product.id}`}
              >
                {selectMode && (
                  <div className="absolute top-1 right-1 z-10">
                    <Checkbox
                      checked={selectedProducts.has(product.id)}
                      onCheckedChange={() => toggleProductSelection(product.id)}
                      className="bg-white shadow"
                    />
                  </div>
                )}
                <Link to={`/products/${product.id}`}>
                  <div className="border rounded-lg p-2 bg-card hover:bg-muted/50 transition-colors text-center">
                    <LazyImage
                      src={product.image_url}
                      alt={language === 'ar' ? product.name_ar : product.name_en}
                      className="w-full aspect-square object-cover rounded-md mb-2"
                    />
                    <p className="text-xs font-medium truncate">{language === 'ar' ? product.name_ar : product.name_en}</p>
                    <p className="text-xs font-bold text-primary">{product.retail_price?.toFixed(0)} {t.currency}</p>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          /* Grid View (default) */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sortedProducts.map((product) => (
              <div
                key={product.id}
                className={`relative block ${selectedProducts.has(product.id) ? 'ring-2 ring-primary' : ''}`}
                data-testid={`product-item-${product.id}`}
              >
                {selectMode && (
                  <div className="absolute top-3 left-3 z-10">
                    <Checkbox
                      checked={selectedProducts.has(product.id)}
                      onCheckedChange={() => toggleProductSelection(product.id)}
                      className="bg-white shadow h-5 w-5"
                    />
                  </div>
                )}
                <Link to={`/products/${product.id}`}>
                  <div className="product-card border rounded-xl overflow-hidden bg-card h-full flex flex-col">
                    <div className="product-image-container aspect-square relative">
                      <LazyImage
                        src={product.image_url}
                        alt={language === 'ar' ? product.name_ar : product.name_en}
                        className="w-full h-full object-cover"
                      />
                      <div className={`absolute top-3 ${isRTL ? 'left-3' : 'right-3'}`}>
                        {getStockBadge(product.quantity)}
                      </div>
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <h3 className="font-semibold text-lg line-clamp-1">
                        {language === 'ar' ? product.name_ar : product.name_en}
                      </h3>
                      <p className="text-muted-foreground text-sm mt-1 line-clamp-2 flex-1">
                        {language === 'ar' ? product.description_ar : product.description_en}
                      </p>
                      <div className="mt-4">
                        <p className="text-primary font-bold text-xl">
                          {(product.retail_price ?? product.price ?? 0).toFixed(2)} {t.currency}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t.quantity}: {product.quantity ?? 0}
                        </p>
                      </div>
                      {product.compatible_models && product.compatible_models.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                            {t.compatibleModels}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {product.compatible_models.slice(0, 3).map((model, idx) => (
                              <span key={idx} className="model-badge">
                                {model}
                              </span>
                            ))}
                            {product.compatible_models.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{product.compatible_models.length - 3}
                              </Badge>
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalItems > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
            className="mt-6"
          />
        )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
