"""
jetson_node/node/local_api.py
Read-only stdlib HTTP API for TwinEdge Jetson node:
- /health: runtime, canary status, storage depth, link status
- /state: current cycle, active engines, twin bands, alert states
- /metrics: plain-text Prometheus-style counters
- /events?since=: event history queries

Python 3.6+ compatible (no ThreadingHTTPServer, simple BaseHTTPRequestHandler).
"""
import sys
import json
import time
import threading

if sys.version_info[0] >= 3:
    from http.server import HTTPServer, BaseHTTPRequestHandler
    from urllib.parse import urlparse, parse_qs
else:
    from BaseHTTPServer import HTTPServer, BaseHTTPRequestHandler
    from urlparse import urlparse, parse_qs

class NodeLocalApiHandler(BaseHTTPRequestHandler):
    # Class-level reference to the node core
    node_ref = None

    def log_message(self, format, *args):
        pass # Suppress standard access logging to keep stdout quiet

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/health":
            self._handle_health()
        elif path == "/state":
            self._handle_state()
        elif path == "/metrics":
            self._handle_metrics()
        elif path == "/events":
            self._handle_events(qs)
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error": "Not Found"}')

    def _send_json(self, data, code=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_health(self):
        node = NodeLocalApiHandler.node_ref
        health_info = {
            "status": "healthy" if node else "initializing",
            "device_id": node.device_id if node else "unknown",
            "runtime": node.runtime.name if node and node.runtime else "unknown",
            "model_sha": node.runtime.model_sha if node and node.runtime else "unknown",
            "link_status": node.uplink.link_status if node and node.uplink else "offline",
            "storage": node.storage.get_stats() if node and node.storage else {},
            "device_health": node.health_monitor.last_metrics if node and node.health_monitor else {}
        }
        self._send_json(health_info)

    def _handle_state(self):
        node = NodeLocalApiHandler.node_ref
        state_info = {
            "device_id": node.device_id if node else "unknown",
            "boot_id": node.boot_id if node else "unknown",
            "engines": node.get_engines_state() if node else {}
        }
        self._send_json(state_info)

    def _handle_metrics(self):
        node = NodeLocalApiHandler.node_ref
        stats = node.storage.get_stats() if node and node.storage else {}
        uplink = node.uplink if node else None

        lines = [
            "# HELP twinedge_outbox_depth Current depth of SQLite outbox queue",
            "# TYPE twinedge_outbox_depth gauge",
            "twinedge_outbox_depth " + str(stats.get("outbox_depth", 0)),
            "# HELP twinedge_quarantine_count Poison pill quarantined items count",
            "# TYPE twinedge_quarantine_count counter",
            "twinedge_quarantine_count " + str(stats.get("quarantine_count", 0)),
            "# HELP twinedge_drops_total Total outbox dropped items under capacity cap",
            "# TYPE twinedge_drops_total counter",
            "twinedge_drops_total " + str(stats.get("drop_count", 0)),
            "# HELP twinedge_raw_bytes_sent Total raw uncompressed JSON bytes processed",
            "# TYPE twinedge_raw_bytes_sent counter",
            "twinedge_raw_bytes_sent " + str(uplink.raw_bytes_sent if uplink else 0),
            "# HELP twinedge_compressed_bytes_sent Total gzip compressed bytes transmitted",
            "# TYPE twinedge_compressed_bytes_sent counter",
            "twinedge_compressed_bytes_sent " + str(uplink.compressed_bytes_sent if uplink else 0),
        ]
        body = ("\n".join(lines) + "\n").encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_events(self, qs):
        node = NodeLocalApiHandler.node_ref
        since_val = float(qs.get("since", [0])[0])
        events = node.get_recent_events(since=since_val) if node else []
        self._send_json({"events": events, "count": len(events)})

class LocalApiServer(object):
    def __init__(self, node_ref, bind_addr="127.0.0.1", port=8088):
        self.node_ref = node_ref
        self.bind_addr = bind_addr
        self.port = port
        NodeLocalApiHandler.node_ref = node_ref
        self.server = HTTPServer((self.bind_addr, self.port), NodeLocalApiHandler)
        self.thread = None

    def start(self):
        self.thread = threading.Thread(target=self.server.serve_forever, name="local_api_server")
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
        if self.thread:
            self.thread.join(timeout=2.0)
