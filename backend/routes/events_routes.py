# p191: SSE realtime channel — pushes domain events to the browser the moment
# the outbox relay publishes them (no polling). Token via query param because
# EventSource cannot send Authorization headers.
import asyncio
import json
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

log = logging.getLogger("events_sse")

FEED_CHANNEL = "nt:events_feed"
HEARTBEAT_S = 25


def create_events_routes(db, get_current_user, get_tenant_admin) -> dict:
    router = APIRouter(prefix="/events", tags=["events"])

    @router.get("/stream")
    async def stream(token: str = Query(...)):
        # Manual token check (EventSource has no headers)
        try:
            from utils.auth import SECRET_KEY, ALGORITHM
            import jwt
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
        tenant_id = payload.get("tenant_id") or "platform"
        if not payload.get("sub"):
            raise HTTPException(status_code=401, detail="Invalid token")

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
                    try:
                        msg = await asyncio.wait_for(pubsub.get_message(ignore_subscribe_messages=True), timeout=HEARTBEAT_S)
                    except asyncio.TimeoutError:
                        yield ": hb\n\n"  # heartbeat keeps proxies alive
                        continue
                    if not msg or msg.get("type") != "message":
                        continue
                    try:
                        data = json.loads(msg["data"])
                    except Exception:
                        continue
                    # tenant isolation: only same-tenant or platform-wide events
                    if data.get("tenant_id") not in (tenant_id, "platform"):
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
