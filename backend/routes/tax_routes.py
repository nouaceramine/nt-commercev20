"""
Advanced Tax Reports Routes
VAT calculations, tax period reports, tax summaries
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tax", tags=["Tax"])


class TaxRate(BaseModel):
    name: str
    name_ar: str = ""
    rate: float  # percentage, e.g., 19 for 19%
    type: str = "vat"  # vat, income, withholding
    is_active: bool = True


class TaxPeriod(BaseModel):
    start_date: str
    end_date: str
    type: str = "monthly"  # monthly, quarterly, yearly


class TaxReportResponse(BaseModel):
    period: dict
    total_sales: float
    total_purchases: float
    vat_collected: float
    vat_paid: float
    vat_due: float
    taxable_income: float
    tax_amount: float
    summary: dict


def create_tax_routes(db, get_current_user) -> dict:
    """Create tax routes with dependencies"""

    @router.get("/rates")
    async def get_tax_rates(current_user: dict = Depends(get_current_user)):
        """Get all tax rates for the tenant"""
        rates = await db.tax_rates.find({}, {"_id": 0}).to_list(100)
        if not rates:
            # Initialize default Algerian tax rates
            default_rates = [
                {"id": str(uuid.uuid4()), "name": "VAT Standard", "name_ar": "ضريبة القيمة المضافة", "rate": 19, "type": "vat", "is_active": True},
                {"id": str(uuid.uuid4()), "name": "VAT Reduced", "name_ar": "ضريبة مخفضة", "rate": 9, "type": "vat", "is_active": True},
                {"id": str(uuid.uuid4()), "name": "Income Tax", "name_ar": "ضريبة الدخل", "rate": 26, "type": "income", "is_active": True},
                {"id": str(uuid.uuid4()), "name": "Withholding Tax", "name_ar": "ضريبة الاقتطاع", "rate": 10, "type": "withholding", "is_active": True},
                {"id": str(uuid.uuid4()), "name": "TAP", "name_ar": "الرسم على النشاط المهني", "rate": 2, "type": "professional", "is_active": True},
            ]
            for r in default_rates:
                r["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.tax_rates.insert_many(default_rates)
            rates = default_rates
        return rates

    @router.post("/rates")
    async def create_tax_rate(
        rate: TaxRate,
        current_user: dict = Depends(get_current_user),
    ):
        rate_doc = rate.model_dump()
        rate_doc["id"] = str(uuid.uuid4())
        rate_doc["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.tax_rates.insert_one(rate_doc)
        rate_doc.pop("_id", None)
        return rate_doc

    @router.put("/rates/{rate_id}")
    async def update_tax_rate(
        rate_id: str,
        rate: TaxRate,
        current_user: dict = Depends(get_current_user),
    ):
        update_data = rate.model_dump()
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = await db.tax_rates.update_one(
            {"id": rate_id}, {"$set": update_data}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Tax rate not found")
        return {"success": True}

    @router.delete("/rates/{rate_id}")
    async def delete_tax_rate(
        rate_id: str,
        current_user: dict = Depends(get_current_user),
    ):
        result = await db.tax_rates.delete_one({"id": rate_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Tax rate not found")
        return {"success": True}

    @router.get("/report")
    async def get_tax_report(
        start_date: str,
        end_date: str,
        report_type: str = "vat",
        current_user: dict = Depends(get_current_user),
    ):
        """Generate comprehensive tax report for a period"""
        # Get sales data
        sales_pipeline = [
            {"$match": {
                "created_at": {"$gte": start_date, "$lte": end_date},
                "status": {"$ne": "cancelled"}
            }},
            {"$group": {
                "_id": None,
                "total_sales": {"$sum": "$total"},
                "total_tax": {"$sum": {"$ifNull": ["$tax_amount", 0]}},
                "count": {"$sum": 1}
            }}
        ]
        sales_result = await db.sales.aggregate(sales_pipeline).to_list(1)
        sales_data = sales_result[0] if sales_result else {"total_sales": 0, "total_tax": 0, "count": 0}

        # Get purchases data
        purchases_pipeline = [
            {"$match": {
                "created_at": {"$gte": start_date, "$lte": end_date},
                "status": {"$ne": "cancelled"}
            }},
            {"$group": {
                "_id": None,
                "total_purchases": {"$sum": "$total"},
                "total_tax": {"$sum": {"$ifNull": ["$tax_amount", 0]}},
                "count": {"$sum": 1}
            }}
        ]
        purchases_result = await db.purchases.aggregate(purchases_pipeline).to_list(1)
        purchases_data = purchases_result[0] if purchases_result else {"total_purchases": 0, "total_tax": 0, "count": 0}

        # Get expenses data
        expenses_pipeline = [
            {"$match": {
                "created_at": {"$gte": start_date, "$lte": end_date}
            }},
            {"$group": {
                "_id": None,
                "total_expenses": {"$sum": "$amount"},
                "count": {"$sum": 1}
            }}
        ]
        expenses_result = await db.expenses.aggregate(expenses_pipeline).to_list(1)
        expenses_data = expenses_result[0] if expenses_result else {"total_expenses": 0, "count": 0}

        total_sales = sales_data.get("total_sales", 0)
        total_purchases = purchases_data.get("total_purchases", 0)
        total_expenses = expenses_data.get("total_expenses", 0)

        # Get active VAT rate
        vat_rate = await db.tax_rates.find_one({"type": "vat", "is_active": True, "name": "VAT Standard"})
        vat_pct = vat_rate["rate"] if vat_rate else 19

        # Calculate VAT
        vat_collected = total_sales * (vat_pct / (100 + vat_pct))
        vat_paid = total_purchases * (vat_pct / (100 + vat_pct))
        vat_due = vat_collected - vat_paid

        # Taxable income
        taxable_income = total_sales - total_purchases - total_expenses

        # Get income tax rate
        income_rate = await db.tax_rates.find_one({"type": "income", "is_active": True})
        income_pct = income_rate["rate"] if income_rate else 26
        tax_amount = max(0, taxable_income * (income_pct / 100))

        # TAP calculation
        tap_rate = await db.tax_rates.find_one({"type": "professional", "is_active": True})
        tap_pct = tap_rate["rate"] if tap_rate else 2
        tap_amount = total_sales * (tap_pct / 100)

        report = {
            "period": {"start_date": start_date, "end_date": end_date},
            "total_sales": round(total_sales, 2),
            "sales_count": sales_data.get("count", 0),
            "total_purchases": round(total_purchases, 2),
            "purchases_count": purchases_data.get("count", 0),
            "total_expenses": round(total_expenses, 2),
            "expenses_count": expenses_data.get("count", 0),
            "vat_rate": vat_pct,
            "vat_collected": round(vat_collected, 2),
            "vat_paid": round(vat_paid, 2),
            "vat_due": round(vat_due, 2),
            "taxable_income": round(taxable_income, 2),
            "income_tax_rate": income_pct,
            "income_tax": round(tax_amount, 2),
            "tap_rate": tap_pct,
            "tap_amount": round(tap_amount, 2),
            "total_tax_liability": round(vat_due + tax_amount + tap_amount, 2),
            "summary": {
                "net_revenue": round(total_sales - total_purchases, 2),
                "operating_income": round(taxable_income, 2),
                "effective_tax_rate": round(
                    ((vat_due + tax_amount + tap_amount) / total_sales * 100) if total_sales > 0 else 0, 2
                ),
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        return report

    @router.get("/declarations")
    async def get_tax_declarations(
        year: Optional[int] = None,
        current_user: dict = Depends(get_current_user),
    ):
        """Get tax declarations history"""
        query = {}
        if year:
            query["year"] = year
        declarations = await db.tax_declarations.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
        return declarations

    @router.post("/declarations")
    async def create_tax_declaration(
        period: TaxPeriod,
        current_user: dict = Depends(get_current_user),
    ):
        """Create/file a tax declaration"""
        # Generate the report first
        report = await get_tax_report(
            start_date=period.start_date,
            end_date=period.end_date,
            current_user=current_user,
        )

        declaration = {
            "id": str(uuid.uuid4()),
            "period_type": period.type,
            "start_date": period.start_date,
            "end_date": period.end_date,
            "year": int(period.start_date[:4]),
            "status": "draft",
            "report": report,
            "vat_due": report["vat_due"],
            "income_tax": report["income_tax"],
            "tap_amount": report["tap_amount"],
            "total_due": report["total_tax_liability"],
            "filed_by": current_user.get("name", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.tax_declarations.insert_one(declaration)
        declaration.pop("_id", None)
        return declaration

    @router.put("/declarations/{declaration_id}/status")
    async def update_declaration_status(
        declaration_id: str,
        status: str,
        current_user: dict = Depends(get_current_user),
    ):
        """Update declaration status (draft, filed, paid, overdue)"""
        valid_statuses = ["draft", "filed", "paid", "overdue"]
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

        result = await db.tax_declarations.update_one(
            {"id": declaration_id},
            {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Declaration not found")
        return {"success": True}

    @router.get("/summary/{year}")
    async def get_annual_tax_summary(
        year: int,
        current_user: dict = Depends(get_current_user),
    ):
        """Get annual tax summary with quarterly breakdown"""
        quarters = [
            {"q": 1, "start": f"{year}-01-01", "end": f"{year}-03-31"},
            {"q": 2, "start": f"{year}-04-01", "end": f"{year}-06-30"},
            {"q": 3, "start": f"{year}-07-01", "end": f"{year}-09-30"},
            {"q": 4, "start": f"{year}-10-01", "end": f"{year}-12-31"},
        ]

        quarterly_data = []
        annual_totals = {
            "total_sales": 0, "total_purchases": 0, "total_expenses": 0,
            "vat_collected": 0, "vat_paid": 0, "vat_due": 0,
            "income_tax": 0, "tap_amount": 0, "total_tax_liability": 0,
        }

        for q in quarters:
            report = await get_tax_report(
                start_date=q["start"],
                end_date=q["end"],
                current_user=current_user,
            )
            quarterly_data.append({"quarter": q["q"], **report})
            for key in annual_totals:
                annual_totals[key] += report.get(key, 0)

        # Round all values
        for key in annual_totals:
            annual_totals[key] = round(annual_totals[key], 2)

        return {
            "year": year,
            "quarterly": quarterly_data,
            "annual": annual_totals,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    return router
