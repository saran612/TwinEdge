"""
Edge Node Local FastAPI service exposing /health, /state, /telemetry, /alerts, /events, /stream (SSE), and /control/*
"""
import asyncio
import json
from fastapi import FastAPI, HTTPException, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import Optional, Dict, Any

from edge_sim.edge_node import EdgeNode

def create_edge_app(node: EdgeNode) -> FastAPI:
    app = FastAPI(title=f"Edge Node {node.device_id}")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "device_id": node.device_id,
            "engine_key": node.engine_key,
            "session_id": node.session_id,
            "inference_site": node.active_inference_site,
            "link_up": node.uplink.is_link_up,
            "cycle": node.current_cycle,
            "model_loaded": node.ort_session is not None
        }

    @app.get("/state")
    def state():
        return {
            "device_id": node.device_id,
            "engine_key": node.engine_key,
            "session_id": node.session_id,
            "cycle": node.current_cycle,
            "inference_site": node.active_inference_site,
            "last_frame": node.last_state,
            "outbox": node.outbox.get_stats()
        }

    @app.get("/telemetry")
    def get_telemetry(from_cycle: int = 1, limit: int = 100):
        # Query local SQLite
        import sqlite3
        conn = sqlite3.connect(node.db_path)
        c = conn.cursor()
        c.execute("""
            SELECT cycle, data, ts FROM local_telemetry
            WHERE cycle >= ? ORDER BY cycle ASC LIMIT ?
        """, (from_cycle, limit))
        rows = c.fetchall()
        conn.close()
        return [{"cycle": r[0], "data": json.loads(r[1]), "ts": r[2]} for r in rows]

    @app.get("/alerts")
    def get_alerts():
        return [node.pending_alert] if node.pending_alert else []

    @app.get("/events")
    def get_events(limit: int = 50):
        import sqlite3
        conn = sqlite3.connect(node.db_path)
        c = conn.cursor()
        c.execute("SELECT id, kind, message, data, ts FROM local_events ORDER BY id DESC LIMIT ?", (limit,))
        rows = c.fetchall()
        conn.close()
        return [
            {"id": r[0], "kind": r[1], "message": r[2], "data": json.loads(r[3]), "ts": r[4]}
            for r in rows
        ]

    @app.get("/stream")
    async def sse_stream(request: Request):
        async def event_generator():
            last_sent_seq = 0
            while True:
                if await request.is_disconnected():
                    break
                if node.last_state and node.seq > last_sent_seq:
                    last_sent_seq = node.seq
                    yield f"id: {node.seq}\nevent: frame\ndata: {json.dumps(node.last_state)}\n\n"
                await asyncio.sleep(0.2)

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    @app.post("/control/fault")
    def inject_fault(fault: Dict[str, Any] = Body(...)):
        node.replay.fault_config = fault
        node.log_event("fault_injected", f"Injected fault: {fault}")
        return {"status": "ok", "fault": fault}

    @app.post("/control/link")
    def control_link(action: Dict[str, str] = Body(...)):
        act = action.get("action", "up")
        node.uplink.set_simulated_cut(act == "down")
        node.log_event(f"link_{act}", f"Link manually set to {act}")
        return {"status": "ok", "link_up": node.uplink.is_link_up}

    @app.post("/control/speed")
    def control_speed(body: Dict[str, float] = Body(...)):
        rate = body.get("rate", 1.0)
        node.rate = rate
        return {"status": "ok", "rate": rate}

    @app.post("/control/jump")
    def control_jump(body: Dict[str, int] = Body(...)):
        cycle = body.get("cycle", 30)
        node.replay.current_cycle = cycle
        return {"status": "ok", "cycle": cycle}

    return app
