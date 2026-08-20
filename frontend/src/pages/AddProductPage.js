import { errText } from '../lib/errorText';
import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import ProductImagesInput from '../components/forms/ProductImagesInput';
import AiImagePicker from '../components/forms/AiImagePicker';
import CameraBarcodeScanner from '../components/forms/CameraBarcodeScanner';
import { ArrowRight, ArrowLeft, Save, Camera, Loader2, RefreshCw, Plus, FolderTree, PlusCircle, Calculator, Package, Tag, Warehouse, ShieldAlert, Sparkles, Palette } from 'lucide-react';
import { Switch } from '../components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';

const UOM_OPTIONS = ['U', 'KG', 'G', 'L', 'ML', 'M', 'CM', 'BOX', 'PKT'];

export default function AddProductPage() {
  const navigate = useNavigate();
  const { t, language, isRTL } = useLanguage();
  const BackArrow = isRTL ? ArrowRight : ArrowLeft;
  const fileInputRef = useRef(null);
  const imageUploadRef = useRef(null);
  
  const [loading, setLoading] = useState(false);
  const [saveAndNew, setSaveAndNew] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);
  const [uploadingProductImage, setUploadingProductImage] = useState(false);
  const [families, setFamilies] = useState([]);
  const [shippingProviders, setShippingProviders] = useState([]);  // p150
  const [showAddFamilyDialog, setShowAddFamilyDialog] = useState(false);
  const [newFamily, setNewFamily] = useState({ name: '' });
  const [addingFamily, setAddingFamily] = useState(false);
  const [brands, setBrands] = useState([]);  // p217
  const [showAddBrandDialog, setShowAddBrandDialog] = useState(false);
  const [newBrand, setNewBrand] = useState({ name: '' });
  const [addingBrand, setAddingBrand] = useState(false);
  const [useAveragePrice, setUseAveragePrice] = useState(false);
  
  // Get last purchase price from localStorage
  const lastPurchasePrice = localStorage.getItem('lastPurchasePrice') || '0';
  
  const [formData, setFormData] = useState({
    name: '',
    description_en: '',
    description_ar: '',
    purchase_price: lastPurchasePrice,
    wholesale_price: '0',
    super_wholesale_price: '0',
    retail_price: '0',
    tariff_a: '0',
    tariff_b: '0',
    tariff_c: '0',
    tariff_d: '0',
    image_url: '',
    images: [],
    barcode: '',
    article_code: '',
    family_id: '',
    brand_id: '',
    compatible_models: '',
    low_stock_threshold: '10',
    unit_of_measure: 'U',
    storage_location: '',
    qty_per_package: '1',
    is_non_stockable: false,
    tax_rate: '0',
    internal_notes: '',
    is_blocked: false,
    allow_online_payment: true,  // p149
    shipping_provider: '',  // p150
    fixed_price: false,
    force_qty_entry: false,
    force_price_entry: false,
    serial_number_tracking: false,
    sold_by_weight: false,
    scale_plu: '',
    color: '',
    sizes_text: '',
    has_variants: false,
    variants: [],
  });

  // تحذير عند مغادرة الصفحة بتعديلات غير محفوظة
  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  // Generate article code and barcode on page load
  useEffect(() => {
    const generateCodes = async () => {
      try {
        // Generate article code first
        const codeResponse = await apiClient.get(`/products/generate-article-code`);
        const articleCode = codeResponse.data.article_code;
        
        // Generate barcode based on article code
        const barcodeResponse = await apiClient.get(`/products/generate-barcode?article_code=${articleCode}`);
        
        setFormData(prev => ({ 
          ...prev, 
          article_code: articleCode,
          barcode: barcodeResponse.data.barcode
        }));
      } catch (error) {
        console.error('Error generating codes:', error);
      }
    };
    generateCodes();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchFamilies();
  }, []);

  const fetchFamilies = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/product-families`);
      setFamilies(response.data);
      const brandsRes = await apiClient.get(`/product-brands`);  // p217
      setBrands(brandsRes.data);
      const provRes = await apiClient.get(`/ecom/shipping/providers`).catch(() => ({ data: null }));  // p150
      setShippingProviders((provRes.data?.providers || []).filter(pr => pr.key !== 'mock'));
    } catch (error) {
      console.error('Error fetching families:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Upload product image
  const handleProductImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingProductImage(true);
    try {
      // Convert to base64 and use as data URL (for demo)
      // In production, you would upload to a server/cloud storage
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData(prev => ({ ...prev, image_url: event.target.result }));
        toast.success(language === 'ar' ? 'تم رفع الصورة' : 'Image téléchargée');
        setUploadingProductImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل رفع الصورة' : 'Échec du téléchargement');
      setUploadingProductImage(false);
    }
  };

  const generateBarcode = async () => {
    setGeneratingBarcode(true);
    try {
      const response = await apiClient.get(`/products/generate-barcode`);
      setFormData(prev => ({ ...prev, barcode: response.data.barcode }));
      toast.success(t.barcodeGenerated);
    } catch (error) {
      toast.error(t.error);
    } finally {
      setGeneratingBarcode(false);
    }
  };

  const handleAddFamily = async () => {
    if (!newFamily.name) {
      toast.error(language === 'ar' ? 'يرجى إدخال اسم العائلة' : 'Veuillez entrer le nom de la famille');
      return;
    }

    setAddingFamily(true);
    try {
      const response = await apiClient.post(`/product-families`, {
        name_ar: newFamily.name,
        name_en: newFamily.name
      });
      
      setFamilies(prev => [...prev, response.data]);
      setFormData(prev => ({ ...prev, family_id: response.data.id }));
      setShowAddFamilyDialog(false);
      setNewFamily({ name: '' });
      toast.success(t.familyAdded);
    } catch (error) {
      toast.error(errText(error) ||  t.error);
    } finally {
      setAddingFamily(false);
    }
  };

  const handleAddBrand = async () => {  // p217
    if (!newBrand.name) {
      toast.error(language === 'ar' ? 'يرجى إدخال اسم الماركة' : 'Veuillez entrer le nom de la marque');
      return;
    }
    setAddingBrand(true);
    try {
      const response = await apiClient.post(`/product-brands`, {
        name_ar: newBrand.name,
        name_en: newBrand.name
      });
      setBrands(prev => [...prev, response.data]);
      setFormData(prev => ({ ...prev, brand_id: response.data.id }));
      setShowAddBrandDialog(false);
      setNewBrand({ name: '' });
      toast.success(language === 'ar' ? 'تمت إضافة الماركة' : 'Marque ajoutée');
    } catch (error) {
      toast.error(errText(error) || t.error);
    } finally {
      setAddingBrand(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error(t.supportedFormats);
      return;
    }

    setOcrLoading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await apiClient.post(`/ocr/extract-models`, { image_base64: base64 });
      const { extracted_models } = response.data;
      
      if (extracted_models.length > 0) {
        const currentModels = formData.compatible_models.trim();
        const newModels = extracted_models.join(', ');
        setFormData(prev => ({
          ...prev,
          compatible_models: currentModels ? `${currentModels}, ${newModels}` : newModels
        }));
        toast.success(`${t.modelsExtracted} (${extracted_models.length})`);
      }
    } catch (error) {
      toast.error(t.ocrFailed);
    } finally {
      setOcrLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBoolChange = (name, val) => setFormData(prev => ({ ...prev, [name]: val }));

  const resetForm = () => {
    setFormData({
      name: '',
      description_en: '',
      description_ar: '',
      purchase_price: '',
      wholesale_price: '',
      super_wholesale_price: '',
      retail_price: '',
      tariff_a: '0', tariff_b: '0', tariff_c: '0', tariff_d: '0',
      image_url: '',
      barcode: '',
      family_id: '',
      brand_id: '',
      compatible_models: '',
      low_stock_threshold: '10',
      unit_of_measure: 'U', storage_location: '', qty_per_package: '1',
      is_non_stockable: false, tax_rate: '0', internal_notes: '',
      is_blocked: false, fixed_price: false, force_qty_entry: false, allow_online_payment: true,
      shipping_provider: '',
      force_price_entry: false, serial_number_tracking: false,
      sold_by_weight: false, scale_plu: '',
      color: '', sizes_text: '', has_variants: false, variants: [],
    });
  };

  const [aiLoading, setAiLoading] = useState(false);

  const generateAiDescription = async () => {
    if (!formData.name) {
      toast.error(isAr ? 'أدخل اسم المنتج أولاً' : "Entrez le nom du produit d'abord");
      return;
    }
    setAiLoading(true);
    try {
      const res = await apiClient.post('/ai/generate-description', {
        name: formData.name,
        category: '',
        features: formData.description_en || '',
      });
      if (res.data.success && res.data.description) {
        setFormData(prev => ({ ...prev, description_en: res.data.description }));
        toast.success(isAr ? 'تم توليد الوصف بالذكاء الاصطناعي' : 'Description générée par IA');
      } else {
        toast.error(res.data.error || (isAr ? 'فشل توليد الوصف' : 'Échec de la génération'));
      }
    } catch (err) {
      toast.error(isAr ? 'فشل الاتصال بالذكاء الاصطناعي' : 'Connexion IA impossible');
    } finally {
      setAiLoading(false);
    }
  };


  // p70: variant stock helpers
  const addVariantRow = () => setFormData(p => ({ ...p, variants: [...(p.variants || []), { color: '', size: '', quantity: '' }] }));
  const updateVariantRow = (i, key, val) => setFormData(p => { const vs = [...(p.variants || [])]; vs[i] = { ...vs[i], [key]: val }; return { ...p, variants: vs }; });
  const removeVariantRow = (i) => setFormData(p => ({ ...p, variants: (p.variants || []).filter((_, x) => x !== i) }));
  const variantsTotal = (formData.variants || []).reduce((s, v) => s + (parseFloat(v.quantity) || 0), 0);

  const handleSubmit = async (e, createNew = false) => {
    e?.preventDefault();
    
    // Only name is required
    if (!formData.name.trim()) {
      toast.error(language === 'ar' ? 'يرجى إدخال اسم المنتج' : 'Veuillez entrer le nom du produit');
      return;
    }
    
    setLoading(true);
    setSaveAndNew(createNew);

    try {
      const payload = {
        name_en: formData.name,
        name_ar: formData.name,
        description_en: formData.description_en,
        description_ar: formData.description_ar,
        purchase_price: parseFloat(formData.purchase_price) || 0,
        wholesale_price: parseFloat(formData.wholesale_price) || 0,
        super_wholesale_price: parseFloat(formData.super_wholesale_price) || 0,
        retail_price: parseFloat(formData.retail_price) || 0,
        tariff_a: parseFloat(formData.tariff_a) || 0,
        tariff_b: parseFloat(formData.tariff_b) || 0,
        tariff_c: parseFloat(formData.tariff_c) || 0,
        tariff_d: parseFloat(formData.tariff_d) || 0,
        quantity: 0,
        image_url: formData.image_url || (formData.images || [])[0] || '',
        images: (formData.images || []).filter(Boolean).slice(0, 5),
        barcode: formData.barcode,
        article_code: formData.article_code,
        family_id: formData.family_id || null,
        brand_id: formData.brand_id || null,
        compatible_models: formData.compatible_models.split(',').map(m => m.trim()).filter(m => m),
        low_stock_threshold: parseInt(formData.low_stock_threshold) || 10,
        use_average_price: useAveragePrice,
        unit_of_measure: formData.unit_of_measure,
        storage_location: formData.storage_location,
        qty_per_package: parseFloat(formData.qty_per_package) || 1,
        is_non_stockable: formData.is_non_stockable,
        tax_rate: parseFloat(formData.tax_rate) || 0,
        internal_notes: formData.internal_notes,
        is_blocked: formData.is_blocked,
        allow_online_payment: formData.allow_online_payment,  // p149
        shipping_provider: formData.shipping_provider || '',  // p150
        fixed_price: formData.fixed_price,
        force_qty_entry: formData.force_qty_entry,
        force_price_entry: formData.force_price_entry,
        serial_number_tracking: formData.serial_number_tracking,
        sold_by_weight: formData.sold_by_weight,
        scale_plu: formData.scale_plu || '',
        color: formData.color || '',
        sizes: (formData.sizes_text || '').split(',').map(s => s.trim()).filter(s => s),
        has_variants: formData.has_variants || false,
        variants: formData.has_variants ? (formData.variants || []).filter(v => v.color || v.size).map(v => ({ color: v.color || '', size: v.size || '', quantity: parseFloat(v.quantity) || 0 })) : [],
        additional_barcodes: [],
      };

      // Save last purchase price to localStorage
      if (formData.purchase_price && parseFloat(formData.purchase_price) > 0) {
        localStorage.setItem('lastPurchasePrice', formData.purchase_price);
      }

      await apiClient.post(`/products`, payload);
      toast.success(t.productAdded);
      setIsDirty(false);
      
      if (createNew) {
        // Generate new article code for next product
        try {
          const codeResponse = await apiClient.get(`/products/generate-article-code`);
          setFormData(prev => ({
            ...prev,
            name: '',
            description_en: '',
            description_ar: '',
            wholesale_price: '0',
            super_wholesale_price: '0',
            retail_price: '0',
            image_url: '',
            barcode: '',
            article_code: codeResponse.data.article_code,
            family_id: '',
            brand_id: '',
            compatible_models: '',
            low_stock_threshold: '10'
          }));
        } catch {
          resetForm();
        }
        // Focus on first input
        document.querySelector('[data-testid="product-name-input"]')?.focus();
      } else {
        navigate('/products');
      }
    } catch (error) {
      toast.error(errText(error) ||  t.somethingWentWrong);
    } finally {
      setLoading(false);
      setSaveAndNew(false);
    }
  };

  const isAr = language === 'ar';

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 animate-fade-in" data-testid="add-product-page">
        <Link to="/products">
          <Button variant="ghost" size="sm" className="gap-2" data-testid="back-to-products-btn">
            <BackArrow className="h-4 w-4" />
            {t.products}
          </Button>
        </Link>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl flex items-center gap-2"><Package className="h-5 w-5" />{t.addNewProduct}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} onChange={() => setIsDirty(true)}>
              <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid grid-cols-4 mb-4">
                  <TabsTrigger value="general" className="text-xs gap-1"><Package className="h-3 w-3" />{isAr ? 'عام' : 'Général'}</TabsTrigger>
                  <TabsTrigger value="tarifs" className="text-xs gap-1"><Tag className="h-3 w-3" />{isAr ? 'الأسعار' : 'Tarifs'}</TabsTrigger>
                  <TabsTrigger value="stock" className="text-xs gap-1"><Warehouse className="h-3 w-3" />{isAr ? 'المخزون' : 'Stock'}</TabsTrigger>
                  <TabsTrigger value="vente" className="text-xs gap-1"><ShieldAlert className="h-3 w-3" />{isAr ? 'البيع' : 'Vente'}</TabsTrigger>
                  <TabsTrigger value="attrs" className="text-xs gap-1"><Palette className="h-3 w-3" />{isAr ? 'الخصائص' : 'Attributs'}</TabsTrigger>
                </TabsList>

                {/* ── TAB: GÉNÉRAL ── */}
                <TabsContent value="general" className="space-y-4 mt-0">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'اسم المنتج' : 'Nom du produit'} *</Label>
                      <Input name="name" value={formData.name} onChange={handleChange} required className="h-9" data-testid="product-name-input" placeholder={isAr ? 'يقبل العربية والفرنسية' : 'Accepte arabe et français'} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'كود المنتج' : 'Code Article'}</Label>
                      <Input name="article_code" value={formData.article_code} className="h-9 font-mono text-sm bg-muted/50" data-testid="article-code-input" placeholder="AR00001" readOnly />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">{t.productFamilies}</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddFamilyDialog(true)} className="h-5 px-1 text-xs">
                          <Plus className="h-3 w-3" />{t.quickAddFamily}
                        </Button>
                      </div>
                      <Select value={formData.family_id || "none"} onValueChange={(v) => setFormData(p => ({ ...p, family_id: v === "none" ? "" : v }))}>
                        <SelectTrigger className="h-9" data-testid="family-select">
                          <FolderTree className="h-3 w-3 me-1" /><SelectValue placeholder={t.selectFamily} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{isAr ? 'بدون عائلة' : 'No Family'}</SelectItem>
                          {families.map(f => <SelectItem key={f.id} value={f.id}>{isAr ? f.name_ar : f.name_en}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">{isAr ? 'الماركة' : 'Marque'}</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddBrandDialog(true)} className="h-5 px-1 text-xs" data-testid="quick-add-brand-btn">
                          <Plus className="h-3 w-3" />{isAr ? 'إضافة ماركة' : 'Ajouter marque'}
                        </Button>
                      </div>
                      <Select value={formData.brand_id || "none"} onValueChange={(v) => setFormData(p => ({ ...p, brand_id: v === "none" ? "" : v }))}>
                        <SelectTrigger className="h-9" data-testid="brand-select">
                          <SelectValue placeholder={isAr ? 'اختر الماركة' : 'Choisir une marque'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{isAr ? 'بدون ماركة' : 'Sans marque'}</SelectItem>
                          {brands.map(b => <SelectItem key={b.id} value={b.id} data-testid={`brand-option-${b.id}`}>{isAr ? b.name_ar : (b.name_en || b.name_ar)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Camera className="h-3 w-3 text-primary" />{isAr ? 'صورة المنتج' : 'Image produit'}</Label>
                      <div className="flex flex-col gap-2">
                        <div
                          onClick={() => !uploadingProductImage && imageUploadRef.current?.click()}
                          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary'); }}
                          onDragLeave={(e) => { e.currentTarget.classList.remove('border-primary'); }}
                          onDrop={(e) => {
                            e.preventDefault(); e.currentTarget.classList.remove('border-primary');
                            const file = e.dataTransfer.files?.[0];
                            if (file && file.type.startsWith('image/')) {
                              const reader = new FileReader();
                              reader.onload = (ev) => { setFormData(prev => ({ ...prev, image_url: ev.target.result })); toast.success(isAr ? 'تم رفع الصورة' : 'Image téléchargée'); };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className={`border-2 border-dashed rounded-lg p-2 cursor-pointer hover:border-primary transition-colors ${formData.image_url ? 'border-primary/50' : 'border-muted-foreground/30'}`}
                        >
                          {formData.image_url ? (
                            <div className="relative">
                              <img src={formData.image_url} alt="Product" className="w-full h-20 object-cover rounded" />
                              <Button type="button" variant="destructive" size="icon" className="absolute -top-1 -right-1 h-5 w-5" onClick={e => { e.stopPropagation(); setFormData(prev => ({ ...prev, image_url: '' })); }}>×</Button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-20 text-muted-foreground">
                              {uploadingProductImage ? <Loader2 className="h-6 w-6 animate-spin" /> : <><Camera className="h-6 w-6 mb-1" /><span className="text-xs">{isAr ? 'اسحب أو انقر' : 'Glisser ou cliquer'}</span></>}
                            </div>
                          )}
                        </div>
                        <Input name="image_url" value={formData.image_url?.startsWith('data:') ? '' : formData.image_url} onChange={handleChange} placeholder="URL..." className="h-8 text-xs" />
                        <input ref={imageUploadRef} type="file" accept="image/*" onChange={handleProductImageUpload} className="hidden" />
                        <div className="flex items-center justify-end">
                          <AiImagePicker
                            getName={() => formData.name}
                            language={language}
                            onPick={(url) => setFormData(prev => ({ ...prev, images: [...(prev.images || []), url] }))}
                            maxReached={(formData.images?.length || 0) >= (formData.image_url ? 4 : 5)}
                          />
                        </div>
                        <ProductImagesInput
                          images={formData.images}
                          onChange={(imgs) => setFormData(prev => ({ ...prev, images: imgs }))}
                          max={formData.image_url ? 4 : 5}
                          language={language}
                        />
                      </div>
                    </div>
                    <div className="col-span-2 space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">{isAr ? 'الوصف' : 'Description'}</Label>
                          <Button type="button" variant="ghost" size="sm" onClick={generateAiDescription} disabled={aiLoading} className="h-5 px-1 text-xs" data-testid="ai-description-btn">
                            {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}{isAr ? 'وصف AI' : 'Description IA'}
                          </Button>
                        </div>
                        <Input name="description_en" value={formData.description_en} onChange={handleChange} className="h-9" placeholder={isAr ? 'وصف المنتج...' : 'Description du produit...'} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{isAr ? 'ملاحظات داخلية' : 'Notes internes'}</Label>
                        <Input name="internal_notes" value={formData.internal_notes} onChange={handleChange} className="h-9" placeholder={isAr ? 'ملاحظة خاصة...' : 'Note interne...'} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">{t.barcode}</Label>
                        <span className="flex items-center gap-1">
                          <CameraBarcodeScanner language={language} onDetected={(code) => setFormData(prev => ({ ...prev, barcode: code }))} testId="barcode-camera-btn" />
                          <Button type="button" variant="ghost" size="sm" onClick={generateBarcode} disabled={generatingBarcode} className="h-5 px-1 text-xs">
                            {generatingBarcode ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}{t.generateBarcode}
                          </Button>
                        </span>
                      </div>
                      <Input name="barcode" value={formData.barcode} onChange={handleChange} className="h-9 font-mono" data-testid="barcode-input" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t.lowStockThreshold}</Label>
                      <Input name="low_stock_threshold" type="number" min="1" value={formData.low_stock_threshold} onChange={handleChange} className="h-9" />
                    </div>
                  </div>
                </TabsContent>

                {/* ── TAB: TARIFS ── */}
                <TabsContent value="tarifs" className="space-y-4 mt-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">{t.purchasePrice} *</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1">
                                <Calculator className={`h-3 w-3 ${useAveragePrice ? 'text-primary' : 'text-muted-foreground'}`} />
                                <Switch checked={useAveragePrice} onCheckedChange={setUseAveragePrice} className="scale-[0.6]" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent><p>{isAr ? 'حساب السعر المتوسط' : 'Calcul prix moyen'}</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Input name="purchase_price" type="number" step="0.01" min="0" value={formData.purchase_price} onChange={handleChange} className="h-9" data-testid="purchase-price-input" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'سوبر الجملة' : 'Super gros'}</Label>
                      <Input name="super_wholesale_price" type="number" step="0.01" min="0" value={formData.super_wholesale_price} onChange={handleChange} className="h-9" data-testid="super-wholesale-price-input" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t.wholesalePrice}</Label>
                      <Input name="wholesale_price" type="number" step="0.01" min="0" value={formData.wholesale_price} onChange={handleChange} className="h-9" data-testid="wholesale-price-input" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t.retailPrice}</Label>
                      <Input name="retail_price" type="number" step="0.01" min="0" value={formData.retail_price} onChange={handleChange} className="h-9" data-testid="retail-price-input" />
                    </div>
                  </div>

                  <div className="border rounded-lg p-3 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">{isAr ? 'تعريفات أسعار إضافية' : 'Tarifs supplémentaires'}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {['a', 'b', 'c', 'd'].map(letter => (
                        <div key={letter} className="space-y-1">
                          <Label className="text-xs">Tarif {letter.toUpperCase()}</Label>
                          <Input name={`tariff_${letter}`} type="number" step="0.01" min="0" value={formData[`tariff_${letter}`]} onChange={handleChange} className="h-9" />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? 'نسبة TVA (%)' : 'Taux TVA (%)'}</Label>
                    <Input name="tax_rate" type="number" step="0.01" min="0" max="100" value={formData.tax_rate} onChange={handleChange} className="h-9 max-w-[120px]" />
                  </div>
                </TabsContent>

                {/* ── TAB: STOCK ── */}
                <TabsContent value="stock" className="space-y-4 mt-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'وحدة القياس' : 'Unité de mesure'}</Label>
                      <Select value={formData.unit_of_measure} onValueChange={(v) => setFormData(p => ({ ...p, unit_of_measure: v }))}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UOM_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'كمية الكرتون' : 'Qté/Colis'}</Label>
                      <Input name="qty_per_package" type="number" step="0.01" min="1" value={formData.qty_per_package} onChange={handleChange} className="h-9" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">{isAr ? 'موقع التخزين' : 'Emplacement'}</Label>
                      <Input name="storage_location" value={formData.storage_location} onChange={handleChange} className="h-9" placeholder={isAr ? 'مثال: رف A3' : 'Ex: Rayon A3'} />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <Switch checked={formData.is_non_stockable} onCheckedChange={(v) => handleBoolChange('is_non_stockable', v)} />
                    <div>
                      <Label className="text-sm">{isAr ? 'غير مخزوني' : 'Non stockable'}</Label>
                      <p className="text-[11px] text-muted-foreground">{isAr ? 'خدمة / لا تُحتسب في المخزون' : 'Service / non suivi en stock'}</p>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-amber-700 dark:text-amber-400">{isAr ? 'المخزون يبدأ من 0. لإضافة كمية، قم بإنشاء عملية شراء جديدة من صفحة المشتريات.' : 'Le stock commence à 0. Pour ajouter une quantité, créez un nouvel achat depuis la page des achats.'}</p>
                  </div>
                </TabsContent>

                {/* ── TAB: VENTE (POS options) ── */}
                <TabsContent value="attrs" className="space-y-4 mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">{isAr ? 'لون المنتج' : 'Couleur'}</Label>
                      <Input name="color" value={formData.color} onChange={handleChange} className="h-9" placeholder={isAr ? 'مثال: أزرق' : 'Ex: Bleu'} data-testid="product-color-input" />
                    </div>
                    <div>
                      <Label className="text-xs">{isAr ? 'الأحجام (افصل بينها بفاصلة)' : 'Tailles (séparées par virgule)'}</Label>
                      <Input name="sizes_text" value={formData.sizes_text} onChange={handleChange} className="h-9" placeholder="S, M, L, XL" data-testid="product-sizes-input" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label className="text-xs">{isAr ? 'مخزون مستقل لكل متغير' : 'Stock indépendant par variante'}</Label>
                      <p className="text-xs text-muted-foreground">{isAr ? 'فعّل هذا الخيار لإدارة الكمية لكل لون/حجم على حدة — الكمية الإجمالية تُحسب تلقائياً من مجموع المتغيرات' : 'Gérez la quantité par couleur/taille — le total est calculé automatiquement'}</p>
                    </div>
                    <Switch checked={formData.has_variants} onCheckedChange={(v) => setFormData(p => ({ ...p, has_variants: v }))} data-testid="has-variants-toggle" />
                  </div>
                  {formData.has_variants && (
                    <div className="space-y-2" data-testid="variants-editor">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">{isAr ? 'المتغيرات (لون / حجم / كمية)' : 'Variantes (couleur / taille / qté)'}</Label>
                        <Button type="button" size="sm" variant="outline" onClick={addVariantRow} data-testid="add-variant-btn"><Plus className="h-3 w-3" />{isAr ? 'إضافة متغير' : 'Ajouter'}</Button>
                      </div>
                      {formData.variants.map((v, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                          <Input className="h-9" placeholder={isAr ? 'اللون' : 'Couleur'} value={v.color} onChange={e => updateVariantRow(i, 'color', e.target.value)} data-testid={`variant-color-${i}`} />
                          <Input className="h-9" placeholder={isAr ? 'الحجم' : 'Taille'} value={v.size} onChange={e => updateVariantRow(i, 'size', e.target.value)} data-testid={`variant-size-${i}`} />
                          <Input className="h-9" type="number" min="0" placeholder={isAr ? 'الكمية' : 'Qté'} value={v.quantity} onChange={e => updateVariantRow(i, 'quantity', e.target.value)} data-testid={`variant-qty-${i}`} />
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeVariantRow(i)} data-testid={`variant-remove-${i}`}>×</Button>
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground" data-testid="variants-total">{isAr ? 'الكمية الإجمالية:' : 'Quantité totale:'} {variantsTotal}</p>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="vente" className="space-y-4 mt-0">
                  <div className="space-y-3">
                    {[
                      { key: 'is_blocked', label_ar: 'منتج محجوب', label_fr: 'Article bloqué', desc_ar: 'يمنع البيع كلياً في نقطة البيع', desc_fr: 'Empêche toute vente en caisse', danger: true },
                      { key: 'fixed_price', label_ar: 'سعر ثابت', label_fr: 'Prix fixe', desc_ar: 'يمنع تعديل السعر عند البيع', desc_fr: 'Empêche la modification du prix' },
                      { key: 'force_qty_entry', label_ar: 'إدخال الكمية إلزامي', label_fr: 'Saisie qté obligatoire', desc_ar: 'يطلب من الكاشير إدخال الكمية يدوياً', desc_fr: 'Demande la saisie manuelle de la qté' },
                      { key: 'force_price_entry', label_ar: 'إدخال السعر إلزامي', label_fr: 'Saisie prix obligatoire', desc_ar: 'يطلب إدخال السعر عند كل عملية بيع', desc_fr: 'Demande la saisie du prix à chaque vente' },
                      { key: 'serial_number_tracking', label_ar: 'تتبع الرقم التسلسلي', label_fr: 'Suivi n° de série', desc_ar: 'يطلب إدخال رقم تسلسلي عند البيع', desc_fr: 'Demande le n° de série à chaque vente' },
                      { key: 'sold_by_weight', label_ar: 'يُباع بالوزن (ميزان)', label_fr: 'Vendu au poids', desc_ar: 'نقطة البيع تطلب الوزن عند الإضافة، وتقرأ باركود الميزان الوزني', desc_fr: 'La caisse demande le poids et lit les codes-barres poids' },
                      { key: 'allow_online_payment', label_ar: 'السماح بالدفع الإلكتروني', label_fr: 'Paiement en ligne', desc_ar: 'يظهر خيار الدفع الإلكتروني لهذا المنتج في المتجر', desc_fr: 'Affiche le paiement en ligne pour ce produit' },
                    ].map(opt => (
                      <div key={opt.key} className={`flex items-center justify-between p-3 rounded-lg border ${opt.danger && formData[opt.key] ? 'border-red-200 bg-red-50 dark:bg-red-950/20' : 'border-border'}`}>
                        <div>
                          <Label className={`text-sm font-medium ${opt.danger ? 'text-red-600' : ''}`}>{isAr ? opt.label_ar : opt.label_fr}</Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{isAr ? opt.desc_ar : opt.desc_fr}</p>
                        </div>
                        <Switch checked={!!formData[opt.key]} onCheckedChange={(v) => handleBoolChange(opt.key, v)} />
                      </div>
                    ))}
                  </div>

                  {formData.sold_by_weight && (
                    <div className="border rounded-lg p-3 space-y-2" data-testid="scale-plu-row">
                      <Label>{isAr ? 'كود المنتج في الميزان (PLU)' : 'Code PLU (balance)'}</Label>
                      <p className="text-[11px] text-muted-foreground">{isAr ? 'نفس الكود المبرمج في الميزان لهذا المنتج — يظهر داخل الباركود الوزني المطبوع' : 'Le code programmé dans la balance, présent dans le code-barres poids'}</p>
                      <Input name="scale_plu" value={formData.scale_plu || ''} onChange={handleChange} dir="ltr" placeholder="10025" data-testid="scale-plu-input" />
                    </div>
                  )}

                  {shippingProviders.length > 0 && (
                    <div className="border rounded-lg p-3 space-y-2" data-testid="shipping-provider-row">
                      <Label>{isAr ? 'شركة الشحن المفروضة (اختياري)' : 'Transporteur imposé (optionnel)'}</Label>
                      <p className="text-[11px] text-muted-foreground">{isAr ? 'إن اخترت شركة، لا يستطيع زبون المتجر تغييرها لهذا المنتج' : 'Si choisi, le client ne peut pas changer de transporteur pour ce produit'}</p>
                      <select
                        name="shipping_provider"
                        value={formData.shipping_provider || ''}
                        onChange={handleChange}
                        className="w-full h-9 px-2 text-sm border border-border rounded-md bg-background"
                        data-testid="shipping-provider-select"
                      >
                        <option value="">{isAr ? '— حسب اختيار الزبون —' : '— Au choix du client —'}</option>
                        {shippingProviders.map(pr => (
                          <option key={pr.key} value={pr.key}>{isAr ? (pr.label_ar || pr.label_en) : (pr.label_en || pr.label_ar)}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>{t.compatibleModels}</Label>
                      <div>
                        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} className="hidden" />
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={ocrLoading} className="gap-2" data-testid="ocr-upload-btn">
                          {ocrLoading ? <><Loader2 className="h-3 w-3 animate-spin" />{t.extractingModels}</> : <><Camera className="h-3 w-3" />{t.extractFromImage}</>}
                        </Button>
                      </div>
                    </div>
                    <Textarea name="compatible_models" value={formData.compatible_models} onChange={handleChange} placeholder="iPhone 15 Pro, Samsung Galaxy S24" rows={2} className="text-sm" data-testid="product-models-input" />
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                <Link to="/products">
                  <Button type="button" variant="outline" size="sm">{t.cancel}</Button>
                </Link>
                <Button type="button" variant="outline" size="sm" onClick={() => handleSubmit(null, true)} disabled={loading} className="gap-1" data-testid="save-and-new-btn">
                  <PlusCircle className="h-4 w-4" />
                  {isAr ? 'حفظ وإنشاء جديد' : 'Enregistrer et créer'}
                </Button>
                <Button type="submit" size="sm" disabled={loading} className="gap-1" data-testid="save-product-btn">
                  <Save className="h-4 w-4" />
                  {loading && !saveAndNew ? t.loading : t.save}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAddFamilyDialog} onOpenChange={setShowAddFamilyDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader className="pb-2"><DialogTitle className="text-lg">{t.addNewFamily}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'اسم العائلة' : 'Nom de la famille'}</Label>
              <Input className="h-9" value={newFamily.name} onChange={(e) => setNewFamily({ ...newFamily, name: e.target.value })} placeholder={isAr ? 'مثال: شاشات' : 'Ex: Écrans'} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAddFamilyDialog(false)} className="flex-1">{t.cancel}</Button>
              <Button size="sm" onClick={handleAddFamily} disabled={addingFamily} className="flex-1">{addingFamily ? t.loading : t.save}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Brand Dialog (p217) */}
      <Dialog open={showAddBrandDialog} onOpenChange={setShowAddBrandDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader className="pb-2"><DialogTitle className="text-lg">{isAr ? 'إضافة ماركة جديدة' : 'Nouvelle marque'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'اسم الماركة' : 'Nom de la marque'}</Label>
              <Input className="h-9" data-testid="brand-name-input" value={newBrand.name} onChange={(e) => setNewBrand({ name: e.target.value })} placeholder={isAr ? 'مثال: سامسونغ' : 'Ex: Samsung'} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAddBrandDialog(false)} className="flex-1">{t.cancel}</Button>
              <Button size="sm" onClick={handleAddBrand} disabled={addingBrand} className="flex-1" data-testid="brand-save-btn">{addingBrand ? t.loading : t.save}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
