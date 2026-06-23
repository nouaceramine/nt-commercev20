import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import TenantDialogs from './tenant/TenantDialogs';
import { FinanceReportsSection } from './tenant/FinanceReportsSection';
import { TenantSettingsTab } from './tenant/TenantSettingsTab';
import { TenantProductsTab } from './tenant/TenantProductsTab';
import { TenantSalesTab } from './tenant/TenantSalesTab';
import { TenantCustomersTab } from './tenant/TenantCustomersTab';
import { TenantSuppliersTab } from './tenant/TenantSuppliersTab';
import { TenantEmployeesTab } from './tenant/TenantEmployeesTab';
import { 
  Users, Package, Settings, Plus, 
  AlertTriangle, DollarSign, Search, Store, Truck, ShoppingBag,
  LogOut, UserPlus, TrendingUp
} from 'lucide-react';

export default function TenantDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data states
  const [stats, setStats] = useState({
    total_products: 0,
    total_sales: 0,
    total_customers: 0,
    low_stock: 0,
    total_suppliers: 0,
    total_employees: 0,
    monthly_revenue: 0,
    total_revenue: 0
  });
  
  const [walletBalance, setWalletBalance] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  
  // Dialog states
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  
  // Form states
  const [productForm, setProductForm] = useState({ name: '', price: 0, stock: 0, category: '' });
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', email: '' });
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '' });
  const [employeeForm, setEmployeeForm] = useState({ name: '', email: '', password: '', role: 'seller' });
  
  // Database Management State
  const [dbInfo, setDbInfo] = useState({
    size_mb: 0,
    collections_count: 0,
    documents_count: 0,
    last_backup: null,
    is_frozen: false,
    status: 'healthy'
  });
  const [dbLoading, setDbLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  const tenantData = JSON.parse(localStorage.getItem('tenantData') || localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('tenantToken') || localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      navigate('/portal');
      return;
    }
    fetchData();
  }, [token, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      const [productsRes, customersRes, suppliersRes, employeesRes, salesRes, expensesRes, walletRes] = await Promise.allSettled([
        apiClient.get(`/products?limit=200`, { headers }),
        apiClient.get(`/customers?limit=200`, { headers }),
        apiClient.get(`/suppliers?limit=200`, { headers }),
        apiClient.get(`/employees?limit=200`, { headers }),
        apiClient.get(`/sales?limit=100`, { headers }),
        apiClient.get(`/expenses?limit=100`, { headers }),
        apiClient.get(`/wallet`, { headers })
      ]);

      if (walletRes.status === 'fulfilled') {
        setWalletBalance(walletRes.value.data);
      }
      
      const productsData = productsRes.status === 'fulfilled' ? (productsRes.value.data.products || productsRes.value.data || []) : [];
      const customersData = customersRes.status === 'fulfilled' ? (customersRes.value.data.customers || customersRes.value.data || []) : [];
      const suppliersData = suppliersRes.status === 'fulfilled' ? (suppliersRes.value.data.suppliers || suppliersRes.value.data || []) : [];
      const employeesData = employeesRes.status === 'fulfilled' ? (employeesRes.value.data.employees || employeesRes.value.data || []) : [];
      const salesData = salesRes.status === 'fulfilled' ? (salesRes.value.data.sales || salesRes.value.data || []) : [];
      const expensesData = expensesRes.status === 'fulfilled' ? (expensesRes.value.data.expenses || expensesRes.value.data || []) : [];
      
      setProducts(productsData);
      setCustomers(customersData);
      setSuppliers(suppliersData);
      setEmployees(employeesData);
      setSales(salesData);
      setExpenses(expensesData);
      
      const lowStock = productsData.filter(p => (p.quantity || p.stock || 0) <= (p.low_stock_threshold || p.min_stock || 10)).length;
      const totalRevenue = salesData.reduce((sum, s) => sum + (s.total || 0), 0);
      
      const now = new Date();
      const monthlyRevenue = salesData
        .filter(s => new Date(s.created_at).getMonth() === now.getMonth())
        .reduce((sum, s) => sum + (s.total || 0), 0);
      
      setStats({
        total_products: productsData.length,
        total_sales: salesData.length,
        total_customers: customersData.length,
        low_stock: lowStock,
        total_suppliers: suppliersData.length,
        total_employees: employeesData.length,
        monthly_revenue: monthlyRevenue,
        total_revenue: totalRevenue
      });
      
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('tenantToken');
    localStorage.removeItem('tenantData');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/portal');
    toast.success('تم تسجيل الخروج');
  };

  const goToMainApp = () => {
    const tenantToken = localStorage.getItem('tenantToken');
    if (tenantToken) {
      localStorage.setItem('token', tenantToken);
      localStorage.setItem('user', JSON.stringify({ ...tenantData, role: 'admin' }));
    }
    navigate('/');
  };

  // Database Management Functions
  const fetchDbInfo = async () => {
    setDbLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await apiClient.get(`/tenant/database-info`, { headers });
      setDbInfo(res.data);
    } catch (error) {
      // Fallback: calculate from local data
      const totalDocs = products.length + customers.length + suppliers.length + employees.length + sales.length;
      setDbInfo({
        size_mb: (totalDocs * 0.001).toFixed(2),
        collections_count: 8,
        documents_count: totalDocs,
        last_backup: null,
        is_frozen: false,
        status: 'healthy'
      });
    } finally {
      setDbLoading(false);
    }
  };

  const handleRequestBackup = async () => {
    setBackupLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await apiClient.post(`/tenant/request-backup`, {}, { headers });
      toast.success('تم إرسال طلب النسخ الاحتياطي للمدير');
      fetchDbInfo();
    } catch (error) {
      toast.error('حدث خطأ أثناء إرسال الطلب');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleExportMyData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await apiClient.get(`/tenant/export-data`, { headers, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `my_store_data_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('تم تصدير البيانات بنجاح');
    } catch (error) {
      toast.error('حدث خطأ أثناء التصدير');
    }
  };

  useEffect(() => {
    if (products.length > 0) {
      fetchDbInfo();
    }
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ar-DZ').format(amount || 0) + ' دج';
  };

  // Product CRUD
  const openProductDialog = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({ name: product.name, price: product.price, stock: product.stock, category: product.category || '' });
    } else {
      setEditingProduct(null);
      setProductForm({ name: '', price: 0, stock: 0, category: '' });
    }
    setProductDialogOpen(true);
  };

  const saveProduct = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (editingProduct) {
        await apiClient.put(`/products/${editingProduct.id}`, productForm, { headers });
        toast.success('تم تحديث المنتج');
      } else {
        await apiClient.post(`/products`, productForm, { headers });
        toast.success('تم إضافة المنتج');
      }
      setProductDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  const deleteProduct = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await apiClient.delete(`/products/${id}`, { headers });
      toast.success('تم حذف المنتج');
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  // Customer CRUD
  const openCustomerDialog = (customer = null) => {
    if (customer) {
      setEditingCustomer(customer);
      setCustomerForm({ name: customer.name, phone: customer.phone || '', email: customer.email || '' });
    } else {
      setEditingCustomer(null);
      setCustomerForm({ name: '', phone: '', email: '' });
    }
    setCustomerDialogOpen(true);
  };

  const saveCustomer = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (editingCustomer) {
        await apiClient.put(`/customers/${editingCustomer.id}`, customerForm, { headers });
        toast.success('تم تحديث الزبون');
      } else {
        await apiClient.post(`/customers`, customerForm, { headers });
        toast.success('تم إضافة الزبون');
      }
      setCustomerDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  const deleteCustomer = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا الزبون؟')) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await apiClient.delete(`/customers/${id}`, { headers });
      toast.success('تم حذف الزبون');
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  // Supplier CRUD
  const openSupplierDialog = (supplier = null) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setSupplierForm({ name: supplier.name, phone: supplier.phone || '', email: supplier.email || '' });
    } else {
      setEditingSupplier(null);
      setSupplierForm({ name: '', phone: '', email: '' });
    }
    setSupplierDialogOpen(true);
  };

  const saveSupplier = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (editingSupplier) {
        await apiClient.put(`/suppliers/${editingSupplier.id}`, supplierForm, { headers });
        toast.success('تم تحديث المورد');
      } else {
        await apiClient.post(`/suppliers`, supplierForm, { headers });
        toast.success('تم إضافة المورد');
      }
      setSupplierDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  const deleteSupplier = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا المورد؟')) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await apiClient.delete(`/suppliers/${id}`, { headers });
      toast.success('تم حذف المورد');
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  // Employee CRUD
  const openEmployeeDialog = (employee = null) => {
    if (employee) {
      setEditingEmployee(employee);
      setEmployeeForm({ name: employee.name, email: employee.email, password: '', role: employee.role || 'seller' });
    } else {
      setEditingEmployee(null);
      setEmployeeForm({ name: '', email: '', password: '', role: 'seller' });
    }
    setEmployeeDialogOpen(true);
  };

  const saveEmployee = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (editingEmployee) {
        const data = { ...employeeForm };
        if (!data.password) delete data.password;
        await apiClient.put(`/employees/${editingEmployee.id}`, data, { headers });
        toast.success('تم تحديث الموظف');
      } else {
        await apiClient.post(`/employees`, employeeForm, { headers });
        toast.success('تم إضافة الموظف');
      }
      setEmployeeDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  const deleteEmployee = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا الموظف؟')) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await apiClient.delete(`/employees/${id}`, { headers });
      toast.success('تم حذف الموظف');
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  const filteredProducts = products.filter(p => {
    const productName = p.name_ar || p.name_en || p.name || '';
    return productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
           (p.barcode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
           (p.article_code || '').toLowerCase().includes(searchQuery.toLowerCase());
  });
  
  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery)
  );
  
  const filteredSuppliers = suppliers.filter(s => 
    s.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="tenant-dashboard-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Store className="h-8 w-8 text-primary" />
              لوحة تحكم {tenantData.company_name || tenantData.name || 'المتجر'}
            </h1>
            <p className="text-muted-foreground mt-1">إدارة المنتجات والمبيعات والزبائن والموردين</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={goToMainApp} className="gap-2">
              <ShoppingBag className="h-4 w-4" />
              نقطة البيع
            </Button>
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              خروج
            </Button>
          </div>
        </div>

        {/* Wallet Balance */}
        {walletBalance && (
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow bg-gradient-to-br from-primary/10 to-blue-500/10 border-primary/20"
            onClick={() => navigate('/wallet')}
            data-testid="tenant-wallet-card"
          >
            <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-primary/15 flex items-center justify-center">
                  <DollarSign className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">الرصيد المتوفر في المحفظة</p>
                  <p className="text-3xl font-bold">
                    {formatCurrency(walletBalance.balance)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {walletBalance.low_balance && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    رصيد منخفض
                  </Badge>
                )}
                <Button variant="outline" className="gap-2" onClick={(e) => { e.stopPropagation(); navigate('/wallet'); }}>
                  <DollarSign className="h-4 w-4" />
                  شحن المحفظة
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats - Optimized */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'إجمالي المنتجات', value: stats.total_products, icon: Package, color: 'text-blue-500' },
            { label: 'المبيعات', value: stats.total_sales, icon: ShoppingBag, color: 'text-green-500' },
            { label: 'الزبائن', value: stats.total_customers, icon: Users, color: 'text-purple-500' },
            { label: 'مخزون منخفض', value: stats.low_stock, icon: AlertTriangle, color: 'text-amber-500' },
            { label: 'إيراد الشهر', value: formatCurrency(stats.monthly_revenue), icon: TrendingUp, color: 'text-green-500' },
            { label: 'إجمالي الإيراد', value: formatCurrency(stats.total_revenue), icon: DollarSign, color: 'text-primary' }
          ].map((stat, i) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                  <stat.icon className={`h-8 w-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="products" className="space-y-6">
          <TabsList>
            <TabsTrigger value="products" className="gap-2">
              <Package className="h-4 w-4" />
              المنتجات
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-2">
              <ShoppingBag className="h-4 w-4" />
              المبيعات
            </TabsTrigger>
            <TabsTrigger value="customers" className="gap-2">
              <Users className="h-4 w-4" />
              الزبائن
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="gap-2">
              <Truck className="h-4 w-4" />
              الموردين
            </TabsTrigger>
            <TabsTrigger value="employees" className="gap-2">
              <UserPlus className="h-4 w-4" />
              الموظفين
            </TabsTrigger>
            <TabsTrigger value="finance" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              التقارير المالية
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              الإعدادات
            </TabsTrigger>
          </TabsList>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-4">
            <TenantProductsTab
              filteredProducts={filteredProducts}
              products={products}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              openProductDialog={openProductDialog}
              deleteProduct={deleteProduct}
              formatCurrency={formatCurrency}
            />
          </TabsContent>

          {/* Sales Tab */}
          <TabsContent value="sales" className="space-y-4">
            <TenantSalesTab
              sales={sales}
              goToMainApp={goToMainApp}
              formatCurrency={formatCurrency}
            />
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-4">
            <TenantCustomersTab
              filteredCustomers={filteredCustomers}
              customers={customers}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              openCustomerDialog={openCustomerDialog}
              deleteCustomer={deleteCustomer}
              formatCurrency={formatCurrency}
            />
          </TabsContent>

          {/* Suppliers Tab */}
          <TabsContent value="suppliers" className="space-y-4">
            <TenantSuppliersTab
              filteredSuppliers={filteredSuppliers}
              suppliers={suppliers}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              openSupplierDialog={openSupplierDialog}
              deleteSupplier={deleteSupplier}
              formatCurrency={formatCurrency}
            />
          </TabsContent>

          {/* Employees Tab */}
          <TabsContent value="employees" className="space-y-4">
            <TenantEmployeesTab
              employees={employees}
              openEmployeeDialog={openEmployeeDialog}
              deleteEmployee={deleteEmployee}
            />
          </TabsContent>

          {/* Finance Tab */}
          <TabsContent value="finance" className="space-y-6">
            <FinanceReportsSection sales={sales} expenses={expenses} />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <TenantSettingsTab
              tenantData={tenantData}
              dbInfo={dbInfo}
              dbLoading={dbLoading}
              backupLoading={backupLoading}
              handleRequestBackup={handleRequestBackup}
              handleExportMyData={handleExportMyData}
              fetchDbInfo={fetchDbInfo}
            />
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <TenantDialogs
          productDialogOpen={productDialogOpen} setProductDialogOpen={setProductDialogOpen}
          editingProduct={editingProduct} productForm={productForm}
          setProductForm={setProductForm} saveProduct={saveProduct}
          customerDialogOpen={customerDialogOpen} setCustomerDialogOpen={setCustomerDialogOpen}
          editingCustomer={editingCustomer} customerForm={customerForm}
          setCustomerForm={setCustomerForm} saveCustomer={saveCustomer}
          supplierDialogOpen={supplierDialogOpen} setSupplierDialogOpen={setSupplierDialogOpen}
          editingSupplier={editingSupplier} supplierForm={supplierForm}
          setSupplierForm={setSupplierForm} saveSupplier={saveSupplier}
          employeeDialogOpen={employeeDialogOpen} setEmployeeDialogOpen={setEmployeeDialogOpen}
          editingEmployee={editingEmployee} employeeForm={employeeForm}
          setEmployeeForm={setEmployeeForm} saveEmployee={saveEmployee}
        />
      </div>
    </Layout>
  );
}

