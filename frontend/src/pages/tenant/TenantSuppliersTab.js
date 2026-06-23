import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { Search, Plus, Edit, Trash2 } from 'lucide-react';

export function TenantSuppliersTab({
  filteredSuppliers, suppliers, searchQuery, setSearchQuery,
  openSupplierDialog, deleteSupplier, formatCurrency
}) {
  return (
    <div className="space-y-4" data-testid="tenant-suppliers-tab">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9" />
        </div>
        <Button onClick={() => openSupplierDialog()}>
          <Plus className="h-4 w-4 me-2" />
          إضافة مورد
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الهاتف</TableHead>
                <TableHead>البريد</TableHead>
                <TableHead>الرصيد المستحق</TableHead>
                <TableHead className="text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.slice(0, 20).map(supplier => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium">{supplier.name}</TableCell>
                  <TableCell>{supplier.phone || '-'}</TableCell>
                  <TableCell>{supplier.email || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={supplier.balance > 0 ? "destructive" : "default"}>
                      {formatCurrency(supplier.balance || 0)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openSupplierDialog(supplier)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteSupplier(supplier.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {suppliers.length === 0 && (
            <p className="text-center text-muted-foreground py-8">لا يوجد موردين</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
