import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ShoppingCart, Receipt, Package, Menu } from 'lucide-react';

// p276 — شريط تنقل سفلي للجوال فقط (md:hidden). سطح المكتب لا يتأثر إطلاقاً.
export function MobileBottomBar({ onMore, language, isCashier }) {
  const navigate = useNavigate();
  const location = useLocation();
  const ar = language === 'ar';

  const items = [
    { path: '/dashboard', icon: Home, ar: 'الرئيسية', fr: 'Accueil', testid: 'bottom-nav-home', cashierOk: false },
    { path: '/pos', icon: ShoppingCart, ar: 'الكاشير', fr: 'Caisse', testid: 'bottom-nav-pos', cashierOk: true },
    { path: '/sales', icon: Receipt, ar: 'المبيعات', fr: 'Ventes', testid: 'bottom-nav-sales', cashierOk: false },
    { path: '/products', icon: Package, ar: 'المنتجات', fr: 'Produits', testid: 'bottom-nav-products', cashierOk: true },
  ];
  const visible = items.filter(i => !isCashier || i.cashierOk);

  return (
    <nav
      data-testid="mobile-bottom-bar"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around">
        {visible.map(item => {
          const Icon = item.icon;
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <button
              key={item.testid}
              data-testid={item.testid}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[64px] min-h-[48px] text-xs ${active ? 'text-primary font-medium' : 'text-muted-foreground'}`}
            >
              <Icon className="h-5 w-5" />
              <span>{ar ? item.ar : item.fr}</span>
            </button>
          );
        })}
        <button
          data-testid="bottom-nav-more"
          onClick={onMore}
          className="flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[64px] min-h-[48px] text-xs text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          <span>{ar ? 'المزيد' : 'Plus'}</span>
        </button>
      </div>
    </nav>
  );
}
