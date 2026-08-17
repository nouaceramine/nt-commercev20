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
  Shield, ArrowLeft, Loader2, CheckCircle, KeyRound, Mail, AlertTriangle, Globe, Home
} from 'lucide-react';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { useLanguage } from '../contexts/LanguageContext';

// p56: bilingual strings for the standalone login page (server messages stay as returned)
const STR = {
  ar: {
    tagline: 'نظام إدارة المبيعات والمخزون',
    welcome: 'مرحباً',
    successAs: 'تم تسجيل الدخول بنجاح كـ',
    redirecting: 'جاري التحويل...',
    typeAdmin: 'مدير النظام',
    typeAgent: 'وكيل',
    typeTenant: 'مشترك',
    hLogin: 'تسجيل الدخول',
    hLoginDesc: 'أدخل بياناتك للوصول إلى حسابك',
    hTwofa: 'التحقق بخطوتين',
    hTwofaDesc: 'أدخل رمز التحقق من تطبيق المصادقة',
    hForgot: 'استعادة كلمة المرور',
    hForgotDesc: 'أدخل بريدك الإلكتروني لإرسال رمز إعادة التعيين',
    hReset: 'كلمة مرور جديدة',
    hResetDesc: 'أدخل الرمز الذي وصلك وكلمة المرور الجديدة',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    capsLock: 'تنبيه: زر Caps Lock مفعّل',
    forgotLink: 'نسيت كلمة المرور؟',
    loginBtn: 'تسجيل الدخول',
    checking: 'جاري التحقق...',
    twofaCode: 'رمز التحقق',
    twofaHint: 'افتح تطبيق المصادقة (Google Authenticator أو مشابه) وأدخل الرمز المكوّن من 6 أرقام',
    twofaBtn: 'تأكيد الرمز',
    verifying: 'جاري التحقق...',
    backToLogin: 'العودة لتسجيل الدخول',
    forgotHint: 'سنرسل لك رمز إعادة تعيين مكوّناً من 6 أرقام (صالح لمدة 15 دقيقة)',
    forgotBtn: 'إرسال رمز إعادة التعيين',
    sending: 'جاري الإرسال...',
    resetCode: 'رمز إعادة التعيين',
    newPassword: 'كلمة المرور الجديدة',
    newPasswordPh: '6 أحرف على الأقل',
    newPassword2: 'تأكيد كلمة المرور',
    newPassword2Ph: 'أعد كتابة كلمة المرور',
    resetBtn: 'تغيير كلمة المرور',
    changing: 'جاري التغيير...',
    supports: 'يدعم النظام تسجيل دخول:',
    admins: 'المديرين',
    agents: 'الوكلاء',
    tenants: 'المشتركين',
    noAccount: 'ليس لديك حساب؟',
    registerNow: 'سجل الآن',
    backHome: 'العودة للرئيسية',
    rights: 'جميع الحقوق محفوظة',
    loginOk: 'تم تسجيل الدخول بنجاح!',
    badCreds: 'بيانات الدخول غير صحيحة',
    connErr: 'خطأ في الاتصال: ',
    needCode: 'أدخل رمز التحقق المكوّن من 6 أرقام',
    badCode: 'رمز التحقق غير صحيح',
    needEmail: 'أدخل بريدك الإلكتروني',
    forgotSent: 'إذا كان البريد مسجلاً لدينا، فستصلك تعليمات إعادة تعيين كلمة المرور.',
    needResetCode: 'أدخل رمز إعادة التعيين',
    shortPass: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
    passMismatch: 'كلمتا المرور غير متطابقتين',
    resetOk: 'تم تغيير كلمة المرور بنجاح',
    resetFail: 'تعذر تغيير كلمة المرور',
    reloginHint: 'أعد تسجيل الدخول'
  },
  fr: {
    tagline: 'Gestion des ventes et du stock',
    welcome: 'Bienvenue',
    successAs: 'Connexion réussie en tant que',
    redirecting: 'Redirection...',
    typeAdmin: 'Administrateur',
    typeAgent: 'Agent',
    typeTenant: 'Abonné',
    hLogin: 'Connexion',
    hLoginDesc: 'Entrez vos identifiants pour accéder à votre compte',
    hTwofa: 'Vérification en deux étapes',
    hTwofaDesc: "Entrez le code de votre application d'authentification",
    hForgot: 'Récupération du mot de passe',
    hForgotDesc: 'Entrez votre e-mail pour recevoir un code de réinitialisation',
    hReset: 'Nouveau mot de passe',
    hResetDesc: 'Entrez le code reçu et votre nouveau mot de passe',
    email: 'E-mail',
    password: 'Mot de passe',
    capsLock: 'Attention : Verr Maj activé',
    forgotLink: 'Mot de passe oublié ?',
    loginBtn: 'Se connecter',
    checking: 'Vérification...',
    twofaCode: 'Code de vérification',
    twofaHint: "Ouvrez votre application d'authentification (Google Authenticator ou similaire) et entrez le code à 6 chiffres",
    twofaBtn: 'Confirmer le code',
    verifying: 'Vérification...',
    backToLogin: 'Retour à la connexion',
    forgotHint: 'Nous vous enverrons un code à 6 chiffres (valide 15 minutes)',
    forgotBtn: 'Envoyer le code',
    sending: 'Envoi...',
    resetCode: 'Code de réinitialisation',
    newPassword: 'Nouveau mot de passe',
    newPasswordPh: '6 caractères minimum',
    newPassword2: 'Confirmer le mot de passe',
    newPassword2Ph: 'Retapez le mot de passe',
    resetBtn: 'Changer le mot de passe',
    changing: 'Modification...',
    supports: 'Le système prend en charge :',
    admins: 'Administrateurs',
    agents: 'Agents',
    tenants: 'Abonnés',
    noAccount: "Pas de compte ?",
    registerNow: "S'inscrire",
    backHome: "Retour à l'accueil",
    rights: 'Tous droits réservés',
    loginOk: 'Connexion réussie !',
    badCreds: 'Identifiants incorrects',
    connErr: 'Erreur de connexion : ',
    needCode: 'Entrez le code à 6 chiffres',
    badCode: 'Code de vérification incorrect',
    needEmail: 'Entrez votre e-mail',
    forgotSent: 'Si cet e-mail est enregistré, vous recevrez les instructions de réinitialisation.',
    needResetCode: 'Entrez le code de réinitialisation',
    shortPass: 'Le mot de passe doit contenir au moins 6 caractères',
    passMismatch: 'Les mots de passe ne correspondent pas',
    resetOk: 'Mot de passe modifié avec succès',
    resetFail: 'Impossible de changer le mot de passe',
    reloginHint: 'أعد تسجيل الدخول'
  }
};

