import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../lib/apiClient';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  Search, Package, Loader2, X, AlertTriangle, Filter, 
  FolderTree, DollarSign, PackageX, PackageCheck
} from 'lucide-react';
import { playSuccessBeep, playErrorBeep } from '../utils/beep';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

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

/**
 * UnifiedSearch - High-performance unified search component with advanced filters
 */
export function UnifiedSearch({
  mode = 'header',
  onSelect,
  priceType = 'retail',
  formatCurrency = (v) => v?.toFixed?.(2) || '0.00',
  currency = 'دج',
  autoFocus = false,
  className = '',
  disabled = false,
  showFilters = true,
}) {
  const { language, isRTL } = useLanguage();
  const navigate = useNavigate();
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [totalResults, setTotalResults] = useState(0);
  
  // Filter states
  const [families, setFamilies] = useState([]);
  const [selectedFamily, setSelectedFamily] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const containerRef = useRef(null);
  const filterPanelRef = useRef(null);
  
  const debouncedQuery = useDebounce(query, 150);
  const debouncedMinPrice = useDebounce(minPrice, 300);
  const debouncedMaxPrice = useDebounce(maxPrice, 300);

  // Check if any filter is active
  const hasActiveFilters = selectedFamily || stockFilter || minPrice || maxPrice;
  const activeFilterCount = [selectedFamily, stockFilter, minPrice, maxPrice].filter(Boolean).length;

  // Fetch families on mount
  useEffect(() => {
    const fetchFamilies = async () => {
      try {
        const response = await apiClient.get(`/product-families`);
        setFamilies(response.data || []);
      } catch (error) {
        console.error('Error fetching families:', error);
      }
    };
    if (showFilters) {
      fetchFamilies();
    }
  }, [showFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Search products via API
  const searchProducts = useCallback(async (searchQuery, filters = {}) => {
    const hasFilters = filters.family_id || filters.stock_filter || filters.min_price || filters.max_price;
    
    if (!searchQuery && !hasFilters) {
      setResults([]);
      setTotalResults(0);
      setIsOpen(false);
      return;
    }
    
    setLoading(true);
    try {
      const params = { limit: 15 };
      if (searchQuery) params.q = searchQuery;
      if (filters.family_id) params.family_id = filters.family_id;
      if (filters.stock_filter) params.stock_filter = filters.stock_filter;
      if (filters.min_price) params.min_price = filters.min_price;
      if (filters.max_price) params.max_price = filters.max_price;
      
      const response = await apiClient.get(`/products/quick-search`, { params });
      
      setResults(response.data.results || []);
      setTotalResults(response.data.total || 0);
      setIsOpen(response.data.results?.length > 0 || (searchQuery && searchQuery.length > 0) || hasFilters);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Search error:', error);
      try {
        const params = {};
        if (searchQuery) params.search = searchQuery;
        const response = await apiClient.get(`/products`, { params });
        const products = (response.data || []).slice(0, 15);
        setResults(products);
        setTotalResults(products.length);
        setIsOpen(products.length > 0 || (searchQuery && searchQuery.length > 0));
      } catch (e) {
        setResults([]);
        setTotalResults(0);
      }
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect for debounced search with filters
  useEffect(() => {
    const filters = {
      family_id: selectedFamily,
      stock_filter: stockFilter,
      min_price: debouncedMinPrice ? parseFloat(debouncedMinPrice) : null,
      max_price: debouncedMaxPrice ? parseFloat(debouncedMaxPrice) : null,
    };
    
    if (debouncedQuery || hasActiveFilters) {
      searchProducts(debouncedQuery, filters);
    }
  }, [debouncedQuery, selectedFamily, stockFilter, debouncedMinPrice, debouncedMaxPrice, searchProducts, hasActiveFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown and filter panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setShowFilterPanel(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle product selection
  const handleSelect = useCallback((product) => {
    if (mode === 'header') {
      navigate(`/products/${product.id}`);
    } else if (onSelect) {
      onSelect(product);
      playSuccessBeep();
    }
    
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  }, [mode, navigate, onSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (query) {
        const exactMatch = results.find(p => 
          p.barcode === query || 
          p.article_code?.toLowerCase() === query.toLowerCase()
        );
        
        if (exactMatch) {
          handleSelect(exactMatch);
          return;
        }
        
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex]);
          return;
        }
        
        if (results.length === 1) {
          handleSelect(results[0]);
          return;
        }
        
        if (mode === 'header') {
          navigate(`/products?search=${encodeURIComponent(query)}`);
          setQuery('');
          setIsOpen(false);
          return;
        }
        
        playErrorBeep();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  }, [query, results, selectedIndex, handleSelect, mode, navigate]);

  // Handle input change
  const handleChange = useCallback((e) => {
    const value = e.target.value;
    setQuery(value);
    if (value) {
      setIsOpen(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear search
  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSelectedFamily('');
    setStockFilter('');
    setMinPrice('');
    setMaxPrice('');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Get product display name
  const getProductName = useCallback((product) => {
    return language === 'ar' 
      ? (product.name_ar || product.name_en || product.name) 
      : (product.name_en || product.name_ar || product.name);
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get price based on type
  const getPrice = useCallback((product) => {
    return priceType === 'wholesale' 
      ? (product.wholesale_price || product.price || 0) 
      : (product.retail_price || product.price || 0);
  }, [priceType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Placeholder text
  const placeholder = useMemo(() => {
    return language === 'ar' 
      ? 'ابحث بالاسم أو الباركود أو كود المنتج...' 
      : 'Rechercher par nom, code-barres ou code article...';
  }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stock filter options
  const stockOptions = [
    { value: '', label: language === 'ar' ? 'الكل' : 'Tous', icon: null },
    { value: 'available', label: language === 'ar' ? 'متوفر' : 'Disponible', icon: <PackageCheck className="h-3 w-3 text-green-500" /> },
    { value: 'low', label: language === 'ar' ? 'منخفض' : 'Bas', icon: <AlertTriangle className="h-3 w-3 text-amber-500" /> },
    { value: 'out', label: language === 'ar' ? 'نفذ' : 'Rupture', icon: <PackageX className="h-3 w-3 text-red-500" /> },
  ];

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="flex gap-2">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search 
            className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none ${
              isRTL ? 'right-3' : 'left-3'
            }`} 
          />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => (query || hasActiveFilters) && setIsOpen(true)}
            placeholder={placeholder}
            className={`h-11 ${isRTL ? 'pr-10 pl-10' : 'pl-10 pr-10'} search-input focus:ring-2 focus:ring-primary/20`}
            autoFocus={autoFocus}
            disabled={disabled}
            autoComplete="off"
            data-testid="unified-search-input"
          />
          
          {loading && (
            <Loader2 
              className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground ${
                isRTL ? 'left-3' : 'right-3'
              }`} 
            />
          )}
          
          {query && !loading && (
            <button
              onClick={handleClear}
              className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground hover:text-foreground transition-colors ${
                isRTL ? 'left-3' : 'right-3'
              }`}
              type="button"
              data-testid="search-clear-btn"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter Button */}
        {showFilters && (
          <Button 
            variant={hasActiveFilters ? "default" : "outline"} 
            size="icon" 
            className="h-11 w-11 relative"
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            data-testid="search-filter-btn"
          >
            <Filter className="h-5 w-5" />
            {hasActiveFilters && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </Button>
        )}
      </div>

      {/* Filter Panel (Dropdown) */}
      {showFilterPanel && showFilters && (
        <div 
          ref={filterPanelRef}
          className={`absolute z-50 top-full mt-2 w-80 bg-popover border rounded-xl shadow-xl p-4 ${
            isRTL ? 'left-0' : 'right-0'
          }`}
          data-testid="filter-panel"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">
                {language === 'ar' ? 'فلترة متقدمة' : 'Filtres avancés'}
              </h4>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  {language === 'ar' ? 'مسح الكل' : 'Effacer'}
                </Button>
              )}
            </div>
            
            {/* Family Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <FolderTree className="h-4 w-4" />
                {language === 'ar' ? 'العائلة' : 'Famille'}
              </label>
              <Select value={selectedFamily || "all"} onValueChange={(v) => setSelectedFamily(v === "all" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={language === 'ar' ? 'جميع العائلات' : 'Toutes'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'جميع العائلات' : 'Toutes'}</SelectItem>
                  {families.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {language === 'ar' ? f.name_ar : (f.name_en || f.name_ar)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stock Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Package className="h-4 w-4" />
                {language === 'ar' ? 'حالة المخزون' : 'État du stock'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {stockOptions.map(opt => (
                  <Button
                    key={opt.value || 'all'}
                    variant={stockFilter === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStockFilter(opt.value)}
                    className="justify-start gap-1"
                  >
                    {opt.icon}
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Price Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                {language === 'ar' ? 'نطاق السعر' : 'Fourchette de prix'}
              </label>
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  placeholder={language === 'ar' ? 'من' : 'Min'}
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="h-9"
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  type="number"
                  placeholder={language === 'ar' ? 'إلى' : 'Max'}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={() => {
                setShowFilterPanel(false);
                setIsOpen(true);
              }}
            >
              {language === 'ar' ? 'تطبيق الفلاتر' : 'Appliquer'}
            </Button>
          </div>
        </div>
      )}

      {/* Active Filters Pills */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedFamily && (
            <Badge variant="secondary" className="gap-1">
              {families.find(f => f.id === selectedFamily)?.name_ar || selectedFamily}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedFamily('')} />
            </Badge>
          )}
          {stockFilter && (
            <Badge variant="secondary" className="gap-1">
              {stockOptions.find(o => o.value === stockFilter)?.label}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setStockFilter('')} />
            </Badge>
          )}
          {(minPrice || maxPrice) && (
            <Badge variant="secondary" className="gap-1">
              {minPrice || '0'} - {maxPrice || '∞'} {currency}
              <X className="h-3 w-3 cursor-pointer" onClick={() => { setMinPrice(''); setMaxPrice(''); }} />
            </Badge>
          )}
        </div>
      )}

      {/* Search Results Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-xl shadow-xl max-h-96 overflow-y-auto"
          style={{ marginTop: hasActiveFilters ? '0.5rem' : '0.25rem' }}
          data-testid="search-dropdown"
        >
          {results.length > 0 ? (
            <>
              {results.map((product, index) => (
                <div
                  key={product.id}
                  onClick={() => handleSelect(product)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-150 ${
                    index === selectedIndex 
                      ? 'bg-primary/10 border-s-2 border-primary' 
                      : product.quantity <= 0
                        ? 'bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100'
                        : product.quantity <= (product.min_quantity || 0)
                          ? 'bg-gradient-to-r from-yellow-50 to-amber-50 hover:from-yellow-100 hover:to-amber-100'
                          : 'hover:bg-muted'
                  } ${index !== results.length - 1 ? 'border-b' : ''}`}
                  data-testid={`search-result-${product.id}`}
                >
                  {/* Product Image/Icon */}
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    product.quantity <= 0 
                      ? 'bg-amber-200 ring-2 ring-amber-400' 
                      : product.quantity <= (product.min_quantity || 0)
                        ? 'bg-yellow-200 ring-2 ring-yellow-400'
                        : 'bg-muted'
                  }`}>
                    {product.image_url ? (
                      <img 
                        src={product.image_url} 
                        alt="" 
                        className="w-full h-full object-cover rounded-lg"
                        loading="lazy"
                      />
                    ) : product.quantity <= 0 ? (
                      <PackageX className="h-5 w-5 text-amber-700" />
                    ) : product.quantity <= (product.min_quantity || 0) ? (
                      <AlertTriangle className="h-5 w-5 text-yellow-700" />
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${product.quantity <= 0 ? 'text-amber-900' : ''}`}>
                      {getProductName(product)}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      {product.article_code && (
                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                          {product.article_code}
                        </span>
                      )}
                      {product.barcode && (
                        <span className="font-mono">{product.barcode}</span>
                      )}
                      {product.family_name && (
                        <Badge variant="outline" className="text-xs py-0">
                          {product.family_name}
                        </Badge>
                      )}
                      <span>•</span>
                      <span className={product.quantity <= 0 
                        ? 'text-red-600 font-bold' 
                        : product.quantity <= (product.min_quantity || 0)
                          ? 'text-amber-600 font-bold'
                          : ''
                      }>
                        {language === 'ar' ? 'المخزون:' : 'Stock:'} {product.quantity}
                      </span>
                    </div>
                  </div>

                  {/* Price & Stock Badge */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="font-bold text-primary text-lg">
                      {formatCurrency(getPrice(product))} {currency}
                    </span>
                    {product.quantity <= 0 && (
                      <Badge className="text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                        <PackageX className="h-3 w-3 me-1" />
                        {language === 'ar' ? 'نفذ' : 'Rupture'}
                      </Badge>
                    )}
                    {product.quantity > 0 && product.quantity <= (product.min_quantity || 0) && (
                      <Badge className="text-xs bg-gradient-to-r from-yellow-500 to-amber-500 text-white">
                        <AlertTriangle className="h-3 w-3 me-1" />
                        {language === 'ar' ? 'منخفض' : 'Bas'}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              
              {/* More results indicator */}
              {totalResults > results.length && (
                <div className="px-4 py-2 text-center text-sm text-muted-foreground bg-muted/50">
                  {language === 'ar' 
                    ? `+${totalResults - results.length} نتيجة أخرى` 
                    : `+${totalResults - results.length} autres résultats`}
                </div>
              )}
            </>
          ) : (query || hasActiveFilters) && !loading ? (
            <div className="p-6 text-center text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="font-medium">
                {language === 'ar' ? 'لا توجد نتائج' : 'Aucun résultat'}
              </p>
              <p className="text-sm mt-1">
                {language === 'ar' 
                  ? 'جرب تغيير الفلاتر أو البحث بكلمة أخرى' 
                  : 'Essayez de modifier les filtres'}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                  {language === 'ar' ? 'مسح الفلاتر' : 'Effacer les filtres'}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default UnifiedSearch;
