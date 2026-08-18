/**
 * useSettingsTabs - Settings Tabs Configuration & Data Hook
 * Extracted from SettingsPage.js (Refactoring: Feature Envy -> Move Method)
 * Addresses: Feature Envy, Data Clumps, Shotgun Surgery
 * 
 * Each tab is now self-configured. Adding a new tab only requires
 * adding an entry to the TABS_CONFIG array.
 */
import { lazy } from 'react';
import {
  Shield, Database, MessageCircle, Printer, Usb, 
  Mail, Volume2, Settings, Image, Wifi, Scale
} from 'lucide-react';
import { BackupSystem } from '../components/BackupSystem';

// Lazy-loaded tab components
const PermissionsTab = lazy(() => import('../pages/settings/PermissionsTab'));
const WhatsAppTab = lazy(() => import('../pages/settings/WhatsAppTab'));
const PrinterTab = lazy(() => import('../pages/settings/PrinterTab'));
const UsbTab = lazy(() => import('../pages/settings/UsbTab'));
const EmailTab = lazy(() => import('../pages/settings/EmailTab'));
const SoundTab = lazy(() => import('../pages/settings/SoundTab'));
const SystemTab = lazy(() => import('../pages/settings/SystemTab'));
const BrandingTab = lazy(() => import('../pages/settings/BrandingTab'));
const BridgeTab = lazy(() => import('../pages/settings/BridgeTab'));
const ScaleTab = lazy(() => import('../pages/settings/ScaleTab'));

/**
 * Tab configuration registry.
 * To add a new tab, simply add an entry here.
 * No need to modify SettingsPage.js anymore!
 */
const TABS_CONFIG = [
  {
    id: 'permissions',
    icon: Shield,
    labelKey: 'permissions',
    labelAr: 'الصلاحيات',
    labelFr: 'Permissions',
    component: PermissionsTab,
    needsSuspense: true,
    condition: () => true, // always shown
  },
  {
    id: 'branding',
    icon: Image,
    labelKey: 'branding',
    labelAr: 'العلامة',
    labelFr: 'Marque',
    component: BrandingTab,
    needsSuspense: true,
    condition: () => true,
  },
  {
    id: 'backup',
    icon: Database,
    labelKey: 'backup',
    labelAr: 'النسخ الاحتياطي',
    labelFr: 'Sauvegarde',
    component: BackupSystem,
    needsSuspense: false, // BackupSystem is not lazy-loaded
    condition: () => true,
  },
  {
    id: 'whatsapp',
    icon: MessageCircle,
    labelKey: 'whatsapp',
    labelAr: 'واتساب',
    labelFr: 'WhatsApp',
    component: WhatsAppTab,
    needsSuspense: true,
    condition: () => true,
  },
  {
    id: 'printer',
    icon: Printer,
    labelKey: 'printer',
    labelAr: 'الطابعة',
    labelFr: 'Imprimante',
    component: PrinterTab,
    needsSuspense: true,
    condition: () => true,
  },
  {
    id: 'usb',
    icon: Usb,
    labelKey: 'usb',
    labelAr: 'شرائح USB',
    labelFr: 'SIM USB',
    component: UsbTab,
    needsSuspense: true,
    condition: () => true,
  },
  {
    id: 'email',
    icon: Mail,
    labelKey: 'email',
    labelAr: 'البريد',
    labelFr: 'Email',
    component: EmailTab,
    needsSuspense: true,
    condition: () => true,
  },
  {
    id: 'sound',
    icon: Volume2,
    labelKey: 'sound',
    labelAr: 'الصوت',
    labelFr: 'Son',
    component: SoundTab,
    needsSuspense: true,
    condition: () => true,
  },
  {
    id: 'system',
    icon: Settings,
    labelKey: 'system',
    labelAr: 'النظام',
    labelFr: 'Système',
    component: SystemTab,
    needsSuspense: true,
    condition: () => true,
  },
  {
    id: 'scale',
    icon: Scale,
    labelKey: 'scale',
    labelAr: 'الميزان',
    labelFr: 'Balance',
    component: ScaleTab,
    needsSuspense: true,
    condition: () => true,
  },
  {
    id: 'bridge',
    icon: Wifi,
    labelKey: 'bridge',
    labelAr: 'الجسر',
    labelFr: 'Bridge',
    component: BridgeTab,
    needsSuspense: true,
    // Only shown when self-bridge mode is enabled
    condition: (isSelfBridge) => isSelfBridge,
  },
];

/**
 * Get visible tabs based on conditions
 */
export function getVisibleTabs(isSelfBridge = false, language = 'ar', t = {}) {
  return TABS_CONFIG
    .filter(tab => tab.condition(isSelfBridge))
    .map(tab => ({
      ...tab,
      // Resolve label based on language
      label: t[tab.labelKey] || (language === 'ar' ? tab.labelAr : tab.labelFr),
    }));
}

/**
 * Get total column count for TabsList grid
 */
export function getGridCols(visibleTabsCount) {
  // Map tab count to grid columns
  const gridMap = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
    7: 'grid-cols-7',
    8: 'grid-cols-8',
    9: 'grid-cols-9',
    10: 'grid-cols-10',
    11: 'grid-cols-11',
  };
  return gridMap[visibleTabsCount] || 'grid-cols-9';
}

/**
 * Hook for settings tabs state management
 */
export function useSettingsTabs() {
  /**
   * Check if self-bridge mode is enabled
   * Each tab that needs bridge data can fetch it independently
   */
  const checkSelfBridge = async (apiClient) => {
    try {
      const res = await apiClient.get('/settings/bridge-config');
      return res.data?.recharge_mode === 'self_bridge';
    } catch {
      return false;
    }
  };

  return {
    TABS_CONFIG,
    getVisibleTabs,
    getGridCols,
    checkSelfBridge,
  };
}
