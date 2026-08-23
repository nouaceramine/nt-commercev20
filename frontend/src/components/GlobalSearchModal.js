import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { Dialog, DialogContent } from './ui/dialog';
import { Input } from './ui/input';
import {
  Search, Package, Users, Receipt, ArrowLeft, ArrowRight,
  X, Loader2, TrendingUp, Truck, ShoppingCart, Banknote,
  Contact, UserSquare, Wrench, Globe, Store, Clock,
  ClipboardList, Tag, Handshake, Warehouse, CalendarClock,
  Smartphone, Tv,
} from 'lucide-react';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// p260: one backend endpoint now searches every coded entity — the modal
// renders whatever groups the server returns, in server order.
const GROUP_META = {
  product:              { icon: Package,       color: 'blue',    ar: 'المنتجات',            en: 'Produits' },
  customer:             { icon: Users,         color: 'purple',  ar: 'الزبائن',             en: 'Clients' },
  supplier:             { icon: Truck,         color: 'purple',  ar: 'الموردون',            en: 'Fournisseurs' },
  sale:                 { icon: Receipt,       color: 'emerald', ar: 'المبيعات',            en: 'Ventes' },
  purchase:             { icon: ShoppingCart,  color: 'emerald', ar: 'المشتريات',           en: 'Achats' },
  expense:              { icon: Banknote,      color: 'emerald', ar: 'المصاريف',            en: 'Dépenses' },
  employee:             { icon: Contact,       color: 'purple',  ar: 'الموظفون',            en: 'Employés' },
  system_user:          { icon: UserSquare,    color: 'purple',  ar: 'المستخدمون',          en: 'Utilisateurs' },
  repair_ticket:        { icon: Wrench,        color: 'blue',    ar: 'تذاكر الصيانة',       en: 'Réparations' },
  ecom_order:           { icon: Globe,         color: 'blue',    ar: 'طلبات التجارة',       en: 'Commandes ecom' },
  store_order:          { icon: Store,         color: 'blue',    ar: 'طلبات المتجر',        en: 'Commandes boutique' },
  daily_session:        { icon: Clock,         color: 'emerald', ar: 'الجلسات اليومية',     en: 'Sessions' },
  inventory_session:    { icon: ClipboardList, color: 'emerald', ar: 'جرد المخزون',         en: 'Inventaires' },
  price_update:         { icon: Tag,           color: 'emerald', ar: 'سجلات الأسعار',       en: 'Historique prix' },
  partner:              { icon: Handshake,     color: 'purple',  ar: 'الشركاء',             en: 'Partenaires' },
  warehouse:            { icon: Warehouse,     color: 'purple',  ar: 'المخازن',             en: 'Dépôts' },
  installment:          { icon: CalendarClock, color: 'emerald', ar: 'الأقساط',             en: 'Échéances' },
  recharge:             { icon: Smartphone,    color: 'blue',    ar: 'شحن الرصيد',          en: 'Recharges' },
  digital_subscription: { icon: Tv,            color: 'blue',    ar: 'الاشتراكات الرقمية',  en: 'Abonnements' },
};

export function GlobalSearchModal({ open, onClose, language }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const ar = language === 'ar';

  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const debouncedQuery = useDebounce(query, 280);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setGroups({});
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // Search
  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setGroups({});
      return;
    }
    // Super-admin has no tenant DB — this tenant endpoint would 403. Skip silently.
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.role === 'super_admin') {
        setGroups({});
        return;
      }
    } catch { /* noop */ }
    setLoading(true);
    try {
      const res = await apiClient.get(`/search/global?q=${encodeURIComponent(q)}`);
      setGroups(res.data?.groups || {});
      setSelected(0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    doSearch(debouncedQuery);
  }, [debouncedQuery, doSearch]);

  // Flatten all results for keyboard nav (server group order)
  const groupEntries = Object.entries(groups).filter(([, items]) => items.length);
  const allItems = groupEntries.flatMap(([type, items]) =>
    items.map(item => ({ type, item })));

  const handleSelect = (type, item) => {
    onClose();
    setQuery('');
    if (item.link) navigate(item.link);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, allItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && allItems[selected]) {
      handleSelect(allItems[selected].type, allItems[selected].item);
    }
    else if (e.key === 'Escape') onClose();
  };

  const totalResults = allItems.length;
  const hasResults = totalResults > 0;
  const showEmpty = debouncedQuery.length >= 2 && !loading && !hasResults;

  const Section = ({ icon: Icon, label, type, items, color, indexOffset }) => {
    if (!items.length) return null;
    return (
      <div>
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Icon className={`h-3.5 w-3.5 text-${color}-500`} />
          <span>{label}</span>
          <span className="text-muted-foreground/50">({items.length})</span>
        </div>
        {items.map((item, i) => {
          const globalIndex = indexOffset + i;
          const isSelected = selected === globalIndex;
          return (
            <button
              key={`${type}-${item.id || i}`}
              onMouseEnter={() => setSelected(globalIndex)}
              onClick={() => handleSelect(type, item)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-start ${
                isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              <div className={`p-1.5 rounded-md ${isSelected ? 'bg-primary-foreground/20' : `bg-${color}-100`}`}>
                <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-primary-foreground' : `text-${color}-600`}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {item.title || item.code}
                </p>
                <p className={`text-xs truncate ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {item.code && item.code !== item.title ? `${item.code} · ` : ''}{item.subtitle || ''}
                </p>
              </div>
              <span className={`text-xs ${isSelected ? 'text-primary-foreground/60' : 'text-muted-foreground/40'}`}>
                {ar ? <ArrowLeft className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  let offset = 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="p-0 gap-0 max-w-lg overflow-hidden"
        dir={ar ? 'rtl' : 'ltr'}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          {loading
            ? <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
            : <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          }
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={ar ? 'ابحث بأي كود أو اسم: BV، CL، AR، WEB، ECO...' : 'Chercher par code ou nom...'}
            className="border-0 shadow-none focus-visible:ring-0 h-8 p-0 text-base"
            data-testid="global-search-input"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="shrink-0 pointer-events-none text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
          {!query && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>{ar ? 'ابدأ الكتابة للبحث' : 'Commencez à taper pour rechercher'}</p>
              <p className="text-xs mt-1 opacity-60">{ar ? 'Ctrl+K للإغلاق' : 'Ctrl+K pour fermer'}</p>
            </div>
          )}

          {showEmpty && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>{ar ? 'لا توجد نتائج لـ' : 'Aucun résultat pour'} "{query}"</p>
            </div>
          )}

          {groupEntries.map(([type, items]) => {
            const meta = GROUP_META[type] || { icon: Search, color: 'blue', ar: type, en: type };
            const section = (
              <Section
                key={type}
                icon={meta.icon}
                label={ar ? meta.ar : meta.en}
                type={type}
                items={items}
                color={meta.color}
                indexOffset={offset}
              />
            );
            offset += items.length;
            return section;
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-2 border-t text-xs text-muted-foreground bg-muted/30">
          <span>↑↓ {ar ? 'للتنقل' : 'naviguer'}</span>
          <span>↵ {ar ? 'للفتح' : 'ouvrir'}</span>
          {hasResults && <span className="ms-auto">{totalResults} {ar ? 'نتيجة' : 'résultats'}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
