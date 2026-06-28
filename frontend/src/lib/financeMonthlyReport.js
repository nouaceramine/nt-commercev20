/**
 * Platform Finance — Monthly P&L PDF Report Builder.
 *
 * Builds a print-ready HTML invoice/report (A4, emerald header) summarising
 * the platform-as-supplier financial activity for a given date range:
 *   - KPIs (revenue, cost, profit, margin, wallet, AP)
 *   - Top tenants & top suppliers tables
 *   - Daily trend (text breakdown — Recharts not embeddable to printable HTML)
 *   - Footer with timestamp & range
 *
 * Print → "Save as PDF" turns it into a downloadable PDF. No backend dep.
 */
import { escapeHtml } from "./escape";

const _fmt = (n) => Number(n || 0).toLocaleString("ar-DZ", { maximumFractionDigits: 2 });

export function buildFinanceMonthlyReport({ rangeDays, summary, generatedAt = new Date() }) {
  const kpis = summary?.kpis || {};
  const topTenants = summary?.top_tenants || [];
  const topSuppliers = summary?.top_suppliers || [];
  const trend = summary?.daily_trend || [];

  const generatedStr = generatedAt.toLocaleString("ar-DZ");
  const profitColor = (kpis.gross_profit || 0) >= 0 ? "#059669" : "#dc2626";

  const tenantsRows = topTenants.length
    ? topTenants.map((t, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(t.tenant_name || "—")}</td>
        <td class="num">${t.orders || 0}</td>
        <td class="num"><strong>${_fmt(t.revenue)} دج</strong></td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="empty">لا توجد بيانات</td></tr>`;

  const suppliersRows = topSuppliers.length
    ? topSuppliers.map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(s.supplier_name || "—")}</td>
        <td class="num">${s.purchases || 0}</td>
        <td class="num"><strong>${_fmt(s.cost)} دج</strong></td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="empty">لا توجد بيانات</td></tr>`;

  const trendRows = trend.length
    ? trend.map(d => `
      <tr>
        <td class="mono">${escapeHtml(d.date || "")}</td>
        <td class="num">${_fmt(d.revenue)} دج</td>
        <td class="num">${_fmt(d.cost)} دج</td>
        <td class="num" style="color:${d.profit >= 0 ? '#059669' : '#dc2626'}"><strong>${d.profit >= 0 ? '+' : ''}${_fmt(d.profit)}</strong></td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="empty">لا حركات في هذه الفترة</td></tr>`;

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>تقرير مالي — ${rangeDays} يوم</title>
  <style>
    @page { size: A4; margin: 14mm; }
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;color:#111;margin:0;padding:0;background:#fff}
    .report{max-width:760px;margin:0 auto}
    header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #059669;padding-bottom:10px;margin-bottom:14px}
    h1{font-size:1.6em;font-weight:800;color:#059669;margin:0}
    .meta{text-align:left;font-size:0.85em;color:#555;direction:ltr}
    h2{font-size:1.05em;color:#059669;border-bottom:1px solid #d1fae5;padding-bottom:3px;margin:18px 0 6px}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center}
    .kpi .label{font-size:0.7em;color:#64748b;text-transform:uppercase}
    .kpi .value{font-size:1.3em;font-weight:800;margin-top:3px}
    .kpi.profit .value{color:${profitColor}}
    table{width:100%;border-collapse:collapse;margin-top:4px;font-size:0.85em}
    thead th{background:#059669;color:#fff;padding:5px 8px;text-align:right;font-weight:600;font-size:0.85em}
    tbody td{padding:5px 8px;border-bottom:1px solid #e5e7eb}
    tbody tr:nth-child(even){background:#f9fafb}
    .num{text-align:left;direction:ltr;white-space:nowrap}
    .mono{font-family:'Courier New',monospace;font-size:0.85em}
    .empty{text-align:center;color:#94a3b8;font-style:italic}
    footer{margin-top:24px;border-top:1px dashed #999;padding-top:8px;text-align:center;color:#666;font-size:0.75em}
    @media print { body{print-color-adjust:exact;-webkit-print-color-adjust:exact} }
  </style>
</head>
<body>
  <div class="report">
    <header>
      <div>
        <h1>تقرير مالي للمنصة كمورد</h1>
        <div style="font-size:0.85em;color:#666;margin-top:2px">الفترة: آخر ${rangeDays} يوم</div>
      </div>
      <div class="meta">
        <strong>NT Commerce</strong><br>
        ${escapeHtml(generatedStr)}
      </div>
    </header>

    <section>
      <h2>المؤشرات الرئيسية</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">الإيرادات</div><div class="value">${_fmt(kpis.total_revenue)}</div></div>
        <div class="kpi"><div class="label">التكاليف</div><div class="value">${_fmt(kpis.total_cost)}</div></div>
        <div class="kpi profit"><div class="label">الربح الإجمالي</div><div class="value">${_fmt(kpis.gross_profit)}</div></div>
        <div class="kpi"><div class="label">هامش الربح</div><div class="value">${kpis.margin_pct || 0}%</div></div>
        <div class="kpi"><div class="label">طلبات مكتملة</div><div class="value">${kpis.revenue_orders || 0}</div></div>
        <div class="kpi"><div class="label">عمليات شراء</div><div class="value">${kpis.purchase_count || 0}</div></div>
        <div class="kpi"><div class="label">رصيد المحفظة</div><div class="value">${_fmt(kpis.wallet_balance)}</div></div>
        <div class="kpi"><div class="label">ديون للموردين</div><div class="value">${_fmt(kpis.total_accounts_payable)}</div></div>
      </div>
    </section>

    <section>
      <h2>أعلى 5 مستأجرين شراءً</h2>
      <table>
        <thead><tr><th>#</th><th>المستأجر</th><th>الطلبات</th><th>الإيرادات</th></tr></thead>
        <tbody>${tenantsRows}</tbody>
      </table>
    </section>

    <section>
      <h2>أعلى 5 موردين خارجيين</h2>
      <table>
        <thead><tr><th>#</th><th>المورد</th><th>العمليات</th><th>التكلفة</th></tr></thead>
        <tbody>${suppliersRows}</tbody>
      </table>
    </section>

    <section>
      <h2>الحركة اليومية</h2>
      <table>
        <thead><tr><th>اليوم</th><th>الإيرادات</th><th>التكاليف</th><th>الربح</th></tr></thead>
        <tbody>${trendRows}</tbody>
      </table>
    </section>

    <footer>
      مُولَّد آلياً من نظام NT Commerce في ${escapeHtml(generatedStr)} — صفحة 1 من 1
    </footer>
  </div>
</body>
</html>`;
}

export function printFinanceMonthlyReport(args) {
  const html = buildFinanceMonthlyReport(args);
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return { ok: false, reason: "popup_blocked" };
  win.document.write(html);
  win.document.close();
  setTimeout(() => { try { win.focus(); win.print(); } catch { /* ignore */ } }, 250);
  return { ok: true };
}
