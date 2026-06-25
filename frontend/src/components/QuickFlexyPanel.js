/**
 * QuickFlexyPanel — compact mobile-recharge & Idoom-internet form embedded
 * in POSPage. Lets the cashier:
 *   1. Toggle between Flexy (rechargeable balance) and Idoom (internet code)
 *   2. Type phone (Flexy) or pick denomination (Idoom)
 *   3. Choose cash or credit (آجل) payment — with customer picker for credit
 *   4. Submit → calls POST /api/recharge (Flexy) or /api/idoom/codes/sell (Idoom)
 *
 * Designed to be keyboard-friendly: an external ref handle exposes `focusPhone()`
 * so POSPage can map a key like F4 to "focus this panel".
 */
import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import apiClient from "../lib/apiClient";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Loader2, Smartphone, CheckCircle2, XCircle, Send, Wifi } from "lucide-react";
import { toast } from "sonner";

const OPERATORS = {
  "06": { key: "mobilis", name: "Mobilis", color: "bg-green-500" },
  "07": { key: "djezzy", name: "Djezzy", color: "bg-red-500" },
  "05": { key: "ooredoo", name: "Ooredoo", color: "bg-orange-500" },
};
const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000];

const QuickFlexyPanel = forwardRef(function QuickFlexyPanel({ language = "ar", onAfterSuccess }, ref) {
  const ar = language === "ar";
  const [mode, setMode] = useState("flexy");  // flexy | idoom
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [pay, setPay] = useState("cash");
  const [customerId, setCustomerId] = useState("");
  const [customers, setCustomers] = useState([]);
  const [idoomDenoms, setIdoomDenoms] = useState([]); // [{denomination, count}]
  const [pickedIdoom, setPickedIdoom] = useState("");
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState([]);
  const phoneRef = useRef(null);

  // Allow parent (POSPage) to focus the input via F4
  useImperativeHandle(ref, () => ({
    focus: () => {
      if (mode === "flexy") phoneRef.current?.focus();
    },
    setMode: (m) => setMode(m),
  }), [mode]);

  const operator = useMemo(() => {
    const pfx = (phone || "").substring(0, 2);
    return OPERATORS[pfx] || null;
  }, [phone]);

  const loadAll = async () => {
    try {
      const [recharges, custs, summary] = await Promise.all([
        apiClient.get("/recharges", { params: { limit: 5 } }).catch(() => ({ data: [] })),
        apiClient.get("/customers").catch(() => ({ data: [] })),
        apiClient.get("/platform-cards/stock-summary").catch(() => ({ data: {} })),
      ]);
      const rRows = Array.isArray(recharges.data) ? recharges.data : (recharges.data?.items || []);
      setRecent(rRows.slice(0, 3));
      setCustomers(Array.isArray(custs.data) ? custs.data : (custs.data?.items || []));
      const idoom = (summary.data?.idoom || []).map((r) => ({
        denomination: r._id?.denomination,
        count: r.count,
      })).filter(x => x.denomination);
      setIdoomDenoms(idoom);
    } catch (_e) { /* ignore */ }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (pay === "cash") setCustomerId("");
  }, [pay]);

  const submitFlexy = async () => {
    if (!operator) return toast.error(ar ? "رقم الهاتف غير صحيح" : "Numéro invalide");
    if (phone.length !== 10) return toast.error(ar ? "أدخل رقم 10 خانات" : "10 chiffres requis");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error(ar ? "أدخل مبلغاً صحيحاً" : "Montant invalide");
    if (pay === "credit" && !customerId) return toast.error(ar ? "اختر زبوناً للبيع الآجل" : "Choisir un client");
    setLoading(true);
    try {
      const res = await apiClient.post("/recharge", {
        operator: operator.key,
        phone_number: phone,
        amount: amt,
        recharge_type: "flexy",
        payment_method: pay === "credit" ? "credit" : "cash",
        customer_id: pay === "credit" ? customerId : null,
      });
      toast.success(ar ? `تم: ${amt} دج → ${phone} (${operator.name})` : `OK ${amt} → ${phone}`);
      setPhone(""); setAmount(""); setCustomerId(""); setPay("cash");
      loadAll();
      if (onAfterSuccess) onAfterSuccess(res.data);
    } catch (e) {
      const d = e?.response?.data?.detail || (ar ? "فشل الشحن" : "Échec");
      toast.error(typeof d === "string" ? d : (ar ? "فشل الشحن" : "Échec"));
    } finally { setLoading(false); }
  };

  const submitIdoom = async () => {
    if (!pickedIdoom) return toast.error(ar ? "اختر فئة Idoom" : "Choisir une dénomination");
    if (pay === "credit" && !customerId) return toast.error(ar ? "اختر زبوناً" : "Choisir un client");
    setLoading(true);
    try {
      const res = await apiClient.post("/idoom/codes/sell", {
        denomination: parseFloat(pickedIdoom),
        sell_price: parseFloat(amount) || parseFloat(pickedIdoom),
        payment_method: pay === "credit" ? "credit" : "cash",
        customer_id: pay === "credit" ? customerId : null,
        customer_phone: phone || null,
      });
      const code = res.data?.code?.code || res.data?.card?.code || "";
      toast.success(ar ? `تم. الكود: ${code}` : `Code: ${code}`);
      setPickedIdoom(""); setAmount(""); setPhone(""); setCustomerId(""); setPay("cash");
      loadAll();
      if (onAfterSuccess) onAfterSuccess(res.data);
    } catch (e) {
      const d = e?.response?.data?.detail || (ar ? "فشل البيع" : "Échec");
      toast.error(typeof d === "string" ? d : (ar ? "فشل البيع" : "Échec"));
    } finally { setLoading(false); }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/40" data-testid="quick-flexy-panel">
      <CardContent className="p-3 space-y-2">
        {/* Mode tabs */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1" role="tablist">
            <Button
              size="sm"
              variant={mode === "flexy" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setMode("flexy")}
              data-testid="mode-flexy"
            >
              <Smartphone className="h-3 w-3 ml-1" /> {ar ? "فليكسي" : "Flexy"}
            </Button>
            <Button
              size="sm"
              variant={mode === "idoom" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setMode("idoom")}
              data-testid="mode-idoom"
            >
              <Wifi className="h-3 w-3 ml-1" /> Idoom
            </Button>
          </div>
          {mode === "flexy" && operator && (
            <Badge className={`${operator.color} text-white`} data-testid="detected-operator">{operator.name}</Badge>
          )}
        </div>

        {/* === Flexy mode === */}
        {mode === "flexy" && (
          <>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <Input
                  ref={phoneRef}
                  dir="ltr"
                  type="tel"
                  maxLength={10}
                  placeholder={ar ? "06xxxxxxxx" : "Numéro"}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
                  className="text-center font-mono text-lg h-10"
                  data-testid="flexy-phone-input"
                />
              </div>
              <div className="col-span-4">
                <Input
                  dir="ltr" type="number" placeholder={ar ? "المبلغ" : "Montant"}
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="text-center font-bold h-10"
                  data-testid="flexy-amount-input"
                />
              </div>
              <div className="col-span-2">
                <Button className="w-full h-10" onClick={submitFlexy} disabled={loading || !phone || !amount} data-testid="flexy-submit-btn">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {QUICK_AMOUNTS.map((a) => (
                <Button
                  key={a} size="sm"
                  variant={parseFloat(amount) === a ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setAmount(String(a))}
                  data-testid={`flexy-quick-${a}`}
                >{a}</Button>
              ))}
            </div>
          </>
        )}

        {/* === Idoom mode === */}
        {mode === "idoom" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {idoomDenoms.length === 0 ? (
                <div className="col-span-3 text-center text-xs text-gray-500 py-3">
                  {ar ? "لا توجد أكواد Idoom في المخزون" : "Pas de stock Idoom"}
                </div>
              ) : idoomDenoms.map((d) => (
                <button
                  key={d.denomination}
                  onClick={() => { setPickedIdoom(String(d.denomination)); setAmount(String(d.denomination)); }}
                  className={`border rounded p-2 text-center hover:bg-white ${parseFloat(pickedIdoom) === d.denomination ? "bg-blue-100 border-blue-400" : "bg-white"}`}
                  data-testid={`idoom-denom-${d.denomination}`}
                  disabled={d.count === 0}
                >
                  <div className="font-bold">{d.denomination} دج</div>
                  <div className="text-xs text-gray-500">{ar ? "متاح:" : "Stock:"} {d.count}</div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-4">
                <Input
                  dir="ltr" type="number" placeholder={ar ? "السعر للزبون" : "Prix client"}
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="text-center h-9"
                />
              </div>
              <div className="col-span-6">
                <Input
                  dir="ltr" type="tel" maxLength={10}
                  placeholder={ar ? "هاتف الزبون (اختياري)" : "Tél (opt)"}
                  value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
                  className="text-center font-mono h-9"
                />
              </div>
              <div className="col-span-2">
                <Button className="w-full h-9" onClick={submitIdoom} disabled={loading || !pickedIdoom} data-testid="idoom-submit-btn">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Payment method + credit customer picker */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600">{ar ? "الدفع:" : "Paiement:"}</span>
          <Button size="sm" variant={pay === "cash" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setPay("cash")} data-testid="pay-cash">{ar ? "نقدي" : "Cash"}</Button>
          <Button size="sm" variant={pay === "credit" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setPay("credit")} data-testid="pay-credit">{ar ? "آجل" : "Crédit"}</Button>
          {pay === "credit" && (
            <select
              className="border rounded px-2 py-1 text-xs flex-1 min-w-[140px]"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              data-testid="credit-customer-select"
            >
              <option value="">{ar ? "-- اختر زبوناً --" : "-- Choisir --"}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>
              ))}
            </select>
          )}
        </div>

        {recent.length > 0 && (
          <div className="border-t pt-2 mt-1 space-y-1">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 truncate">
                  {r.status === "success" ? <CheckCircle2 className="h-3 w-3 text-green-600" /> :
                   r.status === "failed" ? <XCircle className="h-3 w-3 text-red-600" /> :
                   <Loader2 className="h-3 w-3 animate-spin text-amber-500" />}
                  <span dir="ltr" className="font-mono">{r.phone_number}</span>
                  <span className="text-gray-500">{r.operator_name}</span>
                </div>
                <span className="font-semibold">{r.amount} دج</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default QuickFlexyPanel;
