import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import { toast } from 'sonner';
import {
  Bell,
  BellOff,
  Settings,
  Trash2,
  CheckCheck,
  AlertTriangle,
  Package,
  Users,
  CreditCard,
  Wrench,
  Calendar,
  Volume2,
  VolumeX,
  Mail,
  RefreshCw,
  Check,
  X,
  Clock
} from 'lucide-react';

export default function NotificationsPage() {
  const { language, isRTL } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState({
    low_stock_enabled: true,
    low_stock_threshold: 10,
    debt_reminder_enabled: true,
    debt_reminder_days: 7,
    cash_difference_enabled: true,
    cash_difference_threshold: 1000,
    expense_reminder_enabled: true,
    repair_status_enabled: true,
    email_notifications: false,
    sound_enabled: true
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const t = {
    ar: {
      notifications: 'الإشعارات والتنبيهات',
      allNotifications: 'كل الإشعارات',
      settings: 'الإعدادات',
      noNotifications: 'لا توجد إشعارات',
      markAllRead: 'تحديد الكل كمقروء',
      clearAll: 'مسح الكل',
      unread: 'غير مقروء',
      read: 'مقروء',
      lowStock: 'تنبيه المخزون المنخفض',
      lowStockThreshold: 'حد المخزون المنخفض',
      debtReminder: 'تذكير الديون',
      debtReminderDays: 'أيام التذكير',
      cashDifference: 'فرق الصندوق',
      cashThreshold: 'حد الفرق',
      expenseReminder: 'تذكير المصاريف',
      repairStatus: 'حالة الإصلاحات',
      emailNotifications: 'إشعارات البريد',
      soundEnabled: 'الصوت',
      saveSettings: 'حفظ الإعدادات',
      saved: 'تم الحفظ',
      today: 'اليوم',
      yesterday: 'أمس',
      older: 'أقدم',
      delete: 'حذف',
      markRead: 'تحديد كمقروء'
    },
    fr: {
      notifications: 'Notifications et alertes',
      allNotifications: 'Toutes les notifications',
      settings: 'Paramètres',
      noNotifications: 'Aucune notification',
      markAllRead: 'Tout marquer comme lu',
      clearAll: 'Tout effacer',
      unread: 'Non lu',
      read: 'Lu',
      lowStock: 'Alerte stock bas',
      lowStockThreshold: 'Seuil de stock bas',
      debtReminder: 'Rappel des dettes',
      debtReminderDays: 'Jours de rappel',
      cashDifference: 'Différence de caisse',
      cashThreshold: 'Seuil de différence',
      expenseReminder: 'Rappel des dépenses',
      repairStatus: 'Statut des réparations',
      emailNotifications: 'Notifications par email',
      soundEnabled: 'Son',
      saveSettings: 'Enregistrer',
      saved: 'Enregistré',
      today: 'Aujourd\'hui',
      yesterday: 'Hier',
      older: 'Plus ancien',
      delete: 'Supprimer',
      markRead: 'Marquer comme lu'
    }
  };

  const texts = t[language] || t.ar;

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [notifRes, settingsRes] = await Promise.all([
        apiClient.get(`/notifications/all`, { headers }),
        apiClient.get(`/notifications/settings`, { headers })
      ]);

      setNotifications(notifRes.data.notifications || []);
      setUnreadCount(notifRes.data.unread_count || 0);
      setTotalCount(notifRes.data.total || 0);
      setSettings(settingsRes.data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/notifications/settings`, settings);
      toast.success(texts.saved);
    } catch (error) {
      toast.error('Error saving settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/notifications/${notificationId}/read`, {});
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.put(`/notifications/mark-all-read`, {});
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      toast.success(language === 'ar' ? 'تم تحديد الكل كمقروء' : 'Tout marqué comme lu');
    } catch (error) {
      toast.error('Error');
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.delete(`/notifications/${notificationId}`);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setTotalCount(prev => prev - 1);
      toast.success(language === 'ar' ? 'تم الحذف' : 'Supprimé');
    } catch (error) {
      toast.error('Error');
    }
  };

  const clearAllNotifications = async () => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من مسح كل الإشعارات؟' : 'Êtes-vous sûr de vouloir tout effacer?')) return;
    
    try {
      await apiClient.delete(`/notifications/clear-all`);
      setNotifications([]);
      setUnreadCount(0);
      setTotalCount(0);
      toast.success(language === 'ar' ? 'تم مسح كل الإشعارات' : 'Toutes les notifications effacées');
    } catch (error) {
      toast.error('Error');
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'low_stock': return <Package className="h-5 w-5 text-orange-500" />;
      case 'debt_reminder': return <CreditCard className="h-5 w-5 text-red-500" />;
      case 'cash_difference': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'repair': return <Wrench className="h-5 w-5 text-blue-500" />;
      case 'expense': return <Calendar className="h-5 w-5 text-purple-500" />;
      default: return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return texts.today;
    if (days === 1) return texts.yesterday;
    return date.toLocaleDateString(language === 'ar' ? 'ar-DZ' : 'fr-FR');
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="notifications-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bell className="h-6 w-6" />
              {texts.notifications}
            </h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="mt-2">
                {unreadCount} {texts.unread}
              </Badge>
            )}
          </div>
        </div>

        <Tabs defaultValue="notifications" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              {texts.allNotifications}
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ms-1">{unreadCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              {texts.settings}
            </TabsTrigger>
          </TabsList>

          {/* Notifications Tab */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-lg">{texts.allNotifications}</CardTitle>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={markAllAsRead}
                    disabled={unreadCount === 0}
                    data-testid="mark-all-read-btn"
                  >
                    <CheckCheck className="h-4 w-4 me-1" />
                    {texts.markAllRead}
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={clearAllNotifications}
                    disabled={totalCount === 0}
                    data-testid="clear-all-btn"
                  >
                    <Trash2 className="h-4 w-4 me-1" />
                    {texts.clearAll}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {notifications.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BellOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{texts.noNotifications}</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {notifications.map((notification) => (
                        <div 
                          key={notification.id}
                          className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                            notification.read ? 'bg-background' : 'bg-primary/5 border-primary/20'
                          }`}
                          data-testid={`notification-${notification.id}`}
                        >
                          <div className="shrink-0 mt-0.5">
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!notification.read ? 'font-medium' : ''}`}>
                              {notification.message || notification.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatDate(notification.created_at)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => markAsRead(notification.id)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => deleteNotification(notification.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>{texts.settings}</CardTitle>
                <CardDescription>
                  {language === 'ar' ? 'تحكم في أنواع الإشعارات التي تريد تلقيها' : 'Contrôlez les types de notifications que vous souhaitez recevoir'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Low Stock */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-orange-500" />
                    <div>
                      <Label className="text-base">{texts.lowStock}</Label>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'تنبيه عندما ينخفض المخزون' : 'Alerte quand le stock est bas'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={settings.low_stock_threshold}
                      onChange={(e) => setSettings(prev => ({ ...prev, low_stock_threshold: parseInt(e.target.value) || 0 }))}
                      className="w-20"
                      min={1}
                    />
                    <Switch
                      checked={settings.low_stock_enabled}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, low_stock_enabled: checked }))}
                    />
                  </div>
                </div>

                <Separator />

                {/* Debt Reminder */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-red-500" />
                    <div>
                      <Label className="text-base">{texts.debtReminder}</Label>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'تذكير بالديون المستحقة' : 'Rappel des dettes dues'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={settings.debt_reminder_days}
                      onChange={(e) => setSettings(prev => ({ ...prev, debt_reminder_days: parseInt(e.target.value) || 7 }))}
                      className="w-20"
                      min={1}
                    />
                    <Switch
                      checked={settings.debt_reminder_enabled}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, debt_reminder_enabled: checked }))}
                    />
                  </div>
                </div>

                <Separator />

                {/* Cash Difference */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    <div>
                      <Label className="text-base">{texts.cashDifference}</Label>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'تنبيه عند وجود فرق في الصندوق' : 'Alerte en cas de différence de caisse'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      value={settings.cash_difference_threshold}
                      onChange={(e) => setSettings(prev => ({ ...prev, cash_difference_threshold: parseInt(e.target.value) || 0 }))}
                      className="w-24"
                      min={0}
                    />
                    <Switch
                      checked={settings.cash_difference_enabled}
                      onCheckedChange={(checked) => setSettings(prev => ({ ...prev, cash_difference_enabled: checked }))}
                    />
                  </div>
                </div>

                <Separator />

                {/* Expense Reminder */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-purple-500" />
                    <div>
                      <Label className="text-base">{texts.expenseReminder}</Label>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'تذكير بالمصاريف المتكررة' : 'Rappel des dépenses récurrentes'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.expense_reminder_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, expense_reminder_enabled: checked }))}
                  />
                </div>

                <Separator />

                {/* Repair Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Wrench className="h-5 w-5 text-blue-500" />
                    <div>
                      <Label className="text-base">{texts.repairStatus}</Label>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'تنبيه بتغيير حالة الإصلاحات' : 'Alerte de changement de statut des réparations'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.repair_status_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, repair_status_enabled: checked }))}
                  />
                </div>

                <Separator />

                {/* Sound */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {settings.sound_enabled ? (
                      <Volume2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <VolumeX className="h-5 w-5 text-gray-400" />
                    )}
                    <div>
                      <Label className="text-base">{texts.soundEnabled}</Label>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'تشغيل صوت عند الإشعارات' : 'Jouer un son lors des notifications'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.sound_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, sound_enabled: checked }))}
                  />
                </div>

                <Separator />

                {/* Email Notifications */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-blue-500" />
                    <div>
                      <Label className="text-base">{texts.emailNotifications}</Label>
                      <p className="text-sm text-muted-foreground">
                        {language === 'ar' ? 'إرسال الإشعارات بالبريد الإلكتروني' : 'Envoyer les notifications par email'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.email_notifications}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, email_notifications: checked }))}
                  />
                </div>

                <div className="pt-4">
                  <Button 
                    onClick={saveSettings} 
                    disabled={savingSettings}
                    className="w-full"
                    data-testid="save-notification-settings-btn"
                  >
                    {savingSettings ? (
                      <RefreshCw className="h-4 w-4 animate-spin me-2" />
                    ) : (
                      <Check className="h-4 w-4 me-2" />
                    )}
                    {texts.saveSettings}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
