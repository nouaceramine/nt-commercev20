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
import { Percent, Plus, Pencil, Trash2, Calculator } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

const CAT_LABELS = {
  recharge: { ar: "شحن الرصيد", fr: "Recharge" },
  digital: { ar: "خدمات رقمية", fr: "Services numériques" },
  iptv: { ar: "IPTV", fr: "IPTV" },
  ai: { ar: "ذكاء اصطناعي", fr: "IA" },
};

export default function MarginRulesPage() {
  const { language } = useLanguage();
  const ar = language === "ar";

  const [rules, setRules] = useState([]);
  const [knownCats, setKnownCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [form, setForm] = useState({ service_category: "recharge", margin_type: "percent", value: "" });
  const [saving, setSaving] = useState(false);
  const [quoteCost, setQuoteCost] = useState("");
  const [quoteCat, setQuoteCat] = useState("recharge");
  const [quoteResult, setQuoteResult] = useState(null);

  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };

  const fetchRules = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/margin-rules`, { headers });
      setRules(res.data.rules || []);
      setKnownCats(res.data.known_categories || []);
    } catch (e) {
      toast.error(ar ? "فشل تحميل قواعد الهامش" : "Échec du chargement");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const catLabel = (cat) =>
    CAT_LABELS[cat] ? (ar ? CAT_LABELS[cat].ar : CAT_LABELS[cat].fr) : cat;

  const openAdd = () => {
    setEditRule(null);
    setForm({ service_category: "recharge", margin_type: "percent", value: "" });
    setDialog(true);
  };
  const openEdit = (r) => {
    setEditRule(r);
    setForm({ service_category: r.service_category, margin_type: r.margin_type, value: String(r.value) });
    setDialog(true);
  };

  const handleSave = async () => {
    const val = parseFloat(form.value);
    if (!form.value || isNaN(val) || val <= 0) {
      toast.error(ar ? "أدخل قيمة هامش صحيحة" : "Valeur de marge invalide");
      return;
    }
    setSaving(true);
    try {
      const payload = { service_category: form.service_category, margin_type: form.margin_type, value: val };
      if (editRule) {
        await axios.put(`${API}/margin-rules/${editRule.id}`, { ...payload, active: editRule.active !== false }, { headers });
        toast.success(ar ? "تم تحديث القاعدة" : "Règle mise à jour");
      } else {
        await axios.post(`${API}/margin-rules`, payload, { headers });
        toast.success(ar ? "تمت إضافة القاعدة" : "Règle ajoutée");
      }
      setDialog(false);
      fetchRules();
    } catch (e) {
      toast.error(e.response?.data?.detail || (ar ? "فشل الحفظ" : "Échec"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (r) => {
    try {
      await axios.put(`${API}/margin-rules/${r.id}`, {
        service_category: r.service_category, margin_type: r.margin_type,
        value: r.value, active: r.active === false,
      }, { headers });
      fetchRules();
    } catch (e) { toast.error(ar ? "فشل التحديث" : "Échec"); }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(ar ? "حذف هذه القاعدة؟" : "Supprimer cette règle ?")) return;
    try {
      await axios.delete(`${API}/margin-rules/${r.id}`, { headers });
      toast.success(ar ? "تم الحذف" : "Supprimée");
      fetchRules();
    } catch (e) { toast.error(ar ? "فشل الحذف" : "Échec"); }
  };

  const handleQuote = async () => {
    const c = parseFloat(quoteCost);
    if (!quoteCost || isNaN(c) || c <= 0) return;
    try {
      const res = await axios.get(`${API}/margin-rules/quote?service_category=${quoteCat}&cost=${c}`, { headers });
      setQuoteResult(res.data);
    } catch (e) { toast.error(ar ? "فشل الحساب" : "Échec du calcul"); }
  };

  const fmt = (n) => new Intl.NumberFormat(ar ? "ar-DZ" : "fr-FR", { maximumFractionDigits: 2 }).format(n);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="margin-rules-page" dir={ar ? "rtl" : "ltr"}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Percent className="w-6 h-6 text-emerald-600" />
              {ar ? "هوامش الأسعار" : "Marges de prix"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {ar
                ? "سعر البيع للزبون = سعر التكلفة + هامشك — يُطبَّق تلقائياً على الخدمات الوسيطة (شحن، خدمات رقمية…)"
                : "Prix client = coût + votre marge — appliqué automatiquement aux services médiés"}
            </p>
          </div>
          <Button onClick={openAdd} data-testid="add-margin-rule-btn" className="gap-2">
            <Plus className="w-4 h-4" /> {ar ? "قاعدة جديدة" : "Nouvelle règle"}
          </Button>
        </div>

        {/* Quote tester */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="w-4 h-4" /> {ar ? "حاسبة السعر" : "Simulateur de prix"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Label>{ar ? "فئة الخدمة" : "Catégorie"}</Label>
              <Select value={quoteCat} onValueChange={setQuoteCat}>
                <SelectTrigger data-testid="quote-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {knownCats.map((c) => (
                    <SelectItem key={c} value={c} data-testid={`quote-cat-${c}`}>{catLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Label>{ar ? "سعر التكلفة" : "Coût"}</Label>
              <Input data-testid="quote-cost" type="number" value={quoteCost} onChange={(e) => setQuoteCost(e.target.value)} placeholder="97" />
            </div>
            <Button onClick={handleQuote} data-testid="quote-run-btn" variant="secondary">
              {ar ? "احسب" : "Calculer"}
            </Button>
            {quoteResult && (
              <div className="text-sm" data-testid="quote-result">
                {ar ? "سعر البيع للزبون:" : "Prix client :"}{" "}
                <span className="font-bold text-emerald-700">{fmt(quoteResult.sale_price)}</span>
                {" — "}
                {ar ? "هامشك:" : "Votre marge :"}{" "}
                <span className="font-bold">{fmt(quoteResult.margin_amount)}</span>
                {!quoteResult.rule && (
                  <span className="text-muted-foreground"> ({ar ? "لا قاعدة — سعر التكلفة نفسه" : "aucune règle"})</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rules list */}
        <Card>
          <CardHeader><CardTitle className="text-base">{ar ? "القواعد" : "Règles"}</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">{ar ? "جارٍ التحميل…" : "Chargement…"}</p>
            ) : rules.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="margin-rules-empty">
                {ar ? "لا قواعد بعد — الخدمات تُباع بسعرها الأساسي" : "Aucune règle — prix de base appliqué"}
              </p>
            ) : (
              <div className="space-y-2">
                {rules.map((r) => (
                  <div key={r.id} data-testid={`margin-rule-${r.id}`}
                       className="flex items-center justify-between border rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <Badge variant={r.active !== false ? "default" : "secondary"}>
                        {r.active !== false ? (ar ? "مفعّلة" : "Active") : (ar ? "معطّلة" : "Inactive")}
                      </Badge>
                      <span className="font-medium">{catLabel(r.service_category)}</span>
                      <span className="text-sm text-muted-foreground">
                        {r.margin_type === "percent"
                          ? `+${r.value}% ${ar ? "من التكلفة" : "du coût"}`
                          : `+${fmt(r.value)} ${ar ? "دج ثابتة" : "DZD fixe"}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleToggle(r)} data-testid={`margin-toggle-${r.id}`}>
                        {r.active !== false ? (ar ? "تعطيل" : "Désactiver") : (ar ? "تفعيل" : "Activer")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(r)} data-testid={`margin-edit-${r.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(r)} data-testid={`margin-delete-${r.id}`}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit dialog */}
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent dir={ar ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle>{editRule ? (ar ? "تعديل القاعدة" : "Modifier la règle") : (ar ? "قاعدة هامش جديدة" : "Nouvelle règle de marge")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{ar ? "فئة الخدمة" : "Catégorie de service"}</Label>
                <Select value={form.service_category} onValueChange={(v) => setForm({ ...form, service_category: v })}>
                  <SelectTrigger data-testid="margin-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {knownCats.map((c) => (
                      <SelectItem key={c} value={c} data-testid={`margin-cat-${c}`}>{catLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{ar ? "نوع الهامش" : "Type de marge"}</Label>
                <Select value={form.margin_type} onValueChange={(v) => setForm({ ...form, margin_type: v })}>
                  <SelectTrigger data-testid="margin-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent" data-testid="margin-type-percent">{ar ? "نسبة مئوية %" : "Pourcentage %"}</SelectItem>
                    <SelectItem value="fixed" data-testid="margin-type-fixed">{ar ? "مبلغ ثابت (دج)" : "Montant fixe (DZD)"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{ar ? "القيمة" : "Valeur"}</Label>
                <Input data-testid="margin-value" type="number" step="0.01" value={form.value}
                       onChange={(e) => setForm({ ...form, value: e.target.value })}
                       placeholder={form.margin_type === "percent" ? "10" : "25"} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialog(false)}>{ar ? "إلغاء" : "Annuler"}</Button>
              <Button onClick={handleSave} disabled={saving} data-testid="margin-save-btn">
                {saving ? (ar ? "جارٍ الحفظ…" : "Enregistrement…") : (ar ? "حفظ" : "Enregistrer")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
