import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { formatShortDate, formatLargeNumber } from '../utils/globalDateFormatter';
import {
  Landmark, Plus, ArrowUpRight, ArrowDownRight, RefreshCw,
  Wallet, Building2, CreditCard, TrendingUp, Edit, Trash2
} from 'lucide-react';

export default function BankingPage() {
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountDialog, setAccountDialog] = useState(false);
  const [txDialog, setTxDialog] = useState(false);
  const [reconcileDialog, setReconcileDialog] = useState(false);
  const [accountForm, setAccountForm] = useState({
    bank_name: '', bank_name_ar: '', account_number: '',
    iban: '', swift_code: '', account_type: 'current',
    currency: 'DZD', initial_balance: 0, is_primary: false,
  });
  const [txForm, setTxForm] = useState({
    bank_account_id: '', type: 'deposit', amount: 0, description: '', reference: '', category: '',
  });
  const [reconcileForm, setReconcileForm] = useState({
    bank_account_id: '', statement_balance: 0, statement_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => { fetchData(); }, []);

  const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const fetchData = async () => {
    try {
      const [summaryRes, txRes] = await Promise.all([
        apiClient.get(`/banking/summary`, { headers: getHeaders() }),
        apiClient.get(`/banking/transactions?limit=30`, { headers: getHeaders() }),
      ]);
      setSummary(summaryRes.data);
      setTransactions(txRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const createAccount = async () => {
    try {
      await apiClient.post(`/banking/accounts`, accountForm, { headers: getHeaders() });
      toast.success('تم إنشاء الحساب البنكي');
      setAccountDialog(false);
      setAccountForm({ bank_name: '', bank_name_ar: '', account_number: '', iban: '', swift_code: '', account_type: 'current', currency: 'DZD', initial_balance: 0, is_primary: false });
      fetchData();
    } catch (err) {
      toast.error('خطأ في إنشاء الحساب');
    }
  };

  const createTransaction = async () => {
    try {
      await apiClient.post(`/banking/transactions`, txForm, { headers: getHeaders() });
      toast.success('تم تسجيل العملية');
      setTxDialog(false);
      setTxForm({ bank_account_id: '', type: 'deposit', amount: 0, description: '', reference: '', category: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'خطأ');
    }
  };

  const reconcile = async () => {
    try {
      const res = await apiClient.post(`/banking/reconcile`, reconcileForm, { headers: getHeaders() });
      if (res.data.status === 'matched') toast.success('المطابقة ناجحة - لا يوجد فرق');
      else toast.warning(`فرق: ${formatLargeNumber(res.data.difference)} دج`);
      setReconcileDialog(false);
    } catch (err) {
      toast.error('خطأ في المطابقة');
    }
  };

  const deleteAccount = async (id) => {
    if (!window.confirm('حذف الحساب البنكي؟')) return;
    try {
      await apiClient.delete(`/banking/accounts/${id}`, { headers: getHeaders() });
      toast.success('تم الحذف');
      fetchData();
    } catch (err) {
      toast.error('خطأ');
    }
  };

  const fmt = (n) => formatLargeNumber(Math.round(n || 0));
  const accounts = summary?.accounts || [];

  if (loading) return <Layout><div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div></Layout>;

  return (
    <Layout>
      <div className="space-y-6" data-testid="banking-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Landmark className="h-7 w-7 text-blue-600" /> التكامل البنكي
            </h1>
            <p className="text-muted-foreground mt-1">إدارة الحسابات البنكية والعمليات المالية</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setReconcileDialog(true)} data-testid="reconcile-btn">
              <RefreshCw className="h-4 w-4 ml-2" /> مطابقة
            </Button>
            <Button variant="outline" onClick={() => { if (accounts.length > 0) { setTxForm(f => ({...f, bank_account_id: accounts[0].id})); setTxDialog(true); } else toast.error('أنشئ حساب بنكي أولاً'); }} data-testid="add-tx-btn">
              <CreditCard className="h-4 w-4 ml-2" /> عملية جديدة
            </Button>
            <Button onClick={() => setAccountDialog(true)} data-testid="add-bank-btn">
              <Plus className="h-4 w-4 ml-2" /> حساب جديد
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-t-4 border-t-blue-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">إجمالي الأرصدة</p>
                  <p className="text-2xl font-bold text-blue-600">{fmt(summary?.total_balance)} دج</p>
                </div>
                <Wallet className="h-8 w-8 text-blue-500/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">الحسابات النشطة</p>
                  <p className="text-2xl font-bold">{summary?.active_accounts || 0}</p>
                </div>
                <Building2 className="h-8 w-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">الإيداعات</p>
                  <p className="text-2xl font-bold text-green-600">{fmt(summary?.transaction_summary?.deposit?.total)} دج</p>
                </div>
                <ArrowDownRight className="h-8 w-8 text-green-500/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">السحوبات</p>
                  <p className="text-2xl font-bold text-red-600">{fmt(summary?.transaction_summary?.withdrawal?.total)} دج</p>
                </div>
                <ArrowUpRight className="h-8 w-8 text-red-500/30" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="accounts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="accounts" data-testid="tab-accounts"><Building2 className="h-4 w-4 ml-1" />الحسابات</TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions"><CreditCard className="h-4 w-4 ml-1" />العمليات</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts">
            <Card>
              <CardContent className="pt-6">
                {accounts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>لا توجد حسابات بنكية</p>
                    <Button className="mt-4" onClick={() => setAccountDialog(true)}>
                      <Plus className="h-4 w-4 ml-2" /> إضافة حساب
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>البنك</TableHead>
                        <TableHead>رقم الحساب</TableHead>
                        <TableHead>IBAN</TableHead>
                        <TableHead>النوع</TableHead>
                        <TableHead>العملة</TableHead>
                        <TableHead>الرصيد</TableHead>
                        <TableHead>إجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accounts.map(acc => (
                        <TableRow key={acc.id}>
                          <TableCell className="font-medium">
                            <div>{acc.bank_name_ar || acc.bank_name}</div>
                            {acc.is_primary && <Badge className="bg-blue-100 text-blue-700 text-xs mt-1">رئيسي</Badge>}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{acc.account_number}</TableCell>
                          <TableCell className="font-mono text-xs">{acc.iban || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {acc.account_type === 'current' ? 'جاري' : acc.account_type === 'savings' ? 'توفير' : 'تجاري'}
                            </Badge>
                          </TableCell>
                          <TableCell>{acc.currency}</TableCell>
                          <TableCell className={`font-bold ${acc.current_balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {fmt(acc.current_balance)} دج
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => deleteAccount(acc.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions">
            <Card>
              <CardContent className="pt-6">
                {transactions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>لا توجد عمليات بعد</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>النوع</TableHead>
                        <TableHead>المبلغ</TableHead>
                        <TableHead>الوصف</TableHead>
                        <TableHead>المرجع</TableHead>
                        <TableHead>الرصيد بعد</TableHead>
                        <TableHead>التاريخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map(tx => (
                        <TableRow key={tx.id}>
                          <TableCell>
                            {tx.type === 'deposit' ? (
                              <Badge className="bg-green-100 text-green-700"><ArrowDownRight className="h-3 w-3 ml-1" />إيداع</Badge>
                            ) : tx.type === 'withdrawal' ? (
                              <Badge className="bg-red-100 text-red-700"><ArrowUpRight className="h-3 w-3 ml-1" />سحب</Badge>
                            ) : tx.type === 'transfer' ? (
                              <Badge className="bg-blue-100 text-blue-700">تحويل</Badge>
                            ) : (
                              <Badge variant="secondary">{tx.type}</Badge>
                            )}
                          </TableCell>
                          <TableCell className={`font-bold ${['deposit','interest'].includes(tx.type) ? 'text-green-600' : 'text-red-600'}`}>
                            {['deposit','interest'].includes(tx.type) ? '+' : '-'}{fmt(tx.amount)} دج
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{tx.description}</TableCell>
                          <TableCell className="font-mono text-xs">{tx.reference || '-'}</TableCell>
                          <TableCell className="font-medium">{fmt(tx.balance_after)} دج</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatShortDate(tx.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Account Dialog */}
        <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>إضافة حساب بنكي</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>اسم البنك (EN)</Label><Input value={accountForm.bank_name} onChange={e => setAccountForm(p => ({...p, bank_name: e.target.value}))} placeholder="CPA, BNA, BEA..." /></div>
                <div><Label>اسم البنك (AR)</Label><Input value={accountForm.bank_name_ar} onChange={e => setAccountForm(p => ({...p, bank_name_ar: e.target.value}))} placeholder="القرض الشعبي..." /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>رقم الحساب</Label><Input value={accountForm.account_number} onChange={e => setAccountForm(p => ({...p, account_number: e.target.value}))} dir="ltr" /></div>
                <div><Label>IBAN</Label><Input value={accountForm.iban} onChange={e => setAccountForm(p => ({...p, iban: e.target.value}))} dir="ltr" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>النوع</Label>
                  <Select value={accountForm.account_type} onValueChange={v => setAccountForm(p => ({...p, account_type: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">جاري</SelectItem>
                      <SelectItem value="savings">توفير</SelectItem>
                      <SelectItem value="business">تجاري</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>العملة</Label><Input value={accountForm.currency} onChange={e => setAccountForm(p => ({...p, currency: e.target.value}))} /></div>
                <div><Label>الرصيد الابتدائي</Label><Input type="number" value={accountForm.initial_balance} onChange={e => setAccountForm(p => ({...p, initial_balance: parseFloat(e.target.value) || 0}))} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAccountDialog(false)}>إلغاء</Button>
              <Button onClick={createAccount}>إضافة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transaction Dialog */}
        <Dialog open={txDialog} onOpenChange={setTxDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>تسجيل عملية بنكية</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>الحساب</Label>
                <Select value={txForm.bank_account_id} onValueChange={v => setTxForm(p => ({...p, bank_account_id: v}))}>
                  <SelectTrigger><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bank_name_ar || a.bank_name} - {a.account_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>النوع</Label>
                  <Select value={txForm.type} onValueChange={v => setTxForm(p => ({...p, type: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deposit">إيداع</SelectItem>
                      <SelectItem value="withdrawal">سحب</SelectItem>
                      <SelectItem value="transfer">تحويل</SelectItem>
                      <SelectItem value="fee">رسوم</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>المبلغ</Label><Input type="number" value={txForm.amount} onChange={e => setTxForm(p => ({...p, amount: parseFloat(e.target.value) || 0}))} /></div>
              </div>
              <div><Label>الوصف</Label><Input value={txForm.description} onChange={e => setTxForm(p => ({...p, description: e.target.value}))} /></div>
              <div><Label>المرجع</Label><Input value={txForm.reference} onChange={e => setTxForm(p => ({...p, reference: e.target.value}))} dir="ltr" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTxDialog(false)}>إلغاء</Button>
              <Button onClick={createTransaction}>تسجيل</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reconcile Dialog */}
        <Dialog open={reconcileDialog} onOpenChange={setReconcileDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>مطابقة بنكية</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>الحساب</Label>
                <Select value={reconcileForm.bank_account_id} onValueChange={v => setReconcileForm(p => ({...p, bank_account_id: v}))}>
                  <SelectTrigger><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bank_name_ar || a.bank_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>رصيد كشف الحساب</Label><Input type="number" value={reconcileForm.statement_balance} onChange={e => setReconcileForm(p => ({...p, statement_balance: parseFloat(e.target.value) || 0}))} /></div>
              <div><Label>تاريخ الكشف</Label><Input type="date" value={reconcileForm.statement_date} onChange={e => setReconcileForm(p => ({...p, statement_date: e.target.value}))} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReconcileDialog(false)}>إلغاء</Button>
              <Button onClick={reconcile}><RefreshCw className="h-4 w-4 ml-2" />مطابقة</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
