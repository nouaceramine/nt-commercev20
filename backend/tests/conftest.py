import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone

class MockCursor:
    def __init__(self, data=None):
        self._data = data or []
    def sort(self, *args, **kwargs):
        return self
    def skip(self, *args, **kwargs):
        return self
    def limit(self, *args, **kwargs):
        return self
    async def to_list(self, length=None):
        return self._data

class MockCollection:
    def __init__(self, data=None, find_one_result=None, count=0, inserted_id="new123"):
        self._data = data or []
        self._find_one_result = find_one_result
        self._count = count
        self._inserted_id = inserted_id

    def find(self, *args, **kwargs):
        return MockCursor(self._data)

    async def find_one(self, *args, **kwargs):
        return self._find_one_result

    async def count_documents(self, *args, **kwargs):
        return self._count

    async def insert_one(self, *args, **kwargs):
        return MagicMock(inserted_id=self._inserted_id)

    async def update_one(self, *args, **kwargs):
        return MagicMock(modified_count=1)

    async def delete_one(self, *args, **kwargs):
        return MagicMock(deleted_count=1)

    def aggregate(self, *args, **kwargs):
        return MockCursor([{"total": 270000}])

class MockDB:
    def __init__(self):
        products_data = [
            {"id": "prod-1", "name": "iPhone 15 Pro", "sku": "IPH15P", "price": 180000, "stock": 25, "category": "Electronics", "status": "active", "sales": 45, "created_at": datetime.now(timezone.utc), "_id": "abc123"},
            {"id": "prod-2", "name": "Samsung Galaxy S24", "sku": "SAM-S24", "price": 160000, "stock": 30, "category": "Electronics", "status": "active", "sales": 38, "created_at": datetime.now(timezone.utc), "_id": "def456"},
        ]
        self._collections = {
            "products": MockCollection(data=products_data, find_one_result=products_data[0], count=2),
            "users": MockCollection(
                find_one_result={
                    "id": "user-1", "email": "demo@ntcommerce.com",
                    "password": "$2b$12$z4lJqgCAPS5BT0UVQu6PPOwwOEi4wbXax1Jb5BHggoocWOhBPVZui",
                    "full_name": "Demo User", "role": "admin", "is_active": True,
                },
                inserted_id="user-new"
            ),
            "orders": MockCollection(count=2),
            "customers": MockCollection(count=1),
        }

    def __getitem__(self, name):
        return self._collections.get(name, MockCollection())

    def __getattr__(self, name):
        return self._collections.get(name, MockCollection())

@pytest.fixture
def mock_db():
    return MockDB()

@pytest.fixture
def auth_service(mock_db):
    from services.auth_service import AuthService
    return AuthService(mock_db)
