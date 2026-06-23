import { useState, useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Plus, 
  Receipt,
  AlertCircle,
} from 'lucide-react';
import { ExportPrintButtons } from '../components/ExportPrintButtons';
import PurchaseDialogs from './purchases/PurchaseDialogs';
import { PurchaseStats } from './purchases/PurchaseStats';
import { PurchaseHistoryTab } from './purchases/PurchaseHistoryTab';
import { SupplierDebtsTab } from './purchases/SupplierDebtsTab';

export default function PurchasesPage() {
  const { t, language, isRTL } = useLanguage();
  const searchInputRef = useRef(null);
  
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [supplierDebts, setSupplierDebts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentType, setPaymentType] = useState('cash'); // cash, credit, partial
  const [notes, setNotes] = useState('');
  const [purchaseCode, setPurchaseCode] = useState('');  // كود الشراء
  const [loading, setLoading] = useState(false);
  const [showNewPurchaseDialog, setShowNewPurchaseDialog] = useState(false);
  const [showPayDebtDialog, setShowPayDebtDialog] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState(0);
  const [activeTab, setActiveTab] = useState('purchases');
  
  // Edit/Delete purchase states
  const [showEditPurchaseDialog, setShowEditPurchaseDialog] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [editPaidAmount, setEditPaidAmount] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState(null);
  const [deletingPurchase, setDeletingPurchase] = useState(false);
  const [showViewPurchaseDialog, setShowViewPurchaseDialog] = useState(false);
  const [viewingPurchase, setViewingPurchase] = useState(null);
  
  // New supplier dialog
  const [showNewSupplierDialog, setShowNewSupplierDialog] = useState(false);
  const [newSupplierData, setNewSupplierData] = useState({
    name: '',
    phone: '',
    email: '',
    address: ''
  });
  const [addingSupplier, setAddingSupplier] = useState(false);
  
  // Edit product prices dialog
  const [showEditPricesDialog, setShowEditPricesDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editPricesData, setEditPricesData] = useState({
    newPurchasePrice: 0,
    wholesalePrice: 0,
    retailPrice: 0,
    margin: 30,
    updateProductPrices: true,
    image: null,
    imagePreview: null
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const [productsRes, suppliersRes, purchasesRes] = await Promise.all([
        apiClient.get(`/products`),
        apiClient.get(`/suppliers`),
        apiClient.get(`/purchases`)
      ]);
      setProducts(productsRes.data);
      setSuppliers(suppliersRes.data);
      setPurchases(purchasesRes.data);
      
      // Calculate supplier debts
      calculateSupplierDebts(purchasesRes.data, suppliersRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const calculateSupplierDebts = (purchasesData, suppliersData) => {
    const debts = {};
    purchasesData.forEach(p => {
      if (p.remaining > 0) {
        if (!debts[p.supplier_id]) {
          const supplier = suppliersData.find(s => s.id === p.supplier_id);
          debts[p.supplier_id] = {
            supplier_id: p.supplier_id,
            supplier_name: supplier?.name || p.supplier_name,
            total_debt: 0,
            purchases: []
          };
        }
        debts[p.supplier_id].total_debt += p.remaining;
        debts[p.supplier_id].purchases.push(p);
      }
    });
    setSupplierDebts(Object.values(debts));
  };

  const filteredProducts = products.filter(p => {
    const query = searchQuery.toLowerCase();
    return (
      p.name_ar?.toLowerCase().includes(query) ||
      p.name_en?.toLowerCase().includes(query) ||
      p.barcode?.toLowerCase().includes(query) ||
      p.article_code?.toLowerCase().includes(query)  // البحث بكود المنتج
    );
  });

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.product_id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.product_id === product.id
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.unit_price }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        product_name: language === 'ar' ? product.name_ar : product.name_en,
        quantity: 1,
        unit_price: product.purchase_price || product.price || 0,
        total: product.purchase_price || product.price || 0,
        // Store original prices for comparison
        originalPurchasePrice: product.purchase_price || 0,
        wholesalePrice: product.wholesale_price || 0,
        retailPrice: product.retail_price || 0,
        newWholesalePrice: product.wholesale_price || 0,
        newRetailPrice: product.retail_price || 0,
        updatePrices: false,
        productImage: product.image || null
      }]);
    }
  };

  // Open edit prices dialog
  const openEditPricesDialog = (item) => {
    const product = products.find(p => p.id === item.product_id);
    setEditingProduct({ ...item, fullProduct: product });
    setEditPricesData({
      newPurchasePrice: item.unit_price,
      wholesalePrice: item.newWholesalePrice || item.wholesalePrice || 0,
      retailPrice: item.newRetailPrice || item.retailPrice || 0,
      margin: 30,
      updateProductPrices: item.updatePrices || false,
      image: null,
      imagePreview: product?.image || item.productImage || null
    });
    setShowEditPricesDialog(true);
  };

  // Calculate prices based on margin
  const calculatePricesFromMargin = (purchasePrice, margin) => {
    const retailPrice = purchasePrice * (1 + margin / 100);
    const wholesalePrice = purchasePrice * (1 + (margin * 0.7) / 100); // Wholesale margin is 70% of retail margin
    return { wholesalePrice, retailPrice };
  };

  // Handle purchase price change with auto-calculation
  const handlePurchasePriceChange = (newPrice) => {
    const prices = calculatePricesFromMargin(newPrice, editPricesData.margin);
    setEditPricesData(prev => ({
      ...prev,
      newPurchasePrice: newPrice,
      wholesalePrice: Math.round(prices.wholesalePrice * 100) / 100,
      retailPrice: Math.round(prices.retailPrice * 100) / 100
    }));
  };

  // Handle margin change with auto-calculation
  const handleMarginChange = (newMargin) => {
    const prices = calculatePricesFromMargin(editPricesData.newPurchasePrice, newMargin);
    setEditPricesData(prev => ({
      ...prev,
      margin: newMargin,
      wholesalePrice: Math.round(prices.wholesalePrice * 100) / 100,
      retailPrice: Math.round(prices.retailPrice * 100) / 100
    }));
  };

  // Handle image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setEditPricesData(prev => ({
        ...prev,
        imagePreview: event.target.result,
        image: file
      }));
    };
    reader.readAsDataURL(file);
  };

  // Save edited prices
  const saveEditedPrices = async () => {
    if (!editingProduct) return;

    // Update cart item
    setCart(cart.map(item => {
      if (item.product_id === editingProduct.product_id) {
        return {
          ...item,
          unit_price: editPricesData.newPurchasePrice,
          total: item.quantity * editPricesData.newPurchasePrice,
          newWholesalePrice: editPricesData.wholesalePrice,
          newRetailPrice: editPricesData.retailPrice,
          updatePrices: editPricesData.updateProductPrices,
          productImage: editPricesData.imagePreview
        };
      }
      return item;
    }));

    // If updateProductPrices is true, update the product in database
    if (editPricesData.updateProductPrices) {
      try {
        const token = localStorage.getItem('token');
        const updateData = {
          purchase_price: editPricesData.newPurchasePrice,
          wholesale_price: editPricesData.wholesalePrice,
          retail_price: editPricesData.retailPrice
        };

        // Upload image if changed
        if (editPricesData.image) {
          setUploadingImage(true);
          const formData = new FormData();
          formData.append('file', editPricesData.image);
          
          const uploadRes = await apiClient.post(`/upload/image`, formData, {
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data'
            }
          });
          updateData.image_url = uploadRes.data.url; // Fixed: use image_url not image
        }

        await apiClient.put(`/products/${editingProduct.product_id}`, updateData);

        toast.success(language === 'ar' ? 'تم تحديث أسعار المنتج' : 'Prix du produit mis à jour');
        fetchData(); // Refresh products
      } catch (error) {
        console.error('Error updating product:', error);
        toast.error(language === 'ar' ? 'خطأ في تحديث المنتج' : 'Erreur de mise à jour');
      } finally {
        setUploadingImage(false);
      }
    }

    setShowEditPricesDialog(false);
    setEditingProduct(null);
  };

  const updateQuantity = (productId, delta) => {
    setCart(cart.map(item => {
      if (item.product_id === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty, total: newQty * item.unit_price };
      }
      return item;
    }));
  };

  const updatePrice = (productId, newPrice) => {
    setCart(cart.map(item => {
      if (item.product_id === productId) {
        return { ...item, unit_price: newPrice, total: item.quantity * newPrice };
      }
      return item;
    }));
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.product_id !== productId));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  
  // Auto-set paid amount based on payment type
  useEffect(() => {
    if (paymentType === 'cash') {
      setPaidAmount(subtotal);
    } else if (paymentType === 'credit') {
      setPaidAmount(0);
    }
  }, [paymentType, subtotal]); // eslint-disable-line react-hooks/exhaustive-deps

  const completePurchase = async () => {
    if (cart.length === 0) {
      toast.error(language === 'ar' ? 'السلة فارغة' : 'Le panier est vide');
      return;
    }

    if (!selectedSupplier) {
      toast.error(language === 'ar' ? 'يرجى اختيار المورد' : 'Veuillez sélectionner un fournisseur');
      return;
    }

    setLoading(true);
    try {
      const purchaseData = {
        supplier_id: selectedSupplier,
        items: cart,
        total: subtotal,
        paid_amount: paidAmount,
        payment_method: paymentMethod,
        payment_type: paymentType,
        notes,
        code: purchaseCode  // كود الشراء
      };

      await apiClient.post(`/purchases`, purchaseData);
      
      const msg = paymentType === 'credit' 
        ? (language === 'ar' ? 'تم تسجيل الشراء بالدين' : 'Achat à crédit enregistré')
        : paymentType === 'partial'
        ? (language === 'ar' ? 'تم تسجيل الشراء مع دفعة جزئية' : 'Achat avec paiement partiel enregistré')
        : t.purchaseCompleted;
      
      toast.success(msg);
      
      // Reset
      setCart([]);
      setPaidAmount(0);
      setSelectedSupplier(null);
      setNotes('');
      setPurchaseCode('');  // Reset code
      setPaymentType('cash');
      setShowNewPurchaseDialog(false);
      fetchData();
    } catch (error) {
      console.error('Error completing purchase:', error);
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    } finally {
      setLoading(false);
    }
  };

  const openPayDebtDialog = (debt) => {
    setSelectedDebt(debt);
    setDebtPaymentAmount(debt.total_debt);
    setShowPayDebtDialog(true);
  };

  const paySupplierDebt = async () => {
    if (!selectedDebt || debtPaymentAmount <= 0) return;

    setLoading(true);
    try {
      await apiClient.post(`/supplier-debts/pay`, {
        supplier_id: selectedDebt.supplier_id,
        amount: debtPaymentAmount,
        payment_method: paymentMethod
      });
      
      toast.success(language === 'ar' ? 'تم تسجيل الدفعة بنجاح' : 'Paiement enregistré avec succès');
      setShowPayDebtDialog(false);
      setSelectedDebt(null);
      setDebtPaymentAmount(0);
      fetchData();
    } catch (error) {
      console.error('Error paying debt:', error);
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    } finally {
      setLoading(false);
    }
  };

  // Add new supplier
  const handleAddSupplier = async (createNew = false) => {
    if (!newSupplierData.name.trim()) {
      toast.error(language === 'ar' ? 'يرجى إدخال اسم المورد' : 'Veuillez entrer le nom du fournisseur');
      return;
    }

    setAddingSupplier(true);
    try {
      const response = await apiClient.post(`/suppliers`, newSupplierData);
      toast.success(language === 'ar' ? 'تمت إضافة المورد بنجاح' : 'Fournisseur ajouté avec succès');
      
      // Add to suppliers list and select it
      setSuppliers(prev => [...prev, response.data]);
      setSelectedSupplier(response.data.id);
      
      // Reset form
      setNewSupplierData({ name: '', phone: '', email: '', address: '' });
      
      if (!createNew) {
        setShowNewSupplierDialog(false);
      }
    } catch (error) {
      console.error('Error adding supplier:', error);
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    } finally {
      setAddingSupplier(false);
    }
  };

  // Edit purchase functions
  const openEditPurchaseDialog = (purchase) => {
    setEditingPurchase(purchase);
    setEditPaidAmount(purchase.paid_amount);
    setEditNotes(purchase.notes || '');
    setShowEditPurchaseDialog(true);
  };

  const handleUpdatePurchase = async () => {
    if (!editingPurchase) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/purchases/${editingPurchase.id}`, {
        paid_amount: editPaidAmount,
        notes: editNotes
      });
      
      toast.success(language === 'ar' ? 'تم تحديث المشتريات بنجاح' : 'Achat mis à jour');
      setShowEditPurchaseDialog(false);
      setEditingPurchase(null);
      fetchData();
    } catch (error) {
      console.error('Error updating purchase:', error);
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    } finally {
      setLoading(false);
    }
  };

  // Delete purchase functions
  const confirmDeletePurchase = (purchase) => {
    setPurchaseToDelete(purchase);
    setShowDeleteConfirm(true);
  };

  const handleDeletePurchase = async () => {
    if (!purchaseToDelete) return;
    
    setDeletingPurchase(true);
    try {
      await apiClient.delete(`/purchases/${purchaseToDelete.id}`);
      
      toast.success(language === 'ar' ? 'تم حذف المشتريات بنجاح' : 'Achat supprimé');
      setShowDeleteConfirm(false);
      setPurchaseToDelete(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting purchase:', error);
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    } finally {
      setDeletingPurchase(false);
    }
  };

  // View purchase details
  const viewPurchaseDetails = (purchase) => {
    setViewingPurchase(purchase);
    setShowViewPurchaseDialog(true);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-emerald-100 text-emerald-700">{t.paid}</Badge>;
      case 'partial':
        return <Badge className="bg-amber-100 text-amber-700">{t.partial}</Badge>;
      case 'unpaid':
        return <Badge variant="destructive">{t.unpaid}</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Calculate statistics
  const totalPurchases = purchases.reduce((sum, p) => sum + p.total, 0);
  const totalPaid = purchases.reduce((sum, p) => sum + p.paid_amount, 0);
  const totalRemaining = purchases.reduce((sum, p) => sum + p.remaining, 0);
  const purchasesThisMonth = purchases.filter(p => {
    const purchaseDate = new Date(p.created_at);
    const now = new Date();
    return purchaseDate.getMonth() === now.getMonth() && purchaseDate.getFullYear() === now.getFullYear();
  }).length;

  const selectedSupplierData = suppliers.find(s => s.id === selectedSupplier);
  const supplierPreviousDebt = supplierDebts.find(d => d.supplier_id === selectedSupplier)?.total_debt || 0;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="purchases-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t.purchases}</h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'إدارة المشتريات وحسابات الموردين' : 'Gestion des achats et comptes fournisseurs'}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <ExportPrintButtons
              data={purchases.map(p => ({
                code: p.code || '-',
                supplier: p.supplier_name || '-',
                total: p.total?.toFixed(2) || '0',
                paid: p.paid_amount?.toFixed(2) || '0',
                remaining: p.remaining?.toFixed(2) || '0',
                status: p.status === 'paid' ? (language === 'ar' ? 'مدفوع' : 'Payé') : 
                        p.status === 'partial' ? (language === 'ar' ? 'جزئي' : 'Partiel') : 
                        (language === 'ar' ? 'غير مدفوع' : 'Impayé'),
                date: formatDate(p.created_at)
              }))}
              columns={[
                { key: 'code', label: language === 'ar' ? 'الكود' : 'Code' },
                { key: 'supplier', label: language === 'ar' ? 'المورد' : 'Fournisseur' },
                { key: 'total', label: language === 'ar' ? 'الإجمالي' : 'Total' },
                { key: 'paid', label: language === 'ar' ? 'المدفوع' : 'Payé' },
                { key: 'remaining', label: language === 'ar' ? 'الباقي' : 'Restant' },
                { key: 'status', label: language === 'ar' ? 'الحالة' : 'Statut' },
                { key: 'date', label: language === 'ar' ? 'التاريخ' : 'Date' }
              ]}
              filename={`purchases_${new Date().toISOString().split('T')[0]}`}
              title={language === 'ar' ? 'سجل المشتريات' : 'Historique des Achats'}
              language={language}
            />
            <Button onClick={async () => {
              // Generate purchase code
              try {
                const response = await apiClient.get(`/purchases/generate-code`);
                setPurchaseCode(response.data.code);
              } catch (error) {
                setPurchaseCode('');
              }
              setShowNewPurchaseDialog(true);
            }} className="gap-2" data-testid="new-purchase-btn">
              <Plus className="h-5 w-5" />
              {t.newPurchase}
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <PurchaseStats
          totalPurchases={totalPurchases}
          totalPaid={totalPaid}
          totalRemaining={totalRemaining}
          supplierDebtsCount={supplierDebts.length}
          t={t}
          language={language}
        />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="purchases" className="gap-2">
              <Receipt className="h-4 w-4" />
              {language === 'ar' ? 'سجل المشتريات' : 'Historique'}
            </TabsTrigger>
            <TabsTrigger value="debts" className="gap-2">
              <AlertCircle className="h-4 w-4" />
              {language === 'ar' ? 'حسابات الموردين' : 'Comptes'}
              {totalRemaining > 0 && (
                <Badge variant="destructive" className="ms-1">{supplierDebts.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Purchases History Tab */}
          <TabsContent value="purchases">
            <PurchaseHistoryTab
              purchases={purchases}
              formatDate={formatDate}
              getStatusBadge={getStatusBadge}
              viewPurchaseDetails={viewPurchaseDetails}
              openEditPurchaseDialog={openEditPurchaseDialog}
              confirmDeletePurchase={confirmDeletePurchase}
              t={t}
              language={language}
            />
          </TabsContent>

          {/* Supplier Debts Tab */}
          <TabsContent value="debts">
            <SupplierDebtsTab
              supplierDebts={supplierDebts}
              openPayDebtDialog={openPayDebtDialog}
              t={t}
              language={language}
            />
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <PurchaseDialogs
          showNewPurchaseDialog={showNewPurchaseDialog} setShowNewPurchaseDialog={setShowNewPurchaseDialog}
          purchaseCode={purchaseCode} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          searchInputRef={searchInputRef} filteredProducts={filteredProducts} addToCart={addToCart}
          suppliers={suppliers} selectedSupplier={selectedSupplier} setSelectedSupplier={setSelectedSupplier}
          setShowNewSupplierDialog={setShowNewSupplierDialog} supplierPreviousDebt={supplierPreviousDebt}
          cart={cart} updatePrice={updatePrice} updateQuantity={updateQuantity}
          removeFromCart={removeFromCart} openEditPricesDialog={openEditPricesDialog}
          subtotal={subtotal} paymentType={paymentType} setPaymentType={setPaymentType}
          paidAmount={paidAmount} setPaidAmount={setPaidAmount}
          paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
          notes={notes} setNotes={setNotes} loading={loading} completePurchase={completePurchase}
          showPayDebtDialog={showPayDebtDialog} setShowPayDebtDialog={setShowPayDebtDialog}
          selectedDebt={selectedDebt} debtPaymentAmount={debtPaymentAmount}
          setDebtPaymentAmount={setDebtPaymentAmount} paySupplierDebt={paySupplierDebt}
          showNewSupplierDialog={showNewSupplierDialog} newSupplierData={newSupplierData}
          setNewSupplierData={setNewSupplierData} addingSupplier={addingSupplier}
          handleAddSupplier={handleAddSupplier}
          showEditPricesDialog={showEditPricesDialog} setShowEditPricesDialog={setShowEditPricesDialog}
          editingProduct={editingProduct} editPricesData={editPricesData}
          setEditPricesData={setEditPricesData} handlePurchasePriceChange={handlePurchasePriceChange}
          handleMarginChange={handleMarginChange} handleImageUpload={handleImageUpload}
          imageInputRef={imageInputRef} uploadingImage={uploadingImage} saveEditedPrices={saveEditedPrices}
          showEditPurchaseDialog={showEditPurchaseDialog} setShowEditPurchaseDialog={setShowEditPurchaseDialog}
          editingPurchase={editingPurchase} editPaidAmount={editPaidAmount}
          setEditPaidAmount={setEditPaidAmount} editNotes={editNotes} setEditNotes={setEditNotes}
          handleUpdatePurchase={handleUpdatePurchase}
          showViewPurchaseDialog={showViewPurchaseDialog} setShowViewPurchaseDialog={setShowViewPurchaseDialog}
          viewingPurchase={viewingPurchase}
          showDeleteConfirm={showDeleteConfirm} setShowDeleteConfirm={setShowDeleteConfirm}
          purchaseToDelete={purchaseToDelete} deletingPurchase={deletingPurchase}
          handleDeletePurchase={handleDeletePurchase}
          language={language} isRTL={isRTL} t={t} formatDate={formatDate} getStatusBadge={getStatusBadge}
        />
      </div>
    </Layout>
  );
}

