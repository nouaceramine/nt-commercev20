import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Plus, Package, X, Pencil, GripVertical, Check } from 'lucide-react';

/**
 * POS Shortcuts grid with drag-and-drop, delete, and backend sync.
 *
 * Props inherited from previous version + new:
 *   editing       : boolean — true while user is reordering / deleting
 *   onToggleEdit  : () => void
 *   onReorder     : (newShortcuts) => void  — fired after drag-drop or delete
 */
export default function POSShortcuts({
  productShortcuts, products, getShortcutProductName,
  handleShortcutClick, setEditingShortcutIndex,
  setShortcutColor, setShortcutProductId, setShowShortcutDialog,
  SHORTCUT_COLORS, language, formatCurrency, isRTL,
  editing = false,
  onToggleEdit,
  onReorder,
}) {
  const [dragIndex, setDragIndex] = useState(null);
  const ar = language === 'ar';

  const handleDragStart = (i) => (e) => {
    if (!editing) return;
    setDragIndex(i);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    if (!editing) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (i) => (e) => {
    if (!editing) return;
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    const next = [...productShortcuts];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(i, 0, moved);
    setDragIndex(null);
    if (onReorder) onReorder(next);
  };

  const handleDelete = (i) => (e) => {
    e.stopPropagation();
    const next = [...productShortcuts];
    next[i] = { productId: null, color: null };  // clear cell (keep slot)
    if (onReorder) onReorder(next);
  };

  const handleClick = (shortcut, i) => {
    if (editing) return;  // disable normal click while editing
    handleShortcutClick(shortcut, i);
  };

  return (
    <div className="hidden md:block shrink-0" style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Card>  {/* p178: fit-content — لا تملأ العمود */}
        <CardHeader className="p-1.5 pb-0.5 flex flex-row items-center justify-between">  {/* p178: compact */}
          <CardTitle className="text-xs text-muted-foreground">
            {ar ? 'اختصارات' : 'Raccourcis'}
          </CardTitle>
          <Button
            size="icon"
            variant={editing ? "default" : "ghost"}
            className="h-6 w-6"
            onClick={onToggleEdit}
            title={editing ? (ar ? 'حفظ الترتيب' : 'Enregistrer') : (ar ? 'تعديل' : 'Éditer')}
            data-testid="toggle-edit-shortcuts"
          >
            {editing ? <Check className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
          </Button>
        </CardHeader>
        <CardContent className="p-1 pt-0">
          {editing && (
            <p className="text-[9px] text-amber-600 mb-1 text-center">
              {ar ? 'اسحب لإعادة الترتيب — انقر X لحذف' : 'Glisser-déposer — X pour supprimer'}
            </p>
          )}
          <div className="grid grid-cols-2 gap-0.5">  {/* p176: 2 أفقياً × 8 عمودياً — p178: مدمجة */}
            {productShortcuts.slice(0, 16).map((shortcut, index) => {  // p176: 2×8 = 16 slots
              const productName = getShortcutProductName(shortcut);
              const product = shortcut.productId ? products.find(p => p.id === shortcut.productId) : null;
              const bgColor = shortcut.productId ? shortcut.color : undefined;
              return (
                <div
                  key={`shortcut-wrap-${index}`}
                  className="relative"
                  draggable={editing && !!shortcut.productId}
                  onDragStart={handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop(index)}
                  data-testid={`shortcut-slot-${index}`}
                >
                  <button
                    onClick={() => handleClick(shortcut, index)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setEditingShortcutIndex(index);
                      setShortcutColor(shortcut.color || SHORTCUT_COLORS[index % SHORTCUT_COLORS.length]);
                      setShortcutProductId(shortcut.productId || '');
                      setShowShortcutDialog(true);
                    }}
                    style={{ backgroundColor: bgColor }}
                    className={`w-full py-0.5 px-1 rounded text-[9px] font-medium text-center leading-tight transition-all h-9 flex flex-col items-center justify-center gap-0 ${
                      shortcut.productId
                        ? 'text-foreground hover:opacity-90 shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-dashed'
                    } ${editing && shortcut.productId ? 'cursor-move ring-2 ring-amber-300' : ''}`}
                    title={productName}
                    data-testid={`shortcut-${index}`}
                  >
                    {shortcut.productId ? (
                      <>
                        <Package className="h-3 w-3 shrink-0" />
                        <span className="line-clamp-1 w-full px-0.5">{productName.split(' ')[0]}</span>
                        {product?.retail_price && (
                          <span className="text-[8px] opacity-80">{formatCurrency(product.retail_price)}</span>
                        )}
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3 opacity-40" />
                        <span className="text-[8px] opacity-50">{index + 1}</span>
                      </>
                    )}
                  </button>
                  {editing && shortcut.productId && (
                    <button
                      onClick={handleDelete(index)}
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow"
                      title={ar ? 'حذف' : 'Supprimer'}
                      data-testid={`shortcut-delete-${index}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  {editing && shortcut.productId && (
                    <div className="absolute top-0 left-0 p-0.5 opacity-60 pointer-events-none">
                      <GripVertical className="h-3 w-3 text-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
