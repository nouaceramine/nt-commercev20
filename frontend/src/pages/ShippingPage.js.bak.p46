import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
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
  Truck, 
  Settings, 
  Calculator,
  MapPin,
  Building2,
  Key,
  Save,
  RefreshCw,
  ExternalLink,
  Check
} from 'lucide-react';

export default function ShippingPage() {
  const { t, language } = useLanguage();
  
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [settings, setSettings] = useState([]);
  const [wilayas, setWilayas] = useState([]);
  const [saving, setSaving] = useState(false);
  
  // Rate calculator
  const [fromWilaya, setFromWilaya] = useState('16');
  const [toWilaya, setToWilaya] = useState('');
  const [weight, setWeight] = useState(0.5);
  const [rates, setRates] = useState([]);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const [companiesRes, settingsRes, wilayasRes] = await Promise.all([
        apiClient.get(`/shipping/companies`),
        apiClient.get(`/shipping/settings`),
        apiClient.get(`/shipping/wilayas`)
      ]);
      setCompanies(companiesRes.data);
      setSettings(settingsRes.data);
      setWilayas(wilayasRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateCompanySettings = (companyId, field, value) => {
    setSettings(prev => prev.map(s => 
      s.company_id === companyId ? { ...s, [field]: value } : s
    ));
  };

  const saveCompanySettings = async (companyId) => {
    setSaving(true);
    try {
      const companySetting = settings.find(s => s.company_id === companyId);
      await apiClient.put(`/shipping/settings/${companyId}`, companySetting);
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات' : 'Paramètres enregistrés');
    } catch (error) {
      toast.error(t.error);
    } finally {
      setSaving(false);
    }
  };

  const calculateRate = async () => {
    if (!toWilaya) {
      toast.error(language === 'ar' ? 'اختر ولاية الوصول' : 'Sélectionnez la wilaya de destination');
      return;
    }
    
    setCalculating(true);
    try {
      const response = await apiClient.post(`/shipping/calculate-rate`, {
        from_wilaya: fromWilaya,
        to_wilaya: toWilaya,
        weight: weight
      });
      setRates(response.data.rates);
    } catch (error) {
      toast.error(t.error);
    } finally {
      setCalculating(false);
    }
  };

  const getCompanySetting = (companyId) => {
    return settings.find(s => s.company_id === companyId) || {
      company_id: companyId,
      enabled: false,
      api_key: '',
      api_secret: ''
    };
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh]"><div className="spinner" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="shipping-page">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Truck className="h-8 w-8 text-orange-600" />
            {language === 'ar' ? 'إدارة التوصيل' : 'Gestion des livraisons'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'ar' ? 'ربط شركات الشحن الجزائرية وحساب تكاليف التوصيل' : 'Intégration des transporteurs algériens et calcul des frais'}
          </p>
        </div>

        <Tabs defaultValue="companies">
          <TabsList>
            <TabsTrigger value="companies" className="gap-2">
              <Building2 className="h-4 w-4" />
              {language === 'ar' ? 'شركات الشحن' : 'Transporteurs'}
            </TabsTrigger>
            <TabsTrigger value="calculator" className="gap-2">
              <Calculator className="h-4 w-4" />
              {language === 'ar' ? 'حاسبة التوصيل' : 'Calculateur'}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="companies" className="space-y-6 mt-6">
            {/* Companies Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {companies.map(company => {
                const setting = getCompanySetting(company.id);
                return (
                  <Card key={company.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-orange-100">
                            <Truck className="h-5 w-5 text-orange-600" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{company.name}</CardTitle>
                            <CardDescription>{company.name_ar}</CardDescription>
                          </div>
                        </div>
                        <Switch
                          checked={setting.enabled}
                          onCheckedChange={(checked) => updateCompanySettings(company.id, 'enabled', checked)}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {company.has_api && (
                        <>
                          <div>
                            <Label className="text-xs">API Key</Label>
                            <Input
                              value={setting.api_key || ''}
                              onChange={(e) => updateCompanySettings(company.id, 'api_key', e.target.value)}
                              placeholder="xxxxxxxx"
                              className="mt-1 h-8 text-sm font-mono"
                              dir="ltr"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">API Secret</Label>
                            <Input
                              type="password"
                              value={setting.api_secret || ''}
                              onChange={(e) => updateCompanySettings(company.id, 'api_secret', e.target.value)}
                              placeholder="xxxxxxxx"
                              className="mt-1 h-8 text-sm font-mono"
                              dir="ltr"
                            />
                          </div>
                        </>
                      )}
                      <div className="flex items-center justify-between pt-2">
                        {company.website && (
                          <a 
                            href={company.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-primary flex items-center gap-1 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {language === 'ar' ? 'زيارة الموقع' : 'Visiter le site'}
                          </a>
                        )}
                        <Button 
                          size="sm" 
                          onClick={() => saveCompanySettings(company.id)}
                          disabled={saving}
                        >
                          <Save className="h-3 w-3 me-1" />
                          {t.save}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="pt-6">
                <p className="text-sm text-amber-700">
                  {language === 'ar' 
                    ? '⚠️ التكامل مع شركات الشحن في وضع المحاكاة حالياً. للربط الفعلي، يرجى الحصول على مفاتيح API من كل شركة.'
                    : '⚠️ L\'intégration est en mode simulation. Pour une connexion réelle, obtenez les clés API auprès de chaque transporteur.'}
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calculator" className="space-y-6 mt-6">
            {/* Rate Calculator */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  {language === 'ar' ? 'حاسبة تكلفة التوصيل' : 'Calculateur de frais'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar' ? 'مقارنة أسعار شركات الشحن المختلفة' : 'Comparer les tarifs des différents transporteurs'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {language === 'ar' ? 'من ولاية' : 'De la wilaya'}
                    </Label>
                    <Select value={fromWilaya} onValueChange={setFromWilaya}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {wilayas.map(w => (
                          <SelectItem key={w.code} value={w.code}>
                            {w.code} - {language === 'ar' ? w.name : w.name_fr}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {language === 'ar' ? 'إلى ولاية' : 'Vers la wilaya'}
                    </Label>
                    <Select value={toWilaya} onValueChange={setToWilaya}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={language === 'ar' ? 'اختر الولاية' : 'Sélectionner'} />
                      </SelectTrigger>
                      <SelectContent>
                        {wilayas.map(w => (
                          <SelectItem key={w.code} value={w.code}>
                            {w.code} - {language === 'ar' ? w.name : w.name_fr}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{language === 'ar' ? 'الوزن (كغ)' : 'Poids (kg)'}</Label>
                    <Input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(parseFloat(e.target.value) || 0.5)}
                      min="0.1"
                      step="0.1"
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button onClick={calculateRate} disabled={calculating} className="w-full md:w-auto">
                  {calculating ? <RefreshCw className="h-4 w-4 animate-spin me-2" /> : <Calculator className="h-4 w-4 me-2" />}
                  {language === 'ar' ? 'حساب التكلفة' : 'Calculer'}
                </Button>
              </CardContent>
            </Card>

            {/* Results */}
            {rates.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{language === 'ar' ? 'نتائج المقارنة' : 'Résultats de comparaison'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'الشركة' : 'Transporteur'}</TableHead>
                        <TableHead>{language === 'ar' ? 'السعر' : 'Prix'}</TableHead>
                        <TableHead>{language === 'ar' ? 'المدة المتوقعة' : 'Délai estimé'}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rates.map((rate, index) => (
                        <TableRow key={rate.company_id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {index === 0 && <Badge className="bg-green-500">{language === 'ar' ? 'الأرخص' : 'Moins cher'}</Badge>}
                              <span className="font-medium">{rate.company_name}</span>
                              <span className="text-muted-foreground text-sm">({rate.company_name_ar})</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-lg font-bold text-primary">{rate.price.toFixed(2)}</span>
                            <span className="text-muted-foreground ms-1">{rate.currency}</span>
                          </TableCell>
                          <TableCell>
                            {rate.estimated_days} {language === 'ar' ? 'أيام' : 'jours'}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline">
                              <Check className="h-4 w-4 me-1" />
                              {language === 'ar' ? 'اختيار' : 'Choisir'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
