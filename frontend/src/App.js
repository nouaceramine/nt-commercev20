import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useEffect } from "react";
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

// Derive cashier-allowed paths from sidebarMenu.js (single source of truth via minRole)
const CASHIER_ALLOWED_PATHS = defaultMenuSections.flatMap(section =>
  section.items.filter(item => item.minRole === 'cashier').map(item => item.path)
);

// Pages
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import ProductDetailPage from "./pages/ProductDetailPage";
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
import NotificationsPage from "./pages/NotificationsPage";
import AdvancedSalesReportPage from "./pages/AdvancedSalesReportPage";
import SalesPermissionsPage from "./pages/SalesPermissionsPage";
import PriceHistoryPage from "./pages/PriceHistoryPage";
import SmartReportsPage from "./pages/SmartReportsPage";
import EmployeeAlertsPage from "./pages/EmployeeAlertsPage";
import FeaturesPage from "./pages/FeaturesPage";
import PermissionsPage from "./pages/PermissionsPage";
import SystemUpdatesPage from "./pages/SystemUpdatesPage";
import AgentDashboardPage from "./pages/AgentDashboardPage";
import UnifiedLoginPage from "./pages/UnifiedLoginPage";
import TenantDashboardPage from "./pages/TenantDashboardPage";
import EmailNotificationsPage from "./pages/EmailNotificationsPage";
import PaymentsPage from "./pages/PaymentsPage";

// AI & Smart Accounting Pages
import SmartDashboardPage from "./pages/SmartDashboardPage";
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
import PricingPage from "./pages/landing/PricingPage";
import SaasAdminPage from "./pages/admin/SaasAdminPage";
import FeatureFlagsPage from "./pages/admin/FeatureFlagsPage";
import StoreManagementPage from "./pages/store/StoreManagementPage";
import PublicStorePage from "./pages/store/PublicStorePage";
import DataImportExportPage from "./pages/DataImportExportPage";
import MotherboardPage from "./pages/MotherboardPage";
import TemplateEditorPage from "./pages/settings/TemplateEditorPage";
import DailyReportPage from "./pages/DailyReportPage";


// Protected Route Component
const ProtectedRoute = ({ children, adminOnly = false, tenantOnly = false, superAdminOnly = false, cashierBlocked = false, featureKey = null }) => {
  const { isAuthenticated, loading, isAdmin, isSuperAdmin, isTenant, isCashier, user, isFeatureEnabled } = useAuth();

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
    '/payments', '/motherboard',
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

  if (superAdminOnly && !isSuperAdmin) {
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

function AppRoutes() {
  return (
    <Routes>
      {/* Landing & SaaS Public Routes */}
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/register" element={<SaasRegisterPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/shop/:slug" element={<PublicStorePage />} />
      
      {/* Unified Login - Single Entry Point for ALL users */}
      <Route path="/portal" element={<UnifiedLoginPage />} />
      <Route path="/login" element={<Navigate to="/portal" replace />} />
      <Route path="/tenant-login" element={<Navigate to="/portal" replace />} />
      <Route path="/agent-login" element={<Navigate to="/portal" replace />} />
      
      {/* Agent Dashboard */}
      <Route path="/agent/dashboard" element={<AgentDashboardPage />} />

      {/* Tenant Dashboard */}
      <Route path="/tenant/dashboard" element={<TenantDashboardPage />} />

      {/* AI & Smart Accounting Routes */}
      <Route
        path="/smart-dashboard"
        element={
          <ProtectedRoute>
            <SmartDashboardPage />
          </ProtectedRoute>
        }
      />
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
      <Route
        path="/integrations/status"
        element={
          <ProtectedRoute>
            <IntegrationStatusPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/integrations/yalidine"
        element={
          <ProtectedRoute>
            <IntegrationStatusPage />
          </ProtectedRoute>
        }
      />
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

      {/* Legendary Build Routes */}
      <Route path="/defective-goods" element={<ProtectedRoute featureKey="inventory"><DefectiveGoodsPage /></ProtectedRoute>} />
      <Route path="/backup-system" element={<ProtectedRoute featureKey="backup"><BackupSystemPage /></ProtectedRoute>} />
      <Route path="/data-import-export" element={<ProtectedRoute><DataImportExportPage /></ProtectedRoute>} />
      <Route path="/security-dashboard" element={<ProtectedRoute><SecurityDashboardPage /></ProtectedRoute>} />
      <Route path="/motherboard" element={<ProtectedRoute><MotherboardPage /></ProtectedRoute>} />
      <Route path="/daily-report" element={<ProtectedRoute><DailyReportPage /></ProtectedRoute>} />
      <Route path="/wallet-management" element={<ProtectedRoute featureKey="wallet"><WalletPage /></ProtectedRoute>} />
      <Route path="/task-management" element={<ProtectedRoute><TaskManagementPage /></ProtectedRoute>} />
      <Route path="/internal-chat" element={<ProtectedRoute><InternalChatPage /></ProtectedRoute>} />
      <Route path="/supplier-tracking" element={<ProtectedRoute><SupplierTrackingPage /></ProtectedRoute>} />
      <Route path="/two-factor" element={<ProtectedRoute><TwoFactorPage /></ProtectedRoute>} />

      {/* SaaS Admin Dashboard */}
      <Route
        path="/saas-admin"
        element={
          <ProtectedRoute>
            <SaasAdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/saas-admin/feature-flags"
        element={
          <ProtectedRoute>
            <FeatureFlagsPage />
          </ProtectedRoute>
        }
      />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
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
            <ProductDetailPage />
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
      <Route
        path="/store"
        element={
          <ProtectedRoute adminOnly>
            <StoreManagementPage />
          </ProtectedRoute>
        }
      />
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
      <Route
        path="/api-keys"
        element={
          <ProtectedRoute adminOnly>
            <ApiKeysPage />
          </ProtectedRoute>
        }
      />
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
      <Route
        path="/woocommerce"
        element={
          <ProtectedRoute adminOnly>
            <WooCommercePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shipping"
        element={
          <ProtectedRoute adminOnly>
            <ShippingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sim-management"
        element={
          <ProtectedRoute adminOnly>
            <SimManagementPage />
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
      <Route
        path="/loyalty"
        element={
          <ProtectedRoute adminOnly featureKey="loyalty_points">
            <LoyaltyPage />
          </ProtectedRoute>
        }
      />
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
        path="/price-history"
        element={
          <ProtectedRoute featureKey="inventory">
            <PriceHistoryPage />
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