export default function UnifiedLoginPage() {
  const navigate = useNavigate();
  const { language, toggleLanguage } = useLanguage();
  const T = STR[language === 'fr' ? 'fr' : 'ar'];
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
  const [twoFaMsg, setTwoFaMsg] = useState('');  // p154: server-side 2FA method message
  const [twoFaCode, setTwoFaCode] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [inlineError, setInlineError] = useState('');
  // p56: caps-lock warning on password fields
  const [capsLock, setCapsLock] = useState(false);

  useDocumentMeta({
    title: "تسجيل الدخول — NT Commerce",
    description: "ادخل إلى حسابك في NT Commerce — منصّة نقاط البيع والتجارة الإلكترونية الذكية للسوق الجزائري.",
    canonical: "https://nt-commerce.net/portal",
  });

  // p56: track Caps Lock state while typing in a password field
  const capsHandler = function(e) {
    if (e.getModifierState) {
      setCapsLock(e.getModifierState('CapsLock'));
    }
  };

  const capsWarning = capsLock ? (
    <p className="text-xs text-amber-600 flex items-center gap-1" data-testid="capslock-warning">
      <AlertTriangle className="h-3 w-3" />
      {T.capsLock}
    </p>
  ) : null;

  const completeLogin = function(result) {
    // p52: a fresh normal login must wipe any stale impersonation session,
    // otherwise the expired super_admin_token keeps hijacking /saas/* calls.
    localStorage.removeItem('super_admin_token');
    localStorage.removeItem('super_admin_user');
    localStorage.removeItem('is_impersonating');
    localStorage.removeItem('impersonation_session_id');
    localStorage.setItem('token', result.access_token);
    localStorage.setItem('user', JSON.stringify(result.user));
    toast.success(T.loginOk);
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
        setTwoFaMsg(result.message || '');
        setTwoFaCode('');
        setView('twofa');
        setLoading(false);
        return;
      }
      if (result && result.access_token) {
        completeLogin(result);
      } else {
        var msg = errText(result) || T.badCreds;
        // p53: show lockout / credential errors inline, not only as a toast
        setInlineError(msg);
        toast.error(msg);
        setLoading(false);
      }
    })
    .catch(function(err) {
      toast.error(T.connErr + err.message);
      setLoading(false);
    });
  };

  const handleTwoFaSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!twoFaCode.trim()) { setInlineError(T.needCode); return; }
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
        var msg = errText(result) || T.badCode;
        setInlineError(msg);
        if (r.status === 401 && msg.indexOf(T.reloginHint) !== -1) {
          // pending token expired / exhausted — back to the password step
          setTimeout(function() { setView('login'); setPendingToken(''); }, 1200);
        }
        setLoading(false);
      }
    })
    .catch(function(err) {
      toast.error(T.connErr + err.message);
      setLoading(false);
    });
  };

  const handleForgotSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    var emailEl = document.getElementById('forgot-email');
    var email = emailEl ? emailEl.value.trim() : forgotEmail.trim();
    if (!email) { setInlineError(T.needEmail); return; }
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
      toast.success((result && result.message) || T.forgotSent);
      setLoading(false);
    })
    .catch(function(err) {
      toast.error(T.connErr + err.message);
      setLoading(false);
    });
  };

  const handleResetSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setInlineError('');
    if (!resetCode.trim()) { setInlineError(T.needResetCode); return; }
    if (newPassword.length < 6) { setInlineError(T.shortPass); return; }
    if (newPassword !== newPassword2) { setInlineError(T.passMismatch); return; }
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
        toast.success((r.body && r.body.message) || T.resetOk);
        setView('login');
        setLoading(false);
      } else {
        setInlineError(errText(r.body) || T.resetFail);
        setLoading(false);
      }
    })
    .catch(function(err) {
      toast.error(T.connErr + err.message);
      setLoading(false);
    });
  };

  const getUserTypeInfo = (type) => {
    const types = {
      admin: { icon: Shield, label: T.typeAdmin, color: 'text-blue-600', bg: 'bg-blue-100' },
      agent: { icon: Truck, label: T.typeAgent, color: 'text-purple-600', bg: 'bg-purple-100' },
      tenant: { icon: Store, label: T.typeTenant, color: 'text-green-600', bg: 'bg-green-100' }
    };
    return types[type] || types.admin;
  };

  const headerFor = {
    login: { title: T.hLogin, desc: T.hLoginDesc, icon: LogIn },
    twofa: { title: T.hTwofa, desc: T.hTwofaDesc, icon: KeyRound },
    forgot: { title: T.hForgot, desc: T.hForgotDesc, icon: Mail },
    reset: { title: T.hReset, desc: T.hResetDesc, icon: KeyRound }
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
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2v-4h4v-2H6z%22%2F%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50"></div>

      {/* p56: AR/FR language switcher */}
      <button
        type="button"
        onClick={toggleLanguage}
        className="absolute top-4 right-4 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white backdrop-blur hover:bg-white/20"
        data-testid="login-lang-toggle"
      >
        <Globe className="h-4 w-4" />
        {language === 'ar' ? 'FR' : 'عر'}
      </button>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="h-14 w-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <Building2 className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">NT Commerce</h1>
          <p className="text-blue-200">{T.tagline}</p>
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
                <h3 className="text-lg font-semibold mb-2">{T.welcome} {loginSuccess.name}!</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {T.successAs} {getUserTypeInfo(loginSuccess.type).label}
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {T.redirecting}
                </div>
              </div>
            ) : view === 'twofa' ? (
              <div className="space-y-4">
                {inlineErrorBox}
                <div className="space-y-2">
                  <Label>{T.twofaCode}</Label>
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
                    {twoFaMsg || T.twofaHint}
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
                      {T.verifying}
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-5 w-5" />
                      {T.twofaBtn}
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
                    {T.backToLogin}
                  </button>
                </div>
              </div>
            ) : view === 'forgot' ? (
              <div className="space-y-4">
                {inlineErrorBox}
                <div className="space-y-2">
                  <Label>{T.email}</Label>
                  <Input
                    type="email" name="forgot-email" id="forgot-email" defaultValue={forgotEmail}
                    placeholder="name@example.com"
                    onKeyDown={function(e) { if (e.key === 'Enter') handleForgotSubmit(e); }}
                    className="h-11 text-black bg-white font-medium"
                    data-testid="forgot-email-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    {T.forgotHint}
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
                      {T.sending}
                    </>
                  ) : (
                    <>
                      <Mail className="h-5 w-5" />
                      {T.forgotBtn}
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
                    {T.backToLogin}
                  </button>
                </div>
              </div>
            ) : view === 'reset' ? (
              <div className="space-y-4">
                {inlineErrorBox}
                <div className="space-y-2">
                  <Label>{T.resetCode}</Label>
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
                  <Label>{T.newPassword}</Label>
                  <Input
                    type="password" id="reset-password" value={newPassword}
                    onChange={function(e) { setNewPassword(e.target.value); }}
                    onKeyDown={capsHandler}
                    onKeyUp={capsHandler}
                    placeholder={T.newPasswordPh}
                    className="h-11 text-black bg-white font-medium"
                    data-testid="reset-password-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{T.newPassword2}</Label>
                  <Input
                    type="password" id="reset-password2" value={newPassword2}
                    onChange={function(e) { setNewPassword2(e.target.value); }}
                    onKeyDown={function(e) { capsHandler(e); if (e.key === 'Enter') handleResetSubmit(e); }}
                    onKeyUp={capsHandler}
                    placeholder={T.newPassword2Ph}
                    className="h-11 text-black bg-white font-medium"
                    data-testid="reset-password2-input"
                  />
                  {capsWarning}
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
                      {T.changing}
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-5 w-5" />
                      {T.resetBtn}
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
                    {T.backToLogin}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {inlineErrorBox}
                <div className="space-y-2">
                  <Label>{T.email}</Label>
                  <Input
                    type="email" name="email" id="login-email" defaultValue=""
                    placeholder="name@example.com"
                    required
                    className="h-11 text-black bg-white font-medium"
                    data-testid="unified-email-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{T.password}</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'} name="password" id='login-password' defaultValue=""
                      placeholder="••••••••"
                      onKeyDown={function(e) { capsHandler(e); if (e.key === 'Enter') handleSubmit(e); }}
                      onKeyUp={capsHandler}
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
                  {capsWarning}
                  <div className="text-left">
                    <button
                      type="button"
                      onClick={function() { setForgotEmail(''); setInlineError(''); setView('forgot'); }}
                      className="text-xs text-primary hover:underline"
                      data-testid="forgot-password-link"
                    >
                      {T.forgotLink}
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
                      {T.checking}
                    </>
                  ) : (
                    <>
                      <LogIn className="h-5 w-5" />
                      {T.loginBtn}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* User Types Info */}
            <div className="mt-6 pt-6 border-t">
              <p className="text-xs text-center text-muted-foreground mb-3">
                {T.supports}
              </p>
              <div className="flex justify-center gap-4">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3 text-blue-500" />
                  <span>{T.admins}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Truck className="h-3 w-3 text-purple-500" />
                  <span>{T.agents}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Store className="h-3 w-3 text-green-500" />
                  <span>{T.tenants}</span>
                </div>
              </div>
            </div>

            {/* Register Link */}
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                {T.noAccount}{' '}
                <button
                  onClick={() => navigate('/register')}
                  className="text-primary hover:underline font-medium"
                >
                  {T.registerNow}
                </button>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* p56: dynamic year + back-to-home link */}
        <p className="text-center text-xs text-blue-200/60 mt-6">
          © {new Date().getFullYear()} NT Commerce - {T.rights}
        </p>
        <p className="text-center mt-2">
          <button
            type="button"
            onClick={function() { navigate('/'); }}
            className="text-xs text-blue-200/80 hover:text-white inline-flex items-center gap-1"
            data-testid="back-home-link"
          >
            <Home className="h-3 w-3" />
            {T.backHome}
          </button>
        </p>
      </div>
    </div>
  );
}
