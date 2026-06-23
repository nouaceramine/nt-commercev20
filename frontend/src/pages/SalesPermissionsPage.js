import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { 
  Shield, 
  Save,
  AlertTriangle,
  Percent,
  DollarSign,
  Edit,
  Trash2,
  Lock
} from 'lucide-react';

export default function SalesPermissionsPage() {
  const { language } = useLanguage();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permissions, setPermissions] = useState({
    allow_employee_edit: false,
    allow_employee_delete: false,
    allow_discount_without_approval: true,
    max_discount_percent: 50.0,
    max_debt_per_customer: 100000.0,
    min_sale_price_percent: 80.0
  });

  useEffect(() => {
    fetchPermissions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPermissions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await apiClient.get(`/settings/sales-permissions`);
      setPermissions({ ...permissions, ...response.data });
    } catch (error) {
      console.error('Error fetching permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.post(`/settings/sales-permissions`, permissions);
      toast.success(language === 'ar' ? 'تم حفظ الإعدادات' : 'Paramètres enregistrés');
    } catch (error) {
      toast.error(language === 'ar' ? 'خطأ في الحفظ' : 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

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
      <div className="space-y-6 max-w-4xl mx-auto" data-testid="sales-permissions">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            {language === 'ar' ? 'صلاحيات المبيعات' : 'Permissions des Ventes'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {language === 'ar' ? 'تحكم في صلاحيات الموظفين وقيود المبيعات' : 'Contrôlez les permissions des employés et les restrictions de vente'}
          </p>
        </div>

        {/* Employee Permissions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              {language === 'ar' ? 'صلاحيات الموظفين' : 'Permissions Employés'}
            </CardTitle>
            <CardDescription>
              {language === 'ar' ? 'تحديد ما يمكن للموظفين فعله في المبيعات' : 'Définir ce que les employés peuvent faire'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Edit className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="text-base">{language === 'ar' ? 'السماح بتعديل المبيعات' : 'Autoriser modification'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'السماح للموظف بتعديل مبيعاته السابقة' : 'Permettre aux employés de modifier leurs ventes'}
                  </p>
                </div>
              </div>
              <Switch
                checked={permissions.allow_employee_edit}
                onCheckedChange={(checked) => setPermissions({ ...permissions, allow_employee_edit: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Trash2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="text-base">{language === 'ar' ? 'السماح بحذف المبيعات' : 'Autoriser suppression'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'السماح للموظف بحذف مبيعاته' : 'Permettre aux employés de supprimer leurs ventes'}
                  </p>
                </div>
              </div>
              <Switch
                checked={permissions.allow_employee_delete}
                onCheckedChange={(checked) => setPermissions({ ...permissions, allow_employee_delete: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Percent className="h-5 w-5 text-muted-foreground" />
                <div>
                  <Label className="text-base">{language === 'ar' ? 'الخصم بدون موافقة' : 'Remise sans approbation'}</Label>
                  <p className="text-sm text-muted-foreground">
                    {language === 'ar' ? 'السماح بتطبيق الخصومات بدون موافقة المدير' : 'Permettre les remises sans approbation'}
                  </p>
                </div>
              </div>
              <Switch
                checked={permissions.allow_discount_without_approval}
                onCheckedChange={(checked) => setPermissions({ ...permissions, allow_discount_without_approval: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Sale Limits */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {language === 'ar' ? 'حدود المبيعات' : 'Limites de Vente'}
            </CardTitle>
            <CardDescription>
              {language === 'ar' ? 'تحديد الحدود القصوى للمبيعات والخصومات' : 'Définir les limites maximales'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  {language === 'ar' ? 'أقصى نسبة خصم %' : 'Remise max %'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={permissions.max_discount_percent}
                  onChange={(e) => setPermissions({ ...permissions, max_discount_percent: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  {language === 'ar' ? 'الحد الأقصى للخصم المسموح به' : 'Pourcentage maximum de remise autorisé'}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  {language === 'ar' ? 'أقصى دين للزبون (دج)' : 'Dette max par client (DA)'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={permissions.max_debt_per_customer}
                  onChange={(e) => setPermissions({ ...permissions, max_debt_per_customer: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  {language === 'ar' ? 'الحد الأقصى للدين لكل زبون' : 'Dette maximale autorisée par client'}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Percent className="h-4 w-4" />
                  {language === 'ar' ? 'أدنى سعر بيع % من سعر الشراء' : 'Prix min % du prix achat'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="200"
                  value={permissions.min_sale_price_percent}
                  onChange={(e) => setPermissions({ ...permissions, min_sale_price_percent: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  {language === 'ar' ? 'لمنع البيع بأقل من التكلفة' : 'Pour éviter de vendre à perte'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="lg">
            <Save className="h-4 w-4 me-2" />
            {saving ? (language === 'ar' ? 'جاري الحفظ...' : 'Enregistrement...') : (language === 'ar' ? 'حفظ الإعدادات' : 'Enregistrer')}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
