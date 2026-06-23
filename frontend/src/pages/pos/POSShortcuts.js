import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Plus, Package } from 'lucide-react';

export default function POSShortcuts({
  productShortcuts, products, getShortcutProductName,
  handleShortcutClick, setEditingShortcutIndex,
  setShortcutColor, setShortcutProductId, setShowShortcutDialog,
  SHORTCUT_COLORS, language, formatCurrency, isRTL,
}) {
  return (
    <div className="hidden md:block md:col-span-2" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Card className="h-full">
        <CardHeader className="p-2 pb-1">
          <CardTitle className="text-xs text-center text-muted-foreground">
            {language === 'ar' ? 'اختصارات' : 'Raccourcis'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-1.5 pt-0">
          <div className="grid grid-cols-3 gap-1">
            {productShortcuts.slice(0, 18).map((shortcut, index) => {
              const productName = getShortcutProductName(shortcut);
              const product = shortcut.productId ? products.find(p => p.id === shortcut.productId) : null;
              const bgColor = shortcut.productId ? shortcut.color : undefined;

              return (
                <button
                  key={`shortcut-${index}`}
                  onClick={() => handleShortcutClick(shortcut, index)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setEditingShortcutIndex(index);
                    setShortcutColor(shortcut.color || SHORTCUT_COLORS[index % SHORTCUT_COLORS.length]);
                    setShortcutProductId(shortcut.productId || '');
                    setShowShortcutDialog(true);
                  }}
                  style={{ backgroundColor: bgColor }}
                  className={`py-1.5 px-1 rounded text-[9px] font-medium text-center leading-tight transition-all h-12 flex flex-col items-center justify-center gap-0.5 ${
                    shortcut.productId
                      ? 'text-white hover:opacity-90 shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-dashed'
                  }`}
                  title={productName}
                  data-testid={`shortcut-${index}`}
                >
                  {shortcut.productId ? (
                    <>
                      <Package className="h-4 w-4 shrink-0" />
                      <span className="line-clamp-1 w-full px-0.5">{productName.split(' ')[0]}</span>
                      {product?.retail_price && (
                        <span className="text-[8px] opacity-80">{formatCurrency(product.retail_price)}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 opacity-40" />
                      <span className="text-[8px] opacity-50">{index + 1}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
