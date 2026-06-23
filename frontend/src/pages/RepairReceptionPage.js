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
import { toast } from 'sonner';
import {
  Smartphone,
  User,
  Phone,
  FileText,
  Camera,
  Printer,
  Save,
  Hash,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Wrench
} from 'lucide-react';

// Phone brands
const PHONE_BRANDS = [
  'Apple', 'Samsung', 'Huawei', 'Xiaomi', 'Oppo', 'Vivo', 'Realme', 
  'OnePlus', 'Google', 'Sony', 'LG', 'Nokia', 'Motorola', 'Tecno', 
  'Infinix', 'Itel', 'Honor', 'أخرى'
];

// Common problems
const COMMON_PROBLEMS = [
  { id: 'screen_broken', label: { ar: 'شاشة مكسورة', fr: 'Écran cassé' } },
  { id: 'screen_display', label: { ar: 'مشكلة في العرض', fr: 'Problème d\'affichage' } },
  { id: 'battery', label: { ar: 'مشكلة في البطارية', fr: 'Problème de batterie' } },
  { id: 'charging', label: { ar: 'مشكلة في الشحن', fr: 'Problème de charge' } },
  { id: 'speaker', label: { ar: 'مشكلة في السماعة', fr: 'Problème de haut-parleur' } },
  { id: 'microphone', label: { ar: 'مشكلة في الميكروفون', fr: 'Problème de microphone' } },
  { id: 'camera', label: { ar: 'مشكلة في الكاميرا', fr: 'Problème de caméra' } },
  { id: 'wifi', label: { ar: 'مشكلة في الواي فاي', fr: 'Problème de WiFi' } },
  { id: 'bluetooth', label: { ar: 'مشكلة في البلوتوث', fr: 'Problème de Bluetooth' } },
  { id: 'software', label: { ar: 'مشكلة برمجية', fr: 'Problème logiciel' } },
  { id: 'water_damage', label: { ar: 'تلف بالماء', fr: 'Dégât des eaux' } },
  { id: 'buttons', label: { ar: 'مشكلة في الأزرار', fr: 'Problème de boutons' } },
  { id: 'other', label: { ar: 'أخرى', fr: 'Autre' } },
];

// Device colors
const DEVICE_COLORS = [
  { id: 'black', label: { ar: 'أسود', fr: 'Noir' } },
  { id: 'white', label: { ar: 'أبيض', fr: 'Blanc' } },
  { id: 'gold', label: { ar: 'ذهبي', fr: 'Or' } },
  { id: 'silver', label: { ar: 'فضي', fr: 'Argent' } },
  { id: 'blue', label: { ar: 'أزرق', fr: 'Bleu' } },
  { id: 'red', label: { ar: 'أحمر', fr: 'Rouge' } },
  { id: 'green', label: { ar: 'أخضر', fr: 'Vert' } },
  { id: 'purple', label: { ar: 'بنفسجي', fr: 'Violet' } },
  { id: 'other', label: { ar: 'آخر', fr: 'Autre' } },
];

