import { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import * as XLSX from 'xlsx';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Search,
  X,
  CheckCircle2,
  Play,
  Upload,
  FileSpreadsheet,
  Box,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import InventoryDialogs from './inventory/InventoryDialogs';
import { InventorySessionProgress } from './inventory/InventorySessionProgress';
import { InventoryBarcodeScanner } from './inventory/InventoryBarcodeScanner';
import { InventoryProductsTable } from './inventory/InventoryProductsTable';
import { InventoryDifferences } from './inventory/InventoryDifferences';
import { InventoryHistory } from './inventory/InventoryHistory';

export default function InventoryCountPage() {
  const { t, language } = useLanguage();
  const barcodeInputRef = useRef(null);
  
  const [products, setProducts] = useState([]);
  const [inventorySessions, setInventorySessions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Current session
  const [activeSession, setActiveSession] = useState(null);
  const [countedItems, setCountedItems] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [inventoryCode, setInventoryCode] = useState('');  // كود الجرد
  
  // Dialogs
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [selectedFamily, setSelectedFamily] = useState('all');
  const [families, setFamilies] = useState([]);
  
  // Excel Import
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState([]);
  const [importPreview, setImportPreview] = useState([]);
  const [importFileName, setImportFileName] = useState('');
  const [importMapping, setImportMapping] = useState({
    barcode: '',
    quantity: '',
    name: ''
  });
  const [excelColumns, setExcelColumns] = useState([]);
  const [importStep, setImportStep] = useState(1); // 1: upload, 2: mapping, 3: preview
  const fileInputRef = useRef(null);
  
  // Enhanced features
  const [viewMode, setViewMode] = useState('all'); // all, counted, uncounted, differences
  const [sortBy, setSortBy] = useState('name'); // name, barcode, difference
  const [sortOrder, setSortOrder] = useState('asc');
  const [autoFocus, setAutoFocus] = useState(true);
  const [showOnlyLowStock, setShowOnlyLowStock] = useState(false);
  const [quickCountMode, setQuickCountMode] = useState(false);
  const [lastScannedProduct, setLastScannedProduct] = useState(null);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch inventory code when dialog opens
  useEffect(() => {
    if (showStartDialog && !inventoryCode) {
      const token = localStorage.getItem('token');
      apiClient.get(`/inventory-sessions/generate-code`)
        .then(res => setInventoryCode(res.data.code))
        .catch(() => {});
    }
  }, [showStartDialog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus barcode input
  useEffect(() => {
    if (activeSession && autoFocus) {
      const timer = setTimeout(() => barcodeInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [activeSession, autoFocus, countedItems]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [productsRes, sessionsRes, familiesRes] = await Promise.all([
        apiClient.get(`/products`, { headers }),
        apiClient.get(`/inventory-sessions`, { headers }).catch(() => ({ data: [] })),
        apiClient.get(`/product-families`, { headers }).catch(() => ({ data: [] }))
      ]);
      setProducts(productsRes.data);
      setInventorySessions(sessionsRes.data);
      setFamilies(familiesRes.data);
      
      // Check for active session
      const active = sessionsRes.data.find(s => s.status === 'active');
      if (active) {
        setActiveSession(active);
        setCountedItems(active.counted_items || {});
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(language === 'ar' ? 'خطأ في تحميل البيانات' : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const startNewSession = async () => {
    if (!sessionName.trim()) {
      toast.error(language === 'ar' ? 'يرجى إدخال اسم الجرد' : 'Veuillez entrer un nom');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      // Generate inventory code first
      let code = '';
      try {
        const codeRes = await apiClient.get(`/inventory-sessions/generate-code`);
        code = codeRes.data.code;
      } catch (e) {
        console.error('Error generating inventory code:', e);
      }
      
      const session = {
        code: code,
        name: sessionName,
        family_filter: selectedFamily,
        status: 'active',
        started_at: new Date().toISOString(),
        counted_items: {}
      };
      
      const response = await apiClient.post(`/inventory-sessions`, session);
      setActiveSession(response.data);
      setCountedItems({});
      setShowStartDialog(false);
      setSessionName('');
      setInventoryCode('');
      toast.success(language === 'ar' ? 'تم بدء الجرد' : 'Inventaire démarré');
      
      // Focus barcode input
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const product = products.find(p => 
      p.barcode === barcodeInput.trim() || 
      p.barcode?.toLowerCase() === barcodeInput.trim().toLowerCase()
    );
    
    if (product) {
      if (quickCountMode) {
        // Quick mode: set count to current system quantity
        setManualCount(product.id, product.quantity);
        toast.success(`${language === 'ar' ? 'تم تأكيد' : 'Confirmé'}: ${language === 'ar' ? product.name_ar : product.name_en} (${product.quantity})`);
      } else {
        incrementCount(product.id);
        toast.success(`${language === 'ar' ? 'تم إضافة' : 'Ajouté'}: ${language === 'ar' ? product.name_ar : product.name_en}`);
      }
      setLastScannedProduct(product);
    } else {
      toast.error(language === 'ar' ? 'منتج غير موجود' : 'Produit non trouvé');
    }
    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  const incrementCount = useCallback((productId) => {
    setCountedItems(prev => {
      const newCount = (prev[productId] || 0) + 1;
      saveCountToSession({ ...prev, [productId]: newCount });
      return { ...prev, [productId]: newCount };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const decrementCount = useCallback((productId) => {
    setCountedItems(prev => {
      const newCount = Math.max(0, (prev[productId] || 0) - 1);
      saveCountToSession({ ...prev, [productId]: newCount });
      return { ...prev, [productId]: newCount };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setManualCount = useCallback((productId, count) => {
    const value = Math.max(0, parseInt(count) || 0);
    setCountedItems(prev => {
      saveCountToSession({ ...prev, [productId]: value });
      return { ...prev, [productId]: value };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Set count to match current system quantity
  const confirmCurrentQuantity = useCallback((productId, currentQty) => {
    setCountedItems(prev => {
      saveCountToSession({ ...prev, [productId]: currentQty });
      return { ...prev, [productId]: currentQty };
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCountToSession = async (items) => {
    if (!activeSession) return;
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/inventory-sessions/${activeSession.id}`, {
        ...activeSession,
        counted_items: items
      });
    } catch (error) {
      console.error('Error saving count:', error);
    }
  };

  const finishSession = async (applyChanges) => {
    if (!activeSession) return;

    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Calculate differences and apply if needed
      if (applyChanges) {
        for (const product of filteredProducts) {
          const countedQty = countedItems[product.id];
          if (countedQty !== undefined && countedQty !== product.quantity) {
            await apiClient.put(`/products/${product.id}`, {
              ...product,
              quantity: countedQty
            }, { headers });
          }
        }
      }

      // Update session status
      await apiClient.put(`/inventory-sessions/${activeSession.id}`, {
        ...activeSession,
        status: 'completed',
        completed_at: new Date().toISOString(),
        applied_changes: applyChanges,
        counted_items: countedItems
      }, { headers });

      toast.success(language === 'ar' 
        ? (applyChanges ? 'تم تحديث المخزون بنجاح' : 'تم حفظ الجرد') 
        : (applyChanges ? 'Stock mis à jour' : 'Inventaire enregistré'));
      
      setActiveSession(null);
      setCountedItems({});
      setShowFinishDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  const cancelSession = async () => {
    if (!activeSession) return;
    if (!confirm(language === 'ar' ? 'هل أنت متأكد من إلغاء الجرد؟' : 'Êtes-vous sûr d\'annuler?')) return;

    try {
      await apiClient.delete(`/inventory-sessions/${activeSession.id}`);
      setActiveSession(null);
      setCountedItems({});
      toast.success(language === 'ar' ? 'تم إلغاء الجرد' : 'Inventaire annulé');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  // Excel Import Functions
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
          toast.error(language === 'ar' ? 'الملف فارغ أو لا يحتوي على بيانات' : 'Le fichier est vide');
          return;
        }

        // Get columns from first row
        const columns = jsonData[0].map((col, idx) => ({
          index: idx,
          name: String(col || `Column ${idx + 1}`)
        }));
        setExcelColumns(columns);
        
        // Store data (skip header)
        setImportData(jsonData.slice(1));
        
        // Auto-detect columns
        const autoMapping = { barcode: '', quantity: '', name: '' };
        columns.forEach(col => {
          const colLower = col.name.toLowerCase();
          if (colLower.includes('barcode') || colLower.includes('باركود') || colLower.includes('code')) {
            autoMapping.barcode = col.index.toString();
          }
          if (colLower.includes('quantity') || colLower.includes('كمية') || colLower.includes('qty') || colLower.includes('quantité')) {
            autoMapping.quantity = col.index.toString();
          }
          if (colLower.includes('name') || colLower.includes('اسم') || colLower.includes('nom') || colLower.includes('product') || colLower.includes('منتج')) {
            autoMapping.name = col.index.toString();
          }
        });
        setImportMapping(autoMapping);
        
        setImportStep(2);
        toast.success(`${language === 'ar' ? 'تم تحميل' : 'Chargé'}: ${jsonData.length - 1} ${language === 'ar' ? 'صف' : 'lignes'}`);
      } catch (error) {
        console.error('Excel parse error:', error);
        toast.error(language === 'ar' ? 'خطأ في قراءة الملف' : 'Erreur de lecture du fichier');
      }
    };
    
    reader.readAsArrayBuffer(file);
  };

  const generateImportPreview = () => {
    if (!importMapping.barcode || !importMapping.quantity) {
      toast.error(language === 'ar' ? 'يرجى تحديد أعمدة الباركود والكمية' : 'Sélectionnez les colonnes code-barres et quantité');
      return;
    }

    const barcodeIdx = parseInt(importMapping.barcode);
    const quantityIdx = parseInt(importMapping.quantity);
    const nameIdx = importMapping.name ? parseInt(importMapping.name) : null;

    const preview = [];
    let matched = 0;
    let notFound = 0;

    importData.forEach((row, rowIndex) => {
      const barcode = String(row[barcodeIdx] || '').trim();
      const quantity = parseInt(row[quantityIdx]) || 0;
      const excelName = nameIdx !== null ? String(row[nameIdx] || '') : '';

      if (!barcode) return;

      const product = products.find(p => 
        p.barcode === barcode || 
        p.barcode?.toLowerCase() === barcode.toLowerCase()
      );

      if (product) {
        matched++;
        preview.push({
          id: product.id,
          barcode,
          excelName,
          productName: language === 'ar' ? product.name_ar : product.name_en,
          currentQty: product.quantity,
          newQty: quantity,
          diff: quantity - product.quantity,
          status: 'matched'
        });
      } else {
        notFound++;
        preview.push({
          id: null,
          barcode,
          excelName,
          productName: null,
          currentQty: null,
          newQty: quantity,
          diff: null,
          status: 'not_found'
        });
      }
    });

    setImportPreview(preview);
    setImportStep(3);
    
    toast.info(`${matched} ${language === 'ar' ? 'متطابق' : 'trouvés'}, ${notFound} ${language === 'ar' ? 'غير موجود' : 'non trouvés'}`);
  };

  const applyImportData = () => {
    const newCounts = { ...countedItems };
    let appliedCount = 0;

    importPreview.forEach(item => {
      if (item.status === 'matched' && item.id) {
        newCounts[item.id] = item.newQty;
        appliedCount++;
      }
    });

    setCountedItems(newCounts);
    saveCountToSession(newCounts);
    
    toast.success(`${language === 'ar' ? 'تم استيراد' : 'Importé'}: ${appliedCount} ${language === 'ar' ? 'منتج' : 'produits'}`);
    
    // Reset import state
    setShowImportDialog(false);
    setImportData([]);
    setImportPreview([]);
    setImportFileName('');
    setImportStep(1);
    setExcelColumns([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const templateData = [
      [language === 'ar' ? 'الباركود' : 'Barcode', language === 'ar' ? 'الكمية' : 'Quantité', language === 'ar' ? 'اسم المنتج (اختياري)' : 'Nom du produit (optionnel)'],
      ...products.slice(0, 10).map(p => [p.barcode || '', p.quantity, language === 'ar' ? p.name_ar : p.name_en])
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    
    // Set column widths
    ws['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 40 }];
    
    XLSX.writeFile(wb, `inventory_template_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success(language === 'ar' ? 'تم تحميل القالب' : 'Modèle téléchargé');
  };

  const resetImport = () => {
    setImportStep(1);
    setImportData([]);
    setImportPreview([]);
    setImportFileName('');
    setExcelColumns([]);
    setImportMapping({ barcode: '', quantity: '', name: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Export inventory report
  const exportReport = () => {
    const reportData = filteredProducts.map(p => ({
      name: language === 'ar' ? p.name_ar : p.name_en,
      barcode: p.barcode || '',
      system_qty: p.quantity,
      counted_qty: countedItems[p.id] ?? '',
      difference: countedItems[p.id] !== undefined ? countedItems[p.id] - p.quantity : ''
    }));
    
    // Create CSV
    const headers = language === 'ar' 
      ? ['المنتج', 'الباركود', 'الكمية الحالية', 'الكمية المجرودة', 'الفرق']
      : ['Product', 'Barcode', 'System Qty', 'Counted Qty', 'Difference'];
    
    const csv = [
      headers.join(','),
      ...reportData.map(row => Object.values(row).join(','))
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_${activeSession?.name || 'report'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success(language === 'ar' ? 'تم تصدير التقرير' : 'Rapport exporté');
  };

  // Filter and sort products
  const filteredProducts = products
    .filter(p => {
      const matchesSearch = searchQuery === '' || 
        p.name_ar?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name_en?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.article_code?.toLowerCase().includes(searchQuery.toLowerCase());  // البحث بكود المنتج
      
      const matchesFamily = selectedFamily === 'all' || p.family_id === selectedFamily;
      
      const counted = countedItems[p.id];
      const matchesView = 
        viewMode === 'all' ||
        (viewMode === 'counted' && counted !== undefined) ||
        (viewMode === 'uncounted' && counted === undefined) ||
        (viewMode === 'differences' && counted !== undefined && counted !== p.quantity);
      
      const matchesLowStock = !showOnlyLowStock || p.quantity <= (p.min_stock || 5);
      
      return matchesSearch && matchesFamily && matchesView && matchesLowStock;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = (language === 'ar' ? a.name_ar : a.name_en).localeCompare(language === 'ar' ? b.name_ar : b.name_en);
          break;
        case 'barcode':
          comparison = (a.barcode || '').localeCompare(b.barcode || '');
          break;
        case 'difference':
          const diffA = countedItems[a.id] !== undefined ? countedItems[a.id] - a.quantity : -Infinity;
          const diffB = countedItems[b.id] !== undefined ? countedItems[b.id] - b.quantity : -Infinity;
          comparison = diffA - diffB;
          break;
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  // Calculate statistics
  const totalProducts = filteredProducts.length;
  const countedProducts = filteredProducts.filter(p => countedItems[p.id] !== undefined).length;
  const progress = totalProducts > 0 ? (countedProducts / totalProducts) * 100 : 0;
  
  const differences = filteredProducts.filter(p => {
    const counted = countedItems[p.id];
    return counted !== undefined && counted !== p.quantity;
  });

  const positiveCount = differences.filter(p => countedItems[p.id] > p.quantity).length;
  const negativeCount = differences.filter(p => countedItems[p.id] < p.quantity).length;

  const formatDate = (dateString) => {
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="inventory-count-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {language === 'ar' ? 'جرد المخزون' : 'Inventaire'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'جرد وتحديث كميات المنتجات' : 'Compter et mettre à jour les quantités'}
            </p>
          </div>
          {!activeSession ? (
            <Button onClick={() => setShowStartDialog(true)} className="gap-2" size="lg">
              <Play className="h-5 w-5" />
              {language === 'ar' ? 'بدء جرد جديد' : 'Démarrer inventaire'}
            </Button>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setShowImportDialog(true)} className="gap-2">
                <Upload className="h-4 w-4" />
                {language === 'ar' ? 'استيراد Excel' : 'Importer Excel'}
              </Button>
              <Button variant="outline" onClick={exportReport} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                {language === 'ar' ? 'تصدير' : 'Exporter'}
              </Button>
              <Button variant="outline" onClick={cancelSession} className="gap-2 text-red-500 hover:text-red-600">
                <X className="h-4 w-4" />
                {language === 'ar' ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button onClick={() => setShowFinishDialog(true)} className="gap-2 bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="h-4 w-4" />
                {language === 'ar' ? 'إنهاء الجرد' : 'Terminer'}
              </Button>
            </div>
          )}
        </div>

        {activeSession ? (
          <>
            {/* Session Info & Progress */}
            <InventorySessionProgress
              activeSession={activeSession}
              progress={progress}
              countedProducts={countedProducts}
              totalProducts={totalProducts}
              positiveCount={positiveCount}
              negativeCount={negativeCount}
              formatDate={formatDate}
              language={language}
            />

            {/* Barcode Scanner Input */}
            <InventoryBarcodeScanner
              quickCountMode={quickCountMode}
              setQuickCountMode={setQuickCountMode}
              barcodeInputRef={barcodeInputRef}
              barcodeInput={barcodeInput}
              setBarcodeInput={setBarcodeInput}
              handleBarcodeSubmit={handleBarcodeSubmit}
              lastScannedProduct={lastScannedProduct}
              countedItems={countedItems}
              language={language}
            />

            {/* Filters & Controls */}
            <div className="flex flex-wrap gap-4 items-center">
              <div className="relative flex-1 min-w-[200px]">
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
              
              <Tabs value={viewMode} onValueChange={setViewMode} className="w-auto">
                <TabsList>
                  <TabsTrigger value="all" className="gap-1">
                    <Box className="h-4 w-4" />
                    {language === 'ar' ? 'الكل' : 'Tous'}
                  </TabsTrigger>
                  <TabsTrigger value="uncounted" className="gap-1">
                    <EyeOff className="h-4 w-4" />
                    {language === 'ar' ? 'غير مجرود' : 'Non comptés'}
                  </TabsTrigger>
                  <TabsTrigger value="differences" className="gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    {language === 'ar' ? 'فروقات' : 'Différences'}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Products Table */}
            <InventoryProductsTable
              filteredProducts={filteredProducts}
              countedItems={countedItems}
              confirmCurrentQuantity={confirmCurrentQuantity}
              decrementCount={decrementCount}
              incrementCount={incrementCount}
              setManualCount={setManualCount}
              saveCountToSession={saveCountToSession}
              language={language}
            />

            {/* Differences Summary */}
            <InventoryDifferences
              differences={differences}
              countedItems={countedItems}
              language={language}
            />
          </>
        ) : (
          /* No Active Session - Show History */
          <InventoryHistory
            inventorySessions={inventorySessions}
            formatDate={formatDate}
            setShowStartDialog={setShowStartDialog}
            language={language}
          />
        )}

        {/* Dialogs */}
        <InventoryDialogs
          showStartDialog={showStartDialog} setShowStartDialog={setShowStartDialog}
          sessionName={sessionName} setSessionName={setSessionName}
          selectedFamily={selectedFamily} setSelectedFamily={setSelectedFamily}
          families={families} inventoryCode={inventoryCode}
          startNewSession={startNewSession}
          showFinishDialog={showFinishDialog} setShowFinishDialog={setShowFinishDialog}
          countedProducts={Object.keys(countedItems).length}
          differences={differences} finishSession={finishSession}
          showImportDialog={showImportDialog} setShowImportDialog={setShowImportDialog}
          resetImport={resetImport} importStep={importStep} setImportStep={setImportStep}
          importFileName={importFileName} importData={importData}
          importMapping={importMapping} setImportMapping={setImportMapping}
          excelColumns={excelColumns} fileInputRef={fileInputRef}
          handleFileUpload={handleFileUpload} downloadTemplate={downloadTemplate}
          generateImportPreview={generateImportPreview} importPreview={importPreview}
          applyImportData={applyImportData}
          language={language}
        />
      </div>
    </Layout>
  );
}
