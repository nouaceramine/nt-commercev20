import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { 
  Clock, 
  Play,
  StopCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  FileText,
  Banknote,
  History,
  Lock,
  Users,
  BarChart3,
  User,
  Mail,
  Send,
  RefreshCw
} from 'lucide-react';

export default function DailySessionsPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  
  const [sessions, setSessions] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [todaySales, setTodaySales] = useState([]);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [summaryDays, setSummaryDays] = useState('7');
  const [activeTab, setActiveTab] = useState('my-sessions');
  const [sessionCode, setSessionCode] = useState('');  // كود الحصة
  
  // Dialogs
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showClosingReport, setShowClosingReport] = useState(false);
  const [closingReport, setClosingReport] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [reportEmail, setReportEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // Form
  const [openingCash, setOpeningCash] = useState(0);
  const [closingNotes, setClosingNotes] = useState('');
  const [actualCash, setActualCash] = useState(0);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch session code when dialog opens
  useEffect(() => {
    if (showStartDialog && !sessionCode) {
      apiClient.get(`/daily-sessions/generate-code`)
        .then(res => setSessionCode(res.data.code))
        .catch(() => {});
    }
  }, [showStartDialog]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isAdmin && activeTab === 'reports') {
      fetchSummary();
    }
    if (isAdmin && activeTab === 'all-sessions') {
      fetchAllSessions();
    }
  }, [summaryDays, activeTab, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAllSessions = async () => {
    try {
      const response = await apiClient.get(`/daily-sessions?all_users=true`);
      setAllSessions(response.data);
    } catch (error) {
      console.error('Error fetching all sessions:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sessionsRes, currentRes, salesRes, cashRes] = await Promise.all([
        apiClient.get(`/daily-sessions`).catch(() => ({ data: [] })),
        apiClient.get(`/daily-sessions/current`).catch(() => ({ data: null })),
        apiClient.get(`/sales`),
        apiClient.get(`/cash-boxes`)
      ]);
      
      setSessions(sessionsRes.data);
      setCashBoxes(cashRes.data);
      setCurrentSession(currentRes.data || null);
      
      // Filter today's sales
      const today = new Date().toISOString().split('T')[0];
      const todaySalesData = salesRes.data.filter(s => s.created_at?.startsWith(today));
      setTodaySales(todaySalesData);
      
      // Set actual cash from cash box
      const cashBox = cashRes.data.find(b => b.id === 'cash');
      if (cashBox) {
        setActualCash(cashBox.balance || 0);
        if (!currentRes.data) {
          setOpeningCash(cashBox.balance || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await apiClient.get(`/daily-sessions/summary?days=${summaryDays}`);
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  };

  const startSession = async () => {
    try {
      // Generate session code first
      let code = '';
      try {
        const codeRes = await apiClient.get(`/daily-sessions/generate-code`);
        code = codeRes.data.code;
      } catch (e) {
        console.error('Error generating session code:', e);
      }
      
      const session = {
        code: code,
        opening_cash: openingCash,
        opened_at: new Date().toISOString(),
        status: 'open'
      };
      
      const response = await apiClient.post(`/daily-sessions`, session);
      setCurrentSession(response.data);
      setShowStartDialog(false);
      setSessionCode('');
      toast.success(language === 'ar' ? 'تم فتح الحصة بنجاح' : 'Session ouverte avec succès');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  const closeSession = async () => {
    if (!currentSession) return;
    
    try {
      const closingData = {
        closing_cash: actualCash,
        closed_at: new Date().toISOString(),
        notes: closingNotes,
        status: 'closed'
      };
      
      // Calculate comprehensive report before closing
      const cashSalesTotal = todaySales.filter(s => s.payment_type === 'cash').reduce((sum, s) => sum + s.total, 0);
      const creditSalesTotal = todaySales.filter(s => s.payment_type === 'credit').reduce((sum, s) => sum + s.total, 0);
      const partialSalesTotal = todaySales.filter(s => s.payment_type === 'partial').reduce((sum, s) => sum + s.total, 0);
      const partialPaidAmount = todaySales.filter(s => s.payment_type === 'partial').reduce((sum, s) => sum + s.paid_amount, 0);
      const totalSales = todaySales.reduce((sum, s) => sum + s.total, 0);
      const totalCollected = cashSalesTotal + partialPaidAmount;
      const totalDebts = creditSalesTotal + (partialSalesTotal - partialPaidAmount);
      
      // Expected cash = opening + cash sales + partial payments
      const expectedCash = (currentSession.opening_cash || 0) + totalCollected;
      const cashDifference = actualCash - expectedCash;
      
      // Calculate actual profit from sale items
      let actualProfit = 0;
      for (const sale of todaySales) {
        for (const item of (sale.items || [])) {
          const purchasePrice = item.purchase_price || 0;
          const salePrice = item.price || 0;
          const quantity = item.quantity || 1;
          actualProfit += (salePrice - purchasePrice) * quantity;
        }
      }
      // If no purchase prices available, use 15% estimate as fallback
      const estimatedProfit = actualProfit > 0 ? actualProfit : totalSales * 0.15;
      
      const report = {
        sessionId: currentSession.id,
        openedAt: currentSession.opened_at,
        closedAt: new Date().toISOString(),
        openingCash: currentSession.opening_cash || 0,
        closingCash: actualCash,
        expectedCash: expectedCash,
        cashDifference: cashDifference,
        salesCount: todaySales.length,
        totalSales: totalSales,
        cashSales: cashSalesTotal,
        creditSales: creditSalesTotal,
        partialSales: partialSalesTotal,
        partialPaid: partialPaidAmount,
        totalCollected: totalCollected,
        totalDebts: totalDebts,
        estimatedProfit: estimatedProfit,
        notes: closingNotes,
        salesByPaymentType: [
          { type: 'cash', label: language === 'ar' ? 'نقدي' : 'Espèces', count: todaySales.filter(s => s.payment_type === 'cash').length, total: cashSalesTotal },
          { type: 'credit', label: language === 'ar' ? 'دين' : 'Crédit', count: todaySales.filter(s => s.payment_type === 'credit').length, total: creditSalesTotal },
          { type: 'partial', label: language === 'ar' ? 'جزئي' : 'Partiel', count: todaySales.filter(s => s.payment_type === 'partial').length, total: partialSalesTotal }
        ],
        topCustomers: getTopCustomers(todaySales)
      };
      
      await apiClient.put(`/daily-sessions/${currentSession.id}/close`, closingData);
      
      // Set report and show it
      setClosingReport(report);
      setShowCloseDialog(false);
      setShowClosingReport(true);
      
      setCurrentSession(null);
      setClosingNotes('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t.somethingWentWrong);
    }
  };

  // Get top customers from sales
  const getTopCustomers = (sales) => {
    const customerTotals = {};
    sales.forEach(sale => {
      if (sale.customer_name) {
        if (!customerTotals[sale.customer_name]) {
          customerTotals[sale.customer_name] = { name: sale.customer_name, total: 0, count: 0 };
        }
        customerTotals[sale.customer_name].total += sale.total;
        customerTotals[sale.customer_name].count += 1;
      }
    });
    return Object.values(customerTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  };

  const viewSessionDetails = (session) => {
    setSelectedSession(session);
    setShowDetailsDialog(true);
  };

  // Calculate session stats
  const calculateSessionStats = (session) => {
    const salesTotal = session.total_sales || 0;
    const cashSales = session.cash_sales || 0;
    const creditSales = session.credit_sales || 0;
    const expectedCash = (session.opening_cash || 0) + cashSales;
    const difference = (session.closing_cash || 0) - expectedCash;
    
    return { salesTotal, cashSales, creditSales, expectedCash, difference };
  };

  // Current session stats
  const currentStats = currentSession ? {
    totalSales: todaySales.reduce((sum, s) => sum + s.total, 0),
    cashSales: todaySales.filter(s => s.payment_type === 'cash').reduce((sum, s) => sum + s.total, 0),
    creditSales: todaySales.filter(s => s.payment_type === 'credit').reduce((sum, s) => sum + s.remaining, 0),
    salesCount: todaySales.length,
    expectedCash: (currentSession.opening_cash || 0) + todaySales.filter(s => s.payment_type === 'cash').reduce((sum, s) => sum + s.total, 0)
  } : null;

  const formatDate = (dateString) => {
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'fr-FR', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(dateString));
  };

  const formatTime = (dateString) => {
    return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'fr-FR', {
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(dateString));
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="daily-sessions-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {language === 'ar' ? 'حصص البيع اليومية' : 'Sessions de vente'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'تتبع الصندوق النقدي والمبيعات اليومية' : 'Suivi de la caisse et des ventes quotidiennes'}
            </p>
          </div>
          {!currentSession ? (
            <Button onClick={() => setShowStartDialog(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="open-session-btn">
              <Play className="h-4 w-4" />
              {language === 'ar' ? 'فتح حصة جديدة' : 'Ouvrir une session'}
            </Button>
          ) : (
            <Button onClick={() => setShowCloseDialog(true)} variant="destructive" className="gap-2" data-testid="close-session-btn">
              <StopCircle className="h-4 w-4" />
              {language === 'ar' ? 'غلق الحصة' : 'Fermer la session'}
            </Button>
          )}
        </div>

        {/* Tabs for Admin */}
        {isAdmin ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="my-sessions" className="gap-2">
                <User className="h-4 w-4" />
                {language === 'ar' ? 'حصصي' : 'Mes sessions'}
              </TabsTrigger>
              <TabsTrigger value="all-sessions" className="gap-2">
                <Users className="h-4 w-4" />
                {language === 'ar' ? 'الكل' : 'Toutes'}
              </TabsTrigger>
              <TabsTrigger value="reports" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                {language === 'ar' ? 'التقارير' : 'Rapports'}
              </TabsTrigger>
            </TabsList>

            {/* My Sessions Tab */}
            <TabsContent value="my-sessions" className="space-y-6">
              {renderCurrentSession()}
              {renderSessionsHistory(sessions.filter(s => s.status === 'closed'))}
            </TabsContent>

            {/* All Sessions Tab */}
            <TabsContent value="all-sessions" className="space-y-6">
              {renderAllSessionsTable()}
            </TabsContent>

            {/* Reports Tab */}
            <TabsContent value="reports" className="space-y-6">
              {renderReports()}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-6">
            {renderCurrentSession()}
            {renderSessionsHistory(sessions.filter(s => s.status === 'closed'))}
          </div>
        )}

        {/* Dialogs */}
        {renderStartDialog()}
        {renderCloseDialog()}
        {renderDetailsDialog()}
        {renderClosingReportDialog()}
      </div>
    </Layout>
  );

  // Render functions
  function renderCurrentSession() {
    return currentSession ? (
      <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-500 text-white">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-emerald-800">
                  {language === 'ar' ? 'حصتك الحالية' : 'Votre session en cours'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar' ? 'بدأت في' : 'Ouverte à'}: {formatTime(currentSession.opened_at)}
                </CardDescription>
              </div>
            </div>
            <Badge className="bg-emerald-500 text-white text-lg px-4 py-1">
              {language === 'ar' ? 'مفتوحة' : 'Ouverte'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 bg-white/60 rounded-xl">
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'رصيد الافتتاح' : 'Ouverture'}</p>
              <p className="text-2xl font-bold text-emerald-700">{currentSession.opening_cash?.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t.currency}</p>
            </div>
            <div className="p-4 bg-white/60 rounded-xl">
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'المبيعات النقدية' : 'Ventes espèces'}</p>
              <p className="text-2xl font-bold text-blue-600">{currentStats?.cashSales.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t.currency}</p>
            </div>
            <div className="p-4 bg-white/60 rounded-xl">
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'البيع بالدين' : 'Ventes crédit'}</p>
              <p className="text-2xl font-bold text-amber-600">{currentStats?.creditSales.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t.currency}</p>
            </div>
            <div className="p-4 bg-white/60 rounded-xl">
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'عدد المبيعات' : 'Nb ventes'}</p>
              <p className="text-2xl font-bold">{currentStats?.salesCount}</p>
              <p className="text-xs text-muted-foreground">{language === 'ar' ? 'عملية' : 'ventes'}</p>
            </div>
            <div className="p-4 bg-white/60 rounded-xl border-2 border-emerald-300">
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'المتوقع في الصندوق' : 'Attendu caisse'}</p>
              <p className="text-2xl font-bold text-emerald-700">{currentStats?.expectedCash.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t.currency}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    ) : (
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-8 text-center">
          <Lock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">
            {language === 'ar' ? 'لا توجد حصة مفتوحة' : 'Aucune session ouverte'}
          </h3>
          <p className="text-muted-foreground mb-4">
            {language === 'ar' ? 'افتح حصة جديدة لبدء تتبع المبيعات' : 'Ouvrez une session pour commencer le suivi'}
          </p>
          <Button onClick={() => setShowStartDialog(true)} className="gap-2">
            <Play className="h-4 w-4" />
            {language === 'ar' ? 'فتح حصة' : 'Ouvrir session'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  function renderSessionsHistory(filteredSessions) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {language === 'ar' ? 'سجل حصصك' : 'Historique de vos sessions'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{language === 'ar' ? 'لا يوجد سجل حصص سابقة' : 'Aucun historique'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الافتتاح' : 'Ouverture'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الإغلاق' : 'Fermeture'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المبيعات' : 'Ventes'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الفرق' : 'Différence'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.slice(0, 10).map(session => {
                  const stats = calculateSessionStats(session);
                  return (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{formatDate(session.opened_at)}</TableCell>
                      <TableCell>{session.opening_cash?.toFixed(2)} {t.currency}</TableCell>
                      <TableCell>{session.closing_cash?.toFixed(2)} {t.currency}</TableCell>
                      <TableCell className="text-emerald-600 font-semibold">
                        {stats.salesTotal.toFixed(2)} {t.currency}
                      </TableCell>
                      <TableCell>
                        <Badge className={stats.difference === 0 ? 'bg-emerald-100 text-emerald-700' : stats.difference > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}>
                          {stats.difference > 0 ? '+' : ''}{stats.difference.toFixed(2)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => viewSessionDetails(session)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderAllSessionsTable() {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {language === 'ar' ? 'جميع حصص الموظفين' : 'Sessions de tous les employés'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allSessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{language === 'ar' ? 'لا توجد حصص' : 'Aucune session'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'الموظف' : 'Employé'}</TableHead>
                  <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المبيعات' : 'Ventes'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الفرق' : 'Différence'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allSessions.slice(0, 20).map(session => {
                  const stats = calculateSessionStats(session);
                  return (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-medium">{session.user_name || session.created_by || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(session.opened_at)}</TableCell>
                      <TableCell className="text-emerald-600 font-semibold">
                        {stats.salesTotal.toFixed(2)} {t.currency}
                      </TableCell>
                      <TableCell>
                        {session.status === 'closed' && (
                          <Badge className={stats.difference === 0 ? 'bg-emerald-100 text-emerald-700' : stats.difference > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}>
                            {stats.difference > 0 ? '+' : ''}{stats.difference.toFixed(2)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={session.status === 'open' ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700'}>
                          {session.status === 'open' 
                            ? (language === 'ar' ? 'مفتوحة' : 'Ouverte')
                            : (language === 'ar' ? 'مغلقة' : 'Fermée')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => viewSessionDetails(session)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    );
  }

  function renderReports() {
    return (
      <div className="space-y-6">
        {/* Period Selector */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Label>{language === 'ar' ? 'الفترة' : 'Période'}</Label>
              <Select value={summaryDays} onValueChange={setSummaryDays}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{language === 'ar' ? '7 أيام' : '7 jours'}</SelectItem>
                  <SelectItem value="14">{language === 'ar' ? '14 يوم' : '14 jours'}</SelectItem>
                  <SelectItem value="30">{language === 'ar' ? '30 يوم' : '30 jours'}</SelectItem>
                  <SelectItem value="90">{language === 'ar' ? '90 يوم' : '90 jours'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Overall Summary */}
        {summary && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  {language === 'ar' ? 'ملخص إجمالي' : 'Résumé global'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar' ? `آخر ${summaryDays} يوم` : `Derniers ${summaryDays} jours`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="p-4 bg-muted/50 rounded-xl text-center">
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'عدد الحصص' : 'Nb sessions'}</p>
                    <p className="text-3xl font-bold">{summary.overall.total_sessions}</p>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-xl text-center">
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي المبيعات' : 'Total ventes'}</p>
                    <p className="text-2xl font-bold text-emerald-600">{summary.overall.total_sales.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{t.currency}</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-xl text-center">
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'المبيعات النقدية' : 'Ventes espèces'}</p>
                    <p className="text-2xl font-bold text-blue-600">{summary.overall.total_cash_sales.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{t.currency}</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-xl text-center">
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'البيع بالدين' : 'Ventes crédit'}</p>
                    <p className="text-2xl font-bold text-amber-600">{summary.overall.total_credit_sales.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{t.currency}</p>
                  </div>
                  <div className={`p-4 rounded-xl text-center ${summary.overall.total_difference >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي الفرق' : 'Différence totale'}</p>
                    <p className={`text-2xl font-bold ${summary.overall.total_difference >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {summary.overall.total_difference > 0 ? '+' : ''}{summary.overall.total_difference.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.currency}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Per Employee Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {language === 'ar' ? 'تقرير كل موظف' : 'Rapport par employé'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.by_user.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{language === 'ar' ? 'لا توجد بيانات' : 'Aucune donnée'}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'الموظف' : 'Employé'}</TableHead>
                        <TableHead>{language === 'ar' ? 'عدد الحصص' : 'Nb sessions'}</TableHead>
                        <TableHead>{language === 'ar' ? 'المبيعات' : 'Ventes'}</TableHead>
                        <TableHead>{language === 'ar' ? 'النقدية' : 'Espèces'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الدين' : 'Crédit'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الفرق' : 'Différence'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.by_user.map(userStat => (
                        <TableRow key={userStat.user_id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <span className="font-medium">{userStat.user_name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{userStat.sessions_count}</TableCell>
                          <TableCell className="text-emerald-600 font-semibold">
                            {userStat.total_sales.toFixed(2)} {t.currency}
                          </TableCell>
                          <TableCell>{userStat.cash_sales.toFixed(2)} {t.currency}</TableCell>
                          <TableCell>{userStat.credit_sales.toFixed(2)} {t.currency}</TableCell>
                          <TableCell>
                            <Badge className={userStat.total_difference >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                              {userStat.total_difference > 0 ? '+' : ''}{userStat.total_difference.toFixed(2)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  function renderStartDialog() {
    return (
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-emerald-600" />
              {language === 'ar' ? 'فتح حصة جديدة' : 'Ouvrir une session'}
              {sessionCode && (
                <span className="font-mono text-sm bg-emerald-100 text-emerald-700 px-2 py-1 rounded ms-2">{sessionCode}</span>
              )}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar' ? 'أدخل رصيد الصندوق الافتتاحي' : 'Entrez le solde d\'ouverture de la caisse'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>{language === 'ar' ? 'رصيد الافتتاح' : 'Solde d\'ouverture'}</Label>
              <div className="relative mt-1">
                <Banknote className="absolute start-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="number"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(parseFloat(e.target.value) || 0)}
                  className="ps-10 text-lg"
                  placeholder="0.00"
                  data-testid="opening-cash-input"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {language === 'ar' ? 'الرصيد الحالي في الصندوق' : 'Solde actuel de la caisse'}: {actualCash.toFixed(2)} {t.currency}
              </p>
            </div>
            <Button onClick={startSession} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="start-session-btn">
              <Play className="h-4 w-4" />
              {language === 'ar' ? 'بدء الحصة' : 'Démarrer la session'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  function renderCloseDialog() {
    return (
      <AlertDialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <StopCircle className="h-5 w-5 text-red-600" />
              {language === 'ar' ? 'غلق الحصة' : 'Fermer la session'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ar' ? 'تأكد من عد الصندوق قبل الغلق' : 'Vérifiez le comptage de la caisse avant de fermer'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {currentSession && currentStats && (
            <div className="space-y-4 my-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span>{language === 'ar' ? 'رصيد الافتتاح' : 'Solde ouverture'}</span>
                  <span className="font-semibold">{currentSession.opening_cash?.toFixed(2)} {t.currency}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>{language === 'ar' ? '+ المبيعات النقدية' : '+ Ventes espèces'}</span>
                  <span className="font-semibold">{currentStats.cashSales.toFixed(2)} {t.currency}</span>
                </div>
                <div className="flex justify-between pt-2 border-t font-bold">
                  <span>{language === 'ar' ? 'المتوقع في الصندوق' : 'Attendu en caisse'}</span>
                  <span>{currentStats.expectedCash.toFixed(2)} {t.currency}</span>
                </div>
              </div>

              <div>
                <Label>{language === 'ar' ? 'المبلغ الفعلي في الصندوق' : 'Montant réel en caisse'}</Label>
                <Input
                  type="number"
                  value={actualCash}
                  onChange={(e) => setActualCash(parseFloat(e.target.value) || 0)}
                  className="mt-1 text-lg"
                  data-testid="closing-cash-input"
                />
              </div>

              {actualCash !== currentStats.expectedCash && (
                <div className={`p-3 rounded-lg ${actualCash > currentStats.expectedCash ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                  <p className="font-semibold">
                    {language === 'ar' ? 'الفرق' : 'Différence'}: {(actualCash - currentStats.expectedCash).toFixed(2)} {t.currency}
                  </p>
                  <p className="text-sm">
                    {actualCash > currentStats.expectedCash 
                      ? (language === 'ar' ? 'فائض في الصندوق' : 'Excédent de caisse')
                      : (language === 'ar' ? 'عجز في الصندوق' : 'Déficit de caisse')}
                  </p>
                </div>
              )}

              <div>
                <Label>{language === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (optionnel)'}</Label>
                <Textarea
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder={language === 'ar' ? 'أي ملاحظات عن الحصة...' : 'Notes sur la session...'}
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={closeSession} className="bg-red-600 hover:bg-red-700" data-testid="confirm-close-btn">
              {language === 'ar' ? 'تأكيد الغلق' : 'Confirmer la fermeture'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  function renderDetailsDialog() {
    return (
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {language === 'ar' ? 'تفاصيل الحصة' : 'Détails de la session'}
            </DialogTitle>
          </DialogHeader>
          {selectedSession && (
            <div className="space-y-4 mt-4">
              {/* Employee Name */}
              {(selectedSession.user_name || selectedSession.created_by) && (
                <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'الموظف' : 'Employé'}</p>
                    <p className="font-semibold">{selectedSession.user_name || selectedSession.created_by}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'وقت الافتتاح' : 'Ouverture'}</p>
                  <p className="font-semibold">{formatDate(selectedSession.opened_at)}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'وقت الإغلاق' : 'Fermeture'}</p>
                  <p className="font-semibold">{selectedSession.closed_at ? formatDate(selectedSession.closed_at) : '-'}</p>
                </div>
              </div>
              
              <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex justify-between">
                  <span>{language === 'ar' ? 'رصيد الافتتاح' : 'Ouverture'}</span>
                  <span className="font-semibold">{selectedSession.opening_cash?.toFixed(2)} {t.currency}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>{language === 'ar' ? 'إجمالي المبيعات' : 'Total ventes'}</span>
                  <span className="font-semibold">{selectedSession.total_sales?.toFixed(2)} {t.currency}</span>
                </div>
                <div className="flex justify-between text-blue-600">
                  <span>{language === 'ar' ? 'المبيعات النقدية' : 'Ventes espèces'}</span>
                  <span className="font-semibold">{selectedSession.cash_sales?.toFixed(2)} {t.currency}</span>
                </div>
                <div className="flex justify-between text-amber-600">
                  <span>{language === 'ar' ? 'البيع بالدين' : 'Ventes crédit'}</span>
                  <span className="font-semibold">{selectedSession.credit_sales?.toFixed(2)} {t.currency}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span>{language === 'ar' ? 'رصيد الإغلاق' : 'Fermeture'}</span>
                  <span className="font-semibold">{selectedSession.closing_cash?.toFixed(2)} {t.currency}</span>
                </div>
                {selectedSession.status === 'closed' && (
                  <div className="flex justify-between pt-2 border-t">
                    <span>{language === 'ar' ? 'الفرق' : 'Différence'}</span>
                    <Badge className={calculateSessionStats(selectedSession).difference >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                      {calculateSessionStats(selectedSession).difference > 0 ? '+' : ''}{calculateSessionStats(selectedSession).difference.toFixed(2)}
                    </Badge>
                  </div>
                )}
              </div>

              {selectedSession.notes && (
                <div className="p-3 bg-amber-50 rounded-lg">
                  <p className="text-sm font-medium text-amber-700">{language === 'ar' ? 'ملاحظات' : 'Notes'}:</p>
                  <p className="text-amber-600">{selectedSession.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  function renderClosingReportDialog() {
    if (!closingReport) return null;
    
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('ar-DZ', { minimumFractionDigits: 2 }).format(amount || 0);
    };

    return (
      <Dialog open={showClosingReport} onOpenChange={(open) => {
        setShowClosingReport(open);
        if (!open) {
          toast.success(language === 'ar' ? 'تم غلق الحصة بنجاح' : 'Session fermée avec succès');
          setClosingReport(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <FileText className="h-6 w-6 text-primary" />
              {language === 'ar' ? 'تقرير غلق الحصة' : 'Rapport de clôture'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ar' ? 'ملخص شامل لنشاط الحصة' : 'Résumé complet de l\'activité de la session'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Time Info */}
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">{language === 'ar' ? 'وقت الفتح' : 'Ouverture'}</p>
                <p className="font-medium">{new Date(closingReport.openedAt).toLocaleTimeString('ar-DZ')}</p>
              </div>
              <div className="text-center">
                <Clock className="h-5 w-5 text-muted-foreground mx-auto" />
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">{language === 'ar' ? 'وقت الغلق' : 'Fermeture'}</p>
                <p className="font-medium">{new Date(closingReport.closedAt).toLocaleTimeString('ar-DZ')}</p>
              </div>
            </div>

            {/* Cash Summary */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Banknote className="h-5 w-5 text-green-600" />
                {language === 'ar' ? 'ملخص الصندوق' : 'Résumé de la caisse'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'رصيد الافتتاح' : 'Solde d\'ouverture'}</p>
                  <p className="text-lg font-bold text-blue-600">{formatCurrency(closingReport.openingCash)} {t.currency}</p>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'المبلغ المحصل' : 'Montant collecté'}</p>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(closingReport.totalCollected)} {t.currency}</p>
                </div>
                <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'المتوقع في الصندوق' : 'Attendu en caisse'}</p>
                  <p className="text-lg font-bold text-purple-600">{formatCurrency(closingReport.expectedCash)} {t.currency}</p>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'الفعلي في الصندوق' : 'Réel en caisse'}</p>
                  <p className="text-lg font-bold text-amber-600">{formatCurrency(closingReport.closingCash)} {t.currency}</p>
                </div>
              </div>
              
              {/* Difference */}
              <div className={`p-3 rounded-lg flex items-center justify-between ${
                closingReport.cashDifference >= 0 
                  ? 'bg-green-100 dark:bg-green-950/50' 
                  : 'bg-red-100 dark:bg-red-950/50'
              }`}>
                <span className="font-medium">
                  {language === 'ar' ? 'الفرق' : 'Différence'}
                </span>
                <span className={`text-lg font-bold flex items-center gap-1 ${
                  closingReport.cashDifference >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {closingReport.cashDifference >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {closingReport.cashDifference >= 0 ? '+' : ''}{formatCurrency(closingReport.cashDifference)} {t.currency}
                </span>
              </div>
            </div>

            {/* Sales Summary */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                {language === 'ar' ? 'ملخص المبيعات' : 'Résumé des ventes'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-2xl font-bold text-primary">{closingReport.salesCount}</p>
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'عدد المبيعات' : 'Nombre de ventes'}</p>
                </div>
                <div className="p-3 border rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(closingReport.totalSales)}</p>
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'إجمالي المبيعات' : 'Total des ventes'}</p>
                </div>
              </div>

              {/* Sales by Payment Type */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>{language === 'ar' ? 'طريقة الدفع' : 'Mode de paiement'}</TableHead>
                      <TableHead className="text-center">{language === 'ar' ? 'العدد' : 'Nombre'}</TableHead>
                      <TableHead className="text-left">{language === 'ar' ? 'المبلغ' : 'Montant'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closingReport.salesByPaymentType.map(item => (
                      <TableRow key={item.type}>
                        <TableCell className="font-medium">{item.label}</TableCell>
                        <TableCell className="text-center">{item.count}</TableCell>
                        <TableCell>{formatCurrency(item.total)} {t.currency}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Debts */}
            <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg space-y-2">
              <h3 className="font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
                <Lock className="h-5 w-5" />
                {language === 'ar' ? 'الديون' : 'Créances'}
              </h3>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{language === 'ar' ? 'إجمالي الديون الجديدة' : 'Total nouvelles créances'}</span>
                <span className="text-lg font-bold text-red-600">{formatCurrency(closingReport.totalDebts)} {t.currency}</span>
              </div>
            </div>

            {/* Top Customers */}
            {closingReport.topCustomers && closingReport.topCustomers.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  {language === 'ar' ? 'أكثر الزبائن شراءً' : 'Meilleurs clients'}
                </h3>
                <div className="space-y-2">
                  {closingReport.topCustomers.map((customer, index) => (
                    <div key={`session-sale-${sale.id || sale.invoice_number || index}`} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {index + 1}
                        </span>
                        <span>{customer.name}</span>
                        <Badge variant="outline" className="text-xs">{customer.count} {language === 'ar' ? 'عملية' : 'op.'}</Badge>
                      </div>
                      <span className="font-semibold">{formatCurrency(customer.total)} {t.currency}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {closingReport.notes && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{language === 'ar' ? 'ملاحظات' : 'Notes'}:</p>
                <p className="text-amber-600 dark:text-amber-300">{closingReport.notes}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-4 pt-4">
              {/* Email Section */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg space-y-3">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {language === 'ar' ? 'إرسال التقرير بالإيميل' : 'Envoyer par email'}
                </h4>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder={language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                    value={reportEmail}
                    onChange={(e) => setReportEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button 
                    onClick={async () => {
                      if (!reportEmail) {
                        toast.error(language === 'ar' ? 'يرجى إدخال البريد الإلكتروني' : 'Veuillez entrer l\'email');
                        return;
                      }
                      setSendingEmail(true);
                      try {
                        await apiClient.post(`/email/send-session-report`, {
                          recipient_email: reportEmail,
                          session_id: closingReport.sessionId,
                          report_data: closingReport
                        });
                        toast.success(language === 'ar' ? 'تم إرسال التقرير بنجاح' : 'Rapport envoyé');
                        setReportEmail('');
                      } catch (error) {
                        toast.error(error.response?.data?.detail || (language === 'ar' ? 'فشل إرسال التقرير' : 'Échec d\'envoi'));
                      } finally {
                        setSendingEmail(false);
                      }
                    }}
                    disabled={sendingEmail || !reportEmail}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {sendingEmail ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Other Buttons */}
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => window.print()}
                >
                  <FileText className="h-4 w-4 me-2" />
                  {language === 'ar' ? 'طباعة التقرير' : 'Imprimer'}
                </Button>
                <Button 
                  className="flex-1"
                  onClick={() => {
                    setShowClosingReport(false);
                    toast.success(language === 'ar' ? 'تم غلق الحصة بنجاح' : 'Session fermée avec succès');
                    setClosingReport(null);
                  }}
                >
                  {language === 'ar' ? 'إغلاق' : 'Fermer'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
}
