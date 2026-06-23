import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { 
  Bell, AlertTriangle, Package, Users, Calendar, 
  TrendingDown, Clock, CheckCircle, X, Settings,
  Volume2, VolumeX
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { toast } from 'sonner';

export function SmartNotifications({ onNotificationCount }) {
  const { language } = useLanguage();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('notificationSettings');
    return saved ? JSON.parse(saved) : {
      lowStock: true,
      debts: true,
      expiry: true,
      sound: true,
      threshold: 10
    };
  });

  useEffect(() => {
    fetchNotifications();
    // Refresh every 5 minutes
    const interval = setInterval(fetchNotifications, 300000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem('notificationSettings', JSON.stringify(settings));
  }, [settings]);

  const fetchNotifications = async () => {
    try {
      const [productsRes, customersRes, expensesRes] = await Promise.all([
        apiClient.get(`/products`).catch(() => ({ data: [] })),
        apiClient.get(`/customers`).catch(() => ({ data: [] })),
        apiClient.get(`/expenses`).catch(() => ({ data: [] }))
      ]);

      const newNotifications = [];

      // Check low stock products
      if (settings.lowStock) {
        const lowStockProducts = productsRes.data.filter(p => 
          p.quantity <= (p.low_stock_threshold || settings.threshold)
        );
        if (lowStockProducts.length > 0) {
          newNotifications.push({
            id: 'low_stock',
            type: 'warning',
            icon: Package,
            title: language === 'ar' ? 'مخزون منخفض' : 'Stock faible',
            message: language === 'ar' 
              ? `${lowStockProducts.length} منتج بحاجة لإعادة التوريد`
              : `${lowStockProducts.length} produits à réapprovisionner`,
            items: lowStockProducts.slice(0, 5).map(p => ({
              name: p.name_ar || p.name_en,
              detail: `${p.quantity} ${language === 'ar' ? 'متبقي' : 'restant'}`
            })),
            priority: lowStockProducts.some(p => p.quantity === 0) ? 'high' : 'medium',
            time: new Date()
          });
        }
      }

      // Check customer debts
      if (settings.debts) {
        const customersWithDebts = customersRes.data.filter(c => (c.balance || 0) > 0);
        const overLimitCustomers = customersWithDebts.filter(c => 
          c.max_debt_limit && c.balance >= c.max_debt_limit
        );
        
        if (overLimitCustomers.length > 0) {
          newNotifications.push({
            id: 'debt_limit',
            type: 'error',
            icon: Users,
            title: language === 'ar' ? 'تجاوز حد الدين' : 'Limite de dette dépassée',
            message: language === 'ar'
              ? `${overLimitCustomers.length} عميل تجاوز حد الدين`
              : `${overLimitCustomers.length} clients ont dépassé leur limite`,
            items: overLimitCustomers.slice(0, 5).map(c => ({
              name: c.name,
              detail: `${c.balance?.toFixed(2)} / ${c.max_debt_limit?.toFixed(2)}`
            })),
            priority: 'high',
            time: new Date()
          });
        }

        // Long pending debts (more than 30 days)
        const longPendingDebts = customersWithDebts.filter(c => {
          if (!c.last_payment_date) return c.balance > 0;
          const daysSincePayment = Math.floor((new Date() - new Date(c.last_payment_date)) / (1000 * 60 * 60 * 24));
          return daysSincePayment > 30;
        });

        if (longPendingDebts.length > 0) {
          newNotifications.push({
            id: 'old_debts',
            type: 'warning',
            icon: Clock,
            title: language === 'ar' ? 'ديون متأخرة' : 'Dettes en retard',
            message: language === 'ar'
              ? `${longPendingDebts.length} دين متأخر أكثر من 30 يوم`
              : `${longPendingDebts.length} dettes en retard de plus de 30 jours`,
            items: longPendingDebts.slice(0, 5).map(c => ({
              name: c.name,
              detail: `${c.balance?.toFixed(2)} ${language === 'ar' ? 'دج' : 'DA'}`
            })),
            priority: 'medium',
            time: new Date()
          });
        }
      }

      // Today's summary
      const today = new Date().toISOString().split('T')[0];
      const todayExpenses = expensesRes.data.filter(e => e.date?.startsWith(today));
      if (todayExpenses.length > 0) {
        const totalExpenses = todayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        newNotifications.push({
          id: 'daily_expenses',
          type: 'info',
          icon: TrendingDown,
          title: language === 'ar' ? 'مصاريف اليوم' : 'Dépenses du jour',
          message: language === 'ar'
            ? `إجمالي المصاريف: ${totalExpenses.toFixed(2)} دج`
            : `Total des dépenses: ${totalExpenses.toFixed(2)} DA`,
          priority: 'low',
          time: new Date()
        });
      }

      setNotifications(newNotifications);
      if (onNotificationCount) {
        onNotificationCount(newNotifications.filter(n => n.priority === 'high').length);
      }

      // Play sound for high priority notifications
      if (settings.sound && newNotifications.some(n => n.priority === 'high')) {
        playNotificationSound();
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const playNotificationSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      gainNode.gain.value = 0.3;
      oscillator.start();
      setTimeout(() => {
        oscillator.frequency.value = 1000;
        setTimeout(() => oscillator.stop(), 100);
      }, 100);
    } catch (e) {}
  };

  const dismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'bg-red-100 border-red-300 text-red-800';
      case 'medium': return 'bg-amber-100 border-amber-300 text-amber-800';
      default: return 'bg-blue-100 border-blue-300 text-blue-800';
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'high': return <Badge className="bg-red-500">{language === 'ar' ? 'عاجل' : 'Urgent'}</Badge>;
      case 'medium': return <Badge className="bg-amber-500">{language === 'ar' ? 'متوسط' : 'Moyen'}</Badge>;
      default: return <Badge className="bg-blue-500">{language === 'ar' ? 'معلومة' : 'Info'}</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-600" />
              {language === 'ar' ? 'الإشعارات الذكية' : 'Notifications intelligentes'}
              {notifications.length > 0 && (
                <Badge variant="secondary">{notifications.length}</Badge>
              )}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={fetchNotifications}>
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4 text-muted-foreground">
              {language === 'ar' ? 'جاري التحميل...' : 'Chargement...'}
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p>{language === 'ar' ? 'لا توجد تنبيهات جديدة' : 'Aucune alerte'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map(notification => (
                <div 
                  key={notification.id}
                  className={`p-3 rounded-lg border ${getPriorityColor(notification.priority)} relative`}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 left-1 h-6 w-6"
                    onClick={() => dismissNotification(notification.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <div className="flex items-start gap-3">
                    <notification.icon className="h-5 w-5 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{notification.title}</span>
                        {getPriorityBadge(notification.priority)}
                      </div>
                      <p className="text-sm">{notification.message}</p>
                      {notification.items && (
                        <ul className="mt-2 space-y-1">
                          {notification.items.map((item, i) => (
                            <li key={`item-${i}`} className="text-xs flex justify-between">
                              <span>{item.name}</span>
                              <span className="text-muted-foreground">{item.detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{language === 'ar' ? 'إعدادات الإشعارات' : 'Paramètres des notifications'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span>{language === 'ar' ? 'تنبيه المخزون المنخفض' : 'Alerte stock faible'}</span>
              </div>
              <Switch 
                checked={settings.lowStock} 
                onCheckedChange={(v) => setSettings({...settings, lowStock: v})} 
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>{language === 'ar' ? 'تنبيه الديون' : 'Alerte dettes'}</span>
              </div>
              <Switch 
                checked={settings.debts} 
                onCheckedChange={(v) => setSettings({...settings, debts: v})} 
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {settings.sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                <span>{language === 'ar' ? 'صوت الإشعارات' : 'Son des notifications'}</span>
              </div>
              <Switch 
                checked={settings.sound} 
                onCheckedChange={(v) => setSettings({...settings, sound: v})} 
              />
            </div>
            <Button onClick={() => { setShowSettings(false); fetchNotifications(); }} className="w-full">
              {language === 'ar' ? 'حفظ وتحديث' : 'Enregistrer et actualiser'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default SmartNotifications;
