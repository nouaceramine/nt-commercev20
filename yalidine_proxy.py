#!/usr/bin/env python3
"""Tiny Yalidine egress proxy for the NT Commerce backend container.

The server's IPv4 address is WAF-blocked by api.yalidine.app, while IPv6 works.
Docker containers here have no IPv6 connectivity, so the backend calls this
proxy on the docker bridge gateway (172.20.0.1:8899) and the proxy forwards
to Yalidine over the host's IPv6 using stdlib urllib (which works).

Security: binds only to the docker bridge interface, only proxies paths under
/v1/ to api.yalidine.app, GET only, API credentials are passed through from
the caller (nothing stored here).
"""
import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ALLOWED_BASE = "https://api.yalidine.app"
BIND = ("172.20.0.1", 8899)


class Handler(BaseHTTPRequestHandler):
    server_version = "YalidineProxy/1.0"

    def log_message(self, fmt, *args):  # quiet
        pass

    def do_GET(self):
        if not self.path.startswith("/v1/"):
            self._reply(404, {"error": "not found"})
            return
        url = ALLOWED_BASE + self.path
        headers = {
            "X-API-ID": self.headers.get("X-API-ID", ""),
            "X-API-TOKEN": self.headers.get("X-API-TOKEN", ""),
        }
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                body = r.read()
                self._reply(r.status, raw=body)
        except urllib.error.HTTPError as e:
            self._reply(e.code, raw=e.read() or b"{}")
        except Exception as e:
            self._reply(502, {"error": f"upstream: {str(e)[:150]}"})

    def _reply(self, code, obj=None, raw=None):
        body = raw if raw is not None else json.dumps(obj or {}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    srv = ThreadingHTTPServer(BIND, Handler)
    print(f"yalidine proxy listening on {BIND[0]}:{BIND[1]}", flush=True)
    srv.serve_forever()
