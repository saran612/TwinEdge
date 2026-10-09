-- Migration V001: Structured system and device event logs table
-- Created for TwinEdge system-log and device-event store

CREATE TABLE IF NOT EXISTS app_logs (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    level SMALLINT NOT NULL CHECK (level BETWEEN 10 AND 50),
    source TEXT NOT NULL,
    device_id TEXT,
    engine_key TEXT,
    session_id TEXT,
    event TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    trace_id TEXT,
    seq BIGINT
);

-- Indexing optimized for operational queries and keyset pagination
CREATE INDEX IF NOT EXISTS idx_app_logs_ts_desc ON app_logs (ts DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_source_ts_desc ON app_logs (source, ts DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level_ts_desc ON app_logs (level, ts DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_engine_key_ts_desc ON app_logs (engine_key, ts DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_data_gin ON app_logs USING gin (data jsonb_path_ops);

-- Idempotency constraint: edge events retried by the edge node must not duplicate
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_logs_edge_dedup 
    ON app_logs (source, device_id, seq, event) 
    WHERE seq IS NOT NULL;
