/**
 * SellPlatformCardDialog — POS quick-sell modal for recharge cards bought
 * from the platform supplier. Lists available stock grouped by (operator,
 * denomination), lets the cashier pick one, sells it (atomic), then shows
 * the actual code with a print/copy button.
 *
 * Props:
 *   open       : boolean
 *   onClose    : () => void
 *   onSold?    : (sale, card) => void  // called after success
 */
import { useEffect, useMemo, useState } from "react";
import apiClient from "../lib/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Loader2, ShoppingCart, Copy, Printer, CreditCard, CheckCircle2, FileText } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { printPlatformCardInvoice } from "../lib/platformCardInvoice";

const OPERATOR_COLORS = { Mobilis: "bg-green-500", Djezzy: "bg-red-500", Ooredoo: "bg-orange-500" };

export default function SellPlatformCardDialog({ open, onClose, onSold }) {
  const [stock, setStock] = useState({ cards: [], idoom: [] });
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(null);  // {operator?, denomination, type}
  const [customer, setCustomer] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customers, setCustomers] = useState([]);
  const [sellPrice, setSellPrice] = useState("");
  const [pay, setPay] = useState("cash");
  const [result, setResult] = useState(null);  // {code, operator, denomination}
  const [resultSale, setResultSale] = useState(null);  // sale payload from /platform-cards/sell
  const [branding, setBranding] = useState({ name: "" });
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [s, c, b] = await Promise.all([
        apiClient.get("/platform-cards/stock-summary"),
        apiClient.get("/customers").catch(() => ({ data: [] })),
        apiClient.get("/settings/tenant-branding").catch(() => ({ data: {} })),
      ]);
      const data = s.data || {};
      setStock({
        cards: (data.cards || []).map((r) => ({ operator: r._id.operator, denomination: r._id.denomination, count: r.count })),
        idoom: (data.idoom || []).map((r) => ({ denomination: r._id.denomination, count: r.count })),
      });
      setCustomers(Array.isArray(c.data) ? c.data : (c.data?.items || []));
      setBranding({ name: b.data?.name || "" });
    } catch (_e) {
      toast.error("فشل تحميل المخزون");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (open) {
      setPicked(null); setCustomer(""); setSelectedCustomerId(""); setSellPrice(""); setPay("cash");
      setResult(null); setResultSale(null);
      reload();
    }
  }, [open]);

  const groupedByOp = useMemo(() => {
    const m = {};
    stock.cards.forEach((r) => {
      m[r.operator] = m[r.operator] || [];
      m[r.operator].push(r);
    });
    return m;
  }, [stock.cards]);

  const submit = async () => {
    if (!picked) return;
    if (pay === "credit" && !selectedCustomerId) {
      toast.error("يرجى اختيار الزبون للبيع الآجل");
      return;
    }
    setSubmitting(true);
    try {
      const payload = picked.type === "card"
        ? {
            operator: picked.operator,
            denomination: picked.denomination,
            sell_price: sellPrice ? parseFloat(sellPrice) : picked.denomination,
            customer_id: pay === "credit" ? selectedCustomerId : null,
            customer_phone: customer || null,
            payment_method: pay,
          }
        : null;
      if (picked.type !== "card") {
        toast.error("بيع Idoom من تبويب Idoom المنفصل");
        setSubmitting(false);
        return;
      }
      const res = await apiClient.post("/platform-cards/sell", payload);
      setResult(res.data?.card);
      setResultSale(res.data?.sale);
      toast.success("تم البيع. الكود معروض أدناه");
      if (onSold) onSold(res.data?.sale, res.data?.card);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "فشل البيع");
    } finally { setSubmitting(false); }
  };

  const printReceipt = (format = "thermal80") => {
    if (!result) return;
    const ok = printPlatformCardInvoice({
      format,
      storeName: branding.name || "متجري",
      sale: resultSale || {},
      card: result,
      customer: resultSale?.customer_name || "",
      customerPhone: customer,
    });
    if (!ok) toast.error("منع المتصفح فتح نافذة الطباعة — يرجى السماح بها");
  };

  const copyCode = () => {
    navigator.clipboard.writeText(result?.code || "");
    toast.success("تم النسخ");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-2xl" data-testid="sell-card-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-blue-600" /> بيع كرت تعبئة</DialogTitle>
        </DialogHeader>

        {result ? (
          // ── Result view ─────────────────────────────────────
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center text-green-600"><CheckCircle2 className="h-12 w-12" /></div>
            <p className="text-center text-lg font-bold">{result.operator} {result.denomination} دج</p>
            <div className="bg-gray-100 rounded p-4 text-center font-mono text-2xl tracking-widest" dir="ltr" data-testid="sold-code">
              {result.code}
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button variant="outline" onClick={copyCode} data-testid="copy-code-btn"><Copy className="h-4 w-4 ml-2" /> نسخ</Button>
              <Button variant="outline" onClick={() => printReceipt("thermal58")} data-testid="print-58mm-btn">
                <Printer className="h-4 w-4 ml-2" /> حراري 58mm
              </Button>
              <Button onClick={() => printReceipt("thermal80")} data-testid="print-80mm-btn">
                <Printer className="h-4 w-4 ml-2" /> حراري 80mm
              </Button>
              <Button variant="outline" onClick={() => printReceipt("a5")} data-testid="print-a5-btn">
                <FileText className="h-4 w-4 ml-2" /> فاتورة A5
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setResult(null); setResultSale(null); setPicked(null); reload(); }}>بيع كرت آخر</Button>
              <Button onClick={onClose}>إغلاق</Button>
            </DialogFooter>
          </div>
        ) : !picked ? (
          // ── Pick view ──────────────────────────────────────
          loading ? <Loader2 className="animate-spin h-6 w-6 mx-auto" /> : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {Object.keys(groupedByOp).length === 0 ? (
                <p className="text-center text-gray-500 py-6">لا توجد كروت متاحة. اشترِ من /services/cards أولاً</p>
              ) : (
                Object.entries(groupedByOp).map(([op, rows]) => (
                  <div key={op}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`${OPERATOR_COLORS[op]} text-white`}>{op}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {rows.map((r) => (
                        <button
                          key={`${op}-${r.denomination}`}
                          onClick={() => { setPicked({ type: "card", operator: op, denomination: r.denomination }); setSellPrice(String(r.denomination)); }}
                          className="border rounded p-3 text-center hover:bg-gray-50 disabled:opacity-50"
                          disabled={r.count === 0}
                          data-testid={`pick-${op}-${r.denomination}`}
                        >
                          <div className="font-bold text-lg">{r.denomination} دج</div>
                          <div className="text-xs text-gray-500">المتاح: {r.count}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )
        ) : (
          // ── Confirm view ───────────────────────────────────
          <div className="space-y-3 py-2">
            <div className="bg-blue-50 rounded p-3 text-center">
              <p className="text-lg font-bold">{picked.operator} - {picked.denomination} دج</p>
            </div>
            <div>
              <Label>سعر البيع للزبون (دج)</Label>
              <Input type="number" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} data-testid="sell-price-input" />
            </div>
            <div>
              <Label>رقم الزبون (اختياري)</Label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="0660xxxxxx" data-testid="customer-phone-input" />
            </div>
            <div>
              <Label>طريقة الدفع</Label>
              <select className="w-full border rounded px-2 py-2" value={pay} onChange={(e) => setPay(e.target.value)} data-testid="pay-method-select">
                <option value="cash">نقدي</option>
                <option value="credit">آجل (دَين على الزبون)</option>
              </select>
            </div>
            {pay === "credit" && (
              <div>
                <Label>اختر الزبون <span className="text-red-500">*</span></Label>
                <select
                  className="w-full border rounded px-2 py-2"
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    const c = customers.find((x) => x.id === e.target.value);
                    if (c?.phone && !customer) setCustomer(c.phone);
                  }}
                  data-testid="credit-customer-select"
                >
                  <option value="">-- اختر زبوناً --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.phone ? ` (${c.phone})` : ""}
                    </option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">لا يوجد زبائن. أضف زبوناً من قائمة الزبائن أولاً.</p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPicked(null)}>رجوع</Button>
              <Button onClick={submit} disabled={submitting} data-testid="confirm-sale-btn">
                {submitting ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <ShoppingCart className="h-4 w-4 ml-2" />} تأكيد البيع
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
