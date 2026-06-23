import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Checkbox } from '../components/ui/checkbox';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { toast } from 'sonner';
import { 
  Users, 
  DollarSign, 
  Search,
  CreditCard,
  Banknote,
  Phone,
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
  Eye,
  Wallet,
  MessageSquare,
  Send,
  Settings,
  Clock,
  History
} from 'lucide-react';

export default function CustomerDebtsPage() {
  const { t, language, isRTL } = useLanguage();
  const [debtsSummary, setDebtsSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('debt_desc');
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  
  // Payment dialog
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Debt details dialog
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [customerDebtDetails, setCustomerDebtDetails] = useState(null);
  
  // SMS state
  const [showSmsDialog, setShowSmsDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [smsTemplates, setSmsTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [sendingBulk, setSendingBulk] = useState(false);
  const [smsSettings, setSmsSettings] = useState({
    auto_reminder_enabled: false,
    reminder_frequency: 'weekly',
    reminder_day: 1,
    reminder_time: '09:00',
    min_debt_amount: 100,
    message_template: ''
  });
  const [smsLogs, setSmsLogs] = useState([]);

  useEffect(() => {
    fetchDebtsSummary();
    fetchSmsTemplates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchDebtsSummary = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/debts/summary`);
      setDebtsSummary(response.data);
    } catch (error) {
      console.error('Error fetching debts summary:', error);
      toast.error(t.error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSmsTemplates = async () => {
    try {
      const response = await apiClient.get(`/sms/templates`);
      setSmsTemplates(response.data.templates);
      if (response.data.templates.length > 0) {
        setSelectedTemplate(response.data.templates[0].id);
        setCustomMessage(response.data.templates[0].template);
      }
    } catch (error) {
      console.error('Error fetching SMS templates:', error);
    }
  };

  const fetchSmsSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/sms/settings`);
      setSmsSettings(response.data);
    } catch (error) {
      console.error('Error fetching SMS settings:', error);
    }
  };

  const fetchSmsLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/sms/logs`);
      setSmsLogs(response.data.logs);
    } catch (error) {
      console.error('Error fetching SMS logs:', error);
    }
  };

  const fetchCustomerDebtDetails = async (customerId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/customers/${customerId}/debt`);
      setCustomerDebtDetails(response.data);
      setShowDetailsDialog(true);
    } catch (error) {
      console.error('Error fetching customer debt details:', error);
      toast.error(t.error);
    }
  };

  const handlePayDebt = async () => {
    if (!selectedCustomer || paymentAmount <= 0) {
      toast.error(language === 'ar' ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount');
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/customers/${selectedCustomer.customer_id}/debt/pay`, {
        customer_id: selectedCustomer.customer_id,
        amount: paymentAmount,
        payment_method: paymentMethod,
        notes: paymentNotes
      });
      
      toast.success(t.debtPaid);
      setShowPaymentDialog(false);
      setSelectedCustomer(null);
      setPaymentAmount(0);
      setPaymentNotes('');
      fetchDebtsSummary();
    } catch (error) {
      console.error('Error paying debt:', error);
      toast.error(error.response?.data?.detail || t.error);
    } finally {
      setSubmitting(false);
    }
  };

  const openPaymentDialog = (customer) => {
    setSelectedCustomer(customer);
    setPaymentAmount(customer.total_debt);
    setShowPaymentDialog(true);
  };

  const exportToExcel = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/debts/export`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `debts_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success(language === 'ar' ? 'تم تصدير الملف بنجاح' : 'File exported successfully');
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error(t.error);
    }
  };

  const handleTemplateChange = (templateId) => {
    setSelectedTemplate(templateId);
    const template = smsTemplates.find(t => t.id === templateId);
    if (template) {
      setCustomMessage(template.template);
    }
  };

  const sendSmsToSelected = async () => {
    if (selectedCustomers.length === 0) {
      toast.error(t.noCustomersSelected);
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.post(`/sms/send-reminder`, {
        customer_ids: selectedCustomers,
        message_template: customMessage
      });
      
      toast.success(`${t.remindersSent}: ${response.data.success}/${response.data.total}`);
      setShowSmsDialog(false);
      setSelectedCustomers([]);
    } catch (error) {
      console.error('Error sending SMS:', error);
      toast.error(t.error);
    } finally {
      setSubmitting(false);
    }
  };

  const sendBulkReminder = async () => {
    setSendingBulk(true);
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.post(`/sms/send-bulk-reminder`, {});
      
      toast.success(`${t.remindersSent}: ${response.data.success}/${response.data.total}`);
    } catch (error) {
      console.error('Error sending bulk SMS:', error);
      toast.error(t.error);
    } finally {
      setSendingBulk(false);
    }
  };

  const saveSmsSettings = async () => {
    try {
      await apiClient.put(`/sms/settings`, smsSettings);
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات' : 'Settings saved');
      setShowSettingsDialog(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(t.error);
    }
  };

  const toggleCustomerSelection = (customerId) => {
    setSelectedCustomers(prev => 
      prev.includes(customerId)
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const selectAllCustomers = () => {
    const allIds = filteredDebts.map(d => d.customer_id);
    setSelectedCustomers(selectedCustomers.length === allIds.length ? [] : allIds);
  };

  // Filter and sort debts
  const filteredDebts = debtsSummary?.debts?.filter(debt => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      debt.customer_name.toLowerCase().includes(query) ||
      debt.customer_phone?.toLowerCase().includes(query)
    );
  }) || [];

  const sortedDebts = [...filteredDebts].sort((a, b) => {
    switch (sortBy) {
      case 'debt_desc': return b.total_debt - a.total_debt;
      case 'debt_asc': return a.total_debt - b.total_debt;
      case 'name_asc': return a.customer_name.localeCompare(b.customer_name);
      case 'name_desc': return b.customer_name.localeCompare(a.customer_name);
      case 'sales_desc': return b.sales_count - a.sales_count;
      default: return 0;
    }
  });

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">{t.customerDebts}</h1>
            <p className="text-muted-foreground">
              {language === 'ar' ? 'متابعة وتحصيل ديون الزبائن' : 'Track and collect customer debts'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline" 
              onClick={() => { fetchSmsSettings(); setShowSettingsDialog(true); }}
              data-testid="sms-settings-btn"
            >
              <Settings className="h-4 w-4 me-2" />
              {t.smsSettings}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => { fetchSmsLogs(); setShowLogsDialog(true); }}
            >
              <History className="h-4 w-4 me-2" />
              {t.smsLogs}
            </Button>
            <Button onClick={exportToExcel} variant="outline" data-testid="export-debts-btn">
              <FileSpreadsheet className="h-4 w-4 me-2" />
              {t.exportExcel}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-200 dark:border-red-900">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.totalDebt}</p>
                  <p className="text-3xl font-bold text-red-600">
                    {(debtsSummary?.total_outstanding || 0).toLocaleString()} {t.currency}
                  </p>
                </div>
                <div className="p-3 bg-red-500/10 rounded-full">
                  <DollarSign className="h-8 w-8 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'عدد المدينين' : 'With Debt'}
                  </p>
                  <p className="text-3xl font-bold">{debtsSummary?.customers_with_debt || 0}</p>
                </div>
                <div className="p-3 bg-primary/10 rounded-full">
                  <Users className="h-8 w-8 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'متوسط الدين' : 'Average'}
                  </p>
                  <p className="text-3xl font-bold">
                    {debtsSummary?.customers_with_debt > 0 
                      ? Math.round(debtsSummary.total_outstanding / debtsSummary.customers_with_debt).toLocaleString()
                      : 0} {t.currency}
                  </p>
                </div>
                <div className="p-3 bg-amber-500/10 rounded-full">
                  <AlertCircle className="h-8 w-8 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-200 dark:border-blue-900">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t.smsProvider}</p>
                  <p className="text-sm font-medium text-blue-600">{t.providerMocked}</p>
                </div>
                <div className="p-3 bg-blue-500/10 rounded-full">
                  <MessageSquare className="h-8 w-8 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & SMS Actions */}
        <div className="flex gap-4 flex-wrap items-center">
          <div className="relative flex-1 min-w-[250px]">
            <Search className={`absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input
              placeholder={language === 'ar' ? 'بحث باسم الزبون أو الهاتف...' : 'Search...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`h-11 ${isRTL ? 'pr-10' : 'pl-10'}`}
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="debt_desc">{language === 'ar' ? 'الدين (الأعلى)' : 'Debt (High)'}</SelectItem>
              <SelectItem value="debt_asc">{language === 'ar' ? 'الدين (الأقل)' : 'Debt (Low)'}</SelectItem>
              <SelectItem value="name_asc">{language === 'ar' ? 'الاسم (أ-ي)' : 'Name (A-Z)'}</SelectItem>
            </SelectContent>
          </Select>
          
          {/* SMS Buttons */}
          {selectedCustomers.length > 0 && (
            <Button onClick={() => setShowSmsDialog(true)} data-testid="send-sms-btn">
              <Send className="h-4 w-4 me-2" />
              {t.sendReminder} ({selectedCustomers.length})
            </Button>
          )}
          <Button 
            variant="secondary" 
            onClick={sendBulkReminder}
            disabled={sendingBulk || (debtsSummary?.customers_with_debt || 0) === 0}
          >
            <MessageSquare className="h-4 w-4 me-2" />
            {sendingBulk ? t.sendingReminders : t.sendBulkReminder}
          </Button>
        </div>

        {/* Debts Table */}
        <div className="bg-card rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox 
                    checked={selectedCustomers.length === filteredDebts.length && filteredDebts.length > 0}
                    onCheckedChange={selectAllCustomers}
                  />
                </TableHead>
                <TableHead>{language === 'ar' ? 'الزبون' : 'Customer'}</TableHead>
                <TableHead>{t.phone}</TableHead>
                <TableHead>{language === 'ar' ? 'الفواتير' : 'Invoices'}</TableHead>
                <TableHead>{t.totalDebt}</TableHead>
                <TableHead>{t.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedDebts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
                    <p className="text-lg font-medium text-green-600">
                      {language === 'ar' ? 'لا توجد ديون مستحقة!' : 'No debts!'}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                sortedDebts.map((debt) => (
                  <TableRow key={debt.customer_id}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedCustomers.includes(debt.customer_id)}
                        onCheckedChange={() => toggleCustomerSelection(debt.customer_id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{debt.customer_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {debt.sales_count} {language === 'ar' ? 'فاتورة' : 'inv'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {debt.customer_phone ? (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span dir="ltr">{debt.customer_phone}</span>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{debt.sales_count}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-lg font-bold text-red-600">
                        {debt.total_debt.toLocaleString()} {t.currency}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => fetchCustomerDebtDetails(debt.customer_id)}>
                          <Eye className="h-4 w-4 me-1" />
                          {language === 'ar' ? 'تفاصيل' : 'Details'}
                        </Button>
                        <Button size="sm" onClick={() => openPaymentDialog(debt)}>
                          <CreditCard className="h-4 w-4 me-1" />
                          {t.payDebt}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* SMS Dialog */}
        <Dialog open={showSmsDialog} onOpenChange={setShowSmsDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t.sendReminder}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm">{language === 'ar' ? 'سيتم إرسال تذكير إلى' : 'Will send to'}: <strong>{selectedCustomers.length}</strong> {language === 'ar' ? 'زبون' : 'customers'}</p>
              </div>
              
              <div>
                <Label>{t.selectTemplate}</Label>
                <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {smsTemplates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {language === 'ar' ? t.name_ar : t.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>{t.customMessage}</Label>
                <Textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={4}
                  placeholder="{customer_name}, {debt_amount}"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {language === 'ar' ? 'المتغيرات: {customer_name}, {debt_amount}' : 'Variables: {customer_name}, {debt_amount}'}
                </p>
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowSmsDialog(false)} className="flex-1">
                  {t.cancel}
                </Button>
                <Button onClick={sendSmsToSelected} className="flex-1" disabled={submitting}>
                  <Send className="h-4 w-4 me-2" />
                  {submitting ? t.sendingReminders : t.sendReminder}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Settings Dialog */}
        <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t.smsSettings}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">{t.autoReminder}</p>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'إرسال تذكيرات تلقائية للمدينين' : 'Auto send reminders'}
                  </p>
                </div>
                <Switch
                  checked={smsSettings.auto_reminder_enabled}
                  onCheckedChange={(checked) => setSmsSettings({...smsSettings, auto_reminder_enabled: checked})}
                />
              </div>
              
              {smsSettings.auto_reminder_enabled && (
                <>
                  <div>
                    <Label>{t.reminderFrequency}</Label>
                    <Select 
                      value={smsSettings.reminder_frequency} 
                      onValueChange={(v) => setSmsSettings({...smsSettings, reminder_frequency: v})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">{t.daily}</SelectItem>
                        <SelectItem value="weekly">{t.weekly}</SelectItem>
                        <SelectItem value="monthly">{t.monthly}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>{t.reminderDay}</Label>
                      <Input
                        type="number"
                        min="1"
                        max={smsSettings.reminder_frequency === 'weekly' ? 7 : 28}
                        value={smsSettings.reminder_day}
                        onChange={(e) => setSmsSettings({...smsSettings, reminder_day: parseInt(e.target.value)})}
                      />
                    </div>
                    <div>
                      <Label>{t.reminderTime}</Label>
                      <Input
                        type="time"
                        value={smsSettings.reminder_time}
                        onChange={(e) => setSmsSettings({...smsSettings, reminder_time: e.target.value})}
                      />
                    </div>
                  </div>
                </>
              )}
              
              <div>
                <Label>{t.minDebtAmount}</Label>
                <Input
                  type="number"
                  min="0"
                  value={smsSettings.min_debt_amount}
                  onChange={(e) => setSmsSettings({...smsSettings, min_debt_amount: parseFloat(e.target.value)})}
                />
              </div>
              
              <div>
                <Label>{t.smsTemplate}</Label>
                <Textarea
                  value={smsSettings.message_template}
                  onChange={(e) => setSmsSettings({...smsSettings, message_template: e.target.value})}
                  rows={3}
                />
              </div>
              
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  ⚠️ {language === 'ar' ? 'نظام SMS في وضع المحاكاة. للربط بمزود حقيقي، تواصل مع الدعم الفني.' : 'SMS is in simulation mode.'}
                </p>
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowSettingsDialog(false)} className="flex-1">
                  {t.cancel}
                </Button>
                <Button onClick={saveSmsSettings} className="flex-1">
                  {t.save}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Logs Dialog */}
        <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{t.smsLogs}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {smsLogs.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{language === 'ar' ? 'لا توجد رسائل مرسلة' : 'No messages sent'}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {smsLogs.map((log) => (
                    <div key={log.id} className={`p-3 rounded-lg border ${log.status === 'sent' ? 'bg-green-50 dark:bg-green-900/20 border-green-200' : 'bg-red-50 dark:bg-red-900/20 border-red-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {log.status === 'sent' ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="font-medium">{log.customer_name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString(language === 'ar' ? 'ar-DZ' : 'en-US')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{log.phone}</p>
                      <p className="text-sm mt-1">{log.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Payment Dialog */}
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t.payDebt}</DialogTitle>
            </DialogHeader>
            {selectedCustomer && (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'الزبون' : 'Customer'}</p>
                  <p className="font-bold text-lg">{selectedCustomer.customer_name}</p>
                </div>
                
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200">
                  <p className="text-sm text-red-600">{t.totalDebt}</p>
                  <p className="text-2xl font-bold text-red-600">
                    {selectedCustomer.total_debt.toLocaleString()} {t.currency}
                  </p>
                </div>

                <div>
                  <Label>{t.amount}</Label>
                  <Input
                    type="number"
                    min="0"
                    max={selectedCustomer.total_debt}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  />
                </div>

                <div>
                  <Label>{t.paymentMethod}</Label>
                  <div className="flex gap-2 mt-2">
                    <Button type="button" variant={paymentMethod === 'cash' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('cash')} className="flex-1">
                      <Banknote className="h-4 w-4 me-1" />
                      {t.cash}
                    </Button>
                    <Button type="button" variant={paymentMethod === 'bank' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('bank')} className="flex-1">
                      <CreditCard className="h-4 w-4 me-1" />
                      {t.bank}
                    </Button>
                    <Button type="button" variant={paymentMethod === 'wallet' ? 'default' : 'outline'} size="sm" onClick={() => setPaymentMethod('wallet')} className="flex-1">
                      <Wallet className="h-4 w-4 me-1" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => setShowPaymentDialog(false)} className="flex-1">
                    {t.cancel}
                  </Button>
                  <Button onClick={handlePayDebt} className="flex-1" disabled={submitting || paymentAmount <= 0}>
                    {submitting ? t.loading : t.confirm}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>{language === 'ar' ? 'تفاصيل الدين' : 'Debt Details'}</DialogTitle>
            </DialogHeader>
            {customerDebtDetails && (
              <div className="space-y-6">
                <div className="p-4 bg-muted rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'الزبون' : 'Customer'}</p>
                    <p className="font-bold text-lg">{customerDebtDetails.customer_name}</p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm text-muted-foreground">{t.totalDebt}</p>
                    <p className="text-2xl font-bold text-red-600">
                      {customerDebtDetails.total_debt.toLocaleString()} {t.currency}
                    </p>
                  </div>
                </div>

                {customerDebtDetails.unpaid_sales?.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3">{language === 'ar' ? 'الفواتير غير المسددة' : 'Unpaid Invoices'}</h3>
                    <div className="space-y-2">
                      {customerDebtDetails.unpaid_sales.map((sale) => (
                        <div key={sale.id} className="p-3 border rounded-lg flex items-center justify-between">
                          <div>
                            <p className="font-medium">{sale.invoice_number}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(sale.created_at).toLocaleDateString(language === 'ar' ? 'ar-DZ' : 'en-US')}
                            </p>
                          </div>
                          <p className="font-bold text-red-600">{sale.debt_amount?.toLocaleString()} {t.currency}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {customerDebtDetails.payment_history?.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3">{language === 'ar' ? 'سجل المدفوعات' : 'Payment History'}</h3>
                    <div className="space-y-2">
                      {customerDebtDetails.payment_history.map((payment) => (
                        <div key={payment.id} className="p-3 border rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-sm">
                              {new Date(payment.created_at).toLocaleDateString(language === 'ar' ? 'ar-DZ' : 'en-US')}
                            </span>
                          </div>
                          <p className="font-bold text-green-600">+{payment.amount?.toLocaleString()} {t.currency}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button onClick={() => setShowDetailsDialog(false)} className="w-full">
                  {t.cancel}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
