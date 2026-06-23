import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  CreditCard, CheckCircle, Clock, AlertTriangle, TrendingUp,
  Search, DollarSign, Calendar, User, Filter,
} from 'lucide-react';
import apiClient from '../lib/apiClient';
import { toast } from 'sonner';

const useLanguage = () => {
  const stored = localStorage.getItem('language') || 'ar';
  return stored;
};

export default function InstallmentsPage() {
  const language = useLanguage();
  const isRTL = language === 'ar';

  const [installments, setInstallments] = useState([]);
  const [summary, setSummary] = useState({});
  const [cashBoxes, setCashBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [payDialog, setPayDialog] = useState(null);
  const [selectedCashBox, setSelectedCashBox] = useState('');
  const [paying, setPaying] = useState(false);

  const t = {
    title: language === 'ar' ? 'إدارة الأقساط' : 'Gestion des versements',
    totalOwed: language === 'ar' ? 'إجمالي المستحق' : 'Total dû',
    totalCollected: language === 'ar' ? 'المحصّل' : 'Collecté',
    overdue: language === 'ar' ? 'متأخرة' : 'En retard',
    pending: language === 'ar' ? 'قادمة' : 'À venir',
    paid: language === 'ar' ? 'مدفوعة' : 'Payées',
    interestEarned: language === 'ar' ? 'الفوائد المحصّلة' : 'Intérêts perçus',
    customer: language === 'ar' ? 'الزبون' : 'Client',
    amount: language === 'ar' ? 'المبلغ' : 'Montant',
    dueDate: language === 'ar' ? 'تاريخ الاستحقاق' : 'Échéance',
    status: language === 'ar' ? 'الحالة' : 'Statut',
    invoice: language === 'ar' ? 'الفاتورة' : 'Facture',
    number: language === 'ar' ? 'القسط' : 'Versement',
    actions: language === 'ar' ? 'إجراءات' : 'Actions',
    pay: language === 'ar' ? 'تسجيل الدفع' : 'Enregistrer',
    payInstallment: language === 'ar' ? 'دفع القسط' : 'Payer le versement',
    selectCashBox: language === 'ar' ? 'اختر الصندوق' : 'Choisir caisse',
    confirm: language === 'ar' ? 'تأكيد الدفع' : 'Confirmer',
    cancel: language === 'ar' ? 'إلغاء' : 'Annuler',
    currency: 'DA',
    all: language === 'ar' ? 'الكل' : 'Tous',
    searchPlaceholder: language === 'ar' ? 'بحث بالزبون أو الفاتورة...' : 'Rechercher client ou facture...',
    interest: language === 'ar' ? 'الفائدة' : 'Intérêt',
  };

  const fetchData = useCallback(async () => {
    try {
      const [instRes, sumRes, cbRes] = await Promise.all([
        apiClient.get('/installments'),
        apiClient.get('/installments/summary'),
        apiClient.get('/installments/cash-boxes'),
      ]);
      setInstallments(instRes.data);
      setSummary(sumRes.data);
      setCashBoxes(cbRes.data);
      if (cbRes.data.length > 0) setSelectedCashBox(cbRes.data[0].id);
    } catch (e) {
      toast.error(language === 'ar' ? 'خطأ في تحميل البيانات' : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getStatusBadge = (status, dueDate) => {
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = status === 'pending' && dueDate < today;
    if (status === 'paid') return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{t.paid}</Badge>;
    if (status === 'overdue' || isOverdue) return <Badge className="bg-red-100 text-red-700 border-red-200"><AlertTriangle className="h-3 w-3 me-1 inline" />{t.overdue}</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200"><Clock className="h-3 w-3 me-1 inline" />{t.pending}</Badge>;
  };

  const daysUntil = (dueDate) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const filtered = installments.filter(i => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || i.customer_name?.toLowerCase().includes(q) || i.invoice_number?.toLowerCase().includes(q);
    const today = new Date().toISOString().split('T')[0];
    let matchStatus = true;
    if (statusFilter === 'paid') matchStatus = i.status === 'paid';
    else if (statusFilter === 'pending') matchStatus = i.status === 'pending' && i.due_date >= today;
    else if (statusFilter === 'overdue') matchStatus = i.status === 'overdue' || (i.status === 'pending' && i.due_date < today);
    return matchSearch && matchStatus;
  });

  const handlePay = async () => {
    if (!selectedCashBox) { toast.error(language === 'ar' ? 'اختر الصندوق' : 'Choisir une caisse'); return; }
    setPaying(true);
    try {
      await apiClient.post(`/installments/${payDialog.id}/pay`, { payment_method: selectedCashBox });
      toast.success(language === 'ar' ? 'تم تسجيل الدفع بنجاح' : 'Paiement enregistré');
      setPayDialog(null);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || (language === 'ar' ? 'حدث خطأ' : 'Erreur'));
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" dir={isRTL ? 'rtl' : 'ltr'}>
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <CreditCard className="h-7 w-7 text-primary" />
            </div>
            {t.title}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'ar' ? 'تتبع وإدارة أقساط المبيعات مع الفوائد' : 'Suivi et gestion des versements avec intérêts'}
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: t.totalOwed, value: summary.total_owed || 0, color: 'blue', icon: DollarSign },
            { label: t.totalCollected, value: summary.total_collected || 0, color: 'emerald', icon: CheckCircle },
            { label: t.overdue, value: summary.overdue_count || 0, color: 'red', icon: AlertTriangle, count: true },
            { label: t.pending, value: summary.pending_count || 0, color: 'amber', icon: Clock, count: true },
            { label: t.paid, value: summary.paid_count || 0, color: 'green', icon: CheckCircle, count: true },
            { label: t.interestEarned, value: summary.interest_earned || 0, color: 'purple', icon: TrendingUp },
          ].map(({ label, value, color, icon: Icon, count }) => (
            <Card key={label} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className={`p-2 rounded-lg bg-${color}-100 w-fit mb-2`}>
                  <Icon className={`h-4 w-4 text-${color}-600`} />
                </div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-xl font-bold text-${color}-600`}>
                  {count ? value : `${value?.toLocaleString()} ${t.currency}`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="ps-9"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {['all', 'pending', 'overdue', 'paid'].map(s => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? 'default' : 'outline'}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? t.all : s === 'pending' ? t.pending : s === 'overdue' ? t.overdue : t.paid}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.invoice}</TableHead>
                  <TableHead>{t.number}</TableHead>
                  <TableHead><User className="h-3.5 w-3.5 inline me-1" />{t.customer}</TableHead>
                  <TableHead>{t.amount}</TableHead>
                  <TableHead>{t.interest}</TableHead>
                  <TableHead><Calendar className="h-3.5 w-3.5 inline me-1" />{t.dueDate}</TableHead>
                  <TableHead>{t.status}</TableHead>
                  <TableHead>{t.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p>{language === 'ar' ? 'لا توجد أقساط' : 'Aucun versement'}</p>
                    </TableCell>
                  </TableRow>
                ) : filtered.map(inst => {
                  const days = daysUntil(inst.due_date);
                  const today = new Date().toISOString().split('T')[0];
                  const isOverdue = inst.status !== 'paid' && inst.due_date < today;
                  return (
                    <TableRow key={inst.id} className={isOverdue ? 'bg-red-50/40' : ''}>
                      <TableCell className="font-mono text-xs">{inst.invoice_number}</TableCell>
                      <TableCell>
                        <span className="font-semibold">{inst.installment_number}</span>
                        <span className="text-muted-foreground text-xs">/{inst.total_installments}</span>
                      </TableCell>
                      <TableCell className="font-medium">{inst.customer_name}</TableCell>
                      <TableCell className="font-bold">{inst.amount?.toLocaleString()} {t.currency}</TableCell>
                      <TableCell className="text-purple-600 text-sm">{inst.interest_share > 0 ? `+${inst.interest_share?.toLocaleString()}` : '—'}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{inst.due_date}</p>
                          {inst.status !== 'paid' && (
                            <p className={`text-xs ${days < 0 ? 'text-red-500' : days <= 7 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                              {days < 0 ? `${Math.abs(days)} ${language === 'ar' ? 'يوم تأخير' : 'j de retard'}` : `${days} ${language === 'ar' ? 'يوم' : 'j'}`}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(inst.status, inst.due_date)}</TableCell>
                      <TableCell>
                        {inst.status !== 'paid' && (
                          <Button size="sm" className="gap-1 h-8" onClick={() => setPayDialog(inst)}>
                            <CheckCircle className="h-3.5 w-3.5" />
                            {language === 'ar' ? 'دفع' : 'Payer'}
                          </Button>
                        )}
                        {inst.status === 'paid' && (
                          <span className="text-xs text-muted-foreground">{inst.paid_date?.split('T')[0]}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pay Dialog */}
        <Dialog open={!!payDialog} onOpenChange={() => setPayDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.payInstallment}</DialogTitle>
            </DialogHeader>
            {payDialog && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t.customer}</span>
                    <span className="font-semibold">{payDialog.customer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t.number}</span>
                    <span className="font-semibold">{payDialog.installment_number}/{payDialog.total_installments}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t.dueDate}</span>
                    <span>{payDialog.due_date}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
                    <span>{t.amount}</span>
                    <span className="text-primary">{payDialog.amount?.toLocaleString()} {t.currency}</span>
                  </div>
                </div>
                <div>
                  <Label>{t.selectCashBox}</Label>
                  <Select value={selectedCashBox} onValueChange={setSelectedCashBox}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={t.selectCashBox} />
                    </SelectTrigger>
                    <SelectContent>
                      {cashBoxes.map(cb => (
                        <SelectItem key={cb.id} value={cb.id}>
                          {cb.name} — {cb.balance?.toLocaleString()} {t.currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayDialog(null)}>{t.cancel}</Button>
              <Button onClick={handlePay} disabled={paying} className="gap-2">
                <CheckCircle className="h-4 w-4" />
                {paying ? '...' : t.confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
