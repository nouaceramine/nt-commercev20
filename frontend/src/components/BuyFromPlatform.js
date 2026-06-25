/**
 * BuyFromPlatform — reusable widget for tenant pages (Cards & Idoom).
 *
 * Shows the platform catalog filtered by type ("card" | "idoom"),
 * lets the tenant pick quantities, and submits a single supplier order.
 * On success the tenant's local stock (idoom_codes / platform_cards) is
 * populated automatically by the backend.
 *
 * Props:
 *   type:      "card" | "idoom"
 *   operator?: filter cards by operator (Mobilis|Djezzy|Ooredoo) – optional
 *   onOrdered: callback after a successful order (so parent can refresh)
 */
import { useEffect, useMemo, useState } from "react";
import apiClient from "../lib/apiClient";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Loader2, ShoppingCart, Wallet } from "lucide-react";
import { toast } from "sonner";

const formatDZD = (n) => `${(n ?? 0).toLocaleString("en-US")} دج`;

export default function BuyFromPlatform({ type, operator, onOrdered }) {
  const [catalog, setCatalog] = useState({ cards: [], idoom: [] });
  const [qty, setQty] = useState({});  // catalog_id -> qty
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [c, w] = await Promise.all([
        apiClient.get("/supplier/catalog"),
        apiClient.get("/wallet").catch(() => ({ data: null })),
      ]);
      setCatalog(c.data || { cards: [], idoom: [] });
      setWallet(w.data);
    } catch (_e) {
      toast.error("فشل تحميل الكتالوج");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const items = useMemo(() => {
    const arr = type === "card" ? (catalog.cards || []) : (catalog.idoom || []);
    if (type === "card" && operator) return arr.filter((c) => c.operator === operator);
    return arr;
  }, [catalog, type, operator]);

  const totals = useMemo(() => {
    let total = 0;
    let count = 0;
    items.forEach((it) => {
      const q = qty[it.id] || 0;
      total += q * (it.my_price || 0);
      count += q;
    });
    return { total, count };
  }, [items, qty]);

  const submit = async () => {
    const orderItems = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([catalog_id, q]) => ({ type, catalog_id, quantity: parseInt(q, 10) }));
    if (!orderItems.length) {
      toast.error("اختر كمية على الأقل");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post("/supplier/order", { items: orderItems });
      toast.success(`تم الشراء بنجاح. ${res.data?.items?.length || 0} عنصر، ${formatDZD(res.data?.total)}`);
      setQty({});
      reload();
      if (onOrdered) onOrdered();
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (d?.error === "insufficient_stock") {
        toast.error(`مخزون غير كافٍ: متاح ${d.available} فقط من فئة ${d.denomination} ${d.operator || ""}`);
      } else if (d?.error === "insufficient_balance") {
        toast.error(`رصيد المحفظة غير كافٍ. مطلوب ${formatDZD(d.required)} - متوفر ${formatDZD(d.available)}`);
      } else {
        toast.error(typeof d === "string" ? d : "فشل إرسال الطلب");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card><CardContent className="p-8 text-center"><Loader2 className="animate-spin h-6 w-6 mx-auto text-gray-400" /></CardContent></Card>
    );
  }

  return (
    <Card data-testid="buy-from-platform">
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-purple-600" /> شراء من المنصة
        </CardTitle>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Wallet className="h-4 w-4" />
          الرصيد: <b className="text-green-700">{formatDZD(wallet?.balance)}</b>
        </div>
      </CardHeader>
      <CardContent>
        {!items.length ? (
          <div className="text-center text-gray-500 py-6">لا توجد فئات متاحة. اطلب من السوبر-أدمن إضافتها.</div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 px-2">
              {type === "card" && <div className="col-span-3">المشغّل</div>}
              <div className={type === "card" ? "col-span-2" : "col-span-3"}>الفئة</div>
              <div className="col-span-3">سعري</div>
              <div className="col-span-2">المخزون</div>
              <div className={type === "card" ? "col-span-2" : "col-span-4"}>الكمية</div>
            </div>
            {items.map((it) => (
              <div key={it.id} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded p-2" data-testid={`bfp-row-${it.id}`}>
                {type === "card" && <div className="col-span-3"><Badge>{it.operator}</Badge></div>}
                <div className={type === "card" ? "col-span-2 font-semibold" : "col-span-3 font-semibold"}>{it.denomination} دج</div>
                <div className="col-span-3 text-green-700 font-bold">{formatDZD(it.my_price)}</div>
                <div className="col-span-2 text-sm">{it.available}</div>
                <div className={type === "card" ? "col-span-2" : "col-span-4"}>
                  <Input
                    type="number"
                    min="0"
                    max={it.available}
                    value={qty[it.id] || ""}
                    onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })}
                    placeholder="0"
                    className="h-8"
                    data-testid={`qty-${it.id}`}
                  />
                </div>
              </div>
            ))}
            <div className="border-t pt-3 flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <span className="text-gray-600">المجموع: </span>
                <span className="font-bold text-lg">{formatDZD(totals.total)}</span>
                <span className="text-gray-500 mr-2">({totals.count} كود)</span>
              </div>
              <Button onClick={submit} disabled={submitting || totals.count === 0} data-testid="bfp-submit">
                {submitting ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <ShoppingCart className="h-4 w-4 ml-2" />}
                اشترِ الآن
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
