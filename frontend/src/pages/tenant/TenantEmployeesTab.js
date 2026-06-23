import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { Plus, Edit, Trash2 } from 'lucide-react';

export function TenantEmployeesTab({ employees, openEmployeeDialog, deleteEmployee }) {
  return (
    <div className="space-y-4" data-testid="tenant-employees-tab">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">الموظفين ({employees.length})</h3>
        <Button onClick={() => openEmployeeDialog()}>
          <Plus className="h-4 w-4 me-2" />
          إضافة موظف
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>البريد</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-center">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map(employee => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{employee.name}</TableCell>
                  <TableCell>{employee.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {employee.role === 'admin' ? 'مدير' : 
                       employee.role === 'seller' ? 'بائع' : 
                       employee.role === 'manager' ? 'مشرف' : 
                       employee.role === 'accountant' ? 'محاسب' : employee.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.is_active !== false ? "default" : "secondary"}>
                      {employee.is_active !== false ? 'نشط' : 'معطل'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEmployeeDialog(employee)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => deleteEmployee(employee.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {employees.length === 0 && (
            <p className="text-center text-muted-foreground py-8">لا يوجد موظفين</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
