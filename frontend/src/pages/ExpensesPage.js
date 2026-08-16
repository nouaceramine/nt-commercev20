import { errText } from '../lib/errorText';
import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import PrintButton from '../components/print/PrintButton';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { toast } from 'sonner';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Trash2,
  Edit,
  Building,
  Zap,
  Truck,
  Users,
  ShoppingBag,
  MoreHorizontal,
  RefreshCw
} from 'lucide-react';
import { ExportPrintButtons } from '../components/ExportPrintButtons';

const EXPENSE_CATEGORIES = [
  { id: 'rent', name_ar: 'إيجار المحل', name_fr: 'Loyer', icon: Building, color: 'bg-blue-500' },
  { id: 'utilities', name_ar: 'فواتير (كهرباء، ماء، غاز)', name_fr: 'Factures', icon: Zap, color: 'bg-yellow-500' },
  { id: 'transport', name_ar: 'نقل وتوصيل', name_fr: 'Transport', icon: Truck, color: 'bg-green-500' },
  { id: 'salaries', name_ar: 'رواتب الموظفين', name_fr: 'Salaires', icon: Users, color: 'bg-purple-500' },
  { id: 'supplies', name_ar: 'مستلزمات المحل', name_fr: 'Fournitures', icon: ShoppingBag, color: 'bg-pink-500' },
  { id: 'maintenance', name_ar: 'صيانة وإصلاحات', name_fr: 'Maintenance', icon: Receipt, color: 'bg-orange-500' },
  { id: 'other', name_ar: 'أخرى', name_fr: 'Autres', icon: MoreHorizontal, color: 'bg-gray-500' },
];

