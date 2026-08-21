import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DateFormatProvider } from "./contexts/DateFormatContext";
import { FeatureFlagProvider } from "./contexts/FeatureFlagContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { defaultMenuSections } from "./config/sidebarMenu";
import FeatureDisabledPage from "./components/FeatureDisabledPage";
import AccessDeniedPage from "./pages/AccessDeniedPage";

// Import global date formatter to apply Western numerals system-wide
import './utils/globalDateFormatter';

// Initialize global error logger (capture frontend errors to /api/system-logs)
import { initErrorLogger, attachAxiosLogger } from './utils/errorLogger';
import apiClient from './lib/apiClient';
initErrorLogger();
attachAxiosLogger(apiClient);

// Derive cashier-allowed paths from sidebarMenu.js (single source of truth via minRole)
const CASHIER_ALLOWED_PATHS = defaultMenuSections.flatMap(section =>
  section.items.filter(item => item.minRole === 'cashier').map(item => item.path)
);

// Pages
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import ProductDetailPage from "./pages/store/ProductDetailPage";
import StoreLandingPage from "./pages/store/StoreLandingPage";
import OrderTrackingPage from "./pages/store/OrderTrackingPage";
import AddProductPage from "./pages/AddProductPage";
import EditProductPage from "./pages/EditProductPage";
import UsersPage from "./pages/UsersPage";
import POSPage from "./pages/POSPage";
import CustomersPage from "./pages/CustomersPage";
import SuppliersPage from "./pages/SuppliersPage";
import CashManagementPage from "./pages/CashManagementPage";
import SalesHistoryPage from "./pages/SalesHistoryPage";
import InstallmentsPage from "./pages/InstallmentsPage";
import EmployeesPage from "./pages/EmployeesPage";
import EmployeeActivityPage from "./pages/EmployeeActivityPage";
import DebtsPage from "./pages/DebtsPage";
import ReportsPage from "./pages/ReportsPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import RechargePage from "./pages/RechargePage";
import DigitalPanelPage from "./pages/DigitalPanelPage";
import IptvSubscriptionsPage from "./pages/IptvSubscriptionsPage";
import ResellersPage from "./pages/ResellersPage";
import DigitalServicesCatalogPage from "./pages/DigitalServicesCatalogPage";
import ProductFamiliesPage from "./pages/ProductFamiliesPage";
import CustomerDebtsPage from "./pages/CustomerDebtsPage";
import SettingsPage from "./pages/SettingsPage";
import BulkPriceUpdatePage from "./pages/BulkPriceUpdatePage";
import PurchasesPage from "./pages/PurchasesPage";
import WarehousesPage from "./pages/WarehousesPage";
import InventoryCountPage from "./pages/InventoryCountPage";
import BarcodePrintPage from "./pages/BarcodePrintPage";
import DailySessionsPage from "./pages/DailySessionsPage";
import CustomerFamiliesPage from "./pages/CustomerFamiliesPage";
import SupplierFamiliesPage from "./pages/SupplierFamiliesPage";
import WooCommercePage from "./pages/WooCommercePage";
import ShippingPage from "./pages/ShippingPage";
import SimManagementPage from "./pages/SimManagementPage";
import TelecomStockPage from "./pages/TelecomStockPage";
import AdvancedAnalyticsPage from "./pages/AdvancedAnalyticsPage";
import LoyaltyPage from "./pages/LoyaltyPage";
import WholesaleServicesPage from "./pages/WholesaleServicesPage";
import FlexyServicePage from "./pages/FlexyServicePage";
import IdoomServicePage from "./pages/IdoomServicePage";
import CardsServicePage from "./pages/CardsServicePage";
import OperationsPage from "./pages/OperationsPage";
import ProfitRatesPage from "./pages/ProfitRatesPage";
import TransfersPage from "./pages/TransfersPage";
import PhoneDirectoryPage from "./pages/PhoneDirectoryPage";
import SidebarSettingsPage from "./pages/SidebarSettingsPage";
import RepairReceptionPage from "./pages/RepairReceptionPage";
import RepairTrackingPage from "./pages/RepairTrackingPage";
import SparePartsPage from "./pages/SparePartsPage";
import ExpensesPage from "./pages/ExpensesPage";
import PartnersPage from "./pages/PartnersPage";
import RentalsPage from "./pages/RentalsPage";
import ProductionPage from "./pages/ProductionPage";  // p188
import AccountingPage from "./pages/AccountingPage";  // p196
import NotificationsPage from "./pages/NotificationsPage";
import AdvancedSalesReportPage from "./pages/AdvancedSalesReportPage";
import SalesPermissionsPage from "./pages/SalesPermissionsPage";
import PriceHistoryPage from "./pages/PriceHistoryPage";
import ExpiryReportPage from "./pages/ExpiryReportPage";
import SmartReportsPage from "./pages/SmartReportsPage";
import EmployeeAlertsPage from "./pages/EmployeeAlertsPage";
import FeaturesPage from "./pages/FeaturesPage";
import PermissionsPage from "./pages/PermissionsPage";
import SystemUpdatesPage from "./pages/SystemUpdatesPage";
import AgentDashboardPage from "./pages/AgentDashboardPage";
import UnifiedLoginPage from "./pages/UnifiedLoginPage";
// p160: TenantDashboardPage merged into DashboardPage (route redirects to /)
import EmailNotificationsPage from "./pages/EmailNotificationsPage";
import PaymentsPage from "./pages/PaymentsPage";

