// p156: standalone email verification page (recovery path for unverified subscribers)
import { errText } from '../../lib/errorText';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { useDocumentMeta } from '../../hooks/useDocumentMeta';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  useDocumentMeta({
    title: "تأكيد البريد الإلكتروني — NT Commerce",
    description: "أدخل رمز التحقق المرسل إلى بريدك لتفعيل حسابك في NT Commerce.",
    canonical: "https://nt-commerce.net/verify-email",
  });

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.trim().length !== 6) {
      toast.error('أدخل الرمز المكوّن من 6 أرقام');
      return;
    }
    setVerifying(true);
    try {
      await apiClient.post(`/saas/verify-email`, { email: email.trim(), code: code.trim() });
      toast.success('تم تأكيد بريدك الإلكتروني بنجاح! يمكنك الآن تسجيل الدخول');
      navigate('/tenant-login');
    } catch (error) {
      toast.error(errText(error) || 'رمز التحقق غير صحيح');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) {
      toast.error('أدخل بريدك الإلكتروني أولاً');
      return;
    }
    setResending(true);
    try {
      await apiClient.post(`/saas/resend-verification`, { email: email.trim() });
      toast.success('إن كان الحساب بانتظار التأكيد فقد أرسلنا رمزاً جديداً');
    } catch (error) {
      toast.error(errText(error) || 'تعذّر إرسال الرمز');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50" dir="rtl" data-testid="verify-email-page">
      <div className="bg-white/80 backdrop-blur-lg border-b">
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
            <Button variant="ghost">تسجيل الدخول</Button>
          </Link>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-12">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="w-14 h-14 mx-auto mb-3 bg-blue-100 rounded-full flex items-center justify-center">
              <Mail className="h-7 w-7 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">تأكيد بريدك الإلكتروني</CardTitle>
            <CardDescription>أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى بريدك عند التسجيل</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ve_email">البريد الإلكتروني *</Label>
                <Input
                  id="ve_email"
                  data-testid="verify-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  dir="ltr"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ve_code">رمز التحقق *</Label>
                <Input
                  id="ve_code"
                  data-testid="verify-code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.5em] font-bold"
                  dir="ltr"
                  maxLength={6}
                  required
                />
              </div>
              <Button
                type="submit"
                data-testid="verify-submit-btn"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600"
                disabled={verifying}
              >
                {verifying ? 'جاري التحقق...' : 'تأكيد البريد'}
              </Button>
              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  data-testid="verify-resend-btn"
                  onClick={handleResend}
                  disabled={resending}
                >
                  {resending ? 'جاري الإرسال...' : 'لم يصلك الرمز؟ أعد الإرسال'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
