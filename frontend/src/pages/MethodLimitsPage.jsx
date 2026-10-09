import React, { useState } from 'react';
import { Card, CardHeader, MetricCard, ProvenanceTag, Banner } from '../components/ui';
import { ShieldCheck, AlertTriangle, Database, CheckCircle2, XCircle, FileText, Cpu, Scale } from 'lucide-react';

export default function MethodLimitsPage() {
  const [activeTab, setActiveTab] = useState('scope'); // 'scope' | 'data' | 'model' | 'rubrics' | 'claims'

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 select-none">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-text-main">Methodology, limits & claims</h1>
            <ProvenanceTag type="STATIC" />
          </div>
          <p className="text-xs text-text-2 mt-1">
            System architectural scope, C-MAPSS FD001 dataset boundaries, 1D-CNN specifications, and audited operational claims.
          </p>
        </div>

        {/* Tab Navigator */}
        <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-md border border-border text-xs">
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
              className={`px-3 py-1.5 rounded-sm transition-colors text-xs font-medium cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-accent text-on-accent font-semibold shadow-xs'
                  : 'text-text-2 hover:text-text-main'
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
              label="System readiness"
              value="TRL-4 / 5"
              unit="Lab prototype"
              provenance="STATIC"
              tooltip="Validated in lab/testbench simulation environment with real edge runtime"
            />
            <MetricCard
              label="Certification"
              value="Non-safety"
              unit="Advisory only"
              provenance="STATIC"
              tooltip="Decision-support system for AME review. Not certified for flight dispatch"
            />
            <MetricCard
              label="Prediction target"
              value="Engine RUL"
              unit="Cycles (Cap 125)"
              provenance="STATIC"
              tooltip="NASA C-MAPSS FD001 piecewise linear degradation target"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-5 space-y-4">
              <CardHeader
                title="What TwinEdge is"
                action={<ShieldCheck className="w-5 h-5 text-status-healthy-text" />}
              />
              <ul className="space-y-3 text-xs text-text-2">
                <li className="flex items-start gap-2">
                  <span className="text-status-healthy-text font-bold shrink-0">✓</span>
                  <span><strong>Edge-native inference engine:</strong> Direct ONNX Runtime model execution (0.04 ms p50 isolated CPU, 8.4 ms p50 HTTP API) running locally without cloud round-trip dependencies.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-status-healthy-text font-bold shrink-0">✓</span>
                  <span><strong>Human-in-the-loop MRO queue:</strong> Strictly gatekeeps maintenance decisions. Predictions below threshold trigger an AME inspection workflow with cryptographic audit logging.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-status-healthy-text font-bold shrink-0">✓</span>
                  <span><strong>Deterministic edge preprocessing:</strong> Exact bit-level parity between Python training and JavaScript/WASM inference pipelines.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-status-healthy-text font-bold shrink-0">✓</span>
                  <span><strong>Tamper-evident SHA-256 chain:</strong> Cryptographically linked ledger ensuring maintenance sign-offs cannot be repudiated.</span>
                </li>
              </ul>
            </Card>

            <Card className="p-5 space-y-4 border-status-critical-border">
              <CardHeader
                title="What TwinEdge is not (Explicit limits)"
                action={<AlertTriangle className="w-5 h-5 text-status-critical-text" />}
              />
              <ul className="space-y-3 text-xs text-text-2">
                <li className="flex items-start gap-2">
                  <span className="text-status-critical-text font-bold shrink-0">✗</span>
                  <span><strong>Not FAA / EASA / DO-178C certified:</strong> TwinEdge has not undergone DO-178C certification. It is strictly an advisory prototype.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-status-critical-text font-bold shrink-0">✗</span>
                  <span><strong>Not a high-fidelity physics/CFD model:</strong> TwinEdge does not execute Navier-Stokes fluid simulations. It is a purely empirical 1D-CNN surrogate.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-status-critical-text font-bold shrink-0">✗</span>
                  <span><strong>No per-component RUL:</strong> The underlying C-MAPSS dataset provides only overall engine run-to-failure cycle targets. Component health indices are counterfactual sensitivity attributions.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-status-critical-text font-bold shrink-0">✗</span>
                  <span><strong>No generative LLM diagnostics:</strong> Root cause analysis is driven by empirical sensor thresholding and gradient attribution, not hallucination-prone generative models.</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: C-MAPSS FD001 PROFILE */}
      {activeTab === 'data' && (
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <CardHeader
              title="NASA C-MAPSS Dataset Profile"
              action={<Database className="w-4 h-4 text-accent" />}
            />
            <p className="text-xs text-text-2 leading-relaxed">
              TwinEdge is trained and evaluated on sub-dataset <span className="font-mono text-accent font-semibold">FD001</span>. 
              The dataset simulates a 90,000 lb thrust turbofan engine operating under sea-level standard conditions until failure caused by High-Pressure Compressor (HPC) blade erosion and flow capacity degradation.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-surface-2 rounded-md border border-border text-xs">
                <span className="text-text-muted block">Flight regime</span>
                <span className="font-semibold text-text-main mt-1 block">Sea Level (1 Condition)</span>
              </div>
              <div className="p-3 bg-surface-2 rounded-md border border-border text-xs">
                <span className="text-text-muted block">Failure mode</span>
                <span className="font-semibold text-text-main mt-1 block">HPC Degradation Only</span>
              </div>
              <div className="p-3 bg-surface-2 rounded-md border border-border text-xs">
                <span className="text-text-muted block">Training trajectories</span>
                <span className="font-semibold text-text-main mt-1 block">100 Turbofan Engines</span>
              </div>
              <div className="p-3 bg-surface-2 rounded-md border border-border text-xs">
                <span className="text-text-muted block">Test trajectories</span>
                <span className="font-semibold text-text-main mt-1 block">100 Turbofan Engines</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <CardHeader title="14 Active degradation sensor channels" />
            <p className="text-xs text-text-muted">
              Of the 21 standard C-MAPSS channels, 7 sensors exhibiting invariant responses under FD001 operating conditions are discarded.
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
                <div key={s.id} className="p-3 rounded-md bg-surface-2 border border-border text-xs flex justify-between items-center">
                  <div>
                    <span className="font-mono text-accent font-semibold mr-2">{s.id}</span>
                    <span className="text-text-main">{s.name}</span>
                  </div>
                  <span className="font-mono text-xs text-text-muted shrink-0 ml-2">{s.unit}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: 1D-CNN ARCHITECTURE */}
      {activeTab === 'model' && (
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <CardHeader
              title="1D-CNN Neural Architecture Specs"
              action={<Cpu className="w-4 h-4 text-accent" />}
            />
            <p className="text-xs text-text-2 leading-relaxed">
              The model ingests a 2D tensor representing a 30-cycle sliding window across 14 normalized sensor streams, extracting temporal features through 1D convolutions before projecting piecewise linear RUL.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-surface-2 rounded-md border border-border text-xs">
                <span className="text-text-muted block">Input tensor shape</span>
                <span className="font-semibold text-text-main mt-1 block font-mono">[-1, 30, 14]</span>
              </div>
              <div className="p-3 bg-surface-2 rounded-md border border-border text-xs">
                <span className="text-text-muted block">Piecewise RUL cap</span>
                <span className="font-semibold text-text-main mt-1 block font-mono">125 cycles</span>
              </div>
              <div className="p-3 bg-surface-2 rounded-md border border-border text-xs">
                <span className="text-text-muted block">Model parameters</span>
                <span className="font-semibold text-text-main mt-1 block font-mono">17,457 params</span>
              </div>
              <div className="p-3 bg-surface-2 rounded-md border border-border text-xs">
                <span className="text-text-muted block">Benchmark RMSE</span>
                <span className="font-semibold text-status-healthy-text mt-1 block font-mono">16.1972 cycles</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: DECISION NORMS & AUDITED LIMITS */}
      {activeTab === 'rubrics' && (
        <div className="space-y-6">
          <Card className="p-5 space-y-4">
            <CardHeader
              title="Operational Decision Norms & Safety Architecture"
              action={<Scale className="w-4 h-4 text-accent" />}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-md bg-surface-2 border border-border space-y-2">
                <h4 className="text-xs font-semibold text-text-main uppercase">K-Cycle Alert Gating (K=3)</h4>
                <p className="text-xs text-text-2 leading-relaxed">
                  Requires 3 consecutive cycles with RUL &lt; 60 to confirm degradation trends. The gate covers false alarms; late or missed predictions are mitigated by a conservative threshold and K-gate; the model is advisory.
                </p>
              </div>
              <div className="p-4 rounded-md bg-surface-2 border border-border space-y-2">
                <h4 className="text-xs font-semibold text-text-main uppercase">Cryptographic Audit Chain</h4>
                <p className="text-xs text-text-2 leading-relaxed">
                  Every alert disposition requires a certified reviewer ID and engineering justification, committed into an immutable SHA-256 ledger.
                </p>
              </div>
            </div>
          </Card>

          {/* Audited Model Limits */}
          <Card className="p-5 space-y-4 border-status-degrading-border">
            <CardHeader
              title="Five Audited Model & Operating Limits (MODEL_AUDIT.md)"
              action={<AlertTriangle className="w-5 h-5 text-status-degrading-text" />}
            />
            <div className="space-y-3 text-xs text-text-2">
              <div className="p-3 bg-surface-2 rounded-md border border-border">
                <span className="font-semibold text-text-main block mb-1">1. Baselines match or beat the CNN (Verdict: WEAK)</span>
                <span>On identical train/val/test splits, Ridge regression achieves 15.89 RMSE and HistGradientBoosting achieves 14.27 RMSE, matching or beating the 1D-CNN (16.20 RMSE).</span>
              </div>
              <div className="p-3 bg-surface-2 rounded-md border border-border">
                <span className="font-semibold text-text-main block mb-1">2. Half of test predictions are late (Directional Bias)</span>
                <span>The model exhibits a positive bias of +1.26 cycles on test engines, with exactly 50.0% of predictions running late (predicting more life than remaining).</span>
              </div>
              <div className="p-3 bg-surface-2 rounded-md border border-border">
                <span className="font-semibold text-text-main block mb-1">3. Near-end-of-life RMSE is 14.3 cycles</span>
                <span>For critical engines with true RUL &lt; 25 cycles, RMSE is 14.28 cycles (MAE 10.98 cycles), higher than mid-life error (12.57 RMSE in cycles 50-75).</span>
              </div>
              <div className="p-3 bg-surface-2 rounded-md border border-border">
                <span className="font-semibold text-text-main block mb-1">4. Far-OOD inputs saturate to the 125 cap</span>
                <span>Severe sensor anomalies (e.g. &plusmn;6&sigma;) trigger outputs above 290 cycles that clamp to the 125 cap; therefore, explicit Out-of-Distribution (OOD) checks are required.</span>
              </div>
              <div className="p-3 bg-surface-2 rounded-md border border-border">
                <span className="font-semibold text-text-main block mb-1">5. False alarm rate in 20-engine validation fleet</span>
                <span>Across 20 full run-to-failure engines evaluated at K=3, 2 of 20 engines triggered a premature alert while still healthy (RUL &ge; 80), representing a 3.89% false alarm rate.</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 5: CLAIMS MATRIX */}
      {activeTab === 'claims' && (
        <div className="space-y-6">
          {/* Permitted Claims */}
          <Card className="p-5 space-y-4">
            <CardHeader
              title="Permitted & empirically verified claims"
              action={<CheckCircle2 className="w-5 h-5 text-status-healthy-text" />}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-text-2 font-sans h-8">
                    <th className="pb-2 uppercase">Claim</th>
                    <th className="pb-2 uppercase">Scope & description</th>
                    <th className="pb-2 uppercase">Verification artifact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-text-2">
                  <tr className="h-10">
                    <td className="py-2.5 font-semibold text-text-main pr-4">C-MAPSS FD001 Benchmark</td>
                    <td className="py-2.5 pr-4">Test RMSE of 16.197 cycles on NASA C-MAPSS sub-dataset FD001</td>
                    <td className="py-2.5 font-mono text-accent">backend/model/results.json</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-semibold text-text-main pr-4">1D-CNN Architecture</td>
                    <td className="py-2.5 pr-4">Sliding window N=30, 14 sensor features, piecewise RUL cap 125</td>
                    <td className="py-2.5 font-mono text-accent">backend/model/twinedge_rul.onnx</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-semibold text-text-main pr-4">Preprocessing Parity</td>
                    <td className="py-2.5 pr-4">Bit-level exact parity (0.0000e+0 diff) between Python and JavaScript</td>
                    <td className="py-2.5 font-mono text-accent">scripts/verify_wiring.py</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-semibold text-text-main pr-4">Isolated ONNX Inference Latency</td>
                    <td className="py-2.5 pr-4">Direct ONNX CPU inference p50 0.042 ms; end-to-end HTTP API p50 8.444 ms</td>
                    <td className="py-2.5 font-mono text-accent">reports/model/benchmark_results.json</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Forbidden Claims */}
          <Card className="p-5 space-y-4 border-status-critical-border">
            <CardHeader
              title="Forbidden claims & required disclaimers"
              action={<XCircle className="w-5 h-5 text-status-critical-text" />}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-text-2 font-sans h-8">
                    <th className="pb-2 uppercase">Forbidden statement</th>
                    <th className="pb-2 uppercase">Reason for prohibition</th>
                    <th className="pb-2 uppercase">Mandatory correction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-text-2">
                  <tr className="h-10">
                    <td className="py-2.5 font-semibold text-status-critical-text pr-4">"FAA / DO-178C Flight Certified"</td>
                    <td className="py-2.5 pr-4">Research prototype; never underwent airworthiness certification.</td>
                    <td className="py-2.5 text-text-muted italic">"Decision-support prototype only. Not certified for flight."</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-semibold text-status-critical-text pr-4">"Physics-Based Digital Twin"</td>
                    <td className="py-2.5 pr-4">No CFD, thermodynamics, or finite element physics solvers.</td>
                    <td className="py-2.5 text-text-muted italic">"Data-driven empirical surrogate model trained on C-MAPSS."</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-semibold text-status-critical-text pr-4">"LLM Root-Cause Diagnostics"</td>
                    <td className="py-2.5 pr-4">No generative AI reasoning or mechanical problem solving.</td>
                    <td className="py-2.5 text-text-muted italic">"Heuristic and statistical alert triage from 1D-CNN predictions."</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-semibold text-status-critical-text pr-4">"Superior / Outperforms Baselines"</td>
                    <td className="py-2.5 pr-4">Ridge regression (15.89 RMSE) and HistGBM (14.27 RMSE) match or beat CNN (16.20 RMSE).</td>
                    <td className="py-2.5 text-text-muted italic">"1D-CNN performs comparably to Ridge; classical trees achieve lower RMSE (Verdict: WEAK)."</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-semibold text-status-critical-text pr-4">"Sub-millisecond API / 0.139 ms / 4.28 ms"</td>
                    <td className="py-2.5 pr-4">Full HTTP API takes 8.444 ms (p50) due to payload parsing, scaling, and database transactions.</td>
                    <td className="py-2.5 text-text-muted italic">"Isolated ONNX CPU execution is 0.042 ms; full HTTP API is 8.444 ms (p50)."</td>
                  </tr>
                  <tr className="h-10">
                    <td className="py-2.5 font-semibold text-status-critical-text pr-4">"Zero False Alarms"</td>
                    <td className="py-2.5 pr-4">At T=60, K=3, 2 of 20 engines triggered alerts while still in healthy cycles (3.89% FAR).</td>
                    <td className="py-2.5 text-text-muted italic">"Audited precision is 91.91% with 3.89% false alarm rate on healthy cycles."</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
