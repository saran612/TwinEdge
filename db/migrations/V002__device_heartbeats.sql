-- Migration V002: Device heartbeats for Edge & Fleet history
-- Periodic node telemetry metrics (temperature, RAM, link state, queue depth)

CREATE TABLE IF NOT EXISTS device_heartbeats (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL,
    device_id TEXT NOT NULL,
    cpu_temp REAL,
    ram_used_mb REAL,
    link_state TEXT NOT NULL DEFAULT 'online',
    queue_depth INTEGER NOT NULL DEFAULT 0,
    power_mode TEXT NOT NULL DEFAULT 'normal',
    clock_synced BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_device_heartbeats_device_ts ON device_heartbeats (device_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_device_heartbeats_ts ON device_heartbeats (ts DESC);
