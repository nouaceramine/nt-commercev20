from fastapi import APIRouter
from config.database import db
from utils.auth import get_current_user
from routes.simple_auth_routes import create_auth_routes

router = create_auth_routes(db, get_current_user)
