import pytest
import pytest_asyncio
from repositories.base_repository import BaseRepository

@pytest.mark.asyncio
async def test_repo_find_all(mock_db):
    repo = BaseRepository(mock_db["products"])
    items = await repo.find_all()
    assert len(items) == 2
    assert items[0]["name"] == "iPhone 15 Pro"

@pytest.mark.asyncio
async def test_repo_find_by_id(mock_db):
    repo = BaseRepository(mock_db["products"])
    item = await repo.find_by_id("prod-1")
    assert item is not None
    assert item["name"] == "iPhone 15 Pro"

@pytest.mark.asyncio
async def test_repo_create(mock_db):
    repo = BaseRepository(mock_db["products"])
    item = await repo.create({"name": "Test Product", "price": 100})
    assert item["id"] is not None
    assert item["name"] == "Test Product"

@pytest.mark.asyncio
async def test_repo_update(mock_db):
    repo = BaseRepository(mock_db["products"])
    success = await repo.update("prod-1", {"name": "Updated Name"})
    assert success

@pytest.mark.asyncio
async def test_repo_delete(mock_db):
    repo = BaseRepository(mock_db["products"])
    success = await repo.delete("prod-1")
    assert success

@pytest.mark.asyncio
async def test_repo_count(mock_db):
    repo = BaseRepository(mock_db["products"])
    count = await repo.count()
    assert count == 2
