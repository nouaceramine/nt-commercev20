import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import PrintButton from '../components/print/PrintButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
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
import { toast } from 'sonner';
import { 
  ArrowRight, 
  ArrowLeft, 
  Edit, 
  Trash2, 
  Package,
  DollarSign,
  Boxes,
  ShoppingBag,
  ExternalLink,
  RefreshCw,
  XCircle,
  History,
  Truck,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Calendar,
  User
} from 'lucide-react';

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, isRTL, language } = useLanguage();
  const { isAdmin } = useAuth();
  
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  
  // History states
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const BackArrow = isRTL ? ArrowRight : ArrowLeft;

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await apiClient.get(`/products/${id}`);
        setProduct(response.data);
      } catch (error) {
        console.error('Error fetching product:', error);
        toast.error(t.notFound);
        navigate('/products');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id, navigate, t.notFound]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch history data
  const fetchHistoryData = async () => {
    setHistoryLoading(true);
    try {
      const [purchaseRes, salesRes, priceRes] = await Promise.all([
        apiClient.get(`/products/${id}/purchase-history`),
        apiClient.get(`/products/${id}/sales-history`),
        apiClient.get(`/products/${id}/price-history`)
      ]);
      setPurchaseHistory(purchaseRes.data);
      setSalesHistory(salesRes.data);
      setPriceHistory(priceRes.data);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Check price warnings
  const getPriceWarnings = () => {
    if (!product) return [];
    const warnings = [];
    const purchasePrice = product.purchase_price || 0;
    
    if (purchasePrice > 0) {
      if (product.retail_price && product.retail_price < purchasePrice) {
        warnings.push({ type: 'retail', message: language === 'ar' ? 'سعر التجزئة أقل من سعر الشراء!' : 'Prix détail inférieur au prix d\'achat!' });
      }
      if (product.wholesale_price && product.wholesale_price < purchasePrice) {
        warnings.push({ type: 'wholesale', message: language === 'ar' ? 'سعر الجملة أقل من سعر الشراء!' : 'Prix gros inférieur au prix d\'achat!' });
      }
      if (product.super_wholesale_price && product.super_wholesale_price < purchasePrice) {
        warnings.push({ type: 'super', message: language === 'ar' ? 'سعر السوبر جملة أقل من سعر الشراء!' : 'Prix super gros inférieur au prix d\'achat!' });
      }
    }
    return warnings;
  };

  const priceWarnings = getPriceWarnings();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.delete(`/products/${id}`);
      toast.success(t.productDeleted);
      navigate('/products');
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error(t.somethingWentWrong);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handlePublishToWooCommerce = async () => {
    setPublishing(true);
    try {
      const response = await apiClient.post(`/woocommerce/publish-product/${id}`);
      toast.success(language === 'ar' ? 'تم نشر المنتج على المتجر' : 'Produit publié sur la boutique');
      // Refresh product data
      const productRes = await apiClient.get(`/products/${id}`);
      setProduct(productRes.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'خطأ في النشر' : 'Erreur de publication'));
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublishFromWooCommerce = async () => {
    setUnpublishing(true);
    try {
      await apiClient.delete(`/woocommerce/unpublish-product/${id}`);
      toast.success(language === 'ar' ? 'تم إلغاء نشر المنتج' : 'Produit retiré de la boutique');
      // Refresh product data
      const productRes = await apiClient.get(`/products/${id}`);
      setProduct(productRes.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'خطأ في الإلغاء' : 'Erreur de retrait'));
    } finally {
      setUnpublishing(false);
    }
  };

  const getStockStatus = (quantity) => {
    if (quantity === 0) {
      return { label: t.outOfStock, variant: 'destructive' };
    } else if (quantity < 10) {
      return { label: t.lowStockWarning, className: 'bg-amber-100 text-amber-800 border-amber-200' };
    }
    return { label: t.inStock, className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="empty-state py-16">
          <Package className="h-20 w-20 text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium">{t.notFound}</h3>
        </div>
      </Layout>
    );
  }

  const stockStatus = getStockStatus(product.quantity);

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="product-detail-page">
        {/* Back Button */}
        <Link to="/products">
          <Button variant="ghost" className="gap-2" data-testid="back-to-products-btn">
            <BackArrow className="h-4 w-4" />
            {t.products}
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Product Image */}
          <div className="lg:col-span-1">
            <Card className="overflow-hidden">
              <div className="aspect-square bg-muted">
                <img
                  src={product.image_url || 'https://images.unsplash.com/photo-1634403665443-81dc4d75843a?crop=entropy&cs=srgb&fm=jpg&q=85'}
                  alt={language === 'ar' ? product.name_ar : product.name_en}
                  className="w-full h-full object-cover"
                />
              </div>
            </Card>
          </div>

          {/* Product Info */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <Badge 
                      variant={stockStatus.variant} 
                      className={stockStatus.className}
                    >
                      {stockStatus.label}
                    </Badge>
                    <h1 className="text-3xl font-bold mt-3">
                      {language === 'ar' ? product.name_ar : product.name_en}
                    </h1>
                    {language === 'ar' && product.name_en && (
                      <p className="text-muted-foreground mt-1">{product.name_en}</p>
                    )}
                    {language === 'en' && product.name_ar && (
                      <p className="text-muted-foreground mt-1">{product.name_ar}</p>
                    )}
                  </div>
                  
                  {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                      {/* WooCommerce Publish Button */}
                      {product.woocommerce_id ? (
                        <Button 
                          variant="outline" 
                          className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50"
                          onClick={handleUnpublishFromWooCommerce}
                          disabled={unpublishing}
                          data-testid="unpublish-woo-btn"
                        >
                          {unpublishing ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          {language === 'ar' ? 'إلغاء النشر' : 'Retirer'}
                        </Button>
                      ) : (
                        <Button 
                          variant="outline" 
                          className="gap-2 border-purple-200 text-purple-700 hover:bg-purple-50"
                          onClick={handlePublishToWooCommerce}
                          disabled={publishing}
                          data-testid="publish-woo-btn"
                        >
                          {publishing ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <ShoppingBag className="h-4 w-4" />
                          )}
                          {language === 'ar' ? 'نشر على WooCommerce' : 'Publier WooCommerce'}
                        </Button>
                      )}
                      <PrintButton docType="product" record={product} iconOnly={false} variant="outline" />
                      <Link to={`/products/${id}/edit`}>
                        <Button variant="outline" className="gap-2" data-testid="edit-product-btn">
                          <Edit className="h-4 w-4" />
                          {t.edit}
                        </Button>
                      </Link>
                      <Button 
                        variant="destructive" 
                        className="gap-2"
                        onClick={() => setDeleteDialogOpen(true)}
                        data-testid="delete-product-btn"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t.delete}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="mt-6">
                  <h3 className="font-semibold text-lg mb-2">{t.description}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {language === 'ar' ? product.description_ar : product.description_en}
                  </p>
                </div>

                {/* WooCommerce Status */}
                {product.woocommerce_id && (
                  <div className="mt-6 p-4 rounded-xl bg-purple-50 border border-purple-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-purple-600" />
                        <span className="font-medium text-purple-700">
                          {language === 'ar' ? 'منشور على WooCommerce' : 'Publié sur WooCommerce'}
                        </span>
                      </div>
                      {product.woocommerce_url && (
                        <a 
                          href={product.woocommerce_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm text-purple-600 hover:underline"
                        >
                          {language === 'ar' ? 'عرض' : 'Voir'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {product.woocommerce_synced_at && (
                      <p className="text-xs text-purple-600 mt-1">
                        {language === 'ar' ? 'آخر مزامنة' : 'Dernière sync'}: {new Date(product.woocommerce_synced_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Price & Quantity */}
                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-sm font-medium">{t.price}</span>
                    </div>
                    <p className="text-2xl font-bold text-primary">
                      {(product.retail_price ?? product.price ?? 0).toFixed(2)} {t.currency}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/50 border">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Boxes className="h-4 w-4" />
                      <span className="text-sm font-medium">{t.quantity}</span>
                    </div>
                    <p className="text-2xl font-bold">
                      {product.quantity ?? 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Compatible Models */}
            {product.compatible_models && product.compatible_models.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-4">{t.compatibleModels}</h3>
                  <div className="flex flex-wrap gap-2">
                    {product.compatible_models.map((model, idx) => (
                      <span 
                        key={idx} 
                        className="model-badge text-sm px-3 py-1.5"
                        data-testid={`compatible-model-${idx}`}
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Price Warnings */}
        {priceWarnings.length > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-700 mb-2">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">{language === 'ar' ? 'تحذيرات الأسعار' : 'Alertes prix'}</span>
              </div>
              <ul className="space-y-1">
                {priceWarnings.map((warning, idx) => (
                  <li key={idx} className="text-red-600 text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4" />
                    {warning.message}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Product History Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                {language === 'ar' ? 'سجل المنتج' : 'Historique produit'}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={fetchHistoryData} disabled={historyLoading}>
                <RefreshCw className={`h-4 w-4 me-2 ${historyLoading ? 'animate-spin' : ''}`} />
                {language === 'ar' ? 'تحميل السجل' : 'Charger'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="purchases" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="purchases" className="gap-2">
                  <Truck className="h-4 w-4" />
                  {language === 'ar' ? 'المشتريات' : 'Achats'} ({purchaseHistory.length})
                </TabsTrigger>
                <TabsTrigger value="sales" className="gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  {language === 'ar' ? 'المبيعات' : 'Ventes'} ({salesHistory.length})
                </TabsTrigger>
                <TabsTrigger value="prices" className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  {language === 'ar' ? 'الأسعار' : 'Prix'} ({priceHistory.length})
                </TabsTrigger>
              </TabsList>

              {/* Purchase History */}
              <TabsContent value="purchases">
                {purchaseHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>{language === 'ar' ? 'لا توجد مشتريات سابقة' : 'Aucun achat'}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                        <TableHead>{language === 'ar' ? 'المورد' : 'Fournisseur'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'الكمية' : 'Qté'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'سعر الوحدة' : 'Prix unit.'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'المجموع' : 'Total'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseHistory.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {new Date(item.date).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'fr-FR')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.supplier_name}</p>
                              {item.supplier_phone && (
                                <p className="text-xs text-muted-foreground" dir="ltr">{item.supplier_phone}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-medium">{item.quantity}</TableCell>
                          <TableCell className="text-center">{item.unit_price?.toFixed(2)} {t.currency}</TableCell>
                          <TableCell className="text-center font-semibold">{item.total?.toFixed(2)} {t.currency}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              {/* Sales History */}
              <TabsContent value="sales">
                {salesHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingBag className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>{language === 'ar' ? 'لا توجد مبيعات سابقة' : 'Aucune vente'}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                        <TableHead>{language === 'ar' ? 'العميل' : 'Client'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'الكمية' : 'Qté'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'السعر' : 'Prix'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'المجموع' : 'Total'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesHistory.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {new Date(item.date).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'fr-FR')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {item.customer_name}
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-medium">{item.quantity}</TableCell>
                          <TableCell className="text-center">{item.unit_price?.toFixed(2)} {t.currency}</TableCell>
                          <TableCell className="text-center font-semibold">{item.total?.toFixed(2)} {t.currency}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              {/* Price History */}
              <TabsContent value="prices">
                {priceHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>{language === 'ar' ? 'لا توجد تغييرات في الأسعار' : 'Aucun changement de prix'}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                        <TableHead>{language === 'ar' ? 'نوع السعر' : 'Type'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'السعر القديم' : 'Ancien'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'السعر الجديد' : 'Nouveau'}</TableHead>
                        <TableHead className="text-center">{language === 'ar' ? 'التغيير' : 'Change'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priceHistory.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">
                            {new Date(item.created_at).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'fr-FR')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {item.price_type === 'purchase_price' ? (language === 'ar' ? 'شراء' : 'Achat') :
                               item.price_type === 'retail_price' ? (language === 'ar' ? 'تجزئة' : 'Détail') :
                               item.price_type === 'wholesale_price' ? (language === 'ar' ? 'جملة' : 'Gros') :
                               item.price_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">{item.old_price?.toFixed(2)} {t.currency}</TableCell>
                          <TableCell className="text-center font-medium">{item.new_price?.toFixed(2)} {t.currency}</TableCell>
                          <TableCell className="text-center">
                            <span className={`flex items-center justify-center gap-1 ${item.change_percent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {item.change_percent > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {item.change_percent > 0 ? '+' : ''}{item.change_percent}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.deleteProduct}</AlertDialogTitle>
              <AlertDialogDescription>
                {t.deleteConfirm}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>
                {t.cancel}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="confirm-delete-btn"
              >
                {deleting ? t.loading : t.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
