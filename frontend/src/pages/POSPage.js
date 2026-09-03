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
  Tag, Printer, PackagePlus, History, CreditCard, PauseCircle, Undo2 as UndoIcon,
  UtensilsCrossed, ChefHat, Scissors,
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
import { useAuth } from '../contexts/AuthContext';
import { startRealtime, onEvent } from '../lib/realtime';  // p191
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
    setRedeemActive(false);  // p181
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
  // p165: weight-scale support
  const [scaleCfg, setScaleCfg] = useState(null);
  const [weightProduct, setWeightProduct] = useState(null);
  const [variantProduct, setVariantProduct] = useState(null);  // p184: variant picker
  const [modProduct, setModProduct] = useState(null);  // p308: modifier options picker
  const [modSel, setModSel] = useState({});  // p308: {groupName: [optionName, ...]}
  const [weightValue, setWeightValue] = useState('');
  useEffect(() => {
    apiClient.get('/pos/scale-config').then(r => setScaleCfg(r.data)).catch(() => {});
  }, []);
  const [showPrintDocDialog, setShowPrintDocDialog] = useState(false);
  // p186: restaurant mode (tables + kitchen orders)
  const { isAdmin: isAdminUser, isFeatureEnabled } = useAuth();
  const restaurantOn = isFeatureEnabled('restaurant');
  const [restTables, setRestTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showSplitDialog, setShowSplitDialog] = useState(false);  // p310
  const [splitParts, setSplitParts] = useState(2);
  const [splitMode, setSplitMode] = useState('equal');
  const [splitAssign, setSplitAssign] = useState({});
  const [splitting, setSplitting] = useState(false);
  const [showTableDialog, setShowTableDialog] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableSeats, setNewTableSeats] = useState('4');
  const [showCalculator, setShowCalculator] = useState(false);
  const flexyPanelRef = useRef(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [saleCode, setSaleCode] = useState('');
  const [receiptSettings, setReceiptSettings] = useState(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [lastSaleId, setLastSaleId] = useState(null);
  const [debtsMap, setDebtsMap] = useState({});  // p180: customer_id → total remaining debt
  const [loyaltySettings, setLoyaltySettings] = useState(null);  // p181
  const [redeemActive, setRedeemActive] = useState(false);       // p181: صرف النقاط كتخفيض
  const [inlineTask, setInlineTask] = useState(null);  // p177: مهام البيع تظهر داخل لوحة المهام بدل النوافذ المنبثقة
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
  const [serialProduct, setSerialProduct] = useState(null);  // p187

  // Cashier info
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const currentCashier = currentUser?.full_name || currentUser?.username || 'Cashier';

  // === Data Fetching ===
  useEffect(() => {
    session.checkOpenSession();
    fetchProducts();
    fetchCustomers();
    fetchFamilies();
    fetchDebtsMap();  // p180
    apiClient.get('/loyalty/settings').then(r => setLoyaltySettings(r.data)).catch(() => {});  // p181
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
  // p180: خريطة ديون الزبائن لشارات القائمة
  const fetchDebtsMap = async () => {
    try {
      const res = await apiClient.get('/debts');
      const map = {};
      (Array.isArray(res.data) ? res.data : []).forEach(d => {
        if (d.party_type === 'customer' && (d.remaining_amount || 0) > 0) {
          map[d.party_id] = (map[d.party_id] || 0) + d.remaining_amount;
        }
      });
      setDebtsMap(map);
    } catch (e) { console.error(e); }
  };

  // p180: تحديث منتج محلياً بعد تعديله من لوحة POS
  const handleProductUpdated = (updated) => {
    setProducts(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
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

  // === Search effect (p162: local instant filter + debounced full-DB server search) ===
  const searchSeqRef = useRef(0);
  useEffect(() => {
    if (searchQuery.length >= 1) {
      const query = searchQuery.toLowerCase();
      const filtered = products.filter(p =>
        p.name_ar?.toLowerCase().includes(query) ||
        p.name_en?.toLowerCase().includes(query) ||
        p.article_code?.toLowerCase().includes(query) ||
        p.barcode?.toLowerCase().includes(query) ||
        (Array.isArray(p.additional_barcodes) && p.additional_barcodes.some(b => b && b.toLowerCase().includes(query)))
      ).slice(0, 10);
      setSearchResults(filtered);
      setShowSearchResults(true);
      // Server-side search across ALL products (local list is capped at 1000)
      const seq = ++searchSeqRef.current;
      const timer = setTimeout(async () => {
        try {
          const res = await apiClient.get(`/products/quick-search?q=${encodeURIComponent(searchQuery)}&limit=50000`);  // p175: ALL matches, no cap
          if (seq === searchSeqRef.current && Array.isArray(res.data?.results)) {
            setSearchResults(res.data.results);
            setShowSearchResults(true);
          }
        } catch (e) { /* keep local results on error */ }
      }, 250);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  }, [searchQuery, products]);

  // p165: smart add — sold-by-weight products ask for the weight first
  // p173: FEFO hint — suggest selling from the nearest-expiry lot (once per product per session)
  const fefoToastedRef = useRef(new Set());
  const checkFefoLot = useCallback(async (product) => {
    try {
      if (!product?.id || fefoToastedRef.current.has(product.id)) return;
      const res = await apiClient.get(`/products/${product.id}/lots`);
      const lots = (Array.isArray(res.data) ? res.data : []).filter(l =>
        l.expiry_date && (l.quantity || 0) > 0 && l.remaining_days != null && l.remaining_days <= (l.alert_days || 30)
      );
      if (!lots.length) return;
      lots.sort((a, b) => a.remaining_days - b.remaining_days);
      const lot = lots[0];
      fefoToastedRef.current.add(product.id);
      const when = lot.remaining_days < 0
        ? (language === 'ar' ? `منتهية منذ ${-lot.remaining_days} يوم!` : `expiré depuis ${-lot.remaining_days} j!`)
        : (language === 'ar' ? `تنتهي خلال ${lot.remaining_days} يوم` : `expire dans ${lot.remaining_days} j`);
      toast.warning(
        language === 'ar'
          ? `FEFO: بِع من الدفعة «${lot.lot_number || '—'}» أولاً — ${when}`
          : `FEFO: vendre le lot «${lot.lot_number || '—'}» d'abord — ${when}`,
        { duration: 6000 }
      );
    } catch { /* silent — hint only */ }
  }, [language]);

  const addProductSmart = useCallback((product, opts = {}) => {
    if (!product) return;
    if (!product.name) product.name = product.name_ar || product.name_en;
    // p184: variant products open the picker first (unless a variant was already chosen)
    if (product.has_variants && (product.variants || []).length > 0 && !opts.variant) {
      setVariantProduct(product); return;
    }
    // p308: dishes with modifier groups open the options dialog first
    if (!opts.modifiers && !cart.returnMode && Array.isArray(product.modifier_groups) && product.modifier_groups.length > 0) {
      setModSel({}); setModProduct(product); return;
    }
    // p187: serial-tracked products ask for the IMEI/serial first (one unit per line)
    if (product.serial_number_tracking && !opts.serialNumber && !cart.returnMode) {
      setSerialProduct(product); setEntrySerial(''); return;
    }
    if (product.sold_by_weight && opts.overrideQty == null) {
      setWeightProduct(product); setWeightValue(''); return;
    }
    cart.addItem(product, opts);
    checkFefoLot(product);
  }, [cart, checkFefoLot]);

  // p361: اقتراحات «معها غالباً» — co-occurrence من سجل المبيعات
  const [suggestions, setSuggestions] = useState([]);
  useEffect(() => {
    const ids = [...new Set((cart.cart || []).map(i => i.product_id).filter(Boolean))];
    if (!ids.length) { setSuggestions([]); return; }
    const tmr = setTimeout(() => {
      apiClient.get('/sales/suggestions', { params: { product_ids: ids.join(','), limit: 6 } })
        .then(r => setSuggestions(r.data?.suggestions || []))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(tmr);
  }, [cart.cart]);

  const confirmWeight = () => {
    const w = parseFloat(weightValue);
    if (!w || w <= 0) { toast.error(language === 'ar' ? 'أدخل وزناً صحيحاً' : 'Poids invalide'); return; }
    cart.addItem(weightProduct, { overrideQty: w });
    toast.success(`${weightProduct?.name || ''} — ${w} ${language === 'ar' ? 'كغ' : 'kg'}`);
    setWeightProduct(null); setWeightValue('');
  };

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
        // p165: weight-embedded scale barcode — prefix + PLU + weight (grams) + check digit
        if (scaleCfg?.enabled && barcode.length === 13 && barcode.startsWith(scaleCfg.prefix || '21')) {
          const pluRaw = barcode.substr(2, scaleCfg.plu_digits || 5);
          const wRaw = barcode.substr(2 + (scaleCfg.plu_digits || 5), scaleCfg.weight_digits || 5);
          const weightKg = parseInt(wRaw, 10) / Math.pow(10, scaleCfg.weight_decimals ?? 3);
          const plu = String(parseInt(pluRaw, 10));
          const matchPlu = (x) => x.scale_plu && (x.scale_plu === pluRaw || String(parseInt(x.scale_plu, 10)) === plu);
          const addWeighted = (p) => {
            if (!p.name) p.name = p.name_ar || p.name_en;
            cart.addItem(p, { overrideQty: weightKg });
            toast.success(`${p.name} — ${weightKg} ${language === 'ar' ? 'كغ' : 'kg'}`);
          };
          const lp = products.find(matchPlu);
          if (lp) { addWeighted(lp); }
          else {
            (async () => {
              try {
                const res = await apiClient.get(`/products/quick-search?q=${encodeURIComponent(plu)}&limit=5`);
                const p2 = (res.data?.results || []).find(matchPlu);
                if (p2) addWeighted(p2);
                else toast.error(language === 'ar' ? `منتج الميزان غير موجود (PLU: ${plu})` : `PLU introuvable: ${plu}`);
              } catch (err) {
                toast.error(language === 'ar' ? `منتج الميزان غير موجود (PLU: ${plu})` : `PLU introuvable: ${plu}`);
              }
            })();
          }
          setBarcodeBuffer('');
          setSearchQuery('');
          return;
        }
        const product = products.find(p =>
          p.barcode === barcode ||
          (Array.isArray(p.additional_barcodes) && p.additional_barcodes.includes(barcode)) ||
          p.article_code === barcode
        );
        if (product) { addProductSmart(product); toast.success(`${product.name_ar || product.name_en || product.name}`); }
        else {
          // p162: server-side fallback — scanned code may belong to a product beyond the locally loaded list
          (async () => {
            try {
              const res = await apiClient.get(`/products/quick-search?q=${encodeURIComponent(barcode)}&limit=5`);
              const list = res.data?.results || [];
              const p2 = list.find(x =>
                x.barcode === barcode ||
                (Array.isArray(x.additional_barcodes) && x.additional_barcodes.includes(barcode)) ||
                (x.article_code || '').toLowerCase() === barcode.toLowerCase()
              ) || list[0];
              if (p2) { addProductSmart(p2); toast.success(`${p2.name_ar || p2.name_en}`); }
              else { toast.error(language === 'ar' ? `المنتج غير موجود: ${barcode}` : `Produit introuvable: ${barcode}`); }
            } catch (err) {
              toast.error(language === 'ar' ? `المنتج غير موجود: ${barcode}` : `Produit introuvable: ${barcode}`);
            }
          })();
        }
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
  }, [barcodeBuffer, products, language, cart, scaleCfg, addProductSmart]);

  // === p186: Restaurant mode ===
  const fetchTables = useCallback(async () => {
    if (!restaurantOn) return;
    try { const r = await apiClient.get('/restaurant/tables'); setRestTables(r.data || []); } catch (e) { /* silent */ }
  }, [restaurantOn]);

  useEffect(() => { if (restaurantOn) fetchTables(); }, [restaurantOn, fetchTables]);

  // p191: realtime — another till's sale/return/delete refreshes stock instantly
  useEffect(() => {
    startRealtime();
    const un1 = onEvent('sale.completed', () => fetchProducts());
    const un2 = onEvent('sale.refunded', () => fetchProducts());
    const un3 = onEvent('sale.deleted', () => fetchProducts());
    return () => { un1(); un2(); un3(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createTable = async () => {
    if (!newTableName.trim()) return;
    try {
      await apiClient.post('/restaurant/tables', { name: newTableName.trim(), seats: parseInt(newTableSeats) || 4 });
      setNewTableName('');
      fetchTables();
      toast.success(language === 'ar' ? 'أُضيفت الطاولة' : 'Table ajoutee');
    } catch (e) { toast.error(errText(e)); }
  };

  const printKitchenTicket = (order) => {
    try {
      const w = window.open('', '_blank', 'width=320,height=500');
      if (!w) return;
      const rows = (order.items || []).map(it =>
        '<tr><td style="padding:4px;font-weight:bold;vertical-align:top">' + it.quantity + 'x</td><td style="padding:4px">' +
        it.product_name +
        (it.variant ? ' (' + [it.variant.color, it.variant.size].filter(Boolean).join('/') + ')' : '') +
        (it.note ? '<br/><small>-- ' + it.note + '</small>' : '') + '</td></tr>'
      ).join('');
      w.document.write(
        '<html dir="rtl"><head><meta charset="utf-8"><title>' + order.code + '</title></head>' +
        '<body style="font-family:monospace;font-size:14px">' +
        '<h2 style="text-align:center;margin:4px">' + (language === 'ar' ? 'طلب مطبخ' : 'Ticket cuisine') + '</h2>' +
        '<div style="text-align:center">' + order.code + ' — ' + new Date().toLocaleTimeString() + '</div>' +
        '<div style="text-align:center;font-size:20px;font-weight:bold">' + (order.table_name || (language === 'ar' ? 'سفري' : 'A emporter')) + '</div>' +
        '<hr/><table style="width:100%">' + rows + '</table>' +
        (order.notes ? '<hr/><div>' + order.notes + '</div>' : '') +
        '<scr' + 'ipt>window.print();setTimeout(function(){window.close();},400);</scr' + 'ipt></body></html>'
      );
      w.document.close();
    } catch (e) { /* silent */ }
  };

  const sendToKitchen = async () => {
    if (cart.cart.length === 0) { toast.error(language === 'ar' ? 'السلة فارغة' : 'Panier vide'); return; }
    try {
      const payload = {
        table_id: selectedTable ? selectedTable.id : null,
        items: cart.cart.map(i => ({ product_id: i.is_custom ? null : i.product_id, unit_price: i.unit_price, modifiers: (i.modifiers || []).length ? i.modifiers : null, product_name: i.product_name, quantity: i.quantity, note: [i.note, (i.modifiers || []).map(m => m.option).join(' + ')].filter(Boolean).join(' — ') || null, variant: i.variant || null })),  // p308: modifiers ride the kitchen note; p311: ids+prices for order→cart reload
      };
      const r = await apiClient.post('/restaurant/kitchen-orders', payload);
      toast.success(language === 'ar' ? 'أُرسل الطلب للمطبخ ' + r.data.code : 'Envoye en cuisine ' + r.data.code);
      printKitchenTicket(r.data);
      fetchTables();
    } catch (e) { toast.error(errText(e)); }
  };

  // p311: تحميل طلب طاولة نشط (QR أو مطبخ) إلى السلة للدفع — الأسعار من لقطة الطلب
  const loadTableOrder = async (t) => {
    if (!t?.active_order_id) { toast.error(language === 'ar' ? 'لا طلب نشط على هذه الطاولة' : 'Aucune commande'); return; }
    try {
      const r = await apiClient.get('/restaurant/kitchen-orders');
      const ord = (r.data || []).find(o => o.id === t.active_order_id);
      if (!ord || !(ord.items || []).length) { toast.error(language === 'ar' ? 'الطلب فارغ' : 'Commande vide'); return; }
      let loaded = 0;
      for (const it of ord.items) {
        if (!it.product_id) continue;
        const prod = products.find(p => p.id === it.product_id);
        if (!prod) continue;
        const mods = (it.modifiers || []).map(m => ({ group: m.group, option: m.option, price_delta: Number(m.price_delta) || 0, product_id: m.product_id || null, qty: m.qty || 1 }));
        const delta = mods.reduce((a, m) => a + m.price_delta, 0);
        cart.addItem(prod, {
          overrideQty: it.quantity,
          overridePrice: it.unit_price != null ? Math.round((it.unit_price - delta) * 100) / 100 : undefined,
          modifiers: mods.length ? mods : undefined,
        });
        loaded++;
      }
      if (!loaded) { toast.error(language === 'ar' ? 'لا أسطر قابلة للتحميل' : 'Aucune ligne'); return; }
      setSelectedTable(t);
      setShowTableDialog(false);
      toast.success((language === 'ar' ? 'حُمّل طلب ' : 'Commande chargee ') + (ord.code || '') + ' — ' + loaded + (language === 'ar' ? ' سطرًا' : ' lignes'));
    } catch (e) { toast.error(errText(e)); }
  };

  // p310: تقسيم الفاتورة — N فواتير منفصلة (متساوية بالكميات الكسرية أو حسب توزيع الأسطر)
  // كل حصة = عملية بيع مستقلة مدفوعة نقدًا بالكامل؛ المخزون يُستهلك مرة واحدة بالمجموع
  const doSplit = async () => {
    if (!session.hasOpenSession) { toast.error(language === 'ar' ? 'يجب فتح حصة' : 'Ouvrez une session'); return; }
    const lines = cart.cart;
    if (lines.length === 0) { toast.error(language === 'ar' ? 'السلة فارغة' : 'Panier vide'); return; }
    const N = splitParts;
    const parts = Array.from({ length: N }, () => []);
    if (splitMode === 'lines') {
      lines.forEach((ln, i) => { parts[(splitAssign[i] || 1) - 1].push({ ...ln }); });
      if (parts.some(pp => pp.length === 0)) { toast.error(language === 'ar' ? 'كل حصة يجب أن تحوي سطرًا واحدًا على الأقل' : 'Chaque part doit avoir une ligne'); return; }
    } else {
      lines.forEach(ln => {
        const per = Math.floor((ln.quantity / N) * 1000) / 1000;
        for (let k = 0; k < N; k++) {
          const q = k === N - 1 ? Math.round((ln.quantity - per * (N - 1)) * 1000) / 1000 : per;
          if (q !== 0) parts[k].push({ ...ln, quantity: q, total: Math.round(q * ln.unit_price * 100) / 100 });
        }
      });
    }
    setSplitting(true);
    try {
      const totalDiscount = (cart.discount || 0) + redeemAmount;
      const grandSub = cart.subtotal || 1;
      let firstSaleId = null;
      let done = 0;
      for (let k = 0; k < N; k++) {
        const sub = Math.round(parts[k].reduce((s2, ln) => s2 + ln.total, 0) * 100) / 100;
        if (sub <= 0) continue;
        const disc = Math.round(totalDiscount * (sub / grandSub) * 100) / 100;
        // p310b: each part needs its OWN invoice code (saleCode is single-use)
        let partCode = saleCode;
        if (k > 0) {
          try { partCode = (await apiClient.get('/sales/generate-code')).data.code; }
          catch (e2) { partCode = saleCode + '-S' + (k + 1) + '-' + (Date.now() % 10000); }
        }
        const payload = {
          code: partCode,
          customer_id: selectedCustomer,
          warehouse_id: selectedWarehouse || null,
          items: parts[k].map(item => ({
            product_id: item.is_custom ? null : item.product_id,
            product_name: item.product_name,
            barcode: item.barcode || '',
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount: 0,
            total: item.total,
            note: ((language === 'ar' ? 'حصة ' : 'Part ') + (k + 1) + '/' + N + (item.note ? ' — ' + item.note : '')),
            variant: item.variant || null,
            modifiers: item.modifiers || null,
            serial_number: item.serial_number || null,
          })),
          subtotal: sub,
          discount: disc,
          total: Math.round((sub - disc) * 100) / 100,
          paid_amount: Math.round((sub - disc) * 100) / 100,
          payment_method: 'cash',
          payment_type: 'cash',
          notes: (language === 'ar' ? 'فاتورة مقسّمة — حصة ' : 'Partage — part ') + (k + 1) + '/' + N + (cart.saleNote ? ' — ' + cart.saleNote : ''),
        };
        const r = await apiClient.post('/sales', payload);
        if (!firstSaleId) firstSaleId = r.data.id;
        done++;
      }
      if (restaurantOn && selectedTable) {
        apiClient.post('/restaurant/tables/' + selectedTable.id + '/checkout', { sale_id: firstSaleId }).catch(() => {});
        setSelectedTable(null);
      }
      toast.success((language === 'ar' ? 'تم التقسيم إلى ' : 'Divise en ') + done + (language === 'ar' ? ' فواتير' : ' factures'));
      setShowSplitDialog(false);
      cart.clear();
    } catch (e) { toast.error(errText(e)); }
    finally { setSplitting(false); }
  };

  // === Filtered Products ===
  const filteredProducts = products.filter(p => {
    const matchesSearch = !searchQuery ||
      p.name_ar?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name_en?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (Array.isArray(p.additional_barcodes) && p.additional_barcodes.some(b => b && b.toLowerCase().includes(searchQuery.toLowerCase()))) ||
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
    // p181: في وضع الإرجاع يجب أن يكون الإجمالي سالباً — منع فاتورة موجبة خطأً
    if (cart.returnMode && (cart.subtotal - cart.discount) >= 0) {
      toast.error(language === 'ar' ? 'وضع الإرجاع مفعّل: لا يمكن إتمام فاتورة موجبة — أضف منتجات بالسالب أو ألغِ وضع الإرجاع' : 'Mode retour actif: total doit etre negatif');
      return;
    }
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
        : PaymentDetails.cash(Number(cart.paidAmount) || (cart.subtotal - cart.discount - redeemAmount));  // p181

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
          variant: item.variant || null,  // p184
          modifiers: item.modifiers || null,  // p308
          serial_number: item.serial_number || null,  // p187
        })),
        subtotal: cart.subtotal,
        discount: cart.discount + redeemAmount,  // p181: خصم النقاط مدمج
        total: cart.subtotal - cart.discount - redeemAmount,
        loyalty_redeem: pointsUsed > 0 ? { points: pointsUsed, amount: redeemAmount } : null,  // p181
        ...payment.toJSON(),
        notes: cart.saleNote,
        delivery: delivery.toApiPayload(language),
      };

      const response = await apiClient.post('/sales', saleData);
      toast.success(language === 'ar' ? 'تم البيع بنجاح' : 'Vente effectuee');
      setLastSaleId(response.data.id);
      setLastSaleInvoice(response.data.invoice_number);
      // p356: كسب الولاء التلقائي — الخادم منح النقاط مع البيع
      if (response.data.loyalty_earned > 0 && selectedCustomer) {
        const _earnedPts = response.data.loyalty_earned;
        setCustomers(prev => prev.map(c => c.id === selectedCustomer ? { ...c, loyalty_points: (c.loyalty_points || 0) + _earnedPts } : c));
        toast.success(language === 'ar' ? `كسب الزبون ${_earnedPts} نقطة ولاء` : `+${_earnedPts} pts fidelite`);
      }
      // p186: restaurant checkout — link sale + free the table
      if (restaurantOn && selectedTable) {
        apiClient.post('/restaurant/tables/' + selectedTable.id + '/checkout', { sale_id: response.data.id }).catch(() => {});
        setSelectedTable(null);
      }

      if (receiptSettings?.auto_print) {
        printThermalReceipt(response.data.id, receiptSettings?.thermal_printer_size || '80mm');
      } else if (receiptSettings?.show_print_dialog !== false) {
        setShowPrintDialog(true);
      }

      // p181: خصم النقاط المستعملة من رصيد الزبون
      if (pointsUsed > 0 && selectedCustomer) {
        apiClient.post('/loyalty/redeem', {
          customer_id: selectedCustomer, points: pointsUsed, sale_id: response.data.id,
          notes: `خصم ${redeemAmount} دج من فاتورة POS`,
        }).then(() => {
          setCustomers(prev => prev.map(c => c.id === selectedCustomer ? { ...c, loyalty_points: (c.loyalty_points || 0) - pointsUsed } : c));
          toast.success(language === 'ar' ? `صُرفت ${pointsUsed} نقطة ولاء (−${redeemAmount} دج)` : `${pointsUsed} pts utilises`);
        }).catch(() => {});
        setRedeemActive(false);
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
      // p180: سحب = من الصندوق إلى «المال الخاص» — إيداع = العكس (المسارات القديمة كانت 404)
      await apiClient.post('/cash-boxes/transfer', cashOperation.type === 'deposit'
        ? { from_box: 'personal', to_box: 'cash', amount: cashOperation.amount }
        : { from_box: 'cash', to_box: 'personal', amount: cashOperation.amount });
      toast.success(language === 'ar'
        ? (cashOperation.type === 'deposit' ? 'أُودع من مالك الخاص إلى الصندوق' : 'سُحب من الصندوق إلى مالك الخاص')
        : 'Operation effectuee');
      setShowCashDialog(false);
      setCashOperation({ type: 'deposit', amount: 0, note: '' });
    } catch (error) { toast.error(errText(error) ||  'Error'); }
  };

  // === Task Menu (Refactored: Replace Switch with lookup) ===
  const taskHandlers = {
    'articles': () => setInlineTask('articles'),  // p177: inline
    'families': () => setInlineTask('families'),  // p177: inline
    'customers': () => { setCustomerFamilyFilter(null); setInlineTask('customers'); },  // p177: inline
    'customer-families': () => { setCustomerFamilyFilter('_all_families'); setInlineTask('customer-families'); },  // p177: inline
    'custom-product': () => { setCustomProduct({ name: '', price: '', qty: 1 }); setShowCustomProductDialog(true); },
    'price-type': () => setPriceType(prev => nextTier(prev)),
    'note': () => setShowNoteDialog(true),
    'return': () => cart.toggleReturnMode(),
    'park': () => cart.parkCart(selectedCustomer),  // p180: الزبون في الانتظار
    'deposit': () => { setCashOperation({ type: 'deposit', amount: 0, note: '' }); setShowCashDialog(true); },
    'withdraw': () => { setCashOperation({ type: 'withdraw', amount: 0, note: '' }); setShowCashDialog(true); },
    'print-last': () => lastSaleId ? setInlineTask('lastreceipt') : toast.info(language === 'ar' ? 'لا يوجد' : 'Aucune'),  // p180: يعرض آخر وصل داخل اللوحة مع زر طباعة
    'reports': () => setInlineTask('reports'),  // p177: inline
    'history': () => setInlineTask('history'),  // p179: R.Lynx periods — sidebar fetches per period
    'table': () => { fetchTables(); setShowTableDialog(true); },  // p186
    'kitchen': () => sendToKitchen(),  // p186
    'split': () => { setSplitAssign({}); setSplitParts(2); setSplitMode('equal'); setShowSplitDialog(true); },  // p310
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
    { id: 'park', icon: PauseCircle, label: language === 'ar' ? 'وضع في الانتظار' : 'Mettre en attente', shortcut: '' },
    { id: 'print-last', icon: Printer, label: language === 'ar' ? 'طباعة آخر فاتورة' : 'Impr. dernière', shortcut: 'P' },
    ...(restaurantOn ? [  // p186
      { id: 'table', icon: UtensilsCrossed, label: (language === 'ar' ? 'طاولة' : 'Table') + (selectedTable ? ': ' + selectedTable.name : ''), shortcut: '', highlight: !!selectedTable },
      { id: 'kitchen', icon: ChefHat, label: language === 'ar' ? 'إرسال للمطبخ' : 'Cuisine', shortcut: '' },
      { id: 'split', icon: Scissors, label: language === 'ar' ? 'تقسيم الفاتورة' : 'Diviser', shortcut: '' },  // p310
    ] : []),
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
    if (shortcut.productId) { const product = products.find(p => p.id === shortcut.productId); if (product) addProductSmart(product); }
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
  // p181: صرف نقاط الولاء كتخفيض
  const custPoints = customers.find(c => c.id === selectedCustomer)?.loyalty_points || 0;
  const pointsValue = loyaltySettings?.points_value || 0.1;
  const minRedeem = loyaltySettings?.min_redeem_points || 100;
  const canRedeem = !!(loyaltySettings?.enabled && selectedCustomer && custPoints >= minRedeem && total > 0 && !cart.returnMode);
  const redeemAmount = (redeemActive && canRedeem) ? Math.min(custPoints * pointsValue, total) : 0;
  const pointsUsed = redeemAmount > 0 ? Math.min(custPoints, Math.round(redeemAmount / pointsValue)) : 0;
  const totalWithRedeem = total - redeemAmount;

  return (
    <Layout>
      <div className="h-[calc(100vh-120px)] flex flex-col" data-testid="pos-page">
        {/* p180: شريط أحمر عريض أثناء وضع الإرجاع */}
        {cart.returnMode && (
          <div className="bg-red-600 text-white text-center text-sm font-bold py-1.5 px-3 rounded-md mb-1 flex items-center justify-center gap-3 shrink-0" data-testid="return-mode-banner">
            <UndoIcon className="h-4 w-4" />
            <span>{language === 'ar' ? 'وضع الإرجاع مفعّل — المنتجات تُضاف بالسالب (−1)' : 'Mode retour actif — articles ajoutés en négatif (−1)'}</span>
            <button onClick={() => cart.toggleReturnMode()} className="bg-white/20 hover:bg-white/30 rounded px-2 py-0.5 text-xs" data-testid="return-mode-exit-btn">
              {language === 'ar' ? 'خروج' : 'Quitter'}
            </button>
          </div>
        )}
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
          <div className="flex-1 min-w-[260px]">
            <POSSessionBar {...session} language={language} formatCurrency={formatCurrency} t={t} isRTL={isRTL} compact />
          </div>
          <div className="bg-primary text-primary-foreground text-base sm:text-xl font-bold px-3 py-1.5 rounded-lg shadow whitespace-nowrap">
            {formatCurrency(total)} {t.currency}
          </div>
        </div>

        {/* Main Grid */}
        <div className={`flex-1 grid grid-cols-1 md:grid-cols-12 md:grid-rows-[minmax(0,1fr)] gap-2 min-h-0 ${isRTL ? 'direction-ltr' : ''}`} style={{ direction: 'ltr' }}>  {/* p177: صف ثابت — الصفحة لا تتمدد مهما كثرت النتائج */}
          <POSSidebar
            searchInputRef={searchInputRef} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            showSearchResults={showSearchResults} setShowSearchResults={setShowSearchResults}
            searchResults={searchResults} products={products} addToCart={addProductSmart}
            setShowProductsDialog={setShowProductsDialog} taskMenuItems={taskMenuItems}
            activeTask={activeTask} handleTaskClick={handleTaskClick} returnMode={cart.returnMode}
            language={language} formatCurrency={formatCurrency} isRTL={isRTL}
            inlineTask={inlineTask} setInlineTask={setInlineTask}
            families={families} customers={customers} customerFamilies={customerFamilies}
            selectedCustomer={selectedCustomer} setSelectedCustomer={setSelectedCustomer}
            salesHistory={salesHistory} historyLoading={historyLoading}
            currentSession={session.currentSession} sessionStats={session.sessionStats}
            printThermalReceipt={printThermalReceipt} thermalSize={receiptSettings?.thermal_printer_size || '80mm'}
            lastSaleId={lastSaleId} debtsMap={debtsMap} onProductUpdated={handleProductUpdated}
          />

          {/* p164: middle column — flexy/sell-card above the cart (layout per user sketch) */}
          <div className="col-span-1 md:col-span-7 flex flex-col gap-2 min-h-0" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>  {/* p178: was 6 — كسب مساحة الاختصارات */}
            <div className="md:hidden flex items-center gap-2 mb-1 overflow-x-auto pb-1">
              <Button size="sm" variant="outline" className="gap-1 shrink-0 min-h-[44px]" onClick={() => setShowProductsDialog(true)}><Plus className="h-4 w-4" />{language === 'ar' ? 'منتج' : 'Produit'}</Button>
              <Button size="sm" variant={cart.returnMode ? "destructive" : "outline"} className="gap-1 shrink-0 min-h-[44px]" onClick={() => handleTaskClick('return')}><Undo2 className="h-4 w-4" />{language === 'ar' ? 'إرجاع' : 'Retour'}</Button>
              <Button size="sm" variant="outline" className="gap-1 shrink-0 min-h-[44px]" onClick={() => setShowCustomersDialog(true)}><Users className="h-4 w-4" />{language === 'ar' ? 'زبون' : 'Client'}</Button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col" data-testid="pos-cart-wrap">
            <POSCart
              onAddProduct={() => setShowProductsDialog(true)}
            cart={cart.cart} customers={customers} selectedCustomer={selectedCustomer}
            setSelectedCustomer={setSelectedCustomer} customerDebt={customerDebt}
            selectedWarehouse={selectedWarehouse} setSelectedWarehouse={setSelectedWarehouse}
            warehouses={warehouses} priceType={priceType} setPriceType={setPriceType}
            setShowNewCustomerDialog={setShowNewCustomerDialog}
            updateCartItemQuantity={cart.updateItemQuantity} updateCartItemPrice={cart.updateItemPrice}
            updateCartItemDiscount={cart.updateItemDiscount} removeFromCart={cart.removeItem}
            clearCart={cart.clear} subtotal={cart.subtotal} total={totalWithRedeem} discount={cart.discount}
            setDiscount={cart.setDiscount} loading={loading} hasOpenSession={session.hasOpenSession}
            completeSale={completeSale} language={language} formatCurrency={formatCurrency}
            loyalty={{ enabled: !!loyaltySettings?.enabled, points: custPoints, pointsUsed, redeemAmount, redeemActive, canRedeem, onToggle: () => setRedeemActive(v => !v) }}
            t={t} isRTL={isRTL} paymentType={cart.paymentType} setPaymentType={cart.setPaymentType}
            paymentMethod={cart.paymentMethod} setPaymentMethod={cart.setPaymentMethod}
            paidAmount={cart.paidAmount} setPaidAmount={cart.setPaidAmount}
            installmentPlan={installmentPlan} onInstallmentClick={() => setShowInstallmentDialog(true)}
            discountMode={cart.discountMode} setDiscountMode={cart.setDiscountMode}
            updateCartItemNote={cart.updateItemNote} parkedCarts={cart.parkedCarts}
            parkCart={cart.parkCart} resumeParkedCart={cart.resumeParkedCart}
            deleteParkedCart={cart.deleteParkedCart} mixedCash={cart.mixedCash}
            setMixedCash={cart.setMixedCash} mixedBank={cart.mixedBank} setMixedBank={cart.setMixedBank}
            >
              {/* p164b: sell card + flexy inside the cart column, between header and items table */}
              <div className="p-2 border-b flex items-stretch gap-1.5" data-testid="pos-flexy-strip">
                <Button variant="outline" data-testid="pos-sell-card-btn" className="h-auto px-2 shrink-0 flex flex-col items-center justify-center gap-0.5 border-blue-500 text-blue-600 hover:bg-blue-50 text-[10px] leading-tight" onClick={() => setShowSellCardDialog(true)}><CreditCard className="h-4 w-4" /><span>{language === 'ar' ? 'بيع كرت تعبئة' : 'Carte'}</span></Button>
                <div className="flex-1 min-w-0">
                  <QuickFlexyPanel ref={flexyPanelRef} language={language} compact />
                </div>
              </div>
            </POSCart>
            {suggestions.length > 0 && !cart.returnMode && (
              <div className="border-t p-1.5 flex items-center gap-1.5 overflow-x-auto" data-testid="pos-suggestions">
                <span className="text-[10px] text-muted-foreground shrink-0 font-semibold">{language === 'ar' ? 'معها غالباً:' : 'Souvent avec:'}</span>
                {suggestions.map(s => {
                  const prod = products.find(p => p.id === s.product_id);
                  if (!prod) return null;
                  return (
                    <Button key={s.product_id} size="sm" variant="outline"
                      className="h-8 shrink-0 gap-1 text-xs border-amber-400 text-amber-700 hover:bg-amber-50"
                      onClick={() => { addProductSmart(prod); setSuggestions(prev => prev.filter(x => x.product_id !== s.product_id)); }}
                      data-testid="pos-suggest-chip">
                      <Plus className="h-3 w-3" />{s.name}
                      <span className="text-[10px] opacity-70">{formatCurrency(s.price)}</span>
                    </Button>
                  );
                })}
              </div>
            )}
            </div>
          </div>

          {/* p164: shortcuts column — to the right of the cart */}
          <div className="col-span-1 md:col-span-2 flex flex-col gap-2 min-h-0 overflow-y-auto" style={{ direction: isRTL ? 'rtl' : 'ltr' }} data-testid="pos-shortcuts-col">  {/* p178: عمود أضيق */}
            <POSShortcuts
              productShortcuts={productShortcuts} products={products}
              getShortcutProductName={getShortcutProductName} handleShortcutClick={handleShortcutClick}
              setEditingShortcutIndex={setEditingShortcutIndex} setShortcutColor={setShortcutColor}
              setShortcutProductId={setShortcutProductId} setShowShortcutDialog={setShowShortcutDialog}
              SHORTCUT_COLORS={SHORTCUT_COLORS} language={language} formatCurrency={formatCurrency}
              isRTL={isRTL} editing={editingShortcutsMode} onToggleEdit={() => setEditingShortcutsMode(!editingShortcutsMode)} onReorder={saveShortcuts}
            />
          </div>
        </div>

        {/* Dialogs */}
        <POSDialogs
          showProductsDialog={showProductsDialog} setShowProductsDialog={setShowProductsDialog}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery} selectedFamily={selectedFamily}
          setSelectedFamily={setSelectedFamily} families={families} filteredProducts={filteredProducts}
          addToCart={addProductSmart} language={language} formatCurrency={formatCurrency} priceType={priceType}
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

        {/* p165: manual weight entry for sold-by-weight products */}
        <Dialog open={!!weightProduct} onOpenChange={(o) => { if (!o) setWeightProduct(null); }}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>{language === 'ar' ? 'إدخال الوزن' : 'Saisir le poids'}</DialogTitle>
            </DialogHeader>
            <p className="text-sm font-semibold">{weightProduct?.name || weightProduct?.name_ar}</p>
            <Input type="number" step="0.001" min="0" value={weightValue} onChange={(e) => setWeightValue(e.target.value)}
              placeholder={language === 'ar' ? 'الوزن بالكيلوغرام (مثال: 0.750)' : 'Poids en kg'}
              autoFocus dir="ltr" className="text-center text-lg"
              onKeyDown={(e) => { if (e.key === 'Enter') confirmWeight(); }}
              data-testid="weight-input" />
            <Button onClick={confirmWeight} className="w-full" data-testid="weight-confirm-btn">{language === 'ar' ? 'إضافة للسلة' : 'Ajouter'}</Button>
          </DialogContent>
        </Dialog>

        {/* p187: serial/IMEI entry */}
        <Dialog open={!!serialProduct} onOpenChange={(o) => { if (!o) setSerialProduct(null); }}>
          <DialogContent className="max-w-xs" data-testid="serial-dialog">
            <DialogHeader>
              <DialogTitle>{language === 'ar' ? 'الرقم التسلسلي / IMEI' : 'N° de serie / IMEI'}</DialogTitle>
            </DialogHeader>
            <p className="text-sm font-semibold">{serialProduct?.name || serialProduct?.name_ar}</p>
            <Input value={entrySerial} onChange={(e) => setEntrySerial(e.target.value)}
              placeholder={language === 'ar' ? 'امسح أو أدخل الرقم التسلسلي' : 'Scanner ou saisir le n° de serie'}
              autoFocus dir="ltr" className="text-center font-mono"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && entrySerial.trim()) {
                  addProductSmart(serialProduct, { serialNumber: entrySerial.trim() });
                  setSerialProduct(null);
                }
              }}
              data-testid="serial-input" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setSerialProduct(null)}>{language === 'ar' ? 'إلغاء' : 'Annuler'}</Button>
              <Button className="flex-1" disabled={!entrySerial.trim()}
                onClick={() => { addProductSmart(serialProduct, { serialNumber: entrySerial.trim() }); setSerialProduct(null); }}
                data-testid="serial-confirm-btn">{language === 'ar' ? 'إضافة للسلة' : 'Ajouter'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* p186: restaurant table picker */}
        <Dialog open={showTableDialog} onOpenChange={setShowTableDialog}>
          <DialogContent className="max-w-md" data-testid="table-picker-dialog">
            <DialogHeader>
              <DialogTitle>{language === 'ar' ? 'اختيار الطاولة' : 'Choisir une table'}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
              <Button variant={!selectedTable ? 'default' : 'outline'} className="h-auto flex-col py-3" data-testid="table-option-none"
                onClick={() => { setSelectedTable(null); setShowTableDialog(false); }}>
                <span className="font-bold">{language === 'ar' ? 'بدون طاولة' : 'Sans table'}</span>
              </Button>
              {restTables.map((t, i) => (
                <div key={t.id} className="flex flex-col gap-1">
                  <Button variant={selectedTable && selectedTable.id === t.id ? 'default' : 'outline'} className="h-auto flex-col py-2"
                    data-testid={'table-option-' + i}
                    onClick={() => { setSelectedTable(t); setShowTableDialog(false); }}>
                    <span className="font-bold text-sm">{t.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.seats} {language === 'ar' ? 'مقاعد' : 'places'}{t.status === 'occupied' ? ' • ' + (language === 'ar' ? 'مشغولة' : 'occupee') : ''}
                    </span>
                  </Button>
                  {t.status === 'occupied' && t.active_order_id && (
                    <Button size="sm" variant="secondary" className="text-xs min-h-[36px]"
                      data-testid={'table-load-' + i}
                      onClick={() => loadTableOrder(t)}>
                      {language === 'ar' ? 'تحميل الطلب للسلة' : 'Charger la commande'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {isAdminUser && (
              <div className="flex gap-2 items-center border-t pt-2">
                <Input value={newTableName} onChange={(e) => setNewTableName(e.target.value)}
                  placeholder={language === 'ar' ? 'اسم طاولة جديدة' : 'Nouvelle table'} data-testid="table-name-input" />
                <Input type="number" min="1" value={newTableSeats} onChange={(e) => setNewTableSeats(e.target.value)} className="w-20" dir="ltr" />
                <Button onClick={createTable} data-testid="table-create-btn">{language === 'ar' ? 'إضافة' : 'Ajouter'}</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* p184: variant picker (color/size) */}
        <Dialog open={!!variantProduct} onOpenChange={(o) => { if (!o) setVariantProduct(null); }}>
          <DialogContent className="max-w-sm" data-testid="variant-picker-dialog">
            <DialogHeader>
              <DialogTitle>{variantProduct?.name || variantProduct?.name_ar}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{language === 'ar' ? 'اختر المتغير (اللون / المقاس)' : 'Choisir la variante (couleur / taille)'}</p>
            <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
              {(variantProduct?.variants || []).map((v, i) => (
                <Button key={i} variant="outline" className="h-auto flex-col gap-1 py-3"
                  disabled={!(v.quantity > 0) && !cart.returnMode}
                  data-testid={`variant-option-${i}`}
                  onClick={() => { cart.addItem(variantProduct, { variant: v }); setVariantProduct(null); }}>
                  <span className="font-bold text-sm">{[v.color, v.size].filter(Boolean).join(' / ') || '—'}</span>
                  <span className="text-xs text-muted-foreground">{language === 'ar' ? 'المخزون' : 'Stock'}: {v.quantity}</span>
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* p310: split bill dialog */}
        <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
          <DialogContent className="max-w-md" data-testid="split-dialog">
            <DialogHeader><DialogTitle>{language === 'ar' ? 'تقسيم الفاتورة' : 'Diviser la facture'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-2 items-center flex-wrap">
                <Label>{language === 'ar' ? 'عدد الحصص' : 'Parts'}</Label>
                <div className="flex gap-1">
                  {[2, 3, 4, 5, 6].map(n => (
                    <Button key={n} size="sm" variant={splitParts === n ? 'default' : 'outline'} onClick={() => setSplitParts(n)} data-testid={`split-parts-${n}`}>{n}</Button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={splitMode === 'equal' ? 'default' : 'outline'} onClick={() => setSplitMode('equal')} data-testid="split-mode-equal">{language === 'ar' ? 'تقسيم متساوٍ' : 'Parts egales'}</Button>
                <Button size="sm" variant={splitMode === 'lines' ? 'default' : 'outline'} onClick={() => setSplitMode('lines')} data-testid="split-mode-lines">{language === 'ar' ? 'حسب الأسطر' : 'Par lignes'}</Button>
              </div>
              {splitMode === 'lines' && (
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-2">
                  {cart.cart.map((ln, i) => (
                    <div key={ln.cart_item_id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">{ln.product_name} ×{ln.quantity}</span>
                      <div className="flex gap-1">
                        {Array.from({ length: splitParts }, (_, k) => k + 1).map(pn => (
                          <Button key={pn} size="sm" variant={(splitAssign[i] || 1) === pn ? 'default' : 'outline'} className="h-7 w-7 p-0"
                            data-testid={`split-line-${i}-payer-${pn}`}
                            onClick={() => setSplitAssign(prev => ({ ...prev, [i]: pn }))}>{pn}</Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button className="w-full min-h-[44px]" onClick={doSplit} disabled={splitting} data-testid="split-confirm-btn">
                {language === 'ar' ? 'تنفيذ التقسيم' : 'Executer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* p308: modifier options picker (إضافات/بدائل الطبق) */}
        <Dialog open={!!modProduct} onOpenChange={(o) => { if (!o) setModProduct(null); }}>
          <DialogContent className="max-w-md" data-testid="modifier-dialog">
            <DialogHeader>
              <DialogTitle>{modProduct?.name || modProduct?.name_ar}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {(modProduct?.modifier_groups || []).map((g, gi) => (
                <div key={gi}>
                  <p className="text-sm font-semibold mb-2">
                    {g.name} {g.required ? <span className="text-destructive">*</span> : null}
                    {(g.max_select || 1) > 1 ? <span className="text-xs text-muted-foreground"> (≤{g.max_select})</span> : null}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(g.options || []).map((op, oi) => {
                      const sel = (modSel[g.name] || []).includes(op.name);
                      return (
                        <Button key={oi} type="button" variant={sel ? 'default' : 'outline'} size="sm"
                          className="min-h-[40px]"
                          data-testid={`mod-option-${gi}-${oi}`}
                          onClick={() => {
                            setModSel(prev => {
                              const cur = prev[g.name] || [];
                              if (cur.includes(op.name)) return { ...prev, [g.name]: cur.filter(n2 => n2 !== op.name) };
                              const maxS = g.max_select || 1;
                              const next = maxS <= 1 ? [op.name] : [...cur, op.name].slice(0, maxS);
                              return { ...prev, [g.name]: next };
                            });
                          }}>
                          {op.name}{op.price_delta ? ` (+${op.price_delta})` : ''}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <Button className="w-full min-h-[44px]" data-testid="mod-confirm-btn"
              onClick={() => {
                const groups = modProduct?.modifier_groups || [];
                for (const g of groups) {
                  if (g.required && !(modSel[g.name] || []).length) {
                    toast.error((language === 'ar' ? 'اختر من: ' : 'Choisissez: ') + g.name);
                    return;
                  }
                }
                const mods = [];
                for (const g of groups) {
                  for (const opName of (modSel[g.name] || [])) {
                    const op = (g.options || []).find(o2 => o2.name === opName);
                    if (op) mods.push({ group: g.name, option: op.name, price_delta: Number(op.price_delta) || 0, product_id: op.product_id || null, qty: op.qty || 1 });
                  }
                }
                cart.addItem(modProduct, { modifiers: mods });
                checkFefoLot(modProduct);
                setModProduct(null);
              }}>
              {language === 'ar' ? 'إضافة للسلة' : 'Ajouter au panier'}
            </Button>
          </DialogContent>
        </Dialog>

        <PrintDocumentDialog open={showPrintDocDialog} onOpenChange={setShowPrintDocDialog} docType="sale" documentId={lastSaleId} />
        <SellPlatformCardDialog open={showSellCardDialog} onClose={() => setShowSellCardDialog(false)} />
      </div>
    </Layout>
  );
}
