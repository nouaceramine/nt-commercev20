from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from routes.saas import agent_self_service_routes
from routes.saas.schemas import AgentCreate, AgentTransactionCreate, AgentUpdate


def test_agent_create_normalizes_email_and_accepts_valid_password():
    agent = AgentCreate(name="Agent", email="  AGENT@EXAMPLE.COM ", password="12345678")
    assert agent.email == "agent@example.com"


@pytest.mark.parametrize("email", ["invalid", "a@b", "@example.com", "a@example.c"])
def test_agent_create_rejects_invalid_email(email):
    with pytest.raises(ValidationError):
        AgentCreate(name="Agent", email=email, password="12345678")


@pytest.mark.parametrize("password", ["", "short", "1234567"])
def test_agent_create_rejects_short_password(password):
    with pytest.raises(ValidationError):
        AgentCreate(name="Agent", email="agent@example.com", password=password)


def test_agent_update_validates_and_normalizes_email():
    assert AgentUpdate(email=" NEW@EXAMPLE.COM ").email == "new@example.com"
    with pytest.raises(ValidationError):
        AgentUpdate(email="invalid")


def test_agent_contracts_preserve_dashboard_financial_fields():
    created = AgentCreate(
        name="Agent", email="agent@example.com", password="12345678",
        company_name="Company", address="Address", commission_rate=15,
        commission_fixed=5, credit_limit=75000,
    )
    assert created.commission_rate == 15
    assert created.commission_fixed == 5
    assert created.credit_limit == 75000
    updated = AgentUpdate(commission_rate=0, commission_fixed=0, credit_limit=0)
    assert updated.commission_rate == 0
    assert updated.commission_fixed == 0
    assert updated.credit_limit == 0


@pytest.mark.parametrize("field,value", [
    ("commission_rate", -1), ("commission_rate", 101),
    ("commission_fixed", -1), ("credit_limit", -1),
    ("commission_rate", float("nan")), ("commission_fixed", float("inf")),
])
def test_agent_contracts_reject_invalid_financial_fields(field, value):
    with pytest.raises(ValidationError):
        AgentUpdate(**{field: value})


@pytest.mark.parametrize("kind", ["commission", "payout"])
def test_agent_transaction_accepts_supported_positive_types(kind):
    tx = AgentTransactionCreate(type=kind, amount=0.01)
    assert tx.type == kind
    assert tx.amount == 0.01


@pytest.mark.parametrize("kind", ["", "bonus", "COMMISSION", "unknown"])
def test_agent_transaction_rejects_unknown_type(kind):
    with pytest.raises(ValidationError):
        AgentTransactionCreate(type=kind, amount=1)


@pytest.mark.parametrize("amount", [0, -0.01, -100, float("nan"), float("inf"), float("-inf")])
def test_agent_transaction_rejects_non_positive_or_non_finite_amount(amount):
    with pytest.raises(ValidationError):
        AgentTransactionCreate(type="commission", amount=amount)


class CommissionCollection:
    def __init__(self):
        self.rows = []
        self.sessions = []

    async def insert_one(self, row, session=None):
        self.rows.append(row)
        self.sessions.append(session)


@pytest.mark.asyncio
@pytest.mark.parametrize("period,price_key,price,expected", [
    ("monthly", "monthly_price", 100, 10),
    ("6months", "six_month_price", 500, 50),
    ("yearly", "yearly_price", 1000, 100),
    ("monthly", "price_monthly", 120, 12),
    ("6months", "price_6months", 600, 60),
    ("yearly", "price_yearly", 1200, 120),
])
async def test_agent_commission_supports_canonical_and_legacy_plan_prices(
    monkeypatch, period, price_key, price, expected
):
    collection = CommissionCollection()
    monkeypatch.setattr(agent_self_service_routes, "db", SimpleNamespace(agent_commissions=collection))
    session = object()
    await agent_self_service_routes._create_agent_commission(
        {"id": "agent-1", "commission_fixed": 0}, "tenant-1", "Tenant",
        {"commission_rate": 10, price_key: price}, period, session=session,
    )
    assert len(collection.rows) == 1
    assert collection.rows[0]["amount"] == expected
    assert collection.rows[0]["status"] == "pending"
    assert collection.sessions == [session]


class AgentTransactionCursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, field, direction):
        assert (field, direction) == ("created_at", -1)
        self.rows = sorted(self.rows, key=lambda row: row[field], reverse=True)
        return self

    async def to_list(self, limit):
        assert limit == 100
        return self.rows[:limit]


class AgentTransactionCollection:
    def __init__(self):
        self.query = None
        self.projection = None
        self.rows = [
            {"id": "own-old", "agent_id": "agent-1", "type": "payout", "amount": 5,
             "notes": "old", "created_at": "2026-01-01T00:00:00+00:00"},
            {"id": "other", "agent_id": "agent-2", "type": "commission", "amount": 999,
             "notes": "other", "created_at": "2026-01-03T00:00:00+00:00"},
            {"id": "own-new", "agent_id": "agent-1", "type": "commission", "amount": 25,
             "notes": "new", "created_at": "2026-01-02T00:00:00+00:00"},
        ]

    def find(self, query, projection):
        self.query = query
        self.projection = projection
        return AgentTransactionCursor([
            row for row in self.rows if row["agent_id"] == query["agent_id"]
        ])


@pytest.mark.asyncio
async def test_agent_transactions_are_scoped_to_authenticated_agent(monkeypatch):
    collection = AgentTransactionCollection()
    monkeypatch.setattr(
        agent_self_service_routes, "db",
        SimpleNamespace(saas_agent_transactions=collection),
    )
    rows = await agent_self_service_routes.get_my_agent_transactions(
        agent={"id": "agent-1"}
    )
    assert collection.query == {"agent_id": "agent-1"}
    assert collection.projection == {"_id": 0}
    assert [row["id"] for row in rows] == ["own-new", "own-old"]
    assert all(row["agent_id"] == "agent-1" for row in rows)
