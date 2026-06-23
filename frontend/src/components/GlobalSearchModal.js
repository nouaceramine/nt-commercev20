import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { Dialog, DialogContent } from './ui/dialog';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
  Search, Package, Users, Receipt, ArrowLeft, ArrowRight,
  Hash, X, Loader2, TrendingUp,
} from 'lucide-react';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export function GlobalSearchModal({ open, onClose, language }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const ar = language === 'ar';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ products: [], customers: [], sales: [] });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const debouncedQuery = useDebounce(query, 280);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults({ products: [], customers: [], sales: [] });
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // Search
  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResults({ products: [], customers: [], sales: [] });
      return;
    }
    setLoading(true);
    try {
      const [pRes, cRes, sRes] = await Promise.allSettled([
        apiClient.get(`/products?search=${encodeURIComponent(q)}&limit=5`),
        apiClient.get(`/customers?search=${encodeURIComponent(q)}&limit=5`),
        apiClient.get(`/sales?search=${encodeURIComponent(q)}&limit=5`),
      ]);
      setResults({
        products: pRes.status === 'fulfilled' ? (pRes.value.data || []).slice(0, 5) : [],
        customers: cRes.status === 'fulfilled' ? (cRes.value.data || []).slice(0, 5) : [],
        sales: sRes.status === 'fulfilled' ? (sRes.value.data || []).slice(0, 5) : [],
      });
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

  // Flatten all results for keyboard nav
  const allItems = [
    ...results.products.map(p => ({ type: 'product', item: p })),
    ...results.customers.map(c => ({ type: 'customer', item: c })),
    ...results.sales.map(s => ({ type: 'sale', item: s })),
  ];

  const handleSelect = (type, item) => {
    onClose();
    setQuery('');
    if (type === 'product') navigate(`/products?id=${item.id}`);
    else if (type === 'customer') navigate(`/customers?id=${item.id}`);
    else if (type === 'sale') navigate(`/sales?invoice=${item.invoice_number}`);
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
              key={item.id}
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
                  {type === 'product' && (ar ? item.name_ar : item.name_en) || item.name}
                  {type === 'customer' && item.name}
                  {type === 'sale' && item.invoice_number}
                </p>
                <p className={`text-xs truncate ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {type === 'product' && `${item.quantity || 0} ${ar ? 'في المخزون' : 'en stock'} · ${item.selling_price || 0} DA`}
                  {type === 'customer' && (item.phone || (ar ? 'بدون هاتف' : 'Sans téléphone'))}
                  {type === 'sale' && `${item.total?.toFixed(2) || 0} DA · ${item.customer_name || (ar ? 'عابر' : 'Client')}`}
                </p>
              </div>
              {type === 'product' && item.quantity <= (item.min_quantity || 0) && (
                <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5">
                  {ar ? 'منخفض' : 'Bas'}
                </Badge>
              )}
              {type === 'sale' && item.remaining > 0.01 && (
                <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5">
                  {ar ? 'دين' : 'Crédit'}
                </Badge>
              )}
              <span className={`text-xs ${isSelected ? 'text-primary-foreground/60' : 'text-muted-foreground/40'}`}>
                {ar ? <ArrowLeft className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  const productOffset = 0;
  const customerOffset = results.products.length;
  const saleOffset = results.products.length + results.customers.length;

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
            placeholder={ar ? 'ابحث في المنتجات، الزبائن، الفواتير...' : 'Chercher produits, clients, factures...'}
            className="border-0 shadow-none focus-visible:ring-0 h-8 p-0 text-base"
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

          {hasResults && (
            <>
              <Section
                icon={Package}
                label={ar ? 'المنتجات' : 'Produits'}
                type="product"
                items={results.products}
                color="blue"
                indexOffset={productOffset}
              />
              <Section
                icon={Users}
                label={ar ? 'الزبائن' : 'Clients'}
                type="customer"
                items={results.customers}
                color="purple"
                indexOffset={customerOffset}
              />
              <Section
                icon={Receipt}
                label={ar ? 'الفواتير' : 'Factures'}
                type="sale"
                items={results.sales}
                color="emerald"
                indexOffset={saleOffset}
              />
            </>
          )}
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
