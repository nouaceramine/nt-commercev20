/**
 * AI Usage Billing sub-tab (p224) — monthly per-tenant AI cost + owner margin,
 * one-click invoicing with wallet deduction, per-tenant monthly caps.
 * Backend contract: /api/saas/ai-usage/summary, /api/saas/ai-billing/*
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Badge } from "../../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { toast } from "sonner";
import apiClient from "../../../lib/apiClient";
import { Loader2, Play, Save, RefreshCw } from "lucide-react";

const STATUS_AR = { billed: "مُفوترة", failed: "فشل الخصم", pending: "معلّقة" };

export function AiBillingCard() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [config, setConfig] = useState(null);
  const [cfgForm, setCfgForm] = useState({ margin_pct: "", usd_dzd_rate: "" });
  const [summary, setSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [capEdits, setCapEdits] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, inv] = await Promise.all([
        apiClient.get("/saas/ai-billing/config"),
        apiClient.get(`/saas/ai-usage/summary?month=${month}`),
        apiClient.get(`/saas/ai-billing/invoices?month=${month}`),
      ]);
      setConfig(c.data);
      setCfgForm({ margin_pct: String(c.data.margin_pct), usd_dzd_rate: String(c.data.usd_dzd_rate) });
      setSummary(s.data);
      setInvoices(inv.data.invoices || []);
    } catch (e) {
      toast.error("فشل تحميل بيانات فوترة الذكاء الاصطناعي");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const saveConfig = async () => {
    try {
      await apiClient.put("/saas/ai-billing/config", {
        margin_pct: parseFloat(cfgForm.margin_pct),
        usd_dzd_rate: parseFloat(cfgForm.usd_dzd_rate),
      });
      toast.success("تم حفظ الإعدادات");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "فشل الحفظ");
    }
  };

  const saveCap = async (tenantId) => {
    try {
      await apiClient.put("/saas/ai-billing/cap", {
        tenant_id: tenantId,
        monthly_cap_usd: parseFloat(capEdits[tenantId] || "0") || 0,
      });
      toast.success("تم حفظ السقف");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "فشل حفظ السقف");
    }
  };

  const runBilling = async () => {
    if (!window.confirm(`تشغيل فوترة ${month}؟ ستُخصم المبالغ من محافظ المشتركين.`)) return;
    setRunning(true);
    try {
      const res = await apiClient.post("/saas/ai-billing/run", { month });
      const r = res.data;
      toast.success(`مُفوترة: ${r.billed.length} — فاشلة: ${r.failed.length} — مُتخطاة: ${r.skipped.length}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "فشل تشغيل الفوترة");
    } finally {
      setRunning(false);
    }
  };

  const fmtUsd = (n) => `$${(n ?? 0).toFixed(4)}`;
  const fmtDzd = (n) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n ?? 0)} دج`;

  return (
    <div className="space-y-4" data-testid="ai-billing-tab">
      {/* Config */}
      <Card>
        <CardHeader><CardTitle className="text-base">إعدادات الفوترة</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <label className="text-sm text-muted-foreground">هامشك %</label>
            <Input data-testid="ai-cfg-margin" value={cfgForm.margin_pct}
                   onChange={(e) => setCfgForm({ ...cfgForm, margin_pct: e.target.value })} type="number" />
          </div>
          <div className="w-40">
            <label className="text-sm text-muted-foreground">سعر الصرف USD→DZD</label>
            <Input data-testid="ai-cfg-rate" value={cfgForm.usd_dzd_rate}
                   onChange={(e) => setCfgForm({ ...cfgForm, usd_dzd_rate: e.target.value })} type="number" />
          </div>
          <Button onClick={saveConfig} data-testid="ai-cfg-save" className="gap-2">
            <Save className="w-4 h-4" /> حفظ
          </Button>
          <div className="flex-1" />
          <div className="w-40">
            <label className="text-sm text-muted-foreground">الشهر</label>
            <Input data-testid="ai-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={load} className="gap-2" data-testid="ai-refresh">
            <RefreshCw className="w-4 h-4" /> تحديث
          </Button>
          <Button onClick={runBilling} disabled={running} className="gap-2 bg-emerald-600 hover:bg-emerald-700" data-testid="ai-run-billing">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            تشغيل الفوترة والخصم من المحافظ
          </Button>
        </CardContent>
      </Card>

      {/* Per-tenant usage */}
      <Card>
        <CardHeader><CardTitle className="text-base">استهلاك المشتركين — {month}</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : !summary || summary.tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="ai-usage-empty">لا استهلاك مسجلاً هذا الشهر</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المشترك</TableHead>
                  <TableHead>المكالمات</TableHead>
                  <TableHead>التوكنات (دخل/خرج)</TableHead>
                  <TableHead>التكلفة</TableHead>
                  <TableHead>سعر البيع له</TableHead>
                  <TableHead>بالدينار</TableHead>
                  <TableHead>السقف الشهري $</TableHead>
                  <TableHead>الفاتورة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.tenants.map((t) => (
                  <TableRow key={t.tenant_id} data-testid={`ai-usage-${t.tenant_id}`}>
                    <TableCell>
                      <div className="font-medium">{t.tenant_name || t.tenant_id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">{t.short_id}</div>
                    </TableCell>
                    <TableCell>{t.calls}</TableCell>
                    <TableCell className="text-xs">{t.tokens_in.toLocaleString()} / {t.tokens_out.toLocaleString()}</TableCell>
                    <TableCell>{fmtUsd(t.cost_usd)}</TableCell>
                    <TableCell className="font-medium">{fmtUsd(t.billed_usd)}</TableCell>
                    <TableCell className="font-medium text-emerald-700">{fmtDzd(t.amount_dzd)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input className="w-20 h-8" type="number" placeholder="0 = بلا سقف"
                               data-testid={`ai-cap-${t.tenant_id}`}
                               value={capEdits[t.tenant_id] ?? (t.monthly_cap_usd || "")}
                               onChange={(e) => setCapEdits({ ...capEdits, [t.tenant_id]: e.target.value })} />
                        <Button size="sm" variant="ghost" onClick={() => saveCap(t.tenant_id)}
                                data-testid={`ai-cap-save-${t.tenant_id}`}>
                          <Save className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {t.invoice_status ? (
                        <Badge variant={t.invoice_status === "billed" ? "default" : "destructive"}>
                          {STATUS_AR[t.invoice_status] || t.invoice_status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invoices */}
      {invoices.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">الفواتير — {month}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الكود</TableHead>
                  <TableHead>المشترك</TableHead>
                  <TableHead>التكلفة</TableHead>
                  <TableHead>الهامش %</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id} data-testid={`ai-invoice-${i.id}`}>
                    <TableCell className="font-mono text-xs">{i.code}</TableCell>
                    <TableCell>{i.tenant_name || i.tenant_id.slice(0, 8)}</TableCell>
                    <TableCell>{fmtUsd(i.cost_usd)}</TableCell>
                    <TableCell>{i.margin_pct}%</TableCell>
                    <TableCell className="font-medium">{fmtDzd(i.amount_dzd)}</TableCell>
                    <TableCell>
                      <Badge variant={i.status === "billed" ? "default" : "destructive"}>
                        {STATUS_AR[i.status] || i.status}
                      </Badge>
                      {i.error && <div className="text-xs text-red-600 mt-1">{i.error}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{(i.billed_at || i.created_at || "").slice(0, 10)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
