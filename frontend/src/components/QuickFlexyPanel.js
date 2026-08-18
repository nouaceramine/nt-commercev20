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
import { Loader2, Smartphone, CheckCircle2, XCircle, Send, Wifi, CreditCard } from "lucide-react";
import { toast } from "sonner";

const OPERATORS = {
  "06": { key: "mobilis", name: "Mobilis", color: "bg-green-500" },
  "07": { key: "djezzy", name: "Djezzy", color: "bg-red-500" },
  "05": { key: "ooredoo", name: "Ooredoo", color: "bg-orange-500" },
};
const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000];

const QuickFlexyPanel = forwardRef(function QuickFlexyPanel({ language = "ar", onAfterSuccess, compact = false }, ref) {
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

  // p165: balances display + SIM-card activation tab
  const [balances, setBalances] = useState(null);
  const [simOperator, setSimOperator] = useState("ooredoo");
  const [simOffers, setSimOffers] = useState([]);
  const [simOffer, setSimOffer] = useState(null);
  const [simOfferValue, setSimOfferValue] = useState("");
  const [simSalePrice, setSimSalePrice] = useState("");
  const [simBonus, setSimBonus] = useState("");
  const [simCost, setSimCost] = useState("");

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
      const bal = await apiClient.get("/sim/balances").catch(() => null);
      if (bal) setBalances(bal.data);
    } catch (_e) { /* ignore */ }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (mode !== "sim") return;
    apiClient.get("/sim/offers", { params: { operator: simOperator } })
      .then((r) => setSimOffers(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSimOffers([]));
  }, [mode, simOperator]);

  // p165: SIM activation helpers
  const pickSimOffer = (o) => {
    setSimOffer(o);
    setSimOfferValue(String(o.offer_value ?? ""));
    setSimSalePrice(String(o.default_sale_price ?? ""));
    setSimBonus(String(o.typical_bonus ?? ""));
    setSimCost(String(o.sim_cost ?? ""));
  };
  const simProfit = (parseFloat(simSalePrice) || 0) + (parseFloat(simBonus) || 0)
    - (parseFloat(simOfferValue) || 0) - (parseFloat(simCost) || 0);

  const submitSim = async () => {
    const salePrice = parseFloat(simSalePrice);
    if (!salePrice || salePrice <= 0) return toast.error(ar ? "أدخل سعر البيع" : "Prix de vente requis");
    if (pay === "credit" && !customerId) return toast.error(ar ? "اختر زبوناً للبيع الآجل" : "Choisir un client");
    setLoading(true);
    try {
      const res = await apiClient.post("/sim/activations", {
        operator: simOperator,
        offer_id: simOffer?.id || "",
        offer_name: simOffer?.name || (ar ? "تفعيل يدوي" : "Activation manuelle"),
        offer_value: parseFloat(simOfferValue) || 0,
        bonus: parseFloat(simBonus) || 0,
        sale_price: salePrice,
        sim_cost: parseFloat(simCost) || 0,
        payment_type: pay,
        customer_id: pay === "credit" ? customerId : null,
      });
      toast.success(ar ? `تم بيع الشريحة — الربح: ${res.data.profit} دج` : `SIM vendue — profit: ${res.data.profit} DA`);
      setSimOffer(null); setSimOfferValue(""); setSimSalePrice(""); setSimBonus(""); setSimCost("");
      setCustomerId(""); setPay("cash");
      loadAll();
      if (onAfterSuccess) onAfterSuccess(res.data);
    } catch (e) {
      const d = e?.response?.data?.detail || (ar ? "فشل بيع الشريحة" : "Échec");
      toast.error(typeof d === "string" ? d : (ar ? "فشل بيع الشريحة" : "Échec"));
    } finally { setLoading(false); }
  };
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
      <CardContent className={compact ? "p-2 space-y-1.5" : "p-3 space-y-2"}>
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
            <Button
              size="sm"
              variant={mode === "sim" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setMode("sim")}
              data-testid="mode-sim"
            >
              <CreditCard className="h-3 w-3 ml-1" /> {ar ? "شريحة" : "SIM"}
            </Button>
          </div>
          {mode === "flexy" && operator && (
            <Badge className={`${operator.color} text-white`} data-testid="detected-operator">{operator.name}</Badge>
          )}
        </div>

        {/* p165: flexy/IPTV wallet + SIM balances */}
        {balances && (
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]" data-testid="flexy-balances">
            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
              {ar ? "محفظة الشحن/IPTV:" : "Wallet:"} {balances.wallet_balance} {ar ? "دج" : "DA"}
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold" data-testid="sim-balances-box">
              {ar ? "رصيد الشرائح:" : "SIMs:"} {balances.sim_total}{balances.bonus_total ? ` (+${balances.bonus_total} ${ar ? "بونيس" : "bonus"})` : ""} {ar ? "دج" : "DA"}
            </span>
          </div>
        )}

        {/* === Flexy mode === */}
        {mode === "flexy" && compact && (
          <>
            <div className="flex items-center gap-1.5">
              <Input
                ref={phoneRef}
                dir="ltr"
                type="tel"
                maxLength={10}
                placeholder={ar ? "06xxxxxxxx" : "Numéro"}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
                className="text-center font-mono text-sm h-8 flex-1 min-w-[90px]"
                data-testid="flexy-phone-input"
              />
              <Input
                dir="ltr" type="number" placeholder={ar ? "المبلغ" : "Montant"}
                value={amount} onChange={(e) => setAmount(e.target.value)}
                className="text-center font-bold h-8 w-20 shrink-0 text-sm"
                data-testid="flexy-amount-input"
              />
              <Button className="h-8 px-2.5 shrink-0" onClick={submitFlexy} disabled={loading || !phone || !amount} data-testid="flexy-submit-btn">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {QUICK_AMOUNTS.map((a) => (
                <Button
                  key={a} size="sm"
                  variant={parseFloat(amount) === a ? "default" : "outline"}
                  className="h-7 text-xs font-bold px-1.5"
                  onClick={() => setAmount(String(a))}
                  data-testid={`flexy-quick-${a}`}
                >{a}</Button>
              ))}
              <span className="text-xs text-gray-600 mx-1">{ar ? "الدفع:" : "Paiement:"}</span>
              <Button size="sm" variant={pay === "cash" ? "default" : "outline"} className="h-7 text-xs px-2" onClick={() => setPay("cash")} data-testid="pay-cash">{ar ? "نقدي" : "Cash"}</Button>
              <Button size="sm" variant={pay === "credit" ? "default" : "outline"} className="h-7 text-xs px-2" onClick={() => setPay("credit")} data-testid="pay-credit">{ar ? "آجل" : "Crédit"}</Button>
              {pay === "credit" && (
                <select
                  className="border rounded px-1.5 text-xs h-7 flex-1 min-w-[110px] bg-white"
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
          </>
        )}
        {mode === "flexy" && !compact && (
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
            <div className="grid grid-cols-5 gap-1">
              {QUICK_AMOUNTS.map((a) => (
                <Button
                  key={a} size="sm"
                  variant={parseFloat(amount) === a ? "default" : "outline"}
                  className="h-9 text-sm font-bold px-1"
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

        {/* === SIM card activation mode (p165) === */}
        {mode === "sim" && (
          <>
            <div className="flex items-center gap-1 flex-wrap">
              {[["mobilis", ar ? "موبيليس" : "Mobilis", "bg-green-500"], ["djezzy", ar ? "جازي" : "Djezzy", "bg-red-500"], ["ooredoo", ar ? "أوريدو" : "Ooredoo", "bg-orange-500"]].map(([key, label, color]) => (
                <button key={key} onClick={() => { setSimOperator(key); setSimOffer(null); }}
                  className={`h-7 px-2 text-xs rounded-md border flex items-center gap-1 transition-colors ${simOperator === key ? `${color} text-white border-transparent` : "bg-white border-gray-300 hover:border-gray-400"}`}
                  data-testid={`sim-op-${key}`}>
                  {label}
                </button>
              ))}
            </div>
            {simOffers.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {simOffers.map((o) => (
                  <button key={o.id} onClick={() => pickSimOffer(o)}
                    className={`h-7 px-2 text-xs rounded-md border transition-colors ${simOffer?.id === o.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-700 border-blue-200 hover:border-blue-400"}`}
                    data-testid={`sim-offer-${o.id}`}>
                    {o.name} · {o.offer_value}
                  </button>
                ))}
              </div>
            )}
            <div className={`grid gap-1.5 ${compact ? "grid-cols-4" : "grid-cols-2"}`}>
              <div>
                <label className="text-[10px] text-gray-600">{ar ? "قيمة العرض (تُخصم من رصيدك)" : "Valeur offre"}</label>
                <Input dir="ltr" type="number" value={simOfferValue} onChange={(e) => { setSimOfferValue(e.target.value); setSimOffer(null); }} className={`${compact ? "h-8" : "h-9"} text-sm text-center`} data-testid="sim-offer-value" />
              </div>
              <div>
                <label className="text-[10px] text-gray-600">{ar ? "سعر البيع للزبون" : "Prix vente"}</label>
                <Input dir="ltr" type="number" value={simSalePrice} onChange={(e) => setSimSalePrice(e.target.value)} className={`${compact ? "h-8" : "h-9"} text-sm text-center font-bold`} data-testid="sim-sale-price" />
              </div>
              <div>
                <label className="text-[10px] text-gray-600">{ar ? "البونيس المستلم" : "Bonus reçu"}</label>
                <Input dir="ltr" type="number" value={simBonus} onChange={(e) => setSimBonus(e.target.value)} className={`${compact ? "h-8" : "h-9"} text-sm text-center`} data-testid="sim-bonus" />
              </div>
              <div>
                <label className="text-[10px] text-gray-600">{ar ? "تكلفة الشريحة" : "Coût SIM"}</label>
                <Input dir="ltr" type="number" value={simCost} onChange={(e) => setSimCost(e.target.value)} className={`${compact ? "h-8" : "h-9"} text-sm text-center`} data-testid="sim-cost" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-bold ${simProfit >= 0 ? "text-emerald-700" : "text-red-600"}`} data-testid="sim-profit-preview">
                {ar ? "الربح المتوقع:" : "Profit:"} {simProfit.toFixed(2)} {ar ? "دج" : "DA"}
              </span>
              <Button className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-xs" onClick={submitSim} disabled={loading} data-testid="sim-submit-btn">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5 me-1" />{ar ? "بيع وتفعيل" : "Vendre"}</>}
              </Button>
            </div>
          </>
        )}

        {/* Payment method + credit customer picker */}
        {(!compact || mode !== "flexy") && (
        <div className="flex items-center gap-1 flex-wrap pt-1 border-t">
          <span className="text-xs text-gray-600 mr-1">{ar ? "الدفع:" : "Paiement:"}</span>
          <Button size="sm" variant={pay === "cash" ? "default" : "outline"} className="h-7 text-xs flex-1 min-w-[60px]" onClick={() => setPay("cash")} data-testid="pay-cash">{ar ? "نقدي" : "Cash"}</Button>
          <Button size="sm" variant={pay === "credit" ? "default" : "outline"} className="h-7 text-xs flex-1 min-w-[60px]" onClick={() => setPay("credit")} data-testid="pay-credit">{ar ? "آجل" : "Crédit"}</Button>
          {pay === "credit" && (
            <select
              className="border rounded px-2 py-1 text-xs w-full"
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
        )}

        {recent.length > 0 && (
          <div className={compact ? "border-t pt-1 space-y-0.5" : "border-t pt-2 mt-1 space-y-1"}>
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
