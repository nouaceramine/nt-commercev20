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
  Handshake,
  Plus,
  Edit,
  Trash2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Calculator,
  History,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Percent,
  FileText,
  Power,
} from 'lucide-react';

const fmt = (n) => (Number(n) || 0).toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PartnersPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const L = (a, f) => (ar ? a : f);

  const [partners, setPartners] = useState([]);
  const [totalCapital, setTotalCapital] = useState(0);
  const [distributions, setDistributions] = useState([]);
  const [loading, setLoading] = useState(true);

  // dialogs
  const [showPartnerDialog, setShowPartnerDialog] = useState(false);
  const [editingPartner, setEditingPartner] = useState(null);
  const [partnerForm, setPartnerForm] = useState({ name: '', capital: '', phone: '', notes: '' });

  const [capitalDialog, setCapitalDialog] = useState(null); // {partner, direction}
  const [capitalForm, setCapitalForm] = useState({ amount: '', notes: '' });

  const [withdrawDialog, setWithdrawDialog] = useState(null); // partner
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', notes: '' });

  const [movesDialog, setMovesDialog] = useState(null); // {partner, moves}

  // profit report
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [distNotes, setDistNotes] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([
        apiClient.get('/partners'),
        apiClient.get('/partners/distributions'),
      ]);
      setPartners(p.data.partners || []);
      setTotalCapital(p.data.total_capital || 0);
      setDistributions(d.data || []);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ---------- partner CRUD ----------
  const openAddPartner = () => {
    setEditingPartner(null);
    setPartnerForm({ name: '', capital: '', phone: '', notes: '' });
    setShowPartnerDialog(true);
  };
  const openEditPartner = (p) => {
    setEditingPartner(p);
    setPartnerForm({ name: p.name, capital: '', phone: p.phone || '', notes: p.notes || '' });
    setShowPartnerDialog(true);
  };
  const savePartner = async () => {
    if (!partnerForm.name.trim()) { toast.error(L('اسم الشريك مطلوب', 'Nom requis')); return; }
    try {
      if (editingPartner) {
        await apiClient.put(`/partners/${editingPartner.id}`, {
          name: partnerForm.name, phone: partnerForm.phone, notes: partnerForm.notes,
        });
        toast.success(L('تم تعديل الشريك', 'Associé modifié'));
      } else {
        await apiClient.post('/partners', {
          name: partnerForm.name,
          capital: Number(partnerForm.capital) || 0,
          phone: partnerForm.phone,
          notes: partnerForm.notes,
        });
        toast.success(L('تمت إضافة الشريك', 'Associé ajouté'));
      }
      setShowPartnerDialog(false);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };
  const toggleActive = async (p) => {
    try {
      await apiClient.put(`/partners/${p.id}`, { active: !p.active });
      toast.success(p.active ? L('تم تعطيل الشريك', 'Associé désactivé') : L('تم تفعيل الشريك', 'Associé activé'));
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };
  const deletePartner = async (p) => {
    if (!window.confirm(L(`حذف الشريك «${p.name}» نهائياً؟`, `Supprimer «${p.name}» ?`))) return;
    try {
      await apiClient.delete(`/partners/${p.id}`);
      toast.success(L('تم الحذف', 'Supprimé'));
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  // ---------- capital ----------
  const openCapital = (p, direction) => {
    setCapitalDialog({ partner: p, direction });
    setCapitalForm({ amount: '', notes: '' });
  };
  const saveCapital = async () => {
    const amount = Number(capitalForm.amount);
    if (!amount || amount <= 0) { toast.error(L('أدخل مبلغاً صحيحاً', 'Montant invalide')); return; }
    try {
      await apiClient.post(`/partners/${capitalDialog.partner.id}/capital`, {
        amount, direction: capitalDialog.direction, notes: capitalForm.notes,
      });
      toast.success(L('تم تسجيل الحركة', 'Mouvement enregistré'));
      setCapitalDialog(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  // ---------- profit withdrawal ----------
  const openWithdraw = (p) => {
    setWithdrawDialog(p);
    setWithdrawForm({ amount: '', notes: '' });
  };
  const saveWithdraw = async () => {
    const amount = Number(withdrawForm.amount);
    if (!amount || amount <= 0) { toast.error(L('أدخل مبلغاً صحيحاً', 'Montant invalide')); return; }
    try {
      const res = await apiClient.post(`/partners/${withdrawDialog.id}/withdraw-profit`, {
        amount, notes: withdrawForm.notes,
      });
      toast.success(L(`تم السحب — المتبقي: ${fmt(res.data.remaining_due)}`, `Retrait OK — reste: ${fmt(res.data.remaining_due)}`));
      setWithdrawDialog(null);
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  // ---------- movements ----------
  const openMoves = async (p) => {
    try {
      const res = await apiClient.get(`/partners/${p.id}/movements`);
      setMovesDialog({ partner: p, moves: res.data || [] });
    } catch (e) { toast.error(errText(e)); }
  };

  // ---------- profit report ----------
  const runReport = async (s, e) => {
    const sd = s || startDate, ed = e || endDate;
    if (!sd || !ed) { toast.error(L('حدد الفترة أولاً', 'Choisissez la période')); return; }
    setReportLoading(true);
    try {
      const res = await apiClient.get('/partners/profit-report', {
        params: { start_date: `${sd}T00:00:00`, end_date: `${ed}T23:59:59` },
      });
      setReport(res.data);
    } catch (e2) { toast.error(errText(e2)); }
    finally { setReportLoading(false); }
  };
  const presetMonth = (offset) => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    const s = first.toISOString().slice(0, 10);
    const e = last.toISOString().slice(0, 10);
    setStartDate(s); setEndDate(e);
    runReport(s, e);
  };
  const saveDistribution = async (force = false) => {
    if (!report) return;
    try {
      await apiClient.post('/partners/distributions', {
        period_start: report.period_start,
        period_end: report.period_end,
        notes: distNotes,
        force,
      });
      toast.success(L('تم تسجيل التوزيع', 'Distribution enregistrée'));
      setDistNotes('');
      runReport();
      fetchAll();
    } catch (e) {
      if (e?.response?.status === 409) {
        if (window.confirm(L('يوجد توزيع مسجل لنفس الفترة. تسجيل توزيع جديد؟', 'Distribution déjà enregistrée. En créer une nouvelle ?'))) {
          saveDistribution(true);
        }
      } else {
        toast.error(errText(e));
      }
    }
  };
  const deleteDistribution = async (d) => {
    if (!window.confirm(L('حذف هذا التوزيع من السجل؟', 'Supprimer cette distribution ?'))) return;
    try {
      await apiClient.delete(`/partners/distributions/${d.id}`);
      toast.success(L('تم الحذف', 'Supprimé'));
      fetchAll();
    } catch (e) { toast.error(errText(e)); }
  };

  const totalDistributed = distributions.reduce((s, d) => s + (d.net_profit || 0), 0);
  const activeCount = partners.filter((p) => p.active).length;

  const moveLabel = (type) => ({
    capital_in: L('إيداع رأس مال', 'Apport capital'),
    capital_out: L('سحب رأس مال', 'Retrait capital'),
    profit_withdrawal: L('سحب أرباح', 'Retrait bénéfice'),
  }[type] || type);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="partners-page">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Handshake className="h-7 w-7 text-primary" />
              {L('الشركاء وتوزيع الأرباح', 'Associés & partage des bénéfices')}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {L('إدارة حصص الشركاء وتوزيع الأرباح حسب مبلغ المشاركة', 'Gérez les parts et le partage des bénéfices selon les apports')}
            </p>
          </div>
          <Button onClick={openAddPartner} data-testid="add-partner-btn">
            <Plus className="h-4 w-4 me-1" /> {L('إضافة شريك', 'Ajouter un associé')}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900"><Wallet className="h-5 w-5 text-blue-600" /></div>
            <div><p className="text-sm text-muted-foreground">{L('إجمالي رأس المال', 'Capital total')}</p>
              <p className="text-xl font-bold" data-testid="total-capital">{fmt(totalCapital)} {L('دج', 'DA')}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900"><Handshake className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-sm text-muted-foreground">{L('الشركاء النشطون', 'Associés actifs')}</p>
              <p className="text-xl font-bold" data-testid="active-partners">{activeCount} / {partners.length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900"><TrendingUp className="h-5 w-5 text-purple-600" /></div>
            <div><p className="text-sm text-muted-foreground">{L('مجموع الأرباح الموزعة', 'Bénéfices distribués')}</p>
              <p className="text-xl font-bold" data-testid="total-distributed">{fmt(totalDistributed)} {L('دج', 'DA')}</p></div>
          </CardContent></Card>
        </div>

        {/* Partners list */}
        <Card>
          <CardHeader>
            <CardTitle>{L('قائمة الشركاء', 'Liste des associés')}</CardTitle>
            <CardDescription>{L('النسبة = رأس مال الشريك ÷ إجمالي رؤوس أموال الشركاء النشطين', 'Part = capital de l’associé ÷ total des capitaux actifs')}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">{L('جارٍ التحميل...', 'Chargement...')}</div>
            ) : partners.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="no-partners">
                {L('لا يوجد شركاء بعد — أضف أول شريك', 'Aucun associé — ajoutez le premier')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{L('الشريك', 'Associé')}</TableHead>
                      <TableHead>{L('الهاتف', 'Téléphone')}</TableHead>
                      <TableHead>{L('رأس المال', 'Capital')}</TableHead>
                      <TableHead>{L('النسبة', 'Part')}</TableHead>
                      <TableHead>{L('أرباح مستحقة', 'Bénéfices dus')}</TableHead>
                      <TableHead>{L('الحالة', 'Statut')}</TableHead>
                      <TableHead className="text-end">{L('إجراءات', 'Actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map((p) => (
                      <TableRow key={p.id} data-testid={`partner-row-${p.id}`} className={!p.active ? 'opacity-50' : ''}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.phone || '—'}</TableCell>
                        <TableCell>{fmt(p.capital)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" data-testid={`partner-share-${p.id}`}>
                            <Percent className="h-3 w-3 me-1" />{p.share_pct.toFixed(2)}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={p.due > 0 ? 'text-green-600 font-semibold' : ''} data-testid={`partner-due-${p.id}`}>
                            {fmt(p.due)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.active ? 'default' : 'outline'}>
                            {p.active ? L('نشط', 'Actif') : L('معطل', 'Inactif')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end flex-wrap">
                            <Button size="sm" variant="outline" title={L('إيداع رأس مال', 'Apport capital')}
                              data-testid={`capital-in-${p.id}`} onClick={() => openCapital(p, 'in')}>
                              <ArrowDownToLine className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button size="sm" variant="outline" title={L('سحب رأس مال', 'Retrait capital')}
                              data-testid={`capital-out-${p.id}`} onClick={() => openCapital(p, 'out')}>
                              <ArrowUpFromLine className="h-4 w-4 text-orange-600" />
                            </Button>
                            <Button size="sm" variant="outline" title={L('سحب أرباح', 'Retrait bénéfice')}
                              data-testid={`withdraw-profit-${p.id}`} onClick={() => openWithdraw(p)} disabled={!(p.due > 0)}>
                              <Banknote className="h-4 w-4 text-purple-600" />
                            </Button>
                            <Button size="sm" variant="outline" title={L('سجل الحركات', 'Historique')} onClick={() => openMoves(p)}>
                              <History className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" title={L('تعديل', 'Modifier')}
                              data-testid={`edit-partner-${p.id}`} onClick={() => openEditPartner(p)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" title={p.active ? L('تعطيل', 'Désactiver') : L('تفعيل', 'Activer')}
                              data-testid={`toggle-partner-${p.id}`} onClick={() => toggleActive(p)}>
                              <Power className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" title={L('حذف', 'Supprimer')} onClick={() => deletePartner(p)}>
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

        {/* Profit report */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" /> {L('حساب الأرباح والتوزيع', 'Calcul & distribution des bénéfices')}
            </CardTitle>
            <CardDescription>
              {L('صافي الربح = (المبيعات − تكلفة البضاعة المباعة) − المصاريف، ثم يوزَّع على الشركاء النشطين حسب نسبهم',
                'Bénéfice net = (ventes − coût des marchandises) − dépenses, réparti selon les parts')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>{L('من', 'Du')}</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="report-start-date" />
              </div>
              <div>
                <Label>{L('إلى', 'Au')}</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="report-end-date" />
              </div>
              <Button onClick={() => runReport()} disabled={reportLoading} data-testid="run-report-btn">
                {reportLoading ? <RefreshCw className="h-4 w-4 animate-spin me-1" /> : <Calculator className="h-4 w-4 me-1" />}
                {L('احسب', 'Calculer')}
              </Button>
              <Button variant="outline" onClick={() => presetMonth(0)} data-testid="preset-this-month">
                {L('الشهر الحالي', 'Mois en cours')}
              </Button>
              <Button variant="outline" onClick={() => presetMonth(-1)} data-testid="preset-last-month">
                {L('الشهر الماضي', 'Mois dernier')}
              </Button>
            </div>

            {report && (
              <div className="space-y-4" data-testid="profit-report">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <p className="text-xs text-muted-foreground">{L('المبيعات', 'Ventes')}</p>
                    <p className="font-bold" data-testid="report-revenue">{fmt(report.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{report.sales_count} {L('فاتورة', 'ventes')}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <p className="text-xs text-muted-foreground">{L('تكلفة البضاعة', 'Coût marchandises')}</p>
                    <p className="font-bold" data-testid="report-cogs">{fmt(report.cogs)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <p className="text-xs text-muted-foreground">{L('الربح الإجمالي', 'Bénéfice brut')}</p>
                    <p className="font-bold" data-testid="report-gross">{fmt(report.gross_profit)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted text-center">
                    <p className="text-xs text-muted-foreground">{L('المصاريف', 'Dépenses')}</p>
                    <p className="font-bold text-orange-600" data-testid="report-expenses">{fmt(report.expenses_total)}</p>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${report.net_profit >= 0 ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}>
                    <p className="text-xs text-muted-foreground">{L('صافي الربح', 'Bénéfice net')}</p>
                    <p className={`font-bold text-lg ${report.net_profit >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}
                      data-testid="report-net">{fmt(report.net_profit)}</p>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{L('الشريك', 'Associé')}</TableHead>
                      <TableHead>{L('رأس المال', 'Capital')}</TableHead>
                      <TableHead>{L('النسبة', 'Part')}</TableHead>
                      <TableHead>{L('حصته من الربح', 'Sa part du bénéfice')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.shares.map((s) => (
                      <TableRow key={s.partner_id} data-testid={`report-share-${s.partner_id}`}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell>{fmt(s.capital)}</TableCell>
                        <TableCell>{s.share_pct.toFixed(2)}%</TableCell>
                        <TableCell className={s.amount >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {fmt(s.amount)} {L('دج', 'DA')}
                        </TableCell>
                      </TableRow>
                    ))}
                    {report.shares.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">
                        {L('لا يوجد شركاء نشطون', 'Aucun associé actif')}
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>

                {report.already_distributed && (
                  <p className="text-sm text-amber-600" data-testid="already-distributed-warning">
                    {L('⚠ يوجد توزيع مسجل مسبقاً لنفس هذه الفترة', '⚠ Une distribution existe déjà pour cette période')}
                  </p>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <Label>{L('ملاحظة التوزيع', 'Note')}</Label>
                    <Input value={distNotes} onChange={(e) => setDistNotes(e.target.value)}
                      placeholder={L('مثال: توزيع أرباح أوت 2026', 'Ex: bénéfices août 2026')} />
                  </div>
                  <Button onClick={() => saveDistribution(false)} disabled={report.shares.length === 0} data-testid="save-distribution-btn">
                    <FileText className="h-4 w-4 me-1" /> {L('تسجيل التوزيع', 'Enregistrer la distribution')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Distribution history */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> {L('سجل التوزيعات', 'Historique des distributions')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {distributions.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground" data-testid="no-distributions">
                {L('لا توجد توزيعات مسجلة', 'Aucune distribution enregistrée')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{L('الفترة', 'Période')}</TableHead>
                      <TableHead>{L('صافي الربح', 'Bénéfice net')}</TableHead>
                      <TableHead>{L('الشركاء', 'Associés')}</TableHead>
                      <TableHead>{L('ملاحظة', 'Note')}</TableHead>
                      <TableHead>{L('سُجل في', 'Enregistré le')}</TableHead>
                      <TableHead className="text-end">{L('حذف', 'Suppr.')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {distributions.map((d) => (
                      <TableRow key={d.id} data-testid={`distribution-row-${d.id}`}>
                        <TableCell>{d.period_start?.slice(0, 10)} ← {d.period_end?.slice(0, 10)}</TableCell>
                        <TableCell className={d.net_profit >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {fmt(d.net_profit)}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            {(d.shares || []).map((s) => (
                              <div key={s.partner_id}>{s.name}: {fmt(s.amount)} ({s.share_pct.toFixed(1)}%)</div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{d.notes || '—'}</TableCell>
                        <TableCell className="text-xs">{d.created_at?.slice(0, 10)}</TableCell>
                        <TableCell className="text-end">
                          <Button size="sm" variant="outline" onClick={() => deleteDistribution(d)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit partner dialog */}
      <Dialog open={showPartnerDialog} onOpenChange={setShowPartnerDialog}>
        <DialogContent data-testid="partner-dialog">
          <DialogHeader>
            <DialogTitle>{editingPartner ? L('تعديل شريك', 'Modifier l’associé') : L('إضافة شريك جديد', 'Nouvel associé')}</DialogTitle>
            <DialogDescription>{L('رأس المال يُحدَّد عند الإنشاء ويُعدَّل لاحقاً بحركات الإيداع/السحب', 'Le capital est fixé à la création puis ajusté par mouvements')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{L('اسم الشريك *', 'Nom *')}</Label>
              <Input value={partnerForm.name} onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })} data-testid="partner-name-input" />
            </div>
            {!editingPartner && (
              <div>
                <Label>{L('مبلغ المشاركة (رأس المال)', 'Montant de participation (capital)')}</Label>
                <Input type="number" min="0" value={partnerForm.capital}
                  onChange={(e) => setPartnerForm({ ...partnerForm, capital: e.target.value })} data-testid="partner-capital-input" />
              </div>
            )}
            <div>
              <Label>{L('الهاتف', 'Téléphone')}</Label>
              <Input value={partnerForm.phone} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} />
            </div>
            <div>
              <Label>{L('ملاحظات', 'Notes')}</Label>
              <Textarea value={partnerForm.notes} onChange={(e) => setPartnerForm({ ...partnerForm, notes: e.target.value })} />
            </div>
            <Button onClick={savePartner} className="w-full" data-testid="save-partner-btn">
              {editingPartner ? L('حفظ التعديلات', 'Enregistrer') : L('إضافة', 'Ajouter')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Capital movement dialog */}
      <Dialog open={!!capitalDialog} onOpenChange={() => setCapitalDialog(null)}>
        <DialogContent data-testid="capital-dialog">
          <DialogHeader>
            <DialogTitle>
              {capitalDialog?.direction === 'in'
                ? L(`إيداع رأس مال — ${capitalDialog?.partner?.name}`, `Apport capital — ${capitalDialog?.partner?.name}`)
                : L(`سحب رأس مال — ${capitalDialog?.partner?.name}`, `Retrait capital — ${capitalDialog?.partner?.name}`)}
            </DialogTitle>
            <DialogDescription>
              {L('رأس المال الحالي:', 'Capital actuel:')} {fmt(capitalDialog?.partner?.capital)} {L('دج', 'DA')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{L('المبلغ *', 'Montant *')}</Label>
              <Input type="number" min="0" value={capitalForm.amount}
                onChange={(e) => setCapitalForm({ ...capitalForm, amount: e.target.value })} data-testid="capital-amount-input" />
            </div>
            <div>
              <Label>{L('ملاحظة', 'Note')}</Label>
              <Input value={capitalForm.notes} onChange={(e) => setCapitalForm({ ...capitalForm, notes: e.target.value })} />
            </div>
            <Button onClick={saveCapital} className="w-full" data-testid="save-capital-btn">{L('تسجيل', 'Enregistrer')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Withdraw profit dialog */}
      <Dialog open={!!withdrawDialog} onOpenChange={() => setWithdrawDialog(null)}>
        <DialogContent data-testid="withdraw-dialog">
          <DialogHeader>
            <DialogTitle>{L('سحب أرباح', 'Retrait de bénéfice')} — {withdrawDialog?.name}</DialogTitle>
            <DialogDescription>
              {L('الأرباح المستحقة:', 'Bénéfices dus:')} <span className="font-bold text-green-600">{fmt(withdrawDialog?.due)}</span> {L('دج', 'DA')}
              <br />{L('ملاحظة: هذا تسجيل محاسبي فقط — حركة الكاش تُسجَّل من صفحة الصناديق', 'Note: écriture comptable uniquement — le mouvement de caisse se fait depuis la page Caisse')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{L('المبلغ *', 'Montant *')}</Label>
              <Input type="number" min="0" max={withdrawDialog?.due} value={withdrawForm.amount}
                onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })} data-testid="withdraw-amount-input" />
            </div>
            <div>
              <Label>{L('ملاحظة', 'Note')}</Label>
              <Input value={withdrawForm.notes} onChange={(e) => setWithdrawForm({ ...withdrawForm, notes: e.target.value })} />
            </div>
            <Button onClick={saveWithdraw} className="w-full" data-testid="save-withdraw-btn">{L('تسجيل السحب', 'Enregistrer')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Movements history dialog */}
      <Dialog open={!!movesDialog} onOpenChange={() => setMovesDialog(null)}>
        <DialogContent className="max-w-lg" data-testid="movements-dialog">
          <DialogHeader>
            <DialogTitle>{L('سجل الحركات', 'Historique des mouvements')} — {movesDialog?.partner?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {movesDialog?.moves?.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">{L('لا توجد حركات', 'Aucun mouvement')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{L('النوع', 'Type')}</TableHead>
                    <TableHead>{L('المبلغ', 'Montant')}</TableHead>
                    <TableHead>{L('ملاحظة', 'Note')}</TableHead>
                    <TableHead>{L('التاريخ', 'Date')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movesDialog?.moves?.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Badge variant={m.type === 'capital_in' ? 'default' : m.type === 'capital_out' ? 'secondary' : 'outline'}>
                          {moveLabel(m.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{fmt(m.amount)}</TableCell>
                      <TableCell className="text-xs">{m.notes || '—'}</TableCell>
                      <TableCell className="text-xs">{m.created_at?.slice(0, 16).replace('T', ' ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
