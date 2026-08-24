// p293 — دخول عمال المتجر الإلكتروني: هاتف + رمز PIN (مساحة محدودة — صندوق الطلبات فقط)
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { Phone, KeyRound, Headset } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function WorkerLoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const login = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/ecom-workers/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'فشل الدخول');
      localStorage.setItem('ecom_worker_token', data.token);
      localStorage.setItem('ecom_worker', JSON.stringify(data.worker));
      navigate('/worker');
    } catch (err) {
      setError(err.message || 'بيانات الدخول غير صحيحة');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-slate-900 dark:to-slate-800 p-4" dir="rtl" data-testid="worker-login-page">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
            <Headset className="w-7 h-7 text-emerald-700" />
          </div>
          <CardTitle>{'دخول عمال المتجر'}</CardTitle>
          <p className="text-xs text-muted-foreground">{'مساحة تأكيد الطلبات — للعاملين فقط'}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={login} className="space-y-4">
            <div className="space-y-1">
              <Label>{'رقم الهاتف'}</Label>
              <div className="relative">
                <Phone className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input dir="ltr" className="pr-9" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0550 00 00 00" data-testid="worker-login-phone" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{'رمز الدخول PIN'}</Label>
              <div className="relative">
                <KeyRound className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input dir="ltr" className="pr-9" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" data-testid="worker-login-pin" />
              </div>
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2" data-testid="worker-login-error">{error}</div>}
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={busy} data-testid="worker-login-submit">
              {busy ? 'جارٍ الدخول…' : 'دخول'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
