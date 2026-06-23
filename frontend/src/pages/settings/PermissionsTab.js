import { useState, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../components/ui/table';
import { Checkbox } from '../../components/ui/checkbox';
import { toast } from 'sonner';
import { Shield, Users, RefreshCw, Trash2, Save, Eye, EyeOff, Edit2, Plus, Key } from 'lucide-react';

export default function PermissionsTab() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [defaultPermissions, setDefaultPermissions] = useState({});

  const [selectedUser, setSelectedUser] = useState(null);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [userPermissions, setUserPermissions] = useState({});
  const [savingPermissions, setSavingPermissions] = useState(false);

  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [newUserData, setNewUserData] = useState({ name: '', email: '', password: '', role: 'seller' });
  const [addingUser, setAddingUser] = useState(false);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);

  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordUser, setPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserData, setEditUserData] = useState({ name: '', email: '', role: '' });
  const [savingEditUser, setSavingEditUser] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      
      
      const [usersRes, rolesRes] = await Promise.all([
        apiClient.get(`/users`),
        apiClient.get(`/permissions/roles`),
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data.roles);
      setDefaultPermissions(rolesRes.data.default_permissions);
    } catch (error) {
      toast.error(t.error);
    } finally {
      setLoading(false);
    }
  };

  const openPermissionsDialog = async (userId) => {
    try {
      
      const response = await apiClient.get(`/users/${userId}/permissions`);
      setSelectedUser(users.find(u => u.id === userId));
      setUserPermissions(response.data.permissions);
      setShowPermissionsDialog(true);
    } catch (error) { toast.error(t.error); }
  };

  const savePermissions = async () => {
    if (!selectedUser) return;
    setSavingPermissions(true);
    try {
      
      await apiClient.put(`/users/${selectedUser.id}/permissions`, userPermissions);
      toast.success(language === 'ar' ? 'تم حفظ الصلاحيات' : 'Permissions saved');
      setShowPermissionsDialog(false);
    } catch (error) { toast.error(t.error); }
    finally { setSavingPermissions(false); }
  };

  const resetPermissions = async () => {
    if (!selectedUser) return;
    try {
      
      await apiClient.put(`/users/${selectedUser.id}/reset-permissions`, {});
      setUserPermissions(defaultPermissions[selectedUser.role] || {});
      toast.success(language === 'ar' ? 'تم إعادة الصلاحيات للافتراضي' : 'Permissions reset');
    } catch (error) { toast.error(t.error); }
  };

  const openEditUserDialog = (u) => {
    setEditingUser(u);
    setEditUserData({ name: u.name, email: u.email, role: u.role });
    setShowEditUserDialog(true);
  };

  const saveEditUser = async () => {
    if (!editUserData.name || !editUserData.email) {
      toast.error(language === 'ar' ? 'جميع الحقول مطلوبة' : 'All fields are required');
      return;
    }
    setSavingEditUser(true);
    try {
      
      await apiClient.put(`/users/${editingUser.id}`, editUserData);
      toast.success(language === 'ar' ? 'تم تحديث المستخدم بنجاح' : 'User updated successfully');
      setShowEditUserDialog(false);
      fetchData();
    } catch (error) { toast.error(error.response?.data?.detail || t.error); }
    finally { setSavingEditUser(false); }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من حذف هذا المستخدم؟' : 'Are you sure you want to delete this user?')) return;
    try {
      
      await apiClient.delete(`/users/${userId}`);
      toast.success(language === 'ar' ? 'تم حذف المستخدم بنجاح' : 'User deleted successfully');
      fetchData();
    } catch (error) { toast.error(error.response?.data?.detail || t.error); }
  };

  const openPasswordDialog = (u) => {
    setPasswordUser(u);
    setNewPassword('');
    setShowPasswordDialog(true);
  };

  const savePassword = async () => {
    if (!passwordUser || newPassword.length < 4) {
      toast.error(language === 'ar' ? 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' : 'Le mot de passe doit contenir au moins 4 caractères');
      return;
    }
    setSavingPassword(true);
    try {
      
      await apiClient.put(`/users/${passwordUser.id}/password`, { new_password: newPassword });
      toast.success(language === 'ar' ? 'تم تحديث كلمة المرور بنجاح' : 'Mot de passe mis à jour');
      setShowPasswordDialog(false);
    } catch (error) { toast.error(error.response?.data?.detail || t.error); }
    finally { setSavingPassword(false); }
  };

  const handleAddUser = async () => {
    if (!newUserData.name || !newUserData.email || !newUserData.password) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول' : 'Veuillez remplir tous les champs');
      return;
    }
    setAddingUser(true);
    try {
      
      await apiClient.post(`/auth/register`, newUserData);
      toast.success(language === 'ar' ? 'تمت إضافة العامل بنجاح' : 'Employé ajouté avec succès');
      setShowAddUserDialog(false);
      setNewUserData({ name: '', email: '', password: '', role: 'seller' });
      fetchData();
    } catch (error) { toast.error(error.response?.data?.detail || t.somethingWentWrong); }
    finally { setAddingUser(false); }
  };

  const availableRoles = [
    { value: 'admin', label_ar: 'مدير', label_fr: 'Admin', color: 'bg-red-500', desc_ar: 'صلاحيات كاملة على المتجر', desc_fr: 'Full store access' },
    { value: 'manager', label_ar: 'مشرف', label_fr: 'Manager', color: 'bg-blue-500', desc_ar: 'إدارة العمليات اليومية', desc_fr: 'Daily operations management' },
    { value: 'sales_supervisor', label_ar: 'مشرف مبيعات', label_fr: 'Sales Supervisor', color: 'bg-teal-500', desc_ar: 'إشراف على المبيعات والعملاء', desc_fr: 'Sales and customer oversight' },
    { value: 'seller', label_ar: 'بائع', label_fr: 'Vendeur', color: 'bg-green-500', desc_ar: 'عمليات البيع الأساسية فقط', desc_fr: 'Basic sales operations only' },
    { value: 'inventory_manager', label_ar: 'مدير مخزون', label_fr: 'Inventory Manager', color: 'bg-orange-500', desc_ar: 'إدارة المخزون والمشتريات', desc_fr: 'Stock and purchase management' },
    { value: 'ecommerce_manager', label_ar: 'مسؤول متجر إلكتروني', label_fr: 'E-commerce Manager', color: 'bg-indigo-500', desc_ar: 'إدارة المتجر الإلكتروني', desc_fr: 'Online store management' },
    { value: 'accountant', label_ar: 'محاسب', label_fr: 'Comptable', color: 'bg-amber-500', desc_ar: 'التقارير المالية والديون والمصاريف', desc_fr: 'Financial reports, debts, and expenses' },
    { value: 'user', label_ar: 'مستخدم عادي', label_fr: 'Utilisateur', color: 'bg-gray-500', desc_ar: 'عرض فقط', desc_fr: 'View only' },
  ];

  const updatePermission = (category, action, value) => {
    setUserPermissions(prev => {
      const updated = { ...prev };
      if (typeof updated[category] === 'object') {
        updated[category] = { ...updated[category], [action]: value };
      } else {
        updated[category] = value;
      }
      return updated;
    });
  };

  const permissionCategories = [
    { key: 'dashboard', label: language === 'ar' ? 'لوحة التحكم' : 'Dashboard', simple: true },
    { key: 'pos', label: language === 'ar' ? 'نقطة البيع' : 'POS', simple: true },
    { key: 'products', label: language === 'ar' ? 'المنتجات' : 'Products', simple: false, actions: ['view', 'add', 'edit', 'delete', 'price_change', 'stock_adjust'] },
    { key: 'inventory', label: language === 'ar' ? 'المخزون' : 'Inventory', simple: false, actions: ['view', 'add', 'edit', 'delete', 'transfer', 'count'] },
    { key: 'purchases', label: language === 'ar' ? 'المشتريات' : 'Purchases', simple: false, actions: ['view', 'add', 'edit', 'delete', 'approve'] },
    { key: 'sales', label: language === 'ar' ? 'المبيعات' : 'Sales', simple: false, actions: ['view', 'add', 'edit', 'delete', 'refund', 'discount'] },
    { key: 'customers', label: language === 'ar' ? 'الزبائن' : 'Customers', simple: false, actions: ['view', 'add', 'edit', 'delete', 'credit', 'blacklist'] },
    { key: 'suppliers', label: language === 'ar' ? 'الموردين' : 'Suppliers', simple: false, actions: ['view', 'add', 'edit', 'delete', 'payments'] },
    { key: 'employees', label: language === 'ar' ? 'الموظفين' : 'Employees', simple: false, actions: ['view', 'add', 'edit', 'delete', 'salary', 'attendance'] },
    { key: 'debts', label: language === 'ar' ? 'الديون' : 'Debts', simple: false, actions: ['view', 'add', 'edit', 'delete', 'collect'] },
    { key: 'expenses', label: language === 'ar' ? 'المصاريف' : 'Expenses', simple: false, actions: ['view', 'add', 'edit', 'delete', 'approve'] },
    { key: 'reports', label: language === 'ar' ? 'التقارير' : 'Reports', simple: false, actions: ['sales', 'inventory', 'financial', 'customers', 'employees', 'advanced'] },
    { key: 'users', label: language === 'ar' ? 'المستخدمين' : 'Users', simple: false, actions: ['view', 'add', 'edit', 'delete', 'permissions'] },
    { key: 'recharge', label: language === 'ar' ? 'شحن الرصيد' : 'Recharge', simple: true },
    { key: 'settings', label: language === 'ar' ? 'الإعدادات' : 'Settings', simple: true },
    { key: 'api_keys', label: language === 'ar' ? 'مفاتيح API' : 'API Keys', simple: true },
    { key: 'factory_reset', label: language === 'ar' ? 'ضبط المصنع' : 'Factory Reset', simple: true },
    { key: 'woocommerce', label: 'WooCommerce', simple: true },
    { key: 'delivery', label: language === 'ar' ? 'التوصيل' : 'Delivery', simple: true },
    { key: 'loyalty', label: language === 'ar' ? 'برنامج الولاء' : 'Loyalty', simple: true },
    { key: 'notifications', label: language === 'ar' ? 'الإشعارات' : 'Notifications', simple: true },
    { key: 'maintenance', label: language === 'ar' ? 'الصيانة' : 'Maintenance', simple: true },
  ];

  const getRoleBadge = (role) => {
    const colors = {
      admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      super_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      seller: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      sales_supervisor: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
      inventory_manager: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      ecommerce_manager: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
      accountant: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    };
    const labels = {
      super_admin: language === 'ar' ? 'سوبر أدمين' : 'Super Admin',
      admin: language === 'ar' ? 'مدير' : 'Admin',
      manager: language === 'ar' ? 'مشرف' : 'Manager',
      seller: language === 'ar' ? 'بائع' : 'Vendeur',
      sales_supervisor: language === 'ar' ? 'مشرف مبيعات' : 'Sales Supervisor',
      inventory_manager: language === 'ar' ? 'مدير مخزون' : 'Inventory Manager',
      ecommerce_manager: language === 'ar' ? 'مسؤول متجر' : 'E-commerce',
      accountant: language === 'ar' ? 'محاسب' : 'Comptable',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${colors[role] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
        {labels[role] || (language === 'ar' ? 'مستخدم' : 'User')}
      </span>
    );
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner" /></div>;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {t.userPermissions}
              </CardTitle>
              <CardDescription>
                {language === 'ar' ? 'إدارة المستخدمين وصلاحياتهم' : 'Gérer les utilisateurs et leurs permissions'}
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddUserDialog(true)} className="gap-2" data-testid="add-user-btn">
              <Plus className="h-4 w-4" />
              {language === 'ar' ? 'إضافة عامل' : 'Ajouter'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.name}</TableHead>
                <TableHead>{t.email}</TableHead>
                <TableHead>{language === 'ar' ? 'الدور' : 'Role'}</TableHead>
                <TableHead>{t.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{getRoleBadge(u.role)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditUserDialog(u)} title={language === 'ar' ? 'تعديل' : 'Edit'}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPermissionsDialog(u.id)} disabled={u.id === user?.id} title={t.permissions}>
                        <Shield className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPasswordDialog(u)} title={language === 'ar' ? 'كلمة المرور' : 'Password'}>
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteUser(u.id)} disabled={u.id === user?.id || u.role === 'super_admin'} title={language === 'ar' ? 'حذف' : 'Delete'}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Permissions Dialog */}
      <Dialog open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{t.userPermissions}: {selectedUser?.name}</DialogTitle>
            <DialogDescription>{language === 'ar' ? 'الدور' : 'Role'}: {selectedUser?.role}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4">
              {permissionCategories.map((cat) => (
                <div key={cat.key} className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="font-medium">{cat.label}</span>
                  {cat.simple ? (
                    <Switch checked={!!userPermissions[cat.key]} onCheckedChange={(checked) => updatePermission(cat.key, null, checked)} />
                  ) : (
                    <div className="flex gap-4">
                      {['view', 'add', 'edit', 'delete'].map((action) => (
                        <label key={action} className="flex items-center gap-1 text-sm">
                          <Checkbox checked={userPermissions[cat.key]?.[action] || false} onCheckedChange={(checked) => updatePermission(cat.key, action, checked)} />
                          {action === 'view' ? t.viewPermission : action === 'add' ? t.addPermission : action === 'edit' ? t.editPermission : t.deletePermission}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-4 border-t">
              <Button variant="outline" onClick={resetPermissions} className="gap-2"><RefreshCw className="h-4 w-4" />{t.resetToDefault}</Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setShowPermissionsDialog(false)}>{t.cancel}</Button>
              <Button onClick={savePermissions} disabled={savingPermissions} className="gap-2"><Save className="h-4 w-4" />{t.save}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Key className="h-5 w-5" />{language === 'ar' ? 'تغيير كلمة المرور' : 'Changer le mot de passe'}</DialogTitle>
            <DialogDescription>{passwordUser?.name} ({passwordUser?.email})</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{language === 'ar' ? 'كلمة المرور الجديدة' : 'Nouveau mot de passe'}</Label>
              <div className="relative mt-1">
                <Input type={showChangePassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={language === 'ar' ? '4 أحرف على الأقل' : '4 caractères minimum'} className="pe-10" />
                <button type="button" onClick={() => setShowChangePassword(!showChangePassword)} className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                  {showChangePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowPasswordDialog(false)} className="flex-1">{t.cancel}</Button>
              <Button onClick={savePassword} disabled={savingPassword || newPassword.length < 4} className="flex-1 gap-2"><Save className="h-4 w-4" />{savingPassword ? t.loading : t.save}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" />{language === 'ar' ? 'إضافة عامل جديد' : 'Ajouter un employé'}</DialogTitle>
            <DialogDescription>{language === 'ar' ? 'أدخل بيانات العامل الجديد' : 'Entrez les informations du nouvel employé'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'الاسم الكامل *' : 'Nom complet *'}</Label>
              <Input value={newUserData.name} onChange={(e) => setNewUserData(prev => ({ ...prev, name: e.target.value }))} placeholder={language === 'ar' ? 'اسم العامل' : "Nom de l'employé"} />
            </div>
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'البريد الإلكتروني *' : 'Email *'}</Label>
              <Input type="email" value={newUserData.email} onChange={(e) => setNewUserData(prev => ({ ...prev, email: e.target.value }))} placeholder="employee@example.com" />
            </div>
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'كلمة المرور *' : 'Mot de passe *'}</Label>
              <div className="relative">
                <Input type={showNewUserPassword ? 'text' : 'password'} value={newUserData.password} onChange={(e) => setNewUserData(prev => ({ ...prev, password: e.target.value }))} placeholder="••••••••" className="pe-10" />
                <button type="button" onClick={() => setShowNewUserPassword(!showNewUserPassword)} className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                  {showNewUserPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'الدور الوظيفي *' : 'Rôle *'}</Label>
              <Select value={newUserData.role} onValueChange={(v) => setNewUserData(prev => ({ ...prev, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableRoles.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${role.color}`}></span>{language === 'ar' ? role.label_ar : role.label_fr}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newUserData.role && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-1">{language === 'ar' ? 'وصف الدور:' : 'Description du rôle:'}</p>
                <p className="text-muted-foreground">{availableRoles.find(r => r.value === newUserData.role)?.[language === 'ar' ? 'desc_ar' : 'desc_fr']}</p>
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => { setShowAddUserDialog(false); setNewUserData({ name: '', email: '', password: '', role: 'seller' }); }}>{language === 'ar' ? 'إلغاء' : 'Annuler'}</Button>
              <Button className="flex-1" onClick={handleAddUser} disabled={addingUser || !newUserData.name || !newUserData.email || !newUserData.password}>
                {addingUser ? <RefreshCw className="h-4 w-4 animate-spin me-2" /> : <Plus className="h-4 w-4 me-2" />}
                {language === 'ar' ? 'إضافة' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditUserDialog} onOpenChange={setShowEditUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit2 className="h-5 w-5 text-primary" />{language === 'ar' ? 'تعديل بيانات المستخدم' : 'Edit User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'الاسم الكامل' : 'Full Name'}</Label>
              <Input value={editUserData.name} onChange={(e) => setEditUserData(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'البريد الإلكتروني' : 'Email'}</Label>
              <Input type="email" value={editUserData.email} onChange={(e) => setEditUserData(prev => ({ ...prev, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'الدور الوظيفي' : 'Role'}</Label>
              <Select value={editUserData.role} onValueChange={(v) => setEditUserData(prev => ({ ...prev, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableRoles.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${role.color}`}></span>{language === 'ar' ? role.label_ar : role.label_fr}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setShowEditUserDialog(false)}>{language === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
              <Button className="flex-1" onClick={saveEditUser} disabled={savingEditUser}>
                {savingEditUser ? <RefreshCw className="h-4 w-4 animate-spin me-2" /> : <Save className="h-4 w-4 me-2" />}
                {language === 'ar' ? 'حفظ التغييرات' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
