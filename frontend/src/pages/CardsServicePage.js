/**
 * Cards Service Page — sells phone recharge cards (Mobilis/Djezzy/Ooredoo)
 * from the tenant's own inventory.
 *
 * Two tabs:
 *   1. Buy from Platform — order new codes from the super-admin
 *   2. My inventory — list available/sold codes the tenant already owns
 */
import { useEffect, useState, useCallback } from "react";
import apiClient from "../lib/apiClient";
import { useLanguage } from "../contexts/LanguageContext";
import { Layout } from "../components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { CreditCard, Loader2, Copy, Search, ShoppingCart, Package, Printer, FileText, Receipt } from "lucide-react";
import { toast } from "sonner";
import BuyFromPlatform from "../components/BuyFromPlatform";
import { printPlatformCardInvoice } from "../lib/platformCardInvoice";

const OPERATORS = [
  { id: "Mobilis", color: "bg-green-500" },
  { id: "Djezzy", color: "bg-red-500" },
  { id: "Ooredoo", color: "bg-orange-500" },
];

export default function CardsServicePage() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const [tab, setTab] = useState("buy");
  const [operator, setOperator] = useState("Mobilis");
  const [codes, setCodes] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Sales (reprint) state
  const [sales, setSales] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesSearch, setSalesSearch] = useState("");
  const [branding, setBranding] = useState({ name: "" });
  const [salesPage, setSalesPage] = useState(0);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesHasMore, setSalesHasMore] = useState(false);
  const SALES_PAGE_SIZE = 50;

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (operator) params.operator = operator;
      if (statusFilter) params.status = statusFilter;
      const res = await apiClient.get("/platform-cards", { params });
      setCodes(res.data?.items || res.data || []);
    } catch (_e) {
      setCodes([]);
    } finally {
      setLoading(false);
    }
  }, [operator, statusFilter]);

  const loadSales = useCallback(async (page = salesPage, query = salesSearch) => {
    setSalesLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(SALES_PAGE_SIZE));
      params.set("skip", String(page * SALES_PAGE_SIZE));
      if (query && query.trim()) params.set("search", query.trim());
      const [s, b] = await Promise.all([
        apiClient.get(`/platform-cards/sales?${params.toString()}`),
        apiClient.get("/settings/tenant-branding").catch(() => ({ data: {} })),
      ]);
      // Backend now returns {items, total, has_more, ...} — fall back to
      // raw array for backwards-compat if an old version is deployed.
      const data = s.data;
      if (Array.isArray(data)) {
        setSales(data);
        setSalesTotal(data.length);
        setSalesHasMore(false);
      } else {
        setSales(data?.items || []);
        setSalesTotal(data?.total || 0);
        setSalesHasMore(Boolean(data?.has_more));
      }
      setBranding({ name: b.data?.name || "" });
    } catch (_e) {
      setSales([]);
      setSalesTotal(0);
      setSalesHasMore(false);
    } finally {
      setSalesLoading(false);
    }
  // salesPage/salesSearch read via default args — reload triggered by setters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "inventory") loadInventory();
    if (tab === "sales") loadSales();
  }, [tab, loadInventory, loadSales]);

  const filtered = codes.filter((c) =>
    !search || (c.code || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredSales = sales; // server-side filter — no extra client trimming

  const reprintSale = (sale, format) => {
    try { localStorage.setItem("pos.last_invoice_format", format); } catch { /* noop */ }
    const ok = printPlatformCardInvoice({
      format,
      storeName: branding.name || "متجري",
      sale,
      card: { code: sale.code, operator: sale.operator, denomination: sale.denomination },
      customer: sale.customer_name || "",
      customerPhone: sale.customer_phone || "",
    });
    if (!ok) toast.error(ar ? "فضلاً اسمح بالنوافذ المنبثقة للطباعة" : "Autorisez les popups pour imprimer");
  };

  const lastFormat = (() => {
    try { return localStorage.getItem("pos.last_invoice_format") || "thermal80"; } catch { return "thermal80"; }
  })();

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success(ar ? "تم النسخ" : "Copié");
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="cards-page">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-blue-600" />
              {ar ? "بطاقات تعبئة" : "Cartes de recharge"}
            </h1>
            <p className="text-sm text-muted-foreground">{ar ? "إدارة كروت Mobilis / Djezzy / Ooredoo" : "Gérer les cartes Mobilis / Djezzy / Ooredoo"}</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="buy" data-testid="tab-buy"><ShoppingCart className="h-4 w-4 ml-2" />{ar ? "شراء من المنصة" : "Acheter"}</TabsTrigger>
            <TabsTrigger value="inventory" data-testid="tab-inventory"><Package className="h-4 w-4 ml-2" />{ar ? "مخزوني" : "Mon inventaire"}</TabsTrigger>
            <TabsTrigger value="sales" data-testid="tab-sales"><Receipt className="h-4 w-4 ml-2" />{ar ? "المبيعات" : "Ventes"}</TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-600">{ar ? "فلتر بالمشغّل:" : "Filtrer par opérateur:"}</span>
                {OPERATORS.map((op) => (
                  <Button
                    key={op.id}
                    variant={operator === op.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOperator(op.id)}
                    data-testid={`op-${op.id}`}
                  >
                    {op.id}
                  </Button>
                ))}
              </div>
              <BuyFromPlatform type="card" operator={operator} onOrdered={() => setTab("inventory")} />
            </div>
          </TabsContent>

          <TabsContent value="inventory" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{ar ? "أكوادي" : "Mes codes"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pr-8" placeholder={ar ? "بحث برقم الكود" : "Rechercher"} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="search-input" />
                  </div>
                  <select className="border rounded px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="status-filter">
                    <option value="">{ar ? "كل الحالات" : "Tous"}</option>
                    <option value="available">{ar ? "متاح" : "Disponible"}</option>
                    <option value="sold">{ar ? "مُباع" : "Vendu"}</option>
                  </select>
                  {OPERATORS.map((op) => (
                    <Button key={op.id} variant={operator === op.id ? "default" : "outline"} size="sm" onClick={() => setOperator(op.id)}>{op.id}</Button>
                  ))}
                  <Button variant="outline" size="sm" onClick={loadInventory}>{ar ? "تحديث" : "Actualiser"}</Button>
                </div>
                {loading ? (
                  <div className="text-center py-8"><Loader2 className="animate-spin h-6 w-6 mx-auto text-muted-foreground" /></div>
                ) : !filtered.length ? (
                  <div className="text-center py-10 text-muted-foreground" data-testid="empty-inventory">{ar ? "لا توجد أكواد في المخزون. اطلب من تبويب الشراء." : "Pas de codes en stock."}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{ar ? "الكود" : "Code"}</TableHead>
                        <TableHead>{ar ? "الفئة" : "Montant"}</TableHead>
                        <TableHead>{ar ? "الحالة" : "Statut"}</TableHead>
                        <TableHead>{ar ? "المصدر" : "Source"}</TableHead>
                        <TableHead>{ar ? "التاريخ" : "Date"}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c) => (
                        <TableRow key={c.id} data-testid={`code-row-${c.id}`}>
                          <TableCell className="font-mono">{c.code}</TableCell>
                          <TableCell>{c.denomination} دج</TableCell>
                          <TableCell>
                            <Badge className={c.status === "available" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}>
                              {c.status === "available" ? (ar ? "متاح" : "Disponible") : (ar ? "مُباع" : "Vendu")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{c.source === "platform" ? (ar ? "من المنصة" : "Plateforme") : (ar ? "خاص" : "Privé")}</TableCell>
                          <TableCell className="text-xs">{new Date(c.created_at).toLocaleDateString("ar")}</TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" onClick={() => copyCode(c.code)}><Copy className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sales" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-blue-600" />
                  {ar ? "سجل مبيعات الكروت" : "Historique des ventes"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pr-8"
                      placeholder={ar ? "ابحث بالكود، الزبون، الهاتف، أو رقم الفاتورة" : "Rechercher par code, client, ou facture"}
                      value={salesSearch}
                      onChange={(e) => setSalesSearch(e.target.value)}
                      data-testid="sales-search-input"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => loadSales(salesPage, salesSearch)} data-testid="refresh-sales-btn">
                    {ar ? "تحديث" : "Actualiser"}
                  </Button>
                  <span className="text-xs text-muted-foreground ms-auto">
                    {ar ? "الصيغة الافتراضية:" : "Format par défaut:"} <strong>{lastFormat === "thermal58" ? "58mm" : lastFormat === "a5" ? "A5" : "80mm"}</strong>
                  </span>
                </div>
                {salesLoading ? (
                  <div className="text-center py-8"><Loader2 className="animate-spin h-6 w-6 mx-auto text-muted-foreground" /></div>
                ) : !filteredSales.length ? (
                  <div className="text-center py-10 text-muted-foreground" data-testid="empty-sales">
                    {ar ? "لا توجد مبيعات بعد." : "Aucune vente."}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{ar ? "الفاتورة" : "Facture"}</TableHead>
                        <TableHead>{ar ? "البطاقة" : "Carte"}</TableHead>
                        <TableHead>{ar ? "الكود" : "Code"}</TableHead>
                        <TableHead>{ar ? "السعر" : "Prix"}</TableHead>
                        <TableHead>{ar ? "الزبون" : "Client"}</TableHead>
                        <TableHead>{ar ? "الدفع" : "Paiement"}</TableHead>
                        <TableHead>{ar ? "التاريخ" : "Date"}</TableHead>
                        <TableHead className="text-center">{ar ? "الطباعة" : "Imprimer"}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSales.map((s) => {
                        const invoiceNo = s.invoice_number || (s.id ? `CARD-${String(s.id).replace(/-/g, "").slice(0, 8).toUpperCase()}` : "—");
                        return (
                          <TableRow key={s.id || `${s.code}-${s.created_at}`} data-testid={`sale-row-${s.id}`}>
                            <TableCell className="font-mono text-xs">{invoiceNo}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{s.operator}</Badge>
                              <span className="ms-2 text-sm">{s.denomination} دج</span>
                            </TableCell>
                            <TableCell className="font-mono text-sm" dir="ltr">{s.code}</TableCell>
                            <TableCell className="font-semibold">{Number(s.sell_price || 0).toLocaleString("ar-DZ")} دج</TableCell>
                            <TableCell className="text-xs">
                              {s.customer_name || "—"}
                              {s.customer_phone && <div className="text-muted-foreground" dir="ltr">{s.customer_phone}</div>}
                            </TableCell>
                            <TableCell>
                              {s.payment_method === "credit" ? (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700">{ar ? "آجل" : "Crédit"}</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700">{ar ? "نقدي" : "Cash"}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {s.created_at ? new Date(s.created_at).toLocaleString(ar ? "ar-DZ" : "fr") : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant={lastFormat === "thermal58" ? "default" : "outline"}
                                  onClick={() => reprintSale(s, "thermal58")}
                                  title="58mm"
                                  data-testid={`reprint-58mm-${s.id}`}
                                >
                                  <Printer className="h-3 w-3 me-1" />58
                                </Button>
                                <Button
                                  size="sm"
                                  variant={lastFormat === "thermal80" ? "default" : "outline"}
                                  onClick={() => reprintSale(s, "thermal80")}
                                  title="80mm"
                                  data-testid={`reprint-80mm-${s.id}`}
                                >
                                  <Printer className="h-3 w-3 me-1" />80
                                </Button>
                                <Button
                                  size="sm"
                                  variant={lastFormat === "a5" ? "default" : "outline"}
                                  onClick={() => reprintSale(s, "a5")}
                                  title="A5"
                                  data-testid={`reprint-a5-${s.id}`}
                                >
                                  <FileText className="h-3 w-3 me-1" />A5
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
                {/* Pagination footer */}
                {salesTotal > SALES_PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border" data-testid="sales-pagination">
                    <span className="text-xs text-muted-foreground">
                      {ar
                        ? `الصفحة ${salesPage + 1} — يعرض ${sales.length} من أصل ${salesTotal}`
                        : `Page ${salesPage + 1} — ${sales.length} sur ${salesTotal}`}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={salesPage === 0 || salesLoading}
                        onClick={() => setSalesPage(p => Math.max(0, p - 1))}
                        data-testid="sales-prev-btn"
                      >
                        {ar ? "السابق" : "Précédent"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!salesHasMore || salesLoading}
                        onClick={() => setSalesPage(p => p + 1)}
                        data-testid="sales-next-btn"
                      >
                        {ar ? "التالي" : "Suivant"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
