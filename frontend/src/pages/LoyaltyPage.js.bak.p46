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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import {
  Award,
  Gift,
  Users,
  Settings,
  Plus,
  MessageSquare,
  Send,
  Percent,
  DollarSign,
  Calendar,
  Trash2,
  Edit,
  RefreshCw,
  Star
} from 'lucide-react';

export default function LoyaltyPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('settings');
  
  // Loyalty Settings
  const [loyaltySettings, setLoyaltySettings] = useState({
    enabled: false,
    points_per_dinar: 1,
    points_value: 0.01,
    min_redeem_points: 100,
    welcome_bonus: 0
  });
  
  // SMS Campaigns
  const [campaigns, setCampaigns] = useState([]);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    message: '',
    target: 'all',
    scheduled_at: ''
  });
  
  // Customers
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [settingsRes, campaignsRes, customersRes] = await Promise.all([
        apiClient.get(`/loyalty/settings`),
        apiClient.get(`/marketing/sms/campaigns`),
        apiClient.get(`/customers`)
      ]);
      
      setLoyaltySettings(settingsRes.data);
      setCampaigns(campaignsRes.data);
      setCustomers(customersRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSettings = async () => {
    try {
      await apiClient.put(`/loyalty/settings`, loyaltySettings);
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات' : 'Paramètres enregistrés');
    } catch (error) {
      toast.error(language === 'ar' ? 'خطأ في الحفظ' : 'Erreur de sauvegarde');
    }
  };

  const createCampaign = async () => {
    if (!newCampaign.name || !newCampaign.message) {
      toast.error(language === 'ar' ? 'يرجى ملء جميع الحقول' : 'Veuillez remplir tous les champs');
      return;
    }
    
    try {
      await apiClient.post(`/marketing/sms/campaigns`, newCampaign);
      toast.success(language === 'ar' ? 'تم إنشاء الحملة' : 'Campagne créée');
      setShowCampaignDialog(false);
      setNewCampaign({ name: '', message: '', target: 'all', scheduled_at: '' });
      fetchData();
    } catch (error) {
      toast.error(language === 'ar' ? 'خطأ في إنشاء الحملة' : 'Erreur de création');
    }
  };

  const formatCurrency = (value) => `${value?.toFixed(2) || 0} ${language === 'ar' ? 'دج' : 'DA'}`;

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery)
  );

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
      <div className="space-y-6 animate-fade-in" data-testid="loyalty-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Award className="h-8 w-8 text-amber-500" />
              {language === 'ar' ? 'الولاء والتسويق' : 'Fidélité et Marketing'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'إدارة نقاط الولاء والحملات التسويقية' : 'Gérer les points de fidélité et campagnes'}
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              {language === 'ar' ? 'الإعدادات' : 'Paramètres'}
            </TabsTrigger>
            <TabsTrigger value="customers" className="gap-2">
              <Users className="h-4 w-4" />
              {language === 'ar' ? 'العملاء' : 'Clients'}
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              {language === 'ar' ? 'الحملات' : 'Campagnes'}
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-amber-500" />
                  {language === 'ar' ? 'إعدادات برنامج الولاء' : 'Paramètres du programme'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar' 
                    ? 'تخصيص نظام النقاط والمكافآت'
                    : 'Personnaliser le système de points et récompenses'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Enable Loyalty */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-amber-100">
                      <Award className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium">{language === 'ar' ? 'تفعيل برنامج الولاء' : 'Activer le programme'}</p>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'منح نقاط على كل عملية شراء' : 'Donner des points sur chaque achat'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={loyaltySettings.enabled}
                    onCheckedChange={(checked) => setLoyaltySettings(prev => ({ ...prev, enabled: checked }))}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Points per Dinar */}
                  <div>
                    <Label className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-500" />
                      {language === 'ar' ? 'نقاط لكل دينار' : 'Points par dinar'}
                    </Label>
                    <Input
                      type="number"
                      value={loyaltySettings.points_per_dinar}
                      onChange={(e) => setLoyaltySettings(prev => ({ ...prev, points_per_dinar: parseFloat(e.target.value) || 0 }))}
                      className="mt-2"
                      min="0"
                      step="0.1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'ar' ? 'عدد النقاط لكل دينار منفق' : 'Nombre de points par dinar dépensé'}
                    </p>
                  </div>

                  {/* Point Value */}
                  <div>
                    <Label className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-emerald-500" />
                      {language === 'ar' ? 'قيمة النقطة (دج)' : 'Valeur du point (DA)'}
                    </Label>
                    <Input
                      type="number"
                      value={loyaltySettings.points_value}
                      onChange={(e) => setLoyaltySettings(prev => ({ ...prev, points_value: parseFloat(e.target.value) || 0 }))}
                      className="mt-2"
                      min="0"
                      step="0.01"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'ar' ? 'قيمة كل نقطة عند الاستبدال' : 'Valeur de chaque point à l\'échange'}
                    </p>
                  </div>

                  {/* Min Redeem Points */}
                  <div>
                    <Label className="flex items-center gap-2">
                      <Gift className="h-4 w-4 text-purple-500" />
                      {language === 'ar' ? 'الحد الأدنى للاستبدال' : 'Minimum pour échange'}
                    </Label>
                    <Input
                      type="number"
                      value={loyaltySettings.min_redeem_points}
                      onChange={(e) => setLoyaltySettings(prev => ({ ...prev, min_redeem_points: parseInt(e.target.value) || 0 }))}
                      className="mt-2"
                      min="0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'ar' ? 'أقل عدد نقاط للاستبدال' : 'Minimum de points pour échanger'}
                    </p>
                  </div>

                  {/* Welcome Bonus */}
                  <div>
                    <Label className="flex items-center gap-2">
                      <Percent className="h-4 w-4 text-blue-500" />
                      {language === 'ar' ? 'مكافأة الترحيب' : 'Bonus de bienvenue'}
                    </Label>
                    <Input
                      type="number"
                      value={loyaltySettings.welcome_bonus}
                      onChange={(e) => setLoyaltySettings(prev => ({ ...prev, welcome_bonus: parseInt(e.target.value) || 0 }))}
                      className="mt-2"
                      min="0"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'ar' ? 'نقاط تمنح للعميل الجديد' : 'Points offerts au nouveau client'}
                    </p>
                  </div>
                </div>

                <Button onClick={saveSettings} className="w-full sm:w-auto">
                  {language === 'ar' ? 'حفظ الإعدادات' : 'Enregistrer'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Customers Tab */}
          <TabsContent value="customers" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-600" />
                    {language === 'ar' ? 'نقاط العملاء' : 'Points des clients'}
                  </CardTitle>
                  <Input
                    placeholder={language === 'ar' ? 'بحث...' : 'Rechercher...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-xs"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'العميل' : 'Client'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الهاتف' : 'Téléphone'}</TableHead>
                        <TableHead>{language === 'ar' ? 'إجمالي المشتريات' : 'Total achats'}</TableHead>
                        <TableHead>{language === 'ar' ? 'النقاط' : 'Points'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                            {language === 'ar' ? 'لا يوجد عملاء' : 'Aucun client'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCustomers.map((customer) => (
                          <TableRow key={customer.id}>
                            <TableCell className="font-medium">{customer.name}</TableCell>
                            <TableCell>{customer.phone || '-'}</TableCell>
                            <TableCell>{formatCurrency(customer.total_purchases)}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="gap-1">
                                <Star className="h-3 w-3 text-amber-500" />
                                {customer.loyalty_points || 0}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-blue-600" />
                    {language === 'ar' ? 'حملات SMS' : 'Campagnes SMS'}
                  </CardTitle>
                  <Button onClick={() => setShowCampaignDialog(true)}>
                    <Plus className="h-4 w-4 me-2" />
                    {language === 'ar' ? 'حملة جديدة' : 'Nouvelle campagne'}
                  </Button>
                </div>
                <CardDescription>
                  {language === 'ar'
                    ? '⚠️ خدمة SMS في وضع المحاكاة. للتفعيل الفعلي، يرجى التواصل مع الدعم.'
                    : '⚠️ Service SMS en mode simulation. Pour activation réelle, contactez le support.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'الاسم' : 'Nom'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الهدف' : 'Cible'}</TableHead>
                        <TableHead>{language === 'ar' ? 'المستلمون' : 'Destinataires'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                        <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaigns.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            {language === 'ar' ? 'لا توجد حملات' : 'Aucune campagne'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        campaigns.map((campaign) => (
                          <TableRow key={campaign.id}>
                            <TableCell className="font-medium">{campaign.name}</TableCell>
                            <TableCell>
                              {campaign.target === 'all' && (language === 'ar' ? 'الكل' : 'Tous')}
                              {campaign.target === 'customers_with_debt' && (language === 'ar' ? 'المديونين' : 'Endettés')}
                              {campaign.target === 'inactive' && (language === 'ar' ? 'غير نشطين' : 'Inactifs')}
                              {campaign.target === 'selected' && (language === 'ar' ? 'محددين' : 'Sélectionnés')}
                            </TableCell>
                            <TableCell>{campaign.recipients_count}</TableCell>
                            <TableCell>
                              <Badge variant={campaign.status === 'sent' ? 'default' : 'secondary'}>
                                {campaign.status === 'sent' 
                                  ? (language === 'ar' ? 'مرسلة' : 'Envoyée')
                                  : (language === 'ar' ? 'مجدولة' : 'Planifiée')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(campaign.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* New Campaign Dialog */}
        <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-blue-600" />
                {language === 'ar' ? 'حملة SMS جديدة' : 'Nouvelle campagne SMS'}
              </DialogTitle>
              <DialogDescription>
                {language === 'ar' 
                  ? 'أرسل رسالة ترويجية لعملائك'
                  : 'Envoyez un message promotionnel à vos clients'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>{language === 'ar' ? 'اسم الحملة' : 'Nom de la campagne'}</Label>
                <Input
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={language === 'ar' ? 'مثال: عروض رمضان' : 'Ex: Offres Ramadan'}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{language === 'ar' ? 'المستهدفون' : 'Destinataires'}</Label>
                <Select
                  value={newCampaign.target}
                  onValueChange={(value) => setNewCampaign(prev => ({ ...prev, target: value }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === 'ar' ? 'جميع العملاء' : 'Tous les clients'}</SelectItem>
                    <SelectItem value="customers_with_debt">{language === 'ar' ? 'العملاء المديونين' : 'Clients endettés'}</SelectItem>
                    <SelectItem value="inactive">{language === 'ar' ? 'العملاء غير النشطين' : 'Clients inactifs'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{language === 'ar' ? 'الرسالة' : 'Message'}</Label>
                <Textarea
                  value={newCampaign.message}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, message: e.target.value }))}
                  placeholder={language === 'ar' ? 'اكتب رسالتك هنا...' : 'Écrivez votre message...'}
                  className="mt-1"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {newCampaign.message.length}/160 {language === 'ar' ? 'حرف' : 'caractères'}
                </p>
              </div>
              <div>
                <Label>{language === 'ar' ? 'جدولة (اختياري)' : 'Planifier (optionnel)'}</Label>
                <Input
                  type="datetime-local"
                  value={newCampaign.scheduled_at}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, scheduled_at: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCampaignDialog(false)}>
                {language === 'ar' ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button onClick={createCampaign}>
                <Send className="h-4 w-4 me-2" />
                {language === 'ar' ? 'إرسال' : 'Envoyer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
