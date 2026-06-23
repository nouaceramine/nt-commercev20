import { useState, useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
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
import { toast } from 'sonner';
import JsBarcode from 'jsbarcode';
import { 
  Barcode, 
  Search,
  Printer,
  Package,
  Settings,
  Grid3X3,
  LayoutGrid,
  Tag,
  Check,
  Plus,
  Minus,
  X,
  Download,
  Eye
} from 'lucide-react';

// Label templates
const TEMPLATES = {
  small: {
    name: { ar: 'صغير (30x20mm)', fr: 'Petit (30x20mm)' },
    width: 113,
    height: 75,
    fontSize: 8,
    barcodeHeight: 30,
    showPrice: false,
    showName: true,
    cols: 4,
    rows: 10
  },
  medium: {
    name: { ar: 'متوسط (50x30mm)', fr: 'Moyen (50x30mm)' },
    width: 189,
    height: 113,
    fontSize: 10,
    barcodeHeight: 40,
    showPrice: true,
    showName: true,
    cols: 3,
    rows: 7
  },
  large: {
    name: { ar: 'كبير (70x40mm)', fr: 'Grand (70x40mm)' },
    width: 264,
    height: 151,
    fontSize: 12,
    barcodeHeight: 50,
    showPrice: true,
    showName: true,
    cols: 2,
    rows: 5
  },
  shelf: {
    name: { ar: 'رف (100x30mm)', fr: 'Étagère (100x30mm)' },
    width: 377,
    height: 113,
    fontSize: 14,
    barcodeHeight: 45,
    showPrice: true,
    showName: true,
    cols: 2,
    rows: 7
  }
};

export default function BarcodePrintPage() {
  const { t, language } = useLanguage();
  const printRef = useRef(null);
  
  const [products, setProducts] = useState([]);
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedProducts, setSelectedProducts] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFamily, setSelectedFamily] = useState('all');
  const [template, setTemplate] = useState('medium');
  
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const [customSettings, setCustomSettings] = useState({
    showPrice: true,
    showName: true,
    showBarcode: true,
    copies: 1
  });

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, familiesRes] = await Promise.all([
        apiClient.get(`/products`),
        apiClient.get(`/product-families`).catch(() => ({ data: [] }))
      ]);
      setProducts(productsRes.data);
      setFamilies(familiesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleProduct = (productId) => {
    setSelectedProducts(prev => {
      if (prev[productId]) {
        const { [productId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [productId]: 1 };
    });
  };

  const updateQuantity = (productId, qty) => {
    setSelectedProducts(prev => ({
      ...prev,
      [productId]: Math.max(1, qty)
    }));
  };

  const selectAll = () => {
    const newSelected = {};
    filteredProducts.forEach(p => {
      newSelected[p.id] = 1;
    });
    setSelectedProducts(newSelected);
  };

  const clearAll = () => {
    setSelectedProducts({});
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = searchQuery === '' || 
      p.name_ar?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name_en?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.article_code?.toLowerCase().includes(searchQuery.toLowerCase());  // البحث بكود المنتج
    
    const matchesFamily = selectedFamily === 'all' || p.family_id === selectedFamily;
    
    return matchesSearch && matchesFamily;
  });

  const selectedCount = Object.keys(selectedProducts).length;
  const totalLabels = Object.values(selectedProducts).reduce((sum, qty) => sum + qty, 0);

  const generateBarcodeSVG = (code) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svg, code || '0000000000000', {
        format: "CODE128",
        width: 1.5,
        height: TEMPLATES[template].barcodeHeight,
        displayValue: true,
        fontSize: TEMPLATES[template].fontSize,
        margin: 2
      });
      return svg.outerHTML;
    } catch (e) {
      return '';
    }
  };

  const handlePrint = () => {
    const templateConfig = TEMPLATES[template];
    const selectedProductsList = products.filter(p => selectedProducts[p.id]);
    
    // Generate print content
    let labelsHtml = '';
    selectedProductsList.forEach(product => {
      const qty = selectedProducts[product.id] * customSettings.copies;
      for (let i = 0; i < qty; i++) {
        labelsHtml += `
          <div class="label" style="width:${templateConfig.width}px; height:${templateConfig.height}px; border:1px solid #ddd; padding:4px; display:inline-flex; flex-direction:column; align-items:center; justify-content:center; margin:2px; page-break-inside:avoid;">
            ${customSettings.showName ? `<div style="font-size:${templateConfig.fontSize}px; font-weight:bold; text-align:center; overflow:hidden; max-height:20px;">${language === 'ar' ? product.name_ar : product.name_en}</div>` : ''}
            ${customSettings.showBarcode ? `<div style="margin:4px 0;">${generateBarcodeSVG(product.barcode)}</div>` : ''}
            ${customSettings.showPrice ? `<div style="font-size:${templateConfig.fontSize + 2}px; font-weight:bold;">${(product.price || 0).toFixed(2)} ${t.currency}</div>` : ''}
          </div>
        `;
      }
    });

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="${language === 'ar' ? 'rtl' : 'ltr'}">
      <head>
        <title>${language === 'ar' ? 'طباعة الباركود' : 'Impression codes-barres'}</title>
        <style>
          @page { margin: 5mm; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 10px; }
          .labels-container { display: flex; flex-wrap: wrap; justify-content: flex-start; }
          .label { box-sizing: border-box; }
        </style>
      </head>
      <body>
        <div class="labels-container">
          ${labelsHtml}
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); }
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="barcode-print-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {language === 'ar' ? 'طباعة الباركود' : 'Impression codes-barres'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'طباعة ملصقات الباركود للمنتجات' : 'Imprimer les étiquettes de codes-barres'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSettings(true)} className="gap-2">
              <Settings className="h-4 w-4" />
              {language === 'ar' ? 'إعدادات' : 'Paramètres'}
            </Button>
            <Button 
              onClick={handlePrint} 
              disabled={selectedCount === 0}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              {language === 'ar' ? 'طباعة' : 'Imprimer'} ({totalLabels})
            </Button>
          </div>
        </div>

        {/* Template Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <LayoutGrid className="h-5 w-5" />
              {language === 'ar' ? 'اختر نموذج الملصق' : 'Choisir le modèle'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(TEMPLATES).map(([key, tmpl]) => (
                <div
                  key={key}
                  onClick={() => setTemplate(key)}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    template === key 
                      ? 'border-primary bg-primary/5' 
                      : 'border-muted hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Tag className="h-5 w-5 text-muted-foreground" />
                    {template === key && <Check className="h-5 w-5 text-primary" />}
                  </div>
                  <p className="font-medium text-sm">{tmpl.name[language === 'ar' ? 'ar' : 'fr']}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {tmpl.cols} x {tmpl.rows} = {tmpl.cols * tmpl.rows} {language === 'ar' ? 'ملصق/صفحة' : 'étiquettes/page'}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Product Selection */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle className="text-lg">{language === 'ar' ? 'اختر المنتجات' : 'Sélectionner les produits'}</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {language === 'ar' ? 'تحديد الكل' : 'Tout sélectionner'}
                </Button>
                <Button variant="outline" size="sm" onClick={clearAll}>
                  {language === 'ar' ? 'إلغاء الكل' : 'Tout désélectionner'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Search & Filter */}
            <div className="flex gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={language === 'ar' ? 'بحث...' : 'Rechercher...'}
                  className="ps-9"
                />
              </div>
              <Select value={selectedFamily} onValueChange={setSelectedFamily}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'جميع العائلات' : 'Toutes les familles'}</SelectItem>
                  {families.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {language === 'ar' ? f.name_ar : f.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
              {filteredProducts.map(product => {
                const isSelected = !!selectedProducts[product.id];
                return (
                  <div
                    key={product.id}
                    className={`p-3 border rounded-lg transition-all ${
                      isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleProduct(product.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {language === 'ar' ? product.name_ar : product.name_en}
                        </p>
                        <p className="text-xs text-muted-foreground">{product.barcode}</p>
                        <p className="text-sm font-semibold text-primary mt-1">
                          {(product.price || 0).toFixed(2)} {t.currency}
                        </p>
                      </div>
                    </div>
                    
                    {isSelected && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                        <span className="text-sm text-muted-foreground">
                          {language === 'ar' ? 'عدد الملصقات:' : 'Nombre:'}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(product.id, selectedProducts[product.id] - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min="1"
                            value={selectedProducts[product.id]}
                            onChange={(e) => updateQuantity(product.id, parseInt(e.target.value) || 1)}
                            className="w-16 h-7 text-center"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => updateQuantity(product.id, selectedProducts[product.id] + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selection Summary */}
        {selectedCount > 0 && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">
                    {selectedCount} {language === 'ar' ? 'منتج محدد' : 'produits sélectionnés'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {totalLabels} {language === 'ar' ? 'ملصق للطباعة' : 'étiquettes à imprimer'}
                  </p>
                </div>
                <Button onClick={handlePrint} className="gap-2">
                  <Printer className="h-4 w-4" />
                  {language === 'ar' ? 'طباعة الآن' : 'Imprimer maintenant'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {language === 'ar' ? 'إعدادات الطباعة' : 'Paramètres d\'impression'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label>{language === 'ar' ? 'إظهار اسم المنتج' : 'Afficher le nom'}</Label>
                <Checkbox
                  checked={customSettings.showName}
                  onCheckedChange={(checked) => setCustomSettings(prev => ({ ...prev, showName: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{language === 'ar' ? 'إظهار الباركود' : 'Afficher le code-barres'}</Label>
                <Checkbox
                  checked={customSettings.showBarcode}
                  onCheckedChange={(checked) => setCustomSettings(prev => ({ ...prev, showBarcode: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{language === 'ar' ? 'إظهار السعر' : 'Afficher le prix'}</Label>
                <Checkbox
                  checked={customSettings.showPrice}
                  onCheckedChange={(checked) => setCustomSettings(prev => ({ ...prev, showPrice: checked }))}
                />
              </div>
              <div>
                <Label>{language === 'ar' ? 'عدد النسخ لكل ملصق' : 'Copies par étiquette'}</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={customSettings.copies}
                  onChange={(e) => setCustomSettings(prev => ({ ...prev, copies: parseInt(e.target.value) || 1 }))}
                  className="mt-1"
                />
              </div>
              <Button onClick={() => setShowSettings(false)} className="w-full">
                {language === 'ar' ? 'حفظ' : 'Enregistrer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
