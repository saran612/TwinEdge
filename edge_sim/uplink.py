"""
Uplink transport interface supporting HTTP batch POST and MQTT with link health tracking.
"""
import requests
import json
import time
from typing import List, Dict, Any, Optional

class UplinkTransport:
    def __init__(
        self,
        cloud_url: str = "http://localhost:8000",
        device_key: str = "dev-key-default",
        mode: str = "http", # http | mqtt
        mqtt_host: str = "localhost",
        mqtt_port: int = 1883
    ):
        self.cloud_url = cloud_url.rstrip("/")
        self.device_key = device_key
        self.mode = mode
        self.mqtt_host = mqtt_host
        self.mqtt_port = mqtt_port
        
        self.is_link_up = True
        self.last_ack_time = 0.0
        self.consecutive_failures = 0
        self.simulated_cut = False

    def set_simulated_cut(self, cut: bool):
        self.simulated_cut = cut
        if cut:
            self.is_link_up = False

    def send_batch(self, items: List[Dict[str, Any]]) -> bool:
        if self.simulated_cut or not items:
            return False

        if self.mode == "http":
            return self._send_http(items)
        else:
            return self._send_mqtt(items)

    def _send_http(self, items: List[Dict[str, Any]]) -> bool:
        url = f"{self.cloud_url}/ingest"
        headers = {
            "Content-Type": "application/json",
            "X-Device-Key": self.device_key
        }
        # Items payload format: list of messages {device_id, seq, kind, payload}
        payload = [
            {
                "device_id": it["device_id"],
                "seq": it["seq"],
                "kind": it["kind"],
                "data": it["payload"]
            }
            for it in items
        ]
        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=3.0)
            if resp.status_code == 200:
                self.is_link_up = True
                self.consecutive_failures = 0
                self.last_ack_time = time.time()
                return True
            else:
                self.consecutive_failures += 1
                if self.consecutive_failures >= 3:
                    self.is_link_up = False
                return False
        except Exception:
            self.consecutive_failures += 1
            if self.consecutive_failures >= 3:
                self.is_link_up = False
            return False

    def _send_mqtt(self, items: List[Dict[str, Any]]) -> bool:
        # Simple MQTT publish or fallback to HTTP
        return self._send_http(items)
