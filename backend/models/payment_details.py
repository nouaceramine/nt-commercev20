"""
PaymentDetails - Payment Information Value Object
Refactoring: Replace Data Value with Object (Martin Fowler)
Addresses: Primitive Obsession, Data Clumps, Switch Statements
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict
from enum import Enum


class PaymentType(str, Enum):
    CASH = "cash"
    CREDIT = "credit"
    INSTALLMENT = "installment"
    MIXED = "mixed"


class InstallmentPlan(BaseModel):
    down_payment: float = Field(default=0, ge=0)
    installments_count: int = Field(default=3, ge=2, le=60)
    interest_rate: float = Field(default=0, ge=0, le=100)
    frequency: str = Field(default="monthly", pattern="^(monthly|weekly)$")
    first_due_date: str = ""


class PaymentDetails(BaseModel):
    """Value object representing payment details for a sale."""
    payment_type: PaymentType = Field(default=PaymentType.CASH)
    payment_method: str = Field(default="cash")
    paid_amount: float = Field(default=0, ge=0)
    payment_details: Optional[Dict[str, float]] = Field(default=None, description="For mixed: {cash, bank}")
    installment_plan: Optional[InstallmentPlan] = None

    @classmethod
    def cash(cls, amount: float) -> "PaymentDetails":
        return cls(payment_type=PaymentType.CASH, payment_method="cash", paid_amount=amount)

    @classmethod
    def credit(cls) -> "PaymentDetails":
        return cls(payment_type=PaymentType.CREDIT, payment_method="credit", paid_amount=0)

    @classmethod
    def installment(cls, plan: InstallmentPlan) -> "PaymentDetails":
        return cls(
            payment_type=PaymentType.INSTALLMENT,
            payment_method="installment",
            paid_amount=plan.down_payment,
            installment_plan=plan,
        )

    @classmethod
    def mixed(cls, cash: float, bank: float) -> "PaymentDetails":
        return cls(
            payment_type=PaymentType.MIXED,
            payment_method="mixed",
            paid_amount=cash + bank,
            payment_details={"cash": cash, "bank": bank},
        )

    @classmethod
    def from_dict(cls, data: dict) -> "PaymentDetails":
        """Factory method to create from frontend dict."""
        ptype = data.get("payment_type", "cash")
        if ptype == "credit":
            return cls.credit()
        elif ptype == "installment":
            plan_data = data.get("installment_plan", {})
            plan = InstallmentPlan(**plan_data) if plan_data else InstallmentPlan()
            return cls.installment(plan)
        elif ptype == "mixed":
            details = data.get("payment_details", {})
            return cls.mixed(details.get("cash", 0), details.get("bank", 0))
        else:
            return cls.cash(data.get("paid_amount", 0))

    def is_credit(self) -> bool:
        return self.payment_type == PaymentType.CREDIT

    def is_installment(self) -> bool:
        return self.payment_type == PaymentType.INSTALLMENT

    def is_mixed(self) -> bool:
        return self.payment_type == PaymentType.MIXED

    def to_sale_dict(self) -> dict:
        """Convert to dict for sale API payload."""
        result = {
            "paid_amount": self.paid_amount,
            "payment_method": self.payment_method,
            "payment_type": self.payment_type.value,
        }
        if self.payment_details:
            result["payment_details"] = self.payment_details
        if self.installment_plan:
            result["installment_plan"] = self.installment_plan.model_dump()
        return result

    class Config:
        json_schema_extra = {
            "example": {
                "payment_type": "mixed",
                "payment_method": "mixed",
                "paid_amount": 1500.0,
                "payment_details": {"cash": 1000, "bank": 500},
            }
        }