export default function ExpensesPage() {
  const { language, t } = useLanguage();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // all, today, week, month
  const [stats, setStats] = useState({ total: 0, thisMonth: 0, lastMonth: 0, byCategory: [] });
  const [reminders, setReminders] = useState([]);
  
  const [usdWallet, setUsdWallet] = useState(null);            // p111
  const [showUsdDialog, setShowUsdDialog] = useState(false);   // p111
  const [usdForm, setUsdForm] = useState({ usd_amount: '', rate: '', note: '', payment_method: 'cash' });  // p111
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    amount: '',
    currency: 'DZD',       // p111
    exchange_rate: '',     // p111
    payment_method: 'cash',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    code: '',  // كود التكلفة
    recurring: false,
    recurring_period: 'monthly',
    reminder_days_before: 3
  });

  const fetchUsdWallet = async () => {  // p111
    try {
      const r = await apiClient.get('/expenses/usd-wallet');
      setUsdWallet(r.data);
    } catch (e) { /* optional */ }
  };

  const buyUsd = async () => {  // p111
    if (!usdForm.usd_amount || !usdForm.rate) {
      toast.error(language === 'ar' ? 'أدخل الكمية والسعر' : 'Montant et taux requis');
      return;
    }
    try {
      await apiClient.post('/expenses/usd-purchase', {
        usd_amount: parseFloat(usdForm.usd_amount),
        rate: parseFloat(usdForm.rate),
        note: usdForm.note,
        payment_method: usdForm.payment_method,
      });
      toast.success(language === 'ar' ? 'سُجّل شراء الدولار' : 'Achat enregistré');
      setShowUsdDialog(false);
      setUsdForm({ usd_amount: '', rate: '', note: '', payment_method: 'cash' });
      fetchUsdWallet();
    } catch (error) {
      toast.error(errText(error) || t.somethingWentWrong);
    }
  };

  useEffect(() => {
    fetchExpenses();
    fetchStats();
    fetchReminders();
    fetchExpenseCode();
    fetchUsdWallet();  // p111
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchExpenseCode = async () => {
    try {
      const response = await apiClient.get(`/expenses/generate-code`);
      setFormData(prev => ({ ...prev, code: response.data.code }));
    } catch (error) {
      console.error('Error fetching expense code:', error);
    }
  };

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/expenses`);
      setExpenses(response.data || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error(language === 'ar' ? 'فشل في تحميل التكاليف' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  };

  const fetchReminders = async () => {
    try {
      const response = await apiClient.get(`/expenses/reminders`);
      setReminders(response.data || []);
    } catch (error) {
      console.error('Error fetching reminders:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await apiClient.get(`/expenses/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.category || !formData.amount) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول المطلوبة' : 'Veuillez remplir tous les champs requis');
      return;
    }

    try {
      const expenseData = {
        ...formData,
        amount: parseFloat(formData.amount)
      };
      if (expenseData.currency === 'USD') {  // p111
        expenseData.exchange_rate = parseFloat(formData.exchange_rate) || 0;
      }

      if (editingExpense) {
        await apiClient.put(`/expenses/${editingExpense.id}`, expenseData);
        toast.success(language === 'ar' ? 'تم تحديث التكلفة' : 'Dépense mise à jour');
      } else {
        await apiClient.post(`/expenses`, expenseData);
        toast.success(language === 'ar' ? 'تمت إضافة التكلفة' : 'Dépense ajoutée');
      }

      setShowAddDialog(false);
      resetForm();
      fetchExpenses();
      fetchStats();
      fetchUsdWallet();  // p111
    } catch (error) {
      toast.error(errText(error) ||  t.somethingWentWrong);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(language === 'ar' ? 'هل تريد حذف هذه التكلفة؟' : 'Voulez-vous supprimer cette dépense?')) {
      return;
    }
    
    try {
      await apiClient.delete(`/expenses/${id}`);
      toast.success(language === 'ar' ? 'تم حذف التكلفة' : 'Dépense supprimée');
      fetchExpenses();
      fetchStats();
      fetchReminders();
    } catch (error) {
      toast.error(t.somethingWentWrong);
    }
  };

  const handleMarkPaid = async (expenseId) => {
    try {
      await apiClient.post(`/expenses/${expenseId}/mark-paid`);
      toast.success(language === 'ar' ? 'تم تسجيل الدفع' : 'Paiement enregistré');
      fetchReminders();
      fetchExpenses();
    } catch (error) {
      toast.error(t.somethingWentWrong);
    }
  };

  const resetForm = async () => {
    try {
      const response = await apiClient.get(`/expenses/generate-code`);
      setFormData({
        title: '',
        category: '',
        amount: '',
        currency: 'DZD',
        exchange_rate: '',
        payment_method: 'cash',
        date: new Date().toISOString().split('T')[0],
        notes: '',
        code: response.data.code,  // كود التكلفة التلقائي
        recurring: false,
        recurring_period: 'monthly'
      });
    } catch (error) {
      setFormData({
        title: '', category: '', amount: '', currency: 'DZD', exchange_rate: '', payment_method: 'cash', date: new Date().toISOString().split('T')[0],
        notes: '', code: '', recurring: false, recurring_period: 'monthly'
      });
    }
    setEditingExpense(null);
  };

  const openEditDialog = (expense) => {
    setEditingExpense(expense);
    setFormData({
      title: expense.title,
      category: expense.category,
      amount: expense.currency === 'USD' ? String(expense.amount_usd ?? expense.amount) : expense.amount.toString(),
      currency: expense.currency || 'DZD',
      exchange_rate: expense.exchange_rate ? String(expense.exchange_rate) : '',
      date: expense.date?.split('T')[0] || new Date().toISOString().split('T')[0],
      notes: expense.notes || '',
      code: expense.code || '',
      payment_method: expense.payment_method || 'cash',
      recurring: expense.recurring || false,
      recurring_period: expense.recurring_period || 'monthly'
    });
    setShowAddDialog(true);
  };

  const filteredExpenses = expenses.filter(expense => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = expense.title?.toLowerCase().includes(query) ||
                         expense.notes?.toLowerCase().includes(query) ||
                         expense.code?.toLowerCase().includes(query);  // البحث بالكود
    const matchesCategory = categoryFilter === 'all' || expense.category === categoryFilter;
    
    let matchesDate = true;
    if (dateFilter !== 'all') {
      const expenseDate = new Date(expense.date);
      const now = new Date();
      if (dateFilter === 'today') {
        matchesDate = expenseDate.toDateString() === now.toDateString();
      } else if (dateFilter === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        matchesDate = expenseDate >= weekAgo;
      } else if (dateFilter === 'month') {
        matchesDate = expenseDate.getMonth() === now.getMonth() && expenseDate.getFullYear() === now.getFullYear();
      }
    }
    
    return matchesSearch && matchesCategory && matchesDate;
  });

  const getCategoryInfo = (categoryId) => {
    return EXPENSE_CATEGORIES.find(c => c.id === categoryId) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ar-DZ', { minimumFractionDigits: 2 }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('ar-DZ');
  };

  return (
    <Layout>
      <div className="space-y-6" data-testid="expenses-page">
        {/* Reminders Alert */}
        {reminders.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-full">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                  {language === 'ar' ? '⏰ تنبيهات الدفع القادمة' : '⏰ Rappels de paiement'}
                </h3>
                <div className="mt-2 space-y-2">
                  {reminders.map((reminder, idx) => (
                    <div 
                      key={idx}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        reminder.is_urgent 
                          ? 'bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800' 
                          : 'bg-white dark:bg-card border border-amber-200 dark:border-amber-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${getCategoryInfo(reminder.category).color}`}>
                          {(() => {
                            const Icon = getCategoryInfo(reminder.category).icon;
                            return <Icon className="h-4 w-4 text-foreground" />;
                          })()}
                        </div>
                        <div>
                          <p className="font-medium">{reminder.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {reminder.days_until_due === 0 
                              ? (language === 'ar' ? '⚠️ اليوم!' : '⚠️ Aujourd\'hui!')
                              : reminder.days_until_due === 1
                                ? (language === 'ar' ? 'غداً' : 'Demain')
                                : (language === 'ar' ? `خلال ${reminder.days_until_due} أيام` : `Dans ${reminder.days_until_due} jours`)
                            }
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-red-600">{formatCurrency(reminder.amount)} {t.currency}</span>
                        <Button 
                          size="sm" 
                          variant={reminder.is_urgent ? "destructive" : "default"}
                          onClick={() => handleMarkPaid(reminder.expense_id)}
                        >
                          {language === 'ar' ? 'تم الدفع' : 'Payé'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Receipt className="h-6 w-6 text-red-500" />
              {language === 'ar' ? 'إدارة التكاليف' : 'Gestion des dépenses'}
            </h1>
            <p className="text-muted-foreground">
              {language === 'ar' ? 'تتبع وإدارة مصاريف المحل' : 'Suivre et gérer les dépenses du magasin'}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <ExportPrintButtons
              data={filteredExpenses.map(e => ({
                code: e.code || '-',
                title: e.title,
                category: getCategoryInfo(e.category)?.[language === 'ar' ? 'name_ar' : 'name_fr'] || e.category,
                amount: formatCurrency(e.amount),
                date: formatDate(e.date),
                notes: e.notes || '-'
              }))}
              columns={[
                { key: 'code', label: language === 'ar' ? 'الكود' : 'Code' },
                { key: 'title', label: language === 'ar' ? 'الوصف' : 'Description' },
                { key: 'category', label: language === 'ar' ? 'الفئة' : 'Catégorie' },
                { key: 'amount', label: language === 'ar' ? 'المبلغ' : 'Montant' },
                { key: 'date', label: language === 'ar' ? 'التاريخ' : 'Date' },
                { key: 'notes', label: language === 'ar' ? 'ملاحظات' : 'Notes' }
              ]}
              filename={`expenses_${new Date().toISOString().split('T')[0]}`}
              title={language === 'ar' ? 'قائمة التكاليف' : 'Liste des Dépenses'}
              language={language}
            />
            <Button onClick={() => { resetForm(); setShowAddDialog(true); }} data-testid="add-expense-btn">
              <Plus className="h-4 w-4 me-2" />
              {language === 'ar' ? 'إضافة تكلفة' : 'Ajouter'}
            </Button>
          </div>
        </div>

        {/* p111: USD wallet for ad spend (black-market dollars) */}
        <Card data-testid="usd-wallet-card">
          <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{language === 'ar' ? '💵 محفظة الدولار (للإعلانات)' : 'Portefeuille USD'}</p>
                <p className="text-xl font-bold text-emerald-700" data-testid="usd-remaining">{usdWallet ? `${Number(usdWallet.remaining_usd).toLocaleString()} $` : '—'}</p>
                <p className="text-xs text-muted-foreground" data-testid="usd-wallet-line">
                  {usdWallet
                    ? (language === 'ar'
                        ? `مشترى: ${Number(usdWallet.bought_usd).toLocaleString()}$ · مصروف: ${Number(usdWallet.spent_usd).toLocaleString()}$${usdWallet.avg_rate ? ` · متوسط المتبقي: ${Number(usdWallet.avg_rate).toLocaleString()} دج/$` : ''}`
                        : `Reste: ${Number(usdWallet.remaining_usd).toLocaleString()} $`)
                    : (language === 'ar' ? 'سجّل مشترياتك من الدولار لتُحسب كلفة الإعلان الحقيقية' : '')}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowUsdDialog(true)} data-testid="usd-buy-btn">
              <Plus className="h-4 w-4 me-1" />{language === 'ar' ? 'شراء دولار' : 'Acheter USD'}
            </Button>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <DollarSign className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي التكاليف' : 'Total dépenses'}</p>
                  <p className="text-xl font-bold text-red-600">{formatCurrency(stats.total)} {t.currency}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'هذا الشهر' : 'Ce mois'}</p>
                  <p className="text-xl font-bold">{formatCurrency(stats.thisMonth)} {t.currency}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 dark:bg-card rounded-lg">
                  <Calendar className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'الشهر الماضي' : 'Mois dernier'}</p>
                  <p className="text-xl font-bold">{formatCurrency(stats.lastMonth)} {t.currency}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stats.thisMonth <= stats.lastMonth ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                  {stats.thisMonth <= stats.lastMonth ? (
                    <TrendingDown className="h-5 w-5 text-green-600" />
                  ) : (
                    <TrendingUp className="h-5 w-5 text-red-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'الفرق' : 'Différence'}</p>
                  <p className={`text-xl font-bold ${stats.thisMonth <= stats.lastMonth ? 'text-green-600' : 'text-red-600'}`}>
                    {stats.thisMonth <= stats.lastMonth ? '-' : '+'}
                    {formatCurrency(Math.abs(stats.thisMonth - stats.lastMonth))} {t.currency}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Categories Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{language === 'ar' ? 'التكاليف حسب الفئة' : 'Dépenses par catégorie'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {EXPENSE_CATEGORIES.map(cat => {
                const catStats = stats.byCategory?.find(c => c.category === cat.id);
                const Icon = cat.icon;
                return (
                  <div key={cat.id} className="p-3 border rounded-lg text-center hover:shadow-md transition-shadow">
                    <div className={`w-10 h-10 ${cat.color} rounded-full flex items-center justify-center mx-auto mb-2`}>
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{language === 'ar' ? cat.name_ar : cat.name_fr}</p>
                    <p className="font-bold text-sm">{formatCurrency(catStats?.total || 0)}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Filters & Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={language === 'ar' ? 'ابحث بالوصف أو الكود...' : 'Rechercher par description ou code...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      try {
                        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        const oscillator = audioContext.createOscillator();
                        const gainNode = audioContext.createGain();
                        oscillator.connect(gainNode);
                        gainNode.connect(audioContext.destination);
                        oscillator.frequency.value = 1200;
                        gainNode.gain.value = 0.3;
                        oscillator.start();
                        setTimeout(() => oscillator.stop(), 100);
                      } catch (e) {}
                    }
                  }}
                  className="pe-10"
                />
              </div>
              <div className="flex gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[150px]">
                    <Filter className="h-4 w-4 me-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'ar' ? 'كل الفئات' : 'Toutes'}</SelectItem>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {language === 'ar' ? cat.name_ar : cat.name_fr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-[130px]">
                    <Calendar className="h-4 w-4 me-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'ar' ? 'كل الفترات' : 'Toutes'}</SelectItem>
                    <SelectItem value="today">{language === 'ar' ? 'اليوم' : 'Aujourd\'hui'}</SelectItem>
                    <SelectItem value="week">{language === 'ar' ? 'هذا الأسبوع' : 'Cette semaine'}</SelectItem>
                    <SelectItem value="month">{language === 'ar' ? 'هذا الشهر' : 'Ce mois'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="text-center py-8">
                <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">
                  {language === 'ar' ? 'لا توجد تكاليف' : 'Aucune dépense'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-muted-foreground w-[100px]">{language === 'ar' ? 'الرمز' : 'Code'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الفئة' : 'Catégorie'}</TableHead>
                    <TableHead>{language === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                    <TableHead>{language === 'ar' ? 'المبلغ' : 'Montant'}</TableHead>
                    <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                    <TableHead>{language === 'ar' ? 'النوع' : 'Type'}</TableHead>
                    <TableHead>{language === 'ar' ? 'إجراءات' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map(expense => {
                    const catInfo = getCategoryInfo(expense.category);
                    const Icon = catInfo.icon;
                    return (
                      <TableRow key={expense.id}>
                        <TableCell>
                          <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                            {expense.code || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 ${catInfo.color} rounded-lg`}>
                              <Icon className="h-4 w-4 text-foreground" />
                            </div>
                            <span className="text-sm">{language === 'ar' ? catInfo.name_ar : catInfo.name_fr}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{expense.title}</p>
                            {expense.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{expense.notes}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-red-600">{formatCurrency(expense.amount)} {t.currency}</span>
                          {expense.currency === 'USD' && (
                            <p className="text-xs text-muted-foreground" data-testid="usd-expense-note" dir="ltr">{Number(expense.amount_usd).toLocaleString()}$ × {Number(expense.exchange_rate).toLocaleString()}</p>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(expense.date)}</TableCell>
                        <TableCell>
                          {expense.recurring ? (
                            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              {expense.recurring_period === 'monthly' ? (language === 'ar' ? 'شهري' : 'Mensuel') :
                               expense.recurring_period === 'weekly' ? (language === 'ar' ? 'أسبوعي' : 'Hebdo') :
                               expense.recurring_period === 'yearly' ? (language === 'ar' ? 'سنوي' : 'Annuel') : ''}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{language === 'ar' ? 'مرة واحدة' : 'Une fois'}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <PrintButton docType="expense" record={expense} />
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(expense)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(expense.id)} className="text-red-600 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Dialog - Compact Design */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader className="pb-2">
              <DialogTitle className="text-lg">
                {editingExpense 
                  ? (language === 'ar' ? 'تعديل التكلفة' : 'Modifier la dépense')
                  : (language === 'ar' ? 'إضافة تكلفة جديدة' : 'Ajouter une dépense')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {/* Category & Description */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{language === 'ar' ? 'الفئة *' : 'Catégorie *'}</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData(p => ({ ...p, category: v }))}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={language === 'ar' ? 'اختر' : 'Choisir'} />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {language === 'ar' ? cat.name_ar : cat.name_fr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{language === 'ar' ? 'الكود' : 'Code'}</Label>
                  <Input
                    value={formData.code}
                    className="h-9 font-mono text-sm bg-muted/50"
                    readOnly
                    placeholder="CH00001/2026"
                  />
                </div>
              </div>

              {/* Description & Notes */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{language === 'ar' ? 'الوصف *' : 'Description *'}</Label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                    placeholder={language === 'ar' ? 'وصف' : 'Description'}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{language === 'ar' ? 'ملاحظات' : 'Notes'}</Label>
                  <Input
                    value={formData.notes}
                    onChange={(e) => setFormData(p => ({ ...p, notes: e.target.value }))}
                    placeholder={language === 'ar' ? 'ملاحظات...' : 'Notes...'}
                    className="h-9"
                  />
                </div>
              </div>

              {/* p111: currency selector */}
              <div className="flex gap-2" data-testid="expense-currency-row">
                <Button type="button" size="sm" variant={formData.currency !== 'USD' ? 'default' : 'outline'} onClick={() => setFormData(p => ({ ...p, currency: 'DZD' }))} data-testid="currency-dzd-btn">دج DZD</Button>
                <Button type="button" size="sm" variant={formData.currency === 'USD' ? 'default' : 'outline'} onClick={() => setFormData(p => ({ ...p, currency: 'USD', exchange_rate: p.exchange_rate || (usdWallet?.suggested_rate ? String(usdWallet.suggested_rate) : '') }))} data-testid="currency-usd-btn">$ دولار (إعلانات)</Button>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{formData.currency === 'USD' ? (language === 'ar' ? 'المبلغ بالدولار $ *' : 'Montant $ *') : (language === 'ar' ? 'المبلغ *' : 'Montant *')}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData(p => ({ ...p, amount: e.target.value }))}
                    placeholder="0.00"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{language === 'ar' ? 'التاريخ' : 'Date'}</Label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData(p => ({ ...p, date: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>

              {/* p111: USD exchange rate */}
              {formData.currency === 'USD' && (
                <div className="p-3 border rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 space-y-2" data-testid="usd-rate-block">
                  <div className="space-y-1">
                    <Label className="text-xs">{language === 'ar' ? 'سعر الصرف (دج لكل 1$) *' : 'Taux (DZD/USD) *'}</Label>
                    <Input type="number" min="0" step="0.01" dir="ltr" className="h-9" value={formData.exchange_rate} onChange={(e) => setFormData(p => ({ ...p, exchange_rate: e.target.value }))} placeholder={usdWallet?.suggested_rate ? String(usdWallet.suggested_rate) : '245'} data-testid="usd-rate-input" />
                  </div>
                  {formData.amount && formData.exchange_rate ? (
                    <p className="text-sm font-semibold text-emerald-700" data-testid="usd-dzd-preview">
                      = {formatCurrency(parseFloat(formData.amount) * parseFloat(formData.exchange_rate))} {language === 'ar' ? 'دج تُسجَّل كلفةً حقيقية' : 'DZD'}
                    </p>
                  ) : null}
                  {usdWallet && (
                    <p className="text-xs text-muted-foreground">{language === 'ar' ? `رصيدك الحالي: ${Number(usdWallet.remaining_usd).toLocaleString()}$ (متوسط ${usdWallet.avg_rate || '—'} دج/$)` : ''}</p>
                  )}
                </div>
              )}

              {/* p66/p68: payment source — deducts from the chosen cash box */}
              {formData.currency !== 'USD' ? (
              <div className="space-y-1" data-testid="expense-payment-source">
                <Label className="text-xs">{language === 'ar' ? 'مصدر الدفع' : 'Source de paiement'}</Label>
                <Select value={formData.payment_method} onValueChange={(v) => setFormData(p => ({ ...p, payment_method: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{language === 'ar' ? 'الصندوق النقدي' : 'Caisse'}</SelectItem>
                    <SelectItem value="bank">{language === 'ar' ? 'الحساب البنكي' : 'Compte bancaire'}</SelectItem>
                    <SelectItem value="wallet">{language === 'ar' ? 'المحفظة الإلكترونية' : 'Portefeuille'}</SelectItem>
                    <SelectItem value="safe">{language === 'ar' ? 'الخزنة' : 'Coffre'}</SelectItem>
                    <SelectItem value="personal">{language === 'ar' ? 'مال خاص' : 'Personnel'}</SelectItem>
                  </SelectContent>
                </Select>
                {formData.payment_method === 'personal' && (
                  <p className="text-xs text-muted-foreground" data-testid="expense-personal-hint">
                    {language === 'ar' ? 'سيُخصم من رصيد المال الخاص — رأس مال الشركة لا يتأثر' : 'Débité de l\'argent personnel — capital inchangé'}
                  </p>
                )}
              </div>
              ) : (
              <p className="text-xs text-muted-foreground border rounded-lg p-2" data-testid="usd-nodeduct-hint">{language === 'ar' ? '💵 مصروف بالدولار — الخصم من الصندوق تم عند شراء الدولار، لا خصم مزدوج' : 'USD — pas de double déduction'}</p>
              )}

              {/* Recurring Options - Compact */}
              <div className="p-3 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{language === 'ar' ? 'تكلفة متكررة' : 'Récurrente'}</Label>
                  <input
                    type="checkbox"
                    checked={formData.recurring}
                    onChange={(e) => setFormData(p => ({ ...p, recurring: e.target.checked }))}
                    className="w-4 h-4 accent-primary"
                  />
                </div>
                
                {formData.recurring && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{language === 'ar' ? 'الفترة' : 'Période'}</Label>
                      <Select 
                        value={formData.recurring_period} 
                        onValueChange={(v) => setFormData(p => ({ ...p, recurring_period: v }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">{language === 'ar' ? 'أسبوعي' : 'Hebdo'}</SelectItem>
                          <SelectItem value="monthly">{language === 'ar' ? 'شهري' : 'Mensuel'}</SelectItem>
                          <SelectItem value="yearly">{language === 'ar' ? 'سنوي' : 'Annuel'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{language === 'ar' ? 'تذكير قبل' : 'Rappel'}</Label>
                      <Select 
                        value={formData.reminder_days_before?.toString()} 
                        onValueChange={(v) => setFormData(p => ({ ...p, reminder_days_before: parseInt(v) }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 {language === 'ar' ? 'يوم' : 'j'}</SelectItem>
                          <SelectItem value="3">3 {language === 'ar' ? 'أيام' : 'j'}</SelectItem>
                          <SelectItem value="5">5 {language === 'ar' ? 'أيام' : 'j'}</SelectItem>
                          <SelectItem value="7">7 {language === 'ar' ? 'أيام' : 'j'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowAddDialog(false)}>
                  {language === 'ar' ? 'إلغاء' : 'Annuler'}
                </Button>
                <Button size="sm" className="flex-1" onClick={handleSubmit}>
                  {editingExpense 
                    ? (language === 'ar' ? 'تحديث' : 'Mettre à jour')
                    : (language === 'ar' ? 'إضافة' : 'Ajouter')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* p111: buy dollars dialog */}
        <Dialog open={showUsdDialog} onOpenChange={setShowUsdDialog}>
          <DialogContent className="max-w-sm" data-testid="usd-buy-dialog">
            <DialogHeader>
              <DialogTitle>{language === 'ar' ? '💵 شراء دولار (السوق)' : 'Acheter USD'}</DialogTitle>
              <DialogDescription>{language === 'ar' ? 'سجّل كل عملية شراء بسعرها الحقيقي — المصاريف الإعلانية بالدولار ستُحوَّل بهذا السعر' : ''}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">{language === 'ar' ? 'كمية الدولار *' : 'Montant USD *'}</Label>
                <Input type="number" min="0" step="0.01" dir="ltr" value={usdForm.usd_amount} onChange={(e) => setUsdForm(p => ({ ...p, usd_amount: e.target.value }))} placeholder="100" data-testid="usd-amount-input" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{language === 'ar' ? 'سعر الصرف (دج لكل 1$) *' : 'Taux *'}</Label>
                <Input type="number" min="0" step="0.01" dir="ltr" value={usdForm.rate} onChange={(e) => setUsdForm(p => ({ ...p, rate: e.target.value }))} placeholder="245" data-testid="usd-rate-buy-input" />
              </div>
              {usdForm.usd_amount && usdForm.rate ? (
                <p className="text-sm font-semibold text-emerald-700" data-testid="usd-buy-preview">= {formatCurrency(parseFloat(usdForm.usd_amount) * parseFloat(usdForm.rate))} {language === 'ar' ? 'دج ستُخصم من الصندوق' : 'DZD'}</p>
              ) : null}
              <div className="space-y-1">
                <Label className="text-xs">{language === 'ar' ? 'مصدر الدفع' : 'Source'}</Label>
                <Select value={usdForm.payment_method} onValueChange={(v) => setUsdForm(p => ({ ...p, payment_method: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{language === 'ar' ? 'الصندوق النقدي' : 'Caisse'}</SelectItem>
                    <SelectItem value="bank">{language === 'ar' ? 'الحساب البنكي' : 'Compte'}</SelectItem>
                    <SelectItem value="personal">{language === 'ar' ? 'مال خاص' : 'Personnel'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{language === 'ar' ? 'ملاحظة' : 'Note'}</Label>
                <Input value={usdForm.note} onChange={(e) => setUsdForm(p => ({ ...p, note: e.target.value }))} placeholder={language === 'ar' ? 'من أين اشتريت...' : ''} data-testid="usd-note-input" />
              </div>
              <Button className="w-full" onClick={buyUsd} data-testid="usd-buy-confirm">{language === 'ar' ? 'تسجيل الشراء' : 'Enregistrer'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
