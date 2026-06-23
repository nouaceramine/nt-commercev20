/**
 * TenantDialogs - Extracted dialogs from TenantDashboardPage
 * Includes: Product, Customer, Supplier, Employee CRUD dialogs
 */
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../components/ui/dialog';
import CustomerForm from '../../components/forms/CustomerForm';
import SupplierForm from '../../components/forms/SupplierForm';

export default function TenantDialogs({
  // Product Dialog
  productDialogOpen, setProductDialogOpen, editingProduct,
  productForm, setProductForm, saveProduct,
  // Customer Dialog
  customerDialogOpen, setCustomerDialogOpen, editingCustomer,
  customerForm, setCustomerForm, saveCustomer,
  // Supplier Dialog
  supplierDialogOpen, setSupplierDialogOpen, editingSupplier,
  supplierForm, setSupplierForm, saveSupplier,
  // Employee Dialog
  employeeDialogOpen, setEmployeeDialogOpen, editingEmployee,
  employeeForm, setEmployeeForm, saveEmployee,
}) {
  return (
    <>
      {/* Product Dialog */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>اسم المنتج</Label>
              <Input value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} data-testid="product-name-input" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>السعر</Label>
                <Input type="number" value={productForm.price} onChange={e => setProductForm({...productForm, price: parseFloat(e.target.value) || 0})} />
              </div>
              <div className="space-y-2">
                <Label>المخزون</Label>
                <Input type="number" value={productForm.stock} onChange={e => setProductForm({...productForm, stock: parseInt(e.target.value) || 0})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>التصنيف</Label>
              <Input value={productForm.category} onChange={e => setProductForm({...productForm, category: e.target.value})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>إلغاء</Button>
            <Button onClick={saveProduct} data-testid="save-product-btn">{editingProduct ? 'حفظ التعديلات' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Dialog */}
      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'تعديل الزبون' : 'إضافة زبون جديد'}</DialogTitle>
          </DialogHeader>
          <CustomerForm compact formData={customerForm} setFormData={setCustomerForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerDialogOpen(false)}>إلغاء</Button>
            <Button onClick={saveCustomer}>{editingCustomer ? 'حفظ التعديلات' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Dialog */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSupplier ? 'تعديل المورد' : 'إضافة مورد جديد'}</DialogTitle>
          </DialogHeader>
          <SupplierForm compact formData={supplierForm} setFormData={setSupplierForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>إلغاء</Button>
            <Button onClick={saveSupplier}>{editingSupplier ? 'حفظ التعديلات' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Employee Dialog */}
      <Dialog open={employeeDialogOpen} onOpenChange={setEmployeeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'تعديل الموظف' : 'إضافة موظف جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input value={employeeForm.name} onChange={e => setEmployeeForm({...employeeForm, name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input value={employeeForm.email} onChange={e => setEmployeeForm({...employeeForm, email: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>{editingEmployee ? 'كلمة المرور الجديدة (اتركها فارغة للإبقاء)' : 'كلمة المرور'}</Label>
              <Input type="password" value={employeeForm.password} onChange={e => setEmployeeForm({...employeeForm, password: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>الدور</Label>
              <Select value={employeeForm.role} onValueChange={v => setEmployeeForm({...employeeForm, role: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">مدير</SelectItem>
                  <SelectItem value="manager">مشرف</SelectItem>
                  <SelectItem value="seller">بائع</SelectItem>
                  <SelectItem value="accountant">محاسب</SelectItem>
                  <SelectItem value="inventory_manager">مدير مخزون</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmployeeDialogOpen(false)}>إلغاء</Button>
            <Button onClick={saveEmployee}>{editingEmployee ? 'حفظ التعديلات' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
