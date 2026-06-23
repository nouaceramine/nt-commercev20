import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { Users, Trash2, Shield, User, Plus, Eye, EyeOff, UserPlus } from 'lucide-react';

export default function UsersPage() {
  const { t, language } = useLanguage();
  const { user: currentUser } = useAuth();
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Add User Dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user'
  });

  const roles = [
    // Note: super_admin is NOT available for tenants (security restriction)
    { value: 'admin', label: language === 'ar' ? 'مدير' : 'Admin', icon: Shield },
    { value: 'manager', label: language === 'ar' ? 'مدير فرع' : 'Manager', icon: User },
    { value: 'seller', label: language === 'ar' ? 'بائع' : 'Seller', icon: User },
    { value: 'accountant', label: language === 'ar' ? 'محاسب' : 'Accountant', icon: User },
    { value: 'inventory_manager', label: language === 'ar' ? 'مدير مخزون' : 'Inventory Manager', icon: User },
    { value: 'delivery', label: language === 'ar' ? 'مندوب توصيل' : 'Delivery', icon: User },
    { value: 'technician', label: language === 'ar' ? 'فني صيانة' : 'Technician', icon: User },
    { value: 'user', label: language === 'ar' ? 'مستخدم' : 'User', icon: User },
  ];

  const fetchUsers = async () => {
    try {
      const response = await apiClient.get(`/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error(t.somethingWentWrong);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      await apiClient.post(`/users`, newUser);
      toast.success(language === 'ar' ? 'تم إضافة المستخدم بنجاح' : 'User added successfully');
      setAddDialogOpen(false);
      setNewUser({ name: '', email: '', password: '', role: 'user' });
      fetchUsers();
    } catch (error) {
      console.error('Error adding user:', error);
      if (error.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else {
        toast.error(t.somethingWentWrong);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await apiClient.put(`/users/${userId}`, { role: newRole });
      toast.success(t.userUpdated);
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error(t.somethingWentWrong);
    }
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    
    try {
      await apiClient.delete(`/users/${userToDelete.id}`);
      toast.success(t.userDeleted);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      if (error.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else {
        toast.error(t.somethingWentWrong);
      }
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

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
      <div className="space-y-6 animate-fade-in" data-testid="users-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t.userManagement}</h1>
            <p className="text-muted-foreground mt-1">
              {users.length} {t.users}
            </p>
          </div>
          <Button 
            onClick={() => setAddDialogOpen(true)}
            className="gap-2"
            data-testid="add-user-btn"
          >
            <UserPlus className="h-4 w-4" />
            {language === 'ar' ? 'إضافة مستخدم' : 'Add User'}
          </Button>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t.allUsers}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {users.length === 0 ? (
              <div className="empty-state py-12">
                <Users className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">{t.noUsers}</h3>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.userName}</th>
                      <th>{t.userEmail}</th>
                      <th>{t.userRole}</th>
                      <th>{t.createdAt}</th>
                      <th>{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} data-testid={`user-row-${user.id}`}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${user.role === 'admin' ? 'bg-primary/10' : 'bg-muted'}`}>
                              {user.role === 'admin' ? (
                                <Shield className="h-4 w-4 text-primary" />
                              ) : (
                                <User className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <span className="font-medium">{user.name}</span>
                            {currentUser?.id === user.id && (
                              <Badge variant="outline" className="text-xs">
                                {language === 'ar' ? 'أنت' : 'You'}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="text-muted-foreground">{user.email}</td>
                        <td>
                          <Select
                            value={user.role}
                            onValueChange={(value) => handleRoleChange(user.id, value)}
                            disabled={currentUser?.id === user.id}
                          >
                            <SelectTrigger className="w-36" data-testid={`role-select-${user.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((role) => (
                                <SelectItem key={role.value} value={role.value}>
                                  <div className="flex items-center gap-2">
                                    <role.icon className="h-4 w-4" />
                                    {role.label}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="text-muted-foreground">
                          {formatDate(user.created_at)}
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setUserToDelete(user);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={currentUser?.id === user.id}
                            data-testid={`delete-user-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.deleteUser}</AlertDialogTitle>
              <AlertDialogDescription>
                {t.deleteUserConfirm}
                {userToDelete && (
                  <span className="block mt-2 font-medium text-foreground">
                    {userToDelete.name} ({userToDelete.email})
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>
                {t.cancel}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="confirm-delete-user-btn"
              >
                {deleting ? t.loading : t.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Add User Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                {language === 'ar' ? 'إضافة مستخدم جديد' : 'Add New User'}
              </DialogTitle>
              <DialogDescription>
                {language === 'ar' ? 'أدخل معلومات المستخدم الجديد' : 'Enter new user information'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{language === 'ar' ? 'الاسم' : 'Name'} *</Label>
                <Input
                  id="name"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder={language === 'ar' ? 'اسم المستخدم...' : 'User name...'}
                  data-testid="new-user-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{language === 'ar' ? 'البريد الإلكتروني' : 'Email'} *</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="user@example.com"
                  data-testid="new-user-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{language === 'ar' ? 'كلمة المرور' : 'Password'} *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="••••••••"
                    data-testid="new-user-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'الدور' : 'Role'}</Label>
                <Select
                  value={newUser.role}
                  onValueChange={(value) => setNewUser({ ...newUser, role: value })}
                >
                  <SelectTrigger data-testid="new-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex items-center gap-2">
                          <role.icon className="h-4 w-4" />
                          {role.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={saving}>
                {t.cancel}
              </Button>
              <Button onClick={handleAddUser} disabled={saving} data-testid="save-new-user-btn">
                {saving ? (language === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (language === 'ar' ? 'حفظ' : 'Save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
