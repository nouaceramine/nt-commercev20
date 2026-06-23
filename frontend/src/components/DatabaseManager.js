import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { formatDateTime } from '../utils/globalDateFormatter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import {
  Database, HardDrive, Activity, AlertTriangle, Check, X, Clock,
  Download, Upload, Trash2, RefreshCw, Eye, Settings, Search,
  Shield, Lock, Unlock, Copy, Merge, Archive, BarChart3,
  Calendar, FileJson, FileSpreadsheet, Server, Cpu, MemoryStick,
  CloudUpload, Mail, Bell, Zap,
  Play, Pause, RotateCcw, Filter, MoreHorizontal, Plus
} from 'lucide-react';
import { StatCard } from './StatCard';

// Health Status Badge
const HealthBadge = ({ status }) => {
  const config = {
    healthy: { color: 'bg-green-100 text-green-700 border-green-200', icon: Check, label: 'سليم' },
    warning: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: AlertTriangle, label: 'تحذير' },
    critical: { color: 'bg-red-100 text-red-700 border-red-200', icon: X, label: 'حرج' },
    inactive: { color: 'bg-gray-100 text-gray-700 border-gray-200', icon: Clock, label: 'غير نشط' },
    frozen: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Pause, label: 'مجمد' }
  };
  const { color, icon: Icon, label } = config[status] || config.inactive;
  
  return (
    <Badge variant="outline" className={`${color} gap-1`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
};

// Database Type Badge
const TypeBadge = ({ type }) => {
  const config = {
    tenant: { color: 'bg-blue-50 text-blue-700', label: 'مشترك' },
    agent: { color: 'bg-purple-50 text-purple-700', label: 'وكيل' },
    partner: { color: 'bg-orange-50 text-orange-700', label: 'شريك' },
    main: { color: 'bg-green-50 text-green-700', label: 'رئيسية' }
  };
  const { color, label } = config[type] || config.tenant;
  
  return <Badge variant="outline" className={color}>{label}</Badge>;
};

export const DatabaseManager = ({ tenants = [], agents = [] }) => {
  const [databases, setDatabases] = useState([]);
  const [stats, setStats] = useState({
    total_databases: 0,
    total_size: 0,
    active_databases: 0,
    inactive_databases: 0,
    total_backups: 0,
    last_backup: null,
    alerts_count: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedDb, setSelectedDb] = useState(null);
  const [operationLogs, setOperationLogs] = useState([]);
  const [backups, setBackups] = useState([]);
  const [schedules, setSchedules] = useState([]);
  
  // Import/Export State
  const [availableExports, setAvailableExports] = useState([]);
  const [importLogs, setImportLogs] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [convertingFile, setConvertingFile] = useState(false);
  const [importingData, setImportingData] = useState(false);
  const [selectedExportFile, setSelectedExportFile] = useState(null);
  const [selectedImportTenant, setSelectedImportTenant] = useState('');
  const [clearExistingData, setClearExistingData] = useState(false);
  const [conversionResult, setConversionResult] = useState(null);
  
  // Dialogs
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  
  // Forms
  const [deleteConfirmCode, setDeleteConfirmCode] = useState('');
  const [exportFormat, setExportFormat] = useState('json');
  const [backupOptions, setBackupOptions] = useState({
    include_files: true,
    compress: true,
    encrypt: false,
    send_email: false,
    email: ''
  });
  const [scheduleForm, setScheduleForm] = useState({
    frequency: 'daily',
    time: '02:00',
    retention_days: 30,
    enabled: true
  });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dbRes, statsRes, logsRes, backupsRes] = await Promise.all([
        apiClient.get(`/saas/databases`, { headers }),
        apiClient.get(`/saas/databases/stats`, { headers }),
        apiClient.get(`/saas/databases/logs`, { headers }),
        apiClient.get(`/saas/databases/backups`, { headers })
      ]);
      
      setDatabases(dbRes.data);
      setStats(statsRes.data);
      setOperationLogs(logsRes.data);
      setBackups(backupsRes.data);
    } catch (error) {
      console.error('Error fetching database data:', error);
      // Fallback: Generate from tenants/agents
      generateFromLocalData();
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generateFromLocalData = () => {
    const dbList = [
      // Main database
      {
        id: 'main',
        name: 'nt_pos_db',
        display_name: 'قاعدة البيانات الرئيسية',
        type: 'main',
        owner_id: null,
        owner_name: 'NT Commerce',
        size_mb: 256,
        collections_count: 25,
        documents_count: 15000,
        status: 'healthy',
        is_active: true,
        is_frozen: false,
        last_activity: new Date().toISOString(),
        created_at: '2024-01-01T00:00:00Z',
        backup_enabled: true,
        last_backup: new Date(Date.now() - 86400000).toISOString()
      },
      // Generate from tenants
      ...tenants.map(t => ({
        id: t.id,
        name: `tenant_${t.id.replace(/-/g, '_')}`,
        display_name: t.company_name || t.name,
        type: 'tenant',
        owner_id: t.id,
        owner_name: t.name,
        owner_email: t.email,
        size_mb: Math.floor(Math.random() * 100) + 10,
        collections_count: 20,
        documents_count: Math.floor(Math.random() * 5000) + 100,
        status: t.is_active ? 'healthy' : 'inactive',
        is_active: t.is_active,
        is_frozen: false,
        last_activity: t.created_at,
        created_at: t.created_at,
        backup_enabled: true,
        last_backup: null,
        plan_name: t.plan_name
      })),
      // Generate from agents
      ...agents.map(a => ({
        id: a.id,
        name: `agent_${a.id.replace(/-/g, '_')}`,
        display_name: a.company_name || a.name,
        type: 'agent',
        owner_id: a.id,
        owner_name: a.name,
        owner_email: a.email,
        size_mb: Math.floor(Math.random() * 50) + 5,
        collections_count: 10,
        documents_count: Math.floor(Math.random() * 1000) + 50,
        status: a.is_active ? 'healthy' : 'inactive',
        is_active: a.is_active,
        is_frozen: false,
        last_activity: a.created_at,
        created_at: a.created_at,
        backup_enabled: false,
        last_backup: null
      }))
    ];

    setDatabases(dbList);
    setStats({
      total_databases: dbList.length,
      total_size: dbList.reduce((sum, db) => sum + db.size_mb, 0),
      active_databases: dbList.filter(db => db.is_active).length,
      inactive_databases: dbList.filter(db => !db.is_active).length,
      total_backups: 5,
      last_backup: new Date(Date.now() - 86400000).toISOString(),
      alerts_count: dbList.filter(db => db.status === 'warning' || db.status === 'critical').length
    });
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter databases
  const filteredDatabases = databases.filter(db => {
    const matchesSearch = db.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         db.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         db.owner_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || db.type === filterType;
    const matchesStatus = filterStatus === 'all' || 
                         (filterStatus === 'active' && db.is_active) ||
                         (filterStatus === 'inactive' && !db.is_active) ||
                         (filterStatus === 'frozen' && db.is_frozen);
    return matchesSearch && matchesType && matchesStatus;
  });

  // Actions
  const handleBackup = async (dbId) => {
    try {
      toast.loading('جاري إنشاء النسخة الاحتياطية...');
      await apiClient.post(`/saas/databases/${dbId}/backup`, backupOptions, { headers });
      toast.dismiss();
      toast.success('تم إنشاء النسخة الاحتياطية بنجاح');
      setBackupDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.dismiss();
      toast.error('حدث خطأ أثناء إنشاء النسخة الاحتياطية');
    }
  };

  const handleRestore = async (dbId, backupId) => {
    try {
      toast.loading('جاري استعادة البيانات...');
      await apiClient.post(`/saas/databases/${dbId}/restore`, { backup_id: backupId }, { headers });
      toast.dismiss();
      toast.success('تم استعادة البيانات بنجاح');
      setRestoreDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.dismiss();
      toast.error('حدث خطأ أثناء الاستعادة');
    }
  };

  const handleExport = async (dbId) => {
    try {
      toast.loading('جاري تصدير البيانات...');
      const response = await apiClient.get(`/saas/databases/${dbId}/export?format=${exportFormat}`, {
        headers,
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedDb?.name}_export.${exportFormat}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.dismiss();
      toast.success('تم تصدير البيانات بنجاح');
      setExportDialogOpen(false);
    } catch (error) {
      toast.dismiss();
      toast.error('حدث خطأ أثناء التصدير');
    }
  };

  const handleDelete = async (dbId) => {
    if (deleteConfirmCode !== 'DELETE') {
      toast.error('يرجى كتابة DELETE للتأكيد');
      return;
    }
    try {
      toast.loading('جاري حذف قاعدة البيانات...');
      await apiClient.delete(`/saas/databases/${dbId}`, { headers });
      toast.dismiss();
      toast.success('تم حذف قاعدة البيانات بنجاح');
      setDeleteDialogOpen(false);
      setDeleteConfirmCode('');
      fetchData();
    } catch (error) {
      toast.dismiss();
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  const handleClear = async (dbId) => {
    try {
      toast.loading('جاري تفريغ قاعدة البيانات...');
      await apiClient.post(`/saas/databases/${dbId}/clear`, {}, { headers });
      toast.dismiss();
      toast.success('تم تفريغ قاعدة البيانات بنجاح');
      fetchData();
    } catch (error) {
      toast.dismiss();
      toast.error('حدث خطأ أثناء التفريغ');
    }
  };

  const handleFreeze = async (dbId, freeze) => {
    try {
      await apiClient.post(`/saas/databases/${dbId}/freeze`, { freeze }, { headers });
      toast.success(freeze ? 'تم تجميد قاعدة البيانات' : 'تم إلغاء التجميد');
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  const handleSaveSchedule = async () => {
    try {
      await apiClient.post(`/saas/databases/${selectedDb?.id}/schedule`, scheduleForm, { headers });
      toast.success('تم حفظ جدولة النسخ الاحتياطي');
      setScheduleDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('حدث خطأ');
    }
  };

  // Import/Export Functions
  const fetchAvailableExports = async () => {
    try {
      const response = await apiClient.get(`/saas/database/exports`, { headers });
      setAvailableExports(response.data.exports || []);
    } catch (error) {
      console.error('Error fetching exports:', error);
    }
  };

  const fetchImportLogs = async () => {
    try {
      const response = await apiClient.get(`/saas/database/import-logs`, { headers });
      setImportLogs(response.data.logs || []);
    } catch (error) {
      console.error('Error fetching import logs:', error);
    }
  };

  const handleConvertAccessDB = async (file) => {
    if (!file) return;
    
    setConvertingFile(true);
    setConversionResult(null);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await apiClient.post(`/saas/database/convert-access`, formData, {
        headers: {
          ...headers,
          'Content-Type': 'multipart/form-data'
        },
        timeout: 300000 // 5 minutes timeout
      });
      
      setConversionResult(response.data);
      toast.success('تم تحويل قاعدة البيانات بنجاح');
      fetchAvailableExports();
    } catch (error) {
      console.error('Conversion error:', error);
      toast.error(error.response?.data?.detail || 'حدث خطأ أثناء تحويل قاعدة البيانات');
    } finally {
      setConvertingFile(false);
    }
  };

  const handleDownloadExport = async (filename) => {
    try {
      toast.loading('جاري تحميل الملف...');
      const response = await apiClient.get(`/saas/database/download/${filename}`, {
        headers,
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.dismiss();
      toast.success('تم تحميل الملف بنجاح');
    } catch (error) {
      toast.dismiss();
      toast.error('حدث خطأ أثناء التحميل');
    }
  };

  const handleDeleteExport = async (filename) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الملف؟')) return;
    
    try {
      await apiClient.delete(`/saas/database/exports/${filename}`, { headers });
      toast.success('تم حذف الملف بنجاح');
      fetchAvailableExports();
    } catch (error) {
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  const handleImportToTenant = async () => {
    if (!selectedExportFile || !selectedImportTenant) {
      toast.error('يرجى اختيار الملف والمشترك');
      return;
    }
    
    setImportingData(true);
    
    try {
      // First download the export file
      const downloadResponse = await apiClient.get(
        `/saas/database/download/${selectedExportFile}`,
        { headers, responseType: 'blob' }
      );
      
      // Create form data with the file
      const formData = new FormData();
      formData.append('file', downloadResponse.data, selectedExportFile);
      formData.append('clear_existing', clearExistingData);
      
      // Import to tenant
      const importResponse = await apiClient.post(`/saas/database/import/${selectedImportTenant}?clear_existing=${clearExistingData}`,
        formData,
        {
          headers: {
            ...headers,
            'Content-Type': 'multipart/form-data'
          },
          timeout: 300000
        }
      );
      
      toast.success('تم استيراد البيانات بنجاح');
      setImportDialogOpen(false);
      setSelectedExportFile(null);
      setSelectedImportTenant('');
      fetchImportLogs();
      
      // Show import statistics
      const stats = importResponse.data.statistics;
      const statsMessage = `
        الفئات: ${stats.categories?.imported || 0}
        المنتجات: ${stats.products?.imported || 0}
        العملاء: ${stats.customers?.imported || 0}
        الموردين: ${stats.suppliers?.imported || 0}
      `;
      toast.info(statsMessage, { duration: 5000 });
      
    } catch (error) {
      console.error('Import error:', error);
      toast.error(error.response?.data?.detail || 'حدث خطأ أثناء الاستيراد');
    } finally {
      setImportingData(false);
    }
  };

  // Fetch exports when tab changes
  useEffect(() => {
    fetchAvailableExports();
    fetchImportLogs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const formatSize = (mb) => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb} MB`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'غير محدد';
    return formatDateTime(dateStr);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            إدارة قواعد البيانات
          </h2>
          <p className="text-sm text-muted-foreground">مراقبة وإدارة جميع قواعد بيانات المشتركين والوكلاء</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 me-2" />
            تحديث
          </Button>
          <Button size="sm" onClick={() => setSettingsDialogOpen(true)}>
            <Settings className="h-4 w-4 me-2" />
            الإعدادات
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard
          variant="gradient"
          title="إجمالي القواعد"
          value={stats.total_databases}
          icon={Database}
          color="from-blue-500 to-blue-600"
        />
        <StatCard
          variant="gradient"
          title="الحجم الإجمالي"
          value={formatSize(stats.total_size)}
          icon={HardDrive}
          color="from-purple-500 to-purple-600"
        />
        <StatCard
          variant="gradient"
          title="نشطة"
          value={stats.active_databases}
          icon={Activity}
          color="from-green-500 to-green-600"
        />
        <StatCard
          variant="gradient"
          title="غير نشطة"
          value={stats.inactive_databases}
          icon={Clock}
          color="from-gray-500 to-gray-600"
        />
        <StatCard
          variant="gradient"
          title="النسخ الاحتياطية"
          value={stats.total_backups}
          icon={Archive}
          color="from-indigo-500 to-indigo-600"
        />
        <StatCard
          variant="gradient"
          title="آخر نسخة"
          value={stats.last_backup ? formatDate(stats.last_backup).split(',')[0] : 'لا يوجد'}
          icon={Calendar}
          color="from-teal-500 to-teal-600"
        />
        <StatCard
          variant="gradient"
          title="تنبيهات"
          value={stats.alerts_count}
          icon={AlertTriangle}
          color={stats.alerts_count > 0 ? "from-red-500 to-red-600" : "from-emerald-500 to-emerald-600"}
        />
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="databases" className="space-y-4">
        <TabsList>
          <TabsTrigger value="databases" className="gap-2">
            <Database className="h-4 w-4" />
            قواعد البيانات
          </TabsTrigger>
          <TabsTrigger value="import-export" className="gap-2" data-testid="import-export-tab">
            <Upload className="h-4 w-4" />
            استيراد/تصدير
          </TabsTrigger>
          <TabsTrigger value="backups" className="gap-2">
            <Archive className="h-4 w-4" />
            النسخ الاحتياطية
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Activity className="h-4 w-4" />
            سجل العمليات
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            التقارير
          </TabsTrigger>
        </TabsList>

        {/* Databases Tab */}
        <TabsContent value="databases" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو المالك..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                <SelectItem value="main">رئيسية</SelectItem>
                <SelectItem value="tenant">مشتركين</SelectItem>
                <SelectItem value="agent">وكلاء</SelectItem>
                <SelectItem value="partner">شركاء</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="active">نشطة</SelectItem>
                <SelectItem value="inactive">غير نشطة</SelectItem>
                <SelectItem value="frozen">مجمدة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Databases Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>قاعدة البيانات</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>المالك</TableHead>
                    <TableHead className="text-center">الحجم</TableHead>
                    <TableHead className="text-center">السجلات</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">آخر نشاط</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDatabases.map(db => (
                    <TableRow key={db.id} className={db.is_frozen ? 'bg-blue-50/50' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Database className={`h-4 w-4 ${db.type === 'main' ? 'text-green-500' : 'text-blue-500'}`} />
                          <div>
                            <p className="font-medium">{db.display_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{db.name}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <TypeBadge type={db.type} />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{db.owner_name}</p>
                          {db.owner_email && (
                            <p className="text-xs text-muted-foreground">{db.owner_email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-medium">{formatSize(db.size_mb)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm">{db.documents_count?.toLocaleString()}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <HealthBadge status={db.is_frozen ? 'frozen' : db.status} />
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {formatDate(db.last_activity)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedDb(db);
                              setDetailsDialogOpen(true);
                            }}
                            title="عرض التفاصيل"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedDb(db);
                              setBackupDialogOpen(true);
                            }}
                            title="نسخ احتياطي"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedDb(db);
                              setExportDialogOpen(true);
                            }}
                            title="تصدير"
                          >
                            <FileJson className="h-4 w-4" />
                          </Button>
                          {db.type !== 'main' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleFreeze(db.id, !db.is_frozen)}
                                title={db.is_frozen ? 'إلغاء التجميد' : 'تجميد'}
                              >
                                {db.is_frozen ? <Unlock className="h-4 w-4 text-green-500" /> : <Lock className="h-4 w-4 text-blue-500" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedDb(db);
                                  setDeleteDialogOpen(true);
                                }}
                                title="حذف"
                                className="text-red-500 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredDatabases.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        لا توجد قواعد بيانات مطابقة
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import/Export Tab */}
        <TabsContent value="import-export" className="space-y-6" data-testid="import-export-content">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload & Convert Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  تحويل قاعدة بيانات Access
                </CardTitle>
                <CardDescription>
                  قم بتحميل ملف قاعدة بيانات Access (.mdb, .accdb, .dblx) لتحويله إلى صيغة JSON
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    id="access-file-input"
                    accept=".mdb,.accdb,.dblx"
                    className="hidden"
                    onChange={(e) => handleConvertAccessDB(e.target.files?.[0])}
                    disabled={convertingFile}
                  />
                  <label 
                    htmlFor="access-file-input"
                    className="cursor-pointer flex flex-col items-center gap-3"
                  >
                    <div className="p-4 rounded-full bg-primary/10">
                      <CloudUpload className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">اختر ملف قاعدة البيانات</p>
                      <p className="text-sm text-muted-foreground">
                        الصيغ المدعومة: .mdb, .accdb, .dblx
                      </p>
                    </div>
                    {convertingFile && (
                      <div className="flex items-center gap-2 text-primary">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>جاري التحويل...</span>
                      </div>
                    )}
                  </label>
                </div>

                {/* Conversion Result */}
                {conversionResult && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 text-green-700">
                      <Check className="h-5 w-5" />
                      <span className="font-medium">تم التحويل بنجاح!</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>الفئات: <strong>{conversionResult.statistics?.categories || 0}</strong></div>
                      <div>المنتجات: <strong>{conversionResult.statistics?.products || 0}</strong></div>
                      <div>العملاء: <strong>{conversionResult.statistics?.customers || 0}</strong></div>
                      <div>الموردين: <strong>{conversionResult.statistics?.suppliers || 0}</strong></div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button 
                        size="sm" 
                        onClick={() => handleDownloadExport(conversionResult.compressed_filename)}
                      >
                        <Download className="h-4 w-4 me-2" />
                        تحميل ({conversionResult.compressed_size_mb} MB)
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Import to Tenant Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  استيراد إلى مشترك
                </CardTitle>
                <CardDescription>
                  اختر ملف تصدير وقم باستيراده إلى قاعدة بيانات مشترك معين
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>ملف التصدير</Label>
                  <Select value={selectedExportFile || ''} onValueChange={setSelectedExportFile}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر ملف التصدير" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableExports.map(exp => (
                        <SelectItem key={exp.filename} value={exp.filename}>
                          {exp.filename} ({exp.size_mb} MB)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>المشترك المستهدف</Label>
                  <Select value={selectedImportTenant} onValueChange={setSelectedImportTenant}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر المشترك" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.filter(t => t.is_active).map(tenant => (
                        <SelectItem key={tenant.id} value={tenant.id}>
                          {tenant.company_name || tenant.name} ({tenant.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <Label>مسح البيانات الموجودة</Label>
                    <p className="text-xs text-muted-foreground">
                      سيتم حذف جميع بيانات المشترك قبل الاستيراد
                    </p>
                  </div>
                  <Switch
                    checked={clearExistingData}
                    onCheckedChange={setClearExistingData}
                  />
                </div>

                <Button 
                  className="w-full" 
                  onClick={handleImportToTenant}
                  disabled={!selectedExportFile || !selectedImportTenant || importingData}
                >
                  {importingData ? (
                    <>
                      <RefreshCw className="h-4 w-4 me-2 animate-spin" />
                      جاري الاستيراد...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 me-2" />
                      استيراد البيانات
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Available Exports List */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">الملفات المتاحة للتحميل</CardTitle>
                <CardDescription>قائمة بجميع ملفات التصدير المتاحة</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchAvailableExports}>
                <RefreshCw className="h-4 w-4 me-2" />
                تحديث
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>اسم الملف</TableHead>
                    <TableHead className="text-center">الحجم</TableHead>
                    <TableHead className="text-center">تاريخ الإنشاء</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableExports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        لا توجد ملفات تصدير متاحة
                      </TableCell>
                    </TableRow>
                  ) : (
                    availableExports.map(exp => (
                      <TableRow key={exp.filename}>
                        <TableCell className="font-mono text-sm">{exp.filename}</TableCell>
                        <TableCell className="text-center">{exp.size_mb} MB</TableCell>
                        <TableCell className="text-center">{formatDate(exp.created_at)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDownloadExport(exp.filename)}
                              title="تحميل"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteExport(exp.filename)}
                              title="حذف"
                              className="text-red-500 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Import Logs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">سجل عمليات الاستيراد</CardTitle>
              <CardDescription>تتبع جميع عمليات الاستيراد السابقة</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المشترك</TableHead>
                    <TableHead>الملف</TableHead>
                    <TableHead className="text-center">الفئات</TableHead>
                    <TableHead className="text-center">المنتجات</TableHead>
                    <TableHead className="text-center">العملاء</TableHead>
                    <TableHead className="text-center">التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لا توجد عمليات استيراد سابقة
                      </TableCell>
                    </TableRow>
                  ) : (
                    importLogs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell>{log.tenant_name}</TableCell>
                        <TableCell className="font-mono text-sm">{log.filename}</TableCell>
                        <TableCell className="text-center">{log.statistics?.categories?.imported || 0}</TableCell>
                        <TableCell className="text-center">{log.statistics?.products?.imported || 0}</TableCell>
                        <TableCell className="text-center">{log.statistics?.customers?.imported || 0}</TableCell>
                        <TableCell className="text-center">{formatDate(log.imported_at)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backups Tab */}
        <TabsContent value="backups" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">النسخ الاحتياطية المحفوظة</h3>
            <Button size="sm" onClick={() => setScheduleDialogOpen(true)}>
              <Calendar className="h-4 w-4 me-2" />
              جدولة النسخ الاحتياطي
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>قاعدة البيانات</TableHead>
                    <TableHead>تاريخ النسخة</TableHead>
                    <TableHead className="text-center">الحجم</TableHead>
                    <TableHead className="text-center">النوع</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لا توجد نسخ احتياطية
                      </TableCell>
                    </TableRow>
                  ) : (
                    backups.map(backup => (
                      <TableRow key={backup.id}>
                        <TableCell className="font-medium">{backup.database_name}</TableCell>
                        <TableCell>{formatDate(backup.created_at)}</TableCell>
                        <TableCell className="text-center">{formatSize(backup.size_mb)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">
                            {backup.type === 'auto' ? 'تلقائي' : 'يدوي'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={backup.status === 'completed' ? 'default' : 'secondary'}>
                            {backup.status === 'completed' ? 'مكتمل' : 'قيد التنفيذ'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button variant="ghost" size="icon" title="تحميل">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="استعادة">
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="حذف" className="text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">سجل العمليات الأخيرة</CardTitle>
              <CardDescription>تتبع جميع العمليات على قواعد البيانات</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العملية</TableHead>
                    <TableHead>قاعدة البيانات</TableHead>
                    <TableHead>المنفذ</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead>التفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operationLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لا توجد عمليات مسجلة
                      </TableCell>
                    </TableRow>
                  ) : (
                    operationLogs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline">{log.operation}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{log.database_name}</TableCell>
                        <TableCell>{log.executed_by}</TableCell>
                        <TableCell>{formatDate(log.created_at)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                            {log.status === 'success' ? 'نجاح' : 'فشل'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {log.details}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Size Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  توزيع الحجم
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {databases.slice(0, 5).map(db => (
                  <div key={db.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{db.display_name}</span>
                      <span className="text-muted-foreground">{formatSize(db.size_mb)}</span>
                    </div>
                    <Progress value={(db.size_mb / stats.total_size) * 100} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Activity Report */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  تقرير النشاط
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                    <span className="text-sm">قواعد نشطة (آخر 7 أيام)</span>
                    <Badge className="bg-green-500">{stats.active_databases}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                    <span className="text-sm">قواعد خاملة (7-30 يوم)</span>
                    <Badge className="bg-yellow-500">{Math.floor(stats.inactive_databases / 2)}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                    <span className="text-sm">قواعد غير نشطة ({'>'}30 يوم)</span>
                    <Badge className="bg-red-500">{Math.ceil(stats.inactive_databases / 2)}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              تفاصيل قاعدة البيانات
            </DialogTitle>
            <DialogDescription>{selectedDb?.name}</DialogDescription>
          </DialogHeader>
          {selectedDb && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">الاسم المعروض</Label>
                  <p className="font-medium">{selectedDb.display_name}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">النوع</Label>
                  <TypeBadge type={selectedDb.type} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">المالك</Label>
                  <p>{selectedDb.owner_name}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">البريد</Label>
                  <p>{selectedDb.owner_email || 'غير محدد'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">الحجم</Label>
                  <p className="font-medium">{formatSize(selectedDb.size_mb)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">عدد الجداول</Label>
                  <p>{selectedDb.collections_count}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">عدد السجلات</Label>
                  <p>{selectedDb.documents_count?.toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">الحالة</Label>
                  <HealthBadge status={selectedDb.status} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">تاريخ الإنشاء</Label>
                  <p>{formatDate(selectedDb.created_at)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">آخر نشاط</Label>
                  <p>{formatDate(selectedDb.last_activity)}</p>
                </div>
              </div>
              
              {/* Quick Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button size="sm" variant="outline" onClick={() => {
                  setDetailsDialogOpen(false);
                  setBackupDialogOpen(true);
                }}>
                  <Download className="h-4 w-4 me-2" />
                  نسخ احتياطي
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  setDetailsDialogOpen(false);
                  setExportDialogOpen(true);
                }}>
                  <FileJson className="h-4 w-4 me-2" />
                  تصدير
                </Button>
                {selectedDb.type !== 'main' && (
                  <Button size="sm" variant="outline" className="text-red-500" onClick={() => {
                    setDetailsDialogOpen(false);
                    setDeleteDialogOpen(true);
                  }}>
                    <Trash2 className="h-4 w-4 me-2" />
                    حذف
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Backup Dialog */}
      <Dialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إنشاء نسخة احتياطية</DialogTitle>
            <DialogDescription>
              {selectedDb?.display_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label>تضمين الملفات المرفقة</Label>
              <Switch
                checked={backupOptions.include_files}
                onCheckedChange={(v) => setBackupOptions({...backupOptions, include_files: v})}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>ضغط النسخة</Label>
              <Switch
                checked={backupOptions.compress}
                onCheckedChange={(v) => setBackupOptions({...backupOptions, compress: v})}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>تشفير النسخة</Label>
              <Switch
                checked={backupOptions.encrypt}
                onCheckedChange={(v) => setBackupOptions({...backupOptions, encrypt: v})}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>إرسال بالبريد</Label>
              <Switch
                checked={backupOptions.send_email}
                onCheckedChange={(v) => setBackupOptions({...backupOptions, send_email: v})}
              />
            </div>
            {backupOptions.send_email && (
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={backupOptions.email}
                  onChange={(e) => setBackupOptions({...backupOptions, email: e.target.value})}
                  placeholder="example@email.com"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackupDialogOpen(false)}>إلغاء</Button>
            <Button onClick={() => handleBackup(selectedDb?.id)}>
              <Download className="h-4 w-4 me-2" />
              إنشاء النسخة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تصدير قاعدة البيانات</DialogTitle>
            <DialogDescription>{selectedDb?.display_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>صيغة التصدير</Label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV (Excel)</SelectItem>
                  <SelectItem value="sql">SQL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>إلغاء</Button>
            <Button onClick={() => handleExport(selectedDb?.id)}>
              <FileJson className="h-4 w-4 me-2" />
              تصدير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              حذف قاعدة البيانات
            </DialogTitle>
            <DialogDescription>
              هذا الإجراء لا يمكن التراجع عنه. سيتم حذف جميع البيانات نهائياً.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">
                <strong>تحذير:</strong> أنت على وشك حذف قاعدة البيانات "{selectedDb?.display_name}" 
                ({formatSize(selectedDb?.size_mb || 0)})
              </p>
            </div>
            <div className="space-y-2">
              <Label>اكتب DELETE للتأكيد</Label>
              <Input
                value={deleteConfirmCode}
                onChange={(e) => setDeleteConfirmCode(e.target.value)}
                placeholder="DELETE"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDeleteDialogOpen(false);
              setDeleteConfirmCode('');
            }}>إلغاء</Button>
            <Button 
              variant="destructive" 
              onClick={() => handleDelete(selectedDb?.id)}
              disabled={deleteConfirmCode !== 'DELETE'}
            >
              <Trash2 className="h-4 w-4 me-2" />
              حذف نهائياً
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>جدولة النسخ الاحتياطي</DialogTitle>
            <DialogDescription>إعداد النسخ الاحتياطي التلقائي لجميع قواعد البيانات</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label>تفعيل الجدولة</Label>
              <Switch
                checked={scheduleForm.enabled}
                onCheckedChange={(v) => setScheduleForm({...scheduleForm, enabled: v})}
              />
            </div>
            <div className="space-y-2">
              <Label>التكرار</Label>
              <Select value={scheduleForm.frequency} onValueChange={(v) => setScheduleForm({...scheduleForm, frequency: v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">يومياً</SelectItem>
                  <SelectItem value="weekly">أسبوعياً</SelectItem>
                  <SelectItem value="monthly">شهرياً</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>وقت التنفيذ</Label>
              <Input
                type="time"
                value={scheduleForm.time}
                onChange={(e) => setScheduleForm({...scheduleForm, time: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>الاحتفاظ بالنسخ (أيام)</Label>
              <Input
                type="number"
                value={scheduleForm.retention_days}
                onChange={(e) => setScheduleForm({...scheduleForm, retention_days: parseInt(e.target.value)})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveSchedule}>حفظ الجدولة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إعدادات إدارة قواعد البيانات</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>حد التخزين الافتراضي لكل مشترك (MB)</Label>
              <Input type="number" defaultValue={500} />
            </div>
            <div className="space-y-2">
              <Label>تنبيه عند الوصول لنسبة من الحد (%)</Label>
              <Input type="number" defaultValue={80} />
            </div>
            <div className="flex items-center justify-between">
              <Label>إنشاء قاعدة بيانات تلقائياً للمشتركين الجدد</Label>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label>إرسال تنبيهات بالبريد</Label>
              <Switch defaultChecked />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>إلغاء</Button>
            <Button>حفظ الإعدادات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DatabaseManager;
