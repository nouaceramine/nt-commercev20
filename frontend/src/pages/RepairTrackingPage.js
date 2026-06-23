import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
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
import { toast } from 'sonner';
import {
  Wrench,
  Search,
  Filter,
  Eye,
  Edit,
  Phone,
  MessageSquare,
  MessageCircle,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Smartphone,
  User,
  Calendar,
  DollarSign,
  ArrowRight,
  RefreshCw,
  Printer,
  Package
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Repair statuses
const REPAIR_STATUSES = [
  { id: 'received', label: { ar: 'مستلم', fr: 'Reçu' }, color: 'bg-blue-500', icon: Package },
  { id: 'diagnosing', label: { ar: 'قيد الفحص', fr: 'En diagnostic' }, color: 'bg-purple-500', icon: Search },
  { id: 'waiting_parts', label: { ar: 'بانتظار القطع', fr: 'En attente pièces' }, color: 'bg-orange-500', icon: Clock },
  { id: 'in_repair', label: { ar: 'قيد الإصلاح', fr: 'En réparation' }, color: 'bg-amber-500', icon: Wrench },
  { id: 'testing', label: { ar: 'قيد الاختبار', fr: 'En test' }, color: 'bg-cyan-500', icon: RefreshCw },
  { id: 'ready', label: { ar: 'جاهز للتسليم', fr: 'Prêt' }, color: 'bg-emerald-500', icon: CheckCircle2 },
  { id: 'delivered', label: { ar: 'تم التسليم', fr: 'Livré' }, color: 'bg-gray-500', icon: CheckCircle2 },
  { id: 'cancelled', label: { ar: 'ملغي', fr: 'Annulé' }, color: 'bg-red-500', icon: XCircle },
];

// Sample repairs data
const SAMPLE_REPAIRS = [
  {
    id: '1',
    ticket_number: 'REP-260207-0001',
    customer_name: 'أحمد محمد',
    customer_phone: '0612345678',
    device_brand: 'Samsung',
    device_model: 'Galaxy S23',
    device_color: 'black',
    problems: ['screen_broken'],
    problem_description: 'شاشة مكسورة من السقوط',
    status: 'in_repair',
    technician: 'محمد الفني',
    estimated_cost: 15000,
    actual_cost: 14500,
    advance_payment: 5000,
    estimated_days: 2,
    created_at: '2026-02-07T09:00:00',
    updated_at: '2026-02-07T14:30:00',
  },
  {
    id: '2',
    ticket_number: 'REP-260207-0002',
    customer_name: 'سارة علي',
    customer_phone: '0712345678',
    device_brand: 'Apple',
    device_model: 'iPhone 14 Pro',
    device_color: 'gold',
    problems: ['battery', 'charging'],
    problem_description: 'البطارية لا تشحن بشكل صحيح',
    status: 'ready',
    technician: 'علي التقني',
    estimated_cost: 8000,
    actual_cost: 8000,
    advance_payment: 3000,
    estimated_days: 1,
    created_at: '2026-02-06T11:00:00',
    updated_at: '2026-02-07T10:00:00',
  },
  {
    id: '3',
    ticket_number: 'REP-260206-0003',
    customer_name: 'خالد أحمد',
    customer_phone: '0512345678',
    device_brand: 'Xiaomi',
    device_model: 'Redmi Note 12',
    device_color: 'blue',
    problems: ['software'],
    problem_description: 'الهاتف لا يشتغل بعد التحديث',
    status: 'diagnosing',
    technician: '',
    estimated_cost: 3000,
    actual_cost: 0,
    advance_payment: 1000,
    estimated_days: 1,
    created_at: '2026-02-06T15:00:00',
    updated_at: '2026-02-06T15:00:00',
  },
  {
    id: '4',
    ticket_number: 'REP-260205-0004',
    customer_name: 'فاطمة سعيد',
    customer_phone: '0698765432',
    device_brand: 'Huawei',
    device_model: 'P50 Pro',
    device_color: 'white',
    problems: ['camera'],
    problem_description: 'الكاميرا الخلفية لا تعمل',
    status: 'waiting_parts',
    technician: 'محمد الفني',
    estimated_cost: 12000,
    actual_cost: 0,
    advance_payment: 4000,
    estimated_days: 5,
    created_at: '2026-02-05T10:00:00',
    updated_at: '2026-02-06T09:00:00',
  },
];

export default function RepairTrackingPage() {
  const { language } = useLanguage();
  const [repairs, setRepairs] = useState([]);
  const [filteredRepairs, setFilteredRepairs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRepair, setSelectedRepair] = useState(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [updateForm, setUpdateForm] = useState({ status: '', notes: '', actual_cost: '', spare_parts: [] });
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, inProgress: 0, ready: 0, delivered: 0 });
  
  // Spare parts search
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  // Fetch repairs from API
  const fetchRepairs = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/repairs`);
      setRepairs(response.data || []);
    } catch (error) {
      console.error('Error fetching repairs:', error);
      toast.error(language === 'ar' ? 'فشل في تحميل البيانات' : 'Échec du chargement');
    } finally {
      setLoading(false);
    }
  };

  // Fetch stats from API
  const fetchStats = async () => {
    try {
      const response = await apiClient.get(`/repairs/stats`);
      const data = response.data;
      setStats({
        total: data.total || 0,
        inProgress: (data.received || 0) + (data.diagnosing || 0) + (data.in_progress || 0) + (data.waiting_parts || 0),
        ready: data.completed || 0,
        delivered: data.delivered || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchRepairs();
    fetchStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    filterRepairs();
  }, [searchQuery, statusFilter, repairs]);

  // Search products for spare parts
  const searchProducts = async (query) => {
    try {
      setSearchingProducts(true);
      const url = query 
        ? `/products?search=${encodeURIComponent(query)}`
        : `/products?limit=10`;
      const response = await apiClient.get(url);
      setProductResults(response.data?.slice(0, 10) || []);
    } catch (error) {
      console.error('Error searching products:', error);
    } finally {
      setSearchingProducts(false);
    }
  };

  // Add spare part to form
  const addSparePart = (product) => {
    const existingPart = updateForm.spare_parts.find(p => p.id === product.id);
    if (existingPart) {
      setUpdateForm(prev => ({
        ...prev,
        spare_parts: prev.spare_parts.map(p => 
          p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p
        )
      }));
    } else {
      setUpdateForm(prev => ({
        ...prev,
        spare_parts: [...prev.spare_parts, {
          id: product.id,
          name: product.name_ar || product.name_en || product.name,
          price: product.retail_price || product.purchase_price || 0,
          quantity: 1
        }]
      }));
    }
    setProductSearch('');
    setProductResults([]);
  };

  // Remove spare part
  const removeSparePart = (productId) => {
    setUpdateForm(prev => ({
      ...prev,
      spare_parts: prev.spare_parts.filter(p => p.id !== productId)
    }));
  };

  // Update spare part quantity
  const updateSparePartQty = (productId, qty) => {
    if (qty < 1) return;
    setUpdateForm(prev => ({
      ...prev,
      spare_parts: prev.spare_parts.map(p => 
        p.id === productId ? { ...p, quantity: qty } : p
      )
    }));
  };

  const filterRepairs = () => {
    let filtered = [...repairs];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        r.ticket_number.toLowerCase().includes(query) ||
        r.customer_name.toLowerCase().includes(query) ||
        r.customer_phone.includes(query) ||
        r.device_brand.toLowerCase().includes(query) ||
        r.device_model.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    setFilteredRepairs(filtered);
  };

  const getStatusInfo = (statusId) => {
    return REPAIR_STATUSES.find(s => s.id === statusId) || REPAIR_STATUSES[0];
  };

  const handleViewDetails = (repair) => {
    setSelectedRepair(repair);
    setShowDetailsDialog(true);
  };

  const handleOpenUpdate = (repair) => {
    setSelectedRepair(repair);
    setUpdateForm({
      status: repair.status,
      notes: '',
      actual_cost: repair.actual_cost?.toString() || '',
      spare_parts: repair.spare_parts || []
    });
    setProductSearch('');
    setProductResults([]);
    setShowUpdateDialog(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedRepair) return;

    try {
      // Call API to update repair status
      await apiClient.put(`/repairs/${selectedRepair.id}`, {
        status: updateForm.status,
        final_cost: parseFloat(updateForm.actual_cost) || selectedRepair.estimated_cost,
        spare_parts: updateForm.spare_parts,
        notes: updateForm.notes
      });

      // Try to send WhatsApp notification (silent fail if not configured)
      try {
        await apiClient.post(`/whatsapp/notify-repair/${selectedRepair.id}`);
      } catch (e) {
      }

      // Refresh data
      await fetchRepairs();
      await fetchStats();

      toast.success(language === 'ar' ? 'تم تحديث الحالة بنجاح' : 'Statut mis à jour');
      setShowUpdateDialog(false);
    } catch (error) {
      console.error('Error updating repair:', error);
      toast.error(language === 'ar' ? 'فشل في تحديث الحالة' : 'Échec de mise à jour');
    }
  };

  // Send WhatsApp notification manually
  const sendWhatsAppNotification = async (repairId) => {
    try {
      const result = await apiClient.post(`/whatsapp/notify-repair/${repairId}`);
      if (result.data.success) {
        toast.success(language === 'ar' ? 'تم إرسال إشعار WhatsApp' : 'Notification WhatsApp envoyée');
      } else {
        toast.error(result.data.message || (language === 'ar' ? 'فشل في الإرسال' : 'Échec d\'envoi'));
      }
    } catch (error) {
      const msg = error.response?.data?.detail || (language === 'ar' ? 'WhatsApp غير مفعل' : 'WhatsApp non configuré');
      toast.error(msg);
    }
  };

  // Print repair receipt
  const printRepairReceipt = (repair) => {
    const statusInfo = getStatusInfo(repair.status);
    const printWindow = window.open('', '_blank');
    
    const receiptHTML = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>إيصال الصيانة - ${repair.ticket_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; max-width: 80mm; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 15px; margin-bottom: 15px; }
          .logo { font-size: 24px; font-weight: bold; color: #3b82f6; }
          .title { font-size: 14px; margin-top: 5px; }
          .ticket-number { font-size: 20px; font-weight: bold; background: #f3f4f6; padding: 10px; text-align: center; margin: 15px 0; border-radius: 8px; }
          .section { margin-bottom: 15px; }
          .section-title { font-size: 12px; font-weight: bold; color: #6b7280; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
          .row { display: flex; justify-content: space-between; font-size: 12px; margin: 5px 0; }
          .row .label { color: #6b7280; }
          .row .value { font-weight: 600; }
          .device-info { background: #f9fafb; padding: 10px; border-radius: 8px; margin: 10px 0; }
          .status { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; margin: 10px 0; }
          .status-received { background: #dbeafe; color: #1d4ed8; }
          .status-in_progress { background: #fef3c7; color: #d97706; }
          .status-completed { background: #dcfce7; color: #16a34a; }
          .costs { background: #fef2f2; padding: 10px; border-radius: 8px; margin: 15px 0; }
          .total-row { font-size: 16px; font-weight: bold; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #000; }
          .footer { text-align: center; font-size: 10px; color: #6b7280; margin-top: 20px; padding-top: 15px; border-top: 2px dashed #000; }
          .qr-placeholder { width: 80px; height: 80px; border: 1px solid #ccc; margin: 10px auto; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">NT</div>
          <div class="title">إيصال استلام جهاز للصيانة</div>
        </div>
        
        <div class="ticket-number">
          ${repair.ticket_number}
        </div>
        
        <div class="section">
          <div class="section-title">معلومات العميل</div>
          <div class="row"><span class="label">الاسم:</span><span class="value">${repair.customer_name}</span></div>
          <div class="row"><span class="label">الهاتف:</span><span class="value">${repair.customer_phone}</span></div>
          ${repair.customer_phone2 ? `<div class="row"><span class="label">هاتف 2:</span><span class="value">${repair.customer_phone2}</span></div>` : ''}
        </div>
        
        <div class="section">
          <div class="section-title">معلومات الجهاز</div>
          <div class="device-info">
            <div class="row"><span class="label">الماركة:</span><span class="value">${repair.device_brand}</span></div>
            <div class="row"><span class="label">الموديل:</span><span class="value">${repair.device_model}</span></div>
            ${repair.device_color ? `<div class="row"><span class="label">اللون:</span><span class="value">${repair.device_color}</span></div>` : ''}
            ${repair.device_imei ? `<div class="row"><span class="label">IMEI:</span><span class="value">${repair.device_imei}</span></div>` : ''}
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">المشكلة</div>
          <p style="font-size: 12px; line-height: 1.5;">${repair.problem_description || (repair.problems || []).join('، ') || 'غير محدد'}</p>
        </div>
        
        ${repair.device_condition ? `
        <div class="section">
          <div class="section-title">حالة الجهاز عند الاستلام</div>
          <p style="font-size: 11px; color: #666;">${repair.device_condition}</p>
        </div>
        ` : ''}
        
        ${repair.accessories ? `
        <div class="section">
          <div class="section-title">الملحقات المستلمة</div>
          <p style="font-size: 11px;">${repair.accessories}</p>
        </div>
        ` : ''}
        
        <div style="text-align: center;">
          <div class="status status-${repair.status}">${statusInfo?.label || repair.status}</div>
        </div>
        
        <div class="costs">
          <div class="section-title" style="color: #991b1b;">التكلفة والدفع</div>
          <div class="row"><span class="label">التكلفة المقدرة:</span><span class="value">${repair.estimated_cost || 0} دج</span></div>
          <div class="row"><span class="label">الدفعة المقدمة:</span><span class="value">${repair.advance_payment || 0} دج</span></div>
          ${repair.final_cost ? `<div class="row"><span class="label">التكلفة النهائية:</span><span class="value">${repair.final_cost} دج</span></div>` : ''}
          <div class="total-row">
            <div class="row"><span class="label">المتبقي:</span><span class="value">${(repair.final_cost || repair.estimated_cost || 0) - (repair.advance_payment || 0)} دج</span></div>
          </div>
        </div>
        
        <div class="section">
          <div class="row"><span class="label">المدة المتوقعة:</span><span class="value">${repair.estimated_days || 1} أيام</span></div>
          <div class="row"><span class="label">تاريخ الاستلام:</span><span class="value">${new Date(repair.created_at).toLocaleDateString('ar-DZ')}</span></div>
        </div>
        
        <div class="footer">
          <div class="qr-placeholder">${repair.ticket_number}</div>
          <p>شكراً لثقتكم بنا</p>
          <p style="margin-top: 5px;">يرجى الاحتفاظ بهذا الإيصال لاستلام الجهاز</p>
          <p style="margin-top: 10px; font-size: 9px;">NT POS System</p>
        </div>
        
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;
    
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="repair-tracking-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Wrench className="h-8 w-8 text-blue-500" />
              </div>
              {language === 'ar' ? 'تتبع الصيانة' : 'Suivi des réparations'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'إدارة ومتابعة طلبات الصيانة' : 'Gérer et suivre les demandes de réparation'}
            </p>
          </div>
          <Link to="/repairs/new">
            <Button>
              <Wrench className="h-4 w-4 me-2" />
              {language === 'ar' ? 'استقبال جهاز جديد' : 'Nouveau appareil'}
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-primary">{stats.total}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي الطلبات' : 'Total demandes'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-amber-500">{stats.inProgress}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'قيد العمل' : 'En cours'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-emerald-500">{stats.ready}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'جاهز للتسليم' : 'Prêts'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold text-gray-500">{stats.delivered}</p>
              <p className="text-sm text-muted-foreground">{language === 'ar' ? 'تم التسليم' : 'Livrés'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={language === 'ar' ? 'بحث برقم التذكرة، الاسم، الهاتف...' : 'Rechercher par ticket, nom, téléphone...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pe-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder={language === 'ar' ? 'الحالة' : 'Statut'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ar' ? 'جميع الحالات' : 'Tous les statuts'}</SelectItem>
                  {REPAIR_STATUSES.map(status => (
                    <SelectItem key={status.id} value={status.id}>
                      {language === 'ar' ? status.label.ar : status.label.fr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Repairs Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'رقم التذكرة' : 'N° Ticket'}</TableHead>
                  <TableHead>{language === 'ar' ? 'العميل' : 'Client'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الجهاز' : 'Appareil'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                  <TableHead>{language === 'ar' ? 'التكلفة' : 'Coût'}</TableHead>
                  <TableHead>{language === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                  <TableHead>{language === 'ar' ? 'إجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRepairs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Wrench className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>{language === 'ar' ? 'لا توجد طلبات صيانة' : 'Aucune demande de réparation'}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRepairs.map(repair => {
                    const statusInfo = getStatusInfo(repair.status);
                    const StatusIcon = statusInfo.icon;
                    return (
                      <TableRow key={repair.id}>
                        <TableCell className="font-mono font-bold">{repair.ticket_number}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{repair.customer_name}</p>
                            <p className="text-xs text-muted-foreground">{repair.customer_phone}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{repair.device_brand}</p>
                            <p className="text-xs text-muted-foreground">{repair.device_model}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${statusInfo.color} text-white`}>
                            <StatusIcon className="h-3 w-3 me-1" />
                            {language === 'ar' ? statusInfo.label.ar : statusInfo.label.fr}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-bold">{repair.estimated_cost} دج</p>
                            {repair.advance_payment > 0 && (
                              <p className="text-xs text-emerald-600">
                                {language === 'ar' ? 'مقدم' : 'Avance'}: {repair.advance_payment} دج
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(repair.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleViewDetails(repair)} title={language === 'ar' ? 'عرض التفاصيل' : 'Voir détails'}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenUpdate(repair)} title={language === 'ar' ? 'تحديث الحالة' : 'Mettre à jour'}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title={language === 'ar' ? 'اتصال' : 'Appeler'}>
                              <Phone className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => sendWhatsAppNotification(repair.id)}
                              title={language === 'ar' ? 'إرسال WhatsApp' : 'Envoyer WhatsApp'}
                              className="text-green-600 hover:text-green-700 hover:bg-green-100"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => printRepairReceipt(repair)}
                              title={language === 'ar' ? 'طباعة إيصال' : 'Imprimer reçu'}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                {language === 'ar' ? 'تفاصيل طلب الصيانة' : 'Détails de la réparation'}
              </DialogTitle>
            </DialogHeader>
            {selectedRepair && (
              <div className="space-y-4 py-4">
                <div className="p-4 bg-muted rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'رقم التذكرة' : 'N° Ticket'}</p>
                  <p className="text-2xl font-bold font-mono">{selectedRepair.ticket_number}</p>
                  <Badge className={`${getStatusInfo(selectedRepair.status).color} text-white mt-2`}>
                    {language === 'ar' ? getStatusInfo(selectedRepair.status).label.ar : getStatusInfo(selectedRepair.status).label.fr}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {language === 'ar' ? 'العميل' : 'Client'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-bold">{selectedRepair.customer_name}</p>
                      <p className="text-sm text-muted-foreground">{selectedRepair.customer_phone}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Smartphone className="h-4 w-4" />
                        {language === 'ar' ? 'الجهاز' : 'Appareil'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="font-bold">{selectedRepair.device_brand} {selectedRepair.device_model}</p>
                      <p className="text-sm text-muted-foreground">{selectedRepair.device_color}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      {language === 'ar' ? 'المشكلة' : 'Problème'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p>{selectedRepair.problem_description}</p>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">{language === 'ar' ? 'التكلفة المقدرة' : 'Coût estimé'}</p>
                      <p className="text-xl font-bold">{selectedRepair.estimated_cost} دج</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">{language === 'ar' ? 'المقدم' : 'Avance'}</p>
                      <p className="text-xl font-bold text-emerald-600">{selectedRepair.advance_payment} دج</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">{language === 'ar' ? 'المتبقي' : 'Reste'}</p>
                      <p className="text-xl font-bold text-red-500">{selectedRepair.estimated_cost - selectedRepair.advance_payment} دج</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                {language === 'ar' ? 'إغلاق' : 'Fermer'}
              </Button>
              <Button>
                <Printer className="h-4 w-4 me-2" />
                {language === 'ar' ? 'طباعة' : 'Imprimer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Update Status Dialog */}
        <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                {language === 'ar' ? 'تحديث حالة الصيانة' : 'Mettre à jour le statut'}
              </DialogTitle>
              <DialogDescription>
                {selectedRepair?.ticket_number}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'الحالة الجديدة' : 'Nouveau statut'}</Label>
                  <Select value={updateForm.status} onValueChange={(value) => setUpdateForm(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPAIR_STATUSES.map(status => (
                        <SelectItem key={status.id} value={status.id}>
                          {language === 'ar' ? status.label.ar : status.label.fr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'التكلفة الفعلية' : 'Coût réel'}</Label>
                  <Input
                    type="number"
                    value={updateForm.actual_cost}
                    onChange={(e) => setUpdateForm(prev => ({ ...prev, actual_cost: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Spare Parts Section */}
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'قطع الغيار المستخدمة' : 'Pièces de rechange'}</Label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pe-10"
                    placeholder={language === 'ar' ? 'ابحث عن منتج لإضافته...' : 'Rechercher un produit...'}
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      searchProducts(e.target.value);
                    }}
                    onFocus={() => searchProducts(productSearch)}
                  />
                </div>
                
                {/* Search Results Dropdown */}
                {productResults.length > 0 && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto bg-background shadow-lg">
                    {productResults.map(product => (
                      <div
                        key={product.id}
                        onClick={() => addSparePart(product)}
                        className="p-2 hover:bg-muted cursor-pointer flex justify-between items-center border-b last:border-b-0"
                      >
                        <span className="text-sm">{product.name_ar || product.name_en || product.name}</span>
                        <span className="text-sm text-muted-foreground">{product.retail_price || 0} {language === 'ar' ? 'دج' : 'DA'}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Selected Parts List */}
                {updateForm.spare_parts?.length > 0 && (
                  <div className="border rounded-lg p-2 space-y-2 mt-2">
                    {updateForm.spare_parts.map(part => (
                      <div key={part.id} className="flex items-center justify-between gap-2 bg-muted/50 p-2 rounded">
                        <span className="text-sm flex-1 truncate">{part.name}</span>
                        <div className="flex items-center gap-1">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => updateSparePartQty(part.id, part.quantity - 1)}
                          >-</Button>
                          <span className="w-8 text-center text-sm">{part.quantity}</span>
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="icon" 
                            className="h-6 w-6"
                            onClick={() => updateSparePartQty(part.id, part.quantity + 1)}
                          >+</Button>
                        </div>
                        <span className="text-sm font-medium w-20 text-left">{(part.price * part.quantity).toFixed(0)} {language === 'ar' ? 'دج' : 'DA'}</span>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeSparePart(part.id)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t font-medium">
                      <span>{language === 'ar' ? 'إجمالي القطع' : 'Total pièces'}</span>
                      <span>{updateForm.spare_parts.reduce((sum, p) => sum + (p.price * p.quantity), 0).toFixed(0)} {language === 'ar' ? 'دج' : 'DA'}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{language === 'ar' ? 'ملاحظات' : 'Notes'}</Label>
                <Textarea
                  value={updateForm.notes}
                  onChange={(e) => setUpdateForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder={language === 'ar' ? 'ملاحظات إضافية...' : 'Notes supplémentaires...'}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUpdateDialog(false)}>
                {language === 'ar' ? 'إلغاء' : 'Annuler'}
              </Button>
              <Button onClick={handleUpdateStatus}>
                <CheckCircle2 className="h-4 w-4 me-2" />
                {language === 'ar' ? 'تحديث' : 'Mettre à jour'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
