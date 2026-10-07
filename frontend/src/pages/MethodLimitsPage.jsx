import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { FileText, Cpu, Database, AlertTriangle, ShieldCheck, Scale, CheckCircle2, XCircle } from 'lucide-react';
import ProvenanceTag from '../components/common/ProvenanceTag';
import MetricCard from '../components/common/MetricCard';

export default function MethodLimitsPage() {
  const { isOnline } = useApp();
  const [activeTab, setActiveTab] = useState('scope'); // 'scope' | 'data' | 'model' | 'rubrics' | 'claims'

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-white">Methodology, Limits & Claims</h1>
            <ProvenanceTag type="GROUND_TRUTH" />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            System architectural scope, C-MAPSS FD001 dataset boundaries, 1D-CNN specifications, and audited operational claims.
          </p>
        </div>

        {/* Tab Navigator */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-xs font-mono">
          {[
            { id: 'scope', label: '1. Prototype Scope' },
            { id: 'data', label: '2. C-MAPSS FD001' },
            { id: 'model', label: '3. 1D-CNN Specs' },
            { id: 'rubrics', label: '4. Decision Norms' },
            { id: 'claims', label: '5. Claims Matrix' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded transition-colors ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: PROTOTYPE SCOPE & BOUNDARIES */}
      {activeTab === 'scope' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              label="System Readiness"
              value="TRL-4 / 5"
              unit="Lab Prototype"
              provenance="SPEC"
              tooltip="Validated in lab/testbench simulation environment with real edge runtime"
            />
            <MetricCard
              label="Certification"
              value="Non-Safety"
              unit="Advisory Only"
              provenance="SPEC"
              tooltip="Decision-support system for AME review. Not certified for flight dispatch"
            />
            <MetricCard
              label="Prediction Target"
              value="Engine RUL"
              unit="Cycles (Cap 125)"
              provenance="GROUND_TRUTH"
              tooltip="NASA C-MAPSS FD001 piecewise linear degradation target"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
              <div className="flex items-center gap-2 text-indigo-400">
                <ShieldCheck className="w-5 h-5" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">What TwinEdge IS</h2>
              </div>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Edge-Native Microservice:</strong> Sub-millisecond local ONNX Runtime inference deployed at the edge (hangar, test cell, onboard testbed) without cloud round-trip dependencies.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Human-in-the-Loop MRO Queue:</strong> Strictly gatekeeps maintenance decisions. Predictions below threshold trigger an AME inspection workflow with cryptographic audit logging.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Deterministic Edge Preprocessing:</strong> Exact bit-level parity (<span className="font-mono text-indigo-300">0.0000e+0</span> diff) between Python training and JavaScript/WASM inference pipelines.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold shrink-0">✓</span>
                  <span><strong>Tamper-Evident SHA-256 Chain:</strong> Cryptographically linked ledger ensuring maintenance sign-offs cannot be repudiated or silently modified.</span>
                </li>
              </ul>
            </div>

            <div className="p-5 rounded-xl border border-rose-900/40 bg-rose-950/10 space-y-4">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">What TwinEdge is NOT (Explicit Limits)</h2>
              </div>
              <ul className="space-y-3 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 font-bold shrink-0">✗</span>
                  <span><strong>NOT FAA / EASA / DO-178C Certified:</strong> TwinEdge has not undergone DO-178C DAL certification or airworthiness approvals. It is strictly an advisory research prototype.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 font-bold shrink-0">✗</span>
                  <span><strong>NOT a High-Fidelity Physics/CFD Model:</strong> TwinEdge does not execute Navier-Stokes fluid simulations or finite element heat transfer calculations. It is a purely empirical 1D-CNN surrogate.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 font-bold shrink-0">✗</span>
                  <span><strong>NO Per-Component RUL:</strong> The underlying C-MAPSS dataset provides only run-to-failure cycle targets for the overall engine. Individual component health indices are counterfactual sensitivity attributions, not independent RUL estimates.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 font-bold shrink-0">✗</span>
                  <span><strong>NO Generative LLM Diagnostics:</strong> Root cause analysis is driven by empirical sensor thresholding and gradient attribution, not hallucination-prone generative models.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: C-MAPSS FD001 PROFILE */}
      {activeTab === 'data' && (
        <div className="space-y-6">
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" />
              NASA Commercial Modular Aero-Propulsion System Simulation (C-MAPSS)
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              TwinEdge is trained and evaluated on sub-dataset <span className="font-mono text-indigo-300 font-semibold">FD001</span>. 
              The dataset simulates a 90,000 lb thrust turbofan engine operating under sea-level standard conditions until failure caused by High-Pressure Compressor (HPC) blade erosion and flow capacity degradation.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-500 block">Flight Regime</span>
                <span className="font-semibold text-white mt-1 block">Sea Level (1 Condition)</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-500 block">Failure Mode</span>
                <span className="font-semibold text-white mt-1 block">HPC Degradation Only</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-500 block">Training Trajectories</span>
                <span className="font-semibold text-white mt-1 block">100 Turbofan Engines</span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs">
                <span className="text-slate-500 block">Test Trajectories</span>
                <span className="font-semibold text-white mt-1 block">100 Turbofan Engines</span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">14 Active Degradation Sensor Channels</h3>
            <p className="text-xs text-slate-400">
              Of the 21 standard C-MAPSS channels, 7 sensors exhibiting invariant or zero-variance responses under FD001 operating conditions are discarded. The 14 informative channels are:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { id: 's_2', name: 'T24 - Total LPC outlet temperature', unit: '°R / K' },
                { id: 's_3', name: 'T30 - Total HPC outlet temperature', unit: '°R / K' },
                { id: 's_4', name: 'T50 - Total LPT outlet temperature', unit: '°R / K' },
                { id: 's_7', name: 'P30 - Total HPC outlet pressure', unit: 'psia' },
                { id: 's_8', name: 'Nf - Physical fan rotational speed', unit: 'rpm' },
                { id: 's_9', name: 'Nc - Physical core rotational speed', unit: 'rpm' },
                { id: 's_11', name: 'Ps30 - HPC outlet static pressure', unit: 'psia' },
                { id: 's_12', name: 'phi - Fuel flow ratio to Ps30', unit: 'pps/psi' },
                { id: 's_13', name: 'NRf - Corrected fan rotational speed', unit: 'rpm' },
                { id: 's_14', name: 'NRc - Corrected core rotational speed', unit: 'rpm' },
                { id: 's_15', name: 'BPR - Engine bypass ratio', unit: 'ratio' },
                { id: 's_17', name: 'htBleed - Bleed air enthalpy', unit: 'BTU/lbm' },
                { id: 's_20', name: 'W31 - HPT coolant bleed flow', unit: 'lbm/s' },
                { id: 's_21', name: 'W32 - LPT coolant bleed flow', unit: 'lbm/s' },
              ].map((s) => (
                <div key={s.id} className="p-2.5 rounded bg-slate-950 border border-slate-800 text-xs flex justify-between items-center">
                  <div>
                    <span className="font-mono text-indigo-400 font-bold mr-2">{s.id}</span>
                    <span className="text-slate-300">{s.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500 shrink-0 ml-2">{s.unit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: 1D-CNN ARCHITECTURE */}
      {activeTab === 'model' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              label="Test RMSE"
              value="16.197"
              unit="Cycles"
              provenance="BENCHMARK"
              tooltip="Evaluated on 100 test turbofan engines from C-MAPSS FD001"
            />
            <MetricCard
              label="Window Size"
              value="N = 30"
              unit="Cycles"
              provenance="SPEC"
              tooltip="Sliding temporal context window of 30 cycles with early-repeat padding"
            />
            <MetricCard
              label="Input Shape"
              value="[1, 30, 14]"
              unit="float32"
              provenance="SPEC"
              tooltip="Batch size 1, 30 time steps, 14 standard-scaled sensor channels"
            />
            <MetricCard
              label="Piecewise RUL Cap"
              value="125"
              unit="Cycles"
              provenance="SPEC"
              tooltip="Piecewise linear ceiling standard in turbofan prognostic literature"
            />
          </div>

          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              1D-Convolutional Neural Network Architecture
            </h2>
            <div className="space-y-3 text-xs text-slate-300 leading-relaxed font-mono bg-slate-950 p-4 rounded-lg border border-slate-800 overflow-x-auto">
              <div className="text-slate-500">// PyTorch / ONNX Layer Graph (backend/model/twinedge_rul.onnx)</div>
              <div>Input: <span className="text-indigo-400">sensor_window [batch_size, 30, 14]</span> float32</div>
              <div>├── Permute / Reshape -&gt; [batch_size, 14, 30] (Channels-First)</div>
              <div>├── Conv1d(in_channels=14, out_channels=32, kernel_size=3, padding=same) + BatchNorm1d + ReLU</div>
              <div>├── Conv1d(in_channels=32, out_channels=64, kernel_size=3, padding=same) + BatchNorm1d + ReLU</div>
              <div>├── Conv1d(in_channels=64, out_channels=32, kernel_size=3, padding=same) + BatchNorm1d + ReLU</div>
              <div>├── AdaptiveAvgPool1d(output_size=1) -&gt; [batch_size, 32, 1]</div>
              <div>├── Flatten -&gt; [batch_size, 32]</div>
              <div>├── Linear(in_features=32, out_features=16) + ReLU + Dropout(p=0.1)</div>
              <div>└── Linear(in_features=16, out_features=1) -&gt; Output: <span className="text-emerald-400">rul [batch_size, 1]</span></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-slate-400 font-semibold block mb-1">StandardScaler Normalization:</span>
                <p className="text-slate-400">
                  Fitted exclusively on C-MAPSS FD001 training runs (<span className="font-mono text-slate-300">scaler.joblib</span>). 
                  Parameters exported to <span className="font-mono text-slate-300">scaler.json</span> for zero-dependency JavaScript execution.
                </p>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <span className="text-slate-400 font-semibold block mb-1">Early-Cycle Padding:</span>
                <p className="text-slate-400">
                  Engines with fewer than 30 cycles are repeat-padded with their initial cycle readings (<span className="font-mono text-slate-300">repeat_padding</span>), ensuring valid inference from cycle 1.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DECISION NORMS & RUBRICS */}
      {activeTab === 'rubrics' && (
        <div className="space-y-6">
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-400" />
              Operational Decision Rubrics & Triage Norms
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Standardized MRO decision policies governing alert triggering, severity classifications, and AME sign-off responsibilities:
            </p>

            <div className="space-y-4 pt-2">
              <div className="border border-slate-800 rounded-lg p-4 bg-slate-950">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-indigo-300 uppercase">1. K-Gate Alert Confirmation Policy</h3>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">K = 3 Cycles</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  To eliminate false-positive maintenance dispatches caused by sensor jitter or aerodynamic transients, an alert is ONLY raised when predicted RUL remains below threshold for <strong className="text-slate-200">3 consecutive flight cycles</strong>.
                </p>
              </div>

              <div className="border border-slate-800 rounded-lg p-4 bg-slate-950">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-indigo-300 uppercase">2. Health Status Classifications</h3>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">Threshold: RUL &lt; 60</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
                  <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-900/40">
                    <span className="font-bold text-emerald-400 block mb-0.5">HEALTHY (RUL ≥ 60)</span>
                    <span className="text-slate-400 text-[11px]">Normal operations. No maintenance action required. Routine monitoring.</span>
                  </div>
                  <div className="p-2.5 rounded bg-amber-950/20 border border-amber-900/40">
                    <span className="font-bold text-amber-400 block mb-0.5">WARNING (30 ≤ RUL &lt; 60)</span>
                    <span className="text-slate-400 text-[11px]">Flagged to AME queue. Borescope visual inspection scheduled within 10 cycles.</span>
                  </div>
                  <div className="p-2.5 rounded bg-rose-950/20 border border-rose-900/40">
                    <span className="font-bold text-rose-400 block mb-0.5">CRITICAL (RUL &lt; 30)</span>
                    <span className="text-slate-400 text-[11px]">Urgent maintenance ground dispatch. High-Pressure Compressor overhaul required.</span>
                  </div>
                </div>
              </div>

              <div className="border border-slate-800 rounded-lg p-4 bg-slate-950">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-indigo-300 uppercase">3. AME Sign-off Governance Contract</h3>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">Rule H6 Compliance</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Every alert disposition requires a certified Aircraft Maintenance Engineer ID and explicit engineering justification. Actions are cryptographically committed to the tamper-evident SHA-256 ledger. Sign-offs are strictly disabled in Replay and Simulation modes to protect operational audit integrity.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: CLAIMS MATRIX (CLAIMS.md VIEWER) */}
      {activeTab === 'claims' && (
        <div className="space-y-6">
          {/* Permitted Claims */}
          <div className="p-5 rounded-xl border border-emerald-900/40 bg-emerald-950/10 space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Permitted & Empirically Verified Claims</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-emerald-900/60 text-slate-400 font-mono">
                    <th className="pb-2">Claim</th>
                    <th className="pb-2">Scope & Description</th>
                    <th className="pb-2">Verification Artifact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr>
                    <td className="py-2.5 font-bold text-white pr-4">C-MAPSS FD001 Benchmark</td>
                    <td className="py-2.5 pr-4">Test RMSE of 16.197 cycles on NASA C-MAPSS sub-dataset FD001</td>
                    <td className="py-2.5 font-mono text-indigo-400">backend/model/results.json</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-white pr-4">1D-CNN Architecture</td>
                    <td className="py-2.5 pr-4">Sliding window N=30, 14 sensor features, piecewise RUL cap 125</td>
                    <td className="py-2.5 font-mono text-indigo-400">backend/model/twinedge_rul.onnx</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-white pr-4">Preprocessing Parity</td>
                    <td className="py-2.5 pr-4">Bit-level exact parity (0.0000e+0 diff) between Python and JavaScript</td>
                    <td className="py-2.5 font-mono text-indigo-400">src/test/F2_parity.test.js</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-white pr-4">Sub-ms Edge Latency</td>
                    <td className="py-2.5 pr-4">ONNX Runtime CPU inference p50 ~0.50 ms, p95 ~0.60 ms</td>
                    <td className="py-2.5 font-mono text-indigo-400">GET /model/info</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-white pr-4">Bandwidth Reduction</td>
                    <td className="py-2.5 pr-4">1,680 B raw window compressed to 8 B prediction payload (210:1 ratio)</td>
                    <td className="py-2.5 font-mono text-indigo-400">GET /edge/stats</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-white pr-4">Cryptographic Audit Chain</td>
                    <td className="py-2.5 pr-4">SHA-256 chained hash pointers for tamper-evident record keeping</td>
                    <td className="py-2.5 font-mono text-indigo-400">GET /audit/verify</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Forbidden Claims */}
          <div className="p-5 rounded-xl border border-rose-900/40 bg-rose-950/10 space-y-4">
            <div className="flex items-center gap-2 text-rose-400">
              <XCircle className="w-5 h-5" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Forbidden Claims & Required Disclaimers</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-rose-900/60 text-slate-400 font-mono">
                    <th className="pb-2">Forbidden Statement</th>
                    <th className="pb-2">Reason for Prohibition</th>
                    <th className="pb-2">Mandatory Correction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr>
                    <td className="py-2.5 font-bold text-rose-300 pr-4">"FAA / DO-178C Flight Certified"</td>
                    <td className="py-2.5 pr-4">Research prototype; never underwent airworthiness certification.</td>
                    <td className="py-2.5 text-slate-400 italic">"Decision-support prototype only. Not certified for flight."</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-rose-300 pr-4">"Physics-Based Digital Twin"</td>
                    <td className="py-2.5 pr-4">No CFD, thermodynamics, or finite element physics solvers.</td>
                    <td className="py-2.5 text-slate-400 italic">"Data-driven empirical surrogate model trained on C-MAPSS."</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-rose-300 pr-4">"LLM Root-Cause Diagnostics"</td>
                    <td className="py-2.5 pr-4">No generative AI reasoning or mechanical problem solving.</td>
                    <td className="py-2.5 text-slate-400 italic">"Heuristic and statistical alert triage from 1D-CNN predictions."</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-rose-300 pr-4">"Universal C-MAPSS Generalization"</td>
                    <td className="py-2.5 pr-4">Trained and evaluated strictly on FD001 (1 condition, 1 fault mode).</td>
                    <td className="py-2.5 text-slate-400 italic">"Evaluated strictly on C-MAPSS FD001 benchmark data."</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 font-bold text-rose-300 pr-4">"100% Confident / Calibrated RUL"</td>
                    <td className="py-2.5 pr-4">Regression outputs point estimates without Bayesian posteriors.</td>
                    <td className="py-2.5 text-slate-400 italic">"Point estimate of remaining flight cycles."</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
