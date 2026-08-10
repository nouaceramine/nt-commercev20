import pytest
from services.auth_service import AuthService

@pytest.mark.asyncio
async def test_auth_service_hash_verify(auth_service):
    hashed = auth_service.hash_password("testpass")
    assert auth_service.verify_password("testpass", hashed)
    assert not auth_service.verify_password("wrongpass", hashed)

@pytest.mark.asyncio
async def test_auth_service_create_user(auth_service, mock_db):
    user = await auth_service.create_user("new@user.com", "password", "New User")
    assert user["email"] == "new@user.com"
    assert user["full_name"] == "New User"
    assert user["role"] == "admin"

@pytest.mark.asyncio
async def test_auth_service_authenticate_success(auth_service):
    user = await auth_service.authenticate("demo@ntcommerce.com", "demo123")
    assert user is not None
    assert user["email"] == "demo@ntcommerce.com"

@pytest.mark.asyncio
async def test_auth_service_authenticate_failure(auth_service):
    user = await auth_service.authenticate("demo@ntcommerce.com", "wrongpass")
    assert user is None

@pytest.mark.asyncio
async def test_auth_service_token_lifecycle(auth_service):
    user = await auth_service.authenticate("demo@ntcommerce.com", "demo123")
    token = auth_service.create_access_token({"sub": user["id"], "email": user["email"]})
    assert isinstance(token, str)
    payload = auth_service.decode_token(token)
    assert payload["sub"] == user["id"]
    assert payload["email"] == user["email"]

@pytest.mark.asyncio
async def test_auth_service_invalid_token(auth_service):
    payload = auth_service.decode_token("invalid.token.here")
    assert payload is None
