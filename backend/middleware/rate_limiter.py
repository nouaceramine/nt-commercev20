
"""Rate Limiter using slowapi"""
from slowapi import Limiter

from middleware.rate_limit import client_ip_key

# client_ip_key (not get_remote_address): loopback is exempt per the platform
# documented convention (local test suites / health probes), and the real
# client IP is resolved behind the ingress proxy via X-Forwarded-For.
# External traffic never presents as loopback, so brute-force protection holds.
limiter = Limiter(key_func=client_ip_key)

def get_limiter() -> Limiter:
    return limiter
