import React, { useState, useEffect, useRef } from 'react';
import { Card, TableShell, Button, ProvenanceTag, Chip } from '../components/ui';
import { api, API_BASE } from '../services/api';
import {
  FileText,
  Filter,
  Play,
  Pause,
  Download,
  Terminal,
  AlertCircle,
  AlertTriangle,
  Info,
  Database,
} from 'lucide-react';

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLiveTail, setIsLiveTail] = useState(true);
  const [storeInfo, setStoreInfo] = useState({ store: 'sqlite', degraded: false });
  const sseRef = useRef(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getLogs({
        level: levelFilter,
        source: sourceFilter,
        q: searchQuery,
        limit: 100,
      });
      const list = data || [];
      setLogs(list);
      if (list.length > 0) {
        setStoreInfo({
          store: list[0].store || 'sqlite',
          degraded: !!list[0].degraded,
        });
      }
    } catch (err) {
      console.warn('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchLogs();
  }, [levelFilter, sourceFilter]);

  // Live Tail SSE connection + fallback polling
  useEffect(() => {
    if (!isLiveTail) {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      return;
    }

    try {
      const es = new EventSource(`${API_BASE}/stream/fleet`);
      const handleEvent = (e) => {
        try {
          const item = JSON.parse(e.data);
          setLogs((prev) => [item, ...prev].slice(0, 150));
        } catch {}
      };
      es.onmessage = handleEvent;
      es.addEventListener('fleet_event', handleEvent);
      sseRef.current = es;
    } catch (e) {
      console.warn('Logs SSE error:', e);
    }

    const pollTimer = setInterval(fetchLogs, 4000);

    return () => {
      clearInterval(pollTimer);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [isLiveTail, levelFilter, sourceFilter]);

  const exportLogs = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twinedge-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      field: 'ts',
      header: 'TIMESTAMP',
      width: '18%',
      render: (val) => (
        <span className="font-mono text-xs text-text-2">
          {new Date((val || 0) * 1000).toISOString().replace('T', ' ').slice(0, 19)}
        </span>
      ),
    },
    {
      field: 'level',
      header: 'LEVEL',
      width: '10%',
      render: (val) => {
        const lvl = val || 'INFO';
        const color =
          lvl === 'WARN'
            ? 'text-status-degrading-text bg-status-degrading-bg border-status-degrading-border'
            : lvl === 'ERROR'
            ? 'text-status-critical-text bg-status-critical-bg border-status-critical-border'
            : 'text-accent bg-surface-2 border-border';
        return (
          <span className={`px-2 py-0.5 rounded-sm border text-xs font-mono font-bold ${color}`}>
            {lvl}
          </span>
        );
      },
    },
    {
      field: 'source',
      header: 'SOURCE',
      width: '10%',
      render: (val, row) => (
        <span className="font-mono text-xs text-text-muted">
          {val || 'edge'} ({row.device_id || 'system'})
        </span>
      ),
    },
    {
      field: 'kind',
      header: 'EVENT KIND',
      width: '16%',
      render: (val) => <span className="font-mono text-xs text-accent font-semibold">{val}</span>,
    },
    {
      field: 'message',
      header: 'MESSAGE / PAYLOAD',
      width: '46%',
      render: (val, row) => (
        <div className="font-mono text-xs text-text-main truncate max-w-xl" title={val}>
          {val}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-full gap-5 select-none overflow-y-auto pr-1">
      {/* Degraded Alert Banner if Postgres is down/fallback */}
      {storeInfo.degraded && (
        <div className="bg-status-degrading-bg border border-status-degrading-border text-status-degrading-text px-4 py-2.5 rounded-md text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-status-degrading-text flex-shrink-0" />
            <span>
              <strong>Degraded Mode Active:</strong> Primary PostgreSQL log store is currently unavailable or unreachable. Falling back transparently to SQLite stream events buffer.
            </span>
          </div>
          <span className="font-mono text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-status-degrading-text/10">
            Fallback Active
          </span>
        </div>
      )}

      {/* Top Header & Controls */}
      <Card className="flex-row items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-accent" />
            <h2 className="text-base font-semibold text-text-main">System & Edge Fleet Logs</h2>
            <Chip
              status={storeInfo.degraded ? 'DEGRADING' : (storeInfo.store === 'postgres' ? 'HEALTHY' : 'NEUTRAL')}
              label={storeInfo.degraded ? 'Degraded (SQLite)' : (storeInfo.store === 'postgres' ? 'PostgreSQL' : 'SQLite')}
              size="xs"
              className="ml-1"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">

            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="bg-surface-2 border border-border rounded-md px-2.5 py-1 text-xs font-mono text-text cursor-pointer"
            >
              <option value="">All Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-surface-2 border border-border rounded-md px-2.5 py-1 text-xs font-mono text-text cursor-pointer"
            >
              <option value="">All Sources</option>
              <option value="cloud">Cloud Backend</option>
              <option value="edge">Edge Nodes</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant={isLiveTail ? 'primary' : 'secondary'}
            onClick={() => setIsLiveTail(!isLiveTail)}
          >
            {isLiveTail ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isLiveTail ? 'Live Tail Active' : 'Live Tail Paused'}</span>
          </Button>

          <Button size="sm" variant="secondary" onClick={exportLogs}>
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </Button>
        </div>
      </Card>

      {/* Logs Table */}
      <Card className="p-0 overflow-hidden flex-1">
        <TableShell
          columns={columns}
          data={logs}
          loading={loading}
          emptyMessage="No log records available. Run edge fleet stream to view live node logs."
        />
      </Card>
    </div>
  );
}
