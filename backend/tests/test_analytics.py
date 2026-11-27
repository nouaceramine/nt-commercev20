import pytest
from routes.analytics_routes import create_analytics_routes

@pytest.fixture
def analytics_router(mock_db):
    # p573-007: the factory gained `require_tenant` in 6af7c12/3c0181e (P548)
    # but this test was never updated — permanent TypeError outside the two
    # sanctioned suites. Pass a fake tenant dep like the factory expects.
    async def fake_get_current_user():
        return {"id": "user-1", "email": "test@test.com", "role": "admin"}
    async def fake_require_tenant():
        return {"id": "user-1", "email": "test@test.com", "role": "admin",
                "tenant_id": "t1"}
    return create_analytics_routes(mock_db, fake_get_current_user, fake_require_tenant)

@pytest.mark.asyncio
async def test_analytics_overview(analytics_router, mock_db):
    router = analytics_router
    # Test that the route exists
    assert router is not None
