import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { Package, Check, Plus, Minus, Equal } from 'lucide-react';

export function InventoryProductsTable({
  filteredProducts, countedItems, confirmCurrentQuantity,
  decrementCount, incrementCount, setManualCount,
  saveCountToSession, language
}) {
  return (
    <Card data-testid="inventory-products-table">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">
                <Checkbox 
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const newCounts = { ...countedItems };
                      filteredProducts.forEach(p => {
                        if (newCounts[p.id] === undefined) {
                          newCounts[p.id] = p.quantity;
                        }
                      });
                      saveCountToSession(newCounts);
                    }
                  }}
                />
              </TableHead>
              <TableHead>{language === 'ar' ? 'المنتج' : 'Produit'}</TableHead>
              <TableHead className="text-center w-32">{language === 'ar' ? 'الكمية الحالية' : 'Qté système'}</TableHead>
              <TableHead className="text-center w-48">{language === 'ar' ? 'الكمية المجرودة' : 'Qté comptée'}</TableHead>
              <TableHead className="text-center w-28">{language === 'ar' ? 'الفرق' : 'Diff'}</TableHead>
              <TableHead className="w-20">{language === 'ar' ? 'تأكيد' : 'Confirmer'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.map(product => {
              const counted = countedItems[product.id];
              const diff = counted !== undefined ? counted - product.quantity : null;
              const rowClass = counted !== undefined 
                ? (diff === 0 ? 'bg-emerald-50/50' : diff > 0 ? 'bg-blue-50/50' : 'bg-red-50/50') 
                : '';
              
              return (
                <TableRow key={product.id} className={`${rowClass} hover:bg-muted/30 transition-colors`}>
                  <TableCell>
                    <Checkbox 
                      checked={counted !== undefined}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          confirmCurrentQuantity(product.id, product.quantity);
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{language === 'ar' ? product.name_ar : product.name_en}</p>
                      <p className="text-xs text-muted-foreground font-mono">{product.barcode}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="font-mono text-base px-3 py-1">
                      {product.quantity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="outline" size="icon" className="h-9 w-9"
                        onClick={() => decrementCount(product.id)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number" min="0"
                        value={counted ?? ''}
                        onChange={(e) => setManualCount(product.id, e.target.value)}
                        className="w-20 text-center h-9 font-mono text-lg"
                        placeholder="-"
                      />
                      <Button variant="outline" size="icon" className="h-9 w-9"
                        onClick={() => incrementCount(product.id)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {diff !== null && (
                      <Badge className={`font-mono text-sm px-3 ${
                        diff === 0 ? 'bg-emerald-100 text-emerald-700' : 
                        diff > 0 ? 'bg-blue-100 text-blue-700' : 
                        'bg-red-100 text-red-700'
                      }`}>
                        {diff === 0 ? <Equal className="h-3 w-3" /> : diff > 0 ? `+${diff}` : diff}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm"
                      className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      onClick={() => confirmCurrentQuantity(product.id, product.quantity)}
                      title={language === 'ar' ? 'تأكيد الكمية الحالية' : 'Confirmer quantité actuelle'}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        
        {filteredProducts.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{language === 'ar' ? 'لا توجد منتجات' : 'Aucun produit trouvé'}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
