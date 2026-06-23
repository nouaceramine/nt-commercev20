import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';
import {
  ArrowRight, ArrowLeft, Save, Camera, Loader2, RefreshCw, Plus, FolderTree,
  Calculator, Trash2, Package, Tag, Warehouse, ShieldAlert, Barcode, CalendarDays,
  Truck, Clock, AlertTriangle,
} from 'lucide-react';

const UOM_OPTIONS = ['U', 'KG', 'G', 'L', 'ML', 'M', 'CM', 'BOX', 'PKT'];

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleDateString('fr-DZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return isoStr; }
}

export default function EditProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, language, isRTL } = useLanguage();
  const BackArrow = isRTL ? ArrowRight : ArrowLeft;
  const fileInputRef = useRef(null);
  const imageUploadRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);
  const [uploadingProductImage, setUploadingProductImage] = useState(false);
  const [families, setFamilies] = useState([]);
  const [showAddFamilyDialog, setShowAddFamilyDialog] = useState(false);
  const [newFamily, setNewFamily] = useState({ name: '' });
  const [addingFamily, setAddingFamily] = useState(false);
  const [useAveragePrice, setUseAveragePrice] = useState(false);

  // Sub-resources
  const [lots, setLots] = useState([]);
  const [supplierLinks, setSupplierLinks] = useState([]);
  const [productHistory, setProductHistory] = useState(null);
  const [availableSuppliers, setAvailableSuppliers] = useState([]);
  const [showAddLotDialog, setShowAddLotDialog] = useState(false);
  const [showAddSupplierDialog, setShowAddSupplierDialog] = useState(false);
  const [savingLot, setSavingLot] = useState(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [newLot, setNewLot] = useState({ lot_number: '', expiry_date: '', quantity: '', alert_days: '30' });
  const [newSupplierLink, setNewSupplierLink] = useState({ supplier_id: '', purchase_price: '0', is_default: false });
  const [newBarcode, setNewBarcode] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    description_en: '',
    purchase_price: '0',
    wholesale_price: '0',
    super_wholesale_price: '0',
    retail_price: '0',
    tariff_a: '0',
    tariff_b: '0',
    tariff_c: '0',
    tariff_d: '0',
    quantity: '0',
    image_url: '',
    barcode: '',
    article_code: '',
    family_id: '',
    compatible_models: '',
    low_stock_threshold: '10',
    unit_of_measure: 'U',
    storage_location: '',
    qty_per_package: '1',
    is_non_stockable: false,
    tax_rate: '0',
    internal_notes: '',
    is_blocked: false,
    fixed_price: false,
    force_qty_entry: false,
    force_price_entry: false,
    serial_number_tracking: false,
    additional_barcodes: [],
  });

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await apiClient.get(`/products/${id}`);
        const p = response.data;
        setFormData({
          name: p.name_en || p.name_ar || '',
          description_en: p.description_en || '',
          purchase_price: p.purchase_price?.toString() || '0',
          wholesale_price: p.wholesale_price?.toString() || '0',
          super_wholesale_price: p.super_wholesale_price?.toString() || '0',
          retail_price: p.retail_price?.toString() || '0',
          tariff_a: p.tariff_a?.toString() || '0',
          tariff_b: p.tariff_b?.toString() || '0',
          tariff_c: p.tariff_c?.toString() || '0',
          tariff_d: p.tariff_d?.toString() || '0',
          quantity: p.quantity?.toString() || '0',
          image_url: p.image_url || '',
          barcode: p.barcode || '',
          article_code: p.article_code || '',
          family_id: p.family_id || '',
          compatible_models: Array.isArray(p.compatible_models) ? p.compatible_models.join(', ') : '',
          low_stock_threshold: p.low_stock_threshold?.toString() || '10',
          unit_of_measure: p.unit_of_measure || 'U',
          storage_location: p.storage_location || '',
          qty_per_package: p.qty_per_package?.toString() || '1',
          is_non_stockable: p.is_non_stockable || false,
          tax_rate: p.tax_rate?.toString() || '0',
          internal_notes: p.internal_notes || '',
          is_blocked: p.is_blocked || false,
          fixed_price: p.fixed_price || false,
          force_qty_entry: p.force_qty_entry || false,
          force_price_entry: p.force_price_entry || false,
          serial_number_tracking: p.serial_number_tracking || false,
          additional_barcodes: Array.isArray(p.additional_barcodes) ? p.additional_barcodes : [],
        });
        setUseAveragePrice(p.use_average_price || false);
      } catch {
        toast.error(t.notFound);
        navigate('/products');
      } finally {
        setFetching(false);
      }
    };
    fetchProduct();
    fetchFamilies();
    fetchLots();
    fetchSupplierLinks();
    fetchHistory();
    fetchAvailableSuppliers();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFamilies = async () => {
    try {
      const response = await apiClient.get(`/product-families`);
      setFamilies(response.data);
    } catch {}
  };

  const fetchLots = async () => {
    try {
      const response = await apiClient.get(`/products/${id}/lots`);
      setLots(response.data);
    } catch {}
  };

  const fetchSupplierLinks = async () => {
    try {
      const response = await apiClient.get(`/products/${id}/suppliers`);
      setSupplierLinks(response.data);
    } catch {}
  };

  const fetchHistory = async () => {
    try {
      const response = await apiClient.get(`/products/${id}/history`);
      setProductHistory(response.data);
    } catch {}
  };

  const fetchAvailableSuppliers = async () => {
    try {
      const response = await apiClient.get(`/suppliers`);
      setAvailableSuppliers(Array.isArray(response.data) ? response.data : response.data?.items || []);
    } catch {}
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBoolChange = (name, val) => {
    setFormData(prev => ({ ...prev, [name]: val }));
  };

  const handleProductImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProductImage(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        setFormData(prev => ({ ...prev, image_url: event.target.result }));
        toast.success(language === 'ar' ? 'تم رفع الصورة' : 'Image téléchargée');
        setUploadingProductImage(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error(language === 'ar' ? 'فشل رفع الصورة' : 'Échec du téléchargement');
      setUploadingProductImage(false);
    }
  };

  const generateBarcode = async () => {
    setGeneratingBarcode(true);
    try {
      const response = await apiClient.get(`/products/generate-barcode?article_code=${formData.article_code}`);
      setFormData(prev => ({ ...prev, barcode: response.data.barcode }));
      toast.success(t.barcodeGenerated);
    } catch {
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
      const response = await apiClient.post(`/product-families`, { name_ar: newFamily.name, name_en: newFamily.name });
      setFamilies(prev => [...prev, response.data]);
      setFormData(prev => ({ ...prev, family_id: response.data.id }));
      setShowAddFamilyDialog(false);
      setNewFamily({ name: '' });
      toast.success(t.familyAdded);
    } catch (error) {
      toast.error(error.response?.data?.detail || t.error);
    } finally {
      setAddingFamily(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) { toast.error(t.supportedFormats); return; }
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
        setFormData(prev => ({ ...prev, compatible_models: currentModels ? `${currentModels}, ${newModels}` : newModels }));
        toast.success(`${t.modelsExtracted} (${extracted_models.length})`);
      }
    } catch { toast.error(t.ocrFailed); }
    finally {
      setOcrLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddBarcode = () => {
    const bc = newBarcode.trim();
    if (!bc) return;
    if (formData.additional_barcodes.includes(bc)) {
      toast.error(language === 'ar' ? 'الباركود موجود مسبقاً' : 'Barcode déjà existant');
      return;
    }
    setFormData(prev => ({ ...prev, additional_barcodes: [...prev.additional_barcodes, bc] }));
    setNewBarcode('');
  };

  const handleRemoveBarcode = (bc) => {
    setFormData(prev => ({ ...prev, additional_barcodes: prev.additional_barcodes.filter(b => b !== bc) }));
  };

  const handleAddLot = async () => {
    if (!newLot.expiry_date) {
      toast.error(language === 'ar' ? 'تاريخ الانتهاء مطلوب' : 'Date de péremption requise');
      return;
    }
    setSavingLot(true);
    try {
      const response = await apiClient.post(`/products/${id}/lots`, {
        lot_number: newLot.lot_number,
        expiry_date: newLot.expiry_date,
        quantity: parseFloat(newLot.quantity) || 0,
        alert_days: parseInt(newLot.alert_days) || 30,
      });
      setLots(prev => [...prev, response.data]);
      setNewLot({ lot_number: '', expiry_date: '', quantity: '', alert_days: '30' });
      setShowAddLotDialog(false);
      toast.success(language === 'ar' ? 'تمت إضافة الدُفعة' : 'Lot ajouté');
    } catch (error) {
      toast.error(error.response?.data?.detail || t.error);
    } finally {
      setSavingLot(false);
    }
  };

  const handleDeleteLot = async (lotId) => {
    try {
      await apiClient.delete(`/products/${id}/lots/${lotId}`);
      setLots(prev => prev.filter(l => l.id !== lotId));
      toast.success(language === 'ar' ? 'تم الحذف' : 'Supprimé');
    } catch { toast.error(t.error); }
  };

  const handleAddSupplier = async () => {
    if (!newSupplierLink.supplier_id) {
      toast.error(language === 'ar' ? 'يرجى اختيار مورد' : 'Veuillez choisir un fournisseur');
      return;
    }
    setSavingSupplier(true);
    try {
      const response = await apiClient.post(`/products/${id}/suppliers`, {
        supplier_id: newSupplierLink.supplier_id,
        purchase_price: parseFloat(newSupplierLink.purchase_price) || 0,
        is_default: newSupplierLink.is_default,
      });
      setSupplierLinks(prev => [...prev, response.data]);
      setNewSupplierLink({ supplier_id: '', purchase_price: '0', is_default: false });
      setShowAddSupplierDialog(false);
      toast.success(language === 'ar' ? 'تم ربط المورد' : 'Fournisseur ajouté');
    } catch (error) {
      toast.error(error.response?.data?.detail || t.error);
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleDeleteSupplier = async (linkId) => {
    try {
      await apiClient.delete(`/products/${id}/suppliers/${linkId}`);
      setSupplierLinks(prev => prev.filter(l => l.id !== linkId));
      toast.success(language === 'ar' ? 'تم الحذف' : 'Supprimé');
    } catch { toast.error(t.error); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error(language === 'ar' ? 'يرجى إدخال اسم المنتج' : 'Veuillez entrer le nom du produit');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        name_en: formData.name,
        name_ar: formData.name,
        description_en: formData.description_en,
        description_ar: formData.description_en,
        purchase_price: parseFloat(formData.purchase_price) || 0,
        wholesale_price: parseFloat(formData.wholesale_price) || 0,
        super_wholesale_price: parseFloat(formData.super_wholesale_price) || 0,
        retail_price: parseFloat(formData.retail_price) || 0,
        tariff_a: parseFloat(formData.tariff_a) || 0,
        tariff_b: parseFloat(formData.tariff_b) || 0,
        tariff_c: parseFloat(formData.tariff_c) || 0,
        tariff_d: parseFloat(formData.tariff_d) || 0,
        image_url: formData.image_url,
        barcode: formData.barcode,
        article_code: formData.article_code,
        family_id: formData.family_id || null,
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
        fixed_price: formData.fixed_price,
        force_qty_entry: formData.force_qty_entry,
        force_price_entry: formData.force_price_entry,
        serial_number_tracking: formData.serial_number_tracking,
        additional_barcodes: formData.additional_barcodes,
      };
      await apiClient.put(`/products/${id}`, payload);
      toast.success(t.productUpdated);
      navigate(`/products/${id}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div></Layout>;
  }

  const isAr = language === 'ar';

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 animate-fade-in" data-testid="edit-product-page">
        <Link to={`/products/${id}`}>
          <Button variant="ghost" size="sm" className="gap-2" data-testid="back-to-product-btn">
            <BackArrow className="h-4 w-4" />
            {t.viewDetails}
          </Button>
        </Link>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl flex items-center gap-2">
              <Package className="h-5 w-5" />
              {t.editProduct}
              {formData.is_blocked && <Badge variant="destructive">{isAr ? 'محجوب' : 'Bloqué'}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid grid-cols-7 mb-4 h-auto flex-wrap gap-y-1">
                  <TabsTrigger value="general" className="text-xs gap-1"><Package className="h-3 w-3" />{isAr ? 'عام' : 'Général'}</TabsTrigger>
                  <TabsTrigger value="tarifs" className="text-xs gap-1"><Tag className="h-3 w-3" />{isAr ? 'الأسعار' : 'Tarifs'}</TabsTrigger>
                  <TabsTrigger value="stock" className="text-xs gap-1"><Warehouse className="h-3 w-3" />{isAr ? 'المخزون' : 'Stock'}</TabsTrigger>
                  <TabsTrigger value="vente" className="text-xs gap-1"><ShieldAlert className="h-3 w-3" />{isAr ? 'البيع' : 'Vente'}</TabsTrigger>
                  <TabsTrigger value="multicodes" className="text-xs gap-1"><Barcode className="h-3 w-3" />Multi-codes</TabsTrigger>
                  <TabsTrigger value="lots" className="text-xs gap-1 relative">
                    <CalendarDays className="h-3 w-3" />Lots
                    {lots.some(l => l.remaining_days !== null && l.remaining_days <= (l.alert_days || 30)) && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="fournisseurs" className="text-xs gap-1"><Truck className="h-3 w-3" />{isAr ? 'الموردون' : 'Fourn.'}</TabsTrigger>
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
                      <Input name="article_code" value={formData.article_code} className="h-9 font-mono text-sm bg-muted/50" readOnly />
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
                          <FolderTree className="h-3 w-3 me-1" />
                          <SelectValue placeholder={t.selectFamily} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{isAr ? 'بدون عائلة' : 'No Family'}</SelectItem>
                          {families.map(f => <SelectItem key={f.id} value={f.id}>{isAr ? f.name_ar : f.name_en}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'صورة المنتج' : 'Image produit'}</Label>
                      <div className="flex gap-2">
                        <Input name="image_url" value={formData.image_url} onChange={handleChange} placeholder="URL..." className="h-9 flex-1" />
                        <input ref={imageUploadRef} type="file" accept="image/*" onChange={handleProductImageUpload} className="hidden" />
                        <Button type="button" variant="outline" size="sm" onClick={() => imageUploadRef.current?.click()} disabled={uploadingProductImage} className="h-9 px-2">
                          {uploadingProductImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                        </Button>
                      </div>
                      {formData.image_url && <img src={formData.image_url} alt="Preview" className="h-16 w-16 object-cover rounded mt-1" />}
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">{isAr ? 'الوصف' : 'Description'}</Label>
                      <Input name="description_en" value={formData.description_en} onChange={handleChange} className="h-9" placeholder={isAr ? 'وصف المنتج...' : 'Description du produit...'} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">{t.barcode}</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={generateBarcode} disabled={generatingBarcode} className="h-5 px-1 text-xs">
                          {generatingBarcode ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          {t.generateBarcode}
                        </Button>
                      </div>
                      <Input name="barcode" value={formData.barcode} onChange={handleChange} className="h-9 font-mono" data-testid="barcode-input" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'ملاحظات داخلية' : 'Notes internes'}</Label>
                      <Input name="internal_notes" value={formData.internal_notes} onChange={handleChange} className="h-9" placeholder={isAr ? 'ملاحظة خاصة...' : 'Note interne...'} />
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
                          {parseFloat(formData.purchase_price) > 0 && parseFloat(formData[`tariff_${letter}`]) > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              {isAr ? 'هامش:' : 'Marge:'} {(((parseFloat(formData[`tariff_${letter}`]) - parseFloat(formData.purchase_price)) / parseFloat(formData.purchase_price)) * 100).toFixed(1)}%
                            </p>
                          )}
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
                      <Label className="text-xs flex items-center gap-1">
                        {t.quantity} <span className="text-[10px] text-muted-foreground">({isAr ? 'للقراءة فقط' : 'lecture seule'})</span>
                      </Label>
                      <Input name="quantity" type="number" value={formData.quantity} readOnly disabled className="h-9 bg-muted cursor-not-allowed" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t.lowStockThreshold}</Label>
                      <Input name="low_stock_threshold" type="number" min="1" value={formData.low_stock_threshold} onChange={handleChange} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'كمية الكرتون' : 'Qté/Colis'}</Label>
                      <Input name="qty_per_package" type="number" step="0.01" min="1" value={formData.qty_per_package} onChange={handleChange} className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'وحدة القياس' : 'Unité de mesure'}</Label>
                      <Select value={formData.unit_of_measure} onValueChange={(v) => setFormData(p => ({ ...p, unit_of_measure: v }))}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UOM_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'موقع التخزين' : 'Emplacement'}</Label>
                      <Input name="storage_location" value={formData.storage_location} onChange={handleChange} className="h-9" placeholder={isAr ? 'مثال: رف A3' : 'Ex: Rayon A3'} />
                    </div>
                    <div className="flex items-center gap-3 pt-5">
                      <Switch checked={formData.is_non_stockable} onCheckedChange={(v) => handleBoolChange('is_non_stockable', v)} />
                      <div>
                        <Label className="text-sm">{isAr ? 'غير مخزوني' : 'Non stockable'}</Label>
                        <p className="text-[11px] text-muted-foreground">{isAr ? 'خدمة / لا تُحتسب في المخزون' : 'Service / non suivi en stock'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-amber-700 dark:text-amber-400">{isAr ? 'لتعديل الكمية، قم بإنشاء عملية شراء جديدة من صفحة المشتريات.' : 'Pour modifier la quantité, créez un nouvel achat depuis la page des achats.'}</p>
                  </div>

                  {productHistory && (
                    <div className="border rounded-lg p-3">
                      <p className="text-xs font-medium mb-2 flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{isAr ? 'تاريخ المنتج' : 'Historique du produit'}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted-foreground">{isAr ? 'تاريخ الإنشاء:' : 'Créé le:'}</span> <span className="font-medium">{formatDate(productHistory.created_at)}</span></div>
                        <div><span className="text-muted-foreground">{isAr ? 'آخر تعديل:' : 'Modifié le:'}</span> <span className="font-medium">{formatDate(productHistory.updated_at)}</span></div>
                        <div><span className="text-muted-foreground">{isAr ? 'آخر شراء:' : 'Dernier achat:'}</span> <span className="font-medium">{formatDate(productHistory.last_purchase_at)}</span></div>
                        <div><span className="text-muted-foreground">{isAr ? 'آخر بيع:' : 'Dernière vente:'}</span> <span className="font-medium">{formatDate(productHistory.last_sale_at)}</span></div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* ── TAB: VENTE (POS options) ── */}
                <TabsContent value="vente" className="space-y-4 mt-0">
                  <div className="space-y-3">
                    {[
                      { key: 'is_blocked', label_ar: 'منتج محجوب', label_fr: 'Article bloqué', desc_ar: 'يمنع البيع كلياً في نقطة البيع', desc_fr: 'Empêche toute vente en caisse', danger: true },
                      { key: 'fixed_price', label_ar: 'سعر ثابت', label_fr: 'Prix fixe', desc_ar: 'يمنع تعديل السعر عند البيع', desc_fr: 'Empêche la modification du prix' },
                      { key: 'force_qty_entry', label_ar: 'إدخال الكمية إلزامي', label_fr: 'Saisie qté obligatoire', desc_ar: 'يطلب من الكاشير إدخال الكمية يدوياً', desc_fr: 'Demande la saisie manuelle de la qté' },
                      { key: 'force_price_entry', label_ar: 'إدخال السعر إلزامي', label_fr: 'Saisie prix obligatoire', desc_ar: 'يطلب إدخال السعر عند كل عملية بيع', desc_fr: 'Demande la saisie du prix à chaque vente' },
                      { key: 'serial_number_tracking', label_ar: 'تتبع الرقم التسلسلي', label_fr: 'Suivi n° de série', desc_ar: 'يطلب إدخال رقم تسلسلي عند البيع', desc_fr: 'Demande le n° de série à chaque vente' },
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

                {/* ── TAB: MULTI-CODES ── */}
                <TabsContent value="multicodes" className="space-y-4 mt-0">
                  <p className="text-xs text-muted-foreground">{isAr ? 'أضف بارcodes أو références إضافية لهذا المنتج (يمكن مسحها بالماسح)' : 'Ajoutez des barcodes ou références supplémentaires (scannables en caisse)'}</p>

                  <div className="flex gap-2">
                    <Input value={newBarcode} onChange={e => setNewBarcode(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddBarcode())} placeholder={isAr ? 'باركود جديد...' : 'Nouveau barcode...'} className="h-9 font-mono flex-1" />
                    <Button type="button" onClick={handleAddBarcode} size="sm" className="gap-1 h-9">
                      <Plus className="h-4 w-4" />{isAr ? 'إضافة' : 'Ajouter'}
                    </Button>
                  </div>

                  {formData.additional_barcodes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">{isAr ? 'لا توجد بارcodes إضافية' : 'Aucun barcode supplémentaire'}</div>
                  ) : (
                    <div className="space-y-2">
                      {formData.additional_barcodes.map((bc, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 border rounded-lg bg-muted/30">
                          <span className="font-mono text-sm">{bc}</span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveBarcode(bc)} className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* ── TAB: LOTS (Expiry Dates) ── */}
                <TabsContent value="lots" className="space-y-4 mt-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{isAr ? 'إدارة دُفعات المنتج وتواريخ انتهاء الصلاحية' : 'Gérez les lots et dates de péremption'}</p>
                    <Button type="button" size="sm" onClick={() => setShowAddLotDialog(true)} className="gap-1">
                      <Plus className="h-4 w-4" />{isAr ? 'إضافة دُفعة' : 'Ajouter lot'}
                    </Button>
                  </div>

                  {lots.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">{isAr ? 'لا توجد دُفعات' : 'Aucun lot enregistré'}</div>
                  ) : (
                    <div className="space-y-2">
                      {lots.map(lot => {
                        const isExpired = lot.remaining_days !== null && lot.remaining_days <= 0;
                        const isAlert = lot.remaining_days !== null && lot.remaining_days > 0 && lot.remaining_days <= (lot.alert_days || 30);
                        return (
                          <div key={lot.id} className={`flex items-center justify-between p-3 border rounded-lg ${isExpired ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : isAlert ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20' : 'border-border'}`}>
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div><span className="text-muted-foreground">{isAr ? 'رقم الدُفعة:' : 'N° Lot:'}</span> <span className="font-mono font-medium">{lot.lot_number || '—'}</span></div>
                              <div><span className="text-muted-foreground">{isAr ? 'انتهاء:' : 'Expiration:'}</span> <span className="font-medium">{formatDate(lot.expiry_date)}</span></div>
                              <div><span className="text-muted-foreground">{isAr ? 'الكمية:' : 'Qté:'}</span> <span className="font-medium">{lot.quantity}</span></div>
                              <div className="flex items-center gap-1">
                                {isExpired && <Badge variant="destructive" className="text-[10px]">{isAr ? 'منتهي' : 'Expiré'}</Badge>}
                                {isAlert && !isExpired && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400"><AlertTriangle className="h-2 w-2 me-1" />{lot.remaining_days}j</Badge>}
                                {!isExpired && !isAlert && lot.remaining_days !== null && <span className="text-muted-foreground">{lot.remaining_days}j</span>}
                              </div>
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteLot(lot.id)} className="h-7 w-7 p-0 ms-2 text-destructive hover:text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* ── TAB: FOURNISSEURS ── */}
                <TabsContent value="fournisseurs" className="space-y-4 mt-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{isAr ? 'اربط موردين بهذا المنتج مع سعر شراء خاص لكل مورد' : 'Liez des fournisseurs à ce produit avec leur prix d\'achat'}</p>
                    <Button type="button" size="sm" onClick={() => setShowAddSupplierDialog(true)} className="gap-1">
                      <Plus className="h-4 w-4" />{isAr ? 'إضافة مورد' : 'Ajouter fourn.'}
                    </Button>
                  </div>

                  {supplierLinks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">{isAr ? 'لا يوجد موردون مرتبطون' : 'Aucun fournisseur lié'}</div>
                  ) : (
                    <div className="space-y-2">
                      {supplierLinks.map(link => (
                        <div key={link.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex-1 grid grid-cols-3 gap-2 text-xs">
                            <div className="flex items-center gap-1">
                              <Truck className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">{link.supplier_name || link.supplier_id}</span>
                              {link.is_default && <Badge variant="secondary" className="text-[10px]">{isAr ? 'رئيسي' : 'Principal'}</Badge>}
                            </div>
                            <div><span className="text-muted-foreground">{isAr ? 'سعر الشراء:' : 'Prix achat:'}</span> <span className="font-medium">{link.purchase_price} DA</span></div>
                            <div><span className="text-muted-foreground">{isAr ? 'تاريخ:' : 'Date:'}</span> <span>{formatDate(link.created_at)}</span></div>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteSupplier(link.id)} className="h-7 w-7 p-0 ms-2 text-destructive hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <div className="flex justify-end gap-2 pt-4 border-t mt-4">
                <Link to={`/products/${id}`}>
                  <Button type="button" variant="outline" size="sm">{t.cancel}</Button>
                </Link>
                <Button type="submit" size="sm" disabled={loading} className="gap-1" data-testid="update-product-btn">
                  <Save className="h-4 w-4" />
                  {loading ? t.loading : t.save}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Add Family Dialog */}
      <Dialog open={showAddFamilyDialog} onOpenChange={setShowAddFamilyDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader className="pb-2"><DialogTitle>{t.addNewFamily}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'اسم العائلة' : 'Nom de la famille'}</Label>
              <Input className="h-9" value={newFamily.name} onChange={e => setNewFamily({ name: e.target.value })} placeholder={isAr ? 'مثال: شاشات' : 'Ex: Écrans'} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAddFamilyDialog(false)} className="flex-1">{t.cancel}</Button>
              <Button size="sm" onClick={handleAddFamily} disabled={addingFamily} className="flex-1">{addingFamily ? t.loading : t.save}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Lot Dialog */}
      <Dialog open={showAddLotDialog} onOpenChange={setShowAddLotDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="pb-2"><DialogTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" />{isAr ? 'إضافة دُفعة جديدة' : 'Ajouter un lot'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'رقم الدُفعة' : 'N° de lot'}</Label>
                <Input className="h-9 font-mono" value={newLot.lot_number} onChange={e => setNewLot(p => ({ ...p, lot_number: e.target.value }))} placeholder="LOT-001" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'تاريخ انتهاء الصلاحية *' : 'Date de péremption *'}</Label>
                <Input className="h-9" type="date" value={newLot.expiry_date} onChange={e => setNewLot(p => ({ ...p, expiry_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'الكمية' : 'Quantité'}</Label>
                <Input className="h-9" type="number" min="0" step="0.01" value={newLot.quantity} onChange={e => setNewLot(p => ({ ...p, quantity: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'تنبيه قبل (أيام)' : 'Alerter avant (jours)'}</Label>
                <Input className="h-9" type="number" min="1" value={newLot.alert_days} onChange={e => setNewLot(p => ({ ...p, alert_days: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAddLotDialog(false)} className="flex-1">{t.cancel}</Button>
              <Button size="sm" onClick={handleAddLot} disabled={savingLot} className="flex-1">{savingLot ? <Loader2 className="h-3 w-3 animate-spin" /> : (isAr ? 'إضافة' : 'Ajouter')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Supplier Dialog */}
      <Dialog open={showAddSupplierDialog} onOpenChange={setShowAddSupplierDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="pb-2"><DialogTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />{isAr ? 'ربط مورد بالمنتج' : 'Lier un fournisseur'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'المورد *' : 'Fournisseur *'}</Label>
              <Select value={newSupplierLink.supplier_id} onValueChange={v => setNewSupplierLink(p => ({ ...p, supplier_id: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder={isAr ? 'اختر مورداً...' : 'Choisir un fournisseur...'} /></SelectTrigger>
                <SelectContent>
                  {availableSuppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name_ar || s.name || s.company || s.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'سعر الشراء (DA)' : 'Prix d\'achat (DA)'}</Label>
              <Input className="h-9" type="number" min="0" step="0.01" value={newSupplierLink.purchase_price} onChange={e => setNewSupplierLink(p => ({ ...p, purchase_price: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={newSupplierLink.is_default} onCheckedChange={v => setNewSupplierLink(p => ({ ...p, is_default: v }))} />
              <Label className="text-sm">{isAr ? 'مورد رئيسي' : 'Fournisseur principal'}</Label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowAddSupplierDialog(false)} className="flex-1">{t.cancel}</Button>
              <Button size="sm" onClick={handleAddSupplier} disabled={savingSupplier} className="flex-1">{savingSupplier ? <Loader2 className="h-3 w-3 animate-spin" /> : (isAr ? 'ربط' : 'Lier')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
