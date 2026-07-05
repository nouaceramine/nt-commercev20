/** Code trace tool — searches a card/SIM/Idoom code across purchases & sales. */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Badge } from "../../../components/ui/badge";
import { toast } from "sonner";
import apiClient from "../../../lib/apiClient";
import { downloadCsv, todayStamp } from "../../../lib/csvExport";
import { Loader2, Search, Package, Truck, Receipt, CheckCircle2, XCircle, FileText, Users } from "lucide-react";
import { fmt } from "./format";

const STATUS_META = {
  available: { color: "bg-emerald-100 text-emerald-800", icon: CheckCircle2, label: "متاح في المخزون" },
  reserved:  { color: "bg-amber-100 text-amber-800",     icon: Loader2,      label: "محجوز" },
  sold:      { color: "bg-blue-100 text-blue-800",       icon: Package,      label: "تم البيع" },
};

const STOCK_TYPE_LABELS = { card: "بطاقة شحن", sim: "شريحة SIM (ICCID)", idoom: "كود Idoom" };

export function CodeTraceCard() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const search = async () => {
    const q = code.trim();
    if (!q) { toast.error("أدخل كوداً للبحث"); return; }
    setBusy(true);
    setResult(null);
    try {
      const res = await apiClient.get(`/admin/supplier/trace?code=${encodeURIComponent(q)}`);
      setResult(res.data);
      if (!res.data.found) toast.warning("لم يُعثر على الكود في أي مخزون");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل البحث");
    } finally { setBusy(false); }
  };

  // Bulk: trace many codes at once → download CSV
  const bulkExport = async () => {
    const codes = bulkText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (codes.length === 0) { toast.error("الصق قائمة أكواد أولاً (سطر لكل كود)"); return; }
    if (codes.length > 500) { toast.error("الحد الأقصى 500 كود في كل عملية"); return; }
    setBulkBusy(true);
    try {
      // Fan-out tracer calls in parallel (browser caps the concurrency anyway)
      const results = await Promise.allSettled(
        codes.map(c => apiClient.get(`/admin/supplier/trace?code=${encodeURIComponent(c)}`).then(r => r.data))
      );
      const rows = results.map((r, i) => {
        if (r.status !== "fulfilled" || !r.value.found) {
          return [codes[i], "غير موجود", "", "", "", "", "", "", "", "", ""];
        }
        const d = r.value;
        return [
          d.code,
          STOCK_TYPE_LABELS[d.stock_type] || d.stock_type,
          d.catalog?.operator || "",
          d.catalog?.denomination || d.catalog?.name_ar || "",
          d.status || "",
          d.origin?.supplier_name || "",
          d.origin?.purchase_date || "",
          d.origin?.unit_cost ?? "",
          d.sale?.tenant_name || "",
          d.sale?.sold_unit_price ?? "",
          d.unit_profit ?? "",
        ];
      });
      const headers = ["الكود", "النوع", "المُشغِّل", "الفئة", "الحالة", "المورد", "تاريخ الشراء", "سعر التكلفة", "المستأجر المشتري", "سعر البيع", "الربح"];
      downloadCsv(`code-trace-${todayStamp()}-${codes.length}codes.csv`, headers, rows);
      const foundCount = results.filter(r => r.status === "fulfilled" && r.value.found).length;
      toast.success(`✅ صُدِّر تتبُّع ${foundCount}/${codes.length} كود إلى CSV`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل التصدير");
    } finally { setBulkBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between flex-wrap gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-indigo-600" /> تتبُّع كود في سلسلة التوريد
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            الصق أي كود (بطاقة شحن، ICCID شريحة، أو كود Idoom) وسيعرض لك النظام رحلته الكاملة.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setBulkMode(!bulkMode)} data-testid="trace-toggle-bulk">
          {bulkMode ? "🔍 وضع البحث المفرد" : "📥 وضع التتبُّع الجماعي (CSV)"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {bulkMode ? (
          <>
            <div className="text-xs bg-indigo-50 border border-indigo-200 rounded p-2 text-indigo-900">
              💡 الصق قائمة من الأكواد (سطر لكل كود — حتى 500 كود) ثم اضغط تصدير. ستحصل على ملف CSV
              بتفاصيل المصدر، الحالة، والمشتري لكل كود — مثالي للجرد والمراجعة.
            </div>
            <textarea
              rows={10}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="w-full border rounded p-2 font-mono text-sm"
              placeholder="ICCID-A7F3B2D9...&#10;ICCID-FB28C100...&#10;1234567890..."
              data-testid="trace-bulk-textarea"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {bulkText.split(/\r?\n/).filter(s => s.trim()).length} كود مُدخَل
              </span>
              <Button onClick={bulkExport} disabled={bulkBusy} data-testid="trace-bulk-export">
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : <FileText className="h-4 w-4 ms-1" />} تصدير CSV
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                placeholder="مثال: ICCID-A7F3B2D9... أو 1234567890"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                className="font-mono"
                data-testid="trace-code-input"
              />
              <Button onClick={search} disabled={busy} data-testid="trace-search-btn">
                {busy ? <Loader2 className="h-4 w-4 animate-spin ms-1" /> : <Search className="h-4 w-4 ms-1" />} ابحث
              </Button>
            </div>

            {result && !result.found && (
              <div className="bg-rose-50 border border-rose-200 rounded p-4 text-rose-800 flex gap-2 items-center" data-testid="trace-not-found">
                <XCircle className="h-5 w-5" />
                <div>
                  <div className="font-semibold">الكود غير موجود</div>
                  <div className="text-xs">الكود <span className="font-mono">{result.code}</span> لم يُسجَّل في أي من مخازن البطاقات / الشرائح / Idoom.</div>
                </div>
              </div>
            )}
          </>
        )}

        {result?.found && !bulkMode && (
          <div className="space-y-3" data-testid="trace-result">
            {/* Header card */}
            <div className="bg-gradient-to-l from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-mono text-base font-bold">{result.code}</span>
                <Badge>{STOCK_TYPE_LABELS[result.stock_type]}</Badge>
                <StatusBadge status={result.status} />
              </div>
              {result.catalog && (
                <div className="text-sm text-muted-foreground">
                  {result.catalog.operator && <>المُشغِّل: <strong>{result.catalog.operator}</strong> · </>}
                  {result.catalog.tier && <>المستوى: <strong>{result.catalog.tier === "wholesale" ? "جملة" : "تجزئة"}</strong> · </>}
                  {result.catalog.denomination && <>الفئة: <strong>{result.catalog.denomination} دج</strong> · </>}
                  {result.catalog.name_ar && <>{result.catalog.name_ar}</>}
                </div>
              )}
            </div>

            {/* Journey timeline */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <TimelineStep
                icon={<Truck className="h-5 w-5 text-purple-600" />}
                title="١. المنشأ (Origin)"
                empty={!result.origin}
                emptyMsg="لم يُسجَّل مصدر — كود قديم قبل نظام التتبُّع"
              >
                {result.origin && (
                  <>
                    <div className="text-sm font-semibold">{result.origin.supplier_name || "—"}</div>
                    {result.origin.supplier_phone && <div className="text-xs font-mono text-muted-foreground">📞 {result.origin.supplier_phone}</div>}
                    <div className="text-xs mt-1">تاريخ الشراء: <strong>{result.origin.purchase_date?.slice(0, 10)}</strong></div>
                    {result.origin.unit_cost != null && (
                      <div className="text-xs mt-1">سعر التكلفة: <strong className="text-rose-700">{fmt(result.origin.unit_cost)} دج</strong></div>
                    )}
                  </>
                )}
              </TimelineStep>

              <TimelineStep
                icon={<Package className="h-5 w-5 text-emerald-600" />}
                title="٢. الحالة الحالية"
              >
                <div className="text-sm">
                  <StatusBadge status={result.status} />
                </div>
                {result.created_at && (
                  <div className="text-xs text-muted-foreground mt-2">
                    تاريخ الدخول للمخزون: {new Date(result.created_at).toLocaleString("ar-DZ")}
                  </div>
                )}
              </TimelineStep>

              <TimelineStep
                icon={<Users className="h-5 w-5 text-blue-600" />}
                title="٣. البيع"
                empty={!result.sale}
                emptyMsg={result.status === "available" ? "لم يُبَع بعد — متاح في المخزون" : "غير متاح"}
              >
                {result.sale && (
                  <>
                    <div className="text-sm font-semibold">{result.sale.tenant_name}</div>
                    {result.sale.sold_at && (
                      <div className="text-xs mt-1">تاريخ البيع: <strong>{new Date(result.sale.sold_at).toLocaleString("ar-DZ")}</strong></div>
                    )}
                    {result.sale.sold_unit_price != null && (
                      <div className="text-xs mt-1">سعر البيع: <strong className="text-emerald-700">{fmt(result.sale.sold_unit_price)} دج</strong></div>
                    )}
                  </>
                )}
              </TimelineStep>
            </div>

            {/* Profit bar */}
            {result.unit_profit != null && (
              <div className={`rounded-lg p-3 border-2 ${result.unit_profit >= 0 ? "bg-emerald-50 border-emerald-300" : "bg-rose-50 border-rose-300"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">💹 الربح من هذا الكود</span>
                  <span className={`text-xl font-bold ${result.unit_profit >= 0 ? "text-emerald-700" : "text-rose-700"}`} data-testid="trace-unit-profit">
                    {result.unit_profit >= 0 ? "+" : ""}{fmt(result.unit_profit)} دج
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  = سعر البيع ({fmt(result.sale?.sold_unit_price || 0)}) − سعر التكلفة ({fmt(result.origin?.unit_cost || 0)})
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { color: "bg-gray-100 text-gray-700", label: status || "—" };
  return <Badge className={meta.color}>{meta.label}</Badge>;
}

function TimelineStep({ icon, title, children, empty, emptyMsg }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {empty ? (
        <div className="text-xs text-muted-foreground italic">{emptyMsg}</div>
      ) : children}
    </div>
  );
}


