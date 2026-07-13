/**
 * Permission Constants Tests
 * Phase 4g: Constants Unit Tests
 */
import {
  AVAILABLE_ROLES,
  ROLE_COLORS,
  getPermissionCategories,
  getRoleBadge,
} from '../../lib/permissionConstants';

describe('permissionConstants', () => {
  describe('AVAILABLE_ROLES', () => {
    it('should have 8 roles defined', () => {
      expect(AVAILABLE_ROLES).toHaveLength(8);
    });

    it('should have admin as first role', () => {
      expect(AVAILABLE_ROLES[0].value).toBe('admin');
      expect(AVAILABLE_ROLES[0].label_ar).toBe('مدير');
    });

    it('should have seller role', () => {
      const seller = AVAILABLE_ROLES.find(r => r.value === 'seller');
      expect(seller).toBeDefined();
      expect(seller.label_fr).toBe('Vendeur');
    });
  });

  describe('ROLE_COLORS', () => {
    it('should have colors for all major roles', () => {
      expect(ROLE_COLORS.admin).toContain('red');
      expect(ROLE_COLORS.seller).toContain('green');
      expect(ROLE_COLORS.manager).toContain('blue');
    });

    it('should include dark mode variants', () => {
      expect(ROLE_COLORS.admin).toContain('dark:');
    });
  });

  describe('getPermissionCategories', () => {
    it('should return 22 categories', () => {
      const cats = getPermissionCategories('ar');
      expect(cats).toHaveLength(22);
    });

    it('should include dashboard as simple permission', () => {
      const cats = getPermissionCategories('ar');
      const dashboard = cats.find(c => c.key === 'dashboard');
      expect(dashboard.simple).toBe(true);
    });

    it('should include products with actions', () => {
      const cats = getPermissionCategories('ar');
      const products = cats.find(c => c.key === 'products');
      expect(products.simple).toBe(false);
      expect(products.actions).toContain('view');
      expect(products.actions).toContain('delete');
    });

    it('should use Arabic labels', () => {
      const cats = getPermissionCategories('ar');
      expect(cats.find(c => c.key === 'sales').label).toBe('المبيعات');
    });

    it('should use French labels', () => {
      const cats = getPermissionCategories('fr');
      expect(cats.find(c => c.key === 'sales').label).toBe('Sales');
    });
  });

  describe('getRoleBadge', () => {
    it('should return correct badge for admin', () => {
      const badge = getRoleBadge('admin', 'ar');
      expect(badge.label).toBe('مدير');
      expect(badge.colorClass).toContain('red');
    });

    it('should return correct badge for seller', () => {
      const badge = getRoleBadge('seller', 'fr');
      expect(badge.label).toBe('Vendeur');
      expect(badge.colorClass).toContain('green');
    });

    it('should fallback for unknown role', () => {
      const badge = getRoleBadge('unknown', 'ar');
      expect(badge.label).toBe('مستخدم');
    });
  });
});
