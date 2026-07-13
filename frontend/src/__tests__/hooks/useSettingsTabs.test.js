/**
 * useSettingsTabs Hook Tests
 * Phase 4g: Hook Unit Tests
 */
import { renderHook } from '@testing-library/react-hooks';
import { useSettingsTabs, getVisibleTabs, getGridCols } from '../../hooks/useSettingsTabs';

describe('useSettingsTabs', () => {
  describe('getVisibleTabs', () => {
    it('should return all tabs except bridge when not self-bridge', () => {
      const tabs = getVisibleTabs(false, 'ar', {});
      expect(tabs.length).toBe(9); // 10 total - bridge excluded
      expect(tabs.find(t => t.id === 'bridge')).toBeUndefined();
    });

    it('should include bridge tab when self-bridge is enabled', () => {
      const tabs = getVisibleTabs(true, 'ar', {});
      expect(tabs.length).toBe(10);
      expect(tabs.find(t => t.id === 'bridge')).toBeDefined();
    });

    it('should use Arabic labels when language is ar', () => {
      const tabs = getVisibleTabs(false, 'ar', {});
      const permissionsTab = tabs.find(t => t.id === 'permissions');
      expect(permissionsTab.label).toBe('الصلاحيات');
    });

    it('should use French labels when language is fr', () => {
      const tabs = getVisibleTabs(false, 'fr', {});
      const permissionsTab = tabs.find(t => t.id === 'permissions');
      expect(permissionsTab.label).toBe('Permissions');
    });

    it('should use translation object labels when provided', () => {
      const tabs = getVisibleTabs(false, 'ar', { permissions: 'Custom' });
      const permissionsTab = tabs.find(t => t.id === 'permissions');
      expect(permissionsTab.label).toBe('Custom');
    });
  });

  describe('getGridCols', () => {
    it('should return correct grid class for each count', () => {
      expect(getGridCols(1)).toBe('grid-cols-1');
      expect(getGridCols(5)).toBe('grid-cols-5');
      expect(getGridCols(9)).toBe('grid-cols-9');
      expect(getGridCols(10)).toBe('grid-cols-10');
    });

    it('should fallback to grid-cols-9 for unknown counts', () => {
      expect(getGridCols(99)).toBe('grid-cols-9');
    });
  });

  describe('useSettingsTabs hook', () => {
    it('should expose all utilities', () => {
      const { result } = renderHook(() => useSettingsTabs());
      expect(result.current.TABS_CONFIG).toBeDefined();
      expect(result.current.getVisibleTabs).toBeDefined();
      expect(result.current.getGridCols).toBeDefined();
      expect(result.current.checkSelfBridge).toBeDefined();
    });
  });
});
