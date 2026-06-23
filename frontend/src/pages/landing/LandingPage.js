import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { 
  Check, Star, Zap, Shield, BarChart3, Users, Package, 
  ShoppingCart, Globe, Clock, Headphones, ChevronRight,
  Smartphone, Cloud, Lock, TrendingUp, Award, Sparkles,
  Menu, X
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPlans = async () => {
    try {
      const response = await apiClient.get(`/saas/plans`);
      setPlans(response.data);
    } catch (error) {
      console.error('Error fetching plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPrice = (plan) => {
    switch (billingCycle) {
      case '6months': return plan.price_6months;
      case 'yearly': return plan.price_yearly;
      default: return plan.price_monthly;
    }
  };

  const getSavings = (plan) => {
    const monthly = plan.price_monthly;
    if (billingCycle === '6months') {
      const sixMonthPrice = plan.price_6months;
      const wouldBe = monthly * 6;
      return Math.round(((wouldBe - sixMonthPrice) / wouldBe) * 100);
    }
    if (billingCycle === 'yearly') {
      const yearlyPrice = plan.price_yearly;
      const wouldBe = monthly * 12;
      return Math.round(((wouldBe - yearlyPrice) / wouldBe) * 100);
    }
    return 0;
  };

  const features = [
    { icon: ShoppingCart, title: 'نقطة بيع متقدمة', desc: 'واجهة سهلة وسريعة للمبيعات اليومية' },
    { icon: Package, title: 'إدارة المخزون', desc: 'تتبع المنتجات والمخازن بدقة' },
    { icon: Users, title: 'إدارة العملاء', desc: 'قاعدة بيانات شاملة للعملاء والموردين' },
    { icon: BarChart3, title: 'تقارير ذكية', desc: 'تحليلات متقدمة مع نصائح AI' },
    { icon: Shield, title: 'صلاحيات متقدمة', desc: 'تحكم كامل في صلاحيات الموظفين' },
    { icon: Cloud, title: 'سحابي 100%', desc: 'وصول من أي مكان في أي وقت' },
  ];

  const testimonials = [
    { name: 'أحمد محمد', role: 'صاحب محل إلكترونيات', text: 'برنامج ممتاز غير طريقة إدارة محلي بالكامل!' },
    { name: 'فاطمة علي', role: 'مديرة سوبر ماركت', text: 'التقارير الذكية ساعدتني في زيادة المبيعات 30%' },
    { name: 'يوسف أمين', role: 'تاجر جملة', text: 'أفضل استثمار قمت به لتطوير عملي' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-lg">NT</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                NT Commerce
              </span>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-gray-600 hover:text-blue-600 transition">المميزات</a>
              <a href="#pricing" className="text-gray-600 hover:text-blue-600 transition">الأسعار</a>
              <a href="#testimonials" className="text-gray-600 hover:text-blue-600 transition">آراء العملاء</a>
              <Link to="/tenant-login">
                <Button variant="outline">تسجيل الدخول</Button>
              </Link>
              <Link to="/register">
                <Button className="bg-gradient-to-r from-blue-600 to-indigo-600">
                  ابدأ مجاناً
                  <ChevronRight className="h-4 w-4 mr-1" />
                </Button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t p-4 space-y-3">
            <a href="#features" className="block py-2 text-gray-600">المميزات</a>
            <a href="#pricing" className="block py-2 text-gray-600">الأسعار</a>
            <a href="#testimonials" className="block py-2 text-gray-600">آراء العملاء</a>
            <Link to="/tenant-login" className="block">
              <Button variant="outline" className="w-full">تسجيل الدخول</Button>
            </Link>
            <Link to="/register" className="block">
              <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600">ابدأ مجاناً</Button>
            </Link>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50" />
        <div className="absolute inset-0 opacity-30" style={{backgroundImage: 'radial-gradient(circle, rgba(99,102,241,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px'}} />
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Badge className="mb-6 bg-blue-100 text-blue-700 hover:bg-blue-100">
            <Sparkles className="h-3 w-3 ml-1" />
            جرب مجاناً لمدة 14 يوم
          </Badge>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            أدر نشاطك التجاري
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              بذكاء واحترافية
            </span>
          </h1>
          
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto mb-10">
            نظام متكامل لإدارة المبيعات والمخزون والعملاء. سحابي 100% يعمل من أي جهاز. 
            مع تقارير ذكية ونصائح AI لتطوير عملك.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register">
              <Button size="lg" className="bg-gradient-to-r from-blue-600 to-indigo-600 text-lg px-8 py-6 shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all">
                ابدأ تجربتك المجانية
                <ChevronRight className="h-5 w-5 mr-2" />
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                اكتشف المميزات
              </Button>
            </a>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {[
              { value: '+500', label: 'عميل نشط' },
              { value: '+1M', label: 'عملية بيع' },
              { value: '99.9%', label: 'وقت التشغيل' },
              { value: '24/7', label: 'دعم فني' },
            ].map((stat, i) => (
              <div key={`item-${i}`} className="text-center">
                <p className="text-3xl sm:text-4xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-indigo-100 text-indigo-700">المميزات</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              كل ما تحتاجه لإدارة عملك
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              مجموعة شاملة من الأدوات المتقدمة لتسهيل إدارة نشاطك التجاري
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <Card key={`item-${i}`} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-600">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-green-100 text-green-700">الأسعار</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              خطط تناسب جميع الأعمال
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              اختر الخطة المناسبة لحجم عملك. جميع الخطط تشمل فترة تجريبية مجانية.
            </p>

            {/* Billing Toggle */}
            <div className="inline-flex items-center gap-2 bg-gray-100 p-1 rounded-full mb-8">
              {['monthly', '6months', 'yearly'].map((cycle) => (
                <button
                  key={cycle}
                  onClick={() => setBillingCycle(cycle)}
                  className={`px-4 py-2 rounded-full transition-all ${
                    billingCycle === cycle 
                      ? 'bg-white shadow text-blue-600 font-medium' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {cycle === 'monthly' ? 'شهري' : cycle === '6months' ? '6 أشهر' : 'سنوي'}
                  {cycle !== 'monthly' && (
                    <Badge variant="secondary" className="mr-1 text-xs bg-green-100 text-green-700">
                      وفر {cycle === '6months' ? '15%' : '25%'}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-500">لم يتم إعداد الخطط بعد</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {plans.map((plan) => (
                <Card 
                  key={plan.id} 
                  className={`relative overflow-hidden ${
                    plan.is_popular 
                      ? 'border-2 border-blue-500 shadow-xl shadow-blue-500/20' 
                      : 'border shadow-lg'
                  }`}
                >
                  {plan.is_popular && (
                    <div className="absolute top-4 left-4">
                      <Badge className="bg-blue-500 text-white">
                        <Star className="h-3 w-3 ml-1" />
                        الأكثر شعبية
                      </Badge>
                    </div>
                  )}
                  
                  <CardHeader className="text-center pt-8 pb-4">
                    <CardTitle className="text-2xl">{plan.name_ar}</CardTitle>
                    <CardDescription className="text-base">{plan.description_ar}</CardDescription>
                  </CardHeader>
                  
                  <CardContent className="text-center pb-6">
                    <div className="mb-6">
                      <span className="text-4xl font-bold text-gray-900">
                        {getPrice(plan).toLocaleString()}
                      </span>
                      <span className="text-gray-500 mr-1">
                        دج / {billingCycle === 'monthly' ? 'شهر' : billingCycle === '6months' ? '6 أشهر' : 'سنة'}
                      </span>
                      {getSavings(plan) > 0 && (
                        <Badge variant="secondary" className="block mt-2 bg-green-100 text-green-700">
                          وفر {getSavings(plan)}%
                        </Badge>
                      )}
                    </div>

                    <ul className="space-y-3 text-right mb-6">
                      {Object.entries(plan.features || {}).filter(([_, v]) => v).slice(0, 6).map(([key, _], i) => (
                        <li key={`item-${i}`} className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                          <span className="text-gray-700">
                            {key === 'pos' ? 'نقطة البيع' :
                             key === 'reports' ? 'التقارير' :
                             key === 'ai_tips' ? 'نصائح AI' :
                             key === 'multi_warehouse' ? 'تعدد المخازن' :
                             key === 'smart_reports' ? 'تقارير ذكية' :
                             key === 'employee_alerts' ? 'تنبيهات الموظفين' :
                             key}
                          </span>
                        </li>
                      ))}
                      {plan.limits?.max_products && (
                        <li className="flex items-center gap-2">
                          <Package className="h-5 w-5 text-blue-500 flex-shrink-0" />
                          <span className="text-gray-700">حتى {plan.limits.max_products} منتج</span>
                        </li>
                      )}
                      {plan.limits?.max_users && (
                        <li className="flex items-center gap-2">
                          <Users className="h-5 w-5 text-blue-500 flex-shrink-0" />
                          <span className="text-gray-700">حتى {plan.limits.max_users} مستخدم</span>
                        </li>
                      )}
                    </ul>
                  </CardContent>
                  
                  <CardFooter className="pt-0">
                    <Link to={`/register?plan=${plan.id}&cycle=${billingCycle}`} className="w-full">
                      <Button 
                        className={`w-full ${
                          plan.is_popular 
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600' 
                            : ''
                        }`}
                        variant={plan.is_popular ? 'default' : 'outline'}
                        size="lg"
                      >
                        ابدأ الآن
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-purple-100 text-purple-700">آراء العملاء</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              ماذا يقول عملاؤنا؟
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <Card key={`item-${i}`} className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-gray-700 mb-4">"{t.text}"</p>
                  <div>
                    <p className="font-semibold">{t.name}</p>
                    <p className="text-sm text-gray-500">{t.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-4xl mx-auto px-4 text-center text-white">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            جاهز لتطوير عملك؟
          </h2>
          <p className="text-lg opacity-90 mb-8">
            ابدأ تجربتك المجانية اليوم واكتشف كيف يمكن لـ NT Commerce مساعدتك
          </p>
          <Link to="/register">
            <Button size="lg" variant="secondary" className="text-lg px-8">
              ابدأ مجاناً - 14 يوم تجربة
              <ChevronRight className="h-5 w-5 mr-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-lg">NT</span>
                </div>
                <span className="text-xl font-bold text-white">NT Commerce</span>
              </div>
              <p className="text-sm">
                نظام سحابي متكامل لإدارة الأعمال التجارية
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">المنتج</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition">المميزات</a></li>
                <li><a href="#pricing" className="hover:text-white transition">الأسعار</a></li>
                <li><Link to="/register" className="hover:text-white transition">التسجيل</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">الدعم</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">مركز المساعدة</a></li>
                <li><a href="#" className="hover:text-white transition">تواصل معنا</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">تواصل معنا</h4>
              <ul className="space-y-2 text-sm">
                <li>support@ntcommerce.com</li>
                <li dir="ltr">+213 XXX XXX XXX</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
            © {new Date().getFullYear()} NT Commerce. جميع الحقوق محفوظة.
          </div>
        </div>
      </footer>
    </div>
  );
}
