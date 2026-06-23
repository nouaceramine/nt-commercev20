// Canonical sidebar menu definition — SINGLE SOURCE OF TRUTH.
// MUST mirror tenantNavSections in components/Layout.js (matched by section `id`
// and item `path`). Consumed by both the reorder editor page (SidebarSettingsPage)
// and the inline sidebar reorder (SidebarReorder). When the real sidebar changes,
// update this list to match.
export const defaultMenuSections = [
  {
    id: 'home',
    titleAr: 'الرئيسية',
    titleFr: 'Accueil',
    icon: 'LayoutDashboard',
    visible: true,
    isCustom: false,
    items: [
      { id: 'dashboard', path: '/', icon: 'LayoutDashboard', labelAr: 'لوحة التحكم', labelFr: 'Tableau de bord', visible: true },
      { id: 'smart-dashboard', path: '/smart-dashboard', icon: 'Star', labelAr: 'لوحة التحكم الذكية', labelFr: 'Dashboard Intelligent', visible: true },
    ]
  },
  {
    id: 'customers',
    titleAr: 'الزبائن',
    titleFr: 'Clients',
    icon: 'Users',
    visible: true,
    isCustom: false,
    items: [
      { id: 'customers', path: '/customers', icon: 'Users', labelAr: 'الزبائن', labelFr: 'Clients', visible: true, minRole: 'cashier' },
      { id: 'customer-families', path: '/customer-families', icon: 'FolderTree', labelAr: 'عائلات الزبائن', labelFr: 'Familles clients', visible: true },
      { id: 'customer-debts', path: '/customer-debts', icon: 'CreditCard', labelAr: 'ديون الزبائن', labelFr: 'Dettes clients', visible: true },
    ]
  },
  {
    id: 'products',
    titleAr: 'المنتجات',
    titleFr: 'Produits',
    icon: 'Package',
    visible: true,
    isCustom: false,
    items: [
      { id: 'products', path: '/products', icon: 'Package', labelAr: 'المنتجات', labelFr: 'Produits', visible: true, minRole: 'cashier' },
      { id: 'product-families', path: '/product-families', icon: 'FolderTree', labelAr: 'عائلات المنتجات', labelFr: 'Familles produits', visible: true },
      { id: 'warehouses', path: '/warehouses', icon: 'Warehouse', labelAr: 'المخازن', labelFr: 'Entrepôts', visible: true },
      { id: 'inventory-count', path: '/inventory-count', icon: 'ClipboardList', labelAr: 'جرد المخزون', labelFr: 'Inventaire', visible: true },
      { id: 'barcode-print', path: '/barcode-print', icon: 'QrCode', labelAr: 'الباركود', labelFr: 'Codes-barres', visible: true },
      { id: 'bulk-price-update', path: '/bulk-price-update', icon: 'DollarSign', labelAr: 'تحديث الأسعار الجماعي', labelFr: 'Mise à jour prix en masse', visible: true },
      { id: 'price-history', path: '/price-history', icon: 'Clock', labelAr: 'سجل الأسعار', labelFr: 'Historique prix', visible: true },
      { id: 'products-defective-goods', path: '/defective-goods', icon: 'Package', labelAr: 'بضائع معيبة', labelFr: 'Défectueux', visible: true },
    ]
  },
  {
    id: 'purchases',
    titleAr: 'المشتريات',
    titleFr: 'Achats',
    icon: 'ShoppingBag',
    visible: true,
    isCustom: false,
    items: [
      { id: 'purchases', path: '/purchases', icon: 'ShoppingBag', labelAr: 'المشتريات', labelFr: 'Achats', visible: true },
      { id: 'suppliers', path: '/suppliers', icon: 'Truck', labelAr: 'الموردين', labelFr: 'Fournisseurs', visible: true },
      { id: 'supplier-families', path: '/supplier-families', icon: 'FolderTree', labelAr: 'عائلات الموردين', labelFr: 'Familles fournisseurs', visible: true },
      { id: 'supplier-tracking', path: '/supplier-tracking', icon: 'Truck', labelAr: 'تتبع الموردين', labelFr: 'Suivi fournisseurs', visible: true },
    ]
  },
  {
    id: 'sales',
    titleAr: 'المبيعات',
    titleFr: 'Ventes',
    icon: 'ShoppingCart',
    visible: true,
    isCustom: false,
    items: [
      { id: 'pos', path: '/pos', icon: 'ShoppingCart', labelAr: 'نقطة البيع', labelFr: 'Point de vente', visible: true, minRole: 'cashier' },
      { id: 'sales', path: '/sales', icon: 'Receipt', labelAr: 'المبيعات', labelFr: 'Ventes', visible: true },
      { id: 'daily-sessions', path: '/daily-sessions', icon: 'Clock', labelAr: 'حصص البيع', labelFr: 'Sessions', visible: true },
      { id: 'sales-advanced-report', path: '/sales/advanced-report', icon: 'BarChart3', labelAr: 'تقارير المبيعات', labelFr: 'Rapports ventes', visible: true },
      { id: 'reports', path: '/reports', icon: 'BarChart3', labelAr: 'التقارير', labelFr: 'Rapports', visible: true },
      { id: 'analytics', path: '/analytics', icon: 'BarChart3', labelAr: 'إحصائيات متقدمة', labelFr: 'Analyses', visible: true },
      { id: 'smart-reports', path: '/smart-reports', icon: 'Star', labelAr: 'تقارير ذكية', labelFr: 'Rapports IA', visible: true },
    ]
  },
  {
    id: 'expenses',
    titleAr: 'المصاريف',
    titleFr: 'Dépenses',
    icon: 'Receipt',
    visible: true,
    isCustom: false,
    items: [
      { id: 'expenses', path: '/expenses', icon: 'Receipt', labelAr: 'المصاريف', labelFr: 'Dépenses', visible: true },
    ]
  },
  {
    id: 'finance',
    titleAr: 'المالية',
    titleFr: 'Finance',
    icon: 'Wallet',
    visible: true,
    isCustom: false,
    items: [
      { id: 'cash', path: '/cash', icon: 'Wallet', labelAr: 'إدارة المال', labelFr: 'Gestion caisse', visible: true },
      { id: 'debts', path: '/debts', icon: 'Receipt', labelAr: 'الديون', labelFr: 'Dettes', visible: true },
      { id: 'payments', path: '/payments', icon: 'CreditCard', labelAr: 'المدفوعات', labelFr: 'Paiements', visible: true },
      { id: 'tax-reports', path: '/tax-reports', icon: 'FileText', labelAr: 'الضرائب', labelFr: 'Taxes', visible: true },
      { id: 'currencies', path: '/currencies', icon: 'DollarSign', labelAr: 'العملات', labelFr: 'Devises', visible: true },
      { id: 'banking', path: '/banking', icon: 'DollarSign', labelAr: 'البنك', labelFr: 'Banque', visible: true },
      { id: 'ai-chat', path: '/ai-chat', icon: 'Star', labelAr: 'المحاسب الذكي', labelFr: 'Comptable IA', visible: true },
      { id: 'ai-agents', path: '/ai-agents', icon: 'Zap', labelAr: 'الوكلاء الذكيين', labelFr: 'Agents IA', visible: true },
      { id: 'robots', path: '/robots', icon: 'Zap', labelAr: 'الروبوتات', labelFr: 'Robots', visible: true },
    ]
  },
  {
    id: 'employees',
    titleAr: 'الموظفون',
    titleFr: 'Employés',
    icon: 'Users',
    visible: true,
    isCustom: false,
    items: [
      { id: 'employees', path: '/employees', icon: 'Users', labelAr: 'الموظفين', labelFr: 'Employés', visible: true },
      { id: 'employee-alerts', path: '/employee-alerts', icon: 'Bell', labelAr: 'تنبيهات الحدود', labelFr: 'Alertes', visible: true },
      { id: 'task-management', path: '/task-management', icon: 'ClipboardList', labelAr: 'المهام', labelFr: 'Tâches', visible: true },
    ]
  },
  {
    id: 'system-users',
    titleAr: 'مستخدمي النظام',
    titleFr: 'Utilisateurs système',
    icon: 'Shield',
    visible: true,
    isCustom: false,
    items: [
      { id: 'users', path: '/users', icon: 'Shield', labelAr: 'المستخدمين', labelFr: 'Utilisateurs', visible: true },
      { id: 'permissions', path: '/permissions', icon: 'Shield', labelAr: 'الصلاحيات', labelFr: 'Permissions', visible: true },
      { id: 'sales-permissions', path: '/settings/sales-permissions', icon: 'Shield', labelAr: 'صلاحيات المبيعات', labelFr: 'Perm. ventes', visible: true },
    ]
  },
  {
    id: 'services',
    titleAr: 'خدمة شحن رصيد الجوال',
    titleFr: 'Recharge mobile',
    icon: 'Smartphone',
    visible: true,
    isCustom: false,
    items: [
      { id: 'services', path: '/services', icon: 'Store', labelAr: 'الخدمات', labelFr: 'Services', visible: true },
      { id: 'services-flexy', path: '/services/flexy', icon: 'Smartphone', labelAr: 'فليكسي', labelFr: 'Flexy', visible: true, minRole: 'cashier' },
      { id: 'services-idoom', path: '/services/idoom', icon: 'Zap', labelAr: 'أيدوم', labelFr: 'Idoom', visible: true, minRole: 'cashier' },
      { id: 'services-cards', path: '/services/cards', icon: 'CreditCard', labelAr: 'بطاقات', labelFr: 'Cartes', visible: true, minRole: 'cashier' },
      { id: 'services-operations', path: '/services/operations', icon: 'Clock', labelAr: 'العمليات', labelFr: 'Opérations', visible: true, minRole: 'cashier' },
      { id: 'services-profits', path: '/services/profits', icon: 'DollarSign', labelAr: 'الأرباح', labelFr: 'Profits', visible: true },
      { id: 'services-transfers', path: '/services/transfers', icon: 'Receipt', labelAr: 'التحويلات', labelFr: 'Transferts', visible: true },
      { id: 'services-directory', path: '/services/directory', icon: 'Users', labelAr: 'الدليل', labelFr: 'Annuaire', visible: true },
      { id: 'recharge', path: '/recharge', icon: 'Smartphone', labelAr: 'تعبئة', labelFr: 'Recharge', visible: true, minRole: 'cashier' },
      { id: 'wallet-management', path: '/wallet-management', icon: 'Wallet', labelAr: 'المحفظة', labelFr: 'Portefeuille', visible: true },
      { id: 'sim-management', path: '/sim-management', icon: 'Zap', labelAr: 'إدارة الشرائح', labelFr: 'Gestion SIM', visible: true },
    ]
  },
  {
    id: 'digital-panel',
    titleAr: 'الخدمات الرقمية (IPTV)',
    titleFr: 'Services digitaux (IPTV)',
    icon: 'Tv',
    visible: true,
    isCustom: false,
    items: [
      { id: 'digital-panel', path: '/digital-panel', icon: 'Tv', labelAr: 'لوحة البانل', labelFr: 'Tableau de bord', visible: true },
      { id: 'digital-panel-subscriptions', path: '/digital-panel/subscriptions', icon: 'Tv', labelAr: 'الاشتراكات', labelFr: 'Abonnements', visible: true },
      { id: 'digital-panel-resellers', path: '/digital-panel/resellers', icon: 'Users', labelAr: 'الموزّعون', labelFr: 'Revendeurs', visible: true },
      { id: 'digital-panel-services', path: '/digital-panel/services', icon: 'Boxes', labelAr: 'كتالوج الخدمات', labelFr: 'Catalogue', visible: true },
    ]
  },
  {
    id: 'repairs',
    titleAr: 'الصيانة',
    titleFr: 'Réparations',
    icon: 'Wrench',
    visible: true,
    isCustom: false,
    items: [
      { id: 'repairs', path: '/repairs', icon: 'Wrench', labelAr: 'الصيانة', labelFr: 'Réparations', visible: true },
      { id: 'repairs-new', path: '/repairs/new', icon: 'Smartphone', labelAr: 'استقبال جهاز', labelFr: 'Réception', visible: true },
      { id: 'defective-goods', path: '/defective-goods', icon: 'Package', labelAr: 'بضائع معيبة', labelFr: 'Défectueux', visible: true },
      { id: 'whatsapp', path: '/whatsapp', icon: 'Smartphone', labelAr: 'واتساب', labelFr: 'WhatsApp', visible: true },
    ]
  },
  {
    id: 'ecommerce',
    titleAr: 'التجارة الإلكترونية',
    titleFr: 'E-commerce',
    icon: 'Store',
    visible: true,
    isCustom: false,
    items: [
      { id: 'store', path: '/store', icon: 'Store', labelAr: 'المتجر', labelFr: 'Boutique', visible: true },
      { id: 'loyalty', path: '/loyalty', icon: 'Award', labelAr: 'الولاء', labelFr: 'Fidélité', visible: true },
      { id: 'woocommerce', path: '/woocommerce', icon: 'Store', labelAr: 'WooCommerce', labelFr: 'WooCommerce', visible: true },
      { id: 'integrations-status', path: '/integrations/status', icon: 'Settings', labelAr: 'حالة التكاملات', labelFr: 'Intégrations', visible: true },
      { id: 'two-factor', path: '/two-factor', icon: 'Shield', labelAr: 'المصادقة الثنائية', labelFr: '2FA', visible: true },
      { id: 'api-keys', path: '/api-keys', icon: 'Key', labelAr: 'مفاتيح API', labelFr: 'Clés API', visible: true },
    ]
  },
  {
    id: 'shipping',
    titleAr: 'خدمة الشحن والتوصيل',
    titleFr: 'Livraison',
    icon: 'Truck',
    visible: true,
    isCustom: false,
    items: [
      { id: 'shipping', path: '/shipping', icon: 'Truck', labelAr: 'الشحن', labelFr: 'Livraison', visible: true },
      { id: 'yalidine', path: '/integrations/yalidine', icon: 'Truck', labelAr: 'ياليدين', labelFr: 'Yalidine', visible: true },
    ]
  },
  {
    id: 'settings',
    titleAr: 'الإعدادات',
    titleFr: 'Paramètres',
    icon: 'Settings',
    visible: true,
    isCustom: false,
    items: [
      { id: 'settings', path: '/settings', icon: 'Settings', labelAr: 'الإعدادات', labelFr: 'Paramètres', visible: true },
      { id: 'backup-system', path: '/backup-system', icon: 'Shield', labelAr: 'النسخ الاحتياطي', labelFr: 'Sauvegardes', visible: true },
      { id: 'data-import-export', path: '/data-import-export', icon: 'FileText', labelAr: 'استيراد/تصدير', labelFr: 'Import/Export', visible: true },
      { id: 'motherboard', path: '/motherboard', icon: 'Settings', labelAr: 'اللوحة الأم', labelFr: 'Carte mère', visible: true },
      { id: 'sidebar-settings', path: '/settings/sidebar', icon: 'LayoutDashboard', labelAr: 'ترتيب القائمة', labelFr: 'Ordre menu', visible: true },
    ]
  },
  {
    id: 'messages-notifications',
    titleAr: 'الرسائل والإشعارات',
    titleFr: 'Messages & Notifications',
    icon: 'Bell',
    visible: true,
    isCustom: false,
    items: [
      { id: 'notifications', path: '/notifications', icon: 'Bell', labelAr: 'الإشعارات', labelFr: 'Notifications', visible: true },
      { id: 'smart-notifications', path: '/smart-notifications', icon: 'Bell', labelAr: 'إشعارات ذكية', labelFr: 'Notif. IA', visible: true },
      { id: 'email-notifications', path: '/email-notifications', icon: 'FileText', labelAr: 'إشعارات البريد', labelFr: 'Email', visible: true },
      { id: 'internal-chat', path: '/internal-chat', icon: 'Users', labelAr: 'الدردشة', labelFr: 'Chat', visible: true },
    ]
  },
];

export default defaultMenuSections;
