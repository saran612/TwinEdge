import React from 'react';
import { X, BookOpen, ShieldAlert, Cpu, Database, AlertCircle } from 'lucide-react';
import { HEALTH_CONFIG } from '../../config/rubrics';

export default function RubricsDrawer({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Operational Rubrics & Decision Norms</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm text-slate-300">
          {/* Health Bands */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              (a) Engine Health Bands
            </h3>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="p-3 rounded bg-emerald-950/40 border border-emerald-800/60 text-emerald-300">
                <div className="font-bold">HEALTHY</div>
                <div className="text-slate-400 mt-1">RUL &ge; {HEALTH_CONFIG.HEALTHY_MIN_RUL} cycles</div>
              </div>
              <div className="p-3 rounded bg-amber-950/40 border border-amber-800/60 text-amber-300">
                <div className="font-bold">DEGRADING</div>
                <div className="text-slate-400 mt-1">60 &le; RUL &lt; {HEALTH_CONFIG.HEALTHY_MIN_RUL}</div>
              </div>
              <div className="p-3 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300">
                <div className="font-bold">CRITICAL</div>
                <div className="text-slate-400 mt-1">RUL &lt; {HEALTH_CONFIG.ALERT_THRESHOLD_T} cycles</div>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="font-semibold text-slate-300">[STATIC]</span> Thresholds represent prototype research defaults configured to match backend alert gating, not certified FAA/EASA dispatch limits.
            </p>
          </section>

          {/* Alert Rule */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              (b) K-Cycle Alert Gating Rule
            </h3>
            <div className="p-3 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200">
              IF (RUL &lt; {HEALTH_CONFIG.ALERT_THRESHOLD_T} FOR K={HEALTH_CONFIG.ALERT_SUSTAINED_K} CONSECUTIVE CYCLES) &rarr; RAISE ALERT
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              A single transient dip below {HEALTH_CONFIG.ALERT_THRESHOLD_T} cycles does not raise an alert. Gating suppresses sensor noise and transient spikes by requiring {HEALTH_CONFIG.ALERT_SUSTAINED_K} sustained cycles below threshold before human sign-off triage is triggered.
            </p>
          </section>

          {/* Out of Distribution */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              (c) Out-of-Distribution (OOD) Rule
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Any feature cycle with standardized score <code className="text-purple-300 font-mono">|z| &gt; 4.0</code> or sensor values exceeding historical minimum/maximum bounds recorded during training is flagged as <span className="text-amber-400 font-semibold">OOD</span>. Inference on OOD inputs carries severe model extrapolation risk.
            </p>
          </section>

          {/* Provenance Legend */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              (d) Provenance Legend (Rule H1)
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="font-mono text-emerald-400 font-semibold">LIVE</span>
                <span className="text-slate-400 text-[11px]">Real backend/broker</span>
              </div>
              <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="font-mono text-blue-400 font-semibold">REPLAY</span>
                <span className="text-slate-400 text-[11px]">NASA C-MAPSS trace</span>
              </div>
              <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="font-mono text-indigo-400 font-semibold">MODEL</span>
                <span className="text-slate-400 text-[11px]">1D-CNN ONNX prediction</span>
              </div>
              <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="font-mono text-amber-400 font-semibold">SIMULATED</span>
                <span className="text-slate-400 text-[11px]">Synthetic perturbation</span>
              </div>
              <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="font-mono text-slate-400 font-semibold">STATIC</span>
                <span className="text-slate-400 text-[11px]">Fixed config token</span>
              </div>
              <div className="p-2 rounded bg-slate-950 border border-slate-800 flex items-center justify-between">
                <span className="font-mono text-purple-400 font-semibold">ASSUMED</span>
                <span className="text-slate-400 text-[11px]">Engineering map/proxy</span>
              </div>
            </div>
          </section>

          {/* Simulation Validity & RUL Cap */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              (e) Simulation Validity &amp; (f) RUL Cap Note
            </h3>
            <div className="p-3 rounded bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-2">
              <div>
                <strong className="text-slate-200">Simulation Validity:</strong> Simulation evaluates model response to perturbed sensor vectors, <em className="text-amber-400 font-semibold">not thermodynamic engine physics</em>. Small perturbations inside the training range are empirically indicative; large perturbations venturing into OOD space are untrustworthy extrapolations.
              </div>
              <div>
                <strong className="text-slate-200">Piecewise RUL Target Cap:</strong> The 1D-CNN model was trained with a piecewise linear RUL target capped at <span className="font-mono text-indigo-300 font-bold">{HEALTH_CONFIG.RUL_CAP}</span> cycles. Healthy early-cycle engines saturate at {HEALTH_CONFIG.RUL_CAP} cycles; values &ge; 125 represent &ge; 125 cycles of remaining life.
              </div>
            </div>
          </section>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white rounded transition-colors"
          >
            Close Rubrics
          </button>
        </div>
      </div>
    </div>
  );
}
