import { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Search, X, Package, Loader2, Barcode } from 'lucide-react';

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(handler);
  }, [value, delay]); // eslint-disable-line react-hooks/exhaustive-deps
  
  return debouncedValue;
}

export function ProductAutocomplete({ 
  onSelect, 
  placeholder,
  className = "",
  showPrice = true,
  showStock = true,
  autoFocus = false,
  clearOnSelect = true
}) {
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  
  // Barcode scanner support
  const [barcodeBuffer, setBarcodeBuffer] = useState('');
  const barcodeTimeoutRef = useRef(null);
  const lastKeyTimeRef = useRef(0);
  
  const debouncedQuery = useDebounce(query, 300);
  
  // Search products
  const searchProducts = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    
    setLoading(true);
    try {
      const response = await apiClient.get(`/products?search=${encodeURIComponent(searchQuery)}`);
      const products = response.data.slice(0, 10); // Limit to 10 results
      setResults(products);
      setIsOpen(products.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Effect for debounced search
  useEffect(() => {
    searchProducts(debouncedQuery);
  }, [debouncedQuery, searchProducts]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          inputRef.current && !inputRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Barcode Scanner Support - detects rapid keyboard input
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Only process when input is focused
      if (document.activeElement !== inputRef.current) return;
      
      // Ignore special keys
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;
      
      // Scanner typically inputs faster than 50ms per character
      const isScanner = timeDiff < 50;
      
      // Handle Enter key - search by barcode
      if (e.key === 'Enter' && barcodeBuffer.length >= 3) {
        e.preventDefault();
        const barcode = barcodeBuffer.trim();
        
        // Search and select product by barcode
        setLoading(true);
        apiClient.get(`/products?search=${encodeURIComponent(barcode)}`)
          .then(response => {
            const products = response.data;
            // Find exact barcode match first
            const exactMatch = products.find(p => 
              p.barcode === barcode || 
              p.article_code === barcode ||
              p.article_code?.toLowerCase() === barcode.toLowerCase()
            );
            
            if (exactMatch) {
              handleSelect(exactMatch);
            } else if (products.length === 1) {
              // If only one result, select it
              handleSelect(products[0]);
            } else if (products.length > 1) {
              // Show results if multiple matches
              setResults(products.slice(0, 10));
              setIsOpen(true);
            } else {
              // No products found
            }
          })
          .catch(err => console.error('Barcode search error:', err))
          .finally(() => setLoading(false));
        
        setBarcodeBuffer('');
        return;
      }
      
      // Build barcode buffer for scanner input
      if (e.key.length === 1 && (isScanner || barcodeBuffer.length === 0)) {
        setBarcodeBuffer(prev => prev + e.key);
        
        // Clear buffer after 500ms of no input
        if (barcodeTimeoutRef.current) {
          clearTimeout(barcodeTimeoutRef.current);
        }
        barcodeTimeoutRef.current = setTimeout(() => {
          setBarcodeBuffer('');
        }, 500);
      }
    };
    
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
      if (barcodeTimeoutRef.current) {
        clearTimeout(barcodeTimeoutRef.current);
      }
    };
  }, [barcodeBuffer]);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen || results.length === 0) {
      if (e.key === 'Enter' && query.length >= 2) {
        searchProducts(query);
      }
      return;
    }
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
      default:
        break;
    }
  };
  
  // Handle product selection
  const handleSelect = (product) => {
    if (onSelect) {
      onSelect(product);
    }
    if (clearOnSelect) {
      setQuery('');
    }
    setIsOpen(false);
    setSelectedIndex(-1);
  };
  
  // Clear search
  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };
  
  // Get product display name
  const getProductName = (product) => {
    return language === 'ar' ? (product.name_ar || product.name_en) : (product.name_en || product.name_ar);
  };
  
  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && results.length > 0 && setIsOpen(true)}
          placeholder={placeholder || (language === 'ar' ? 'ابحث أو امسح باركود...' : 'Rechercher ou scanner...')}
          className="pr-10 pl-8"
          autoFocus={autoFocus}
          data-testid="product-autocomplete-input"
        />
        {loading && (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {query && !loading && !barcodeBuffer && (
          <button
            onClick={handleClear}
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {/* Barcode Scanner Indicator */}
        {barcodeBuffer.length > 0 && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-green-500 font-mono animate-pulse">
            <Barcode className="h-3 w-3" />
            {barcodeBuffer}
          </div>
        )}
      </div>
      
      {/* Dropdown Results */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-80 overflow-y-auto"
          data-testid="autocomplete-dropdown"
        >
          {results.map((product, index) => (
            <div
              key={product.id}
              onClick={() => handleSelect(product)}
              className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                index === selectedIndex ? 'bg-accent' : 'hover:bg-muted'
              } ${index !== results.length - 1 ? 'border-b' : ''}`}
              data-testid={`autocomplete-item-${index}`}
            >
              {/* Product Image */}
              <div className="w-10 h-10 rounded-md overflow-hidden bg-muted flex-shrink-0">
                {product.image_url ? (
                  <img 
                    src={product.image_url} 
                    alt="" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              
              {/* Product Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{getProductName(product)}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {product.article_code && (
                    <span className="font-mono">{product.article_code}</span>
                  )}
                  {product.barcode && (
                    <span className="font-mono">| {product.barcode}</span>
                  )}
                </div>
              </div>
              
              {/* Price & Stock */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {showPrice && (
                  <span className="font-bold text-primary">
                    {(product.retail_price || 0).toFixed(2)} {language === 'ar' ? 'دج' : 'DA'}
                  </span>
                )}
                {showStock && (
                  <Badge 
                    variant={product.quantity > 0 ? "secondary" : "destructive"}
                    className="text-xs"
                  >
                    {product.quantity || 0} {language === 'ar' ? 'متوفر' : 'en stock'}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* No Results */}
      {isOpen && query.length >= 2 && results.length === 0 && !loading && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg p-4 text-center text-muted-foreground"
        >
          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>{language === 'ar' ? 'لا توجد نتائج' : 'Aucun résultat'}</p>
        </div>
      )}
    </div>
  );
}

export default ProductAutocomplete;
