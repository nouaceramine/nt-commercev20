import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { toast } from 'sonner';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { NotificationBell } from './NotificationBell';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { SidebarReorder } from './SidebarReorder';
import { 
  LayoutDashboard, 
  Package, 
  PlusCircle, 
  LogOut, 
  Menu, 
  X,
  Search,
  Globe,
  Shield,
  Users,
  ShoppingCart,
  Truck,
  Receipt,
  Wallet,
  Bell,
  Key,
  Smartphone,
  FolderTree,
  CreditCard,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
  PanelLeftClose,
  PanelLeft,
  DollarSign,
  ShoppingBag,
  BarChart3,
  Warehouse,
  ClipboardList,
  QrCode,
  Clock,
  Store,
  Zap,
  Award,
  Moon,
  Sun,
  Wrench,
  Download,
  Sparkles,
  History,
  Building,
  Mail,
  MessageSquare,
  Coins,
  FileText,
  Landmark,
  Bot,
  PackageX,
  Database,
  CheckSquare,
  MessageCircle,
  FileSpreadsheet,
  CircuitBoard,
  Tv,
  Boxes,
  Calendar
} from 'lucide-react';
import { UnifiedSearch } from './UnifiedSearch';
import { GlobalSearchModal } from './GlobalSearchModal';
import { defaultMenuSections } from '../config/sidebarMenu';

// Helper function to determine AI context based on current page
const getAIContext = (pathname) => {
  if (pathname.includes('/pos') || pathname.includes('/sales')) return 'sales';
  if (pathname.includes('/products') || pathname.includes('/inventory') || pathname.includes('/warehouses')) return 'inventory';
  if (pathname.includes('/customers')) return 'customers';
  if (pathname.includes('/reports') || pathname.includes('/analytics')) return 'reports';
  if (pathname.includes('/suppliers') || pathname.includes('/purchases')) return 'suppliers';
  return 'general';
};

// Icon mapping for dynamic sidebar
const iconMap = {
  LayoutDashboard, Package, ShoppingCart, Truck, Users, CreditCard, Wallet,
  BarChart3, Settings, Bell, Wrench, Receipt, FolderTree, Warehouse,
  ClipboardList, QrCode, DollarSign, ShoppingBag, Clock, Smartphone, Store, Shield, Key, Award, Zap, Mail, Bot,
  PackageX, Database, CheckSquare, MessageCircle, Download, Tv, Boxes
};

