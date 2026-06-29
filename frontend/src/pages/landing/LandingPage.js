import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';
import { 
  Check, Star, Zap, Shield, BarChart3, Users, Package, 
  ShoppingCart, Globe, Clock, Headphones, ChevronRight,
  Smartphone, Cloud, Lock, TrendingUp, Award, Sparkles,
  Menu, X, AlertCircle, XCircle, MessageCircle, Mail, Phone, Send,
  FileText, Truck, Wallet, CreditCard
} from 'lucide-react';

export default function LandingPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState(null);
  const [contact, setContact] = useState({ name: '', phone: '', message: '' });
  const [contactSent, setContactSent] = useState(false);

  // ── SEO meta (per-page, no library) ──────────────────────────────────
  useDocumentMeta({
    title: "NT Commerce — منصّة محاسبة ذكية + متجر إلكتروني للسوق الجزائري 🇩🇿",
    description: "نظام نقاط بيع (POS) سحابي متكامل: محاسبة، مخزون، فواتير، متجر إلكتروني، تكامل Shopify + Yalidine، وإدارة كروت Idoom/SIM. تجربة مجّانية 14 يوم.",
    keywords: "نقاط بيع, POS الجزائر, نظام محاسبة, متجر إلكتروني, Yalidine, Shopify, إدارة مخزون, محل تجاري, NT Commerce, SaaS الجزائر",
    canonical: "https://nt-v16-staging.emergent.host/",
  });

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
      case '6months': return plan.six_month_price ?? 0;
      case 'yearly': return plan.yearly_price ?? 0;
      default: return plan.monthly_price ?? 0;
    }
  };

  const getSavings = (plan) => {
    const monthly = plan.monthly_price ?? 0;
    if (!monthly) return 0;
    if (billingCycle === '6months') {
      const sixMonthPrice = plan.six_month_price ?? 0;
      const wouldBe = monthly * 6;
      return wouldBe ? Math.round(((wouldBe - sixMonthPrice) / wouldBe) * 100) : 0;
    }
    if (billingCycle === 'yearly') {
      const yearlyPrice = plan.yearly_price ?? 0;
      const wouldBe = monthly * 12;
      return wouldBe ? Math.round(((wouldBe - yearlyPrice) / wouldBe) * 100) : 0;
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

  const painPoints = [
    {
      icon: XCircle,
      problem: 'تضييع وقت في كتابة الفواتير يدوياً',
      solution: 'إصدار فاتورة احترافية في 5 ثوانٍ مع طباعة فورية',
    },
    {
      icon: XCircle,
      problem: 'فقدان السيطرة على المخزون والأكواد',
      solution: 'تتبُّع كل قطعة و ICCID و كود من الشراء حتى البيع',
    },
    {
      icon: XCircle,
      problem: 'تكرار العمل بين المحلّ و Shopify و Yalidine',
      solution: 'مزامنة تلقائية كاملة في نظام موحَّد',
    },
    {
      icon: XCircle,
      problem: 'صعوبة معرفة ربحية كل منتج فعلاً',
      solution: 'تقارير ذكية + مساعد AI يكشف لك المنتجات الرابحة',
    },
    {
      icon: XCircle,
      problem: 'ديون الزبائن تتراكم بدون متابعة',
      solution: 'سجلّ ديون فوري + تنبيهات تلقائية للسداد',
    },
    {
      icon: XCircle,
      problem: 'الموظفون يبيعون بدون رقابة',
      solution: 'صلاحيات دقيقة لكل دور + سجل عمليات شامل',
    },
  ];

  const previewSections = [
    {
      icon: BarChart3,
      title: 'لوحة قيادة شاملة',
      desc: 'كل أرقام محلِّك في شاشة واحدة: المبيعات، الأرباح، أفضل المنتجات، المخزون المنخفض',
      bullets: ['تحديث فوري', 'مقارنة شهرية', 'تنبيهات ذكية'],
    },
    {
      icon: ShoppingCart,
      title: 'نقطة بيع POS فائقة السرعة',
      desc: 'واجهة لمسية تعمل على أي جهاز — تابلت، هاتف، حاسوب — حتى بدون إنترنت',
      bullets: ['Barcode scanner', 'طباعة حرارية', 'دفع متعدّد'],
    },
    {
      icon: Truck,
      title: 'متجر إلكتروني + Yalidine',
      desc: 'استقبل طلبات Shopify/Instagram، طبع وصل، ادفع، خصم تلقائي من المخزون',
      bullets: ['Yalidine API', 'Shopify Sync', 'WhatsApp إشعارات'],
    },
    {
      icon: CreditCard,
      title: 'كروت تعبئة و Idoom و SIM',
      desc: 'مورد مركزي للأكواد، تتبُّع ICCID، ربحية لكل فئة بدقّة',
      bullets: ['موبيليس/جيزي/أوريدو', 'Idoom 4G/Fibre', 'تقارير شهرية PDF'],
    },
  ];

  const faqs = [
    {
      q: 'هل النظام يحتاج إنترنت دائماً؟',
      a: 'لا — نقطة البيع تعمل بشكل كامل أوفلاين، وتُزامن تلقائياً عند عودة الإنترنت. باقي الميزات تحتاج اتصالاً لكنها تعمل من أيّ مكان (محل، بيت، هاتف).',
    },
    {
      q: 'كم يستغرق إعداد النظام لمحلِّي؟',
      a: 'أقلّ من 30 دقيقة! نُساعدك في رفع منتجاتك من ملفّ Excel، تجهيز Dashboard، تثبيت تطبيق POS، وأوّل فاتورة تجريبية مجّاناً.',
    },
    {
      q: 'هل بياناتي آمنة على السحابة؟',
      a: 'نعم — تشفير TLS كامل، نسخ احتياطية يومية، فصل تامّ لقواعد بيانات كل عميل (Multi-tenant Isolation). يمكنك تحميل كامل بياناتك في أيّ وقت.',
    },
    {
      q: 'ماذا لو أردتُ إلغاء الاشتراك؟',
      a: 'تستطيع الإلغاء في أيّ وقت من حسابك بدون عقد طويل. ستحتفظ ببياناتك مدّة 30 يوماً للتحميل، ثمّ تُحذف نهائياً وفق GDPR.',
    },
    {
      q: 'هل يدعم النظام أكثر من فرع/محل؟',
      a: 'نعم — خطّة Business تتيح Multi-Warehouse و Multi-Store مع تقارير موحَّدة. كلّ فرع له موظَّفوه وصلاحياته المستقلَّة.',
    },
    {
      q: 'كيف يعمل الدفع؟ هل تقبلون البطاقات الجزائرية؟',
      a: 'نقبل: تحويل CCP، EDAHABIA، CIB، نقداً عبر وكيل في كل ولاية. ندعم أيضاً دفع شهري بدون التزام طويل.',
    },
    {
      q: 'هل يوجد دعم بالعربية؟',
      a: 'نعم — فريق الدعم 100% جزائري. WhatsApp، هاتف، ومركز مساعدة كامل بالعربية. متوسط الرّد: 15 دقيقة في ساعات العمل.',
    },
    {
      q: 'هل يمكنني تجربة النظام قبل الدفع؟',
      a: 'نعم — 14 يوم تجربة مجّانية كاملة بدون بطاقة، بدون التزامات. تجرّب كل الميزات وقت ما تشاء.',
    },
  ];

  const submitContact = (e) => {
    e.preventDefault();
    // Build WhatsApp message
    const text = `استفسار من ${contact.name || 'زائر'} (${contact.phone || '-'}): ${contact.message || ''}`;
    const whatsappUrl = `https://wa.me/213550552912?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
    setContactSent(true);
    setTimeout(() => setContactSent(false), 4000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl" data-testid="landing-page">
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
              <a href="#faq" className="text-gray-600 hover:text-blue-600 transition">الأسئلة</a>
              <a href="#contact" className="text-gray-600 hover:text-blue-600 transition">تواصل</a>
              <Link to="/portal" data-testid="nav-login-btn">
                <Button variant="outline">تسجيل الدخول</Button>
              </Link>
              <Link to="/register" data-testid="nav-register-btn">
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
            <a href="#faq" className="block py-2 text-gray-600">الأسئلة الشائعة</a>
            <a href="#contact" className="block py-2 text-gray-600">تواصل معنا</a>
            <Link to="/portal" className="block">
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

      {/* ── Pain Points Section ─────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-b from-rose-50/50 to-white" data-testid="pain-points-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-rose-100 text-rose-700">المشاكل التي نحلّها</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              هل تواجه إحدى هذه المشاكل اليومية؟
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              NT Commerce صُمِّم لينهي هذه المعاناة — حلول حقيقية، لا مجرّد وعود
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {painPoints.map((p, i) => (
              <Card key={`pain-${i}`} className="border-0 shadow-md hover:shadow-xl transition-all hover:-translate-y-1" data-testid={`pain-card-${i}`}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <p.icon className="h-5 w-5 text-rose-600" />
                    </div>
                    <p className="text-gray-700 font-medium leading-relaxed line-through opacity-70">{p.problem}</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Check className="h-5 w-5 text-emerald-600" />
                    </div>
                    <p className="text-gray-900 font-semibold leading-relaxed">{p.solution}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard Preview Section ───────────────────────────────── */}
      <section className="py-20 bg-white" data-testid="preview-section">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-blue-100 text-blue-700">معاينة النظام</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              نظام واحد لكل احتياجاتك
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              من نقطة البيع إلى المتجر الإلكتروني، كل شيء في مكان واحد
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {previewSections.map((s, i) => (
              <div
                key={`prev-${i}`}
                data-testid={`preview-card-${i}`}
                className="relative group rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 p-8 hover:border-blue-300 hover:shadow-2xl transition-all overflow-hidden"
              >
                <div className="absolute -top-12 -left-12 w-40 h-40 bg-gradient-to-br from-blue-400/10 to-indigo-400/10 rounded-full blur-2xl group-hover:scale-150 transition-transform" />
                <div className="relative">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mb-5 shadow-lg shadow-blue-500/30">
                    <s.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{s.title}</h3>
                  <p className="text-gray-600 mb-4 leading-relaxed">{s.desc}</p>
                  <div className="flex flex-wrap gap-2">
                    {s.bullets.map((b, j) => (
                      <span key={j} className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs text-slate-600 shadow-sm">
                        ✓ {b}
                      </span>
                    ))}
                  </div>
                </div>
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
                      {Object.entries(plan.features || {}).filter(([k, v]) => v === true && typeof v === 'boolean').slice(0, 6).map(([key], i) => (
                        <li key={`item-${i}`} className="flex items-center gap-2">
                          <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                          <span className="text-gray-700">
                            {key === 'has_pos' ? 'نقطة البيع' :
                             key === 'has_inventory' ? 'إدارة المخزون' :
                             key === 'has_reports' ? 'التقارير' :
                             key === 'has_multi_warehouse' ? 'تعدد المخازن' :
                             key === 'has_api_access' ? 'الوصول للـ API' :
                             key === 'has_ecommerce' ? 'متجر إلكتروني' :
                             key === 'has_advanced_reports' ? 'تقارير متقدمة' :
                             key === 'has_employee_management' ? 'إدارة الموظفين' :
                             key === 'has_debt_management' ? 'إدارة الديون' :
                             key === 'has_customer_loyalty' ? 'برنامج الولاء' :
                             key === 'has_supplier_management' ? 'إدارة الموردين' :
                             key === 'has_email_notifications' ? 'إشعارات البريد' :
                             key === 'has_sms_notifications' ? 'إشعارات SMS' :
                             key.replace(/^has_/, '').replace(/_/g, ' ')}
                          </span>
                        </li>
                      ))}
                      {plan.features?.max_products != null && (
                        <li className="flex items-center gap-2">
                          <Package className="h-5 w-5 text-blue-500 flex-shrink-0" />
                          <span className="text-gray-700">
                            {plan.features.max_products === -1 ? 'منتجات غير محدودة' : `حتى ${plan.features.max_products} منتج`}
                          </span>
                        </li>
                      )}
                      {plan.features?.max_users != null && (
                        <li className="flex items-center gap-2">
                          <Users className="h-5 w-5 text-blue-500 flex-shrink-0" />
                          <span className="text-gray-700">
                            {plan.features.max_users === -1 ? 'مستخدمون غير محدودون' : `حتى ${plan.features.max_users} مستخدم`}
                          </span>
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
                  <p className="text-gray-700 mb-4">&laquo;{t.text}&raquo;</p>
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


      {/* ── FAQ Section ─────────────────────────────────────────────── */}
      <section id="faq" className="py-20 bg-gradient-to-b from-gray-50 to-white" data-testid="faq-section">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge className="mb-4 bg-amber-100 text-amber-700">أسئلة شائعة</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              كل ما تريد معرفته قبل البدء
            </h2>
            <p className="text-lg text-gray-600">
              لم تجد إجابتك؟ <a href="#contact" className="text-blue-600 hover:underline font-semibold">تواصل معنا</a>
            </p>
          </div>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div
                key={`faq-${i}`}
                data-testid={`faq-item-${i}`}
                className={`rounded-xl border transition-all overflow-hidden ${
                  openFaq === i ? 'border-blue-300 bg-blue-50/30 shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-right gap-4"
                  data-testid={`faq-toggle-${i}`}
                >
                  <span className={`font-semibold text-lg ${openFaq === i ? 'text-blue-700' : 'text-gray-900'}`}>
                    {f.q}
                  </span>
                  <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    openFaq === i ? 'bg-blue-600 text-white rotate-45' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <X className="h-4 w-4" />
                  </span>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-gray-700 leading-relaxed border-t border-blue-100 pt-4">
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact / Demo Booking Section ──────────────────────────── */}
      <section id="contact" className="py-20 bg-white" data-testid="contact-section">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="mb-4 bg-emerald-100 text-emerald-700">تواصل معنا</Badge>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                لديك سؤال أو تريد عرضاً مخصَّصاً؟
              </h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                فريقنا الجزائري متاح للمساعدة. سواء استفسار سريع، احجز Demo، أو استشارة لاختيار الخطّة المناسبة لعملك — نحن هنا.
              </p>

              <div className="space-y-4">
                <a
                  href="https://wa.me/213550552912"
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 transition group"
                  data-testid="contact-whatsapp"
                >
                  <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center text-white">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900">WhatsApp</div>
                    <div className="text-sm text-gray-600" dir="ltr">+213 550 55 29 12</div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-emerald-600 group-hover:-translate-x-1 transition" />
                </a>

                <a
                  href="mailto:contact@nt.dz"
                  className="flex items-center gap-4 p-4 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 transition group"
                  data-testid="contact-email"
                >
                  <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900">البريد الإلكتروني</div>
                    <div className="text-sm text-gray-600" dir="ltr">contact@nt.dz</div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-blue-600 group-hover:-translate-x-1 transition" />
                </a>

                <a
                  href="tel:+213550552912"
                  className="flex items-center gap-4 p-4 rounded-xl border border-purple-200 bg-purple-50/50 hover:bg-purple-50 transition group"
                  data-testid="contact-phone"
                >
                  <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center text-white">
                    <Phone className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-gray-900">الهاتف</div>
                    <div className="text-sm text-gray-600" dir="ltr">+213 550 55 29 12</div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-purple-600 group-hover:-translate-x-1 transition" />
                </a>
              </div>
            </div>

            <Card className="border-0 shadow-2xl shadow-blue-500/10">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">احجز عرضاً مجّانياً</h3>
                <p className="text-gray-600 mb-6">عرض 15 دقيقة مخصَّص لعملك — بدون التزام</p>

                <form onSubmit={submitContact} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
                    <input
                      type="text"
                      data-testid="contact-form-name"
                      value={contact.name}
                      onChange={(e) => setContact({ ...contact, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
                      placeholder="اسمك الكامل"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
                    <input
                      type="tel"
                      data-testid="contact-form-phone"
                      value={contact.phone}
                      onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
                      placeholder="0550 55 29 12"
                      dir="ltr"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">نوع نشاطك (اختياري)</label>
                    <textarea
                      data-testid="contact-form-message"
                      value={contact.message}
                      onChange={(e) => setContact({ ...contact, message: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition min-h-[100px]"
                      placeholder="مثلاً: محل هواتف، سوبر ماركت، تجارة جملة..."
                    />
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    data-testid="contact-form-submit"
                    className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-lg shadow-lg shadow-emerald-500/30"
                  >
                    {contactSent ? (
                      <>
                        <Check className="h-5 w-5 ml-2" />
                        تمّ الإرسال!
                      </>
                    ) : (
                      <>
                        إرسال عبر WhatsApp
                        <Send className="h-5 w-5 mr-2" />
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-gray-500 text-center">
                    سيُفتح WhatsApp مباشرةً مع رسالتك جاهزة — أو راسلنا في أيّ وقت
                  </p>
                </form>
              </CardContent>
            </Card>
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
                <li><a href="#faq" className="hover:text-white transition">الأسئلة الشائعة</a></li>
                <li><a href="#contact" className="hover:text-white transition">تواصل معنا</a></li>
                <li><a href="https://wa.me/213550552912" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">WhatsApp</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">تواصل معنا</h4>
              <ul className="space-y-2 text-sm">
                <li>support@nt.dz</li>
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
