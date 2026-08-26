/**
 * usePOSCart - Shopping Cart State Management Hook
 * Extracted from POSPage.js (Refactoring: Extract Hook)
 * Addresses: Large Class, Data Clumps, Feature Envy
 */
import { useState, useCallback, useEffect } from 'react';
import { getTierPrice } from '../lib/priceTiers';

const CART_STORAGE_KEY = 'posParkedCarts';

// p215: the ACTIVE cart survives navigation between pages (and reloads).
// Scoped per user so two logins on the same browser never share a cart.
const ACTIVE_CART_KEY = (() => {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    return 'posActiveCart:' + ((u && u.id) || 'anon');
  } catch { return 'posActiveCart:anon'; }
})();

const loadActiveCart = () => {
  try { return JSON.parse(localStorage.getItem(ACTIVE_CART_KEY) || 'null') || {}; } catch { return {}; }
};

export function usePOSCart({ language, toast }) {
  const [snapshot] = useState(loadActiveCart);  // p215: read once at mount
  const [cart, setCart] = useState(snapshot.cart || []);
  const [discount, setDiscount] = useState(snapshot.discount || 0);
  const [discountMode, setDiscountMode] = useState(snapshot.discountMode || 'amount');
  const [paidAmount, setPaidAmount] = useState(snapshot.paidAmount || 0);
  const [paymentMethod, setPaymentMethod] = useState(snapshot.paymentMethod || 'cash');
  const [paymentType, setPaymentType] = useState(snapshot.paymentType || 'cash');
  const [mixedCash, setMixedCash] = useState(snapshot.mixedCash || 0);
  const [mixedBank, setMixedBank] = useState(snapshot.mixedBank || 0);
  const [returnMode, setReturnMode] = useState(snapshot.returnMode || false);
  const [saleNote, setSaleNote] = useState(snapshot.saleNote || '');

  // p215: write-through persistence — every cart change is saved instantly
  useEffect(() => {
    try {
      if (cart.length === 0) {
        localStorage.removeItem(ACTIVE_CART_KEY);
        return;
      }
      localStorage.setItem(ACTIVE_CART_KEY, JSON.stringify({
        cart, discount, discountMode, paidAmount, paymentMethod, paymentType,
        mixedCash, mixedBank, returnMode, saleNote,
      }));
    } catch { /* storage blocked/full — cart just won't persist */ }
  }, [cart, discount, discountMode, paidAmount, paymentMethod, paymentType,
      mixedCash, mixedBank, returnMode, saleNote]);

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
    const { overrideQty, overridePrice, serialNumber, priceType, variant, modifiers } = options;
    // p184: variant lines are distinct cart lines (same product, different color/size)
    const vKey = variant ? `${variant.color || ''}|${variant.size || ''}` : '';
    // p308: modifier selections make a distinct cart line and adjust the price
    const mKey = modifiers && modifiers.length ? modifiers.map(m => `${m.group}:${m.option}`).join('|') : '';
    const existingItem = cart.find(item => item.product_id === product.id && (item._vkey || '') === vKey && (item._mkey || '') === mKey);
    const modDelta = modifiers && modifiers.length ? modifiers.reduce((acc, m) => acc + (Number(m.price_delta) || 0), 0) : 0;
    const basePrice = (overridePrice != null ? overridePrice : getTierPrice(product, priceType)) + modDelta;
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
      const vLabel = vKey ? [variant.color, variant.size].filter(Boolean).join(' / ') : '';
      const mLabel = mKey ? ' +' + modifiers.map(m => m.option).join(' +') : '';
      setCart(prev => [...prev, {
        cart_item_id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        product_id: product.id,
        product_name: product.name + (vLabel ? ` - ${vLabel}` : '') + mLabel,
        variant: variant ? { color: variant.color || '', size: variant.size || '' } : null,
        modifiers: modifiers || null,  // p308
        _vkey: vKey,
        _mkey: mKey,
        barcode: product.barcode,
        article_code: product.article_code,
        quantity: qty,
        unit_price: basePrice,
        discount: 0,
        discount_percent: 0,
        total: qty * basePrice,
        available_stock: variant ? variant.quantity : product.quantity,
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
    try { localStorage.removeItem(ACTIVE_CART_KEY); } catch { /* p215 */ }
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
