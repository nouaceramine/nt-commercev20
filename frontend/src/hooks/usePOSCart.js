/**
 * usePOSCart - Shopping Cart State Management Hook
 * Extracted from POSPage.js (Refactoring: Extract Hook)
 * Addresses: Large Class, Data Clumps, Feature Envy
 */
import { useState, useCallback } from 'react';
import { getTierPrice } from '../lib/priceTiers';

const CART_STORAGE_KEY = 'posParkedCarts';

export function usePOSCart({ language, toast }) {
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [discountMode, setDiscountMode] = useState('amount');
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentType, setPaymentType] = useState('cash');
  const [mixedCash, setMixedCash] = useState(0);
  const [mixedBank, setMixedBank] = useState(0);
  const [returnMode, setReturnMode] = useState(false);
  const [saleNote, setSaleNote] = useState('');

  // Parked carts for later retrieval
  const [parkedCarts, setParkedCarts] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]'); } catch { return []; }
  });

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
    } catch (e) { /* silent */ }
  }, []);

  const addItem = useCallback((product, options = {}) => {
    const { overrideQty, overridePrice, serialNumber, priceType } = options;
    const existingItem = cart.find(item => item.product_id === product.id);
    const basePrice = overridePrice != null ? overridePrice : getTierPrice(product, priceType);
    const qty = overrideQty != null ? overrideQty : (returnMode ? -1 : 1);
    const bypassExisting = (serialNumber && serialNumber.length > 0) || overridePrice != null;

    if (existingItem && overrideQty == null && !bypassExisting) {
      const newQty = returnMode ? existingItem.quantity - 1 : existingItem.quantity + 1;
      if (newQty <= 0) { removeItem(existingItem.cart_item_id); return; }
      setCart(prev => prev.map(item =>
        item.cart_item_id === existingItem.cart_item_id
          ? { ...item, quantity: newQty, total: newQty * item.unit_price }
          : item
      ));
    } else {
      setCart(prev => [...prev, {
        cart_item_id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        product_id: product.id,
        product_name: product.name,
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
  }, [cart, returnMode, playBeep]);

  const removeItem = useCallback((cartItemId) => {
    setCart(prev => prev.filter(item => item.cart_item_id !== cartItemId));
  }, []);

  const updateItemQuantity = useCallback((cartItemId, newQty) => {
    if (newQty === 0) { removeItem(cartItemId); return; }
    setCart(prev => prev.map(item => {
      if (item.cart_item_id === cartItemId) {
        const subtotal = newQty * item.unit_price;
        const discountAmount = (item.discount_percent || 0) / 100 * Math.abs(subtotal);
        return { ...item, quantity: newQty, total: subtotal - (newQty > 0 ? discountAmount : -discountAmount) };
      }
      return item;
    }));
  }, [removeItem]);

  const updateItemPrice = useCallback((cartItemId, newPrice) => {
    const price = parseFloat(newPrice) || 0;
    setCart(prev => prev.map(item => {
      if (item.cart_item_id === cartItemId) {
        const subtotal = item.quantity * price;
        const discountAmount = (item.discount_percent || 0) / 100 * Math.abs(subtotal);
        return { ...item, unit_price: price, total: subtotal - (item.quantity > 0 ? discountAmount : -discountAmount) };
      }
      return item;
    }));
  }, []);

  const updateItemDiscount = useCallback((cartItemId, discountPercent) => {
    setCart(prev => prev.map(item => {
      if (item.cart_item_id === cartItemId) {
        const subtotal = item.quantity * item.unit_price;
        const discountAmount = (parseFloat(discountPercent) || 0) / 100 * Math.abs(subtotal);
        return { ...item, discount_percent: parseFloat(discountPercent) || 0, discount: discountAmount, total: subtotal - (item.quantity > 0 ? discountAmount : -discountAmount) };
      }
      return item;
    }));
  }, []);

  const updateItemNote = useCallback((cartItemId, note) => {
    setCart(prev => prev.map(item => item.cart_item_id === cartItemId ? { ...item, note } : item));
  }, []);

  const clear = useCallback(() => {
    setCart([]);
    setDiscount(0);
    setPaidAmount(0);
    setPaymentMethod('cash');
    setPaymentType('cash');
    setPaidAmount(0);
    setMixedCash(0);
    setMixedBank(0);
    setDiscountMode('amount');
    setSaleNote('');
    setReturnMode(false);
  }, []);

  const parkCart = useCallback((customerId = null) => {  // p180: يحفظ الزبون مع السلة
    if (cart.length === 0) return;
    const snapshot = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      cart: [...cart],
      discount,
      saleNote,
      customerId,
    };
    const updated = [...parkedCarts, snapshot];
    setParkedCarts(updated);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(updated));
    clear();
    toast.success(language === 'ar' ? 'تم حفظ السلة مؤقتاً' : 'Panier mis en attente');
  }, [cart, discount, saleNote, parkedCarts, clear, language, toast]);

  const resumeParkedCart = useCallback((id) => {
    const parked = parkedCarts.find(p => p.id === id);
    if (!parked) return;
    if (cart.length > 0) {
      toast.error(language === 'ar' ? 'أفرغ السلة الحالية أولاً أو احفظها' : 'Videz le panier actuel d\'abord');
      return;
    }
    setCart(parked.cart.map(item => item.cart_item_id ? item : { ...item, cart_item_id: Date.now().toString(36) + Math.random().toString(36).slice(2) }));
    setDiscount(parked.discount || 0);
    setSaleNote(parked.saleNote || '');
    const updated = parkedCarts.filter(p => p.id !== id);
    setParkedCarts(updated);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(updated));
    toast.success(language === 'ar' ? 'تم استئناف السلة' : 'Panier repris');
  }, [parkedCarts, cart.length, language, toast]);

  const deleteParkedCart = useCallback((id) => {
    const updated = parkedCarts.filter(p => p.id !== id);
    setParkedCarts(updated);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(updated));
  }, [parkedCarts]);

  const toggleReturnMode = useCallback(() => {
    setReturnMode(prev => {
      const newMode = !prev;
      toast.info(language === 'ar'
        ? (newMode ? 'تم تفعيل وضع الإرجاع' : 'تم إلغاء وضع الإرجاع')
        : (newMode ? 'Mode retour active' : 'Mode retour desactive'));
      return newMode;
    });
  }, [language, toast]);

  // Computed values
  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);

  return {
    // State
    cart, discount, setDiscount, discountMode, setDiscountMode,
    paidAmount, setPaidAmount, paymentMethod, setPaymentMethod,
    paymentType, setPaymentType, mixedCash, setMixedCash,
    mixedBank, setMixedBank, returnMode, saleNote, setSaleNote,
    parkedCarts,
    // Computed
    subtotal,
    // Actions
    addItem, removeItem, updateItemQuantity, updateItemPrice,
    updateItemDiscount, updateItemNote, clear, parkCart,
    resumeParkedCart, deleteParkedCart, toggleReturnMode,
    playBeep,
  };
}
