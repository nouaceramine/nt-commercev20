/**
 * QuickFlexyPanel — compact Flexy/Idoom recharge form embedded in POSPage.
 *
 * Lets the cashier:
 *   1. Type the customer's phone number (operator auto-detected by prefix)
 *   2. Tap one of the quick-amount buttons OR enter a custom amount
 *   3. Submit → calls POST /api/recharge which records the sale, dispatches
 *      the bridge task, debits the platform wallet, and updates the cashbox.
 *
 * Designed to fit inside POS without taking screen space. Shows last 3
 * recharges below the form for quick reference.
 */
import { useEffect, useMemo, useState } from "react";
import apiClient from "../lib/apiClient";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Loader2, Smartphone, CheckCircle2, XCircle, Send } from "lucide-react";
import { toast } from "sonner";

// Algerian operator prefix mapping
const OPERATORS = {
  "06": { key: "mobilis", name: "Mobilis", color: "bg-green-500", textColor: "text-green-700" },
  "07": { key: "djezzy", name: "Djezzy", color: "bg-red-500", textColor: "text-red-700" },
  "05": { key: "ooredoo", name: "Ooredoo", color: "bg-orange-500", textColor: "text-orange-700" },
};

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000];

export default function QuickFlexyPanel({ language = "ar", onAfterSuccess }) {
  const ar = language === "ar";
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState([]);

  const operator = useMemo(() => {
    const pfx = (phone || "").substring(0, 2);
    return OPERATORS[pfx] || null;
  }, [phone]);

  const loadRecent = async () => {
    try {
      const res = await apiClient.get("/recharges", { params: { limit: 5 } }).catch(() => ({ data: [] }));
      const rows = Array.isArray(res.data) ? res.data : (res.data?.items || []);
      setRecent(rows.slice(0, 3));
    } catch (_e) { /* ignore */ }
  };

  useEffect(() => { loadRecent(); }, []);

  const submit = async () => {
    if (!operator) {
      toast.error(ar ? "رقم الهاتف غير صحيح" : "Numéro invalide");
      return;
    }
    if (!phone || phone.length !== 10) {
      toast.error(ar ? "أدخل رقم 10 خانات" : "10 chiffres requis");
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast.error(ar ? "أدخل مبلغاً صحيحاً" : "Montant invalide");
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.post("/recharge", {
        operator: operator.key,
        phone_number: phone,
        amount: amt,
        recharge_type: "flexy",
        payment_method: "cash",
      });
      toast.success(
        ar
          ? `تم تنفيذ شحن ${amt} دج للرقم ${phone} (${operator.name})`
          : `Recharge ${amt} DA → ${phone}`
      );
      setPhone(""); setAmount("");
      loadRecent();
      if (onAfterSuccess) onAfterSuccess(res.data);
    } catch (e) {
      const detail = e?.response?.data?.detail || (ar ? "فشل الشحن" : "Échec");
      toast.error(typeof detail === "string" ? detail : (ar ? "فشل الشحن" : "Échec"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/40" data-testid="quick-flexy-panel">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-blue-600" />
            <span className="font-semibold text-sm">{ar ? "شحن رصيد سريع" : "Recharge rapide"}</span>
          </div>
          {operator && (
            <Badge className={`${operator.color} text-white`} data-testid="detected-operator">{operator.name}</Badge>
          )}
        </div>

        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-12 sm:col-span-6">
            <Input
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
          <div className="col-span-9 sm:col-span-4">
            <Input
              dir="ltr"
              type="number"
              placeholder={ar ? "المبلغ" : "Montant"}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-center font-bold h-10"
              data-testid="flexy-amount-input"
            />
          </div>
          <div className="col-span-3 sm:col-span-2">
            <Button
              className="w-full h-10"
              onClick={submit}
              disabled={loading || !phone || !amount}
              data-testid="flexy-submit-btn"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {QUICK_AMOUNTS.map((a) => (
            <Button
              key={a}
              size="sm"
              variant={parseFloat(amount) === a ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setAmount(String(a))}
              data-testid={`flexy-quick-${a}`}
            >
              {a}
            </Button>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="border-t pt-2 mt-1 space-y-1">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs" data-testid={`recent-${r.id}`}>
                <div className="flex items-center gap-2 truncate">
                  {r.status === "success" ? <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" /> :
                   r.status === "failed" ? <XCircle className="h-3 w-3 text-red-600 flex-shrink-0" /> :
                   <Loader2 className="h-3 w-3 animate-spin text-amber-500 flex-shrink-0" />}
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
}
