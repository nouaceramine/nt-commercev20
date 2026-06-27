/**
 * Platform Financial Management — Money dashboard for the platform-as-supplier.
 *
 * Three sub-tabs:
 *   1. لوحة المعلومات — KPIs + top tenants + top suppliers
 *   2. الموردون — External suppliers CRUD + payment history
 *   3. المشتريات — Purchase log + add new purchase
 *
 * Backend contract: see /app/backend/routes/saas/platform_finance_routes.py
 */
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { toast } from "sonner";
import apiClient from "../../lib/apiClient";
import { Loader2, Plus, Trash2, TrendingUp, TrendingDown, Wallet, Users, Truck, Receipt, Pencil, Banknote, AlertTriangle, RefreshCw, Upload, FileText } from "lucide-react";

const fmt = (n) => Number(n || 0).toLocaleString("ar-DZ", { maximumFractionDigits: 2 });

export function PlatformFinanceTab() {
  const [subTab, setSubTab] = useState("dashboard");
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showPayment, setShowPayment] = useState(null);  // {supplier}
  const [showUploadCodes, setShowUploadCodes] = useState(null);  // {purchase}

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, sup, p] = await Promise.all([
        apiClient.get(`/admin/supplier/financial/summary?days=${days}`),
        apiClient.get("/admin/supplier/external-suppliers"),
        apiClient.get("/admin/supplier/purchases?limit=100"),
      ]);
      setSummary(s.data);
      setSuppliers(sup.data || []);
      setPurchases(p.data || []);
    } catch (e) {
      toast.error("فشل تحميل البيانات المالية");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const kpis = summary?.kpis || {};
  const profitColor = (kpis.gross_profit || 0) >= 0 ? "text-emerald-700" : "text-rose-700";
  const profitIcon  = (kpis.gross_profit || 0) >= 0 ? TrendingUp : TrendingDown;
  const ProfitIcon  = profitIcon;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-purple-600" /> إدارة المال
          </h3>
          <p className="text-xs text-muted-foreground">إيرادات / تكاليف / أرباح / موردون خارجيون / محفظة المنصة</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-36" data-testid="finance-days-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">آخر 7 أيام</SelectItem>
              <SelectItem value="30">آخر 30 يوم</SelectItem>
              <SelectItem value="90">آخر 90 يوم</SelectItem>
              <SelectItem value="365">آخر سنة</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading} data-testid="finance-refresh">
            <RefreshCw className={`h-4 w-4 me-1 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
        </div>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="dashboard" data-testid="finance-tab-dashboard">📊 لوحة المعلومات</TabsTrigger>
          <TabsTrigger value="suppliers" data-testid="finance-tab-suppliers">🏭 الموردون ({suppliers.length})</TabsTrigger>
          <TabsTrigger value="purchases" data-testid="finance-tab-purchases">📦 المشتريات ({purchases.length})</TabsTrigger>
        </TabsList>

        {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
        <TabsContent value="dashboard" className="space-y-4 mt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard icon={<TrendingUp className="h-5 w-5" />} label="الإيرادات" value={fmt(kpis.total_revenue)} suffix="دج" sub={`${kpis.revenue_orders || 0} طلب`} color="emerald" testId="kpi-revenue" />
            <KpiCard icon={<TrendingDown className="h-5 w-5" />} label="التكاليف" value={fmt(kpis.total_cost)} suffix="دج" sub={`${kpis.purchase_count || 0} عملية شراء`} color="rose" testId="kpi-cost" />
            <KpiCard
              icon={<ProfitIcon className="h-5 w-5" />}
              label="الربح الإجمالي"
              value={fmt(kpis.gross_profit)} suffix="دج"
              sub={`هامش ${kpis.margin_pct}%`}
              color={(kpis.gross_profit || 0) >= 0 ? "emerald" : "rose"}
              testId="kpi-profit"
            />
            <KpiCard icon={<Wallet className="h-5 w-5" />} label="رصيد محفظة المنصة" value={fmt(kpis.wallet_balance)} suffix={kpis.wallet_currency || "DZD"} sub="الرصيد الحالي" color="indigo" testId="kpi-wallet" />
          </div>

          {kpis.total_accounts_payable > 0 && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <div className="font-semibold">ديون مستحقة للموردين الخارجيين</div>
                  <div>
                    لديك <strong>{fmt(kpis.total_accounts_payable)} دج</strong> ديون متراكمة لـ <strong>{kpis.suppliers_with_debt}</strong> مورد.
                    راجع تفاصيلهم في تبويب <span className="font-semibold">الموردون</span>.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-blue-600" /> أعلى 5 مستأجرين شراءً</CardTitle></CardHeader>
              <CardContent>
                {(summary?.top_tenants || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">لا توجد طلبات في هذه الفترة</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>المستأجر</TableHead>
                        <TableHead className="text-end">الطلبات</TableHead>
                        <TableHead className="text-end">الإيرادات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(summary?.top_tenants || []).map((t, i) => (
                        <TableRow key={t.tenant_id || i} data-testid={`top-tenant-${i}`}>
                          <TableCell className="text-xs">{i + 1}</TableCell>
                          <TableCell className="text-sm font-medium">{t.tenant_name}</TableCell>
                          <TableCell className="text-end text-sm">{t.orders}</TableCell>
                          <TableCell className="text-end text-sm font-semibold text-emerald-700">{fmt(t.revenue)} دج</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4 text-purple-600" /> أعلى 5 موردين تكلفةً</CardTitle></CardHeader>
              <CardContent>
                {(summary?.top_suppliers || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">لا توجد مشتريات في هذه الفترة</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>المورد</TableHead>
                        <TableHead className="text-end">العمليات</TableHead>
                        <TableHead className="text-end">التكلفة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(summary?.top_suppliers || []).map((s, i) => (
                        <TableRow key={s.supplier_id || i} data-testid={`top-supplier-${i}`}>
                          <TableCell className="text-xs">{i + 1}</TableCell>
                          <TableCell className="text-sm font-medium">{s.supplier_name}</TableCell>
                          <TableCell className="text-end text-sm">{s.purchases}</TableCell>
                          <TableCell className="text-end text-sm font-semibold text-rose-700">{fmt(s.cost)} دج</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── SUPPLIERS ─────────────────────────────────────────────────── */}
        <TabsContent value="suppliers" className="mt-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">الموردون الخارجيون</CardTitle>
              <Button size="sm" onClick={() => setShowAddSupplier(true)} data-testid="finance-add-supplier-btn">
                <Plus className="h-4 w-4 ms-1" /> إضافة مورد
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead>المسؤول</TableHead>
                    <TableHead className="text-end">رصيد مستحق علينا</TableHead>
                    <TableHead className="text-end">الحالة</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا يوجد موردون — أضف أول مورد</TableCell></TableRow>
                  ) : suppliers.map((s) => (
                    <TableRow key={s.id} data-testid={`supplier-row-${s.id}`}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs font-mono">{s.phone || "—"}</TableCell>
                      <TableCell className="text-sm">{s.contact_person || "—"}</TableCell>
                      <TableCell className={`text-end font-bold ${(s.balance_due || 0) > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                        {fmt(s.balance_due)} دج
                      </TableCell>
                      <TableCell className="text-end">
                        <Badge variant={s.is_active ? "default" : "secondary"}>
                          {s.is_active ? "نشط" : "معطَّل"}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-1 space-x-reverse whitespace-nowrap">
                        <Button size="sm" variant="outline" onClick={() => setShowPayment({ supplier: s })} title="تسجيل دفعة" data-testid={`pay-supplier-${s.id}`}>
                          <Banknote className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingSupplier(s)} title="تعديل" data-testid={`edit-supplier-${s.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteSupplier(s.id)} title="حذف" data-testid={`del-supplier-${s.id}`}>
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PURCHASES ─────────────────────────────────────────────────── */}
        <TabsContent value="purchases" className="mt-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">سجل المشتريات</CardTitle>
              <Button size="sm" onClick={() => setShowAddPurchase(true)} disabled={suppliers.length === 0} data-testid="finance-add-purchase-btn">
                <Plus className="h-4 w-4 ms-1" /> تسجيل عملية شراء
              </Button>
            </CardHeader>
            <CardContent>
              {suppliers.length === 0 && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
                  ⚠️ أضف موردين أولاً قبل تسجيل المشتريات.
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المورد</TableHead>
                    <TableHead>المحتوى</TableHead>
                    <TableHead className="text-end">الإجمالي</TableHead>
                    <TableHead className="text-end">مدفوع</TableHead>
                    <TableHead className="text-end">المتبقي</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">لا توجد مشتريات</TableCell></TableRow>
                  ) : purchases.map((p) => (
                    <TableRow key={p.id} data-testid={`purchase-row-${p.id}`}>
                      <TableCell className="text-xs whitespace-nowrap">{p.purchase_date?.slice(0, 10) || "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{p.supplier_name}</TableCell>
                      <TableCell className="text-xs max-w-[260px]">
                        {(p.items || []).slice(0, 3).map((it, i) => (
                          <div key={i}>{it.label || it.type} × {it.quantity}</div>
                        ))}
                        {(p.items || []).length > 3 && <div className="text-muted-foreground">+ {p.items.length - 3} أخرى</div>}
                      </TableCell>
                      <TableCell className="text-end font-semibold">{fmt(p.total_cost)} دج</TableCell>
                      <TableCell className="text-end text-emerald-700">{fmt(p.paid_amount)} دج</TableCell>
                      <TableCell className={`text-end font-bold ${p.balance_due > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                        {fmt(p.balance_due)} دج
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {(p.items || []).some(it => ["card", "sim", "idoom"].includes(it.type) && it.catalog_id) && (
                            <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => setShowUploadCodes({ purchase: p })} title="رفع أكواد/ICCID لاحقاً" data-testid={`upload-codes-${p.id}`}>
                              <Upload className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => deletePurchase(p.id)} title="حذف" data-testid={`del-purchase-${p.id}`}>
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {(showAddSupplier || editingSupplier) && (
        <SupplierFormDialog
          supplier={editingSupplier}
          onClose={() => { setShowAddSupplier(false); setEditingSupplier(null); }}
          onDone={() => { setShowAddSupplier(false); setEditingSupplier(null); loadAll(); }}
        />
      )}
      {showAddPurchase && (
        <PurchaseFormDialog
          suppliers={suppliers}
          onClose={() => setShowAddPurchase(false)}
          onDone={() => { setShowAddPurchase(false); loadAll(); }}
        />
      )}
      {showPayment && (
        <PaymentDialog
          supplier={showPayment.supplier}
          onClose={() => setShowPayment(null)}
          onDone={() => { setShowPayment(null); loadAll(); }}
        />
      )}
      {showUploadCodes && (
        <UploadCodesForPurchaseDialog
          purchase={showUploadCodes.purchase}
          onClose={() => setShowUploadCodes(null)}
          onDone={() => { setShowUploadCodes(null); loadAll(); }}
        />
      )}
    </div>
  );

  // ── Mutations ────────────────────────────────────────────────────────
  async function deleteSupplier(id) {
    if (!window.confirm("حذف هذا المورد؟ سيُرفض الطلب إن كانت لديه مشتريات.")) return;
    try {
      await apiClient.delete(`/admin/supplier/external-suppliers/${id}`);
      toast.success("تم الحذف");
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الحذف");
    }
  }
  async function deletePurchase(id) {
    if (!window.confirm("حذف عملية الشراء؟ سيُعاد حساب رصيد المورد.")) return;
    try {
      await apiClient.delete(`/admin/supplier/purchases/${id}`);
      toast.success("تم الحذف");
      loadAll();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الحذف");
    }
  }
}

// ── KPI Card ────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, suffix, sub, color, testId }) {
  const colorMap = {
    emerald: "from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-900",
    rose:    "from-rose-50    to-rose-100    border-rose-200    text-rose-900",
    indigo:  "from-indigo-50  to-indigo-100  border-indigo-200  text-indigo-900",
    amber:   "from-amber-50   to-amber-100   border-amber-200   text-amber-900",
  };
  return (
    <Card className={`bg-gradient-to-br ${colorMap[color] || colorMap.indigo} border`} data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium opacity-80">{label}</span>
          <span className="opacity-70">{icon}</span>
        </div>
        <div className="text-2xl font-bold">{value} <span className="text-xs font-medium opacity-70">{suffix}</span></div>
        <div className="text-xs opacity-70 mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  );
}

// ── Supplier add/edit dialog ────────────────────────────────────────────
function SupplierFormDialog({ supplier, onClose, onDone }) {
  const [form, setForm] = useState({
    name: supplier?.name || "",
    phone: supplier?.phone || "",
    contact_person: supplier?.contact_person || "",
    notes: supplier?.notes || "",
    is_active: supplier?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const isEdit = !!supplier;

  const submit = async () => {
    if (!form.name.trim()) { toast.error("الاسم مطلوب"); return; }
    setBusy(true);
    try {
      if (isEdit) {
        await apiClient.put(`/admin/supplier/external-suppliers/${supplier.id}`, form);
      } else {
        await apiClient.post("/admin/supplier/external-suppliers", form);
      }
      toast.success(isEdit ? "تم التحديث" : "تمت الإضافة");
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الحفظ");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl" data-testid="supplier-form-dialog">
        <DialogHeader><DialogTitle>{isEdit ? "تعديل المورد" : "إضافة مورد خارجي"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>الاسم *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="supplier-name" /></div>
          <div><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="supplier-phone" /></div>
          <div><Label>اسم المسؤول</Label><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></div>
          <div><Label>ملاحظات</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={busy} data-testid="supplier-save-btn">
            {busy ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : <Plus className="h-4 w-4 ms-1" />} حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Purchase dialog ─────────────────────────────────────────────────────
function PurchaseFormDialog({ suppliers, onClose, onDone }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || "");
  const [items, setItems] = useState([{ label: "", quantity: 1, unit_cost: 0, type: "card", catalog_id: null }]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalogs, setCatalogs] = useState({ card: [], sim: [], idoom: [], iptv: [] });

  // Load catalog options (cards / sims / idoom / iptv) for the dropdown
  useEffect(() => {
    apiClient.get("/admin/supplier/catalog-reference")
      .then(res => setCatalogs(res.data || { card: [], sim: [], idoom: [], iptv: [] }))
      .catch(() => {/* graceful — manual label entry still works */});
  }, []);

  const total = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantity || 0) * Number(it.unit_cost || 0)), 0),
    [items],
  );
  const balance = Math.max(0, total - Number(paidAmount || 0));

  const updateItem = (i, k, v) => setItems(items.map((it, idx) => {
    if (idx !== i) return it;
    const next = { ...it, [k]: v };
    // When type changes, reset catalog_id so the user re-picks from the right list
    if (k === "type") next.catalog_id = null;
    return next;
  }));
  const addItem = () => setItems([...items, { label: "", quantity: 1, unit_cost: 0, type: "card", catalog_id: null }]);
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const onPickCatalog = (i, value) => {
    // value is "NONE" (free entry) or the catalog item id
    if (value === "NONE") {
      updateItem(i, "catalog_id", null);
      return;
    }
    const type = items[i].type;
    const found = (catalogs[type] || []).find(x => x.id === value);
    setItems(prev => prev.map((it, idx) => idx === i
      ? { ...it, catalog_id: value, label: found?.label || it.label }
      : it));
  };

  const submit = async () => {
    if (!supplierId) { toast.error("اختر المورد"); return; }
    const validItems = items.filter(it => Number(it.quantity) > 0 && Number(it.unit_cost) >= 0 && it.label.trim());
    if (validItems.length === 0) { toast.error("أضف بنداً واحداً على الأقل"); return; }
    setBusy(true);
    try {
      await apiClient.post("/admin/supplier/purchases", {
        supplier_id: supplierId,
        items: validItems.map(it => ({
          type: it.type,
          catalog_id: it.catalog_id || null,
          label: it.label.trim(),
          quantity: Number(it.quantity),
          unit_cost: Number(it.unit_cost),
        })),
        paid_amount: Number(paidAmount || 0),
        notes,
      });
      toast.success("تمَّ تسجيل عملية الشراء");
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الحفظ");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="purchase-form-dialog">
        <DialogHeader><DialogTitle>تسجيل عملية شراء من مورد</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>المورد *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger data-testid="purchase-supplier-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {suppliers.filter(s => s.is_active).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">البنود المشتراة</span>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 ms-1" /> سطر</Button>
            </div>
            {items.map((it, i) => {
              const opts = catalogs[it.type] || [];
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-end border-b pb-2">
                  <div className="col-span-2">
                    <Label className="text-xs">النوع</Label>
                    <Select value={it.type} onValueChange={(v) => updateItem(i, "type", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="card">💳 بطاقة شحن</SelectItem>
                        <SelectItem value="sim">📱 شريحة SIM</SelectItem>
                        <SelectItem value="idoom">🌐 Idoom</SelectItem>
                        <SelectItem value="iptv">📺 IPTV</SelectItem>
                        <SelectItem value="other">📦 أخرى</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Label className="text-xs">الفئة (من الكاتالوج)</Label>
                    {opts.length > 0 ? (
                      <Select value={it.catalog_id || "NONE"} onValueChange={(v) => onPickCatalog(i, v)}>
                        <SelectTrigger data-testid={`purchase-item-catalog-${i}`}><SelectValue placeholder="اختر..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">— إدخال يدوي —</SelectItem>
                          {opts.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={it.label} onChange={(e) => updateItem(i, "label", e.target.value)} placeholder="مثلاً Mobilis 1000" />
                    )}
                  </div>
                  <div className="col-span-2"><Label className="text-xs">الكمية</Label><Input type="number" min="1" value={it.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} /></div>
                  <div className="col-span-3"><Label className="text-xs">سعر الوحدة (دج)</Label><Input type="number" min="0" value={it.unit_cost} onChange={(e) => updateItem(i, "unit_cost", e.target.value)} /></div>
                  <div className="col-span-1">
                    <Button size="sm" variant="ghost" disabled={items.length === 1} onClick={() => removeItem(i)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                  </div>
                  {it.catalog_id && ["card", "sim", "idoom"].includes(it.type) && (
                    <div className="col-span-12 text-[11px] text-emerald-700 -mt-1">
                      ✓ مرتبط بالكاتالوج — يمكنك رفع {it.type === "sim" ? "ملف ICCID" : "ملف الأكواد"} لاحقاً من جدول المشتريات.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>المبلغ المدفوع الآن</Label>
              <Input type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} data-testid="purchase-paid" />
            </div>
            <div className="flex flex-col justify-end text-right">
              <div className="text-sm text-muted-foreground">الإجمالي: <strong className="text-foreground">{fmt(total)} دج</strong></div>
              <div className="text-base font-bold text-amber-700">المتبقي على المنصة: {fmt(balance)} دج</div>
            </div>
          </div>

          <div><Label>ملاحظات</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={busy} data-testid="purchase-save-btn">
            {busy ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : <Receipt className="h-4 w-4 ms-1" />} حفظ عملية الشراء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Payment dialog ──────────────────────────────────────────────────────
function PaymentDialog({ supplier, onClose, onDone }) {
  const [amount, setAmount] = useState(supplier.balance_due || 0);
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!amount || Number(amount) <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    setBusy(true);
    try {
      const res = await apiClient.post(`/admin/supplier/external-suppliers/${supplier.id}/payments`, {
        amount: Number(amount), method, notes,
      });
      toast.success(`تمَّ تسجيل دفعة ${fmt(amount)} دج — الرصيد الجديد: ${fmt(res.data.new_balance_due)} دج`);
      onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl" data-testid="payment-dialog">
        <DialogHeader><DialogTitle>تسجيل دفعة لـ {supplier.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm bg-amber-50 border border-amber-200 rounded p-2">
            الرصيد الحالي المستحَق علينا: <strong className="text-amber-800">{fmt(supplier.balance_due)} دج</strong>
          </div>
          <div><Label>المبلغ المدفوع *</Label><Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="payment-amount" /></div>
          <div>
            <Label>طريقة الدفع</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="transfer">تحويل بنكي</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>ملاحظات</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={busy} data-testid="payment-save-btn">
            {busy ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : <Banknote className="h-4 w-4 ms-1" />} تسجيل الدفعة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Upload codes/ICCIDs against a saved purchase (deferred upload) ──────
const TYPE_LABEL = { card: "بطاقات شحن", sim: "شرائح SIM", idoom: "أكواد Idoom" };

function UploadCodesForPurchaseDialog({ purchase, onClose, onDone }) {
  const uploadable = (purchase.items || [])
    .map((it, idx) => ({ ...it, idx }))
    .filter(it => ["card", "sim", "idoom"].includes(it.type) && it.catalog_id);

  const [selectedIdx, setSelectedIdx] = useState(uploadable[0]?.idx ?? null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = uploadable.find(it => it.idx === selectedIdx);

  const submit = async () => {
    if (selectedIdx === null) { toast.error("اختر بنداً"); return; }
    const codes = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (codes.length === 0) { toast.error("الصق أكواداً أولاً"); return; }
    setBusy(true);
    try {
      const params = new URLSearchParams({ item_index: String(selectedIdx), codes_text: text });
      const res = await apiClient.post(
        `/admin/supplier/purchases/${purchase.id}/upload-codes?${params.toString()}`,
      );
      const { inserted, skipped, total_so_far, expected } = res.data || {};
      toast.success(`✅ تمَّ رفع ${inserted} كود (تخطّي ${skipped}). الإجمالي: ${total_so_far}/${expected}`);
      setText("");
      // If user has finished uploading all items, close. Otherwise stay open.
      if (uploadable.length === 1) onDone();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل الرفع");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-xl" data-testid="upload-codes-purchase-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-emerald-600" /> رفع أكواد لعملية شراء
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs bg-slate-100 rounded p-2">
            عملية الشراء: <strong>{purchase.supplier_name}</strong> — تاريخ {purchase.purchase_date?.slice(0, 10)} —
            <strong> {fmt(purchase.total_cost)} دج</strong>
          </div>

          {uploadable.length === 0 ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 flex gap-2 items-start">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              لا توجد بنود قابلة لرفع الأكواد في هذه العملية. (يجب أن يكون النوع: بطاقة/شريحة/Idoom <strong>ومُختار من الكاتالوج</strong>.)
            </div>
          ) : (
            <>
              <div>
                <Label>اختر البند</Label>
                <Select value={selectedIdx !== null ? String(selectedIdx) : ""} onValueChange={(v) => setSelectedIdx(Number(v))}>
                  <SelectTrigger data-testid="upload-codes-item-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {uploadable.map(it => {
                      const so_far = Number(it.codes_uploaded || 0);
                      const expected = Number(it.quantity || 0);
                      const remaining = Math.max(0, expected - so_far);
                      return (
                        <SelectItem key={it.idx} value={String(it.idx)}>
                          {TYPE_LABEL[it.type]} — {it.label} ({so_far}/{expected} مرفوع، يتبقى {remaining})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {selected && (
                <div className="text-[11px] text-emerald-700 bg-emerald-50 rounded p-2">
                  📊 المتوقع: <strong>{selected.quantity}</strong> &nbsp;|&nbsp;
                  المرفوع حتى الآن: <strong>{selected.codes_uploaded || 0}</strong> &nbsp;|&nbsp;
                  المتبقي: <strong>{Math.max(0, Number(selected.quantity || 0) - Number(selected.codes_uploaded || 0))}</strong>
                </div>
              )}

              <div>
                <Label className="flex items-center gap-1">
                  <FileText className="h-3 w-3" /> الأكواد / ICCIDs (كود واحد في كل سطر)
                </Label>
                <textarea
                  rows={10}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full border rounded p-2 font-mono text-sm"
                  placeholder="123456789012345&#10;987654321098765&#10;# الأسطر التي تبدأ بـ # يتم تجاهلها"
                  data-testid="upload-codes-textarea"
                />
                <div className="text-[11px] text-muted-foreground mt-1">
                  💡 يمكنك أيضاً سحب وإفلات محتوى ملف نصي مباشرة، أو لصق قائمة من Excel.
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const content = await f.text();
                    setText(prev => (prev ? prev + "\n" : "") + content);
                  }}
                  className="text-xs"
                  data-testid="upload-codes-file"
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          {uploadable.length > 0 && (
            <Button onClick={submit} disabled={busy || !text.trim()} data-testid="upload-codes-submit">
              {busy ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : <Upload className="h-4 w-4 ms-1" />} رفع
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

