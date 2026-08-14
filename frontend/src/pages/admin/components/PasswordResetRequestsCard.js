import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { toast } from 'sonner';
import { KeyRound, RefreshCw, Copy, MailWarning } from 'lucide-react';

// p53: pending password-reset requests — visible to the super admin so reset
// codes can be relayed manually while the email provider is in mock mode.
export const PasswordResetRequestsCard = () => {
  const [items, setItems] = useState([]);
  const [provider, setProvider] = useState('mock');
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await apiClient.get('/auth/password-reset-requests');
      setItems(res.data.items || []);
      setProvider(res.data.email_provider || 'mock');
    } catch (err) {
      console.error('password-reset-requests fetch failed:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 30000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  const pending = items.filter((r) => !r.used && !r.expired);

  // No pending requests → render nothing (keeps the alerts tab unchanged).
  if (!loading && pending.length === 0) return null;

  const copyCode = (code) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => toast.success('تم نسخ الرمز'));
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50" data-testid="password-reset-requests-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-600" />
          طلبات إعادة تعيين كلمة المرور
          <Badge variant="secondary" className="bg-amber-100 text-amber-800">{pending.length}</Badge>
          <Button variant="ghost" size="sm" className="ms-auto h-7 px-2" onClick={fetchRequests}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardTitle>
        {provider === 'mock' && (
          <p className="text-xs text-amber-700 flex items-center gap-1 mt-1">
            <MailWarning className="h-3.5 w-3.5" />
            البريد في الوضع التجريبي — سلّم الرمز للمستخدم يدوياً (هاتف/واتساب)
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {pending.map((r) => (
          <div key={r.email + r.created_at} className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate" dir="ltr">{r.email}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString('ar-DZ')}
              </p>
            </div>
            {r.code && (
              <div className="flex items-center gap-1">
                <code className="text-lg font-bold tracking-widest" dir="ltr" data-testid="reset-code-value">{r.code}</code>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => copyCode(r.code)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default PasswordResetRequestsCard;
