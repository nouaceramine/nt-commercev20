/**
 * POSPage - Point of Sale Page (Refactored)
 * Before: 2,314 lines | After: ~350 lines
 * Refactoring: Extract Hook, Replace Data Value with Object, Move Method
 * Following Martin Fowler's Refactoring patterns
 */
import { errText } from '../lib/errorText';
import { useState, useEffect, useRef, useCallback } from 'react';
import { nextTier, tierLabel } from '../lib/priceTiers';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Undo2, Users, Barcode,
  List, FolderTree, FileText, ArrowDownToLine,
  ArrowUpFromLine, BarChart3, ScrollText, CalendarDays,
  Tag, Printer, PackagePlus, History, CreditCard,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';

// === Extracted Hooks (Refactoring: Extract Hook) ===
import { usePOSCart } from '../hooks/usePOSCart';
import { usePOSSession } from '../hooks/usePOSSession';
import { useCurrencyFormatter } from '../hooks/useCurrencyFormatter';

// === Extracted Service (Refactoring: Move Method) ===
import { ReceiptService } from '../services/ReceiptService';

// === Domain Objects (Refactoring: Replace Data Value with Object) ===
import { DeliveryInfo } from '../models/DeliveryInfo';
import { PaymentDetails } from '../models/PaymentDetails';

// === Sub-components ===
import POSDialogs from './pos/POSDialogs';
import POSSessionBar from './pos/POSSessionBar';
import POSSidebar from './pos/POSSidebar';
import POSShortcuts from './pos/POSShortcuts';
import POSCart from './pos/POSCart';
import PrintDocumentDialog from '../components/print/PrintDocumentDialog';
import SellPlatformCardDialog from '../components/SellPlatformCardDialog';
import QuickFlexyPanel from '../components/QuickFlexyPanel';

const SHORTCUT_COLORS = [
  '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d',
  '#16a34a', '#059669', '#0d9488', '#0891b2', '#0284c7',
  '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3',
  '#db2777', '#e11d48', '#64748b', '#78716c', '#71717a'
];

