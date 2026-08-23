import { errText } from '../../../lib/errorText';
import { useEffect, useState } from 'react';
import apiClient from '../../../lib/apiClient';
import { Layout } from '../../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Badge } from '../../../components/ui/badge';
import { Switch } from '../../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../../components/ui/dialog';
import { Package, Plus, Edit, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { SaasPageHeader } from './SaasPageHeader';

// p264: the form now edits the REAL PlanFeatures schema (backend routes/saas/schemas.py)
// — previously the page edited stale keys (pos, ai_tips...) that pydantic silently
// dropped, so plan features never actually changed from this screen.
const BOOL_FEATURES = [
  ['has_pos', 'نقطة البيع'],
  ['has_inventory', 'المخزون'],
  ['has_reports', 'التقارير'],
  ['has_multi_warehouse', 'تعدد المخازن'],
  ['has_api_access', 'وصول API'],
  ['has_ecommerce', 'التجارة الإلكترونية'],
  ['has_woocommerce', 'WooCommerce'],
  ['has_advanced_reports', 'تقارير متقدمة'],
  ['has_employee_management', 'إدارة الموظفين'],
  ['has_debt_management', 'إدارة الديون'],
  ['has_customer_loyalty', 'نقاط الولاء'],
  ['has_supplier_management', 'إدارة الموردين'],
  ['has_email_notifications', 'إشعارات البريد'],
  ['has_sms_notifications', 'إشعارات SMS'],
];

const EMPTY_FORM = {
  name: '', name_ar: '', description: '', description_ar: '',
  monthly_price: 0, six_month_price: 0, yearly_price: 0,
  business_type: '',
  features: {
    max_products: 100, max_users: 3, max_warehouses: 1,
    has_pos: true, has_inventory: true, has_reports: true,
    has_multi_warehouse: false, has_api_access: false, has_ecommerce: false,
    has_woocommerce: false, has_advanced_reports: false, has_employee_management: false,
    has_debt_management: true, has_customer_loyalty: false, has_supplier_management: true,
    has_email_notifications: false, has_sms_notifications: false,
  },
  is_active: true, is_popular: false, sort_order: 0,
  commission_rate: 10,
};

export default function PlansPage() {
  const [plans, setPlans] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/saas/plans?include_inactive=true');
      setPlans(res.data || []);
    } catch (e) {
      toast.error(errText(e) || 'فشل تحميل الخطط');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiClient.get('/saas/business-profiles')
      .then(r => setProfiles(r.data?.profiles || []))
      .catch(() => {});
  }, []);

  const profileName = (key) => (profiles.find(pr => pr.key === key)?.name_ar) || '';

  const open = (plan = null) => {
    if (plan) {
      setEditing(plan);
      setForm({
        name: plan.name, name_ar: plan.name_ar,
        description: plan.description, description_ar: plan.description_ar,
        monthly_price: plan.monthly_price ?? 0,
        six_month_price: plan.six_month_price ?? 0,
        yearly_price: plan.yearly_price ?? 0,
        business_type: plan.business_type || '',
        features: { ...EMPTY_FORM.features, ...(plan.features || {}) },
        is_active: plan.is_active, is_popular: plan.is_popular, sort_order: plan.sort_order,
        commission_rate: plan.commission_rate ?? 10,
      });
    } else {
      setEditing(null);
      setForm({ ...EMPTY_FORM, features: { ...EMPTY_FORM.features }, sort_order: plans.length });
    }
    setDialogOpen(true);
  };

  const save = async () => {
    try {
      if (editing) {
        await apiClient.put(`/saas/plans/${editing.id}`, form);
        toast.success('تم تحديث الخطة بنجاح');
      } else {
        await apiClient.post('/saas/plans', form);
        toast.success('تم إنشاء الخطة بنجاح');
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(errText(e) || 'حدث خطأ');
    }
  };

  const remove = async (planId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الخطة؟')) return;
    try {
      await apiClient.delete(`/saas/plans/${planId}`);
      toast.success('تم حذف الخطة');
      await load();
    } catch (e) {
      toast.error(errText(e) || 'حدث خطأ');
    }
  };

  const setFeat = (key, val) => setForm({ ...form, features: { ...form.features, [key]: val } });

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="saas-plans-page">
        <SaasPageHeader
          titleAr="الخطط"
          subtitleAr="إنشاء وتعديل خطط الاشتراك"
          icon={Package}
          extra={
            <Button onClick={() => open()} data-testid="add-plan-btn">
              <Plus className="h-4 w-4 me-2" />
              إضافة خطة
            </Button>
          }
        />

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="plans-grid">
            {plans.map(plan => (
              <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''} data-testid={`plan-card-${plan.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {plan.name_ar}
                      {plan.is_popular && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                    </CardTitle>
                    <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                      {plan.is_active ? 'نشط' : 'معطل'}
                    </Badge>
                  </div>
                  <CardDescription>{plan.description_ar}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>شهري:</span>
                      <span className="font-semibold">{(plan.monthly_price || 0).toLocaleString()} دج</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>6 أشهر:</span>
                      <span className="font-semibold">{(plan.six_month_price || 0).toLocaleString()} دج</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>سنوي:</span>
                      <span className="font-semibold">{(plan.yearly_price || 0).toLocaleString()} دج</span>
                    </div>
                    <div className="border-t pt-3 mt-3">
                      <p className="text-xs text-muted-foreground mb-2">الحدود:</p>
                      <div className="flex flex-wrap gap-2">
                        {plan.features?.max_products !== undefined && (
                          <Badge variant="outline" className="text-xs">{plan.features.max_products === -1 ? '∞' : plan.features.max_products} منتج</Badge>
                        )}
                        {plan.features?.max_users !== undefined && (
                          <Badge variant="outline" className="text-xs">{plan.features.max_users === -1 ? '∞' : plan.features.max_users} مستخدم</Badge>
                        )}
                        {plan.features?.max_warehouses !== undefined && (
                          <Badge variant="outline" className="text-xs">{plan.features.max_warehouses === -1 ? '∞' : plan.features.max_warehouses} مخزن</Badge>
                        )}
                      </div>
                    </div>
                    {plan.business_type && (
                      <div className="border-t pt-2">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs" data-testid={`plan-btype-${plan.id}`}>
                          {profileName(plan.business_type) || plan.business_type}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => open(plan)} data-testid={`edit-plan-${plan.id}-btn`}>
                      <Edit className="h-4 w-4 me-1" />
                      تعديل
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => remove(plan.id)} data-testid={`delete-plan-${plan.id}-btn`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="plan-dialog">
            <DialogHeader>
              <DialogTitle>{editing ? 'تعديل الخطة' : 'إضافة خطة جديدة'}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>الاسم (إنجليزي)</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>الاسم (عربي)</Label>
                <Input value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>الوصف (عربي)</Label>
                <Textarea value={form.description_ar} onChange={e => setForm({ ...form, description_ar: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>السعر الشهري (دج)</Label>
                <Input type="number" data-testid="plan-monthly-price" value={form.monthly_price} onChange={e => setForm({ ...form, monthly_price: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>سعر 6 أشهر (دج)</Label>
                <Input type="number" value={form.six_month_price} onChange={e => setForm({ ...form, six_month_price: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>السعر السنوي (دج)</Label>
                <Input type="number" value={form.yearly_price} onChange={e => setForm({ ...form, yearly_price: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>ترتيب العرض</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>نسبة عمولة الوكيل (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={form.commission_rate}
                  onChange={e => setForm({ ...form, commission_rate: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>نوع النشاط التجاري المقترح</Label>
                <Select value={form.business_type || 'none'} onValueChange={v => setForm({ ...form, business_type: v === 'none' ? '' : v })}>
                  <SelectTrigger data-testid="plan-business-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون (يختار المشترك)</SelectItem>
                    {profiles.map(pr => (
                      <SelectItem key={pr.key} value={pr.key}>{pr.name_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>حد المنتجات (-1 = بلا حد)</Label>
                <Input type="number" data-testid="plan-max-products" value={form.features.max_products} onChange={e => setFeat('max_products', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label>حد المستخدمين (-1 = بلا حد)</Label>
                <Input type="number" value={form.features.max_users} onChange={e => setFeat('max_users', parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label>حد المخازن (-1 = بلا حد)</Label>
                <Input type="number" value={form.features.max_warehouses} onChange={e => setFeat('max_warehouses', parseInt(e.target.value) || 0)} />
              </div>
              <div className="flex items-center gap-4 col-span-2">
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
                  <Label>نشط</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_popular} onCheckedChange={v => setForm({ ...form, is_popular: v })} />
                  <Label>الأكثر شعبية</Label>
                </div>
              </div>
              <div className="col-span-2">
                <Label className="mb-2 block">الميزات</Label>
                <div className="grid grid-cols-2 gap-2">
                  {BOOL_FEATURES.map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Switch
                        data-testid={`plan-feature-${key}`}
                        checked={form.features?.[key] || false}
                        onCheckedChange={v => setFeat(key, v)}
                      />
                      <Label className="text-sm">{label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button onClick={save} data-testid="save-plan-btn">حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
