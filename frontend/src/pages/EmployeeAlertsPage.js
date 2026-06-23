import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Slider } from '../components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import { 
  Users, Bell, AlertTriangle, Settings2, Shield, 
  User, Percent, DollarSign, Clock, TrendingUp,
  ChevronRight, Edit, Save, CheckCircle, XCircle
} from 'lucide-react';

export default function EmployeeAlertsPage() {
  const { t, language, isRTL } = useLanguage();
  
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [alertSettings, setAlertSettings] = useState({});
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [limitsForm, setLimitsForm] = useState({
    max_discount_percent: 0,
    max_debt_amount: 0
  });

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Fetch employees
      const empRes = await apiClient.get(`/employees`);
      setEmployees(empRes.data);
      
      // Fetch active alerts
      const alertsRes = await apiClient.get(`/employees/alerts/active`);
      setActiveAlerts(alertsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = async (employee) => {
    setSelectedEmployee(employee);
    setLimitsForm({
      max_discount_percent: employee.max_discount_percent || 0,
      max_debt_amount: employee.max_debt_amount || 0
    });
    
    try {
      const token = localStorage.getItem('token');
      const res = await apiClient.get(`/employees/${employee.id}/alert-settings`);
      setAlertSettings(res.data);
    } catch (error) {
      setAlertSettings({
        enable_discount_alert: true,
        discount_threshold_percent: 80,
        enable_debt_alert: true,
        debt_threshold_percent: 80
      });
    }
    
    setEditDialogOpen(true);
  };

  const handleSaveLimits = async () => {
    setSaving(true);
    try {
      
      // Update employee limits
      await apiClient.put(`/employees/${selectedEmployee.id}`, limitsForm);
      
      // Update alert settings
      await apiClient.put(`/employees/${selectedEmployee.id}/alert-settings`, {
        employee_id: selectedEmployee.id,
        ...alertSettings
      });
      
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات' : 'Paramètres enregistrés');
      setEditDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'حدث خطأ' : 'Erreur'));
    } finally {
      setSaving(false);
    }
  };

  const getSeverityColor = (severity) => {
    return severity === 'high' ? 'destructive' : 'outline';
  };

  const getSeverityBg = (severity) => {
    return severity === 'high' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';
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
      <div className="space-y-6 animate-fade-in" data-testid="employee-alerts-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              {language === 'ar' ? 'تنبيهات الموظفين' : 'Alertes employés'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'إدارة حدود الخصم والدين للموظفين' : 'Gérer les limites de remise et dette des employés'}
            </p>
          </div>
        </div>

        {/* Active Alerts */}
        {activeAlerts.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
                {language === 'ar' ? 'تنبيهات نشطة' : 'Alertes actives'} ({activeAlerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeAlerts.map((alert, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${getSeverityBg(alert.severity)}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {alert.type === 'discount_limit' ? (
                        <Percent className="h-5 w-5 text-amber-600" />
                      ) : (
                        <DollarSign className="h-5 w-5 text-amber-600" />
                      )}
                      <div>
                        <p className="font-medium">{language === 'ar' ? alert.message_ar : alert.message_en}</p>
                        <p className="text-sm text-muted-foreground">
                          {alert.percent_used}% {language === 'ar' ? 'مستخدم' : 'utilisé'}
                        </p>
                      </div>
                    </div>
                    <Badge variant={getSeverityColor(alert.severity)}>
                      {alert.severity === 'high' 
                        ? (language === 'ar' ? 'حرج' : 'Critique')
                        : (language === 'ar' ? 'تحذير' : 'Attention')
                      }
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي الموظفين' : 'Total employés'}</p>
                  <p className="text-2xl font-bold">{employees.length}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'موظفين بحدود' : 'Avec limites'}</p>
                  <p className="text-2xl font-bold">
                    {employees.filter(e => e.max_discount_percent > 0 || e.max_debt_amount > 0).length}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'تنبيهات نشطة' : 'Alertes actives'}</p>
                  <p className="text-2xl font-bold text-amber-600">{activeAlerts.length}</p>
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <Bell className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Employees Table */}
        <Card>
          <CardHeader>
            <CardTitle>{language === 'ar' ? 'إعدادات حدود الموظفين' : 'Limites des employés'}</CardTitle>
            <CardDescription>
              {language === 'ar' ? 'اضغط على موظف لتعديل حدوده' : 'Cliquez sur un employé pour modifier ses limites'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'الموظف' : 'Employé'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المنصب' : 'Poste'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'حد الخصم' : 'Limite remise'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'حد الدين' : 'Limite dette'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'الحالة' : 'État'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map(emp => {
                  const hasAlert = activeAlerts.some(a => a.employee_id === emp.id);
                  return (
                    <TableRow key={emp.id} className={hasAlert ? 'bg-amber-50/50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{emp.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {emp.position || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        {emp.max_discount_percent > 0 ? (
                          <Badge variant="outline">{emp.max_discount_percent}%</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">{language === 'ar' ? 'غير محدد' : 'Non défini'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {emp.max_debt_amount > 0 ? (
                          <Badge variant="outline">{emp.max_debt_amount.toFixed(0)} {t.currency}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">{language === 'ar' ? 'غير محدد' : 'Non défini'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasAlert ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {language === 'ar' ? 'تنبيه' : 'Alerte'}
                          </Badge>
                        ) : emp.max_discount_percent > 0 || emp.max_debt_amount > 0 ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            {language === 'ar' ? 'عادي' : 'Normal'}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(emp)}>
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                {language === 'ar' ? 'إعدادات الحدود' : 'Paramètres des limites'}
              </DialogTitle>
              <DialogDescription>
                {selectedEmployee?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {/* Discount Limit */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  {language === 'ar' ? 'حد الخصم المسموح (%)' : 'Limite de remise (%)'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={limitsForm.max_discount_percent}
                  onChange={(e) => setLimitsForm({...limitsForm, max_discount_percent: parseFloat(e.target.value) || 0})}
                />
                
                <div className="flex items-center justify-between pt-2">
                  <Label className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'تفعيل التنبيه' : 'Activer l\'alerte'}
                  </Label>
                  <Switch
                    checked={alertSettings.enable_discount_alert}
                    onCheckedChange={(checked) => setAlertSettings({...alertSettings, enable_discount_alert: checked})}
                  />
                </div>
                
                {alertSettings.enable_discount_alert && (
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      {language === 'ar' ? `تنبيه عند الوصول لـ ${alertSettings.discount_threshold_percent}%` : `Alerte à ${alertSettings.discount_threshold_percent}%`}
                    </Label>
                    <Slider
                      value={[alertSettings.discount_threshold_percent || 80]}
                      onValueChange={(val) => setAlertSettings({...alertSettings, discount_threshold_percent: val[0]})}
                      min={50}
                      max={100}
                      step={5}
                    />
                  </div>
                )}
              </div>

              {/* Debt Limit */}
              <div className="space-y-3 pt-4 border-t">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {language === 'ar' ? `حد الدين المسموح (${t.currency})` : `Limite de dette (${t.currency})`}
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={limitsForm.max_debt_amount}
                  onChange={(e) => setLimitsForm({...limitsForm, max_debt_amount: parseFloat(e.target.value) || 0})}
                />
                
                <div className="flex items-center justify-between pt-2">
                  <Label className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'تفعيل التنبيه' : 'Activer l\'alerte'}
                  </Label>
                  <Switch
                    checked={alertSettings.enable_debt_alert}
                    onCheckedChange={(checked) => setAlertSettings({...alertSettings, enable_debt_alert: checked})}
                  />
                </div>
                
                {alertSettings.enable_debt_alert && (
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      {language === 'ar' ? `تنبيه عند الوصول لـ ${alertSettings.debt_threshold_percent}%` : `Alerte à ${alertSettings.debt_threshold_percent}%`}
                    </Label>
                    <Slider
                      value={[alertSettings.debt_threshold_percent || 80]}
                      onValueChange={(val) => setAlertSettings({...alertSettings, debt_threshold_percent: val[0]})}
                      min={50}
                      max={100}
                      step={5}
                    />
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                {language === 'ar' ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button onClick={handleSaveLimits} disabled={saving}>
                <Save className="h-4 w-4 me-2" />
                {saving ? (language === 'ar' ? 'جاري الحفظ...' : 'Enregistrement...') : (language === 'ar' ? 'حفظ' : 'Enregistrer')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
