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
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '../../../components/ui/dialog';
import { Package, Plus, Edit, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { SaasPageHeader } from './SaasPageHeader';

const EMPTY_FORM = {
  name: '', name_ar: '', description: '', description_ar: '',
  price_monthly: 0, price_6months: 0, price_yearly: 0,
  features: { pos: true, reports: true, ai_tips: false, multi_warehouse: false },
  limits: { max_products: 100, max_users: 3, max_sales_per_month: 500 },
  is_active: true, is_popular: false, sort_order: 0,
  commission_rate: 10,
};

const FEATURES = ['pos', 'reports', 'ai_tips', 'multi_warehouse', 'smart_reports', 'employee_alerts'];
const FEATURE_LABEL = {
  pos: 'نقطة البيع',
  reports: 'التقارير',
  ai_tips: 'نصائح AI',
  multi_warehouse: 'تعدد المخازن',
  smart_reports: 'تقارير ذكية',
  employee_alerts: 'تنبيهات الموظفين',
};

export default function PlansPage() {
  const [plans, setPlans] = useState([]);
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
      toast.error(errText(e) ||  'فشل تحميل الخطط');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const open = (plan = null) => {
    if (plan) {
      setEditing(plan);
      setForm({
        name: plan.name, name_ar: plan.name_ar,
        description: plan.description, description_ar: plan.description_ar,
        price_monthly: plan.price_monthly, price_6months: plan.price_6months, price_yearly: plan.price_yearly,
        features: plan.features || {}, limits: plan.limits || {},
        is_active: plan.is_active, is_popular: plan.is_popular, sort_order: plan.sort_order,
        commission_rate: plan.commission_rate ?? 10,
      });
    } else {
      setEditing(null);
      setForm({ ...EMPTY_FORM, sort_order: plans.length });
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
      toast.error(errText(e) ||  'حدث خطأ');
    }
  };

  const remove = async (planId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الخطة؟')) return;
    try {
      await apiClient.delete(`/saas/plans/${planId}`);
      toast.success('تم حذف الخطة');
      await load();
    } catch (e) {
      toast.error(errText(e) ||  'حدث خطأ');
    }
  };

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
                      <span className="font-semibold">{(plan.monthly_price || plan.price_monthly || 0).toLocaleString()} دج</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>6 أشهر:</span>
                      <span className="font-semibold">{(plan.six_month_price || plan.price_6months || 0).toLocaleString()} دج</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>سنوي:</span>
                      <span className="font-semibold">{(plan.yearly_price || plan.price_yearly || 0).toLocaleString()} دج</span>
                    </div>
                    <div className="border-t pt-3 mt-3">
                      <p className="text-xs text-muted-foreground mb-2">الحدود:</p>
                      <div className="flex flex-wrap gap-2">
                        {plan.limits?.max_products && (
                          <Badge variant="outline" className="text-xs">{plan.limits.max_products} منتج</Badge>
                        )}
                        {plan.limits?.max_users && (
                          <Badge variant="outline" className="text-xs">{plan.limits.max_users} مستخدم</Badge>
                        )}
                      </div>
                    </div>
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
                <Input type="number" value={form.price_monthly} onChange={e => setForm({ ...form, price_monthly: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>سعر 6 أشهر (دج)</Label>
                <Input type="number" value={form.price_6months} onChange={e => setForm({ ...form, price_6months: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>السعر السنوي (دج)</Label>
                <Input type="number" value={form.price_yearly} onChange={e => setForm({ ...form, price_yearly: parseFloat(e.target.value) || 0 })} />
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
                <Label>حد المنتجات</Label>
                <Input type="number" value={form.limits?.max_products || 0} onChange={e => setForm({ ...form, limits: { ...form.limits, max_products: parseInt(e.target.value) || 0 } })} />
              </div>
              <div className="space-y-2">
                <Label>حد المستخدمين</Label>
                <Input type="number" value={form.limits?.max_users || 0} onChange={e => setForm({ ...form, limits: { ...form.limits, max_users: parseInt(e.target.value) || 0 } })} />
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
                  {FEATURES.map(f => (
                    <div key={f} className="flex items-center gap-2">
                      <Switch
                        checked={form.features?.[f] || false}
                        onCheckedChange={v => setForm({ ...form, features: { ...form.features, [f]: v } })}
                      />
                      <Label className="text-sm">{FEATURE_LABEL[f] || f}</Label>
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