// E-Commerce Hub (P1+, gated by ecommerce_hub feature flag)
import EcomHubPage from "./pages/ecom/EcomHubPage";
import EcomHubShell from "./pages/ecom/EcomHubShell";
import EcomChannelsPage from "./pages/ecom/EcomChannelsPage";
import EcomGuidePage from "./pages/ecom/EcomGuidePage";
import EcomAnalyticsPage from "./pages/ecom/EcomAnalyticsPage";
import EcomStoreTab from "./pages/ecom/EcomStoreTab";
import DigitalServicesPage from "./pages/digital/DigitalServicesPage";
import DigitalAdminPage from "./pages/digital/DigitalAdminPage";
import EcomAdsTab from "./pages/ecom/EcomAdsTab";
import EcomShippingTab from "./pages/ecom/EcomShippingTab";

// AI & Smart Accounting Pages
// p160: SmartDashboardPage merged into DashboardPage (route redirects to /)
import AIChatPage from "./pages/AIChatPage";
import AIAgentsPage from "./pages/AIAgentsPage";
import DateTimeSettingsPage from "./pages/DateTimeSettingsPage";

// New Feature Pages
import WhatsAppPage from "./pages/WhatsAppPage";
import IntegrationStatusPage from "./pages/IntegrationStatusPage";
import TaxReportsPage from "./pages/TaxReportsPage";
import CurrenciesPage from "./pages/CurrenciesPage";
import BankingPage from "./pages/BankingPage";
import RobotsPage from "./pages/RobotsPage";
import AutoReportsPage from "./pages/AutoReportsPage";
import CommissionsPage from "./pages/CommissionsPage";  // p221
import MarginRulesPage from "./pages/MarginRulesPage";  // p223

// Legendary Build Pages
import DefectiveGoodsPage from "./pages/DefectiveGoodsPage";
import BackupSystemPage from "./pages/BackupSystemPage";
import SecurityDashboardPage from "./pages/SecurityDashboardPage";
import WalletPage from "./pages/WalletPage";
import TaskManagementPage from "./pages/TaskManagementPage";
import InternalChatPage from "./pages/InternalChatPage";
import SupplierTrackingPage from "./pages/SupplierTrackingPage";
import TwoFactorPage from "./pages/TwoFactorPage";
import SmartNotificationsPage from "./pages/SmartNotificationsPage";

