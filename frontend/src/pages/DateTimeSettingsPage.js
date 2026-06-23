import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import {
  Calendar,
  Clock,
  Globe,
  Check,
  RefreshCw,
  Settings,
  Eye,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import globalDateFormatter from '../utils/globalDateFormatter';

// Common date format options
const DATE_FORMAT_OPTIONS = [
  { value: 'dd/MM/yyyy', label: '31/12/2026', example: 'dd/MM/yyyy' },
  { value: 'MM/dd/yyyy', label: '12/31/2026', example: 'MM/dd/yyyy' },
  { value: 'yyyy-MM-dd', label: '2026-12-31', example: 'yyyy-MM-dd' },
  { value: 'dd-MM-yyyy', label: '31-12-2026', example: 'dd-MM-yyyy' },
  { value: 'dd.MM.yyyy', label: '31.12.2026', example: 'dd.MM.yyyy' }
];

const LONG_DATE_FORMAT_OPTIONS = [
  { value: 'dd MMMM yyyy', label: '31 ديسمبر 2026', example: 'dd MMMM yyyy' },
  { value: 'MMMM dd, yyyy', label: 'ديسمبر 31, 2026', example: 'MMMM dd, yyyy' },
  { value: 'EEEE, dd MMMM yyyy', label: 'الثلاثاء, 31 ديسمبر 2026', example: 'EEEE, dd MMMM yyyy' }
];

const TIME_FORMAT_OPTIONS = [
  { value: 'HH:mm:ss', label: '23:59:59 (24 ساعة)', example: 'HH:mm:ss' },
  { value: 'HH:mm', label: '23:59 (24 ساعة)', example: 'HH:mm' },
  { value: 'hh:mm:ss a', label: '11:59:59 م (12 ساعة)', example: 'hh:mm:ss a' },
  { value: 'hh:mm a', label: '11:59 م (12 ساعة)', example: 'hh:mm a' }
];

export default function DateTimeSettingsPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  
  // Settings state
  const [settings, setSettings] = useState({
    short_date_format: 'dd/MM/yyyy',
    long_date_format: 'dd MMMM yyyy',
    time_format: 'HH:mm:ss',
    use_western_numerals: true,
    language: 'ar'
  });
  
  useEffect(() => {
    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  
  useEffect(() => {
    // Update preview when settings change
    updatePreview();
  }, [settings]);
  
  const fetchSettings = async () => {
    try {
      const res = await apiClient.get(`/settings/datetime`);
      setSettings(res.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const updatePreview = async () => {
    try {
      const params = new URLSearchParams({
        short_date_format: settings.short_date_format,
        long_date_format: settings.long_date_format,
        time_format: settings.time_format,
        use_western_numerals: settings.use_western_numerals
      });
      
      const res = await apiClient.get(`/settings/datetime/preview?${params}`);
      setPreview(res.data.formatted);
    } catch (error) {
      // Generate preview locally WITHOUT mutating global formatter state
      const now = new Date();
      const prevConfig = globalDateFormatter.getConfig();
      try {
        globalDateFormatter.setConfig({
          shortDateFormat: settings.short_date_format,
          longDateFormat: settings.long_date_format,
          timeFormat: settings.time_format,
          useWesternNumerals: settings.use_western_numerals,
          language: settings.language
        });
        setPreview({
          short_date: globalDateFormatter.formatShortDate(now),
          long_date: globalDateFormatter.formatLongDate(now),
          time: globalDateFormatter.formatTime(now),
          datetime: globalDateFormatter.formatDateTime(now)
        });
      } finally {
        globalDateFormatter.setConfig(prevConfig);
      }
    }
  };
  
  const saveSettings = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/settings/datetime`, settings);
      
      // Update local formatter
      globalDateFormatter.setConfig({
        shortDateFormat: settings.short_date_format,
        longDateFormat: settings.long_date_format,
        timeFormat: settings.time_format,
        useWesternNumerals: settings.use_western_numerals,
        language: settings.language
      });
      
      toast.success(language === 'ar' 
        ? 'تم حفظ الإعدادات بنجاح!'
        : 'Paramètres enregistrés avec succès!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(language === 'ar'
        ? 'حدث خطأ أثناء الحفظ'
        : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };
  
  const resetToDefaults = async () => {
    try {
      const res = await apiClient.post(`/settings/reset-datetime`);
      setSettings(res.data.settings);
      toast.success(language === 'ar'
        ? 'تم إعادة الضبط للقيم الافتراضية'
        : 'Réinitialisé aux valeurs par défaut');
    } catch (error) {
      console.error('Error resetting settings:', error);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-muted-foreground">
              {language === 'ar' ? 'جاري تحميل الإعدادات...' : 'Chargement des paramètres...'}
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="datetime-settings-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Settings className="h-8 w-8 text-primary" />
              {language === 'ar' ? 'إعدادات التاريخ والوقت' : 'Paramètres Date/Heure'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' 
                ? 'تخصيص صيغة عرض التاريخ والوقت مع الأرقام الغربية'
                : 'Personnaliser le format d\'affichage de la date et de l\'heure'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetToDefaults} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {language === 'ar' ? 'إعادة ضبط' : 'Réinitialiser'}
            </Button>
            <Button onClick={saveSettings} disabled={saving} className="gap-2">
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {language === 'ar' ? 'حفظ الإعدادات' : 'Enregistrer'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Settings Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Short Date Format */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {language === 'ar' ? 'صيغة التاريخ القصير' : 'Format Date Courte'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar' 
                    ? 'الصيغة المستخدمة في الجداول والقوائم'
                    : 'Format utilisé dans les tableaux et listes'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  value={settings.short_date_format}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, short_date_format: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_FORMAT_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center justify-between w-full gap-4">
                          <span>{option.label}</span>
                          <Badge variant="outline" className="text-xs">{option.example}</Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <div className="text-sm text-muted-foreground">
                  <p>{language === 'ar' ? 'أو أدخل صيغة مخصصة:' : 'Ou entrez un format personnalisé:'}</p>
                  <Input
                    value={settings.short_date_format}
                    onChange={(e) => setSettings(prev => ({ ...prev, short_date_format: e.target.value }))}
                    placeholder="dd/MM/yyyy"
                    className="mt-2"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Long Date Format */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {language === 'ar' ? 'صيغة التاريخ الطويل' : 'Format Date Longue'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar'
                    ? 'الصيغة المستخدمة في التقارير والمستندات'
                    : 'Format utilisé dans les rapports et documents'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  value={settings.long_date_format}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, long_date_format: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LONG_DATE_FORMAT_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center justify-between w-full gap-4">
                          <span>{option.label}</span>
                          <Badge variant="outline" className="text-xs">{option.example}</Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Input
                  value={settings.long_date_format}
                  onChange={(e) => setSettings(prev => ({ ...prev, long_date_format: e.target.value }))}
                  placeholder="dd MMMM yyyy"
                />
              </CardContent>
            </Card>

            {/* Time Format */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {language === 'ar' ? 'صيغة الوقت' : 'Format Heure'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select
                  value={settings.time_format}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, time_format: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_FORMAT_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center justify-between w-full gap-4">
                          <span>{option.label}</span>
                          <Badge variant="outline" className="text-xs">{option.example}</Badge>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Input
                  value={settings.time_format}
                  onChange={(e) => setSettings(prev => ({ ...prev, time_format: e.target.value }))}
                  placeholder="HH:mm:ss"
                />
              </CardContent>
            </Card>

            {/* Numerals Setting */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  {language === 'ar' ? 'نوع الأرقام' : 'Type de Chiffres'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="space-y-1">
                    <p className="font-medium">
                      {language === 'ar' ? 'استخدام الأرقام الغربية' : 'Utiliser les chiffres occidentaux'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {settings.use_western_numerals 
                        ? (language === 'ar' ? '0, 1, 2, 3, 4, 5, 6, 7, 8, 9' : '0, 1, 2, 3, 4, 5, 6, 7, 8, 9')
                        : (language === 'ar' ? '٠, ١, ٢, ٣, ٤, ٥, ٦, ٧, ٨, ٩' : '٠, ١, ٢, ٣, ٤, ٥, ٦, ٧, ٨, ٩')}
                    </p>
                  </div>
                  <Switch
                    checked={settings.use_western_numerals}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, use_western_numerals: checked }))}
                  />
                </div>
                
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted text-center">
                    <p className="text-sm text-muted-foreground mb-2">
                      {language === 'ar' ? 'أرقام غربية' : 'Chiffres Occidentaux'}
                    </p>
                    <p className="text-2xl font-mono">1234567890</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted text-center">
                    <p className="text-sm text-muted-foreground mb-2">
                      {language === 'ar' ? 'أرقام عربية' : 'Chiffres Arabes'}
                    </p>
                    <p className="text-2xl font-mono">١٢٣٤٥٦٧٨٩٠</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview Panel */}
          <div className="space-y-6">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  {language === 'ar' ? 'معاينة' : 'Aperçu'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar' ? 'كيف ستظهر التواريخ' : 'Comment les dates apparaîtront'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {preview && (
                  <>
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-sm text-muted-foreground mb-1">
                        {language === 'ar' ? 'تاريخ قصير:' : 'Date courte:'}
                      </p>
                      <p className="text-xl font-semibold">{preview.short_date}</p>
                    </div>
                    
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-sm text-muted-foreground mb-1">
                        {language === 'ar' ? 'تاريخ طويل:' : 'Date longue:'}
                      </p>
                      <p className="text-xl font-semibold">{preview.long_date}</p>
                    </div>
                    
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <p className="text-sm text-muted-foreground mb-1">
                        {language === 'ar' ? 'الوقت:' : 'Heure:'}
                      </p>
                      <p className="text-xl font-semibold">{preview.time}</p>
                    </div>
                    
                    <Separator />
                    
                    <div className="p-4 rounded-lg bg-muted">
                      <p className="text-sm text-muted-foreground mb-1">
                        {language === 'ar' ? 'التاريخ والوقت الكامل:' : 'Date et heure complètes:'}
                      </p>
                      <p className="text-lg font-semibold">{preview.datetime}</p>
                    </div>
                  </>
                )}
                
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  <span className="text-muted-foreground">
                    {settings.use_western_numerals
                      ? (language === 'ar' ? 'الأرقام الغربية مفعلة' : 'Chiffres occidentaux activés')
                      : (language === 'ar' ? 'الأرقام العربية مفعلة' : 'Chiffres arabes activés')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Format Legend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {language === 'ar' ? 'دليل الرموز' : 'Guide des Symboles'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <code className="bg-muted px-1 rounded">dd</code>
                    <span>{language === 'ar' ? 'اليوم (01-31)' : 'Jour (01-31)'}</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="bg-muted px-1 rounded">MM</code>
                    <span>{language === 'ar' ? 'الشهر (01-12)' : 'Mois (01-12)'}</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="bg-muted px-1 rounded">MMMM</code>
                    <span>{language === 'ar' ? 'اسم الشهر' : 'Nom du mois'}</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="bg-muted px-1 rounded">yyyy</code>
                    <span>{language === 'ar' ? 'السنة' : 'Année'}</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="bg-muted px-1 rounded">HH</code>
                    <span>{language === 'ar' ? 'ساعة (00-23)' : 'Heure (00-23)'}</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="bg-muted px-1 rounded">mm</code>
                    <span>{language === 'ar' ? 'دقيقة' : 'Minutes'}</span>
                  </div>
                  <div className="flex justify-between">
                    <code className="bg-muted px-1 rounded">ss</code>
                    <span>{language === 'ar' ? 'ثانية' : 'Secondes'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
