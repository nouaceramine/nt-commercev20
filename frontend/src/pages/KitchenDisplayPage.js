import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Clock, ChefHat, CheckCircle2, RefreshCw, Printer } from "lucide-react";  // p338
import apiClient from "../lib/apiClient";
import { startRealtime, onEvent, stopRealtime } from "../lib/realtime";
import { toast } from "sonner";

// p306: شاشة مطبخ حية (KDS) — 3 أعمدة حسب الحالة + تحديث لحظي عبر SSE
const COLS = [
  { status: "pending", label: "جديد", color: "text-amber-600" },
  { status: "preparing", label: "قيد التحضير", color: "text-blue-600" },
  { status: "served", label: "جاهز", color: "text-emerald-600" },
];
// p338: هوية مصدر الطلب — تُفرّق QR الزبون عن النادل والكاشير والتوصيل والمطبخ
const SRC = {
  qr: { label: "QR زبون", cls: "bg-sky-600" },
  waiter: { label: "نادل", cls: "bg-violet-600" },
  pos: { label: "كاشير", cls: "bg-neutral-600" },
  kitchen: { label: "مطبخ", cls: "bg-emerald-700" },
  delivery: { label: "توصيل", cls: "bg-orange-600" },
};
const SRC_FILTERS = [
  { v: "all", label: "كل المصادر" },
  { v: "qr", label: "QR" },
  { v: "pos", label: "كاشير" },
  { v: "waiter", label: "نادل" },
  { v: "delivery", label: "توصيل" },
  { v: "kitchen", label: "مطبخ" },
];

