import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import {
  History,
  ArrowRight,
  Search,
  Filter,
  Download,
  Calendar,
  Smartphone,
  Wifi,
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Sample operations data
const SAMPLE_OPERATIONS = [
  { id: 1, type: 'flexy', phone: '0612345678', amount: 500, profit: 25, status: 'success', operator: 'Mobilis', date: '2026-02-07T10:30:00' },
  { id: 2, type: 'flexy', phone: '0712345678', amount: 1000, profit: 50, status: 'success', operator: 'Djezzy', date: '2026-02-07T10:15:00' },
  { id: 3, type: 'idoom', phone: '0212345678', amount: 2000, profit: 100, status: 'success', operator: 'Idoom', date: '2026-02-07T09:45:00' },
  { id: 4, type: 'flexy', phone: '0512345678', amount: 200, profit: 10, status: 'failed', operator: 'Ooredoo', date: '2026-02-07T09:30:00' },
  { id: 5, type: 'card', phone: '-', amount: 5000, profit: 250, status: 'success', operator: 'Mobilis', date: '2026-02-07T09:00:00' },
];

export default function OperationsPage() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState('all');
  const [operations, setOperations] = useState(SAMPLE_OPERATIONS);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOperator, setFilterOperator] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredOperations = operations.filter(op => {
    const matchesSearch = op.phone.includes(searchQuery) || op.operator.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOperator = filterOperator === 'all' || op.operator === filterOperator;
    const matchesStatus = filterStatus === 'all' || op.status === filterStatus;
    const matchesType = activeTab === 'all' || op.type === activeTab;
    return matchesSearch && matchesOperator && matchesStatus && matchesType;
  });

  const getTotalAmount = () => filteredOperations.reduce((sum, op) => sum + op.amount, 0);
  const getTotalProfit = () => filteredOperations.filter(op => op.status === 'success').reduce((sum, op) => sum + op.profit, 0);
  const getSuccessRate = () => {
    const total = filteredOperations.length;
    if (total === 0) return 0;
    const success = filteredOperations.filter(op => op.status === 'success').length;
    return ((success / total) * 100).toFixed(1);
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'flexy': return <Smartphone className="h-4 w-4" />;
      case 'idoom': return <Wifi className="h-4 w-4" />;
      case 'card': return <CreditCard className="h-4 w-4" />;
      default: return <History className="h-4 w-4" />;
    }
  };

  const getOperatorColor = (operator) => {
    switch (operator) {
      case 'Mobilis': return 'bg-green-500';
      case 'Djezzy': return 'bg-red-500';
      case 'Ooredoo': return 'bg-orange-500';
      case 'Idoom': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="operations-page">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/services">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <History className="h-8 w-8 text-purple-500" />
              </div>
              {language === 'ar' ? 'كل العمليات' : 'Toutes les opérations'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'سجل جميع العمليات والمعاملات' : 'Historique de toutes les opérations'}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي العمليات' : 'Total opérations'}</p>
                  <p className="text-2xl font-bold">{filteredOperations.length}</p>
                </div>
                <History className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي المبالغ' : 'Total montants'}</p>
                  <p className="text-2xl font-bold text-primary">{getTotalAmount().toLocaleString()} دج</p>
                </div>
                <TrendingUp className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي الأرباح' : 'Total profits'}</p>
                  <p className="text-2xl font-bold text-emerald-600">{getTotalProfit().toLocaleString()} دج</p>
                </div>
                <TrendingUp className="h-8 w-8 text-emerald-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'نسبة النجاح' : 'Taux de succès'}</p>
                  <p className="text-2xl font-bold text-blue-600">{getSuccessRate()}%</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={language === 'ar' ? 'بحث برقم الهاتف...' : 'Rechercher par numéro...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pe-10"
                  />
                </div>
              </div>
              <Select value={filterOperator} onValueChange={setFilterOperator}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder={language === 'ar' ? 'المشغل' : 'Opérateur'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'الكل' : 'Tous'}</SelectItem>
                  <SelectItem value="Mobilis">Mobilis</SelectItem>
                  <SelectItem value="Djezzy">Djezzy</SelectItem>
                  <SelectItem value="Ooredoo">Ooredoo</SelectItem>
                  <SelectItem value="Idoom">Idoom</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder={language === 'ar' ? 'الحالة' : 'Statut'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'الكل' : 'Tous'}</SelectItem>
                  <SelectItem value="success">{language === 'ar' ? 'ناجحة' : 'Réussie'}</SelectItem>
                  <SelectItem value="failed">{language === 'ar' ? 'فاشلة' : 'Échouée'}</SelectItem>
                  <SelectItem value="pending">{language === 'ar' ? 'معلقة' : 'En attente'}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline">
                <Download className="h-4 w-4 me-2" />
                {language === 'ar' ? 'تصدير' : 'Exporter'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs & Table */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">{language === 'ar' ? 'الكل' : 'Tous'}</TabsTrigger>
            <TabsTrigger value="flexy">{language === 'ar' ? 'فليكسي' : 'Flexy'}</TabsTrigger>
            <TabsTrigger value="idoom">{language === 'ar' ? 'أيدوم' : 'Idoom'}</TabsTrigger>
            <TabsTrigger value="card">{language === 'ar' ? 'بطاقات' : 'Cartes'}</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'ar' ? 'النوع' : 'Type'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الرقم' : 'Numéro'}</TableHead>
                      <TableHead>{language === 'ar' ? 'المشغل' : 'Opérateur'}</TableHead>
                      <TableHead>{language === 'ar' ? 'المبلغ' : 'Montant'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الربح' : 'Profit'}</TableHead>
                      <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                      <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOperations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          {language === 'ar' ? 'لا توجد عمليات' : 'Aucune opération'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOperations.map(op => (
                        <TableRow key={op.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTypeIcon(op.type)}
                              <span className="capitalize">{op.type}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono">{op.phone}</TableCell>
                          <TableCell>
                            <Badge className={getOperatorColor(op.operator)}>{op.operator}</Badge>
                          </TableCell>
                          <TableCell className="font-bold">{op.amount} دج</TableCell>
                          <TableCell className="text-emerald-600 font-medium">+{op.profit} دج</TableCell>
                          <TableCell>
                            {op.status === 'success' ? (
                              <Badge variant="default" className="bg-emerald-500">
                                <CheckCircle2 className="h-3 w-3 me-1" />
                                {language === 'ar' ? 'ناجحة' : 'Réussie'}
                              </Badge>
                            ) : op.status === 'failed' ? (
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 me-1" />
                                {language === 'ar' ? 'فاشلة' : 'Échouée'}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Clock className="h-3 w-3 me-1" />
                                {language === 'ar' ? 'معلقة' : 'En attente'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(op.date).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
