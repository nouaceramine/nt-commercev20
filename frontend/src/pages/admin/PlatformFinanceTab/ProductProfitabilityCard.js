/** Per-product profitability analysis card. */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { toast } from "sonner";
import apiClient from "../../../lib/apiClient";
import { Loader2, Search, TrendingUp, TrendingDown, Package, Users, Wallet } from "lucide-react";
import { KpiCard } from "./KpiCard";
import { fmt } from "./format";

export function ProductProfitabilityCard() {
  const [catalogs, setCatalogs] = useState({ card: [], sim: [], idoom: [] });
  const [selected, setSelected] = useState(null);  // {id, type}
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiClient.get("/admin/supplier/catalog-reference")
      .then(res => setCatalogs(res.data || { card: [], sim: [], idoom: [] }))
      .catch(() => toast.error("فشل تحميل الكاتالوج"));
  }, []);

  const flat = [
    ...(catalogs.card || []).map(c => ({ ...c, type: "card" })),
    ...(catalogs.sim || []).map(c => ({ ...c, type: "sim" })),
    ...(catalogs.idoom || []).map(c => ({ ...c, type: "idoom" })),
  ];

  const analyse = async (item) => {
    setSelected(item);
    setReport(null);
    if (!item) return;
    setBusy(true);
    try {
      const res = await apiClient.get(
        `/admin/supplier/financial/product-profitability?catalog_id=${item.id}&stock_type=${item.type}`,
      );
      setReport(res.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "فشل التحليل");
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" /> تقرير ربحية المنتج
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          اختر فئة من الكاتالوج (بطاقة شحن، شريحة SIM، أو Idoom) ليُحلِّل النظام مبيعاتها، تكلفتها،
          هامش ربحها، أفضل مستأجر يشتريها، ويعطيك توصية ذكية.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select
          value={selected ? `${selected.type}:${selected.id}` : ""}
          onValueChange={(v) => {
            const [type, id] = v.split(":");
            const found = flat.find(it => it.type === type && it.id === id);
            analyse(found);
          }}
        >
          <SelectTrigger data-testid="profitability-product-select"><SelectValue placeholder="اختر منتجاً..." /></SelectTrigger>
          <SelectContent className="max-h-72">
            {flat.map(it => (
              <SelectItem key={`${it.type}:${it.id}`} value={`${it.type}:${it.id}`}>
                {it.type === "card" ? "💳" : it.type === "sim" ? "📱" : "🌐"} {it.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {busy && <div className="text-center text-muted-foreground py-6"><Loader2 className="h-5 w-5 animate-spin inline" /> جارٍ التحليل...</div>}

        {report && !busy && (
          <div className="space-y-3" data-testid="profitability-report">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard icon={<Package className="h-4 w-4" />} label="إجمالي المخزون" value={report.inventory.total} suffix="" sub={`متاح ${report.inventory.available} · مُباع ${report.inventory.sold}`} color="indigo" testId="prof-kpi-inventory" />
              <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="الإيرادات" value={fmt(report.revenue)} suffix="دج" sub="من المبيعات" color="emerald" testId="prof-kpi-revenue" />
              <KpiCard
                icon={<TrendingDown className="h-4 w-4" />}
                label="تكلفة المُباع"
                value={report.has_cost_data ? fmt(report.cost_of_sold) : "—"}
                suffix={report.has_cost_data ? "دج" : ""}
                sub={report.has_cost_data ? `متوسط ${fmt(report.avg_unit_cost)} لكل وحدة` : "لا توجد مشتريات مُسجَّلة"}
                color={report.has_cost_data ? "rose" : "amber"}
                testId="prof-kpi-cost"
              />
              <KpiCard
                icon={<Wallet className="h-4 w-4" />}
                label="الربح الإجمالي"
                value={report.has_cost_data ? fmt(report.gross_profit) : "—"}
                suffix={report.has_cost_data ? "دج" : ""}
                sub={report.has_cost_data ? `هامش ${report.margin_pct}%` : "سجِّل عملية شراء أولاً"}
                color={report.has_cost_data ? (report.gross_profit >= 0 ? "emerald" : "rose") : "amber"}
                testId="prof-kpi-profit"
              />
            </div>

            {report.best_tenant && (
              <Card className="bg-gradient-to-l from-blue-50 to-cyan-50 border-blue-200">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="text-xs text-muted-foreground">أفضل مستأجر يشتري هذا المنتج</div>
                        <div className="text-base font-bold">{report.best_tenant.tenant_name}</div>
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-xs text-muted-foreground">اشترى {report.best_tenant.qty_bought} وحدة</div>
                      <div className="text-base font-bold text-emerald-700">{fmt(report.best_tenant.revenue)} دج</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {report.recommendation && (
              <div className={`rounded-lg p-3 border-2 ${
                !report.has_cost_data ? "bg-amber-50 border-amber-300 text-amber-900" :
                report.margin_pct < 10 ? "bg-rose-50 border-rose-300 text-rose-900" :
                report.margin_pct < 20 ? "bg-amber-50 border-amber-300 text-amber-900" :
                "bg-emerald-50 border-emerald-300 text-emerald-900"
              }`} data-testid="profitability-recommendation">
                <div className="text-sm font-semibold">{report.recommendation}</div>
              </div>
            )}

            {report.revenue === 0 && (
              <div className="text-sm text-muted-foreground italic text-center py-3">
                لم يُبَع هذا المنتج بعد — حلِّل بعد أول عملية بيع لرؤية الأرقام الحقيقية.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

