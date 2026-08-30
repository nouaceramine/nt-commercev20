import "@/App.css";
import { RefreshCw } from "lucide-react";  // p273: suspense fallback
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useEffect, useState, lazy, Suspense } from "react";  // p273
import { LanguageProvider } from "./contexts/LanguageContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DateFormatProvider } from "./contexts/DateFormatContext";
import { FeatureFlagProvider } from "./contexts/FeatureFlagContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { defaultMenuSections } from "./config/sidebarMenu";
import FeatureDisabledPage from "./components/FeatureDisabledPage";
const AccessDeniedPage = lazy(() => import("./pages/AccessDeniedPage"));  // p273

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
const DashboardPage = lazy(() => import("./pages/DashboardPage"));  // p273
const ProductsPage = lazy(() => import("./pages/ProductsPage"));  // p273
const ProductDetailPage = lazy(() => import("./pages/store/ProductDetailPage"));  // p273
const StoreLandingPage = lazy(() => import("./pages/store/StoreLandingPage"));  // p273
const OrderTrackingPage = lazy(() => import("./pages/store/OrderTrackingPage"));  // p273
const GlobalTrackingPage = lazy(() => import("./pages/store/GlobalTrackingPage"));  // p273
const DriverPage = lazy(() => import("./pages/store/DriverPage"));  // p273
const AddProductPage = lazy(() => import("./pages/AddProductPage"));  // p273
const EditProductPage = lazy(() => import("./pages/EditProductPage"));  // p273
const UsersPage = lazy(() => import("./pages/UsersPage"));  // p273
const POSPage = lazy(() => import("./pages/POSPage"));  // p273
const CustomersPage = lazy(() => import("./pages/CustomersPage"));  // p273
const SuppliersPage = lazy(() => import("./pages/SuppliersPage"));  // p273
const CashManagementPage = lazy(() => import("./pages/CashManagementPage"));  // p273
const SalesHistoryPage = lazy(() => import("./pages/SalesHistoryPage"));  // p273
const ScreenRecordingPage = lazy(() => import("./pages/ScreenRecordingPage"));  // p281
const InstallmentsPage = lazy(() => import("./pages/InstallmentsPage"));  // p273
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));  // p273
const EmployeeActivityPage = lazy(() => import("./pages/EmployeeActivityPage"));  // p273
const DebtsPage = lazy(() => import("./pages/DebtsPage"));  // p273
const ReportsPage = lazy(() => import("./pages/ReportsPage"));  // p273
const ApiKeysPage = lazy(() => import("./pages/ApiKeysPage"));  // p273
const IntegrationsHubPage = lazy(() => import("./pages/IntegrationsHubPage"));  // p287
const RechargePage = lazy(() => import("./pages/RechargePage"));  // p273
const DigitalPanelPage = lazy(() => import("./pages/DigitalPanelPage"));  // p273
const IptvSubscriptionsPage = lazy(() => import("./pages/IptvSubscriptionsPage"));  // p273
const ResellersPage = lazy(() => import("./pages/ResellersPage"));  // p273
const DigitalServicesCatalogPage = lazy(() => import("./pages/DigitalServicesCatalogPage"));  // p273
const ProductFamiliesPage = lazy(() => import("./pages/ProductFamiliesPage"));  // p273
const CustomerDebtsPage = lazy(() => import("./pages/CustomerDebtsPage"));  // p273
const SettingsPage = lazy(() => import("./pages/SettingsPage"));  // p273
const BulkPriceUpdatePage = lazy(() => import("./pages/BulkPriceUpdatePage"));  // p273
const PurchasesPage = lazy(() => import("./pages/PurchasesPage"));  // p273
const WarehousesPage = lazy(() => import("./pages/WarehousesPage"));  // p273
const InventoryCountPage = lazy(() => import("./pages/InventoryCountPage"));  // p273
const BarcodePrintPage = lazy(() => import("./pages/BarcodePrintPage"));  // p273
const DailySessionsPage = lazy(() => import("./pages/DailySessionsPage"));  // p273
const CustomerFamiliesPage = lazy(() => import("./pages/CustomerFamiliesPage"));  // p273
const SupplierFamiliesPage = lazy(() => import("./pages/SupplierFamiliesPage"));  // p273
const WooCommercePage = lazy(() => import("./pages/WooCommercePage"));  // p273
const ShippingPage = lazy(() => import("./pages/ShippingPage"));  // p273
const SimManagementPage = lazy(() => import("./pages/SimManagementPage"));  // p273
const TelecomStockPage = lazy(() => import("./pages/TelecomStockPage"));  // p273
const AdvancedAnalyticsPage = lazy(() => import("./pages/AdvancedAnalyticsPage"));  // p273
const LoyaltyPage = lazy(() => import("./pages/LoyaltyPage"));  // p273
const WholesaleServicesPage = lazy(() => import("./pages/WholesaleServicesPage"));  // p273
const FlexyServicePage = lazy(() => import("./pages/FlexyServicePage"));  // p273
const IdoomServicePage = lazy(() => import("./pages/IdoomServicePage"));  // p273
const CardsServicePage = lazy(() => import("./pages/CardsServicePage"));  // p273
const OperationsPage = lazy(() => import("./pages/OperationsPage"));  // p273
const ProfitRatesPage = lazy(() => import("./pages/ProfitRatesPage"));  // p273
const TransfersPage = lazy(() => import("./pages/TransfersPage"));  // p273
const PhoneDirectoryPage = lazy(() => import("./pages/PhoneDirectoryPage"));  // p273
const SidebarSettingsPage = lazy(() => import("./pages/SidebarSettingsPage"));  // p273
const RepairReceptionPage = lazy(() => import("./pages/RepairReceptionPage"));  // p273
const RepairTrackingPage = lazy(() => import("./pages/RepairTrackingPage"));  // p273
const SparePartsPage = lazy(() => import("./pages/SparePartsPage"));  // p273
const ExpensesPage = lazy(() => import("./pages/ExpensesPage"));  // p273
const PartnersPage = lazy(() => import("./pages/PartnersPage"));  // p273
const RentalsPage = lazy(() => import("./pages/RentalsPage"));  // p273
const ProductionPage = lazy(() => import("./pages/ProductionPage"));  // p273  // p188
const KitchenDisplayPage = lazy(() => import("./pages/KitchenDisplayPage"));  // p306
const TablesMapPage = lazy(() => import("./pages/TablesMapPage"));  // p310
const QrMenuPage = lazy(() => import("./pages/QrMenuPage"));  // p311
const OrderBoardPage = lazy(() => import("./pages/OrderBoardPage"));  // p314
const TvMenuPage = lazy(() => import("./pages/TvMenuPage"));  // p320
const TvHubPage = lazy(() => import("./pages/TvHubPage"));  // p322
const NeighborsPage = lazy(() => import("./pages/NeighborsPage"));  // p335
const NeighborOrderPage = lazy(() => import("./pages/NeighborOrderPage"));  // p335
const RestaurantPOSPage = lazy(() => import("./pages/RestaurantPOSPage"));  // p339
const ScreensPage = lazy(() => import("./pages/ScreensPage"));  // p322
const TvCatalogPage = lazy(() => import("./pages/TvCatalogPage"));  // p329
const WaiterPage = lazy(() => import("./pages/WaiterPage"));  // p312
const DeliveryPage = lazy(() => import("./pages/DeliveryPage"));  // p316
const AccountingPage = lazy(() => import("./pages/AccountingPage"));  // p273  // p196
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));  // p273
const AdvancedSalesReportPage = lazy(() => import("./pages/AdvancedSalesReportPage"));  // p273
const SalesPermissionsPage = lazy(() => import("./pages/SalesPermissionsPage"));  // p273
const PriceHistoryPage = lazy(() => import("./pages/PriceHistoryPage"));  // p273
const ExpiryReportPage = lazy(() => import("./pages/ExpiryReportPage"));  // p273
const SmartReportsPage = lazy(() => import("./pages/SmartReportsPage"));  // p273
const EmployeeAlertsPage = lazy(() => import("./pages/EmployeeAlertsPage"));  // p273
const FeaturesPage = lazy(() => import("./pages/FeaturesPage"));  // p273
const PermissionsPage = lazy(() => import("./pages/PermissionsPage"));  // p273
const SystemUpdatesPage = lazy(() => import("./pages/SystemUpdatesPage"));  // p273
const AgentDashboardPage = lazy(() => import("./pages/AgentDashboardPage"));  // p273
const UnifiedLoginPage = lazy(() => import("./pages/UnifiedLoginPage"));  // p273
// p160: TenantDashboardPage merged into DashboardPage (route redirects to /)
const EmailNotificationsPage = lazy(() => import("./pages/EmailNotificationsPage"));  // p273
const PaymentsPage = lazy(() => import("./pages/PaymentsPage"));  // p273

