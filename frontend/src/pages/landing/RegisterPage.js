import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { toast } from 'sonner';
import { 
  ChevronRight, Check, Sparkles, Building, Mail, Phone, 
  Lock, User, ArrowRight, Eye, EyeOff
} from 'lucide-react';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(searchParams.get('plan') || '');
  const [billingCycle, setBillingCycle] = useState(searchParams.get('cycle') || 'monthly');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company_name: '',
    password: '',
    confirm_password: ''
  });

  useEffect(() => {
    fetchPlans();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPlans = async () => {
    try {
      const response = await apiClient.get(`/saas/plans`);
      setPlans(response.data);
      if (response.data.length > 0 && !selectedPlan) {
        const popularPlan = response.data.find(p => p.is_popular);
        setSelectedPlan(popularPlan?.id || response.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirm_password) {
      toast.error('كلمات المرور غير متطابقة');
      return;
    }
    
    if (formData.password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post(`/saas/register`, {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        company_name: formData.company_name,
        password: formData.password,
        plan_id: selectedPlan,
        subscription_type: billingCycle
      });
      
      toast.success('تم إنشاء حسابك بنجاح!');
      
      // Store token and redirect
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('tenant_id', response.data.tenant_id);
      
      // Redirect to dashboard
      navigate('/');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'حدث خطأ أثناء التسجيل');
    } finally {
      setLoading(false);
    }
  };

  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  const getPrice = (plan) => {
    switch (billingCycle) {
      case '6months': return plan?.price_6months || 0;
      case 'yearly': return plan?.price_yearly || 0;
      default: return plan?.price_monthly || 0;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50" dir="rtl">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-lg border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/landing" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">NT</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              NT Commerce
            </span>
          </Link>
          <Link to="/tenant-login">
            <Button variant="ghost">لديك حساب؟ سجل دخول</Button>
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Progress Steps */}
        <div className="flex justify-center mb-12">
          <div className="flex items-center gap-4">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-all ${
                  step >= s 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {step > s ? <Check className="h-5 w-5" /> : s}
                </div>
                <span className={`mr-2 ${step >= s ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
                  {s === 1 ? 'اختر الخطة' : 'بياناتك'}
                </span>
                {s < 2 && <ArrowRight className="h-5 w-5 text-gray-300 mx-4" />}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Choose Plan */}
        {step === 1 && (
          <div className="space-y-8">
            <div className="text-center">
              <Badge className="mb-4 bg-blue-100 text-blue-700">
                <Sparkles className="h-3 w-3 ml-1" />
                14 يوم تجربة مجانية
              </Badge>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">اختر الخطة المناسبة</h1>
              <p className="text-gray-600">يمكنك الترقية أو التغيير في أي وقت</p>
            </div>

            {/* Billing Toggle */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2 bg-white p-1 rounded-full shadow-sm">
                {['monthly', '6months', 'yearly'].map((cycle) => (
                  <button
                    key={cycle}
                    onClick={() => setBillingCycle(cycle)}
                    className={`px-4 py-2 rounded-full transition-all ${
                      billingCycle === cycle 
                        ? 'bg-blue-600 text-white shadow' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {cycle === 'monthly' ? 'شهري' : cycle === '6months' ? '6 أشهر' : 'سنوي'}
                  </button>
                ))}
              </div>
            </div>

            {/* Plans */}
            <div className="grid md:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <Card 
                  key={plan.id}
                  className={`cursor-pointer transition-all hover:shadow-lg ${
                    selectedPlan === plan.id 
                      ? 'ring-2 ring-blue-500 shadow-lg' 
                      : 'hover:border-blue-200'
                  } ${plan.is_popular ? 'relative' : ''}`}
                  onClick={() => setSelectedPlan(plan.id)}
                >
                  {plan.is_popular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <Badge className="bg-blue-500 text-white shadow">الأكثر شعبية</Badge>
                    </div>
                  )}
                  <CardContent className="p-6 text-center">
                    <h3 className="text-xl font-semibold mb-2">{plan.name_ar}</h3>
                    <p className="text-gray-500 text-sm mb-4">{plan.description_ar}</p>
                    <div className="mb-4">
                      <span className="text-3xl font-bold">{getPrice(plan).toLocaleString()}</span>
                      <span className="text-gray-500 mr-1">دج</span>
                    </div>
                    <div className={`w-6 h-6 mx-auto rounded-full border-2 flex items-center justify-center ${
                      selectedPlan === plan.id 
                        ? 'border-blue-500 bg-blue-500' 
                        : 'border-gray-300'
                    }`}>
                      {selectedPlan === plan.id && <Check className="h-4 w-4 text-white" />}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {plans.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">جاري تحميل الخطط...</p>
              </div>
            )}

            <div className="flex justify-center">
              <Button 
                size="lg" 
                className="px-12 bg-gradient-to-r from-blue-600 to-indigo-600"
                onClick={() => setStep(2)}
                disabled={!selectedPlan}
              >
                التالي
                <ChevronRight className="h-5 w-5 mr-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Account Details */}
        {step === 2 && (
          <div className="max-w-lg mx-auto">
            <Card className="shadow-xl">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">أنشئ حسابك</CardTitle>
                <CardDescription>
                  {selectedPlanData && (
                    <span className="flex items-center justify-center gap-2 mt-2">
                      الخطة المختارة: 
                      <Badge variant="secondary">{selectedPlanData.name_ar}</Badge>
                      <Button variant="link" size="sm" onClick={() => setStep(1)}>تغيير</Button>
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">الاسم الكامل *</Label>
                    <div className="relative">
                      <User className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="أدخل اسمك"
                        className="pr-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">البريد الإلكتروني *</Label>
                    <div className="relative">
                      <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="example@email.com"
                        className="pr-10"
                        dir="ltr"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">رقم الهاتف</Label>
                    <div className="relative">
                      <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="05XXXXXXXX"
                        className="pr-10"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company_name">اسم الشركة/المحل</Label>
                    <div className="relative">
                      <Building className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="company_name"
                        name="company_name"
                        value={formData.company_name}
                        onChange={handleChange}
                        placeholder="اسم نشاطك التجاري"
                        className="pr-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">كلمة المرور *</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="6 أحرف على الأقل"
                        className="pr-10 pl-10"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm_password">تأكيد كلمة المرور *</Label>
                    <div className="relative">
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="confirm_password"
                        name="confirm_password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={formData.confirm_password}
                        onChange={handleChange}
                        placeholder="أعد إدخال كلمة المرور"
                        className="pr-10 pl-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800">
                    <Sparkles className="h-4 w-4 inline ml-1" />
                    ستحصل على <strong>14 يوم تجربة مجانية</strong> للاستكشاف قبل بدء الدفع
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex-1">
                      رجوع
                    </Button>
                    <Button 
                      type="submit" 
                      className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600"
                      disabled={loading}
                    >
                      {loading ? 'جاري الإنشاء...' : 'أنشئ حسابي'}
                    </Button>
                  </div>

                  <p className="text-center text-sm text-gray-500">
                    بالتسجيل أنت توافق على{' '}
                    <a href="#" className="text-blue-600 hover:underline">شروط الاستخدام</a>
                    {' '}و{' '}
                    <a href="#" className="text-blue-600 hover:underline">سياسة الخصوصية</a>
                  </p>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