export default function RepairReceptionPage() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdTicket, setCreatedTicket] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(true);

  const [formData, setFormData] = useState({
    // Customer info
    customer_name: '',
    customer_phone: '',
    customer_phone2: '',
    // Device info
    device_brand: '',
    device_model: '',
    device_color: '',
    device_imei: '',
    device_password: '',
    // Problem info
    problems: [],
    problem_description: '',
    device_condition: '',
    accessories: '',
    // Cost & Time
    estimated_cost: '',
    estimated_days: '',
    advance_payment: '',
    // Notes
    technician_notes: '',
  });

  useEffect(() => {
    fetchCustomers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCustomers = async () => {
    try {
      const response = await apiClient.get(`/customers`);
      setCustomers(response.data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const generateTicketNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    return `REP-${year}${month}${day}-${random}`;
  };

  const handleProblemToggle = (problemId) => {
    setFormData(prev => ({
      ...prev,
      problems: prev.problems.includes(problemId)
        ? prev.problems.filter(p => p !== problemId)
        : [...prev.problems, problemId]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.customer_name || !formData.customer_phone) {
      toast.error(language === 'ar' ? 'يرجى إدخال اسم العميل ورقم الهاتف' : 'Veuillez entrer le nom et téléphone du client');
      return;
    }

    if (!formData.device_brand || !formData.device_model) {
      toast.error(language === 'ar' ? 'يرجى إدخال ماركة وموديل الجهاز' : 'Veuillez entrer la marque et le modèle');
      return;
    }

    if (formData.problems.length === 0 && !formData.problem_description) {
      toast.error(language === 'ar' ? 'يرجى تحديد المشكلة أو وصفها' : 'Veuillez sélectionner ou décrire le problème');
      return;
    }

    setLoading(true);
    try {
      const ticketNumber = generateTicketNumber();
      const ticketData = {
        ticket_number: ticketNumber,
        ...formData,
        status: 'received',
        created_at: new Date().toISOString(),
        estimated_cost: parseFloat(formData.estimated_cost) || 0,
        advance_payment: parseFloat(formData.advance_payment) || 0,
        estimated_days: parseInt(formData.estimated_days) || 0,
      };

      const response = await apiClient.post(`/repairs`, ticketData);
      setCreatedTicket({ ...ticketData, id: response.data?.id || ticketNumber });
      setShowSuccessDialog(true);
      
      // Reset form
      setFormData({
        customer_name: '',
        customer_phone: '',
        customer_phone2: '',
        device_brand: '',
        device_model: '',
        device_color: '',
        device_imei: '',
        device_password: '',
        problems: [],
        problem_description: '',
        device_condition: '',
        accessories: '',
        estimated_cost: '',
        estimated_days: '',
        advance_payment: '',
        technician_notes: '',
      });

      toast.success(language === 'ar' ? 'تم إنشاء طلب الصيانة بنجاح' : 'Demande de réparation créée');
    } catch (error) {
      console.error('Error creating repair:', error);
      toast.error(language === 'ar' ? 'فشل في إنشاء طلب الصيانة' : 'Échec de création de la demande');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCustomerSelect = (customerId) => {
    setSelectedCustomerId(customerId);
    if (customerId === 'new') {
      setIsNewCustomer(true);
      setFormData(prev => ({ ...prev, customer_name: '', customer_phone: '', customer_phone2: '' }));
    } else {
      setIsNewCustomer(false);
      const customer = customers.find(c => c.id === customerId);
      if (customer) {
        setFormData(prev => ({
          ...prev,
          customer_name: customer.name || '',
          customer_phone: customer.phone || '',
          customer_phone2: customer.phone2 || '',
        }));
      }
    }
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="repair-reception-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <Wrench className="h-8 w-8 text-orange-500" />
              </div>
              {language === 'ar' ? 'استقبال جهاز للصيانة' : 'Réception pour réparation'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'تسجيل جهاز جديد للصيانة' : 'Enregistrer un nouveau appareil pour réparation'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Customer Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5 text-blue-500" />
                  {language === 'ar' ? 'معلومات العميل' : 'Informations client'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {customers.length > 0 && (
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'اختر عميل موجود أو أضف جديد' : 'Choisir un client existant ou ajouter'}</Label>
                    <Select value={selectedCustomerId} onValueChange={handleCustomerSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder={language === 'ar' ? 'اختر عميل...' : 'Choisir un client...'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">{language === 'ar' ? '➕ عميل جديد' : '➕ Nouveau client'}</SelectItem>
                        {customers.map(customer => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name} - {customer.phone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {language === 'ar' ? 'اسم العميل' : 'Nom du client'} *
                  </Label>
                  <Input
                    value={formData.customer_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                    placeholder={language === 'ar' ? 'الاسم الكامل' : 'Nom complet'}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {language === 'ar' ? 'رقم الهاتف' : 'Téléphone'} *
                  </Label>
                  <Input
                    value={formData.customer_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_phone: e.target.value }))}
                    placeholder="0XXX XXX XXX"
                    dir="ltr"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {language === 'ar' ? 'رقم هاتف ثاني (اختياري)' : 'Téléphone secondaire'}
                  </Label>
                  <Input
                    value={formData.customer_phone2}
                    onChange={(e) => setFormData(prev => ({ ...prev, customer_phone2: e.target.value }))}
                    placeholder="0XXX XXX XXX"
                    dir="ltr"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Device Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Smartphone className="h-5 w-5 text-purple-500" />
                  {language === 'ar' ? 'معلومات الجهاز' : 'Informations appareil'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'الماركة' : 'Marque'} *</Label>
                    <Select 
                      value={formData.device_brand} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, device_brand: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={language === 'ar' ? 'اختر...' : 'Choisir...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {PHONE_BRANDS.map(brand => (
                          <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'الموديل' : 'Modèle'} *</Label>
                    <Input
                      value={formData.device_model}
                      onChange={(e) => setFormData(prev => ({ ...prev, device_model: e.target.value }))}
                      placeholder={language === 'ar' ? 'مثال: iPhone 14 Pro' : 'Ex: iPhone 14 Pro'}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'اللون' : 'Couleur'}</Label>
                    <Select 
                      value={formData.device_color} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, device_color: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={language === 'ar' ? 'اختر...' : 'Choisir...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {DEVICE_COLORS.map(color => (
                          <SelectItem key={color.id} value={color.id}>
                            {language === 'ar' ? color.label.ar : color.label.fr}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>IMEI</Label>
                    <Input
                      value={formData.device_imei}
                      onChange={(e) => setFormData(prev => ({ ...prev, device_imei: e.target.value }))}
                      placeholder="IMEI"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'كلمة مرور الجهاز (اختياري)' : 'Mot de passe (optionnel)'}</Label>
                  <Input
                    value={formData.device_password}
                    onChange={(e) => setFormData(prev => ({ ...prev, device_password: e.target.value }))}
                    placeholder="****"
                    type="password"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === 'ar' ? 'قد نحتاجها للفحص والاختبار' : 'Peut être nécessaire pour les tests'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'الملحقات المستلمة' : 'Accessoires reçus'}</Label>
                  <Input
                    value={formData.accessories}
                    onChange={(e) => setFormData(prev => ({ ...prev, accessories: e.target.value }))}
                    placeholder={language === 'ar' ? 'شاحن، غطاء، سماعات...' : 'Chargeur, coque, écouteurs...'}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'حالة الجهاز الخارجية' : 'État externe de l\'appareil'}</Label>
                  <Textarea
                    value={formData.device_condition}
                    onChange={(e) => setFormData(prev => ({ ...prev, device_condition: e.target.value }))}
                    placeholder={language === 'ar' ? 'خدوش، كسور، ملاحظات...' : 'Rayures, fissures, remarques...'}
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Problem & Cost */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  {language === 'ar' ? 'المشكلة والتكلفة' : 'Problème et coût'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'نوع المشكلة' : 'Type de problème'} *</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border rounded-lg">
                    {COMMON_PROBLEMS.map(problem => (
                      <Button
                        key={problem.id}
                        type="button"
                        variant={formData.problems.includes(problem.id) ? 'default' : 'outline'}
                        size="sm"
                        className="justify-start text-xs h-8"
                        onClick={() => handleProblemToggle(problem.id)}
                      >
                        {language === 'ar' ? problem.label.ar : problem.label.fr}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'وصف المشكلة' : 'Description du problème'}</Label>
                  <Textarea
                    value={formData.problem_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, problem_description: e.target.value }))}
                    placeholder={language === 'ar' ? 'وصف تفصيلي للمشكلة...' : 'Description détaillée...'}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4" />
                      {language === 'ar' ? 'التكلفة المقدرة' : 'Coût estimé'}
                    </Label>
                    <Input
                      type="number"
                      value={formData.estimated_cost}
                      onChange={(e) => setFormData(prev => ({ ...prev, estimated_cost: e.target.value }))}
                      placeholder="0"
                      min="0"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {language === 'ar' ? 'المدة المقدرة (أيام)' : 'Durée estimée (jours)'}
                    </Label>
                    <Input
                      type="number"
                      value={formData.estimated_days}
                      onChange={(e) => setFormData(prev => ({ ...prev, estimated_days: e.target.value }))}
                      placeholder="0"
                      min="0"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    {language === 'ar' ? 'الدفعة المقدمة' : 'Avance'}
                  </Label>
                  <Input
                    type="number"
                    value={formData.advance_payment}
                    onChange={(e) => setFormData(prev => ({ ...prev, advance_payment: e.target.value }))}
                    placeholder="0"
                    min="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{language === 'ar' ? 'ملاحظات الفني' : 'Notes du technicien'}</Label>
                  <Textarea
                    value={formData.technician_notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, technician_notes: e.target.value }))}
                    placeholder={language === 'ar' ? 'ملاحظات داخلية...' : 'Notes internes...'}
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3 mt-6">
            <Button type="submit" size="lg" disabled={loading} className="min-w-[200px]">
              {loading ? (
                <span className="animate-spin me-2">⏳</span>
              ) : (
                <Save className="h-5 w-5 me-2" />
              )}
              {language === 'ar' ? 'حفظ وإنشاء التذكرة' : 'Enregistrer et créer le ticket'}
            </Button>
          </div>
        </form>

        {/* Success Dialog */}
        <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
                {language === 'ar' ? 'تم إنشاء التذكرة بنجاح' : 'Ticket créé avec succès'}
              </DialogTitle>
            </DialogHeader>
            {createdTicket && (
              <div className="space-y-4 py-4">
                <div className="p-4 bg-muted rounded-lg text-center">
                  <p className="text-sm text-muted-foreground mb-1">
                    {language === 'ar' ? 'رقم التذكرة' : 'Numéro du ticket'}
                  </p>
                  <p className="text-3xl font-bold font-mono text-primary">
                    {createdTicket.ticket_number}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{language === 'ar' ? 'العميل' : 'Client'}</p>
                    <p className="font-medium">{createdTicket.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{language === 'ar' ? 'الجهاز' : 'Appareil'}</p>
                    <p className="font-medium">{createdTicket.device_brand} {createdTicket.device_model}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{language === 'ar' ? 'التكلفة المقدرة' : 'Coût estimé'}</p>
                    <p className="font-medium">{createdTicket.estimated_cost} دج</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{language === 'ar' ? 'المدة المقدرة' : 'Durée estimée'}</p>
                    <p className="font-medium">{createdTicket.estimated_days} {language === 'ar' ? 'أيام' : 'jours'}</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowSuccessDialog(false)}>
                {language === 'ar' ? 'إغلاق' : 'Fermer'}
              </Button>
              <Button onClick={handlePrint}>
                <Printer className="h-4 w-4 me-2" />
                {language === 'ar' ? 'طباعة الإيصال' : 'Imprimer le reçu'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
