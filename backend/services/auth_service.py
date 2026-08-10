
"""AuthService - Handles all authentication logic"""
import os
import jwt
import bcrypt
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional

SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 1440

class AuthService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    def hash_password(self, password: str) -> str:
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

    def create_access_token(self, data: dict) -> str:
        to_encode = data.copy()
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    def decode_token(self, token: str) -> Optional[dict]:
        try:
            return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

    async def get_user_by_email(self, email: str) -> Optional[dict]:
        return await self.db.users.find_one({"email": email})

    async def authenticate(self, email: str, password: str) -> Optional[dict]:
        user = await self.get_user_by_email(email)
        if not user:
            return None
        if not self.verify_password(password, user.get("password", "")):
            return None
        return user

    async def create_user(self, email: str, password: str, full_name: str, role: str = "admin") -> dict:
        hashed = self.hash_password(password)
        user = {
            "id": str(__import__('uuid').uuid4()),
            "email": email,
            "password": hashed,
            "full_name": full_name,
            "role": role,
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        result = await self.db.users.insert_one(user)
        user["_id"] = str(result.inserted_id)
        return user
