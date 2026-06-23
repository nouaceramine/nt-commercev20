import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { Bell, CheckCheck, AlertTriangle, Info, Trash2, Clock } from 'lucide-react';

export default function SmartNotificationsPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState({});
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const params = {};
      if (filter === 'unread') params.read = false;
      if (['high', 'medium', 'low', 'warning'].includes(filter)) params.severity = filter;
      const [nRes, sRes] = await Promise.all([
        apiClient.get(`/smart-notifications`, { headers, params }),
        apiClient.get(`/smart-notifications/stats`, { headers }),
      ]);
      setNotifications(nRes.data);
      setStats(sRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filter]);

  const markRead = async (id) => {
    try {
      await apiClient.put(`/smart-notifications/${id}/read`, {}, { headers });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setStats(prev => ({ ...prev, unread: Math.max(0, (prev.unread || 0) - 1) }));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await apiClient.put(`/smart-notifications/mark-all-read`, {}, { headers });
      toast.success(isAr ? 'تم تعليم الكل كمقروء' : 'Tout marqué comme lu');
      fetchData();
    } catch {}
  };

  const clearRead = async () => {
    try {
      await apiClient.delete(`/smart-notifications/clear`, { headers });
      toast.success(isAr ? 'تم المسح' : 'Effacé');
      fetchData();
    } catch {}
  };

  const severityIcon = (s) => ({ high: AlertTriangle, warning: AlertTriangle, medium: Bell, low: Info }[s] || Bell);
  const severityColor = (s) => ({
    high: 'text-red-400 bg-red-500/10 border-red-500/30',
    warning: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    medium: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    low: 'text-gray-400 bg-gray-500/10 border-gray-500/30',
  }[s] || 'text-gray-400 bg-gray-500/10');
  const typeLabel = (t) => ({
    overdue_debt: isAr ? 'ديون متأخرة' : 'Dettes en retard',
    overdue_repair: isAr ? 'إصلاح متأخر' : 'Réparation retard',
    subscription_expiring: isAr ? 'اشتراك ينتهي' : 'Abo. expire',
    pending_task: isAr ? 'مهمة معلقة' : 'Tâche en attente',
    low_stock: isAr ? 'مخزون منخفض' : 'Stock bas',
  }[t] || t);

  const filters = [
    { id: 'all', label: isAr ? 'الكل' : 'Tous' },
    { id: 'unread', label: isAr ? 'غير مقروء' : 'Non lus' },
    { id: 'high', label: isAr ? 'حرجة' : 'Critique' },
    { id: 'warning', label: isAr ? 'تحذيرات' : 'Avertissements' },
    { id: 'medium', label: isAr ? 'متوسطة' : 'Moyennes' },
  ];

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="smart-notifications-page">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Bell className="w-7 h-7 text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">{isAr ? 'الإشعارات الذكية' : 'Notifications Intelligentes'}</h1>
              <p className="text-sm text-gray-400">{isAr ? 'تنبيهات تلقائية من 11 روبوت ذكي' : 'Alertes automatiques de 11 robots'}</p>
            </div>
            {stats.unread > 0 && <Badge className="bg-red-500 text-white">{stats.unread}</Badge>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1 border-gray-600" data-testid="mark-all-read"><CheckCheck className="w-3 h-3" />{isAr ? 'قراءة الكل' : 'Tout lire'}</Button>
            <Button variant="outline" size="sm" onClick={clearRead} className="gap-1 border-gray-600 text-red-400"><Trash2 className="w-3 h-3" />{isAr ? 'مسح المقروء' : 'Effacer lus'}</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gray-800/50 border-gray-700"><CardContent className="p-4 flex items-center gap-3">
            <Bell className="w-8 h-8 text-blue-400" />
            <div><p className="text-xs text-gray-400">{isAr ? 'الإجمالي' : 'Total'}</p><p className="text-xl font-bold text-white">{stats.total || 0}</p></div>
          </CardContent></Card>
          <Card className="bg-gray-800/50 border-gray-700"><CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <div><p className="text-xs text-gray-400">{isAr ? 'غير مقروء' : 'Non lus'}</p><p className="text-xl font-bold text-white">{stats.unread || 0}</p></div>
          </CardContent></Card>
          {Object.entries(stats.by_type || {}).slice(0, 2).map(([type, count]) => (
            <Card key={type} className="bg-gray-800/50 border-gray-700"><CardContent className="p-4 flex items-center gap-3">
              <Clock className="w-8 h-8 text-amber-400" />
              <div><p className="text-xs text-gray-400">{typeLabel(type)}</p><p className="text-xl font-bold text-white">{count}</p></div>
            </CardContent></Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <Button key={f.id} variant={filter === f.id ? 'default' : 'ghost'} size="sm" onClick={() => setFilter(f.id)} data-testid={`notif-filter-${f.id}`}>{f.label}</Button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="space-y-2">
          {loading ? <p className="text-gray-400 text-center py-8">{isAr ? 'جاري التحميل...' : 'Chargement...'}</p> :
           notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">{isAr ? 'لا توجد إشعارات' : 'Aucune notification'}</p>
              <p className="text-sm text-gray-500 mt-1">{isAr ? 'ستظهر هنا تنبيهات الروبوتات الذكية' : 'Les alertes robots apparaîtront ici'}</p>
            </div>
           ) :
           notifications.map(n => {
             const SIcon = severityIcon(n.severity);
             return (
              <Card key={n.id} className={`border transition-colors cursor-pointer ${n.read ? 'bg-gray-800/30 border-gray-700/50' : 'bg-gray-800/50 border-gray-700'}`} onClick={() => !n.read && markRead(n.id)} data-testid={`notif-${n.id}`}>
                <CardContent className="p-3 flex items-start gap-3">
                  <div className={`p-2 rounded-lg border ${severityColor(n.severity)}`}><SIcon className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs ${severityColor(n.severity)}`}>{typeLabel(n.type)}</Badge>
                      {!n.read && <span className="w-2 h-2 bg-blue-400 rounded-full" />}
                    </div>
                    <p className={`text-sm mt-1 ${n.read ? 'text-gray-500' : 'text-white'}`}>{n.title_ar || n.title_fr}</p>
                    <p className="text-xs text-gray-600 mt-1">{n.created_at ? new Date(n.created_at).toLocaleString(isAr ? 'ar-DZ' : 'fr-FR') : ''}</p>
                  </div>
                </CardContent>
              </Card>
             );
           })}
        </div>
      </div>
    </Layout>
  );
}