export const Layout = ({ children }) => {
  const { t, language, toggleLanguage, isRTL } = useLanguage();
  // Get user type and features
  const { user, logout, isAdmin, isSuperAdmin, isTenant, isCashier, isFeatureEnabled } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    // Default to collapsed (true) if no saved preference
    return saved !== null ? saved === 'true' : true;
  });
  const [expandedSections, setExpandedSections] = useState(() => {
    const saved = localStorage.getItem('expandedSections');
    return saved ? JSON.parse(saved) : ['الرئيسية', 'Accueil'];
  });
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [customSidebarOrder, setCustomSidebarOrder] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [branding, setBranding] = useState({ name: '', logo_url: '' });
  const [lowStockCount, setLowStockCount] = useState(0);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const navRef = useRef(null);

  // Fetch tenant branding (custom logo + name)
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const res = await apiClient.get('/settings/tenant-branding');
        setBranding({ name: res.data?.name || '', logo_url: res.data?.logo_url || '' });
      } catch (e) {
        // keep defaults
      }
    };
    fetchBranding();
    const onUpdate = () => fetchBranding();
    window.addEventListener('branding-updated', onUpdate);
    return () => window.removeEventListener('branding-updated', onUpdate);
  }, []);

  const brandName = branding.name || user?.company_name || t.appName;
  const brandLogo = branding.logo_url;

  // Listen for PWA install prompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallBtn(false);
    }
    
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Low-stock count + Ctrl+K listener
  useEffect(() => {
    // Fetch low-stock count
    const fetchLowStock = async () => {
      try {
        const res = await apiClient.get('/products/alerts/low-stock');
        setLowStockCount((res.data || []).length);
      } catch {
        try {
          const r2 = await apiClient.get('/stats');
          setLowStockCount(r2.data?.low_stock_count || 0);
        } catch {}
      }
    };
    fetchLowStock();

    // Ctrl+K global search
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowGlobalSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch custom sidebar order
  useEffect(() => {
    const fetchSidebarOrder = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        if (isSuperAdmin) return;
        
        const response = await apiClient.get(`/settings/sidebar-order`);
        
        if (response.data.sidebar_order && Array.isArray(response.data.sidebar_order) && response.data.sidebar_order.length > 0) {
          if (response.data.sidebar_order[0].items) {
            setCustomSidebarOrder(response.data.sidebar_order);
          }
        }
      } catch (error) {
        console.error('Error fetching sidebar order:', error);
      }
    };
    
    fetchSidebarOrder();
    
    // Listen for sidebar order changes from settings page
    const handleSidebarOrderChange = () => fetchSidebarOrder();
    window.addEventListener('sidebarOrderChanged', handleSidebarOrderChange);
    
    return () => window.removeEventListener('sidebarOrderChanged', handleSidebarOrderChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // If we have native prompt, use it
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallBtn(false);
      }
      setDeferredPrompt(null);
    } else {
      // Show manual instructions
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);
      
      if (isIOS) {
        toast.info(language === 'ar' 
          ? 'اضغط على زر المشاركة ثم "إضافة إلى الشاشة الرئيسية"'
          : 'Appuyez sur Partager puis "Ajouter à l\'écran d\'accueil"'
        );
      } else if (isAndroid) {
        toast.info(language === 'ar'
          ? 'اضغط على القائمة ⋮ ثم "إضافة إلى الشاشة الرئيسية"'
          : 'Appuyez sur le menu ⋮ puis "Ajouter à l\'écran d\'accueil"'
        );
      } else {
        toast.info(language === 'ar'
          ? 'يمكنك تثبيت التطبيق من إعدادات المتصفح'
          : 'Vous pouvez installer l\'app depuis les paramètres du navigateur'
        );
      }
    }
  };


  const toggleSection = (sectionTitle) => {
    setExpandedSections(prev => {
      const newExpanded = prev.includes(sectionTitle)
        ? prev.filter(s => s !== sectionTitle)
        : [...prev, sectionTitle];
      localStorage.setItem('expandedSections', JSON.stringify(newExpanded));
      return newExpanded;
    });
  };

  const fetchNotifications = async () => {
    if (isSuperAdmin) return;
    try {
      // Generate automatic notifications first
      await apiClient.post(`/notifications/generate`).catch(() => {});
      // Then fetch all notifications
      const response = await apiClient.get(`/notifications`);
      setNotifications(response.data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);

  const markAllRead = async () => {
    try {
      await apiClient.put(`/notifications/read-all`);
      setNotifications([]);
    } catch (error) {
      console.error('Error marking notifications:', error);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Super Admin sees only SaaS management
  const superAdminNavSections = [
    {
      id: 'saas',
      title: 'NT Commerce',
      icon: Building,
      items: [
        { path: '/saas-admin', icon: Building, label: language === 'ar' ? 'لوحة تحكم SaaS' : 'SaaS Dashboard' },
        { path: '/saas-admin/feature-flags', icon: Shield, label: language === 'ar' ? 'إدارة الميزات' : 'Feature Flags' },
        { path: '/system-updates', icon: Bell, label: language === 'ar' ? 'تحديثات النظام' : 'Mises à jour système' },
        { path: '/security-dashboard', icon: Shield, label: language === 'ar' ? 'لوحة الأمان' : 'Sécurité' },
        { path: '/backup-system', icon: Database, label: language === 'ar' ? 'النسخ الاحتياطي' : 'Sauvegardes' },
        { path: '/data-import-export', icon: FileSpreadsheet, label: language === 'ar' ? 'استيراد/تصدير' : 'Import/Export' },
        { path: '/wallet-management', icon: Wallet, label: language === 'ar' ? 'المحافظ' : 'Portefeuilles' },
        { path: '/payments', icon: CreditCard, label: language === 'ar' ? 'المدفوعات' : 'Paiements' },
      ]
    }
  ];

  // Default nav sections for Tenants and regular users
  // Reorganized into 15 clear sections (by main heading)
  const tenantNavSections = [
    {
      id: 'home',
      featureKey: null,
      title: language === 'ar' ? 'الرئيسية' : 'Accueil',
      icon: LayoutDashboard,
      items: [
        { path: '/', icon: LayoutDashboard, label: t.dashboard },
        { path: '/smart-dashboard', icon: Sparkles, label: language === 'ar' ? 'لوحة التحكم الذكية' : 'Dashboard Intelligent' },
      ]
    },
    {
      id: 'customers',
      featureKey: 'customers',
      title: language === 'ar' ? 'الزبائن' : 'Clients',
      icon: Users,
      items: [
        { path: '/customers', icon: Users, label: t.customers, subFeature: 'customer_list' },
        { path: '/customer-families', icon: FolderTree, label: language === 'ar' ? 'عائلات الزبائن' : 'Familles clients', subFeature: 'customer_families' },
        { path: '/customer-debts', icon: CreditCard, label: t.customerDebts, subFeature: 'customer_debts', featureKey: 'credit_sales' },
      ]
    },
    {
      id: 'products',
      featureKey: 'inventory',
      title: language === 'ar' ? 'المنتجات' : 'Produits',
      icon: Package,
      items: [
        { path: '/products', icon: Package, label: t.products, subFeature: 'products' },
        { path: '/product-families', icon: FolderTree, label: t.productFamilies, subFeature: 'categories' },
        { path: '/warehouses', icon: Warehouse, label: language === 'ar' ? 'المخازن' : 'Entrepôts', subFeature: 'warehouses' },
        { path: '/inventory-count', icon: ClipboardList, label: language === 'ar' ? 'جرد المخزون' : 'Inventaire', subFeature: 'inventory_count' },
        { path: '/barcode-print', icon: QrCode, label: language === 'ar' ? 'الباركود' : 'Codes-barres', subFeature: 'barcode', featureKey: 'barcode' },
        { path: '/bulk-price-update', icon: DollarSign, label: t.bulkPriceUpdate },
        { path: '/price-history', icon: History, label: language === 'ar' ? 'سجل الأسعار' : 'Historique prix' },
        { path: '/defective-goods', icon: PackageX, label: language === 'ar' ? 'بضائع معيبة' : 'Défectueux' },
      ]
    },
    {
      id: 'purchases',
      featureKey: null,
      title: language === 'ar' ? 'المشتريات' : 'Achats',
      icon: ShoppingBag,
      items: [
        { path: '/purchases', icon: ShoppingBag, label: t.purchases, subFeature: 'purchase_orders' },
        { path: '/suppliers', icon: Truck, label: t.suppliers, subFeature: 'suppliers' },
        { path: '/supplier-families', icon: FolderTree, label: language === 'ar' ? 'عائلات الموردين' : 'Familles fournisseurs' },
        { path: '/supplier-tracking', icon: Truck, label: language === 'ar' ? 'تتبع الموردين' : 'Suivi fournisseurs' },
      ]
    },
    {
      id: 'sales',
      featureKey: null,
      title: language === 'ar' ? 'المبيعات' : 'Ventes',
      icon: ShoppingCart,
      items: [
        { path: '/pos', icon: ShoppingCart, label: t.pos, subFeature: 'pos', featureKey: 'pos' },
        { path: '/sales', icon: Receipt, label: t.sales, subFeature: 'invoices' },
        { path: '/installments', icon: CreditCard, label: language === 'ar' ? 'الأقساط' : 'Versements' },
        { path: '/daily-sessions', icon: Clock, label: language === 'ar' ? 'حصص البيع' : 'Sessions' },
        { path: '/daily-report', icon: Calendar, label: language === 'ar' ? 'التقرير اليومي' : 'Rapport Journalier' },
        { path: '/sales/advanced-report', icon: BarChart3, label: language === 'ar' ? 'تقارير المبيعات' : 'Rapports ventes' },
        { path: '/reports', icon: BarChart3, label: t.reports, subFeature: 'sales_reports', featureKey: 'reports' },
        { path: '/analytics', icon: BarChart3, label: language === 'ar' ? 'إحصائيات متقدمة' : 'Analyses', subFeature: 'financial_reports', featureKey: 'reports' },
        { path: '/smart-reports', icon: Sparkles, label: language === 'ar' ? 'تقارير ذكية' : 'Rapports IA', subFeature: 'smart_reports', featureKey: 'reports' },
      ]
    },
    {
      id: 'expenses',
      featureKey: null,
      title: language === 'ar' ? 'المصاريف' : 'Dépenses',
      icon: Receipt,
      items: [
        { path: '/expenses', icon: Receipt, label: language === 'ar' ? 'المصاريف' : 'Dépenses' },
      ]
    },
    {
      id: 'finance',
      featureKey: null,
      title: language === 'ar' ? 'المالية' : 'Finance',
      icon: Wallet,
      items: [
        { path: '/cash', icon: Wallet, label: t.cashManagement },
        { path: '/debts', icon: Receipt, label: t.debts },
        { path: '/tax-reports', icon: FileText, label: language === 'ar' ? 'الضرائب' : 'Taxes' },
        { path: '/currencies', icon: Coins, label: language === 'ar' ? 'العملات' : 'Devises' },
        { path: '/banking', icon: Landmark, label: language === 'ar' ? 'البنك' : 'Banque' },
        { path: '/ai-chat', icon: Sparkles, label: language === 'ar' ? 'المحاسب الذكي' : 'Comptable IA', featureKey: 'ai_bots' },
        { path: '/ai-agents', icon: Zap, label: language === 'ar' ? 'الوكلاء الذكيين' : 'Agents IA', featureKey: 'ai_bots' },
        { path: '/robots', icon: Bot, label: language === 'ar' ? 'الروبوتات' : 'Robots', featureKey: 'ai_bots' },
      ]
    },
    {
      id: 'employees',
      featureKey: null,
      title: language === 'ar' ? 'الموظفون' : 'Employés',
      icon: Users,
      items: [
        ...(isAdmin ? [
          { path: '/employees', icon: Users, label: language === 'ar' ? 'الموظفين' : 'Employés' },
          { path: '/employee-alerts', icon: Bell, label: language === 'ar' ? 'تنبيهات الحدود' : 'Alertes' },
          { path: '/task-management', icon: CheckSquare, label: language === 'ar' ? 'المهام' : 'Tâches' },
        ] : [])
      ]
    },
    {
      id: 'system-users',
      featureKey: null,
      title: language === 'ar' ? 'مستخدمي النظام' : 'Utilisateurs système',
      icon: Shield,
      items: [
        ...(isAdmin ? [
          { path: '/users', icon: Shield, label: language === 'ar' ? 'المستخدمين' : 'Utilisateurs' },
          { path: '/permissions', icon: Shield, label: language === 'ar' ? 'الصلاحيات' : 'Permissions' },
          { path: '/settings/sales-permissions', icon: Shield, label: language === 'ar' ? 'صلاحيات المبيعات' : 'Perm. ventes' },
        ] : [])
      ]
    },
    {
      id: 'services',
      featureKey: 'recharge',
      title: language === 'ar' ? 'خدمة شحن رصيد الجوال' : 'Recharge mobile',
      icon: Smartphone,
      items: [
        { path: '/services', icon: Store, label: language === 'ar' ? 'الخدمات' : 'Services' },
        { path: '/services/flexy', icon: Smartphone, label: language === 'ar' ? 'فليكسي' : 'Flexy' },
        { path: '/services/idoom', icon: Zap, label: language === 'ar' ? 'أيدوم' : 'Idoom' },
        { path: '/services/cards', icon: CreditCard, label: language === 'ar' ? 'بطاقات' : 'Cartes' },
        { path: '/services/operations', icon: Clock, label: language === 'ar' ? 'العمليات' : 'Opérations' },
        { path: '/services/profits', icon: DollarSign, label: language === 'ar' ? 'الأرباح' : 'Profits' },
        { path: '/services/transfers', icon: Receipt, label: language === 'ar' ? 'التحويلات' : 'Transferts' },
        { path: '/services/directory', icon: Users, label: language === 'ar' ? 'الدليل' : 'Annuaire' },
        { path: '/recharge', icon: Smartphone, label: t.recharge },
        { path: '/wallet-management', icon: Wallet, label: language === 'ar' ? 'المحفظة' : 'Portefeuille', featureKey: 'wallet' },
        ...(isAdmin ? [
          { path: '/sim-management', icon: Zap, label: language === 'ar' ? 'إدارة الشرائح' : 'Gestion SIM' },
        ] : [])
      ]
    },
    {
      id: 'digital-panel',
      featureKey: 'iptv',
      title: language === 'ar' ? 'الخدمات الرقمية (IPTV)' : 'Services digitaux (IPTV)',
      icon: Tv,
      items: [
        { path: '/digital-panel', icon: Tv, label: language === 'ar' ? 'لوحة البانل' : 'Tableau de bord' },
        { path: '/digital-panel/subscriptions', icon: Tv, label: language === 'ar' ? 'الاشتراكات' : 'Abonnements' },
        { path: '/digital-panel/resellers', icon: Users, label: language === 'ar' ? 'الموزّعون' : 'Revendeurs' },
        { path: '/digital-panel/services', icon: Boxes, label: language === 'ar' ? 'كتالوج الخدمات' : 'Catalogue' },
      ]
    },
    {
      id: 'repairs',
      featureKey: 'maintenance',
      title: language === 'ar' ? 'الصيانة' : 'Réparations',
      icon: Wrench,
      items: [
        { path: '/repairs', icon: Wrench, label: language === 'ar' ? 'الصيانة' : 'Réparations', subFeature: 'repair_tickets' },
        { path: '/repairs/new', icon: Smartphone, label: language === 'ar' ? 'استقبال جهاز' : 'Réception' },
        { path: '/defective-goods', icon: PackageX, label: language === 'ar' ? 'بضائع معيبة' : 'Défectueux' },
        ...(isAdmin ? [
          { path: '/whatsapp', icon: MessageSquare, label: 'WhatsApp' },
        ] : [])
      ]
    },
    {
      id: 'ecommerce',
      featureKey: null,
      title: language === 'ar' ? 'التجارة الإلكترونية' : 'E-commerce',
      icon: Store,
      items: [
        { path: '/store', icon: Store, label: language === 'ar' ? 'المتجر' : 'Boutique', subFeature: 'online_store' },
        { path: '/loyalty', icon: Award, label: language === 'ar' ? 'الولاء' : 'Fidélité', featureKey: 'loyalty_points' },
        ...(isAdmin ? [
          { path: '/woocommerce', icon: Store, label: 'WooCommerce', subFeature: 'woocommerce' },
          { path: '/integrations/status', icon: Settings, label: language === 'ar' ? 'حالة التكاملات' : 'Intégrations' },
          { path: '/two-factor', icon: Shield, label: language === 'ar' ? '2FA' : '2FA' },
          { path: '/api-keys', icon: Key, label: t.apiKeys },
        ] : [])
      ]
    },
    {
      id: 'shipping',
      featureKey: null,
      title: language === 'ar' ? 'خدمة الشحن والتوصيل' : 'Livraison',
      icon: Truck,
      items: [
        ...(isAdmin ? [
          { path: '/shipping', icon: Truck, label: language === 'ar' ? 'الشحن' : 'Livraison', subFeature: 'shipping_companies' },
          { path: '/integrations/yalidine', icon: Truck, label: 'Yalidine' },
        ] : [])
      ]
    },
    {
      id: 'settings',
      featureKey: null,
      title: language === 'ar' ? 'الإعدادات' : 'Paramètres',
      icon: Settings,
      items: [
        ...(isAdmin ? [
          { path: '/settings', icon: Settings, label: t.settings },
          { path: '/backup-system', icon: Database, label: language === 'ar' ? 'النسخ الاحتياطي' : 'Sauvegardes', featureKey: 'backup' },
          { path: '/data-import-export', icon: FileSpreadsheet, label: language === 'ar' ? 'استيراد/تصدير' : 'Import/Export' },
          { path: '/motherboard', icon: CircuitBoard, label: language === 'ar' ? 'اللوحة الأم' : 'Carte mère' },
          { path: '/settings/sidebar', icon: LayoutDashboard, label: language === 'ar' ? 'ترتيب القائمة' : 'Ordre menu' },
        ] : [])
      ]
    },
    {
      id: 'messages-notifications',
      featureKey: null,
      title: language === 'ar' ? 'الرسائل والإشعارات' : 'Messages & Notifications',
      icon: Bell,
      items: [
        ...(isAdmin ? [
          { path: '/notifications', icon: Bell, label: language === 'ar' ? 'الإشعارات' : 'Notifications', subFeature: 'push_notifications' },
          { path: '/smart-notifications', icon: Bell, label: language === 'ar' ? 'إشعارات ذكية' : 'Notif. IA' },
          { path: '/email-notifications', icon: Mail, label: language === 'ar' ? 'إشعارات البريد' : 'Email', subFeature: 'email_notifications' },
          { path: '/internal-chat', icon: MessageCircle, label: language === 'ar' ? 'الدردشة' : 'Chat' },
        ] : [])
      ]
    }
  ];

  // Derive cashier-allowed paths from sidebarMenu.js (single source of truth via minRole)
  const CASHIER_ALLOWED_PATHS = new Set(
    defaultMenuSections.flatMap(section =>
      section.items
        .filter(item => item.minRole === 'cashier')
        .map(item => item.path)
    )
  );

  // Filter sections based on feature flags.
  // Supports three levels of filtering:
  //   1. Section-level featureKey  — hides the entire section
  //   2. item.subFeature           — hides items within a feature category (nested format)
  //   3. item.featureKey           — hides individual items using a flat flag
  const filterNavSections = (sections) => {
    return sections
      .filter(section => {
        if (!section.featureKey) return true;
        return isFeatureEnabled(section.featureKey);
      })
      .map(section => {
        const filteredItems = section.items.filter(item => {
          // Section-scoped sub-feature check (plan-level nested format)
          if (section.featureKey && item.subFeature) {
            if (!isFeatureEnabled(section.featureKey, item.subFeature)) return false;
          }
          // Item-level flat feature key (per-tenant override format)
          if (item.featureKey) {
            if (!isFeatureEnabled(item.featureKey)) return false;
          }
          return true;
        });
        return { ...section, items: filteredItems };
      })
      .filter(section => section.items.length > 0);
  };

  // Cashier role sees only the allowed subset of nav items
  const filterNavSectionsForCashier = (sections) => {
    return sections
      .map(section => ({
        ...section,
        items: section.items.filter(item => CASHIER_ALLOWED_PATHS.has(item.path)),
      }))
      .filter(section => section.items.length > 0);
  };

  // Select navigation based on user type
  const defaultNavSections = isSuperAdmin
    ? superAdminNavSections
    : isCashier
      ? filterNavSectionsForCashier(tenantNavSections)
      : filterNavSections(tenantNavSections);

  // Build navSections from customSidebarOrder if available
  const navSections = (() => {
    if (!customSidebarOrder) return defaultNavSections;
    
    // Create a map of default sections for quick lookup
    const defaultMap = {};
    defaultNavSections.forEach(section => {
      defaultMap[section.id] = section;
    });
    
    // Build sections based on custom order
    const built = customSidebarOrder
      .filter(customSection => customSection.visible !== false)
      .map(customSection => {
        const defaultSection = defaultMap[customSection.id];
        if (defaultSection) {
          // Use default section but apply custom item order and visibility
          const customItemPaths = [...new Set(
            customSection.items
              .filter(item => item.visible !== false)
              .map(item => item.path)
          )];
          
          const orderedItems = customItemPaths
            .map(path => defaultSection.items.find(item => item.path === path))
            .filter(Boolean);
          
          return {
            ...defaultSection,
            title: language === 'ar' ? customSection.titleAr : customSection.titleFr,
            icon: iconMap[customSection.icon] || defaultSection.icon,
            items: orderedItems.length > 0 ? orderedItems : defaultSection.items
          };
        }
        
        // Built-in section that is absent from defaults (filtered out by feature flag
        // or admin gating). Do NOT render it from saved custom data — that would bypass
        // isAdmin/feature filtering and expose admin-only sections to non-admins. Skip it.
        if (!customSection.isCustom) {
          return null;
        }

        // Truly user-created custom section - convert from saved format
        return {
          id: customSection.id,
          title: language === 'ar' ? customSection.titleAr : customSection.titleFr,
          icon: iconMap[customSection.icon] || Package,
          items: customSection.items
            .filter(item => item.visible !== false)
            .map(item => ({
              path: item.path,
              icon: iconMap[item.icon] || Package,
              label: language === 'ar' ? item.labelAr : item.labelFr
            }))
        };
      })
      .filter(Boolean)
      .filter(section => section.items.length > 0);

    // Distinguish a stale/incompatible saved order from an intentional "hide all".
    // A saved section is resolvable only if it maps to a current default section
    // or is a genuine custom section. If NONE are resolvable, the saved order
    // references an OLD structure (e.g. the pre-restructure 4-section ids) — fall
    // back to the current defaults so the sidebar is never empty. If some are
    // resolvable but the user hid them all, respect that intent.
    if (built.length === 0) {
      const hasResolvableSavedSection = customSidebarOrder.some(
        customSection => defaultMap[customSection.id] || customSection.isCustom === true
      );
      if (!hasResolvableSavedSection) return defaultNavSections;
    }
    return built;
  })();

  // Auto-expand section containing active page
  useEffect(() => {
    const currentPath = location.pathname;
    const activeSection = navSections.find(section => 
      section.items?.some(item => {
        if (item.path === '/') return currentPath === '/';
        return currentPath.startsWith(item.path);
      })
    );
    if (activeSection && !expandedSections.includes(activeSection.title)) {
      setExpandedSections(prev => [...prev, activeSection.title]);
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preserve sidebar scroll position across navigation (Layout remounts per page)
  useEffect(() => {
    const saved = sessionStorage.getItem('sidebarScroll');
    if (saved && navRef.current) {
      requestAnimationFrame(() => {
        if (navRef.current) navRef.current.scrollTop = parseInt(saved, 10);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 bg-card/80 backdrop-blur-md border-b">
        <div className="flex items-center justify-between px-4 h-16">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-muted rounded-lg"
            data-testid="mobile-menu-btn"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="flex items-center gap-2 min-w-0">
            {brandLogo ? (
              <img src={brandLogo} alt={brandName} className="h-8 w-8 rounded-lg object-cover border flex-shrink-0" />
            ) : (
              <Shield className="h-6 w-6 text-primary flex-shrink-0" />
            )}
            <h1 className="font-bold text-lg truncate">{brandName}</h1>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-muted rounded-lg"
              data-testid="mobile-theme-toggle"
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={toggleLanguage}
              className="p-2 hover:bg-muted rounded-lg"
              data-testid="mobile-lang-toggle"
            >
              <Globe className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed top-0 ${isRTL ? 'right-0' : 'left-0'} z-50 h-full bg-card border-e
          transform transition-all duration-300 ease-in-out
          ${sidebarCollapsed ? 'w-16' : 'w-64'}
          ${sidebarOpen ? 'translate-x-0' : isRTL ? 'translate-x-full' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo + Tenant identity */}
          <div className={`flex items-center justify-between h-16 border-b ${sidebarCollapsed ? 'px-2' : 'px-4'}`}>
            <div className="flex items-center gap-2 min-w-0">
              {brandLogo ? (
                <img src={brandLogo} alt={brandName} className="h-9 w-9 rounded-lg object-cover flex-shrink-0 border" />
              ) : (
                <Shield className="h-7 w-7 text-primary flex-shrink-0" />
              )}
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <span className="font-bold text-base block truncate leading-tight">{brandName}</span>
                  {user?.name && (
                    <span className="text-xs text-muted-foreground block truncate leading-tight">{user.name}</span>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1 hover:bg-muted rounded flex-shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tenant user email (moved to top) */}
          {!sidebarCollapsed && user?.email && (
            <div className="px-4 py-1.5 border-b flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
              {isAdmin && (
                <span className="flex-shrink-0 px-2 py-0.5 text-[10px] bg-primary/10 text-primary rounded-full">Admin</span>
              )}
            </div>
          )}

          {/* Compact control toolbar — medium icons to save space for section titles */}
          {!reorderMode && (
            <div className={`hidden md:flex items-center border-b py-1.5 ${sidebarCollapsed ? 'flex-col gap-1 px-1' : 'justify-center gap-1 px-2'}`}>
              {/* Collapse / expand the whole sidebar */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title={sidebarCollapsed ? t.expandSidebar : t.collapseSidebar}
                data-testid="sidebar-toggle-btn"
              >
                {sidebarCollapsed ? (
                  isRTL ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />
                ) : (
                  isRTL ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />
                )}
              </button>

              {!sidebarCollapsed && (
                <>
                  {/* Expand all sections */}
                  <button
                    onClick={() => setExpandedSections(navSections.map(s => s.title))}
                    className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title={language === 'ar' ? 'فتح الكل' : 'Tout ouvrir'}
                    data-testid="expand-all-btn"
                  >
                    <ChevronsDown className="h-5 w-5" />
                  </button>
                  {/* Collapse all sections */}
                  <button
                    onClick={() => setExpandedSections([])}
                    className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title={language === 'ar' ? 'غلق الكل' : 'Tout fermer'}
                    data-testid="collapse-all-btn"
                  >
                    <ChevronsUp className="h-5 w-5" />
                  </button>
                  {/* Drag-reorder menu (tenant admin only) */}
                  {isAdmin && !isSuperAdmin && (
                    <button
                      onClick={() => setReorderMode(true)}
                      className="p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title={language === 'ar' ? 'ترتيب القائمة بالسحب' : 'Réorganiser le menu'}
                      data-testid="sidebar-reorder-btn"
                    >
                      <GripVertical className="h-5 w-5" />
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Inline reorder mode */}
          {reorderMode && !sidebarCollapsed && (
            <div className="flex-1 overflow-hidden">
              <SidebarReorder
                navSections={navSections}
                language={language}
                onClose={() => setReorderMode(false)}
              />
            </div>
          )}

          {/* Navigation */}
          {!(reorderMode && !sidebarCollapsed) && (
          <nav
            ref={navRef}
            onScroll={(e) => sessionStorage.setItem('sidebarScroll', String(e.currentTarget.scrollTop))}
            className="flex-1 p-2 space-y-1 overflow-y-auto"
          >
            {navSections.map((section) => (
              <div key={section.title} className="mb-2">
                {/* Section Header */}
                {!sidebarCollapsed && (
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm font-bold text-foreground uppercase tracking-wider hover:bg-muted/50 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <section.icon className="h-4 w-4" />
                      <span>{section.title}</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.includes(section.title) ? 'rotate-180' : ''}`} />
                  </button>
                )}
                
                {/* Section Items */}
                {(sidebarCollapsed || expandedSections.includes(section.title)) && (
                  <div className={`space-y-1 ${!sidebarCollapsed ? 'mt-1 ms-2' : ''}`}>
                    {section.items.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                          isActive(item.path) 
                            ? 'bg-primary text-primary-foreground font-medium shadow-md ring-2 ring-primary/30' 
                            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                        } ${sidebarCollapsed ? 'justify-center' : ''}`}
                        data-testid={`nav-${item.path.replace(/\//g, '-') || 'home'}`}
                        title={sidebarCollapsed ? item.label : ''}
                      >
                        <item.icon className={`h-5 w-5 flex-shrink-0 ${isActive(item.path) ? '' : 'opacity-70'}`} />
                        {!sidebarCollapsed && <span className="truncate text-sm">{item.label}</span>}
                        {!sidebarCollapsed && item.path === '/products' && lowStockCount > 0 && (
                          <span className="ms-auto shrink-0 h-4 min-w-4 px-1 text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center">
                            {lowStockCount > 99 ? '99+' : lowStockCount}
                          </span>
                        )}
                        {sidebarCollapsed && item.path === '/products' && lowStockCount > 0 && (
                          <span className="absolute top-0.5 end-0.5 h-3 w-3 bg-red-500 rounded-full border border-card" />
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
          )}

          {/* Logout */}
          <div className={`p-2 border-t ${sidebarCollapsed ? 'px-2' : 'p-4'}`}>
            <Button
              variant="outline"
              className={`w-full gap-2 ${sidebarCollapsed ? 'justify-center px-2' : 'justify-start'}`}
              onClick={handleLogout}
              data-testid="logout-btn"
              title={sidebarCollapsed ? t.logout : ''}
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              {!sidebarCollapsed && t.logout}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'md:ms-16' : 'md:ms-64'}`}>
        {/* Desktop Header */}
        <header className="hidden md:flex items-center justify-between h-16 px-8 bg-card/80 backdrop-blur-md border-b sticky top-0 z-40">
          {/* Search Bar - Using UnifiedSearch */}
          <div className="flex-1 max-w-xl">
            <UnifiedSearch mode="header" />
          </div>

          <div className="flex items-center gap-4 ms-6">
            {/* Notifications */}
            <NotificationBell />

            {/* Language Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleLanguage()}
                className={`lang-btn ${language === 'fr' ? 'active' : ''}`}
                data-testid="lang-fr-btn"
              >
                FR
              </button>
              <button
                onClick={() => toggleLanguage()}
                className={`lang-btn ${language === 'ar' ? 'active' : ''}`}
                data-testid="lang-ar-btn"
              >
                عربي
              </button>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              data-testid="theme-toggle-btn"
              title={isDark ? (language === 'ar' ? 'الوضع الفاتح' : 'Mode clair') : (language === 'ar' ? 'الوضع المظلم' : 'Mode sombre')}
            >
              {isDark ? (
                <Sun className="h-5 w-5 text-amber-500" />
              ) : (
                <Moon className="h-5 w-5 text-slate-600" />
              )}
            </button>

            {/* Install App Button */}
            <button
              onClick={handleInstallClick}
              className="p-2 hover:bg-muted rounded-lg transition-colors flex items-center gap-2 bg-primary/10 text-primary"
              data-testid="install-app-btn"
              title={language === 'ar' ? 'تثبيت التطبيق' : 'Installer l\'app'}
            >
              <Download className="h-5 w-5" />
              <span className="hidden lg:inline text-sm font-medium">
                {language === 'ar' ? 'تثبيت' : 'Installer'}
              </span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6 md:p-8 pt-20 md:pt-8">
          {children}
        </main>
      </div>

      {/* Global Search Modal (Ctrl+K) */}
      <GlobalSearchModal
        open={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
        language={language}
      />
    </div>
  );
};
