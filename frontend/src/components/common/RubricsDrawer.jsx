import React from 'react';
import { BookOpen, ShieldAlert, Cpu, Database, AlertCircle } from 'lucide-react';
import { HEALTH_CONFIG } from '../../config/rubrics';
import { Drawer, Button, ProvenanceTag } from '../ui';

export default function RubricsDrawer({ isOpen, onClose }) {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Operational rubrics & decision norms"
      width="max-w-xl"
    >
      {/* Health Bands */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-2 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-status-healthy-text" />
          (a) Engine health bands
        </h3>
        <div className="grid grid-cols-3 gap-2 text-xs font-mono">
          <div className="p-3 rounded-md bg-status-healthy-bg border border-status-healthy-border text-status-healthy-text">
            <div className="font-bold">HEALTHY</div>
            <div className="text-text-muted mt-1">RUL &ge; {HEALTH_CONFIG.HEALTHY_MIN_RUL} cycles</div>
          </div>
          <div className="p-3 rounded-md bg-status-degrading-bg border border-status-degrading-border text-status-degrading-text">
            <div className="font-bold">DEGRADING</div>
            <div className="text-text-muted mt-1">60 &le; RUL &lt; {HEALTH_CONFIG.HEALTHY_MIN_RUL}</div>
          </div>
          <div className="p-3 rounded-md bg-status-critical-bg border border-status-critical-border text-status-critical-text">
            <div className="font-bold">CRITICAL</div>
            <div className="text-text-muted mt-1">RUL &lt; {HEALTH_CONFIG.ALERT_THRESHOLD_T} cycles</div>
          </div>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          <ProvenanceTag type="STATIC" className="mr-1.5" />
          Thresholds represent research defaults configured to match backend alert gating, not certified FAA/EASA dispatch limits.
        </p>
      </section>

      {/* Alert Rule */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-status-critical-text" />
          (b) K-Cycle alert gating rule
        </h3>
        <div className="p-3 rounded-md bg-surface-2 border border-border text-xs font-mono text-text-main">
          IF (RUL &lt; {HEALTH_CONFIG.ALERT_THRESHOLD_T} FOR K={HEALTH_CONFIG.ALERT_SUSTAINED_K} CONSECUTIVE CYCLES) &rarr; RAISE ALERT
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          A single transient dip below {HEALTH_CONFIG.ALERT_THRESHOLD_T} cycles does not raise an alert. Gating suppresses sensor noise by requiring {HEALTH_CONFIG.ALERT_SUSTAINED_K} sustained cycles below threshold before human sign-off triage is triggered.
        </p>
      </section>

      {/* Edge Model Governance */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-2 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-accent" />
          (c) Edge model governance
        </h3>
        <div className="p-3 rounded-md bg-surface-2 border border-border space-y-1 text-xs font-mono text-text-main">
          <div className="flex justify-between">
            <span className="text-text-muted">Target architecture:</span>
            <span>1D-CNN (Keras/PyTorch &rarr; ONNX &rarr; TFLite)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">C-MAPSS dataset:</span>
            <span>{HEALTH_CONFIG.DATASET_NAME} (Sea level single condition)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Sensors used:</span>
            <span>14 channels (7 non-informative dropped)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Input tensor shape:</span>
            <span>(batch, 30, 14) &mdash; 30-cycle sliding window</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Piecewise RUL cap:</span>
            <span>{HEALTH_CONFIG.RUL_CAP} cycles (FD001 standard benchmark)</span>
          </div>
        </div>
      </section>

      {/* Honesty Rules */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-2 flex items-center gap-2">
          <Database className="w-4 h-4 text-accent" />
          (d) Architectural honesty rules
        </h3>
        <ul className="space-y-2 text-xs text-text-2 list-disc list-inside bg-surface-2 p-3 rounded-md border border-border">
          <li><strong>H1 (Inference Locality):</strong> Local edge inference runs client-side via ONNX Runtime Web without cloud roundtrips.</li>
          <li><strong>H2 (Provenance):</strong> Every displayed value carries an explicit provenance tag.</li>
          <li><strong>H3 (Attribution Scope):</strong> Component impact is counterfactual attribution, not physical failure isolation.</li>
          <li><strong>H4 (Data Split Identity):</strong> Engines carry validation or test split tags with distinct identifiers.</li>
          <li><strong>H5 (Simulation Demarcation):</strong> Perturbed runs are clearly flagged with simulation banners.</li>
          <li><strong>H6 (Zero-Mock Norm):</strong> Unavailable endpoints report explicit error states; synthetic data is never substituted.</li>
        </ul>
      </section>

      <div className="pt-2 flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={onClose}
        >
          Close rubrics
        </Button>
      </div>
    </Drawer>
  );
}
