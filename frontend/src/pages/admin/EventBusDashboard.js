import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Layout } from "../../components/Layout";
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, RotateCw, Inbox, Zap, Database } from "lucide-react";
import { toast } from "sonner";
import apiClient from "../../lib/apiClient";

// Status → visual style
const STATUS_BADGE = {
  ok: { variant: "secondary", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  failed: { variant: "destructive", className: "bg-rose-100 text-rose-700 border-rose-200" },
  dlq: { variant: "destructive", className: "bg-amber-100 text-amber-800 border-amber-300" },
  processing: { variant: "outline", className: "bg-sky-50 text-sky-700 border-sky-200" },
};

const STATUS_LABEL = {
  ok: "✓ ناجح",
  failed: "✗ فشل",
  dlq: "⚠ في DLQ",
  processing: "… قيد المعالجة",
};

function StatBlock({ icon: Icon, label, value, tone = "slate" }) {
  const toneMap = {
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
  };
  return (
    <div
      data-testid={`event-bus-stat-${label}`}
      className={`p-4 rounded-lg border ${toneMap[tone]} flex items-center gap-3`}
    >
      <Icon className="w-6 h-6 opacity-80" />
      <div>
        <div className="text-xs opacity-70">{label}</div>
        <div className="text-2xl font-bold tabular-nums">{value ?? "—"}</div>
      </div>
    </div>
  );
}

export default function EventBusDashboard() {
  const [stats, setStats] = useState(null);
  const [processed, setProcessed] = useState([]);
  const [dlq, setDlq] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadAll = async () => {
    try {
      const [s, p, d, m] = await Promise.all([
        apiClient.get("/admin/event-bus/stats"),
        apiClient.get("/admin/event-bus/processed", {
          params: { limit: 100, ...(statusFilter ? { status: statusFilter } : {}), ...(typeFilter ? { event_type: typeFilter } : {}) },
        }),
        apiClient.get("/admin/event-bus/dlq", { params: { limit: 50 } }),
        apiClient.get("/admin/event-bus/movements", { params: { limit: 50 } }),
      ]);
      setStats(s.data);
      setProcessed(p.data || []);
      setDlq(d.data || []);
      setMovements(m.data || []);
    } catch (e) {
      toast.error("فشل تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(loadAll, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, statusFilter, typeFilter]);

  const replay = async (eventId) => {
    try {
      const r = await apiClient.post(`/admin/event-bus/replay/${eventId}`);
      if (r.data?.ok) {
        toast.success(`أُعيد إرسال الحدث (${r.data.replayed_as?.slice(0, 8)}…)`);
        loadAll();
      } else {
        toast.error(r.data?.error || "فشل إعادة الإرسال");
      }
    } catch (e) {
      toast.error("فشل إعادة الإرسال");
    }
  };

  const counts = stats?.last_24h || {};
  const topTypes = stats?.top_event_types || [];

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6" dir="rtl" data-testid="event-bus-page">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2 text-slate-800">
              <Zap className="w-7 h-7 text-amber-500" />
              ناقل الأحداث (Event Bus)
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              مراقبة Redis Streams، طابور المهملة (DLQ)، وحركة المخزون عبر النظام
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              data-testid="event-bus-toggle-autorefresh"
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh((v) => !v)}
            >
              <Activity className="w-4 h-4 ml-1" />
              {autoRefresh ? "تحديث تلقائي (5ث)" : "تحديث تلقائي متوقّف"}
            </Button>
            <Button data-testid="event-bus-refresh-btn" size="sm" variant="outline" onClick={loadAll}>
              <RefreshCw className="w-4 h-4 ml-1" /> تحديث
            </Button>
          </div>
        </div>

        {/* ── Stats ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatBlock icon={Database} label="طول الناقل" value={stats?.stream_len} tone="slate" />
          <StatBlock icon={Inbox} label="معلّق" value={stats?.pending} tone="sky" />
          <StatBlock icon={AlertTriangle} label="DLQ" value={stats?.dlq_len} tone="amber" />
          <StatBlock icon={CheckCircle2} label="نجح ٢٤س" value={counts.ok || 0} tone="emerald" />
          <StatBlock icon={RotateCw} label="قيد المعالجة" value={counts.processing || 0} tone="sky" />
          <StatBlock icon={AlertTriangle} label="فشل" value={counts.failed || 0} tone="rose" />
          <StatBlock icon={Activity} label="حالة Redis" value={stats?.available ? "متّصل" : "—"} tone={stats?.available ? "emerald" : "rose"} />
        </div>

        {/* ── Top Event Types ────────────────────────────────────────── */}
        {topTypes.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">أكثر الأحداث نشاطاً (آخر ٢٤ ساعة)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {topTypes.map((t) => (
                  <button
                    key={t.event_type}
                    data-testid={`event-type-pill-${t.event_type}`}
                    onClick={() => setTypeFilter(t.event_type)}
                    className="px-3 py-1.5 rounded-full text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 transition"
                  >
                    <span className="font-mono text-slate-700">{t.event_type}</span>
                    <span className="ml-2 inline-block bg-white px-1.5 rounded text-slate-600 font-bold">{t.count}</span>
                  </button>
                ))}
                {typeFilter && (
                  <button
                    onClick={() => setTypeFilter("")}
                    className="px-3 py-1.5 rounded-full text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition"
                  >
                    × مسح الفلتر
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Tabs ───────────────────────────────────────────────────── */}
        <Tabs defaultValue="processed" className="w-full">
          <TabsList className="grid grid-cols-3 w-full md:w-[480px]">
            <TabsTrigger value="processed" data-testid="event-bus-tab-processed">
              الأحداث المُعالجَة ({processed.length})
            </TabsTrigger>
            <TabsTrigger value="dlq" data-testid="event-bus-tab-dlq">
              DLQ ({dlq.length})
            </TabsTrigger>
            <TabsTrigger value="movements" data-testid="event-bus-tab-movements">
              حركة المخزون ({movements.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Processed ─────────────────────────────────────────── */}
          <TabsContent value="processed">
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex gap-2 items-center">
                  {["", "ok", "failed", "dlq", "processing"].map((s) => (
                    <Button
                      key={s || "all"}
                      data-testid={`event-bus-status-filter-${s || "all"}`}
                      size="sm"
                      variant={statusFilter === s ? "default" : "outline"}
                      onClick={() => setStatusFilter(s)}
                    >
                      {s ? STATUS_LABEL[s] : "الكل"}
                    </Button>
                  ))}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الحالة</TableHead>
                      <TableHead>النوع</TableHead>
                      <TableHead>المستأجر</TableHead>
                      <TableHead>محاولات</TableHead>
                      <TableHead>المعالج</TableHead>
                      <TableHead>وقت البدء</TableHead>
                      <TableHead>إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {processed.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                          {loading ? "جاري التحميل…" : "لا توجد أحداث بعد"}
                        </TableCell>
                      </TableRow>
                    )}
                    {processed.map((row) => {
                      const badge = STATUS_BADGE[row.status] || {};
                      return (
                        <TableRow key={row.event_id} data-testid={`event-row-${row.event_id}`}>
                          <TableCell>
                            <Badge variant={badge.variant} className={badge.className}>
                              {STATUS_LABEL[row.status] || row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.event_type}</TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {row.tenant_id === "platform" ? "🏢 platform" : row.tenant_id?.slice(0, 12)}
                          </TableCell>
                          <TableCell className="tabular-nums">{row.attempts}</TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">{row.consumer}</TableCell>
                          <TableCell className="text-xs text-slate-500" dir="ltr">
                            {row.started_at?.slice(0, 19).replace("T", " ")}
                          </TableCell>
                          <TableCell>
                            {row.status === "dlq" && (
                              <Button
                                data-testid={`event-replay-${row.event_id}`}
                                size="sm"
                                variant="outline"
                                onClick={() => replay(row.event_id)}
                              >
                                <RotateCw className="w-3 h-3 ml-1" /> إعادة
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── DLQ ───────────────────────────────────────────────── */}
          <TabsContent value="dlq">
            <Card>
              <CardContent className="pt-6">
                {dlq.length === 0 ? (
                  <div className="text-center text-emerald-600 py-8 flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-10 h-10" />
                    <div className="text-lg font-bold">DLQ فارغ — كل الأحداث تُعالَج بنجاح</div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>النوع</TableHead>
                        <TableHead>المستأجر</TableHead>
                        <TableHead>الخطأ</TableHead>
                        <TableHead>تاريخ الفشل</TableHead>
                        <TableHead>إعادة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dlq.map((row) => (
                        <TableRow key={row.event_id}>
                          <TableCell className="font-mono text-xs">{row.event_type}</TableCell>
                          <TableCell className="text-xs">{row.tenant_id?.slice(0, 12)}</TableCell>
                          <TableCell className="text-xs text-rose-600 max-w-md truncate" title={row.error_log}>
                            {row.error_log || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500" dir="ltr">
                            {row.finished_at?.slice(0, 19).replace("T", " ")}
                          </TableCell>
                          <TableCell>
                            <Button
                              data-testid={`dlq-replay-${row.event_id}`}
                              size="sm"
                              onClick={() => replay(row.event_id)}
                            >
                              <RotateCw className="w-3 h-3 ml-1" /> إعادة الإرسال
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Movements ─────────────────────────────────────────── */}
          <TabsContent value="movements">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>النوع</TableHead>
                      <TableHead>المستأجر</TableHead>
                      <TableHead>تفاصيل</TableHead>
                      <TableHead>التاريخ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                          لا توجد حركات بعد
                        </TableCell>
                      </TableRow>
                    ) : (
                      movements.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">{row.event_type}</TableCell>
                          <TableCell className="text-xs">
                            {row.tenant_id === "platform" ? "🏢" : row.tenant_id?.slice(0, 10)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600" dir="ltr">
                            {row.purchase_id && <span>purchase:{row.purchase_id?.slice(0, 8)} </span>}
                            {row.sale_id && <span>sale:{row.sale_id?.slice(0, 8)} </span>}
                            {row.order_id && <span>order:{row.order_id?.slice(0, 8)} </span>}
                            {row.by_type && (
                              <span>
                                {Object.entries(row.by_type)
                                  .map(([k, v]) => `${k}×${v}`)
                                  .join(", ")}
                              </span>
                            )}
                            {row.total !== undefined && <span> total={row.total}</span>}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500" dir="ltr">
                            {row.created_at?.slice(0, 19).replace("T", " ")}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
