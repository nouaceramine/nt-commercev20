import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { formatLargeNumber } from '../utils/globalDateFormatter';
import {
  Coins, ArrowRightLeft, Settings, TrendingUp, DollarSign,
  Edit, RefreshCw, Save
} from 'lucide-react';

export default function CurrenciesPage() {
  const { t, language } = useLanguage();
  const [currencies, setCurrencies] = useState([]);
  const [settings, setSettings] = useState({ default_currency: 'DZD', show_multi_currency: false, auto_convert: true });
  const [loading, setLoading] = useState(true);
  const [convertDialog, setConvertDialog] = useState(false);
  const [convertForm, setConvertForm] = useState({ amount: 1000, from_currency: 'DZD', to_currency: 'USD' });
  const [convertResult, setConvertResult] = useState(null);
  const [editingRates, setEditingRates] = useState(false);
  const [rateEdits, setRateEdits] = useState({});

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [currRes, settingsRes] = await Promise.all([
        apiClient.get(`/currencies/`, { headers }),
        apiClient.get(`/currencies/settings`, { headers }),
      ]);
      setCurrencies(currRes.data);
      setSettings(settingsRes.data);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const convertCurrency = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await apiClient.post(`/currencies/convert`, convertForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConvertResult(res.data);
    } catch (error) {
      toast.error('خطأ في التحويل');
    }
  };

  const saveRates = async () => {
    try {
      const token = localStorage.getItem('token');
      const rates = Object.entries(rateEdits).map(([code, rate]) => ({ code, rate_to_dzd: parseFloat(rate) }));
      if (rates.length === 0) { setEditingRates(false); return; }
      await apiClient.put(`/currencies/rates`, rates, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('تم تحديث أسعار الصرف');
      setEditingRates(false);
      setRateEdits({});
      fetchData();
    } catch (error) {
      toast.error('خطأ في التحديث');
    }
  };

  const saveSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/currencies/settings`, settings, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('تم حفظ الإعدادات');
    } catch (error) {
      toast.error('خطأ في الحفظ');
    }
  };

  if (loading) return <Layout><div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div></Layout>;

  return (
    <Layout>
      <div className="space-y-6" data-testid="currencies-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Coins className="h-7 w-7 text-yellow-500" />
              العملات وأسعار الصرف
            </h1>
            <p className="text-muted-foreground mt-1">إدارة العملات المتعددة وأسعار الصرف</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConvertDialog(true)} data-testid="convert-currency-btn">
              <ArrowRightLeft className="h-4 w-4 ml-2" /> محول العملات
            </Button>
          </div>
        </div>

        {/* Currency Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">أسعار الصرف</CardTitle>
              <div className="flex gap-2">
                {editingRates ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => { setEditingRates(false); setRateEdits({}); }}>إلغاء</Button>
                    <Button size="sm" onClick={saveRates} data-testid="save-rates"><Save className="h-4 w-4 ml-1" />حفظ</Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setEditingRates(true)} data-testid="edit-rates">
                    <Edit className="h-4 w-4 ml-1" /> تعديل الأسعار
                  </Button>
                )}
              </div>
            </div>
            <CardDescription>أسعار الصرف مقابل الدينار الجزائري (DZD)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الرمز</TableHead>
                  <TableHead>العملة</TableHead>
                  <TableHead>الرمز</TableHead>
                  <TableHead>السعر (1 وحدة = ? دج)</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currencies.map(c => (
                  <TableRow key={c.code}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">{c.code}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{c.name_ar}</TableCell>
                    <TableCell className="text-lg">{c.symbol}</TableCell>
                    <TableCell>
                      {editingRates && c.code !== 'DZD' ? (
                        <Input
                          type="number"
                          className="w-32"
                          defaultValue={c.rate_to_dzd}
                          onChange={e => setRateEdits(p => ({...p, [c.code]: e.target.value}))}
                        />
                      ) : (
                        <span className="font-bold">{formatLargeNumber(c.rate_to_dzd)} دج</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.is_default ? (
                        <Badge className="bg-blue-100 text-blue-700">العملة الأساسية</Badge>
                      ) : (
                        <Badge variant="secondary">نشط</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Quick Converter Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {currencies.filter(c => ['USD', 'EUR', 'SAR'].includes(c.code)).map(c => (
            <Card key={c.code}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">1 {c.code} =</p>
                    <p className="text-2xl font-bold">{formatLargeNumber(c.rate_to_dzd)} دج</p>
                    <p className="text-xs text-muted-foreground">{c.name_ar}</p>
                  </div>
                  <div className="text-4xl">{c.symbol}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Convert Dialog */}
        <Dialog open={convertDialog} onOpenChange={setConvertDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" /> محول العملات</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>المبلغ</Label>
                <Input type="number" value={convertForm.amount} onChange={e => setConvertForm(p => ({...p, amount: parseFloat(e.target.value)}))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>من</Label>
                  <Select value={convertForm.from_currency} onValueChange={v => setConvertForm(p => ({...p, from_currency: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code} - {c.name_ar}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>إلى</Label>
                  <Select value={convertForm.to_currency} onValueChange={v => setConvertForm(p => ({...p, to_currency: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code} - {c.name_ar}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={convertCurrency} className="w-full" data-testid="do-convert">
                <ArrowRightLeft className="h-4 w-4 ml-2" /> تحويل
              </Button>
              {convertResult && (
                <div className="p-4 bg-muted rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">{formatLargeNumber(convertResult.original_amount)} {convertResult.from}</p>
                  <p className="text-3xl font-bold my-2">{formatLargeNumber(convertResult.converted_amount)} {convertResult.to}</p>
                  <p className="text-xs text-muted-foreground">سعر الصرف: {convertResult.rate}</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
