import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Settings, ShoppingCart, Package, Users, FileText, Truck, CreditCard, 
  Bell, BarChart3, Smartphone, Globe, Shield, Save, RefreshCw, 
  Store, Wrench, MessageCircle, Mail, Wallet, Calculator, Boxes,
  Receipt, UserCog, ClipboardList, TrendingUp, Star, Lock, Unlock,
  Landmark, Coins, Sparkles, Bot, CheckSquare, Database, Key
} from 'lucide-react';

export default function FeaturesPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [features, setFeatures] = useState({});

  // All available features with descriptions
  const allFeatures = {
    sales: {
      id: 'sales',
      icon: ShoppingCart,
      name_ar: 'المبيعات',
      name_fr: 'Ventes',
      description_ar: 'نظام المبيعات ونقطة البيع',
      description_fr: 'Système de vente et POS',
      color: 'bg-green-500',
      subFeatures: [
        { id: 'pos', name_ar: 'نقطة البيع (POS)', name_fr: 'Point de Vente', default: true },
        { id: 'invoices', name_ar: 'الفواتير', name_fr: 'Factures', default: true },
        { id: 'quotes', name_ar: 'عروض الأسعار', name_fr: 'Devis', default: true },
        { id: 'returns', name_ar: 'المرتجعات', name_fr: 'Retours', default: true },
        { id: 'discounts', name_ar: 'الخصومات', name_fr: 'Remises', default: true },
        { id: 'price_types', name_ar: 'أنواع الأسعار (جملة/تجزئة)', name_fr: 'Types de prix', default: true },
      ]
    },
    inventory: {
      id: 'inventory',
      icon: Package,
      name_ar: 'المخزون',
      name_fr: 'Inventaire',
      description_ar: 'إدارة المنتجات والمخزون',
      description_fr: 'Gestion des produits et stock',
      color: 'bg-blue-500',
      subFeatures: [
        { id: 'products', name_ar: 'المنتجات', name_fr: 'Produits', default: true },
        { id: 'categories', name_ar: 'التصنيفات', name_fr: 'Catégories', default: true },
        { id: 'stock_alerts', name_ar: 'تنبيهات المخزون', name_fr: 'Alertes stock', default: true },
        { id: 'barcode', name_ar: 'الباركود', name_fr: 'Code-barres', default: true },
        { id: 'warehouses', name_ar: 'المستودعات المتعددة', name_fr: 'Multi-entrepôts', default: false },
        { id: 'stock_transfer', name_ar: 'نقل المخزون', name_fr: 'Transfert stock', default: false },
        { id: 'inventory_count', name_ar: 'الجرد', name_fr: 'Inventaire', default: true },
      ]
    },
    purchases: {
      id: 'purchases',
      icon: Boxes,
      name_ar: 'المشتريات',
      name_fr: 'Achats',
      description_ar: 'إدارة المشتريات والموردين',
      description_fr: 'Gestion des achats et fournisseurs',
      color: 'bg-orange-500',
      subFeatures: [
        { id: 'purchase_orders', name_ar: 'أوامر الشراء', name_fr: 'Commandes d\'achat', default: true },
        { id: 'suppliers', name_ar: 'الموردين', name_fr: 'Fournisseurs', default: true },
        { id: 'supplier_payments', name_ar: 'مدفوعات الموردين', name_fr: 'Paiements fournisseurs', default: true },
        { id: 'purchase_returns', name_ar: 'مرتجعات المشتريات', name_fr: 'Retours achats', default: false },
      ]
    },
    customers: {
      id: 'customers',
      icon: Users,
      name_ar: 'الزبائن',
      name_fr: 'Clients',
      description_ar: 'إدارة الزبائن والديون',
      description_fr: 'Gestion clients et créances',
      color: 'bg-purple-500',
      subFeatures: [
        { id: 'customer_list', name_ar: 'قائمة الزبائن', name_fr: 'Liste clients', default: true },
        { id: 'customer_debts', name_ar: 'ديون الزبائن', name_fr: 'Créances clients', default: true },
        { id: 'customer_families', name_ar: 'عائلات الزبائن', name_fr: 'Familles clients', default: true },
        { id: 'blacklist', name_ar: 'القائمة السوداء', name_fr: 'Liste noire', default: true },
        { id: 'debt_reminders', name_ar: 'تذكيرات الديون', name_fr: 'Rappels créances', default: true },
      ]
    },
    employees: {
      id: 'employees',
      icon: UserCog,
      name_ar: 'الموظفين',
      name_fr: 'Employés',
      description_ar: 'إدارة الموظفين والرواتب',
      description_fr: 'Gestion employés et salaires',
      color: 'bg-cyan-500',
      subFeatures: [
        { id: 'employee_list', name_ar: 'قائمة الموظفين', name_fr: 'Liste employés', default: true },
        { id: 'attendance', name_ar: 'الحضور والغياب', name_fr: 'Présence', default: true },
        { id: 'salaries', name_ar: 'الرواتب', name_fr: 'Salaires', default: true },
        { id: 'commissions', name_ar: 'العمولات', name_fr: 'Commissions', default: true },
        { id: 'advances', name_ar: 'السلف', name_fr: 'Avances', default: true },
        { id: 'employee_accounts', name_ar: 'حسابات الموظفين', name_fr: 'Comptes employés', default: true },
      ]
    },
    reports: {
      id: 'reports',
      icon: BarChart3,
      name_ar: 'التقارير',
      name_fr: 'Rapports',
      description_ar: 'التقارير والإحصائيات',
      description_fr: 'Rapports et statistiques',
      color: 'bg-indigo-500',
      subFeatures: [
        { id: 'sales_reports', name_ar: 'تقارير المبيعات', name_fr: 'Rapports ventes', default: true },
        { id: 'inventory_reports', name_ar: 'تقارير المخزون', name_fr: 'Rapports stock', default: true },
        { id: 'financial_reports', name_ar: 'التقارير المالية', name_fr: 'Rapports financiers', default: true },
        { id: 'customer_reports', name_ar: 'تقارير الزبائن', name_fr: 'Rapports clients', default: true },
        { id: 'smart_reports', name_ar: 'التقارير الذكية (AI)', name_fr: 'Rapports intelligents', default: false },
        { id: 'export_reports', name_ar: 'تصدير التقارير', name_fr: 'Export rapports', default: true },
      ]
    },
    expenses: {
      id: 'expenses',
      icon: Wallet,
      name_ar: 'المصاريف',
      name_fr: 'Dépenses',
      description_ar: 'إدارة المصاريف والتكاليف',
      description_fr: 'Gestion des dépenses',
      color: 'bg-red-500',
      subFeatures: [
        { id: 'expense_tracking', name_ar: 'تتبع المصاريف', name_fr: 'Suivi dépenses', default: true },
        { id: 'expense_categories', name_ar: 'تصنيفات المصاريف', name_fr: 'Catégories dépenses', default: true },
        { id: 'recurring_expenses', name_ar: 'المصاريف المتكررة', name_fr: 'Dépenses récurrentes', default: false },
      ]
    },
    repairs: {
      id: 'repairs',
      icon: Wrench,
      name_ar: 'الصيانة',
      name_fr: 'Réparations',
      description_ar: 'إدارة خدمات الصيانة والإصلاح',
      description_fr: 'Gestion des réparations',
      color: 'bg-amber-500',
      subFeatures: [
        { id: 'repair_tickets', name_ar: 'طلبات الصيانة', name_fr: 'Tickets réparation', default: true },
        { id: 'repair_status', name_ar: 'حالة الصيانة', name_fr: 'Statut réparation', default: true },
        { id: 'repair_invoice', name_ar: 'فواتير الصيانة', name_fr: 'Factures réparation', default: true },
      ]
    },
    delivery: {
      id: 'delivery',
      icon: Truck,
      name_ar: 'التوصيل',
      name_fr: 'Livraison',
      description_ar: 'إدارة التوصيل والشحن',
      description_fr: 'Gestion livraison et expédition',
      color: 'bg-teal-500',
      subFeatures: [
        { id: 'delivery_tracking', name_ar: 'تتبع التوصيل', name_fr: 'Suivi livraison', default: true },
        { id: 'shipping_companies', name_ar: 'شركات الشحن', name_fr: 'Transporteurs', default: true },
        { id: 'delivery_fees', name_ar: 'رسوم التوصيل', name_fr: 'Frais livraison', default: true },
        { id: 'yalidine_integration', name_ar: 'تكامل Yalidine', name_fr: 'Intégration Yalidine', default: false },
      ]
    },
    ecommerce: {
      id: 'ecommerce',
      icon: Globe,
      name_ar: 'التجارة الإلكترونية',
      name_fr: 'E-commerce',
      description_ar: 'التكامل مع المتاجر الإلكترونية',
      description_fr: 'Intégration e-commerce',
      color: 'bg-pink-500',
      subFeatures: [
        { id: 'woocommerce', name_ar: 'WooCommerce', name_fr: 'WooCommerce', default: false },
        { id: 'product_sync', name_ar: 'مزامنة المنتجات', name_fr: 'Sync produits', default: false },
        { id: 'order_sync', name_ar: 'مزامنة الطلبات', name_fr: 'Sync commandes', default: false },
      ]
    },
    loyalty: {
      id: 'loyalty',
      icon: Star,
      name_ar: 'الولاء والتسويق',
      name_fr: 'Fidélité et Marketing',
      description_ar: 'برنامج الولاء والتسويق',
      description_fr: 'Programme fidélité et marketing',
      color: 'bg-yellow-500',
      subFeatures: [
        { id: 'loyalty_points', name_ar: 'نقاط الولاء', name_fr: 'Points fidélité', default: false },
        { id: 'coupons', name_ar: 'القسائم', name_fr: 'Coupons', default: false },
        { id: 'promotions', name_ar: 'العروض الترويجية', name_fr: 'Promotions', default: true },
      ]
    },
    notifications: {
      id: 'notifications',
      icon: Bell,
      name_ar: 'الإشعارات',
      name_fr: 'Notifications',
      description_ar: 'نظام الإشعارات والتنبيهات',
      description_fr: 'Système de notifications',
      color: 'bg-rose-500',
      subFeatures: [
        { id: 'push_notifications', name_ar: 'إشعارات فورية', name_fr: 'Notifications push', default: true },
        { id: 'email_notifications', name_ar: 'إشعارات البريد', name_fr: 'Notifications email', default: false },
        { id: 'sms_notifications', name_ar: 'إشعارات SMS', name_fr: 'Notifications SMS', default: false },
        { id: 'whatsapp_notifications', name_ar: 'إشعارات WhatsApp', name_fr: 'Notifications WhatsApp', default: false },
      ]
    },
    services: {
      id: 'services',
      icon: Smartphone,
      name_ar: 'الخدمات',
      name_fr: 'Services',
      description_ar: 'خدمات إضافية',
      description_fr: 'Services supplémentaires',
      color: 'bg-slate-500',
      subFeatures: [
        { id: 'flexy_recharge', name_ar: 'شحن فليكسي', name_fr: 'Recharge Flexy', default: false },
        { id: 'bill_payment', name_ar: 'دفع الفواتير', name_fr: 'Paiement factures', default: false },
      ]
    },
    finance: {
      id: 'finance',
      icon: Landmark,
      name_ar: 'المالية والصندوق',
      name_fr: 'Finance & Caisse',
      description_ar: 'الصندوق والبنوك والعملات والمدفوعات',
      description_fr: 'Caisse, banques, devises et paiements',
      color: 'bg-emerald-500',
      subFeatures: [
        { id: 'cash_management', name_ar: 'إدارة الصندوق', name_fr: 'Gestion caisse', default: true },
        { id: 'banking', name_ar: 'البنوك', name_fr: 'Banques', default: true },
        { id: 'currencies', name_ar: 'العملات', name_fr: 'Devises', default: true },
        { id: 'payments', name_ar: 'المدفوعات', name_fr: 'Paiements', default: true },
        { id: 'debts', name_ar: 'الديون', name_fr: 'Dettes', default: true },
      ]
    },
    accounting: {
      id: 'accounting',
      icon: Calculator,
      name_ar: 'المحاسبة والضرائب',
      name_fr: 'Comptabilité & Taxes',
      description_ar: 'القيود المحاسبية والضرائب والفواتير',
      description_fr: 'Écritures, taxes et factures',
      color: 'bg-sky-500',
      subFeatures: [
        { id: 'accounting_journal', name_ar: 'القيود المحاسبية', name_fr: 'Écritures comptables', default: true },
        { id: 'tax_management', name_ar: 'إدارة الضرائب', name_fr: 'Gestion des taxes', default: true },
        { id: 'invoices', name_ar: 'الفواتير المحاسبية', name_fr: 'Factures comptables', default: true },
      ]
    },
    wallet: {
      id: 'wallet',
      icon: Wallet,
      name_ar: 'المحفظة',
      name_fr: 'Portefeuille',
      description_ar: 'رصيد المحفظة والمعاملات والتحويلات',
      description_fr: 'Solde, transactions et transferts',
      color: 'bg-green-600',
      subFeatures: [
        { id: 'wallet_balance', name_ar: 'رصيد المحفظة', name_fr: 'Solde portefeuille', default: true },
        { id: 'wallet_transactions', name_ar: 'معاملات المحفظة', name_fr: 'Transactions', default: true },
        { id: 'wallet_transfer', name_ar: 'التحويلات', name_fr: 'Transferts', default: true },
      ]
    },
    ai: {
      id: 'ai',
      icon: Sparkles,
      name_ar: 'الذكاء الاصطناعي',
      name_fr: 'Intelligence Artificielle',
      description_ar: 'المحاسب الذكي والوكلاء والروبوتات',
      description_fr: 'Comptable IA, agents et robots',
      color: 'bg-violet-500',
      subFeatures: [
        { id: 'ai_accountant', name_ar: 'المحاسب الذكي', name_fr: 'Comptable IA', default: true },
        { id: 'ai_agents', name_ar: 'الوكلاء الأذكياء', name_fr: 'Agents IA', default: true },
        { id: 'robots', name_ar: 'الروبوتات', name_fr: 'Robots', default: false },
        { id: 'smart_dashboard', name_ar: 'لوحة التحكم الذكية', name_fr: 'Dashboard intelligent', default: true },
      ]
    },
    tasks: {
      id: 'tasks',
      icon: CheckSquare,
      name_ar: 'المهام والدردشة',
      name_fr: 'Tâches & Chat',
      description_ar: 'إدارة المهام والدردشة الداخلية',
      description_fr: 'Gestion des tâches et chat interne',
      color: 'bg-fuchsia-500',
      subFeatures: [
        { id: 'task_management', name_ar: 'إدارة المهام', name_fr: 'Gestion tâches', default: true },
        { id: 'internal_chat', name_ar: 'الدردشة الداخلية', name_fr: 'Chat interne', default: true },
      ]
    },
    online_store: {
      id: 'online_store',
      icon: Store,
      name_ar: 'المتجر الإلكتروني',
      name_fr: 'Boutique en ligne',
      description_ar: 'واجهة المتجر والطلبات الأونلاين',
      description_fr: 'Vitrine et commandes en ligne',
      color: 'bg-pink-600',
      subFeatures: [
        { id: 'storefront', name_ar: 'واجهة المتجر', name_fr: 'Vitrine', default: false },
        { id: 'online_orders', name_ar: 'الطلبات الأونلاين', name_fr: 'Commandes en ligne', default: false },
      ]
    },
    security: {
      id: 'security',
      icon: Shield,
      name_ar: 'الأمان',
      name_fr: 'Sécurité',
      description_ar: 'المصادقة الثنائية ومفاتيح API وسجلات الأمان',
      description_fr: '2FA, clés API et journaux de sécurité',
      color: 'bg-gray-600',
      subFeatures: [
        { id: 'two_factor', name_ar: 'المصادقة الثنائية (2FA)', name_fr: 'Authentification 2FA', default: false },
        { id: 'api_keys', name_ar: 'مفاتيح API', name_fr: 'Clés API', default: false },
        { id: 'security_logs', name_ar: 'سجلات الأمان', name_fr: 'Journaux sécurité', default: true },
      ]
    },
    data_management: {
      id: 'data_management',
      icon: Database,
      name_ar: 'البيانات والنسخ الاحتياطي',
      name_fr: 'Données & Sauvegardes',
      description_ar: 'استيراد وتصدير البيانات والنسخ الاحتياطي',
      description_fr: 'Import/export et sauvegardes',
      color: 'bg-stone-500',
      subFeatures: [
        { id: 'import_export', name_ar: 'استيراد/تصدير البيانات', name_fr: 'Import/Export', default: true },
        { id: 'backup', name_ar: 'النسخ الاحتياطي', name_fr: 'Sauvegardes', default: true },
        { id: 'database_tools', name_ar: 'أدوات قاعدة البيانات', name_fr: 'Outils base de données', default: false },
      ]
    },
    settings_branding: {
      id: 'settings_branding',
      icon: Settings,
      name_ar: 'الإعدادات والطباعة',
      name_fr: 'Paramètres & Impression',
      description_ar: 'الطباعة والهوية البصرية والتاريخ واللغة',
      description_fr: 'Impression, identité et localisation',
      color: 'bg-zinc-500',
      subFeatures: [
        { id: 'printing', name_ar: 'الطباعة', name_fr: 'Impression', default: true },
        { id: 'branding', name_ar: 'الهوية البصرية', name_fr: 'Identité visuelle', default: true },
        { id: 'datetime_locale', name_ar: 'التاريخ واللغة', name_fr: 'Date et langue', default: true },
      ]
    }
  };

  useEffect(() => {
    fetchFeatures();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchFeatures = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/settings/features`);
      setFeatures(response.data || getDefaultFeatures());
    } catch (error) {
      console.error('Error fetching features:', error);
      setFeatures(getDefaultFeatures());
    } finally {
      setLoading(false);
    }
  };

  const getDefaultFeatures = () => {
    const defaults = {};
    Object.keys(allFeatures).forEach(featureId => {
      defaults[featureId] = {
        enabled: true,
        subFeatures: {}
      };
      allFeatures[featureId].subFeatures.forEach(sub => {
        defaults[featureId].subFeatures[sub.id] = sub.default;
      });
    });
    return defaults;
  };

  const toggleFeature = (featureId) => {
    setFeatures(prev => ({
      ...prev,
      [featureId]: {
        ...prev[featureId],
        enabled: !prev[featureId]?.enabled
      }
    }));
  };

  const toggleSubFeature = (featureId, subFeatureId) => {
    setFeatures(prev => ({
      ...prev,
      [featureId]: {
        ...prev[featureId],
        subFeatures: {
          ...prev[featureId]?.subFeatures,
          [subFeatureId]: !prev[featureId]?.subFeatures?.[subFeatureId]
        }
      }
    }));
  };

  const saveFeatures = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/settings/features`, features);
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات بنجاح' : 'Paramètres enregistrés');
    } catch (error) {
      toast.error(error.response?.data?.detail || t.error);
    } finally {
      setSaving(false);
    }
  };

  const enableAll = () => {
    const newFeatures = {};
    Object.keys(allFeatures).forEach(featureId => {
      newFeatures[featureId] = {
        enabled: true,
        subFeatures: {}
      };
      allFeatures[featureId].subFeatures.forEach(sub => {
        newFeatures[featureId].subFeatures[sub.id] = true;
      });
    });
    setFeatures(newFeatures);
  };

  const disableAll = () => {
    const newFeatures = {};
    Object.keys(allFeatures).forEach(featureId => {
      newFeatures[featureId] = {
        enabled: false,
        subFeatures: {}
      };
      allFeatures[featureId].subFeatures.forEach(sub => {
        newFeatures[featureId].subFeatures[sub.id] = false;
      });
    });
    setFeatures(newFeatures);
  };

  const resetToDefault = () => {
    setFeatures(getDefaultFeatures());
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="features-page">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Settings className="h-8 w-8 text-primary" />
              {language === 'ar' ? 'مميزات البرنامج' : 'Fonctionnalités'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' 
                ? 'تحكم في الميزات المتاحة للمستخدمين - يتم تطبيق التغييرات على جميع الحسابات الفرعية'
                : 'Contrôlez les fonctionnalités disponibles pour les utilisateurs'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={enableAll} className="gap-2">
              <Unlock className="h-4 w-4" />
              {language === 'ar' ? 'تفعيل الكل' : 'Activer tout'}
            </Button>
            <Button variant="outline" onClick={disableAll} className="gap-2">
              <Lock className="h-4 w-4" />
              {language === 'ar' ? 'تعطيل الكل' : 'Désactiver tout'}
            </Button>
            <Button variant="outline" onClick={resetToDefault} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {language === 'ar' ? 'إعادة ضبط' : 'Réinitialiser'}
            </Button>
            <Button onClick={saveFeatures} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {language === 'ar' ? 'حفظ التغييرات' : 'Enregistrer'}
            </Button>
          </div>
        </div>

        {/* Super Admin Notice */}
        {user?.role === 'super_admin' && (
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-purple-600" />
                <div>
                  <p className="font-medium text-purple-800">
                    {language === 'ar' ? 'أنت سوبر أدمين' : 'Vous êtes Super Admin'}
                  </p>
                  <p className="text-sm text-purple-600">
                    {language === 'ar' 
                      ? 'التغييرات التي تجريها ستُطبق على جميع المستخدمين والحسابات الفرعية'
                      : 'Les modifications s\'appliqueront à tous les utilisateurs et sous-comptes'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.values(allFeatures).map(feature => {
            const FeatureIcon = feature.icon;
            const isEnabled = features[feature.id]?.enabled !== false;
            const enabledSubFeatures = Object.values(features[feature.id]?.subFeatures || {}).filter(Boolean).length;
            const totalSubFeatures = feature.subFeatures.length;

            return (
              <Card 
                key={feature.id} 
                className={`transition-all ${isEnabled ? 'border-primary/50 shadow-md' : 'opacity-60'}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${feature.color} text-white`}>
                        <FeatureIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          {language === 'ar' ? feature.name_ar : feature.name_fr}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {language === 'ar' ? feature.description_ar : feature.description_fr}
                        </CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => toggleFeature(feature.id)}
                    />
                  </div>
                  {isEnabled && (
                    <Badge variant="outline" className="w-fit mt-2">
                      {enabledSubFeatures}/{totalSubFeatures} {language === 'ar' ? 'مفعّل' : 'actif'}
                    </Badge>
                  )}
                </CardHeader>
                {isEnabled && (
                  <CardContent className="pt-0">
                    <div className="space-y-2 border-t pt-3">
                      {feature.subFeatures.map(sub => (
                        <div key={sub.id} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {language === 'ar' ? sub.name_ar : sub.name_fr}
                          </span>
                          <Switch
                            checked={features[feature.id]?.subFeatures?.[sub.id] !== false}
                            onCheckedChange={() => toggleSubFeature(feature.id, sub.id)}
                            className="scale-75"
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {language === 'ar' ? 'ملخص الميزات' : 'Résumé des fonctionnalités'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-3xl font-bold text-green-600">
                  {Object.values(features).filter(f => f.enabled !== false).length}
                </p>
                <p className="text-sm text-green-700">{language === 'ar' ? 'ميزة مفعّلة' : 'Fonctionnalités actives'}</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-3xl font-bold text-red-600">
                  {Object.values(features).filter(f => f.enabled === false).length}
                </p>
                <p className="text-sm text-red-700">{language === 'ar' ? 'ميزة معطّلة' : 'Fonctionnalités inactives'}</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-3xl font-bold text-blue-600">
                  {Object.values(allFeatures).reduce((acc, f) => acc + f.subFeatures.length, 0)}
                </p>
                <p className="text-sm text-blue-700">{language === 'ar' ? 'إجمالي الميزات الفرعية' : 'Total sous-fonctionnalités'}</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-3xl font-bold text-purple-600">
                  {Object.values(features).reduce((acc, f) => 
                    acc + Object.values(f.subFeatures || {}).filter(Boolean).length, 0
                  )}
                </p>
                <p className="text-sm text-purple-700">{language === 'ar' ? 'ميزة فرعية مفعّلة' : 'Sous-fonctionnalités actives'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
