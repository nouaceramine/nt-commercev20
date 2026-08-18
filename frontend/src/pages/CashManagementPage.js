import { errText } from '../lib/errorText';
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
  Lock,
  PiggyBank,
  ShoppingCart,
  Plus
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
  // p167: custom boxes linked to workers
  const [users, setUsers] = useState([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newBox, setNewBox] = useState({ name: '', assigned_user_id: '', opening_balance: '' });

  const fetchData = async () => {
    try {
      const [boxesRes, transRes, usersRes] = await Promise.all([
        apiClient.get(`/cash-boxes`),
        apiClient.get(`/transactions`),
        apiClient.get(`/users`).catch(() => ({ data: [] }))
      ]);
      setCashBoxes(boxesRes.data);
      setTransactions(transRes.data);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
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
      toast.error(errText(error) ||  t.somethingWentWrong);
    }
  };

  // p167: create / delete custom boxes
  const handleCreateBox = async (e) => {
    e.preventDefault();
    if (!newBox.name.trim()) return toast.error(language === 'ar' ? 'أدخل اسم الصندوق' : 'Nom requis');
    try {
      await apiClient.post(`/cash-boxes`, {
        name: newBox.name,
        assigned_user_id: newBox.assigned_user_id || '',
        opening_balance: parseFloat(newBox.opening_balance) || 0,
      });
      toast.success(language === 'ar' ? 'تم إنشاء الصندوق' : 'Caisse créée');
      setAddDialogOpen(false);
      setNewBox({ name: '', assigned_user_id: '', opening_balance: '' });
      fetchData();
    } catch (error) {
      toast.error(errText(error) || t.somethingWentWrong);
    }
  };

  const handleDeleteBox = async (box) => {
    try {
      await apiClient.delete(`/cash-boxes/${box.id}`);
      toast.success(language === 'ar' ? 'تم حذف الصندوق' : 'Caisse supprimée');
      fetchData();
    } catch (error) {
      toast.error(errText(error) || t.somethingWentWrong);
    }
  };

  const userName = (id) => users.find(u => u.id === id)?.name || '';

  const getBoxIcon = (type) => {
    switch (type) {
      case 'cash': return Banknote;
      case 'bank': return CreditCard;
      case 'wallet': return Wallet;
      case 'safe': return Lock;
      case 'personal': return PiggyBank;
      case 'ecom': return ShoppingCart;
      default: return Banknote;
    }
  };

  const getBoxColor = (type) => {
    switch (type) {
      case 'cash': return 'bg-emerald-100 text-emerald-700';
      case 'bank': return 'bg-blue-100 text-blue-700';
      case 'wallet': return 'bg-purple-100 text-purple-700';
      case 'safe': return 'bg-amber-100 text-amber-700';
      case 'personal': return 'bg-rose-100 text-rose-700';
      case 'ecom': return 'bg-indigo-100 text-indigo-700';
      default: return 'bg-muted';
    }
  };

  const totalBalance = cashBoxes.filter(b => b.id !== 'personal').reduce((sum, box) => sum + box.balance, 0);  // p68: personal money is outside business capital

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
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(true)} className="gap-2" data-testid="add-box-btn">
              <Plus className="h-5 w-5" />
              {language === 'ar' ? 'إضافة صندوق' : 'Nouvelle caisse'}
            </Button>
            <Button onClick={() => setTransferDialogOpen(true)} className="gap-2" data-testid="transfer-btn">
              <ArrowRightLeft className="h-5 w-5" />
              {t.transferFunds}
            </Button>
          </div>
        </div>

        {/* Cash Boxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cashBoxes.map(box => {
            const Icon = getBoxIcon(box.type);
            return (
              <Card key={box.id} className="relative overflow-hidden" data-testid={`cash-box-${box.id}`}>
                <div className={`absolute top-0 left-0 right-0 h-1 ${box.type === 'cash' ? 'bg-emerald-500' : box.type === 'bank' ? 'bg-blue-500' : box.type === 'safe' ? 'bg-amber-500' : box.type === 'personal' ? 'bg-rose-500' : box.type === 'ecom' ? 'bg-indigo-500' : 'bg-purple-500'}`} />
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{language === 'fr' ? (box.name_fr || box.name) : box.name}</p>
                      <p className="text-3xl font-bold mt-2">{box.balance.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">{t.currency}</p>
                      {box.id === 'personal' && (
                        <p className="text-xs text-muted-foreground mt-1" data-testid="personal-box-hint">
                          {language === 'ar' ? 'مال شخصي — خارج رأس المال الإجمالي' : 'Argent personnel — hors capital'}
                        </p>
                      )}
                      {box.assigned_user_id && (
                        <p className="text-xs text-blue-600 mt-1" data-testid={`box-worker-${box.id}`}>
                          {language === 'ar' ? `العامل: ${userName(box.assigned_user_id)}` : `Employé: ${userName(box.assigned_user_id)}`}
                        </p>
                      )}
                      {box.custom && box.balance === 0 && (
                        <button onClick={() => handleDeleteBox(box)} className="text-xs text-red-500 hover:underline mt-1" data-testid={`box-delete-${box.id}`}>
                          {language === 'ar' ? 'حذف الصندوق' : 'Supprimer'}
                        </button>
                      )}
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

        {/* Add Box Dialog (p167) */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{language === 'ar' ? 'إضافة صندوق نقدي جديد' : 'Nouvelle caisse'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateBox} className="space-y-4">
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'اسم الصندوق' : 'Nom'}</Label>
                <Input
                  value={newBox.name}
                  onChange={(e) => setNewBox({ ...newBox, name: e.target.value })}
                  placeholder={language === 'ar' ? 'مثال: صندوق العامل محمد' : ''}
                  required
                  data-testid="new-box-name"
                />
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'العامل المرتبط (اختياري)' : 'Employé lié (optionnel)'}</Label>
                <Select value={newBox.assigned_user_id || '__none'} onValueChange={(v) => setNewBox({ ...newBox, assigned_user_id: v === '__none' ? '' : v })}>
                  <SelectTrigger data-testid="new-box-worker">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{language === 'ar' ? 'بدون ربط' : 'Aucun'}</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {language === 'ar' ? 'عند الربط: المبيعات النقدية التي يسجلها هذا العامل تدخل هذا الصندوق تلقائياً' : 'Ventes cash de cet employé → cette caisse'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'رصيد افتتاحي (اختياري)' : 'Solde initial'}</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={newBox.opening_balance}
                  onChange={(e) => setNewBox({ ...newBox, opening_balance: e.target.value })}
                  data-testid="new-box-balance"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>{t.cancel}</Button>
                <Button type="submit" data-testid="create-box-btn">{language === 'ar' ? 'إنشاء' : 'Créer'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

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
              {transferData.to_box === 'personal' && (
                <p className="text-xs text-muted-foreground p-2 bg-muted/40 rounded" data-testid="transfer-to-personal-hint">
                  {language === 'ar' ? 'التحويل إلى المال الخاص سيُنقص رأس المال الإجمالي' : 'Vers l\'argent personnel : réduit le capital total'}
                </p>
              )}
              {transferData.from_box === 'personal' && (
                <p className="text-xs text-muted-foreground p-2 bg-muted/40 rounded" data-testid="transfer-from-personal-hint">
                  {language === 'ar' ? 'التحويل من المال الخاص سيُضاف إلى رأس المال الإجمالي' : 'Depuis l\'argent personnel : augmente le capital total'}
                </p>
              )}
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
