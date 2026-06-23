import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { 
  Check, 
  X, 
  Star, 
  Zap, 
  Shield, 
  ArrowLeft,
  CheckCircle,
  Package,
  Users,
  BarChart3,
  Truck,
  CreditCard,
  Wrench,
  Store
} from 'lucide-react';

// Feature icons mapping
const FEATURE_ICONS = {
  sales: Package,
  inventory: Package,
  purchases: CreditCard,
  customers: Users,
  reports: BarChart3,
  delivery: Truck,
  repairs: Wrench,
  ecommerce: Store
};

export default function PricingPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [language, setLanguage] = useState('ar');

  useEffect(() => {
    fetchPlans();
    // Detect language from URL or localStorage
    const savedLang = localStorage.getItem('language') || 'ar';
    setLanguage(savedLang);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPlans = async () => {
    try {
      const response = await apiClient.get(`/saas/plans/public`);
      setPlans(response.data);
    } catch (error) {
      console.error('Error fetching plans:', error);
      // Fallback to demo plans
      setPlans([
        {
          id: 'basic',
          name_ar: 'المبتدئ',
          name_en: 'Basic',
          price_monthly: 2000,
          price_yearly: 20000,
          description_ar: 'مثالي للمحلات الصغيرة',
          description_en: 'Perfect for small shops',
          is_popular: false,
          features: { sales: { enabled: true }, inventory: { enabled: true }, customers: { enabled: false }, reports: { enabled: false } }
        },
        {
          id: 'professional',
          name_ar: 'المحترف',
          name_en: 'Professional',
          price_monthly: 5000,
          price_yearly: 50000,
          description_ar: 'للأعمال المتوسطة',
          description_en: 'For medium businesses',
          is_popular: true,
          features: { sales: { enabled: true }, inventory: { enabled: true }, customers: { enabled: true }, reports: { enabled: true }, delivery: { enabled: true } }
        },
        {
          id: 'enterprise',
          name_ar: 'المؤسسات',
          name_en: 'Enterprise',
          price_monthly: 10000,
          price_yearly: 100000,
          description_ar: 'حل كامل للشركات الكبيرة',
          description_en: 'Complete solution for large companies',
          is_popular: false,
          features: { sales: { enabled: true }, inventory: { enabled: true }, customers: { enabled: true }, reports: { enabled: true }, delivery: { enabled: true }, repairs: { enabled: true }, ecommerce: { enabled: true } }
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ar-DZ').format(price);
  };

  const getFeatureCount = (features) => {
    if (!features) return 0;
    return Object.values(features).filter(f => f?.enabled).length;
  };

  const t = {
    ar: {
      title: 'اختر خطتك المثالية',
      subtitle: 'ابدأ مجاناً واترقِ في أي وقت',
      monthly: 'شهري',
      yearly: 'سنوي',
      yearlyDiscount: 'وفر 20%',
      currency: 'دج',
      perMonth: '/ شهر',
      perYear: '/ سنة',
      getStarted: 'ابدأ الآن',
      contactUs: 'تواصل معنا',
      popular: 'الأكثر شعبية',
      features: 'الميزات',
      included: 'متضمن',
      notIncluded: 'غير متضمن',
      backToHome: 'العودة للرئيسية',
      login: 'تسجيل الدخول',
      featureCategories: {
        sales: 'المبيعات ونقطة البيع',
        inventory: 'إدارة المخزون',
        purchases: 'المشتريات والموردين',
        customers: 'الزبائن والديون',
        reports: 'التقارير والتحليلات',
        delivery: 'التوصيل والشحن',
        repairs: 'الإصلاحات',
        ecommerce: 'المتجر الإلكتروني'
      }
    },
    fr: {
      title: 'Choisissez votre plan idéal',
      subtitle: 'Commencez gratuitement et évoluez à tout moment',
      monthly: 'Mensuel',
      yearly: 'Annuel',
      yearlyDiscount: 'Économisez 20%',
      currency: 'DZD',
      perMonth: '/ mois',
      perYear: '/ an',
      getStarted: 'Commencer',
      contactUs: 'Contactez-nous',
      popular: 'Le plus populaire',
      features: 'Fonctionnalités',
      included: 'Inclus',
      notIncluded: 'Non inclus',
      backToHome: 'Retour à l\'accueil',
      login: 'Se connecter',
      featureCategories: {
        sales: 'Ventes et POS',
        inventory: 'Gestion des stocks',
        purchases: 'Achats et fournisseurs',
        customers: 'Clients et dettes',
        reports: 'Rapports et analyses',
        delivery: 'Livraison',
        repairs: 'Réparations',
        ecommerce: 'E-commerce'
      }
    }
  };

  const text = t[language] || t.ar;
  const isRTL = language === 'ar';

  return (
    <div className={`min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="border-b border-slate-700/50 backdrop-blur-sm sticky top-0 z-50 bg-slate-900/80">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-2 rounded-lg">
              <Package className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white">NT Commerce</span>
          </Link>
          
          <div className="flex items-center gap-4">
            {/* Language Switcher */}
            <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setLanguage('ar')}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  language === 'ar' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                عربي
              </button>
              <button
                onClick={() => setLanguage('fr')}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  language === 'fr' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                FR
              </button>
            </div>
            
            <Link to="/login">
              <Button variant="outline" className="border-slate-600 text-white hover:bg-slate-800">
                {text.login}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 text-center">
        <div className="container mx-auto px-4">
          <Badge className="mb-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white border-0">
            <Zap className="h-3 w-3 me-1" />
            {language === 'ar' ? 'أسعار تنافسية' : 'Prix compétitifs'}
          </Badge>
          
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {text.title}
          </h1>
          
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
            {text.subtitle}
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-12">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {text.monthly}
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                billingCycle === 'yearly'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {text.yearly}
              <Badge variant="secondary" className="bg-green-500/20 text-green-400 text-xs">
                {text.yearlyDiscount}
              </Badge>
            </button>
          </div>
        </div>
      </section>

      {/* Plans Grid */}
      <section className="pb-20">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="flex justify-center">
              <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {plans.map((plan, index) => {
                const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
                const featureCount = getFeatureCount(plan.features);
                
                return (
                  <Card 
                    key={plan.id}
                    className={`relative overflow-hidden transition-all duration-300 hover:scale-105 ${
                      plan.is_popular 
                        ? 'border-2 border-blue-500 bg-gradient-to-b from-slate-800 to-slate-900 shadow-2xl shadow-blue-500/20' 
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                    data-testid={`plan-card-${plan.id}`}
                  >
                    {/* Popular Badge */}
                    {plan.is_popular && (
                      <div className="absolute top-0 right-0 left-0">
                        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-center py-2 text-sm font-medium">
                          <Star className="h-4 w-4 inline me-1" />
                          {text.popular}
                        </div>
                      </div>
                    )}

                    <CardHeader className={`text-center ${plan.is_popular ? 'pt-12' : 'pt-6'}`}>
                      <CardTitle className="text-2xl font-bold text-white">
                        {language === 'ar' ? plan.name_ar : plan.name_en}
                      </CardTitle>
                      <CardDescription className="text-slate-400">
                        {language === 'ar' ? plan.description_ar : plan.description_en}
                      </CardDescription>
                      
                      <div className="mt-6">
                        <span className="text-5xl font-bold text-white">
                          {formatPrice(price)}
                        </span>
                        <span className="text-slate-400 text-lg ms-1">
                          {text.currency}
                        </span>
                        <p className="text-slate-500 text-sm mt-1">
                          {billingCycle === 'yearly' ? text.perYear : text.perMonth}
                        </p>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div className="h-px bg-slate-700" />
                      
                      <p className="text-sm font-medium text-slate-300 mb-3">
                        {text.features} ({featureCount})
                      </p>
                      
                      <ul className="space-y-3">
                        {Object.entries(text.featureCategories).map(([key, label]) => {
                          const Icon = FEATURE_ICONS[key] || Check;
                          const isEnabled = plan.features?.[key]?.enabled;
                          
                          return (
                            <li 
                              key={key}
                              className={`flex items-center gap-3 ${
                                isEnabled ? 'text-white' : 'text-slate-600'
                              }`}
                            >
                              <div className={`p-1 rounded-full ${
                                isEnabled ? 'bg-green-500/20' : 'bg-slate-800'
                              }`}>
                                {isEnabled ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <X className="h-4 w-4 text-slate-600" />
                                )}
                              </div>
                              <span className="text-sm">{label}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </CardContent>

                    <CardFooter className="pt-6">
                      <Link to="/register" className="w-full">
                        <Button 
                          className={`w-full py-6 text-lg font-semibold ${
                            plan.is_popular
                              ? 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 shadow-lg shadow-blue-500/30'
                              : 'bg-slate-700 hover:bg-slate-600'
                          }`}
                          data-testid={`select-plan-${plan.id}`}
                        >
                          {text.getStarted}
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-slate-800/30">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            {language === 'ar' ? 'لماذا تختار NT Commerce?' : 'Pourquoi choisir NT Commerce?'}
          </h2>
          <p className="text-slate-400 mb-12 max-w-2xl mx-auto">
            {language === 'ar' 
              ? 'حل متكامل لإدارة أعمالك التجارية بسهولة وفعالية'
              : 'Solution complète pour gérer votre entreprise facilement et efficacement'}
          </p>
          
          <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {[
              { 
                icon: Shield, 
                title: language === 'ar' ? 'أمان عالي' : 'Haute sécurité',
                desc: language === 'ar' ? 'بياناتك محمية' : 'Vos données protégées'
              },
              { 
                icon: Zap, 
                title: language === 'ar' ? 'سريع وسهل' : 'Rapide et facile',
                desc: language === 'ar' ? 'واجهة بسيطة' : 'Interface simple'
              },
              { 
                icon: Users, 
                title: language === 'ar' ? 'دعم متواصل' : 'Support continu',
                desc: language === 'ar' ? '24/7 مساعدة' : 'Aide 24/7'
              },
              { 
                icon: BarChart3, 
                title: language === 'ar' ? 'تقارير ذكية' : 'Rapports intelligents',
                desc: language === 'ar' ? 'تحليلات متقدمة' : 'Analyses avancées'
              }
            ].map((feature, i) => (
              <div key={`item-${i}`} className="p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-colors">
                <feature.icon className="h-10 w-10 text-blue-500 mx-auto mb-4" />
                <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-slate-800">
        <div className="container mx-auto px-4 text-center text-slate-500">
          <p>© 2024 NT Commerce - {language === 'ar' ? 'جميع الحقوق محفوظة' : 'Tous droits réservés'}</p>
        </div>
      </footer>
    </div>
  );
}
