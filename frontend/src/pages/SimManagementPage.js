import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Smartphone, 
  CreditCard,
  Phone,
  Plus,
  Minus,
  History,
  RefreshCw,
  Zap,
  Save,
  Wallet
} from 'lucide-react';

export default function SimManagementPage() {
  const { t, language } = useLanguage();
  
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [showBalanceDialog, setShowBalanceDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState(0);
  const [balanceNotes, setBalanceNotes] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Auto Recharge
  const [rechargePhone, setRechargePhone] = useState('');
  const [rechargeAmount, setRechargeAmount] = useState(100);
  const [recharging, setRecharging] = useState(false);
  const [detectedOperator, setDetectedOperator] = useState(null);

  useEffect(() => {
    fetchSlots();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSlots = async () => {
    try {
      const response = await apiClient.get(`/sim/slots`);
      setSlots(response.data);
    } catch (error) {
      console.error('Error fetching slots:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSlot = async (slotId, data) => {
    setSaving(true);
    try {
      await apiClient.put(`/sim/slots/${slotId}`, data);
      toast.success(language === 'ar' ? 'تم تحديث الشريحة' : 'SIM mise à jour');
      fetchSlots();
    } catch (error) {
      toast.error(t.error);
    } finally {
      setSaving(false);
    }
  };

  const openBalanceDialog = (slot) => {
    setSelectedSlot(slot);
    setBalanceAmount(slot.balance || 0);
    setBalanceNotes('');
    setShowBalanceDialog(true);
  };

  const saveBalance = async () => {
    if (!selectedSlot) return;
    
    setSaving(true);
    try {
      await apiClient.put(`/sim/slots/${selectedSlot.slot_id}/balance`, {
        balance: balanceAmount,
        notes: balanceNotes
      });
      toast.success(language === 'ar' ? 'تم تحديث الرصيد' : 'Solde mis à jour');
      setShowBalanceDialog(false);
      fetchSlots();
    } catch (error) {
      toast.error(t.error);
    } finally {
      setSaving(false);
    }
  };

  const fetchLogs = async (slotId) => {
    try {
      const response = await apiClient.get(`/sim/slots/${slotId}/logs`);
      setLogs(response.data);
      setShowLogsDialog(true);
    } catch (error) {
      toast.error(t.error);
    }
  };

  // Detect operator from phone number
  const detectOperator = (phone) => {
    const clean = phone.replace(/\s|-/g, '');
    let prefix = '';
    
    if (clean.startsWith('+213')) {
      prefix = '0' + clean.charAt(4);
    } else if (clean.startsWith('213')) {
      prefix = '0' + clean.charAt(3);
    } else if (clean.startsWith('0')) {
      prefix = clean.substring(0, 2);
    }
    
    const operators = {
      '06': { name: 'موبيليس', name_fr: 'Mobilis', color: 'bg-green-500' },
      '07': { name: 'جازي', name_fr: 'Djezzy', color: 'bg-red-500' },
      '05': { name: 'أوريدو', name_fr: 'Ooredoo', color: 'bg-orange-500' }
    };
    
    setDetectedOperator(operators[prefix] || null);
  };

  const handleRecharge = async () => {
    if (!rechargePhone || rechargeAmount <= 0) {
      toast.error(language === 'ar' ? 'أدخل رقم الهاتف والمبلغ' : 'Entrez le numéro et le montant');
      return;
    }
    
    setRecharging(true);
    try {
      const response = await apiClient.post(`/recharge/auto`, {
        phone: rechargePhone,
        amount: rechargeAmount
      });
      toast.success(response.data.message);
      setRechargePhone('');
      setRechargeAmount(100);
      setDetectedOperator(null);
      fetchSlots(); // Refresh balances
    } catch (error) {
      toast.error(error.response?.data?.detail || t.error);
    } finally {
      setRecharging(false);
    }
  };

  const getOperatorIcon = (operator) => {
    const colors = {
      'موبيليس': 'bg-green-500',
      'جازي': 'bg-red-500',
      'أوريدو': 'bg-orange-500'
    };
    return colors[operator] || 'bg-gray-500';
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="sim-management-page">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Smartphone className="h-8 w-8 text-blue-600" />
            {language === 'ar' ? 'إدارة الشرائح' : 'Gestion des SIM'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'ar' ? 'إدارة رصيد الشرائح وشحن الأرقام تلقائياً' : 'Gérer le solde des SIM et recharger automatiquement'}
          </p>
        </div>

        <Tabs defaultValue="slots">
          <TabsList>
            <TabsTrigger value="slots" className="gap-2">
              <Smartphone className="h-4 w-4" />
              {language === 'ar' ? 'الشرائح' : 'SIM'}
            </TabsTrigger>
            <TabsTrigger value="recharge" className="gap-2">
              <Zap className="h-4 w-4" />
              {language === 'ar' ? 'شحن الرصيد' : 'Recharge'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="slots" className="space-y-6 mt-6">
            {/* SIM Slots */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {slots.map(slot => (
                <Card key={slot.slot_id} className="relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-1 ${getOperatorIcon(slot.operator)}`} />
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${getOperatorIcon(slot.operator)} text-white`}>
                          <Smartphone className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{slot.operator}</CardTitle>
                          <CardDescription>
                            {language === 'ar' ? 'الشريحة' : 'SIM'} {slot.slot_id} - {slot.prefix}x
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-xs">{language === 'ar' ? 'رقم الشريحة' : 'Numéro SIM'}</Label>
                      <Input
                        value={slot.phone || ''}
                        onChange={(e) => {
                          const newSlots = slots.map(s => 
                            s.slot_id === slot.slot_id ? { ...s, phone: e.target.value } : s
                          );
                          setSlots(newSlots);
                        }}
                        placeholder={`0${slot.prefix}xxxxxxxx`}
                        className="mt-1"
                        dir="ltr"
                      />
                    </div>
                    
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground mb-1">{language === 'ar' ? 'الرصيد الحالي' : 'Solde actuel'}</p>
                      <p className="text-3xl font-bold">{(slot.balance || 0).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{t.currency}</p>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => openBalanceDialog(slot)}
                      >
                        <Wallet className="h-4 w-4 me-1" />
                        {language === 'ar' ? 'تحديث الرصيد' : 'Modifier'}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => fetchLogs(slot.slot_id)}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <Button 
                      className="w-full"
                      onClick={() => updateSlot(slot.slot_id, { phone: slot.phone, operator: slot.operator })}
                      disabled={saving}
                    >
                      <Save className="h-4 w-4 me-2" />
                      {t.save}
                    </Button>
                    
                    {slot.last_updated && (
                      <p className="text-xs text-muted-foreground text-center">
                        {language === 'ar' ? 'آخر تحديث' : 'Dernière MAJ'}: {new Date(slot.last_updated).toLocaleString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="recharge" className="space-y-6 mt-6">
            {/* Auto Recharge */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-yellow-500" />
                  {language === 'ar' ? 'شحن الرصيد التلقائي' : 'Recharge automatique'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar' 
                    ? 'أدخل رقم الهاتف وسيتم اختيار الشريحة المناسبة تلقائياً'
                    : 'Entrez le numéro, la SIM appropriée sera sélectionnée automatiquement'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      {language === 'ar' ? 'رقم الهاتف' : 'Numéro de téléphone'}
                    </Label>
                    <Input
                      value={rechargePhone}
                      onChange={(e) => {
                        setRechargePhone(e.target.value);
                        detectOperator(e.target.value);
                      }}
                      placeholder="06xxxxxxxx / 07xxxxxxxx / 05xxxxxxxx"
                      className="mt-1"
                      dir="ltr"
                    />
                    {detectedOperator && (
                      <div className="mt-2 flex items-center gap-2">
                        <Badge className={detectedOperator.color}>
                          {language === 'ar' ? detectedOperator.name : detectedOperator.name_fr}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {language === 'ar' ? 'سيتم الشحن من هذه الشريحة' : 'Sera chargé depuis cette SIM'}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      {language === 'ar' ? 'المبلغ' : 'Montant'}
                    </Label>
                    <Input
                      type="number"
                      value={rechargeAmount}
                      onChange={(e) => setRechargeAmount(parseFloat(e.target.value) || 0)}
                      min="50"
                      step="50"
                      className="mt-1"
                    />
                  </div>
                </div>
                
                {/* Quick amounts */}
                <div className="flex flex-wrap gap-2">
                  {[100, 200, 500, 1000, 2000].map(amount => (
                    <Button
                      key={amount}
                      variant={rechargeAmount === amount ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRechargeAmount(amount)}
                    >
                      {amount} {t.currency}
                    </Button>
                  ))}
                </div>
                
                <Button 
                  onClick={handleRecharge}
                  disabled={recharging || !rechargePhone || !detectedOperator}
                  className="w-full gap-2"
                  size="lg"
                >
                  {recharging ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                  {language === 'ar' ? `شحن ${rechargeAmount} ${t.currency}` : `Recharger ${rechargeAmount} ${t.currency}`}
                </Button>
                
                <div className="p-4 bg-amber-50 rounded-lg">
                  <p className="text-sm text-amber-700">
                    {language === 'ar' 
                      ? '⚠️ هذه الميزة في وضع المحاكاة. للتكامل الفعلي مع أنظمة الشحن، يرجى التواصل مع الدعم.'
                      : '⚠️ Cette fonctionnalité est en mode simulation. Pour une intégration réelle, contactez le support.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Operator Info */}
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'تعريف المشغلين' : 'Identification des opérateurs'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-4 bg-green-50 rounded-lg">
                    <Badge className="bg-green-500 mb-2">06</Badge>
                    <p className="font-bold">موبيليس</p>
                    <p className="text-sm text-muted-foreground">Mobilis</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg">
                    <Badge className="bg-red-500 mb-2">07</Badge>
                    <p className="font-bold">جازي</p>
                    <p className="text-sm text-muted-foreground">Djezzy</p>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg">
                    <Badge className="bg-orange-500 mb-2">05</Badge>
                    <p className="font-bold">أوريدو</p>
                    <p className="text-sm text-muted-foreground">Ooredoo</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Balance Update Dialog */}
        <Dialog open={showBalanceDialog} onOpenChange={setShowBalanceDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                {language === 'ar' ? 'تحديث رصيد الشريحة' : 'Modifier le solde SIM'}
              </DialogTitle>
              <DialogDescription>
                {selectedSlot?.operator} - {language === 'ar' ? 'الشريحة' : 'SIM'} {selectedSlot?.slot_id}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{language === 'ar' ? 'الرصيد الجديد' : 'Nouveau solde'}</Label>
                <Input
                  type="number"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{language === 'ar' ? 'ملاحظات' : 'Notes'}</Label>
                <Input
                  value={balanceNotes}
                  onChange={(e) => setBalanceNotes(e.target.value)}
                  placeholder={language === 'ar' ? 'سبب التعديل...' : 'Raison de la modification...'}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowBalanceDialog(false)} className="flex-1">
                  {t.cancel}
                </Button>
                <Button onClick={saveBalance} disabled={saving} className="flex-1">
                  <Save className="h-4 w-4 me-2" />
                  {t.save}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Logs Dialog */}
        <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                {language === 'ar' ? 'سجل تغييرات الرصيد' : 'Historique des modifications'}
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-96 overflow-auto">
              {logs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {language === 'ar' ? 'لا يوجد سجل' : 'Aucun historique'}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                      <TableHead>{language === 'ar' ? 'قبل' : 'Avant'}</TableHead>
                      <TableHead>{language === 'ar' ? 'بعد' : 'Après'}</TableHead>
                      <TableHead>{language === 'ar' ? 'التغيير' : 'Changement'}</TableHead>
                      <TableHead>{language === 'ar' ? 'ملاحظات' : 'Notes'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">{new Date(log.created_at).toLocaleString()}</TableCell>
                        <TableCell>{log.old_balance?.toFixed(2)}</TableCell>
                        <TableCell>{log.new_balance?.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge className={log.change >= 0 ? 'bg-green-500' : 'bg-red-500'}>
                            {log.change > 0 ? '+' : ''}{log.change?.toFixed(2)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{log.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
