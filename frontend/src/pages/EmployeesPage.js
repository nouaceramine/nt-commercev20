import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { toast } from 'sonner';
import { 
  Users, Plus, Edit, Trash2, Calendar, DollarSign, Clock, UserPlus, KeyRound, UserX, Eye, EyeOff,
  TrendingUp, Wallet, CheckCircle, XCircle, AlertTriangle, Download, FileText, BarChart3, Briefcase
} from 'lucide-react';

export default function EmployeesPage() {
  const { t, language } = useLanguage();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', position: '', salary: '', commission_rate: '', hire_date: '' });
  const [attendanceData, setAttendanceData] = useState({ date: new Date().toISOString().split('T')[0], status: 'present', notes: '' });
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [accountData, setAccountData] = useState({ email: '', password: '', role: 'seller' });
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('employees');
  const [attendanceReport, setAttendanceReport] = useState([]);
  const [salaryMonth, setSalaryMonth] = useState(new Date().toISOString().slice(0, 7));
  const [salaryReport, setSalaryReport] = useState([]);

  // Statistics
  const stats = {
    totalEmployees: employees.length,
    totalSalaries: employees.reduce((sum, e) => sum + (e.salary || 0), 0),
    totalAdvances: employees.reduce((sum, e) => sum + (e.total_advances || 0), 0),
    totalCommissions: employees.reduce((sum, e) => sum + (e.total_commission || 0), 0),
    activeAccounts: employees.filter(e => e.user_id).length
  };

  const fetchEmployees = async () => {
    try {
      const res = await apiClient.get(`/employees`);
      setEmployees(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData, salary: parseFloat(formData.salary) || 0, commission_rate: parseFloat(formData.commission_rate) || 0 };
      if (selectedEmployee) {
        await apiClient.put(`/employees/${selectedEmployee.id}`, payload);
        toast.success(t.employeeUpdated);
      } else {
        await apiClient.post(`/employees`, payload);
        toast.success(t.employeeAdded);
      }
      setDialogOpen(false);
      resetForm();
      fetchEmployees();
    } catch (e) { toast.error(t.somethingWentWrong); }
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`/employees/${selectedEmployee.id}`);
      toast.success(t.employeeDeleted);
      setDeleteDialogOpen(false);
      fetchEmployees();
    } catch (e) { toast.error(t.somethingWentWrong); }
  };

  const handleAttendance = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post(`/employees/attendance`, { employee_id: selectedEmployee.id, ...attendanceData });
      toast.success(t.recordAttendance);
      setAttendanceDialogOpen(false);
    } catch (e) { toast.error(t.somethingWentWrong); }
  };

  const handleAdvance = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post(`/employees/advances`, { employee_id: selectedEmployee.id, amount: parseFloat(advanceAmount), notes: '' });
      toast.success(t.addAdvance);
      setAdvanceDialogOpen(false);
      setAdvanceAmount('');
      fetchEmployees();
    } catch (e) { toast.error(t.somethingWentWrong); }
  };

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!accountData.email || !accountData.password) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول' : 'Veuillez remplir tous les champs');
      return;
    }
    setCreatingAccount(true);
    try {
      await apiClient.post(`/employees/${selectedEmployee.id}/create-account`, accountData);
      toast.success(language === 'ar' ? 'تم إنشاء الحساب بنجاح' : 'Compte créé avec succès');
      setAccountDialogOpen(false);
      setAccountData({ email: '', password: '', role: 'seller' });
      fetchEmployees();
    } catch (e) {
      toast.error(e.response?.data?.detail || t.somethingWentWrong);
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleDeleteAccount = async (employeeId) => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من حذف حساب هذا الموظف؟' : 'Êtes-vous sûr de vouloir supprimer le compte?')) return;
    try {
      await apiClient.delete(`/employees/${employeeId}/delete-account`);
      toast.success(language === 'ar' ? 'تم حذف الحساب' : 'Compte supprimé');
      fetchEmployees();
    } catch (e) {
      toast.error(e.response?.data?.detail || t.somethingWentWrong);
    }
  };

  const resetForm = () => {
    setSelectedEmployee(null);
    setFormData({ name: '', phone: '', email: '', position: '', salary: '', commission_rate: '', hire_date: '' });
  };

  const openEdit = (emp) => {
    setSelectedEmployee(emp);
    setFormData({ name: emp.name, phone: emp.phone, email: emp.email, position: emp.position, salary: emp.salary.toString(), commission_rate: emp.commission_rate.toString(), hire_date: emp.hire_date });
    setDialogOpen(true);
  };

  // Fetch salary report
  const fetchSalaryReport = async () => {
    try {
      const res = await apiClient.get(`/employees/salary-report?month=${salaryMonth}`);
      setSalaryReport(res.data);
    } catch (e) {
      console.error(e);
      // Generate client-side report if API not available
      const report = employees.map(emp => ({
        employee_id: emp.id,
        employee_name: emp.name,
        position: emp.position,
        base_salary: emp.salary,
        commission: emp.total_commission || 0,
        advances: emp.total_advances || 0,
        net_salary: emp.salary + (emp.total_commission || 0) - (emp.total_advances || 0),
        attendance_days: 22,
        absence_days: 0
      }));
      setSalaryReport(report);
    }
  };

  // Calculate net salary
  const calculateNetSalary = (emp) => {
    return emp.salary + (emp.total_commission || 0) - (emp.total_advances || 0);
  };

  if (loading) return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="employees-page">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t.employees}</h1>
            <p className="text-muted-foreground">{employees.length} {t.employees}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { fetchSalaryReport(); setSalaryDialogOpen(true); }} className="gap-2">
              <FileText className="h-4 w-4" />
              {language === 'ar' ? 'جدول الرواتب' : 'Fiche de paie'}
            </Button>
            <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-2" data-testid="add-employee-btn">
              <Plus className="h-5 w-5" />{t.addEmployee}
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-blue-600">{language === 'ar' ? 'الموظفين' : 'Employés'}</p>
                  <p className="text-2xl font-bold text-blue-700">{stats.totalEmployees}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Wallet className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-green-600">{language === 'ar' ? 'إجمالي الرواتب' : 'Total salaires'}</p>
                  <p className="text-xl font-bold text-green-700">{stats.totalSalaries.toLocaleString()} {t.currency}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-purple-600">{language === 'ar' ? 'العمولات' : 'Commissions'}</p>
                  <p className="text-xl font-bold text-purple-700">{stats.totalCommissions.toLocaleString()} {t.currency}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-amber-600">{language === 'ar' ? 'السلف' : 'Avances'}</p>
                  <p className="text-xl font-bold text-amber-700">{stats.totalAdvances.toLocaleString()} {t.currency}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-cyan-50 border-cyan-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 rounded-lg">
                  <KeyRound className="h-5 w-5 text-cyan-600" />
                </div>
                <div>
                  <p className="text-xs text-cyan-600">{language === 'ar' ? 'حسابات نشطة' : 'Comptes actifs'}</p>
                  <p className="text-2xl font-bold text-cyan-700">{stats.activeAccounts}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Employees Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map(emp => (
            <Card key={emp.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{emp.name}</h3>
                    <p className="text-sm text-muted-foreground">{emp.position || t.employees}</p>
                    {emp.phone && <p className="text-sm mt-1" dir="ltr">{emp.phone}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(emp)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setSelectedEmployee(emp); setDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t text-sm">
                  <div><span className="text-muted-foreground">{t.salary}:</span> <span className="font-medium">{emp.salary} {t.currency}</span></div>
                  <div><span className="text-muted-foreground">{t.commissionRate}:</span> <span className="font-medium">{emp.commission_rate}%</span></div>
                  <div><span className="text-muted-foreground">{t.totalAdvances}:</span> <span className="font-medium text-amber-600">{emp.total_advances} {t.currency}</span></div>
                  <div><span className="text-muted-foreground">{t.totalCommission}:</span> <span className="font-medium text-emerald-600">{emp.total_commission} {t.currency}</span></div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSelectedEmployee(emp); setAttendanceDialogOpen(true); }}>
                    <Calendar className="h-4 w-4 me-1" />{t.attendance}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSelectedEmployee(emp); setAdvanceDialogOpen(true); }}>
                    <DollarSign className="h-4 w-4 me-1" />{t.advances}
                  </Button>
                </div>
                {/* Account Management */}
                <div className="mt-3 pt-3 border-t">
                  {emp.user_id ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <KeyRound className="h-4 w-4" />
                        <span>{language === 'ar' ? 'لديه حساب' : 'A un compte'}: {emp.user_email}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-destructive"
                        onClick={() => handleDeleteAccount(emp.id)}
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full gap-2"
                      onClick={() => { 
                        setSelectedEmployee(emp); 
                        setAccountData({ email: emp.email || '', password: '', role: 'seller' });
                        setAccountDialogOpen(true); 
                      }}
                      data-testid={`create-account-${emp.id}`}
                    >
                      <UserPlus className="h-4 w-4" />
                      {language === 'ar' ? 'إنشاء حساب دخول' : 'Créer un compte'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent><DialogHeader><DialogTitle>{selectedEmployee ? t.editEmployee : t.addEmployee}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t.employeeName} *</Label><Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required /></div>
                <div><Label>{t.position}</Label><Input value={formData.position} onChange={e => setFormData({...formData, position: e.target.value})} /></div>
                <div><Label>{t.phone}</Label><Input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} dir="ltr" /></div>
                <div><Label>{t.email}</Label><Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></div>
                <div><Label>{t.salary}</Label><Input type="number" value={formData.salary} onChange={e => setFormData({...formData, salary: e.target.value})} /></div>
                <div><Label>{t.commissionRate} (%)</Label><Input type="number" step="0.1" value={formData.commission_rate} onChange={e => setFormData({...formData, commission_rate: e.target.value})} /></div>
                <div className="col-span-2"><Label>{t.hireDate}</Label><Input type="date" value={formData.hire_date} onChange={e => setFormData({...formData, hire_date: e.target.value})} /></div>
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t.cancel}</Button><Button type="submit">{t.save}</Button></div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Attendance Dialog */}
        <Dialog open={attendanceDialogOpen} onOpenChange={setAttendanceDialogOpen}>
          <DialogContent><DialogHeader><DialogTitle>{t.recordAttendance} - {selectedEmployee?.name}</DialogTitle></DialogHeader>
            <form onSubmit={handleAttendance} className="space-y-4">
              <div><Label>{t.createdAt}</Label><Input type="date" value={attendanceData.date} onChange={e => setAttendanceData({...attendanceData, date: e.target.value})} /></div>
              <div><Label>{t.attendance}</Label>
                <Select value={attendanceData.status} onValueChange={v => setAttendanceData({...attendanceData, status: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">{t.present}</SelectItem>
                    <SelectItem value="absent">{t.absent}</SelectItem>
                    <SelectItem value="late">{t.late}</SelectItem>
                    <SelectItem value="leave">{t.leave}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t.notes}</Label><Input value={attendanceData.notes} onChange={e => setAttendanceData({...attendanceData, notes: e.target.value})} /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAttendanceDialogOpen(false)}>{t.cancel}</Button><Button type="submit">{t.save}</Button></div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Advance Dialog */}
        <Dialog open={advanceDialogOpen} onOpenChange={setAdvanceDialogOpen}>
          <DialogContent><DialogHeader><DialogTitle>{t.addAdvance} - {selectedEmployee?.name}</DialogTitle></DialogHeader>
            <form onSubmit={handleAdvance} className="space-y-4">
              <div><Label>{t.amount}</Label><Input type="number" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} required /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAdvanceDialogOpen(false)}>{t.cancel}</Button><Button type="submit">{t.save}</Button></div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t.deleteConfirm}</AlertDialogTitle><AlertDialogDescription>{selectedEmployee?.name}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>{t.cancel}</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">{t.delete}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create Account Dialog */}
        <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                {language === 'ar' ? 'إنشاء حساب دخول' : 'Créer un compte'} - {selectedEmployee?.name}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <Label>{language === 'ar' ? 'البريد الإلكتروني' : 'Email'} *</Label>
                <Input 
                  type="email" 
                  value={accountData.email} 
                  onChange={e => setAccountData({...accountData, email: e.target.value})} 
                  placeholder="example@email.com"
                  required 
                />
              </div>
              <div>
                <Label>{language === 'ar' ? 'كلمة المرور' : 'Mot de passe'} *</Label>
                <div className="relative">
                  <Input 
                    type={showPassword ? 'text' : 'password'} 
                    value={accountData.password} 
                    onChange={e => setAccountData({...accountData, password: e.target.value})} 
                    placeholder="********"
                    required
                    className="pe-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>{language === 'ar' ? 'الدور' : 'Rôle'}</Label>
                <Select value={accountData.role} onValueChange={v => setAccountData({...accountData, role: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seller">{language === 'ar' ? 'بائع' : 'Vendeur'}</SelectItem>
                    <SelectItem value="manager">{language === 'ar' ? 'مشرف' : 'Manager'}</SelectItem>
                    <SelectItem value="accountant">{language === 'ar' ? 'محاسب' : 'Comptable'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setAccountDialogOpen(false)}>{t.cancel}</Button>
                <Button type="submit" disabled={creatingAccount}>
                  {creatingAccount ? <Clock className="h-4 w-4 animate-spin me-2" /> : <UserPlus className="h-4 w-4 me-2" />}
                  {language === 'ar' ? 'إنشاء الحساب' : 'Créer le compte'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Salary Report Dialog */}
        <Dialog open={salaryDialogOpen} onOpenChange={setSalaryDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {language === 'ar' ? 'جدول الرواتب الشهري' : 'Fiche de paie mensuelle'}
              </DialogTitle>
              <CardDescription>
                {language === 'ar' ? 'تفاصيل الرواتب والعمولات والسلف لجميع الموظفين' : 'Détails des salaires, commissions et avances'}
              </CardDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Month Selector */}
              <div className="flex items-center gap-4">
                <Label>{language === 'ar' ? 'الشهر' : 'Mois'}</Label>
                <Input
                  type="month"
                  value={salaryMonth}
                  onChange={(e) => { setSalaryMonth(e.target.value); }}
                  className="w-48"
                />
                <Button variant="outline" onClick={fetchSalaryReport} size="sm">
                  {language === 'ar' ? 'تحديث' : 'Actualiser'}
                </Button>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="bg-blue-50">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-blue-600">{language === 'ar' ? 'إجمالي الرواتب' : 'Total salaires'}</p>
                    <p className="text-lg font-bold text-blue-700">{stats.totalSalaries.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-50">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-green-600">{language === 'ar' ? 'العمولات' : 'Commissions'}</p>
                    <p className="text-lg font-bold text-green-700">{stats.totalCommissions.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card className="bg-amber-50">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-amber-600">{language === 'ar' ? 'السلف' : 'Avances'}</p>
                    <p className="text-lg font-bold text-amber-700">{stats.totalAdvances.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-purple-600">{language === 'ar' ? 'صافي المستحق' : 'Net à payer'}</p>
                    <p className="text-lg font-bold text-purple-700">
                      {(stats.totalSalaries + stats.totalCommissions - stats.totalAdvances).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Salary Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[100px]">{language === 'ar' ? 'الرمز' : 'Code'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الموظف' : 'Employé'}</TableHead>
                      <TableHead>{language === 'ar' ? 'المنصب' : 'Poste'}</TableHead>
                      <TableHead className="text-center">{language === 'ar' ? 'الراتب الأساسي' : 'Salaire base'}</TableHead>
                      <TableHead className="text-center">{language === 'ar' ? 'العمولة' : 'Commission'}</TableHead>
                      <TableHead className="text-center">{language === 'ar' ? 'السلف' : 'Avances'}</TableHead>
                      <TableHead className="text-center">{language === 'ar' ? 'صافي المستحق' : 'Net'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map(emp => {
                      const netSalary = calculateNetSalary(emp);
                      return (
                        <TableRow key={emp.id}>
                          <TableCell>
                            <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                              {emp.code || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell>{emp.position || '-'}</TableCell>
                          <TableCell className="text-center">{emp.salary?.toLocaleString()} {t.currency}</TableCell>
                          <TableCell className="text-center text-green-600">+{(emp.total_commission || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-center text-amber-600">-{(emp.total_advances || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-center font-bold">
                            <Badge variant={netSalary >= 0 ? 'default' : 'destructive'}>
                              {netSalary.toLocaleString()} {t.currency}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Print Button */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSalaryDialogOpen(false)}>
                  {language === 'ar' ? 'إغلاق' : 'Fermer'}
                </Button>
                <Button onClick={() => window.print()} className="gap-2">
                  <Download className="h-4 w-4" />
                  {language === 'ar' ? 'طباعة' : 'Imprimer'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
