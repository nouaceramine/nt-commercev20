import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Search, Plus, Package } from 'lucide-react';
import { toast } from 'sonner';
import CameraBarcodeScanner from '../../components/forms/CameraBarcodeScanner';

export default function POSSidebar({
  searchInputRef, searchQuery, setSearchQuery,
  showSearchResults, setShowSearchResults, searchResults,
  products, addToCart, setShowProductsDialog,
  taskMenuItems, activeTask, handleTaskClick, returnMode,
  language, formatCurrency, isRTL,
}) {





  // p149: مسح الباركود بالكاميرا — نفس منطق الماسح الفعلي: تطابق تام يضيف للسلة، وإلا نعبّئ البحث
  const handleCameraScan = (code) => {
    const product = products.find(p =>
      p.barcode === code ||
      (Array.isArray(p.additional_barcodes) && p.additional_barcodes.includes(code)) ||
      p.article_code === code ||
      p.code === code
    );
    if (product) {
      addToCart(product);
      toast.success(`${product.name_ar || product.name_en || product.name}`);
    } else {
      setSearchQuery(code);
      setShowSearchResults(true);
      toast.error(language === 'ar' ? `المنتج غير موجود: ${code}` : `Produit introuvable : ${code}`);
    }
  };

  return (
    <div className="hidden md:flex md:col-span-3 flex-col gap-2" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Card className="p-2">
        <div className="relative mb-2">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-5 w-5 text-muted-foreground z-10" />
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
            className="ps-11 h-14 text-base font-medium"
            data-testid="pos-search-input"
          />
          <span className="absolute top-1/2 -translate-y-1/2 end-2 z-10">
            <CameraBarcodeScanner language={language} onDetected={handleCameraScan} testId="pos-camera-scan-btn" />
          </span>
        </div>
      </Card>

      <Card className="flex-1 overflow-hidden">
        <CardHeader className="p-2 pb-1">
          {searchQuery.trim().length >= 1 ? (
            <CardTitle className="text-xs font-medium text-primary flex items-center justify-between" data-testid="pos-search-results-title">
              <span>{language === 'ar' ? `نتائج البحث (${searchResults.length})` : `Résultats (${searchResults.length})`}</span>
              <button
                onClick={() => { setSearchQuery(''); setShowSearchResults(false); }}
                className="text-muted-foreground hover:text-foreground text-sm px-1"
                title={language === 'ar' ? 'مسح البحث' : 'Effacer'}
                data-testid="pos-search-clear-btn"
              >✕</button>
            </CardTitle>
          ) : (
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {language === 'ar' ? 'مهام البيع' : 'Taches'}
            </CardTitle>
          )}
        </CardHeader>
        <CardContent className="p-1 pt-0 overflow-y-auto" style={{ maxHeight: 'calc(100% - 40px)' }}>
          {searchQuery.trim().length >= 1 ? (
            /* p163: search results fill the sidebar as large clear product cards — one tap adds to cart */
            <div className="space-y-1" data-testid="pos-search-results-list">
              {searchResults.length === 0 ? (
                <div className="p-3 text-center text-muted-foreground text-sm">
                  <p className="mb-2">{language === 'ar' ? 'لا توجد نتائج' : 'Aucun résultat'}</p>
                  <a
                    href="/products"
                    className="inline-flex items-center gap-1 text-xs text-primary border border-primary/30 rounded-md px-2 py-1 hover:bg-primary/10 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    {language === 'ar' ? `إنشاء منتج "${searchQuery}"` : `Créer "${searchQuery}"`}
                  </a>
                </div>
              ) : (
                searchResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => {
                      addToCart(product);
                      toast.success(language === 'ar' ? `أُضيف: ${product.name_ar || product.name_en}` : `Ajouté: ${product.name_en || product.name_ar}`);
                    }}
                    className="w-full flex items-center gap-2 p-2.5 rounded-lg border hover:border-primary hover:bg-primary/5 text-start transition-colors"
                    data-testid={`pos-search-result-${product.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold leading-tight">{language === 'ar' ? (product.name_ar || product.name_en) : (product.name_en || product.name_ar)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{product.article_code || product.barcode || ''}</p>
                      <p className="text-sm font-bold text-primary mt-0.5">{formatCurrency(product.retail_price)}</p>
                    </div>
                    <Badge variant={(product.quantity || 0) > 0 ? 'secondary' : 'destructive'} className="text-xs shrink-0">
                      {product.quantity || 0}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
