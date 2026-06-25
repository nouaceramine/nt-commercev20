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
import { CreditCard, Loader2, Copy, Search, ShoppingCart, Package } from "lucide-react";
import { toast } from "sonner";
import BuyFromPlatform from "../components/BuyFromPlatform";

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

  useEffect(() => { if (tab === "inventory") loadInventory(); }, [tab, loadInventory]);

  const filtered = codes.filter((c) =>
    !search || (c.code || "").toLowerCase().includes(search.toLowerCase())
  );

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
        </Tabs>
      </div>
    </Layout>
  );
}
