// Shared tab bar for the unified E-Commerce Hub (/ecom-hub/*)
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { ShoppingBag, Store, Link2, Megaphone, Truck, BarChart3, KeyRound } from 'lucide-react';

const HUB_TABS = [
  { key: 'orders',   path: '/ecom-hub',           icon: ShoppingBag, ar: 'الطلبات',    fr: 'Commandes' },
  { key: 'store',    path: '/ecom-hub/store',     icon: Store,       ar: 'المتجر',     fr: 'Boutique' },
  { key: 'channels', path: '/ecom-hub/channels',  icon: Link2,       ar: 'القنوات والتكاملات', fr: 'Canaux & Intégrations' },
  { key: 'ads',      path: '/ecom-hub/ads',       icon: Megaphone,   ar: 'الإعلانات',  fr: 'Publicités' },
  { key: 'shipping', path: '/ecom-hub/shipping',  icon: Truck,       ar: 'الشحن',      fr: 'Livraison' },
  { key: 'analytics',path: '/ecom-hub/analytics', icon: BarChart3,   ar: 'التحليلات',  fr: 'Analytique' },
  { key: 'integrations', path: '/integrations',   icon: KeyRound,    ar: 'مركز التكاملات', fr: "Centre d'intégrations" },  // p288
];

export function EcomHubTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguage();
  const current = HUB_TABS.find(t =>
    t.path === '/ecom-hub' ? location.pathname === '/ecom-hub' : location.pathname.startsWith(t.path)
  )?.key || 'orders';

  return (
    <Tabs value={current} onValueChange={(k) => { const t = HUB_TABS.find(x => x.key === k); if (t) navigate(t.path); }}>
      <TabsList className="flex flex-wrap h-auto bg-muted/40 mb-4" data-testid="ecom-hub-tabs">
        {HUB_TABS.map(t => {
          const Icon = t.icon;
          return (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5" data-testid={`hub-tab-${t.key}`}>
              <Icon className="h-4 w-4" />
              {language === 'ar' ? t.ar : t.fr}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
