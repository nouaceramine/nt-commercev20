import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { 
  Wallet, 
  Banknote, 
  CreditCard, 
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Lock
} from 'lucide-react';

export default function CashManagementPage() {
  const { t, language } = useLanguage();
  
  const [cashBoxes, setCashBoxes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferData, setTransferData] = useState({
    from_box: '', to_box: '', amount: ''
  });

  const fetchData = async () => {
    try {
      const [boxesRes, transRes] = await Promise.all([
        apiClient.get(`/cash-boxes`),
        apiClient.get(`/transactions`)
      ]);
      setCashBoxes(boxesRes.data);
      setTransactions(transRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTransfer = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post(`/cash-boxes/transfer`, {
        from_box: transferData.from_box,
        to_box: transferData.to_box,
        amount: parseFloat(transferData.amount)
      });
      toast.success(t.transferCompleted);
      setTransferDialogOpen(false);
      setTransferData({ from_box: '', to_box: '', amount: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  const getBoxIcon = (type) => {
    switch (type) {
      case 'cash': return Banknote;
      case 'bank': return CreditCard;
      case 'wallet': return Wallet;
      case 'safe': return Lock;
      default: return Banknote;
    }
  };

  const getBoxColor = (type) => {
    switch (type) {
      case 'cash': return 'bg-emerald-100 text-emerald-700';
      case 'bank': return 'bg-blue-100 text-blue-700';
      case 'wallet': return 'bg-purple-100 text-purple-700';
      case 'safe': return 'bg-amber-100 text-amber-700';
      default: return 'bg-muted';
    }
  };

  const totalBalance = cashBoxes.reduce((sum, box) => sum + box.balance, 0);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
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
      <div className="space-y-6 animate-fade-in" data-testid="cash-management-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t.cashManagement}</h1>
            <p className="text-muted-foreground mt-1">
              {t.totalCash}: <span className="font-semibold text-foreground">{totalBalance.toFixed(2)} {t.currency}</span>
            </p>
          </div>
          <Button onClick={() => setTransferDialogOpen(true)} className="gap-2" data-testid="transfer-btn">
            <ArrowRightLeft className="h-5 w-5" />
            {t.transferFunds}
          </Button>
        </div>

        {/* Cash Boxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cashBoxes.map(box => {
            const Icon = getBoxIcon(box.type);
            return (
              <Card key={box.id} className="relative overflow-hidden" data-testid={`cash-box-${box.id}`}>
                <div className={`absolute top-0 left-0 right-0 h-1 ${box.type === 'cash' ? 'bg-emerald-500' : box.type === 'bank' ? 'bg-blue-500' : box.type === 'safe' ? 'bg-amber-500' : 'bg-purple-500'}`} />
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{language === 'fr' ? (box.name_fr || box.name) : box.name}</p>
                      <p className="text-3xl font-bold mt-2">{box.balance.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">{t.currency}</p>
                    </div>
                    <div className={`p-4 rounded-xl ${getBoxColor(box.type)}`}>
                      <Icon className="h-8 w-8" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              {t.transactions}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t.noNotifications}</p>
            ) : (
              <div className="space-y-3">
                {transactions.slice(0, 20).map(tx => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${tx.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                        {tx.type === 'income' ? (
                          <TrendingUp className="h-5 w-5" />
                        ) : (
                          <TrendingDown className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{tx.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {tx.cash_box_name} • {formatDate(tx.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className={`font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {tx.type === 'income' ? '+' : '-'}{tx.amount.toFixed(2)} {t.currency}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transfer Dialog */}
        <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.transferFunds}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleTransfer} className="space-y-4">
              <div className="space-y-2">
                <Label>{t.fromBox}</Label>
                <Select value={transferData.from_box} onValueChange={(v) => setTransferData({ ...transferData, from_box: v })}>
                  <SelectTrigger data-testid="from-box-select">
                    <SelectValue placeholder={t.selectCustomer} />
                  </SelectTrigger>
                  <SelectContent>
                    {cashBoxes.map(box => (
                      <SelectItem key={box.id} value={box.id} disabled={box.id === transferData.to_box}>
                        {language === 'fr' ? (box.name_fr || box.name) : box.name} ({box.balance.toFixed(2)} {t.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.toBox}</Label>
                <Select value={transferData.to_box} onValueChange={(v) => setTransferData({ ...transferData, to_box: v })}>
                  <SelectTrigger data-testid="to-box-select">
                    <SelectValue placeholder={t.selectCustomer} />
                  </SelectTrigger>
                  <SelectContent>
                    {cashBoxes.map(box => (
                      <SelectItem key={box.id} value={box.id} disabled={box.id === transferData.from_box}>
                        {language === 'fr' ? (box.name_fr || box.name) : box.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.amount}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={transferData.amount}
                  onChange={(e) => setTransferData({ ...transferData, amount: e.target.value })}
                  required
                  data-testid="transfer-amount-input"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setTransferDialogOpen(false)}>
                  {t.cancel}
                </Button>
                <Button type="submit" data-testid="confirm-transfer-btn">{t.transfer}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
