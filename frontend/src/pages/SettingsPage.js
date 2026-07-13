/**
 * SettingsPage - System Settings (Refactored)
 * Before: Fetched data for all tabs (Feature Envy) | After: Pure Tabs wrapper
 * Refactoring: Extract Hook, Feature Envy -> Move Method
 * Following Martin Fowler's Refactoring patterns
 * 
 * Each tab is now self-contained and responsible for its own data fetching.
 * To add a new tab, simply add an entry in hooks/useSettingsTabs.js
 */
import { lazy, Suspense, useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { LoadingState } from '../components/LoadingState';
import { useLanguage } from '../contexts/LanguageContext';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '../components/ui/tabs';

// === Extracted Hook (Refactoring: Extract Hook) ===
import { useSettingsTabs } from '../hooks/useSettingsTabs';

// BackupSystem is eagerly loaded (heavy component)
import { BackupSystem } from '../components/BackupSystem';

// Lazy-loaded tab components (code-splitting)
const PermissionsTab = lazy(() => import('./settings/PermissionsTab'));
const WhatsAppTab = lazy(() => import('./settings/WhatsAppTab'));
const PrinterTab = lazy(() => import('./settings/PrinterTab'));
const UsbTab = lazy(() => import('./settings/UsbTab'));
const EmailTab = lazy(() => import('./settings/EmailTab'));
const SoundTab = lazy(() => import('./settings/SoundTab'));
const SystemTab = lazy(() => import('./settings/SystemTab'));
const BrandingTab = lazy(() => import('./settings/BrandingTab'));
const BridgeTab = lazy(() => import('./settings/BridgeTab'));

const TabLoader = () => <LoadingState className="h-32" />;

// Tab component registry (maps tab IDs to components)
const TAB_COMPONENTS = {
  permissions: PermissionsTab,
  branding: BrandingTab,
  backup: BackupSystem,
  whatsapp: WhatsAppTab,
  printer: PrinterTab,
  usb: UsbTab,
  email: EmailTab,
  sound: SoundTab,
  system: SystemTab,
  bridge: BridgeTab,
};

export default function SettingsPage() {
  const { t, language } = useLanguage();
  const { getVisibleTabs, getGridCols, checkSelfBridge } = useSettingsTabs();

  // Self-bridge detection (Primitive Obsession -> isolated concern)
  const [isSelfBridge, setIsSelfBridge] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const detectBridge = async () => {
      const enabled = await checkSelfBridge(apiClient);
      if (mounted) {
        setIsSelfBridge(enabled);
        setLoading(false);
      }
    };
    detectBridge();
    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Get visible tabs based on conditions
  const visibleTabs = getVisibleTabs(isSelfBridge, language, t);
  const gridCols = getGridCols(visibleTabs.length);

  if (loading) {
    return (
      <Layout>
        <LoadingState className="h-64" />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="settings-page">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">{t.systemSettings}</h1>
          <p className="text-muted-foreground">
            {language === 'ar' 
              ? 'إدارة صلاحيات المستخدمين وإعدادات النظام' 
              : 'Manage user permissions and system settings'}
          </p>
        </div>

        {/* Tabs - Dynamic based on visibleTabs configuration */}
        <Tabs defaultValue="permissions" className="space-y-6">
          {/* Tab Triggers - Generated dynamically */}
          <TabsList className={`grid w-full max-w-5xl ${gridCols}`} data-testid="settings-tabs">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              return (
                <TabsTrigger 
                  key={tab.id} 
                  value={tab.id} 
                  className="gap-2" 
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Tab Contents - Generated dynamically */}
          {visibleTabs.map(tab => {
            const TabComponent = TAB_COMPONENTS[tab.id];
            if (!TabComponent) return null;

            return (
              <TabsContent key={tab.id} value={tab.id} className="space-y-6">
                {tab.needsSuspense ? (
                  <Suspense fallback={<TabLoader />}>
                    <TabComponent />
                  </Suspense>
                ) : (
                  <TabComponent />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </Layout>
  );
}
