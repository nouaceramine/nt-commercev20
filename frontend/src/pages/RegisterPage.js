import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { Shield, Globe, Eye, EyeOff } from 'lucide-react';

export default function RegisterPage() {
  const { t, language, toggleLanguage, isRTL } = useLanguage();
  const { register } = useAuth();
  const navigate = useNavigate();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await register(email, password, name, isAdmin ? 'admin' : 'user');
      toast.success(t.createAccount);
      navigate('/');
    } catch (error) {
      console.error('Register error:', error);
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Left Side - Hero Image */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900">
        <img
          src="https://images.unsplash.com/photo-1758631279366-8e8aeaf94082?crop=entropy&cs=srgb&fm=jpg&q=85"
          alt="Modern Mobile Shop"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/50 to-transparent" />
        <div className="relative z-10 flex flex-col justify-end p-12 text-white">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-10 w-10 text-primary" />
            <span className="text-3xl font-bold">{t.appName}</span>
          </div>
          <h2 className="text-4xl font-bold mb-4">
            {isRTL ? 'ابدأ إدارة منتجاتك اليوم' : 'Start Managing Your Products Today'}
          </h2>
          <p className="text-lg text-slate-300">
            {isRTL 
              ? 'أنشئ حسابك وابدأ في إضافة منتجات زجاج الحماية وتتبع المخزون'
              : 'Create your account and start adding screen protector products and tracking inventory'}
          </p>
        </div>
      </div>

      {/* Right Side - Register Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Language Toggle */}
          <div className="flex justify-end mb-8">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              data-testid="register-lang-toggle"
            >
              <Globe className="h-4 w-4" />
              <span className="text-sm font-medium">
                {language === 'fr' ? 'عربي' : 'Français'}
              </span>
            </button>
          </div>

          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <Shield className="h-10 w-10 text-primary" />
            <span className="text-2xl font-bold">{t.appName}</span>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl font-bold">{t.createAccount}</CardTitle>
              <CardDescription>{t.registerSubtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name">{t.name}</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder={isRTL ? 'أدخل اسمك' : 'Enter your name'}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-12"
                    data-testid="register-name-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t.email}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12"
                    data-testid="register-email-input"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">{t.password}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className={`h-12 ${isRTL ? 'pl-12' : 'pr-12'}`}
                      data-testid="register-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={`absolute top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground ${isRTL ? 'left-2' : 'right-2'}`}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Checkbox
                    id="isAdmin"
                    checked={isAdmin}
                    onCheckedChange={setIsAdmin}
                    data-testid="register-admin-checkbox"
                  />
                  <Label htmlFor="isAdmin" className="text-sm cursor-pointer">
                    {t.registerAsAdmin}
                  </Label>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-semibold"
                  disabled={loading}
                  data-testid="register-submit-btn"
                >
                  {loading ? t.loading : t.register}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {t.hasAccount}{' '}
                  <Link 
                    to="/login" 
                    className="text-primary font-medium hover:underline"
                    data-testid="go-to-login"
                  >
                    {t.login}
                  </Link>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
