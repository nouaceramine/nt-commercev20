import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import {
  Megaphone,
  Settings,
  Send,
  Bell,
  CheckCircle,
  Clock,
  Users,
  Sparkles,
  AlertTriangle,
  Info,
  Wrench,
  Gift,
  Trash2,
  Eye,
  RefreshCw
} from 'lucide-react';

const SystemUpdatesPage = () => {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState('announcements');
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total_tenants: 0, active_tenants: 0, total_announcements: 0 });
  
  // New announcement form
  const [newAnnouncement, setNewAnnouncement] = useState({
    title_ar: '',
    title_fr: '',
    message_ar: '',
    message_fr: '',
    type: 'info',
    priority: 'normal',
    target: 'all'
  });

  // System settings to push
  const [settingsToPush, setSettingsToPush] = useState({
    receipt_settings: false,
    notification_settings: false,
    loyalty_settings: false,
    pos_settings: false
  });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchAnnouncements();
    fetchStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnnouncements = async () => {
    try {
      const response = await apiClient.get(`/system-updates/announcements`, { headers });
      setAnnouncements(response.data);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await apiClient.get(`/system-updates/stats`, { headers });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!newAnnouncement.title_ar || !newAnnouncement.message_ar) {
      toast.error(language === 'ar' ? 'يرجى ملء العنوان والرسالة' : 'Veuillez remplir le titre et le message');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post(`/system-updates/announcements`, newAnnouncement, { headers });
      toast.success(language === 'ar' ? 'تم إرسال الإعلان بنجاح' : 'Annonce envoyée avec succès');
      setNewAnnouncement({
        title_ar: '',
        title_fr: '',
        message_ar: '',
        message_fr: '',
        type: 'info',
        priority: 'normal',
        target: 'all'
      });
      fetchAnnouncements();
      fetchStats();
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل في إرسال الإعلان' : 'Échec de l\'envoi');
    } finally {
      setLoading(false);
    }
  };

  const handlePushSettings = async () => {
    const selectedSettings = Object.keys(settingsToPush).filter(key => settingsToPush[key]);
    if (selectedSettings.length === 0) {
      toast.error(language === 'ar' ? 'يرجى اختيار إعدادات للنشر' : 'Veuillez sélectionner des paramètres');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post(`/system-updates/push-settings`, { settings: selectedSettings }, { headers });
      toast.success(language === 'ar' ? 'تم نشر الإعدادات بنجاح' : 'Paramètres publiés avec succès');
      setSettingsToPush({
        receipt_settings: false,
        notification_settings: false,
        loyalty_settings: false,
        pos_settings: false
      });
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل في نشر الإعدادات' : 'Échec de la publication');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    try {
      await apiClient.delete(`/system-updates/announcements/${id}`, { headers });
      toast.success(language === 'ar' ? 'تم حذف الإعلان' : 'Annonce supprimée');
      fetchAnnouncements();
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل في الحذف' : 'Échec de la suppression');
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'feature': return <Sparkles className="h-5 w-5 text-purple-500" />;
      case 'maintenance': return <Wrench className="h-5 w-5 text-orange-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'promotion': return <Gift className="h-5 w-5 text-green-500" />;
      default: return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getTypeLabel = (type) => {
    const labels = {
      info: { ar: 'معلومات', fr: 'Information' },
      feature: { ar: 'ميزة جديدة', fr: 'Nouvelle fonctionnalité' },
      maintenance: { ar: 'صيانة', fr: 'Maintenance' },
      warning: { ar: 'تحذير', fr: 'Avertissement' },
      promotion: { ar: 'عرض خاص', fr: 'Promotion' }
    };
    return labels[type]?.[language] || type;
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'normal': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Layout>
      <div className="space-y-6" data-testid="system-updates-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {language === 'ar' ? 'تحديثات النظام' : 'Mises à jour système'}
            </h1>
            <p className="text-muted-foreground">
              {language === 'ar' ? 'إدارة الإعلانات ونشر التحديثات لجميع المشتركين' : 'Gérer les annonces et publier les mises à jour'}
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 opacity-80" />
              <div>
                <p className="text-sm opacity-80">{language === 'ar' ? 'إجمالي المشتركين' : 'Total abonnés'}</p>
                <p className="text-2xl font-bold">{stats.total_tenants}</p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 opacity-80" />
              <div>
                <p className="text-sm opacity-80">{language === 'ar' ? 'المشتركين النشطين' : 'Abonnés actifs'}</p>
                <p className="text-2xl font-bold">{stats.active_tenants}</p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
            <div className="flex items-center gap-3">
              <Megaphone className="h-8 w-8 opacity-80" />
              <div>
                <p className="text-sm opacity-80">{language === 'ar' ? 'الإعلانات المرسلة' : 'Annonces envoyées'}</p>
                <p className="text-2xl font-bold">{stats.total_announcements}</p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white">
            <div className="flex items-center gap-3">
              <Bell className="h-8 w-8 opacity-80" />
              <div>
                <p className="text-sm opacity-80">{language === 'ar' ? 'إشعارات اليوم' : "Notifications aujourd'hui"}</p>
                <p className="text-2xl font-bold">{announcements.filter(a => new Date(a.created_at).toDateString() === new Date().toDateString()).length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab('announcements')}
            className={`px-4 py-2 font-medium transition-colors ${activeTab === 'announcements' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="tab-announcements"
          >
            <Megaphone className="h-4 w-4 inline me-2" />
            {language === 'ar' ? 'الإعلانات' : 'Annonces'}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 font-medium transition-colors ${activeTab === 'settings' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid="tab-settings"
          >
            <Settings className="h-4 w-4 inline me-2" />
            {language === 'ar' ? 'نشر الإعدادات' : 'Publier paramètres'}
          </button>
        </div>

        {/* Announcements Tab */}
        {activeTab === 'announcements' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Announcement Form */}
            <div className="bg-card rounded-xl border p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                {language === 'ar' ? 'إنشاء إعلان جديد' : 'Créer une annonce'}
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {language === 'ar' ? 'العنوان (عربي)' : 'Titre (Arabe)'} *
                  </label>
                  <Input
                    value={newAnnouncement.title_ar}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title_ar: e.target.value })}
                    placeholder={language === 'ar' ? 'عنوان الإعلان...' : 'Titre en arabe...'}
                    data-testid="announcement-title-ar"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {language === 'ar' ? 'العنوان (فرنسي)' : 'Titre (Français)'}
                  </label>
                  <Input
                    value={newAnnouncement.title_fr}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title_fr: e.target.value })}
                    placeholder="Titre en français..."
                    data-testid="announcement-title-fr"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">
                  {language === 'ar' ? 'الرسالة (عربي)' : 'Message (Arabe)'} *
                </label>
                <textarea
                  value={newAnnouncement.message_ar}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, message_ar: e.target.value })}
                  className="w-full h-24 px-3 py-2 rounded-lg border bg-background resize-none"
                  placeholder={language === 'ar' ? 'نص الرسالة...' : 'Message en arabe...'}
                  data-testid="announcement-message-ar"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">
                  {language === 'ar' ? 'الرسالة (فرنسي)' : 'Message (Français)'}
                </label>
                <textarea
                  value={newAnnouncement.message_fr}
                  onChange={(e) => setNewAnnouncement({ ...newAnnouncement, message_fr: e.target.value })}
                  className="w-full h-24 px-3 py-2 rounded-lg border bg-background resize-none"
                  placeholder="Message en français..."
                  data-testid="announcement-message-fr"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {language === 'ar' ? 'النوع' : 'Type'}
                  </label>
                  <select
                    value={newAnnouncement.type}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, type: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border bg-background"
                    data-testid="announcement-type"
                  >
                    <option value="info">{language === 'ar' ? 'معلومات' : 'Information'}</option>
                    <option value="feature">{language === 'ar' ? 'ميزة جديدة' : 'Nouvelle fonctionnalité'}</option>
                    <option value="maintenance">{language === 'ar' ? 'صيانة' : 'Maintenance'}</option>
                    <option value="warning">{language === 'ar' ? 'تحذير' : 'Avertissement'}</option>
                    <option value="promotion">{language === 'ar' ? 'عرض خاص' : 'Promotion'}</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {language === 'ar' ? 'الأولوية' : 'Priorité'}
                  </label>
                  <select
                    value={newAnnouncement.priority}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, priority: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border bg-background"
                    data-testid="announcement-priority"
                  >
                    <option value="low">{language === 'ar' ? 'منخفضة' : 'Basse'}</option>
                    <option value="normal">{language === 'ar' ? 'عادية' : 'Normale'}</option>
                    <option value="high">{language === 'ar' ? 'عالية' : 'Haute'}</option>
                    <option value="urgent">{language === 'ar' ? 'عاجلة' : 'Urgente'}</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    {language === 'ar' ? 'الهدف' : 'Cible'}
                  </label>
                  <select
                    value={newAnnouncement.target}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, target: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border bg-background"
                    data-testid="announcement-target"
                  >
                    <option value="all">{language === 'ar' ? 'الجميع' : 'Tous'}</option>
                    <option value="active">{language === 'ar' ? 'النشطين فقط' : 'Actifs seulement'}</option>
                  </select>
                </div>
              </div>

              <Button
                onClick={handleCreateAnnouncement}
                disabled={loading}
                className="w-full"
                data-testid="send-announcement-btn"
              >
                <Send className="h-4 w-4 me-2" />
                {loading ? (language === 'ar' ? 'جاري الإرسال...' : 'Envoi...') : (language === 'ar' ? 'إرسال الإعلان' : "Envoyer l'annonce")}
              </Button>
            </div>

            {/* Announcements List */}
            <div className="bg-card rounded-xl border p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                {language === 'ar' ? 'الإعلانات السابقة' : 'Annonces précédentes'}
              </h2>

              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {announcements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Megaphone className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>{language === 'ar' ? 'لا توجد إعلانات بعد' : 'Aucune annonce'}</p>
                  </div>
                ) : (
                  announcements.map((announcement) => (
                    <div
                      key={announcement.id}
                      className="p-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                      data-testid={`announcement-${announcement.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {getTypeIcon(announcement.type)}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">
                                {language === 'ar' ? announcement.title_ar : (announcement.title_fr || announcement.title_ar)}
                              </h3>
                              <span className={`px-2 py-0.5 text-xs text-white rounded-full ${getPriorityColor(announcement.priority)}`}>
                                {announcement.priority}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {language === 'ar' ? announcement.message_ar : (announcement.message_fr || announcement.message_ar)}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span>{getTypeLabel(announcement.type)}</span>
                              <span>{new Date(announcement.created_at).toLocaleDateString()}</span>
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {announcement.read_count || 0} {language === 'ar' ? 'مشاهدة' : 'vues'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAnnouncement(announcement.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Settings Push Tab */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <div className="bg-card rounded-xl border p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
                  <RefreshCw className="h-5 w-5 text-primary" />
                  {language === 'ar' ? 'نشر الإعدادات لجميع المشتركين' : 'Publier les paramètres'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {language === 'ar' 
                    ? 'اختر الإعدادات التي تريد نشرها لجميع حسابات المشتركين'
                    : 'Sélectionnez les paramètres à publier pour tous les abonnés'}
                </p>
              </div>

              <div className="space-y-4">
                {[
                  { key: 'receipt_settings', label: { ar: 'إعدادات الإيصال', fr: 'Paramètres de reçu' }, icon: '🧾' },
                  { key: 'notification_settings', label: { ar: 'إعدادات الإشعارات', fr: 'Paramètres de notification' }, icon: '🔔' },
                  { key: 'loyalty_settings', label: { ar: 'إعدادات الولاء', fr: 'Paramètres de fidélité' }, icon: '⭐' },
                  { key: 'pos_settings', label: { ar: 'إعدادات نقطة البيع', fr: 'Paramètres POS' }, icon: '🛒' }
                ].map((setting) => (
                  <label
                    key={setting.key}
                    className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                      settingsToPush[setting.key] ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={settingsToPush[setting.key]}
                      onChange={(e) => setSettingsToPush({ ...settingsToPush, [setting.key]: e.target.checked })}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-2xl">{setting.icon}</span>
                    <span className="font-medium">{setting.label[language]}</span>
                  </label>
                ))}
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      {language === 'ar' ? 'تنبيه مهم' : 'Avertissement important'}
                    </p>
                    <p className="text-amber-700 dark:text-amber-300">
                      {language === 'ar' 
                        ? 'سيتم استبدال إعدادات جميع المشتركين بالإعدادات الحالية. هذا الإجراء لا يمكن التراجع عنه.'
                        : 'Les paramètres de tous les abonnés seront remplacés. Cette action est irréversible.'}
                    </p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handlePushSettings}
                disabled={loading || !Object.values(settingsToPush).some(v => v)}
                className="w-full"
                data-testid="push-settings-btn"
              >
                <RefreshCw className={`h-4 w-4 me-2 ${loading ? 'animate-spin' : ''}`} />
                {loading 
                  ? (language === 'ar' ? 'جاري النشر...' : 'Publication...') 
                  : (language === 'ar' ? 'نشر الإعدادات المحددة' : 'Publier les paramètres')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SystemUpdatesPage;
