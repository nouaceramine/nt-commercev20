/**
 * Platform Financial Management — Money dashboard for the platform-as-supplier.
 *
 * Sub-tabs: لوحة المعلومات | الموردون | المشتريات
 * Backend contract: /app/backend/routes/saas/platform_finance_routes.py
 */
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Badge } from "../../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { toast } from "sonner";
import apiClient from "../../../lib/apiClient";
import { downloadCsv, todayStamp } from "../../../lib/csvExport";
import { printFinanceMonthlyReport } from "../../../lib/financeMonthlyReport";
import { Loader2, Plus, Trash2, TrendingUp, TrendingDown, Wallet, Users, Truck, Receipt, Pencil, Banknote, AlertTriangle, RefreshCw, Upload, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

import { fmt } from "./format";
import { KpiCard } from "./KpiCard";
import { SupplierFormDialog, PaymentDialog } from "./SupplierDialogs";
import { PurchaseFormDialog, UploadCodesForPurchaseDialog } from "./PurchaseDialogs";
import { CodeTraceCard } from "./CodeTraceCard";
import { ProductProfitabilityCard } from "./ProductProfitabilityCard";
import { AiBillingCard } from "./AiBillingCard";  // p224
import { PlatformCommissionsCard } from "./PlatformCommissionsCard";  // p267

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

  useEffect(() => { loadAll(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <Button
            variant="outline" size="sm"
            disabled={!summary || loading}
            onClick={() => {
              const res = printFinanceMonthlyReport({ rangeDays: days, summary });
              if (!res.ok && res.reason === "popup_blocked") toast.error("اسمح بالنوافذ المنبثقة للطباعة");
            }}
            data-testid="finance-print-pdf-btn"
          >
            <FileText className="h-4 w-4 me-1" /> طباعة / PDF
          </Button>
        </div>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          <TabsTrigger value="dashboard" data-testid="finance-tab-dashboard">📊 لوحة المعلومات</TabsTrigger>
          <TabsTrigger value="suppliers" data-testid="finance-tab-suppliers">🏭 الموردون ({suppliers.length})</TabsTrigger>
          <TabsTrigger value="purchases" data-testid="finance-tab-purchases">📦 المشتريات ({purchases.length})</TabsTrigger>
          <TabsTrigger value="profitability" data-testid="finance-tab-profitability">🎯 ربحية المنتج</TabsTrigger>
          <TabsTrigger value="trace" data-testid="finance-tab-trace">🔍 تتبُّع كود</TabsTrigger>
          <TabsTrigger value="ai-billing" data-testid="finance-tab-ai-billing">🤖 فوترة الذكاء</TabsTrigger>
          <TabsTrigger value="platform-commissions" data-testid="finance-tab-pcom">💰 عمولات المنصة</TabsTrigger>
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

          {/* Daily trend chart — only render when we have data */}
          {(summary?.daily_trend?.length || 0) > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-indigo-600" /> اتجاه الإيرادات/التكاليف اليومي</CardTitle></CardHeader>
              <CardContent>
                <div style={{ width: "100%", height: 260 }} data-testid="finance-trend-chart">
                  <ResponsiveContainer>
                    <LineChart data={summary.daily_trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => (d || "").slice(5)} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
                      <Tooltip formatter={(v) => `${Number(v).toLocaleString("ar-DZ")} دج`} labelStyle={{ direction: "ltr" }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="revenue" name="إيرادات" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="cost"    name="تكاليف" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="profit"  name="ربح"    stroke="#6366f1" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
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

        {/* ── TRACE ────────────────────────────────────────────────────── */}
        <TabsContent value="trace" className="mt-3">
          <CodeTraceCard />
        </TabsContent>

        <TabsContent value="ai-billing" className="space-y-4 mt-3">
          <AiBillingCard />
        </TabsContent>
        <TabsContent value="platform-commissions" className="mt-3">
          <PlatformCommissionsCard />
        </TabsContent>

        {/* ── PRODUCT PROFITABILITY ─────────────────────────────────────── */}
        <TabsContent value="profitability" className="mt-3">
          <ProductProfitabilityCard />
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
