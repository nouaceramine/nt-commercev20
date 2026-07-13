/**
 * Test Utilities - Shared helpers for all tests
 * Phase 4: Testing Infrastructure
 */
import { renderHook } from '@testing-library/react-hooks';

/**
 * Creates a mock product for cart testing
 */
export function createMockProduct(overrides = {}) {
  return {
    id: `prod-${Math.random().toString(36).slice(2)}`,
    name: 'Test Product',
    name_ar: 'منتج تجريبي',
    name_en: 'Test Product',
    barcode: '123456789',
    article_code: 'TEST-001',
    retail_price: 100,
    wholesale_price: 80,
    quantity: 50,
    fixed_price: false,
    ...overrides,
  };
}

/**
 * Creates a mock cart item
 */
export function createMockCartItem(overrides = {}) {
  return {
    cart_item_id: `item-${Math.random().toString(36).slice(2)}`,
    product_id: 'prod-1',
    product_name: 'Test Product',
    barcode: '123456789',
    article_code: 'TEST-001',
    quantity: 2,
    unit_price: 100,
    discount: 0,
    discount_percent: 0,
    total: 200,
    available_stock: 50,
    is_return: false,
    is_fixed_price: false,
    serial_number: '',
    ...overrides,
  };
}

/**
 * Creates mock session data
 */
export function createMockSession(overrides = {}) {
  return {
    id: 'session-1',
    code: 'S001',
    opening_cash: 5000,
    closing_cash: 0,
    opened_at: new Date().toISOString(),
    closed_at: null,
    status: 'open',
    notes: '',
    ...overrides,
  };
}

/**
 * Creates a mock toast object
 */
export function createMockToast() {
  return {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  };
}

/**
 * Creates a mock API client
 */
export function createMockApiClient() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
}

/**
 * Helper to wait for async hook updates
 */
export async function waitForHook(callback, options = { timeout: 1000 }) {
  const { waitFor } = require('@testing-library/react');
  await waitFor(callback, options);
}
