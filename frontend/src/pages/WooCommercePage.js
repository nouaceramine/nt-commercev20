import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import { 
  ShoppingBag, 
  Settings, 
  RefreshCw, 
  Check, 
  X,
  Link,
  Package,
  Users,
  FileText,
  Globe,
  Key,
  Save
} from 'lucide-react';

export default function WooCommercePage() {
  const { t, language } = useLanguage();
  
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    enabled: false,
    store_url: '',
    consumer_key: '',
    consumer_secret: '',
    sync_products: true,
    sync_orders: true,
    sync_customers: true,
    last_sync: ''
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSettings = async () => {
    try {
      const response = await apiClient.get(`/woocommerce/settings`);
      setSettings(response.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/woocommerce/settings`, settings);
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات' : 'Paramètres enregistrés');
    } catch (error) {
      toast.error(t.error);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const response = await apiClient.post(`/woocommerce/test-connection`);
      setConnectionStatus(response.data);
      toast.success(language === 'ar' ? 'تم الاتصال بنجاح' : 'Connexion réussie');
    } catch (error) {
      setConnectionStatus({ success: false, message: error.response?.data?.detail });
      toast.error(error.response?.data?.detail || t.error);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="woocommerce-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <ShoppingBag className="h-8 w-8 text-purple-600" />
              WooCommerce
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'ربط متجرك الإلكتروني مع النظام' : 'Connecter votre boutique en ligne'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={testConnection} variant="outline" disabled={testing || !settings.store_url}>
              {testing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
              <span className="ms-2">{language === 'ar' ? 'اختبار الاتصال' : 'Tester connexion'}</span>
            </Button>
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ms-2">{t.save}</span>
            </Button>
          </div>
        </div>

        <Tabs defaultValue="settings">
          <TabsList>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              {language === 'ar' ? 'الإعدادات' : 'Paramètres'}
            </TabsTrigger>
            <TabsTrigger value="sync" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {language === 'ar' ? 'المزامنة' : 'Synchronisation'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-6 mt-6">
            {/* Enable Integration */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-purple-100">
                      <ShoppingBag className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium">{language === 'ar' ? 'تفعيل التكامل' : 'Activer l\'intégration'}</p>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'ربط المنتجات والطلبات تلقائياً' : 'Synchroniser produits et commandes'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enabled: checked }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* API Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  {language === 'ar' ? 'إعدادات API' : 'Paramètres API'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar' 
                    ? 'احصل على المفاتيح من WooCommerce > الإعدادات > متقدم > REST API' 
                    : 'Obtenez les clés depuis WooCommerce > Réglages > Avancé > REST API'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>{language === 'ar' ? 'رابط المتجر' : 'URL du magasin'}</Label>
                  <div className="flex gap-2 mt-1">
                    <Globe className="h-5 w-5 text-muted-foreground mt-2" />
                    <Input
                      value={settings.store_url}
                      onChange={(e) => setSettings(prev => ({ ...prev, store_url: e.target.value }))}
                      placeholder="https://your-store.com"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Consumer Key</Label>
                    <Input
                      value={settings.consumer_key}
                      onChange={(e) => setSettings(prev => ({ ...prev, consumer_key: e.target.value }))}
                      placeholder="ck_xxxxxxxx"
                      dir="ltr"
                      className="mt-1 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label>Consumer Secret</Label>
                    <Input
                      type="password"
                      value={settings.consumer_secret}
                      onChange={(e) => setSettings(prev => ({ ...prev, consumer_secret: e.target.value }))}
                      placeholder="cs_xxxxxxxx"
                      dir="ltr"
                      className="mt-1 font-mono text-sm"
                    />
                  </div>
                </div>

                {connectionStatus && (
                  <div className={`p-4 rounded-lg ${connectionStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    <div className="flex items-center gap-2">
                      {connectionStatus.success ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                      <span className="font-medium">{connectionStatus.message}</span>
                    </div>
                    {connectionStatus.store_info && (
                      <p className="text-sm mt-2">
                        {connectionStatus.store_info.name} - v{connectionStatus.store_info.version}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sync" className="space-y-6 mt-6">
            {/* Sync Options */}
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'خيارات المزامنة' : 'Options de synchronisation'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-medium">{language === 'ar' ? 'المنتجات' : 'Produits'}</p>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'مزامنة المنتجات والمخزون' : 'Synchroniser produits et stock'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.sync_products}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, sync_products: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium">{language === 'ar' ? 'الطلبات' : 'Commandes'}</p>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'استيراد الطلبات الجديدة' : 'Importer nouvelles commandes'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.sync_orders}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, sync_orders: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-purple-600" />
                    <div>
                      <p className="font-medium">{language === 'ar' ? 'العملاء' : 'Clients'}</p>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'مزامنة بيانات العملاء' : 'Synchroniser données clients'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.sync_customers}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, sync_customers: checked }))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Manual Sync */}
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'مزامنة يدوية' : 'Synchronisation manuelle'}</CardTitle>
                <CardDescription>
                  {settings.last_sync 
                    ? `${language === 'ar' ? 'آخر مزامنة' : 'Dernière sync'}: ${new Date(settings.last_sync).toLocaleString()}`
                    : (language === 'ar' ? 'لم تتم المزامنة بعد' : 'Pas encore synchronisé')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={!settings.enabled}>
                    <Package className="h-4 w-4 me-2" />
                    {language === 'ar' ? 'مزامنة المنتجات' : 'Sync produits'}
                  </Button>
                  <Button variant="outline" disabled={!settings.enabled}>
                    <FileText className="h-4 w-4 me-2" />
                    {language === 'ar' ? 'مزامنة الطلبات' : 'Sync commandes'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  {language === 'ar' 
                    ? '⚠️ هذه الميزة في وضع المحاكاة. للتكامل الفعلي، يرجى التواصل مع الدعم الفني.'
                    : '⚠️ Cette fonctionnalité est en mode simulation. Pour une intégration réelle, contactez le support.'}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
