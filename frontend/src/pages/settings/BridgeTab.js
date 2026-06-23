import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { Wifi, WifiOff, Save, RefreshCw, Server, Key } from 'lucide-react';

export default function BridgeTab() {
  const [bridgeUrl, setBridgeUrl] = useState('');
  const [bridgeSecret, setBridgeSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBridgeSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadBridgeSettings = async () => {
    try {
      const res = await apiClient.get('/settings/bridge-config');
      setBridgeUrl(res.data.self_bridge_url || '');
      setBridgeSecret(res.data.self_bridge_api_key || '');
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await apiClient.put('/settings/bridge-config', {
        self_bridge_url: bridgeUrl,
        self_bridge_api_key: bridgeSecret,
      });
      toast.success('تم حفظ إعدادات الجسر');
      setTestResult(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطأ في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiClient.post('/settings/test-bridge');
      setTestResult(res.data);
      if (res.data.ok) {
        toast.success('الجسر متصل ويعمل بشكل صحيح');
      } else {
        toast.error('الجسر غير متاح');
      }
    } catch (err) {
      setTestResult({ ok: false, error: err.response?.data?.detail || err.message });
      toast.error('فشل اختبار الاتصال');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-32"><div className="spinner" /></div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            إعداد الجسر المحلي
          </CardTitle>
          <CardDescription>
            أدخل رابط الجسر المحلي الذي يعمل على جهازك لإجراء عمليات الشحن عبر شرائح SIM الخاصة بك.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Server className="h-3.5 w-3.5" />
              رابط الجسر (Bridge URL)
            </Label>
            <Input
              dir="ltr"
              placeholder="http://localhost:5050"
              value={bridgeUrl}
              onChange={e => setBridgeUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              الرابط المحلي الذي يعمل عليه تطبيق الجسر على جهازك (مثال: http://localhost:5050)
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Key className="h-3.5 w-3.5" />
              مفتاح الجسر السري (Bridge Secret)
            </Label>
            <Input
              dir="ltr"
              type="password"
              placeholder="أدخل المفتاح السري للجسر"
              value={bridgeSecret}
              onChange={e => setBridgeSecret(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              المفتاح السري الموجود في إعدادات تطبيق الجسر المحلي
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={saveSettings} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ الإعدادات
            </Button>
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={testing || !bridgeUrl}
              className="gap-2"
            >
              {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              اختبار الاتصال
            </Button>
          </div>

          {testResult !== null && (
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${
              testResult.ok
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {testResult.ok ? (
                <Wifi className="h-5 w-5 text-green-600 shrink-0" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-600 shrink-0" />
              )}
              <div>
                <p className="font-medium text-sm">
                  {testResult.ok ? 'الجسر متصل ويعمل' : 'تعذّر الاتصال بالجسر'}
                </p>
                {testResult.error && (
                  <p className="text-xs mt-0.5 opacity-80" dir="ltr">{testResult.error}</p>
                )}
                {testResult.status_code && (
                  <Badge variant="outline" className="text-xs mt-1">
                    HTTP {testResult.status_code}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <p className="text-sm text-amber-800 font-medium mb-1">⚠️ ملاحظة هامة</p>
          <p className="text-sm text-amber-700">
            يجب أن يعمل تطبيق الجسر المحلي على جهازك قبل إجراء أي عملية شحن.
            إذا كان الجسر متوقفاً، ستُرفض عمليات الشحن تلقائياً. تواصل مع مدير النظام إذا واجهت أي مشكلة.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