// Landing & SaaS Pages
import LandingPage from "./pages/landing/LandingPage";
import SaasRegisterPage from "./pages/landing/RegisterPage";
import VerifyEmailPage from "./pages/landing/VerifyEmailPage"; // p156
import PricingPage from "./pages/landing/PricingPage";
import SaasAdminPage from "./pages/admin/SaasAdminPage";
import FeatureFlagsPage from "./pages/admin/FeatureFlagsPage";
import SystemLogsPage from "./pages/SystemLogsPage";
import SupplierAdminPage from "./pages/admin/SupplierAdminPage";
import EventBusDashboard from "./pages/admin/EventBusDashboard";
import SaasPaymentsPage from "./pages/admin/saas/PaymentsPage";
import SaasPlansPage from "./pages/admin/saas/PlansPage";
import SaasTenantDebtsPage from "./pages/admin/saas/TenantDebtsPage";
import SaasAuditTimelinePage from "./pages/admin/saas/AuditTimelinePage";
import SaasSubscribersPage from "./pages/admin/saas/SubscribersPage";
import SaasAgentsPage from "./pages/admin/saas/AgentsPage";
import SaasEmailSettingsPage from "./pages/admin/saas/EmailSettingsPage";
import AutoHealPage from "./pages/admin/saas/AutoHealPage";
import StoreManagementPage from "./pages/store/StoreManagementPage";
import PublicStorePage from "./pages/store/PublicStorePage";
import DataImportExportPage from "./pages/DataImportExportPage";
import ImportDataPage from "./pages/ImportDataPage";  // p151
import MotherboardPage from "./pages/MotherboardPage";
import TemplateEditorPage from "./pages/settings/TemplateEditorPage";
import DailyReportPage from "./pages/DailyReportPage";


// Protected Route Component
const ProtectedRoute = ({ children, adminOnly = false, tenantOnly = false, superAdminOnly = false, cashierBlocked = false, featureKey = null }) => {
  const { isAuthenticated, loading, isAdmin, isSuperAdmin, isEffectiveSuperAdmin, isTenant, isCashier, user, isFeatureEnabled } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/portal" replace />;
  }

  // Super Admin should only access platform-level pages
  const superAdminAllowedPaths = [
    '/saas-admin', '/system-updates', '/robots', '/auto-reports',
    '/security-dashboard', '/backup-system', '/wallet-management',
    '/payments', '/motherboard', '/data-import-export', '/system-logs',
    '/settings', '/feature-flags',
  ];
  if (isSuperAdmin && !superAdminAllowedPaths.some(p => window.location.pathname.startsWith(p))) {
    return <Navigate to="/saas-admin" replace />;
  }

  // Tenant should not access /saas-admin
  if (isTenant && window.location.pathname.startsWith('/saas-admin')) {
    return <Navigate to="/" replace />;
  }

  // Cashier role: show the Access Denied page for any blocked path
  if (isCashier) {
    const path = window.location.pathname;
    const allowed = CASHIER_ALLOWED_PATHS.some(p => p === '/pos' ? path === '/pos' || path.startsWith('/pos/') : path.startsWith(p));
    if (!allowed || cashierBlocked) {
      return <AccessDeniedPage />;
    }
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (tenantOnly && !isTenant) {
    return <Navigate to="/" replace />;
  }

  if (superAdminOnly && !isEffectiveSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  // Feature gate: super admins bypass this check (isFeatureEnabled already handles it)
  if (featureKey && !isFeatureEnabled(featureKey)) {
    return <FeatureDisabledPage />;
  }

  return children;
};

// Public Route Component (redirect if authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading, isSuperAdmin, isTenant, isAgent, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (isAuthenticated) {
    // Redirect based on user type
    if (isSuperAdmin) {
      return <Navigate to="/saas-admin" replace />;
    }
    if (isAgent) {
      return <Navigate to="/agent/dashboard" replace />;
    }
    if (isTenant) {
      return <Navigate to="/" replace />;
    }
    // Default redirect
    return <Navigate to="/" replace />;
  }

  return children;
};

// Home route: shows LandingPage for unauthenticated visitors,
// otherwise routes to the correct dashboard per role.
// p152: custom-domain storefront — subscriber domains render their store at /
const PLATFORM_HOSTS = ['nt-commerce.net', 'www.nt-commerce.net', '168.231.81.154', 'localhost', '127.0.0.1'];
const isCustomDomain = () => !PLATFORM_HOSTS.includes(window.location.hostname);

const CustomDomainStore = () => {
  const [slug, setSlug] = useState(null);
  const [fail, setFail] = useState(false);
  useEffect(() => {
    apiClient.get(`/shop/by-domain?host=${encodeURIComponent(window.location.hostname)}`)
      .then(r => setSlug(r.data.store_slug))
      .catch(() => setFail(true));
  }, []);
  if (fail) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
        <p data-testid="custom-domain-notfound">المتجر غير متاح حالياً</p>
      </div>
    );
  }
  if (!slug) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="animate-spin" style={{ width: 40, height: 40, border: '4px solid #ddd', borderTopColor: '#3b82f6', borderRadius: '50%' }} />
      </div>
    );
  }
  return <PublicStorePage overrideSlug={slug} />;
};

