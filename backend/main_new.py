"""
NT Commerce v16 - Refactored Main Application
Architecture: AppFactory + RouterRegistry + AuthService + Repository Pattern
"""
import os
import logging
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import jwt

from services.auth_service import AuthService
from router_registry import register_routes
from middleware.rate_limiter import limiter
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://mongodb:27017/")
DB_NAME = os.environ.get("DB_NAME", "ecommerce")
JWT_SECRET = os.environ.get("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"

# Initialize database client
mongo_client = AsyncIOMotorClient(MONGO_URI)
db = mongo_client[DB_NAME]

# Initialize auth service
auth_service = AuthService(db)

# Security
security = HTTPBearer(auto_error=False)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    payload = auth_service.decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": payload.get("sub")})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# Create FastAPI app
app = FastAPI(title="NT Commerce API", version="16.0.0")

# Add rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda request, exc: JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"}))

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/health")
async def health():
    return {"status": "ok", "version": "16.0.0"}

# Register all routes
register_routes(app, db, get_current_user)

logger.info("NT Commerce v16 API started successfully")
