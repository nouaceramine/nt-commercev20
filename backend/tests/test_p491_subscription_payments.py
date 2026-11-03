import pytest
from pydantic import ValidationError

from routes.saas.schemas import SubscriptionPayment


@pytest.mark.parametrize("period", ["monthly", "6months", "yearly"])
def test_subscription_payment_accepts_supported_periods(period):
    payment = SubscriptionPayment(amount=1, subscription_type=period)
    assert payment.subscription_type == period


@pytest.mark.parametrize("period", ["", "year", "annual", "MONTHLY", "unknown"])
def test_subscription_payment_rejects_unknown_periods(period):
    with pytest.raises(ValidationError):
        SubscriptionPayment(amount=1, subscription_type=period)


@pytest.mark.parametrize("amount", [0, -0.01, -100, float("nan"), float("inf"), float("-inf")])
def test_subscription_payment_rejects_non_positive_or_non_finite_amounts(amount):
    with pytest.raises(ValidationError):
        SubscriptionPayment(amount=amount, subscription_type="monthly")


def test_subscription_payment_normalizes_transaction_id():
    payment = SubscriptionPayment(amount=10, transaction_id="  bank-reference-1  ")
    assert payment.transaction_id == "bank-reference-1"


def test_subscription_payment_rejects_unbounded_transaction_id():
    with pytest.raises(ValidationError):
        SubscriptionPayment(amount=10, transaction_id="x" * 129)