const HomeRouter = () => {
  const { isAuthenticated, loading, isSuperAdmin, isAgent } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }
  if (isSuperAdmin) return <Navigate to="/saas-admin" replace />;
  if (isAgent) return <Navigate to="/agent/dashboard" replace />;
  // Authenticated tenant/cashier/admin → real dashboard
  return (
    <ProtectedRoute>
      <DashboardPage />
    </ProtectedRoute>
  );
};


// /dashboard route: role-based dashboard entry point.
// Previously this path did not exist, so post-login redirects to /dashboard
// fell into the catch-all "*" route and bounced users back to "/".
const DashboardRouter = () => {
  const { isAuthenticated, loading, isSuperAdmin, isAgent, isTenant } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/portal" replace />;
  }
  if (isSuperAdmin) return <Navigate to="/saas-admin" replace />;
  if (isAgent) return <Navigate to="/agent/dashboard" replace />;
  // p160: tenants also land on the unified dashboard (no separate /tenant/dashboard)
  // admin / cashier / demo / tenant → main dashboard
  return (
    <ProtectedRoute>
      <DashboardPage />
    </ProtectedRoute>
  );
};

function AppRoutes() {
  return (
    <Routes>
      {/* Landing & SaaS Public Routes */}
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/register" element={<SaasRegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} /> {/* p156 */}
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/shop/:slug" element={<PublicStorePage />} />
      <Route path="/shop/:slug/product/:productId" element={<ProductDetailPage />} />
      <Route path="/shop/:slug/lp/:productId" element={<StoreLandingPage />} />
      <Route path="/shop/:slug/track/:orderId" element={<OrderTrackingPage />} />
      
      {/* Unified Login - Single Entry Point for ALL users */}
      <Route path="/portal" element={<UnifiedLoginPage />} />
      <Route path="/login" element={<Navigate to="/portal" replace />} />
      <Route path="/tenant-login" element={<Navigate to="/portal" replace />} />
      <Route path="/agent-login" element={<Navigate to="/portal" replace />} />
      
      {/* Agent Dashboard */}
      <Route path="/dashboard" element={<DashboardRouter />} />
      <Route path="/agent/dashboard" element={<AgentDashboardPage />} />

      {/* p160: legacy dashboard URLs redirect to the unified dashboard */}
      <Route path="/tenant/dashboard" element={<Navigate to="/" replace />} />
      <Route path="/smart-dashboard" element={<Navigate to="/" replace />} />

      {/* AI & Smart Accounting Routes */}
      <Route
        path="/ai-chat"
        element={
          <ProtectedRoute featureKey="ai_bots">
            <AIChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-agents"
        element={
          <ProtectedRoute featureKey="ai_bots">
            <AIAgentsPage />
          </ProtectedRoute>
        }
      />
      {/* E-Commerce Hub — gated by ecommerce_hub feature flag (super-admin opt-in) */}
      <Route
        path="/ecom-hub"
        element={
          <ProtectedRoute featureKey="ecommerce_hub">
            <EcomHubShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<EcomHubPage />} />
        <Route path="store" element={<ProtectedRoute adminOnly><StoreManagementPage /></ProtectedRoute>} />
        <Route path="store/loyalty" element={<ProtectedRoute adminOnly featureKey="loyalty_points"><LoyaltyPage /></ProtectedRoute>} />
        <Route path="channels" element={<EcomChannelsPage />} />
        <Route path="channels/woocommerce" element={<ProtectedRoute adminOnly><WooCommercePage /></ProtectedRoute>} />
        <Route path="channels/status" element={<IntegrationStatusPage />} />
        <Route path="channels/api-keys" element={<ProtectedRoute adminOnly><ApiKeysPage /></ProtectedRoute>} />
        <Route path="channels/2fa" element={<TwoFactorPage />} />
        <Route path="channels/guide" element={<EcomGuidePage />} />
        <Route path="ads" element={<EcomAdsTab />} />
        <Route path="shipping" element={<EcomShippingTab />} />
        <Route path="shipping/companies" element={<ProtectedRoute adminOnly><ShippingPage /></ProtectedRoute>} />
        <Route path="shipping/yalidine" element={<Navigate to="/ecom-hub/shipping" replace />} />  {/* p93: legacy status page removed — real Yalidine management lives in الشحن الموحَّد */}
        <Route path="analytics" element={<EcomAnalyticsPage />} />
        <Route path="guide" element={<Navigate to="/ecom-hub/channels/guide" replace />} />
      </Route>
      <Route
        path="/digital-services"
        element={
          <ProtectedRoute>
            <DigitalServicesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/digital-admin"
        element={
          <ProtectedRoute>
            <DigitalAdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/datetime"
        element={
          <ProtectedRoute>
            <DateTimeSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/whatsapp"
        element={
          <ProtectedRoute>
            <WhatsAppPage />
          </ProtectedRoute>
        }
      />
            <Route path="/integrations/status" element={<Navigate to="/ecom-hub/channels/status" replace />} />
            <Route path="/integrations/yalidine" element={<Navigate to="/ecom-hub/shipping/yalidine" replace />} />
      <Route
        path="/tax-reports"
        element={
          <ProtectedRoute>
            <TaxReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/currencies"
        element={
          <ProtectedRoute>
            <CurrenciesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/banking"
        element={
          <ProtectedRoute>
            <BankingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/robots"
        element={
          <ProtectedRoute featureKey="ai_bots">
            <RobotsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/auto-reports"
        element={
          <ProtectedRoute>
            <AutoReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/commissions"
        element={
          <ProtectedRoute>
            <CommissionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/margin-rules"
        element={
          <ProtectedRoute adminOnly featureKey="recharge">
            <MarginRulesPage />
          </ProtectedRoute>
        }
      />

      {/* Legendary Build Routes */}
      <Route path="/defective-goods" element={<ProtectedRoute featureKey="inventory"><DefectiveGoodsPage /></ProtectedRoute>} />
      <Route path="/backup-system" element={<ProtectedRoute featureKey="backup"><BackupSystemPage /></ProtectedRoute>} />
      <Route path="/data-import-export" element={<ProtectedRoute><DataImportExportPage /></ProtectedRoute>} />
      <Route path="/import-wizard" element={<ProtectedRoute><ImportDataPage /></ProtectedRoute>} />  {/* p151 */}
      <Route path="/security-dashboard" element={<ProtectedRoute><SecurityDashboardPage /></ProtectedRoute>} />
      <Route path="/motherboard" element={<ProtectedRoute superAdminOnly><MotherboardPage /></ProtectedRoute>} />
      <Route path="/daily-report" element={<ProtectedRoute><DailyReportPage /></ProtectedRoute>} />
      <Route path="/wallet-management" element={<ProtectedRoute featureKey="wallet"><WalletPage /></ProtectedRoute>} />
      <Route path="/task-management" element={<ProtectedRoute><TaskManagementPage /></ProtectedRoute>} />
      <Route path="/internal-chat" element={<ProtectedRoute><InternalChatPage /></ProtectedRoute>} />
      <Route path="/supplier-tracking" element={<ProtectedRoute><SupplierTrackingPage /></ProtectedRoute>} />
            <Route path="/two-factor" element={<Navigate to="/ecom-hub/channels/2fa" replace />} />

      {/* SaaS Admin Dashboard + sub-routes (per-tab pages) */}
      <Route
        path="/saas-admin"
        element={
          <ProtectedRoute>
            <SaasAdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/saas-admin/subscribers"
        element={<ProtectedRoute superAdminOnly><SaasSubscribersPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/agents"
        element={<ProtectedRoute superAdminOnly><SaasAgentsPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/email-settings"
        element={<ProtectedRoute superAdminOnly><SaasEmailSettingsPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/plans"
        element={<ProtectedRoute superAdminOnly><SaasPlansPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/payments"
        element={<ProtectedRoute superAdminOnly><SaasPaymentsPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/platform-catalog"
        element={<ProtectedRoute superAdminOnly><SaasAdminPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/recharge-mgmt"
        element={<ProtectedRoute superAdminOnly><SaasAdminPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/finance"
        element={<ProtectedRoute superAdminOnly><SaasAdminPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/databases"
        element={<ProtectedRoute superAdminOnly><SaasAdminPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/alerts"
        element={<ProtectedRoute superAdminOnly><SaasAdminPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/autoheal"
        element={<ProtectedRoute superAdminOnly><AutoHealPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/withdrawals"
        element={<ProtectedRoute superAdminOnly><SaasAdminPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/ai-assistant"
        element={<ProtectedRoute superAdminOnly><SaasAdminPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/impersonation-logs"
        element={<ProtectedRoute superAdminOnly><SaasAdminPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/default-pos-shortcuts"
        element={<ProtectedRoute superAdminOnly><SaasAdminPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/tenant-debts"
        element={<ProtectedRoute superAdminOnly><SaasTenantDebtsPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/audit-timeline"
        element={<ProtectedRoute superAdminOnly><SaasAuditTimelinePage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/feature-flags"
        element={
          <ProtectedRoute>
            <FeatureFlagsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/saas-admin/system-logs"
        element={
          <ProtectedRoute>
            <SystemLogsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/saas-admin/supplier"
        element={
          <ProtectedRoute superAdminOnly>
            <SupplierAdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/saas-admin/event-bus"
        element={
          <ProtectedRoute superAdminOnly>
            <EventBusDashboard />
          </ProtectedRoute>
        }
      />

      {/* Protected Routes */}
      {/* `/` shows landing page for guests; dashboard for authenticated users */}
      <Route
        path="/"
        element={isCustomDomain() ? <CustomDomainStore /> : <HomeRouter />}  // p152
      />
      <Route
        path="/pos"
        element={
          <ProtectedRoute featureKey="pos">
            <POSPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedRoute featureKey="inventory">
            <ProductsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products/add"
        element={
          <ProtectedRoute adminOnly featureKey="inventory">
            <AddProductPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products/:id"
        element={
          <ProtectedRoute featureKey="inventory">
            <Navigate to="/products" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products/:id/edit"
        element={
          <ProtectedRoute adminOnly featureKey="inventory">
            <EditProductPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales"
        element={
          <ProtectedRoute>
            <SalesHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/installments"
        element={
          <ProtectedRoute>
            <InstallmentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchases"
        element={
          <ProtectedRoute adminOnly featureKey="inventory">
            <PurchasesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/warehouses"
        element={
          <ProtectedRoute adminOnly featureKey="inventory">
            <WarehousesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory-count"
        element={
          <ProtectedRoute adminOnly featureKey="inventory">
            <InventoryCountPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/barcode-print"
        element={
          <ProtectedRoute adminOnly featureKey="barcode">
            <BarcodePrintPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedRoute featureKey="customers">
            <CustomersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/suppliers"
        element={
          <ProtectedRoute adminOnly>
            <SuppliersPage />
          </ProtectedRoute>
        }
      />
            <Route path="/store" element={<Navigate to="/ecom-hub/store" replace />} />
      <Route
        path="/cash"
        element={
          <ProtectedRoute adminOnly>
            <CashManagementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute adminOnly>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employees"
        element={
          <ProtectedRoute adminOnly>
            <EmployeesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee-activity"
        element={
          <ProtectedRoute adminOnly>
            <EmployeeActivityPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/debts"
        element={
          <ProtectedRoute adminOnly>
            <DebtsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute adminOnly featureKey="reports">
            <ReportsPage />
          </ProtectedRoute>
        }
      />
            <Route path="/api-keys" element={<Navigate to="/ecom-hub/channels/api-keys" replace />} />
      <Route
        path="/features"
        element={
          <ProtectedRoute adminOnly>
            <FeaturesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/permissions"
        element={
          <ProtectedRoute adminOnly>
            <PermissionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/system-updates"
        element={
          <ProtectedRoute adminOnly>
            <SystemUpdatesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/recharge"
        element={
          <ProtectedRoute featureKey="recharge">
            <RechargePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/product-families"
        element={
          <ProtectedRoute adminOnly featureKey="inventory">
            <ProductFamiliesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer-debts"
        element={
          <ProtectedRoute featureKey="credit_sales">
            <CustomerDebtsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute adminOnly>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/sidebar"
        element={
          <ProtectedRoute adminOnly>
            <SidebarSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/printing/template-editor"
        element={
          <ProtectedRoute adminOnly>
            <TemplateEditorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/printing/template-editor/:id"
        element={
          <ProtectedRoute adminOnly>
            <TemplateEditorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/sales-permissions"
        element={
          <ProtectedRoute adminOnly>
            <SalesPermissionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales/advanced-report"
        element={
          <ProtectedRoute adminOnly>
            <AdvancedSalesReportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/email-notifications"
        element={
          <ProtectedRoute adminOnly>
            <EmailNotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/smart-notifications"
        element={
          <ProtectedRoute>
            <SmartNotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute superAdminOnly>
            <PaymentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bulk-price-update"
        element={
          <ProtectedRoute adminOnly featureKey="inventory">
            <BulkPriceUpdatePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/daily-sessions"
        element={
          <ProtectedRoute adminOnly>
            <DailySessionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customer-families"
        element={
          <ProtectedRoute adminOnly featureKey="customers">
            <CustomerFamiliesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/supplier-families"
        element={
          <ProtectedRoute adminOnly>
            <SupplierFamiliesPage />
          </ProtectedRoute>
        }
      />
            <Route path="/woocommerce" element={<Navigate to="/ecom-hub/channels/woocommerce" replace />} />
            <Route path="/shipping" element={<Navigate to="/ecom-hub/shipping/companies" replace />} />
      <Route
        path="/sim-management"
        element={
          <ProtectedRoute adminOnly>
            <SimManagementPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/telecom-stock"
        element={
          <ProtectedRoute adminOnly featureKey="recharge">
            <TelecomStockPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute adminOnly featureKey="reports">
            <AdvancedAnalyticsPage />
          </ProtectedRoute>
        }
      />
            <Route path="/loyalty" element={<Navigate to="/ecom-hub/store/loyalty" replace />} />
      <Route
        path="/services"
        element={
          <ProtectedRoute featureKey="recharge">
            <WholesaleServicesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/digital-panel"
        element={
          <ProtectedRoute featureKey="iptv">
            <DigitalPanelPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/digital-panel/subscriptions"
        element={
          <ProtectedRoute featureKey="iptv">
            <IptvSubscriptionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/digital-panel/resellers"
        element={
          <ProtectedRoute featureKey="iptv">
            <ResellersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/digital-panel/services"
        element={
          <ProtectedRoute featureKey="iptv">
            <DigitalServicesCatalogPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/services/flexy"
        element={
          <ProtectedRoute featureKey="recharge">
            <FlexyServicePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/services/idoom"
        element={
          <ProtectedRoute featureKey="recharge">
            <IdoomServicePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/services/cards"
        element={
          <ProtectedRoute featureKey="recharge">
            <CardsServicePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/services/operations"
        element={
          <ProtectedRoute featureKey="recharge">
            <OperationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/services/profits"
        element={
          <ProtectedRoute featureKey="recharge">
            <ProfitRatesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/services/transfers"
        element={
          <ProtectedRoute featureKey="recharge">
            <TransfersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/services/directory"
        element={
          <ProtectedRoute featureKey="recharge">
            <PhoneDirectoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/repairs"
        element={
          <ProtectedRoute featureKey="maintenance">
            <RepairTrackingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/repairs/new"
        element={
          <ProtectedRoute featureKey="maintenance">
            <RepairReceptionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/repairs/parts"
        element={
          <ProtectedRoute featureKey="maintenance">
            <SparePartsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            <ExpensesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/partners"
        element={
          <ProtectedRoute>
            <PartnersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/rentals"
        element={
          <ProtectedRoute featureKey="rental">
            <RentalsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/production"
        element={
          <ProtectedRoute featureKey="production">
            <ProductionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounting"
        element={
          <ProtectedRoute>
            <AccountingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/price-history"
        element={
          <ProtectedRoute featureKey="inventory">
            <PriceHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/expiry-report"
        element={
          <ProtectedRoute featureKey="inventory">
            <ExpiryReportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/smart-reports"
        element={
          <ProtectedRoute featureKey="reports">
            <SmartReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employee-alerts"
        element={
          <ProtectedRoute>
            <EmployeeAlertsPage />
          </ProtectedRoute>
        }
      />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <DateFormatProvider>
          <AuthProvider>
            <FeatureFlagProvider>
              <BrowserRouter>
                <ErrorBoundary>
                  <AppRoutes />
                </ErrorBoundary>
                <Toaster position="top-center" richColors />
              </BrowserRouter>
            </FeatureFlagProvider>
          </AuthProvider>
        </DateFormatProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
