import { lazy, Suspense, useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { LoadingState } from '../components/LoadingState';
import { useLanguage } from '../contexts/LanguageContext';
import { BackupSystem } from '../components/BackupSystem';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '../components/ui/tabs';
import {
  Shield, Database, MessageCircle, Printer, Usb, Mail, Volume2, Settings, Image, Wifi
} from 'lucide-react';


// Lazy-loaded tab components
const PermissionsTab = lazy(() => import('./settings/PermissionsTab'));
const WhatsAppTab = lazy(() => import('./settings/WhatsAppTab'));
const PrinterTab = lazy(() => import('./settings/PrinterTab'));
const UsbTab = lazy(() => import('./settings/UsbTab'));
const EmailTab = lazy(() => import('./settings/EmailTab'));
const SoundTab = lazy(() => import('./settings/SoundTab'));
const SystemTab = lazy(() => import('./settings/SystemTab'));
const BrandingTab = lazy(() => import('./settings/BrandingTab'));
const BridgeTab = lazy(() => import('./settings/BridgeTab'));

const TabLoader = () => <LoadingState className="h-32" />;

export default function SettingsPage() {
  const { t, language } = useLanguage();

  // Pre-fetch settings for tabs that need initial data
  const [initialData, setInitialData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSelfBridge, setIsSelfBridge] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [whatsappRes, emailRes, receiptRes, bridgeRes] = await Promise.all([
          apiClient.get(`/whatsapp/settings`).catch(() => ({ data: null })),
          apiClient.get(`/email/settings`).catch(() => ({ data: null })),
          apiClient.get(`/settings/receipt`).catch(() => ({ data: null })),
          apiClient.get(`/settings/bridge-config`).catch(() => ({ data: null })),
        ]);
        setInitialData({
          whatsapp: whatsappRes.data ? {
            enabled: whatsappRes.data.enabled || false,
            phone_number_id: whatsappRes.data.phone_number_id || '',
            access_token: '',
            business_account_id: whatsappRes.data.business_account_id || ''
          } : null,
          email: emailRes.data ? {
            enabled: emailRes.data.enabled || false,
            resend_api_key: emailRes.data.resend_api_key || '',
            sender_email: emailRes.data.sender_email || 'onboarding@resend.dev',
            sender_name: emailRes.data.sender_name || 'NT POS System'
          } : null,
          receipt: receiptRes.data || null,
        });
        if (bridgeRes.data?.recharge_mode === 'self_bridge') {
          setIsSelfBridge(true);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Layout>
        <LoadingState className="h-64" />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="settings-page">
        <div>
          <h1 className="text-2xl font-bold">{t.systemSettings}</h1>
          <p className="text-muted-foreground">
            {language === 'ar' ? 'إدارة صلاحيات المستخدمين وإعدادات النظام' : 'Manage user permissions and system settings'}
          </p>
        </div>

        <Tabs defaultValue="permissions" className="space-y-6">
          <TabsList className={`grid w-full max-w-5xl ${isSelfBridge ? 'grid-cols-10' : 'grid-cols-9'}`} data-testid="settings-tabs">
            <TabsTrigger value="permissions" className="gap-2" data-testid="tab-permissions">
              <Shield className="h-4 w-4" />
              {t.permissions}
            </TabsTrigger>
            <TabsTrigger value="branding" className="gap-2" data-testid="tab-branding">
              <Image className="h-4 w-4" />
              {language === 'ar' ? 'العلامة' : 'Marque'}
            </TabsTrigger>
            <TabsTrigger value="backup" className="gap-2" data-testid="tab-backup">
              <Database className="h-4 w-4" />
              {language === 'ar' ? 'النسخ الاحتياطي' : 'Sauvegarde'}
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-2" data-testid="tab-whatsapp">
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="printer" className="gap-2" data-testid="tab-printer">
              <Printer className="h-4 w-4" />
              {language === 'ar' ? 'الطابعة' : 'Imprimante'}
            </TabsTrigger>
            <TabsTrigger value="usb" className="gap-2" data-testid="tab-usb">
              <Usb className="h-4 w-4" />
              {language === 'ar' ? 'شرائح USB' : 'SIM USB'}
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2" data-testid="tab-email">
              <Mail className="h-4 w-4" />
              {language === 'ar' ? 'البريد' : 'Email'}
            </TabsTrigger>
            <TabsTrigger value="sound" className="gap-2" data-testid="tab-sound">
              <Volume2 className="h-4 w-4" />
              {language === 'ar' ? 'الصوت' : 'Sound'}
            </TabsTrigger>
            <TabsTrigger value="system" className="gap-2" data-testid="tab-system">
              <Settings className="h-4 w-4" />
              {language === 'ar' ? 'النظام' : 'Système'}
            </TabsTrigger>
            {isSelfBridge && (
              <TabsTrigger value="bridge" className="gap-2" data-testid="tab-bridge">
                <Wifi className="h-4 w-4" />
                {language === 'ar' ? 'الجسر' : 'Bridge'}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="permissions" className="space-y-6">
            <Suspense fallback={<TabLoader />}><PermissionsTab /></Suspense>
          </TabsContent>

          <TabsContent value="branding" className="space-y-6">
            <Suspense fallback={<TabLoader />}><BrandingTab /></Suspense>
          </TabsContent>

          <TabsContent value="backup" className="space-y-6">
            <BackupSystem />
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-6">
            <Suspense fallback={<TabLoader />}><WhatsAppTab initialSettings={initialData?.whatsapp} /></Suspense>
          </TabsContent>

          <TabsContent value="printer" className="space-y-6">
            <Suspense fallback={<TabLoader />}><PrinterTab initialReceiptSettings={initialData?.receipt} /></Suspense>
          </TabsContent>

          <TabsContent value="usb" className="space-y-6">
            <Suspense fallback={<TabLoader />}><UsbTab /></Suspense>
          </TabsContent>

          <TabsContent value="email" className="space-y-6">
            <Suspense fallback={<TabLoader />}><EmailTab initialSettings={initialData?.email} /></Suspense>
          </TabsContent>

          <TabsContent value="sound" className="space-y-6">
            <Suspense fallback={<TabLoader />}><SoundTab /></Suspense>
          </TabsContent>

          <TabsContent value="system" className="space-y-6">
            <Suspense fallback={<TabLoader />}><SystemTab /></Suspense>
          </TabsContent>

          {isSelfBridge && (
            <TabsContent value="bridge" className="space-y-6">
              <Suspense fallback={<TabLoader />}><BridgeTab /></Suspense>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
}
