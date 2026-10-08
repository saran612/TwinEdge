import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { api, API_BASE } from '../services/api';
import { defaultReplayController } from '../services/replayController';
import { runLocalInference } from '../services/inferenceEngine';

const AppContext = createContext(null);

export const DATA_SOURCES = {
  LIVE_CLOUD: 'Live',
  LIVE_EDGE: 'Live (Edge Local)',
  REPLAY: 'Replay',
  SIMULATION: 'Simulation',
};

const RING_BUFFER_SIZE = 500;

export function AppProvider({ children }) {
  const replayController = defaultReplayController;
  const availableEngines = replayController.getEnginesList();

  // Navigation & Data source state
  const [dataSource, setDataSource] = useState(DATA_SOURCES.REPLAY);
  const [activeEngineId, setActiveEngineId] = useState(availableEngines[0]?.id || 1);
  const [activeEngineKey, setActiveEngineKey] = useState(availableEngines[0]?.key || 'VAL-001');
  const [currentCycle, setCurrentCycle] = useState(30);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isRubricsOpen, setIsRubricsOpen] = useState(false);

  // Edge local URL
  const [edgeLocalUrl, setEdgeLocalUrl] = useState('http://localhost:8100');
  const [isOfflineEdgeFallback, setIsOfflineEdgeFallback] = useState(false);

  // Theme
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('twinedge_theme') || 'dark';
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('twinedge_theme', next);
      return next;
    });
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Connectivity
  const [connectivity, setConnectivity] = useState({
    backend: { status: 'UNKNOWN', lastChecked: null, detail: '' },
    mqtt: { status: 'UNKNOWN', lastChecked: null, detail: '' },
    influx: { status: 'UNKNOWN', lastChecked: null, detail: '' },
    network: { status: 'OK', lastChecked: new Date().toISOString() },
  });

  const [fleetList, setFleetList] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [pendingAlertCount, setPendingAlertCount] = useState(0);

  // UNIFIED TELEMETRY RING BUFFER (D1)
  // Store shape per engine: { [engine_key]: Array<Frame> }
  const [telemetryRing, setTelemetryRing] = useState({});
  const sseRef = useRef(null);

  // Add frame to ring buffer
  const addFrameToRing = useCallback((frame) => {
    if (!frame || !frame.engine_key) return;
    const key = frame.engine_key;
    setTelemetryRing((prev) => {
      const existing = prev[key] || [];
      // avoid duplicates by cycle/seq
      const filtered = existing.filter((f) => f.cycle !== frame.cycle);
      const updated = [...filtered, frame].sort((a, b) => a.cycle - b.cycle);
      if (updated.length > RING_BUFFER_SIZE) {
        updated.splice(0, updated.length - RING_BUFFER_SIZE);
      }
      return { ...prev, [key]: updated };
    });
  }, []);

  // Poll connectivity & fleet
  const checkConnectivity = async () => {
    const now = new Date().toISOString();
    try {
      const h = await api.getHealth();
      setConnectivity({
        backend: { status: 'OK', lastChecked: now, detail: h.message },
        mqtt: {
          status: h.mqtt_broker_online ? 'OK' : 'DOWN',
          lastChecked: now,
          detail: h.pipeline_mode,
        },
        influx: {
          status: h.downstream_connected ? 'OK' : 'DOWN',
          lastChecked: now,
        },
        network: { status: 'OK', lastChecked: now },
      });
      setIsOfflineEdgeFallback(false);

      // Refresh fleet
      try {
        const fleet = await api.getFleet();
        setFleetList(fleet || []);
      } catch (fErr) {
        // fleet query failure
      }

      // Refresh alerts (filtered: ignore legacy archived alerts)
      try {
        const aList = await api.getAlerts(true);
        const filtered = (aList || []).filter((a) => a.session_id !== 'legacy');
        setAlerts(filtered);
        setPendingAlertCount(filtered.filter((a) => a.status === 'PENDING').length);
      } catch (aErr) {
        // alert query failure
      }
    } catch (err) {
      setConnectivity((prev) => ({
        ...prev,
        backend: { status: 'DOWN', lastChecked: now, detail: err.message },
        network: { status: navigator.onLine ? 'OK' : 'DOWN', lastChecked: now },
      }));

      // Check if Edge Local responds for auto-failover
      if (dataSource === DATA_SOURCES.LIVE_CLOUD) {
        try {
          const edgeRes = await fetch(`${edgeLocalUrl}/health`, { timeout: 1500 });
          if (edgeRes.ok) {
            setIsOfflineEdgeFallback(true);
          }
        } catch {
          setIsOfflineEdgeFallback(false);
        }
      }
    }
  };

  useEffect(() => {
    checkConnectivity();
    const timer = setInterval(checkConnectivity, 8000);
    return () => clearInterval(timer);
  }, [dataSource, edgeLocalUrl]);

  // Live SSE stream handler when in Live modes
  useEffect(() => {
    if (dataSource !== DATA_SOURCES.LIVE_CLOUD && dataSource !== DATA_SOURCES.LIVE_EDGE) {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      return;
    }

    const sseUrl =
      dataSource === DATA_SOURCES.LIVE_EDGE
        ? `${edgeLocalUrl}/stream`
        : `${API_BASE}/stream/${activeEngineKey}`;

    try {
      const es = new EventSource(sseUrl);
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          addFrameToRing(data);
          if (data.cycle) {
            setCurrentCycle(data.cycle);
          }
        } catch (e) {
          console.warn('SSE frame parse error:', e);
        }
      };

      es.onerror = () => {
        es.close();
      };
      sseRef.current = es;
    } catch (e) {
      console.warn('SSE connection failed:', e);
    }

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [dataSource, activeEngineKey, edgeLocalUrl, addFrameToRing]);

  // Playback delta accumulation engine (T4)
  useEffect(() => {
    if (!isPlaying) return;
    if (dataSource === DATA_SOURCES.LIVE_CLOUD || dataSource === DATA_SOURCES.LIVE_EDGE) {
      setIsPlaying(false);
      return;
    }

    const currentEng = replayController.getCycleData(activeEngineKey || activeEngineId, currentCycle);
    const maxCycle = currentEng?.totalCycles || 192;

    let lastTime = performance.now();
    let accumulatedMs = 0;
    let animId;

    const tick = (now) => {
      const delta = now - lastTime;
      lastTime = now;
      accumulatedMs += delta;

      const stepMs = 1000 / (playbackSpeed || 1);

      if (accumulatedMs >= stepMs) {
        const stepsToAdvance = Math.floor(accumulatedMs / stepMs);
        accumulatedMs %= stepMs;

        setCurrentCycle((prev) => {
          const next = prev + stepsToAdvance;
          if (next >= maxCycle) {
            setIsPlaying(false);
            return maxCycle;
          }
          return next;
        });
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playbackSpeed, dataSource, activeEngineKey, activeEngineId]);

  return (
    <AppContext.Provider
      value={{
        dataSource,
        setDataSource,
        activeEngineId,
        setActiveEngineId,
        activeEngineKey,
        setActiveEngineKey,
        currentCycle,
        setCurrentCycle,
        isPlaying,
        setIsPlaying,
        playbackSpeed,
        setPlaybackSpeed,
        theme,
        toggleTheme,
        isRubricsOpen,
        setIsRubricsOpen,
        connectivity,
        checkConnectivity,
        fleetList,
        alerts,
        setAlerts,
        pendingAlertCount,
        setPendingAlertCount,
        replayController,
        availableEngines,
        telemetryRing,
        edgeLocalUrl,
        setEdgeLocalUrl,
        isOfflineEdgeFallback,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
