/**
 * TelecomStockPage — مخزون خدمة شحن رصيد الجوال
 *
 * Hub for the shop's OWN telecom stock (p166):
 *   1. الكروت والبطاقات — scratch/idoom/other cards: types, تموين (purchase),
 *      sell, weighted-average cost; stock value counts toward capital.
 *   2. الشرائح الفارغة — buy empty SIMs per operator slot (cash → stock).
 *   3. تحويل الرصيد — 1:1 transfers between operator SIMs and the platform
 *      wallet, plus charging a SIM from a cash box.
 *   4. ملخص — wallet, SIM balances, card stock value.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import apiClient from "../lib/apiClient";
import { useLanguage } from "../contexts/LanguageContext";
import { Layout } from "../components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { LoadingState } from "../components/LoadingState";
import { formatCurrency } from "../utils/globalDateFormatter";
import { errText } from "../lib/errorText";
import { toast } from "sonner";
import {
  Package, Plus, Pencil, Trash2, ShoppingCart, ArrowLeftRight,
  Smartphone, Wallet, CreditCard, Zap, Download, DollarSign,
} from "lucide-react";

const KIND_LABELS = {
  scratch_card: { ar: "كرت شحن", fr: "Carte recharge" },
  idoom_card: { ar: "بطاقة أيدوم", fr: "Carte Idoom" },
  other_card: { ar: "بطاقة أخرى", fr: "Autre carte" },
};
const OP_LABELS = {
  mobilis: { ar: "موبيليس", fr: "Mobilis" },
  djezzy: { ar: "جازي", fr: "Djezzy" },
  ooredoo: { ar: "أوريدو", fr: "Ooredoo" },
  idoom: { ar: "أيدوم", fr: "Idoom" },
  other: { ar: "أخرى", fr: "Autre" },
};

const EMPTY_CARD = { kind: "scratch_card", operator: "mobilis", name: "", denomination: "", sell_price: "", quantity: "", unit_cost: "" };

export default function TelecomStockPage() {
  const { language } = useLanguage();
  const ar = language === "ar";

  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState([]);
  const [cardsSummary, setCardsSummary] = useState({ total_quantity: 0, stock_value: 0 });
  const [slots, setSlots] = useState([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [cashBoxes, setCashBoxes] = useState([]);
  const [customers, setCustomers] = useState([]);

  // dialogs
  const [cardDialog, setCardDialog] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [cardForm, setCardForm] = useState(EMPTY_CARD);
  const [purchaseDialog, setPurchaseDialog] = useState(null); // card object
  const [purchaseForm, setPurchaseForm] = useState({ quantity: "", unit_cost: "", payment_method: "cash", notes: "" });
  const [sellDialog, setSellDialog] = useState(null); // card object
  const [sellForm, setSellForm] = useState({ quantity: "1", sell_price: "", payment_method: "cash", customer_id: "" });
  const [simPurchaseDialog, setSimPurchaseDialog] = useState(null); // slot object
  const [simPurchaseForm, setSimPurchaseForm] = useState({ quantity: "", unit_cost: "100", payment_method: "cash" });
  const [topupDialog, setTopupDialog] = useState(null); // slot object
  const [topupForm, setTopupForm] = useState({ amount: "", payment_method: "cash", notes: "" });
  const [transferForm, setTransferForm] = useState({ from_kind: "slot", from_slot_id: "1", to_kind: "slot", to_slot_id: "2", amount: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stock, balances, boxes, custs] = await Promise.all([
        apiClient.get("/cards/stock").catch(() => ({ data: { items: [] } })),
        apiClient.get("/sim/balances").catch(() => ({ data: null })),
        apiClient.get("/cash-boxes").catch(() => ({ data: [] })),
        apiClient.get("/customers").catch(() => ({ data: [] })),
      ]);
      setCards(stock.data?.items || []);
      setCardsSummary({ total_quantity: stock.data?.total_quantity || 0, stock_value: stock.data?.stock_value || 0 });
      if (balances.data) {
        setSlots(balances.data.sim_slots || []);
        setWalletBalance(balances.data.wallet_balance || 0);
      }
      const bx = Array.isArray(boxes.data) ? boxes.data : (boxes.data?.items || boxes.data?.cash_boxes || []);
      setCashBoxes(bx.filter((b) => b.id !== "personal"));
      setCustomers(Array.isArray(custs.data) ? custs.data : (custs.data?.items || []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const boxName = (id) => cashBoxes.find((b) => b.id === id)?.name || id;

  // ── card type CRUD ──
  const openNewCard = () => { setEditingCard(null); setCardForm(EMPTY_CARD); setCardDialog(true); };
  const openEditCard = (c) => {
    setEditingCard(c);
    setCardForm({ kind: c.kind, operator: c.operator, name: c.name, denomination: String(c.denomination ?? ""), sell_price: String(c.sell_price ?? ""), quantity: "", unit_cost: "" });
    setCardDialog(true);
  };
  const saveCard = async () => {
    if (!cardForm.name.trim()) return toast.error(ar ? "أدخل اسم البطاقة" : "Nom requis");
    setSaving(true);
    try {
      if (editingCard) {
        await apiClient.put(`/cards/stock/${editingCard.id}`, {
          kind: cardForm.kind, operator: cardForm.operator, name: cardForm.name,
          denomination: parseFloat(cardForm.denomination) || 0,
          sell_price: parseFloat(cardForm.sell_price) || 0,
        });
        toast.success(ar ? "تم تحديث البطاقة" : "Carte mise à jour");
      } else {
        await apiClient.post("/cards/stock", {
          kind: cardForm.kind, operator: cardForm.operator, name: cardForm.name,
          denomination: parseFloat(cardForm.denomination) || 0,
          sell_price: parseFloat(cardForm.sell_price) || 0,
          quantity: parseFloat(cardForm.quantity) || 0,
          unit_cost: parseFloat(cardForm.unit_cost) || 0,
        });
        toast.success(ar ? "تمت إضافة البطاقة" : "Carte ajoutée");
      }
      setCardDialog(false);
      load();
    } catch (e) {
      toast.error(errText(e) || (ar ? "فشل الحفظ" : "Échec"));
    } finally { setSaving(false); }
  };
  const deleteCard = async (c) => {
    try {
      await apiClient.delete(`/cards/stock/${c.id}`);
      toast.success(ar ? "تم الحذف" : "Supprimé");
      load();
    } catch (e) {
      toast.error(errText(e) || (ar ? "فشل الحذف" : "Échec"));
    }
  };

  // ── purchase (تموين) ──
  const openPurchase = (c) => { setPurchaseDialog(c); setPurchaseForm({ quantity: "", unit_cost: "", payment_method: "cash", notes: "" }); };
  const doPurchase = async () => {
    const qty = parseFloat(purchaseForm.quantity);
    const cost = parseFloat(purchaseForm.unit_cost);
    if (!qty || qty <= 0) return toast.error(ar ? "أدخل الكمية" : "Quantité requise");
    if (cost === undefined || isNaN(cost) || cost < 0) return toast.error(ar ? "أدخل سعر الشراء" : "Prix d'achat requis");
    setSaving(true);
    try {
      const r = await apiClient.post("/cards/purchase", {
        card_id: purchaseDialog.id, quantity: qty, unit_cost: cost,
        payment_method: purchaseForm.payment_method, notes: purchaseForm.notes,
      });
      toast.success(ar ? `تم التموين — المخزون الآن ${r.data.new_quantity} (متوسط التكلفة ${r.data.avg_cost} دج)` : "Stock ajouté");
      setPurchaseDialog(null);
      load();
    } catch (e) {
      toast.error(errText(e) || (ar ? "فشل التموين" : "Échec"));
    } finally { setSaving(false); }
  };

  // ── sell ──
  const openSell = (c) => { setSellDialog(c); setSellForm({ quantity: "1", sell_price: String(c.sell_price || c.denomination || ""), payment_method: "cash", customer_id: "" }); };
  const doSell = async () => {
    const qty = parseFloat(sellForm.quantity);
    if (!qty || qty <= 0) return toast.error(ar ? "أدخل الكمية" : "Quantité requise");
    if (sellForm.payment_method === "credit" && !sellForm.customer_id) return toast.error(ar ? "اختر زبوناً للبيع الآجل" : "Choisir un client");
    setSaving(true);
    try {
      const r = await apiClient.post("/cards/sell", {
        card_id: sellDialog.id, quantity: qty,
        sell_price: parseFloat(sellForm.sell_price) || undefined,
        payment_method: sellForm.payment_method,
        customer_id: sellForm.payment_method === "credit" ? sellForm.customer_id : null,
      });
      toast.success(ar ? `تم البيع ${r.data.invoice_number} — الربح: ${r.data.profit} دج` : `Vendu — profit: ${r.data.profit} DA`);
      setSellDialog(null);
      load();
    } catch (e) {
      toast.error(errText(e) || (ar ? "فشل البيع" : "Échec"));
    } finally { setSaving(false); }
  };

  // ── empty SIM purchase ──
  const doSimPurchase = async () => {
    const qty = parseInt(simPurchaseForm.quantity);
    const cost = parseFloat(simPurchaseForm.unit_cost);
    if (!qty || qty <= 0) return toast.error(ar ? "أدخل العدد" : "Quantité requise");
    setSaving(true);
    try {
      const r = await apiClient.post("/sim/purchase", {
        slot_id: simPurchaseDialog.slot_id, quantity: qty, unit_cost: isNaN(cost) ? 0 : cost,
        payment_method: simPurchaseForm.payment_method,
      });
      toast.success(ar ? `تم الشراء — المخزون الآن ${r.data.new_quantity} شريحة` : "Stock SIM ajouté");
      setSimPurchaseDialog(null);
      load();
    } catch (e) {
      toast.error(errText(e) || (ar ? "فشل الشراء" : "Échec"));
    } finally { setSaving(false); }
  };

  // ── SIM topup from cash box ──
  const doTopup = async () => {
    const amount = parseFloat(topupForm.amount);
    if (!amount || amount <= 0) return toast.error(ar ? "أدخل المبلغ" : "Montant requis");
    setSaving(true);
    try {
      const r = await apiClient.post(`/sim/slots/${topupDialog.slot_id}/topup`, {
        amount, payment_method: topupForm.payment_method, notes: topupForm.notes,
      });
      toast.success(ar ? `تم الشحن — الرصيد الجديد: ${r.data.new_balance} دج` : "Rechargé");
      setTopupDialog(null);
      load();
    } catch (e) {
      toast.error(errText(e) || (ar ? "فشل الشحن" : "Échec"));
    } finally { setSaving(false); }
  };

  // ── transfer ──
  const doTransfer = async () => {
    const amount = parseFloat(transferForm.amount);
    if (!amount || amount <= 0) return toast.error(ar ? "أدخل المبلغ" : "Montant requis");
    setSaving(true);
    try {
      await apiClient.post("/sim/transfer", {
        from_kind: transferForm.from_kind,
        from_slot_id: transferForm.from_kind === "slot" ? parseInt(transferForm.from_slot_id) : null,
        to_kind: transferForm.to_kind,
        to_slot_id: transferForm.to_kind === "slot" ? parseInt(transferForm.to_slot_id) : null,
        amount, notes: transferForm.notes,
      });
      toast.success(ar ? "تم التحويل بنجاح" : "Transfert effectué");
      setTransferForm((f) => ({ ...f, amount: "", notes: "" }));
      load();
    } catch (e) {
      toast.error(errText(e) || (ar ? "فشل التحويل" : "Échec"));
    } finally { setSaving(false); }
  };

  const partyLabel = (kind, slotId) => {
    if (kind === "wallet") return ar ? "محفظة الشحن/IPTV" : "Wallet";
    const s = slots.find((x) => x.slot_id === parseInt(slotId));
    return s ? `${s.operator} (${formatCurrency(s.balance)})` : `SIM ${slotId}`;
  };

  const sellProfitPreview = useMemo(() => {
    if (!sellDialog) return 0;
    const qty = parseFloat(sellForm.quantity) || 0;
    const price = parseFloat(sellForm.sell_price) || 0;
    return (price - (sellDialog.unit_cost || 0)) * qty;
  }, [sellDialog, sellForm]);

  if (loading) return <Layout><LoadingState /></Layout>;

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4" data-testid="telecom-stock-page">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-7 w-7 text-primary" />
            {ar ? "مخزون خدمة شحن الرصيد" : "Stock recharge"}
          </h1>
          <Button onClick={openNewCard} className="gap-2" data-testid="card-add-btn">
            <Plus className="h-4 w-4" />
            {ar ? "إضافة نوع بطاقة" : "Nouvelle carte"}
          </Button>
        </div>

        {/* summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" />{ar ? "محفظة الشحن/IPTV" : "Wallet"}</div>
            <div className="text-lg font-bold" data-testid="sum-wallet">{formatCurrency(walletBalance)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Smartphone className="h-3 w-3" />{ar ? "أرصدة الشرائح" : "SIMs"}</div>
            <div className="text-lg font-bold" data-testid="sum-sims">{formatCurrency(slots.reduce((t, s) => t + (s.balance || 0) + (s.bonus_balance || 0), 0))}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><CreditCard className="h-3 w-3" />{ar ? "قيمة مخزون الكروت" : "Stock cartes"}</div>
            <div className="text-lg font-bold" data-testid="sum-cards">{formatCurrency(cardsSummary.stock_value)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" />{ar ? "الشرائح الفارغة" : "SIMs vides"}</div>
            <div className="text-lg font-bold" data-testid="sum-empty-sims">{slots.reduce((t, s) => t + (s.empty_sims || 0), 0)}</div>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="cards">
          <TabsList>
            <TabsTrigger value="cards" data-testid="cards-tab">{ar ? "الكروت والبطاقات" : "Cartes"}</TabsTrigger>
            <TabsTrigger value="sims" data-testid="sims-tab">{ar ? "الشرائح الفارغة" : "SIMs"}</TabsTrigger>
            <TabsTrigger value="transfer" data-testid="transfer-tab">{ar ? "تحويل وشحن الرصيد" : "Transferts"}</TabsTrigger>
          </TabsList>

          {/* ==== cards tab ==== */}
          <TabsContent value="cards">
            <Card>
              <CardHeader><CardTitle className="text-base">{ar ? "أنواع الكروت المعروضة للبيع" : "Types de cartes"}</CardTitle></CardHeader>
              <CardContent>
                {cards.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    {ar ? "لا توجد بطاقات بعد — أضف نوع بطاقة ثم قم بالتموين" : "Aucune carte"}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{ar ? "البطاقة" : "Carte"}</TableHead>
                        <TableHead>{ar ? "النوع" : "Type"}</TableHead>
                        <TableHead>{ar ? "المتعامل" : "Opérateur"}</TableHead>
                        <TableHead>{ar ? "القيمة" : "Valeur"}</TableHead>
                        <TableHead>{ar ? "المخزون" : "Stock"}</TableHead>
                        <TableHead>{ar ? "متوسط التكلفة" : "Coût moy."}</TableHead>
                        <TableHead>{ar ? "سعر البيع" : "Prix vente"}</TableHead>
                        <TableHead>{ar ? "قيمة المخزون" : "Valeur"}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cards.map((c) => (
                        <TableRow key={c.id} data-testid={`card-row-${c.id}`}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell><Badge variant="outline">{(KIND_LABELS[c.kind] || {})[ar ? "ar" : "fr"] || c.kind}</Badge></TableCell>
                          <TableCell>{(OP_LABELS[c.operator] || {})[ar ? "ar" : "fr"] || c.operator}</TableCell>
                          <TableCell>{formatCurrency(c.denomination)}</TableCell>
                          <TableCell className={c.quantity <= 0 ? "text-red-600 font-bold" : "font-bold"}>{c.quantity}</TableCell>
                          <TableCell>{formatCurrency(c.unit_cost)}</TableCell>
                          <TableCell>{formatCurrency(c.sell_price)}</TableCell>
                          <TableCell>{formatCurrency((c.quantity || 0) * (c.unit_cost || 0))}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openPurchase(c)} data-testid={`card-purchase-${c.id}`}>
                                <Download className="h-3 w-3" />{ar ? "تموين" : "Achat"}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openSell(c)} disabled={c.quantity <= 0} data-testid={`card-sell-${c.id}`}>
                                <ShoppingCart className="h-3 w-3" />{ar ? "بيع" : "Vendre"}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditCard(c)} data-testid={`card-edit-${c.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => deleteCard(c)} data-testid={`card-delete-${c.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==== empty SIMs tab ==== */}
          <TabsContent value="sims">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {slots.map((s) => (
                <Card key={s.slot_id} data-testid={`sim-slot-card-${s.slot_id}`}>
                  <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4" />{s.operator}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{ar ? "الشرائح الفارغة" : "SIMs vides"}</span>
                      <span className="font-bold" data-testid={`sim-empty-${s.slot_id}`}>{s.empty_sims || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{ar ? "متوسط تكلفة الشريحة" : "Coût moyen"}</span>
                      <span>{formatCurrency(s.sim_unit_cost || 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{ar ? "قيمة المخزون" : "Valeur"}</span>
                      <span className="font-semibold">{formatCurrency((s.empty_sims || 0) * (s.sim_unit_cost || 0))}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2">
                      <span className="text-muted-foreground">{ar ? "الرصيد" : "Solde"}</span>
                      <span className="font-bold">{formatCurrency(s.balance || 0)}{(s.bonus_balance || 0) ? ` (+${formatCurrency(s.bonus_balance)} ${ar ? "بونيس" : "bonus"})` : ""}</span>
                    </div>
                    <Button className="w-full gap-2" variant="outline" onClick={() => { setSimPurchaseDialog(s); setSimPurchaseForm({ quantity: "", unit_cost: String(s.sim_unit_cost || 100), payment_method: "cash" }); }} data-testid={`sim-purchase-${s.slot_id}`}>
                      <Download className="h-4 w-4" />{ar ? "شراء شرائح فارغة (تموين)" : "Acheter des SIMs"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ==== transfer tab ==== */}
          <TabsContent value="transfer">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" />{ar ? "تحويل رصيد (1:1)" : "Transfert de solde"}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>{ar ? "من" : "De"}</Label>
                      <Select value={`${transferForm.from_kind}:${transferForm.from_slot_id}`} onValueChange={(v) => { const [k, sid] = v.split(":"); setTransferForm((f) => ({ ...f, from_kind: k, from_slot_id: sid })); }}>
                        <SelectTrigger data-testid="transfer-from"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {slots.map((s) => <SelectItem key={s.slot_id} value={`slot:${s.slot_id}`}>{s.operator} ({formatCurrency(s.balance)})</SelectItem>)}
                          <SelectItem value="wallet:">{ar ? "محفظة الشحن/IPTV" : "Wallet"} ({formatCurrency(walletBalance)})</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>{ar ? "إلى" : "Vers"}</Label>
                      <Select value={`${transferForm.to_kind}:${transferForm.to_slot_id}`} onValueChange={(v) => { const [k, sid] = v.split(":"); setTransferForm((f) => ({ ...f, to_kind: k, to_slot_id: sid })); }}>
                        <SelectTrigger data-testid="transfer-to"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {slots.map((s) => <SelectItem key={s.slot_id} value={`slot:${s.slot_id}`}>{s.operator} ({formatCurrency(s.balance)})</SelectItem>)}
                          <SelectItem value="wallet:">{ar ? "محفظة الشحن/IPTV" : "Wallet"} ({formatCurrency(walletBalance)})</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>{ar ? "المبلغ" : "Montant"}</Label>
                    <Input type="number" dir="ltr" value={transferForm.amount} onChange={(e) => setTransferForm((f) => ({ ...f, amount: e.target.value }))} data-testid="transfer-amount" />
                  </div>
                  <div className="space-y-1">
                    <Label>{ar ? "ملاحظة" : "Note"}</Label>
                    <Input value={transferForm.notes} onChange={(e) => setTransferForm((f) => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <Button className="w-full gap-2" onClick={doTransfer} disabled={saving} data-testid="transfer-submit">
                    <ArrowLeftRight className="h-4 w-4" />{ar ? "تنفيذ التحويل" : "Transférer"}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" />{ar ? "شحن رصيد شريحة من الصندوق" : "Recharger une SIM"}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {ar ? "عند شحن شريحتك الخاصة لدى المتعامل: يُخصم المبلغ من الصندوق ويُضاف لرصيد الشريحة (رأس المال لا يتغير)." : "Cash → solde SIM."}
                  </p>
                  {slots.map((s) => (
                    <div key={s.slot_id} className="flex items-center justify-between border rounded-md p-2">
                      <div>
                        <div className="font-medium text-sm">{s.operator}</div>
                        <div className="text-xs text-muted-foreground">{ar ? "الرصيد:" : "Solde:"} {formatCurrency(s.balance || 0)}</div>
                      </div>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => { setTopupDialog(s); setTopupForm({ amount: "", payment_method: "cash", notes: "" }); }} data-testid={`sim-topup-${s.slot_id}`}>
                        <Zap className="h-3 w-3" />{ar ? "شحن" : "Recharger"}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ==== card type dialog ==== */}
      <Dialog open={cardDialog} onOpenChange={setCardDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingCard ? (ar ? "تعديل بطاقة" : "Modifier") : (ar ? "إضافة نوع بطاقة" : "Nouvelle carte")}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{ar ? "النوع" : "Type"}</Label>
              <Select value={cardForm.kind} onValueChange={(v) => setCardForm((f) => ({ ...f, kind: v }))}>
                <SelectTrigger data-testid="card-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{ar ? l.ar : l.fr}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{ar ? "المتعامل" : "Opérateur"}</Label>
              <Select value={cardForm.operator} onValueChange={(v) => setCardForm((f) => ({ ...f, operator: v }))}>
                <SelectTrigger data-testid="card-operator"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(OP_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{ar ? l.ar : l.fr}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{ar ? "اسم البطاقة" : "Nom"}</Label>
              <Input value={cardForm.name} onChange={(e) => setCardForm((f) => ({ ...f, name: e.target.value }))} placeholder={ar ? "مثال: كرت موبيليس 500" : ""} data-testid="card-name" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? "القيمة الاسمية" : "Valeur"}</Label>
              <Input type="number" dir="ltr" value={cardForm.denomination} onChange={(e) => setCardForm((f) => ({ ...f, denomination: e.target.value }))} data-testid="card-denomination" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? "سعر البيع" : "Prix vente"}</Label>
              <Input type="number" dir="ltr" value={cardForm.sell_price} onChange={(e) => setCardForm((f) => ({ ...f, sell_price: e.target.value }))} data-testid="card-sell-price" />
            </div>
            {!editingCard && (
              <>
                <div className="space-y-1">
                  <Label>{ar ? "مخزون افتتاحي (اختياري)" : "Stock initial"}</Label>
                  <Input type="number" dir="ltr" value={cardForm.quantity} onChange={(e) => setCardForm((f) => ({ ...f, quantity: e.target.value }))} data-testid="card-init-qty" />
                </div>
                <div className="space-y-1">
                  <Label>{ar ? "تكلفة الوحدة للمخزون الافتتاحي" : "Coût unitaire"}</Label>
                  <Input type="number" dir="ltr" value={cardForm.unit_cost} onChange={(e) => setCardForm((f) => ({ ...f, unit_cost: e.target.value }))} data-testid="card-init-cost" />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCardDialog(false)}>{ar ? "إلغاء" : "Annuler"}</Button>
            <Button onClick={saveCard} disabled={saving} data-testid="card-save-btn">{ar ? "حفظ" : "Enregistrer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==== purchase dialog ==== */}
      <Dialog open={!!purchaseDialog} onOpenChange={(o) => !o && setPurchaseDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{ar ? `تموين: ${purchaseDialog?.name || ""}` : "Achat"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{ar ? "الكمية" : "Quantité"}</Label>
              <Input type="number" dir="ltr" value={purchaseForm.quantity} onChange={(e) => setPurchaseForm((f) => ({ ...f, quantity: e.target.value }))} data-testid="purchase-qty" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? "سعر شراء الوحدة" : "Prix d'achat"}</Label>
              <Input type="number" dir="ltr" value={purchaseForm.unit_cost} onChange={(e) => setPurchaseForm((f) => ({ ...f, unit_cost: e.target.value }))} data-testid="purchase-cost" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{ar ? "الدفع من" : "Caisse"}</Label>
              <Select value={purchaseForm.payment_method} onValueChange={(v) => setPurchaseForm((f) => ({ ...f, payment_method: v }))}>
                <SelectTrigger data-testid="purchase-box"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cashBoxes.map((b) => <SelectItem key={b.id} value={b.id}>{b.name || b.id} ({formatCurrency(b.balance)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 text-sm text-muted-foreground">
              {ar ? "الإجمالي:" : "Total:"} <span className="font-bold text-foreground">{formatCurrency((parseFloat(purchaseForm.quantity) || 0) * (parseFloat(purchaseForm.unit_cost) || 0))}</span>
              {" — "}{ar ? "يُخصم من الصندوق ويتحول إلى مخزون (رأس المال لا يتغير)" : ""}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setPurchaseDialog(null)}>{ar ? "إلغاء" : "Annuler"}</Button>
            <Button onClick={doPurchase} disabled={saving} data-testid="purchase-submit">{ar ? "تأكيد التموين" : "Confirmer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==== sell dialog ==== */}
      <Dialog open={!!sellDialog} onOpenChange={(o) => !o && setSellDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{ar ? `بيع: ${sellDialog?.name || ""}` : "Vendre"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{ar ? "الكمية" : "Quantité"} ({ar ? "المتاح:" : "Stock:"} {sellDialog?.quantity})</Label>
              <Input type="number" dir="ltr" value={sellForm.quantity} onChange={(e) => setSellForm((f) => ({ ...f, quantity: e.target.value }))} data-testid="sell-qty" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? "سعر البيع للوحدة" : "Prix unitaire"}</Label>
              <Input type="number" dir="ltr" value={sellForm.sell_price} onChange={(e) => setSellForm((f) => ({ ...f, sell_price: e.target.value }))} data-testid="sell-price" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{ar ? "طريقة الدفع" : "Paiement"}</Label>
              <Select value={sellForm.payment_method} onValueChange={(v) => setSellForm((f) => ({ ...f, payment_method: v, customer_id: "" }))}>
                <SelectTrigger data-testid="sell-payment"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cashBoxes.map((b) => <SelectItem key={b.id} value={b.id}>{ar ? "نقدي إلى" : "Cash →"} {b.name || b.id}</SelectItem>)}
                  <SelectItem value="credit">{ar ? "آجل (دين على زبون)" : "Crédit"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {sellForm.payment_method === "credit" && (
              <div className="space-y-1 col-span-2">
                <Label>{ar ? "الزبون" : "Client"}</Label>
                <Select value={sellForm.customer_id} onValueChange={(v) => setSellForm((f) => ({ ...f, customer_id: v }))}>
                  <SelectTrigger data-testid="sell-customer"><SelectValue placeholder={ar ? "اختر زبوناً" : "Choisir"} /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className={`col-span-2 text-sm font-bold ${sellProfitPreview >= 0 ? "text-emerald-600" : "text-red-600"}`} data-testid="sell-profit-preview">
              {ar ? "الربح المتوقع:" : "Profit:"} {formatCurrency(sellProfitPreview)}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSellDialog(null)}>{ar ? "إلغاء" : "Annuler"}</Button>
            <Button onClick={doSell} disabled={saving} data-testid="sell-submit">{ar ? "تأكيد البيع" : "Confirmer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==== SIM purchase dialog ==== */}
      <Dialog open={!!simPurchaseDialog} onOpenChange={(o) => !o && setSimPurchaseDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{ar ? `شراء شرائح فارغة: ${simPurchaseDialog?.operator || ""}` : "Achat SIMs"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{ar ? "العدد" : "Quantité"}</Label>
              <Input type="number" dir="ltr" value={simPurchaseForm.quantity} onChange={(e) => setSimPurchaseForm((f) => ({ ...f, quantity: e.target.value }))} data-testid="sim-purchase-qty" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? "سعر الشريحة" : "Prix unitaire"}</Label>
              <Input type="number" dir="ltr" value={simPurchaseForm.unit_cost} onChange={(e) => setSimPurchaseForm((f) => ({ ...f, unit_cost: e.target.value }))} data-testid="sim-purchase-cost" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{ar ? "الدفع من" : "Caisse"}</Label>
              <Select value={simPurchaseForm.payment_method} onValueChange={(v) => setSimPurchaseForm((f) => ({ ...f, payment_method: v }))}>
                <SelectTrigger data-testid="sim-purchase-box"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cashBoxes.map((b) => <SelectItem key={b.id} value={b.id}>{b.name || b.id} ({formatCurrency(b.balance)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 text-sm text-muted-foreground">
              {ar ? "الإجمالي:" : "Total:"} <span className="font-bold text-foreground">{formatCurrency((parseInt(simPurchaseForm.quantity) || 0) * (parseFloat(simPurchaseForm.unit_cost) || 0))}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setSimPurchaseDialog(null)}>{ar ? "إلغاء" : "Annuler"}</Button>
            <Button onClick={doSimPurchase} disabled={saving} data-testid="sim-purchase-submit">{ar ? "تأكيد الشراء" : "Confirmer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==== SIM topup dialog ==== */}
      <Dialog open={!!topupDialog} onOpenChange={(o) => !o && setTopupDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{ar ? `شحن رصيد: ${topupDialog?.operator || ""}` : "Recharger"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{ar ? "المبلغ" : "Montant"}</Label>
              <Input type="number" dir="ltr" value={topupForm.amount} onChange={(e) => setTopupForm((f) => ({ ...f, amount: e.target.value }))} data-testid="topup-amount" />
            </div>
            <div className="space-y-1">
              <Label>{ar ? "الدفع من" : "Caisse"}</Label>
              <Select value={topupForm.payment_method} onValueChange={(v) => setTopupForm((f) => ({ ...f, payment_method: v }))}>
                <SelectTrigger data-testid="topup-box"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cashBoxes.map((b) => <SelectItem key={b.id} value={b.id}>{b.name || b.id} ({formatCurrency(b.balance)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setTopupDialog(null)}>{ar ? "إلغاء" : "Annuler"}</Button>
            <Button onClick={doTopup} disabled={saving} data-testid="topup-submit">{ar ? "تأكيد الشحن" : "Confirmer"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
