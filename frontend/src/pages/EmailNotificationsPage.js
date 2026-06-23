import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { toast } from 'sonner';
import { 
  Mail, 
  Bell, 
  Save, 
  RefreshCw, 
  Send, 
  ShoppingCart, 
  Package, 
  FileText,
  Calendar,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

export default function EmailNotificationsPage() {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const [checkingStock, setCheckingStock] = useState(false);
  
  const [settings, setSettings] = useState({
    enabled: false,
    api_key: '',
    sender_email: '',
    sender_name: 'NT Commerce',
    new_sale_notification: true,
    low_stock_notification: true,
    daily_report: false,
    weekly_report: false,
    notification_email: ''
  });

  useEffect(() => {
    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/notifications/sendgrid/settings`);
      setSettings(prev => ({ ...prev, ...response.data }));
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/notifications/sendgrid/settings`, settings);
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات بنجاح' : 'Settings saved successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'فشل الحفظ' : 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.post(`/notifications/sendgrid/test`, {});
      toast.success(response.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'فشل الاختبار' : 'Test failed'));
    } finally {
      setTesting(false);
    }
  };

  const handleSendDailyReport = async () => {
    setSendingReport(true);
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.post(`/notifications/send-daily-report`, {});
      toast.success(response.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'فشل الإرسال' : 'Failed to send'));
    } finally {
      setSendingReport(false);
    }
  };

  const handleCheckLowStock = async () => {
    setCheckingStock(true);
    try {
      const response = await apiClient.post(`/notifications/check-low-stock`, {});
      toast.success(response.data.message);
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'فشل الفحص' : 'Check failed'));
    } finally {
      setCheckingStock(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            {language === 'ar' ? 'إشعارات البريد الإلكتروني' : 'Email Notifications'}
          </h1>
          <p className="text-muted-foreground">
            {language === 'ar' 
              ? 'إعداد إشعارات البريد الإلكتروني التلقائية للمبيعات والمخزون والتقارير' 
              : 'Configure automatic email notifications for sales, inventory, and reports'}
          </p>
        </div>

        {/* SendGrid Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              {language === 'ar' ? 'إعدادات SendGrid' : 'SendGrid Settings'}
            </CardTitle>
            <CardDescription>
              {language === 'ar' 
                ? 'قم بإعداد حساب SendGrid لإرسال الإشعارات التلقائية'
                : 'Configure your SendGrid account for automated notifications'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${settings.enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <Mail className={`h-5 w-5 ${settings.enabled ? 'text-green-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className="font-medium">{language === 'ar' ? 'تفعيل الإشعارات' : 'Enable Notifications'}</p>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'إرسال إشعارات تلقائية عبر البريد' : 'Send automatic email notifications'}
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enabled: checked }))}
              />
            </div>

            {settings.enabled && (
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'مفتاح SendGrid API' : 'SendGrid API Key'}</Label>
                    <Input
                      type="password"
                      placeholder="SG.xxxxxx..."
                      value={settings.api_key}
                      onChange={(e) => setSettings(prev => ({ ...prev, api_key: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      {language === 'ar' 
                        ? 'احصل عليه من sendgrid.com → Settings → API Keys'
                        : 'Get it from sendgrid.com → Settings → API Keys'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'بريد المرسل' : 'Sender Email'}</Label>
                    <Input
                      type="email"
                      placeholder="noreply@yourdomain.com"
                      value={settings.sender_email}
                      onChange={(e) => setSettings(prev => ({ ...prev, sender_email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'اسم المرسل' : 'Sender Name'}</Label>
                    <Input
                      value={settings.sender_name}
                      onChange={(e) => setSettings(prev => ({ ...prev, sender_name: e.target.value }))}
                      placeholder="NT Commerce"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'بريد استلام الإشعارات' : 'Notification Email'}</Label>
                    <Input
                      type="email"
                      placeholder="admin@yourdomain.com"
                      value={settings.notification_email}
                      onChange={(e) => setSettings(prev => ({ ...prev, notification_email: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Test Button */}
                <Button 
                  variant="outline" 
                  onClick={handleTest} 
                  disabled={testing || !settings.api_key}
                  className="gap-2"
                >
                  {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {language === 'ar' ? 'إرسال بريد اختباري' : 'Send Test Email'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notification Types */}
        {settings.enabled && (
          <Card>
            <CardHeader>
              <CardTitle>{language === 'ar' ? 'أنواع الإشعارات' : 'Notification Types'}</CardTitle>
              <CardDescription>
                {language === 'ar' ? 'اختر الإشعارات التي تريد استلامها' : 'Choose which notifications you want to receive'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* New Sale Notification */}
              <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-green-100">
                    <ShoppingCart className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">{language === 'ar' ? 'إشعارات المبيعات الجديدة' : 'New Sale Notifications'}</p>
                    <p className="text-sm text-muted-foreground">
                      {language === 'ar' ? 'استلم إشعاراً عند كل عملية بيع جديدة' : 'Get notified for every new sale'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.new_sale_notification}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, new_sale_notification: checked }))}
                />
              </div>

              {/* Low Stock Notification */}
              <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-amber-100">
                    <Package className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium">{language === 'ar' ? 'تنبيهات انخفاض المخزون' : 'Low Stock Alerts'}</p>
                    <p className="text-sm text-muted-foreground">
                      {language === 'ar' ? 'استلم تنبيهاً عند انخفاض مخزون المنتجات' : 'Get alerted when products are running low'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.low_stock_notification}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, low_stock_notification: checked }))}
                />
              </div>

              {/* Daily Report */}
              <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-100">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium">{language === 'ar' ? 'التقرير اليومي' : 'Daily Report'}</p>
                    <p className="text-sm text-muted-foreground">
                      {language === 'ar' ? 'استلم ملخصاً يومياً للمبيعات والأرباح' : 'Receive a daily summary of sales and profits'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.daily_report}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, daily_report: checked }))}
                />
              </div>

              {/* Weekly Report */}
              <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-purple-100">
                    <Calendar className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium">{language === 'ar' ? 'التقرير الأسبوعي' : 'Weekly Report'}</p>
                    <p className="text-sm text-muted-foreground">
                      {language === 'ar' ? 'استلم ملخصاً أسبوعياً شاملاً' : 'Receive a comprehensive weekly summary'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={settings.weekly_report}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, weekly_report: checked }))}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        {settings.enabled && settings.notification_email && (
          <Card>
            <CardHeader>
              <CardTitle>{language === 'ar' ? 'إجراءات سريعة' : 'Quick Actions'}</CardTitle>
              <CardDescription>
                {language === 'ar' ? 'إرسال إشعارات يدوية الآن' : 'Send manual notifications now'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <Button 
                variant="outline" 
                onClick={handleSendDailyReport}
                disabled={sendingReport}
                className="gap-2"
              >
                {sendingReport ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {language === 'ar' ? 'إرسال التقرير اليومي' : 'Send Daily Report'}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={handleCheckLowStock}
                disabled={checkingStock}
                className="gap-2"
              >
                {checkingStock ? <RefreshCw className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                {language === 'ar' ? 'فحص المخزون المنخفض' : 'Check Low Stock'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {language === 'ar' ? 'حفظ الإعدادات' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
