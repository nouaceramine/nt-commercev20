import { errText } from '../lib/errorText';
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import {
  KeyRound, Plus, Edit, Trash2, Car, Building, Banknote, CalendarClock,
  CheckCircle2, AlertTriangle, Wrench, RefreshCw,
} from 'lucide-react';

const fmt = (n) => (Number(n) || 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RentalsPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const L = (a, f) => (ar ? a : f);

  const [tab, setTab] = useState('contracts');
  const [assets, setAssets] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [stats, setStats] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [assetFilter, setAssetFilter] = useState('all');
  const [contractFilter, setContractFilter] = useState('all');

  const [assetDialog, setAssetDialog] = useState(null); // null | {editing?}
  const [assetForm, setAssetForm] = useState({});
  const [contractDialog, setContractDialog] = useState(false);
  const [contractForm, setContractForm] = useState({});
  const [payDialog, setPayDialog] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', cash_box_id: 'cash', notes: '' });
  const [extendDialog, setExtendDialog] = useState(null);
  const [extendDate, setExtendDate] = useState('');
  const [closeDialog, setCloseDialog] = useState(null);
  const [closeForm, setCloseForm] = useState({ actual_return_date: '', deposit_action: 'returned', refund_cash_box_id: 'cash', notes: '' });

  const fetchAll = useCallback(async () => {
    try {
      const [a, c, st] = await Promise.all([
        apiClient.get('/rentals/assets'),
        apiClient.get('/rentals/contracts'),
        apiClient.get('/rentals/stats'),
      ]);
      setAssets(a.data || []);
      setContracts(c.data || []);
      setStats(st.data || null);
    } catch (e) { toast.error(errText(e)); }
  }, []);

  useEffect(() => {
    fetchAll();
    apiClient.get('/customers', { params: { limit: 5000 } }).then(r => setCustomers(r.data.items || r.data || [])).catch(() => {});
    apiClient.get('/cash-boxes').then(r => setCashBoxes(r.data || [])).catch(() => {});
  }, [fetchAll]);

  // ---------- assets ----------
  const openAssetDialog = (a) => {
    setAssetForm(a ? { ...a } : { type: 'car', name: '', reference: '', daily_rate: '', monthly_rate: '', deposit_default: '', notes: '' });
    setAssetDialog({ editing: a || null });
  };
  const saveAsset = async () => {
    try {
      const payload = {
        type: assetForm.type,
        name: assetForm.name,
        reference: assetForm.reference || '',
        daily_rate: Number(assetForm.daily_rate) || 0,
        monthly_rate: Number(assetForm.monthly_rate) || 0,
        deposit_default: Number(assetForm.deposit_default) || 0,
        notes: assetForm.notes || '',
      };
      if (assetDialog.editing) {
        await apiClient.put(`/rentals/assets/${assetDialog.editing.id}`, payload);
        toast.success(L('تم تعديل الأصل', 'Bien modifié'));
      } else {
        await apiClient.post('/rentals/assets', payload);
        toast.success(L('تمت إضافة الأصل', 'Bien ajouté'));
      }
      setAssetDialog(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };
  const deleteAsset = async (a) => {
    if (!window.confirm(L(`حذف «${a.name}»؟`, `Supprimer «${a.name}» ?`))) return;
    try {
      await apiClient.delete(`/rentals/assets/${a.id}`);
      toast.success(L('تم الحذف', 'Supprimé'));
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };
  const setMaintenance = async (a, on) => {
    try {
      await apiClient.put(`/rentals/assets/${a.id}`, { status: on ? 'maintenance' : 'available' });
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  // ---------- contracts ----------
  const openContractDialog = () => {
    setContractForm({
      asset_id: '', customer_id: '', customer_name: '',
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      rate_type: 'daily', rate: '', deposit_amount: '', initial_payment: '', cash_box_id: 'cash', notes: '',
    });
    setContractDialog(true);
  };
  const saveContract = async () => {
    if (!contractForm.asset_id) { toast.error(L('اختر الأصل', 'Choisissez le bien')); return; }
    try {
      await apiClient.post('/rentals/contracts', {
        ...contractForm,
        customer_id: contractForm.customer_id || null,
        rate: Number(contractForm.rate) || null,
        deposit_amount: Number(contractForm.deposit_amount) || 0,
        initial_payment: Number(contractForm.initial_payment) || 0,
      });
      toast.success(L('تم إنشاء العقد', 'Contrat créé'));
      setContractDialog(false);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };
  const savePayment = async () => {
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) { toast.error(L('أدخل مبلغاً صحيحاً', 'Montant invalide')); return; }
    try {
      await apiClient.post(`/rentals/contracts/${payDialog.id}/payment`, { ...payForm, amount });
      toast.success(L('تم تسجيل الدفعة', 'Paiement enregistré'));
      setPayDialog(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };
  const saveExtend = async () => {
    if (!extendDate) return;
    try {
      const res = await apiClient.post(`/rentals/contracts/${extendDialog.id}/extend`, { new_end_date: extendDate });
      toast.success(L(`تم التمديد (+${fmt(res.data.extra_amount)} ${L('دج', 'DA')})`, `Prolongé (+${fmt(res.data.extra_amount)} DA)`));
      setExtendDialog(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };
  const saveClose = async () => {
    try {
      const res = await apiClient.post(`/rentals/contracts/${closeDialog.id}/close`, closeForm);
      toast.success(
        res.data.late_fee > 0
          ? L(`أُغلق بغرامة تأخير ${fmt(res.data.late_fee)} دج`, `Clôturé, pénalité ${fmt(res.data.late_fee)} DA`)
          : L('تم إغلاق العقد وإتاحة الأصل', 'Contrat clôturé, bien disponible')
      );
      setCloseDialog(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const statusBadge = (st) => {
    const map = {
      available: ['default', L('متاح', 'Disponible')],
      rented: ['secondary', L('مؤجّر', 'Loué')],
      maintenance: ['outline', L('صيانة', 'Maintenance')],
      active: ['default', L('نشط', 'Actif')],
      overdue: ['destructive', L('متأخر', 'En retard')],
      closed: ['outline', L('مغلق', 'Clôturé')],
    };
    const [variant, label] = map[st] || ['outline', st];
    return <Badge variant={variant}>{label}</Badge>;
  };

  const filteredAssets = assetFilter === 'all' ? assets : assets.filter(a => a.type === assetFilter);
  const filteredContracts = contractFilter === 'all' ? contracts : contracts.filter(c => c.status === contractFilter);
  const availableAssets = assets.filter(a => a.status === 'available');

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="rentals-page">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <KeyRound className="h-7 w-7 text-primary" />
              {L('وحدة الكراء', 'Location')}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{L('كراء السيارات والعقارات — عقود، غرامات، ودائع', 'Voitures & biens — contrats, pénalités, cautions')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openAssetDialog(null)} data-testid="add-asset-btn">
              <Plus className="h-4 w-4 me-1" /> {L('أصل جديد', 'Nouveau bien')}
            </Button>
            <Button onClick={openContractDialog} disabled={availableAssets.length === 0} data-testid="new-contract-btn">
              <Plus className="h-4 w-4 me-1" /> {L('عقد كراء', 'Nouveau contrat')}
            </Button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{L('أصول متاحة', 'Disponibles')}</p>
              <p className="text-2xl font-bold text-green-600" data-testid="stats-available">{stats.assets_available}<span className="text-sm text-muted-foreground">/{stats.assets_total}</span></p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{L('عقود نشطة', 'Contrats actifs')}</p>
              <p className="text-2xl font-bold" data-testid="stats-active">{stats.contracts_active}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{L('عقود متأخرة', 'En retard')}</p>
              <p className={`text-2xl font-bold ${stats.contracts_overdue > 0 ? 'text-red-600' : ''}`} data-testid="stats-overdue">{stats.contracts_overdue}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{L('إيرادات الشهر', 'Revenus du mois')}</p>
              <p className="text-2xl font-bold text-primary" data-testid="stats-month-revenue">{fmt(stats.month_revenue)}</p>
            </CardContent></Card>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          <Button variant={tab === 'contracts' ? 'default' : 'ghost'} onClick={() => setTab('contracts')} data-testid="tab-contracts">
            {L('العقود', 'Contrats')} ({contracts.length})
          </Button>
          <Button variant={tab === 'assets' ? 'default' : 'ghost'} onClick={() => setTab('assets')} data-testid="tab-assets">
            {L('الأصول', 'Biens')} ({assets.length})
          </Button>
        </div>

        {/* Contracts tab */}
        {tab === 'contracts' && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>{L('عقود الكراء', 'Contrats de location')}</CardTitle>
              <Select value={contractFilter} onValueChange={setContractFilter}>
                <SelectTrigger className="w-40 h-8" data-testid="contract-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{L('الكل', 'Tous')}</SelectItem>
                  <SelectItem value="active">{L('نشطة', 'Actifs')}</SelectItem>
                  <SelectItem value="overdue">{L('متأخرة', 'En retard')}</SelectItem>
                  <SelectItem value="closed">{L('مغلقة', 'Clôturés')}</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {filteredContracts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8" data-testid="no-contracts">{L('لا توجد عقود', 'Aucun contrat')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{L('العقد', 'Contrat')}</TableHead>
                        <TableHead>{L('الأصل', 'Bien')}</TableHead>
                        <TableHead>{L('الزبون', 'Client')}</TableHead>
                        <TableHead>{L('الفترة', 'Période')}</TableHead>
                        <TableHead>{L('المستحق', 'Dû')}</TableHead>
                        <TableHead>{L('المدفوع', 'Payé')}</TableHead>
                        <TableHead>{L('الحالة', 'Statut')}</TableHead>
                        <TableHead className="text-end">{L('إجراءات', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContracts.map((c) => (
                        <TableRow key={c.id} data-testid={`contract-row-${c.id}`}>
                          <TableCell className="font-mono text-xs">{c.code}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {c.asset_type === 'car' ? <Car className="h-4 w-4" /> : <Building className="h-4 w-4" />}
                              <div>
                                <div className="font-medium text-sm">{c.asset_name}</div>
                                <div className="text-xs text-muted-foreground">{c.asset_reference}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{c.customer_name}</TableCell>
                          <TableCell className="text-xs">{c.start_date} ← {c.end_date}
                            <div className="text-muted-foreground">{c.periods} {c.rate_type === 'daily' ? L('يوم', 'j') : L('شهر', 'mois')} × {fmt(c.rate)}</div>
                          </TableCell>
                          <TableCell className="font-semibold">{fmt(c.total_due)}
                            {c.late_fee > 0 && <div className="text-xs text-red-600">+{fmt(c.late_fee)} {L('غرامة', 'pénalité')}</div>}
                          </TableCell>
                          <TableCell className="text-green-600">{fmt(c.paid_amount)}</TableCell>
                          <TableCell>{statusBadge(c.status)}</TableCell>
                          <TableCell>
                            {c.status !== 'closed' && (
                              <div className="flex gap-1 justify-end">
                                <Button size="sm" variant="outline" title={L('دفعة', 'Paiement')} data-testid={`pay-${c.id}`}
                                  onClick={() => { setPayDialog(c); setPayForm({ amount: '', cash_box_id: 'cash', notes: '' }); }}>
                                  <Banknote className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button size="sm" variant="outline" title={L('تمديد', 'Prolonger')} data-testid={`extend-${c.id}`}
                                  onClick={() => { setExtendDialog(c); setExtendDate(c.end_date); }}>
                                  <CalendarClock className="h-4 w-4 text-blue-600" />
                                </Button>
                                <Button size="sm" variant="outline" title={L('إغلاق/استرجاع', 'Clôturer')} data-testid={`close-${c.id}`}
                                  onClick={() => { setCloseDialog(c); setCloseForm({ actual_return_date: new Date().toISOString().slice(0, 10), deposit_action: 'returned', refund_cash_box_id: 'cash', notes: '' }); }}>
                                  <CheckCircle2 className="h-4 w-4 text-purple-600" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Assets tab */}
        {tab === 'assets' && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>{L('الأصول القابلة للكراء', 'Biens à louer')}</CardTitle>
              <Select value={assetFilter} onValueChange={setAssetFilter}>
                <SelectTrigger className="w-40 h-8" data-testid="asset-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{L('الكل', 'Tous')}</SelectItem>
                  <SelectItem value="car">{L('سيارات', 'Voitures')}</SelectItem>
                  <SelectItem value="property">{L('عقارات', 'Immobilier')}</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {filteredAssets.length === 0 ? (
                <p className="text-center text-muted-foreground py-8" data-testid="no-assets">{L('لا توجد أصول — أضف سيارة أو عقاراً', 'Aucun bien — ajoutez-en')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{L('الأصل', 'Bien')}</TableHead>
                        <TableHead>{L('المرجع', 'Référence')}</TableHead>
                        <TableHead>{L('يومي', 'Journalier')}</TableHead>
                        <TableHead>{L('شهري', 'Mensuel')}</TableHead>
                        <TableHead>{L('الوديعة', 'Caution')}</TableHead>
                        <TableHead>{L('الحالة', 'Statut')}</TableHead>
                        <TableHead className="text-end">{L('إجراءات', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssets.map((a) => (
                        <TableRow key={a.id} data-testid={`asset-row-${a.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-1 font-medium">
                              {a.type === 'car' ? <Car className="h-4 w-4" /> : <Building className="h-4 w-4" />} {a.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{a.reference || '—'}</TableCell>
                          <TableCell>{a.daily_rate ? fmt(a.daily_rate) : '—'}</TableCell>
                          <TableCell>{a.monthly_rate ? fmt(a.monthly_rate) : '—'}</TableCell>
                          <TableCell>{a.deposit_default ? fmt(a.deposit_default) : '—'}</TableCell>
                          <TableCell>{statusBadge(a.status)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-end">
                              {a.status !== 'rented' && (
                                <Button size="sm" variant="outline" title={a.status === 'maintenance' ? L('إنهاء الصيانة', 'Fin maintenance') : L('إلى الصيانة', 'Maintenance')}
                                  onClick={() => setMaintenance(a, a.status !== 'maintenance')}>
                                  <Wrench className={`h-4 w-4 ${a.status === 'maintenance' ? 'text-green-600' : 'text-orange-500'}`} />
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => openAssetDialog(a)} data-testid={`edit-asset-${a.id}`}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => deleteAsset(a)}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Asset dialog */}
      <Dialog open={!!assetDialog} onOpenChange={() => setAssetDialog(null)}>
        <DialogContent data-testid="asset-dialog">
          <DialogHeader>
            <DialogTitle>{assetDialog?.editing ? L('تعديل أصل', 'Modifier le bien') : L('أصل جديد للكراء', 'Nouveau bien à louer')}</DialogTitle>
            <DialogDescription>{L('سيارة أو عقار مع أسعاره الافتراضية', 'Voiture ou bien immobilier avec ses tarifs')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{L('النوع', 'Type')}</Label>
              <Select value={assetForm.type} onValueChange={(v) => setAssetForm({ ...assetForm, type: v })}>
                <SelectTrigger data-testid="asset-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="car">{L('سيارة', 'Voiture')}</SelectItem>
                  <SelectItem value="property">{L('عقار', 'Immobilier')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{L('الاسم *', 'Nom *')}</Label>
              <Input value={assetForm.name || ''} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                placeholder={assetForm.type === 'car' ? L('مثال: هيونداي أكسنت 2022', 'Ex: Hyundai Accent 2022') : L('مثال: شقة حي السلام', 'Ex: Appartement Cité Salem')}
                data-testid="asset-name-input" />
            </div>
            <div>
              <Label>{assetForm.type === 'car' ? L('رقم التسجيل', 'Immatriculation') : L('العنوان', 'Adresse')}</Label>
              <Input value={assetForm.reference || ''} onChange={(e) => setAssetForm({ ...assetForm, reference: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{L('السعر اليومي', 'Tarif jour')}</Label>
                <Input type="number" min="0" value={assetForm.daily_rate || ''} onChange={(e) => setAssetForm({ ...assetForm, daily_rate: e.target.value })} data-testid="asset-daily-input" />
              </div>
              <div>
                <Label>{L('السعر الشهري', 'Tarif mois')}</Label>
                <Input type="number" min="0" value={assetForm.monthly_rate || ''} onChange={(e) => setAssetForm({ ...assetForm, monthly_rate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>{L('الوديعة الافتراضية', 'Caution par défaut')}</Label>
              <Input type="number" min="0" value={assetForm.deposit_default || ''} onChange={(e) => setAssetForm({ ...assetForm, deposit_default: e.target.value })} />
            </div>
            <div>
              <Label>{L('ملاحظات', 'Notes')}</Label>
              <Textarea value={assetForm.notes || ''} onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })} />
            </div>
            <Button onClick={saveAsset} className="w-full" data-testid="save-asset-btn">{L('حفظ', 'Enregistrer')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contract dialog */}
      <Dialog open={contractDialog} onOpenChange={setContractDialog}>
        <DialogContent className="max-w-lg" data-testid="contract-dialog">
          <DialogHeader>
            <DialogTitle>{L('عقد كراء جديد', 'Nouveau contrat')}</DialogTitle>
            <DialogDescription>{L('الأصول المتاحة فقط تظهر هنا', 'Seuls les biens disponibles apparaissent')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pe-1">
            <div>
              <Label>{L('الأصل *', 'Bien *')}</Label>
              <Select value={contractForm.asset_id} onValueChange={(v) => {
                const a = availableAssets.find(x => x.id === v);
                setContractForm({
                  ...contractForm, asset_id: v,
                  rate: a ? (contractForm.rate_type === 'daily' ? a.daily_rate : a.monthly_rate) : contractForm.rate,
                  deposit_amount: a?.deposit_default || contractForm.deposit_amount,
                });
              }}>
                <SelectTrigger data-testid="contract-asset-select"><SelectValue placeholder={L('اختر...', 'Choisir...')} /></SelectTrigger>
                <SelectContent>
                  {availableAssets.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name} {a.reference ? `(${a.reference})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{L('الزبون', 'Client')}</Label>
              <Select value={contractForm.customer_id} onValueChange={(v) => setContractForm({ ...contractForm, customer_id: v })}>
                <SelectTrigger data-testid="contract-customer-select"><SelectValue placeholder={L('زبون نقدي (اختياري)', 'Client comptant (optionnel)')} /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{L('من', 'Du')}</Label>
                <Input type="date" value={contractForm.start_date} onChange={(e) => setContractForm({ ...contractForm, start_date: e.target.value })} data-testid="contract-start" />
              </div>
              <div>
                <Label>{L('إلى', 'Au')}</Label>
                <Input type="date" value={contractForm.end_date} onChange={(e) => setContractForm({ ...contractForm, end_date: e.target.value })} data-testid="contract-end" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{L('التسعير', 'Tarification')}</Label>
                <Select value={contractForm.rate_type} onValueChange={(v) => {
                  const a = availableAssets.find(x => x.id === contractForm.asset_id);
                  setContractForm({ ...contractForm, rate_type: v, rate: a ? (v === 'daily' ? a.daily_rate : a.monthly_rate) : contractForm.rate });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{L('يومي', 'Journalier')}</SelectItem>
                    <SelectItem value="monthly">{L('شهري', 'Mensuel')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{L('السعر', 'Tarif')}</Label>
                <Input type="number" min="0" value={contractForm.rate} onChange={(e) => setContractForm({ ...contractForm, rate: e.target.value })} data-testid="contract-rate" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{L('الوديعة', 'Caution')}</Label>
                <Input type="number" min="0" value={contractForm.deposit_amount} onChange={(e) => setContractForm({ ...contractForm, deposit_amount: e.target.value })} />
              </div>
              <div>
                <Label>{L('دفعة أولى', 'Acompte')}</Label>
                <Input type="number" min="0" value={contractForm.initial_payment} onChange={(e) => setContractForm({ ...contractForm, initial_payment: e.target.value })} data-testid="contract-initial" />
              </div>
            </div>
            <div>
              <Label>{L('صندوق الاستلام', 'Caisse de réception')}</Label>
              <Select value={contractForm.cash_box_id} onValueChange={(v) => setContractForm({ ...contractForm, cash_box_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cashBoxes.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name} ({fmt(b.balance)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{L('ملاحظات', 'Notes')}</Label>
              <Textarea value={contractForm.notes} onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })} />
            </div>
            <Button onClick={saveContract} className="w-full" data-testid="save-contract-btn">{L('إنشاء العقد', 'Créer le contrat')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={!!payDialog} onOpenChange={() => setPayDialog(null)}>
        <DialogContent data-testid="rental-pay-dialog">
          <DialogHeader>
            <DialogTitle>{L('دفعة على العقد', 'Paiement')} — {payDialog?.code}</DialogTitle>
            <DialogDescription>
              {L('المستحق:', 'Dû:')} {fmt(payDialog?.total_due)} — {L('المدفوع:', 'Payé:')} {fmt(payDialog?.paid_amount)} — {L('الباقي:', 'Reste:')} <span className="font-bold text-red-600">{fmt((payDialog?.total_due || 0) - (payDialog?.paid_amount || 0))}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{L('المبلغ *', 'Montant *')}</Label>
              <Input type="number" min="0" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} data-testid="rental-pay-amount" />
            </div>
            <div>
              <Label>{L('الصندوق', 'Caisse')}</Label>
              <Select value={payForm.cash_box_id} onValueChange={(v) => setPayForm({ ...payForm, cash_box_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cashBoxes.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={savePayment} className="w-full" data-testid="save-rental-pay-btn">{L('تسجيل الدفعة', 'Enregistrer')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Extend dialog */}
      <Dialog open={!!extendDialog} onOpenChange={() => setExtendDialog(null)}>
        <DialogContent data-testid="rental-extend-dialog">
          <DialogHeader>
            <DialogTitle>{L('تمديد العقد', 'Prolonger')} — {extendDialog?.code}</DialogTitle>
            <DialogDescription>{L('النهاية الحالية:', 'Fin actuelle:')} {extendDialog?.end_date}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{L('النهاية الجديدة', 'Nouvelle fin')}</Label>
              <Input type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} data-testid="extend-date" />
            </div>
            <Button onClick={saveExtend} className="w-full" data-testid="save-extend-btn">{L('تمديد', 'Prolonger')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close dialog */}
      <Dialog open={!!closeDialog} onOpenChange={() => setCloseDialog(null)}>
        <DialogContent data-testid="rental-close-dialog">
          <DialogHeader>
            <DialogTitle>{L('إغلاق العقد واسترجاع الأصل', 'Clôturer le contrat')} — {closeDialog?.code}</DialogTitle>
            <DialogDescription>
              {L('غرامة التأخير تُحسب تلقائياً بعد تاريخ', 'La pénalité est calculée après le')} {closeDialog?.end_date}
              {closeDialog?.deposit_amount > 0 && <> — {L('الوديعة:', 'Caution:')} {fmt(closeDialog?.deposit_amount)}</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{L('تاريخ الاسترجاع الفعلي', 'Date de retour réelle')}</Label>
              <Input type="date" value={closeForm.actual_return_date} onChange={(e) => setCloseForm({ ...closeForm, actual_return_date: e.target.value })} data-testid="close-date" />
            </div>
            {closeDialog?.deposit_amount > 0 && (
              <div>
                <Label>{L('قرار الوديعة', 'Caution')}</Label>
                <Select value={closeForm.deposit_action} onValueChange={(v) => setCloseForm({ ...closeForm, deposit_action: v })}>
                  <SelectTrigger data-testid="deposit-action"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="returned">{L('تُرجع للزبون (تُخصم من الصندوق)', 'Restituée (débitée de la caisse)')}</SelectItem>
                    <SelectItem value="kept">{L('تُحتفظ بها', 'Conservée')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>{L('ملاحظة الإغلاق', 'Note de clôture')}</Label>
              <Input value={closeForm.notes} onChange={(e) => setCloseForm({ ...closeForm, notes: e.target.value })} />
            </div>
            <Button onClick={saveClose} className="w-full" data-testid="save-close-btn">{L('إغلاق العقد', 'Clôturer')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
