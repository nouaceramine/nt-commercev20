import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useLanguage } from "../contexts/LanguageContext";
import { Layout } from "../components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import { Store, Plus, Trash2, Globe } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

export default function MarketplacePage() {
  const { language } = useLanguage();
  const ar = language === "ar";

  const [listings, setListings] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({ product_id: "", margin_pct: "" });
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const fetchAll = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([
        axios.get(`${API}/marketplace/my`, { headers }),
        axios.get(`${API}/products`, { headers }),
      ]);
      setListings(l.data.listings || []);
      setProducts(p.data || []);
    } catch (e) {
      toast.error(ar ? "فشل التحميل" : "Échec du chargement");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fmt = (n) => new Intl.NumberFormat(ar ? "ar-DZ" : "fr-FR", { maximumFractionDigits: 2 }).format(n ?? 0);

  const listedIds = new Set(listings.map((l) => l.product_id));
  const available = products.filter((p) => !listedIds.has(p.id));

  const handlePublish = async () => {
    if (!form.product_id) return;
    setSaving(true);
    try {
      const res = await axios.post(`${API}/marketplace/publish`, {
        product_id: form.product_id,
        margin_pct: parseFloat(form.margin_pct || "0") || 0,
      }, { headers });
      toast.success(ar ? `نُشر في السوق بسعر ${fmt(res.data.catalog_price)}` : "Publié au marché");
      setDialog(false);
      setForm({ product_id: "", margin_pct: "" });
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? "فشل النشر" : "Échec"));
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async (l) => {
    if (!window.confirm(ar ? "سحب هذا المنتج من السوق؟" : "Retirer du marché ?")) return;
    try {
      await axios.post(`${API}/marketplace/unpublish`, { product_id: l.product_id, margin_pct: 0 }, { headers });
      toast.success(ar ? "سُحب من السوق" : "Retiré");
      fetchAll();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? "فشل السحب" : "Échec"));
    }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="marketplace-page" dir={ar ? "rtl" : "ltr"}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6 text-emerald-600" />
              {ar ? "السوق الموحد" : "Marché unifié"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {ar
                ? "انشر منتجاتك في كتالوج السوق المركزي بهامشك الخاص — تظهر للزبائن بسعرك"
                : "Publiez vos produits au catalogue central avec votre marge"}
            </p>
          </div>
          <Button onClick={() => setDialog(true)} data-testid="publish-product-btn" className="gap-2">
            <Plus className="w-4 h-4" /> {ar ? "نشر منتج" : "Publier"}
          </Button>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">{ar ? "منتجاتي في السوق" : "Mes produits au marché"}</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">{ar ? "جارٍ التحميل…" : "Chargement…"}</p>
            ) : listings.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="marketplace-empty">
                {ar ? "لا منتجات منشورة — انشر أول منتج لك في السوق" : "Aucun produit publié"}
              </p>
            ) : (
              <div className="space-y-2">
                {listings.map((l) => (
                  <div key={l.id} data-testid={`listing-${l.product_id}`}
                       className="flex items-center justify-between border rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <Store className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{l.product?.name_ar || l.product?.name_en || l.product_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {ar ? "سعرك الأساسي:" : "Prix de base:"} {fmt(l.product?.retail_price)}
                          {" → "}
                          {ar ? "في السوق:" : "Au marché:"}{" "}
                          <span className="font-bold text-emerald-700">{fmt(l.marketplace_price)}</span>
                          {" "}(+{l.margin_pct}%)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{ar ? "منشور" : "Publié"}</Badge>
                      {(l.product?.quantity ?? 0) <= 0 && (
                        <Badge variant="destructive">{ar ? "نفد المخزون" : "Rupture"}</Badge>
                      )}
                      <Button size="sm" variant="ghost" className="text-red-600"
                              onClick={() => handleUnpublish(l)} data-testid={`unpublish-${l.product_id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent dir={ar ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle>{ar ? "نشر منتج في السوق" : "Publier un produit"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{ar ? "المنتج" : "Produit"}</Label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger data-testid="publish-product-select"><SelectValue placeholder={ar ? "اختر منتجاً" : "Choisir"} /></SelectTrigger>
                  <SelectContent>
                    {available.map((p) => (
                      <SelectItem key={p.id} value={p.id} data-testid={`publish-product-${p.id}`}>
                        {p.name_ar || p.name_en} — {fmt(p.retail_price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{ar ? "هامشك في السوق %" : "Votre marge %"}</Label>
                <Input data-testid="publish-margin" type="number" step="0.5" value={form.margin_pct}
                       onChange={(e) => setForm({ ...form, margin_pct: e.target.value })} placeholder="0" />
                <p className="text-xs text-muted-foreground mt-1">
                  {ar ? "سعر السوق = سعر التجزئة × (1 + الهامش)" : "Prix marché = détail × (1 + marge)"}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(false)}>{ar ? "إلغاء" : "Annuler"}</Button>
              <Button onClick={handlePublish} disabled={saving || !form.product_id} data-testid="publish-confirm-btn">
                {saving ? (ar ? "جارٍ النشر…" : "Publication…") : (ar ? "نشر" : "Publier")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
