import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { toast } from 'sonner';
import { 
  Settings, 
  Check, 
  X, 
  Save, 
  RefreshCw,
  Package,
  ShoppingCart,
  Users,
  Truck,
  BarChart3,
  CreditCard,
  Wrench,
  Bell,
  Store,
  Shield,
  Layers,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

// Feature categories with icons and labels
const FEATURE_CATEGORIES = {
  sales: { 
    icon: ShoppingCart, 
    label_ar: 'المبيعات', 
    label_en: 'Sales',
    subFeatures: {
      pos: { label_ar: 'نقطة البيع', label_en: 'Point of Sale' },
      invoices: { label_ar: 'الفواتير', label_en: 'Invoices' },
      quotes: { label_ar: 'عروض الأسعار', label_en: 'Quotes' },
      returns: { label_ar: 'المرتجعات', label_en: 'Returns' },
      discounts: { label_ar: 'الخصومات', label_en: 'Discounts' },
      price_types: { label_ar: 'أنواع الأسعار', label_en: 'Price Types' }
    }
  },
  inventory: { 
    icon: Package, 
    label_ar: 'المخزون', 
    label_en: 'Inventory',
    subFeatures: {
      products: { label_ar: 'المنتجات', label_en: 'Products' },
      categories: { label_ar: 'التصنيفات', label_en: 'Categories' },
      stock_alerts: { label_ar: 'تنبيهات المخزون', label_en: 'Stock Alerts' },
      barcode: { label_ar: 'الباركود', label_en: 'Barcode' },
      warehouses: { label_ar: 'المستودعات المتعددة', label_en: 'Multi Warehouse' },
      stock_transfer: { label_ar: 'تحويل المخزون', label_en: 'Stock Transfer' },
      inventory_count: { label_ar: 'جرد المخزون', label_en: 'Inventory Count' }
    }
  },
  purchases: { 
    icon: CreditCard, 
    label_ar: 'المشتريات', 
    label_en: 'Purchases',
    subFeatures: {
      purchase_orders: { label_ar: 'طلبات الشراء', label_en: 'Purchase Orders' },
      suppliers: { label_ar: 'الموردين', label_en: 'Suppliers' },
      supplier_payments: { label_ar: 'مدفوعات الموردين', label_en: 'Supplier Payments' },
      purchase_returns: { label_ar: 'مرتجعات المشتريات', label_en: 'Purchase Returns' }
    }
  },
  customers: { 
    icon: Users, 
    label_ar: 'الزبائن', 
    label_en: 'Customers',
    subFeatures: {
      customer_list: { label_ar: 'قائمة الزبائن', label_en: 'Customer List' },
      customer_debts: { label_ar: 'ديون الزبائن', label_en: 'Customer Debts' },
      customer_families: { label_ar: 'عائلات الزبائن', label_en: 'Customer Families' },
      blacklist: { label_ar: 'القائمة السوداء', label_en: 'Blacklist' },
      debt_reminders: { label_ar: 'تذكيرات الديون', label_en: 'Debt Reminders' }
    }
  },
  reports: { 
    icon: BarChart3, 
    label_ar: 'التقارير', 
    label_en: 'Reports',
    subFeatures: {
      sales_reports: { label_ar: 'تقارير المبيعات', label_en: 'Sales Reports' },
      inventory_reports: { label_ar: 'تقارير المخزون', label_en: 'Inventory Reports' },
      financial_reports: { label_ar: 'التقارير المالية', label_en: 'Financial Reports' },
      smart_reports: { label_ar: 'التقارير الذكية (AI)', label_en: 'Smart Reports (AI)' },
      export_reports: { label_ar: 'تصدير التقارير', label_en: 'Export Reports' }
    }
  },
  delivery: { 
    icon: Truck, 
    label_ar: 'التوصيل', 
    label_en: 'Delivery',
    subFeatures: {
      delivery_tracking: { label_ar: 'تتبع التوصيل', label_en: 'Delivery Tracking' },
      shipping_companies: { label_ar: 'شركات الشحن', label_en: 'Shipping Companies' },
      delivery_fees: { label_ar: 'رسوم التوصيل', label_en: 'Delivery Fees' },
      yalidine_integration: { label_ar: 'تكامل يالدين', label_en: 'Yalidine Integration' }
    }
  },
  repairs: { 
    icon: Wrench, 
    label_ar: 'الإصلاحات', 
    label_en: 'Repairs',
    subFeatures: {
      repair_tickets: { label_ar: 'تذاكر الإصلاح', label_en: 'Repair Tickets' },
      repair_status: { label_ar: 'حالة الإصلاح', label_en: 'Repair Status' },
      repair_invoice: { label_ar: 'فاتورة الإصلاح', label_en: 'Repair Invoice' }
    }
  },
  ecommerce: { 
    icon: Store, 
    label_ar: 'المتجر الإلكتروني', 
    label_en: 'E-Commerce',
    subFeatures: {
      online_store: { label_ar: 'المتجر الإلكتروني', label_en: 'Online Store' },
      woocommerce: { label_ar: 'ووكومرس', label_en: 'WooCommerce' },
      product_sync: { label_ar: 'مزامنة المنتجات', label_en: 'Product Sync' },
      order_sync: { label_ar: 'مزامنة الطلبات', label_en: 'Order Sync' }
    }
  },
  notifications: { 
    icon: Bell, 
    label_ar: 'الإشعارات', 
    label_en: 'Notifications',
    subFeatures: {
      push_notifications: { label_ar: 'إشعارات التطبيق', label_en: 'Push Notifications' },
      email_notifications: { label_ar: 'إشعارات البريد', label_en: 'Email Notifications' },
      sms_notifications: { label_ar: 'إشعارات SMS', label_en: 'SMS Notifications' }
    }
  }
};

export default function FeatureFlagsPage() {
  const { language } = useLanguage();
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [planFeatures, setPlanFeatures] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});

  useEffect(() => {
    fetchPlans();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedPlanId) {
      const plan = plans.find(p => p.id === selectedPlanId);
      if (plan) {
        // Initialize features from plan, using defaults if not set
        const features = {};
        Object.keys(FEATURE_CATEGORIES).forEach(category => {
          features[category] = {
            enabled: plan.features?.[category]?.enabled ?? true,
            subFeatures: {}
          };
          Object.keys(FEATURE_CATEGORIES[category].subFeatures).forEach(sub => {
            features[category].subFeatures[sub] = plan.features?.[category]?.subFeatures?.[sub] ?? true;
          });
        });
        setPlanFeatures(features);
      }
    }
  }, [selectedPlanId, plans]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/saas/plans?include_inactive=true`);
      setPlans(response.data);
      if (response.data.length > 0) {
        setSelectedPlanId(response.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
      toast.error(language === 'ar' ? 'خطأ في تحميل الخطط' : 'Error loading plans');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const toggleCategoryEnabled = (category) => {
    setPlanFeatures(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        enabled: !prev[category]?.enabled
      }
    }));
  };

  const toggleSubFeature = (category, subFeature) => {
    setPlanFeatures(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        subFeatures: {
          ...prev[category]?.subFeatures,
          [subFeature]: !prev[category]?.subFeatures?.[subFeature]
        }
      }
    }));
  };

  const saveFeatures = async () => {
    if (!selectedPlanId) return;
    
    setSaving(true);
    try {
      await apiClient.put(`/saas/plans/${selectedPlanId}`, {
        features: planFeatures
      });
      
      toast.success(language === 'ar' ? 'تم حفظ الميزات بنجاح' : 'Features saved successfully');
      fetchPlans(); // Refresh
    } catch (error) {
      console.error('Error saving features:', error);
      toast.error(language === 'ar' ? 'خطأ في حفظ الميزات' : 'Error saving features');
    } finally {
      setSaving(false);
    }
  };

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  return (
    <Layout>
      <div className="space-y-6" data-testid="feature-flags-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              {language === 'ar' ? 'إدارة ميزات الخطط' : 'Plan Features Management'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {language === 'ar' 
                ? 'تحكم في الميزات المتاحة لكل خطة اشتراك'
                : 'Control available features for each subscription plan'}
            </p>
          </div>
        </div>

        {/* Plan Selector */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-xs">
                <Label>{language === 'ar' ? 'اختر الخطة' : 'Select Plan'}</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger className="mt-1" data-testid="plan-selector">
                    <SelectValue placeholder={language === 'ar' ? 'اختر خطة...' : 'Select plan...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map(plan => (
                      <SelectItem key={plan.id} value={plan.id}>
                        <div className="flex items-center gap-2">
                          <span>{plan.name_ar || plan.name}</span>
                          {plan.is_popular && (
                            <Badge variant="secondary" className="text-xs">
                              {language === 'ar' ? 'شائع' : 'Popular'}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPlan && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    {language === 'ar' ? 'السعر الشهري:' : 'Monthly:'}
                    <span className="font-semibold text-foreground ms-1">
                      {selectedPlan.price_monthly} {language === 'ar' ? 'دج' : 'DZD'}
                    </span>
                  </span>
                  <Badge variant={selectedPlan.is_active ? 'default' : 'secondary'}>
                    {selectedPlan.is_active 
                      ? (language === 'ar' ? 'نشط' : 'Active')
                      : (language === 'ar' ? 'غير نشط' : 'Inactive')}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Features Grid */}
        {selectedPlanId && (
          <div className="grid gap-4">
            {Object.entries(FEATURE_CATEGORIES).map(([categoryKey, category]) => {
              const Icon = category.icon;
              const isExpanded = expandedCategories[categoryKey];
              const isEnabled = planFeatures[categoryKey]?.enabled ?? true;
              const enabledSubFeatures = Object.values(planFeatures[categoryKey]?.subFeatures || {}).filter(Boolean).length;
              const totalSubFeatures = Object.keys(category.subFeatures).length;

              return (
                <Card key={categoryKey} className={!isEnabled ? 'opacity-60' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex items-center gap-3 cursor-pointer flex-1"
                        onClick={() => toggleCategory(categoryKey)}
                      >
                        <div className={`p-2 rounded-lg ${isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-lg">
                            {language === 'ar' ? category.label_ar : category.label_en}
                          </CardTitle>
                          <CardDescription>
                            {enabledSubFeatures}/{totalSubFeatures} {language === 'ar' ? 'ميزات فرعية مفعلة' : 'sub-features enabled'}
                          </CardDescription>
                        </div>
                        <button className="p-1 hover:bg-muted rounded">
                          {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 ms-4">
                        <Label className="text-sm text-muted-foreground">
                          {isEnabled 
                            ? (language === 'ar' ? 'مفعل' : 'Enabled')
                            : (language === 'ar' ? 'معطل' : 'Disabled')}
                        </Label>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => toggleCategoryEnabled(categoryKey)}
                          data-testid={`toggle-${categoryKey}`}
                        />
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && isEnabled && (
                    <CardContent className="pt-2 border-t">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
                        {Object.entries(category.subFeatures).map(([subKey, subFeature]) => {
                          const subEnabled = planFeatures[categoryKey]?.subFeatures?.[subKey] ?? true;
                          return (
                            <div 
                              key={subKey}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                subEnabled ? 'bg-green-50 border-green-200' : 'bg-muted/50 border-muted'
                              }`}
                            >
                              <span className={`text-sm ${subEnabled ? 'text-green-800' : 'text-muted-foreground'}`}>
                                {language === 'ar' ? subFeature.label_ar : subFeature.label_en}
                              </span>
                              <button
                                onClick={() => toggleSubFeature(categoryKey, subKey)}
                                className={`p-1 rounded-full ${
                                  subEnabled 
                                    ? 'bg-green-500 text-white' 
                                    : 'bg-muted text-muted-foreground'
                                }`}
                                data-testid={`toggle-${categoryKey}-${subKey}`}
                              >
                                {subEnabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end sticky bottom-4">
          <Button 
            onClick={saveFeatures} 
            disabled={saving || !selectedPlanId}
            size="lg"
            className="gap-2 shadow-lg"
            data-testid="save-features-btn"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {language === 'ar' ? 'حفظ الميزات' : 'Save Features'}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