// E-Commerce Hub (P1+, gated by ecommerce_hub feature flag)
const EcomHubPage = lazy(() => import("./pages/ecom/EcomHubPage"));  // p273
const EcomHubShell = lazy(() => import("./pages/ecom/EcomHubShell"));  // p273
const EcomChannelsPage = lazy(() => import("./pages/ecom/EcomChannelsPage"));  // p273
const EcomGuidePage = lazy(() => import("./pages/ecom/EcomGuidePage"));  // p273
const EcomAnalyticsPage = lazy(() => import("./pages/ecom/EcomAnalyticsPage"));
const EcomWorkersPage = lazy(() => import("./pages/ecom/EcomWorkersPage"));  // p293
const WorkerLoginPage = lazy(() => import("./pages/worker/WorkerLoginPage"));  // p293
const WorkerWorkspacePage = lazy(() => import("./pages/worker/WorkerWorkspacePage"));  // p293  // p273
const EcomStoreTab = lazy(() => import("./pages/ecom/EcomStoreTab"));  // p273
const DigitalServicesPage = lazy(() => import("./pages/digital/DigitalServicesPage"));  // p273
const DigitalAdminPage = lazy(() => import("./pages/digital/DigitalAdminPage"));  // p273
const EcomAdsTab = lazy(() => import("./pages/ecom/EcomAdsTab"));  // p273
const EcomShippingTab = lazy(() => import("./pages/ecom/EcomShippingTab"));  // p273
const EcomDriversPage = lazy(() => import("./pages/ecom/EcomDriversPage"));  // p273
const EcomReferralsPage = lazy(() => import("./pages/ecom/EcomReferralsPage"));  // p273
const EcomSocialInboxPage = lazy(() => import("./pages/ecom/EcomSocialInboxPage"));  // p273
const EcomIntakeSourcesPage = lazy(() => import("./pages/ecom/EcomIntakeSourcesPage"));  // p273
const EcomMultiStorePage = lazy(() => import("./pages/ecom/EcomMultiStorePage"));  // p273
const SupportTicketsPage = lazy(() => import("./pages/SupportTicketsPage"));  // p273
const SaasSupportPage = lazy(() => import("./pages/admin/saas/SaasSupportPage"));  // p273

