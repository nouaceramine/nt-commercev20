import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { Search, Plus, Edit, Trash2 } from 'lucide-react';

export function TenantProductsTab({
  filteredProducts, products, searchQuery, setSearchQuery,
  openProductDialog, deleteProduct, formatCurrency
}) {
  return (
    <div className="space-y-4" data-testid="tenant-products-tab">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
          />
        </div>
        <Button onClick={() => openProductDialog()}>
          <Plus className="h-4 w-4 me-2" />
          إضافة منتج
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج</TableHead>
                <TableHead>السعر</TableHead>
                <TableHead>المخزون</TableHead>
                <TableHead>التصنيف</TableHead>
                <TableHead className="text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.slice(0, 20).map(product => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{product.name_ar || product.name_en || product.name}</p>
                      {(product.barcode || product.article_code) && (
                        <p className="text-xs text-muted-foreground">{product.barcode || product.article_code}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatCurrency(product.retail_price || product.price || 0)}</TableCell>
                  <TableCell>
                    <Badge variant={(product.quantity || product.stock || 0) <= (product.low_stock_threshold || product.min_stock || 10) ? "destructive" : "default"}>
                      {product.quantity || product.stock || 0}
                    </Badge>
                  </TableCell>
                  <TableCell>{product.family_name || product.category || '-'}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openProductDialog(product)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteProduct(product.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {products.length === 0 && (
            <p className="text-center text-muted-foreground py-8">لا توجد منتجات</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
