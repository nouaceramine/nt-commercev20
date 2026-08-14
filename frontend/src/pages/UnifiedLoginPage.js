import { errText } from '../lib/errorText';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { 
  Building2, Eye, EyeOff, LogIn, Users, Truck, Store, 
  Shield, ArrowLeft, Loader2, CheckCircle
} from 'lucide-react';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

export default function UnifiedLoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loginSuccess, setLoginSuccess] = useState(null);

  useDocumentMeta({
    title: "تسجيل الدخول — NT Commerce",
    description: "ادخل إلى حسابك في NT Commerce — منصّة نقاط البيع والتجارة الإلكترونية الذكية للسوق الجزائري.",
    canonical: "https://nt-commerce.net/portal",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginSuccess(null);
    
    var emailEl = document.getElementById('login-email');
    var passEl = document.getElementById('login-password');
    var data = {
      email: emailEl ? emailEl.value : '',
      password: passEl ? passEl.value : ''
    };
    
    fetch('/api/auth/unified-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function(res) { return res.json(); })
    .then(function(result) {
      if (result.access_token) {
        // p52: a fresh normal login must wipe any stale impersonation session,
        // otherwise the expired super_admin_token keeps hijacking /saas/* calls.
        localStorage.removeItem('super_admin_token');
        localStorage.removeItem('super_admin_user');
        localStorage.removeItem('is_impersonating');
        localStorage.removeItem('impersonation_session_id');
        localStorage.setItem('token', result.access_token);
        localStorage.setItem('user', JSON.stringify(result.user));
        toast.success('تم تسجيل الدخول بنجاح!');
        var role = (result.user && result.user.role) || 'admin';
        var target = '/dashboard';
        if (result.redirect_to) {
          target = result.redirect_to;
        } else if (role === 'super_admin') {
          target = '/saas-admin';
        } else if (role === 'agent') {
          target = '/agent/dashboard';
        } else if (role === 'tenant' || role === 'tenant_admin') {
          target = '/tenant/dashboard';
        }
        setTimeout(function() {
          window.location.href = target;
        }, 500);
      } else {
        toast.error(errText(result) ||  'بيانات الدخول غير صحيحة');
        setLoading(false);
      }
    })
    .catch(function(err) {
      toast.error('خطأ في الاتصال: ' + err.message);
      setLoading(false);
    });
  };

  const getUserTypeInfo = (type) => {
    const types = {
      admin: { icon: Shield, label: 'مدير النظام', color: 'text-blue-600', bg: 'bg-blue-100' },
      agent: { icon: Truck, label: 'وكيل', color: 'text-purple-600', bg: 'bg-purple-100' },
      tenant: { icon: Store, label: 'مشترك', color: 'text-green-600', bg: 'bg-green-100' }
    };
    return types[type] || types.admin;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50"></div>
      
      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="h-14 w-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <Building2 className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">NT Commerce</h1>
          <p className="text-blue-200">نظام إدارة المبيعات والمخزون</p>
        </div>

        <Card className="shadow-2xl border-0 backdrop-blur bg-white/95">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-xl flex items-center justify-center gap-2">
              <LogIn className="h-5 w-5" />
              تسجيل الدخول
            </CardTitle>
            <CardDescription>
              أدخل بياناتك للوصول إلى حسابك
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loginSuccess ? (
              <div className="text-center py-6">
                <div className={`h-16 w-16 rounded-full ${getUserTypeInfo(loginSuccess.type).bg} flex items-center justify-center mx-auto mb-4`}>
                  <CheckCircle className={`h-8 w-8 ${getUserTypeInfo(loginSuccess.type).color}`} />
                </div>
                <h3 className="text-lg font-semibold mb-2">مرحباً {loginSuccess.name}!</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  تم تسجيل الدخول بنجاح كـ {getUserTypeInfo(loginSuccess.type).label}
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري التحويل...
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>البريد الإلكتروني</Label>
                  <Input
                    type="email" name="email" id="login-email" defaultValue=""
                    placeholder="name@example.com"
                    required
                    className="h-11 text-black bg-white font-medium"
                    data-testid="unified-email-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>كلمة المرور</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'} name="password" id='login-password' defaultValue=""
                      placeholder="••••••••"
                      onKeyDown={function(e) { if (e.key === 'Enter') handleSubmit(e); }}
                      required
                      className="h-11 pe-10 text-black bg-white font-medium"
                      data-testid="unified-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button 
                  type="button"
                  onClick={handleSubmit}
                  className="w-full h-11 text-base gap-2" 
                  disabled={loading}
                  data-testid="unified-login-btn"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      جاري التحقق...
                    </>
                  ) : (
                    <>
                      <LogIn className="h-5 w-5" />
                      تسجيل الدخول
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* User Types Info */}
            <div className="mt-6 pt-6 border-t">
              <p className="text-xs text-center text-muted-foreground mb-3">
                يدعم النظام تسجيل دخول:
              </p>
              <div className="flex justify-center gap-4">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3 text-blue-500" />
                  <span>المديرين</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Truck className="h-3 w-3 text-purple-500" />
                  <span>الوكلاء</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Store className="h-3 w-3 text-green-500" />
                  <span>المشتركين</span>
                </div>
              </div>
            </div>

            {/* Register Link */}
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                ليس لديك حساب؟{' '}
                <button 
                  onClick={() => navigate('/register')}
                  className="text-primary hover:underline font-medium"
                >
                  سجل الآن
                </button>
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-blue-200/60 mt-6">
          © 2024 NT Commerce - جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
