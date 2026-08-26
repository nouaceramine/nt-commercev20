import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Bike, Plus, Trash2, RefreshCw, MapPin, Phone, User } from "lucide-react";
import apiClient from "../lib/apiClient";
import { startRealtime, onEvent, stopRealtime } from "../lib/realtime";
import { toast } from "sonner";

// p316: طلبات التوصيل للمطاعم — إنشاء + تعيين سائق + تتبع حالة + تحصيل
const STATUSES = [
  { key: "pending", label: "بانتظار التحضير" },
  { key: "ready", label: "جاهز للانطلاق" },
  { key: "out_for_delivery", label: "في الطريق" },
  { key: "delivered", label: "مُسلَّم" },
  { key: "cancelled", label: "ملغى" },
];
const fmt = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString("fr-DZ");

export default function DeliveryPage() {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [products, setProducts] = useState([]);
  const [cust, setCust] = useState({ name: "", phone: "", address: "", driver: "", fee: "", notes: "" });
  const [lines, setLines] = useState([]);
  const [pickId, setPickId] = useState("");
  const [driverFor, setDriverFor] = useState(null);
  const [driverName, setDriverName] = useState("");
  const [collectFor, setCollectFor] = useState(null);
  const [saleId, setSaleId] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([
        apiClient.get("/restaurant/delivery-orders"),
        apiClient.get("/restaurant/delivery-orders-summary"),
      ]);
      setOrders(o.data || []);
      setSummary(s.data || null);
    } catch (e) { /* جلب دوري صامت */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();
    startRealtime();
    const un1 = onEvent("delivery_order.created", fetchAll);
    const un2 = onEvent("delivery_order.updated", fetchAll);
    const poll = setInterval(fetchAll, 20000);
    return () => { un1 && un1(); un2 && un2(); clearInterval(poll); stopRealtime(); };
  }, [fetchAll]);

  const openNew = async () => {
    setShowNew(true);
    if (!products.length) {
      try {
        const r = await apiClient.get("/products");
        setProducts((r.data || []).filter((p) => p.is_active !== false));
      } catch (e) { /* تُركت فارغة */ }
    }
  };

  const addLine = () => {
    const p = products.find((x) => x.id === pickId);
    if (!p) return;
    setLines((prev) => [...prev, { product_id: p.id, product_name: p.name, quantity: 1, unit_price: p.retail_price || 0 }]);
    setPickId("");
  };
  const setQty = (i, q) => setLines((prev) => prev.map((l, j) => j === i ? { ...l, quantity: Math.max(0.5, q) } : l));
  const subtotal = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const total = subtotal + (parseFloat(cust.fee) || 0);

  const create = async () => {
    if (!cust.name.trim()) { toast.error("اسم الزبون مطلوب"); return; }
    if (!lines.length) { toast.error("أضف عنصرًا واحدًا على الأقل"); return; }
    try {
      await apiClient.post("/restaurant/delivery-orders", {
        customer_name: cust.name, customer_phone: cust.phone || null, address: cust.address || null,
        items: lines, delivery_fee: parseFloat(cust.fee) || 0,
        driver_name: cust.driver || null, notes: cust.notes || null,
      });
      toast.success("أُرسل الطلب للمطبخ");
      setShowNew(false); setLines([]); setCust({ name: "", phone: "", address: "", driver: "", fee: "", notes: "" });
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || "تعذر إنشاء الطلب"); }
  };

  const setStatus = async (o, status, driver) => {
    try {
      await apiClient.put(`/restaurant/delivery-orders/${o.id}/status`, { status, driver_name: driver || null });
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || "تعذر تحديث الحالة"); }
  };
  const collect = async () => {
    if (!saleId.trim()) { toast.error("أدخل رقم الفاتورة"); return; }
    try {
      await apiClient.post(`/restaurant/delivery-orders/${collectFor.id}/collect`, { sale_id: saleId.trim() });
      toast.success("تم التحصيل والإنهاء");
      setCollectFor(null); setSaleId(""); fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || "تعذر التحصيل"); }
  };

  return (
    <div className="p-4 space-y-4" dir="rtl" data-testid="delivery-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Bike className="h-7 w-7" /> طلبات التوصيل</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} data-testid="dlv-refresh"><RefreshCw className="h-4 w-4 ml-1" /> تحديث</Button>
          <Button size="sm" onClick={openNew} data-testid="dlv-new-btn"><Plus className="h-4 w-4 ml-1" /> طلب توصيل</Button>
        </div>
      </div>
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">نشطة الآن</p>
            <p className="text-xl font-bold" data-testid="dlv-active">{(summary.by_status?.pending || 0) + (summary.by_status?.ready || 0) + (summary.by_status?.out_for_delivery || 0)}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">مُسلَّمة (30 يوم)</p>
            <p className="text-xl font-bold" data-testid="dlv-delivered">{summary.by_status?.delivered || 0}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">إيراد التوصيل</p>
            <p className="text-xl font-bold" data-testid="dlv-revenue">{fmt(summary.delivered_revenue)} دج</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">رسوم التوصيل</p>
            <p className="text-xl font-bold" data-testid="dlv-fees">{fmt(summary.delivered_fees)} دج</p></CardContent></Card>
        </div>
      )}
      {loading ? <p className="text-muted-foreground">جارٍ التحميل...</p> : (
        <div className="space-y-3">
          {orders.length === 0 && <p className="text-muted-foreground text-sm">لا طلبات توصيل بعد — أنشئ أول طلب.</p>}
          {orders.map((o) => (
            <Card key={o.id} data-testid={`dlv-order-${o.id}`}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{o.code}</span>
                    <Badge variant={o.status === "delivered" ? "default" : o.status === "cancelled" ? "destructive" : "secondary"}>
                      {STATUSES.find((s) => s.key === o.status)?.label || o.status}
                    </Badge>
                    {o.kitchen_code && <span className="text-xs text-muted-foreground">مطبخ: {o.kitchen_code}</span>}
                  </div>
                  <span className="font-bold">{fmt(o.total)} دج</span>
                </div>
                <div className="text-sm text-muted-foreground flex flex-wrap gap-4">
                  <span className="flex items-center gap-1"><User className="h-3 w-3" /> {o.customer_name}</span>
                  {o.customer_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {o.customer_phone}</span>}
                  {o.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {o.address}</span>}
                  {o.driver_name && <span className="flex items-center gap-1"><Bike className="h-3 w-3" /> {o.driver_name}</span>}
                </div>
                <ul className="text-sm space-y-0.5">
                  {(o.items || []).map((it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{it.product_name}</span><span className="font-mono">×{it.quantity}</span>
                    </li>
                  ))}
                </ul>
                {!["delivered", "cancelled"].includes(o.status) && (
                  <div className="flex gap-2 pt-1 flex-wrap">
                    {o.status === "pending" && (
                      <Button size="sm" className="min-h-[44px]" onClick={() => setStatus(o, "ready")} data-testid={`dlv-ready-${o.id}`}>جاهز</Button>
                    )}
                    {o.status === "ready" && (
                      <Button size="sm" className="min-h-[44px]" onClick={() => { setDriverFor(o); setDriverName(o.driver_name || ""); }} data-testid={`dlv-assign-${o.id}`}>تعيين سائق وانطلاق</Button>
                    )}
                    {o.status === "out_for_delivery" && (
                      <>
                        <Button size="sm" className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700" onClick={() => { setCollectFor(o); setSaleId(""); }} data-testid={`dlv-collect-${o.id}`}>تحصيل وتسليم</Button>
                        <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => setStatus(o, "delivered")} data-testid={`dlv-done-${o.id}`}>تسليم دون فاتورة</Button>
                      </>
                    )}
                    <Button size="sm" variant="outline" className="min-h-[44px]" onClick={() => setStatus(o, "cancelled")} data-testid={`dlv-cancel-${o.id}`}>إلغاء</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg" data-testid="dlv-new-dialog">
          <DialogHeader><DialogTitle>طلب توصيل جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="اسم الزبون *" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} data-testid="dlv-cust-name" />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="الهاتف" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} data-testid="dlv-cust-phone" />
              <Input placeholder="رسوم التوصيل (دج)" inputMode="decimal" value={cust.fee} onChange={(e) => setCust({ ...cust, fee: e.target.value })} data-testid="dlv-fee" />
            </div>
            <Input placeholder="العنوان" value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} data-testid="dlv-address" />
            <Input placeholder="السائق (اختياري الآن)" value={cust.driver} onChange={(e) => setCust({ ...cust, driver: e.target.value })} data-testid="dlv-driver" />
            <div className="flex gap-2">
              <select className="flex-1 border rounded-lg p-2 bg-background text-sm" value={pickId} onChange={(e) => setPickId(e.target.value)} data-testid="dlv-product-select">
                <option value="">— اختر منتجًا —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.retail_price)} دج</option>)}
              </select>
              <Button variant="outline" onClick={addLine} data-testid="dlv-add-line">إضافة</Button>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-sm border rounded-lg p-2">
                <span className="flex-1">{l.product_name}</span>
                <Input type="number" className="w-20" value={l.quantity} min="0.5" step="0.5"
                  onChange={(e) => setQty(i, parseFloat(e.target.value) || 1)} data-testid={`dlv-qty-${i}`} />
                <span className="font-mono w-20 text-left">{fmt(l.unit_price * l.quantity)}</span>
                <Button size="sm" variant="ghost" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="flex justify-between font-bold border-t pt-2"><span>الإجمالي مع التوصيل</span><span data-testid="dlv-total">{fmt(total)} دج</span></div>
            <Button className="w-full min-h-[48px]" onClick={create} data-testid="dlv-create-confirm">إرسال للمطبخ</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!driverFor} onOpenChange={() => setDriverFor(null)}>
        <DialogContent className="max-w-sm" data-testid="dlv-driver-dialog">
          <DialogHeader><DialogTitle>تعيين السائق — {driverFor?.code}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="اسم السائق *" value={driverName} onChange={(e) => setDriverName(e.target.value)} data-testid="dlv-driver-name" />
            <Button className="w-full min-h-[44px]" onClick={() => { setStatus(driverFor, "out_for_delivery", driverName); setDriverFor(null); }} data-testid="dlv-driver-confirm">انطلاق</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!collectFor} onOpenChange={() => setCollectFor(null)}>
        <DialogContent className="max-w-sm" data-testid="dlv-collect-dialog">
          <DialogHeader><DialogTitle>تحصيل {collectFor?.code} — {fmt(collectFor?.total)} دج</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">سجّل البيع في نقطة البيع ثم أدخل رقم الفاتورة هنا لربطها بالطلب.</p>
          <div className="space-y-3">
            <Input placeholder="رقم/معرف الفاتورة" value={saleId} onChange={(e) => setSaleId(e.target.value)} data-testid="dlv-sale-id" />
            <Button className="w-full min-h-[44px]" onClick={collect} data-testid="dlv-collect-confirm">تأكيد التحصيل</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
