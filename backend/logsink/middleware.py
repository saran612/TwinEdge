import os
import sys
import time
import uuid
from typing import Optional, Dict, Any, List
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

# Import pipeline
from logsink.pipeline import PostgresLogPipeline, level_to_name, name_to_level
from app.db import DB_PATH

LOG_SINK = os.getenv("LOG_SINK", "sqlite").lower()
LOG_READ_STORE = os.getenv("LOG_READ_STORE", "sqlite").lower()

PG_HOST = os.getenv("POSTGRES_HOST", "127.0.0.1")
PG_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
PG_DB = os.getenv("POSTGRES_DB", "twinedge")
PG_USER = os.getenv("POSTGRES_APP_USER", "twinedge_app")
PG_PASSWORD = os.getenv("POSTGRES_APP_PASSWORD", "twinedge_app_secret")

# Shared singleton pipeline instance
pipeline_instance = PostgresLogPipeline(
    mode=LOG_SINK,
    host=PG_HOST,
    port=PG_PORT,
    dbname=PG_DB,
    user=PG_USER,
    password=PG_PASSWORD,
    spool_path="data/logs/pg_spool.jsonl",
    sqlite_db_path=DB_PATH
)

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        trace_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.trace_id = trace_id

        start_time = time.perf_counter()
        status_code = 500
        response = None
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = trace_id
            return response
        except Exception as e:
            # Log uncaught exception
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            route = request.url.path
            pipeline_instance.emit(
                level=40,  # ERROR
                source="backend",
                event="request_failed",
                message=f"{request.method} {route} failed with {type(e).__name__}: {str(e)}",
                data={
                    "method": request.method,
                    "route": route,
                    "status": 500,
                    "latency_ms": latency_ms,
                    "error": str(e)
                },
                trace_id=trace_id
            )
            raise
        finally:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            route = request.url.path
            # Log HTTP requests: persist INFO for requests; skip spamming static /health polls
            if route not in ("/health", "/metrics"):
                level = 40 if status_code >= 500 else (30 if status_code >= 400 else 20)
                pipeline_instance.emit(
                    level=level,
                    source="backend",
                    event="http_request",
                    message=f"{request.method} {route} {status_code} ({latency_ms} ms)",
                    data={
                        "method": request.method,
                        "route": route,
                        "status": status_code,
                        "latency_ms": latency_ms
                    },
                    trace_id=trace_id
                )