const elapsedMin = (iso) => {
  if (!iso) return 0;
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  return Math.max(0, Math.floor(m));
};
export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const timer = useRef(null);
  // p338: طبع تلقائي + فلتر المصدر + تذكرة الطبع
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem("kds_autoprint") === "1");
  const [srcFilter, setSrcFilter] = useState("all");
  const [ticket, setTicket] = useState(null);

  const printOrder = useCallback(async (orderId) => {
    try {
      const res = await apiClient.get("/restaurant/kitchen-orders?all=1");
      const o = (res.data || []).find((x) => x.id === orderId);
      if (!o) return;
      setTicket(o);
      setTimeout(() => { try { window.print(); } catch (e) {} }, 400);
    } catch (e) { /* الطبع التلقائي صامت */ }
  }, []);

  const toggleAutoPrint = () => {
    const v = !autoPrint;
    setAutoPrint(v);
    localStorage.setItem("kds_autoprint", v ? "1" : "0");
    toast.success(v ? "الطبع التلقائي مفعّل — كل طلب جديد يُطبع فورًا" : "الطبع التلقائي متوقف");
  };
  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiClient.get("/restaurant/kitchen-orders");
      setOrders(res.data || []);
    } catch (e) { /* عرض خفيف: لا إزعاج عند فشل جلب دوري */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    fetchOrders();
    startRealtime();
    const un1 = onEvent("kitchen_order.created", (payload) => {
      fetchOrders();
      if (autoPrint && payload?.order_id) printOrder(payload.order_id);  // p338
    });
    const un2 = onEvent("kitchen_order.updated", fetchOrders);
    const poll = setInterval(fetchOrders, 15000);
    timer.current = setInterval(() => setTick((t) => t + 1), 30000);
    return () => { un1 && un1(); un2 && un2(); clearInterval(poll); clearInterval(timer.current); stopRealtime(); };
  }, [fetchOrders, autoPrint, printOrder]);  // p338
  const setStatus = async (o, status) => {
    try {
      await apiClient.put(`/restaurant/kitchen-orders/${o.id}/status`, { status });
      fetchOrders();
    } catch (e) { toast.error(e.response?.data?.detail || "تعذر تحديث الحالة"); }
  };
  return (
    <div className="min-h-screen bg-background p-4 space-y-4" dir="rtl" data-testid="kds-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ChefHat className="h-7 w-7" /> شاشة المطبخ</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* p338: فلترة حسب مصدر الطلب */}
          <div className="flex gap-1">
            {SRC_FILTERS.map((f) => (
              <Button key={f.v} size="sm" variant={srcFilter === f.v ? "default" : "outline"}
                onClick={() => setSrcFilter(f.v)} data-testid={`kds-src-${f.v}`}>
                {f.label}
              </Button>
            ))}
          </div>
          <Button variant={autoPrint ? "default" : "outline"} size="sm" onClick={toggleAutoPrint} data-testid="kds-autoprint">
            <Printer className="h-4 w-4 ml-1" /> {autoPrint ? "الطبع التلقائي: مفعّل" : "الطبع التلقائي: متوقف"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchOrders} data-testid="kds-refresh">
            <RefreshCw className="h-4 w-4 ml-1" /> تحديث
          </Button>
        </div>
      </div>
      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLS.map((col) => {
            const list = orders.filter((o) => o.status === col.status && (srcFilter === 'all' || (o.source || 'pos') === srcFilter));  // p338
            return (
              <div key={col.status} className="space-y-3" data-testid={`kds-col-${col.status}`}>
                <h2 className={`font-semibold flex items-center gap-2 ${col.color}`}>
                  {col.label} <Badge variant="secondary">{list.length}</Badge>
                </h2>
                {list.length === 0 && <p className="text-xs text-muted-foreground">لا طلبات</p>}
                {list.map((o) => {
                  const mins = elapsedMin(o.created_at);
                  const late = col.status !== "served" && mins >= 15;
                  return (
                    <Card key={o.id} className={late ? "border-destructive" : ""} data-testid={`kds-order-${o.id}`}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{o.code}</span>
                          <span className={`flex items-center gap-1 text-xs ${late ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                            <Clock className="h-3 w-3" /> {mins} د
                          </span>
                        </div>
                        {/* p338: شارة المصدر + المنشئ + حالة الدفع */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">الطاولة: {o.table_name || "—"}</span>
                          <span className={`text-[10px] text-white rounded-full px-2 py-0.5 font-bold ${(SRC[o.source] || SRC.pos).cls}`} data-testid={`kds-source-${o.id}`}>
                            {(SRC[o.source] || SRC.pos).label}{o.created_by && !["QR"].includes(o.created_by) ? `: ${o.created_by}` : ""}
                          </span>
                          {o.payment_status === "unpaid" && (
                            <span className="text-[10px] text-white rounded-full px-2 py-0.5 font-bold bg-red-600" data-testid={`kds-unpaid-${o.id}`}>غير مدفوع</span>
                          )}
                          {o.payment_status === "paid" && (
                            <span className="text-[10px] text-white rounded-full px-2 py-0.5 font-bold bg-emerald-600" data-testid={`kds-paid-${o.id}`}>مدفوع</span>
                          )}
                        </div>
                        <ul className="text-sm space-y-0.5">
                          {(o.items || []).map((it, i) => (
                            <li key={i} className="flex justify-between gap-2 border-b border-dashed last:border-0 pb-1">
                              <span>
                                {it.product_name}
                                {/* p338: الإضافات بأخضر والحذوفات/الملاحظات بأحمر — يراها الطاهي بوضوح */}
                                {(it.modifiers || []).length > 0 && (
                                  <span className="block text-xs font-bold text-emerald-700" data-testid={`kds-mods-${o.id}-${i}`}>
                                    {(it.modifiers || []).map((m) => `+ ${m.option}`).join(" · ")}
                                  </span>
                                )}
                                {it.note && (
                                  <span className="block text-xs font-bold text-red-600" data-testid={`kds-note-${o.id}-${i}`}>ملاحظة: {it.note}</span>
                                )}
                              </span>
                              <span className="font-mono">×{it.quantity}</span>
                            </li>
                          ))}
                        </ul>
                        {o.notes && <p className="text-xs text-amber-700 bg-amber-50 rounded p-1">{o.notes}</p>}
                        <div className="flex gap-2 pt-1">
                          {col.status === "pending" && (
                            <Button className="flex-1 min-h-[44px]" onClick={() => setStatus(o, "preparing")} data-testid={`kds-start-${o.id}`}>بدء التحضير</Button>
                          )}
                          {col.status === "preparing" && (
                            <Button className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700" onClick={() => setStatus(o, "served")} data-testid={`kds-ready-${o.id}`}>
                              <CheckCircle2 className="h-4 w-4 ml-1" /> جاهز
                            </Button>
                          )}
                          {col.status !== "served" && (
                            <Button variant="outline" className="min-h-[44px]" onClick={() => setStatus(o, "cancelled")} data-testid={`kds-cancel-${o.id}`}>إلغاء</Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {/* p338: تذكرة الطبع التلقائي — مخفية على الشاشة، تظهر عند الطبع فقط */}
      {ticket && (
        <div id="kds-ticket" className="hidden print:block" dir="rtl" data-testid="kds-ticket">
          <style>{`@media print { body * { visibility: hidden; } #kds-ticket, #kds-ticket * { visibility: visible; } #kds-ticket { position: absolute; inset: 0; background: #fff; color: #000; padding: 24px; font-family: monospace; } }`}</style>
          <div style={{ textAlign: 'center', borderBottom: '2px dashed #000', paddingBottom: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>طلب {ticket.code}</div>
            <div style={{ fontSize: 16 }}>الطاولة: {ticket.table_name || '—'} · المصدر: {(SRC[ticket.source] || SRC.pos).label}{ticket.created_by && ticket.created_by !== 'QR' ? ` · ${ticket.created_by}` : ''}</div>
            <div style={{ fontSize: 14 }}>{new Date(ticket.created_at).toLocaleString('ar-DZ')}</div>
          </div>
          <ul style={{ fontSize: 18, lineHeight: 1.9, listStyle: 'none', padding: 0 }}>
            {(ticket.items || []).map((it, i) => (
              <li key={i} style={{ borderBottom: '1px solid #ccc', padding: '4px 0' }}>
                <b>×{it.quantity}</b> {it.product_name}
                {(it.modifiers || []).map((m, j) => (<div key={j} style={{ fontSize: 15 }}>+ {m.option}{m.price_delta ? ` (+${m.price_delta})` : ''}</div>))}
                {it.note && <div style={{ fontSize: 15, fontWeight: 700 }}>ملاحظة: {it.note}</div>}
              </li>
            ))}
          </ul>
          {ticket.notes && <div style={{ border: '2px solid #000', padding: 8, marginTop: 8, fontWeight: 700 }}>ملاحظات الطلب: {ticket.notes}</div>}
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 16 }}>الإجمالي: {ticket.total ?? 0} دج</div>
        </div>
      )}
    </div>
  );
}
