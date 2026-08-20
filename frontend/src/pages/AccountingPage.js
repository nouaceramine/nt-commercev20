// p196: Accounting — trial balance (as-of) + recent journal entries, realtime
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Scale, RefreshCw, BookOpen, TrendingUp } from 'lucide-react';
import { startRealtime, onEvent } from '../lib/realtime';

const todayStr = () => new Date().toISOString().slice(0, 10);

const AccountingPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [asOf, setAsOf] = useState(todayStr());
  const [tb, setTb] = useState(null);
  const [income, setIncome] = useState(null);  // p197
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fmt = (n) => (Number(n) || 0).toLocaleString(isAr ? 'ar-DZ' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const typeLabel = (t) => ({
    asset: isAr ? 'أصل' : 'Actif',
    liability: isAr ? 'التزام' : 'Passif',
    expense: isAr ? 'مصروف' : 'Charge',
    revenue: isAr ? 'إيراد' : 'Produit',
  }[t] || '—');

  const fetchAll = useCallback(async (dateStr) => {
    try {
      const monthStart = `${dateStr.slice(0, 8)}01`;  // p197: month-to-date range
      const [tbRes, jeRes, isRes] = await Promise.all([
        apiClient.get(`/accounting/reports/trial-balance?as_of_date=${dateStr}`),
        apiClient.get('/accounting/journal-entries?limit=15'),
        apiClient.get(`/accounting/reports/income-statement?start_date=${monthStart}&end_date=${dateStr}`),
      ]);
      setTb(tbRes.data);
      setEntries(Array.isArray(jeRes.data?.items) ? jeRes.data.items : []);
      setIncome(isRes.data);
    } catch (e) {
      console.error('accounting fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchAll(asOf);
  }, [asOf, fetchAll]);

  // p196: realtime refresh on any money event
  useEffect(() => {
    startRealtime();
    const refresh = () => fetchAll(asOf);
    const events = [
      'sale.completed', 'sale.refunded', 'sale.deleted',
      'purchase.recorded', 'expense.created', 'expense.deleted',
      'customer.payment_received', 'supplier.payment_made',
    ];
    const unsubs = events.map((ev) => onEvent(ev, refresh));
    return () => unsubs.forEach((u) => u());
  }, [asOf, fetchAll]);

  return (
    <Layout>
      <div className="space-y-6" data-testid="accounting-page">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Scale className="h-6 w-6" />
              {isAr ? 'المحاسبة — ميزان المراجعة' : 'Comptabilité — Balance de vérification'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isAr ? 'أرصدة الحسابات محسوبة من سطور القيود حتى التاريخ المحدد' : 'Soldes calculés depuis les écritures jusqu’à la date choisie'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value || todayStr())}
              className="w-44"
              data-testid="trial-balance-date"
            />
            <Button variant="outline" size="icon" onClick={() => fetchAll(asOf)} data-testid="trial-balance-refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {tb && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              data-testid="trial-balance-status"
              className={tb.is_balanced ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-red-600 hover:bg-red-600'}
            >
              {tb.is_balanced ? (isAr ? 'متوازن ✓' : 'Équilibrée ✓') : (isAr ? 'غير متوازن ✗' : 'Déséquilibrée ✗')}
            </Badge>
            <Badge variant="outline" data-testid="trial-balance-entries-count">
              {isAr ? `القيود: ${tb.entries_count}` : `Écritures: ${tb.entries_count}`}
            </Badge>
            <Badge variant="outline" data-testid="trial-balance-auto-count">
              {isAr ? `تلقائية: ${tb.auto_entries}` : `Auto: ${tb.auto_entries}`}
            </Badge>
            <Badge variant="outline">
              {isAr ? `يدوية: ${tb.manual_entries}` : `Manuelles: ${tb.manual_entries}`}
            </Badge>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Scale className="h-5 w-5" />
              {isAr ? `ميزان المراجعة — ${asOf}` : `Balance de vérification — ${asOf}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !tb ? (
              <p className="text-sm text-muted-foreground">{isAr ? 'جارٍ التحميل…' : 'Chargement…'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="trial-balance-table">
                  <thead>
                    <tr className="border-b">
                      <th className="text-start p-2 font-semibold">{isAr ? 'الرمز' : 'Code'}</th>
                      <th className="text-start p-2 font-semibold">{isAr ? 'الحساب' : 'Compte'}</th>
                      <th className="text-start p-2 font-semibold">{isAr ? 'النوع' : 'Type'}</th>
                      <th className="text-end p-2 font-semibold">{isAr ? 'مدين' : 'Débit'}</th>
                      <th className="text-end p-2 font-semibold">{isAr ? 'دائن' : 'Crédit'}</th>
                      <th className="text-end p-2 font-semibold">{isAr ? 'السطور' : 'Lignes'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tb?.accounts || []).map((a) => (
                      <tr
                        key={a.account_code}
                        className={`border-b last:border-0 ${a.balance === 0 ? 'text-muted-foreground' : ''}`}
                        data-testid={`tb-row-${a.account_code}`}
                      >
                        <td className="p-2 font-mono">{a.account_code}</td>
                        <td className="p-2">{a.account_name}</td>
                        <td className="p-2">{typeLabel(a.account_type)}</td>
                        <td className="p-2 text-end font-mono">{a.debit ? fmt(a.debit) : '—'}</td>
                        <td className="p-2 text-end font-mono">{a.credit ? fmt(a.credit) : '—'}</td>
                        <td className="p-2 text-end">{a.entries_count || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  {tb && (
                    <tfoot>
                      <tr className="border-t-2 font-bold">
                        <td className="p-2" colSpan={3}>{isAr ? 'الإجمالي' : 'Total'}</td>
                        <td className="p-2 text-end font-mono" data-testid="trial-balance-total-debit">{fmt(tb.total_debit)}</td>
                        <td className="p-2 text-end font-mono" data-testid="trial-balance-total-credit">{fmt(tb.total_credit)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {income && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                {isAr ? `قائمة الدخل — ${income.start_date} ← ${income.end_date}` : `Compte de résultat — ${income.start_date} → ${income.end_date}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="income-statement-table">
                  <tbody>
                    <tr className="border-b bg-muted/30">
                      <td className="p-2 font-semibold" colSpan={2}>{isAr ? 'الإيرادات' : 'Produits'}</td>
                    </tr>
                    {income.revenue_accounts.map((a) => (
                      <tr key={a.account_code} className="border-b" data-testid={`is-rev-${a.account_code}`}>
                        <td className="p-2 ps-6">{a.account_name} <span className="font-mono text-muted-foreground">({a.account_code})</span></td>
                        <td className="p-2 text-end font-mono">{fmt(a.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-b font-semibold">
                      <td className="p-2">{isAr ? 'إجمالي الإيرادات' : 'Total produits'}</td>
                      <td className="p-2 text-end font-mono" data-testid="income-revenue-total">{fmt(income.revenue_total)}</td>
                    </tr>
                    {income.cogs_accounts.map((a) => (
                      <tr key={a.account_code} className="border-b" data-testid={`is-cogs-${a.account_code}`}>
                        <td className="p-2 ps-6">{a.account_name} <span className="font-mono text-muted-foreground">({a.account_code})</span></td>
                        <td className="p-2 text-end font-mono">({fmt(a.amount)})</td>
                      </tr>
                    ))}
                    <tr className="border-b font-semibold">
                      <td className="p-2">{isAr ? 'مجمل الربح' : 'Marge brute'}</td>
                      <td className="p-2 text-end font-mono" data-testid="income-gross-profit">{fmt(income.gross_profit)}</td>
                    </tr>
                    <tr className="border-b bg-muted/30">
                      <td className="p-2 font-semibold" colSpan={2}>{isAr ? 'مصاريف التشغيل' : 'Charges d’exploitation'}</td>
                    </tr>
                    {income.operating_accounts.map((a) => (
                      <tr key={a.account_code} className="border-b" data-testid={`is-exp-${a.account_code}`}>
                        <td className="p-2 ps-6">{a.account_name} <span className="font-mono text-muted-foreground">({a.account_code})</span></td>
                        <td className="p-2 text-end font-mono">({fmt(a.amount)})</td>
                      </tr>
                    ))}
                    <tr className="border-b font-semibold">
                      <td className="p-2">{isAr ? 'إجمالي مصاريف التشغيل' : 'Total charges'}</td>
                      <td className="p-2 text-end font-mono" data-testid="income-expenses-total">({fmt(income.operating_total)})</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td className="p-2">{isAr ? 'صافي الربح / (الخسارة)' : 'Résultat net'}</td>
                      <td className={`p-2 text-end font-mono ${income.net_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`} data-testid="income-net-profit">
                        {fmt(income.net_profit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5" />
              {isAr ? 'أحدث قيود اليومية' : 'Dernières écritures'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="journal-empty">
                {isAr ? 'لا قيود بعد — تُولَّد تلقائياً مع كل بيع أو شراء أو مصروف أو تسوية دين' : 'Aucune écriture — générées automatiquement à chaque vente, achat, dépense ou règlement'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="journal-entries-table">
                  <thead>
                    <tr className="border-b">
                      <th className="text-start p-2 font-semibold">{isAr ? 'الرقم' : 'N°'}</th>
                      <th className="text-start p-2 font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                      <th className="text-start p-2 font-semibold">{isAr ? 'الوصف' : 'Description'}</th>
                      <th className="text-start p-2 font-semibold">{isAr ? 'المصدر' : 'Source'}</th>
                      <th className="text-start p-2 font-semibold">{isAr ? 'الحالة' : 'Statut'}</th>
                      <th className="text-end p-2 font-semibold">{isAr ? 'الإجمالي' : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-b last:border-0" data-testid={`je-row-${e.entry_number}`}>
                        <td className="p-2 font-mono">{e.entry_number}</td>
                        <td className="p-2 font-mono">{e.date}</td>
                        <td className="p-2 max-w-xs truncate">{e.description}</td>
                        <td className="p-2">
                          <Badge variant={e.source === 'auto' ? 'default' : 'secondary'}>
                            {e.source === 'auto' ? (isAr ? 'تلقائي' : 'Auto') : (isAr ? 'يدوي' : 'Manuelle')}
                          </Badge>
                        </td>
                        <td className="p-2">
                          <Badge variant="outline">
                            {e.status === 'approved' ? (isAr ? 'معتمد' : 'Approuvée') : (isAr ? 'معلّق' : 'En attente')}
                          </Badge>
                        </td>
                        <td className="p-2 text-end font-mono">{fmt(e.total_debit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default AccountingPage;
