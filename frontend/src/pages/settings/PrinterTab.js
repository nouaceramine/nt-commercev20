import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import {
  Printer, Cable, Wifi, Monitor, Eye, RefreshCw, Save, FileText,
  Plus, Pencil, Trash2, Copy, Star, LayoutTemplate,
} from 'lucide-react';
import { PRINT_DOC_TYPES, DOC_LABELS, DEFAULT_DOC_OPTIONS } from '../../lib/printDocuments';

export default function PrinterTab({ initialPrinterSettings, initialReceiptSettings }) {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [printerSettings, setPrinterSettings] = useState(initialPrinterSettings || {
    enabled: false, type: 'thermal', connectionType: 'usb', name: '', ipAddress: '', port: '9100', paperWidth: '80', autoPrint: false, printCopies: 1
  });

  const [receiptSettings, setReceiptSettings] = useState(initialReceiptSettings || {
    auto_print: false, show_print_dialog: true, default_template_id: 'default_80mm', thermal_printer_size: '80mm', store_name: '', store_address: '', store_phone: '',
    templates: [
      { id: 'default_58mm', name: 'Thermal 58mm', name_ar: 'حراري 58 مم', width: '58mm', show_logo: false, show_header: true, show_footer: true, header_text: '', footer_text: 'شكراً لزيارتكم', font_size: 'small', is_default: false },
      { id: 'default_80mm', name: 'Thermal 80mm', name_ar: 'حراري 80 مم', width: '80mm', show_logo: true, show_header: true, show_footer: true, header_text: '', footer_text: 'شكراً لزيارتكم', font_size: 'normal', is_default: true },
      { id: 'default_a4', name: 'A4 Full Page', name_ar: 'صفحة A4 كاملة', width: 'A4', show_logo: true, show_header: true, show_footer: true, header_text: '', footer_text: 'شكراً لزيارتكم', font_size: 'normal', is_default: false }
    ]
  });
  const [savingReceipt, setSavingReceipt] = useState(false);

  // Custom templates state
  const [customTemplates, setCustomTemplates] = useState([]);
  const [loadingCustom, setLoadingCustom] = useState(false);

  useEffect(() => {
    fetchCustomTemplates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCustomTemplates = async () => {
    setLoadingCustom(true);
    try {
      const res = await apiClient.get('/printing/templates');
      setCustomTemplates((res.data || []).filter(t => t.is_custom));
    } catch (e) {
      // ignore
    } finally {
      setLoadingCustom(false);
    }
  };

  const deleteCustomTemplate = async (id) => {
    if (!window.confirm(language === 'ar' ? 'هل تريد حذف هذا القالب؟' : 'Supprimer ce modèle ?')) return;
    try {
      await apiClient.delete(`/printing/templates/${id}`);
      setCustomTemplates(prev => prev.filter(t => t.id !== id));
      toast.success(language === 'ar' ? 'تم حذف القالب' : 'Modèle supprimé');
    } catch {
      toast.error(language === 'ar' ? 'خطأ في الحذف' : 'Erreur de suppression');
    }
  };

  const duplicateCustomTemplate = async (id) => {
    try {
      const res = await apiClient.post(`/printing/templates/${id}/duplicate`);
      setCustomTemplates(prev => [...prev, res.data]);
      toast.success(language === 'ar' ? 'تم نسخ القالب' : 'Modèle dupliqué');
    } catch {
      toast.error(language === 'ar' ? 'خطأ في النسخ' : 'Erreur de duplication');
    }
  };

  const setDefaultCustomTemplate = async (tmpl) => {
    try {
      await apiClient.put(`/printing/templates/${tmpl.id}`, { ...tmpl, is_default: true });
      setCustomTemplates(prev => prev.map(t => ({ ...t, is_default: t.id === tmpl.id })));
      toast.success(language === 'ar' ? 'تم تعيين القالب الافتراضي' : 'Modèle par défaut défini');
    } catch {
      toast.error(language === 'ar' ? 'خطأ' : 'Erreur');
    }
  };

  const saveReceiptSettings = async () => {
    setSavingReceipt(true);
    try {
      await apiClient.post(`/settings/receipt`, receiptSettings);
      toast.success(language === 'ar' ? 'تم حفظ إعدادات الإيصال' : 'Paramètres reçu enregistrés');
    } catch (error) { toast.error(language === 'ar' ? 'خطأ' : 'Error'); }
    finally { setSavingReceipt(false); }
  };

  const docTypeLabel = (type) => {
    const labels = { sale: { ar: 'بيع', fr: 'Vente' }, purchase: { ar: 'شراء', fr: 'Achat' }, customer: { ar: 'زبون', fr: 'Client' }, product: { ar: 'منتج', fr: 'Produit' }, expense: { ar: 'مصروف', fr: 'Dépense' }, receipt: { ar: 'إيصال', fr: 'Reçu' } };
    return language === 'ar' ? (labels[type]?.ar || type) : (labels[type]?.fr || type);
  };

  return (
    <div className="space-y-6">
      {/* Printer Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" />{language === 'ar' ? 'إعدادات الطابعة' : "Paramètres de l'imprimante"}</CardTitle>
          <CardDescription>{language === 'ar' ? 'إعداد الطابعة لطباعة الفواتير والإيصالات' : "Configurer l'imprimante pour les factures et reçus"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10"><Printer className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="font-medium">{language === 'ar' ? 'تفعيل الطابعة' : "Activer l'imprimante"}</p>
                <p className="text-sm text-muted-foreground">{language === 'ar' ? 'طباعة الفواتير تلقائياً' : 'Impression automatique des factures'}</p>
              </div>
            </div>
            <Switch checked={printerSettings.enabled} onCheckedChange={(checked) => setPrinterSettings(prev => ({ ...prev, enabled: checked }))} data-testid="toggle-printer" />
          </div>

          {printerSettings.enabled && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{language === 'ar' ? 'نوع الطابعة' : "Type d'imprimante"}</Label>
                  <Select value={printerSettings.type} onValueChange={(v) => setPrinterSettings(prev => ({ ...prev, type: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="thermal">{language === 'ar' ? 'طابعة حرارية (إيصالات)' : 'Thermique (reçus)'}</SelectItem>
                      <SelectItem value="laser">{language === 'ar' ? 'طابعة ليزر' : 'Laser'}</SelectItem>
                      <SelectItem value="inkjet">{language === 'ar' ? 'طابعة حبر' : "Jet d'encre"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{language === 'ar' ? 'طريقة الاتصال' : 'Type de connexion'}</Label>
                  <Select value={printerSettings.connectionType} onValueChange={(v) => setPrinterSettings(prev => ({ ...prev, connectionType: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usb"><div className="flex items-center gap-2"><Cable className="h-4 w-4" />USB</div></SelectItem>
                      <SelectItem value="network"><div className="flex items-center gap-2"><Wifi className="h-4 w-4" />{language === 'ar' ? 'شبكة (IP)' : 'Réseau (IP)'}</div></SelectItem>
                      <SelectItem value="bluetooth"><div className="flex items-center gap-2"><Monitor className="h-4 w-4" />Bluetooth</div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {printerSettings.connectionType === 'usb' && (
                <div><Label>{language === 'ar' ? 'اسم الطابعة' : "Nom de l'imprimante"}</Label><Input value={printerSettings.name} onChange={(e) => setPrinterSettings(prev => ({ ...prev, name: e.target.value }))} placeholder={language === 'ar' ? 'مثال: POS-58' : 'Ex: POS-58'} className="mt-1" /></div>
              )}
              {printerSettings.connectionType === 'network' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>{language === 'ar' ? 'عنوان IP' : 'Adresse IP'}</Label><Input value={printerSettings.ipAddress} onChange={(e) => setPrinterSettings(prev => ({ ...prev, ipAddress: e.target.value }))} placeholder="192.168.1.100" className="mt-1" /></div>
                  <div><Label>{language === 'ar' ? 'المنفذ' : 'Port'}</Label><Input value={printerSettings.port} onChange={(e) => setPrinterSettings(prev => ({ ...prev, port: e.target.value }))} placeholder="9100" className="mt-1" /></div>
                </div>
              )}
              {printerSettings.type === 'thermal' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{language === 'ar' ? 'عرض الورق' : 'Largeur du papier'}</Label>
                    <Select value={printerSettings.paperWidth} onValueChange={(v) => setPrinterSettings(prev => ({ ...prev, paperWidth: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="58">58mm</SelectItem><SelectItem value="80">80mm</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label>{language === 'ar' ? 'عدد النسخ' : 'Nombre de copies'}</Label><Input type="number" min="1" max="5" value={printerSettings.printCopies} onChange={(e) => setPrinterSettings(prev => ({ ...prev, printCopies: parseInt(e.target.value) || 1 }))} className="mt-1" /></div>
                </div>
              )}
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium">{language === 'ar' ? 'طباعة تلقائية' : 'Impression automatique'}</p>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'طباعة الفاتورة تلقائياً بعد كل عملية بيع' : 'Imprimer automatiquement après chaque vente'}</p>
                </div>
                <Switch checked={printerSettings.autoPrint} onCheckedChange={(checked) => setPrinterSettings(prev => ({ ...prev, autoPrint: checked }))} />
              </div>
              <Button variant="outline" className="gap-2"><Printer className="h-4 w-4" />{language === 'ar' ? 'طباعة اختبارية' : "Test d'impression"}</Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Custom Templates Card ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><LayoutTemplate className="h-5 w-5 text-indigo-600" />{language === 'ar' ? 'القوالب المخصصة' : 'Modèles personnalisés'}</CardTitle>
              <CardDescription className="mt-1">{language === 'ar' ? 'أنشئ قوالب طباعة خاصة بك باستخدام المحرر المرئي' : 'Créez vos propres modèles avec l\'éditeur visuel'}</CardDescription>
            </div>
            <Button className="gap-2" onClick={() => navigate('/settings/printing/template-editor')} data-testid="new-template-btn">
              <Plus className="h-4 w-4" />
              {language === 'ar' ? 'قالب جديد' : 'Nouveau modèle'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingCustom ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 animate-spin me-2" />
              {language === 'ar' ? 'جاري التحميل…' : 'Chargement…'}
            </div>
          ) : customTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
              <LayoutTemplate className="h-12 w-12 opacity-25" />
              <p className="text-sm text-center">
                {language === 'ar'
                  ? 'لا توجد قوالب مخصصة بعد. انقر على "قالب جديد" لإنشاء أول قالب.'
                  : 'Aucun modèle personnalisé. Cliquez sur "Nouveau modèle" pour créer le premier.'}
              </p>
              <Button variant="outline" className="gap-2 mt-1" onClick={() => navigate('/settings/printing/template-editor')}>
                <Plus className="h-4 w-4" />
                {language === 'ar' ? 'إنشاء قالب' : 'Créer un modèle'}
              </Button>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'ar' ? 'الاسم' : 'Nom'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'نوع المستند' : 'Type doc'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'حجم الورق' : 'Papier'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'الكتل' : 'Blocs'}</TableHead>
                    <TableHead className="text-center">{language === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customTemplates.map(tmpl => (
                    <TableRow key={tmpl.id} className={tmpl.is_default ? 'bg-primary/5' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{language === 'ar' ? tmpl.name_ar : tmpl.name_fr}</span>
                          {tmpl.is_default && (
                            <Badge variant="outline" className="text-xs text-primary border-primary">
                              {language === 'ar' ? 'افتراضي' : 'Défaut'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="px-2 py-1 bg-muted rounded text-xs">{docTypeLabel(tmpl.type)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="px-2 py-1 bg-muted rounded text-xs font-mono">
                          {tmpl.paper_width === 210 ? 'A4' : `${tmpl.paper_width}mm`}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-muted-foreground">{(tmpl.blocks || []).length}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            title={language === 'ar' ? 'تعديل' : 'Modifier'}
                            onClick={() => navigate(`/settings/printing/template-editor/${tmpl.id}`)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            title={language === 'ar' ? 'نسخ' : 'Dupliquer'}
                            onClick={() => duplicateCustomTemplate(tmpl.id)}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          {!tmpl.is_default && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500"
                              title={language === 'ar' ? 'تعيين افتراضي' : 'Définir par défaut'}
                              onClick={() => setDefaultCustomTemplate(tmpl)}>
                              <Star className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            title={language === 'ar' ? 'حذف' : 'Supprimer'}
                            onClick={() => deleteCustomTemplate(tmpl.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receipt Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5 text-purple-600" />{language === 'ar' ? 'إعدادات الإيصال' : 'Paramètres du reçu'}</CardTitle>
          <CardDescription>{language === 'ar' ? 'تخصيص شكل الإيصال وخيارات الطباعة بعد البيع' : "Personnaliser le format du reçu et les options d'impression après vente"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-100"><Printer className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="font-medium text-green-800">{language === 'ar' ? 'طباعة تلقائية بعد البيع' : 'Impression auto après vente'}</p>
                <p className="text-sm text-green-600">{language === 'ar' ? 'طباعة الإيصال مباشرة بدون سؤال' : 'Imprimer le reçu directement sans confirmation'}</p>
              </div>
            </div>
            <Switch checked={receiptSettings.auto_print} onCheckedChange={(checked) => setReceiptSettings(prev => ({ ...prev, auto_print: checked }))} />
          </div>

          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-100"><Eye className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="font-medium text-blue-800">{language === 'ar' ? 'عرض حوار الطباعة' : "Afficher dialogue d'impression"}</p>
                <p className="text-sm text-blue-600">{language === 'ar' ? 'إظهار خيار طباعة/تخطي بعد كل بيع' : "Afficher l'option imprimer/passer après chaque vente"}</p>
              </div>
            </div>
            <Switch checked={receiptSettings.show_print_dialog} onCheckedChange={(checked) => setReceiptSettings(prev => ({ ...prev, show_print_dialog: checked }))} disabled={receiptSettings.auto_print} />
          </div>

          {/* Thermal Printer Size */}
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-full bg-purple-100"><Printer className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="font-medium text-purple-800">{language === 'ar' ? 'حجم الطابعة الحرارية' : 'Taille imprimante thermique'}</p>
                <p className="text-sm text-purple-600">{language === 'ar' ? 'اختر حجم ورق الطابعة الحرارية الخاصة بك' : 'Sélectionnez la taille du papier de votre imprimante thermique'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {['58mm', '80mm'].map(size => (
                <button key={size} type="button" onClick={() => setReceiptSettings(prev => ({ ...prev, thermal_printer_size: size }))}
                  className={`p-4 rounded-lg border-2 transition-all ${receiptSettings.thermal_printer_size === size ? 'border-purple-500 bg-purple-100' : 'border-gray-200 hover:border-purple-300'}`}>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${receiptSettings.thermal_printer_size === size ? 'text-purple-700' : 'text-gray-700'}`}>{size}</div>
                    <p className="text-sm text-muted-foreground mt-1">{language === 'ar' ? (size === '58mm' ? 'طابعة صغيرة' : 'طابعة قياسية') : (size === '58mm' ? 'Petite imprimante' : 'Imprimante standard')}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Default Template */}
          <div>
            <Label>{language === 'ar' ? 'قالب الإيصال الافتراضي' : 'Modèle de reçu par défaut'}</Label>
            <Select value={receiptSettings.default_template_id} onValueChange={(v) => setReceiptSettings(prev => ({ ...prev, default_template_id: v }))}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                {receiptSettings.templates?.map(template => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2"><span>{language === 'ar' ? template.name_ar : template.name}</span><span className="text-xs text-muted-foreground">({template.width})</span></div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Templates Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'القالب' : 'Modèle'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'الحجم' : 'Taille'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'الشعار' : 'Logo'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'الترويسة' : 'En-tête'}</TableHead>
                  <TableHead className="text-center">{language === 'ar' ? 'التذييل' : 'Pied'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receiptSettings.templates?.map((template, idx) => (
                  <TableRow key={template.id} className={template.id === receiptSettings.default_template_id ? 'bg-primary/5' : ''}>
                    <TableCell className="font-medium">
                      {language === 'ar' ? template.name_ar : template.name}
                      {template.id === receiptSettings.default_template_id && <span className="ms-2 text-xs text-primary">{language === 'ar' ? '(افتراضي)' : '(défaut)'}</span>}
                    </TableCell>
                    <TableCell className="text-center"><span className="px-2 py-1 bg-muted rounded text-xs font-mono">{template.width}</span></TableCell>
                    {['show_logo', 'show_header', 'show_footer'].map(field => (
                      <TableCell key={field} className="text-center">
                        <Switch checked={template[field]} onCheckedChange={(checked) => {
                          const newTemplates = [...receiptSettings.templates];
                          newTemplates[idx][field] = checked;
                          setReceiptSettings(prev => ({ ...prev, templates: newTemplates }));
                        }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Footer Text */}
          <div>
            <Label>{language === 'ar' ? 'نص التذييل (يظهر في أسفل الإيصال)' : 'Texte de pied (affiché en bas du reçu)'}</Label>
            <Input
              value={receiptSettings.templates?.find(t => t.id === receiptSettings.default_template_id)?.footer_text || ''}
              onChange={(e) => {
                const newTemplates = receiptSettings.templates.map(t => t.id === receiptSettings.default_template_id ? { ...t, footer_text: e.target.value } : t);
                setReceiptSettings(prev => ({ ...prev, templates: newTemplates }));
              }}
              placeholder={language === 'ar' ? 'شكراً لزيارتكم' : 'Merci pour votre visite'}
              className="mt-2"
            />
          </div>

          <Button onClick={saveReceiptSettings} disabled={savingReceipt} className="gap-2" data-testid="save-receipt-btn">
            {savingReceipt ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {language === 'ar' ? 'حفظ إعدادات الإيصال' : 'Enregistrer paramètres reçu'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-teal-600" />{language === 'ar' ? 'إعدادات طباعة المستندات' : 'Impression des documents'}</CardTitle>
          <CardDescription>{language === 'ar' ? 'تخصيص قوالب الطباعة لكل قسم (الزبائن، المنتجات، المشتريات، المبيعات، المصاريف)' : 'Personnaliser les modèles par section (clients, produits, achats, ventes, dépenses)'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {PRINT_DOC_TYPES.map(dt => {
            const cfg = { ...DEFAULT_DOC_OPTIONS[dt], ...(receiptSettings.document_print?.[dt] || {}) };
            const update = (patch) => setReceiptSettings(prev => ({
              ...prev,
              document_print: {
                ...(prev.document_print || {}),
                [dt]: { ...DEFAULT_DOC_OPTIONS[dt], ...(prev.document_print?.[dt] || {}), ...patch },
              },
            }));
            const toggles = [
              ['showLogo', 'الشعار', 'Logo'],
              ['showHeader', 'الترويسة', 'En-tête'],
              ['showFooter', 'التذييل', 'Pied de page'],
              ['showColumns', 'تفاصيل البنود', 'Détails'],
            ];
            return (
              <div key={dt} className="border rounded-lg p-4 space-y-3" data-testid={`doc-print-${dt}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="font-semibold">{language === 'ar' ? DOC_LABELS[dt].ar : DOC_LABELS[dt].fr}</div>
                  <Button variant="outline" size="sm" className="gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-xs"
                    onClick={() => navigate(`/settings/printing/template-editor?docType=${dt}`)}>
                    <Plus className="h-3 w-3" />
                    {language === 'ar' ? 'قالب مخصص' : 'Modèle custom'}
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">{language === 'ar' ? 'حجم الورق:' : 'Papier:'}</span>
                  {['58mm', '80mm', 'A4'].map(sz => (
                    <button key={sz} type="button" onClick={() => update({ paperSize: sz })}
                      className={`px-3 py-1 rounded-md text-sm border transition-colors ${cfg.paperSize === sz ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}>
                      {sz}
                    </button>
                  ))}
                  <span className="text-sm text-muted-foreground ms-2">{language === 'ar' ? 'اللون:' : 'Couleur:'}</span>
                  <input type="color" value={cfg.accentColor || '#0f766e'} onChange={(e) => update({ accentColor: e.target.value })}
                    className="h-8 w-10 rounded border cursor-pointer" title={language === 'ar' ? 'لون التمييز' : 'Couleur'} />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {toggles.map(([k, la, lf]) => (
                    <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Switch checked={cfg[k] !== false} onCheckedChange={(c) => update({ [k]: c })} />
                      {language === 'ar' ? la : lf}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <Button onClick={saveReceiptSettings} disabled={savingReceipt} className="gap-2" data-testid="save-doc-print-btn">
            {savingReceipt ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {language === 'ar' ? 'حفظ إعدادات المستندات' : 'Enregistrer les documents'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
