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
  Shield, ArrowLeft, Loader2, CheckCircle, KeyRound, Mail, AlertTriangle
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
  // p53: login package — 2FA step, forgot/reset password, inline lockout error
  const [view, setView] = useState('login'); // login | twofa | forgot | reset
  const [pendingToken, setPendingToken] = useState('');
  const [twoFaCode, setTwoFaCode] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [inlineError, setInlineError] = useState('');

  useDocumentMeta({
    title: "تسجيل الدخول — NT Commerce",
    description: "ادخل إلى حسابك في NT Commerce — منصّة نقاط البيع والتجارة الإلكترونية الذكية للسوق الجزائري.",
    canonical: "https://nt-commerce.net/portal",
  });

  const completeLogin = function(result) {
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
    setLoginSuccess({ type: result.user_type, name: (result.user && result.user.name) || '' });
    setTimeout(function() {
      window.location.href = target;
    }, 500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginSuccess(null);
    setInlineError('');

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
    .then(function(res) {
      return res.json().then(function(body) { return { status: res.status, body: body }; });
    })
    .then(function(r) {
      var result = r.body;
      if (result && result.requires_2fa && result.pending_token) {
        // p53: account has 2FA — move to the code-entry step
        setPendingToken(result.pending_token);
        setTwoFaCode('');
        setView('twofa');
        setLoading(false);
        return;
      }
      if (result && result.access_token) {
        completeLogin(result);
      } else {
        var msg = errText(result) || 'بيانات الدخول غير صحيحة';
        // p53: show lockout / credential errors inline, not only as a toast
        setInlineError(msg);
        toast.error(msg);
        setLoading(false);
      }
    })
    .catch(function(err) {
      toast.error('خطأ في الاتصال: ' + err.message);
      setLoading(false);
    });
  };

  const handleTwoFaSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!twoFaCode.trim()) { setInlineError('أدخل رمز التحقق المكوّن من 6 أرقام'); return; }
    setLoading(true);
    setInlineError('');
    fetch('/api/auth/2fa/login-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pending_token: pendingToken, code: twoFaCode.trim() })
    })
    .then(function(res) {
      return res.json().then(function(body) { return { status: res.status, body: body }; });
    })
    .then(function(r) {
      var result = r.body;
      if (result && result.access_token) {
        completeLogin(result);
      } else {
        var msg = errText(result) || 'رمز التحقق غير صحيح';
        setInlineError(msg);
        if (r.status === 401 && msg.indexOf('أعد تسجيل الدخول') !== -1) {
          // pending token expired / exhausted — back to the password step
          setTimeout(function() { setView('login'); setPendingToken(''); }, 1200);
        }
        setLoading(false);
      }
    })
    .catch(function(err) {
      toast.error('خطأ في الاتصال: ' + err.message);
      setLoading(false);
    });
  };

  const handleForgotSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    var emailEl = document.getElementById('forgot-email');
    var email = emailEl ? emailEl.value.trim() : forgotEmail.trim();
    if (!email) { setInlineError('أدخل بريدك الإلكتروني'); return; }
    setLoading(true);
    setInlineError('');
    fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email })
    })
    .then(function(res) { return res.json(); })
    .then(function(result) {
      setForgotEmail(email);
      setResetCode('');
      setNewPassword('');
      setNewPassword2('');
      setView('reset');
      toast.success((result && result.message) || 'إذا كان البريد مسجلاً لدينا، فستصلك تعليمات إعادة تعيين كلمة المرور.');
      setLoading(false);
    })
    .catch(function(err) {
      toast.error('خطأ في الاتصال: ' + err.message);
      setLoading(false);
    });
  };

  const handleResetSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setInlineError('');
    if (!resetCode.trim()) { setInlineError('أدخل رمز إعادة التعيين'); return; }
    if (newPassword.length < 6) { setInlineError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (newPassword !== newPassword2) { setInlineError('كلمتا المرور غير متطابقتين'); return; }
    setLoading(true);
    fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: forgotEmail, code: resetCode.trim(), new_password: newPassword })
    })
    .then(function(res) {
      return res.json().then(function(body) { return { status: res.status, body: body }; });
    })
    .then(function(r) {
      if (r.status === 200) {
        toast.success((r.body && r.body.message) || 'تم تغيير كلمة المرور بنجاح');
        setView('login');
        setLoading(false);
      } else {
        setInlineError(errText(r.body) || 'تعذر تغيير كلمة المرور');
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

  const headerFor = {
    login: { title: 'تسجيل الدخول', desc: 'أدخل بياناتك للوصول إلى حسابك', icon: LogIn },
    twofa: { title: 'التحقق بخطوتين', desc: 'أدخل رمز التحقق من تطبيق المصادقة', icon: KeyRound },
    forgot: { title: 'استعادة كلمة المرور', desc: 'أدخل بريدك الإلكتروني لإرسال رمز إعادة التعيين', icon: Mail },
    reset: { title: 'كلمة مرور جديدة', desc: 'أدخل الرمز الذي وصلك وكلمة المرور الجديدة', icon: KeyRound }
  };
  const header = headerFor[view] || headerFor.login;
  const HeaderIcon = header.icon;

  const inlineErrorBox = inlineError ? (
    <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 flex items-start gap-2" data-testid="login-inline-error">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{inlineError}</span>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2v-4h4v-2H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50"></div>

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
              <HeaderIcon className="h-5 w-5" />
              {header.title}
            </CardTitle>
            <CardDescription>
              {header.desc}
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
            ) : view === 'twofa' ? (
              <div className="space-y-4">
                {inlineErrorBox}
                <div className="space-y-2">
                  <Label>رمز التحقق</Label>
                  <Input
                    type="text" inputMode="numeric" autoComplete="one-time-code"
                    id="twofa-code" value={twoFaCode}
                    onChange={function(e) { setTwoFaCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)); }}
                    onKeyDown={function(e) { if (e.key === 'Enter') handleTwoFaSubmit(e); }}
                    placeholder="000000"
                    dir="ltr"
                    className="h-11 text-center text-lg tracking-widest text-black bg-white font-medium"
                    data-testid="twofa-code-input"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    افتح تطبيق المصادقة (Google Authenticator أو مشابه) وأدخل الرمز المكوّن من 6 أرقام
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={handleTwoFaSubmit}
                  className="w-full h-11 text-base gap-2"
                  disabled={loading}
                  data-testid="twofa-verify-btn"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      جاري التحقق...
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-5 w-5" />
                      تأكيد الرمز
                    </>
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={function() { setView('login'); setInlineError(''); setPendingToken(''); }}
                    className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    العودة لتسجيل الدخول
                  </button>
                </div>
              </div>
            ) : view === 'forgot' ? (
              <div className="space-y-4">
                {inlineErrorBox}
                <div className="space-y-2">
                  <Label>البريد الإلكتروني</Label>
                  <Input
                    type="email" name="forgot-email" id="forgot-email" defaultValue={forgotEmail}
                    placeholder="name@example.com"
                    onKeyDown={function(e) { if (e.key === 'Enter') handleForgotSubmit(e); }}
                    className="h-11 text-black bg-white font-medium"
                    data-testid="forgot-email-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    سنرسل لك رمز إعادة تعيين مكوّناً من 6 أرقام (صالح لمدة 15 دقيقة)
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={handleForgotSubmit}
                  className="w-full h-11 text-base gap-2"
                  disabled={loading}
                  data-testid="forgot-submit-btn"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Mail className="h-5 w-5" />
                      إرسال رمز إعادة التعيين
                    </>
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={function() { setView('login'); setInlineError(''); }}
                    className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    العودة لتسجيل الدخول
                  </button>
                </div>
              </div>
            ) : view === 'reset' ? (
              <div className="space-y-4">
                {inlineErrorBox}
                <div className="space-y-2">
                  <Label>رمز إعادة التعيين</Label>
                  <Input
                    type="text" inputMode="numeric"
                    id="reset-code" value={resetCode}
                    onChange={function(e) { setResetCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6)); }}
                    placeholder="000000"
                    dir="ltr"
                    className="h-11 text-center text-lg tracking-widest text-black bg-white font-medium"
                    data-testid="reset-code-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label>كلمة المرور الجديدة</Label>
                  <Input
                    type="password" id="reset-password" value={newPassword}
                    onChange={function(e) { setNewPassword(e.target.value); }}
                    placeholder="6 أحرف على الأقل"
                    className="h-11 text-black bg-white font-medium"
                    data-testid="reset-password-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label>تأكيد كلمة المرور</Label>
                  <Input
                    type="password" id="reset-password2" value={newPassword2}
                    onChange={function(e) { setNewPassword2(e.target.value); }}
                    onKeyDown={function(e) { if (e.key === 'Enter') handleResetSubmit(e); }}
                    placeholder="أعد كتابة كلمة المرور"
                    className="h-11 text-black bg-white font-medium"
                    data-testid="reset-password2-input"
                  />
                </div>

                <Button
                  type="button"
                  onClick={handleResetSubmit}
                  className="w-full h-11 text-base gap-2"
                  disabled={loading}
                  data-testid="reset-submit-btn"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      جاري التغيير...
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-5 w-5" />
                      تغيير كلمة المرور
                    </>
                  )}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={function() { setView('login'); setInlineError(''); }}
                    className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    العودة لتسجيل الدخول
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {inlineErrorBox}
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
                  <div className="text-left">
                    <button
                      type="button"
                      onClick={function() { setForgotEmail(''); setInlineError(''); setView('forgot'); }}
                      className="text-xs text-primary hover:underline"
                      data-testid="forgot-password-link"
                    >
                      نسيت كلمة المرور؟
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
