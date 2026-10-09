"""
jetson_node/tools/fault_proxy.py
Chaos fault injection proxy for TwinEdge edge uplink testing (no root needed).
Can inject:
- Latency (fixed or jitter)
- Drop probability
- Blackouts (cloud down for N seconds)
- HTTP 401 / 500 error responses
- Duplicate delivery / replay
- Body truncation / corruption

Python 3.6+ compatible stdlib HTTP server.
"""
import sys
import time
import random
import threading
if sys.version_info[0] >= 3:
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import urllib.request as urllib_request
    import urllib.error as urllib_error
else:
    from BaseHTTPServer import HTTPServer, BaseHTTPRequestHandler
    import urllib2 as urllib_request
    import urllib2 as urllib_error

class ChaosConfig(object):
    def __init__(self):
        self.target_url = "http://127.0.0.1:8000"
        self.latency_sec = 0.0
        self.drop_prob = 0.0
        self.blackout_until = 0.0
        self.force_status_code = None
        self.truncate_body = False
        self.duplicate_delivery = False
        self.requests_received = 0
        self.requests_dropped = 0
        self.requests_forwarded = 0

chaos_config = ChaosConfig()

class ChaosProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_POST(self):
        chaos_config.requests_received += 1
        now = time.time()

        # Check blackout
        if now < chaos_config.blackout_until:
            chaos_config.requests_dropped += 1
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b'{"error": "Cloud Blackout Injected"}')
            return

        # Check drop probability
        if chaos_config.drop_prob > 0 and random.random() < chaos_config.drop_prob:
            chaos_config.requests_dropped += 1
            self.send_response(504)
            self.end_headers()
            self.wfile.write(b'{"error": "Simulated Gateway Timeout / Drop"}')
            return

        # Inject latency
        if chaos_config.latency_sec > 0:
            time.sleep(chaos_config.latency_sec)

        # Force status code
        if chaos_config.force_status_code:
            self.send_response(chaos_config.force_status_code)
            self.end_headers()
            self.wfile.write(b'{"error": "Forced status code error"}')
            return

        # Read incoming payload
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)

        if chaos_config.truncate_body:
            body = body[:max(1, len(body) // 2)]

        # Forward request to upstream target
        target = chaos_config.target_url.rstrip("/") + self.path
        req = urllib_request.Request(target, data=body)
        for h, v in self.headers.items():
            if h.lower() not in ["content-length", "host"]:
                req.add_header(h, v)

        deliver_count = 2 if chaos_config.duplicate_delivery else 1
        for _ in range(deliver_count):
            try:
                resp = urllib_request.urlopen(req, timeout=10.0)
                code = resp.getcode()
                resp_data = resp.read()
                chaos_config.requests_forwarded += 1
                self.send_response(code)
                for rh, rv in resp.headers.items():
                    if rh.lower() not in ["content-length", "transfer-encoding"]:
                        self.send_header(rh, rv)
                self.send_header("Content-Length", str(len(resp_data)))
                self.end_headers()
                self.wfile.write(resp_data)
            except urllib_error.HTTPError as e:
                err_data = e.read()
                self.send_response(e.code)
                self.end_headers()
                self.wfile.write(err_data)
            except Exception as e:
                self.send_response(502)
                self.end_headers()
                self.wfile.write(b'{"error": "Upstream error"}')

class ChaosProxyServer(object):
    def __init__(self, target_url, port=0):
        chaos_config.target_url = target_url
        self.server = HTTPServer(("127.0.0.1", port), ChaosProxyHandler)
        self.port = self.server.server_port
        self.thread = None

    def start(self):
        self.thread = threading.Thread(target=self.server.serve_forever, name="chaos_proxy")
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
        if self.thread:
            self.thread.join(timeout=2.0)
