import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { Receipt, Plus, DollarSign, Calendar, TrendingUp, TrendingDown } from 'lucide-react';

export default function DebtsPage() {
  const { t, language } = useLanguage();
  const [debts, setDebts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState(null);
  const [activeTab, setActiveTab] = useState('receivable');
  const [formData, setFormData] = useState({ type: 'receivable', party_type: 'customer', party_id: '', amount: '', due_date: '', notes: '' });
  const [paymentData, setPaymentData] = useState({ amount: '', payment_method: 'cash', notes: '' });

  const fetchData = async () => {
    try {
      const [debtsRes, custRes, suppRes] = await Promise.all([
        apiClient.get(`/debts`),
        apiClient.get(`/customers`),
        apiClient.get(`/suppliers`)
      ]);
      setDebts(debtsRes.data);
      setCustomers(custRes.data);
      setSuppliers(suppRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post(`/debts`, { ...formData, amount: parseFloat(formData.amount) });
      toast.success(t.addDebt);
      setAddDialogOpen(false);
      setFormData({ type: 'receivable', party_type: 'customer', party_id: '', amount: '', due_date: '', notes: '' });
      fetchData();
    } catch (e) { toast.error(t.somethingWentWrong); }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post(`/debts/${selectedDebt.id}/pay`, { debt_id: selectedDebt.id, amount: parseFloat(paymentData.amount), payment_method: paymentData.payment_method, notes: paymentData.notes });
      toast.success(t.debtPaid);
      setPayDialogOpen(false);
      setPaymentData({ amount: '', payment_method: 'cash', notes: '' });
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || t.somethingWentWrong); }
  };

  const filteredDebts = debts.filter(d => d.type === activeTab);
  const totalReceivables = debts.filter(d => d.type === 'receivable' && d.status !== 'paid').reduce((sum, d) => sum + d.remaining_amount, 0);
  const totalPayables = debts.filter(d => d.type === 'payable' && d.status !== 'paid').reduce((sum, d) => sum + d.remaining_amount, 0);

  const getStatusBadge = (status) => {
    const styles = { paid: 'bg-emerald-100 text-emerald-700', partial: 'bg-amber-100 text-amber-700', pending: 'bg-blue-100 text-blue-700', overdue: 'bg-red-100 text-red-700' };
    return <Badge className={styles[status] || 'bg-muted'}>{t[status] || status}</Badge>;
  };

  if (loading) return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="debts-page">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t.debts}</h1>
            <p className="text-muted-foreground">{debts.length} {t.debts}</p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)} className="gap-2"><Plus className="h-5 w-5" />{t.addDebt}</Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-700">{t.receivables}</p>
                <p className="text-2xl font-bold text-emerald-800">{totalReceivables.toFixed(2)} {t.currency}</p>
              </div>
              <TrendingUp className="h-10 w-10 text-emerald-600" />
            </CardContent>
          </Card>
          <Card className="bg-red-50 border-red-200">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700">{t.payables}</p>
                <p className="text-2xl font-bold text-red-800">{totalPayables.toFixed(2)} {t.currency}</p>
              </div>
              <TrendingDown className="h-10 w-10 text-red-600" />
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="receivable">{t.receivables}</TabsTrigger>
            <TabsTrigger value="payable">{t.payables}</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {filteredDebts.length === 0 ? (
              <div className="text-center py-16"><Receipt className="h-16 w-16 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">{t.noDebts}</p></div>
            ) : (
              <div className="space-y-3">
                {filteredDebts.map(debt => (
                  <Card key={debt.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{debt.party_name}</h3>
                          {getStatusBadge(debt.status)}
                        </div>
                        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                          <span>{t.total}: {debt.original_amount.toFixed(2)} {t.currency}</span>
                          <span>{t.paidAmount}: {debt.paid_amount.toFixed(2)} {t.currency}</span>
                          <span className="font-medium text-foreground">{t.remaining}: {debt.remaining_amount.toFixed(2)} {t.currency}</span>
                          {debt.due_date && <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{debt.due_date}</span>}
                        </div>
                      </div>
                      {debt.status !== 'paid' && (
                        <Button variant="outline" size="sm" onClick={() => { setSelectedDebt(debt); setPayDialogOpen(true); }} className="gap-1">
                          <DollarSign className="h-4 w-4" />{t.payDebt}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Add Debt Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent><DialogHeader><DialogTitle>{t.addDebt}</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t.debts}</Label>
                  <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v, party_type: v === 'receivable' ? 'customer' : 'supplier', party_id: ''})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receivable">{t.receivables}</SelectItem>
                      <SelectItem value="payable">{t.payables}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{formData.type === 'receivable' ? t.customers : t.suppliers}</Label>
                  <Select value={formData.party_id} onValueChange={v => setFormData({...formData, party_id: v})}>
                    <SelectTrigger><SelectValue placeholder={t.selectCustomer} /></SelectTrigger>
                    <SelectContent>
                      {(formData.type === 'receivable' ? customers : suppliers).map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t.amount} *</Label><Input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} required /></div>
                <div><Label>{t.dueDate}</Label><Input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} /></div>
              </div>
              <div><Label>{t.notes}</Label><Input value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>{t.cancel}</Button><Button type="submit">{t.save}</Button></div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Pay Debt Dialog */}
        <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
          <DialogContent><DialogHeader><DialogTitle>{t.payDebt} - {selectedDebt?.party_name}</DialogTitle></DialogHeader>
            <div className="mb-4 p-3 bg-muted rounded-lg">
              <p className="text-sm">{t.remaining}: <span className="font-bold">{selectedDebt?.remaining_amount?.toFixed(2)} {t.currency}</span></p>
            </div>
            <form onSubmit={handlePay} className="space-y-4">
              <div><Label>{t.amount} *</Label><Input type="number" max={selectedDebt?.remaining_amount} value={paymentData.amount} onChange={e => setPaymentData({...paymentData, amount: e.target.value})} required /></div>
              <div><Label>{t.paymentMethod}</Label>
                <Select value={paymentData.payment_method} onValueChange={v => setPaymentData({...paymentData, payment_method: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t.cash}</SelectItem>
                    <SelectItem value="bank">{t.bank}</SelectItem>
                    <SelectItem value="wallet">{t.wallet}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t.notes}</Label><Input value={paymentData.notes} onChange={e => setPaymentData({...paymentData, notes: e.target.value})} /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPayDialogOpen(false)}>{t.cancel}</Button><Button type="submit">{t.save}</Button></div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
