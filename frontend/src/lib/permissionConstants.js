/**
 * Permission Constants
 * Extracted from PermissionsTab.js (Refactoring: Replace Magic Numbers)
 */

export const AVAILABLE_ROLES = [
  { value: 'admin', label_ar: 'مدير', label_fr: 'Admin', color: 'bg-red-500', desc_ar: 'صلاحيات كاملة على المتجر', desc_fr: 'Full store access' },
  { value: 'manager', label_ar: 'مشرف', label_fr: 'Manager', color: 'bg-blue-500', desc_ar: 'إدارة العمليات اليومية', desc_fr: 'Daily operations management' },
  { value: 'sales_supervisor', label_ar: 'مشرف مبيعات', label_fr: 'Sales Supervisor', color: 'bg-teal-500', desc_ar: 'إشراف على المبيعات والعملاء', desc_fr: 'Sales and customer oversight' },
  { value: 'seller', label_ar: 'بائع', label_fr: 'Vendeur', color: 'bg-green-500', desc_ar: 'عمليات البيع الأساسية فقط', desc_fr: 'Basic sales operations only' },
  { value: 'inventory_manager', label_ar: 'مدير مخزون', label_fr: 'Inventory Manager', color: 'bg-orange-500', desc_ar: 'إدارة المخزون والمشتريات', desc_fr: 'Stock and purchase management' },
  { value: 'ecommerce_manager', label_ar: 'مسؤول متجر إلكتروني', label_fr: 'E-commerce Manager', color: 'bg-indigo-500', desc_ar: 'إدارة المتجر الإلكتروني', desc_fr: 'Online store management' },
  { value: 'accountant', label_ar: 'محاسب', label_fr: 'Comptable', color: 'bg-amber-500', desc_ar: 'التقارير المالية والديون والمصاريف', desc_fr: 'Financial reports, debts, and expenses' },
  { value: 'user', label_ar: 'مستخدم عادي', label_fr: 'Utilisateur', color: 'bg-gray-500', desc_ar: 'عرض فقط', desc_fr: 'View only' },
];

export const ROLE_COLORS = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  super_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  seller: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  sales_supervisor: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  inventory_manager: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  ecommerce_manager: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  accountant: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

export function getPermissionCategories(language) {
  const ar = language === 'ar';
  return [
    { key: 'dashboard', label: ar ? 'لوحة التحكم' : 'Dashboard', simple: true },
    { key: 'pos', label: ar ? 'نقطة البيع' : 'POS', simple: true },
    { key: 'products', label: ar ? 'المنتجات' : 'Products', simple: false, actions: ['view', 'add', 'edit', 'delete', 'price_change', 'stock_adjust'] },
    { key: 'inventory', label: ar ? 'المخزون' : 'Inventory', simple: false, actions: ['view', 'add', 'edit', 'delete', 'transfer', 'count'] },
    { key: 'purchases', label: ar ? 'المشتريات' : 'Purchases', simple: false, actions: ['view', 'add', 'edit', 'delete', 'approve'] },
    { key: 'sales', label: ar ? 'المبيعات' : 'Sales', simple: false, actions: ['view', 'add', 'edit', 'delete', 'refund', 'discount'] },
    { key: 'customers', label: ar ? 'الزبائن' : 'Customers', simple: false, actions: ['view', 'add', 'edit', 'delete', 'credit', 'blacklist'] },
    { key: 'suppliers', label: ar ? 'الموردين' : 'Suppliers', simple: false, actions: ['view', 'add', 'edit', 'delete', 'payments'] },
    { key: 'employees', label: ar ? 'الموظفين' : 'Employees', simple: false, actions: ['view', 'add', 'edit', 'delete', 'salary', 'attendance'] },
    { key: 'debts', label: ar ? 'الديون' : 'Debts', simple: false, actions: ['view', 'add', 'edit', 'delete', 'collect'] },
    { key: 'expenses', label: ar ? 'المصاريف' : 'Expenses', simple: false, actions: ['view', 'add', 'edit', 'delete', 'approve'] },
    { key: 'reports', label: ar ? 'التقارير' : 'Reports', simple: false, actions: ['sales', 'inventory', 'financial', 'customers', 'employees', 'advanced'] },
    { key: 'users', label: ar ? 'المستخدمين' : 'Users', simple: false, actions: ['view', 'add', 'edit', 'delete', 'permissions'] },
    { key: 'recharge', label: ar ? 'شحن الرصيد' : 'Recharge', simple: true },
    { key: 'settings', label: ar ? 'الإعدادات' : 'Settings', simple: true },
    { key: 'api_keys', label: ar ? 'مفاتيح API' : 'API Keys', simple: true },
    { key: 'factory_reset', label: ar ? 'ضبط المصنع' : 'Factory Reset', simple: true },
    { key: 'woocommerce', label: 'WooCommerce', simple: true },
    { key: 'delivery', label: ar ? 'التوصيل' : 'Delivery', simple: true },
    { key: 'loyalty', label: ar ? 'برنامج الولاء' : 'Loyalty', simple: true },
    { key: 'notifications', label: ar ? 'الإشعارات' : 'Notifications', simple: true },
    { key: 'maintenance', label: ar ? 'الصيانة' : 'Maintenance', simple: true },
  ];
}

export function getRoleBadge(role, language) {
  const ar = language === 'ar';
  const labels = {
    super_admin: ar ? 'سوبر أدمين' : 'Super Admin',
    admin: ar ? 'مدير' : 'Admin',
    manager: ar ? 'مشرف' : 'Manager',
    seller: ar ? 'بائع' : 'Vendeur',
    sales_supervisor: ar ? 'مشرف مبيعات' : 'Sales Supervisor',
    inventory_manager: ar ? 'مدير مخزون' : 'Inventory Manager',
    ecommerce_manager: ar ? 'مسؤول متجر' : 'E-commerce',
    accountant: ar ? 'محاسب' : 'Comptable',
  };
  const colorClass = ROLE_COLORS[role] || 'bg-gray-100 text-gray-700 dark:bg-card dark:text-muted-foreground';
  return { label: labels[role] || (ar ? 'مستخدم' : 'User'), colorClass };
}
