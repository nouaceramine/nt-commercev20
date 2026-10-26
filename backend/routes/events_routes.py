# p191: SSE realtime channel — pushes domain events to the browser the moment
# the outbox relay publishes them (no polling). Token via query param because
# EventSource cannot send Authorization headers.
import asyncio
import json
import logging
import os
import time

import jwt
from fastapi import APIRouter, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse

log = logging.getLogger("events_sse")

FEED_CHANNEL = "nt:events_feed"
HEARTBEAT_S = 25


def create_events_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/events", tags=["events"])

    @router.get("/stream")
    async def stream(token: str = Query(...)):
        # EventSource cannot send Authorization headers; still run the full auth dependency.
        try:
            from utils.auth import SECRET_KEY, ALGORITHM, get_current_user as authenticate
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            raise HTTPException(status_code=401, detail="Invalid token")
        if not payload.get("sub") or payload.get("type") not in (None, "tenant", "super_admin", "admin", "cashier", "agent"):
            raise HTTPException(status_code=401, detail="Invalid token")
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        user = await authenticate(credentials)
        tenant_id = user.get("tenant_id") or "platform"
        expires_at = float(payload["exp"])
        can_receive_platform = user.get("role") == "super_admin" or user.get("user_type") == "super_admin"

        async def gen():
            url = os.environ.get("REDIS_URL")
            r = None
            pubsub = None
            try:
                import redis.asyncio as redis_async
                r = redis_async.from_url(url, decode_responses=True)
                pubsub = r.pubsub()
                await pubsub.subscribe(FEED_CHANNEL)
                yield f"data: {json.dumps({'type': 'connected'})}\n\n"
                while True:
                    if time.time() >= expires_at:
                        break
                    try:
                        msg = await asyncio.wait_for(pubsub.get_message(ignore_subscribe_messages=True), timeout=HEARTBEAT_S)
                    except asyncio.TimeoutError:
                        try:
                            await authenticate(credentials)  # revoked users/tenants are disconnected too
                        except HTTPException:
                            break
                        yield ": hb\n\n"  # heartbeat keeps proxies alive
                        continue
                    if not msg or msg.get("type") != "message":
                        continue
                    try:
                        data = json.loads(msg["data"])
                    except Exception:
                        continue
                    event_tenant = data.get("tenant_id")
                    if event_tenant != tenant_id and not (event_tenant == "platform" and can_receive_platform):
                        continue
                    yield f"data: {json.dumps(data, default=str)}\n\n"
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                log.warning("SSE stream error: %s", exc)
            finally:
                try:
                    if pubsub:
                        await pubsub.unsubscribe(FEED_CHANNEL)
                    if r:
                        await r.aclose()
                except Exception:
                    pass

        return StreamingResponse(
            gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return {"router": router}
