import { errText } from '../lib/errorText';
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
  Wallet,
  Pencil,
  Trash2
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

  // p165: SIM activation offers catalog
  const [offers, setOffers] = useState([]);
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const emptyOfferForm = { operator: 'ooredoo', name: '', offer_value: '', default_sale_price: '', sim_cost: 100, typical_bonus: '' };
  const [offerForm, setOfferForm] = useState(emptyOfferForm);

  useEffect(() => {
    fetchSlots();
    fetchOffers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOffers = async () => {
    try {
      const r = await apiClient.get('/sim/offers/all');
      setOffers(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      setOffers([]);
    }
  };

  const openNewOffer = () => { setEditingOffer(null); setOfferForm(emptyOfferForm); setShowOfferDialog(true); };
  const openEditOffer = (o) => {
    setEditingOffer(o);
    setOfferForm({ operator: o.operator, name: o.name, offer_value: o.offer_value, default_sale_price: o.default_sale_price, sim_cost: o.sim_cost, typical_bonus: o.typical_bonus });
    setShowOfferDialog(true);
  };

  const saveOffer = async () => {
    if (!offerForm.name.trim() || !(parseFloat(offerForm.offer_value) > 0)) {
      toast.error(language === 'ar' ? 'أدخل اسم العرض وقيمته' : 'Nom et valeur requis');
      return;
    }
    setSaving(true);
    const payload = {
      operator: offerForm.operator,
      name: offerForm.name.trim(),
      offer_value: parseFloat(offerForm.offer_value) || 0,
      default_sale_price: parseFloat(offerForm.default_sale_price) || 0,
      sim_cost: parseFloat(offerForm.sim_cost) || 0,
      typical_bonus: parseFloat(offerForm.typical_bonus) || 0,
    };
    try {
      if (editingOffer) {
        await apiClient.put(`/sim/offers/${editingOffer.id}`, payload);
      } else {
        await apiClient.post('/sim/offers', payload);
      }
      toast.success(language === 'ar' ? 'تم حفظ العرض' : 'Offre enregistrée');
      setShowOfferDialog(false);
      fetchOffers();
    } catch (error) {
      toast.error(errText(error) || t.error);
    } finally {
      setSaving(false);
    }
  };

  const deleteOffer = async (id) => {
    try {
      await apiClient.delete(`/sim/offers/${id}`);
      toast.success(language === 'ar' ? 'تم حذف العرض' : 'Offre supprimée');
      fetchOffers();
    } catch (error) {
      toast.error(t.error);
    }
  };

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
      toast.error(errText(error) ||  t.error);
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
            <TabsTrigger value="offers" className="gap-2" data-testid="offers-tab">
              <CreditCard className="h-4 w-4" />
              {language === 'ar' ? 'عروض التفعيل' : 'Offres'}
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
                        <div className={`p-2 rounded-full ${getOperatorIcon(slot.operator)} text-foreground`}>
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
                      <p className="text-xs text-emerald-600 font-semibold mt-1">
                        {language === 'ar' ? 'البونيس' : 'Bonus'}: {(slot.bonus_balance || 0).toFixed(2)} {t.currency}
                      </p>
                    </div>

                    {/* p165: empty-SIM stock + unit cost */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">{language === 'ar' ? 'شرائح فارغة (مخزون)' : 'SIMs vierges'}</Label>
                        <Input type="number" min="0" value={slot.empty_sims || 0}
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 0;
                            setSlots(slots.map(s => s.slot_id === slot.slot_id ? { ...s, empty_sims: v } : s));
                          }}
                          className="mt-1" dir="ltr" data-testid={`sim-stock-${slot.slot_id}`} />
                      </div>
                      <div>
                        <Label className="text-xs">{language === 'ar' ? 'تكلفة الشريحة' : 'Coût SIM'}</Label>
                        <Input type="number" min="0" value={slot.sim_unit_cost || 0}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setSlots(slots.map(s => s.slot_id === slot.slot_id ? { ...s, sim_unit_cost: v } : s));
                          }}
                          className="mt-1" dir="ltr" />
                      </div>
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
                      onClick={() => updateSlot(slot.slot_id, { phone: slot.phone, operator: slot.operator, empty_sims: slot.empty_sims || 0, sim_unit_cost: slot.sim_unit_cost || 0 })}
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
        {/* p165: Offers catalog tab */}
        <TabsContent value="offers" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle>{language === 'ar' ? 'عروض تفعيل الشرائح' : "Offres d'activation"}</CardTitle>
                    <CardDescription>
                      {language === 'ar'
                        ? 'الربح = سعر البيع + البونيس − قيمة العرض − تكلفة الشريحة'
                        : 'Profit = prix + bonus − valeur − coût'}
                    </CardDescription>
                  </div>
                  <Button onClick={openNewOffer} className="gap-1" data-testid="add-offer-btn">
                    <Plus className="h-4 w-4" />
                    {language === 'ar' ? 'عرض جديد' : 'Nouvelle offre'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {offers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">
                    {language === 'ar' ? 'لا توجد عروض بعد — أضف عروض كل متعامل' : 'Aucune offre'}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'المتعامل' : 'Opérateur'}</TableHead>
                        <TableHead>{language === 'ar' ? 'العرض' : 'Offre'}</TableHead>
                        <TableHead>{language === 'ar' ? 'قيمة العرض' : 'Valeur'}</TableHead>
                        <TableHead>{language === 'ar' ? 'سعر البيع' : 'Prix'}</TableHead>
                        <TableHead>{language === 'ar' ? 'البونيس المتوقع' : 'Bonus'}</TableHead>
                        <TableHead>{language === 'ar' ? 'تكلفة الشريحة' : 'Coût SIM'}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {offers.map(o => (
                        <TableRow key={o.id} data-testid={`offer-row-${o.id}`}>
                          <TableCell><Badge variant="secondary">{o.operator_name || o.operator}</Badge></TableCell>
                          <TableCell className="font-semibold">{o.name}</TableCell>
                          <TableCell>{o.offer_value} {t.currency}</TableCell>
                          <TableCell>{o.default_sale_price} {t.currency}</TableCell>
                          <TableCell className="text-emerald-600">{o.typical_bonus} {t.currency}</TableCell>
                          <TableCell>{o.sim_cost} {t.currency}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEditOffer(o)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => deleteOffer(o.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* p165: Offer add/edit dialog */}
        <Dialog open={showOfferDialog} onOpenChange={setShowOfferDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingOffer ? (language === 'ar' ? 'تعديل العرض' : "Modifier") : (language === 'ar' ? 'عرض جديد' : 'Nouvelle offre')}</DialogTitle>
              <DialogDescription>
                {language === 'ar' ? 'قيمة العرض تُخصم من رصيد شريحتك الأساسية عند التفعيل' : "La valeur est débitée de votre SIM principale"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{language === 'ar' ? 'المتعامل' : 'Opérateur'}</Label>
                <select className="w-full border rounded-md px-3 py-2 mt-1 bg-background" value={offerForm.operator}
                  onChange={(e) => setOfferForm({ ...offerForm, operator: e.target.value })} data-testid="offer-operator">
                  <option value="mobilis">{language === 'ar' ? 'موبيليس' : 'Mobilis'}</option>
                  <option value="djezzy">{language === 'ar' ? 'جازي' : 'Djezzy'}</option>
                  <option value="ooredoo">{language === 'ar' ? 'أوريدو' : 'Ooredoo'}</option>
                </select>
              </div>
              <div>
                <Label>{language === 'ar' ? 'اسم العرض' : "Nom de l'offre"}</Label>
                <Input value={offerForm.name} onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })} className="mt-1" data-testid="offer-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{language === 'ar' ? 'قيمة العرض (تُخصم منك)' : 'Valeur (débitée)'}</Label>
                  <Input type="number" dir="ltr" value={offerForm.offer_value} onChange={(e) => setOfferForm({ ...offerForm, offer_value: e.target.value })} className="mt-1" data-testid="offer-value" />
                </div>
                <div>
                  <Label>{language === 'ar' ? 'سعر البيع للزبون' : 'Prix de vente'}</Label>
                  <Input type="number" dir="ltr" value={offerForm.default_sale_price} onChange={(e) => setOfferForm({ ...offerForm, default_sale_price: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>{language === 'ar' ? 'البونيس المتوقع' : 'Bonus attendu'}</Label>
                  <Input type="number" dir="ltr" value={offerForm.typical_bonus} onChange={(e) => setOfferForm({ ...offerForm, typical_bonus: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>{language === 'ar' ? 'تكلفة الشريحة الفارغة' : 'Coût SIM'}</Label>
                  <Input type="number" dir="ltr" value={offerForm.sim_cost} onChange={(e) => setOfferForm({ ...offerForm, sim_cost: e.target.value })} className="mt-1" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowOfferDialog(false)} className="flex-1">{language === 'ar' ? 'إلغاء' : 'Annuler'}</Button>
                <Button onClick={saveOffer} disabled={saving} className="flex-1" data-testid="offer-save-btn">{t.save}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
