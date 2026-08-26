import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Clock, ChefHat, CheckCircle2, RefreshCw } from "lucide-react";
import apiClient from "../lib/apiClient";
import { startRealtime, onEvent, stopRealtime } from "../lib/realtime";
import { toast } from "sonner";

// p306: شاشة مطبخ حية (KDS) — 3 أعمدة حسب الحالة + تحديث لحظي عبر SSE
const COLS = [
  { status: "pending", label: "جديد", color: "text-amber-600" },
  { status: "preparing", label: "قيد التحضير", color: "text-blue-600" },
  { status: "served", label: "جاهز", color: "text-emerald-600" },
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
    const un1 = onEvent("kitchen_order.created", fetchOrders);
    const un2 = onEvent("kitchen_order.updated", fetchOrders);
    const poll = setInterval(fetchOrders, 15000);
    timer.current = setInterval(() => setTick((t) => t + 1), 30000);
    return () => { un1 && un1(); un2 && un2(); clearInterval(poll); clearInterval(timer.current); stopRealtime(); };
  }, [fetchOrders]);
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
        <Button variant="outline" size="sm" onClick={fetchOrders} data-testid="kds-refresh">
          <RefreshCw className="h-4 w-4 ml-1" /> تحديث
        </Button>
      </div>
      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLS.map((col) => {
            const list = orders.filter((o) => o.status === col.status);
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
                        <p className="text-xs text-muted-foreground">الطاولة: {o.table_name} — {o.waiter_name || "-"}</p>
                        <ul className="text-sm space-y-0.5">
                          {(o.items || []).map((it, i) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span>{it.product_name}</span>
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
    </div>
  );
}