// AI & Smart Accounting Pages
// p160: SmartDashboardPage merged into DashboardPage (route redirects to /)
const AIChatPage = lazy(() => import("./pages/AIChatPage"));  // p273
const AIAgentsPage = lazy(() => import("./pages/AIAgentsPage"));  // p273
const DateTimeSettingsPage = lazy(() => import("./pages/DateTimeSettingsPage"));  // p273

// New Feature Pages
const WhatsAppPage = lazy(() => import("./pages/WhatsAppPage"));  // p273
const IntegrationStatusPage = lazy(() => import("./pages/IntegrationStatusPage"));  // p273
const TaxReportsPage = lazy(() => import("./pages/TaxReportsPage"));  // p273
const CurrenciesPage = lazy(() => import("./pages/CurrenciesPage"));  // p273
const BankingPage = lazy(() => import("./pages/BankingPage"));  // p273
const RobotsPage = lazy(() => import("./pages/RobotsPage"));  // p273
const AutoReportsPage = lazy(() => import("./pages/AutoReportsPage"));  // p273
const CommissionsPage = lazy(() => import("./pages/CommissionsPage"));  // p273  // p221
const MarginRulesPage = lazy(() => import("./pages/MarginRulesPage"));  // p273  // p223
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));  // p273  // p227

// Legendary Build Pages
const DefectiveGoodsPage = lazy(() => import("./pages/DefectiveGoodsPage"));  // p273
const BackupSystemPage = lazy(() => import("./pages/BackupSystemPage"));  // p273
const SecurityDashboardPage = lazy(() => import("./pages/SecurityDashboardPage"));  // p273
const WalletPage = lazy(() => import("./pages/WalletPage"));  // p273
const TaskManagementPage = lazy(() => import("./pages/TaskManagementPage"));  // p273
const InternalChatPage = lazy(() => import("./pages/InternalChatPage"));  // p273
const SupplierTrackingPage = lazy(() => import("./pages/SupplierTrackingPage"));  // p273
const TwoFactorPage = lazy(() => import("./pages/TwoFactorPage"));  // p273
const SmartNotificationsPage = lazy(() => import("./pages/SmartNotificationsPage"));  // p273

