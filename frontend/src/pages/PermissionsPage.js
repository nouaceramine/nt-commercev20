import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  Shield, Users, Save, RefreshCw, Eye, EyeOff, Plus, Edit, Trash2,
  Check, X, ChevronDown, ChevronUp, Settings, Lock, Unlock, Copy
} from 'lucide-react';

export default function PermissionsPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [defaultPermissions, setDefaultPermissions] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPermissions, setUserPermissions] = useState({});
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});

  // Permission categories
  const permissionCategories = [
    {
      id: 'sales_operations',
      name_ar: 'عمليات المبيعات',
      name_fr: 'Opérations de vente',
      icon: '🛒',
      permissions: ['pos', 'sales', 'customers', 'debts']
    },
    {
      id: 'inventory_operations',
      name_ar: 'عمليات المخزون',
      name_fr: 'Opérations d\'inventaire',
      icon: '📦',
      permissions: ['products', 'inventory', 'purchases', 'suppliers']
    },
    {
      id: 'hr_operations',
      name_ar: 'شؤون الموظفين',
      name_fr: 'Ressources humaines',
      icon: '👥',
      permissions: ['employees']
    },
    {
      id: 'financial',
      name_ar: 'العمليات المالية',
      name_fr: 'Opérations financières',
      icon: '💰',
      permissions: ['expenses', 'reports']
    },
    {
      id: 'services',
      name_ar: 'الخدمات',
      name_fr: 'Services',
      icon: '⚙️',
      permissions: ['repairs', 'recharge', 'woocommerce', 'delivery', 'loyalty', 'notifications', 'maintenance']
    },
    {
      id: 'system',
      name_ar: 'إدارة النظام',
      name_fr: 'Gestion système',
      icon: '🔧',
      permissions: ['settings', 'users', 'api_keys', 'factory_reset', 'dashboard']
    }
  ];

  // Permission actions
  const permissionActions = {
    view: { ar: 'عرض', fr: 'Voir' },
    add: { ar: 'إضافة', fr: 'Ajouter' },
    edit: { ar: 'تعديل', fr: 'Modifier' },
    delete: { ar: 'حذف', fr: 'Supprimer' },
    price_change: { ar: 'تغيير السعر', fr: 'Changer prix' },
    stock_adjust: { ar: 'تعديل المخزون', fr: 'Ajuster stock' },
    transfer: { ar: 'نقل', fr: 'Transférer' },
    count: { ar: 'جرد', fr: 'Inventaire' },
    approve: { ar: 'موافقة', fr: 'Approuver' },
    refund: { ar: 'استرجاع', fr: 'Remboursement' },
    discount: { ar: 'خصم', fr: 'Remise' },
    credit: { ar: 'آجل', fr: 'Crédit' },
    blacklist: { ar: 'قائمة سوداء', fr: 'Blacklist' },
    payments: { ar: 'مدفوعات', fr: 'Paiements' },
    salary: { ar: 'راتب', fr: 'Salaire' },
    attendance: { ar: 'حضور', fr: 'Présence' },
    collect: { ar: 'تحصيل', fr: 'Collecter' },
    permissions: { ar: 'صلاحيات', fr: 'Permissions' }
  };

  // Role colors
  const roleColors = {
    super_admin: 'bg-purple-100 text-purple-700',
    admin: 'bg-red-100 text-red-700',
    manager: 'bg-blue-100 text-blue-700',
    sales_supervisor: 'bg-teal-100 text-teal-700',
    seller: 'bg-green-100 text-green-700',
    inventory_manager: 'bg-orange-100 text-orange-700',
    ecommerce_manager: 'bg-indigo-100 text-indigo-700',
    accountant: 'bg-amber-100 text-amber-700',
    user: 'bg-gray-100 text-gray-700'
  };

  const roleNames = {
    super_admin: { ar: 'سوبر أدمين', fr: 'Super Admin' },
    admin: { ar: 'مدير', fr: 'Admin' },
    manager: { ar: 'مشرف', fr: 'Manager' },
    sales_supervisor: { ar: 'مشرف مبيعات', fr: 'Superviseur ventes' },
    seller: { ar: 'بائع', fr: 'Vendeur' },
    inventory_manager: { ar: 'مدير مخزون', fr: 'Gestionnaire stock' },
    ecommerce_manager: { ar: 'مسؤول متجر', fr: 'E-commerce' },
    accountant: { ar: 'محاسب', fr: 'Comptable' },
    user: { ar: 'مستخدم', fr: 'Utilisateur' }
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [usersRes, rolesRes] = await Promise.all([
        apiClient.get(`/users`, { headers }),
        apiClient.get(`/permissions/roles`, { headers })
      ]);

      setUsers(usersRes.data);
      setRoles(rolesRes.data.roles || []);
      setDefaultPermissions(rolesRes.data.default_permissions || {});
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(language === 'ar' ? 'خطأ في جلب البيانات' : 'Erreur chargement données');
    } finally {
      setLoading(false);
    }
  };

  const openPermissionDialog = (userItem) => {
    setSelectedUser(userItem);
    setUserPermissions(userItem.permissions || defaultPermissions[userItem.role] || {});
    setShowPermissionDialog(true);
  };

  const togglePermission = (category, action = null) => {
    setUserPermissions(prev => {
      const updated = { ...prev };
      if (action) {
        // Toggle specific action
        if (typeof updated[category] === 'object') {
          updated[category] = { ...updated[category], [action]: !updated[category]?.[action] };
        }
      } else {
        // Toggle entire category (simple permission)
        updated[category] = !updated[category];
      }
      return updated;
    });
  };

  const savePermissions = async () => {
    if (!selectedUser) return;
    
    setSaving(true);
    try {
      await apiClient.put(`/users/${selectedUser.id}/permissions`, { permissions: userPermissions });
      toast.success(language === 'ar' ? 'تم حفظ الصلاحيات بنجاح' : 'Permissions enregistrées');
      setShowPermissionDialog(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.error);
    } finally {
      setSaving(false);
    }
  };

  const copyFromRole = (role) => {
    if (defaultPermissions[role]) {
      setUserPermissions(JSON.parse(JSON.stringify(defaultPermissions[role])));
      toast.success(language === 'ar' ? `تم نسخ صلاحيات ${roleNames[role]?.ar}` : `Permissions copiées de ${roleNames[role]?.fr}`);
    }
  };

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="permissions-page">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              {language === 'ar' ? 'إدارة الصلاحيات' : 'Gestion des permissions'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' 
                ? 'تحكم في صلاحيات المستخدمين وما يمكنهم الوصول إليه'
                : 'Contrôlez les permissions des utilisateurs et leur accès'}
            </p>
          </div>
        </div>

        {/* Super Admin Notice */}
        {user?.role === 'super_admin' && (
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-purple-600" />
                <div>
                  <p className="font-medium text-purple-800">
                    {language === 'ar' ? 'سوبر أدمين - صلاحيات كاملة' : 'Super Admin - Accès complet'}
                  </p>
                  <p className="text-sm text-purple-600">
                    {language === 'ar' 
                      ? 'يمكنك تعديل صلاحيات جميع المستخدمين'
                      : 'Vous pouvez modifier les permissions de tous les utilisateurs'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {language === 'ar' ? 'المستخدمين وصلاحياتهم' : 'Utilisateurs et leurs permissions'}
            </CardTitle>
            <CardDescription>
              {language === 'ar' ? `${users.length} مستخدم` : `${users.length} utilisateurs`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'المستخدم' : 'Utilisateur'}</TableHead>
                  <TableHead>{language === 'ar' ? 'البريد' : 'Email'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الدور' : 'Rôle'}</TableHead>
                  <TableHead>{language === 'ar' ? 'حالة الصلاحيات' : 'État permissions'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'إجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(userItem => (
                  <TableRow key={userItem.id}>
                    <TableCell className="font-medium">{userItem.name}</TableCell>
                    <TableCell>{userItem.email}</TableCell>
                    <TableCell>
                      <Badge className={roleColors[userItem.role] || 'bg-gray-100'}>
                        {roleNames[userItem.role]?.[language === 'ar' ? 'ar' : 'fr'] || userItem.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {userItem.permissions ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          {language === 'ar' ? 'مخصص' : 'Personnalisé'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          {language === 'ar' ? 'افتراضي' : 'Par défaut'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPermissionDialog(userItem)}
                        disabled={userItem.role === 'super_admin' && user?.role !== 'super_admin'}
                        className="gap-2"
                      >
                        <Shield className="h-4 w-4" />
                        {language === 'ar' ? 'تعديل الصلاحيات' : 'Modifier'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Default Role Permissions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {language === 'ar' ? 'الصلاحيات الافتراضية للأدوار' : 'Permissions par défaut des rôles'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.keys(roleNames).map(role => (
                <Card key={role} className={`border-2 ${roleColors[role]?.replace('text-', 'border-').replace('100', '200')}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <Badge className={roleColors[role]}>
                        {roleNames[role]?.[language === 'ar' ? 'ar' : 'fr']}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {defaultPermissions[role] && (
                      <div className="space-y-1">
                        <p>{language === 'ar' ? 'الصلاحيات الرئيسية:' : 'Permissions principales:'}</p>
                        <ul className="list-disc list-inside">
                          {Object.entries(defaultPermissions[role] || {}).slice(0, 5).map(([key, value]) => (
                            <li key={key} className={value ? 'text-green-600' : 'text-red-400'}>
                              {key}: {value === true ? '✓' : typeof value === 'object' ? 'مخصص' : '✗'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Permission Dialog */}
        <Dialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                {language === 'ar' ? 'تعديل صلاحيات' : 'Modifier permissions'}: {selectedUser?.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Copy from role */}
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Label>{language === 'ar' ? 'نسخ صلاحيات من دور:' : 'Copier de:'}</Label>
                <Select onValueChange={copyFromRole}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder={language === 'ar' ? 'اختر دور' : 'Choisir rôle'} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(roleNames).map(role => (
                      <SelectItem key={role} value={role}>
                        {roleNames[role]?.[language === 'ar' ? 'ar' : 'fr']}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Permission Categories */}
              <div className="space-y-3">
                {permissionCategories.map(category => (
                  <Card key={category.id}>
                    <CardHeader 
                      className="py-3 cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleCategory(category.id)}
                    >
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <span>{category.icon}</span>
                          {language === 'ar' ? category.name_ar : category.name_fr}
                        </CardTitle>
                        {expandedCategories[category.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </CardHeader>
                    {expandedCategories[category.id] && (
                      <CardContent className="pt-0">
                        <div className="space-y-3">
                          {category.permissions.map(permKey => {
                            const perm = userPermissions[permKey];
                            const isSimple = typeof perm === 'boolean' || perm === undefined;
                            
                            return (
                              <div key={permKey} className="border rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium capitalize">{permKey.replace('_', ' ')}</span>
                                  {isSimple && (
                                    <Switch
                                      checked={perm === true}
                                      onCheckedChange={() => togglePermission(permKey)}
                                    />
                                  )}
                                </div>
                                {!isSimple && typeof perm === 'object' && (
                                  <div className="grid grid-cols-3 gap-2 mt-2">
                                    {Object.keys(perm || {}).map(action => (
                                      <div key={action} className="flex items-center gap-2 text-sm">
                                        <Switch
                                          checked={perm[action] === true}
                                          onCheckedChange={() => togglePermission(permKey, action)}
                                          className="scale-75"
                                        />
                                        <span className="text-muted-foreground">
                                          {permissionActions[action]?.[language === 'ar' ? 'ar' : 'fr'] || action}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setShowPermissionDialog(false)}>
                  {language === 'ar' ? 'إلغاء' : 'Annuler'}
                </Button>
                <Button className="flex-1" onClick={savePermissions} disabled={saving}>
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin me-2" /> : <Save className="h-4 w-4 me-2" />}
                  {language === 'ar' ? 'حفظ الصلاحيات' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
