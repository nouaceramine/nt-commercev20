import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Switch } from '../components/ui/switch';
import { Slider } from '../components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  DollarSign,
  Percent,
  Calculator,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Check,
  Eye,
  Search,
  Package,
  TrendingUp,
  TrendingDown,
  Settings2,
  Save,
  History,
  AlertTriangle,
  Sparkles,
  Target,
  Layers,
  Filter
} from 'lucide-react';

export default function BulkPriceUpdatePage() {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [families, setFamilies] = useState([]);
  const [products, setProducts] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [applying, setApplying] = useState(false);
  
  // Form state
  const [updateType, setUpdateType] = useState('percentage');
  const [priceField, setPriceField] = useState('all');
  const [value, setValue] = useState(0);
  const [selectedFamily, setSelectedFamily] = useState('all');
  const [roundTo, setRoundTo] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  
  // Margin calculator
  const [showMarginCalculator, setShowMarginCalculator] = useState(false);
  const [targetMargin, setTargetMargin] = useState(30);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (value !== 0 || selectMode) {
      fetchPreview();
    } else {
      setPreviews([]);
    }
  }, [updateType, priceField, value, selectedFamily, roundTo, minPrice, maxPrice, selectedProducts, selectMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [familiesRes, productsRes] = await Promise.all([
        apiClient.get(`/product-families`, { headers }),
        apiClient.get(`/products`, { headers })
      ]);
      setFamilies(familiesRes.data);
      setProducts(productsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPreview = async () => {
    if (value === 0 && !selectMode) return;
    
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        update_type: updateType,
        price_field: priceField,
        value: value.toString(),
        round_to: roundTo.toString()
      });
      
      if (selectedFamily !== 'all') {
        params.append('family_id', selectedFamily);
      }
      
      if (minPrice > 0) {
        params.append('min_price', minPrice.toString());
      }
      
      if (maxPrice > 0) {
        params.append('max_price', maxPrice.toString());
      }
      
      const response = await apiClient.get(`/products/price-preview?${params}`);
      
      let filteredPreviews = response.data.previews;
      
      // Filter by selected products if in select mode
      if (selectMode && selectedProducts.size > 0) {
        filteredPreviews = filteredPreviews.filter(p => selectedProducts.has(p.id));
      }
      
      // Filter by search
      if (searchQuery) {
        filteredPreviews = filteredPreviews.filter(p => 
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.article_code?.toLowerCase().includes(searchQuery.toLowerCase())  // البحث بكود المنتج
        );
      }
      
      setPreviews(filteredPreviews);
      setTotalProducts(selectMode && selectedProducts.size > 0 ? selectedProducts.size : response.data.total_products);
    } catch (error) {
      console.error('Error fetching preview:', error);
    }
  };

  const applyChanges = async () => {
    if (totalProducts === 0) {
      toast.error(language === 'ar' ? 'لا توجد منتجات للتحديث' : 'Aucun produit à mettre à jour');
      return;
    }
    
    setApplying(true);
    try {
      const data = {
        update_type: updateType,
        price_field: priceField,
        value: value,
        round_to: roundTo
      };
      
      if (selectedFamily !== 'all') {
        data.family_id = selectedFamily;
      }
      
      if (selectMode && selectedProducts.size > 0) {
        data.product_ids = Array.from(selectedProducts);
      }
      
      const response = await apiClient.post(`/products/bulk-price-update`, data);
      
      toast.success(`${t.priceUpdated}: ${response.data.updated_count} ${language === 'ar' ? 'منتج' : 'produits'}`);
      setValue(0);
      setPreviews([]);
      setSelectedProducts(new Set());
      setSelectMode(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.error);
    } finally {
      setApplying(false);
    }
  };

  // Calculate margin-based price
  const calculateMarginPrice = () => {
    // For retail price = purchase price * (1 + margin/100)
    const marginMultiplier = (100 + targetMargin) / 100;
    setUpdateType('margin');
    setValue(targetMargin);
    setShowMarginCalculator(false);
    toast.success(language === 'ar' ? `تم تعيين هامش ربح ${targetMargin}%` : `Marge de ${targetMargin}% définie`);
  };

  const formatPrice = (price) => {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const getChangeColor = (diff) => {
    if (diff > 0) return 'text-green-600';
    if (diff < 0) return 'text-red-600';
    return 'text-muted-foreground';
  };

  const toggleProductSelection = (productId) => {
    const newSelection = new Set(selectedProducts);
    if (newSelection.has(productId)) {
      newSelection.delete(productId);
    } else {
      newSelection.add(productId);
    }
    setSelectedProducts(newSelection);
  };

  const selectAllProducts = () => {
    const allIds = new Set(products.map(p => p.id));
    setSelectedProducts(allIds);
  };

  const clearSelection = () => {
    setSelectedProducts(new Set());
  };

  // Quick percentage buttons
  const quickPercentages = [5, 10, 15, 20, 25, 30];

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t.bulkPriceUpdate}</h1>
            <p className="text-muted-foreground">
              {language === 'ar' ? 'تحديث أسعار المنتجات بشكل جماعي وذكي' : 'Mise à jour intelligente des prix en masse'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowMarginCalculator(true)}
              className="gap-2"
            >
              <Target className="h-4 w-4" />
              {language === 'ar' ? 'حاسبة الهامش' : 'Calculateur de marge'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Update Form */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                {language === 'ar' ? 'إعدادات التحديث' : 'Paramètres'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Update Type Tabs */}
              <div>
                <Label className="mb-2 block">{t.priceUpdateType}</Label>
                <Tabs value={updateType} onValueChange={setUpdateType}>
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="percentage" className="gap-1">
                      <Percent className="h-4 w-4" />
                      %
                    </TabsTrigger>
                    <TabsTrigger value="fixed" className="gap-1">
                      <DollarSign className="h-4 w-4" />
                      ±
                    </TabsTrigger>
                    <TabsTrigger value="set" className="gap-1">
                      <Target className="h-4 w-4" />
                      =
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <p className="text-xs text-muted-foreground mt-2">
                  {updateType === 'percentage' && (language === 'ar' ? 'زيادة أو نقصان بنسبة مئوية' : 'Augmenter/diminuer par pourcentage')}
                  {updateType === 'fixed' && (language === 'ar' ? 'إضافة أو طرح مبلغ ثابت' : 'Ajouter/soustraire un montant fixe')}
                  {updateType === 'set' && (language === 'ar' ? 'تعيين سعر جديد محدد' : 'Définir un nouveau prix fixe')}
                </p>
              </div>

              {/* Price Field */}
              <div>
                <Label className="mb-2 block">{t.priceField}</Label>
                <Select value={priceField} onValueChange={setPriceField}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        {t.allPrices}
                      </div>
                    </SelectItem>
                    <SelectItem value="purchase_price">{t.purchasePrice}</SelectItem>
                    <SelectItem value="wholesale_price">{t.wholesalePrice}</SelectItem>
                    <SelectItem value="retail_price">{t.retailPrice}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Value Input */}
              <div>
                <Label className="mb-2 block">
                  {updateType === 'percentage' ? (language === 'ar' ? 'النسبة المئوية' : 'Pourcentage') :
                   updateType === 'fixed' ? (language === 'ar' ? 'المبلغ' : 'Montant') :
                   (language === 'ar' ? 'السعر الجديد' : 'Nouveau prix')}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
                    className={`text-lg h-12 ${updateType === 'percentage' ? 'pe-10' : ''}`}
                    placeholder="0"
                  />
                  {updateType === 'percentage' && (
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xl text-muted-foreground">%</span>
                  )}
                </div>
                
                {/* Quick buttons */}
                {updateType === 'percentage' && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {quickPercentages.map(pct => (
                      <Button
                        key={pct}
                        type="button"
                        variant={value === pct ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setValue(pct)}
                        className="flex-1 min-w-[50px]"
                      >
                        +{pct}%
                      </Button>
                    ))}
                  </div>
                )}
                
                {updateType !== 'set' && (
                  <div className="flex gap-2 mt-3">
                    <Button
                      type="button"
                      variant={value > 0 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setValue(Math.abs(value))}
                      className="flex-1 gap-1"
                    >
                      <TrendingUp className="h-4 w-4" />
                      {language === 'ar' ? 'زيادة' : 'Hausse'}
                    </Button>
                    <Button
                      type="button"
                      variant={value < 0 ? 'destructive' : 'outline'}
                      size="sm"
                      onClick={() => setValue(-Math.abs(value))}
                      className="flex-1 gap-1"
                    >
                      <TrendingDown className="h-4 w-4" />
                      {language === 'ar' ? 'نقصان' : 'Baisse'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Family Filter */}
              <div>
                <Label className="mb-2 block">{t.productFamilies}</Label>
                <Select value={selectedFamily} onValueChange={setSelectedFamily}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.allFamilies} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        {t.allFamilies}
                      </div>
                    </SelectItem>
                    {families.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {language === 'ar' ? f.name_ar : f.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Round To */}
              <div>
                <Label className="mb-2 block">{t.roundTo}</Label>
                <Select value={roundTo.toString()} onValueChange={(v) => setRoundTo(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{language === 'ar' ? 'بدون تقريب' : 'Sans arrondi'}</SelectItem>
                    <SelectItem value="5">{language === 'ar' ? 'أقرب 5' : 'Au 5 près'}</SelectItem>
                    <SelectItem value="10">{language === 'ar' ? 'أقرب 10' : 'Au 10 près'}</SelectItem>
                    <SelectItem value="50">{language === 'ar' ? 'أقرب 50' : 'Au 50 près'}</SelectItem>
                    <SelectItem value="100">{language === 'ar' ? 'أقرب 100' : 'Au 100 près'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Advanced Options Toggle */}
              <div className="flex items-center justify-between pt-2 border-t">
                <Label className="cursor-pointer">{language === 'ar' ? 'خيارات متقدمة' : 'Options avancées'}</Label>
                <Switch checked={showAdvanced} onCheckedChange={setShowAdvanced} />
              </div>

              {/* Advanced Options */}
              {showAdvanced && (
                <div className="space-y-4 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="select-mode"
                      checked={selectMode}
                      onCheckedChange={setSelectMode}
                    />
                    <Label htmlFor="select-mode" className="cursor-pointer">
                      {language === 'ar' ? 'اختيار منتجات محددة' : 'Sélectionner des produits'}
                    </Label>
                  </div>
                  
                  {selectMode && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={selectAllProducts} className="flex-1">
                        {language === 'ar' ? 'تحديد الكل' : 'Tout sélectionner'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={clearSelection} className="flex-1">
                        {language === 'ar' ? 'إلغاء التحديد' : 'Désélectionner'}
                      </Button>
                    </div>
                  )}
                  
                  <div>
                    <Label className="text-sm">{language === 'ar' ? 'نطاق السعر (اختياري)' : 'Plage de prix (optionnel)'}</Label>
                    <div className="flex gap-2 mt-1">
                      <Input 
                        type="number" 
                        placeholder={language === 'ar' ? 'من' : 'Min'}
                        value={minPrice || ''}
                        onChange={(e) => setMinPrice(parseFloat(e.target.value) || 0)}
                      />
                      <Input 
                        type="number" 
                        placeholder={language === 'ar' ? 'إلى' : 'Max'}
                        value={maxPrice || ''}
                        onChange={(e) => setMaxPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Apply Button */}
              <Button
                onClick={applyChanges}
                disabled={applying || (value === 0 && updateType !== 'set') || totalProducts === 0}
                className="w-full gap-2 h-12 text-base"
                size="lg"
              >
                {applying ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <Save className="h-5 w-5" />
                )}
                {t.applyChanges}
                {totalProducts > 0 && (
                  <Badge variant="secondary" className="ms-2">
                    {totalProducts} {language === 'ar' ? 'منتج' : 'produits'}
                  </Badge>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Preview Table */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  {t.previewChanges}
                </CardTitle>
                {previews.length > 0 && (
                  <Badge variant="outline" className="text-base px-3 py-1">
                    {totalProducts} {language === 'ar' ? 'منتج' : 'produits'}
                  </Badge>
                )}
              </div>
              {/* Search in preview */}
              {previews.length > 0 && (
                <div className="relative mt-4">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={language === 'ar' ? 'بحث في المعاينة...' : 'Rechercher...'}
                    className="ps-9"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent>
              {previews.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Calculator className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">
                    {language === 'ar' ? 'لا توجد معاينة' : 'Aucun aperçu'}
                  </h3>
                  <p>{language === 'ar' ? 'أدخل قيمة لعرض المعاينة' : 'Entrez une valeur pour voir l\'aperçu'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {selectMode && <TableHead className="w-12"></TableHead>}
                        <TableHead>{language === 'ar' ? 'المنتج' : 'Produit'}</TableHead>
                        {(priceField === 'all' || priceField === 'purchase_price') && (
                          <TableHead className="text-center">{t.purchasePrice}</TableHead>
                        )}
                        {(priceField === 'all' || priceField === 'wholesale_price') && (
                          <TableHead className="text-center">{t.wholesalePrice}</TableHead>
                        )}
                        {(priceField === 'all' || priceField === 'retail_price') && (
                          <TableHead className="text-center">{t.retailPrice}</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previews.map((preview) => (
                        <TableRow 
                          key={preview.id}
                          className={selectMode && selectedProducts.has(preview.id) ? 'bg-primary/5' : ''}
                        >
                          {selectMode && (
                            <TableCell>
                              <Checkbox
                                checked={selectedProducts.has(preview.id)}
                                onCheckedChange={() => toggleProductSelection(preview.id)}
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            <div>
                              <p className="font-medium">{preview.name}</p>
                              {preview.barcode && (
                                <p className="text-xs text-muted-foreground font-mono">{preview.barcode}</p>
                              )}
                            </div>
                          </TableCell>
                          {Object.entries(preview.changes).map(([field, change]) => (
                            <TableCell key={field} className="text-center">
                              <div className="space-y-1">
                                <div className="flex items-center justify-center gap-2">
                                  <span className="text-muted-foreground line-through text-sm">
                                    {formatPrice(change.old)}
                                  </span>
                                  <span className="font-bold text-lg">
                                    {formatPrice(change.new)}
                                  </span>
                                </div>
                                <Badge 
                                  variant="outline" 
                                  className={`${getChangeColor(change.diff)} font-mono`}
                                >
                                  {change.diff > 0 ? '+' : ''}{formatPrice(change.diff)}
                                </Badge>
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {totalProducts > previews.length && (
                    <div className="text-center py-4 border-t">
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' 
                          ? `عرض ${previews.length} من ${totalProducts} منتج`
                          : `Affichage de ${previews.length} sur ${totalProducts} produits`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Card */}
        {previews.length > 0 && (
          <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-100 rounded-xl">
                    <Sparkles className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-blue-900">
                      {language === 'ar' ? 'ملخص التغييرات' : 'Résumé des modifications'}
                    </h3>
                    <p className="text-blue-700">
                      {updateType === 'percentage' && `${value > 0 ? '+' : ''}${value}%`}
                      {updateType === 'fixed' && `${value > 0 ? '+' : ''}${formatPrice(value)} ${t.currency}`}
                      {updateType === 'set' && `= ${formatPrice(value)} ${t.currency}`}
                      {' '}{language === 'ar' ? 'على' : 'sur'} {totalProducts} {language === 'ar' ? 'منتج' : 'produits'}
                    </p>
                  </div>
                </div>
                <Button onClick={applyChanges} disabled={applying} size="lg" className="gap-2">
                  {applying ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  {language === 'ar' ? 'تطبيق الآن' : 'Appliquer maintenant'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Margin Calculator Dialog */}
        <Dialog open={showMarginCalculator} onOpenChange={setShowMarginCalculator}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                {language === 'ar' ? 'حاسبة هامش الربح' : 'Calculateur de marge'}
              </DialogTitle>
              <DialogDescription>
                {language === 'ar' 
                  ? 'حدد هامش الربح المطلوب وسيتم حساب أسعار البيع تلقائياً'
                  : 'Définissez la marge souhaitée pour calculer automatiquement les prix de vente'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 mt-4">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label>{language === 'ar' ? 'هامش الربح المطلوب' : 'Marge souhaitée'}</Label>
                  <Badge variant="outline" className="text-lg px-3 py-1">
                    {targetMargin}%
                  </Badge>
                </div>
                <Slider
                  value={[targetMargin]}
                  onValueChange={(v) => setTargetMargin(v[0])}
                  min={5}
                  max={100}
                  step={5}
                  className="mb-4"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>5%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm mb-2">{language === 'ar' ? 'مثال:' : 'Exemple:'}</p>
                <div className="flex items-center justify-between">
                  <span>{language === 'ar' ? 'سعر الشراء: 100' : 'Prix d\'achat: 100'}</span>
                  <span className="font-bold text-primary">
                    → {language === 'ar' ? 'سعر البيع:' : 'Prix de vente:'} {(100 * (1 + targetMargin/100)).toFixed(2)}
                  </span>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowMarginCalculator(false)} className="flex-1">
                  {language === 'ar' ? 'إلغاء' : 'Annuler'}
                </Button>
                <Button onClick={calculateMarginPrice} className="flex-1 gap-2">
                  <Check className="h-4 w-4" />
                  {language === 'ar' ? 'تطبيق' : 'Appliquer'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
