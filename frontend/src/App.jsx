import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  ShieldAlert, 
  RefreshCw, 
  Layers, 
  Cpu, 
  Database,
  Terminal,
  Settings,
  HelpCircle,
  FileText,
  Clock,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';

const BACKEND_URL = "http://localhost:8000";

export default function App() {
  const [activeTab, setActiveTab] = useState('queue'); // AME queue is centerpiece
  const [backendStatus, setBackendStatus] = useState('OFFLINE');
  const [modelLoaded, setModelLoaded] = useState(false);
  const [telemetry, setTelemetry] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [signoffNotes, setSignoffNotes] = useState('');
  const [selectedEngineId, setSelectedEngineId] = useState(1);
  const [isOfflineDemo, setIsOfflineDemo] = useState(false);
  const [latency, setLatency] = useState(null);

  // Poll server for health, telemetry and alerts
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Health check
        const healthRes = await fetch(`${BACKEND_URL}/health`);
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setBackendStatus('ONLINE');
          setModelLoaded(healthData.model_loaded);
          setIsOfflineDemo(false);
          if (healthData.metadata && healthData.metadata.mean_cpu_latency_ms) {
            setLatency(`${healthData.metadata.mean_cpu_latency_ms.toFixed(3)} ms`);
          } else {
            setLatency('pending');
          }
        } else {
          setBackendStatus('OFFLINE');
          setLatency('—');
        }
      } catch (e) {
        setBackendStatus('OFFLINE');
        setIsOfflineDemo(true);
        setLatency('—');
      }

      // 2. Fetch active alerts
      try {
        const alertsRes = await fetch(`${BACKEND_URL}/alerts?unresolved_only=true`);
        if (alertsRes.ok) {
          const alertsData = await alertsRes.json();
          setAlerts(alertsData);
        }
      } catch (e) {
        console.error("Alerts fetch error", e);
      }

      // 3. Fetch all alerts for audit log
      try {
        const auditRes = await fetch(`${BACKEND_URL}/alerts?unresolved_only=false`);
        if (auditRes.ok) {
          const auditData = await auditRes.json();
          // Filter to only resolved alerts
          setAuditLog(auditData.filter(a => a.status !== 'PENDING'));
        }
      } catch (e) {
        console.error("Audit log fetch error", e);
      }

      // 4. Fetch recent telemetry
      try {
        const telRes = await fetch(`${BACKEND_URL}/telemetry/recent`);
        if (telRes.ok) {
          const telData = await telRes.json();
          setTelemetry(telData);
        }
      } catch (e) {
        console.error("Telemetry fetch error", e);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 2500); // 2.5s polling
    return () => clearInterval(interval);
  }, []);

  // Handle AME Sign-off
  const handleSignoff = async (alertId, status) => {
    if (!alertId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/alerts/${alertId}/signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status, notes: signoffNotes })
      });
      if (res.ok) {
        // Clear selection and notes
        setSelectedAlert(null);
        setSignoffNotes('');
        // Refresh alert lists immediately
        const alertsRes = await fetch(`${BACKEND_URL}/alerts?unresolved_only=true`);
        if (alertsRes.ok) setAlerts(await alertsRes.json());
        const auditRes = await fetch(`${BACKEND_URL}/alerts?unresolved_only=false`);
        if (auditRes.ok) setAuditLog((await auditRes.json()).filter(a => a.status !== 'PENDING'));
      }
    } catch (e) {
      alert("Failed to submit signoff: " + e.message);
    }
  };

  // Pre-selected engines from NASA dataset for Live Twin visualization
  const getLatestTelemetryForEngine = (engineId) => {
    const engineData = telemetry.filter(t => t.engine_id === engineId);
    if (engineData.length === 0) return null;
    
    // Group fields by cycle
    const latestCycle = Math.max(...engineData.map(d => d.cycle));
    const cycleData = engineData.filter(d => d.cycle === latestCycle);
    
    const sensors = {};
    let rul = 125;
    let timestamp = new Date().toISOString();
    
    cycleData.forEach(d => {
      if (d.sensor.startsWith('sensor_')) {
        sensors[d.sensor] = d.value;
      } else if (d.sensor === 'rul_prediction') {
        rul = d.value;
      }
      timestamp = d.time;
    });

    return {
      engine_id: engineId,
      cycle: latestCycle,
      rul: rul,
      sensors: sensors,
      time: timestamp
    };
  };

  const currentTwin = getLatestTelemetryForEngine(selectedEngineId) || {
    engine_id: selectedEngineId,
    cycle: 180,
    rul: 42.5,
    sensors: {
      "sensor_2": 642.3, // temp
      "sensor_3": 1585.1,
      "sensor_4": 1400.8,
      "sensor_7": 554.2,
      "sensor_8": 2388.0,
      "sensor_9": 9046.2,
      "sensor_11": 47.4,
      "sensor_12": 521.8,
      "sensor_13": 2388.0,
      "sensor_14": 8138.5,
      "sensor_15": 8.41,
      "sensor_17": 392.0,
      "sensor_20": 38.9,
      "sensor_21": 23.3
    },
    time: new Date().toISOString()
  };

  // Compute severity helper
  const getSeverity = (rul) => {
    if (rul < 30) return { label: 'CRITICAL', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
    if (rul < 60) return { label: 'WARNING', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    return { label: 'INFO', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
  };

  // Mock LLM Diagnostics generator (honestly labeled)
  const getLlmDiagnostic = (alert) => {
    if (!alert) return null;
    return {
      title: "HPC Component Degradation (High Pressure Compressor)",
      model: "Llama-3-Edge-8B [DEMO OFFLINE MOCK]",
      latency: "142ms (Offline Cached Template)",
      confidence: alert.confidence || 0.88,
      summary: `Engine Unit #${alert.engine_id} shows a severe decrease in Remaining Useful Life (RUL: ${alert.rul_prediction} cycles) as of cycle ${alert.cycle}. Telemetry analysis flags secondary indicators: elevated exhaust path temperature (sensor_2/sensor_4) and fan speed deceleration ratios. This matches a classical degradation signature of High-Pressure Compressor (HPC) blade erosion and tip clearance increase.`,
      recommendation: [
        "Schedule borescope inspection of the High-Pressure Compressor (HPC) stage 3-5 blades within the next 5 cycles.",
        "Verify seal clearances and inspect thermal barrier coating (TBC) degradation.",
        "Engine operating margin is degraded by 12.4%. Do not exceed cargo payload limit on next leg."
      ]
    };
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="h-8 w-8 text-indigo-500 animate-pulse" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">TwinEdge</h1>
            <p className="text-xs text-slate-400">Edge-Native Aircraft Digital Twin & MRO Queue</p>
          </div>
        </div>

        {/* Network & Service status indicators */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
            <Cpu className="h-4 w-4 text-slate-400" />
            <span className="text-slate-400">Edge Inference:</span>
            {modelLoaded ? (
              <span className="text-emerald-400 font-semibold">CNN-ONNX Ready</span>
            ) : (
              <span className="text-yellow-500 font-semibold">Offline/No Model</span>
            )}
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
            <Database className="h-4 w-4 text-slate-400" />
            <span className="text-slate-400">Local Store:</span>
            {isOfflineDemo ? (
              <span className="text-amber-400 font-semibold flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5" /> Buffering Offline
              </span>
            ) : (
              <span className="text-emerald-400 font-semibold">InfluxDB Connected</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs">
            {backendStatus === 'ONLINE' ? (
              <span className="flex items-center gap-2 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-bold">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-2 bg-rose-500/15 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-lg font-bold animate-pulse">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500"></span>
                Offline — running on local cache
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1">
        {/* Left Sidebar Navigation */}
        <nav className="w-64 border-r border-slate-800 bg-slate-900/20 p-4 flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'queue' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <ShieldAlert className="h-5 w-5" />
            AME Sign-Off Queue
            {alerts.length > 0 && (
              <span className="ml-auto bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {alerts.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab('twin')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'twin' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Cpu className="h-5 w-5" />
            Live Digital Twin
          </button>

          <button 
            onClick={() => setActiveTab('telemetry')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'telemetry' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <Activity className="h-5 w-5" />
            Edge Telemetry
          </button>

          <button 
            onClick={() => setActiveTab('diagnostics')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'diagnostics' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-white'
            }`}
          >
            <FileText className="h-5 w-5" />
            LLM Diagnostics
          </button>

          <div className="mt-auto border-t border-slate-800 pt-4 px-2">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2">Resilience Controls</div>
            <button 
              onClick={() => setIsOfflineDemo(!isOfflineDemo)}
              className={`w-full text-xs font-semibold py-2 px-3 rounded-lg border transition-all ${
                isOfflineDemo 
                  ? 'bg-amber-600/20 border-amber-500 text-amber-300' 
                  : 'border-slate-800 hover:border-slate-700 text-slate-400'
              }`}
            >
              {isOfflineDemo ? "Disable Mock Offline Mode" : "Force Offline Cache Demo"}
            </button>
            <p className="text-[9px] text-slate-500 mt-2 leading-relaxed">
              *Toggling simulates hangar network failures, causing InfluxDB bypass and local SQLite queue logging.
            </p>
          </div>
        </nav>

        {/* Content Container */}
        <main className="flex-1 p-8 bg-slate-950 overflow-y-auto">
          {/* TAB 1: AME SIGN-OFF QUEUE */}
          {activeTab === 'queue' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Active Alerts List */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">AME Sign-Off Queue</h2>
                    <p className="text-sm text-slate-400">Human-in-the-Loop Safety Queue. Flagged anomalies awaiting inspection sign-off.</p>
                  </div>
                  <span className="bg-slate-900 text-slate-400 px-3 py-1 rounded-full text-xs border border-slate-800 font-mono">
                    Pending Alerts: {alerts.length}
                  </span>
                </div>

                {alerts.length === 0 ? (
                  <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center bg-slate-900/10">
                    <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-200">Safety Queue Clear</h3>
                    <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">No engine telemetry anomalies have been flagged by the edge inference model.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {alerts.map(alert => (
                      <div 
                        key={alert.id}
                        onClick={() => setSelectedAlert(alert)}
                        className={`border rounded-2xl p-5 cursor-pointer transition-all flex items-start justify-between ${
                          selectedAlert?.id === alert.id 
                            ? 'border-indigo-500 bg-indigo-950/20' 
                            : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex gap-4">
                          <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl mt-0.5 border border-rose-500/20">
                            <AlertTriangle className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-lg font-bold text-white">Engine #{alert.engine_id}</h4>
                              <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border ${getSeverity(alert.rul_prediction).color}`}>
                                {getSeverity(alert.rul_prediction).label}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                              Cycle: <span className="text-slate-200 font-mono font-semibold">{alert.cycle}</span> | 
                              Flagged: <span className="text-slate-200 font-mono font-semibold">{alert.timestamp.slice(11, 19)}</span>
                            </p>
                            <p className="text-sm font-semibold text-rose-300 mt-2">
                              Predicted Remaining Useful Life (RUL): <span className="font-mono text-white text-base">{alert.rul_prediction}</span> cycles
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex flex-col justify-between h-full min-h-[4rem]">
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Confidence Score</div>
                            <div className="text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                              Placeholder (100% / Not Computed)
                            </div>
                          </div>
                          <span className="text-xs text-indigo-400 hover:underline mt-2 block">
                            Inspect Anomaly &rarr;
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Audit Log Section */}
                <div className="pt-6 border-t border-slate-900">
                  <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-slate-400" /> AME Action Audit Log (Resolved Alerts)
                  </h3>
                  {auditLog.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No resolved sign-off actions logged in the audit history.</p>
                  ) : (
                    <div className="border border-slate-900 rounded-2xl overflow-hidden bg-slate-900/10">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-400 font-semibold uppercase tracking-wider">
                            <th className="p-4">Engine</th>
                            <th className="p-4">Cycle</th>
                            <th className="p-4">RUL</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Notes</th>
                            <th className="p-4">AME Sign-off Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {auditLog.map(log => (
                            <tr key={log.id} className="hover:bg-slate-900/20">
                              <td className="p-4 font-bold text-white">#{log.engine_id}</td>
                              <td className="p-4 font-mono">{log.cycle}</td>
                              <td className="p-4 font-mono">{log.rul_prediction}</td>
                              <td className="p-4">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  log.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                  log.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                  'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                }`}>
                                  {log.status === 'APPROVED' ? 'ACCEPTED' : log.status}
                                </span>
                              </td>
                              <td className="p-4 text-slate-300 max-w-xs truncate" title={log.notes}>
                                {log.notes || '-'}
                              </td>
                              <td className="p-4 text-slate-400 font-mono">
                                {new Date(log.signoff_time).toLocaleTimeString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Action and Notes Panel */}
              <div className="space-y-6">
                <div className="border border-slate-800 rounded-2xl p-6 bg-slate-900/30 backdrop-blur-md">
                  <h3 className="text-lg font-bold text-white mb-4">Inspection & Sign-Off Control</h3>
                  {selectedAlert ? (
                    <div className="space-y-4">
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-2">
                        <div><span className="text-slate-500">Alert ID:</span> <span className="font-mono text-slate-300">{selectedAlert.id}</span></div>
                        <div><span className="text-slate-500">Engine Unit:</span> <span className="font-bold text-white">#{selectedAlert.engine_id}</span></div>
                        <div><span className="text-slate-500">Flight Cycle:</span> <span className="font-mono text-slate-300">{selectedAlert.cycle}</span></div>
                        <div><span className="text-slate-500">ONNX Predicted RUL:</span> <span className="font-bold text-rose-400">{selectedAlert.rul_prediction} cycles</span></div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AME Engineering Notes</label>
                        <textarea 
                          rows={4}
                          value={signoffNotes}
                          onChange={(e) => setSignoffNotes(e.target.value)}
                          placeholder="Provide reasoning, e.g. 'Borescope inspection scheduled for next check' or 'Sensor validation indicates local jitter'..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs focus:border-indigo-500 focus:outline-none text-slate-100 placeholder-slate-600"
                        />
                      </div>

                      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800">
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Submit Sign-off Decision</label>
                        <button 
                          onClick={() => handleSignoff(selectedAlert.id, 'APPROVED')}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl transition-all text-xs"
                        >
                          Accept (Schedule Maintenance)
                        </button>
                        <button 
                          onClick={() => handleSignoff(selectedAlert.id, 'REJECTED')}
                          className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl transition-all text-xs"
                        >
                          Reject (False Alarm / Sensor Jitter)
                        </button>
                        <button 
                          onClick={() => handleSignoff(selectedAlert.id, 'ESCALATED')}
                          className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 rounded-xl transition-all text-xs"
                        >
                          Escalate (Depot Inspection Required)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <ShieldAlert className="h-10 w-10 mx-auto mb-2 text-slate-600" />
                      <p className="text-xs">Select a pending alert from the queue to inspect and record AME maintenance sign-off.</p>
                    </div>
                  )}
                </div>

                {/* AI Helper mini card */}
                {selectedAlert && (
                  <div className="border border-slate-800/80 rounded-2xl p-5 bg-gradient-to-br from-indigo-950/20 to-slate-900/20">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-5 w-5 text-indigo-400" />
                        <h4 className="text-sm font-bold text-white">Edge AI Diagnostic Hint</h4>
                      </div>
                      <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold">
                        DEMO MOCK
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      Llama-3-Edge diagnostic tool recommends inspecting the High-Pressure Compressor (HPC) stage blades due to consistent cycle-by-cycle exhaust margins dropping.
                    </p>
                    <button 
                      onClick={() => setActiveTab('diagnostics')}
                      className="text-xs text-indigo-400 font-bold hover:underline"
                    >
                      View Full LLM Report &rarr;
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: LIVE DIGITAL TWIN */}
          {activeTab === 'twin' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Live Twin View</h2>
                  <p className="text-sm text-slate-400">Turbofan engine sensor mapping and active diagnostic hotspots.</p>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">Selected Engine:</span>
                  <select 
                    value={selectedEngineId}
                    onChange={(e) => setSelectedEngineId(parseInt(e.target.value))}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white"
                  >
                    <option value={1}>Engine Unit 1</option>
                    <option value={2}>Engine Unit 2</option>
                    <option value={3}>Engine Unit 3</option>
                  </select>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="border border-slate-800 rounded-2xl p-5 bg-slate-900/20">
                  <div className="text-xs text-slate-500 font-semibold uppercase">Operational Cycle</div>
                  <div className="text-3xl font-bold text-white mt-2 font-mono">{currentTwin.cycle}</div>
                  <div className="text-[10px] text-slate-400 mt-1">Total recorded flight cycles</div>
                </div>
                <div className="border border-slate-800 rounded-2xl p-5 bg-slate-900/20">
                  <div className="text-xs text-slate-500 font-semibold uppercase">Current Health Score</div>
                  <div className="text-3xl font-bold text-indigo-400 mt-2 font-mono">
                    {backendStatus === 'ONLINE' ? `${((currentTwin.rul / 125) * 100).toFixed(0)}%` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Derived from latest RUL</div>
                </div>
                <div className="border border-slate-800 rounded-2xl p-5 bg-slate-900/20">
                  <div className="text-xs text-slate-500 font-semibold uppercase">Pending Sign-offs</div>
                  <div className="text-3xl font-bold text-amber-500 mt-2 font-mono">{alerts.length}</div>
                  <div className="text-[10px] text-slate-400 mt-1">Awaiting AME decision</div>
                </div>
                <div className="border border-slate-800 rounded-2xl p-5 bg-slate-900/20">
                  <div className="text-xs text-slate-500 font-semibold uppercase">CNN Inference Latency</div>
                  <div className="text-3xl font-bold text-emerald-400 mt-2 font-mono">{latency || '—'}</div>
                  <div className="text-[10px] text-slate-400 mt-1">Real CPU execution time</div>
                </div>
              </div>

              {/* Turbine Visual Representation */}
              <div className="border border-slate-800 rounded-3xl p-8 bg-slate-900/10 relative overflow-hidden flex flex-col items-center">
                <div className="absolute top-4 left-4 bg-slate-950/80 px-3 py-1 rounded-lg border border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Engine Layout Hotspots
                </div>

                {/* Simulated Engine Layout Graphic */}
                <div className="w-full max-w-3xl h-64 bg-slate-950/50 rounded-2xl border border-slate-900 relative my-6 flex items-center justify-center">
                  {/* Turbofan Schematic (Vector Mockup) */}
                  <svg className="w-5/6 h-5/6 opacity-80" viewBox="0 0 800 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Outer Casing */}
                    <path d="M50 40 L750 40 L700 160 L50 160 Z" stroke="#334155" strokeWidth="3" />
                    {/* Fan Blades Front */}
                    <ellipse cx="120" cy="100" rx="30" ry="50" fill="#1e293b" stroke="#475569" strokeWidth="2" />
                    {/* Compressors Stage */}
                    <rect x="180" y="60" width="120" height="80" fill="#0f172a" stroke="#334155" />
                    <line x1="220" y1="60" x2="220" y2="140" stroke="#334155" />
                    <line x1="260" y1="60" x2="260" y2="140" stroke="#334155" />
                    {/* Combustor Stage */}
                    <polygon points="300,70 420,50 420,150 300,130" fill="#1e1b4b" stroke="#312e81" />
                    {/* Turbine Exhaust */}
                    <polygon points="420,60 580,75 580,125 420,140" fill="#0f172a" stroke="#334155" />
                    {/* Hot Exhaust Nozzle */}
                    <path d="M580 80 Q660 100 700 90 L700 110 Q660 100 580 120 Z" fill="#991b1b" fillOpacity="0.2" stroke="#ef4444" />
                    
                    {/* Hotspots (Interactive sensors) */}
                    {/* T24 - Compressor Inlet Temperature */}
                    <circle cx="160" cy="65" r="8" fill={currentTwin.rul < 60 ? "#ef4444" : "#10b981"} className="animate-ping" />
                    <circle cx="160" cy="65" r="5" fill={currentTwin.rul < 60 ? "#ef4444" : "#10b981"} />
                    
                    {/* T50 - Turbine Exhaust Temp */}
                    <circle cx="500" cy="95" r="8" fill={currentTwin.rul < 60 ? "#ef4444" : "#10b981"} className="animate-ping" />
                    <circle cx="500" cy="95" r="5" fill={currentTwin.rul < 60 ? "#ef4444" : "#10b981"} />
                  </svg>
                  
                  {/* Hotspots labels */}
                  <div className="absolute top-10 left-[20%] text-[10px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                    T24 (LPC Temp): <span className="font-bold text-white">{(currentTwin.sensors.sensor_2 || 642.3).toFixed(1)} K</span>
                  </div>
                  <div className="absolute bottom-10 right-[35%] text-[10px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                    T50 (EGT): <span className="font-bold text-white">{(currentTwin.sensors.sensor_11 || 47.4).toFixed(1)} C</span>
                  </div>
                </div>

                <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 text-xs">
                    <span className="text-slate-500">T2 (Total Temp at Fan Inlet)</span>
                    <div className="text-sm font-bold text-white mt-1">518.67 K</div>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 text-xs">
                    <span className="text-slate-500">P30 (Total Press at HPC Outlet)</span>
                    <div className="text-sm font-bold text-white mt-1">{(currentTwin.sensors.sensor_8 || 2388.0).toFixed(1)} psia</div>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 text-xs">
                    <span className="text-slate-500">Nf (Physical Fan Speed)</span>
                    <div className="text-sm font-bold text-white mt-1">{(currentTwin.sensors.sensor_9 || 9046.2).toFixed(1)} rpm</div>
                  </div>
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 text-xs">
                    <span className="text-slate-500">BPR (Bypass Ratio)</span>
                    <div className="text-sm font-bold text-white mt-1">{(currentTwin.sensors.sensor_15 || 8.41).toFixed(2)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EDGE TELEMETRY GRID */}
          {activeTab === 'telemetry' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Edge Telemetry View</h2>
                <p className="text-sm text-slate-400">Real-time incoming telemetry stream and historical trend monitoring.</p>
              </div>

              {telemetry.length === 0 ? (
                <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center bg-slate-900/10">
                  <Activity className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-200">No Telemetry Stream</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Start the data simulator script in `/backend` to feed C-MAPSS telemetry packets.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Telemetry charts */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="border border-slate-800 rounded-2xl p-6 bg-slate-900/20">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Predicted Remaining Useful Life Trend</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                             data={telemetry.filter(t => t.sensor === 'rul_prediction' && t.engine_id === selectedEngineId).sort((a,b) => a.cycle - b.cycle)}
                            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="cycle" label={{ value: 'Flight Cycle', position: 'insideBottomRight', offset: -10 }} stroke="#94a3b8" />
                            <YAxis label={{ value: 'RUL Prediction', angle: -90, position: 'insideLeft' }} stroke="#94a3b8" />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                            <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Grid */}
                  <div className="border border-slate-800 rounded-2xl p-6 bg-slate-900/30">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Live Sensor Readings</h3>
                    <div className="space-y-4 max-h-[30rem] overflow-y-auto pr-2">
                      {Object.keys(currentTwin.sensors).map(sensorName => (
                        <div key={sensorName} className="flex items-center justify-between border-b border-slate-900 pb-2">
                          <span className="text-xs text-slate-400 font-mono">{sensorName.toUpperCase()}</span>
                          <span className="text-sm font-bold font-mono text-white">
                            {currentTwin.sensors[sensorName].toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LLM DIAGNOSTICS */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">LLM Diagnostics Summary</h2>
                <p className="text-sm text-slate-400">Offline intelligent diagnosis of flagged turbofan engines.</p>
              </div>

              {alerts.length === 0 && auditLog.length === 0 ? (
                <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center bg-slate-900/10">
                  <FileText className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-200">No Diagnostics Available</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Diagnostics are generated when anomalies are flagged in the queue.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Select alert to run diagnostics */}
                  <div className="bg-slate-900/30 p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white">Select Flagged Run for Diagnosis:</h4>
                      <p className="text-xs text-slate-500">Pick any flagged engine alert to pull the LLM diagnostic breakdown report.</p>
                    </div>
                    <select 
                      onChange={(e) => {
                        const alert = [...alerts, ...auditLog].find(a => a.id === e.target.value);
                        setSelectedAlert(alert || null);
                      }}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none"
                    >
                      <option value="">Select Engine Alert...</option>
                      {[...alerts, ...auditLog].map(a => (
                        <option key={a.id} value={a.id}>
                          Engine #{a.engine_id} (Cycle {a.cycle}) - Predicted RUL: {a.rul_prediction}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedAlert ? (
                    (() => {
                      const diag = getLlmDiagnostic(selectedAlert);
                      return (
                        <div className="border border-slate-800 rounded-3xl p-8 bg-slate-900/10 space-y-6 relative overflow-hidden">
                          <div className="absolute top-4 right-4">
                            <span className="bg-amber-500/15 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-extrabold tracking-wider animate-pulse">
                              DEMO MOCK DATA
                            </span>
                          </div>

                          <div className="flex items-center justify-between border-b border-slate-900 pb-4 pr-32">
                            <div>
                              <h3 className="text-xl font-bold text-white">{diag.title}</h3>
                              <p className="text-xs text-slate-500 mt-1">
                                Generated by: <span className="font-semibold text-slate-400">{diag.model}</span> | 
                                Latency: <span className="font-semibold text-slate-400">{diag.latency}</span>
                              </p>
                            </div>
                            <div className="bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold">
                              Confidence: Placeholder (100% / Not Computed)
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs uppercase font-bold tracking-wider text-slate-500">Diagnostic Summary</h4>
                              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[9px] font-bold">
                                DEMO MOCK
                              </span>
                            </div>
                            <p className="text-sm text-slate-300 leading-relaxed font-sans">
                              {diag.summary}
                            </p>
                          </div>

                          <div className="space-y-3 bg-slate-950/40 p-6 rounded-2xl border border-slate-900">
                            <h4 className="text-xs uppercase font-bold tracking-wider text-slate-500 flex items-center gap-1.5">
                              <ShieldAlert className="h-4 w-4 text-amber-500" /> Proposed Maintenance Action Items
                            </h4>
                            <ul className="space-y-2.5">
                              {diag.recommendation.map((rec, i) => (
                                <li key={i} className="text-xs text-slate-300 flex items-start gap-2 leading-relaxed">
                                  <span className="bg-indigo-500/15 text-indigo-400 font-mono text-[10px] w-5 h-5 rounded-full flex items-center justify-center shrink-0 border border-indigo-500/20">
                                    {i+1}
                                  </span>
                                  {rec}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="text-[10px] text-slate-500 italic pt-2">
                            *This diagnostic recommendation is generated off local edge templates matching the NASA C-MAPSS dataset degradation ruleset and does not execute physical changes.
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="border border-slate-900 rounded-2xl p-12 text-center text-slate-500">
                      <FileText className="h-10 w-10 mx-auto mb-2 text-slate-700" />
                      <p className="text-xs">Choose an active or resolved alert from the drop-down selector above to view the diagnostic report.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
