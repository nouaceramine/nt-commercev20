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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { 
  Mail, Send, Settings2, Clock, TrendingUp, AlertTriangle, 
  Package, Users, DollarSign, Calendar, CheckCircle, XCircle,
  Sparkles, FileText, BarChart3
} from 'lucide-react';

export default function SmartReportsPage() {
  const { t, language, isRTL } = useLanguage();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailSettings, setEmailSettings] = useState({
    enabled: false,
    api_key: '',
    sender_email: '',
    sender_name: ''
  });
  const [reportSettings, setReportSettings] = useState({
    daily_report_enabled: false,
    daily_report_time: '08:00',
    daily_report_recipients: '',
    include_ai_tips: true,
    include_sales_summary: true,
    include_low_stock_alerts: true,
    include_debt_reminders: true
  });
  const [lastReport, setLastReport] = useState(null);
  const [reportPreview, setReportPreview] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Fetch email settings
      const emailRes = await apiClient.get(`/email/settings`);
      setEmailSettings(emailRes.data);
      
      // Fetch report settings
      const reportRes = await apiClient.get(`/smart-reports/settings`);
      if (reportRes.data) {
        setReportSettings(reportRes.data);
      }
      
      // Fetch last report
      const lastReportRes = await apiClient.get(`/smart-reports/last`);
      setLastReport(lastReportRes.data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/smart-reports/settings`, reportSettings);
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات' : 'Paramètres enregistrés');
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'حدث خطأ' : 'Une erreur est survenue'));
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestReport = async () => {
    setSending(true);
    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/smart-reports/send-now`, {});
      toast.success(language === 'ar' ? 'تم إرسال التقرير بنجاح' : 'Rapport envoyé avec succès');
      fetchSettings();
    } catch (error) {
      toast.error(error.response?.data?.detail || (language === 'ar' ? 'فشل إرسال التقرير' : 'Échec de l\'envoi du rapport'));
    } finally {
      setSending(false);
    }
  };

  const handlePreviewReport = async () => {
    try {
      const res = await apiClient.get(`/smart-reports/preview`);
      setReportPreview(res.data);
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل تحميل المعاينة' : 'Échec du chargement de l\'aperçu');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="spinner" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="smart-reports-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-primary" />
              {language === 'ar' ? 'التقارير الذكية' : 'Rapports Intelligents'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'تقارير يومية تلقائية مع نصائح AI' : 'Rapports automatiques quotidiens avec conseils AI'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePreviewReport}>
              <FileText className="h-4 w-4 me-2" />
              {language === 'ar' ? 'معاينة' : 'Aperçu'}
            </Button>
            <Button onClick={handleSendTestReport} disabled={sending || !emailSettings.enabled}>
              <Send className="h-4 w-4 me-2" />
              {sending ? (language === 'ar' ? 'جاري الإرسال...' : 'Envoi...') : (language === 'ar' ? 'إرسال الآن' : 'Envoyer maintenant')}
            </Button>
          </div>
        </div>

        {/* Email Not Configured Warning */}
        {!emailSettings.enabled && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">
                    {language === 'ar' ? 'البريد الإلكتروني غير مفعل' : 'Email non configuré'}
                  </p>
                  <p className="text-sm text-amber-700">
                    {language === 'ar' ? 'يرجى تفعيل إعدادات البريد من صفحة الإعدادات أولاً' : 'Veuillez configurer les paramètres email dans les paramètres'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="settings" className="space-y-6">
          <TabsList>
            <TabsTrigger value="settings" className="gap-2">
              <Settings2 className="h-4 w-4" />
              {language === 'ar' ? 'الإعدادات' : 'Paramètres'}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <Clock className="h-4 w-4" />
              {language === 'ar' ? 'السجل' : 'Historique'}
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-2">
              <FileText className="h-4 w-4" />
              {language === 'ar' ? 'المعاينة' : 'Aperçu'}
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Schedule Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {language === 'ar' ? 'جدولة التقارير' : 'Planification'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'ar' ? 'إعداد إرسال التقارير اليومية' : 'Configurer l\'envoi quotidien des rapports'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{language === 'ar' ? 'تفعيل التقارير اليومية' : 'Activer les rapports quotidiens'}</Label>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'إرسال تقرير يومي تلقائي' : 'Envoyer un rapport quotidien automatique'}
                      </p>
                    </div>
                    <Switch
                      checked={reportSettings.daily_report_enabled}
                      onCheckedChange={(checked) => setReportSettings({...reportSettings, daily_report_enabled: checked})}
                      disabled={!emailSettings.enabled}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'وقت الإرسال' : 'Heure d\'envoi'}</Label>
                    <Input
                      type="time"
                      value={reportSettings.daily_report_time}
                      onChange={(e) => setReportSettings({...reportSettings, daily_report_time: e.target.value})}
                      disabled={!reportSettings.daily_report_enabled}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'المستلمين (بريد إلكتروني)' : 'Destinataires (email)'}</Label>
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={reportSettings.daily_report_recipients}
                      onChange={(e) => setReportSettings({...reportSettings, daily_report_recipients: e.target.value})}
                      disabled={!reportSettings.daily_report_enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      {language === 'ar' ? 'يمكن إضافة أكثر من بريد مفصولين بفاصلة' : 'Vous pouvez ajouter plusieurs emails séparés par des virgules'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Content Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {language === 'ar' ? 'محتوى التقرير' : 'Contenu du rapport'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'ar' ? 'اختر ما يتضمنه التقرير' : 'Choisissez ce que contient le rapport'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      <Label>{language === 'ar' ? 'نصائح الذكاء الاصطناعي' : 'Conseils AI'}</Label>
                    </div>
                    <Switch
                      checked={reportSettings.include_ai_tips}
                      onCheckedChange={(checked) => setReportSettings({...reportSettings, include_ai_tips: checked})}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <Label>{language === 'ar' ? 'ملخص المبيعات' : 'Résumé des ventes'}</Label>
                    </div>
                    <Switch
                      checked={reportSettings.include_sales_summary}
                      onCheckedChange={(checked) => setReportSettings({...reportSettings, include_sales_summary: checked})}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-amber-500" />
                      <Label>{language === 'ar' ? 'تنبيهات المخزون المنخفض' : 'Alertes stock faible'}</Label>
                    </div>
                    <Switch
                      checked={reportSettings.include_low_stock_alerts}
                      onCheckedChange={(checked) => setReportSettings({...reportSettings, include_low_stock_alerts: checked})}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <Label>{language === 'ar' ? 'تذكيرات الديون' : 'Rappels des dettes'}</Label>
                    </div>
                    <Switch
                      checked={reportSettings.include_debt_reminders}
                      onCheckedChange={(checked) => setReportSettings({...reportSettings, include_debt_reminders: checked})}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving ? (language === 'ar' ? 'جاري الحفظ...' : 'Enregistrement...') : (language === 'ar' ? 'حفظ الإعدادات' : 'Enregistrer')}
              </Button>
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'آخر تقرير مرسل' : 'Dernier rapport envoyé'}</CardTitle>
              </CardHeader>
              <CardContent>
                {lastReport ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      {lastReport.status === 'sent' ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <span className="font-medium">
                        {lastReport.status === 'sent' 
                          ? (language === 'ar' ? 'تم الإرسال بنجاح' : 'Envoyé avec succès')
                          : (language === 'ar' ? 'فشل الإرسال' : 'Échec de l\'envoi')
                        }
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4 inline me-1" />
                      {new Date(lastReport.sent_at).toLocaleString(language === 'ar' ? 'ar-SA' : 'fr-FR')}
                    </div>
                    <div className="text-sm">
                      <Mail className="h-4 w-4 inline me-1" />
                      {lastReport.recipients}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{language === 'ar' ? 'لم يتم إرسال أي تقرير بعد' : 'Aucun rapport envoyé encore'}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{language === 'ar' ? 'معاينة التقرير' : 'Aperçu du rapport'}</span>
                  <Button variant="outline" size="sm" onClick={handlePreviewReport}>
                    {language === 'ar' ? 'تحديث' : 'Actualiser'}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {reportPreview ? (
                  <div className="space-y-6">
                    {/* Sales Summary */}
                    {reportSettings.include_sales_summary && reportPreview.sales && (
                      <div className="p-4 border rounded-lg">
                        <h3 className="font-semibold flex items-center gap-2 mb-3">
                          <TrendingUp className="h-5 w-5 text-green-500" />
                          {language === 'ar' ? 'ملخص المبيعات' : 'Résumé des ventes'}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي اليوم' : 'Total jour'}</p>
                            <p className="text-xl font-bold">{reportPreview.sales.today_total?.toFixed(2)} {t.currency}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{language === 'ar' ? 'عدد المبيعات' : 'Nb ventes'}</p>
                            <p className="text-xl font-bold">{reportPreview.sales.today_count}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{language === 'ar' ? 'الربح' : 'Profit'}</p>
                            <p className="text-xl font-bold text-green-600">{reportPreview.sales.today_profit?.toFixed(2)} {t.currency}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">{language === 'ar' ? 'مقارنة بالأمس' : 'vs hier'}</p>
                            <p className={`text-xl font-bold ${reportPreview.sales.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {reportPreview.sales.change >= 0 ? '+' : ''}{reportPreview.sales.change?.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Low Stock Alerts */}
                    {reportSettings.include_low_stock_alerts && reportPreview.low_stock?.length > 0 && (
                      <div className="p-4 border rounded-lg border-amber-200 bg-amber-50">
                        <h3 className="font-semibold flex items-center gap-2 mb-3 text-amber-800">
                          <AlertTriangle className="h-5 w-5" />
                          {language === 'ar' ? 'منتجات منخفضة المخزون' : 'Produits en stock faible'} ({reportPreview.low_stock.length})
                        </h3>
                        <div className="space-y-2">
                          {reportPreview.low_stock.slice(0, 5).map((p, i) => (
                            <div key={`item-${i}`} className="flex justify-between text-sm">
                              <span>{p.name}</span>
                              <Badge variant="outline" className="text-amber-700">{p.quantity} {language === 'ar' ? 'وحدة' : 'unités'}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI Tips */}
                    {reportSettings.include_ai_tips && reportPreview.ai_tips && (
                      <div className="p-4 border rounded-lg border-purple-200 bg-purple-50">
                        <h3 className="font-semibold flex items-center gap-2 mb-3 text-purple-800">
                          <Sparkles className="h-5 w-5" />
                          {language === 'ar' ? 'نصائح ذكية' : 'Conseils intelligents'}
                        </h3>
                        <p className="text-sm text-purple-700">{reportPreview.ai_tips}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Button onClick={handlePreviewReport}>
                      {language === 'ar' ? 'تحميل المعاينة' : 'Charger l\'aperçu'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
