import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { AlertTriangle } from 'lucide-react';

export function InventoryDifferences({ differences, countedItems, language }) {
  if (differences.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50" data-testid="inventory-differences">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-700">
          <AlertTriangle className="h-5 w-5" />
          {language === 'ar' ? 'ملخص الفروقات' : 'Résumé des différences'} ({differences.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {differences.slice(0, 9).map(product => {
            const diff = countedItems[product.id] - product.quantity;
            return (
              <div key={product.id} className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm border">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{language === 'ar' ? product.name_ar : product.name_en}</p>
                  <p className="text-xs text-muted-foreground">{product.barcode}</p>
                </div>
                <Badge className={`ms-2 whitespace-nowrap ${diff > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                  {product.quantity} → {countedItems[product.id]}
                </Badge>
              </div>
            );
          })}
        </div>
        {differences.length > 9 && (
          <p className="text-sm text-amber-600 mt-4 text-center">
            +{differences.length - 9} {language === 'ar' ? 'منتجات أخرى' : 'autres produits'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
