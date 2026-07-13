/**
 * usePOSCart Hook Tests
 * Phase 4b: Unit Tests for Shopping Cart Hook
 * Following Arrange-Act-Assert pattern
 */
import { renderHook, act } from '@testing-library/react-hooks';
import { usePOSCart } from '../../hooks/usePOSCart';
import { createMockProduct, createMockToast } from '../testUtils';

describe('usePOSCart', () => {
  const mockToast = createMockToast();
  const defaultProps = { language: 'ar', toast: mockToast };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.getItem.mockReturnValue('[]');
  });

  // ── Initialization ──────────────────────────────────────────────
  describe('Initialization', () => {
    it('should initialize with empty cart', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      expect(result.current.cart).toEqual([]);
      expect(result.current.subtotal).toBe(0);
      expect(result.current.discount).toBe(0);
      expect(result.current.returnMode).toBe(false);
    });

    it('should load parked carts from localStorage', () => {
      const parked = [{ id: 1, cart: [], discount: 0, saleNote: '' }];
      localStorage.getItem.mockReturnValue(JSON.stringify(parked));
      const { result } = renderHook(() => usePOSCart(defaultProps));
      expect(result.current.parkedCarts).toEqual(parked);
    });
  });

  // ── addItem ──────────────────────────────────────────────────────
  describe('addItem', () => {
    it('should add a product to cart', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1', retail_price: 150 });

      act(() => { result.current.addItem(product); });

      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0].product_id).toBe('p1');
      expect(result.current.cart[0].unit_price).toBe(150);
      expect(result.current.subtotal).toBe(150);
    });

    it('should increase quantity for existing product', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.addItem(product); });
      act(() => { result.current.addItem(product); });

      expect(result.current.cart).toHaveLength(1);
      expect(result.current.cart[0].quantity).toBe(2);
      expect(result.current.cart[0].total).toBe(200);
    });

    it('should use wholesale price when specified', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1', wholesale_price: 75 });

      act(() => { result.current.addItem(product, { priceType: 'wholesale' }); });

      expect(result.current.cart[0].unit_price).toBe(75);
    });

    it('should add item with custom price', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.addItem(product, { overridePrice: 200 }); });

      expect(result.current.cart[0].unit_price).toBe(200);
      expect(result.current.cart[0].total).toBe(200);
    });

    it('should add item with custom quantity', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.addItem(product, { overrideQty: 5 }); });

      expect(result.current.cart[0].quantity).toBe(5);
      expect(result.current.cart[0].total).toBe(500);
    });

    it('should add item with serial number as separate entry', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.addItem(product, { serialNumber: 'SN123' }); });

      expect(result.current.cart[0].serial_number).toBe('SN123');
    });
  });

  // ── removeItem ───────────────────────────────────────────────────
  describe('removeItem', () => {
    it('should remove an item from cart', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.addItem(product); });
      const itemId = result.current.cart[0].cart_item_id;
      act(() => { result.current.removeItem(itemId); });

      expect(result.current.cart).toHaveLength(0);
    });
  });

  // ── updateItemQuantity ───────────────────────────────────────────
  describe('updateItemQuantity', () => {
    it('should update item quantity', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.addItem(product); });
      const itemId = result.current.cart[0].cart_item_id;
      act(() => { result.current.updateItemQuantity(itemId, 5); });

      expect(result.current.cart[0].quantity).toBe(5);
      expect(result.current.cart[0].total).toBe(500);
    });

    it('should remove item when quantity is 0', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.addItem(product); });
      const itemId = result.current.cart[0].cart_item_id;
      act(() => { result.current.updateItemQuantity(itemId, 0); });

      expect(result.current.cart).toHaveLength(0);
    });
  });

  // ── updateItemPrice ──────────────────────────────────────────────
  describe('updateItemPrice', () => {
    it('should update item price', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.addItem(product); });
      const itemId = result.current.cart[0].cart_item_id;
      act(() => { result.current.updateItemPrice(itemId, 200); });

      expect(result.current.cart[0].unit_price).toBe(200);
      expect(result.current.cart[0].total).toBe(200);
    });
  });

  // ── updateItemDiscount ───────────────────────────────────────────
  describe('updateItemDiscount', () => {
    it('should apply percentage discount', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.addItem(product, { overrideQty: 2 }); });
      const itemId = result.current.cart[0].cart_item_id;
      act(() => { result.current.updateItemDiscount(itemId, 10); });

      expect(result.current.cart[0].discount_percent).toBe(10);
      expect(result.current.cart[0].total).toBe(180); // 200 - 10%
    });
  });

  // ── clear ────────────────────────────────────────────────────────
  describe('clear', () => {
    it('should clear all cart state', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => {
        result.current.addItem(product);
        result.current.setDiscount(50);
        result.current.setSaleNote('Test note');
      });
      act(() => { result.current.clear(); });

      expect(result.current.cart).toHaveLength(0);
      expect(result.current.discount).toBe(0);
      expect(result.current.saleNote).toBe('');
      expect(result.current.paymentType).toBe('cash');
      expect(result.current.returnMode).toBe(false);
    });
  });

  // ── toggleReturnMode ─────────────────────────────────────────────
  describe('toggleReturnMode', () => {
    it('should toggle return mode', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));

      act(() => { result.current.toggleReturnMode(); });
      expect(result.current.returnMode).toBe(true);

      act(() => { result.current.toggleReturnMode(); });
      expect(result.current.returnMode).toBe(false);
    });

    it('should add negative quantity in return mode', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.toggleReturnMode(); });
      act(() => { result.current.addItem(product); });

      expect(result.current.cart[0].quantity).toBe(-1);
      expect(result.current.cart[0].is_return).toBe(true);
    });
  });

  // ── parkCart / resumeParkedCart ──────────────────────────────────
  describe('parkCart', () => {
    it('should save current cart to parked carts', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.addItem(product); });
      act(() => { result.current.parkCart(); });

      expect(result.current.parkedCarts).toHaveLength(1);
      expect(result.current.cart).toHaveLength(0); // Cart cleared
      expect(localStorage.setItem).toHaveBeenCalled();
    });

    it('should not park empty cart', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));

      act(() => { result.current.parkCart(); });

      expect(result.current.parkedCarts).toHaveLength(0);
    });
  });

  describe('resumeParkedCart', () => {
    it('should resume a parked cart', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const product = createMockProduct({ id: 'p1' });

      act(() => { result.current.addItem(product); });
      act(() => { result.current.parkCart(); });
      const parkedId = result.current.parkedCarts[0].id;

      act(() => { result.current.resumeParkedCart(parkedId); });

      expect(result.current.cart).toHaveLength(1);
      expect(result.current.parkedCarts).toHaveLength(0);
    });

    it('should not resume if cart is not empty', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));
      const p1 = createMockProduct({ id: 'p1' });
      const p2 = createMockProduct({ id: 'p2' });

      act(() => { result.current.addItem(p1); });
      act(() => { result.current.parkCart(); });
      const parkedId = result.current.parkedCarts[0].id;
      act(() => { result.current.addItem(p2); });

      act(() => { result.current.resumeParkedCart(parkedId); });

      expect(mockToast.error).toHaveBeenCalled();
      expect(result.current.cart).toHaveLength(1);
    });
  });

  // ── Computed values ──────────────────────────────────────────────
  describe('Computed values', () => {
    it('should calculate subtotal correctly', () => {
      const { result } = renderHook(() => usePOSCart(defaultProps));

      act(() => { result.current.addItem(createMockProduct({ id: 'p1' }), { overrideQty: 3 }); });
      act(() => { result.current.addItem(createMockProduct({ id: 'p2' }), { overrideQty: 2 }); });

      expect(result.current.subtotal).toBe(500); // 300 + 200
    });
  });
});