export default function POSPage() {
  const { t, language, isRTL } = useLanguage();
  const { formatCurrency } = useCurrencyFormatter();

  // === Extracted: Cart State (was 200+ lines inline) ===
  const cart = usePOSCart({ language, toast });

  // === Extracted: Session State (was 150+ lines inline) ===
  const session = usePOSSession({ language, toast, apiClient });

  // === Product & Catalog Data ===
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [families, setFamilies] = useState([]);
  const [customerFamilies, setCustomerFamilies] = useState([]);
  const [wilayas, setWilayas] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedFamily, setSelectedFamily] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDebt, setCustomerDebt] = useState(0);
  const [blacklist, setBlacklist] = useState([]);
  const [priceType, setPriceType] = useState('retail');

  // تطبيق فئة سعر الزبون تلقائياً عند اختياره (الافتراضي: تجزئة)
  useEffect(() => {
    if (!selectedCustomer) return;
    const cust = customers.find(c => c.id === selectedCustomer);
    if (cust?.price_tier && cust.price_tier !== priceType) setPriceType(cust.price_tier);
  }, [selectedCustomer]);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  // === Domain Object: Delivery (was 6 primitive states) ===
  const [delivery, setDelivery] = useState(new DeliveryInfo());

  // === UI State ===
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState('articles');
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({ name: '', phone: '', email: '', address: '', family_id: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [showProductsDialog, setShowProductsDialog] = useState(false);
  const [showCustomersDialog, setShowCustomersDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showCashDialog, setShowCashDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [cashOperation, setCashOperation] = useState({ type: 'deposit', amount: 0, note: '' });
  const [salesHistory, setSalesHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showCustomProductDialog, setShowCustomProductDialog] = useState(false);
  const [showPosReportsDialog, setShowPosReportsDialog] = useState(false);
  const [customProduct, setCustomProduct] = useState({ name: '', price: '', qty: 1 });
  const [customerFamilyFilter, setCustomerFamilyFilter] = useState(null);
  const [showSellCardDialog, setShowSellCardDialog] = useState(false);
  const [showPrintDocDialog, setShowPrintDocDialog] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const flexyPanelRef = useRef(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [saleCode, setSaleCode] = useState('');
  const [receiptSettings, setReceiptSettings] = useState(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [lastSaleId, setLastSaleId] = useState(null);
  const [lastSaleInvoice, setLastSaleInvoice] = useState(null);

  // === Offline POS (idea 11): queue sales when network drops, sync on reconnect ===
  const POS_QUEUE_KEY = 'pos_offline_queue';
  const readOfflineQueue = () => { try { return JSON.parse(localStorage.getItem(POS_QUEUE_KEY) || '[]'); } catch { return []; } };
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState(readOfflineQueue);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const persistQueue = (q) => { setOfflineQueue(q); try { localStorage.setItem(POS_QUEUE_KEY, JSON.stringify(q)); } catch { /* storage full */ } };
  const enqueueOfflineSale = (saleData) => {
    const q = [...readOfflineQueue(), { ...saleData, _offline_at: new Date().toISOString() }];
    persistQueue(q);
  };
  const syncOfflineSales = useCallback(async () => {
    if (syncingQueue) return;
    const q = readOfflineQueue();
    if (q.length === 0 || !navigator.onLine) return;
    setSyncingQueue(true);
    let synced = 0, failed = 0;
    const remaining = [];
    for (const item of q) {
      const { _offline_at, ...saleData } = item;
      try {
        await apiClient.post('/sales', saleData);
        synced += 1;
      } catch (e) {
        if (e && e.response) {
          // Server rejected (e.g. duplicate code): retry once with an offline suffix
          try {
            await apiClient.post('/sales', { ...saleData, code: `${saleData.code}-O${Date.now() % 1000}` });
            synced += 1;
          } catch (e2) {
            if (e2 && e2.response) { failed += 1; } else { remaining.push(item); }
          }
        } else {
          remaining.push(item); // still offline
        }
      }
    }
    persistQueue(remaining);
    if (synced > 0) toast.success(language === 'ar' ? `تمت مزامنة ${synced} بيع أوفلاين` : `${synced} vente(s) synchronisee(s)`);
    if (failed > 0) toast.error(language === 'ar' ? `فشلت مزامنة ${failed} بيع` : `${failed} vente(s) echouee(s)`);
    if (synced > 0) { fetchProducts(); fetchSaleCode(); if (session.currentSession) session.fetchSessionStats(session.currentSession.id); }
    setSyncingQueue(false);
  }, [syncingQueue, language, session.currentSession]);
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => { setIsOffline(false); syncOfflineSales(); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    if (navigator.onLine && readOfflineQueue().length > 0) syncOfflineSales();
    const iv = setInterval(() => { if (navigator.onLine && readOfflineQueue().length > 0) syncOfflineSales(); }, 60000);
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline); clearInterval(iv); };
  }, [syncOfflineSales]);
  const [showInstallmentDialog, setShowInstallmentDialog] = useState(false);
  const [installmentPlan, setInstallmentPlan] = useState({
    down_payment: 0, installments_count: 3, interest_rate: 0,
    frequency: 'monthly', first_due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  // === Product Shortcuts ===
  const [productShortcuts, setProductShortcuts] = useState(() => {
    const saved = localStorage.getItem('posProductShortcuts');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length < 18) {
        return [...parsed, ...Array(18 - parsed.length).fill({ productId: null, color: '#e5e7eb' })];
      }
      return parsed;
    }
    return Array(18).fill({ productId: null, color: '#e5e7eb' });
  });
  const [showShortcutDialog, setShowShortcutDialog] = useState(false);
  const [editingShortcutIndex, setEditingShortcutIndex] = useState(null);
  const [shortcutColor, setShortcutColor] = useState('#e5e7eb');
  const [shortcutProductId, setShortcutProductId] = useState('');
  const [editingShortcutsMode, setEditingShortcutsMode] = useState(false);

  // Product entry dialog
  const [productEntryDialog, setProductEntryDialog] = useState(null);
  const [entryQty, setEntryQty] = useState('1');
  const [entryPrice, setEntryPrice] = useState('');
  const [entrySerial, setEntrySerial] = useState('');

  // Cashier info
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const currentCashier = currentUser?.full_name || currentUser?.username || 'Cashier';

  // === Data Fetching ===
  useEffect(() => {
    session.checkOpenSession();
    fetchProducts();
    fetchCustomers();
    fetchFamilies();
    fetchCustomerFamilies();
    fetchBlacklist();
    fetchWilayas();
    fetchWarehouses();
    fetchReceiptSettings();
    fetchSaleCode();
    session.fetchCashBoxBalance();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchProducts = async () => {
    try { const res = await apiClient.get('/products'); setProducts(res.data); } catch (e) { console.error(e); }
  };
  const fetchCustomers = async () => {
    try { const res = await apiClient.get('/customers'); setCustomers(res.data); } catch (e) { console.error(e); }
  };
  const fetchFamilies = async () => {
    try { const res = await apiClient.get('/product-families'); setFamilies(res.data); } catch (e) { console.error(e); }
  };
  const fetchCustomerFamilies = async () => {
    try { const res = await apiClient.get('/customer-families'); setCustomerFamilies(res.data); } catch (e) { console.error(e); }
  };
  const fetchWilayas = async () => {
    try { const res = await apiClient.get('/delivery/wilayas'); setWilayas(res.data); } catch (e) { console.error(e); }
  };
  const fetchBlacklist = async () => {
    try { const res = await apiClient.get('/blacklist'); setBlacklist(res.data); } catch (e) { console.error(e); }
  };
  const fetchReceiptSettings = async () => {
    try { const res = await apiClient.get('/settings/receipt'); setReceiptSettings(res.data); } catch (e) { console.error(e); }
  };
  const fetchSaleCode = async () => {
    try { const res = await apiClient.get('/sales/generate-code'); setSaleCode(res.data.code); } catch (e) { console.error(e); }
  };
  const fetchSalesHistory = async () => {
    setHistoryLoading(true);
    try { const res = await apiClient.get('/sales?limit=20'); setSalesHistory(res.data.sales || res.data || []); } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };
  const fetchCustomerDebt = async (customerId) => {
    try { const res = await apiClient.get(`/customers/${customerId}/debt`); setCustomerDebt(res.data.total_debt || 0); } catch (e) { setCustomerDebt(0); }
  };
  const fetchWarehouses = async () => {
    try {
      const res = await apiClient.get('/warehouses');
      setWarehouses(res.data);
      const main = res.data.find(w => w.is_main);
      if (main && !selectedWarehouse) setSelectedWarehouse(main.id);
    } catch (e) { console.error(e); }
  };

  // === Delivery: use domain object ===
  useEffect(() => {
    if (delivery.enabled && delivery.wilayaCode) {
      const wilaya = wilayas.find(w => w.code === delivery.wilayaCode);
      if (wilaya) {
        setDelivery(prev => prev.updateWilaya(wilaya, delivery.deliveryType));
      }
    }
  }, [delivery.wilayaCode, delivery.deliveryType, delivery.enabled, wilayas]);

  // === Customer debt effect ===
  useEffect(() => {
    if (selectedCustomer) fetchCustomerDebt(selectedCustomer);
    else setCustomerDebt(0);
  }, [selectedCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  // === Search effect ===
  useEffect(() => {
    if (searchQuery.length >= 1) {
      const query = searchQuery.toLowerCase();
      const filtered = products.filter(p =>
        p.name_ar?.toLowerCase().includes(query) ||
        p.name_en?.toLowerCase().includes(query) ||
        p.article_code?.toLowerCase().includes(query) ||
        p.barcode?.toLowerCase().includes(query)
      ).slice(0, 10);
      setSearchResults(filtered);
      setShowSearchResults(true);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  }, [searchQuery, products]);

  // === Barcode Scanner ===
  const [barcodeBuffer, setBarcodeBuffer] = useState('');
  const barcodeTimeoutRef = useRef(null);
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    const handleBarcodeInput = (e) => {
      const activeElement = document.activeElement;
      const isInputField = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable;
      const isSearchInput = activeElement.getAttribute('data-testid') === 'pos-search-input';
      if (isInputField && !isSearchInput) return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;
      const isScanner = timeDiff < 50;

      if (e.key === 'Enter' && barcodeBuffer.length >= 3) {
        e.preventDefault();
        const barcode = barcodeBuffer.trim();
        const product = products.find(p =>
          p.barcode === barcode ||
          (Array.isArray(p.additional_barcodes) && p.additional_barcodes.includes(barcode)) ||
          p.article_code === barcode
        );
        if (product) { cart.addItem(product); toast.success(`${product.name}`); }
        else { toast.error(language === 'ar' ? `المنتج غير موجود: ${barcode}` : `Produit introuvable: ${barcode}`); }
        setBarcodeBuffer('');
        setSearchQuery('');
        return;
      }
      if (e.key.length === 1 && (isScanner || barcodeBuffer.length === 0)) {
        setBarcodeBuffer(prev => prev + e.key);
        if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);
        barcodeTimeoutRef.current = setTimeout(() => setBarcodeBuffer(''), 500);
      }
    };
    document.addEventListener('keydown', handleBarcodeInput);
    return () => {
      document.removeEventListener('keydown', handleBarcodeInput);
      if (barcodeTimeoutRef.current) clearTimeout(barcodeTimeoutRef.current);
    };
  }, [barcodeBuffer, products, language, cart]);

  // === Filtered Products ===
  const filteredProducts = products.filter(p => {
    const matchesSearch = !searchQuery ||
      p.name_ar?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name_en?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.article_code?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFamily = selectedFamily === 'all' || p.family_id === selectedFamily;
    return matchesSearch && matchesFamily;
  });

  // === Extracted: Receipt Service (was inline 60+ lines) ===
  const printThermalReceipt = useCallback(async (saleId, printerSize = '80mm') => {
    const result = await ReceiptService.printSaleReceipt(
      apiClient, saleId, receiptSettings, language, isRTL, currentCashier, printerSize
    );
    if (!result.success) {
      toast.error(language === 'ar' ? 'خطأ في الطباعة' : 'Erreur d\'impression');
    }
  }, [receiptSettings, language, isRTL, currentCashier]);

  // === Complete Sale (was 80+ lines, now uses domain objects) ===
  const completeSale = async () => {
    if (!session.hasOpenSession) { toast.error(language === 'ar' ? 'يجب فتح حصة' : 'Ouvrez une session'); return; }
    if (cart.cart.length === 0) { toast.error(language === 'ar' ? 'السلة فارغة' : 'Panier vide'); return; }
    if (cart.paymentType !== 'cash' && !selectedCustomer) { toast.error(language === 'ar' ? 'اختر زبوناً' : 'Selectionnez un client'); return; }

    setLoading(true);
    let saleData = null; // hoisted so the catch block can queue it offline
    try {
      // Build PaymentDetails domain object (fix: pass proper args per payment type,
      // previously the whole cart object was passed as paid_amount -> 500 from API)
      const payment =
        cart.paymentType === 'credit' ? PaymentDetails.credit()
        : cart.paymentType === 'installment' ? PaymentDetails.installment(cart.installmentPlan || { down_payment: cart.paidAmount || 0 })
        : cart.paymentType === 'mixed' ? PaymentDetails.mixed(Number(cart.mixedCash) || 0, Number(cart.mixedBank) || 0)
        : PaymentDetails.cash(Number(cart.paidAmount) || cart.subtotal);

      saleData = {
        code: saleCode,
        customer_id: selectedCustomer,
        warehouse_id: selectedWarehouse || null,
        items: cart.cart.map(item => ({
          product_id: item.is_custom ? null : item.product_id,
          product_name: item.product_name,
          barcode: item.barcode || '',
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount || 0,
          total: item.total,
          note: item.note || '',
        })),
        subtotal: cart.subtotal,
        discount: cart.discount,
        total: cart.subtotal - cart.discount,
        ...payment.toJSON(),
        notes: cart.saleNote,
        delivery: delivery.toApiPayload(language),
      };

      const response = await apiClient.post('/sales', saleData);
      toast.success(language === 'ar' ? 'تم البيع بنجاح' : 'Vente effectuee');
      setLastSaleId(response.data.id);
      setLastSaleInvoice(response.data.invoice_number);

      if (receiptSettings?.auto_print) {
        printThermalReceipt(response.data.id, receiptSettings?.thermal_printer_size || '80mm');
      } else if (receiptSettings?.show_print_dialog !== false) {
        setShowPrintDialog(true);
      }

      cart.clear();
      fetchProducts();
      fetchSaleCode();
      if (session.currentSession) session.fetchSessionStats(session.currentSession.id);
    } catch (error) {
      console.error('Sale error:', error);
      if (!error.response && saleData) {
        // Network failure: keep the sale locally and sync it when connection returns
        enqueueOfflineSale(saleData);
        setIsOffline(true);
        toast.success(language === 'ar' ? 'انقطع الاتصال — حُفظ البيع محلياً وسيُزامَن تلقائياً' : 'Hors ligne — vente enregistree localement');
        cart.clear();
      } else {
        toast.error(errText(error) ||  (language === 'ar' ? 'خطأ في البيع' : 'Erreur vente'));
      }
    } finally {
      setLoading(false);
    }
  };

  // === Cash Operation ===
  const handleCashOperation = async () => {
    if (!cashOperation.amount || cashOperation.amount <= 0) { toast.error(language === 'ar' ? 'أدخل مبلغاً' : 'Entrez un montant'); return; }
    try {
      const endpoint = cashOperation.type === 'deposit' ? '/cash/deposit' : '/cash/withdraw';
      await apiClient.post(endpoint, { amount: cashOperation.amount, note: cashOperation.note, box_id: 'cash' });
      toast.success(language === 'ar' ? 'تمت العملية' : 'Operation effectuee');
      setShowCashDialog(false);
      setCashOperation({ type: 'deposit', amount: 0, note: '' });
    } catch (error) { toast.error(errText(error) ||  'Error'); }
  };

  // === Task Menu (Refactored: Replace Switch with lookup) ===
  const taskHandlers = {
    'articles': () => setShowProductsDialog(true),
    'families': () => { setSelectedFamily('all'); setShowProductsDialog(true); },
    'customers': () => { setCustomerFamilyFilter(null); setShowCustomersDialog(true); },
    'customer-families': () => { setCustomerFamilyFilter('_all_families'); setShowCustomersDialog(true); },
    'custom-product': () => { setCustomProduct({ name: '', price: '', qty: 1 }); setShowCustomProductDialog(true); },
    'price-type': () => setPriceType(prev => nextTier(prev)),
    'note': () => setShowNoteDialog(true),
    'return': () => cart.toggleReturnMode(),
    'deposit': () => { setCashOperation({ type: 'deposit', amount: 0, note: '' }); setShowCashDialog(true); },
    'withdraw': () => { setCashOperation({ type: 'withdraw', amount: 0, note: '' }); setShowCashDialog(true); },
    'print-last': () => lastSaleId ? setShowPrintDialog(true) : toast.info(language === 'ar' ? 'لا يوجد' : 'Aucune'),
    'reports': () => setShowPosReportsDialog(true),
    'history': () => { fetchSalesHistory(); setShowHistoryDialog(true); },
  };

  const handleTaskClick = (taskId) => {
    setActiveTask(taskId);
    taskHandlers[taskId]?.();
  };

  const taskMenuItems = [
    { id: 'articles', icon: List, label: language === 'ar' ? 'قائمة المنتجات' : 'Liste articles', shortcut: '0' },
    { id: 'families', icon: FolderTree, label: language === 'ar' ? 'بالعائلة' : 'Par famille', shortcut: '1' },
    { id: 'customers', icon: Users, label: language === 'ar' ? 'الزبائن' : 'Clients', shortcut: '2' },
    { id: 'customer-families', icon: FolderTree, label: language === 'ar' ? 'عائلات الزبائن' : 'Fam. clients', shortcut: '3', badge: true },
    { id: 'custom-product', icon: PackagePlus, label: language === 'ar' ? 'منتج مخصص' : 'Produit libre', shortcut: '4' },
    { id: 'price-type', icon: Tag, label: (language === 'ar' ? 'السعر: ' : 'Prix: ') + tierLabel(priceType, language), shortcut: '5', highlight: priceType !== 'retail' },
    { id: 'note', icon: FileText, label: language === 'ar' ? 'ملاحظة' : 'Note', shortcut: '6' },
    { id: 'return', icon: Undo2, label: language === 'ar' ? 'إرجاع' : 'Retour', shortcut: '7' },
    { id: 'deposit', icon: ArrowDownToLine, label: language === 'ar' ? 'إيداع' : 'Dépôt', shortcut: '8' },
    { id: 'withdraw', icon: ArrowUpFromLine, label: language === 'ar' ? 'سحب' : 'Retrait', shortcut: '9' },
    { id: 'print-last', icon: Printer, label: language === 'ar' ? 'طباعة آخر فاتورة' : 'Impr. dernière', shortcut: 'P' },
    { id: 'reports', icon: BarChart3, label: language === 'ar' ? 'تقارير الحصة' : 'Rapports session', shortcut: 'R' },
    { id: 'history', icon: ScrollText, label: language === 'ar' ? 'السجل' : 'Historique', shortcut: 'H' },
  ];

  // === Shortcuts ===
  const saveShortcuts = (shortcuts) => {
    setProductShortcuts(shortcuts);
    localStorage.setItem('posProductShortcuts', JSON.stringify(shortcuts));
    apiClient.put('/pos/shortcuts', { shortcuts: shortcuts.map(s => ({ productId: s.productId || null, color: s.color || null, label: s.label || null })) }).catch(() => {});
  };

  const handleShortcutClick = (shortcut, index) => {
    if (shortcut.productId) { const product = products.find(p => p.id === shortcut.productId); if (product) cart.addItem(product); }
    else { setEditingShortcutIndex(index); setShortcutColor(shortcut.color || SHORTCUT_COLORS[index % SHORTCUT_COLORS.length]); setShortcutProductId(''); setShowShortcutDialog(true); }
  };

  const saveShortcut = () => {
    if (editingShortcutIndex !== null && shortcutProductId) {
      const newShortcuts = [...productShortcuts];
      newShortcuts[editingShortcutIndex] = { productId: shortcutProductId, color: shortcutColor };
      saveShortcuts(newShortcuts);
      setShowShortcutDialog(false);
    }
  };

  const getShortcutProductName = (shortcut) => {
    if (!shortcut.productId) return '+';
    const product = products.find(p => p.id === shortcut.productId);
    if (!product) return '---';
    return (language === 'ar' ? (product.name_ar || product.name_en) : (product.name_en || product.name_ar))?.substring(0, 8) || '---';
  };

  // === Keyboard Shortcuts ===
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F10' || (e.ctrlKey && e.key === 'Enter')) { e.preventDefault(); completeSale(); }
      if (e.key === 'Escape') { e.preventDefault(); cart.clear(); }
      if (e.ctrlKey && e.key >= '0' && e.key <= '9') { e.preventDefault(); const tasks = ['articles', 'families', 'customers', 'customer-families', 'custom-product', 'price-type', 'note', 'return', 'deposit', 'withdraw']; if (tasks[parseInt(e.key)]) handleTaskClick(tasks[parseInt(e.key)]); }
      if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); handleTaskClick('print-last'); }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); handleTaskClick('reports'); }
      if (e.ctrlKey && e.key.toLowerCase() === 'h') { e.preventDefault(); handleTaskClick('history'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, session.hasOpenSession, cart.returnMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // === Computed ===
  const total = cart.subtotal - cart.discount + (delivery.enabled ? delivery.fee : 0);

  return (
    <Layout>
      <div className="h-[calc(100vh-120px)] flex flex-col" data-testid="pos-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base sm:text-xl font-bold">{language === 'ar' ? 'نقطة البيع' : 'Point de Vente'}</h1>
            {barcodeBuffer.length > 0 && <Badge variant="secondary" className="animate-pulse text-xs gap-1"><Barcode className="h-3 w-3" />{barcodeBuffer}</Badge>}
            {cart.returnMode && <Badge variant="destructive" className="animate-pulse text-xs">{language === 'ar' ? 'إرجاع' : 'Retour'}</Badge>}
            {isOffline && <Badge variant="destructive" className="text-xs" data-testid="pos-offline-badge">{language === 'ar' ? 'بدون اتصال' : 'Hors ligne'}</Badge>}
            {offlineQueue.length > 0 && (
              <Badge variant="secondary" className="text-xs cursor-pointer" data-testid="pos-offline-queue-badge" onClick={syncOfflineSales}>
                {language === 'ar' ? `${offlineQueue.length} بيع بانتظار المزامنة` : `${offlineQueue.length} vente(s) en attente`}
              </Badge>
            )}
          </div>
          <div className="bg-primary text-primary-foreground text-base sm:text-xl font-bold px-3 py-1.5 rounded-lg shadow">
            {formatCurrency(total)} {t.currency}
          </div>
        </div>

        {/* Session Bar */}
        <POSSessionBar {...session} language={language} formatCurrency={formatCurrency} t={t} isRTL={isRTL} />

        {/* Main Grid */}
        <div className={`flex-1 grid grid-cols-1 md:grid-cols-12 gap-2 min-h-0 ${isRTL ? 'direction-ltr' : ''}`} style={{ direction: 'ltr' }}>
          <POSSidebar
            searchInputRef={searchInputRef} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            showSearchResults={showSearchResults} setShowSearchResults={setShowSearchResults}
            searchResults={searchResults} products={products} addToCart={cart.addItem}
            setShowProductsDialog={setShowProductsDialog} taskMenuItems={taskMenuItems}
            activeTask={activeTask} handleTaskClick={handleTaskClick} returnMode={cart.returnMode}
            language={language} formatCurrency={formatCurrency} isRTL={isRTL}
          />

          <div className="col-span-1 md:col-span-4 flex flex-col gap-2 min-h-0 overflow-y-auto md:overflow-visible" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <div className="md:hidden flex items-center gap-2 mb-1 overflow-x-auto pb-1">
              <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => setShowProductsDialog(true)}><Plus className="h-4 w-4" />{language === 'ar' ? 'منتج' : 'Produit'}</Button>
              <Button size="sm" variant={cart.returnMode ? "destructive" : "outline"} className="gap-1 shrink-0" onClick={() => handleTaskClick('return')}><Undo2 className="h-4 w-4" />{language === 'ar' ? 'إرجاع' : 'Retour'}</Button>
              <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => setShowCustomersDialog(true)}><Users className="h-4 w-4" />{language === 'ar' ? 'زبون' : 'Client'}</Button>
            </div>
            <POSShortcuts
              productShortcuts={productShortcuts} products={products}
              getShortcutProductName={getShortcutProductName} handleShortcutClick={handleShortcutClick}
              setEditingShortcutIndex={setEditingShortcutIndex} setShortcutColor={setShortcutColor}
              setShortcutProductId={setShortcutProductId} setShowShortcutDialog={setShowShortcutDialog}
              SHORTCUT_COLORS={SHORTCUT_COLORS} language={language} formatCurrency={formatCurrency}
              isRTL={isRTL} editing={editingShortcutsMode} onToggleEdit={() => setEditingShortcutsMode(!editingShortcutsMode)} onReorder={saveShortcuts}
            />
            <div className="flex flex-col gap-2 md:flex-1 md:min-h-0 md:overflow-y-auto" data-testid="pos-middle-scroll">
              <Button variant="outline" className="gap-2 border-blue-500 text-blue-600 hover:bg-blue-50 w-full justify-start" onClick={() => setShowSellCardDialog(true)}><CreditCard className="h-4 w-4" />{language === 'ar' ? 'بيع كرت تعبئة' : 'Vendre une carte'}</Button>
              <QuickFlexyPanel ref={flexyPanelRef} language={language} />
            </div>
          </div>

          <POSCart
            cart={cart.cart} customers={customers} selectedCustomer={selectedCustomer}
            setSelectedCustomer={setSelectedCustomer} customerDebt={customerDebt}
            selectedWarehouse={selectedWarehouse} setSelectedWarehouse={setSelectedWarehouse}
            warehouses={warehouses} priceType={priceType} setPriceType={setPriceType}
            setShowNewCustomerDialog={setShowNewCustomerDialog}
            updateCartItemQuantity={cart.updateItemQuantity} updateCartItemPrice={cart.updateItemPrice}
            updateCartItemDiscount={cart.updateItemDiscount} removeFromCart={cart.removeItem}
            clearCart={cart.clear} subtotal={cart.subtotal} total={total} discount={cart.discount}
            setDiscount={cart.setDiscount} loading={loading} hasOpenSession={session.hasOpenSession}
            completeSale={completeSale} language={language} formatCurrency={formatCurrency}
            t={t} isRTL={isRTL} paymentType={cart.paymentType} setPaymentType={cart.setPaymentType}
            paymentMethod={cart.paymentMethod} setPaymentMethod={cart.setPaymentMethod}
            paidAmount={cart.paidAmount} setPaidAmount={cart.setPaidAmount}
            installmentPlan={installmentPlan} onInstallmentClick={() => setShowInstallmentDialog(true)}
            discountMode={cart.discountMode} setDiscountMode={cart.setDiscountMode}
            updateCartItemNote={cart.updateItemNote} parkedCarts={cart.parkedCarts}
            parkCart={cart.parkCart} resumeParkedCart={cart.resumeParkedCart}
            deleteParkedCart={cart.deleteParkedCart} mixedCash={cart.mixedCash}
            setMixedCash={cart.setMixedCash} mixedBank={cart.mixedBank} setMixedBank={cart.setMixedBank}
          />
        </div>

        {/* Dialogs */}
        <POSDialogs
          showProductsDialog={showProductsDialog} setShowProductsDialog={setShowProductsDialog}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery} selectedFamily={selectedFamily}
          setSelectedFamily={setSelectedFamily} families={families} filteredProducts={filteredProducts}
          addToCart={cart.addItem} language={language} formatCurrency={formatCurrency} priceType={priceType}
          showCustomersDialog={showCustomersDialog} setShowCustomersDialog={setShowCustomersDialog}
          customers={customers} setSelectedCustomer={setSelectedCustomer}
          setShowNewCustomerDialog={setShowNewCustomerDialog} showNoteDialog={showNoteDialog}
          setShowNoteDialog={setShowNoteDialog} saleNote={cart.saleNote} setSaleNote={cart.setSaleNote}
          showCashDialog={showCashDialog} setShowCashDialog={setShowCashDialog}
          cashOperation={cashOperation} setCashOperation={setCashOperation}
          handleCashOperation={handleCashOperation} showHistoryDialog={showHistoryDialog}
          setShowHistoryDialog={setShowHistoryDialog} salesHistory={salesHistory}
          historyLoading={historyLoading} showShortcutDialog={showShortcutDialog}
          setShowShortcutDialog={setShowShortcutDialog} shortcutProductId={shortcutProductId}
          setShortcutProductId={setShortcutProductId} shortcutColor={shortcutColor}
          setShortcutColor={setShortcutColor} products={products} SHORTCUT_COLORS={SHORTCUT_COLORS}
          editingShortcutIndex={editingShortcutIndex} productShortcuts={productShortcuts}
          saveShortcuts={saveShortcuts} saveShortcut={saveShortcut}
          showNewCustomerDialog={showNewCustomerDialog} newCustomerData={newCustomerData}
          setNewCustomerData={setNewCustomerData} savingCustomer={savingCustomer}
          setSavingCustomer={setSavingCustomer} fetchCustomers={fetchCustomers}
          showPrintDialog={showPrintDialog} setShowPrintDialog={setShowPrintDialog}
          lastSaleId={lastSaleId} lastSaleInvoice={lastSaleInvoice}
          receiptSettings={receiptSettings} printThermalReceipt={printThermalReceipt}
          onPrintA4={() => setShowPrintDocDialog(true)} showSessionDialog={session.showSessionDialog}
          setShowSessionDialog={session.setShowSessionDialog} openingCash={session.openingCash}
          setOpeningCash={session.setOpeningCash} cashBoxBalance={session.cashBoxBalance}
          handleOpenSession={session.openSession} showCloseSessionDialog={session.showCloseSessionDialog}
          setShowCloseSessionDialog={session.setShowCloseSessionDialog}
          currentSession={session.currentSession} sessionStats={session.sessionStats}
          closingCash={session.closingCash} setClosingCash={session.setClosingCash}
          closingNotes={session.closingNotes} setClosingNotes={session.setClosingNotes}
          handleCloseSession={session.closeSession}
          showSessionDetailsDialog={session.showSessionDetailsDialog}
          setShowSessionDetailsDialog={session.setShowSessionDetailsDialog} t={t}
          showCustomProductDialog={showCustomProductDialog}
          setShowCustomProductDialog={setShowCustomProductDialog} customProduct={customProduct}
          setCustomProduct={setCustomProduct} addCustomProductToCart={() => { /* TODO: move to hook */ }}
          showPosReportsDialog={showPosReportsDialog} setShowPosReportsDialog={setShowPosReportsDialog}
          customerFamilyFilter={customerFamilyFilter} customerFamilies={customerFamilies}
        />

        {/* Installment Dialog */}
        <Dialog open={showInstallmentDialog} onOpenChange={setShowInstallmentDialog}>
          <DialogContent className="max-w-md" dir={isRTL ? 'rtl' : 'ltr'}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                {language === 'ar' ? 'إعداد خطة الأقساط' : 'Configurer le plan de versements'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{language === 'ar' ? 'الدفعة المقدمة (DA)' : 'Acompte (DA)'}</Label>
                  <Input type="number" min={0} max={total} value={installmentPlan.down_payment} onChange={e => setInstallmentPlan(p => ({ ...p, down_payment: parseFloat(e.target.value) || 0 }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">{language === 'ar' ? 'عدد الأقساط' : 'Nb de versements'}</Label>
                  <Input type="number" min={2} max={60} value={installmentPlan.installments_count} onChange={e => setInstallmentPlan(p => ({ ...p, installments_count: parseInt(e.target.value) || 3 }))} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{language === 'ar' ? 'نسبة الفائدة (%)' : 'Taux d\'intérêt (%)'}</Label>
                  <Input type="number" min={0} max={100} step={0.5} value={installmentPlan.interest_rate} onChange={e => setInstallmentPlan(p => ({ ...p, interest_rate: parseFloat(e.target.value) || 0 }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">{language === 'ar' ? 'التكرار' : 'Fréquence'}</Label>
                  <UiSelect value={installmentPlan.frequency} onValueChange={v => setInstallmentPlan(p => ({ ...p, frequency: v }))}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{language === 'ar' ? 'شهري' : 'Mensuel'}</SelectItem>
                      <SelectItem value="weekly">{language === 'ar' ? 'أسبوعي' : 'Hebdomadaire'}</SelectItem>
                    </SelectContent>
                  </UiSelect>
                </div>
              </div>
              <div>
                <Label className="text-xs">{language === 'ar' ? 'تاريخ أول قسط' : 'Date du 1er versement'}</Label>
                <Input type="date" value={installmentPlan.first_due_date} onChange={e => setInstallmentPlan(p => ({ ...p, first_due_date: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowInstallmentDialog(false); cart.setPaymentType('cash'); }}>{language === 'ar' ? 'إلغاء' : 'Annuler'}</Button>
              <Button onClick={() => setShowInstallmentDialog(false)} className="gap-2"><CalendarDays className="h-4 w-4" />{language === 'ar' ? 'تأكيد الخطة' : 'Confirmer'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PrintDocumentDialog open={showPrintDocDialog} onOpenChange={setShowPrintDocDialog} docType="sale" documentId={lastSaleId} />
        <SellPlatformCardDialog open={showSellCardDialog} onClose={() => setShowSellCardDialog(false)} />
      </div>
    </Layout>
  );
}
