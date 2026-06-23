"""
Smart Report Robot
Auto-generates daily/weekly/monthly reports, sends notifications and emails
"""
import asyncio
from datetime import datetime, timezone, timedelta
import logging
import uuid
import io

logger = logging.getLogger(__name__)

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    logger.warning("reportlab not available - PDF generation disabled")


class ReportRobot:
    def __init__(self, db, client, notification_service, email_service):
        self.db = db
        self.client = client
        self.notification = notification_service
        self.email = email_service
        self.name = "روبوت التقارير"
        self.is_running = False
        self.last_run = None
        self.stats = {"checks": 0, "reports_generated": 0}

    async def start(self) -> dict:
        self.is_running = True
        logger.info("Report Robot started")
        while self.is_running:
            try:
                now = datetime.now(timezone.utc)
                if now.hour == 8 and now.minute < 2:
                    await self.generate_daily()
                if now.weekday() == 6 and now.hour == 9 and now.minute < 2:
                    await self.generate_weekly()
                if now.day == 1 and now.hour == 10 and now.minute < 2:
                    await self.generate_monthly()
                self.last_run = now.isoformat()
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Report Robot error: {e}")
                await asyncio.sleep(300)

    async def stop(self) -> dict:
        self.is_running = False

    async def _get_tenant_stats(self, tdb, start_iso, end_iso) -> dict:
        sales_agg = await tdb.sales.aggregate([
            {"$match": {"created_at": {"$gte": start_iso, "$lte": end_iso}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        purchases_agg = await tdb.purchases.aggregate([
            {"$match": {"created_at": {"$gte": start_iso, "$lte": end_iso}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        expenses_agg = await tdb.expenses.aggregate([
            {"$match": {"created_at": {"$gte": start_iso, "$lte": end_iso}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        sales = sales_agg[0] if sales_agg else {"total": 0, "count": 0}
        purchases = purchases_agg[0] if purchases_agg else {"total": 0, "count": 0}
        expenses = expenses_agg[0] if expenses_agg else {"total": 0, "count": 0}
        return {
            "sales_total": round(sales.get("total", 0), 2),
            "sales_count": sales.get("count", 0),
            "purchases_total": round(purchases.get("total", 0), 2),
            "purchases_count": purchases.get("count", 0),
            "expenses_total": round(expenses.get("total", 0), 2),
            "expenses_count": expenses.get("count", 0),
            "net_profit": round(sales.get("total", 0) - purchases.get("total", 0) - expenses.get("total", 0), 2),
        }

    async def _top_products(self, tdb, start_iso, end_iso, limit=5) -> dict:
        pipeline = [
            {"$match": {"created_at": {"$gte": start_iso, "$lte": end_iso}}},
            {"$unwind": {"path": "$items", "preserveNullAndEmptyArrays": False}},
            {"$group": {"_id": "$items.product_id", "name": {"$first": "$items.product_name"}, "qty": {"$sum": "$items.quantity"}, "revenue": {"$sum": "$items.total"}}},
            {"$sort": {"revenue": -1}},
            {"$limit": limit},
        ]
        results = await tdb.sales.aggregate(pipeline).to_list(limit)
        return [{k: v for k, v in r.items() if k != "_id"} for r in results]

    async def _top_customers(self, tdb, start_iso, end_iso, limit=5) -> dict:
        pipeline = [
            {"$match": {"created_at": {"$gte": start_iso, "$lte": end_iso}, "customer_id": {"$ne": None}}},
            {"$group": {"_id": "$customer_id", "name": {"$first": "$customer_name"}, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
            {"$sort": {"total": -1}},
            {"$limit": limit},
        ]
        results = await tdb.sales.aggregate(pipeline).to_list(limit)
        return [{k: v for k, v in r.items() if k != "_id"} for r in results]

    async def _employee_performance(self, tdb, start_iso, end_iso) -> dict:
        pipeline = [
            {"$match": {"created_at": {"$gte": start_iso, "$lte": end_iso}}},
            {"$group": {"_id": "$created_by", "employee_name": {"$first": "$created_by"}, "total_sales": {"$sum": "$total"}, "sales_count": {"$sum": 1}}},
            {"$sort": {"total_sales": -1}},
        ]
        results = await tdb.sales.aggregate(pipeline).to_list(50)
        return [{k: v for k, v in r.items() if k != "_id"} for r in results]

    # ───────── Daily ─────────
    async def generate_daily(self) -> dict:
        self.stats["checks"] += 1
        tenants = await self.db.saas_tenants.find({"is_active": True}, {"_id": 0}).to_list(500)
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        start = yesterday.replace(hour=0, minute=0, second=0).isoformat()
        end = yesterday.replace(hour=23, minute=59, second=59).isoformat()
        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[f"tenant_{tid}"]
                stats = await self._get_tenant_stats(tdb, start, end)
                top_prods = await self._top_products(tdb, start, end)
                report = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant["id"],
                    "type": "daily",
                    "date": yesterday.strftime("%Y-%m-%d"),
                    "stats": stats,
                    "top_products": top_prods,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await self.db.auto_reports.insert_one(report)
                self.stats["reports_generated"] += 1
                await self.notification.send_to_admins(
                    tenant["id"],
                    f"التقرير اليومي - {yesterday.strftime('%Y-%m-%d')}",
                    f"المبيعات: {stats['sales_total']:,.0f} دج | الربح: {stats['net_profit']:,.0f} دج",
                    category="reports",
                )
                html = self._daily_html(report)
                email = tenant.get("email")
                if email:
                    await self.email.send_email(email, f"التقرير اليومي - {yesterday.strftime('%Y-%m-%d')}", html)
            except Exception as e:
                logger.error(f"Daily report failed for {tenant.get('id')}: {e}")

    # ───────── Weekly ─────────
    async def generate_weekly(self) -> dict:
        self.stats["checks"] += 1
        tenants = await self.db.saas_tenants.find({"is_active": True}, {"_id": 0}).to_list(500)
        end_dt = datetime.now(timezone.utc) - timedelta(days=1)
        start_dt = end_dt - timedelta(days=7)
        start = start_dt.isoformat()
        end = end_dt.isoformat()
        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[f"tenant_{tid}"]
                stats = await self._get_tenant_stats(tdb, start, end)
                top_custs = await self._top_customers(tdb, start, end)
                top_prods = await self._top_products(tdb, start, end)
                employees = await self._employee_performance(tdb, start, end)
                report = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant["id"],
                    "type": "weekly",
                    "start_date": start_dt.strftime("%Y-%m-%d"),
                    "end_date": end_dt.strftime("%Y-%m-%d"),
                    "stats": stats,
                    "top_products": top_prods,
                    "top_customers": top_custs,
                    "employee_performance": employees,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await self.db.auto_reports.insert_one(report)
                self.stats["reports_generated"] += 1
                html = self._weekly_html(report)
                email = tenant.get("email")
                if email:
                    await self.email.send_email(email, f"التقرير الاسبوعي - {start_dt.strftime('%Y-%m-%d')}", html)
            except Exception as e:
                logger.error(f"Weekly report failed for {tenant.get('id')}: {e}")

    # ───────── Monthly ─────────
    async def generate_monthly(self) -> dict:
        self.stats["checks"] += 1
        tenants = await self.db.saas_tenants.find({"is_active": True}, {"_id": 0}).to_list(500)
        now = datetime.now(timezone.utc)
        end_dt = now.replace(day=1) - timedelta(days=1)
        start_dt = end_dt.replace(day=1, hour=0, minute=0, second=0)
        start = start_dt.isoformat()
        end = end_dt.isoformat()
        for tenant in tenants:
            try:
                tid = tenant["id"].replace("-", "_")
                tdb = self.client[f"tenant_{tid}"]
                stats = await self._get_tenant_stats(tdb, start, end)
                debt_agg = await tdb.sales.aggregate([
                    {"$match": {"remaining": {"$gt": 0}}},
                    {"$group": {"_id": None, "total": {"$sum": "$remaining"}, "count": {"$sum": 1}}},
                ]).to_list(1)
                debts = debt_agg[0] if debt_agg else {"total": 0, "count": 0}
                cash_boxes = await tdb.cash_boxes.find({}, {"_id": 0}).to_list(10)
                report = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant["id"],
                    "type": "monthly",
                    "month": start_dt.strftime("%Y-%m"),
                    "stats": stats,
                    "debts": {"total": round(debts.get("total", 0), 2), "count": debts.get("count", 0)},
                    "cash_boxes": cash_boxes,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                await self.db.auto_reports.insert_one(report)
                self.stats["reports_generated"] += 1
                await self.notification.send_to_admins(
                    tenant["id"],
                    f"التقرير الشهري - {start_dt.strftime('%Y-%m')}",
                    f"المبيعات: {stats['sales_total']:,.0f} | الربح: {stats['net_profit']:,.0f} | ديون: {debts.get('total',0):,.0f} دج",
                    category="reports",
                )
                if PDF_AVAILABLE:
                    await self._generate_pdf(report, tenant)
            except Exception as e:
                logger.error(f"Monthly report failed for {tenant.get('id')}: {e}")

    # ───────── PDF ─────────
    async def _generate_pdf(self, report, tenant) -> dict:
        try:
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=A4)
            styles = getSampleStyleSheet()
            elements = []
            elements.append(Paragraph(f"Monthly Report - {report['month']}", styles['Title']))
            elements.append(Spacer(1, 0.25 * inch))
            elements.append(Paragraph(f"Tenant: {tenant.get('name', '')}", styles['Normal']))
            elements.append(Spacer(1, 0.25 * inch))
            fin = report.get("stats", {})
            data = [
                ["Item", "Amount (DZD)"],
                ["Sales", f"{fin.get('sales_total', 0):,.2f}"],
                ["Purchases", f"{fin.get('purchases_total', 0):,.2f}"],
                ["Expenses", f"{fin.get('expenses_total', 0):,.2f}"],
                ["Net Profit", f"{fin.get('net_profit', 0):,.2f}"],
            ]
            t = Table(data)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ]))
            elements.append(t)
            doc.build(elements)
            pdf_bytes = buffer.getvalue()
            buffer.close()
            await self.db.report_pdfs.insert_one({
                "id": str(uuid.uuid4()),
                "report_id": report["id"],
                "tenant_id": report["tenant_id"],
                "month": report["month"],
                "size": len(pdf_bytes),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"PDF generated for {report['tenant_id']} ({len(pdf_bytes)} bytes)")
        except Exception as e:
            logger.error(f"PDF generation failed: {e}")

    # ───────── HTML Templates ─────────
    def _daily_html(self, report) -> dict:
        s = report.get("stats", {})
        prods_html = ""
        for p in report.get("top_products", []):
            prods_html += f"<tr><td>{p.get('name','')}</td><td>{p.get('qty',0)}</td><td>{p.get('revenue',0):,.2f}</td></tr>"
        return f"""<div dir="rtl" style="font-family:Arial;max-width:600px;margin:auto;">
<h2 style="color:#3b82f6;text-align:center;">التقرير اليومي</h2>
<p style="text-align:center;color:#666;">{report.get('date','')}</p>
<div style="background:#f0f9ff;padding:20px;border-radius:10px;margin:20px 0;">
<table style="width:100%;">
<tr><td>عدد المبيعات:</td><td><b>{s.get('sales_count',0)}</b></td></tr>
<tr><td>اجمالي المبيعات:</td><td style="color:#16a34a;font-weight:bold;">{s.get('sales_total',0):,.2f} دج</td></tr>
<tr><td>المصروفات:</td><td style="color:#dc2626;font-weight:bold;">{s.get('expenses_total',0):,.2f} دج</td></tr>
<tr><td>صافي الربح:</td><td style="color:#2563eb;font-weight:bold;">{s.get('net_profit',0):,.2f} دج</td></tr>
</table></div>
<div style="background:#fef3c7;padding:20px;border-radius:10px;">
<h3>افضل المنتجات</h3>
<table style="width:100%;"><tr style="background:#fde68a;"><th>المنتج</th><th>الكمية</th><th>الاجمالي</th></tr>
{prods_html}</table></div>
<p style="text-align:center;color:#999;margin-top:30px;">NT Commerce - تقرير تلقائي</p></div>"""

    def _weekly_html(self, report) -> dict:
        s = report.get("stats", {})
        custs = ""
        for c in report.get("top_customers", []):
            custs += f"<tr><td>{c.get('name','')}</td><td>{c.get('total',0):,.2f}</td><td>{c.get('count',0)}</td></tr>"
        emps = ""
        for e in report.get("employee_performance", [])[:5]:
            emps += f"<tr><td>{e.get('employee_name','')}</td><td>{e.get('total_sales',0):,.2f}</td><td>{e.get('sales_count',0)}</td></tr>"
        return f"""<div dir="rtl" style="font-family:Arial;max-width:600px;margin:auto;">
<h2 style="color:#3b82f6;text-align:center;">التقرير الاسبوعي</h2>
<p style="text-align:center;color:#666;">{report.get('start_date','')} - {report.get('end_date','')}</p>
<div style="background:#f0f9ff;padding:20px;border-radius:10px;margin:20px 0;">
<table style="width:100%;">
<tr><td>اجمالي المبيعات:</td><td style="color:#16a34a;font-weight:bold;">{s.get('sales_total',0):,.2f} دج</td></tr>
<tr><td>عدد المبيعات:</td><td><b>{s.get('sales_count',0)}</b></td></tr>
</table></div>
<div style="background:#fef3c7;padding:20px;border-radius:10px;margin:20px 0;">
<h3>افضل العملاء</h3>
<table style="width:100%;"><tr style="background:#fde68a;"><th>العميل</th><th>المشتريات</th><th>العدد</th></tr>
{custs}</table></div>
<div style="background:#dcfce7;padding:20px;border-radius:10px;">
<h3>اداء الموظفين</h3>
<table style="width:100%;"><tr style="background:#86efac;"><th>الموظف</th><th>المبيعات</th><th>العدد</th></tr>
{emps}</table></div></div>"""

    async def run_once(self, report_type="daily") -> dict:
        if report_type == "daily":
            await self.generate_daily()
        elif report_type == "weekly":
            await self.generate_weekly()
        elif report_type == "monthly":
            await self.generate_monthly()
        self.last_run = datetime.now(timezone.utc).isoformat()
        return self.stats
