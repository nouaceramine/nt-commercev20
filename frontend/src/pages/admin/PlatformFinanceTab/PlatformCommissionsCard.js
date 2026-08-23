/**
 * Platform Commissions sub-tab (p267) — the owner's earnings from mediated
 * services (marketplace spread, recharge spread, ...): period summary,
 * per-service breakdown, and recent commission rows.
 * Backend contract: /api/saas/platform-commissions/summary, /history
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import apiClient from "../../../lib/apiClient";
import { Loader2, RefreshCw, Wallet, TrendingUp, Activity } from "lucide-react";

const SERVICE_AR = {
  marketplace: "السوق الموحد",
  recharge: "الشحن (فرق السعر)",
  ai: "الذكاء الاصطناعي",
  wallet: "المحافظ",
};

export function PlatformCommissionsCard() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        apiClient.get(`/saas/platform-commissions/summary?days=${days}`),
        apiClient.get("/saas/platform-commissions/history?limit=50"),
      ]);
      setSummary(s.data);
      setItems(h.data.items || []);
    } catch {
      setSummary(null);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const fmtDzd = (n) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n ?? 0)} دج`;

  return (
    <div className="space-y-4" data-testid="platform-commissions-tab">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Wallet className="w-8 h-8 text-emerald-500" />
            <div>
              <p className="text-xs text-muted-foreground">أرباح المنصة — آخر {days} يوم</p>
              <p className="text-lg font-bold" data-testid="pcom-total">{fmtDzd(summary?.total_margin)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">اليوم</p>
              <p className="text-lg font-bold" data-testid="pcom-today">{fmtDzd(summary?.today?.margin)} ({summary?.today?.count ?? 0} عملية)</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">العمليات المُتوسَّط فيها</p>
              <p className="text-lg font-bold" data-testid="pcom-ops">{summary?.operations ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls + per-service breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-base">التفصيل حسب الخدمة</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            {[7, 30, 90].map((d) => (
              <Button key={d} size="sm" variant={days === d ? "default" : "outline"}
                      onClick={() => setDays(d)} data-testid={`pcom-days-${d}`}>{d} يوم</Button>
            ))}
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={load} className="gap-2" data-testid="pcom-refresh">
              <RefreshCw className="w-4 h-4" /> تحديث
            </Button>
          </div>
          {loading ? (
            <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : !summary || Object.keys(summary.by_service || {}).length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="pcom-empty">لا عمولات مسجلة في هذه الفترة</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الخدمة</TableHead>
                  <TableHead>العمليات</TableHead>
                  <TableHead>إجمالي المبيعات</TableHead>
                  <TableHead>هامش المنصة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-testid="pcom-services-table">
                {Object.entries(summary.by_service).map(([svc, v]) => (
                  <TableRow key={svc} data-testid={`pcom-svc-${svc}`}>
                    <TableCell><Badge variant="outline">{SERVICE_AR[svc] || svc}</Badge></TableCell>
                    <TableCell>{v.count}</TableCell>
                    <TableCell>{fmtDzd(v.gross)}</TableCell>
                    <TableCell className="font-medium text-emerald-600">{fmtDzd(v.margin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent rows */}
      <Card>
        <CardHeader><CardTitle className="text-base">أحدث العمولات</CardTitle></CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا سجلات بعد.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الكود</TableHead>
                  <TableHead>الخدمة</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>هامش المنصة</TableHead>
                  <TableHead>النسبة</TableHead>
                  <TableHead>التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-testid="pcom-history-table">
                {items.map((r) => (
                  <TableRow key={r.id} data-testid={`pcom-row-${r.id}`}>
                    <TableCell className="font-mono text-xs">{r.code || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{SERVICE_AR[r.service_type] || r.service_type}</Badge></TableCell>
                    <TableCell>{fmtDzd(r.gross_amount)}</TableCell>
                    <TableCell className="text-emerald-600">{fmtDzd(r.platform_margin)}</TableCell>
                    <TableCell>{r.platform_commission_pct}%</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.created_at ? new Date(r.created_at).toLocaleString("fr-FR") : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
