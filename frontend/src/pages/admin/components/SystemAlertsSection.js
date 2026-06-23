import { useState, useEffect } from 'react';
import apiClient from '../../../lib/apiClient';
import { formatShortDate } from '../../../utils/globalDateFormatter';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Switch } from '../../../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { toast } from 'sonner';
import { 
  Clock, AlertTriangle, CreditCard, Settings,
  Trash2, RefreshCw, Database, Bug, Shield, 
  Zap, Server, Wrench, CheckCircle, XCircle, 
  Download, AlertCircle
} from 'lucide-react';

export const SystemAlertsSection = () => {
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);
  const [filter, setFilter] = useState('all');
  const [stats, setStats] = useState({
    total: 0,
    critical: 0,
    warning: 0,
    info: 0,
    resolved: 0,
    today: 0
  });

  useEffect(() => {
    fetchErrors();
    const interval = setInterval(fetchErrors, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchErrors = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/saas/system-errors`);
      setErrors(response.data.errors || []);
      setStats(response.data.stats || {
        total: 0,
        critical: 0,
        warning: 0,
        info: 0,
        resolved: 0,
        today: 0,
        active: 0
      });
    } catch (err) {
      console.error('Error fetching system errors:', err);
      // Set empty state on error
      setErrors([]);
      setStats({
        total: 0,
        critical: 0,
        warning: 0,
        info: 0,
        resolved: 0,
        today: 0,
        active: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAutoFix = async (errorId, fixAction) => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/saas/system-errors/${errorId}/fix`, { action: fixAction });
      toast.success('تم تنفيذ الإصلاح التلقائي');
      setErrors(prev => prev.map(e => e.id === errorId ? { ...e, status: 'resolved' } : e));
      // Refresh stats
      fetchErrors();
    } catch (err) {
      toast.error('فشل في تنفيذ الإصلاح');
      console.error('Auto fix error:', err);
    }
  };

  const handleManualFix = async (errorId) => {
    try {
      const token = localStorage.getItem('token');
      await apiClient.post(`/saas/system-errors/${errorId}/resolve`, {});
      toast.success('تم وضع علامة محلول');
      setErrors(prev => prev.map(e => e.id === errorId ? { ...e, status: 'resolved' } : e));
      // Refresh stats
      fetchErrors();
    } catch (err) {
      toast.error('فشل في تحديث حالة الخطأ');
      console.error('Manual fix error:', err);
    }
  };

  const handleClearResolved = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.delete(`/saas/system-errors/resolved`);
      setErrors(prev => prev.filter(e => e.status !== 'resolved'));
      toast.success(`تم مسح ${response.data.deleted_count || 0} خطأ محلول`);
      // Refresh stats
      fetchErrors();
    } catch (err) {
      toast.error('فشل في مسح الأخطاء المحلولة');
      console.error('Clear resolved error:', err);
    }
  };

  const handleExportLogs = () => {
    const logContent = errors.map(e => 
      `[${e.timestamp}] [${e.severity.toUpperCase()}] [${e.type}] ${e.tenant_name}: ${e.message}`
    ).join('\n');
    
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system_errors_${new Date().toISOString().split('T')[0]}.log`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('تم تصدير السجل');
  };

  const severityConfig = {
    critical: { color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle, iconColor: 'text-red-500' },
    warning: { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertTriangle, iconColor: 'text-amber-500' },
    info: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: AlertCircle, iconColor: 'text-blue-500' }
  };

  const typeConfig = {
    api: { label: 'API', icon: Server },
    database: { label: 'قاعدة البيانات', icon: Database },
    payment: { label: 'الدفع', icon: CreditCard },
    auth: { label: 'المصادقة', icon: Shield },
    system: { label: 'النظام', icon: Settings }
  };

  const filteredErrors = errors.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'active') return e.status === 'active';
    if (filter === 'resolved') return e.status === 'resolved';
    return e.severity === filter;
  });

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'الآن';
    if (diff < 3600000) return `منذ ${Math.floor(diff / 60000)} دقيقة`;
    if (diff < 86400000) return `منذ ${Math.floor(diff / 3600000)} ساعة`;
    return formatShortDate(date);
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="p-4 text-center">
          <Bug className="h-5 w-5 mx-auto mb-1 text-gray-500" />
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">إجمالي الأخطاء</p>
        </CardContent></Card>
        <Card className="border-red-200"><CardContent className="p-4 text-center">
          <XCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
          <p className="text-2xl font-bold text-red-600">{stats.critical}</p>
          <p className="text-xs text-muted-foreground">حرجة</p>
        </CardContent></Card>
        <Card className="border-amber-200"><CardContent className="p-4 text-center">
          <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-amber-500" />
          <p className="text-2xl font-bold text-amber-600">{stats.warning}</p>
          <p className="text-xs text-muted-foreground">تحذيرات</p>
        </CardContent></Card>
        <Card className="border-blue-200"><CardContent className="p-4 text-center">
          <AlertCircle className="h-5 w-5 mx-auto mb-1 text-blue-500" />
          <p className="text-2xl font-bold text-blue-600">{stats.info}</p>
          <p className="text-xs text-muted-foreground">معلومات</p>
        </CardContent></Card>
        <Card className="border-green-200"><CardContent className="p-4 text-center">
          <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-500" />
          <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
          <p className="text-xs text-muted-foreground">محلولة</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Clock className="h-5 w-5 mx-auto mb-1 text-purple-500" />
          <p className="text-2xl font-bold">{stats.today}</p>
          <p className="text-xs text-muted-foreground">اليوم</p>
        </CardContent></Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="active">نشطة</SelectItem>
              <SelectItem value="resolved">محلولة</SelectItem>
              <SelectItem value="critical">حرجة</SelectItem>
              <SelectItem value="warning">تحذيرات</SelectItem>
              <SelectItem value="info">معلومات</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
            <Zap className={`h-4 w-4 ${autoFixEnabled ? 'text-green-500' : 'text-gray-400'}`} />
            <span className="text-sm">إصلاح تلقائي</span>
            <Switch checked={autoFixEnabled} onCheckedChange={setAutoFixEnabled} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleClearResolved}>
            <Trash2 className="h-4 w-4 ml-1" /> مسح المحلولة
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportLogs}>
            <Download className="h-4 w-4 ml-1" /> تصدير السجل
          </Button>
          <Button variant="outline" size="sm" onClick={fetchErrors}>
            <RefreshCw className="h-4 w-4 ml-1" /> تحديث
          </Button>
        </div>
      </div>

      {/* Errors List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            سجل الأخطاء والتنبيهات ({filteredErrors.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredErrors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500" />
              <p>لا توجد أخطاء حالياً</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredErrors.map((error) => {
                const config = severityConfig[error.severity] || severityConfig.info;
                const typeInfo = typeConfig[error.type] || typeConfig.system;
                const Icon = config.icon;
                const TypeIcon = typeInfo.icon;

                return (
                  <div 
                    key={error.id} 
                    className={`p-4 hover:bg-muted/50 transition-colors ${error.status === 'resolved' ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-full ${config.color}`}>
                        <Icon className={`h-5 w-5 ${config.iconColor}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            <TypeIcon className="h-3 w-3 ml-1" />
                            {typeInfo.label}
                          </Badge>
                          <Badge variant={error.status === 'resolved' ? 'secondary' : 'destructive'} className="text-xs">
                            {error.status === 'resolved' ? 'محلول' : 'نشط'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatTime(error.timestamp)}</span>
                        </div>
                        <p className="font-medium text-sm mb-1">{error.message}</p>
                        <p className="text-xs text-muted-foreground">
                          المستأجر: {error.tenant_name}
                        </p>
                      </div>

                      {error.status !== 'resolved' && (
                        <div className="flex items-center gap-2">
                          {error.auto_fixable && autoFixEnabled && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="gap-1 text-green-600 border-green-200 hover:bg-green-50"
                              onClick={() => handleAutoFix(error.id, error.fix_action)}
                            >
                              <Zap className="h-3 w-3" />
                              إصلاح تلقائي
                            </Button>
                          )}
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleManualFix(error.id)}
                          >
                            <Wrench className="h-3 w-3 ml-1" />
                            يدوي
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            إجراءات الصيانة السريعة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={async () => {
              try {
                const token = localStorage.getItem('token');
                const res = await apiClient.post(`/saas/system-errors/maintenance/clear_cache`, {});
                toast.success(res.data.message || 'تم مسح الكاش');
              } catch (err) {
                toast.error('فشل في مسح الكاش');
              }
            }}>
              <Database className="h-6 w-6 text-blue-500" />
              <span>مسح الكاش</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={async () => {
              try {
                const token = localStorage.getItem('token');
                const res = await apiClient.post(`/saas/system-errors/maintenance/reconnect_db`, {});
                toast.success(res.data.message || 'تم إعادة الاتصال');
              } catch (err) {
                toast.error('فشل في إعادة الاتصال');
              }
            }}>
              <Server className="h-6 w-6 text-green-500" />
              <span>إعادة اتصال DB</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={async () => {
              try {
                const token = localStorage.getItem('token');
                const res = await apiClient.post(`/saas/system-errors/maintenance/restart_services`, {});
                toast.success(res.data.message || 'تم إعادة تشغيل الخدمات');
              } catch (err) {
                toast.error('فشل في إعادة التشغيل');
              }
            }}>
              <RefreshCw className="h-6 w-6 text-purple-500" />
              <span>إعادة تشغيل</span>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={async () => {
              try {
                const res = await apiClient.post(`/saas/system-errors/maintenance/system_check`, {});
                const details = res.data.details || {};
                toast.success(`${res.data.message || 'تم فحص النظام'}\nCPU: ${details.cpu_usage || 'N/A'} | RAM: ${details.memory_usage || 'N/A'}`);
              } catch (err) {
                toast.error('فشل في فحص النظام');
              }
            }}>
              <Shield className="h-6 w-6 text-amber-500" />
              <span>فحص النظام</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
