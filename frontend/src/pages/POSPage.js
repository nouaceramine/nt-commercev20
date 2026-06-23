import { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Undo2, Users, Barcode,
  List, FolderTree, FileText, ArrowDownToLine,
  ArrowUpFromLine, BarChart3, ScrollText, CalendarDays,
  Tag, Printer, PackagePlus,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';

import POSDialogs from './pos/POSDialogs';
import POSSessionBar from './pos/POSSessionBar';
import POSSidebar from './pos/POSSidebar';
import POSShortcuts from './pos/POSShortcuts';
import POSCart from './pos/POSCart';
import PrintDocumentDialog from '../components/print/PrintDocumentDialog';

// Color palette for product shortcuts
const SHORTCUT_COLORS = [
  '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d',
  '#16a34a', '#059669', '#0d9488', '#0891b2', '#0284c7',
  '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3',
  '#db2777', '#e11d48', '#64748b', '#78716c', '#71717a'
];

export default function POSPage() {
  const { t, language, isRTL } = useLanguage();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [families, setFamilies] = useState([]);
  const [customerFamilies, setCustomerFamilies] = useState([]);
  const [wilayas, setWilayas] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [cart, setCart] = useState([]);
  const [selectedFamily, setSelectedFamily] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDebt, setCustomerDebt] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentType, setPaymentType] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [priceType, setPriceType] = useState('retail');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  // Session state
  const [hasOpenSession, setHasOpenSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [currentSession, setCurrentSession] = useState(null);
  const [sessionStats, setSessionStats] = useState(null);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [showCloseSessionDialog, setShowCloseSessionDialog] = useState(false);
  const [showSessionDetailsDialog, setShowSessionDetailsDialog] = useState(false);
  const [openingCash, setOpeningCash] = useState(0);
  const [closingCash, setClosingCash] = useState(0);
  const [closingNotes, setClosingNotes] = useState('');
  const [cashBoxBalance, setCashBoxBalance] = useState(0);

  // Left sidebar state
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [activeTask, setActiveTask] = useState('articles');

  // Delivery state
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [selectedWilaya, setSelectedWilaya] = useState('');
  const [deliveryType, setDeliveryType] = useState('desk');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(0);

  // Dialogs
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({ name: '', phone: '', email: '', address: '', family_id: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Task-related dialogs
  const [showProductsDialog, setShowProductsDialog] = useState(false);
  const [showCustomersDialog, setShowCustomersDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showCashDialog, setShowCashDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [saleNote, setSaleNote] = useState('');
  const [returnMode, setReturnMode] = useState(false);
  const [cashOperation, setCashOperation] = useState({ type: 'deposit', amount: 0, note: '' });
  const [salesHistory, setSalesHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // New task dialogs
  const [showCustomProductDialog, setShowCustomProductDialog] = useState(false);
  const [showPosReportsDialog, setShowPosReportsDialog] = useState(false);
  const [customProduct, setCustomProduct] = useState({ name: '', price: '', qty: 1 });
  const [customerFamilyFilter, setCustomerFamilyFilter] = useState(null);

  // Blacklist state
  const [blacklist, setBlacklist] = useState([]);
  const [selectedCustomerBlacklisted, setSelectedCustomerBlacklisted] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');

  // Print Receipt Dialog
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [lastSaleId, setLastSaleId] = useState(null);
  const [lastSaleInvoice, setLastSaleInvoice] = useState(null);
  const [receiptSettings, setReceiptSettings] = useState(null);

  // Calculator
  const [showCalculator, setShowCalculator] = useState(false);

  // Search Results
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  // Sale Code
  const [saleCode, setSaleCode] = useState('');

  // Product entry dialog (for force_qty_entry, force_price_entry, serial_number_tracking)
  const [productEntryDialog, setProductEntryDialog] = useState(null); // { product, needsQty, needsPrice, needsSerial }
  const [entryQty, setEntryQty] = useState('1');
  const [entryPrice, setEntryPrice] = useState('');
  const [entrySerial, setEntrySerial] = useState('');

  // Installment
  const [showInstallmentDialog, setShowInstallmentDialog] = useState(false);
  const [installmentPlan, setInstallmentPlan] = useState({
    down_payment: 0, installments_count: 3, interest_rate: 0,
    frequency: 'monthly', first_due_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
  });

  // Discount mode (amount DA | percent %)
  const [discountMode, setDiscountMode] = useState('amount');

  // Mixed payment
  const [mixedCash, setMixedCash] = useState(0);
  const [mixedBank, setMixedBank] = useState(0);

  // A4 print dialog
  const [showPrintDocDialog, setShowPrintDocDialog] = useState(false);

  // Stale session (opened on a previous day)
  const [isStaleSession, setIsStaleSession] = useState(false);

  // Parked carts
  const [parkedCarts, setParkedCarts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('posParkedCarts') || '[]'); } catch { return []; }
  });

  // Product Shortcuts (18 quick access boxes)
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

  // Current cashier info
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const currentCashier = currentUser?.full_name || currentUser?.username || 'Cashier';

  // Save shortcuts to localStorage
  const saveShortcuts = (shortcuts) => {
    setProductShortcuts(shortcuts);
    localStorage.setItem('posProductShortcuts', JSON.stringify(shortcuts));
  };

  // ==================== DATA FETCHING ====================

  useEffect(() => {
    checkOpenSession();
    fetchProducts();
    fetchCustomers();
    fetchFamilies();
    fetchCustomerFamilies();
    fetchBlacklist();
    fetchWilayas();
    fetchWarehouses();
    fetchReceiptSettings();
    fetchSaleCode();
    fetchCashBoxBalance();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const checkOpenSession = async () => {
    try {
      const response = await apiClient.get('/daily-sessions/current');
      const session = response.data;
      if (session && session.status === 'open') {
        setHasOpenSession(true);
        setCurrentSession(session);
        fetchSessionStats(session.id);
        const sessionDay = new Date(session.opened_at).toDateString();
        const today = new Date().toDateString();
        const stale = sessionDay !== today;
        setIsStaleSession(stale);
        if (stale) {
          setTimeout(() => toast.warning(
            language === 'ar'
              ? '⚠️ حصة من يوم سابق لا تزال مفتوحة — يُنصح بإغلاقها'
              : '⚠️ Session d\'un jour précédent toujours ouverte'
          ), 1500);
        }
      } else {
        setHasOpenSession(false);
        setCurrentSession(null);
        setSessionStats(null);
      }
    } catch (error) {
      setHasOpenSession(false);
      setCurrentSession(null);
      setSessionStats(null);
    } finally {
      setCheckingSession(false);
    }
  };

  const fetchSessionStats = async (sessionId) => {
    try {
      const salesRes = await apiClient.get('/sales');
      const today = new Date().toISOString().split('T')[0];
      const todaySales = (salesRes.data.sales || salesRes.data || []).filter(s => s.created_at?.startsWith(today));

      const cashSales = todaySales.filter(s => s.payment_type === 'cash').reduce((sum, s) => sum + (s.total || 0), 0);
      const creditSales = todaySales.filter(s => s.payment_type === 'credit').reduce((sum, s) => sum + (s.total || 0), 0);
      const totalSales = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
      const salesCount = todaySales.length;

      setSessionStats({ cashSales, creditSales, totalSales, salesCount, todaySales });
    } catch (error) {
      console.error('Error fetching session stats:', error);
    }
  };

  const fetchCashBoxBalance = async () => {
    try {
      const response = await apiClient.get('/cash-boxes');
      const cashBox = response.data.find(b => b.id === 'cash');
      if (cashBox) {
        setCashBoxBalance(cashBox.balance || 0);
        setOpeningCash(cashBox.balance || 0);
        setClosingCash(cashBox.balance || 0);
      }
    } catch (error) {
      console.error('Error fetching cash box:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await apiClient.get('/products');
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchSaleCode = async () => {
    try {
      const response = await apiClient.get('/sales/generate-code');
      setSaleCode(response.data.code);
    } catch (error) {
      console.error('Error fetching sale code:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await apiClient.get('/customers');
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchFamilies = async () => {
    try {
      const response = await apiClient.get('/product-families');
      setFamilies(response.data);
    } catch (error) {
      console.error('Error fetching families:', error);
    }
  };

  const fetchCustomerFamilies = async () => {
    try {
      const response = await apiClient.get('/customer-families');
      setCustomerFamilies(response.data);
    } catch (error) {
      console.error('Error fetching customer families:', error);
    }
  };

  const fetchWilayas = async () => {
    try {
      const response = await apiClient.get('/delivery/wilayas');
      setWilayas(response.data);
    } catch (error) {
      console.error('Error fetching wilayas:', error);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const response = await apiClient.get('/warehouses');
      setWarehouses(response.data);
      const mainWarehouse = response.data.find(w => w.is_main);
      if (mainWarehouse && !selectedWarehouse) {
        setSelectedWarehouse(mainWarehouse.id);
      }
    } catch (error) {
      console.error('Error fetching warehouses:', error);
    }
  };

  const fetchBlacklist = async () => {
    try {
      const response = await apiClient.get('/blacklist');
      setBlacklist(response.data);
    } catch (error) {
      console.error('Error fetching blacklist:', error);
    }
  };

  const fetchReceiptSettings = async () => {
    try {
      const response = await apiClient.get('/settings/receipt');
      setReceiptSettings(response.data);
    } catch (error) {
      console.error('Error fetching receipt settings:', error);
    }
  };

  const fetchSalesHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await apiClient.get('/sales?limit=20');
      setSalesHistory(response.data.sales || response.data || []);
    } catch (error) {
      console.error('Error fetching sales history:', error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchCustomerDebt = async (customerId) => {
    try {
      const response = await apiClient.get(`/customers/${customerId}/debt`);
      setCustomerDebt(response.data.total_debt || 0);

      const customer = customers.find(c => c.id === customerId);
      if (customer?.phone) {
        const isBlacklisted = blacklist.some(b => b.phone === customer.phone);
        setSelectedCustomerBlacklisted(isBlacklisted);
        if (isBlacklisted) {
          const entry = blacklist.find(b => b.phone === customer.phone);
          setBlacklistReason(entry?.reason || '');
        } else {
          setBlacklistReason('');
        }
      }
    } catch (error) {
      setCustomerDebt(0);
    }
  };

  // ==================== SESSION HANDLERS ====================

  const handleOpenSession = async () => {
    try {
      let code = '';
      try {
        const codeRes = await apiClient.get('/daily-sessions/generate-code');
        code = codeRes.data.code;
      } catch (e) {}

      const session = {
        code,
        opening_cash: openingCash,
        opened_at: new Date().toISOString(),
        status: 'open'
      };

      const response = await apiClient.post('/daily-sessions', session);
      setCurrentSession(response.data);
      setHasOpenSession(true);
      setShowSessionDialog(false);
      setSessionStats({ cashSales: 0, creditSales: 0, totalSales: 0, salesCount: 0, todaySales: [] });
      toast.success(language === 'ar' ? 'تم فتح الحصة بنجاح' : 'Session ouverte avec succes');
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'حدث خطأ' : 'Une erreur s\'est produite'));
    }
  };

  const handleCloseSession = async () => {
    if (!currentSession) return;
    try {
      const closingData = {
        closing_cash: closingCash,
        closed_at: new Date().toISOString(),
        notes: closingNotes,
        status: 'closed'
      };
      await apiClient.put(`/daily-sessions/${currentSession.id}/close`, closingData);
      setCurrentSession(null);
      setHasOpenSession(false);
      setSessionStats(null);
      setShowCloseSessionDialog(false);
      setClosingNotes('');
      toast.success(language === 'ar' ? 'تم غلق الحصة بنجاح' : 'Session fermee avec succes');
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'حدث خطأ' : 'Une erreur s\'est produite'));
    }
  };

  // ==================== EFFECTS ====================

  useEffect(() => {
    if (selectedCustomer) {
      fetchCustomerDebt(selectedCustomer);
    } else {
      setCustomerDebt(0);
    }
  }, [selectedCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedWilaya && deliveryEnabled) {
      const wilaya = wilayas.find(w => w.code === selectedWilaya);
      if (wilaya) {
        setDeliveryFee(deliveryType === 'home' ? wilaya.home_fee : wilaya.desk_fee);
      }
    } else {
      setDeliveryFee(0);
    }
  }, [selectedWilaya, deliveryType, deliveryEnabled, wilayas]);

  // Search products as user types
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

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-testid="pos-search-input"]') &&
          !e.target.closest('.search-results-dropdown')) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ==================== BARCODE SCANNER ====================

  const [barcodeBuffer, setBarcodeBuffer] = useState('');
  const barcodeTimeoutRef = useRef(null);
  const lastKeyTimeRef = useRef(0);

  // Filtered products
  const filteredProducts = products.filter(p => {
    const matchesSearch = !searchQuery ||
      p.name_ar?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.name_en?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.article_code?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFamily = selectedFamily === 'all' || p.family_id === selectedFamily;
    return matchesSearch && matchesFamily;
  });

  // ==================== CART OPERATIONS ====================

  const playBeep = useCallback((freq = 1200) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = freq;
      gainNode.gain.value = 0.15;
      oscillator.start();
      setTimeout(() => oscillator.stop(), 80);
    } catch (e) {}
  }, []);

  const finalizeAddToCart = useCallback((product, overrideQty, overridePrice, serialNumber) => {
    const existingItem = cart.find(item => item.product_id === product.id);
    const basePrice = overridePrice != null ? overridePrice : (priceType === 'wholesale' ? product.wholesale_price : product.retail_price);
    const qty = overrideQty != null ? overrideQty : (returnMode ? -1 : 1);

    // Each serial-tracked unit must be its own cart row; a custom price also creates a new row
    const bypassExisting = (serialNumber && serialNumber.length > 0) || overridePrice != null;

    if (existingItem && overrideQty == null && !bypassExisting) {
      const newQty = returnMode ? existingItem.quantity - 1 : existingItem.quantity + 1;
      if (newQty <= 0) { removeFromCart(existingItem.cart_item_id); return; }
      if (newQty > product.quantity && !returnMode) {
        toast.warning(language === 'ar'
          ? `تنبيه: المخزون سيصبح سالب (${product.quantity - newQty})`
          : `Attention: Stock sera negatif (${product.quantity - newQty})`);
      }
      setCart(prev => prev.map(item =>
        item.cart_item_id === existingItem.cart_item_id
          ? { ...item, quantity: newQty, total: newQty * item.unit_price }
          : item
      ));
    } else {
      if (product.quantity <= 0 && !returnMode && !product.is_non_stockable) {
        toast.warning(language === 'ar'
          ? 'تنبيه: هذا المنتج غير متوفر - سيتم حساب المخزون بالسالب'
          : 'Attention: Produit non disponible - stock sera negatif');
      }
      setCart(prev => [...prev, {
        cart_item_id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        product_id: product.id,
        product_name: language === 'ar' ? (product.name_ar || product.name_en) : (product.name_en || product.name_ar),
        barcode: product.barcode,
        article_code: product.article_code,
        quantity: qty,
        unit_price: basePrice,
        discount: 0,
        discount_percent: 0,
        total: qty * basePrice,
        available_stock: product.quantity,
        is_return: returnMode,
        is_fixed_price: product.fixed_price || false,
        serial_number: serialNumber || '',
      }]);
    }
    playBeep(returnMode ? 800 : 1200);
  }, [cart, priceType, returnMode, language, playBeep]); // eslint-disable-line react-hooks/exhaustive-deps

  const addToCart = useCallback((product) => {
    // ── Blocked product ──
    if (product.is_blocked) {
      toast.error(language === 'ar'
        ? `المنتج محجوب: ${product.name_ar || product.name_en}`
        : `Article bloqué: ${product.name_en || product.name_ar}`);
      return;
    }

    const needsQty = !!product.force_qty_entry;
    const needsPrice = !!product.force_price_entry;
    const needsSerial = !!product.serial_number_tracking;

    if (needsQty || needsPrice || needsSerial) {
      const basePrice = priceType === 'wholesale' ? product.wholesale_price : product.retail_price;
      setEntryQty('1');
      setEntryPrice(basePrice?.toString() || '');
      setEntrySerial('');
      setProductEntryDialog({ product, needsQty, needsPrice, needsSerial });
      return;
    }

    finalizeAddToCart(product, null, null, '');
  }, [language, priceType, finalizeAddToCart]);

  const confirmProductEntry = useCallback(() => {
    if (!productEntryDialog) return;
    const { product, needsQty, needsPrice, needsSerial } = productEntryDialog;
    const qty = needsQty ? (parseInt(entryQty) || 1) : null;
    const price = needsPrice ? (parseFloat(entryPrice) || 0) : null;
    const serial = needsSerial ? entrySerial : '';
    setProductEntryDialog(null);
    finalizeAddToCart(product, qty, price, serial);
  }, [productEntryDialog, entryQty, entryPrice, entrySerial, finalizeAddToCart]);

  // Barcode Scanner Effect
  useEffect(() => {
    const handleBarcodeInput = (e) => {
      const activeElement = document.activeElement;
      const isInputField = activeElement.tagName === 'INPUT' ||
                          activeElement.tagName === 'TEXTAREA' ||
                          activeElement.isContentEditable;
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
          p.article_code === barcode ||
          p.article_code?.toLowerCase() === barcode.toLowerCase()
        );
        if (product) {
          addToCart(product);
          toast.success(language === 'ar'
            ? `تمت إضافة: ${product.name_ar || product.name_en}`
            : `Ajoute: ${product.name_en || product.name_ar}`);
        } else {
          toast.error(language === 'ar'
            ? `المنتج غير موجود: ${barcode}`
            : `Produit introuvable: ${barcode}`);
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
  }, [barcodeBuffer, products, language, addToCart]);

  const updateCartItemQuantity = (cartItemId, newQty) => {
    if (newQty === 0) { removeFromCart(cartItemId); return; }
    const cartItem = cart.find(item => item.cart_item_id === cartItemId);
    const product = cartItem ? products.find(p => p.id === cartItem.product_id) : null;
    if (product && Math.abs(newQty) > product.quantity && newQty > 0) {
      toast.warning(language === 'ar' ? 'تنبيه: المخزون سيصبح سالب' : 'Attention: Stock sera negatif');
    }
    setCart(prev => prev.map(item => {
      if (item.cart_item_id === cartItemId) {
        const subtotal = newQty * item.unit_price;
        const discountAmount = (item.discount_percent || 0) / 100 * Math.abs(subtotal);
        return { ...item, quantity: newQty, total: subtotal - (newQty > 0 ? discountAmount : -discountAmount) };
      }
      return item;
    }));
  };

  const updateCartItemPrice = (cartItemId, newPrice) => {
    const price = parseFloat(newPrice) || 0;
    setCart(prev => prev.map(item => {
      if (item.cart_item_id === cartItemId) {
        const subtotal = item.quantity * price;
        const discountAmount = (item.discount_percent || 0) / 100 * Math.abs(subtotal);
        return { ...item, unit_price: price, total: subtotal - (item.quantity > 0 ? discountAmount : -discountAmount) };
      }
      return item;
    }));
  };

  const updateCartItemDiscount = (cartItemId, discountPercent) => {
    setCart(prev => prev.map(item => {
      if (item.cart_item_id === cartItemId) {
        const subtotal = item.quantity * item.unit_price;
        const discountAmount = (parseFloat(discountPercent) || 0) / 100 * Math.abs(subtotal);
        return { ...item, discount_percent: parseFloat(discountPercent) || 0, discount: discountAmount, total: subtotal - (item.quantity > 0 ? discountAmount : -discountAmount) };
      }
      return item;
    }));
  };

  const updateCartItemNote = (cartItemId, note) => {
    setCart(prev => prev.map(item => item.cart_item_id === cartItemId ? { ...item, note } : item));
  };

  const removeFromCart = (cartItemId) => {
    setCart(prev => prev.filter(item => item.cart_item_id !== cartItemId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setPaidAmount(0);
    setSelectedCustomer(null);
    setDeliveryEnabled(false);
    setSelectedWilaya('');
    setDeliveryAddress('');
    setDeliveryCity('');
    setPaymentType('cash');
    setPaymentMethod('cash');
    setPaidAmount(0);
    setMixedCash(0);
    setMixedBank(0);
    setDiscountMode('amount');
    setInstallmentPlan({ down_payment: 0, installments_count: 3, interest_rate: 0, frequency: 'monthly', first_due_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0] });
    setSaleNote('');
    setReturnMode(false);
    fetchSaleCode();
  };

  const parkCart = () => {
    if (cart.length === 0) return;
    const snapshot = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      cart: [...cart],
      customerId: selectedCustomer,
      discount,
      saleNote,
    };
    const updated = [...parkedCarts, snapshot];
    setParkedCarts(updated);
    localStorage.setItem('posParkedCarts', JSON.stringify(updated));
    clearCart();
    toast.success(language === 'ar' ? 'تم حفظ السلة مؤقتاً' : 'Panier mis en attente');
  };

  const resumeParkedCart = (id) => {
    const parked = parkedCarts.find(p => p.id === id);
    if (!parked) return;
    if (cart.length > 0) {
      toast.error(language === 'ar' ? 'أفرغ السلة الحالية أولاً أو احفظها' : 'Videz le panier actuel d\'abord');
      return;
    }
    setCart(parked.cart.map(item => item.cart_item_id ? item : { ...item, cart_item_id: Date.now().toString(36) + Math.random().toString(36).slice(2) }));
    setSelectedCustomer(parked.customerId || null);
    setDiscount(parked.discount || 0);
    setSaleNote(parked.saleNote || '');
    const updated = parkedCarts.filter(p => p.id !== id);
    setParkedCarts(updated);
    localStorage.setItem('posParkedCarts', JSON.stringify(updated));
    toast.success(language === 'ar' ? 'تم استئناف السلة' : 'Panier repris');
  };

  const deleteParkedCart = (id) => {
    const updated = parkedCarts.filter(p => p.id !== id);
    setParkedCarts(updated);
    localStorage.setItem('posParkedCarts', JSON.stringify(updated));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal - discount + (deliveryEnabled ? deliveryFee : 0);
  const remaining = total - paidAmount;

  // ==================== CASH OPERATION ====================

  const handleCashOperation = async () => {
    if (!cashOperation.amount || cashOperation.amount <= 0) {
      toast.error(language === 'ar' ? 'يرجى إدخال مبلغ صحيح' : 'Veuillez entrer un montant valide');
      return;
    }
    try {
      const endpoint = cashOperation.type === 'deposit' ? '/cash/deposit' : '/cash/withdraw';
      await apiClient.post(endpoint, {
        amount: cashOperation.amount,
        note: cashOperation.note,
        box_id: 'cash'
      });
      toast.success(language === 'ar'
        ? (cashOperation.type === 'deposit' ? 'تم الإيداع بنجاح' : 'تم السحب بنجاح')
        : (cashOperation.type === 'deposit' ? 'Depot effectue' : 'Retrait effectue'));
      setShowCashDialog(false);
      setCashOperation({ type: 'deposit', amount: 0, note: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error');
    }
  };

  // ==================== TASK MENU ====================

  const addCustomProductToCart = () => {
    const name = customProduct.name.trim();
    const price = parseFloat(customProduct.price) || 0;
    const qty = parseInt(customProduct.qty) || 1;
    if (!name) { toast.error(language === 'ar' ? 'يجب إدخال اسم المنتج' : 'Le nom est obligatoire'); return; }
    if (price <= 0) { toast.error(language === 'ar' ? 'السعر يجب أن يكون أكبر من 0' : 'Le prix doit être > 0'); return; }
    const uid = `custom_${Date.now()}`;
    setCart(prev => [...prev, {
      cart_item_id: uid,
      product_id: uid,
      product_name: name,
      barcode: '',
      article_code: '',
      quantity: qty,
      unit_price: price,
      discount: 0,
      discount_percent: 0,
      total: qty * price,
      available_stock: 9999,
      is_custom: true,
    }]);
    setCustomProduct({ name: '', price: '', qty: 1 });
    setShowCustomProductDialog(false);
    toast.success(language === 'ar' ? 'تمت الإضافة' : 'Produit ajouté');
  };

  const handleTaskClick = (taskId) => {
    setActiveTask(taskId);
    switch(taskId) {
      case 'articles': setShowProductsDialog(true); break;
      case 'families': setSelectedFamily('all'); setShowProductsDialog(true); break;
      case 'customers':
        setCustomerFamilyFilter(null);
        setShowCustomersDialog(true);
        break;
      case 'customer-families':
        setCustomerFamilyFilter('_all_families');
        setShowCustomersDialog(true);
        break;
      case 'custom-product':
        setCustomProduct({ name: '', price: '', qty: 1 });
        setShowCustomProductDialog(true);
        break;
      case 'price-type':
        setPriceType(prev => prev === 'retail' ? 'wholesale' : 'retail');
        toast.info(language === 'ar'
          ? (priceType === 'retail' ? 'تم التبديل إلى سعر الجملة' : 'تم التبديل إلى سعر التجزئة')
          : (priceType === 'retail' ? 'Prix grossiste activé' : 'Prix détail activé'));
        break;
      case 'note': setShowNoteDialog(true); break;
      case 'return':
        setReturnMode(!returnMode);
        toast.info(language === 'ar'
          ? (returnMode ? 'تم إلغاء وضع الإرجاع' : 'تم تفعيل وضع الإرجاع')
          : (returnMode ? 'Mode retour desactive' : 'Mode retour active'));
        break;
      case 'deposit': setCashOperation({ type: 'deposit', amount: 0, note: '' }); setShowCashDialog(true); break;
      case 'withdraw': setCashOperation({ type: 'withdraw', amount: 0, note: '' }); setShowCashDialog(true); break;
      case 'print-last':
        if (lastSaleId) { setShowPrintDialog(true); }
        else { toast.info(language === 'ar' ? 'لا توجد فاتورة سابقة' : 'Aucune facture précédente'); }
        break;
      case 'reports': setShowPosReportsDialog(true); break;
      case 'history': fetchSalesHistory(); setShowHistoryDialog(true); break;
      default: break;
    }
  };

  // ==================== COMPLETE SALE ====================

  const completeSale = async () => {
    if (!hasOpenSession) {
      toast.error(language === 'ar' ? 'يجب فتح حصة جديدة قبل البيع' : 'Vous devez ouvrir une session avant de vendre');
      return;
    }
    if (cart.length === 0) {
      toast.error(language === 'ar' ? 'السلة فارغة' : 'Le panier est vide');
      return;
    }
    if (paymentType !== 'cash' && !selectedCustomer) {
      toast.error(language === 'ar' ? 'يجب اختيار زبون لهذا النوع من البيع' : 'Selectionnez un client pour ce type de vente');
      return;
    }

    setLoading(true);
    try {
      const wilaya = wilayas.find(w => w.code === selectedWilaya);
      const saleData = {
        code: saleCode,
        customer_id: selectedCustomer,
        warehouse_id: selectedWarehouse || null,
        items: cart.map(item => ({
          product_id: item.is_custom ? null : item.product_id,
          product_name: item.product_name,
          barcode: item.barcode || '',
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount || 0,
          total: item.total,
          note: item.note || '',
        })),
        subtotal,
        discount,
        total: subtotal - discount,
        paid_amount: paymentType === 'credit' ? 0
          : paymentType === 'installment' ? installmentPlan.down_payment
          : paymentType === 'mixed' ? (mixedCash + mixedBank)
          : paidAmount || total,
        payment_method: paymentType === 'mixed' ? 'mixed' : paymentMethod,
        payment_details: paymentType === 'mixed' ? { cash: mixedCash, bank: mixedBank } : undefined,
        payment_type: paymentType,
        installment_plan: paymentType === 'installment' ? installmentPlan : undefined,
        notes: saleNote,
        delivery: deliveryEnabled ? {
          enabled: true,
          wilaya_code: selectedWilaya,
          wilaya_name: wilaya ? (language === 'ar' ? wilaya.name_ar : wilaya.name_en) : '',
          city: deliveryCity,
          address: deliveryAddress,
          delivery_type: deliveryType,
          fee: deliveryFee
        } : null
      };

      const response = await apiClient.post('/sales', saleData);
      toast.success(language === 'ar' ? 'تمت عملية البيع بنجاح' : 'Vente effectuee avec succes');

      setLastSaleId(response.data.id);
      setLastSaleInvoice(response.data.invoice_number);

      if (receiptSettings?.auto_print) {
        const printerSize = receiptSettings?.thermal_printer_size || '80mm';
        printThermalReceipt(response.data.id, printerSize);
      } else if (receiptSettings?.show_print_dialog !== false) {
        setShowPrintDialog(true);
      }

      clearCart();
      fetchProducts();
      if (currentSession) fetchSessionStats(currentSession.id);
    } catch (error) {
      console.error('Sale error:', error);
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'حدث خطا اثناء البيع' : 'Erreur lors de la vente'));
    } finally {
      setLoading(false);
    }
  };

  // ==================== THERMAL PRINTER ====================

  const printThermalReceipt = async (saleId, printerSize = '80mm') => {
    try {
      const response = await apiClient.get(`/sales/${saleId}`);
      const sale = response.data;
      const receiptHtml = generateThermalReceiptHtml(sale, printerSize);
      const printWindow = window.open('', '_blank', 'width=300,height=600');
      if (printWindow) {
        printWindow.document.write(receiptHtml);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
      }
    } catch (error) {
      console.error('Print error:', error);
      toast.error(language === 'ar' ? 'خطأ في الطباعة' : 'Erreur d\'impression');
    }
  };

  const generateThermalReceiptHtml = (sale, printerSize = '80mm') => {
    const storeName = receiptSettings?.store_name || 'NT Commerce';
    const storeAddress = receiptSettings?.store_address || '';
    const storePhone = receiptSettings?.store_phone || '';
    const fontSize = printerSize === '58mm' ? '10px' : '12px';
    const titleSize = printerSize === '58mm' ? '14px' : '16px';
    const totalSize = printerSize === '58mm' ? '12px' : '14px';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt</title>
<style>
@page{size:${printerSize} auto;margin:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New','Lucida Console',monospace;font-size:${fontSize};width:${printerSize};padding:3mm;direction:${isRTL?'rtl':'ltr'};line-height:1.4}
.center{text-align:center}.bold{font-weight:bold}.line{border-bottom:1px dashed #000;margin:4px 0}
.double-line{border-bottom:2px solid #000;margin:4px 0}.row{display:flex;justify-content:space-between;gap:4px}
.items{margin:8px 0}.item{margin:4px 0;padding-bottom:2px}.total{font-size:${totalSize};font-weight:bold}
.footer{margin-top:12px;font-size:9px}.cashier{font-size:9px;color:#666;margin-top:4px}
</style></head><body>
<div class="center bold" style="font-size:${titleSize}">${storeName}</div>
${storeAddress?`<div class="center" style="font-size:10px">${storeAddress}</div>`:''}
${storePhone?`<div class="center" style="font-size:10px">${storePhone}</div>`:''}
<div class="double-line"></div>
<div class="row"><span>${language==='ar'?'رقم:':'N°:'}</span><span class="bold">${sale.invoice_number||sale.code}</span></div>
<div class="row"><span>${language==='ar'?'التاريخ:':'Date:'}</span><span>${new Date(sale.created_at).toLocaleString(language==='ar'?'ar-DZ':'fr-FR')}</span></div>
${sale.customer_name?`<div class="row"><span>${language==='ar'?'الزبون:':'Client:'}</span><span>${sale.customer_name}</span></div>`:''}
<div class="line"></div>
<div class="items">${(sale.items||[]).map(item=>`<div class="item"><div class="bold">${item.product_name}</div><div class="row"><span>${item.quantity} x ${formatCurrency(item.unit_price)}</span><span class="bold">${formatCurrency(item.total)}</span></div></div>`).join('')}</div>
<div class="line"></div>
<div class="row"><span>${language==='ar'?'المجموع الفرعي:':'Sous-total:'}</span><span>${formatCurrency(sale.subtotal)}</span></div>
${sale.discount>0?`<div class="row"><span>${language==='ar'?'الخصم:':'Remise:'}</span><span>-${formatCurrency(sale.discount)}</span></div>`:''}
${sale.delivery?.fee>0?`<div class="row"><span>${language==='ar'?'التوصيل:':'Livraison:'}</span><span>${formatCurrency(sale.delivery.fee)}</span></div>`:''}
<div class="double-line"></div>
<div class="row total"><span>${language==='ar'?'الإجمالي:':'TOTAL:'}</span><span>${formatCurrency(sale.total)} ${t.currency}</span></div>
${sale.paid_amount?`<div class="row" style="margin-top:4px"><span>${language==='ar'?'المدفوع:':'Paye:'}</span><span>${formatCurrency(sale.paid_amount)}</span></div>${sale.total-sale.paid_amount>0?`<div class="row"><span>${language==='ar'?'الباقي:':'Reste:'}</span><span>${formatCurrency(sale.total-sale.paid_amount)}</span></div>`:''}`:''}
<div class="footer center"><div class="line"></div><div style="margin-top:6px">${language==='ar'?'شكراً لزيارتكم':'Merci de votre visite'}</div><div class="cashier">${language==='ar'?'البائع:':'Caissier:'} ${currentCashier}</div></div>
</body></html>`;
  };

  // ==================== KEYBOARD SHORTCUTS ====================

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F10' || (e.ctrlKey && e.key === 'Enter')) { e.preventDefault(); completeSale(); }
      if (e.key === 'Escape') { e.preventDefault(); clearCart(); }
      if (e.ctrlKey && e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key);
        const tasks = ['articles', 'families', 'customers', 'customer-families', 'custom-product', 'price-type', 'note', 'return', 'deposit', 'withdraw'];
        if (tasks[index]) handleTaskClick(tasks[index]);
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'p') { e.preventDefault(); handleTaskClick('print-last'); }
      if (e.ctrlKey && e.key.toLowerCase() === 'r') { e.preventDefault(); handleTaskClick('reports'); }
      if (e.ctrlKey && e.key.toLowerCase() === 'h') { e.preventDefault(); handleTaskClick('history'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, hasOpenSession, returnMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ar-DZ', { minimumFractionDigits: 2 }).format(amount || 0);
  };

  // Task menu items
  const taskMenuItems = [
    { id: 'articles',        icon: List,          label: language === 'ar' ? 'قائمة المنتجات'  : 'Liste articles',   shortcut: '0' },
    { id: 'families',        icon: FolderTree,    label: language === 'ar' ? 'بالعائلة'         : 'Par famille',      shortcut: '1' },
    { id: 'customers',       icon: Users,         label: language === 'ar' ? 'الزبائن'          : 'Clients',          shortcut: '2' },
    { id: 'customer-families', icon: FolderTree,  label: language === 'ar' ? 'عائلات الزبائن'  : 'Fam. clients',     shortcut: '3', badge: true },
    { id: 'custom-product',  icon: PackagePlus,   label: language === 'ar' ? 'منتج مخصص'       : 'Produit libre',    shortcut: '4' },
    { id: 'price-type',      icon: Tag,           label: language === 'ar'
        ? (priceType === 'retail' ? 'السعر: تجزئة' : 'السعر: جملة')
        : (priceType === 'retail' ? 'Prix: détail' : 'Prix: gros'),                                                   shortcut: '5', highlight: priceType === 'wholesale' },
    { id: 'note',            icon: FileText,      label: language === 'ar' ? 'ملاحظة'           : 'Note',             shortcut: '6' },
    { id: 'return',          icon: Undo2,         label: language === 'ar' ? 'إرجاع'            : 'Retour',           shortcut: '7' },
    { id: 'deposit',         icon: ArrowDownToLine, label: language === 'ar' ? 'إيداع'          : 'Dépôt',            shortcut: '8' },
    { id: 'withdraw',        icon: ArrowUpFromLine, label: language === 'ar' ? 'سحب'            : 'Retrait',          shortcut: '9' },
    { id: 'print-last',      icon: Printer,       label: language === 'ar' ? 'طباعة آخر فاتورة' : 'Impr. dernière',  shortcut: 'P' },
    { id: 'reports',         icon: BarChart3,     label: language === 'ar' ? 'تقارير الحصة'    : 'Rapports session', shortcut: 'R' },
    { id: 'history',         icon: ScrollText,    label: language === 'ar' ? 'السجل'            : 'Historique',       shortcut: 'H' },
  ];

  // Shortcut handlers
  const handleShortcutClick = (shortcut, index) => {
    if (shortcut.productId) {
      const product = products.find(p => p.id === shortcut.productId);
      if (product) addToCart(product);
    } else {
      setEditingShortcutIndex(index);
      setShortcutColor(shortcut.color || SHORTCUT_COLORS[index % SHORTCUT_COLORS.length]);
      setShortcutProductId('');
      setShowShortcutDialog(true);
    }
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
    const name = language === 'ar' ? (product.name_ar || product.name_en) : (product.name_en || product.name_ar);
    return name?.substring(0, 8) || '---';
  };

  // ==================== RENDER ====================

  return (
    <Layout>
      <div className="h-[calc(100vh-120px)] md:h-[calc(100vh-120px)] flex flex-col" data-testid="pos-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1 className="text-base sm:text-xl font-bold">
              {language === 'ar' ? 'نقطة البيع' : 'Point de Vente'}
            </h1>
            {barcodeBuffer.length > 0 && (
              <Badge variant="secondary" className="animate-pulse text-xs gap-1">
                <Barcode className="h-3 w-3" />
                {barcodeBuffer}
              </Badge>
            )}
            {returnMode && (
              <Badge variant="destructive" className="animate-pulse text-xs sm:text-sm">
                {language === 'ar' ? 'إرجاع' : 'Retour'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {saleCode && (
              <Badge variant="outline" className="font-mono text-xs sm:text-sm px-2 py-1">
                {saleCode}
              </Badge>
            )}
            <div className="bg-primary text-primary-foreground text-base sm:text-xl font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg shadow">
              {formatCurrency(total)} {t.currency}
            </div>
          </div>
        </div>

        {/* Session Bar */}
        <POSSessionBar
          checkingSession={checkingSession}
          hasOpenSession={hasOpenSession}
          currentSession={currentSession}
          sessionStats={sessionStats}
          setShowSessionDialog={setShowSessionDialog}
          setShowSessionDetailsDialog={setShowSessionDetailsDialog}
          setClosingCash={setClosingCash}
          cashBoxBalance={cashBoxBalance}
          setShowCloseSessionDialog={setShowCloseSessionDialog}
          language={language}
          formatCurrency={formatCurrency}
          t={t}
          isStaleSession={isStaleSession}
        />

        {/* Main Content Grid */}
        <div className={`flex-1 grid grid-cols-1 md:grid-cols-12 gap-2 min-h-0 ${isRTL ? 'direction-ltr' : ''}`} style={{ direction: 'ltr' }}>
          {/* Left Sidebar */}
          <POSSidebar
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            showSearchResults={showSearchResults}
            setShowSearchResults={setShowSearchResults}
            searchResults={searchResults}
            products={products}
            addToCart={addToCart}
            setShowProductsDialog={setShowProductsDialog}
            taskMenuItems={taskMenuItems}
            activeTask={activeTask}
            handleTaskClick={handleTaskClick}
            returnMode={returnMode}
            language={language}
            formatCurrency={formatCurrency}
            isRTL={isRTL}
          />

          {/* Mobile Quick Actions Bar */}
          <div className="md:hidden flex items-center gap-2 mb-2 overflow-x-auto pb-2" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
            <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => setShowProductsDialog(true)}>
              <Plus className="h-4 w-4" />{language === 'ar' ? 'منتج' : 'Produit'}
            </Button>
            <Button size="sm" variant={returnMode ? "destructive" : "outline"} className="gap-1 shrink-0" onClick={() => handleTaskClick('return')}>
              <Undo2 className="h-4 w-4" />{language === 'ar' ? 'إرجاع' : 'Retour'}
            </Button>
            <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => setShowCustomersDialog(true)}>
              <Users className="h-4 w-4" />{language === 'ar' ? 'زبون' : 'Client'}
            </Button>
            <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => setShowHistoryDialog(true)}>
              <History className="h-4 w-4" />
            </Button>
          </div>

          {/* Cart */}
          <POSCart
            cart={cart}
            customers={customers}
            selectedCustomer={selectedCustomer}
            setSelectedCustomer={setSelectedCustomer}
            customerDebt={customerDebt}
            selectedWarehouse={selectedWarehouse}
            setSelectedWarehouse={setSelectedWarehouse}
            warehouses={warehouses}
            priceType={priceType}
            setPriceType={setPriceType}
            setShowNewCustomerDialog={setShowNewCustomerDialog}
            updateCartItemQuantity={updateCartItemQuantity}
            updateCartItemPrice={updateCartItemPrice}
            updateCartItemDiscount={updateCartItemDiscount}
            removeFromCart={removeFromCart}
            clearCart={clearCart}
            subtotal={subtotal}
            total={total}
            discount={discount}
            setDiscount={setDiscount}
            loading={loading}
            hasOpenSession={hasOpenSession}
            completeSale={completeSale}
            language={language}
            formatCurrency={formatCurrency}
            t={t}
            isRTL={isRTL}
            paymentType={paymentType}
            setPaymentType={setPaymentType}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            paidAmount={paidAmount}
            setPaidAmount={setPaidAmount}
            installmentPlan={installmentPlan}
            onInstallmentClick={() => setShowInstallmentDialog(true)}
            discountMode={discountMode}
            setDiscountMode={setDiscountMode}
            updateCartItemNote={updateCartItemNote}
            parkedCarts={parkedCarts}
            parkCart={parkCart}
            resumeParkedCart={resumeParkedCart}
            deleteParkedCart={deleteParkedCart}
            mixedCash={mixedCash}
            setMixedCash={setMixedCash}
            mixedBank={mixedBank}
            setMixedBank={setMixedBank}
          />

          {/* Right Sidebar - Shortcuts */}
          <POSShortcuts
            productShortcuts={productShortcuts}
            products={products}
            getShortcutProductName={getShortcutProductName}
            handleShortcutClick={handleShortcutClick}
            setEditingShortcutIndex={setEditingShortcutIndex}
            setShortcutColor={setShortcutColor}
            setShortcutProductId={setShortcutProductId}
            setShowShortcutDialog={setShowShortcutDialog}
            SHORTCUT_COLORS={SHORTCUT_COLORS}
            language={language}
            formatCurrency={formatCurrency}
            isRTL={isRTL}
          />
        </div>

        {/* Dialogs */}
        <POSDialogs
          showProductsDialog={showProductsDialog} setShowProductsDialog={setShowProductsDialog}
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          selectedFamily={selectedFamily} setSelectedFamily={setSelectedFamily}
          families={families} filteredProducts={filteredProducts} addToCart={addToCart}
          language={language} formatCurrency={formatCurrency} priceType={priceType}
          showCustomersDialog={showCustomersDialog} setShowCustomersDialog={setShowCustomersDialog}
          customers={customers} setSelectedCustomer={setSelectedCustomer}
          setShowNewCustomerDialog={setShowNewCustomerDialog}
          showNoteDialog={showNoteDialog} setShowNoteDialog={setShowNoteDialog}
          saleNote={saleNote} setSaleNote={setSaleNote}
          showCashDialog={showCashDialog} setShowCashDialog={setShowCashDialog}
          cashOperation={cashOperation} setCashOperation={setCashOperation}
          handleCashOperation={handleCashOperation}
          showHistoryDialog={showHistoryDialog} setShowHistoryDialog={setShowHistoryDialog}
          salesHistory={salesHistory} historyLoading={historyLoading}
          showShortcutDialog={showShortcutDialog} setShowShortcutDialog={setShowShortcutDialog}
          shortcutProductId={shortcutProductId} setShortcutProductId={setShortcutProductId}
          shortcutColor={shortcutColor} setShortcutColor={setShortcutColor}
          products={products} SHORTCUT_COLORS={SHORTCUT_COLORS}
          editingShortcutIndex={editingShortcutIndex} productShortcuts={productShortcuts}
          saveShortcuts={saveShortcuts} saveShortcut={saveShortcut}
          showNewCustomerDialog={showNewCustomerDialog}
          newCustomerData={newCustomerData} setNewCustomerData={setNewCustomerData}
          savingCustomer={savingCustomer} setSavingCustomer={setSavingCustomer}
          fetchCustomers={fetchCustomers}
          showPrintDialog={showPrintDialog} setShowPrintDialog={setShowPrintDialog}
          lastSaleId={lastSaleId} lastSaleInvoice={lastSaleInvoice}
          receiptSettings={receiptSettings} printThermalReceipt={printThermalReceipt} onPrintA4={() => setShowPrintDocDialog(true)}
          showSessionDialog={showSessionDialog} setShowSessionDialog={setShowSessionDialog}
          openingCash={openingCash} setOpeningCash={setOpeningCash}
          cashBoxBalance={cashBoxBalance} handleOpenSession={handleOpenSession}
          showCloseSessionDialog={showCloseSessionDialog} setShowCloseSessionDialog={setShowCloseSessionDialog}
          currentSession={currentSession} sessionStats={sessionStats}
          closingCash={closingCash} setClosingCash={setClosingCash}
          closingNotes={closingNotes} setClosingNotes={setClosingNotes}
          handleCloseSession={handleCloseSession}
          showSessionDetailsDialog={showSessionDetailsDialog} setShowSessionDetailsDialog={setShowSessionDetailsDialog}
          t={t}
          showCustomProductDialog={showCustomProductDialog} setShowCustomProductDialog={setShowCustomProductDialog}
          customProduct={customProduct} setCustomProduct={setCustomProduct}
          addCustomProductToCart={addCustomProductToCart}
          showPosReportsDialog={showPosReportsDialog} setShowPosReportsDialog={setShowPosReportsDialog}
          customerFamilyFilter={customerFamilyFilter} customerFamilies={customerFamilies}
        />

        {/* ── Installment Setup Dialog ── */}
        <Dialog open={showInstallmentDialog} onOpenChange={setShowInstallmentDialog}>
          <DialogContent className="max-w-md" dir={isRTL ? 'rtl' : 'ltr'}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                {language === 'ar' ? 'إعداد خطة الأقساط' : 'Configurer le plan de versements'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Down payment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{language === 'ar' ? 'الدفعة المقدمة (DA)' : 'Acompte (DA)'}</Label>
                  <Input
                    type="number" min={0} max={total}
                    value={installmentPlan.down_payment}
                    onChange={e => setInstallmentPlan(p => ({ ...p, down_payment: parseFloat(e.target.value) || 0 }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">{language === 'ar' ? 'عدد الأقساط' : 'Nb de versements'}</Label>
                  <Input
                    type="number" min={2} max={60}
                    value={installmentPlan.installments_count}
                    onChange={e => setInstallmentPlan(p => ({ ...p, installments_count: parseInt(e.target.value) || 3 }))}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Interest + Frequency */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{language === 'ar' ? 'نسبة الفائدة (%)' : 'Taux d\'intérêt (%)'}</Label>
                  <Input
                    type="number" min={0} max={100} step={0.5}
                    value={installmentPlan.interest_rate}
                    onChange={e => setInstallmentPlan(p => ({ ...p, interest_rate: parseFloat(e.target.value) || 0 }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">{language === 'ar' ? 'التكرار' : 'Fréquence'}</Label>
                  <UiSelect
                    value={installmentPlan.frequency}
                    onValueChange={v => setInstallmentPlan(p => ({ ...p, frequency: v }))}
                  >
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{language === 'ar' ? 'شهري' : 'Mensuel'}</SelectItem>
                      <SelectItem value="weekly">{language === 'ar' ? 'أسبوعي' : 'Hebdomadaire'}</SelectItem>
                    </SelectContent>
                  </UiSelect>
                </div>
              </div>

              {/* First due date */}
              <div>
                <Label className="text-xs">{language === 'ar' ? 'تاريخ أول قسط' : 'Date du 1er versement'}</Label>
                <Input
                  type="date"
                  value={installmentPlan.first_due_date}
                  onChange={e => setInstallmentPlan(p => ({ ...p, first_due_date: e.target.value }))}
                  className="mt-1"
                />
              </div>

              {/* Live preview */}
              {(() => {
                const remaining = total - installmentPlan.down_payment;
                const interest = remaining * installmentPlan.interest_rate / 100;
                const perInst = installmentPlan.installments_count > 0
                  ? Math.round((remaining + interest) / installmentPlan.installments_count)
                  : 0;
                const grandTotal = installmentPlan.down_payment + remaining + interest;
                return (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'ar' ? 'المبلغ الكلي' : 'Total'}</span>
                      <span className="font-bold">{total?.toLocaleString()} DA</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'ar' ? 'الدفعة المقدمة' : 'Acompte'}</span>
                      <span>{installmentPlan.down_payment?.toLocaleString()} DA</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{language === 'ar' ? 'الفائدة' : 'Intérêt'}</span>
                      <span className="text-purple-600">+{Math.round(interest)?.toLocaleString()} DA</span>
                    </div>
                    <div className="flex justify-between border-t pt-1.5 font-bold text-primary">
                      <span>{language === 'ar' ? `قسط × ${installmentPlan.installments_count}` : `Versement × ${installmentPlan.installments_count}`}</span>
                      <span>{perInst?.toLocaleString()} DA</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{language === 'ar' ? 'الإجمالي مع الفائدة' : 'Total avec intérêts'}</span>
                      <span>{Math.round(grandTotal)?.toLocaleString()} DA</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowInstallmentDialog(false); setPaymentType('cash'); }}>
                {language === 'ar' ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button onClick={() => setShowInstallmentDialog(false)} className="gap-2">
                <CalendarDays className="h-4 w-4" />
                {language === 'ar' ? 'تأكيد الخطة' : 'Confirmer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* A4 Print Document Dialog */}
        <PrintDocumentDialog
          open={showPrintDocDialog}
          onOpenChange={setShowPrintDocDialog}
          docType="sale"
          documentId={lastSaleId}
        />

        {/* Product Entry Dialog (force_qty / force_price / serial) */}
        <Dialog open={!!productEntryDialog} onOpenChange={(open) => { if (!open) setProductEntryDialog(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Tag className="h-4 w-4" />
                {language === 'ar' ? 'أدخل تفاصيل المنتج' : 'Saisie requise'}
              </DialogTitle>
            </DialogHeader>
            {productEntryDialog && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground font-medium">
                  {language === 'ar'
                    ? (productEntryDialog.product.name_ar || productEntryDialog.product.name_en)
                    : (productEntryDialog.product.name_en || productEntryDialog.product.name_ar)}
                </p>
                {productEntryDialog.needsQty && (
                  <div className="space-y-1">
                    <Label className="text-xs">{language === 'ar' ? 'الكمية *' : 'Quantité *'}</Label>
                    <Input
                      type="number" min="1" autoFocus
                      value={entryQty}
                      onChange={e => setEntryQty(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && confirmProductEntry()}
                      className="h-9"
                    />
                  </div>
                )}
                {productEntryDialog.needsPrice && (
                  <div className="space-y-1">
                    <Label className="text-xs">{language === 'ar' ? 'السعر (DA) *' : 'Prix (DA) *'}</Label>
                    <Input
                      type="number" min="0" step="0.01"
                      value={entryPrice}
                      onChange={e => setEntryPrice(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && confirmProductEntry()}
                      className="h-9"
                      autoFocus={!productEntryDialog.needsQty}
                    />
                  </div>
                )}
                {productEntryDialog.needsSerial && (
                  <div className="space-y-1">
                    <Label className="text-xs">{language === 'ar' ? 'الرقم التسلسلي *' : 'N° de série *'}</Label>
                    <Input
                      value={entrySerial}
                      onChange={e => setEntrySerial(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && confirmProductEntry()}
                      className="h-9 font-mono"
                      placeholder="SN-XXXX"
                      autoFocus={!productEntryDialog.needsQty && !productEntryDialog.needsPrice}
                    />
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setProductEntryDialog(null)} className="flex-1">
                    {language === 'ar' ? 'إلغاء' : 'Annuler'}
                  </Button>
                  <Button size="sm" onClick={confirmProductEntry} className="flex-1">
                    {language === 'ar' ? 'إضافة للسلة' : 'Ajouter au panier'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
