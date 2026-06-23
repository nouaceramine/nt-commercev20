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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { formatShortDate, formatLargeNumber } from '../utils/globalDateFormatter';
import {
  Receipt, Calculator, FileText, TrendingUp, TrendingDown,
  Download, Plus, Edit, Trash2, DollarSign, PieChart, Calendar
} from 'lucide-react';

export default function TaxReportsPage() {
  const { t, language } = useLanguage();
  const [rates, setRates] = useState([]);
  const [report, setReport] = useState(null);
  const [declarations, setDeclarations] = useState([]);
  const [annualSummary, setAnnualSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rateDialog, setRateDialog] = useState(false);
  const [editingRate, setEditingRate] = useState(null);
  const [rateForm, setRateForm] = useState({ name: '', name_ar: '', rate: 0, type: 'vat', is_active: true });
  
  const now = new Date();
  const [reportPeriod, setReportPeriod] = useState({
    start_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    end_date: now.toISOString().split('T')[0],
  });
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [ratesRes, declRes] = await Promise.all([
        apiClient.get(`/tax/rates`, { headers }),
        apiClient.get(`/tax/declarations`, { headers }),
      ]);
      setRates(ratesRes.data);
      setDeclarations(declRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await apiClient.get(`/tax/report`, {
        params: reportPeriod,
        headers: { Authorization: `Bearer ${token}` },
      });
      setReport(res.data);
      toast.success('تم إنشاء التقرير الضريبي');
    } catch (error) {
      toast.error('خطأ في إنشاء التقرير');
    }
  };

  const loadAnnualSummary = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await apiClient.get(`/tax/summary/${selectedYear}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAnnualSummary(res.data);
    } catch (error) {
      toast.error('خطأ في تحميل الملخص السنوي');
    }
  };

  const fileDeclaration = async () => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/tax/declarations`, {
        start_date: reportPeriod.start_date,
        end_date: reportPeriod.end_date,
        type: 'monthly'
      });
      toast.success('تم تقديم التصريح الضريبي');
      fetchData();
    } catch (error) {
      toast.error('خطأ في تقديم التصريح');
    }
  };

  const saveRate = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      if (editingRate) {
        await apiClient.put(`/tax/rates/${editingRate.id}`, rateForm, { headers });
      } else {
        await apiClient.post(`/tax/rates`, rateForm, { headers });
      }
      toast.success('تم حفظ معدل الضريبة');
      setRateDialog(false);
      fetchData();
    } catch (error) {
      toast.error('خطأ في الحفظ');
    }
  };

  const deleteRate = async (id) => {
    if (!window.confirm('حذف هذا المعدل؟')) return;
    try {
      await apiClient.delete(`/tax/rates/${id}`);
      toast.success('تم الحذف');
      fetchData();
    } catch (error) {
      toast.error('خطأ في الحذف');
    }
  };

  const fmt = (n) => formatLargeNumber(Math.round(n || 0));

  if (loading) return <Layout><div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div></Layout>;

  return (
    <Layout>
      <div className="space-y-6" data-testid="tax-reports-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Receipt className="h-7 w-7 text-amber-500" />
              التقارير الضريبية
            </h1>
            <p className="text-muted-foreground mt-1">إدارة الضرائب والتصريحات الضريبية</p>
          </div>
        </div>

        <Tabs defaultValue="report" className="space-y-4">
          <TabsList>
            <TabsTrigger value="report" data-testid="tab-tax-report"><Calculator className="h-4 w-4 ml-1" />التقرير الضريبي</TabsTrigger>
            <TabsTrigger value="rates" data-testid="tab-tax-rates"><Receipt className="h-4 w-4 ml-1" />معدلات الضرائب</TabsTrigger>
            <TabsTrigger value="declarations" data-testid="tab-declarations"><FileText className="h-4 w-4 ml-1" />التصريحات</TabsTrigger>
            <TabsTrigger value="annual" data-testid="tab-annual"><PieChart className="h-4 w-4 ml-1" />الملخص السنوي</TabsTrigger>
          </TabsList>

          {/* Tax Report Tab */}
          <TabsContent value="report" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-end gap-4">
                  <div>
                    <Label>من تاريخ</Label>
                    <Input type="date" value={reportPeriod.start_date} onChange={e => setReportPeriod(p => ({...p, start_date: e.target.value}))} />
                  </div>
                  <div>
                    <Label>إلى تاريخ</Label>
                    <Input type="date" value={reportPeriod.end_date} onChange={e => setReportPeriod(p => ({...p, end_date: e.target.value}))} />
                  </div>
                  <Button onClick={generateReport} data-testid="generate-tax-report">
                    <Calculator className="h-4 w-4 ml-2" /> إنشاء التقرير
                  </Button>
                  {report && (
                    <Button variant="outline" onClick={fileDeclaration} data-testid="file-declaration">
                      <FileText className="h-4 w-4 ml-2" /> تقديم تصريح
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {report && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-l-4 border-l-green-500">
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">إجمالي المبيعات</p>
                      <p className="text-2xl font-bold text-green-600">{fmt(report.total_sales)} دج</p>
                      <p className="text-xs text-muted-foreground">{report.sales_count} عملية</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-red-500">
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">إجمالي المشتريات</p>
                      <p className="text-2xl font-bold text-red-600">{fmt(report.total_purchases)} دج</p>
                      <p className="text-xs text-muted-foreground">{report.purchases_count} عملية</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-amber-500">
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">إجمالي المصروفات</p>
                      <p className="text-2xl font-bold text-amber-600">{fmt(report.total_expenses)} دج</p>
                      <p className="text-xs text-muted-foreground">{report.expenses_count} مصروف</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader><CardTitle>تفاصيل الضرائب</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>البند</TableHead>
                          <TableHead>النسبة</TableHead>
                          <TableHead>المبلغ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">ضريبة القيمة المضافة المحصلة (TVA)</TableCell>
                          <TableCell>{report.vat_rate}%</TableCell>
                          <TableCell className="text-green-600">{fmt(report.vat_collected)} دج</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">ضريبة القيمة المضافة المدفوعة</TableCell>
                          <TableCell>{report.vat_rate}%</TableCell>
                          <TableCell className="text-red-600">-{fmt(report.vat_paid)} دج</TableCell>
                        </TableRow>
                        <TableRow className="bg-muted/50">
                          <TableCell className="font-bold">صافي TVA المستحق</TableCell>
                          <TableCell></TableCell>
                          <TableCell className={`font-bold ${report.vat_due >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {fmt(report.vat_due)} دج
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">ضريبة الدخل (IRG/IBS)</TableCell>
                          <TableCell>{report.income_tax_rate}%</TableCell>
                          <TableCell className="text-red-600">{fmt(report.income_tax)} دج</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">الرسم على النشاط المهني (TAP)</TableCell>
                          <TableCell>{report.tap_rate}%</TableCell>
                          <TableCell className="text-red-600">{fmt(report.tap_amount)} دج</TableCell>
                        </TableRow>
                        <TableRow className="bg-primary/5 border-t-2">
                          <TableCell className="font-bold text-lg">إجمالي الالتزام الضريبي</TableCell>
                          <TableCell></TableCell>
                          <TableCell className="font-bold text-lg text-red-600">{fmt(report.total_tax_liability)} دج</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Tax Rates Tab */}
          <TabsContent value="rates" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => { setEditingRate(null); setRateForm({ name: '', name_ar: '', rate: 0, type: 'vat', is_active: true }); setRateDialog(true); }} data-testid="add-tax-rate">
                <Plus className="h-4 w-4 ml-2" /> إضافة معدل
              </Button>
            </div>
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الاسم</TableHead>
                      <TableHead>النوع</TableHead>
                      <TableHead>النسبة</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map(rate => (
                      <TableRow key={rate.id}>
                        <TableCell className="font-medium">{rate.name_ar || rate.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {rate.type === 'vat' ? 'TVA' : rate.type === 'income' ? 'IRG/IBS' : rate.type === 'withholding' ? 'اقتطاع' : rate.type === 'professional' ? 'TAP' : rate.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold">{rate.rate}%</TableCell>
                        <TableCell>
                          {rate.is_active ? <Badge className="bg-green-100 text-green-700">نشط</Badge> : <Badge variant="secondary">معطل</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { setEditingRate(rate); setRateForm(rate); setRateDialog(true); }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteRate(rate.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Declarations Tab */}
          <TabsContent value="declarations" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                {declarations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>لا توجد تصريحات ضريبية</p>
                    <p className="text-sm">قم بإنشاء تقرير ضريبي ثم تقديم تصريح</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الفترة</TableHead>
                        <TableHead>النوع</TableHead>
                        <TableHead>TVA مستحق</TableHead>
                        <TableHead>ضريبة دخل</TableHead>
                        <TableHead>TAP</TableHead>
                        <TableHead>الإجمالي</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>التاريخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {declarations.map(d => (
                        <TableRow key={d.id}>
                          <TableCell className="text-sm">{d.start_date} - {d.end_date}</TableCell>
                          <TableCell><Badge variant="outline">{d.period_type === 'monthly' ? 'شهري' : d.period_type === 'quarterly' ? 'ربع سنوي' : 'سنوي'}</Badge></TableCell>
                          <TableCell>{fmt(d.vat_due)} دج</TableCell>
                          <TableCell>{fmt(d.income_tax)} دج</TableCell>
                          <TableCell>{fmt(d.tap_amount)} دج</TableCell>
                          <TableCell className="font-bold">{fmt(d.total_due)} دج</TableCell>
                          <TableCell>
                            <Badge className={d.status === 'paid' ? 'bg-green-100 text-green-700' : d.status === 'filed' ? 'bg-blue-100 text-blue-700' : d.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-gray-100'}>
                              {d.status === 'draft' ? 'مسودة' : d.status === 'filed' ? 'مقدم' : d.status === 'paid' ? 'مدفوع' : 'متأخر'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatShortDate(d.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Annual Summary Tab */}
          <TabsContent value="annual" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-end gap-4">
                  <div>
                    <Label>السنة</Label>
                    <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={loadAnnualSummary} data-testid="load-annual-summary">
                    <PieChart className="h-4 w-4 ml-2" /> تحميل الملخص
                  </Button>
                </div>
              </CardContent>
            </Card>

            {annualSummary && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="border-t-4 border-t-green-500">
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-muted-foreground">إجمالي المبيعات</p>
                      <p className="text-xl font-bold text-green-600">{fmt(annualSummary.annual.total_sales)} دج</p>
                    </CardContent>
                  </Card>
                  <Card className="border-t-4 border-t-red-500">
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-muted-foreground">إجمالي المشتريات</p>
                      <p className="text-xl font-bold text-red-600">{fmt(annualSummary.annual.total_purchases)} دج</p>
                    </CardContent>
                  </Card>
                  <Card className="border-t-4 border-t-amber-500">
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-muted-foreground">TVA المستحق</p>
                      <p className="text-xl font-bold text-amber-600">{fmt(annualSummary.annual.vat_due)} دج</p>
                    </CardContent>
                  </Card>
                  <Card className="border-t-4 border-t-purple-500">
                    <CardContent className="pt-6 text-center">
                      <p className="text-sm text-muted-foreground">إجمالي الضرائب</p>
                      <p className="text-xl font-bold text-purple-600">{fmt(annualSummary.annual.total_tax_liability)} دج</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader><CardTitle>التفاصيل الربع سنوية</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>الربع</TableHead>
                          <TableHead>المبيعات</TableHead>
                          <TableHead>المشتريات</TableHead>
                          <TableHead>TVA</TableHead>
                          <TableHead>ضريبة الدخل</TableHead>
                          <TableHead>TAP</TableHead>
                          <TableHead>الإجمالي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {annualSummary.quarterly.map(q => (
                          <TableRow key={q.quarter}>
                            <TableCell className="font-medium">Q{q.quarter}</TableCell>
                            <TableCell className="text-green-600">{fmt(q.total_sales)} دج</TableCell>
                            <TableCell className="text-red-600">{fmt(q.total_purchases)} دج</TableCell>
                            <TableCell>{fmt(q.vat_due)} دج</TableCell>
                            <TableCell>{fmt(q.income_tax)} دج</TableCell>
                            <TableCell>{fmt(q.tap_amount)} دج</TableCell>
                            <TableCell className="font-bold">{fmt(q.total_tax_liability)} دج</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* Rate Dialog */}
        <Dialog open={rateDialog} onOpenChange={setRateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingRate ? 'تعديل معدل الضريبة' : 'إضافة معدل ضريبة'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>الاسم (EN)</Label><Input value={rateForm.name} onChange={e => setRateForm(p => ({...p, name: e.target.value}))} /></div>
                <div><Label>الاسم (AR)</Label><Input value={rateForm.name_ar} onChange={e => setRateForm(p => ({...p, name_ar: e.target.value}))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>النسبة %</Label><Input type="number" value={rateForm.rate} onChange={e => setRateForm(p => ({...p, rate: parseFloat(e.target.value)}))} /></div>
                <div>
                  <Label>النوع</Label>
                  <Select value={rateForm.type} onValueChange={v => setRateForm(p => ({...p, type: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vat">TVA</SelectItem>
                      <SelectItem value="income">ضريبة دخل</SelectItem>
                      <SelectItem value="withholding">اقتطاع</SelectItem>
                      <SelectItem value="professional">TAP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRateDialog(false)}>إلغاء</Button>
              <Button onClick={saveRate}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
