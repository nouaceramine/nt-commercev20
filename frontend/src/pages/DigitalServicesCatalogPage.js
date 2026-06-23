import { useState, useEffect, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { LoadingState } from '../components/LoadingState';
import { EmptyState } from '../components/EmptyState';
import { formatCurrency } from '../utils/globalDateFormatter';
import { toast } from 'sonner';
import { Boxes, Plus, Edit, Trash2, Save, ShoppingCart, Tv, RefreshCw, Wallet } from 'lucide-react';

const EMPTY = {
  name: '', category: 'iptv', supplier_name: '', server_name: '',
  duration_months: '', default_cost: '', default_price: '', notes: '', active: true,
};

const CAT_LABEL = (c, ar) => ({
  iptv: 'IPTV',
  recharge: ar ? 'شحن رصيد' : 'Recharge',
  other: ar ? 'أخرى' : 'Autre',
}[c] || c);

export default function DigitalServicesCatalogPage() {
  const { language } = useLanguage();
  const ar = language === 'ar';

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Platform catalog state
  const [platformItems, setPlatformItems] = useState([]);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [purchasingId, setPurchasingId] = useState(null);
  const [confirmPurchase, setConfirmPurchase] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient.get('/digital-panel/services');
      setServices(r.data || []);
    } catch (err) {
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlatformCatalog = useCallback(async () => {
    setPlatformLoading(true);
    try {
      const r = await apiClient.get('/digital-panel/platform-catalog');
      setPlatformItems(r.data || []);
    } catch (err) {
      // If endpoint not available (feature disabled), silently ignore
    } finally {
      setPlatformLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadPlatformCatalog();
  }, [load, loadPlatformCatalog]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      name: s.name, category: s.category || 'iptv', supplier_name: s.supplier_name || '',
      server_name: s.server_name || '', duration_months: s.duration_months ? String(s.duration_months) : '',
      default_cost: s.default_cost ?? '', default_price: s.default_price ?? '',
      notes: s.notes || '', active: s.active !== false,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error(ar ? 'اسم الخدمة مطلوب' : 'Nom requis'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        duration_months: form.duration_months ? parseInt(form.duration_months) : null,
        default_cost: parseFloat(form.default_cost) || 0,
        default_price: parseFloat(form.default_price) || 0,
      };
      if (editing) {
        await apiClient.put(`/digital-panel/services/${editing.id}`, payload);
        toast.success(ar ? 'تم التحديث' : 'Mis à jour');
      } else {
        await apiClient.post('/digital-panel/services', payload);
        toast.success(ar ? 'تمت الإضافة' : 'Ajouté');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل الحفظ' : 'Échec'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/digital-panel/services/${deleteTarget.id}`);
      toast.success(ar ? 'تم الحذف' : 'Supprimé');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || (ar ? 'فشل الحذف' : 'Échec'));
    }
  };

  const handlePurchase = async (item) => {
    setPurchasingId(item.id);
    try {
      const res = await apiClient.post(`/digital-panel/platform-catalog/${item.id}/purchase`);
      toast.success(`تمت إضافة "${res.data.name}" إلى الكتالوج بنجاح`);
      load();
      loadPlatformCatalog();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'فشل شراء الباقة');
    } finally {
      setPurchasingId(null);
      setConfirmPurchase(null);
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6">

        {/* Platform Catalog — Buy from platform */}
        {(platformLoading || platformItems.length > 0) && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Tv className="h-5 w-5 text-blue-600" />
                  {ar ? 'باقات المنصة — شراء وإضافة للكتالوج' : 'Catalogue plateforme'}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={loadPlatformCatalog} disabled={platformLoading}>
                  <RefreshCw className={`h-4 w-4 ${platformLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {ar
                  ? 'اشترِ الباقات من المنصة مباشرة — سيُخصم المبلغ من محفظتك وتُضاف الباقة لكتالوجك تلقائياً'
                  : 'Achetez des packages depuis la plateforme — le montant est débité de votre portefeuille'}
              </p>
            </CardHeader>
            <CardContent>
              {platformLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <RefreshCw className="h-4 w-4 animate-spin" /> جاري التحميل...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {platformItems.map(item => (
                    <Card key={item.id} className="bg-white border-blue-100">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-sm">{item.name}</div>
                            {item.server_name && <div className="text-xs text-muted-foreground">{item.server_name}</div>}
                          </div>
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            {CAT_LABEL(item.category, ar)}
                          </Badge>
                        </div>
                        {item.duration_months && (
                          <div className="text-xs text-muted-foreground">
                            {ar ? 'المدة' : 'Durée'}: {item.duration_months} {ar ? 'شهر' : 'mois'}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs pt-1 border-t">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Wallet className="h-3 w-3" />
                            {ar ? 'التكلفة' : 'Coût'}: <strong className="text-foreground">{(item.cost_price || 0).toLocaleString('ar-DZ')} دج</strong>
                          </span>
                          <span className="text-green-700 font-medium">
                            {ar ? 'سعر البيع' : 'Prix vente'}: {(item.sell_price || 0).toLocaleString('ar-DZ')} دج
                          </span>
                        </div>
                        {item.description && (
                          <div className="text-xs text-muted-foreground">{item.description}</div>
                        )}
                        <Button
                          size="sm"
                          className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                          disabled={purchasingId === item.id}
                          onClick={() => setConfirmPurchase(item)}
                        >
                          {purchasingId === item.id
                            ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> جاري الشراء...</>
                            : <><ShoppingCart className="h-3.5 w-3.5" /> شراء وإضافة للكتالوج</>
                          }
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* My Catalog */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Boxes className="h-7 w-7 text-primary" />
            {ar ? 'كتالوج الخدمات الرقمية' : 'Catalogue services'}
          </h1>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            {ar ? 'خدمة جديدة' : 'Nouveau service'}
          </Button>
        </div>

        {loading ? (
          <LoadingState />
        ) : services.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={ar ? 'لا توجد خدمات' : 'Aucun service'}
            description={ar ? 'أضف باقات IPTV أو خدمات رقمية لإعادة استخدامها' : 'Ajoutez des services réutilisables'}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {services.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold">{s.name}</div>
                      {s.server_name && <div className="text-xs text-muted-foreground">{s.server_name}</div>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline">{CAT_LABEL(s.category, ar)}</Badge>
                      {s.platform_catalog_id && (
                        <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700">من المنصة</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {s.duration_months ? <div>{ar ? 'المدة' : 'Durée'}: {s.duration_months} {ar ? 'شهر' : 'mois'}</div> : null}
                    {s.supplier_name ? <div>{ar ? 'المورّد' : 'Fournisseur'}: {s.supplier_name}</div> : null}
                    <div className="flex items-center justify-between pt-1">
                      <span>{ar ? 'التكلفة' : 'Coût'}: {formatCurrency(s.default_cost)}</span>
                      <span className="font-medium text-foreground">{ar ? 'السعر' : 'Prix'}: {formatCurrency(s.default_price)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 pt-2 border-t">
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => openEdit(s)}>
                      <Edit className="h-4 w-4" /> {ar ? 'تعديل' : 'Modifier'}
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1 text-red-600" onClick={() => setDeleteTarget(s)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? (ar ? 'تعديل خدمة' : 'Modifier') : (ar ? 'خدمة جديدة' : 'Nouveau service')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>{ar ? 'اسم الخدمة' : 'Nom du service'}</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'الفئة' : 'Catégorie'}</Label>
              <Select value={form.category} onValueChange={(v) => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="iptv">IPTV</SelectItem>
                  <SelectItem value="recharge">{ar ? 'شحن رصيد' : 'Recharge'}</SelectItem>
                  <SelectItem value="other">{ar ? 'أخرى' : 'Autre'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'المدة (شهر)' : 'Durée (mois)'}</Label>
              <Input type="number" value={form.duration_months} onChange={(e) => set('duration_months', e.target.value)} placeholder={ar ? 'اختياري' : 'Optionnel'} />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'السيرفر/الباقة' : 'Serveur/Pack'}</Label>
              <Input value={form.server_name} onChange={(e) => set('server_name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'المورّد' : 'Fournisseur'}</Label>
              <Input value={form.supplier_name} onChange={(e) => set('supplier_name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'التكلفة الافتراضية' : 'Coût par défaut'}</Label>
              <Input type="number" value={form.default_cost} onChange={(e) => set('default_cost', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{ar ? 'السعر الافتراضي' : 'Prix par défaut'}</Label>
              <Input type="number" value={form.default_price} onChange={(e) => set('default_price', e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{ar ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{ar ? 'إلغاء' : 'Annuler'}</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? '...' : (ar ? 'حفظ' : 'Enregistrer')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ar ? 'حذف الخدمة؟' : 'Supprimer ?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {ar ? 'لا يمكن التراجع عن هذا الإجراء.' : 'Action irréversible.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ar ? 'إلغاء' : 'Annuler'}</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-red-600 hover:bg-red-700">
              {ar ? 'حذف' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Purchase Dialog */}
      <AlertDialog open={!!confirmPurchase} onOpenChange={(o) => !o && setConfirmPurchase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-blue-600" />
              تأكيد شراء الباقة
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                سيتم خصم <strong>{(confirmPurchase?.cost_price || 0).toLocaleString('ar-DZ')} دج</strong> من محفظتك
                وإضافة باقة <strong>{confirmPurchase?.name}</strong> إلى كتالوجك.
              </span>
              <span className="block text-xs text-muted-foreground">
                بعد الإضافة يمكنك بيعها للزبائن بسعر <strong>{(confirmPurchase?.sell_price || 0).toLocaleString('ar-DZ')} دج</strong> أو بأي سعر تحدده.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handlePurchase(confirmPurchase)}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={purchasingId === confirmPurchase?.id}
            >
              {purchasingId === confirmPurchase?.id
                ? 'جاري الشراء...'
                : `شراء مقابل ${(confirmPurchase?.cost_price || 0).toLocaleString('ar-DZ')} دج`
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
