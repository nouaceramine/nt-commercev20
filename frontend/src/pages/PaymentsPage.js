import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { 
  CreditCard, 
  Plus, 
  RefreshCw, 
  Search,
  FileText,
  Trash2,
  Edit2,
  Download,
  CheckCircle,
  Clock,
  XCircle,
  DollarSign,
  TrendingUp,
  Calendar,
  ExternalLink
} from 'lucide-react';

export default function PaymentsPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [packages, setPackages] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({
    tenant_id: '',
    amount: '',
    currency: 'dzd',
    payment_method: 'cash',
    description: '',
    invoice_number: '',
    status: 'pending'
  });
  
  const [selectedPackage, setSelectedPackage] = useState('');

  useEffect(() => {
    fetchRecords();
    fetchPackages();
  }, [page, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRecords = async () => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ page, limit: 20 });
      if (statusFilter) params.append('status', statusFilter);
      
      const response = await apiClient.get(`/payments/records?${params}`);
      setRecords(response.data.records);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Error fetching records:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPackages = async () => {
    try {
      const response = await apiClient.get(`/payments/packages`);
      setPackages(response.data);
    } catch (error) {
      console.error('Error fetching packages:', error);
    }
  };

  const handleCreateRecord = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error(language === 'ar' ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount');
      return;
    }
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/payments/records`, {
        ...formData,
        amount: parseFloat(formData.amount)
      });
      
      toast.success(language === 'ar' ? 'تم إنشاء سجل الدفع' : 'Payment record created');
      setShowAddDialog(false);
      setFormData({
        tenant_id: '',
        amount: '',
        currency: 'dzd',
        payment_method: 'cash',
        description: '',
        invoice_number: '',
        status: 'pending'
      });
      fetchRecords();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'فشل الإنشاء' : 'Failed to create'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRecord = async () => {
    if (!selectedRecord) return;
    
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/payments/records/${selectedRecord.id}`, {
        status: formData.status,
        notes: formData.notes,
        invoice_number: formData.invoice_number
      });
      
      toast.success(language === 'ar' ? 'تم تحديث السجل' : 'Record updated');
      setShowEditDialog(false);
      fetchRecords();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'فشل التحديث' : 'Failed to update'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (recordId) => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من الحذف؟' : 'Are you sure you want to delete?')) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/payments/records/${recordId}`);
      toast.success(language === 'ar' ? 'تم الحذف' : 'Deleted');
      fetchRecords();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'فشل الحذف' : 'Failed to delete'));
    }
  };

  const handleCreateCheckout = async () => {
    if (!selectedPackage) {
      toast.error(language === 'ar' ? 'يرجى اختيار باقة' : 'Please select a package');
      return;
    }
    
    setSaving(true);
    try {
      const response = await apiClient.post(`/payments/create-checkout`, {
        package_id: selectedPackage,
        origin_url: window.location.origin
      });
      
      // Open Stripe checkout in new window
      window.open(response.data.url, '_blank');
      toast.success(language === 'ar' ? 'تم فتح صفحة الدفع' : 'Payment page opened');
      setShowCheckoutDialog(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'فشل إنشاء جلسة الدفع' : 'Failed to create checkout'));
    } finally {
      setSaving(false);
    }
  };

  const handleViewInvoice = (recordId) => {
    const token = localStorage.getItem('token');
    window.open(`/payments/invoice/${recordId}?token=${token}`, '_blank');
  };

  const openEditDialog = (record) => {
    setSelectedRecord(record);
    setFormData({
      status: record.payment_status || 'pending',
      notes: record.notes || '',
      invoice_number: record.invoice_number || ''
    });
    setShowEditDialog(true);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-700 gap-1"><CheckCircle className="h-3 w-3" /> {language === 'ar' ? 'مدفوع' : 'Paid'}</Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700 gap-1"><Clock className="h-3 w-3" /> {language === 'ar' ? 'قيد الانتظار' : 'Pending'}</Badge>;
      case 'failed':
      case 'expired':
        return <Badge className="bg-red-100 text-red-700 gap-1"><XCircle className="h-3 w-3" /> {language === 'ar' ? 'فشل' : 'Failed'}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Calculate stats
  const stats = {
    total: records.length,
    paid: records.filter(r => r.payment_status === 'paid').length,
    pending: records.filter(r => r.payment_status === 'pending').length,
    totalAmount: records.filter(r => r.payment_status === 'paid').reduce((sum, r) => sum + (r.amount || 0), 0)
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-primary" />
              {language === 'ar' ? 'إدارة المدفوعات' : 'Payments Management'}
            </h1>
            <p className="text-muted-foreground">
              {language === 'ar' 
                ? 'إدارة المدفوعات والاشتراكات والفواتير' 
                : 'Manage payments, subscriptions, and invoices'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowCheckoutDialog(true)} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              {language === 'ar' ? 'دفع اشتراك' : 'Pay Subscription'}
            </Button>
            <Button onClick={() => setShowAddDialog(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              {language === 'ar' ? 'إضافة سجل' : 'Add Record'}
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-100">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي السجلات' : 'Total Records'}</p>
                  <p className="text-2xl font-bold">{total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-100">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'مدفوع' : 'Paid'}</p>
                  <p className="text-2xl font-bold">{stats.paid}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-100">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'قيد الانتظار' : 'Pending'}</p>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-purple-100">
                  <DollarSign className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي المحصل' : 'Total Collected'}</p>
                  <p className="text-2xl font-bold">{stats.totalAmount.toLocaleString()} دج</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={language === 'ar' ? 'بحث...' : 'Search...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </div>
              <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={language === 'ar' ? 'جميع الحالات' : 'All Statuses'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'جميع الحالات' : 'All Statuses'}</SelectItem>
                  <SelectItem value="paid">{language === 'ar' ? 'مدفوع' : 'Paid'}</SelectItem>
                  <SelectItem value="pending">{language === 'ar' ? 'قيد الانتظار' : 'Pending'}</SelectItem>
                  <SelectItem value="failed">{language === 'ar' ? 'فشل' : 'Failed'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Records Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'رقم الفاتورة' : 'Invoice #'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المبلغ' : 'Amount'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {language === 'ar' ? 'لا توجد سجلات' : 'No records found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono text-sm">
                        {record.invoice_number || record.id?.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        {record.description || record.package_name || (language === 'ar' ? 'دفعة' : 'Payment')}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {record.amount?.toLocaleString()} {record.currency?.toUpperCase() || 'دج'}
                      </TableCell>
                      <TableCell>{getStatusBadge(record.payment_status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {record.created_at?.slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditDialog(record)}
                            title={language === 'ar' ? 'تعديل' : 'Edit'}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleViewInvoice(record.id)}
                            title={language === 'ar' ? 'فاتورة' : 'Invoice'}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDeleteRecord(record.id)}
                            title={language === 'ar' ? 'حذف' : 'Delete'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {total > 20 && (
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              {language === 'ar' ? 'السابق' : 'Previous'}
            </Button>
            <span className="flex items-center px-4 text-sm">
              {language === 'ar' ? `صفحة ${page}` : `Page ${page}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={records.length < 20}
            >
              {language === 'ar' ? 'التالي' : 'Next'}
            </Button>
          </div>
        )}
      </div>

      {/* Add Record Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{language === 'ar' ? 'إضافة سجل دفع' : 'Add Payment Record'}</DialogTitle>
            <DialogDescription>
              {language === 'ar' ? 'إضافة سجل دفع يدوي' : 'Add a manual payment record'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{language === 'ar' ? 'المبلغ' : 'Amount'}</Label>
              <Input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>{language === 'ar' ? 'الوصف' : 'Description'}</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={language === 'ar' ? 'وصف الدفعة' : 'Payment description'}
              />
            </div>
            <div>
              <Label>{language === 'ar' ? 'طريقة الدفع' : 'Payment Method'}</Label>
              <Select 
                value={formData.payment_method} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, payment_method: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{language === 'ar' ? 'نقداً' : 'Cash'}</SelectItem>
                  <SelectItem value="bank">{language === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</SelectItem>
                  <SelectItem value="card">{language === 'ar' ? 'بطاقة' : 'Card'}</SelectItem>
                  <SelectItem value="other">{language === 'ar' ? 'أخرى' : 'Other'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{language === 'ar' ? 'الحالة' : 'Status'}</Label>
              <Select 
                value={formData.status} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{language === 'ar' ? 'قيد الانتظار' : 'Pending'}</SelectItem>
                  <SelectItem value="paid">{language === 'ar' ? 'مدفوع' : 'Paid'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleCreateRecord} disabled={saving}>
              {saving && <RefreshCw className="h-4 w-4 animate-spin me-2" />}
              {language === 'ar' ? 'إضافة' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Record Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{language === 'ar' ? 'تعديل سجل الدفع' : 'Edit Payment Record'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{language === 'ar' ? 'الحالة' : 'Status'}</Label>
              <Select 
                value={formData.status} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{language === 'ar' ? 'قيد الانتظار' : 'Pending'}</SelectItem>
                  <SelectItem value="paid">{language === 'ar' ? 'مدفوع' : 'Paid'}</SelectItem>
                  <SelectItem value="failed">{language === 'ar' ? 'فشل' : 'Failed'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{language === 'ar' ? 'رقم الفاتورة' : 'Invoice Number'}</Label>
              <Input
                value={formData.invoice_number}
                onChange={(e) => setFormData(prev => ({ ...prev, invoice_number: e.target.value }))}
              />
            </div>
            <div>
              <Label>{language === 'ar' ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleUpdateRecord} disabled={saving}>
              {saving && <RefreshCw className="h-4 w-4 animate-spin me-2" />}
              {language === 'ar' ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout Dialog */}
      <Dialog open={showCheckoutDialog} onOpenChange={setShowCheckoutDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{language === 'ar' ? 'اختر باقة الاشتراك' : 'Choose Subscription Package'}</DialogTitle>
            <DialogDescription>
              {language === 'ar' ? 'اختر الباقة المناسبة لك وادفع عبر Stripe' : 'Choose your package and pay via Stripe'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                onClick={() => setSelectedPackage(pkg.id)}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedPackage === pkg.id 
                    ? 'border-primary bg-primary/5 ring-2 ring-primary' 
                    : 'hover:border-primary/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{pkg.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {pkg.duration_days} {language === 'ar' ? 'يوم' : 'days'}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-primary">
                    {pkg.amount.toLocaleString()} دج
                  </p>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckoutDialog(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleCreateCheckout} disabled={saving || !selectedPackage} className="gap-2">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {language === 'ar' ? 'الدفع الآن' : 'Pay Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
