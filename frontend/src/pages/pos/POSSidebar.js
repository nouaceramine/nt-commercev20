import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, Plus, Package, Barcode, Tag } from 'lucide-react';

export default function POSSidebar({
  searchInputRef, searchQuery, setSearchQuery,
  showSearchResults, setShowSearchResults, searchResults,
  products, addToCart, setShowProductsDialog,
  taskMenuItems, activeTask, handleTaskClick, returnMode,
  language, formatCurrency, isRTL,
}) {
  const [sidebarFamily, setSidebarFamily] = useState('all');

  const sidebarFamilies = useMemo(() => {
    const seen = new Set();
    const list = [];
    products.forEach(p => {
      const key = p.family_id || p.family_name;
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push({ id: p.family_id || p.family_name, name: p.family_name || p.family_id });
      }
    });
    return list.slice(0, 10);
  }, [products]);

  const familySearchResults = useMemo(() => {
    if (searchQuery.length >= 1 || sidebarFamily === 'all') return searchResults;
    return searchResults.filter(p => (p.family_id || p.family_name) === sidebarFamily);
  }, [searchResults, sidebarFamily, searchQuery]);

  const familyProducts = useMemo(() => {
    if (sidebarFamily === 'all' || searchQuery.length >= 1) return [];
    return products.filter(p => (p.family_id || p.family_name) === sidebarFamily).slice(0, 8);
  }, [products, sidebarFamily, searchQuery]);

  const showFamilyDrop = sidebarFamily !== 'all' && searchQuery.length === 0 && familyProducts.length > 0;

  return (
    <div className="hidden md:flex md:col-span-2 flex-col gap-2" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Card className="p-2">
        <div className="relative mb-2">
          <Search className="absolute top-1/2 -translate-y-1/2 start-2 h-4 w-4 text-muted-foreground z-10" />
          <Input
            ref={searchInputRef}
            placeholder={language === 'ar' ? 'بحث أو مسح باركود...' : 'Rechercher ou scanner...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setShowSearchResults(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                e.preventDefault();
                const q = searchQuery.trim();
                const product = products.find(p =>
                  p.barcode === q ||
                  (Array.isArray(p.additional_barcodes) && p.additional_barcodes.includes(q)) ||
                  p.code === q ||
                  p.code?.toLowerCase() === q.toLowerCase()
                );
                if (product) {
                  addToCart(product);
                  setSearchQuery('');
                  setShowSearchResults(false);
                } else if (searchResults.length === 1) {
                  addToCart(searchResults[0]);
                  setSearchQuery('');
                  setShowSearchResults(false);
                }
              }
            }}
            className="ps-8 h-9 text-sm"
            data-testid="pos-search-input"
          />
          <Barcode className="absolute top-1/2 -translate-y-1/2 end-2 h-4 w-4 text-muted-foreground/50" />
          {showFamilyDrop && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto search-results-dropdown">
              {familyProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => { addToCart(product); }}
                  className="w-full flex items-center gap-2 p-2 hover:bg-muted text-start transition-colors border-b last:border-b-0"
                >
                  <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{language === 'ar' ? (product.name_ar || product.name_en) : (product.name_en || product.name_ar)}</p>
                    <p className="text-xs text-muted-foreground">{product.article_code || product.barcode} — {formatCurrency(product.retail_price)}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{product.quantity || 0}</Badge>
                </button>
              ))}
            </div>
          )}
          {showSearchResults && searchQuery.length >= 1 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto search-results-dropdown">
              {searchResults.length === 0 ? (
                <div className="p-3 text-center text-muted-foreground text-sm">
                  <p className="mb-2">{language === 'ar' ? 'لا توجد نتائج' : 'Aucun résultat'}</p>
                  <a
                    href="/products"
                    className="inline-flex items-center gap-1 text-xs text-primary border border-primary/30 rounded-md px-2 py-1 hover:bg-primary/10 transition-colors"
                    onClick={() => setShowSearchResults(false)}
                  >
                    <Plus className="h-3 w-3" />
                    {language === 'ar' ? `إنشاء منتج "${searchQuery}"` : `Créer "${searchQuery}"`}
                  </a>
                </div>
              ) : (
                searchResults.slice(0, 8).map((product) => (
                  <button
                    key={product.id}
                    onClick={() => {
                      addToCart(product);
                      setSearchQuery('');
                      setShowSearchResults(false);
                    }}
                    className="w-full flex items-center gap-2 p-2 hover:bg-muted text-start transition-colors border-b last:border-b-0"
                  >
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
                      <Package className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{language === 'ar' ? (product.name_ar || product.name_en) : (product.name_en || product.name_ar)}</p>
                      <p className="text-xs text-muted-foreground">{product.article_code || product.barcode} - {formatCurrency(product.retail_price)}</p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {product.quantity || 0}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {/* Family quick-filter chips */}
        {sidebarFamilies.length > 0 && (
          <div className="flex gap-1 flex-wrap mb-1.5 mt-1">
            <button
              onClick={() => setSidebarFamily('all')}
              className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors shrink-0 ${
                sidebarFamily === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              {language === 'ar' ? 'الكل' : 'Tout'}
            </button>
            {sidebarFamilies.map(f => (
              <button
                key={f.id}
                onClick={() => setSidebarFamily(sidebarFamily === f.id ? 'all' : f.id)}
                className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors shrink-0 max-w-[80px] truncate ${
                  sidebarFamily === f.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                }`}
                title={f.name}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
        <Button
          size="sm"
          className="w-full gap-1"
          onClick={() => setShowProductsDialog(true)}
          data-testid="add-product-btn"
        >
          <Plus className="h-4 w-4" />
          {language === 'ar' ? 'إضافة منتج' : 'Ajouter'}
        </Button>
      </Card>

      <Card className="flex-1 overflow-hidden">
        <CardHeader className="p-2 pb-1">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {language === 'ar' ? 'مهام البيع' : 'Taches'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-1 pt-0 overflow-y-auto" style={{ maxHeight: 'calc(100% - 40px)' }}>
          <div className="space-y-0.5">
            {taskMenuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleTaskClick(item.id)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
                  activeTask === item.id
                    ? 'bg-primary text-primary-foreground'
                    : item.id === 'return' && returnMode
                      ? 'bg-destructive text-destructive-foreground'
                      : item.highlight
                        ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
                title={item.label}
                data-testid={`task-${item.id}`}
              >
                <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="flex-1 text-start truncate">{item.label}</span>
                <span className="text-[10px] opacity-60">{item.shortcut}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
