"""Tenant throttle placeholder"""
from slowapi import Limiter
from slowapi.util import get_remote_address

tenant_throttle = Limiter(key_func=get_remote_address)

