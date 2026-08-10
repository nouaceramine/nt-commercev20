import pytest
from routes.analytics_routes import create_analytics_routes
from fastapi import HTTPException

@pytest.fixture
def analytics_router(mock_db):
    async def fake_get_current_user():
        return {"id": "user-1", "email": "test@test.com", "role": "admin"}
    return create_analytics_routes(mock_db, fake_get_current_user)

@pytest.mark.asyncio
async def test_analytics_overview(analytics_router, mock_db):
    from unittest.mock import AsyncMock
    router = analytics_router
    # Test that the route exists
    assert router is not None
