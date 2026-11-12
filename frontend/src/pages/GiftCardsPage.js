import _React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { Gift, Plus, Loader2, Search, Ban, CheckCircle, History } from 'lucide-react';

// M2: gift cards (بطاقات الهدايا) — issue, top-up, redeem, ledger.
const STATUS_META = {
  active:   { ar: 'نشطة',   fr: 'Active',    cls: 'bg-green-100 text-green-700' },
  depleted: { ar: 'مرهونة', fr: 'Épuisée',   cls: 'bg-gray-200 text-gray-700' },
  disabled: { ar: 'معطلة',  fr: 'Désactivée', cls: 'bg-red-100 text-red-700' },
  expired:  { ar: 'منتهية', fr: 'Expirée',   cls: 'bg-orange-100 text-orange-700' },
};

const GiftCardsPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const cur = isAr ? 'دج' : 'DA';

  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({ balance: '', customer_name: '', expires_at: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [checkCode, setCheckCode] = useState('');
  const [checkResult, setCheckResult] = useState(null);
  const [topupTarget, setTopupTarget] = useState(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [txTarget, setTxTarget] = useState(null);
  const [txs, setTxs] = useState([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter !== 'all' ? `?status=${statusFilter}` : '?';
      const s = search ? `${q}&search=${encodeURIComponent(search)}` : q;
      const [listRes, statsRes] = await Promise.all([
        apiClient.get(`/gift-cards${s}`),
        apiClient.get('/gift-cards/stats'),
      ]);
      setItems(listRes.data.items || []);
      setStats(statsRes.data);
    } catch (_e) {
      toast.error(isAr ? 'فشل تحميل البطاقات' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, isAr]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const issue = async () => {
    const bal = parseFloat(issueForm.balance) || 0;
    if (bal <= 0) { toast.error(isAr ? 'أدخل رصيداً صحيحاً' : 'Solde invalide'); return; }
    setSaving(true);
    try {
      await apiClient.post('/gift-cards', {
        balance: bal,
        customer_name: issueForm.customer_name,
        expires_at: issueForm.expires_at || null,
        notes: issueForm.notes,
      });
      toast.success(isAr ? 'أُصدرت البطاقة' : 'Carte émise');
      setIssueOpen(false);
      setIssueForm({ balance: '', customer_name: '', expires_at: '', notes: '' });
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الإصدار' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const doCheck = async () => {
    if (!checkCode.trim()) return;
    try {
      const r = await apiClient.get(`/gift-cards/check/${encodeURIComponent(checkCode.trim())}`);
      setCheckResult(r.data);
    } catch (e) {
      setCheckResult(null);
      toast.error(e?.response?.data?.detail || (isAr ? 'البطاقة غير موجودة' : 'Carte introuvable'));
    }
  };

  const doTopup = async () => {
    const amt = parseFloat(topupAmount) || 0;
    if (amt <= 0 || !topupTarget) return;
    setSaving(true);
    try {
      await apiClient.post(`/gift-cards/${topupTarget.id}/topup`, { amount: amt });
      toast.success(isAr ? 'تم الشحن' : 'Rechargée');
      setTopupTarget(null); setTopupAmount('');
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل الشحن' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (card) => {
    try {
      await apiClient.post(`/gift-cards/${card.id}/toggle`);
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || (isAr ? 'فشل' : 'Échec'));
    }
  };

  const showTxs = async (card) => {
    setTxTarget(card);
    try {
      const r = await apiClient.get(`/gift-cards/${card.id}/transactions`);
      setTxs(r.data.items || []);
    } catch (_e) {
      setTxs([]);
    }
  };

  const badge = (st) => {
    const m = STATUS_META[st] || STATUS_META.active;
    return <Badge className={m.cls}>{isAr ? m.ar : m.fr}</Badge>;
  };

  return (
    <Layout>
      <div className="p-4 space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="h-6 w-6" /> {isAr ? 'بطاقات الهدايا' : 'Cartes cadeaux'}
          </h1>
          <Button onClick={() => setIssueOpen(true)}><Plus className="h-4 w-4 me-1" />{isAr ? 'إصدار بطاقة' : 'Émettre'}</Button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card><CardContent className="p-3 text-center">
              <div className="text-lg font-bold">{stats.total_cards}</div>
              <div className="text-xs text-muted-foreground">{isAr ? 'إجمالي البطاقات' : 'Total cartes'}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-lg font-bold">{(stats.outstanding_liability || 0).toLocaleString()} {cur}</div>
              <div className="text-xs text-muted-foreground">{isAr ? 'رصيد قائم (التزام)' : 'Solde restant'}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-lg font-bold">{stats.by_status?.active?.count || 0}</div>
              <div className="text-xs text-muted-foreground">{isAr ? 'نشطة' : 'Actives'}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-lg font-bold">{stats.by_status?.depleted?.count || 0}</div>
              <div className="text-xs text-muted-foreground">{isAr ? 'مرهونة' : 'Épuisées'}</div>
            </CardContent></Card>
          </div>
        )}

        {/* balance check */}
        <Card>
          <CardContent className="p-3 flex gap-2 items-end flex-wrap">
            <div>
              <Label>{isAr ? 'فحص رصيد بطاقة' : 'Vérifier le solde'}</Label>
              <Input className="w-52 font-mono" placeholder="GC-XXXXXXXX" value={checkCode}
                onChange={e => setCheckCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doCheck()} />
            </div>
            <Button variant="outline" onClick={doCheck}><Search className="h-4 w-4" /></Button>
            {checkResult && (
              <div className="flex items-center gap-2 text-sm">
                {badge(checkResult.status)}
                <b>{(checkResult.balance || 0).toLocaleString()} {cur}</b>
                <span className="text-muted-foreground">{checkResult.customer_name}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-2 flex-wrap">
          <Input className="w-64" placeholder={isAr ? 'بحث بالكود أو الزبون' : 'Code ou client'}
            value={search} onChange={e => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? 'كل الحالات' : 'Tous'}</SelectItem>
              {Object.keys(STATUS_META).map(st => (
                <SelectItem key={st} value={st}>{isAr ? STATUS_META[st].ar : STATUS_META[st].fr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader><CardTitle>{isAr ? 'البطاقات' : 'Cartes'} ({items.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">{isAr ? 'لا توجد بطاقات بعد' : 'Aucune carte'}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="p-2 text-start">{isAr ? 'الكود' : 'Code'}</th>
                      <th className="p-2 text-start">{isAr ? 'الزبون' : 'Client'}</th>
                      <th className="p-2 text-start">{isAr ? 'الرصيد' : 'Solde'}</th>
                      <th className="p-2 text-start">{isAr ? 'الإصدار' : 'Émis'}</th>
                      <th className="p-2 text-start">{isAr ? 'الحالة' : 'Statut'}</th>
                      <th className="p-2 text-start">{isAr ? 'إجراءات' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(c => (
                      <tr key={c.id} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-mono">{c.code}</td>
                        <td className="p-2">{c.customer_name || '—'}</td>
                        <td className="p-2 font-semibold">{(c.balance || 0).toLocaleString()} {cur}</td>
                        <td className="p-2 text-xs">{(c.initial_balance || 0).toLocaleString()} {cur}</td>
                        <td className="p-2">{badge(c.status)}</td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            {['active', 'depleted'].includes(c.status) && (
                              <Button size="sm" variant="outline" onClick={() => { setTopupTarget(c); setTopupAmount(''); }}>
                                {isAr ? 'شحن' : 'Recharger'}
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => showTxs(c)}><History className="h-3 w-3" /></Button>
                            <Button size="sm" variant={c.status === 'disabled' ? 'default' : 'destructive'} onClick={() => toggle(c)}>
                              {c.status === 'disabled' ? <CheckCircle className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* issue dialog */}
        <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? 'إصدار بطاقة هدية' : 'Émettre une carte'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{isAr ? 'الرصيد الابتدائي' : 'Solde initial'}</Label>
                <Input type="number" min="1" value={issueForm.balance}
                  onChange={e => setIssueForm(f => ({ ...f, balance: e.target.value }))} />
              </div>
              <div>
                <Label>{isAr ? 'اسم الزبون (اختياري)' : 'Client (optionnel)'}</Label>
                <Input value={issueForm.customer_name}
                  onChange={e => setIssueForm(f => ({ ...f, customer_name: e.target.value }))} />
              </div>
              <div>
                <Label>{isAr ? 'تاريخ الانتهاء (اختياري)' : 'Expiration (optionnel)'}</Label>
                <Input type="date" value={issueForm.expires_at}
                  onChange={e => setIssueForm(f => ({ ...f, expires_at: e.target.value }))} />
              </div>
              <div>
                <Label>{isAr ? 'ملاحظات' : 'Notes'}</Label>
                <Input value={issueForm.notes}
                  onChange={e => setIssueForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={issue} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {isAr ? 'إصدار' : 'Émettre'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* topup dialog */}
        <Dialog open={!!topupTarget} onOpenChange={(o) => !o && setTopupTarget(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'}>
            <DialogHeader><DialogTitle>{isAr ? `شحن ${topupTarget?.code || ''}` : 'Recharger'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="text-sm">{isAr ? 'الرصيد الحالي' : 'Solde actuel'}: <b>{(topupTarget?.balance || 0).toLocaleString()} {cur}</b></div>
              <div>
                <Label>{isAr ? 'مبلغ الشحن' : 'Montant'}</Label>
                <Input type="number" min="1" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} />
              </div>
              <Button className="w-full" onClick={doTopup} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin me-1" />}
                {isAr ? 'شحن' : 'Recharger'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* transactions dialog */}
        <Dialog open={!!txTarget} onOpenChange={(o) => !o && setTxTarget(null)}>
          <DialogContent dir={isAr ? 'rtl' : 'ltr'} className="max-w-lg">
            <DialogHeader><DialogTitle>{isAr ? `سجل ${txTarget?.code || ''}` : 'Historique'}</DialogTitle></DialogHeader>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-1 text-start">{isAr ? 'النوع' : 'Type'}</th>
                    <th className="p-1 text-start">{isAr ? 'المبلغ' : 'Montant'}</th>
                    <th className="p-1 text-start">{isAr ? 'الرصيد بعد' : 'Solde après'}</th>
                    <th className="p-1 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map(t => (
                    <tr key={t.id} className="border-b">
                      <td className="p-1">{t.type}</td>
                      <td className="p-1">{(t.amount || 0).toLocaleString()}</td>
                      <td className="p-1">{(t.balance_after || 0).toLocaleString()}</td>
                      <td className="p-1 text-xs">{(t.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default GiftCardsPage;
