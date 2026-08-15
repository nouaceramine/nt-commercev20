// Unified E-Commerce Hub shell (p46) — single <Layout> + shared hub tabs
// + contextual sub-tabs per section + <Outlet/> for the active page.
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { useLanguage } from '../../contexts/LanguageContext';
import { EcomHubTabs } from '../../components/ecom/EcomHubTabs';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';

const SUB_TABS = {
  store: [
    { path: '/ecom-hub/store', ar: 'إدارة المتجر', fr: 'Boutique' },
    { path: '/ecom-hub/store/loyalty', ar: 'الولاء', fr: 'Fidélité' },
  ],
  channels: [
    { path: '/ecom-hub/channels', ar: 'قنوات البيع', fr: 'Canaux' },
    { path: '/ecom-hub/channels/woocommerce', ar: 'WooCommerce', fr: 'WooCommerce' },
    { path: '/ecom-hub/channels/status', ar: 'حالة التكاملات', fr: 'Intégrations' },
    { path: '/ecom-hub/channels/api-keys', ar: 'مفاتيح API', fr: 'Clés API' },
    { path: '/ecom-hub/channels/2fa', ar: 'التحقق بخطوتين', fr: '2FA' },
    { path: '/ecom-hub/channels/guide', ar: 'دليل الاستخدام والربط', fr: 'Guide' },
  ],
  shipping: [
    { path: '/ecom-hub/shipping', ar: 'الشحن الموحَّد', fr: 'Livraison unifiée' },
    { path: '/ecom-hub/shipping/companies', ar: 'شركات الشحن', fr: 'Transporteurs' },
  ],
};

function sectionOf(pathname) {
  if (pathname.startsWith('/ecom-hub/store')) return 'store';
  if (pathname.startsWith('/ecom-hub/channels')) return 'channels';
  if (pathname.startsWith('/ecom-hub/shipping')) return 'shipping';
  return null;
}

export default function EcomHubShell() {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const section = sectionOf(location.pathname);
  const subs = section ? SUB_TABS[section] : null;
  const current = subs?.some(s => s.path === location.pathname) ? location.pathname : subs?.[0]?.path;

  return (
    <Layout>
      <div className="p-4 md:p-6 pb-0 md:pb-0" dir="rtl" data-testid="ecom-hub-shell">
        <EcomHubTabs />
        {subs && (
          <Tabs value={current} onValueChange={(p) => navigate(p)}>
            <TabsList className="flex flex-wrap h-auto bg-muted/20 mb-1" data-testid={`ecom-subtabs-${section}`}>
              {subs.map(s => (
                <TabsTrigger key={s.path} value={s.path} className="text-xs" data-testid={`subtab-${s.path.split('/').pop()}`}>
                  {language === 'ar' ? s.ar : s.fr}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>
      <Outlet />
    </Layout>
  );
}
