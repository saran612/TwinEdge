import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { defaultReplayController } from '../services/replayController';

const AppContext = createContext(null);

export const DATA_SOURCES = {
  LIVE: 'Live',
  REPLAY: 'Replay',
  SIMULATION: 'Simulation',
};

export function AppProvider({ children }) {
  const replayController = defaultReplayController;
  const availableEngines = replayController.getEnginesList();

  // Global Shell state
  const [dataSource, setDataSource] = useState(DATA_SOURCES.REPLAY);
  const [activeEngineId, setActiveEngineId] = useState(availableEngines[0]?.id || 1);
  const [activeEngineKey, setActiveEngineKey] = useState(availableEngines[0]?.key || 'VAL-001');
  const [currentCycle, setCurrentCycle] = useState(30); // S5c: Replay starts at cycle 30
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 0.5x - 8x
  const [isRubricsOpen, setIsRubricsOpen] = useState(false);

  // Theme state: 'dark' | 'light'
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

  // Connectivity status pills: OK | DOWN | UNKNOWN + last checked timestamp
  const [connectivity, setConnectivity] = useState({
    backend: { status: 'UNKNOWN', lastChecked: null, detail: '' },
    mqtt: { status: 'UNKNOWN', lastChecked: null, detail: '' },
    influx: { status: 'UNKNOWN', lastChecked: null, detail: '' },
    network: { status: 'OK', lastChecked: new Date().toISOString() },
  });

  // Model & fleet state
  const [modelInfo, setModelInfo] = useState(null);
  const [modelInfoError, setModelInfoError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [pendingAlertCount, setPendingAlertCount] = useState(0);

  // Poll connectivity periodically
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
    } catch (err) {
      setConnectivity((prev) => ({
        ...prev,
        backend: { status: 'DOWN', lastChecked: now, detail: err.message },
        mqtt: { status: 'UNKNOWN', lastChecked: now },
        influx: { status: 'UNKNOWN', lastChecked: now },
        network: { status: navigator.onLine ? 'OK' : 'DOWN', lastChecked: now },
      }));
    }
  };

  // Playback delta accumulation engine (T4)
  // State machine: isPlaying, playbackSpeed (0.5x, 1x, 2x, 4x, 8x), clamps at last cycle
  useEffect(() => {
    if (!isPlaying) return;
    if (dataSource === DATA_SOURCES.LIVE) {
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

      // Base cycle step time: 1000ms / playbackSpeed (1 cycle per second at 1x)
      const stepMs = 1000 / (playbackSpeed || 1);

      if (accumulatedMs >= stepMs) {
        const stepsToAdvance = Math.floor(accumulatedMs / stepMs);
        accumulatedMs %= stepMs;

        setCurrentCycle((prev) => {
          const next = prev + stepsToAdvance;
          if (next >= maxCycle) {
            setIsPlaying(false); // Playback reached end
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

  useEffect(() => {
    checkConnectivity();
    const timer = setInterval(checkConnectivity, 15000);
    return () => clearInterval(timer);
  }, []);

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
        modelInfo,
        setModelInfo,
        modelInfoError,
        setModelInfoError,
        alerts,
        setAlerts,
        pendingAlertCount,
        setPendingAlertCount,
        replayController,
        availableEngines,
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