// Landing & SaaS Pages
const LandingPage = lazy(() => import("./pages/landing/LandingPage"));  // p273
const SaasRegisterPage = lazy(() => import("./pages/landing/RegisterPage"));  // p273
const VerifyEmailPage = lazy(() => import("./pages/landing/VerifyEmailPage"));  // p273 // p156
const PricingPage = lazy(() => import("./pages/landing/PricingPage"));  // p273
const SaasAdminPage = lazy(() => import("./pages/admin/SaasAdminPage"));  // p273
const FeatureFlagsPage = lazy(() => import("./pages/admin/FeatureFlagsPage"));  // p273
const SystemLogsPage = lazy(() => import("./pages/SystemLogsPage"));  // p273
const SupplierAdminPage = lazy(() => import("./pages/admin/SupplierAdminPage"));  // p273
const EventBusDashboard = lazy(() => import("./pages/admin/EventBusDashboard"));  // p273
const SaasPaymentsPage = lazy(() => import("./pages/admin/saas/PaymentsPage"));  // p273
const SaasDataBrowserPage = lazy(() => import("./pages/admin/saas/DataBrowserPage"));  // p273
const SaasPlansPage = lazy(() => import("./pages/admin/saas/PlansPage"));  // p273
const SaasTenantDebtsPage = lazy(() => import("./pages/admin/saas/TenantDebtsPage"));  // p273
const SaasAuditTimelinePage = lazy(() => import("./pages/admin/saas/AuditTimelinePage"));  // p273
const ModulesDashboardPage = lazy(() => import("./pages/admin/saas/ModulesDashboardPage"));  // p346
const OrgTreePage = lazy(() => import("./pages/admin/saas/OrgTreePage"));  // p345
const SaasSubscribersPage = lazy(() => import("./pages/admin/saas/SubscribersPage"));  // p273
const SaasAgentsPage = lazy(() => import("./pages/admin/saas/AgentsPage"));  // p273
const SaasEmailSettingsPage = lazy(() => import("./pages/admin/saas/EmailSettingsPage"));  // p273
const AutoHealPage = lazy(() => import("./pages/admin/saas/AutoHealPage"));  // p273
const StoreManagementPage = lazy(() => import("./pages/store/StoreManagementPage"));  // p273
const PublicStorePage = lazy(() => import("./pages/store/PublicStorePage"));  // p273
const DataImportExportPage = lazy(() => import("./pages/DataImportExportPage"));  // p273
const ImportDataPage = lazy(() => import("./pages/ImportDataPage"));  // p273  // p151
const LegacyMigrationPage = lazy(() => import("./pages/LegacyMigrationPage"));  // p349
const MotherboardPage = lazy(() => import("./pages/MotherboardPage"));  // p273
const TemplateEditorPage = lazy(() => import("./pages/settings/TemplateEditorPage"));  // p273
const DailyReportPage = lazy(() => import("./pages/DailyReportPage"));  // p273


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
    <Suspense fallback={<div className="flex items-center justify-center min-h-[40vh]"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>}>  {/* p273 */}
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
      <Route path="/track" element={<GlobalTrackingPage />} />
      <Route path="/r/:tenantId/:tableId/:token" element={<QrMenuPage />} />  {/* p323: QR table ordering — temporary tokenized link */}
      <Route path="/r/:tenantId/:tableId" element={<QrMenuPage />} />  {/* p311 legacy: يعرض «انتهت الصلاحية» */}
      <Route path="/b2b/:tenantId/:token" element={<NeighborOrderPage />} />  {/* p335: طلبات الجيران B2B — رابط خاص بكل محل */}
      <Route path="/board/:tenantId" element={<OrderBoardPage />} />  {/* p314: public order status board */}
      <Route path="/tv/menu/:tenantId" element={<TvMenuPage />} />  {/* p320: public TV menu board (live stock) */}
      <Route path="/tv/catalog/:tenantId" element={<TvCatalogPage />} />  {/* p329: public catalog board — أي نشاط */}
      <Route path="/tv" element={<TvHubPage />} />  {/* p322: TV hub — pair once, controlled centrally */}
      <Route path="/driver/:token" element={<DriverPage />} />
      
      {/* Unified Login - Single Entry Point for ALL users */}
      {/* p293: worker workspace (public PIN area) */}
      <Route path="/worker/login" element={<WorkerLoginPage />} />
      <Route path="/worker" element={<WorkerWorkspacePage />} />
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
      <Route
        path="/support"
        element={<ProtectedRoute><SupportTicketsPage /></ProtectedRoute>}
      />
      <Route
        path="/screen-recording"
        element={<ProtectedRoute><ScreenRecordingPage /></ProtectedRoute>}
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
        <Route path="store/referrals" element={<ProtectedRoute adminOnly><EcomReferralsPage /></ProtectedRoute>} />
        <Route path="store/multi" element={<ProtectedRoute adminOnly><EcomMultiStorePage /></ProtectedRoute>} />
        <Route path="channels" element={<EcomChannelsPage />} />
        <Route path="channels/woocommerce" element={<ProtectedRoute adminOnly><WooCommercePage /></ProtectedRoute>} />
        <Route path="channels/status" element={<IntegrationStatusPage />} />
        <Route path="channels/api-keys" element={<ProtectedRoute adminOnly><ApiKeysPage /></ProtectedRoute>} />
        <Route path="channels/2fa" element={<TwoFactorPage />} />
        <Route path="channels/guide" element={<EcomGuidePage />} />
        <Route path="channels/social-inbox" element={<EcomSocialInboxPage />} />
        <Route path="channels/intake" element={<ProtectedRoute adminOnly><EcomIntakeSourcesPage /></ProtectedRoute>} />
        <Route path="ads" element={<EcomAdsTab />} />
        <Route path="shipping" element={<EcomShippingTab />} />
        <Route path="shipping/companies" element={<ProtectedRoute adminOnly><ShippingPage /></ProtectedRoute>} />
        <Route path="shipping/drivers" element={<ProtectedRoute adminOnly><EcomDriversPage /></ProtectedRoute>} />
        <Route path="shipping/yalidine" element={<Navigate to="/ecom-hub/shipping" replace />} />  {/* p93: legacy status page removed — real Yalidine management lives in الشحن الموحَّد */}
        <Route path="analytics" element={<EcomAnalyticsPage />} />
        <Route path="workers" element={<ProtectedRoute adminOnly><EcomWorkersPage /></ProtectedRoute>} />  {/* p293 */}
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
            <Route path="/integrations" element={<ProtectedRoute adminOnly><IntegrationsHubPage /></ProtectedRoute>} />  {/* p287 */}
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
      <Route
        path="/marketplace"
        element={
          <ProtectedRoute>
            <MarketplacePage />
          </ProtectedRoute>
        }
      />

      {/* Legendary Build Routes */}
      <Route path="/defective-goods" element={<ProtectedRoute featureKey="inventory"><DefectiveGoodsPage /></ProtectedRoute>} />
      <Route path="/backup-system" element={<ProtectedRoute featureKey="backup"><BackupSystemPage /></ProtectedRoute>} />
      <Route path="/data-import-export" element={<ProtectedRoute><DataImportExportPage /></ProtectedRoute>} />
      <Route path="/import-wizard" element={<ProtectedRoute><ImportDataPage /></ProtectedRoute>} />  {/* p151 */}
      <Route path="/legacy-migration" element={<ProtectedRoute><LegacyMigrationPage /></ProtectedRoute>} />  {/* p349 */}
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
        path="/saas-admin/support"
        element={<ProtectedRoute superAdminOnly><SaasSupportPage /></ProtectedRoute>}
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
        path="/saas-admin/data-browser"
        element={<ProtectedRoute superAdminOnly><SaasDataBrowserPage /></ProtectedRoute>}
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
        path="/saas-admin/modules"
        element={<ProtectedRoute superAdminOnly><ModulesDashboardPage /></ProtectedRoute>}
      />
      <Route
        path="/saas-admin/org-tree"
        element={<ProtectedRoute superAdminOnly><OrgTreePage /></ProtectedRoute>}
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
        path="/restaurant-pos"
        element={
          <ProtectedRoute>
            <RestaurantPOSPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/neighbors"
        element={
          <ProtectedRoute>
            <NeighborsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/kitchen"
        element={
          <ProtectedRoute featureKey="restaurant">
            <KitchenDisplayPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/screens"
        element={
          <ProtectedRoute>
            <ScreensPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tables"
        element={
          <ProtectedRoute featureKey="restaurant">
            <TablesMapPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/waiter"
        element={
          <ProtectedRoute featureKey="restaurant">
            <WaiterPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/delivery"
        element={
          <ProtectedRoute featureKey="restaurant">
            <DeliveryPage />
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
    </Suspense>
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
