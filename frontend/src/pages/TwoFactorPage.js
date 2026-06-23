import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { Shield, Key, Copy, CheckCircle2, XCircle, Smartphone } from 'lucide-react';

export default function TwoFactorPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [status, setStatus] = useState(null);
  const [setupData, setSetupData] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('check'); // check, setup, verify, enabled

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const checkStatus = async () => {
    try {
      const res = await apiClient.get(`/2fa/status`, { headers });
      setStatus(res.data);
      setStep(res.data.is_enabled ? 'enabled' : 'check');
    } catch (e) {
      setStatus({ is_enabled: false });
      setStep('check');
    }
    setLoading(false);
  };

  useEffect(() => { checkStatus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startSetup = async () => {
    try {
      const res = await apiClient.post(`/2fa/setup`, {}, { headers });
      setSetupData(res.data);
      setStep('setup');
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const verifySetup = async () => {
    if (verifyCode.length !== 6) return toast.error(isAr ? 'الكود يجب أن يكون 6 أرقام' : 'Le code doit être de 6 chiffres');
    try {
      const res = await apiClient.post(`/2fa/verify`, { code: verifyCode }, { headers });
      toast.success(isAr ? 'تم تفعيل المصادقة الثنائية' : '2FA activé avec succès');
      setStep('enabled');
      checkStatus();
    } catch (e) { toast.error(e.response?.data?.detail || (isAr ? 'الكود غير صحيح' : 'Code incorrect')); }
  };

  const disable2FA = async () => {
    if (disableCode.length !== 6) return toast.error(isAr ? 'الكود يجب أن يكون 6 أرقام' : 'Le code doit être de 6 chiffres');
    try {
      await apiClient.post(`/2fa/disable`, { code: disableCode }, { headers });
      toast.success(isAr ? 'تم تعطيل المصادقة الثنائية' : '2FA désactivé');
      setStep('check');
      setStatus({ is_enabled: false });
      setDisableCode('');
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success(isAr ? 'تم النسخ' : 'Copié');
  };

  if (loading) return <Layout><div className="p-6 text-gray-400 text-center">{isAr ? 'جاري التحميل...' : 'Chargement...'}</div></Layout>;

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6" data-testid="two-factor-page">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">{isAr ? 'المصادقة الثنائية (2FA)' : 'Authentification à deux facteurs'}</h1>
            <p className="text-sm text-gray-400">{isAr ? 'طبقة حماية إضافية لحسابك' : 'Protection supplémentaire pour votre compte'}</p>
          </div>
        </div>

        {/* Status Card */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {status?.is_enabled ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> : <XCircle className="w-6 h-6 text-gray-500" />}
                <div>
                  <p className="text-white font-medium">{isAr ? 'حالة المصادقة الثنائية' : 'Statut 2FA'}</p>
                  <p className="text-sm text-gray-400">{status?.is_enabled ? (isAr ? 'مفعلة ونشطة' : 'Activé et actif') : (isAr ? 'غير مفعلة' : 'Non activé')}</p>
                </div>
              </div>
              <Badge className={status?.is_enabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-gray-500/10 text-gray-400 border-gray-500/30'}>
                {status?.is_enabled ? (isAr ? 'مفعل' : 'Activé') : (isAr ? 'معطل' : 'Désactivé')}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Setup Flow */}
        {step === 'check' && !status?.is_enabled && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader><CardTitle className="text-white text-lg">{isAr ? 'تفعيل المصادقة الثنائية' : 'Activer 2FA'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div className="flex gap-3">
                  <Smartphone className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-300">
                    <p className="font-medium mb-1">{isAr ? 'ستحتاج إلى تطبيق مصادقة' : 'Vous aurez besoin d\'une app d\'authentification'}</p>
                    <p className="text-blue-400/70">{isAr ? 'مثل Google Authenticator أو Authy أو Microsoft Authenticator' : 'Comme Google Authenticator, Authy ou Microsoft Authenticator'}</p>
                  </div>
                </div>
              </div>
              <Button onClick={startSetup} className="w-full gap-2" data-testid="start-2fa-setup">
                <Key className="w-4 h-4" />{isAr ? 'بدء الإعداد' : 'Commencer la configuration'}
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'setup' && setupData && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader><CardTitle className="text-white text-lg">{isAr ? 'إعداد المصادقة الثنائية' : 'Configuration 2FA'}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              {/* QR Code would be here - show secret key instead */}
              <div className="space-y-2">
                <p className="text-sm text-gray-400">{isAr ? 'المفتاح السري (أدخله يدوياً في التطبيق)' : 'Clé secrète (saisie manuelle)'}</p>
                <div className="flex gap-2">
                  <Input value={setupData.secret || ''} readOnly className="bg-gray-900 border-gray-600 text-white font-mono text-center tracking-widest" data-testid="secret-key-display" />
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(setupData.secret)} className="border-gray-600"><Copy className="w-4 h-4" /></Button>
                </div>
              </div>

              {/* Backup Codes */}
              {setupData.backup_codes && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-400">{isAr ? 'أكواد الاسترداد (احفظها في مكان آمن)' : 'Codes de récupération (à conserver)'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {setupData.backup_codes.map((code, i) => (
                      <div key={`item-${i}`} className="bg-gray-900 border border-gray-600 rounded px-3 py-1 text-sm text-white font-mono text-center">{code}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verify */}
              <div className="space-y-2">
                <p className="text-sm text-gray-400">{isAr ? 'أدخل الكود من التطبيق للتأكيد' : 'Entrez le code de l\'app pour confirmer'}</p>
                <div className="flex gap-2">
                  <Input type="text" maxLength={6} placeholder="000000" value={verifyCode} onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))} className="bg-gray-900 border-gray-600 text-white font-mono text-center text-2xl tracking-[0.5em]" data-testid="verify-code-input" onKeyDown={e => e.key === 'Enter' && verifySetup()} />
                  <Button onClick={verifySetup} data-testid="verify-2fa-btn">{isAr ? 'تأكيد' : 'Confirmer'}</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'enabled' && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader><CardTitle className="text-white text-lg">{isAr ? 'تعطيل المصادقة الثنائية' : 'Désactiver 2FA'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-sm text-red-300">{isAr ? 'تحذير: تعطيل المصادقة الثنائية سيقلل من أمان حسابك' : 'Attention: Désactiver le 2FA réduira la sécurité de votre compte'}</p>
              </div>
              <div className="flex gap-2">
                <Input type="text" maxLength={6} placeholder="000000" value={disableCode} onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))} className="bg-gray-900 border-gray-600 text-white font-mono text-center text-xl tracking-[0.5em]" data-testid="disable-code-input" />
                <Button variant="destructive" onClick={disable2FA} data-testid="disable-2fa-btn">{isAr ? 'تعطيل' : 'Désactiver'}</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
