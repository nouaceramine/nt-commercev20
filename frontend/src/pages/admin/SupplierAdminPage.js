import { useEffect, useState } from "react";
import { Layout } from "../../components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { toast } from "sonner";
import apiClient from "../../lib/apiClient";
import { Loader2, Plus, Upload, Trash2, Pencil, Package, Wifi, CreditCard, ShoppingCart, Smartphone, Wallet } from "lucide-react";
import { PlatformFinanceTab } from "./PlatformFinanceTab";

const OPERATORS = ["Mobilis", "Djezzy", "Ooredoo"];
const SIM_OPERATORS = ["Mobilis", "Djezzy", "Ooredoo", "Sama"];
const SIM_TIER_LABELS = { retail: "تجزئة", wholesale: "جملة" };

export default function SupplierAdminPage() {
  const [tab, setTab] = useState("cards");
  const [cards, setCards] = useState([]);
  const [idoom, setIdoom] = useState([]);
  const [sims, setSims] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [stockCards, setStockCards] = useState({});
  const [stockIdoom, setStockIdoom] = useState({});
  const [stockSims, setStockSims] = useState({});
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [showAddIdoom, setShowAddIdoom] = useState(false);
  const [showAddSim, setShowAddSim] = useState(false);
  const [showUpload, setShowUpload] = useState(null);
  const [showPriceDialog, setShowPriceDialog] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [c, i, s, t, sc, si, ss, o] = await Promise.all([
        apiClient.get("/admin/supplier/catalog/cards"),
        apiClient.get("/admin/supplier/catalog/idoom"),
        apiClient.get("/admin/supplier/catalog/sims"),
        apiClient.get("/saas/tenants"),
        apiClient.get("/admin/supplier/stock/cards"),
        apiClient.get("/admin/supplier/stock/idoom"),
        apiClient.get("/admin/supplier/stock/sims"),
        apiClient.get("/admin/supplier/orders"),
      ]);
      setCards(c.data || []);
      setIdoom(i.data || []);
      setSims(s.data || []);
      setTenants(t.data || []);
      const aggCards = {};
      (sc.data?.rows || []).forEach((r) => {
        const cid = r._id.catalog_id;
        aggCards[cid] = aggCards[cid] || { available: 0, reserved: 0, sold: 0 };
        aggCards[cid][r._id.status] = r.count;
      });
      setStockCards(aggCards);
      const aggIdoom = {};
      (si.data?.rows || []).forEach((r) => {
        const cid = r._id.catalog_id;
        aggIdoom[cid] = aggIdoom[cid] || { available: 0, reserved: 0, sold: 0 };
        aggIdoom[cid][r._id.status] = r.count;
      });
      setStockIdoom(aggIdoom);
      const aggSims = {};
      (ss.data?.rows || []).forEach((r) => {
        const cid = r._id.catalog_id;
        aggSims[cid] = aggSims[cid] || { available: 0, reserved: 0, sold: 0 };
        aggSims[cid][r._id.status] = r.count;
      });
      setStockSims(aggSims);
      setOrders(o.data || []);
    } catch (e) {
      toast.error("فشل التحميل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const deleteCatalog = async (type, id) => {
    if (!window.confirm("هل أنت متأكد من الحذف؟")) return;
    try {
      await apiClient.delete(`/admin/supplier/catalog/${type}/${id}`);
      toast.success("تم الحذف");
      reload();
    } catch (_e) {
      toast.error("فشل الحذف");
    }
  };

  const stockOf = (type, id) => {
    const map = type === "cards" ? stockCards : type === "sims" ? stockSims : stockIdoom;
    return map[id] || { available: 0, reserved: 0, sold: 0 };
  };

  return (
    <Layout>
    <div className="p-6 space-y-6" dir="rtl" data-testid="supplier-admin-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-purple-600" /> المنصة كمورد
          </h1>
          <p className="text-sm text-gray-500">إدارة كتالوج البطاقات/Idoom والمخزون المركزي وطلبات المستأجرين</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="cards" data-testid="tab-cards"><CreditCard className="h-4 w-4 ml-2" /> البطاقات</TabsTrigger>
          <TabsTrigger value="sims" data-testid="tab-sims"><Smartphone className="h-4 w-4 ml-2" /> شرائح SIM</TabsTrigger>
          <TabsTrigger value="idoom" data-testid="tab-idoom"><Wifi className="h-4 w-4 ml-2" /> Idoom</TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders"><ShoppingCart className="h-4 w-4 ml-2" /> الطلبات</TabsTrigger>
          <TabsTrigger value="finance" data-testid="tab-finance"><Wallet className="h-4 w-4 ml-2" /> إدارة المال</TabsTrigger>
        </TabsList>

        {/* CARDS TAB */}
        <TabsContent value="cards" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>كتالوج البطاقات</CardTitle>
              <Button onClick={() => setShowAddCard(true)} data-testid="add-card-btn"><Plus className="h-4 w-4 ml-2" /> إضافة فئة</Button>
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="animate-spin mx-auto h-6 w-6" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المشغّل</TableHead>
                      <TableHead>الفئة</TableHead>
                      <TableHead>السعر الافتراضي</TableHead>
                      <TableHead>المخزون (متاح/محجوز/مُباع)</TableHead>
                      <TableHead>عدد الأسعار المخصصة</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cards.map((c) => {
                      const s = stockOf("cards", c.id);
                      return (
                        <TableRow key={c.id} data-testid={`card-row-${c.id}`}>
                          <TableCell><Badge>{c.operator}</Badge></TableCell>
                          <TableCell>{c.denomination} دج</TableCell>
                          <TableCell>{c.default_price} دج</TableCell>
                          <TableCell><span className="text-green-700">{s.available}</span> / <span className="text-amber-600">{s.reserved}</span> / <span className="text-gray-500">{s.sold}</span></TableCell>
                          <TableCell>{Object.keys(c.tenant_prices || {}).length}</TableCell>
                          <TableCell className="space-x-2 space-x-reverse whitespace-nowrap">
                            <Button size="sm" variant="default" className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowUpload({ type: "cards", catalogId: c.id, label: `${c.operator} ${c.denomination}` })} data-testid={`upload-${c.id}`}>
                              <Upload className="h-4 w-4 ml-1" /> رفع أكواد
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setShowPriceDialog({ type: "cards", item: c })} title="أسعار مخصصة"><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteCatalog("cards", c.id)} data-testid={`del-${c.id}`} title="حذف"><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!cards.length && <TableRow><TableCell colSpan={6} className="text-center text-gray-500">لا توجد فئات. أضف فئة جديدة</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SIMS TAB — physical SIM cards (شرائح) */}
        <TabsContent value="sims" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>كتالوج شرائح SIM</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  شرائح SIM فعلية يبيعها المستأجرون عبر البريدج لزبائنهم. ICCID = الكود الفريد لكل شريحة.
                </p>
              </div>
              <Button onClick={() => setShowAddSim(true)} data-testid="add-sim-btn"><Plus className="h-4 w-4 ml-2" /> إضافة فئة</Button>
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="animate-spin mx-auto h-6 w-6" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المُشغِّل</TableHead>
                      <TableHead>المستوى</TableHead>
                      <TableHead>الاسم</TableHead>
                      <TableHead>سعر الشراء (من المنصة)</TableHead>
                      <TableHead>سعر البيع المُقترَح</TableHead>
                      <TableHead>المخزون (متاح/محجوز/مُباع)</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sims.map((s) => {
                      const stock = stockOf("sims", s.id);
                      const tierColor = s.tier === "wholesale" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800";
                      return (
                        <TableRow key={s.id} data-testid={`sim-row-${s.id}`}>
                          <TableCell><Badge>{s.operator}</Badge></TableCell>
                          <TableCell><Badge className={tierColor}>{SIM_TIER_LABELS[s.tier]}</Badge></TableCell>
                          <TableCell className="text-sm">{s.name_ar || `${s.operator} ${SIM_TIER_LABELS[s.tier]}`}</TableCell>
                          <TableCell className="font-semibold">{s.default_price} دج</TableCell>
                          <TableCell className="text-green-700">{s.suggested_retail_price ? `${s.suggested_retail_price} دج` : "—"}</TableCell>
                          <TableCell>
                            <span className="text-green-700">{stock.available}</span> /{" "}
                            <span className="text-amber-600">{stock.reserved}</span> /{" "}
                            <span className="text-gray-500">{stock.sold}</span>
                          </TableCell>
                          <TableCell className="space-x-2 space-x-reverse whitespace-nowrap">
                            <Button size="sm" variant="default" className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowUpload({ type: "sims", catalogId: s.id, label: `${s.operator} ${SIM_TIER_LABELS[s.tier]}` })} data-testid={`sim-upload-${s.id}`}>
                              <Upload className="h-4 w-4 ml-1" /> رفع ICCID
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setShowPriceDialog({ type: "sims", item: s })} title="أسعار مخصصة"><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteCatalog("sims", s.id)} title="حذف" data-testid={`sim-del-${s.id}`}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!sims.length && <TableRow><TableCell colSpan={7} className="text-center text-gray-500 py-8">لا توجد شرائح بعد — أضف فئة جديدة</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* IDOOM TAB */}
        <TabsContent value="idoom" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>كتالوج Idoom</CardTitle>
              <Button onClick={() => setShowAddIdoom(true)} data-testid="add-idoom-btn"><Plus className="h-4 w-4 ml-2" /> إضافة فئة</Button>
            </CardHeader>
            <CardContent>
              {loading ? <Loader2 className="animate-spin mx-auto h-6 w-6" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الفئة</TableHead>
                      <TableHead>السعر الافتراضي</TableHead>
                      <TableHead>المخزون (متاح/محجوز/مُباع)</TableHead>
                      <TableHead>الأسعار المخصصة</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {idoom.map((i) => {
                      const s = stockOf("idoom", i.id);
                      return (
                        <TableRow key={i.id} data-testid={`idoom-row-${i.id}`}>
                          <TableCell>{i.denomination} دج</TableCell>
                          <TableCell>{i.default_price} دج</TableCell>
                          <TableCell><span className="text-green-700">{s.available}</span> / <span className="text-amber-600">{s.reserved}</span> / <span className="text-gray-500">{s.sold}</span></TableCell>
                          <TableCell>{Object.keys(i.tenant_prices || {}).length}</TableCell>
                          <TableCell className="space-x-2 space-x-reverse whitespace-nowrap">
                            <Button size="sm" variant="default" className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowUpload({ type: "idoom", catalogId: i.id, label: `Idoom ${i.denomination}` })}>
                              <Upload className="h-4 w-4 ml-1" /> رفع أكواد
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setShowPriceDialog({ type: "idoom", item: i })} title="أسعار مخصصة"><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteCatalog("idoom", i.id)} title="حذف"><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!idoom.length && <TableRow><TableCell colSpan={5} className="text-center text-gray-500">لا توجد فئات</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ORDERS TAB */}
        <TabsContent value="orders" className="mt-4">
          <Card>
            <CardHeader><CardTitle>طلبات المستأجرين ({orders.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المستأجر</TableHead>
                    <TableHead>المحتوى</TableHead>
                    <TableHead>الإجمالي</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => {
                    const tenant = tenants.find((t) => t.id === o.tenant_id);
                    return (
                      <TableRow key={o.id} data-testid={`order-row-${o.id}`}>
                        <TableCell className="text-xs">{new Date(o.created_at).toLocaleString("ar")}</TableCell>
                        <TableCell>{tenant?.company_name || tenant?.email || o.tenant_id?.slice(0, 8)}</TableCell>
                        <TableCell className="text-xs">
                          {(o.items || []).map((it, idx) => (
                            <div key={idx}>{it.operator || "Idoom"} {it.denomination} × {it.quantity}</div>
                          ))}
                        </TableCell>
                        <TableCell className="font-bold">{o.total} دج</TableCell>
                        <TableCell><Badge className={o.status === "completed" ? "bg-green-100 text-green-800" : ""}>{o.status}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                  {!orders.length && <TableRow><TableCell colSpan={5} className="text-center text-gray-500">لا توجد طلبات</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FINANCE TAB — money management for the platform-as-supplier */}
        <TabsContent value="finance" className="mt-4">
          <PlatformFinanceTab />
        </TabsContent>
      </Tabs>

      {/* Add card dialog */}
      <Dialog open={showAddCard} onOpenChange={setShowAddCard}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة فئة بطاقة</DialogTitle></DialogHeader>
          <AddCatalogForm
            fields={["operator", "denomination", "default_price"]}
            operators={OPERATORS}
            onSubmit={async (vals) => {
              try { await apiClient.post("/admin/supplier/catalog/cards", vals); toast.success("تم"); setShowAddCard(false); reload(); }
              catch (e) { toast.error(e?.response?.data?.detail || "فشل"); }
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showAddIdoom} onOpenChange={setShowAddIdoom}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة فئة Idoom</DialogTitle></DialogHeader>
          <AddCatalogForm
            fields={["denomination", "default_price"]}
            onSubmit={async (vals) => {
              try { await apiClient.post("/admin/supplier/catalog/idoom", vals); toast.success("تم"); setShowAddIdoom(false); reload(); }
              catch (e) { toast.error(e?.response?.data?.detail || "فشل"); }
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showAddSim} onOpenChange={setShowAddSim}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة فئة شريحة SIM</DialogTitle></DialogHeader>
          <AddCatalogForm
            fields={["operator", "tier", "name_ar", "default_price", "suggested_retail_price"]}
            operators={SIM_OPERATORS}
            onSubmit={async (vals) => {
              try {
                await apiClient.post("/admin/supplier/catalog/sims", vals);
                toast.success("تمَّت إضافة الفئة");
                setShowAddSim(false);
                reload();
              } catch (e) {
                toast.error(e?.response?.data?.detail || "فشل");
              }
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Upload codes */}
      {showUpload && (
        <UploadCodesDialog
          info={showUpload}
          onClose={() => setShowUpload(null)}
          onDone={() => { setShowUpload(null); reload(); }}
        />
      )}

      {/* Per-tenant pricing */}
      {showPriceDialog && (
        <TenantPricingDialog
          info={showPriceDialog}
          tenants={tenants}
          onClose={() => setShowPriceDialog(null)}
          onDone={() => { setShowPriceDialog(null); reload(); }}
        />
      )}
    </div>
    </Layout>
  );
}

function AddCatalogForm({ fields, operators, onSubmit }) {
  const [vals, setVals] = useState({ operator: operators?.[0], tier: "retail", is_active: true });
  return (
    <div className="space-y-3">
      {fields.includes("operator") && (
        <div>
          <Label>المُشغِّل</Label>
          <Select value={vals.operator} onValueChange={(v) => setVals({ ...vals, operator: v })}>
            <SelectTrigger data-testid="catalog-operator"><SelectValue /></SelectTrigger>
            <SelectContent>{operators.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {fields.includes("tier") && (
        <div>
          <Label>المستوى</Label>
          <Select value={vals.tier} onValueChange={(v) => setVals({ ...vals, tier: v })}>
            <SelectTrigger data-testid="catalog-tier"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="retail">تجزئة (سعر مفرد)</SelectItem>
              <SelectItem value="wholesale">جملة (سعر مخفَّض للكمية)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {fields.includes("name_ar") && (
        <div>
          <Label>الاسم (اختياري)</Label>
          <Input
            type="text"
            placeholder="مثلاً: موبيليس - شريحة تجزئة"
            data-testid="catalog-name-ar"
            onChange={(e) => setVals({ ...vals, name_ar: e.target.value })}
          />
        </div>
      )}
      {fields.includes("denomination") && (
        <div>
          <Label>الفئة (دج)</Label>
          <Input type="number" data-testid="catalog-denom" onChange={(e) => setVals({ ...vals, denomination: parseFloat(e.target.value) })} />
        </div>
      )}
      {fields.includes("default_price") && (
        <div>
          <Label>سعر الشراء من المنصة (دج)</Label>
          <Input type="number" data-testid="catalog-price" onChange={(e) => setVals({ ...vals, default_price: parseFloat(e.target.value) })} />
        </div>
      )}
      {fields.includes("suggested_retail_price") && (
        <div>
          <Label>سعر البيع المُقترَح للزبون (دج)</Label>
          <Input
            type="number"
            placeholder="عرض فقط — للإرشاد"
            data-testid="catalog-suggested-retail"
            onChange={(e) => setVals({ ...vals, suggested_retail_price: parseFloat(e.target.value) })}
          />
        </div>
      )}
      <DialogFooter>
        <Button onClick={() => onSubmit(vals)} data-testid="catalog-save"><Plus className="h-4 w-4 ml-2" /> حفظ</Button>
      </DialogFooter>
    </div>
  );
}

function UploadCodesDialog({ info, onClose, onDone }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const blob = new Blob([text], { type: "text/plain" });
      const fd = new FormData();
      fd.append("file", blob, "codes.txt");
      const res = await apiClient.post(`/admin/supplier/stock/${info.type}/${info.catalogId}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(`تم رفع ${res.data?.inserted || 0} كود (تم تخطي ${res.data?.skipped || 0} مكرر)`);
      onDone();
    } catch (e) {
      toast.error("فشل الرفع");
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>رفع أكواد - {info.label}</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500">كود واحد في كل سطر. السطور الفارغة والتي تبدأ بـ # يتم تجاهلها.</p>
        <textarea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full border rounded p-2 font-mono text-sm"
          placeholder="1234567890&#10;0987654321"
          data-testid="upload-textarea"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={busy || !text.trim()} data-testid="upload-submit">
            {busy ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Upload className="h-4 w-4 ml-2" />} رفع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TenantPricingDialog({ info, tenants, onClose, onDone }) {
  const [tenantId, setTenantId] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const overrides = info.item.tenant_prices || {};
  const submit = async () => {
    if (!tenantId || !price) return;
    setBusy(true);
    try {
      await apiClient.put(`/admin/supplier/catalog/${info.type}/${info.item.id}/tenant-price`, { tenant_id: tenantId, price: parseFloat(price) });
      toast.success("تم");
      onDone();
    } catch (_e) { toast.error("فشل"); } finally { setBusy(false); }
  };
  const remove = async (tid) => {
    try {
      await apiClient.delete(`/admin/supplier/catalog/${info.type}/${info.item.id}/tenant-price/${tid}`);
      toast.success("تم");
      onDone();
    } catch (_e) { toast.error("فشل"); }
  };
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>أسعار خاصة بالمستأجرين</DialogTitle></DialogHeader>
        <div className="text-sm text-gray-500">السعر الافتراضي: <b>{info.item.default_price} دج</b></div>
        <div className="space-y-2 max-h-48 overflow-auto">
          {Object.entries(overrides).map(([tid, p]) => {
            const t = tenants.find((x) => x.id === tid);
            return (
              <div key={tid} className="flex items-center justify-between border rounded p-2">
                <span className="text-sm">{t?.company_name || t?.email || tid.slice(0, 8)}</span>
                <span className="font-bold">{p} دج</span>
                <Button size="sm" variant="ghost" onClick={() => remove(tid)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </div>
            );
          })}
          {!Object.keys(overrides).length && <p className="text-xs text-gray-500 text-center">لا توجد أسعار مخصصة</p>}
        </div>
        <div className="border-t pt-3 space-y-2">
          <Label>إضافة سعر مخصص</Label>
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger><SelectValue placeholder="اختر المستأجر" /></SelectTrigger>
            <SelectContent>{tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.company_name || t.email}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" placeholder="السعر (دج)" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="tenant-price-input" />
          <Button onClick={submit} disabled={busy} className="w-full" data-testid="tenant-price-save"><Plus className="h-4 w-4 ml-2" /> حفظ</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
