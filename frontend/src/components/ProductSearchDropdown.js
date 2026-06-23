import { useState, useRef, useEffect } from 'react';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Search, Package } from 'lucide-react';
import { playSuccessBeep, playErrorBeep } from '../utils/beep';

/**
 * ProductSearchDropdown - A reusable search component for products
 * Features:
 * - Dropdown list that filters as you type
 * - Shows product name, barcode, stock, and price
 * - Click to select product
 * - Closes when clicking outside
 * - Barcode scanner support with beep sound
 */
export function ProductSearchDropdown({
  products = [],
  language = 'ar',
  isRTL = true,
  placeholder,
  onSelect,
  priceType = 'retail',
  formatCurrency = (v) => v?.toFixed(2),
  currency = 'دج',
  showStock = true,
  showPrice = true,
  disabled = false,
  className = '',
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter products based on search query
  const filteredProducts = products.filter(p => {
    if (!searchQuery) return false;
    const query = searchQuery.toLowerCase();
    return (
      p.name_en?.toLowerCase().includes(query) ||
      p.name_ar?.toLowerCase().includes(query) ||
      p.barcode?.toLowerCase().includes(query) ||
      p.article_code?.toLowerCase().includes(query) ||  // البحث بكود المنتج
      (p.compatible_models && p.compatible_models.some(m => m.toLowerCase().includes(query)))
    );
  });

  const handleSelect = (product) => {
    if (onSelect) {
      onSelect(product);
    }
    setSearchQuery('');
    setShowResults(false);
    playSuccessBeep();  // صوت التنبيه عند النجاح
    inputRef.current?.focus();
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowResults(value.length > 0);
  };

  // Handle barcode scanner input (Enter key)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && searchQuery) {
      // Find product by exact barcode or article code match
      const exactMatch = products.find(p => 
        p.barcode === searchQuery || 
        p.article_code?.toLowerCase() === searchQuery.toLowerCase()
      );
      
      if (exactMatch) {
        handleSelect(exactMatch);
      } else if (filteredProducts.length === 1) {
        handleSelect(filteredProducts[0]);
      } else {
        playErrorBeep();  // صوت خطأ عند عدم العثور
      }
    } else if (e.key === 'Escape') {
      setShowResults(false);
    }
  };

  const getProductPrice = (product) => {
    if (priceType === 'wholesale') {
      return product.wholesale_price || product.price;
    }
    return product.retail_price || product.price;
  };

  const getProductName = (product) => {
    return language === 'ar' ? (product.name_ar || product.name) : (product.name_en || product.name);
  };

  const defaultPlaceholder = language === 'ar' 
    ? 'البحث بالاسم أو الباركود أو كود المنتج...' 
    : 'Rechercher par nom, code-barres ou code article...';

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
      <Input
        ref={inputRef}
        type="text"
        placeholder={placeholder || defaultPlaceholder}
        value={searchQuery}
        onChange={handleSearchChange}
        onKeyDown={handleKeyDown}
        onFocus={() => searchQuery && setShowResults(true)}
        className={`${isRTL ? 'pr-10' : 'pl-10'}`}
        disabled={disabled}
        data-testid="product-search-input"
        autoComplete="off"
      />
      
      {/* Search Results Dropdown */}
      {showResults && filteredProducts.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border rounded-lg shadow-lg max-h-80 overflow-auto">
          {filteredProducts.slice(0, 10).map((product) => (
            <div
              key={product.id}
              onClick={() => product.quantity > 0 && handleSelect(product)}
              className={`px-4 py-3 cursor-pointer hover:bg-blue-50 border-b last:border-b-0 flex items-center justify-between ${
                product.quantity <= 0 ? 'opacity-50 bg-red-50 cursor-not-allowed' : ''
              }`}
              data-testid={`search-result-${product.id}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                  <Package className="h-5 w-5 text-gray-400" />
                </div>
                <div>
                  <p className="font-medium">{getProductName(product)}</p>
                  <p className="text-sm text-muted-foreground">
                    {product.barcode || '---'}
                    {showStock && (
                      <> • {language === 'ar' ? 'المخزون:' : 'Stock:'} {product.quantity}</>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-end">
                {showPrice && (
                  <p className="font-bold text-blue-600">
                    {formatCurrency(getProductPrice(product))} {currency}
                  </p>
                )}
                {product.quantity <= 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {language === 'ar' ? 'نفذ المخزون' : 'Rupture'}
                  </Badge>
                )}
              </div>
            </div>
          ))}
          {filteredProducts.length > 10 && (
            <div className="px-4 py-2 text-center text-sm text-muted-foreground bg-gray-50">
              {language === 'ar' 
                ? `+${filteredProducts.length - 10} منتج آخر...` 
                : `+${filteredProducts.length - 10} autres articles...`}
            </div>
          )}
        </div>
      )}

      {showResults && searchQuery && filteredProducts.length === 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border rounded-lg shadow-lg p-4 text-center text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          {language === 'ar' ? 'لا توجد منتجات مطابقة' : 'Aucun article trouvé'}
        </div>
      )}
    </div>
  );
}

export default ProductSearchDropdown;
